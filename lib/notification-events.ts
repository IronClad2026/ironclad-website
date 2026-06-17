import "server-only";

import {
  createInAppNotification,
  createInAppNotifications,
  type NotificationCreateInput,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ReportGroupNotificationContext = {
  id: string;
  matchId: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  matchNumber: number | null;
  roundName: string | null;
  submittedByClerkUserId: string | null;
  submittedByName: string;
  opponentClerkUserId: string | null;
  opponentName: string;
  reportedScore: string;
};

type LegacySubmissionNotificationContext = {
  id: string;
  matchId: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  matchNumber: number | null;
  roundName: string | null;
  submittedByClerkUserId: string | null;
  submittedByName: string;
};

export async function notifyAdminsOfMatchDispute(
  supabase: SupabaseAdminClient,
  reportGroupId: string,
  actorClerkUserId: string
) {
  const context = await loadReportGroupNotificationContext(
    supabase,
    reportGroupId
  );

  if (!context) return;

  const actorName =
    context.submittedByClerkUserId === actorClerkUserId
      ? context.submittedByName
      : context.opponentClerkUserId === actorClerkUserId
        ? context.opponentName
        : "A player";

  await createInAppNotification({
    recipientRole: "admin",
    type: "match.dispute_opened",
    title: "New Match Dispute",
    message: `${actorName} opened a dispute for Match #${context.matchNumber ?? "?"}.`,
    actorClerkUserId,
    actorDisplayName: actorName,
    tournamentId: context.tournamentId,
    tournamentTitle: context.tournamentTitle,
    matchId: context.matchId,
    reportGroupId: context.id,
    metadata: {
      roundName: context.roundName,
      matchNumber: context.matchNumber,
      reportedScore: context.reportedScore,
    },
  });
}

export async function notifyPlayersOfReportGroupReview(
  supabase: SupabaseAdminClient,
  {
    reportGroupId,
    decision,
    reviewedBy,
  }: {
    reportGroupId: string;
    decision: string;
    reviewedBy: string;
  }
) {
  const context = await loadReportGroupNotificationContext(
    supabase,
    reportGroupId
  );

  if (!context) return;

  const recipients = [
    context.submittedByClerkUserId,
    context.opponentClerkUserId,
  ].filter((value): value is string => Boolean(value));

  const notifications = [
    ...new Set(recipients),
  ].map((recipientClerkUserId) =>
    buildMatchReviewNotification({
      recipientClerkUserId,
      decision,
      reviewedBy,
      tournamentId: context.tournamentId,
      tournamentTitle: context.tournamentTitle,
      matchId: context.matchId,
      reportGroupId: context.id,
      metadata: {
        roundName: context.roundName,
        matchNumber: context.matchNumber,
        reportedScore: context.reportedScore,
      },
    })
  );

  if (notifications.length > 0) {
    await createInAppNotifications(notifications);
  }
}

export async function notifyPlayersOfLegacyMatchResultReview(
  supabase: SupabaseAdminClient,
  {
    submissionId,
    decision,
    reviewedBy,
  }: {
    submissionId: string;
    decision: string;
    reviewedBy: string;
  }
) {
  const context = await loadLegacySubmissionNotificationContext(
    supabase,
    submissionId
  );

  if (!context?.submittedByClerkUserId) return;

  await createInAppNotification(
    buildMatchReviewNotification({
      recipientClerkUserId: context.submittedByClerkUserId,
      decision,
      reviewedBy,
      tournamentId: context.tournamentId,
      tournamentTitle: context.tournamentTitle,
      matchId: context.matchId,
      reportGroupId: null,
      metadata: {
        roundName: context.roundName,
        matchNumber: context.matchNumber,
        submissionId: context.id,
      },
    })
  );
}

async function loadReportGroupNotificationContext(
  supabase: SupabaseAdminClient,
  reportGroupId: string
): Promise<ReportGroupNotificationContext | null> {
  const { data: reportGroup, error } = await supabase
    .from("match_result_report_groups")
    .select(
      "id, match_id, tournament_id, submitted_by_clerk_user_id, submitted_by_registration_id, opponent_registration_id, player_one_score, player_two_score"
    )
    .eq("id", reportGroupId)
    .maybeSingle();

  if (error || !reportGroup) {
    console.error("Report-group notification lookup failed:", error?.message);
    return null;
  }

  const [tournament, match, registrations] = await Promise.all([
    loadTournamentTitle(supabase, reportGroup.tournament_id),
    loadMatchLabel(supabase, reportGroup.match_id),
    loadRegistrationNames(supabase, [
      reportGroup.submitted_by_registration_id,
      reportGroup.opponent_registration_id,
    ]),
  ]);
  const submittedBy = registrations.get(reportGroup.submitted_by_registration_id);
  const opponent = registrations.get(reportGroup.opponent_registration_id);

  return {
    id: reportGroup.id,
    matchId: reportGroup.match_id,
    tournamentId: reportGroup.tournament_id,
    tournamentTitle: tournament,
    matchNumber: match?.matchNumber ?? null,
    roundName: match?.roundName ?? null,
    submittedByClerkUserId:
      submittedBy?.clerk_user_id ?? reportGroup.submitted_by_clerk_user_id,
    submittedByName: submittedBy?.player_name ?? "A player",
    opponentClerkUserId: opponent?.clerk_user_id ?? null,
    opponentName: opponent?.player_name ?? "Opponent",
    reportedScore: `${reportGroup.player_one_score}-${reportGroup.player_two_score}`,
  };
}

async function loadLegacySubmissionNotificationContext(
  supabase: SupabaseAdminClient,
  submissionId: string
): Promise<LegacySubmissionNotificationContext | null> {
  const { data: submission, error } = await supabase
    .from("match_result_submissions")
    .select("id, match_id, submitted_by_clerk_user_id, submitted_by_registration_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (error || !submission) {
    console.error("Legacy submission notification lookup failed:", error?.message);
    return null;
  }

  const [match, registrations] = await Promise.all([
    loadMatchLabel(supabase, submission.match_id),
    submission.submitted_by_registration_id
      ? loadRegistrationNames(supabase, [submission.submitted_by_registration_id])
      : Promise.resolve(new Map<string, { clerk_user_id: string | null; player_name: string | null }>()),
  ]);
  const submittedBy = submission.submitted_by_registration_id
    ? registrations.get(submission.submitted_by_registration_id)
    : null;

  return {
    id: submission.id,
    matchId: submission.match_id,
    tournamentId: match?.tournamentId ?? null,
    tournamentTitle: match?.tournamentTitle ?? null,
    matchNumber: match?.matchNumber ?? null,
    roundName: match?.roundName ?? null,
    submittedByClerkUserId:
      submittedBy?.clerk_user_id ?? submission.submitted_by_clerk_user_id,
    submittedByName: submittedBy?.player_name ?? "A player",
  };
}

async function loadTournamentTitle(
  supabase: SupabaseAdminClient,
  tournamentId: string | null
) {
  if (!tournamentId) return null;

  const { data, error } = await supabase
    .from("tournaments")
    .select("title")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    console.error("Notification tournament lookup failed:", error.message);
    return null;
  }

  return data?.title ?? null;
}

async function loadMatchLabel(supabase: SupabaseAdminClient, matchId: string) {
  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_number, bracket_rounds!inner(name), generated_brackets!inner(tournament_brackets!inner(tournament_id, tournaments!inner(id, title)))"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    console.error("Notification match lookup failed:", error?.message);
    return null;
  }

  const row = data as unknown as {
    match_number: number;
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
  const generatedBracket = first(row.generated_brackets);
  const tournamentBracket = first(generatedBracket?.tournament_brackets);
  const tournament = first(tournamentBracket?.tournaments);

  return {
    tournamentId: tournament?.id ?? tournamentBracket?.tournament_id ?? null,
    tournamentTitle: tournament?.title ?? null,
    matchNumber: row.match_number,
    roundName: round?.name ?? null,
  };
}

async function loadRegistrationNames(
  supabase: SupabaseAdminClient,
  registrationIds: string[]
) {
  const ids = [...new Set(registrationIds.filter(Boolean))];
  const registrations = new Map<
    string,
    { clerk_user_id: string | null; player_name: string | null }
  >();

  if (ids.length === 0) return registrations;

  const { data, error } = await supabase
    .from("registrations")
    .select("id, clerk_user_id, player_name")
    .in("id", ids);

  if (error) {
    console.error("Notification registration lookup failed:", error.message);
    return registrations;
  }

  for (const registration of data ?? []) {
    registrations.set(registration.id, {
      clerk_user_id: registration.clerk_user_id,
      player_name: registration.player_name,
    });
  }

  return registrations;
}

function buildMatchReviewNotification({
  recipientClerkUserId,
  decision,
  reviewedBy,
  tournamentId,
  tournamentTitle,
  matchId,
  reportGroupId,
  metadata,
}: {
  recipientClerkUserId: string;
  decision: string;
  reviewedBy: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  matchId: string;
  reportGroupId: string | null;
  metadata: Record<string, unknown>;
}): NotificationCreateInput {
  const approved = decision === "approved";

  return {
    recipientClerkUserId,
    recipientRole: "player",
    type: approved ? "match.result_approved" : "match.result_review_required",
    title: approved ? "Match Result Approved" : "Match Result Requires Review",
    message: approved
      ? "Your submitted match result has been approved."
      : "Your submitted match result requires further review.",
    actorClerkUserId: reviewedBy,
    actorDisplayName: "IronClad Admin",
    tournamentId,
    tournamentTitle,
    matchId,
    reportGroupId,
    metadata: {
      ...metadata,
      decision,
    },
  };
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
