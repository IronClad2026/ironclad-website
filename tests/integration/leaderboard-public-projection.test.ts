import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { getPublicLeaderboardData } from "@/lib/leaderboard/public";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryCall = {
  args: unknown[];
  method: string;
};

function createQuery(result: QueryResult) {
  const calls: QueryCall[] = [];
  const query = {
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return query;
    },
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return query;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return query;
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(result);
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return query;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return query;
    },
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return { calls, query };
}

const currentSeason = {
  id: "season-1",
  name: "2026 Main/Pro Season 3",
  year: 2026,
  season_number: 3,
  start_date: "2026-07-01",
  end_date: "2026-12-31",
  is_active: true,
};

const seasonStanding = {
  season_id: "season-1",
  player_id: "player-1",
  display_name: "Public Player",
  in_game_name: "PublicCommander",
  country: "Australia",
  region: "Oceania",
  current_elo: 1500,
  has_avatar: true,
  bracket_type: "main",
  total_points: 12,
  tournaments_played: 2,
  rounds_passed: 4,
  tournament_wins: 1,
  matches_played: 5,
  matches_won: 4,
  matches_lost: 1,
  win_rate: 80,
  last_tournament_id: "tournament-1",
  last_tournament_title: "IronClad Open",
  last_tournament_points: 8,
  current_rank: 1,
  previous_rank: 2,
  rank_movement: 1,
  display_order: 1,
};

const allTimeStanding = {
  player_id: "player-1",
  display_name: "Public Player",
  in_game_name: "PublicCommander",
  country: "Australia",
  region: "Oceania",
  current_elo: 1500,
  has_avatar: true,
  bracket_type: "main",
  total_points: 24,
  tournaments_played: 4,
  rounds_passed: 8,
  tournament_wins: 2,
  matches_played: 10,
  matches_won: 8,
  matches_lost: 2,
  win_rate: 80,
  display_order: 1,
};

describe("public leaderboard projection", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("loads all three public views with their existing anonymous contracts", async () => {
    const queries = new Map<string, ReturnType<typeof createQuery>>();
    const results: Record<string, QueryResult> = {
      leaderboard_current_season: { data: currentSeason, error: null },
      leaderboard_public_season_standings: {
        data: [seasonStanding],
        error: null,
      },
      leaderboard_public_all_time_standings: {
        data: [allTimeStanding],
        error: null,
      },
      leaderboard_public_season_champions: { data: [], error: null },
    };
    fromMock.mockImplementation((table: string) => {
      const query = createQuery(results[table]);
      queries.set(table, query);
      return query.query;
    });

    const data = await getPublicLeaderboardData();
    const tables = fromMock.mock.calls.map(([table]) => table);

    expect(tables).toEqual(
      expect.arrayContaining([
        "leaderboard_current_season",
        "leaderboard_public_season_standings",
        "leaderboard_public_all_time_standings",
        "leaderboard_public_season_champions",
      ])
    );
    expect(tables).not.toContain("leaderboard_player_season_stats");
    expect(tables).not.toContain("leaderboard_player_all_time_stats");
    expect(
      queries
        .get("leaderboard_current_season")
        ?.calls.find((call) => call.method === "select")?.args[0]
    ).toBe(
      "id, name, year, season_number, start_date, end_date, is_active"
    );
    expect(
      queries.get("leaderboard_current_season")?.calls
    ).toContainEqual({
      method: "maybeSingle",
      args: [],
    });
    expect(
      queries.get("leaderboard_public_season_standings")?.calls
    ).toContainEqual({
      method: "eq",
      args: ["season_id", "season-1"],
    });
    expect(
      queries
        .get("leaderboard_public_season_standings")
        ?.calls.filter((call) => call.method === "order")
    ).toEqual([
      {
        method: "order",
        args: ["bracket_type", { ascending: true }],
      },
      {
        method: "order",
        args: ["current_rank", { ascending: true, nullsFirst: false }],
      },
    ]);
    expect(
      queries
        .get("leaderboard_public_all_time_standings")
        ?.calls.filter((call) => call.method === "order")
    ).toEqual([
      {
        method: "order",
        args: ["bracket_type", { ascending: true }],
      },
      {
        method: "order",
        args: ["total_points", { ascending: false }],
      },
      {
        method: "order",
        args: ["tournament_wins", { ascending: false }],
      },
      {
        method: "order",
        args: ["rounds_passed", { ascending: false }],
      },
      {
        method: "order",
        args: ["win_rate", { ascending: false }],
      },
      {
        method: "order",
        args: ["matches_won", { ascending: false }],
      },
    ]);
    expect(data.currentSeason).toMatchObject({
      id: "season-1",
      seasonNumber: 3,
      isActive: true,
    });
    expect(data.seasonStandings).toMatchObject([
      {
        scope: "season",
        playerId: "player-1",
        rank: 1,
        currentElo: 1500,
        avatarUrl: "/players/player-1/avatar",
      },
    ]);
    expect(data.allTimeStandings).toMatchObject([
      {
        scope: "all_time",
        playerId: "player-1",
        rank: 1,
        currentElo: 1500,
        avatarUrl: "/players/player-1/avatar",
      },
    ]);
    expect(data.errors).toEqual([]);
  });

  it("assigns competition ranks from the five competitive keys and keeps ties", async () => {
    const tiedZulu = {
      ...allTimeStanding,
      player_id: "player-zulu",
      display_name: "Zulu",
      in_game_name: "Zulu",
      total_points: 100,
      tournament_wins: 2,
      rounds_passed: 5,
      matches_played: 4,
      matches_won: 2,
      matches_lost: 2,
      win_rate: 50,
    };
    const tiedAlpha = {
      ...tiedZulu,
      player_id: "player-alpha",
      display_name: "Alpha",
      in_game_name: "Alpha",
    };
    const fewerRealWins = {
      ...tiedZulu,
      player_id: "player-third",
      display_name: "Third",
      in_game_name: "Third",
      matches_played: 2,
      matches_won: 1,
      matches_lost: 1,
    };
    const results: Record<string, QueryResult> = {
      leaderboard_current_season: { data: null, error: null },
      leaderboard_public_all_time_standings: {
        data: [tiedZulu, fewerRealWins, tiedAlpha],
        error: null,
      },
      leaderboard_public_season_champions: { data: [], error: null },
    };
    fromMock.mockImplementation((table: string) =>
      createQuery(results[table]).query
    );

    const data = await getPublicLeaderboardData();

    expect(
      data.allTimeStandings.map(({ playerId, rank }) => ({ playerId, rank }))
    ).toEqual([
      { playerId: "player-alpha", rank: 1 },
      { playerId: "player-zulu", rank: 1 },
      { playerId: "player-third", rank: 3 },
    ]);
    expect(data.errors).toEqual([]);
  });

  it("keeps closed official history public only through pseudonymous projections", async () => {
    const closedStanding = {
      ...seasonStanding,
      player_id: null,
      display_name: "Former Competitor",
      in_game_name: "Former Competitor",
      country: null,
      region: null,
      current_elo: null,
      has_avatar: false,
      last_tournament_id: null,
      current_rank: 1,
    };
    const results: Record<string, QueryResult> = {
      leaderboard_current_season: { data: currentSeason, error: null },
      leaderboard_public_season_standings: {
        data: [
          { ...closedStanding, display_order: 2 },
          { ...closedStanding, display_order: 1 },
        ],
        error: null,
      },
      leaderboard_public_all_time_standings: { data: [], error: null },
      leaderboard_public_season_champions: {
        data: [
          {
            id: "former-champion:opaque",
            season_id: "season-1",
            season_name: "2026 Season 2",
            player_id: null,
            player_name: "Former Competitor",
            country: null,
            has_avatar: false,
            bracket_type: "main",
            final_rank: 1,
            final_points: 12,
          },
        ],
        error: null,
      },
    };
    fromMock.mockImplementation((table: string) =>
      createQuery(results[table]).query
    );

    const data = await getPublicLeaderboardData();
    const tables = fromMock.mock.calls.map(([table]) => table);

    expect(tables).toContain("leaderboard_public_season_champions");
    expect(tables).not.toContain("leaderboard_season_champions");
    expect(tables).not.toContain("leaderboard_seasons");
    expect(tables).not.toContain("public_player_profiles");
    expect(tables).not.toContain("players");
    expect(data.seasonStandings).toHaveLength(2);
    expect(data.seasonStandings.map((standing) => standing.displayOrder)).toEqual([
      1, 2,
    ]);
    expect(data.seasonStandings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: null,
          playerName: "Former Competitor",
          avatarUrl: null,
          rank: 1,
        }),
      ])
    );
    expect(data.allTimeStandings).toEqual([]);
    expect(data.seasonChampions).toEqual([
      expect.objectContaining({
        id: "former-champion:opaque",
        seasonName: "2026 Season 2",
        playerId: null,
        playerName: "Former Competitor",
        avatarUrl: null,
      }),
    ]);
  });
});
