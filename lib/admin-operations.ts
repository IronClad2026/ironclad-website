import "server-only";

import { auth } from "@clerk/nextjs/server";

import {
  AdminOperationsMetricsError,
  buildAdminOperationsAttention,
  buildUtcDailySeries,
  calculateAdminOperationsGrowth,
  classifyAutomaticProgression,
  filterLaunchedMatches,
  isActiveAdminHold,
  isAwaitingConfirmation,
  isDirectLegacyAdminResolution,
  isExpiredConfirmation,
  isFactualNoShow,
  isGenuinelyPlayedMatch,
  isOpenDispute,
  isOverdueMatchAction,
  isPlayableMatch,
  isReadyForActivation,
  isUnresolvedAdminReview,
  resolveAdminOperationsPeriod,
  summarizeResultResolutions,
  type AdminOperationsGroupPoint,
  type AdminOperationsMatchFact,
  type AdminOperationsMetrics,
  type AdminOperationsPeriod,
  type AdminOperationsPeriodRange,
  type AdminOperationsReportGroupFact,
  type AdminOperationsRow,
} from "@/lib/admin-operations-metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = { metadata?: { role?: string } };

type PlayerRow = {
  id: string;
  display_name: string | null;
  created_at: string;
  profile_completed: boolean;
  account_closed_at: string | null;
  steam_id64: string | null;
  relic_elo_verified_at: string | null;
  public_profile_enabled: boolean;
};

type RegistrationRow = {
  id: string;
  profile_id: string | null;
  player_name: string;
  tournament_id: string;
  tournament_title: string;
  tournament_bracket_id: string | null;
  bracket_name: string | null;
  registration_status: string;
  created_at: string;
  withdrawn_at: string | null;
  waitlist_offer_status: string | null;
  waitlist_offer_created_at: string | null;
  waitlist_offer_expires_at: string | null;
  waitlist_offer_resolved_at: string | null;
};

type TournamentRow = {
  id: string;
  title: string;
  status: string;
  registration_enabled: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  created_at: string;
  first_completed_at: string | null;
};

type BracketRow = {
  id: string;
  tournament_id: string;
  name: string;
  launched_at: string | null;
};

type GeneratedBracketRow = { id: string; tournament_bracket_id: string };
type RoundRow = { id: string; generated_bracket_id: string; round_number: number };
type MatchRow = AdminOperationsMatchFact & {
  generated_bracket_id: string;
  round_id: string;
};
type ReportGroupRow = AdminOperationsReportGroupFact & {
  tournament_id: string;
  created_at: string;
  disputed_at: string | null;
  reviewed_at: string | null;
};
type LegacySubmissionRow = {
  id: string;
  match_id: string;
  status: string;
  report_group_id: string | null;
};
type AssistanceRow = {
  id: string;
  actor_display_name: string | null;
  tournament_id: string | null;
  tournament_title: string | null;
  match_id: string | null;
  created_at: string;
};

type QueryResult = {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
};

const MAX_NARROW_ROWS = 5000;
const RECENT_LIMIT = 8;

export async function loadAdminOperationsMetrics(
  periodKey: AdminOperationsPeriod
): Promise<AdminOperationsMetrics | null> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") return null;

  const now = new Date();
  const period = resolveAdminOperationsPeriod(periodKey, now);

  try {
    const supabase = createSupabaseAdminClient();
    const results = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, display_name, created_at, profile_completed, account_closed_at, steam_id64, relic_elo_verified_at, public_profile_enabled",
          { count: "exact" }
        )
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("registrations")
        .select(
          "id, profile_id, player_name, tournament_id, tournament_title, tournament_bracket_id, bracket_name, registration_status, created_at, withdrawn_at, waitlist_offer_status, waitlist_offer_created_at, waitlist_offer_expires_at, waitlist_offer_resolved_at",
          { count: "exact" }
        )
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("tournaments")
        .select(
          "id, title, status, registration_enabled, registration_open_at, registration_close_at, created_at, first_completed_at",
          { count: "exact" }
        )
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("tournament_brackets")
        .select("id, tournament_id, name, launched_at", { count: "exact" })
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("generated_brackets")
        .select("id, tournament_bracket_id", { count: "exact" })
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("bracket_rounds")
        .select("id, generated_bracket_id, round_number", { count: "exact" })
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("tournament_matches")
        .select(
          "id, generated_bracket_id, round_id, status, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, official_result_submission_id, official_result_decided_by, official_result_decided_at, activation_version, activated_at, deadline_at, outcome_type, deadline_ruled_at, hold_started_at, hold_released_at",
          { count: "exact" }
        )
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("match_result_report_groups")
        .select(
          "id, match_id, tournament_id, result_type, status, confirmation_deadline_at, no_show_status, finalized_at, finalized_source, created_at, disputed_at, reviewed_at",
          { count: "exact" }
        )
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("match_result_submissions")
        .select("id, match_id, status, report_group_id", { count: "exact" })
        .eq("status", "pending")
        .is("report_group_id", null)
        .limit(MAX_NARROW_ROWS + 1),
      supabase
        .from("notifications")
        .select(
          "id, actor_display_name, tournament_id, tournament_title, match_id, created_at",
          { count: "exact" }
        )
        .eq("recipient_role", "admin")
        .eq("type", "match.admin_assistance_requested")
        .is("in_app_hidden_at", null)
        .limit(MAX_NARROW_ROWS + 1),
    ]);

    const players = exactRows<PlayerRow>(results[0]);
    const registrations = exactRows<RegistrationRow>(results[1]);
    const tournaments = exactRows<TournamentRow>(results[2]);
    const brackets = exactRows<BracketRow>(results[3]);
    const generatedBrackets = exactRows<GeneratedBracketRow>(results[4]);
    const rounds = exactRows<RoundRow>(results[5]);
    const allMatches = exactRows<MatchRow>(results[6]);
    const allReportGroups = exactRows<ReportGroupRow>(results[7]);
    const legacySubmissions = exactRows<LegacySubmissionRow>(results[8]);
    const assistance = exactRows<AssistanceRow>(results[9]);

    return buildMetrics({
      period,
      now,
      players,
      registrations,
      tournaments,
      brackets,
      generatedBrackets,
      rounds,
      allMatches,
      allReportGroups,
      legacySubmissions,
      assistance,
    });
  } catch {
    console.error("Admin operations metrics query failed.");
    throw new AdminOperationsMetricsError();
  }
}

function exactRows<T>(result: QueryResult): T[] {
  if (
    result.error ||
    result.count === null ||
    !Array.isArray(result.data) ||
    result.count !== result.data.length ||
    result.count > MAX_NARROW_ROWS
  ) {
    throw new AdminOperationsMetricsError();
  }

  return result.data as T[];
}

function buildMetrics(input: {
  period: AdminOperationsPeriodRange;
  now: Date;
  players: PlayerRow[];
  registrations: RegistrationRow[];
  tournaments: TournamentRow[];
  brackets: BracketRow[];
  generatedBrackets: GeneratedBracketRow[];
  rounds: RoundRow[];
  allMatches: MatchRow[];
  allReportGroups: ReportGroupRow[];
  legacySubmissions: LegacySubmissionRow[];
  assistance: AssistanceRow[];
}): AdminOperationsMetrics {
  const {
    period,
    now,
    players,
    registrations,
    tournaments,
    brackets,
    generatedBrackets,
    rounds,
    allMatches,
    allReportGroups,
    legacySubmissions,
    assistance,
  } = input;
  const tournamentById = new Map(tournaments.map((row) => [row.id, row]));
  const bracketById = new Map(brackets.map((row) => [row.id, row]));
  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const launchedBracketIds = new Set(
    brackets.filter((row) => row.launched_at !== null).map((row) => row.id)
  );
  const launchedGeneratedIds = new Set(
    generatedBrackets
      .filter((row) => launchedBracketIds.has(row.tournament_bracket_id))
      .map((row) => row.id)
  );
  const generatedById = new Map(generatedBrackets.map((row) => [row.id, row]));
  const roundById = new Map(rounds.map((row) => [row.id, row]));
  const lastRoundByGenerated = new Map<string, number>();
  for (const round of rounds) {
    lastRoundByGenerated.set(
      round.generated_bracket_id,
      Math.max(lastRoundByGenerated.get(round.generated_bracket_id) ?? 0, round.round_number)
    );
  }

  const matches = filterLaunchedMatches(allMatches, launchedGeneratedIds);
  const launchedMatchIds = new Set(matches.map((row) => row.id));
  const reportGroups = allReportGroups.filter((row) => launchedMatchIds.has(row.match_id));
  const reportsByMatch = groupBy(reportGroups, (row) => row.match_id);
  const pendingLegacyMatchIds = new Set(
    legacySubmissions
      .filter((row) => launchedMatchIds.has(row.match_id))
      .map((row) => row.match_id)
  );
  const matchById = new Map(matches.map((row) => [row.id, row]));
  const launchedAssistance = assistance.filter(
    (row) => row.match_id !== null && launchedMatchIds.has(row.match_id)
  );
  const matchTournamentId = (match: MatchRow): string | null => {
    const generated = generatedById.get(match.generated_bracket_id);
    const bracket = generated ? bracketById.get(generated.tournament_bracket_id) : null;
    return bracket?.tournament_id ?? null;
  };
  const isNonTerminalMatch = (matchId: string) => {
    const match = matchById.get(matchId);
    const tournamentId = match ? matchTournamentId(match) : null;
    const status = tournamentId ? tournamentById.get(tournamentId)?.status : null;
    return Boolean(match && !["completed", "cancelled", "voided"].includes(status ?? ""));
  };

  const currentPlayers = players.filter((row) => inPeriod(row.created_at, period));
  const previousPlayers = players.filter((row) => inPreviousPeriod(row.created_at, period));
  const currentRegistrations = registrations.filter((row) => inPeriod(row.created_at, period));
  const previousRegistrations = registrations.filter((row) =>
    inPreviousPeriod(row.created_at, period)
  );
  const withdrawn = registrations.filter(
    (row) => row.registration_status === "withdrawn" && row.withdrawn_at !== null
  );
  const currentWithdrawn = withdrawn.filter((row) => inPeriod(row.withdrawn_at, period));

  const activeTournaments = tournaments.filter((row) =>
    ["registration_open", "in_progress"].includes(row.status)
  );
  const completedTournaments = tournaments.filter((row) => row.status === "completed");
  const launchedTournamentIds = new Set(
    brackets.filter((row) => row.launched_at !== null).map((row) => row.tournament_id)
  );
  const registrationOpenNow = tournaments.filter((row) => {
    const hasUnlaunchedDivision = brackets.some(
      (bracket) => bracket.tournament_id === row.id && bracket.launched_at === null
    );
    return (
      ["registration_open", "in_progress"].includes(row.status) &&
      row.registration_enabled &&
      (row.registration_open_at === null ||
        new Date(row.registration_open_at) <= now) &&
      (row.registration_close_at === null ||
        new Date(row.registration_close_at) >= now) &&
      hasUnlaunchedDivision
    );
  }).length;

  const factualNoShowGroups = reportGroups.filter(isFactualNoShow);
  const factualNoShowMatchIds = new Set(factualNoShowGroups.map((row) => row.match_id));
  const openWorkflowMatchIds = new Set(
    reportGroups
      .filter(
        (row) =>
          row.finalized_at === null &&
          ["pending_confirmation", "disputed", "under_review"].includes(row.status)
      )
      .map((row) => row.match_id)
  );
  const readyForActivation = matches.filter(isReadyForActivation);
  const playable = matches.filter((match) =>
    isPlayableMatch(match, now, openWorkflowMatchIds.has(match.id))
  );
  const played = matches.filter((match) =>
    isGenuinelyPlayedMatch(match, factualNoShowMatchIds.has(match.id))
  );
  const openDisputes = reportGroups.filter(isOpenDispute);
  const reportReviews = reportGroups.filter(isUnresolvedAdminReview);
  const underReviewMatchIds = new Set([
    ...reportReviews.map((row) => row.match_id),
    ...pendingLegacyMatchIds,
  ]);
  const overdueMatches = matches.filter((match) =>
    isOverdueMatchAction(
      match,
      reportsByMatch.get(match.id) ?? [],
      pendingLegacyMatchIds.has(match.id),
      now
    )
  );
  const expiredConfirmations = reportGroups.filter(
    (row) => isNonTerminalMatch(row.match_id) && isExpiredConfirmation(row, now)
  );
  const activeHolds = matches.filter(isActiveAdminHold);
  const expiredOffers = registrations.filter((row) => {
    const bracket = row.tournament_bracket_id
      ? bracketById.get(row.tournament_bracket_id)
      : null;
    return (
      row.registration_status === "waitlisted" &&
      row.waitlist_offer_status === "offered" &&
      row.waitlist_offer_expires_at !== null &&
      new Date(row.waitlist_offer_expires_at) <= now &&
      bracket?.launched_at === null
    );
  });

  const attention = buildAdminOperationsAttention({
    openDisputes: new Set(openDisputes.map((row) => row.match_id)).size,
    underAdminReview: underReviewMatchIds.size,
    pendingAdminAssistance: launchedAssistance.length,
    overdueMatchActions: overdueMatches.length,
    expiredConfirmationActions: new Set(expiredConfirmations.map((row) => row.match_id)).size,
    expiredWaitlistOffers: expiredOffers.length,
    activeAdminHolds: activeHolds.length,
  });
  const openIssueCount = attention.reduce((sum, item) => sum + item.count, 0);

  const participationByDivision = divisionGroups(
    registrations.filter(
      (row) =>
        row.registration_status === "approved" &&
        row.tournament_bracket_id !== null &&
        launchedBracketIds.has(row.tournament_bracket_id)
    )
  );
  const completedByDivision = divisionGroups(
    brackets
      .filter(
        (row) =>
          row.launched_at !== null && tournamentById.get(row.tournament_id)?.status === "completed"
      )
      .map((row) => ({ bracket_name: row.name }))
  );

  const repeatTournamentsByPlayer = new Map<string, Set<string>>();
  for (const registration of registrations) {
    if (
      registration.profile_id &&
      registration.registration_status === "approved" &&
      registration.tournament_bracket_id &&
      launchedBracketIds.has(registration.tournament_bracket_id)
    ) {
      const tournamentIds = repeatTournamentsByPlayer.get(registration.profile_id) ?? new Set();
      tournamentIds.add(registration.tournament_id);
      repeatTournamentsByPlayer.set(registration.profile_id, tournamentIds);
    }
  }

  const resolution = summarizeResultResolutions(reportGroups);
  const classifiedReportMatchIds = new Set(
    reportGroups
      .filter((row) =>
        ["confirmed", "auto_approved", "approved"].includes(row.status) &&
        row.finalized_at !== null
      )
      .map((row) => row.match_id)
  );
  const directLegacyAdmin = matches.filter((match) =>
    isDirectLegacyAdminResolution(match, classifiedReportMatchIds.has(match.id))
  ).length;

  const automaticProgressions = matches.filter(
    (row) => row.status === "completed" && row.outcome_type === "automatic_bye"
  );
  let byes = 0;
  let walkovers = 0;
  for (const match of automaticProgressions) {
    const round = roundById.get(match.round_id);
    const finalRound = round
      ? round.round_number === lastRoundByGenerated.get(round.generated_bracket_id)
      : false;
    const classification = classifyAutomaticProgression(match, finalRound);
    if (classification === "bye") byes += 1;
    if (classification === "walkover") walkovers += 1;
  }

  const registrationsPerTournament = countGroups(
    registrations,
    (row) => row.tournament_title || tournamentById.get(row.tournament_id)?.title || "Tournament"
  ).slice(0, 8);
  const withdrawalRate = registrations.length
    ? roundRate(withdrawn.length, registrations.length)
    : null;
  const completedLaunchedTournaments = completedTournaments.filter((row) =>
    launchedTournamentIds.has(row.id)
  );
  const completionRate = launchedTournamentIds.size
    ? roundRate(completedLaunchedTournaments.length, launchedTournamentIds.size)
    : null;

  const matchWho = (matchId: string, timestamp: string, meta: string): AdminOperationsRow => {
    const match = matchById.get(matchId);
    if (!match) throw new AdminOperationsMetricsError();
    const tournamentId = matchTournamentId(match);
    const tournament = tournamentId ? tournamentById.get(tournamentId) : null;
    const playerOne = match.player_one_registration_id
      ? registrationById.get(match.player_one_registration_id)?.player_name
      : null;
    const playerTwo = match.player_two_registration_id
      ? registrationById.get(match.player_two_registration_id)?.player_name
      : null;
    return {
      id: match.id,
      primary: [playerOne, playerTwo].filter(Boolean).join(" vs ") || "Match awaiting Players",
      secondary: tournament?.title ?? "Tournament",
      meta,
      timestamp,
      href: tournamentId
        ? `/tournaments?tournament=${encodeURIComponent(tournamentId)}&tab=brackets&match=${encodeURIComponent(match.id)}`
        : "/tournaments",
    };
  };

  const registrationRows = (predicate: (row: RegistrationRow) => boolean, timestamp: (row: RegistrationRow) => string | null) =>
    recentRows(
      registrations.filter(predicate).map((row) => registrationWho(row, timestamp(row)))
    );

  return {
    generatedAt: now.toISOString(),
    period,
    overview: {
      players: {
        value: currentPlayers.length,
        detail: `New Player Profiles · ${period.label}`,
        changePercent: calculateAdminOperationsGrowth(
          currentPlayers.length,
          period.key === "all" ? null : previousPlayers.length
        ).changePercent,
      },
      registrations: {
        value: currentRegistrations.length,
        href: "/admin/registrations",
        detail: `Registrations Submitted · ${period.label}`,
        changePercent: calculateAdminOperationsGrowth(
          currentRegistrations.length,
          period.key === "all" ? null : previousRegistrations.length
        ).changePercent,
      },
      activeTournaments: { value: activeTournaments.length, href: "/admin/tournaments", detail: "Now" },
      completedTournaments: { value: completedTournaments.length, href: "/admin/tournaments", detail: "All time" },
      openIssues: { value: openIssueCount, href: "#attention-required", detail: "Queue items now" },
    },
    attention,
    players: {
      total: players.length,
      openAccounts: players.filter((row) => row.account_closed_at === null).length,
      completedProfiles: players.filter((row) => row.profile_completed).length,
      steamLinked: players.filter((row) => row.steam_id64 !== null).length,
      relicVerified: players.filter((row) => row.relic_elo_verified_at !== null).length,
      publicProfiles: players.filter(
        (row) => row.public_profile_enabled && row.account_closed_at === null
      ).length,
      newInPeriod: currentPlayers.length,
      growth: calculateAdminOperationsGrowth(
        currentPlayers.length,
        period.key === "all" ? null : previousPlayers.length
      ),
      daily: buildUtcDailySeries(players.map((row) => row.created_at), period),
      participationByDivision,
      closedAccounts: recentRows(
        players
          .filter((row) => row.account_closed_at !== null)
          .map((row) => ({
            id: row.id,
            primary: row.display_name?.trim() || "Retained closed account",
            secondary: "Retained account-closure record",
            meta: "Closed account · incomplete historical total",
            timestamp: row.account_closed_at as string,
            href: "/admin/operations#who-left",
          }))
      ),
    },
    registrations: {
      total: registrations.length,
      registeredInPeriod: currentRegistrations.length,
      withdrawnInPeriod: currentWithdrawn.length,
      withdrawalRate,
      growth: calculateAdminOperationsGrowth(
        currentRegistrations.length,
        period.key === "all" ? null : previousRegistrations.length
      ),
      statusGroups: namedCounts(registrations, "registration_status", [
        ["Pending", "pending"],
        ["Approved", "approved"],
        ["Rejected", "rejected"],
        ["Manual review", "manual_review"],
        ["Raw waitlisted", "waitlisted"],
        ["Withdrawn", "withdrawn"],
      ]),
      waitlistOfferGroups: [
        {
          label: "Waiting Now",
          value: registrations.filter(
            (row) => row.registration_status === "waitlisted" && row.waitlist_offer_status === null
          ).length,
        },
        ...namedCounts(registrations, "waitlist_offer_status", [
          ["Offered Now", "offered"],
          ["Vacancy Accepted", "accepted"],
          ["Vacancy Declined", "declined"],
          ["Vacancy Expired", "expired"],
          ["Vacancy Cancelled", "cancelled"],
        ]),
      ],
      daily: buildUtcDailySeries(registrations.map((row) => row.created_at), period),
      withdrawalsDaily: buildUtcDailySeries(withdrawn.map((row) => row.withdrawn_at), period),
      who: {
        registered: registrationRows((row) => inPeriod(row.created_at, period), (row) => row.created_at),
        pending: registrationRows((row) => row.registration_status === "pending", (row) => row.created_at),
        manualReview: registrationRows(
          (row) => row.registration_status === "manual_review",
          (row) => row.created_at
        ),
        withdrawn: registrationRows(
          (row) => row.registration_status === "withdrawn" && inPeriod(row.withdrawn_at, period),
          (row) => row.withdrawn_at
        ),
        rejected: registrationRows((row) => row.registration_status === "rejected", (row) => row.created_at),
        waitlisted: registrationRows(
          (row) => row.registration_status === "waitlisted" && row.waitlist_offer_status === null,
          (row) => row.created_at
        ),
        vacancyOffered: registrationRows(
          (row) => row.waitlist_offer_status === "offered",
          (row) => row.waitlist_offer_created_at
        ),
        vacancyAccepted: registrationRows(
          (row) => row.waitlist_offer_status === "accepted" && inPeriod(row.waitlist_offer_resolved_at, period),
          (row) => row.waitlist_offer_resolved_at
        ),
        vacancyDeclined: registrationRows(
          (row) => row.waitlist_offer_status === "declined" && inPeriod(row.waitlist_offer_resolved_at, period),
          (row) => row.waitlist_offer_resolved_at
        ),
        vacancyExpired: registrationRows(
          (row) => row.waitlist_offer_status === "expired" && inPeriod(row.waitlist_offer_resolved_at, period),
          (row) => row.waitlist_offer_resolved_at
        ),
      },
    },
    tournaments: {
      total: tournaments.length,
      active: activeTournaments.length,
      registrationOpenNow,
      launched: launchedTournamentIds.size,
      completed: completedTournaments.length,
      cancelled: tournaments.filter((row) => row.status === "cancelled").length,
      voided: tournaments.filter((row) => row.status === "voided").length,
      createdInPeriod: tournaments.filter((row) => inPeriod(row.created_at, period)).length,
      completedInPeriod: completedTournaments.filter((row) =>
        inPeriod(row.first_completed_at, period)
      ).length,
      completionRate,
      statusGroups: countGroups(tournaments, (row) => sentenceCase(row.status)),
      completedByDivision,
      participationByDivision,
      dailyCompleted: buildUtcDailySeries(
        completedTournaments.map((row) => row.first_completed_at),
        period
      ),
    },
    matches: {
      total: matches.length,
      playable: playable.length,
      readyForActivation: readyForActivation.length,
      active: matches.filter((row) => row.status === "in_progress").length,
      completed: matches.filter((row) => row.status === "completed").length,
      statusGroups: countGroups(matches, (row) => sentenceCase(row.status)),
      outcomes: {
        played: played.length,
        confirmedNoShows: factualNoShowMatchIds.size,
        doubleForfeits: matches.filter((row) => row.outcome_type === "deadline_double_forfeit").length,
        byes,
        walkovers,
        automaticProgressions: automaticProgressions.length,
        emptyFeeders: matches.filter((row) => row.outcome_type === "empty_feeder").length,
      },
      resultResolution: { ...resolution, directLegacyAdmin },
      operationalHealth: {
        awaitingConfirmation: new Set(
          reportGroups.filter(isAwaitingConfirmation).map((row) => row.match_id)
        ).size,
        openDisputes: new Set(openDisputes.map((row) => row.match_id)).size,
        underAdminReview: underReviewMatchIds.size,
        pendingAdminAssistance: launchedAssistance.length,
        overdueMatchActions: overdueMatches.length,
        activeAdminHolds: activeHolds.length,
        expiredConfirmationActions: new Set(expiredConfirmations.map((row) => row.match_id)).size,
        expiredWaitlistOffers: expiredOffers.length,
      },
      who: {
        disputed: recentRows(
          openDisputes.map((row) => matchWho(row.match_id, row.disputed_at ?? row.created_at, "Open dispute"))
        ),
        underReview: recentRows(
          [...underReviewMatchIds].map((id) => {
            const group = reportReviews.find((row) => row.match_id === id);
            const match = matchById.get(id);
            return matchWho(id, group?.reviewed_at ?? group?.created_at ?? match?.activated_at ?? now.toISOString(), "Admin review");
          })
        ),
        overdue: recentRows(
          overdueMatches.map((row) => matchWho(row.id, row.deadline_at as string, "Overdue Match ruling"))
        ),
        noShows: recentRows(
          factualNoShowGroups.map((row) => matchWho(row.match_id, row.finalized_at as string, "Confirmed no-show"))
        ),
        adminAssistance: recentRows(
          launchedAssistance
            .map((row) => matchWho(row.match_id as string, row.created_at, `Admin Assistance · ${row.actor_display_name?.trim() || "Player"}`))
        ),
      },
    },
    health: {
      repeatApprovedParticipants: [...repeatTournamentsByPlayer.values()].filter(
        (ids) => ids.size >= 2
      ).length,
      registrationsPerTournament,
      completedTournamentRate: completionRate,
      withdrawalRate,
    },
  };
}

function registrationWho(row: RegistrationRow, timestamp: string | null): AdminOperationsRow {
  return {
    id: row.id,
    primary: row.player_name?.trim() || "Retained registration",
    secondary: row.tournament_title || "Tournament",
    meta: `${displayDivision(row.bracket_name)} · ${sentenceCase(row.registration_status)}`,
    timestamp: timestamp ?? row.created_at,
    href: `/admin/registrations?filter=${encodeURIComponent(row.registration_status)}&selected=${encodeURIComponent(row.id)}`,
  };
}

function recentRows(rows: AdminOperationsRow[]): AdminOperationsRow[] {
  return [...rows]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, RECENT_LIMIT);
}

function inPeriod(value: string | null, range: AdminOperationsPeriodRange): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  const start = range.startAt ? new Date(range.startAt).getTime() : -Infinity;
  return Number.isFinite(time) && time >= start && time < new Date(range.endAt).getTime();
}

function inPreviousPeriod(value: string | null, range: AdminOperationsPeriodRange): boolean {
  if (!value || !range.previousStartAt || !range.previousEndAt) return false;
  const time = new Date(value).getTime();
  return (
    Number.isFinite(time) &&
    time >= new Date(range.previousStartAt).getTime() &&
    time < new Date(range.previousEndAt).getTime()
  );
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

function countGroups<T>(rows: T[], label: (row: T) => string): AdminOperationsGroupPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = label(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([groupLabel, value]) => ({ label: groupLabel, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function namedCounts<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T,
  definitions: readonly (readonly [string, string])[]
): AdminOperationsGroupPoint[] {
  return definitions.map(([label, value]) => ({
    label,
    value: rows.filter((row) => row[field] === value).length,
  }));
}

function divisionGroups(rows: { bracket_name: string | null }[]): AdminOperationsGroupPoint[] {
  const canonical = ["Academy", "Challenge", "Main"];
  return canonical.map((division) => ({
    label: displayDivision(division),
    value: rows.filter((row) => row.bracket_name === division).length,
  }));
}

function displayDivision(value: string | null): string {
  if (value === "Main") return "Main / Pro";
  return value || "Division pending";
}

function sentenceCase(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function roundRate(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 1000) / 10;
}
