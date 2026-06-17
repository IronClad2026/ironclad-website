"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  createInAppNotification,
  createInAppNotifications,
} from "@/lib/notifications";
import {
  notifyAdminsOfMatchDispute,
  notifyPlayersOfLegacyMatchResultReview,
  notifyPlayersOfReportGroupReview,
} from "@/lib/notification-events";
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
  const replayFiles = getFiles(formData, "replays");
  const legacyReplay = getFile(formData, "replay");
  const replays = replayFiles.length > 0
    ? replayFiles
    : legacyReplay
      ? [legacyReplay]
      : [];

  if (!matchId || !winnerRegistrationId) {
    return errorState("Enter the final score and select the match winner.");
  }

  if (replays.length === 0) {
    return errorState("Upload the match replay files before submitting.");
  }

  const replayError = replays
    .map((replay) => validateReplay(replay))
    .find((error) => error !== null);

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

  const requiredReplayCount = (playerOneScore ?? 0) + (playerTwoScore ?? 0);

  if (replays.length !== requiredReplayCount) {
    return errorState(
      `This score requires exactly ${requiredReplayCount} replay file${
        requiredReplayCount === 1 ? "" : "s"
      }.`
    );
  }

  const replayHashes = await getReplayContentHashes(replays);
  const uniqueReplayHashes = new Set(replayHashes);

  if (uniqueReplayHashes.size !== replayHashes.length) {
    return errorState(
      "Each game requires a unique replay file. Remove duplicate replay uploads before submitting."
    );
  }

  const uploadRoot = `${matchId}/${userId}/${crypto.randomUUID()}`;
  const uploadedPaths: string[] = [];

  try {
    const replayPaths: string[] = [];

    for (const [index, replay] of replays.entries()) {
      replayPaths.push(
        await uploadProof(
          supabase,
          replay,
          `${uploadRoot}/game-${index + 1}.${getExtension(replay.name)}`,
          uploadedPaths
        )
      );
    }

    await verifyUploadedProofs(supabase, replayPaths);

    const { data: report, error: submissionError } =
      await supabase.rpc("submit_match_series_result_report", {
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: userId,
        p_winner_registration_id: winnerRegistrationId,
        p_player_one_score: playerOneScore,
        p_player_two_score: playerTwoScore,
        p_replay_storage_paths: replayPaths,
        p_replay_content_hashes: replayHashes,
        p_notes: notes || null,
      });

    if (submissionError) {
      throw submissionError;
    }

    const reportDetails = report as {
      report_group_id?: string;
      submission_number?: number;
      confirmation_deadline_at?: string;
    } | null;

    const submitterName = ownedRegistrationName(match, ownedRegistration.id);
    await createInAppNotification({
      recipientRole: "admin",
      type: "match.result_submitted",
      title: "Match Result Submitted",
      message: `${submitterName} submitted a result for Match #${match.match_number}.`,
      actorClerkUserId: userId,
      actorDisplayName: submitterName,
      tournamentId: match.tournament_id,
      tournamentTitle: match.tournament_title,
      matchId,
      reportGroupId: reportDetails?.report_group_id ?? null,
      metadata: {
        roundName: match.round_name,
        matchNumber: match.match_number,
        reportedScore: `${playerOneScore}-${playerTwoScore}`,
        winnerRegistrationId,
      },
    });

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

  await notifyAdminsOfMatchDispute(supabase, reportGroupId, userId);

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

  await notifyPlayersOfReportGroupReview(supabase, {
    reportGroupId,
    decision,
    reviewedBy: admin.userId,
  });

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

  const { data: activeReportGroup, error: activeReportGroupError } =
    await supabase
      .from("match_result_report_groups")
      .select("id")
      .eq("match_id", matchId)
      .is("finalized_at", null)
      .in("status", ["pending_confirmation", "disputed", "under_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (activeReportGroupError) {
    console.error("Active report-group lookup failed:", activeReportGroupError);
    return errorState("The active match report could not be checked.");
  }

  if (activeReportGroup) {
    const { error } = await supabase.rpc(
      "admin_finalize_match_result_report_group",
      {
        p_report_group_id: activeReportGroup.id,
        p_decision: "approved",
        p_reviewed_by: admin.userId,
        p_review_notes: "Official result entered by an administrator.",
        p_player_one_score: playerOneScore,
        p_player_two_score: playerTwoScore,
        p_winner_registration_id: winnerRegistrationId,
      }
    );

    if (error) {
      console.error("Admin report-group override failed:", error);
      return errorState(error.message);
    }

    await notifyPlayersOfReportGroupReview(supabase, {
      reportGroupId: activeReportGroup.id,
      decision: "approved",
      reviewedBy: admin.userId,
    });

    revalidateTournamentPaths();
    return successState("Report group overridden and winner advanced.");
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

  await notifyPlayersOfAdminOfficialMatchResult(supabase, match, admin.userId);

  revalidateTournamentPaths();
  return successState("Official result saved and winner advanced.");
}

export async function editAdminMatchParticipants(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const admin = await requireAdmin();

  if (!admin) {
    return errorState("Administrator access is required.");
  }

  const matchId = getText(formData, "matchId");
  const playerOneRegistrationId = getNullableText(
    formData,
    "playerOneRegistrationId"
  );
  const playerTwoRegistrationId = getNullableText(
    formData,
    "playerTwoRegistrationId"
  );

  if (!matchId) {
    return errorState("The selected match could not be found.");
  }

  if (
    playerOneRegistrationId &&
    playerTwoRegistrationId &&
    playerOneRegistrationId === playerTwoRegistrationId
  ) {
    return errorState("A player cannot occupy both match slots.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_update_match_participants", {
    p_match_id: matchId,
    p_player_one_registration_id: playerOneRegistrationId,
    p_player_two_registration_id: playerTwoRegistrationId,
    p_updated_by: admin.userId,
  });

  if (error) {
    console.error("Admin match participant edit failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState("Match participants updated.");
}

export async function resetAdminMatch(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const admin = await requireAdmin();

  if (!admin) {
    return errorState("Administrator access is required.");
  }

  const matchId = getText(formData, "matchId");
  const confirmation = getText(formData, "confirmation");

  if (!matchId) {
    return errorState("The selected match could not be found.");
  }

  if (confirmation !== "RESET") {
    return errorState("Type RESET before resetting this match.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_reset_tournament_match", {
    p_match_id: matchId,
    p_reset_by: admin.userId,
  });

  if (error) {
    console.error("Admin match reset failed:", error);
    return errorState(error.message);
  }

  revalidateTournamentPaths();
  return successState("Match reset. Proof records were preserved for audit.");
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

  await notifyPlayersOfLegacyMatchResultReview(supabase, {
    submissionId,
    decision,
    reviewedBy: admin.userId,
  });

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
  generated_bracket_id: string;
  tournament_id: string | null;
  tournament_title: string | null;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_name: string | null;
  player_two_name: string | null;
  match_number: number;
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
      "id, generated_bracket_id, match_number, series_best_of, player_one_registration_id, player_two_registration_id, player_one:registrations!tournament_matches_player_one_registration_id_fkey(player_name), player_two:registrations!tournament_matches_player_two_registration_id_fkey(player_name), bracket_rounds!inner(name), generated_brackets!inner(tournament_brackets!inner(tournament_id, tournaments!inner(id, title)))"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    console.error("Tournament match lookup failed:", error);
    return null;
  }

  const row = data as unknown as {
    id: string;
    generated_bracket_id: string;
    match_number: number;
    series_best_of: number;
    player_one_registration_id: string | null;
    player_two_registration_id: string | null;
    player_one?: { player_name: string | null } | { player_name: string | null }[];
    player_two?: { player_name: string | null } | { player_name: string | null }[];
    bracket_rounds?: { name: string | null } | { name: string | null }[];
    generated_brackets?: {
      tournament_brackets?: {
        tournament_id: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      } | {
        tournament_id: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      }[];
    } | {
      tournament_brackets?: {
        tournament_id: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      } | {
        tournament_id: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      }[];
    }[];
  };
  const round = first(row.bracket_rounds);
  const playerOne = first(row.player_one);
  const playerTwo = first(row.player_two);
  const generatedBracket = first(row.generated_brackets);
  const tournamentBracket = first(generatedBracket?.tournament_brackets);
  const tournament = first(tournamentBracket?.tournaments);

  return {
    id: row.id,
    generated_bracket_id: row.generated_bracket_id,
    tournament_id: tournament?.id ?? tournamentBracket?.tournament_id ?? null,
    tournament_title: tournament?.title ?? null,
    player_one_registration_id: row.player_one_registration_id,
    player_two_registration_id: row.player_two_registration_id,
    player_one_name: playerOne?.player_name ?? null,
    player_two_name: playerTwo?.player_name ?? null,
    match_number: row.match_number,
    round_name: round?.name ?? "",
    series_best_of: row.series_best_of,
  };
}

function ownedRegistrationName(match: MatchMutationRow, registrationId: string) {
  if (registrationId === match.player_one_registration_id) {
    return match.player_one_name || "Player 1";
  }

  if (registrationId === match.player_two_registration_id) {
    return match.player_two_name || "Player 2";
  }

  return "A player";
}

async function notifyPlayersOfAdminOfficialMatchResult(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  match: MatchMutationRow,
  reviewedBy: string
) {
  const registrationIds = [
    match.player_one_registration_id,
    match.player_two_registration_id,
  ].filter((value): value is string => Boolean(value));

  if (registrationIds.length === 0) return;

  const { data, error } = await supabase
    .from("registrations")
    .select("id, clerk_user_id")
    .in("id", registrationIds);

  if (error) {
    console.error("Official result notification lookup failed:", error.message);
    return;
  }

  const notifications = (data ?? [])
    .map((registration) => registration.clerk_user_id)
    .filter((value): value is string => Boolean(value))
    .map((recipientClerkUserId) => ({
      recipientClerkUserId,
      recipientRole: "player" as const,
      type: "match.result_approved",
      title: "Match Result Approved",
      message: "Your submitted match result has been approved.",
      actorClerkUserId: reviewedBy,
      actorDisplayName: "IronClad Admin",
      tournamentId: match.tournament_id,
      tournamentTitle: match.tournament_title,
      matchId: match.id,
      metadata: {
        roundName: match.round_name,
        matchNumber: match.match_number,
      },
    }));

  if (notifications.length > 0) {
    await createInAppNotifications(notifications);
  }
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
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

async function getReplayContentHashes(files: File[]) {
  return Promise.all(files.map((file) => getReplayContentHash(file)));
}

async function getReplayContentHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

function getNullableText(formData: FormData, field: string) {
  const value = getText(formData, field);
  return value.length > 0 ? value : null;
}

function getScore(formData: FormData, field: string) {
  const value = Number(getText(formData, field));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getFile(formData: FormData, field: string) {
  const value = formData.get(field);
  return value instanceof File && value.size > 0 ? value : null;
}

function getFiles(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .filter((value): value is File => value instanceof File && value.size > 0);
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
