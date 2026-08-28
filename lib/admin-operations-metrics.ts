export const ADMIN_OPERATIONS_PERIODS = [
  "today",
  "7d",
  "30d",
  "all",
] as const;

export type AdminOperationsPeriod =
  (typeof ADMIN_OPERATIONS_PERIODS)[number];

export type AdminOperationsPeriodRange = {
  key: AdminOperationsPeriod;
  label: string;
  startAt: string | null;
  endAt: string;
  previousStartAt: string | null;
  previousEndAt: string | null;
};

export type AdminOperationsMetric = {
  value: number;
  href?: string;
  detail?: string;
  changePercent?: number | null;
};

export type AdminOperationsGroupPoint = {
  label: string;
  value: number;
};

export type AdminOperationsDailyPoint = {
  date: string;
  label: string;
  value: number;
};

export type AdminOperationsRow = {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  timestamp: string;
  href: string;
};

export type AdminOperationsAttentionItem = {
  key:
    | "disputes"
    | "admin-review"
    | "admin-assistance"
    | "overdue-matches"
    | "expired-confirmations"
    | "expired-waitlist-offers"
    | "admin-holds";
  label: string;
  count: number;
  tone: "critical" | "warning" | "info";
  href: string;
  description: string;
};

export type AdminOperationsGrowth = {
  current: number;
  previous: number | null;
  changePercent: number | null;
};

export type AdminOperationsMetrics = {
  generatedAt: string;
  period: AdminOperationsPeriodRange;
  overview: {
    players: AdminOperationsMetric;
    registrations: AdminOperationsMetric;
    activeTournaments: AdminOperationsMetric;
    completedTournaments: AdminOperationsMetric;
    openIssues: AdminOperationsMetric;
  };
  attention: AdminOperationsAttentionItem[];
  players: {
    total: number;
    openAccounts: number;
    completedProfiles: number;
    steamLinked: number;
    relicVerified: number;
    publicProfiles: number;
    newInPeriod: number;
    growth: AdminOperationsGrowth;
    daily: AdminOperationsDailyPoint[];
    participationByDivision: AdminOperationsGroupPoint[];
    closedAccounts: AdminOperationsRow[];
  };
  registrations: {
    total: number;
    registeredInPeriod: number;
    withdrawnInPeriod: number;
    withdrawalRate: number | null;
    growth: AdminOperationsGrowth;
    statusGroups: AdminOperationsGroupPoint[];
    waitlistOfferGroups: AdminOperationsGroupPoint[];
    daily: AdminOperationsDailyPoint[];
    withdrawalsDaily: AdminOperationsDailyPoint[];
    who: {
      registered: AdminOperationsRow[];
      pending: AdminOperationsRow[];
      manualReview: AdminOperationsRow[];
      withdrawn: AdminOperationsRow[];
      rejected: AdminOperationsRow[];
      waitlisted: AdminOperationsRow[];
      vacancyOffered: AdminOperationsRow[];
      vacancyAccepted: AdminOperationsRow[];
      vacancyDeclined: AdminOperationsRow[];
      vacancyExpired: AdminOperationsRow[];
    };
  };
  tournaments: {
    total: number;
    active: number;
    registrationOpenNow: number;
    launched: number;
    completed: number;
    cancelled: number;
    voided: number;
    createdInPeriod: number;
    completedInPeriod: number;
    completionRate: number | null;
    statusGroups: AdminOperationsGroupPoint[];
    completedByDivision: AdminOperationsGroupPoint[];
    participationByDivision: AdminOperationsGroupPoint[];
    dailyCompleted: AdminOperationsDailyPoint[];
  };
  matches: {
    total: number;
    playable: number;
    readyForActivation: number;
    active: number;
    completed: number;
    statusGroups: AdminOperationsGroupPoint[];
    outcomes: {
      played: number;
      confirmedNoShows: number;
      doubleForfeits: number;
      byes: number;
      walkovers: number;
      automaticProgressions: number;
      emptyFeeders: number;
    };
    resultResolution: {
      playerConfirmed: number;
      automaticallyConfirmed: number;
      adminApproved: number;
      directLegacyAdmin: number;
    };
    operationalHealth: {
      awaitingConfirmation: number;
      openDisputes: number;
      underAdminReview: number;
      pendingAdminAssistance: number;
      overdueMatchActions: number;
      activeAdminHolds: number;
      expiredConfirmationActions: number;
      expiredWaitlistOffers: number;
    };
    who: {
      disputed: AdminOperationsRow[];
      underReview: AdminOperationsRow[];
      overdue: AdminOperationsRow[];
      noShows: AdminOperationsRow[];
      adminAssistance: AdminOperationsRow[];
    };
  };
  health: {
    repeatApprovedParticipants: number;
    registrationsPerTournament: AdminOperationsGroupPoint[];
    completedTournamentRate: number | null;
    withdrawalRate: number | null;
  };
};

export const ADMIN_OPERATIONS_ERROR_MESSAGE =
  "Admin operations metrics could not be loaded.";

export class AdminOperationsMetricsError extends Error {
  constructor() {
    super(ADMIN_OPERATIONS_ERROR_MESSAGE);
    this.name = "AdminOperationsMetricsError";
  }
}

export function parseAdminOperationsPeriod(
  value: string | string[] | null | undefined
): AdminOperationsPeriod {
  const candidate = Array.isArray(value) ? value[0] : value;

  return ADMIN_OPERATIONS_PERIODS.includes(
    candidate as AdminOperationsPeriod
  )
    ? (candidate as AdminOperationsPeriod)
    : "30d";
}

export function resolveAdminOperationsPeriod(
  period: AdminOperationsPeriod,
  now = new Date()
): AdminOperationsPeriodRange {
  if (Number.isNaN(now.getTime())) {
    throw new AdminOperationsMetricsError();
  }

  const endAt = now.toISOString();
  if (period === "all") {
    return {
      key: period,
      label: "All time",
      startAt: null,
      endAt,
      previousStartAt: null,
      previousEndAt: null,
    };
  }

  const start = startOfUtcDay(now);
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const currentDuration = now.getTime() - start.getTime();
  const previousEnd = new Date(start);
  const previousStart = new Date(start.getTime() - currentDuration);

  return {
    key: period,
    label:
      period === "today"
        ? "Today"
        : period === "7d"
          ? "Last 7 days"
          : "Last 30 days",
    startAt: start.toISOString(),
    endAt,
    previousStartAt: previousStart.toISOString(),
    previousEndAt: previousEnd.toISOString(),
  };
}

export function requireExactCount(
  count: number | null,
  error: unknown
): number {
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new AdminOperationsMetricsError();
  }

  return count;
}

export function calculateAdminOperationsGrowth(
  current: number,
  previous: number | null
): AdminOperationsGrowth {
  if (previous === null) {
    return { current, previous, changePercent: null };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current === 0 ? 0 : null,
    };
  }

  return {
    current,
    previous,
    changePercent: Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

export function buildUtcDailySeries(
  timestamps: readonly (string | null)[],
  range: AdminOperationsPeriodRange
): AdminOperationsDailyPoint[] {
  const validDates = timestamps
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  const end = new Date(range.endAt);
  const requestedStart = range.startAt ? new Date(range.startAt) : null;
  const firstEvent = validDates.reduce<Date | null>(
    (earliest, candidate) =>
      !earliest || candidate.getTime() < earliest.getTime()
        ? candidate
        : earliest,
    null
  );
  const start = startOfUtcDay(requestedStart ?? firstEvent ?? end);
  const counts = new Map<string, number>();

  for (const timestamp of validDates) {
    if (timestamp.getTime() < start.getTime() || timestamp >= end) continue;
    const key = timestamp.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: AdminOperationsDailyPoint[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({
      date: key,
      label: cursor.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      value: counts.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

export type AdminOperationsMatchFact = {
  id: string;
  status: string;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner_registration_id: string | null;
  official_result_submission_id: string | null;
  official_result_decided_by: string | null;
  official_result_decided_at: string | null;
  activation_version: number;
  activated_at: string | null;
  deadline_at: string | null;
  outcome_type: string | null;
  deadline_ruled_at: string | null;
  hold_started_at: string | null;
  hold_released_at: string | null;
};

export type AdminOperationsReportGroupFact = {
  id: string;
  match_id: string;
  result_type: string;
  status: string;
  confirmation_deadline_at: string;
  no_show_status: string | null;
  finalized_at: string | null;
  finalized_source: string | null;
};

export function filterLaunchedMatches<
  T extends { generated_bracket_id: string },
>(
  matches: readonly T[],
  launchedGeneratedBracketIds: ReadonlySet<string>
): T[] {
  return matches.filter((match) =>
    launchedGeneratedBracketIds.has(match.generated_bracket_id)
  );
}

export function isReadyForActivation(
  match: AdminOperationsMatchFact
): boolean {
  return (
    match.status === "scheduled" &&
    match.activation_version === 0 &&
    match.activated_at === null &&
    match.deadline_at === null &&
    match.outcome_type === null &&
    match.deadline_ruled_at === null &&
    match.player_one_registration_id !== null &&
    match.player_two_registration_id !== null &&
    match.player_one_score === null &&
    match.player_two_score === null &&
    match.winner_registration_id === null &&
    match.official_result_submission_id === null &&
    match.official_result_decided_by === null &&
    match.official_result_decided_at === null
  );
}

export function isPlayableMatch(
  match: AdminOperationsMatchFact,
  now: Date,
  hasOpenResultWorkflow: boolean
): boolean {
  return (
    match.status === "in_progress" &&
    match.activation_version > 0 &&
    match.activated_at !== null &&
    match.deadline_at !== null &&
    new Date(match.deadline_at).getTime() > now.getTime() &&
    match.player_one_registration_id !== null &&
    match.player_two_registration_id !== null &&
    match.outcome_type === null &&
    match.player_one_score === null &&
    match.player_two_score === null &&
    match.winner_registration_id === null &&
    match.official_result_submission_id === null &&
    match.official_result_decided_by === null &&
    match.official_result_decided_at === null &&
    !isActiveAdminHold(match) &&
    !hasOpenResultWorkflow
  );
}

export function isGenuinelyPlayedMatch(
  match: AdminOperationsMatchFact,
  hasFactualNoShow: boolean
): boolean {
  return (
    match.status === "completed" &&
    match.outcome_type === null &&
    match.player_one_registration_id !== null &&
    match.player_two_registration_id !== null &&
    match.player_one_score !== null &&
    match.player_two_score !== null &&
    match.winner_registration_id !== null &&
    !hasFactualNoShow
  );
}

export function classifyAutomaticProgression(
  match: AdminOperationsMatchFact,
  isFinalRound: boolean
): "bye" | "walkover" | null {
  if (match.status !== "completed" || match.outcome_type !== "automatic_bye") {
    return null;
  }

  return isFinalRound ? "walkover" : "bye";
}

export function isDirectLegacyAdminResolution(
  match: AdminOperationsMatchFact,
  hasClassifiedReportGroup: boolean
): boolean {
  return (
    match.status === "completed" &&
    match.outcome_type === null &&
    match.winner_registration_id !== null &&
    match.player_one_score !== null &&
    match.player_two_score !== null &&
    match.official_result_decided_by !== null &&
    match.official_result_decided_at !== null &&
    !hasClassifiedReportGroup
  );
}

export function isActiveAdminHold(
  match: AdminOperationsMatchFact
): boolean {
  return match.hold_started_at !== null && match.hold_released_at === null;
}

export function isFactualNoShow(
  reportGroup: AdminOperationsReportGroupFact
): boolean {
  return (
    reportGroup.result_type === "no_show" &&
    reportGroup.finalized_at !== null &&
    ["confirmed", "auto_approved", "approved"].includes(
      reportGroup.status
    ) &&
    ["confirmed", "auto_confirmed", "approved"].includes(
      reportGroup.no_show_status ?? ""
    )
  );
}

export function classifyResultResolution(
  reportGroup: AdminOperationsReportGroupFact
): "player_confirmed" | "automatically_confirmed" | "admin_approved" | null {
  if (reportGroup.finalized_at === null) return null;

  if (
    reportGroup.status === "confirmed" &&
    reportGroup.finalized_source === "opponent_confirmation"
  ) {
    return "player_confirmed";
  }

  if (
    reportGroup.status === "auto_approved" &&
    reportGroup.finalized_source === "cron_auto_approval"
  ) {
    return "automatically_confirmed";
  }

  if (
    reportGroup.status === "approved" &&
    ["admin_approval", "admin_override"].includes(
      reportGroup.finalized_source ?? ""
    )
  ) {
    return "admin_approved";
  }

  return null;
}

export function summarizeResultResolutions(
  reportGroups: readonly AdminOperationsReportGroupFact[]
): {
  playerConfirmed: number;
  automaticallyConfirmed: number;
  adminApproved: number;
} {
  const resolutionByMatch = new Map<
    string,
    "player_confirmed" | "automatically_confirmed" | "admin_approved"
  >();

  for (const group of reportGroups) {
    const resolution = classifyResultResolution(group);
    if (resolution && !resolutionByMatch.has(group.match_id)) {
      resolutionByMatch.set(group.match_id, resolution);
    }
  }

  const resolutions = [...resolutionByMatch.values()];
  return {
    playerConfirmed: resolutions.filter(
      (resolution) => resolution === "player_confirmed"
    ).length,
    automaticallyConfirmed: resolutions.filter(
      (resolution) => resolution === "automatically_confirmed"
    ).length,
    adminApproved: resolutions.filter(
      (resolution) => resolution === "admin_approved"
    ).length,
  };
}

export function isAwaitingConfirmation(
  reportGroup: AdminOperationsReportGroupFact
): boolean {
  return (
    reportGroup.status === "pending_confirmation" &&
    reportGroup.finalized_at === null
  );
}

export function isOpenDispute(
  reportGroup: AdminOperationsReportGroupFact
): boolean {
  return reportGroup.status === "disputed" && reportGroup.finalized_at === null;
}

export function isUnresolvedAdminReview(
  reportGroup: AdminOperationsReportGroupFact
): boolean {
  return (
    reportGroup.status === "under_review" &&
    reportGroup.finalized_at === null
  );
}

export function isExpiredConfirmation(
  reportGroup: AdminOperationsReportGroupFact,
  now: Date
): boolean {
  return (
    isAwaitingConfirmation(reportGroup) &&
    new Date(reportGroup.confirmation_deadline_at).getTime() <= now.getTime()
  );
}

export function isOverdueMatchAction(
  match: AdminOperationsMatchFact,
  matchReportGroups: readonly AdminOperationsReportGroupFact[],
  hasPendingLegacySubmission: boolean,
  now: Date
): boolean {
  const hasBlockingReportGroup = matchReportGroups.some(
    (group) =>
      (["pending_confirmation", "disputed", "under_review"].includes(
        group.status
      ) &&
        group.finalized_at === null) ||
      ["confirmed", "auto_approved", "approved"].includes(group.status)
  );

  return (
    match.status === "in_progress" &&
    match.deadline_at !== null &&
    new Date(match.deadline_at).getTime() <= now.getTime() &&
    match.outcome_type === null &&
    match.deadline_ruled_at === null &&
    match.player_one_score === null &&
    match.player_two_score === null &&
    match.winner_registration_id === null &&
    match.official_result_submission_id === null &&
    match.official_result_decided_by === null &&
    match.official_result_decided_at === null &&
    match.player_one_registration_id !== null &&
    match.player_two_registration_id !== null &&
    !isActiveAdminHold(match) &&
    !hasBlockingReportGroup &&
    !hasPendingLegacySubmission
  );
}

export function uniqueMatchCount(
  rows: readonly { match_id: string }[]
): number {
  return new Set(rows.map((row) => row.match_id)).size;
}

export type AdminOperationsAttentionCounts = {
  openDisputes: number;
  underAdminReview: number;
  pendingAdminAssistance: number;
  overdueMatchActions: number;
  expiredConfirmationActions: number;
  expiredWaitlistOffers: number;
  activeAdminHolds: number;
};

export function buildAdminOperationsAttention(
  counts: AdminOperationsAttentionCounts
): AdminOperationsAttentionItem[] {
  return [
    {
      key: "disputes",
      label: "Open disputes",
      count: counts.openDisputes,
      tone: "critical",
      href: "/admin/operations#match-issues",
      description: "Player result disputes awaiting resolution.",
    },
    {
      key: "admin-review",
      label: "Admin reviews",
      count: counts.underAdminReview,
      tone: "critical",
      href: "/admin/operations#match-issues",
      description: "Distinct Matches in a current Admin review workflow.",
    },
    {
      key: "admin-assistance",
      label: "Admin Assistance",
      count: counts.pendingAdminAssistance,
      tone: "warning",
      href: "/admin/operations#match-issues",
      description: "Visible Player requests for Admin Assistance.",
    },
    {
      key: "overdue-matches",
      label: "Overdue Match actions",
      count: counts.overdueMatchActions,
      tone: "critical",
      href: "/admin/operations#match-issues",
      description: "Deadline-expired Matches eligible for operational action.",
    },
    {
      key: "expired-confirmations",
      label: "Expired confirmations",
      count: counts.expiredConfirmationActions,
      tone: "warning",
      href: "/admin/operations#match-issues",
      description: "Pending result confirmations past their deadline.",
    },
    {
      key: "expired-waitlist-offers",
      label: "Expired vacancy offers",
      count: counts.expiredWaitlistOffers,
      tone: "warning",
      href: "/admin/registrations?filter=waitlisted",
      description: "Open waitlist offers past their expiry time.",
    },
    {
      key: "admin-holds",
      label: "Active Admin holds",
      count: counts.activeAdminHolds,
      tone: "info",
      href: "/admin/operations#match-issues",
      description: "Matches paused by an unreleased Admin hold.",
    },
  ];
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}
