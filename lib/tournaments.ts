export type TournamentStatus =
  | "upcoming"
  | "registration_open"
  | "in_progress"
  | "completed";

export type TournamentFormat = "1v1" | "2v2" | "4v4";
export type TournamentRuleFormat = "format_a" | "format_b";

export type TournamentCard = {
  id: string;
  slug: string;
  title: string;
  month: string;
  format: TournamentFormat;
  ruleFormat: TournamentRuleFormat;
  ruleFormatLabel: string;
  status: "Open" | "Closed" | "In Progress" | "Completed";
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
    waitlistedPlayers: number;
    isFull: boolean;
    isWaitlistOnly: boolean;
    prize: string;
  }[];
  details: string;
  rules: string;
  schedule: string[];
  contact: string;
  registrationOpenAt: string;
  grandFinalAt: string | null;
  resultConfirmationWindowMinutes: number;
  rulesUrl: string | null;
  battlefyUrl: string | null;
  participants: TournamentParticipant[];
  bracketParticipants: TournamentParticipant[];
  generatedBrackets: GeneratedTournamentBracket[];
};

export type TournamentParticipant = {
  registrationId: string;
  name: string;
  country: string;
  elo: number;
  status:
    | "pending"
    | "manual_review"
    | "approved"
    | "rejected"
    | "waitlisted";
  bracketId: string;
  bracketName: string;
};

export type GeneratedTournamentMatch = {
  id: string;
  seriesBestOf: number;
  roundName: string;
  roundNumber: number;
  matchNumber: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  playerOneRegistrationId: string | null;
  playerTwoRegistrationId: string | null;
  playerOneSlot: number | null;
  playerTwoSlot: number | null;
  playerOneScore: number | null;
  playerTwoScore: number | null;
  winnerRegistrationId: string | null;
  officialResultSubmissionId: string | null;
  officialResultDecidedBy: string | null;
  officialResultDecidedAt: string | null;
};

export type MatchResultSubmission = {
  id: string;
  submissionNumber: number;
  gameNumber: number;
  matchId: string;
  submittedByClerkUserId: string;
  submittedByRegistrationId: string | null;
  claimedWinnerRegistrationId: string;
  playerOneScore: number;
  playerTwoScore: number;
  replayStoragePath: string | null;
  screenshotStoragePath: string | null;
  replayProofUrl: string | null;
  screenshotProofUrl: string | null;
  replayProofExists: boolean;
  screenshotProofExists: boolean;
  notes: string | null;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "resubmission_requested";
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type MatchResultReportGroupStatus =
  | "pending_confirmation"
  | "confirmed"
  | "auto_approved"
  | "disputed"
  | "under_review"
  | "approved"
  | "rejected"
  | "reset";

export type MatchResultReportGroup = {
  id: string;
  matchId: string;
  tournamentId: string;
  submittedByClerkUserId: string;
  submittedByRegistrationId: string;
  opponentRegistrationId: string;
  winnerRegistrationId: string;
  playerOneScore: number;
  playerTwoScore: number;
  replayStoragePath: string | null;
  replayProofUrl: string | null;
  replayProofExists: boolean;
  status: MatchResultReportGroupStatus;
  confirmationDeadlineAt: string;
  confirmedAt: string | null;
  disputedAt: string | null;
  disputeNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  finalizedAt: string | null;
  finalizedSource: string | null;
  createdAt: string;
};

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
  name: "Main" | "Challenge";
  elo_rules: string;
  max_players: number;
  registered_players?: number;
  waitlisted_players?: number;
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<TournamentStatus, TournamentCard["status"]> = {
  upcoming: "Closed",
  registration_open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
};

const ruleFormatLabels: Record<TournamentRuleFormat, string> = {
  format_a: "Format A",
  format_b: "Format B",
};

export function mapTournamentRow(row: TournamentRow): TournamentCard {
  const bracketOrder = { Main: 0, Challenge: 1 };
  const brackets = [...(row.tournament_brackets ?? [])].sort(
    (left, right) => bracketOrder[left.name] - bracketOrder[right.name]
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
      name: `${bracket.name} Bracket`,
      requirement: bracket.elo_rules,
      maxPlayers: `Max ${bracket.max_players} players`,
      registeredPlayers: bracket.registered_players ?? 0,
      waitlistedPlayers: bracket.waitlisted_players ?? 0,
      isFull: (bracket.registered_players ?? 0) >= bracket.max_players,
      isWaitlistOnly:
        (bracket.registered_players ?? 0) >= bracket.max_players ||
        (bracket.waitlisted_players ?? 0) > 0,
      prize: "Included in tournament prize pool",
    })),
    details: row.description,
    rules: row.rules_url
      ? `Rule format: ${ruleFormatLabels[ruleFormat]}. Read the official tournament rules using the Rules link for this event.`
      : `Rule format: ${ruleFormatLabels[ruleFormat]}. Tournament-specific rules and final bracket placement are managed by IronClad administrators.`,
    schedule: buildTournamentSchedule(row, dateTimeFormatter),
    contact:
      "Use the IronClad website and official community channels for registration, match details, and tournament updates.",
    registrationOpenAt: row.registration_open_at ?? "",
    grandFinalAt: row.grand_final_at,
    resultConfirmationWindowMinutes:
      row.result_confirmation_window_minutes ?? 30,
    rulesUrl: row.rules_url,
    battlefyUrl: row.battlefy_url,
    participants: [],
    bracketParticipants: [],
    generatedBrackets: [],
  };
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
