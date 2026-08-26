"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  createInAppNotification,
  createInAppNotifications,
} from "@/lib/notifications";
import {
  notifyPlayersOfLegacyMatchResultReview,
  notifyPlayersOfReportGroupReview,
} from "@/lib/notification-events";
import {
  cleanupMatchReplayUploadsForPlayer,
  finalizeMatchReplayResultForPlayer,
  MATCH_REPLAY_BUCKET,
  MatchReplayUploadError,
  prepareMatchReplayUploadsForPlayer,
  type CleanupMatchReplayUploadsInput,
  type FinalizeMatchReplayResultInput,
  type PrepareMatchReplayUploadsInput,
  type PreparedMatchReplayUpload,
} from "@/lib/match-replay-direct-upload";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type MatchResultActionState = {
  status: "idle" | "success" | "error";
  message: string;
  requiresRefresh?: boolean;
  code?: MatchResultActionCode;
  values?: Record<string, string | number>;
};

export type MatchResultActionCode =
  | "auth_required"
  | "prepare_failed"
  | "cleanup_failed"
  | "operation_failed"
  | "duplicate_replay"
  | "stale_conflict"
  | "result_submitted"
  | "opponent_required"
  | "notes_too_long"
  | "match_unavailable"
  | "participants_unavailable"
  | "participant_only"
  | "self_no_show"
  | "invalid_participant"
  | "no_show_submitted"
  | "report_unavailable"
  | "confirmed"
  | "dispute_notes_too_long"
  | "disputed";

export type PrepareMatchReplayUploadsState =
  | {
      status: "success";
      bucket: typeof MATCH_REPLAY_BUCKET;
      attemptId: string;
      uploads: PreparedMatchReplayUpload[];
    }
  | {
      status: "error";
      message: string;
      code: "auth_required" | "prepare_failed";
    };

export type CleanupPreparedReplayUploadsState =
  | {
      status: "success";
      removedCount: number;
    }
  | {
      status: "error";
      message: string;
      code: "auth_required" | "cleanup_failed";
    };

export async function prepareMatchReplayUploads(
  input: PrepareMatchReplayUploadsInput
): Promise<PrepareMatchReplayUploadsState> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "error",
      message: "Sign in before preparing replay uploads.",
      code: "auth_required",
    };
  }

  const supabase = createSupabaseAdminClient();

  try {
    const prepared = await prepareMatchReplayUploadsForPlayer(
      supabase,
      userId,
      input
    );
    return {
      status: "success",
      bucket: MATCH_REPLAY_BUCKET,
      attemptId: prepared.attemptId,
      uploads: prepared.uploads,
    };
  } catch (error) {
    logMatchResultFailure("prepare-replay-uploads", error);
    return {
      status: "error",
      code: "prepare_failed",
      message: getReplayUploadMessage(
        error,
        "The replay upload could not be prepared. Please try again."
      ),
    };
  }
}

export async function finalizeMatchResult(
  input: FinalizeMatchReplayResultInput
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before submitting a match result.", "auth_required");
  }

  const supabase = createSupabaseAdminClient();
  let committed: Awaited<
    ReturnType<typeof finalizeMatchReplayResultForPlayer>
  >;

  try {
    committed = await finalizeMatchReplayResultForPlayer(
      supabase,
      userId,
      input
    );
  } catch (error) {
    logMatchResultFailure("finalize-match-result", error);
    const duplicateReplay =
      error instanceof MatchReplayUploadError && error.code === "DUP_REPLAY";
    return {
      ...errorState(
        duplicateReplay
          ? "This replay has already been submitted. Use a different replay file."
          : getReplayUploadMessage(
              error,
              "The match result could not be submitted. Please try again."
            ),
        duplicateReplay ? "duplicate_replay" : "operation_failed"
      ),
      requiresRefresh:
        error instanceof MatchReplayUploadError &&
        error.code === "FINALIZATION_UNCERTAIN",
    };
  }

  // The RPC has committed. Notifications, cache refresh, formatting, or any
  // response failure after this point must never delete referenced proof.
  const reportDetails = getReportDetails(committed.report);
  const submitterName = getReplaySubmitterName(
    committed.match,
    committed.ownedRegistrationId
  );
  let followUpWarning = false;

  try {
    const notificationCreated = committed.reconciled
      ? true
      : await createInAppNotification({
          recipientRole: "admin",
          type: "match.result_submitted",
          title: "Match Result Submitted",
          message: `${submitterName} submitted a result for Match #${committed.match.matchNumber}.`,
          actorDisplayName: submitterName,
          tournamentId: committed.match.tournamentId,
          tournamentTitle: committed.match.tournamentTitle,
          matchId: input.matchId,
          reportGroupId: reportDetails.reportGroupId,
          metadata: {
            roundName: committed.match.roundName,
            matchNumber: committed.match.matchNumber,
            reportedScore: `${committed.playerOneScore}-${committed.playerTwoScore}`,
            winnerRegistrationId: committed.winnerRegistrationId,
          },
        });

    if (!notificationCreated) {
      followUpWarning = true;
      logMatchResultFailure("result-notification", {
        code: "NOTIFY_FALSE",
      });
    }
  } catch (error) {
    followUpWarning = true;
    logMatchResultFailure("result-notification", error);
  }

  try {
    revalidatePath("/tournaments");
    revalidatePath("/dashboard");
  } catch (error) {
    followUpWarning = true;
    logMatchResultFailure("result-revalidation", error);
  }

  const deadlineSuffix = getConfirmationDeadlineSuffix(
    reportDetails.confirmationDeadlineAt
  );
  return successState(
    `Submission #${reportDetails.submissionNumber ?? "new"} is awaiting opponent confirmation${deadlineSuffix}.${
      followUpWarning
        ? " The result was saved, but one follow-up update could not be completed. Refresh this match before taking another action."
        : ""
    }`,
    "result_submitted",
    {
      submission: reportDetails.submissionNumber ?? "new",
      deadline: reportDetails.confirmationDeadlineAt ?? "",
      warning: followUpWarning ? 1 : 0,
    }
  );
}

export async function cleanupPreparedReplayUploads(
  input: CleanupMatchReplayUploadsInput
): Promise<CleanupPreparedReplayUploadsState> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "error",
      message: "Sign in before cleaning up replay uploads.",
      code: "auth_required",
    };
  }

  const supabase = createSupabaseAdminClient();
  try {
    const removedCount = await cleanupMatchReplayUploadsForPlayer(
      supabase,
      userId,
      input
    );
    return { status: "success", removedCount };
  } catch (error) {
    logMatchResultFailure("cleanup-replay-uploads", error);
    return {
      status: "error",
      message: "Replay cleanup could not be completed safely.",
      code: "cleanup_failed",
    };
  }
}

export async function submitNoShowReport(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before reporting a no-show.", "auth_required");
  }

  const matchId = getText(formData, "matchId");
  const noShowRegistrationId = getText(formData, "noShowRegistrationId");
  const notes = getText(formData, "noShowNotes");

  if (!matchId || !noShowRegistrationId) {
    return errorState("Choose the opponent who did not show up.", "opponent_required");
  }

  if (notes.length > 2000) {
    return errorState("No-show notes must be 2000 characters or fewer.", "notes_too_long");
  }

  const supabase = createSupabaseAdminClient();
  const match = await loadMatchForMutation(supabase, matchId);

  if (!match) {
    return errorState("This tournament match is no longer available.", "match_unavailable");
  }

  const participantRegistrationIds = [
    match.player_one_registration_id,
    match.player_two_registration_id,
  ].filter((value): value is string => Boolean(value));

  if (participantRegistrationIds.length !== 2) {
    return errorState("Both match participants must be assigned.", "participants_unavailable");
  }

  const { data: registrations, error: registrationError } = await supabase
    .from("registrations")
    .select("id, clerk_user_id, player_name")
    .in("id", participantRegistrationIds);

  if (registrationError) {
    logMatchResultFailure("load-no-show-participants", registrationError);
    return errorState("The match participants could not be verified.", "participants_unavailable");
  }

  const registrationById = new Map(
    (registrations ?? []).map((registration) => [
      registration.id,
      registration,
    ])
  );
  const ownedRegistration = (registrations ?? []).find(
    (registration) => registration.clerk_user_id === userId
  );

  if (!ownedRegistration) {
    return errorState(
      "You can only report a no-show for matches you are participating in.",
      "participant_only"
    );
  }

  if (ownedRegistration.id === noShowRegistrationId) {
    return errorState("You cannot report yourself as a no-show.", "self_no_show");
  }

  if (!participantRegistrationIds.includes(noShowRegistrationId)) {
    return errorState("The reported player is not a participant in this match.", "invalid_participant");
  }

  const { data: report, error } = await supabase.rpc(
    "submit_match_no_show_report",
    {
      p_match_id: matchId,
      p_submitted_by_clerk_user_id: userId,
      p_no_show_registration_id: noShowRegistrationId,
      p_notes: notes || null,
    }
  );

  if (error) {
    logMatchResultFailure("submit-no-show-report", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The no-show report could not be submitted. Please try again."
      ),
      "operation_failed"
    );
  }

  const reportDetails = report as {
    confirmation_deadline_at?: string;
  } | null;
  const missingRegistration = registrationById.get(noShowRegistrationId);
  const missingName =
    missingRegistration?.player_name ??
    ownedRegistrationName(match, noShowRegistrationId);

  revalidatePath("/tournaments");
  revalidatePath("/dashboard");
  return successState(
    `No-show report submitted. ${missingName} must confirm or dispute${
      reportDetails?.confirmation_deadline_at
        ? ` by ${formatDeadline(reportDetails.confirmation_deadline_at)}`
        : ""
    }.`,
    "no_show_submitted",
    {
      player: missingName,
      deadline: reportDetails?.confirmation_deadline_at ?? "",
    }
  );
}

export async function confirmMatchResultReportGroup(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before confirming a match result.", "auth_required");
  }

  const reportGroupId = getText(formData, "reportGroupId");
  if (!reportGroupId) {
    return errorState("The match result confirmation could not be found.", "report_unavailable");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("confirm_match_result_report_group_api", {
    p_report_group_id: reportGroupId,
    p_confirmed_by_clerk_user_id: userId,
  });

  if (error) {
    logMatchResultFailure("confirm-match-result", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The match result could not be confirmed. Please try again."
      ),
      isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
    );
  }

  revalidateTournamentPaths();
  return successState("Result confirmed. The winner has been advanced.", "confirmed");
}

export async function disputeMatchResultReportGroup(
  _previousState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before disputing a match result.", "auth_required");
  }

  const reportGroupId = getText(formData, "reportGroupId");
  const disputeNotes = getText(formData, "disputeNotes");

  if (!reportGroupId) {
    return errorState("The match result confirmation could not be found.", "report_unavailable");
  }

  if (disputeNotes.length > 2000) {
    return errorState("Dispute notes must be 2000 characters or fewer.", "dispute_notes_too_long");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("dispute_match_result_report_group_api", {
    p_report_group_id: reportGroupId,
    p_disputed_by_clerk_user_id: userId,
    p_dispute_notes: disputeNotes || null,
  });

  if (error) {
    logMatchResultFailure("dispute-match-result", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The match result could not be disputed. Please try again."
      ),
      isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
    );
  }

  revalidateTournamentPaths();
  return successState("Result disputed. An administrator must review it.", "disputed");
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
  const { error } = await supabase.rpc("admin_finalize_match_result_report_group_api", {
    p_report_group_id: reportGroupId,
    p_decision: decision,
    p_reviewed_by: admin.userId,
    p_review_notes: reviewNotes || null,
  });

  if (error) {
    logMatchResultFailure("review-report-group", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The match result review could not be saved. Please try again."
      ),
      isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
    );
  }

  await notifyPlayersOfReportGroupReview(supabase, {
    reportGroupId,
    decision,
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
    logMatchResultFailure(
      "load-active-report-group",
      activeReportGroupError
    );
    return errorState("The active match report could not be checked.");
  }

  if (activeReportGroup) {
    const { error } = await supabase.rpc(
      "admin_finalize_match_result_report_group_api",
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
      logMatchResultFailure("override-report-group", error);
      return errorState(
        getDatabaseMessage(
          error,
          "The official result could not be saved. Please try again."
        ),
        isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
      );
    }

    await notifyPlayersOfReportGroupReview(supabase, {
      reportGroupId: activeReportGroup.id,
      decision: "approved",
    });

    revalidateTournamentPaths();
    return successState("Report group overridden and winner advanced.");
  }

  const { error } = await supabase.rpc("apply_admin_official_match_result_api", {
    p_match_id: matchId,
    p_player_one_score: playerOneScore,
    p_player_two_score: playerTwoScore,
    p_winner_registration_id: winnerRegistrationId,
    p_decided_by: admin.userId,
  });

  if (error) {
    logMatchResultFailure("save-admin-match-result", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The official result could not be saved. Please try again."
      ),
      isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
    );
  }

  await notifyPlayersOfAdminOfficialMatchResult(supabase, match);

  revalidateTournamentPaths();
  return successState("Official result saved and winner advanced.");
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
    logMatchResultFailure("reset-match", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The match could not be reset. Please try again."
      )
    );
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
  const { error } = await supabase.rpc("review_match_series_result_api", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_reviewed_by: admin.userId,
    p_review_notes: reviewNotes || null,
  });

  if (error) {
    logMatchResultFailure("review-legacy-result", error);
    return errorState(
      getDatabaseMessage(
        error,
        "The match result review could not be saved. Please try again."
      ),
      isMatchResultConflict(error) ? "stale_conflict" : "operation_failed"
    );
  }

  await notifyPlayersOfLegacyMatchResultReview(supabase, {
    submissionId,
    decision,
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
  activation_version: number;
};

async function loadMatchForMutation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string
): Promise<MatchMutationRow | null> {
  if (!matchId) return null;

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, generated_bracket_id, match_number, series_best_of, activation_version, player_one_registration_id, player_two_registration_id, player_one:registrations!tournament_matches_player_one_registration_id_fkey(player_name), player_two:registrations!tournament_matches_player_two_registration_id_fkey(player_name), bracket_rounds!inner(name), generated_brackets!inner(tournament_brackets!inner(tournament_id, launched_at, tournaments!inner(id, title)))"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    logMatchResultFailure("load-match-for-mutation", error);
    return null;
  }

  const row = data as unknown as {
    id: string;
    generated_bracket_id: string;
    match_number: number;
    series_best_of: number;
    activation_version: number;
    player_one_registration_id: string | null;
    player_two_registration_id: string | null;
    player_one?: { player_name: string | null } | { player_name: string | null }[];
    player_two?: { player_name: string | null } | { player_name: string | null }[];
    bracket_rounds?: { name: string | null } | { name: string | null }[];
    generated_brackets?: {
      tournament_brackets?: {
        tournament_id: string | null;
        launched_at: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      } | {
        tournament_id: string | null;
        launched_at: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      }[];
    } | {
      tournament_brackets?: {
        tournament_id: string | null;
        launched_at: string | null;
        tournaments?: { id: string; title: string | null } | { id: string; title: string | null }[];
      } | {
        tournament_id: string | null;
        launched_at: string | null;
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

  if (!tournamentBracket?.launched_at) {
    return null;
  }

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
    activation_version: row.activation_version,
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
  match: MatchMutationRow
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
    logMatchResultFailure("load-official-result-recipients", error);
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
      actorDisplayName: "IronClad Admin",
      tournamentId: match.tournament_id,
      tournamentTitle: match.tournament_title,
      matchId: match.id,
      eventKey: `match:${match.id}:activation:${match.activation_version}:admin-official-result-approved`,
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

function getDatabaseMessage(error: unknown, fallback: string) {
  const message = getErrorMessage(error).toLowerCase();
  const replayPreparationWait = message.match(
    /a replay upload attempt is already active; retry in (\d{1,3}) seconds/
  );
  if (replayPreparationWait) {
    return `A replay upload is already active. Wait ${replayPreparationWait[1]} seconds before replacing it, or finish the current upload.`;
  }
  const replayBudgetWait = message.match(
    /replay upload retry budget is exhausted; retry in (\d{1,5}) seconds/
  );
  if (replayBudgetWait) {
    return `The replay retry budget is temporarily exhausted. Try again in ${replayBudgetWait[1]} seconds.`;
  }
  const safeMessages: Array<[string, string]> = [
    [
      "match result conflict:",
      "This match result changed while the action was being applied. Refresh and review the current state before trying again.",
    ],
    [
      "clean the current replay attempt before changing its result",
      "Clean the current replay attempt before changing the score or files.",
    ],
    [
      "replay finalization is already in progress",
      "This replay attempt is already being verified. Refresh the match before retrying.",
    ],
    [
      "replay finalization owns this attempt",
      "This replay attempt is already being verified and cannot be cleaned.",
    ],
    [
      "replay cleanup is already in progress",
      "Replay cleanup is already in progress. Wait a moment and try again.",
    ],
    [
      "replay attempt recycling is already in progress",
      "Replay retry preparation is already in progress. Wait a moment and try again.",
    ],
    [
      "replay attempt is not available for finalization",
      "This replay attempt is no longer available. Prepare the uploads again.",
    ],
    [
      "replay attempt not found",
      "This replay attempt is no longer available. Prepare the uploads again.",
    ],
    [
      "player does not own this replay attempt",
      "You can only manage replay attempts that you prepared.",
    ],
    [
      "final result does not match this replay attempt",
      "This replay attempt was prepared for a different score or winner. Restore those result details, or wait briefly before preparing a replacement.",
    ],
    [
      "duplicate replay storage paths",
      "Each completed game requires a unique replay file.",
    ],
    [
      "duplicate replay payloads",
      "Each completed game requires a unique replay file.",
    ],
    [
      "replay proof paths must be unique",
      "Each completed game requires a unique replay file.",
    ],
    [
      "each game requires a unique replay file",
      "Each completed game requires a unique replay file.",
    ],
    [
      "match_result_report_groups_one_active_per_match",
      "This match already has a result awaiting confirmation or review.",
    ],
    [
      "already has an active result report group",
      "This match already has a result awaiting confirmation or review.",
    ],
    [
      "already has an official result",
      "This match already has an official result.",
    ],
    [
      "legacy pending reports awaiting administrator review",
      "This match has a result awaiting administrator review.",
    ],
    [
      "confirmation window has expired",
      "The confirmation window has expired.",
    ],
    [
      "only the opponent can confirm",
      "Only the opposing player can confirm this result.",
    ],
    [
      "only the opponent can dispute",
      "Only the opposing player can dispute this result.",
    ],
    [
      "not awaiting confirmation",
      "This result is no longer awaiting confirmation.",
    ],
    [
      "can no longer be finalized",
      "This result can no longer be finalized.",
    ],
    [
      "player is not a participant",
      "You can only manage results for matches you are participating in.",
    ],
    [
      "submitting registration is not a participant",
      "The submitting player is not assigned to this match.",
    ],
    [
      "opponent registration is not a participant",
      "The opposing player is not assigned to this match.",
    ],
    [
      "both match participants must be assigned",
      "Both match participants must be assigned before recording a result.",
    ],
    [
      "winner must be a participant",
      "Select one of the assigned players as the winner.",
    ],
    [
      "only the opposing player can be reported as a no-show",
      "Only the opposing player can be reported as a no-show.",
    ],
    [
      "valid non-tied",
      "Enter a valid non-tied final score.",
    ],
    [
      "score does not satisfy the match format",
      "The reported score does not satisfy this match's series format.",
    ],
    [
      "series requires the winner to finish",
      "The reported score does not satisfy this match's series format.",
    ],
    [
      "this score requires exactly",
      "The number of replay files does not match the reported score.",
    ],
    [
      "this final score requires exactly",
      "The number of replay files does not match the reported score.",
    ],
    [
      "replay file count",
      "The replay files could not be verified. Please upload them again.",
    ],
    [
      "at least one replay file is required",
      "This result cannot be finalized because its replay proof is missing.",
    ],
    [
      "replay proof is required",
      "Upload the match replay files before submitting.",
    ],
    [
      "every replay proof must use a .rec file",
      "Each replay must be a valid .rec file.",
    ],
    [
      "replay content hashes must be",
      "The replay files could not be verified. Please upload them again.",
    ],
    [
      "replay hash audit data is incomplete",
      "The replay files could not be verified. Please upload them again.",
    ],
    [
      "no-show notes must be",
      "No-show notes must be 2000 characters or fewer.",
    ],
    [
      "no-show reports cannot be score-overridden",
      "Reject the no-show report before entering a normal result.",
    ],
    [
      "completed match reset requires",
      "Use the match reset workflow before changing a completed result.",
    ],
    [
      "round-robin participant edits require",
      "Round-robin participants must be changed through the bracket workflow.",
    ],
    [
      "participant edits are blocked after",
      "Participants cannot be changed after the match has started or received a result.",
    ],
    [
      "participant edits are blocked because this match has result activity",
      "Participants cannot be changed while this match has result activity.",
    ],
    [
      "participant edits are blocked because one of these players",
      "Participants cannot be changed because a selected player is already assigned elsewhere in this bracket.",
    ],
    [
      "player 1 must be an approved registration",
      "Player 1 must be an approved registration in this bracket.",
    ],
    [
      "player 2 must be an approved registration",
      "Player 2 must be an approved registration in this bracket.",
    ],
    [
      "a player cannot occupy both match slots",
      "A player cannot occupy both match slots.",
    ],
    [
      "reset blocked because the downstream match",
      "This match cannot be reset while the downstream match has result activity.",
    ],
    [
      "reset blocked because the downstream player slot",
      "This match cannot be reset because its downstream player assignment has changed.",
    ],
    [
      "completed downstream match prevents changing this winner",
      "A completed downstream match prevents changing this winner.",
    ],
    [
      "winner correction blocked because the downstream match already has",
      "This result cannot be finalized because a downstream match already has result activity. An administrator must resolve it first.",
    ],
    [
      "generated downstream match not found",
      "The downstream match could not be found.",
    ],
    [
      "generated next-round match not found",
      "The next-round match could not be found.",
    ],
    [
      "pending ungrouped game report not found",
      "The pending legacy result could not be found.",
    ],
    [
      "active confirmation report group",
      "Review the active confirmation report instead of the legacy result.",
    ],
    [
      "conflicting player reports must be resolved",
      "Conflicting player reports must be resolved before approval.",
    ],
    [
      "reported games do not yet form a complete series result",
      "The reported games do not yet form a complete series result.",
    ],
    [
      "an administrator message is required",
      "Add an administrator message before saving this decision.",
    ],
    ["match result report group not found", "The match result could not be found."],
    ["tournament match not found", "The tournament match could not be found."],
    [
      "tournament could not be resolved for this match",
      "The tournament for this match could not be found.",
    ],
    [
      "terminal tournaments cannot accept competitive mutation",
      "This tournament is closed and cannot accept match results.",
    ],
    [
      "tournament is being updated; retry the operation",
      "The tournament is being updated. Wait a moment and try again.",
    ],
  ];

  return (
    safeMessages.find(([fragment]) => message.includes(fragment))?.[1] ??
    fallback
  );
}

function isMatchResultConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "40001" || error.code === "PT409")
  );
}

function getErrorMessage(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "";
}

function getReplayUploadMessage(error: unknown, fallback: string) {
  return error instanceof MatchReplayUploadError
    ? error.message
    : getDatabaseMessage(error, fallback);
}

function getReportDetails(report: unknown) {
  if (typeof report !== "object" || report === null) {
    return {
      reportGroupId: null,
      submissionNumber: null,
      confirmationDeadlineAt: null,
    };
  }

  const value = report as Record<string, unknown>;
  return {
    reportGroupId:
      typeof value.report_group_id === "string" ? value.report_group_id : null,
    submissionNumber:
      typeof value.submission_number === "number"
        ? value.submission_number
        : null,
    confirmationDeadlineAt:
      typeof value.confirmation_deadline_at === "string"
        ? value.confirmation_deadline_at
        : null,
  };
}

function getReplaySubmitterName(
  match: Awaited<
    ReturnType<typeof finalizeMatchReplayResultForPlayer>
  >["match"],
  registrationId: string
) {
  if (registrationId === match.playerOneRegistrationId) {
    return match.playerOneName || "Player 1";
  }

  if (registrationId === match.playerTwoRegistrationId) {
    return match.playerTwoName || "Player 2";
  }

  return "A player";
}

function getConfirmationDeadlineSuffix(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return ` until ${formatDeadline(value)}`;
  } catch {
    return "";
  }
}

function logMatchResultFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "OPERATION_FAILED";

  console.error("Match result operation failed.", {
    operation,
    code,
  });
}

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function successState(
  message: string,
  code?: MatchResultActionCode,
  values?: Record<string, string | number>
): MatchResultActionState {
  return { status: "success", message, code, values };
}

function errorState(
  message: string,
  code?: MatchResultActionCode
): MatchResultActionState {
  return { status: "error", message, code };
}
