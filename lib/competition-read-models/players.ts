import "server-only";

import {
  COMPETITION_READ_LIMITS,
  COMPETITION_SCHEMA_VERSION,
  IRONCLAD_PUBLIC_ORIGIN,
  CompetitionReadError,
  readCompetitionRows,
  type CompetitionReadClient,
} from "@/lib/competition-read-models/shared";
import {
  loadTournamentCompetitionViews,
  type CompetitionMatch,
  type DivisionCompetitionView,
  type TournamentCompetitionView,
} from "@/lib/competition-read-models/tournaments";

type Identity = {
  id: string;
  relicProfileId: string | null;
  alias: string | null;
  publicProfileEnabled: boolean;
  accountClosedAt: string | null;
};

type HistoryCandidate = {
  id: string;
  tournamentId: string;
  registrationStatus: "approved" | "withdrawn";
  createdAt: string;
};

export type PlayerCompetitionRecord = {
  matchesPlayed: number;
  wins: number;
  losses: number;
};

export type PlayerTournamentCompetitionEntry = {
  registrationId: string;
  eventAlias: string;
  eventElo: number | null;
  registrationStatus: HistoryCandidate["registrationStatus"];
  tournament: Pick<
    TournamentCompetitionView,
    "id" | "slug" | "name" | "divisionModelVersion" | "status" | "publicUrl"
  >;
  division: Pick<
    DivisionCompetitionView,
    "id" | "canonicalName" | "displayName" | "effectiveState"
  >;
  generatedBracketId: string | null;
  divisionCompleted: boolean | null;
  matches: CompetitionMatch[];
  record: PlayerCompetitionRecord;
  placement: number | null;
  champion: boolean;
};

export type PlayerCompetitionHistoryView = {
  schemaVersion: typeof COMPETITION_SCHEMA_VERSION;
  relicProfileId: string;
  currentIdentity: {
    alias: string;
    profileUrl: string;
  };
  entries: PlayerTournamentCompetitionEntry[];
  /** Counts cover returned entries only; they are never a lifetime record. */
  aggregate: PlayerCompetitionRecord & {
    scope: "returned_entries";
    tournamentsEntered: number;
    titles: number;
  };
  /** Internal candidate pagination, not a public account-discovery contract. */
  coverage: {
    scope: "returned_entries";
    offset: number;
    limit: number;
    scannedCandidates: number;
    returnedEntries: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export type PlayerCompetitionLookup =
  | { outcome: "FOUND_VISIBLE"; player: PlayerCompetitionHistoryView }
  | { outcome: "HIDDEN" }
  | { outcome: "NOT_FOUND" };

export type PublicPlayerCompetitionLookup =
  | {
      outcome: "FOUND_VISIBLE";
      player: Omit<PlayerCompetitionHistoryView, "coverage">;
    }
  | { outcome: "NOT_FOUND" };

const IDENTITY_COLUMNS =
  "id,coh3_profile_id,in_game_name,display_name,public_profile_enabled,account_closed_at";
const CANDIDATE_COLUMNS = "id,tournament_id,registration_status,created_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Trusted internal read only. A known Relic ID does not authorize disclosure.
 * No provider lookup, identity inference, RPC, cache or reconciliation occurs.
 */
export async function loadPlayerCompetitionHistory(
  client: CompetitionReadClient,
  relicProfileId: string,
  options: { limit?: number; offset?: number; now?: number } = {},
): Promise<PlayerCompetitionLookup> {
  if (!isCanonicalRelicId(relicProfileId)) invalid();
  const limit = options.limit ?? COMPETITION_READ_LIMITS.history;
  const offset = options.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > COMPETITION_READ_LIMITS.history ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000
  ) {
    throw new CompetitionReadError("Invalid player history page.");
  }

  const { rows: initial } = await readCountedRows(
    client
      .from("players")
      .select(IDENTITY_COLUMNS, { count: "exact" })
      .eq("coh3_profile_id", relicProfileId)
      .limit(2),
    1,
    parseIdentity,
  );
  if (initial.length === 0) return { outcome: "NOT_FOUND" };
  const identity = initial[0];
  if (identity.relicProfileId !== relicProfileId) invalid();
  if (!isVisible(identity)) return { outcome: "HIDDEN" };
  if (!identity.alias) invalid();

  // One registration per event is a database invariant. A sentinel supplies
  // hasMore without loading or aggregating the player's complete history.
  const { rows: candidates, count: candidateCount } = await readCountedRows(
    client
      .from("registrations")
      .select(CANDIDATE_COLUMNS, { count: "exact" })
      .eq("profile_id", identity.id)
      .in("registration_status", ["approved", "withdrawn"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit)
      .limit(limit + 1),
    limit + 1,
    parseCandidate,
    offset,
  );
  const page = candidates.slice(0, limit);
  if (
    new Set(page.map((row) => row.id)).size !== page.length ||
    new Set(page.map((row) => row.tournamentId)).size !== page.length
  )
    invalid();

  const tournaments = await loadTournamentCompetitionViews(
    client,
    page.map((row) => row.tournamentId),
    { now: options.now },
  );
  const byId = new Map(tournaments.map((row) => [row.id, row]));
  if (byId.size !== tournaments.length) invalid();
  const entries = page.flatMap((candidate) => {
    const tournament = byId.get(candidate.tournamentId);
    if (!tournament) invalid();
    const entry = buildEntry(candidate, tournament);
    return entry ? [entry] : [];
  });

  // Multi-query reads are not a transaction. Recheck the current canonical
  // binding and visibility before returning any account correlation/history.
  const { rows: current } = await readCountedRows(
    client
      .from("players")
      .select(IDENTITY_COLUMNS, { count: "exact" })
      .eq("id", identity.id)
      .limit(2),
    1,
    parseIdentity,
  );
  if (current.length === 0) return { outcome: "NOT_FOUND" };
  if (current[0].id !== identity.id) invalid();
  if (current[0].relicProfileId !== relicProfileId || !isVisible(current[0])) {
    return { outcome: "HIDDEN" };
  }
  if (!current[0].alias) invalid();

  const hasMore = offset + page.length < candidateCount;
  return {
    outcome: "FOUND_VISIBLE",
    player: {
      schemaVersion: COMPETITION_SCHEMA_VERSION,
      relicProfileId,
      currentIdentity: {
        alias: current[0].alias,
        profileUrl: `${IRONCLAD_PUBLIC_ORIGIN}/players/${identity.id}`,
      },
      entries,
      aggregate: {
        scope: "returned_entries",
        tournamentsEntered: entries.length,
        matchesPlayed: entries.reduce(
          (total, entry) => total + entry.record.matchesPlayed,
          0,
        ),
        wins: entries.reduce((total, entry) => total + entry.record.wins, 0),
        losses: entries.reduce(
          (total, entry) => total + entry.record.losses,
          0,
        ),
        titles: entries.filter((entry) => entry.champion).length,
      },
      coverage: {
        scope: "returned_entries",
        offset,
        limit,
        scannedCandidates: page.length,
        returnedEntries: entries.length,
        hasMore,
        nextOffset: hasMore ? offset + page.length : null,
      },
    },
  };
}

/** Privacy collapse and public allow-list only. No endpoint or pagination API. */
export function projectPublicPlayerCompetitionLookup(
  result: PlayerCompetitionLookup,
): PublicPlayerCompetitionLookup {
  if (result.outcome !== "FOUND_VISIBLE") return { outcome: "NOT_FOUND" };
  const { schemaVersion, relicProfileId, currentIdentity, entries, aggregate } =
    result.player;
  return {
    outcome: "FOUND_VISIBLE",
    player: {
      schemaVersion,
      relicProfileId,
      currentIdentity,
      entries,
      aggregate,
    },
  };
}

function buildEntry(
  candidate: HistoryCandidate,
  tournament: TournamentCompetitionView,
): PlayerTournamentCompetitionEntry | null {
  const divisions = tournament.divisions.filter((division) =>
    division.participants.some((row) => row.registrationId === candidate.id),
  );
  if (divisions.length > 1) invalid();
  if (divisions.length === 0) {
    if (candidate.registrationStatus === "withdrawn") return null;
    invalid();
  }
  const division = divisions[0];
  const participants = division.participants.filter(
    (row) => row.registrationId === candidate.id,
  );
  if (participants.length !== 1) invalid();
  const participant = participants[0];
  if (
    participant.registrationStatus !== "approved" &&
    participant.registrationStatus !== "withdrawn"
  ) {
    return null;
  }
  const matches = (division.bracket?.matches ?? []).filter(
    (match) =>
      match.playerOneRegistrationId === candidate.id ||
      match.playerTwoRegistrationId === candidate.id,
  );
  const placement = division.bracket?.placements.find(
    (row) => row.registrationId === candidate.id,
  );
  if (
    participant.registrationStatus === "withdrawn" &&
    matches.length === 0 &&
    !placement
  ) {
    return null;
  }
  const played = matches.filter((match) => match.completed && match.played);
  const wins = played.filter(
    (match) => match.winnerRegistrationId === candidate.id,
  ).length;

  return {
    registrationId: candidate.id,
    eventAlias: participant.eventAlias,
    eventElo: participant.eventElo,
    registrationStatus: participant.registrationStatus,
    tournament: {
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      divisionModelVersion: tournament.divisionModelVersion,
      status: tournament.status,
      publicUrl: tournament.publicUrl,
    },
    division: {
      id: division.id,
      canonicalName: division.canonicalName,
      displayName: division.displayName,
      effectiveState: division.effectiveState,
    },
    generatedBracketId: division.bracket?.id ?? null,
    divisionCompleted: division.bracket?.completed ?? null,
    matches,
    record: {
      matchesPlayed: played.length,
      wins,
      losses: played.length - wins,
    },
    placement: placement?.rank ?? null,
    champion: division.bracket?.championRegistrationId === candidate.id,
  };
}

function isVisible(identity: Identity) {
  return identity.publicProfileEnabled && identity.accountClosedAt === null;
}

function parseIdentity(value: unknown): Identity {
  const row = record(value);
  const relicProfileId = row.coh3_profile_id;
  if (relicProfileId !== null && !isCanonicalRelicId(relicProfileId)) invalid();
  if (typeof row.public_profile_enabled !== "boolean") invalid();
  const alias =
    nullableString(row.in_game_name)?.trim() ||
    nullableString(row.display_name)?.trim() ||
    null;
  return {
    id: uuid(row.id),
    relicProfileId,
    alias,
    publicProfileEnabled: row.public_profile_enabled,
    accountClosedAt: nullableTimestamp(row.account_closed_at),
  };
}

function parseCandidate(value: unknown): HistoryCandidate {
  const row = record(value);
  if (
    row.registration_status !== "approved" &&
    row.registration_status !== "withdrawn"
  )
    invalid();
  const createdAt = nullableTimestamp(row.created_at);
  if (createdAt === null) invalid();
  return {
    id: uuid(row.id),
    tournamentId: uuid(row.tournament_id),
    registrationStatus: row.registration_status,
    createdAt,
  };
}

function isCanonicalRelicId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}

function uuid(value: unknown): string {
  const result = string(value);
  if (!UUID_PATTERN.test(result)) invalid();
  return result;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}

/** Verify exact counts so a lower server row cap cannot silently truncate reads. */
async function readCountedRows<T>(
  request: PromiseLike<{
    data: unknown;
    error: unknown;
    count?: number | null;
  }>,
  maxRows: number,
  parse: (row: unknown) => T,
  offset?: number,
): Promise<{ rows: T[]; count: number }> {
  let result: { data: unknown; error: unknown; count?: number | null };
  try {
    result = await request;
  } catch {
    throw new CompetitionReadError(
      "Competition data is unavailable.",
      "QUERY_FAILED",
    );
  }
  const rows = await readCompetitionRows(
    Promise.resolve(result),
    maxRows,
    parse,
  );
  const count = result.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
    invalid();
  if (offset === undefined && count > maxRows) {
    throw new CompetitionReadError(
      "Competition read limit exceeded.",
      "LIMIT_EXCEEDED",
    );
  }
  if (rows.length !== Math.min(maxRows, Math.max(0, count - (offset ?? 0))))
    invalid();
  return { rows, count };
}

function invalid(): never {
  throw new CompetitionReadError("Invalid player competition data.");
}
