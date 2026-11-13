import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompetitionReadClient } from "@/lib/competition-read-models/shared";
import { CompetitionReadError } from "@/lib/competition-read-models/shared";
import type {
  CompetitionMatch,
  TournamentCompetitionView,
} from "@/lib/competition-read-models/tournaments";

const loadTournaments = vi.hoisted(() => vi.fn());
vi.mock("@/lib/competition-read-models/tournaments", () => ({
  loadTournamentCompetitionViews: loadTournaments,
}));

import {
  loadPlayerCompetitionHistory,
  projectPublicPlayerCompetitionLookup,
  type PlayerCompetitionLookup,
} from "@/lib/competition-read-models/players";

const PLAYER_ID = id(1);
const RELIC_ID = "12345678901234567890";
const DATE = "2026-10-27T00:00:00.000Z";

function id(number: number) {
  return `${number.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    coh3_profile_id: RELIC_ID,
    in_game_name: "Current Public Alias",
    display_name: "Public Display Name",
    public_profile_enabled: true,
    account_closed_at: null,
    ...overrides,
  };
}

function candidate(number = 2, overrides: Record<string, unknown> = {}) {
  return {
    id: id(number),
    tournament_id: id(number + 100),
    registration_status: "approved",
    created_at: DATE,
    ...overrides,
  };
}

function tournament(number = 2): TournamentCompetitionView {
  return {
    schemaVersion: "ironclad.competition.v1",
    id: id(number + 100),
    slug: `event-${number}`,
    name: `Event ${number}`,
    divisionModelVersion: "four_division_v1",
    status: "completed",
    format: "1v1",
    game: "Company of Heroes 3",
    publicUrl: `https://www.ironcladtournaments.com/tournaments?tournament=event-${number}`,
    approvedPlayers: 8,
    registration: {
      enabled: false,
      open: false,
      opensAt: null,
      closesAt: null,
      availability: "disabled",
    },
    startDate: null,
    endDate: null,
    firstCompletedAt: DATE,
    divisions: [
      {
        id: id(number + 200),
        canonicalName: "Pro",
        displayName: "Pro",
        state: "completed",
        effectiveState: "completed",
        approvedCount: 8,
        capacity: 8,
        ready: false,
        capacityReached: true,
        bracketGenerated: true,
        bracketPublished: true,
        launchedAt: DATE,
        registrationOpen: false,
        eloRule: "1700+",
        eloRange: {
          min: 1700,
          minInclusive: true,
          max: null,
          maxInclusive: true,
        },
        participants: [
          {
            registrationId: id(number),
            eventAlias: "Historical Event Alias",
            eventElo: 1750,
            registrationStatus: "approved",
            profileUrl: `https://www.ironcladtournaments.com/players/${PLAYER_ID}`,
            relicProfileId: RELIC_ID,
          },
        ],
        bracket: {
          id: id(number + 300),
          format: "single_elimination",
          completed: true,
          matches: [match(number)],
          placements: [],
          championRegistrationId: id(number),
        },
      },
    ],
  };
}

function match(
  number = 2,
  overrides: Partial<CompetitionMatch> = {},
): CompetitionMatch {
  return {
    id: id(number + 400),
    roundNumber: 1,
    roundName: "Final",
    matchNumber: 1,
    bestOf: 3,
    status: "completed",
    outcomeType: null,
    playerOneRegistrationId: id(number),
    playerTwoRegistrationId: id(900),
    playerOneScore: 2,
    playerTwoScore: 0,
    winnerRegistrationId: id(number),
    completed: true,
    played: true,
    decidedAt: DATE,
    ...overrides,
  };
}

type Call = {
  table: string;
  columns?: string;
  equalities: [string, unknown][];
  memberships: [string, unknown[]][];
  orders: [string, unknown][];
  range?: [number, number];
  limit?: number;
  exactCount?: boolean;
};

function database(
  options: {
    players?: unknown[];
    current?: unknown[];
    registrations?: unknown[];
    errorTable?: string;
    throwTable?: string;
    ignoreFilters?: boolean;
    reportedCount?: number | null;
    rowCap?: number;
    errorOnRecheck?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, equalities: [], memberships: [], orders: [] };
    calls.push(call);
    const query = {
      select(columns: string, options?: { count?: string }) {
        call.columns = columns;
        call.exactCount = options?.count === "exact";
        return query;
      },
      eq(column: string, value: unknown) {
        call.equalities.push([column, value]);
        return query;
      },
      in(column: string, values: unknown[]) {
        call.memberships.push([column, values]);
        return query;
      },
      order(column: string, order: unknown) {
        call.orders.push([column, order]);
        return query;
      },
      range(from: number, to: number) {
        call.range = [from, to];
        return query;
      },
      limit(limit: number) {
        call.limit = limit;
        return query;
      },
      then(
        resolve: (value: {
          data: unknown;
          error: unknown;
          count?: number | null;
        }) => unknown,
        reject: (reason: unknown) => unknown,
      ) {
        if (options.throwTable === table)
          return Promise.reject(new Error("private provider details")).then(
            resolve,
            reject,
          );
        if (
          options.errorTable === table ||
          (options.errorOnRecheck &&
            call.equalities.some(([column]) => column === "id"))
        )
          return Promise.resolve({
            data: null,
            error: { message: "private provider details" },
          }).then(resolve, reject);
        let rows = (
          table === "players"
            ? call.equalities.some(([column]) => column === "id")
              ? (options.current ?? options.players ?? [identity()])
              : (options.players ?? [identity()])
            : (options.registrations ?? [candidate()])
        ) as Record<string, unknown>[];
        if (!options.ignoreFilters) {
          rows = rows.filter(
            (row) =>
              call.equalities.every(
                ([column, value]) =>
                  column === "profile_id" || row[column] === value,
              ) &&
              call.memberships.every(([column, values]) =>
                values.includes(row[column]),
              ),
          );
        }
        const count =
          options.reportedCount === undefined
            ? rows.length
            : options.reportedCount;
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        if (call.limit !== undefined) rows = rows.slice(0, call.limit);
        if (options.rowCap !== undefined) rows = rows.slice(0, options.rowCap);
        return Promise.resolve({ data: rows, error: null, count }).then(
          resolve,
          reject,
        );
      },
    };
    return query;
  });
  return { client: { from } as unknown as CompetitionReadClient, calls };
}

function visible(result: PlayerCompetitionLookup) {
  expect(result.outcome).toBe("FOUND_VISIBLE");
  if (result.outcome !== "FOUND_VISIBLE")
    throw new Error("Expected visible fixture");
  return result.player;
}

describe("Relic-keyed player competition read model", () => {
  beforeEach(() => {
    loadTournaments.mockResolvedValue([tournament()]);
  });

  it("resolves the exact canonical text ID and keeps current alias distinct from event snapshots", async () => {
    const fixture = database();
    const player = visible(
      await loadPlayerCompetitionHistory(fixture.client, RELIC_ID),
    );
    expect(player.relicProfileId).toBe(RELIC_ID);
    expect(player.currentIdentity).toEqual({
      alias: "Current Public Alias",
      profileUrl: `https://www.ironcladtournaments.com/players/${PLAYER_ID}`,
    });
    expect(player.entries[0]).toMatchObject({
      eventAlias: "Historical Event Alias",
      eventElo: 1750,
      champion: true,
      placement: null,
      record: { matchesPlayed: 1, wins: 1, losses: 0 },
    });
    expect(fixture.calls[0].equalities).toEqual([
      ["coh3_profile_id", RELIC_ID],
    ]);
    expect(fixture.calls.at(-1)?.equalities).toEqual([["id", PLAYER_ID]]);
    expect(fixture.calls).toHaveLength(3);
  });

  it.each(["", "0", "01", " 12", "+12", "1.2", "1e3", 123, null])(
    "rejects noncanonical Relic lookup %s before any query",
    async (value) => {
      const fixture = database();
      await expect(
        loadPlayerCompetitionHistory(fixture.client, value as string),
      ).rejects.toBeInstanceOf(CompetitionReadError);
      expect(fixture.calls).toHaveLength(0);
      expect(loadTournaments).not.toHaveBeenCalled();
    },
  );

  it.each([
    { players: [], outcome: "NOT_FOUND" },
    { players: [identity({ coh3_profile_id: null })], outcome: "NOT_FOUND" },
    { players: [identity({ account_closed_at: DATE })], outcome: "HIDDEN" },
    {
      players: [
        identity({
          account_closed_at: DATE,
          in_game_name: null,
          display_name: null,
        }),
      ],
      outcome: "HIDDEN",
    },
  ])(
    "does not query history for unavailable identity: $outcome",
    async ({ players, outcome }) => {
      const fixture = database({ players });
      expect(
        await loadPlayerCompetitionHistory(fixture.client, RELIC_ID),
      ).toEqual({ outcome });
      expect(fixture.calls).toHaveLength(1);
      expect(loadTournaments).not.toHaveBeenCalled();
    },
  );

  it.each([false, true, null, undefined])(
    "resolves active canonical identity independently of legacy profile flag %s",
    async (publicProfileEnabled) => {
      const fixture = database({
        players: [identity({ public_profile_enabled: publicProfileEnabled })],
        current: [identity({ public_profile_enabled: false })],
      });
      const player = visible(
        await loadPlayerCompetitionHistory(fixture.client, RELIC_ID),
      );
      expect(player.currentIdentity.profileUrl).toBe(
        `https://www.ironcladtournaments.com/players/${PLAYER_ID}`,
      );
      expect(player.entries[0].eventElo).toBe(1750);
      expect(
        fixture.calls.every(
          (call) => !call.columns?.includes("public_profile_enabled"),
        ),
      ).toBe(true);
    },
  );

  it("makes hidden and unknown externally indistinguishable", () => {
    expect(projectPublicPlayerCompetitionLookup({ outcome: "HIDDEN" })).toEqual(
      { outcome: "NOT_FOUND" },
    );
    expect(
      projectPublicPlayerCompetitionLookup({ outcome: "NOT_FOUND" }),
    ).toEqual({ outcome: "NOT_FOUND" });
  });

  it.each([
    { current: [] },
    { current: [identity({ account_closed_at: DATE, coh3_profile_id: null })] },
    { current: [identity({ coh3_profile_id: "999" })] },
    {
      current: [
        identity({
          account_closed_at: DATE,
          coh3_profile_id: null,
          in_game_name: null,
          display_name: null,
        }),
      ],
    },
  ])(
    "rechecks closure and binding after history reads and exposes no details on change",
    async ({ current }) => {
      const result = await loadPlayerCompetitionHistory(
        database({ current }).client,
        RELIC_ID,
      );
      expect(projectPublicPlayerCompetitionLookup(result)).toEqual({
        outcome: "NOT_FOUND",
      });
      expect(result).not.toHaveProperty("player");
    },
  );

  it("uses the latest public alias after the final privacy recheck", async () => {
    const player = visible(
      await loadPlayerCompetitionHistory(
        database({ current: [identity({ in_game_name: "New Alias" })] }).client,
        RELIC_ID,
      ),
    );
    expect(player.currentIdentity.alias).toBe("New Alias");
    expect(player.entries[0].eventAlias).toBe("Historical Event Alias");
  });

  it.each(["players", "registrations"])(
    "throws a sanitized error for failed %s queries",
    async (table) => {
      const result = loadPlayerCompetitionHistory(
        database({ errorTable: table }).client,
        RELIC_ID,
      );
      await expect(result).rejects.toMatchObject({
        code: "QUERY_FAILED",
        message: "Competition data is unavailable.",
      });
    },
  );

  it("does not convert rejected provider promises to not-found", async () => {
    await expect(
      loadPlayerCompetitionHistory(
        database({ throwTable: "players" }).client,
        RELIC_ID,
      ),
    ).rejects.toMatchObject({ code: "QUERY_FAILED" });
  });

  it("does not return history if the final privacy recheck fails", async () => {
    await expect(
      loadPlayerCompetitionHistory(
        database({ errorOnRecheck: true }).client,
        RELIC_ID,
      ),
    ).rejects.toMatchObject({ code: "QUERY_FAILED" });
  });

  it("fails closed for duplicate canonical owners", async () => {
    await expect(
      loadPlayerCompetitionHistory(
        database({ players: [identity(), identity({ id: id(99) })] }).client,
        RELIC_ID,
      ),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it.each([null, -1, 1.5, 2])(
    "fails closed for missing or inconsistent exact counts %s",
    async (reportedCount) => {
      await expect(
        loadPlayerCompetitionHistory(
          database({ reportedCount }).client,
          RELIC_ID,
        ),
      ).rejects.toBeInstanceOf(CompetitionReadError);
    },
  );

  it("fails closed when a server row cap silently truncates a candidate page", async () => {
    await expect(
      loadPlayerCompetitionHistory(
        database({ registrations: [candidate(), candidate(3)], rowCap: 1 })
          .client,
        RELIC_ID,
      ),
    ).rejects.toBeInstanceOf(CompetitionReadError);
    expect(loadTournaments).not.toHaveBeenCalled();
  });

  it.each([
    identity({ coh3_profile_id: "01" }),
    identity({ account_closed_at: "invalid" }),
    identity({ id: "invalid" }),
  ])("fails closed for malformed identity rows", async (row) => {
    await expect(
      loadPlayerCompetitionHistory(
        database({ players: [row], ignoreFilters: true }).client,
        RELIC_ID,
      ),
    ).rejects.toBeInstanceOf(CompetitionReadError);
  });

  it("queries only approved/withdrawn candidates and never returns pending/rejected/waitlist records", async () => {
    const fixture = database({
      registrations: [
        candidate(),
        candidate(3, { registration_status: "pending" }),
        candidate(4, { registration_status: "rejected" }),
        candidate(5, { registration_status: "waitlisted" }),
      ],
    });
    const player = visible(
      await loadPlayerCompetitionHistory(fixture.client, RELIC_ID),
    );
    expect(player.entries).toHaveLength(1);
    expect(fixture.calls[1].memberships).toEqual([
      ["registration_status", ["approved", "withdrawn"]],
    ]);
    expect(fixture.calls[1].equalities).toEqual([["profile_id", PLAYER_ID]]);
  });

  it("excludes withdrawn registrations without a published match or placement", async () => {
    const view = tournament();
    view.divisions[0].participants[0].registrationStatus = "withdrawn";
    view.divisions[0].bracket = null;
    loadTournaments.mockResolvedValue([view]);
    const player = visible(
      await loadPlayerCompetitionHistory(
        database({
          registrations: [candidate(2, { registration_status: "withdrawn" })],
        }).client,
        RELIC_ID,
      ),
    );
    expect(player.entries).toEqual([]);
    expect(player.coverage).toMatchObject({
      scannedCandidates: 1,
      returnedEntries: 0,
    });
    expect(player.aggregate.tournamentsEntered).toBe(0);
  });

  it("preserves a withdrawn published standing even when no match is present", async () => {
    const view = tournament();
    view.divisions[0].participants[0].registrationStatus = "withdrawn";
    view.divisions[0].bracket!.matches = [];
    view.divisions[0].bracket!.placements = [
      { registrationId: id(2), rank: 3, wins: 0, losses: 0, points: 0 },
    ];
    loadTournaments.mockResolvedValue([view]);
    const player = visible(
      await loadPlayerCompetitionHistory(
        database({
          registrations: [candidate(2, { registration_status: "withdrawn" })],
        }).client,
        RELIC_ID,
      ),
    );
    expect(player.entries[0]).toMatchObject({
      placement: 3,
      registrationStatus: "withdrawn",
      record: { matchesPlayed: 0, wins: 0, losses: 0 },
    });
  });

  it("omits an entry whose latest public view no longer has an eligible status", async () => {
    const view = tournament();
    view.divisions[0].participants[0].registrationStatus = "pending";
    loadTournaments.mockResolvedValue([view]);
    expect(
      visible(await loadPlayerCompetitionHistory(database().client, RELIC_ID))
        .entries,
    ).toEqual([]);
  });

  it("returns an opted-in bound player with empty history without inventing a lifetime record", async () => {
    loadTournaments.mockResolvedValue([]);
    const player = visible(
      await loadPlayerCompetitionHistory(
        database({ registrations: [] }).client,
        RELIC_ID,
      ),
    );
    expect(player.entries).toEqual([]);
    expect(player.aggregate).toEqual({
      scope: "returned_entries",
      tournamentsEntered: 0,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      titles: 0,
    });
    expect(player.coverage).toMatchObject({
      hasMore: false,
      scannedCandidates: 0,
      nextOffset: null,
    });
  });

  it("retains a withdrawn competitor referenced by published historical matches", async () => {
    const view = tournament();
    view.divisions[0].participants[0].registrationStatus = "withdrawn";
    view.divisionModelVersion = "legacy_three_v1";
    view.divisions[0].canonicalName = "Main";
    view.divisions[0].displayName = "Main / Pro";
    loadTournaments.mockResolvedValue([view]);
    const player = visible(
      await loadPlayerCompetitionHistory(
        database({
          registrations: [candidate(2, { registration_status: "withdrawn" })],
        }).client,
        RELIC_ID,
      ),
    );
    expect(player.entries[0]).toMatchObject({
      registrationStatus: "withdrawn",
      tournament: { divisionModelVersion: "legacy_three_v1" },
      division: { canonicalName: "Main", displayName: "Main / Pro" },
    });
  });

  it("returns approved public roster entries before launch without inventing matches or placement", async () => {
    const view = tournament();
    view.status = "registration_open";
    view.divisions[0].bracket = null;
    loadTournaments.mockResolvedValue([view]);
    const entry = visible(
      await loadPlayerCompetitionHistory(database().client, RELIC_ID),
    ).entries[0];
    expect(entry).toMatchObject({
      matches: [],
      placement: null,
      champion: false,
      divisionCompleted: null,
      record: { matchesPlayed: 0, wins: 0, losses: 0 },
    });
  });

  it("counts only the tournament view's factual played matches, excluding byes/no-show/admin advancement", async () => {
    const view = tournament();
    view.divisions[0].bracket!.matches = [
      match(),
      match(2, { id: id(403), played: false, outcomeType: "automatic_bye" }),
      match(2, { id: id(404), played: false }),
      match(2, { id: id(405), played: true, winnerRegistrationId: id(900) }),
      match(2, {
        id: id(406),
        status: "pending_review",
        completed: false,
        played: false,
        winnerRegistrationId: null,
      }),
    ];
    loadTournaments.mockResolvedValue([view]);
    const player = visible(
      await loadPlayerCompetitionHistory(database().client, RELIC_ID),
    );
    expect(player.entries[0].matches).toHaveLength(5);
    expect(player.aggregate).toMatchObject({
      scope: "returned_entries",
      matchesPlayed: 2,
      wins: 1,
      losses: 1,
    });
  });

  it("retains authoritative stored placement and completion state", async () => {
    const view = tournament();
    view.divisions[0].bracket!.placements = [
      { registrationId: id(2), rank: 2, wins: 1, losses: 1, points: 4 },
    ];
    view.divisions[0].bracket!.championRegistrationId = id(900);
    loadTournaments.mockResolvedValue([view]);
    expect(
      visible(await loadPlayerCompetitionHistory(database().client, RELIC_ID))
        .entries[0],
    ).toMatchObject({ placement: 2, divisionCompleted: true, champion: false });
  });

  it("uses one bounded batch and page-scoped aggregates with deterministic pagination", async () => {
    const registrations = Array.from({ length: 11 }, (_, index) =>
      candidate(index + 2),
    );
    loadTournaments.mockResolvedValue(
      registrations.slice(0, 10).map((_, index) => tournament(index + 2)),
    );
    const fixture = database({ registrations });
    const player = visible(
      await loadPlayerCompetitionHistory(fixture.client, RELIC_ID),
    );
    expect(loadTournaments).toHaveBeenCalledOnce();
    expect(loadTournaments).toHaveBeenCalledWith(
      fixture.client,
      registrations.slice(0, 10).map((row) => row.tournament_id),
      { now: undefined },
    );
    expect(fixture.calls[1]).toMatchObject({
      orders: [
        ["created_at", { ascending: false }],
        ["id", { ascending: false }],
      ],
      range: [0, 10],
      limit: 11,
    });
    expect(player.coverage).toEqual({
      scope: "returned_entries",
      offset: 0,
      limit: 10,
      scannedCandidates: 10,
      returnedEntries: 10,
      hasMore: true,
      nextOffset: 10,
    });
    expect(player.aggregate).toMatchObject({
      scope: "returned_entries",
      tournamentsEntered: 10,
      matchesPlayed: 10,
      titles: 10,
    });
  });

  it("advances offset by the bounded scanned candidate page", async () => {
    loadTournaments.mockResolvedValue([tournament(3)]);
    const fixture = database({
      registrations: [candidate(2), candidate(3), candidate(4)],
    });
    const player = visible(
      await loadPlayerCompetitionHistory(fixture.client, RELIC_ID, {
        offset: 1,
        limit: 1,
      }),
    );
    expect(player.coverage).toMatchObject({
      offset: 1,
      limit: 1,
      scannedCandidates: 1,
      hasMore: true,
      nextOffset: 2,
    });
    expect(player.entries[0].registrationId).toBe(id(3));
  });

  it("keeps candidate pagination moving when a returned page is filtered to no public history", async () => {
    const view = tournament();
    view.divisions[0].participants = [];
    view.divisions[0].bracket = null;
    loadTournaments.mockResolvedValue([view]);
    const fixture = database({
      registrations: [
        candidate(2, { registration_status: "withdrawn" }),
        candidate(3),
      ],
    });
    const player = visible(
      await loadPlayerCompetitionHistory(fixture.client, RELIC_ID, {
        limit: 1,
      }),
    );
    expect(player.coverage).toMatchObject({
      scannedCandidates: 1,
      returnedEntries: 0,
      hasMore: true,
      nextOffset: 1,
    });
    expect(player.aggregate.tournamentsEntered).toBe(0);
  });

  it.each([
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 10001 },
    { offset: NaN },
  ])("rejects unbounded page input %o", async (options) => {
    const fixture = database();
    await expect(
      loadPlayerCompetitionHistory(fixture.client, RELIC_ID, options),
    ).rejects.toBeInstanceOf(CompetitionReadError);
    expect(fixture.calls).toHaveLength(0);
  });

  it("never selects or serializes private identity/evidence fields", async () => {
    const fixture = database();
    const result = await loadPlayerCompetitionHistory(fixture.client, RELIC_ID);
    const selected = fixture.calls.map((call) => call.columns).join(",");
    expect(selected).not.toMatch(
      /clerk|steam|email|discord|legal|proof|replay|notes/i,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /clerk|steam|email|discord|legal|proof|replay|notes|profile_id/,
    );
    expect(projectPublicPlayerCompetitionLookup(result)).toMatchObject({
      outcome: "FOUND_VISIBLE",
      player: { relicProfileId: RELIC_ID },
    });
    expect(projectPublicPlayerCompetitionLookup(result)).not.toHaveProperty(
      "player.coverage",
    );
  });
});
