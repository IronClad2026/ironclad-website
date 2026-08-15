import { PHASE_FOUR_ACTIVE_COHORT_SIZE } from "@/lib/tournament-registration-cohort";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

export type TournamentStatus =
  | "upcoming"
  | "registration_open"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "voided";

export type TournamentFormat = "1v1" | "2v2" | "4v4";
export type TournamentRuleFormat = "format_a" | "format_b";
export type TournamentBracketName = "Academy" | "Challenge" | "Main";
export type TournamentBracketFieldPrefix = "academy" | "challenge" | "main";

export const WAITLIST_DISCLOSURE_MESSAGE =
  "This division currently has all 8 active places filled. By continuing, you will join the waitlist. Your place is not guaranteed. If a player withdraws before launch, waitlisted players will be contacted in order and asked to confirm the available spot.";

export const TOURNAMENT_BRACKET_CONFIGS: readonly {
  name: TournamentBracketName;
  fieldPrefix: TournamentBracketFieldPrefix;
  label: string;
  defaultEloRules: string;
  defaultMaxPlayers: number;
}[] = [
  {
    name: "Academy",
    fieldPrefix: "academy",
    label: "Academy Bracket",
    defaultEloRules: "Below 1100 ELO",
    defaultMaxPlayers: 8,
  },
  {
    name: "Challenge",
    fieldPrefix: "challenge",
    label: "Challenge Bracket",
    defaultEloRules: "1100-1399 ELO",
    defaultMaxPlayers: 8,
  },
  {
    name: "Main",
    fieldPrefix: "main",
    label: "Main / Pro Bracket",
    defaultEloRules: "1400+ ELO",
    defaultMaxPlayers: 8,
  },
];

const bracketOrder = new Map(
  TOURNAMENT_BRACKET_CONFIGS.map((bracket, index) => [bracket.name, index])
);

export function getTournamentBracketDisplayName(name: string) {
  return (
    TOURNAMENT_BRACKET_CONFIGS.find((bracket) => bracket.name === name)
      ?.label ?? (name.endsWith("Bracket") ? name : `${name} Bracket`)
  );
}

export function getTournamentBracketSortOrder(name: string) {
  return bracketOrder.get(name as TournamentBracketName) ?? Number.MAX_SAFE_INTEGER;
}

export type TournamentCard = {
  id: string;
  slug: string;
  title: string;
  month: string;
  format: TournamentFormat;
  ruleFormat: TournamentRuleFormat;
  ruleFormatLabel: string;
  status:
    | "Open"
    | "Closed"
    | "In Progress"
    | "Completed"
    | "Cancelled"
    | "Voided";
  statusValue: TournamentStatus;
  image: string;
  description: string;
  organizer: string;
  game: string;
  region: string;
  time: string;
  prizePool: string;
  players: number;
  maxPlayers: number;
  brackets: {
    id: string;
    name: string;
    requirement: string;
    maxPlayers: string;
    registeredPlayers: number;
    activeCohortPlayers: number;
    activeCohortSize: number;
    waitlistedPlayers: number;
    isFull: boolean;
    isWaitlistOnly: boolean;
    launchedAt: string | null;
    prize: string;
  }[];
  details: string;
  rules: string;
  schedule: string[];
  contact: string;
  registrationEnabled: boolean;
  registrationOpenAt: string;
  registrationCloseAt: string;
  grandFinalAt: string | null;
  createdAt: string;
  resultConfirmationWindowMinutes: number;
  rulesUrl: string | null;
  battlefyUrl: string | null;
  participants: TournamentParticipant[];
  bracketParticipants: TournamentParticipant[];
  generatedBrackets: GeneratedTournamentBracket[];
  mapPools: PublishedTournamentMapPool[];
};

export type TournamentParticipant = {
  registrationId: string;
  name: string;
  country: string | null;
  elo: number | null;
  status:
    | "pending"
    | "manual_review"
    | "approved"
    | "rejected"
    | "waitlisted"
    | "withdrawn";
  bracketId: string;
  bracketName: string;
};

export type TournamentParticipantRegistrationSnapshot = {
  registrationId: string;
  playerName: string;
  country: string | null;
  submittedElo: number | null;
  verifiedElo: number | null;
  status: TournamentParticipant["status"];
  bracketId: string;
  bracketName: string;
};

export type TournamentParticipantPrivacyState = {
  publicProfileEnabled: boolean;
  accountClosedAt: string | null;
} | null;

export function mapPublicTournamentParticipant(
  registration: TournamentParticipantRegistrationSnapshot,
  privacy: TournamentParticipantPrivacyState
): TournamentParticipant {
  const isClosed = privacy?.accountClosedAt != null;
  const showOptionalFacts =
    !isClosed && privacy?.publicProfileEnabled === true;

  return {
    registrationId: registration.registrationId,
    name: isClosed ? "Former Competitor" : registration.playerName,
    country: showOptionalFacts ? registration.country : null,
    elo: showOptionalFacts
      ? (registration.verifiedElo ?? registration.submittedElo)
      : null,
    status: registration.status,
    bracketId: registration.bracketId,
    bracketName: registration.bracketName,
  };
}

export function formatTournamentParticipantFact(value: string | number | null) {
  return value === null || value === "" ? "—" : String(value);
}

export function tournamentParticipantMatchesQuery(
  participant: TournamentParticipant,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [participant.name, participant.country, participant.elo]
    .filter((value): value is string | number => value !== null)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export type PublicTournamentMatch = {
  id: string;
  seriesBestOf: number;
  roundName: string;
  roundNumber: number;
  matchNumber: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  activationVersion: number;
  activatedAt: string | null;
  deadlineAt: string | null;
  outcomeType:
    | "deadline_double_forfeit"
    | "automatic_bye"
    | "empty_feeder"
    | null;
  deadlineRuledAt: string | null;
  extensionMinutes: number | null;
  extendedAt: string | null;
  holdStartedAt: string | null;
  holdReleasedAt: string | null;
  playerOneRegistrationId: string | null;
  playerTwoRegistrationId: string | null;
  playerOneSlot: number | null;
  playerTwoSlot: number | null;
  playerOneScore: number | null;
  playerTwoScore: number | null;
  winnerRegistrationId: string | null;
};

export type AdminTournamentMatchPresentation = PublicTournamentMatch & {
  officialResultReference: string | null;
  officialResultDecisionLabel: "Administrator" | "Legacy result";
  officialResultDecidedAt: string | null;
  extensionReason: string | null;
  holdReason: string | null;
  reminderOneSentAt: string | null;
  reminderTwoSentAt: string | null;
};

export type GeneratedTournamentMatch = PublicTournamentMatch & {
  officialResultReference?: string | null;
  officialResultDecisionLabel?: "Administrator" | "Legacy result";
  officialResultDecidedAt?: string | null;
  extensionReason?: string | null;
  holdReason?: string | null;
  reminderOneSentAt?: string | null;
  reminderTwoSentAt?: string | null;
};

export type MatchResultSubmission = {
  id: string;
  submissionNumber: number;
  gameNumber: number;
  matchId: string;
  submittedByRegistrationId: string | null;
  submittedByViewer: boolean;
  claimedWinnerRegistrationId: string;
  playerOneScore: number;
  playerTwoScore: number;
  hasReplay: boolean;
  hasScreenshot: boolean;
  replayAccessHref: string | null;
  screenshotAccessHref: string | null;
  notes: string | null;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "resubmission_requested";
  reviewNotes: string | null;
  reviewerLabel: "Administrator" | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type ParticipantMatchResultSubmission = MatchResultSubmission;
export type AdminMatchResultSubmissionPresentation = MatchResultSubmission;

export type MatchResultReportGroupStatus =
  | "pending_confirmation"
  | "confirmed"
  | "auto_approved"
  | "disputed"
  | "under_review"
  | "approved"
  | "rejected"
  | "reset";

export type MatchResultReportGroupResultType = "normal" | "no_show";

export type MatchResultReportGroupNoShowStatus =
  | "pending"
  | "confirmed"
  | "disputed"
  | "approved"
  | "rejected"
  | "auto_confirmed";

export type MatchResultReportGroup = {
  id: string;
  matchId: string;
  tournamentId: string;
  resultType: MatchResultReportGroupResultType;
  submittedByRegistrationId: string;
  submittedByViewer: boolean;
  opponentRegistrationId: string;
  winnerRegistrationId: string;
  playerOneScore: number;
  playerTwoScore: number;
  hasReplay: boolean;
  replayAccessHref: string | null;
  replayProofs: {
    id: string;
    gameNumber: number;
    proofAvailable: boolean;
    replayAccessHref: string | null;
  }[];
  status: MatchResultReportGroupStatus;
  confirmationDeadlineAt: string;
  confirmedAt: string | null;
  disputedAt: string | null;
  disputeNotes: string | null;
  reviewerLabel: "Administrator" | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  noShowReportedByRegistrationId: string | null;
  noShowRegistrationId: string | null;
  noShowStatus: MatchResultReportGroupNoShowStatus | null;
  noShowNote: string | null;
  noShowResolvedAt: string | null;
  noShowResolverLabel: "Administrator" | null;
  finalizedAt: string | null;
  finalizedSource: string | null;
  createdAt: string;
};

export type ParticipantMatchResultReportGroup = MatchResultReportGroup;
export type AdminMatchResultReportGroupPresentation = MatchResultReportGroup;

export type TournamentStanding = {
  registrationId: string;
  wins: number;
  losses: number;
  points: number;
  rank: number | null;
};

export type GeneratedTournamentBracket = {
  id: string;
  tournamentBracketId: string;
  format: "single_elimination" | "round_robin";
  slotCount: number;
  generatedAt: string;
  matches: GeneratedTournamentMatch[];
  standings: TournamentStanding[];
};

export type TournamentRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  banner_image_url: string;
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TournamentStatus;
  format: TournamentFormat;
  rule_format: TournamentRuleFormat | null;
  result_confirmation_window_minutes: number | null;
  prize_pool: string;
  rules_url: string | null;
  battlefy_url: string | null;
  registration_enabled: boolean;
  grand_final_at: string | null;
  created_at: string;
  updated_at: string;
  tournament_brackets?: TournamentBracketRow[];
};

export type TournamentBracketRow = {
  id: string;
  tournament_id: string;
  name: TournamentBracketName;
  elo_rules: string;
  max_players: number;
  registered_players?: number;
  active_cohort_players?: number;
  waitlisted_players?: number;
  launched_at: string | null;
  map_pool_published_at: string | null;
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<TournamentStatus, TournamentCard["status"]> = {
  upcoming: "Closed",
  registration_open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  voided: "Voided",
};

const ruleFormatLabels: Record<TournamentRuleFormat, string> = {
  format_a: "Format A",
  format_b: "Format B",
};

export function mapTournamentRow(row: TournamentRow): TournamentCard {
  const brackets = [...(row.tournament_brackets ?? [])].sort(
    (left, right) =>
      getTournamentBracketSortOrder(left.name) -
        getTournamentBracketSortOrder(right.name) ||
      left.name.localeCompare(right.name)
  );
  const grandFinalDate = row.grand_final_at
    ? new Date(row.grand_final_at)
    : null;
  const dateFormatter = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const ruleFormat = row.rule_format ?? "format_a";

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    month: grandFinalDate
      ? dateFormatter.format(grandFinalDate)
      : "Date TBA",
    format: row.format,
    ruleFormat,
    ruleFormatLabel: ruleFormatLabels[ruleFormat],
    status: statusLabels[row.status],
    statusValue: row.status,
    image: row.banner_image_url,
    description: row.description,
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: grandFinalDate
      ? `Grand Final: ${dateTimeFormatter.format(grandFinalDate)} UTC`
      : "Grand Final date to be announced",
    prizePool: row.prize_pool,
    players: brackets.reduce(
      (total, bracket) => total + (bracket.registered_players ?? 0),
      0
    ),
    maxPlayers: brackets.reduce(
      (total, bracket) => total + bracket.max_players,
      0
    ),
    brackets: brackets.map((bracket) => ({
      id: bracket.id,
      name: getTournamentBracketDisplayName(bracket.name),
      requirement: bracket.elo_rules,
      maxPlayers: `Max ${bracket.max_players} players`,
      registeredPlayers: bracket.registered_players ?? 0,
      activeCohortPlayers: bracket.active_cohort_players ?? 0,
      activeCohortSize: PHASE_FOUR_ACTIVE_COHORT_SIZE,
      waitlistedPlayers: bracket.waitlisted_players ?? 0,
      isFull:
        (bracket.active_cohort_players ?? 0) >=
        PHASE_FOUR_ACTIVE_COHORT_SIZE,
      isWaitlistOnly:
        (bracket.active_cohort_players ?? 0) >=
          PHASE_FOUR_ACTIVE_COHORT_SIZE ||
        (bracket.waitlisted_players ?? 0) > 0,
      launchedAt: bracket.launched_at,
      prize: "Included in tournament prize pool",
    })),
    details: row.description,
    rules: row.rules_url
      ? `Rule format: ${ruleFormatLabels[ruleFormat]}. Read the official tournament rules using the Rules link for this event.`
      : `Rule format: ${ruleFormatLabels[ruleFormat]}. Tournament-specific rules and final bracket placement are managed by IronClad administrators.`,
    schedule: buildTournamentSchedule(row, dateTimeFormatter),
    contact:
      "Use the IronClad website and official community channels for registration, match details, and tournament updates.",
    registrationEnabled: row.registration_enabled,
    registrationOpenAt: row.registration_open_at ?? "",
    registrationCloseAt: row.registration_close_at ?? "",
    grandFinalAt: row.grand_final_at,
    createdAt: row.created_at,
    resultConfirmationWindowMinutes:
      row.result_confirmation_window_minutes ?? 30,
    rulesUrl: row.rules_url,
    battlefyUrl: row.battlefy_url,
    participants: [],
    bracketParticipants: [],
    generatedBrackets: [],
    mapPools: [],
  };
}

export function isTournamentRegistrationOpen(
  tournament: Pick<
    TournamentCard,
    | "statusValue"
    | "registrationEnabled"
    | "registrationOpenAt"
    | "registrationCloseAt"
  >,
  now = Date.now()
) {
  const registrationOpens = getOptionalTimestamp(
    tournament.registrationOpenAt
  );
  const registrationCloses = getOptionalTimestamp(
    tournament.registrationCloseAt
  );

  return (
    (tournament.statusValue === "registration_open" ||
      tournament.statusValue === "in_progress") &&
    tournament.registrationEnabled &&
    registrationOpens !== "invalid" &&
    registrationCloses !== "invalid" &&
    (registrationOpens === null || now >= registrationOpens) &&
    (registrationCloses === null || now <= registrationCloses)
  );
}

export function isTournamentBracketRegistrationOpen(
  tournament: Pick<
    TournamentCard,
    | "statusValue"
    | "registrationEnabled"
    | "registrationOpenAt"
    | "registrationCloseAt"
    | "brackets"
  >,
  bracketId: string,
  now = Date.now()
) {
  return (
    isTournamentRegistrationOpen(tournament, now) &&
    tournament.brackets.some(
      (bracket) => bracket.id === bracketId && bracket.launchedAt === null
    )
  );
}

export function isTournamentBracketPublic(launchedAt: string | null) {
  return launchedAt !== null;
}

export function isTournamentTerminalStatus(
  status: TournamentStatus
): status is "cancelled" | "voided" {
  return status === "cancelled" || status === "voided";
}

export function getPublicTournamentNavigation<
  Tournament extends { statusValue: TournamentStatus },
>(tournaments: Tournament[]) {
  return tournaments.filter(
    (tournament) => !isTournamentTerminalStatus(tournament.statusValue)
  );
}

export function getPublicTournamentRowsForRequest<
  Tournament extends {
    id: string;
    slug: string;
    status: TournamentStatus;
  },
>(tournaments: Tournament[], requestedReference: string | null) {
  const explicitlyRequestedTournament = requestedReference
    ? tournaments.find(
        (tournament) =>
          tournament.id === requestedReference ||
          tournament.slug === requestedReference
      ) ?? null
    : null;

  return tournaments.filter(
    (tournament) =>
      !isTournamentTerminalStatus(tournament.status) ||
      tournament.id === explicitlyRequestedTournament?.id
  );
}

export function getTournamentTerminalPublicMessage(status: TournamentStatus) {
  if (status === "cancelled") {
    return "This tournament was cancelled before an official competitive outcome.";
  }

  if (status === "voided") {
    return "This tournament was voided. Its factual match history is retained, but it no longer contributes to official standings.";
  }

  return null;
}

function getOptionalTimestamp(value: string) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : "invalid";
}

type EloEligibilityRule = {
  min: number | null;
  minInclusive: boolean;
  max: number | null;
  maxInclusive: boolean;
};

export function parseEloEligibilityRule(
  eloRules: string
): EloEligibilityRule | null {
  const normalized = eloRules
    .toLowerCase()
    .replaceAll(",", "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /^(?:open|any elo|all elo|all ratings|no elo restriction|unrestricted)$/.test(
      normalized
    )
  ) {
    return {
      min: null,
      minInclusive: true,
      max: null,
      maxInclusive: true,
    };
  }

  const range = normalized.match(/(\d+)\s*(?:-|to|through)\s*(\d+)/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max
      ? { min, minInclusive: true, max, maxInclusive: true }
      : null;
  }

  const minimumInclusive =
    normalized.match(/(?:>=|at least|minimum|min)\s*(?:elo\s*)?(\d+)/) ??
    normalized.match(
      /(\d+)\s*(?:\+|and (?:above|higher)|or (?:above|higher))/
    );
  if (minimumInclusive) {
    return {
      min: Number(minimumInclusive[1]),
      minInclusive: true,
      max: null,
      maxInclusive: true,
    };
  }

  const minimumExclusive = normalized.match(
    /(?:>|above|over)\s*(?:elo\s*)?(\d+)/
  );
  if (minimumExclusive) {
    return {
      min: Number(minimumExclusive[1]),
      minInclusive: false,
      max: null,
      maxInclusive: true,
    };
  }

  const maximumInclusive =
    normalized.match(/(?:<=|at most|maximum|max)\s*(?:elo\s*)?(\d+)/) ??
    normalized.match(
      /(\d+)\s*(?:and (?:below|under)|or (?:below|under))/
    );
  if (maximumInclusive) {
    return {
      min: null,
      minInclusive: true,
      max: Number(maximumInclusive[1]),
      maxInclusive: true,
    };
  }

  const maximumExclusive = normalized.match(
    /(?:<|below|under|less than)\s*(?:elo\s*)?(\d+)/
  );
  if (maximumExclusive) {
    return {
      min: null,
      minInclusive: true,
      max: Number(maximumExclusive[1]),
      maxInclusive: false,
    };
  }

  return null;
}

export function isEligibleForBracket(
  currentElo: number,
  eloRules: string
) {
  const rule = parseEloEligibilityRule(eloRules);
  if (!Number.isFinite(currentElo) || !rule) return false;

  const satisfiesMinimum =
    rule.min === null ||
    (rule.minInclusive ? currentElo >= rule.min : currentElo > rule.min);
  const satisfiesMaximum =
    rule.max === null ||
    (rule.maxInclusive ? currentElo <= rule.max : currentElo < rule.max);

  return satisfiesMinimum && satisfiesMaximum;
}

export function getEligibleBracketNames(
  currentElo: number,
  brackets: Array<{ name: string; requirement: string }>
) {
  return brackets
    .filter((bracket) =>
      isEligibleForBracket(currentElo, bracket.requirement)
    )
    .map((bracket) => bracket.name);
}

function buildTournamentSchedule(
  row: TournamentRow,
  formatter: Intl.DateTimeFormat
) {
  const schedule = [
    row.grand_final_at
      ? `Grand Final: ${formatter.format(new Date(row.grand_final_at))} UTC`
      : "Grand Final date to be announced",
    "Registration remains open while the event is open. Full brackets or brackets with an existing queue accept waitlist registrations.",
  ];

  return schedule;
}
