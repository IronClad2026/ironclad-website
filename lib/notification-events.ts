import "server-only";

import {
  createInAppNotification,
  createInAppNotifications,
  type NotificationCreateInput,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type TournamentTerminalNotificationOutcome = "cancelled" | "voided";

type TournamentTerminalRegistration = {
  id: string;
  clerkUserId: string;
  registrationStatus: string;
  tournamentTitle: string;
  tournamentBracket: unknown;
  waitlistOfferStatus: string | null;
};

const CANCELLATION_NOTIFICATION_STATUSES = [
  "pending",
  "manual_review",
  "approved",
  "waitlisted",
] as const;

type ReportGroupNotificationContext = {
  id: string;
  matchId: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  matchNumber: number | null;
  roundName: string | null;
  resultType: "normal" | "no_show";
  noShowRegistrationId: string | null;
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

export async function notifyPlayersOfTournamentTerminalTransition(
  supabase: SupabaseAdminClient,
  {
    tournamentId,
    outcome,
  }: {
    tournamentId: string;
    outcome: TournamentTerminalNotificationOutcome;
  }
): Promise<boolean> {
  const query = supabase
    .from("registrations")
    .select(
      "id, clerk_user_id, tournament_title, registration_status, waitlist_offer_status, tournament_bracket:tournament_brackets!inner(launched_at)"
    )
    .eq("tournament_id", tournamentId);
  const { data, error } =
    outcome === "cancelled"
      ? await query.in("registration_status", [
          ...CANCELLATION_NOTIFICATION_STATUSES,
        ])
      : await query.eq("registration_status", "approved");

  if (error) {
    logNotificationFailure(`tournament-${outcome}-context`, error);
    return false;
  }

  const seenRegistrations = new Set<string>();
  const notifications: NotificationCreateInput[] = [];

  for (const value of Array.isArray(data) ? data : []) {
    const registration = readTournamentTerminalRegistration(value);
    if (!registration) continue;

    const eligible =
      outcome === "cancelled"
        ? isAffectedCancellationRegistration(registration)
        : registration.registrationStatus === "approved" &&
          hasLaunchedTournamentBracket(registration.tournamentBracket);
    const recipientRegistrationKey = `${registration.clerkUserId}:${registration.id}`;

    if (!eligible || seenRegistrations.has(recipientRegistrationKey)) continue;
    seenRegistrations.add(recipientRegistrationKey);

    notifications.push({
      recipientClerkUserId: registration.clerkUserId,
      recipientRole: "player",
      type:
        outcome === "cancelled"
          ? "tournament.cancelled"
          : "tournament.voided",
      title:
        outcome === "cancelled"
          ? "Tournament Cancelled"
          : "Tournament Voided",
      message:
        outcome === "cancelled"
          ? `${registration.tournamentTitle} was cancelled. Your registration is now closed, and no official competitive result was recorded.`
          : `${registration.tournamentTitle} was voided. Its factual competition history remains available, but its results no longer count toward IronClad standings.`,
      tournamentId,
      tournamentTitle: registration.tournamentTitle,
      registrationId: registration.id,
      eventKey: `tournament:${tournamentId}:registration:${registration.id}:${outcome}`,
    });
  }

  if (notifications.length === 0) return true;

  const results = await Promise.all(
    notifications.map((notification) =>
      createInAppNotification(notification)
    )
  );
  return results.every(Boolean);
}

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

  const isNoShow = context.resultType === "no_show";

  await createInAppNotification({
    recipientRole: "admin",
    type: isNoShow ? "match.no_show_disputed" : "match.dispute_opened",
    title: isNoShow ? "New No-Show Dispute" : "New Match Dispute",
    message: `${actorName} opened a ${
      isNoShow ? "no-show dispute" : "dispute"
    } for Match #${context.matchNumber ?? "?"}.`,
    actorDisplayName: actorName,
    tournamentId: context.tournamentId,
    tournamentTitle: context.tournamentTitle,
    matchId: context.matchId,
    reportGroupId: context.id,
    eventKey: `match:${context.matchId}:report-group:${context.id}:dispute-opened`,
    metadata: {
      roundName: context.roundName,
      matchNumber: context.matchNumber,
      reportedScore: context.reportedScore,
      resultType: context.resultType,
      noShowRegistrationId: context.noShowRegistrationId,
    },
  });
}

export async function notifyNoShowReporterOfResponse(
  supabase: SupabaseAdminClient,
  {
    reportGroupId,
    decision,
  }: {
    reportGroupId: string;
    decision: "confirmed" | "disputed";
  }
) {
  const context = await loadReportGroupNotificationContext(
    supabase,
    reportGroupId
  );

  if (
    !context ||
    context.resultType !== "no_show" ||
    !context.submittedByClerkUserId
  ) {
    return;
  }

  await createInAppNotification({
    recipientClerkUserId: context.submittedByClerkUserId,
    recipientRole: "player",
    type:
      decision === "confirmed"
        ? "match.no_show_confirmed"
        : "match.no_show_disputed",
    title:
      decision === "confirmed"
        ? "No-Show Confirmed"
        : "No-Show Disputed",
    message:
      decision === "confirmed"
        ? `Your no-show report for Match #${context.matchNumber ?? "?"} was confirmed.`
        : `Your no-show report for Match #${context.matchNumber ?? "?"} was disputed and now requires administrator review.`,
    actorDisplayName: context.opponentName,
    tournamentId: context.tournamentId,
    tournamentTitle: context.tournamentTitle,
    matchId: context.matchId,
    reportGroupId: context.id,
    eventKey: `match:${context.matchId}:report-group:${context.id}:response:${decision}`,
    metadata: {
      roundName: context.roundName,
      matchNumber: context.matchNumber,
      resultType: context.resultType,
      noShowRegistrationId: context.noShowRegistrationId,
      decision,
    },
  });
}

export async function notifyPlayersOfReportGroupReview(
  supabase: SupabaseAdminClient,
  {
    reportGroupId,
    decision,
  }: {
    reportGroupId: string;
    decision: string;
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
      tournamentId: context.tournamentId,
      tournamentTitle: context.tournamentTitle,
      matchId: context.matchId,
      reportGroupId: context.id,
      resultType: context.resultType,
      eventKey: `match:${context.matchId}:report-group:${context.id}:review:${decision}`,
      metadata: {
        roundName: context.roundName,
        matchNumber: context.matchNumber,
        reportedScore: context.reportedScore,
        resultType: context.resultType,
        noShowRegistrationId: context.noShowRegistrationId,
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
  }: {
    submissionId: string;
    decision: string;
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
      tournamentId: context.tournamentId,
      tournamentTitle: context.tournamentTitle,
      matchId: context.matchId,
      reportGroupId: null,
      eventKey: `match:${context.matchId}:submission:${context.id}:review:${decision}`,
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
      "id, match_id, tournament_id, result_type, no_show_registration_id, submitted_by_clerk_user_id, submitted_by_registration_id, opponent_registration_id, player_one_score, player_two_score"
    )
    .eq("id", reportGroupId)
    .maybeSingle();

  if (error || !reportGroup) {
    logNotificationFailure("report-group-context", error);
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
    resultType:
      reportGroup.result_type === "no_show" ? "no_show" : "normal",
    noShowRegistrationId: reportGroup.no_show_registration_id ?? null,
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
    logNotificationFailure("legacy-submission-context", error);
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
    logNotificationFailure("tournament-context", error);
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
    logNotificationFailure("match-context", error);
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
    logNotificationFailure("registration-context", error);
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
  tournamentId,
  tournamentTitle,
  matchId,
  reportGroupId,
  resultType = "normal",
  eventKey,
  metadata,
}: {
  recipientClerkUserId: string;
  decision: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  matchId: string;
  reportGroupId: string | null;
  resultType?: "normal" | "no_show";
  eventKey: string;
  metadata: Record<string, unknown>;
}): NotificationCreateInput {
  const approved = decision === "approved";
  const noShow = resultType === "no_show";
  const noShowRejected = noShow && decision === "rejected";

  return {
    recipientClerkUserId,
    recipientRole: "player",
    type: noShow
      ? approved
        ? "match.no_show_approved"
        : noShowRejected
          ? "match.no_show_rejected"
          : "match.no_show_review_required"
      : approved
        ? "match.result_approved"
        : "match.result_review_required",
    title: noShow
      ? approved
        ? "No-Show Confirmed"
        : noShowRejected
          ? "No-Show Rejected"
          : "No-Show Requires Review"
      : approved
        ? "Match Result Approved"
        : "Match Result Requires Review",
    message: noShow
      ? approved
        ? "The no-show report has been approved and the match result recorded."
        : noShowRejected
          ? "The no-show report was rejected. The match remains unresolved."
          : "The no-show report requires further review."
      : approved
        ? "Your submitted match result has been approved."
        : "Your submitted match result requires further review.",
    actorDisplayName: "IronClad Admin",
    tournamentId,
    tournamentTitle,
    matchId,
    reportGroupId,
    eventKey,
    metadata: {
      ...metadata,
      decision,
    },
  };
}

function readTournamentTerminalRegistration(
  value: unknown
): TournamentTerminalRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = Reflect.get(value, "id");
  const clerkUserId = Reflect.get(value, "clerk_user_id");
  const registrationStatus = Reflect.get(value, "registration_status");
  const tournamentTitle = Reflect.get(value, "tournament_title");
  const waitlistOfferStatus = Reflect.get(value, "waitlist_offer_status");

  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof clerkUserId !== "string" ||
    clerkUserId.trim().length === 0 ||
    clerkUserId.trim().startsWith("deleted:") ||
    typeof registrationStatus !== "string"
  ) {
    return null;
  }

  return {
    id: id.trim(),
    clerkUserId: clerkUserId.trim(),
    registrationStatus,
    tournamentTitle:
      typeof tournamentTitle === "string" && tournamentTitle.trim().length > 0
        ? tournamentTitle.trim()
        : "This IronClad tournament",
    tournamentBracket: Reflect.get(value, "tournament_bracket"),
    waitlistOfferStatus:
      typeof waitlistOfferStatus === "string" ? waitlistOfferStatus : null,
  };
}

function isAffectedCancellationRegistration(
  registration: TournamentTerminalRegistration
) {
  if (
    !CANCELLATION_NOTIFICATION_STATUSES.includes(
      registration.registrationStatus as (typeof CANCELLATION_NOTIFICATION_STATUSES)[number]
    )
  ) {
    return false;
  }

  return (
    registration.registrationStatus !== "waitlisted" ||
    registration.waitlistOfferStatus === null ||
    registration.waitlistOfferStatus === "offered"
  );
}

function hasLaunchedTournamentBracket(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasLaunchedTournamentBracket);
  }
  if (!value || typeof value !== "object") return false;

  const launchedAt = Reflect.get(value, "launched_at");
  return typeof launchedAt === "string" && launchedAt.trim().length > 0;
}

function logNotificationFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "NOTIFY_FAILED";

  console.error("Notification operation failed.", { operation, code });
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
