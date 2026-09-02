import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TOURNAMENT_BRACKET_CONFIGS,
  type TournamentBracketName,
  type TournamentStatus,
} from "@/lib/tournaments";
import {
  resolveTournamentDivisionStates,
  type TournamentDivisionStateEvidence,
  type TournamentDivisionStateResolution,
} from "@/lib/tournament-division-state";

export type TournamentDivisionStateDataClient = Pick<
  SupabaseClient,
  "from" | "rpc"
>;

export type TournamentDivisionStateBracketRow = {
  id: string;
  name: string;
  launched_at: string | null;
};

export type TournamentDivisionStateTournamentRow = {
  id: string;
  status: string;
  // Existing repository projections make this selected relationship optional
  // at the type level. Runtime resolution requires the array and fails closed
  // when a caller omitted it.
  tournament_brackets?: readonly TournamentDivisionStateBracketRow[];
};

export type TournamentDivisionStateAuthoritySnapshot = {
  readinessRows: unknown;
  generatedBracketRows: unknown;
  notHeldRows?: unknown;
};

export class TournamentDivisionStateDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentDivisionStateDataError";
  }
}

type NormalizedBracket = {
  tournamentId: string;
  id: string;
  canonicalName: TournamentBracketName;
  launchedAt: string | null;
};

type NormalizedTournament = {
  id: string;
  status: TournamentStatus;
  brackets: NormalizedBracket[];
};

type ReadinessEvidence = {
  approvedCount: number;
  requiredCount: number;
  isReady: boolean;
  launchedAt: string | null;
};

type NotHeldEvidence = {
  notHeldAt: string;
  reasonCode: "minimum_roster_not_reached";
};

type GeneratedBracketEvidence = {
  id: string;
  tournamentBracketId: string;
  format: "single_elimination" | "round_robin";
  rounds: GeneratedBracketRoundEvidence[];
};

type GeneratedBracketRoundEvidence = {
  roundNumber: number;
  matches: GeneratedBracketMatchEvidence[];
};

type GeneratedBracketMatchEvidence = {
  matchNumber: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  outcomeType:
    | "deadline_double_forfeit"
    | "automatic_bye"
    | "empty_feeder"
    | null;
  winnerRegistrationId: string | null;
};

const VALID_TOURNAMENT_STATUSES = new Set<TournamentStatus>([
  "upcoming",
  "registration_open",
  "in_progress",
  "completed",
  "cancelled",
  "voided",
]);

const CANONICAL_DIVISION_NAMES = new Set<TournamentBracketName>(
  TOURNAMENT_BRACKET_CONFIGS.map((config) => config.name)
);

const VALID_MATCH_STATUSES = new Set<GeneratedBracketMatchEvidence["status"]>([
  "scheduled",
  "in_progress",
  "pending_review",
  "completed",
]);

const VALID_MATCH_OUTCOME_TYPES = new Set<
  Exclude<GeneratedBracketMatchEvidence["outcomeType"], null>
>(["deadline_double_forfeit", "automatic_bye", "empty_feeder"]);

const GENERATED_BRACKET_COMPLETION_SELECT =
  "id, tournament_bracket_id, format, " +
  "bracket_rounds(round_number, " +
  "tournament_matches(id, generated_bracket_id, match_number, status, outcome_type, winner_registration_id))";

export async function loadTournamentDivisionStates(
  supabase: TournamentDivisionStateDataClient,
  tournamentRows: readonly TournamentDivisionStateTournamentRow[],
  snapshot?: TournamentDivisionStateAuthoritySnapshot
): Promise<Map<string, readonly TournamentDivisionStateResolution[]>> {
  const tournaments = normalizeTournamentRows(tournamentRows);
  const brackets = tournaments.flatMap((tournament) => tournament.brackets);
  const bracketIds = brackets.map((bracket) => bracket.id);

  if (brackets.length === 0) {
    return resolveFromAuthorityEvidence(tournaments, new Map(), new Map());
  }

  const [readinessRows, generatedBracketRows, notHeldRows] = snapshot
    ? [
        snapshot.readinessRows,
        snapshot.generatedBracketRows,
        snapshot.notHeldRows ?? [],
      ]
    : await Promise.all([
        loadReadinessRows(supabase),
        loadGeneratedBracketRows(supabase, bracketIds),
        loadNotHeldRows(supabase),
      ]);
  const readinessByBracketId = normalizeReadinessRows(
    readinessRows,
    brackets
  );
  const generatedByBracketId = normalizeGeneratedBracketRows(
    generatedBracketRows,
    bracketIds
  );
  const notHeldByBracketId = normalizeNotHeldRows(notHeldRows, brackets);

  return resolveFromAuthorityEvidence(
    tournaments,
    readinessByBracketId,
    generatedByBracketId,
    notHeldByBracketId
  );
}

function resolveFromAuthorityEvidence(
  tournaments: readonly NormalizedTournament[],
  readinessByBracketId: ReadonlyMap<string, ReadinessEvidence>,
  generatedByBracketId: ReadonlyMap<string, GeneratedBracketEvidence>,
  notHeldByBracketId: ReadonlyMap<string, NotHeldEvidence> = new Map()
) {
  const resolutionsByTournamentId = new Map<
    string,
    readonly TournamentDivisionStateResolution[]
  >();

  for (const tournament of tournaments) {
    const evidence: TournamentDivisionStateEvidence[] = tournament.brackets.map(
      (bracket) => {
        const readiness = readinessByBracketId.get(bracket.id);

        if (!readiness) {
          throw new TournamentDivisionStateDataError(
            "Tournament division readiness evidence was missing."
          );
        }

        const generated = generatedByBracketId.get(bracket.id) ?? null;
        const notHeld = notHeldByBracketId.get(bracket.id) ?? null;
        if (readiness.launchedAt !== null && generated === null) {
          throw new TournamentDivisionStateDataError(
            "A launched tournament division is missing its generated bracket."
          );
        }

        let isCompetitionComplete = false;

        if (readiness.launchedAt !== null && generated) {
          isCompetitionComplete = resolveOfficialMatchCompletion(generated);
        }

        return {
          canonicalName: bracket.canonicalName,
          bracketId: bracket.id,
          approvedCount: readiness.approvedCount,
          requiredCount: readiness.requiredCount,
          isReady: readiness.isReady,
          launchedAt: readiness.launchedAt,
          generatedBracketId: generated?.id ?? null,
          isCompetitionComplete,
          notHeldAt: notHeld?.notHeldAt ?? null,
          notHeldReasonCode: notHeld?.reasonCode ?? null,
        };
      }
    );

    resolutionsByTournamentId.set(
      tournament.id,
      resolveTournamentDivisionStates({
        tournamentId: tournament.id,
        eventStatus: tournament.status,
        divisions: evidence,
      })
    );
  }

  return resolutionsByTournamentId;
}

async function loadGeneratedBracketRows(
  supabase: TournamentDivisionStateDataClient,
  bracketIds: string[]
) {
  const result = await runAuthorityRequest(
    () =>
      supabase
        .from("generated_brackets")
        .select(GENERATED_BRACKET_COMPLETION_SELECT)
        .in("tournament_bracket_id", bracketIds),
    "Generated tournament bracket authority could not be loaded."
  );
  return getAuthorityData(
    result,
    "Generated tournament bracket authority returned an invalid response."
  );
}

async function loadReadinessRows(
  supabase: TournamentDivisionStateDataClient
) {
  const result = await runAuthorityRequest(
    () => supabase.rpc("get_tournament_bracket_capacity"),
    "Tournament division readiness authority could not be loaded."
  );
  return getAuthorityData(
    result,
    "Tournament division readiness authority returned an invalid response."
  );
}

async function loadNotHeldRows(
  supabase: TournamentDivisionStateDataClient
) {
  const result = await runAuthorityRequest(
    () => supabase.rpc("get_tournament_division_not_held_states"),
    "Tournament division Not Held authority could not be loaded."
  );
  return getAuthorityData(
    result,
    "Tournament division Not Held authority returned an invalid response."
  );
}

function normalizeNotHeldRows(
  data: unknown,
  brackets: readonly NormalizedBracket[]
) {
  if (!Array.isArray(data)) {
    throw new TournamentDivisionStateDataError(
      "Tournament division Not Held authority returned an invalid response."
    );
  }

  const bracketById = new Map(brackets.map((bracket) => [bracket.id, bracket]));
  const notHeldByBracketId = new Map<string, NotHeldEvidence>();

  for (const value of data) {
    if (!isRecord(value)) {
      throw new TournamentDivisionStateDataError(
        "Tournament division Not Held authority returned malformed data."
      );
    }

    const bracketId = readNonEmptyString(value.tournament_bracket_id);
    const tournamentId = readNonEmptyString(value.tournament_id);
    const notHeldAt = readNullableTimestamp(value.not_held_at);
    const reasonCode = value.reason_code;

    if (
      bracketId === null ||
      tournamentId === null ||
      notHeldAt === null ||
      notHeldAt === undefined ||
      reasonCode !== "minimum_roster_not_reached"
    ) {
      throw new TournamentDivisionStateDataError(
        "Tournament division Not Held authority returned malformed data."
      );
    }

    const bracket = bracketById.get(bracketId);
    if (!bracket) {
      continue;
    }

    if (
      bracket.tournamentId !== tournamentId ||
      notHeldByBracketId.has(bracketId)
    ) {
      throw new TournamentDivisionStateDataError(
        "Tournament division Not Held authority returned malformed data."
      );
    }

    notHeldByBracketId.set(bracketId, {
      notHeldAt,
      reasonCode,
    });
  }

  return notHeldByBracketId;
}

function normalizeReadinessRows(
  data: unknown,
  brackets: readonly NormalizedBracket[]
) {
  const readinessByBracketId = new Map<string, ReadinessEvidence>();

  if (!Array.isArray(data)) {
    throw new TournamentDivisionStateDataError(
      "Tournament division readiness authority returned an invalid response."
    );
  }

  const bracketById = new Map(brackets.map((bracket) => [bracket.id, bracket]));

  for (const value of data) {
    if (!isRecord(value)) {
      throw new TournamentDivisionStateDataError(
        "Tournament division readiness authority returned malformed data."
      );
    }

    const bracketId = readNonEmptyString(value.bracket_id);
    const tournamentId = readNonEmptyString(value.tournament_id);

    if (bracketId === null || tournamentId === null) {
      throw new TournamentDivisionStateDataError(
        "Tournament division readiness authority returned malformed data."
      );
    }

    const bracket = bracketById.get(bracketId);
    if (!bracket) {
      continue;
    }

    const approvedCount = readNonNegativeInteger(value.registered_players);
    const activeCohortCount = readNonNegativeInteger(
      value.active_cohort_players
    );
    const requiredCount = readPositiveInteger(value.max_players);
    const launchedAt = readNullableTimestamp(value.launched_at);

    if (
      tournamentId !== bracket.tournamentId ||
      approvedCount === null ||
      activeCohortCount === null ||
      requiredCount === null ||
      launchedAt === undefined ||
      readinessByBracketId.has(bracketId)
    ) {
      throw new TournamentDivisionStateDataError(
        "Tournament division readiness authority returned malformed data."
      );
    }

    readinessByBracketId.set(bracketId, {
      approvedCount,
      requiredCount,
      isReady:
        approvedCount === requiredCount &&
        activeCohortCount === approvedCount,
      launchedAt,
    });
  }

  if (readinessByBracketId.size !== brackets.length) {
    throw new TournamentDivisionStateDataError(
      "Tournament division readiness authority returned an incomplete response."
    );
  }

  return readinessByBracketId;
}

function normalizeGeneratedBracketRows(
  data: unknown,
  bracketIds: readonly string[]
) {
  const generatedByBracketId = new Map<string, GeneratedBracketEvidence>();

  if (!Array.isArray(data)) {
    throw new TournamentDivisionStateDataError(
      "Generated tournament bracket authority returned an invalid response."
    );
  }

  const knownBracketIds = new Set(bracketIds);
  const generatedIds = new Set<string>();

  for (const value of data) {
    if (!isRecord(value)) {
      throw new TournamentDivisionStateDataError(
        "Generated tournament bracket authority returned malformed data."
      );
    }

    const id = readNonEmptyString(value.id);
    const tournamentBracketId = readNonEmptyString(
      value.tournament_bracket_id
    );

    if (id === null || tournamentBracketId === null) {
      throw new TournamentDivisionStateDataError(
        "Generated tournament bracket authority returned malformed data."
      );
    }

    if (!knownBracketIds.has(tournamentBracketId)) {
      continue;
    }

    const format = value.format;

    if (
      (format !== "single_elimination" && format !== "round_robin") ||
      generatedIds.has(id) ||
      generatedByBracketId.has(tournamentBracketId)
    ) {
      throw new TournamentDivisionStateDataError(
        "Generated tournament bracket authority returned malformed data."
      );
    }

    const rounds = normalizeGeneratedBracketRounds(value.bracket_rounds, id);

    generatedIds.add(id);
    generatedByBracketId.set(tournamentBracketId, {
      id,
      tournamentBracketId,
      format,
      rounds,
    });
  }

  return generatedByBracketId;
}

function normalizeGeneratedBracketRounds(
  value: unknown,
  generatedBracketId: string
) {
  if (!Array.isArray(value)) {
    throw new TournamentDivisionStateDataError(
      "Generated tournament bracket authority returned malformed data."
    );
  }

  const rounds: GeneratedBracketRoundEvidence[] = [];
  const roundNumbers = new Set<number>();
  const matchCoordinates = new Set<string>();
  const matchIds = new Set<string>();

  for (const rawRound of value) {
    if (!isRecord(rawRound) || !Array.isArray(rawRound.tournament_matches)) {
      throw new TournamentDivisionStateDataError(
        "Generated tournament bracket authority returned malformed data."
      );
    }

    const roundNumber = readPositiveInteger(rawRound.round_number);
    if (roundNumber === null || roundNumbers.has(roundNumber)) {
      throw new TournamentDivisionStateDataError(
        "Generated tournament bracket authority returned malformed data."
      );
    }

    roundNumbers.add(roundNumber);
    const matches: GeneratedBracketMatchEvidence[] = [];

    for (const rawMatch of rawRound.tournament_matches) {
      if (!isRecord(rawMatch)) {
        throw new TournamentDivisionStateDataError(
          "Generated tournament bracket authority returned malformed data."
        );
      }

      const matchId = readNonEmptyString(rawMatch.id);
      const matchGeneratedBracketId = readNonEmptyString(
        rawMatch.generated_bracket_id
      );
      const matchNumber = readPositiveInteger(rawMatch.match_number);
      const status = rawMatch.status;
      const winnerRegistrationId = readNullableNonEmptyString(
        rawMatch.winner_registration_id
      );
      const outcomeType = rawMatch.outcome_type;
      const coordinate = `${roundNumber}:${matchNumber}`;

      if (
        matchId === null ||
        matchGeneratedBracketId !== generatedBracketId ||
        matchNumber === null ||
        typeof status !== "string" ||
        !VALID_MATCH_STATUSES.has(
          status as GeneratedBracketMatchEvidence["status"]
        ) ||
        winnerRegistrationId === undefined ||
        (outcomeType !== null &&
          (typeof outcomeType !== "string" ||
            !VALID_MATCH_OUTCOME_TYPES.has(
              outcomeType as Exclude<
                GeneratedBracketMatchEvidence["outcomeType"],
                null
              >
            ))) ||
        matchCoordinates.has(coordinate) ||
        matchIds.has(matchId)
      ) {
        throw new TournamentDivisionStateDataError(
          "Generated tournament bracket authority returned malformed data."
        );
      }

      matchCoordinates.add(coordinate);
      matchIds.add(matchId);
      matches.push({
        matchNumber,
        status: status as GeneratedBracketMatchEvidence["status"],
        outcomeType: outcomeType as GeneratedBracketMatchEvidence["outcomeType"],
        winnerRegistrationId,
      });
    }

    rounds.push({ roundNumber, matches });
  }

  return rounds;
}

/**
 * Read-only presentation projection over the launched bracket's official match
 * facts. The lifecycle writer remains public.is_generated_bracket_complete;
 * source-contract and behavioral parity tests lock these exact rules to that
 * existing authority.
 */
function resolveOfficialMatchCompletion(generated: GeneratedBracketEvidence) {
  const matches = generated.rounds.flatMap((round) =>
    round.matches.map((match) => ({ ...match, roundNumber: round.roundNumber }))
  );

  if (generated.format === "round_robin") {
    return (
      matches.length > 0 &&
      matches.every(
        (match) =>
          match.status === "completed" &&
          match.winnerRegistrationId !== null
      )
    );
  }

  const finalMatch = matches.sort(
    (left, right) =>
      right.roundNumber - left.roundNumber ||
      right.matchNumber - left.matchNumber
  )[0];

  return Boolean(
    finalMatch &&
      finalMatch.status === "completed" &&
      (finalMatch.winnerRegistrationId !== null ||
        finalMatch.outcomeType === "deadline_double_forfeit" ||
        finalMatch.outcomeType === "empty_feeder")
  );
}

async function runAuthorityRequest(
  request: () => PromiseLike<unknown>,
  failureMessage: string
) {
  try {
    return await request();
  } catch {
    throw new TournamentDivisionStateDataError(failureMessage);
  }
}

function getAuthorityData(result: unknown, invalidMessage: string) {
  if (
    !isRecord(result) ||
    !("data" in result) ||
    !("error" in result)
  ) {
    throw new TournamentDivisionStateDataError(invalidMessage);
  }

  if (result.error !== null) {
    throw new TournamentDivisionStateDataError(
      invalidMessage.replace("returned an invalid response", "could not be loaded")
    );
  }

  return result.data;
}

function normalizeTournamentRows(
  values: readonly TournamentDivisionStateTournamentRow[]
) {
  if (!Array.isArray(values)) {
    throw new TournamentDivisionStateDataError(
      "Tournament division state input was invalid."
    );
  }

  const tournaments: NormalizedTournament[] = [];
  const tournamentIds = new Set<string>();
  const bracketIds = new Set<string>();

  for (const value of values as readonly unknown[]) {
    if (!isRecord(value)) {
      throw new TournamentDivisionStateDataError(
        "Tournament division state input contained malformed data."
      );
    }

    const id = readNonEmptyString(value.id);
    const status = value.status;
    const rawBrackets = value.tournament_brackets;

    if (
      id === null ||
      tournamentIds.has(id) ||
      typeof status !== "string" ||
      !VALID_TOURNAMENT_STATUSES.has(status as TournamentStatus) ||
      !Array.isArray(rawBrackets)
    ) {
      throw new TournamentDivisionStateDataError(
        "Tournament division state input contained malformed data."
      );
    }

    const canonicalNames = new Set<TournamentBracketName>();
    const brackets: NormalizedBracket[] = [];

    for (const rawBracket of rawBrackets) {
      if (!isRecord(rawBracket)) {
        throw new TournamentDivisionStateDataError(
          "Tournament division state input contained malformed bracket data."
        );
      }

      const bracketId = readNonEmptyString(rawBracket.id);
      const name = rawBracket.name;
      const launchedAt = readNullableTimestamp(rawBracket.launched_at);

      if (
        bracketId === null ||
        bracketIds.has(bracketId) ||
        typeof name !== "string" ||
        !CANONICAL_DIVISION_NAMES.has(name as TournamentBracketName) ||
        canonicalNames.has(name as TournamentBracketName) ||
        launchedAt === undefined
      ) {
        throw new TournamentDivisionStateDataError(
          "Tournament division state input contained malformed bracket data."
        );
      }

      bracketIds.add(bracketId);
      canonicalNames.add(name as TournamentBracketName);
      brackets.push({
        tournamentId: id,
        id: bracketId,
        canonicalName: name as TournamentBracketName,
        launchedAt,
      });
    }

    tournamentIds.add(id);
    tournaments.push({
      id,
      status: status as TournamentStatus,
      brackets,
    });
  }

  return tournaments;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNullableNonEmptyString(
  value: unknown
): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
