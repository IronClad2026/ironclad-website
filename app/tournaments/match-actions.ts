"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type MatchResultActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const MATCH_PROOF_BUCKET = "match-proofs";
const MAX_PROOF_SIZE = 10 * 1024 * 1024;
const REPLAY_EXTENSIONS = new Set(["rec"]);

export async function submitMatchResult(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before submitting a match result.");
  }

  const matchId = getText(formData, "matchId");
  const playerOneScore = getScore(formData, "playerOneScore");
  const playerTwoScore = getScore(formData, "playerTwoScore");
  const winnerRegistrationId = getText(formData, "winnerRegistrationId");
  const notes = getText(formData, "notes");
  const replay = getFile(formData, "replay");

  if (!matchId || !winnerRegistrationId) {
    return errorState("Enter the final score and select the match winner.");
  }

  if (!replay) {
    return errorState("Upload the match replay before submitting.");
  }

  const replayError = validateReplay(replay);

  if (replayError) {
    return errorState(replayError);
  }

  if (notes.length > 2000) {
    return errorState("Result notes must be 2000 characters or fewer.");
  }

  const supabase = createSupabaseAdminClient();
  const match = await loadMatchForMutation(supabase, matchId);

  if (!match) {
    return errorState("This tournament match is no longer available.");
  }

  const participantRegistrationIds = [
    match.player_one_registration_id,
    match.player_two_registration_id,
  ].filter((value): value is string => Boolean(value));

  if (participantRegistrationIds.length !== 2) {
    return errorState("Both match participants must be assigned.");
  }

  const { data: ownedRegistration, error: ownershipError } = await supabase
    .from("registrations")
    .select("id")
    .in("id", participantRegistrationIds)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (ownershipError || !ownedRegistration) {
    return errorState(
      "You can only submit results for matches you are participating in."
    );
  }

  const opponentRegistrationId = participantRegistrationIds.find(
    (registrationId) => registrationId !== ownedRegistration.id
  );
  if (!opponentRegistrationId) {
    return errorState("The opposing player could not be identified.");
  }

  const scoreError = validateMatchScore(
    match.series_best_of,
    match.player_one_registration_id,
    match.player_two_registration_id,
    playerOneScore,
    playerTwoScore,
    winnerRegistrationId
  );

  if (scoreError) {
    return errorState(scoreError);
  }

  const uploadRoot = `${matchId}/${userId}/${crypto.randomUUID()}`;
  const uploadedPaths: string[] = [];

  try {
    const replayPath = await uploadProof(
      supabase,
      replay,
      `${uploadRoot}/replay.${getExtension(replay.name)}`,
      uploadedPaths
    );

    await verifyUploadedProofs(supabase, [replayPath]);

    const { data: report, error: submissionError } =
      await supabase.rpc("submit_match_series_result_report", {
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: userId,
        p_winner_registration_id: winnerRegistrationId,
        p_player_one_score: playerOneScore,
        p_player_two_score: playerTwoScore,
        p_replay_storage_path: replayPath,
        p_notes: notes || null,
      });

    if (submissionError) {
      throw submissionError;
    }

    const reportDetails = report as {
      submission_number?: number;
      confirmation_deadline_at?: string;
    } | null;

    revalidatePath("/tournaments");
    revalidatePath("/dashboard");
    return successState(
      `Submission #${reportDetails?.submission_number ?? "new"} is awaiting opponent confirmation${
        reportDetails?.confirmation_deadline_at
          ? ` until ${formatDeadline(reportDetails.confirmation_deadline_at)}`
          : ""
      }.`
    );
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(MATCH_PROOF_BUCKET).remove(uploadedPaths);
    }

    console.error("Match result submission failed:", error);
    return errorState(
      getDatabaseMessage(error) ??
        "The match result could not be submitted. Please try again."
    );
  }

}

export async function confirmMatchResultReportGroup(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before confirming a match result.");
  }

  const reportGroupId = getText(formData, "reportGroupId");
  if (!reportGroupId) {
    return errorState("The match result confirmation could not be found.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("confirm_match_result_report_group", {
    p_report_group_id: reportGroupId,
    p_confirmed_by_clerk_user_id: userId,
  });

  if (error) {
    console.error("Match result confirmation failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState("Result confirmed. The winner has been advanced.");
}

export async function disputeMatchResultReportGroup(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before disputing a match result.");
  }

  const reportGroupId = getText(formData, "reportGroupId");
  const disputeNotes = getText(formData, "disputeNotes");

  if (!reportGroupId) {
    return errorState("The match result confirmation could not be found.");
  }

  if (disputeNotes.length > 2000) {
    return errorState("Dispute notes must be 2000 characters or fewer.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("dispute_match_result_report_group", {
    p_report_group_id: reportGroupId,
    p_disputed_by_clerk_user_id: userId,
    p_dispute_notes: disputeNotes || null,
  });

  if (error) {
    console.error("Match result dispute failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState("Result disputed. An administrator must review it.");
}

export async function reviewMatchResultReportGroup(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const admin = await requireAdmin();

  if (!admin) {
    return errorState("Administrator access is required.");
  }

  const reportGroupId = getText(formData, "reportGroupId");
  const decision = getText(formData, "decision");
  const reviewNotes = getText(formData, "reviewNotes");

  if (!reportGroupId || !["approved", "rejected", "under_review"].includes(decision)) {
    return errorState("Choose a valid report-group review decision.");
  }

  if (reviewNotes.length > 2000) {
    return errorState("Review notes must be 2000 characters or fewer.");
  }

  if (decision === "rejected" && !reviewNotes) {
    return errorState("Add an administrator message before rejecting a result.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_finalize_match_result_report_group", {
    p_report_group_id: reportGroupId,
    p_decision: decision,
    p_reviewed_by: admin.userId,
    p_review_notes: reviewNotes || null,
  });

  if (error) {
    console.error("Report-group review failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState(
    decision === "approved"
      ? "Report group approved and winner advanced."
      : decision === "rejected"
        ? "Report group rejected. The match remains unresolved."
        : "Report group marked under review."
  );
}

export async function saveAdminMatchResult(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const admin = await requireAdmin();

  if (!admin) {
    return errorState("Administrator access is required.");
  }

  const matchId = getText(formData, "matchId");
  const winnerRegistrationId = getText(formData, "winnerRegistrationId");
  const playerOneScore = getScore(formData, "playerOneScore");
  const playerTwoScore = getScore(formData, "playerTwoScore");
  const supabase = createSupabaseAdminClient();
  const match = await loadMatchForMutation(supabase, matchId);

  if (!match) {
    return errorState("This tournament match is no longer available.");
  }

  const scoreError = validateMatchScore(
    match.series_best_of,
    match.player_one_registration_id,
    match.player_two_registration_id,
    playerOneScore,
    playerTwoScore,
    winnerRegistrationId
  );

  if (scoreError) {
    return errorState(scoreError);
  }

  const { error } = await supabase.rpc("apply_admin_official_match_result", {
    p_match_id: matchId,
    p_player_one_score: playerOneScore,
    p_player_two_score: playerTwoScore,
    p_winner_registration_id: winnerRegistrationId,
    p_decided_by: admin.userId,
  });

  if (error) {
    console.error("Admin match result save failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState("Official result saved and winner advanced.");
}

export async function reviewMatchResult(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const admin = await requireAdmin();

  if (!admin) {
    return errorState("Administrator access is required.");
  }

  const submissionId = getText(formData, "submissionId");
  const decision = getText(formData, "decision");
  const reviewNotes = getText(formData, "reviewNotes");

  if (
    !submissionId ||
    !["approved", "rejected", "resubmission_requested"].includes(decision)
  ) {
    return errorState("Choose a valid review decision.");
  }

  if (reviewNotes.length > 2000) {
    return errorState("Review notes must be 2000 characters or fewer.");
  }

  if (
    ["rejected", "resubmission_requested"].includes(decision) &&
    !reviewNotes
  ) {
    return errorState(
      "Add an administrator message explaining what the player must correct."
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("review_match_series_result", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_reviewed_by: admin.userId,
    p_review_notes: reviewNotes || null,
  });

  if (error) {
    console.error("Match result review failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState(
    decision === "approved"
      ? "Series approved and winner advanced."
      : decision === "rejected"
        ? "Result rejected. The bracket remains unchanged."
        : "Resubmission requested. The bracket remains unchanged."
  );
}

type MatchMutationRow = {
  id: string;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  round_name: string;
  series_best_of: number;
};

async function loadMatchForMutation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string
): Promise<MatchMutationRow | null> {
  if (!matchId) return null;

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, series_best_of, player_one_registration_id, player_two_registration_id, bracket_rounds!inner(name)"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    console.error("Tournament match lookup failed:", error);
    return null;
  }

  const round = Array.isArray(data.bracket_rounds)
    ? data.bracket_rounds[0]
    : data.bracket_rounds;

  return {
    id: data.id,
    player_one_registration_id: data.player_one_registration_id,
    player_two_registration_id: data.player_two_registration_id,
    round_name: round?.name ?? "",
    series_best_of: data.series_best_of,
  };
}

function validateMatchScore(
  seriesBestOf: number,
  playerOneRegistrationId: string | null,
  playerTwoRegistrationId: string | null,
  playerOneScore: number | null,
  playerTwoScore: number | null,
  winnerRegistrationId: string
) {
  if (!playerOneRegistrationId || !playerTwoRegistrationId) {
    return "Both match participants must be assigned before recording a result.";
  }

  if (
    winnerRegistrationId !== playerOneRegistrationId &&
    winnerRegistrationId !== playerTwoRegistrationId
  ) {
    return "Select one of the match participants as the winner.";
  }

  if (
    playerOneScore === null ||
    playerTwoScore === null ||
    playerOneScore === playerTwoScore
  ) {
    return "Enter a valid non-tied final score.";
  }

  const winsRequired = Math.floor(seriesBestOf / 2) + 1;
  const winnerScore =
    winnerRegistrationId === playerOneRegistrationId
      ? playerOneScore
      : playerTwoScore;
  const loserScore =
    winnerRegistrationId === playerOneRegistrationId
      ? playerTwoScore
      : playerOneScore;

  if (winnerScore !== winsRequired || loserScore >= winsRequired) {
    return `This BO${seriesBestOf} series requires the winner to finish on ${winsRequired}.`;
  }

  return null;
}

async function uploadProof(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  file: File,
  path: string,
  uploadedPaths: string[]
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data, error } = await supabase.storage
    .from(MATCH_PROOF_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;
  const storedPath = data.path;
  uploadedPaths.push(storedPath);
  return storedPath;
}

async function verifyUploadedProofs(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  paths: string[]
) {
  for (const path of paths) {
    const parts = path.split("/");
    const fileName = parts.pop();

    if (!fileName) {
      throw new Error("Supabase returned an invalid proof storage path.");
    }

    const { data, error } = await supabase.storage
      .from(MATCH_PROOF_BUCKET)
      .list(parts.join("/"), {
        limit: 1,
        search: fileName,
      });

    if (error || !data.some((object) => object.name === fileName)) {
      throw new Error(
        `Proof upload verification failed for ${path}.`
      );
    }
  }
}

function validateReplay(file: File) {
  if (file.size > MAX_PROOF_SIZE) {
    return "Replay files must be 10 MB or smaller.";
  }

  if (!REPLAY_EXTENSIONS.has(getExtension(file.name))) {
    return "Replay proof must use a .rec file.";
  }

  return null;
}

async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  return userId && role === "admin" ? { userId } : null;
}

function revalidateTournamentPaths() {
  revalidatePath("/tournaments");
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments");
  revalidatePath("/dashboard");
}

function getText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function getScore(formData: FormData, field: string) {
  const value = Number(getText(formData, field));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getFile(formData: FormData, field: string) {
  const value = formData.get(field);
  return value instanceof File && value.size > 0 ? value : null;
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getDatabaseMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return "This match already has a result awaiting confirmation or review.";
    }
    return error.message;
  }
  return null;
}

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function successState(message: string): MatchResultActionState {
  return { status: "success", message };
}

function errorState(message: string): MatchResultActionState {
  return { status: "error", message };
}
