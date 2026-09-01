import { describe, expect, it, vi } from "vitest";

const createBadgeUnlockedNotificationMock = vi.hoisted(() =>
  vi.fn(async () => true)
);
const reconcileBadgeUnlockedNotificationsForPlayerMock = vi.hoisted(() =>
  vi.fn(async () => undefined)
);

vi.mock("@/lib/badge-notifications", () => ({
  createBadgeUnlockedNotification: createBadgeUnlockedNotificationMock,
  reconcileBadgeUnlockedNotificationsForPlayer:
    reconcileBadgeUnlockedNotificationsForPlayerMock,
}));
import {
  PRODUCTION_BADGE_AUTHORITY_SLUGS,
  backfillInitialBadgeAwards,
  evaluateAllBadgeAwardsForPlayer,
  evaluateMatchBadgeAwardsForMatch,
  evaluateMatchExcellenceBadgeAwardsForPlayer,
  evaluateMatchBadgeAwardsForPlayer,
  evaluateProfileBadgeAwards,
  evaluateSeasonBadgeAwardsForPlayer,
  evaluateSeasonBadgeAwardsForSeason,
  evaluateSeasonBadgeAwardsForTournament,
  evaluateTournamentBadgeAwardsForMatch,
  evaluateTournamentBadgeAwardsForPlayer,
  evaluateTournamentBadgeAwardsForTournament,
  evaluateTournamentPrestigeBadgeAwardsForPlayer,
} from "@/lib/badges/authority";

type BadgeAuthorityClient = NonNullable<
  Parameters<typeof evaluateProfileBadgeAwards>[0]["supabase"]
>;

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const FIRST_MATCH_ID = "33333333-3333-4333-8333-333333333333";
const TENTH_MATCH_ID = "44444444-4444-4444-8444-444444444444";
const FIRST_WIN_ID = "55555555-5555-4555-8555-555555555555";
const FIFTH_WIN_ID = "66666666-6666-4666-8666-666666666666";
const TENTH_WIN_ID = "77777777-7777-4777-8777-777777777777";
const TWENTY_FIFTH_WIN_ID = "88888888-8888-4888-8888-888888888888";
const THIRD_STREAK_MATCH_ID = "24242424-2424-4242-8242-242424242424";
const FIFTH_STREAK_MATCH_ID = "25252525-2525-4252-8252-252525252525";
const CLEAN_SWEEP_MATCH_ID = "16161616-1616-4161-8161-161616161616";
const FIRST_UPSET_MATCH_ID = "18181818-1818-4181-8181-181818181818";
const THIRD_UPSET_MATCH_ID = "19191919-1919-4191-8191-191919191919";
const FIRST_TOURNAMENT_ID = "99999999-9999-4999-8999-999999999999";
const HIGHER_BRACKET_TOURNAMENT_ID =
  "abababab-abab-4aba-8aba-abababababab";
const THIRD_TOURNAMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENTH_TOURNAMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIRST_ADVANCE_MATCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FIRST_SEMIFINAL_TOURNAMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FIRST_FINALIST_TOURNAMENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FIRST_ACADEMY_TOURNAMENT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FIRST_CHALLENGE_TOURNAMENT_ID = "12121212-1212-4212-8212-121212121212";
const FIRST_MAIN_TOURNAMENT_ID = "34343434-3434-4434-8434-343434343434";
const SECOND_CHAMPIONSHIP_TOURNAMENT_ID =
  "56565656-5656-4565-8565-565656565656";
const SEASON_ID = "abababab-abab-4aba-8aba-abababababab";
const FOURTH_SEASON_TOURNAMENT_ID =
  "efefefef-efef-4efe-8efe-efefefefefef";

type BadgeAwardPayload = {
  player_id: string;
  badge_slug: string;
  source_type: string;
  source_id: string | null;
  source_metadata: Record<string, unknown>;
  original_unlocked_at: string | null;
};

type FakeAuthorityClientOptions = {
  profile?: Record<string, unknown> | null;
  summaries?: Record<string, Record<string, unknown>>;
  matchExcellenceSummaries?: Record<string, Record<string, unknown>>;
  reliableCompetitorSummaries?: Record<string, Record<string, unknown>>;
  comebackCommanderSummaries?: Record<string, Array<Record<string, unknown>>>;
  tournamentSummaries?: Record<string, Record<string, unknown>>;
  bracketProgressionSummaries?: Record<string, Record<string, unknown>>;
  tournamentPrestigeSummaries?: Record<string, Record<string, unknown>>;
  flawlessCampaignSummaries?: Record<string, Array<Record<string, unknown>>>;
  seasonSummaries?: Record<string, Record<string, unknown>>;
  participants?: Array<Record<string, unknown>>;
  tournamentParticipants?: Array<Record<string, unknown>>;
  matchTournamentRows?: Array<Record<string, unknown>>;
  seasonParticipants?: Array<Record<string, unknown>>;
  tournamentSeasonRows?: Array<Record<string, unknown>>;
  backfillPlayers?: string[];
  existingAwards?: string[];
};

function verifiedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    account_closed_at: null,
    profile_completed: true,
    steam_id64: "18446744073709551615",
    current_elo: 1450,
    relic_verified_elo: 1450,
    relic_verified_faction: "Wehrmacht",
    relic_verified_division: "Main / Pro",
    relic_elo_calculation_version: "relic-highest-1v1-v1",
    relic_elo_verified_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

function matchSummary(overrides: Record<string, unknown> = {}) {
  return {
    played_match_count: 0,
    win_count: 0,
    first_played_match_id: null,
    first_played_at: null,
    tenth_played_match_id: null,
    tenth_played_at: null,
    first_win_match_id: null,
    first_win_at: null,
    fifth_win_match_id: null,
    fifth_win_at: null,
    tenth_win_match_id: null,
    tenth_win_at: null,
    twenty_fifth_win_match_id: null,
    twenty_fifth_win_at: null,
    ...overrides,
  };
}

function matchExcellenceSummary(overrides: Record<string, unknown> = {}) {
  return {
    best_win_streak: 0,
    third_streak_match_id: null,
    third_streak_at: null,
    fifth_streak_match_id: null,
    fifth_streak_at: null,
    clean_sweep_count: 0,
    first_clean_sweep_match_id: null,
    first_clean_sweep_at: null,
    upset_win_count: 0,
    first_upset_match_id: null,
    first_upset_at: null,
    first_upset_elo_delta: null,
    third_upset_match_id: null,
    third_upset_at: null,
    third_upset_elo_delta: null,
    ...overrides,
  };
}

function reliableCompetitorSummary(overrides: Record<string, unknown> = {}) {
  return {
    best_run: 0,
    tenth_match_id: null,
    tenth_at: null,
    ...overrides,
  };
}

function comebackCommanderSummary(
  overrides: Record<string, unknown> = {}
) {
  return {
    match_id: FIRST_MATCH_ID,
    game1_winner_registration_id: "99999999-9999-4999-8999-999999999999",
    series_winner_registration_id: PLAYER_ID,
    series_best_of: 3,
    finalized_game_count: 3,
    finalized_at: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function tournamentSummary(overrides: Record<string, unknown> = {}) {
  return {
    completed_tournament_count: 0,
    first_completed_tournament_id: null,
    first_completed_at: null,
    third_completed_tournament_id: null,
    third_completed_at: null,
    tenth_completed_tournament_id: null,
    tenth_completed_at: null,
    ...overrides,
  };
}

function bracketProgressionSummary(overrides: Record<string, unknown> = {}) {
  return {
    original_bracket: null,
    original_tournament_id: null,
    original_completed_at: null,
    higher_bracket: null,
    higher_tournament_id: null,
    higher_completed_at: null,
    ...overrides,
  };
}

function tournamentPrestigeSummary(overrides: Record<string, unknown> = {}) {
  return {
    played_advance_win_count: 0,
    first_advance_match_id: null,
    first_advance_at: null,
    semifinalist_count: 0,
    first_semifinal_tournament_id: null,
    first_semifinal_at: null,
    finalist_count: 0,
    first_finalist_tournament_id: null,
    first_finalist_at: null,
    academy_championship_count: 0,
    first_academy_championship_tournament_id: null,
    first_academy_championship_at: null,
    challenge_championship_count: 0,
    first_challenge_championship_tournament_id: null,
    first_challenge_championship_at: null,
    main_championship_count: 0,
    first_main_championship_tournament_id: null,
    first_main_championship_at: null,
    championship_count: 0,
    second_championship_tournament_id: null,
    second_championship_at: null,
    triple_crown_bracket_count: 0,
    triple_crown_tournament_id: null,
    triple_crown_at: null,
    ...overrides,
  };
}

function seasonSummary(overrides: Record<string, unknown> = {}) {
  return {
    season_campaigner_count: 0,
    first_season_campaigner_season_id: null,
    first_season_campaigner_at: null,
    first_season_campaigner_threshold_tournament_id: null,
    first_season_campaigner_tournament_count: null,
    podium_finish_count: 0,
    first_podium_season_id: null,
    first_podium_at: null,
    first_podium_rank: null,
    champion_finish_count: 0,
    first_champion_season_id: null,
    first_champion_at: null,
    first_champion_rank: null,
    ...overrides,
  };
}

function createAuthorityClient(options: FakeAuthorityClientOptions = {}) {
  const awards = new Set(options.existingAwards ?? []);
  const upsertPayloads: BadgeAwardPayload[] = [];
  const profile =
    options.profile === undefined ? verifiedProfile() : options.profile;
  const summaries: Record<string, Record<string, unknown>> =
    options.summaries ?? {
      [PLAYER_ID]: matchSummary(),
    };
  const matchExcellenceSummaries: Record<string, Record<string, unknown>> =
    options.matchExcellenceSummaries ?? {
      [PLAYER_ID]: matchExcellenceSummary(),
    };
  const reliableCompetitorSummaries: Record<string, Record<string, unknown>> =
    options.reliableCompetitorSummaries ?? {
      [PLAYER_ID]: reliableCompetitorSummary(),
    };
  const comebackCommanderSummaries: Record<
    string,
    Array<Record<string, unknown>>
  > = options.comebackCommanderSummaries ?? {
    [PLAYER_ID]: [],
  };
  const tournamentSummaries: Record<string, Record<string, unknown>> =
    options.tournamentSummaries ?? {
      [PLAYER_ID]: tournamentSummary(),
    };
  const bracketProgressionSummaries: Record<string, Record<string, unknown>> =
    options.bracketProgressionSummaries ?? {
      [PLAYER_ID]: bracketProgressionSummary(),
    };
  const tournamentPrestigeSummaries: Record<string, Record<string, unknown>> =
    options.tournamentPrestigeSummaries ?? {
      [PLAYER_ID]: tournamentPrestigeSummary(),
    };
  const flawlessCampaignSummaries: Record<
    string,
    Array<Record<string, unknown>>
  > = options.flawlessCampaignSummaries ?? {
    [PLAYER_ID]: [],
  };
  const seasonSummaries: Record<string, Record<string, unknown>> =
    options.seasonSummaries ?? {
      [PLAYER_ID]: seasonSummary(),
    };
  const backfillPlayers = options.backfillPlayers ?? [PLAYER_ID];

  const upsert = vi.fn((payload: BadgeAwardPayload) => {
    upsertPayloads.push(payload);
    const key = `${payload.player_id}:${payload.badge_slug}`;
    const duplicate = awards.has(key);

    if (!duplicate) {
      awards.add(key);
    }

    return {
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: duplicate
            ? null
            : {
                id: "award-id",
                badge_slug: payload.badge_slug,
              },
          error: null,
        })),
      })),
    };
  });

  const from = vi.fn((table: string) => {
    if (table === "player_badge_awards") {
      return { upsert };
    }

    if (table === "players") {
      const playerRows = backfillPlayers.map((id) => ({ id }));
      const openPlayerRows = profile?.account_closed_at ? [] : playerRows;
      let requestedPlayerId: string | null = null;
      let selectedColumns = "";
      const query = {
        eq: vi.fn((column: string, value: unknown) => {
          if (column === "id" && typeof value === "string") {
            requestedPlayerId = value;
          }
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data:
            selectedColumns === "id, account_closed_at"
              ? profile?.account_closed_at
                ? {
                    id: requestedPlayerId ?? profile.id,
                    account_closed_at: profile.account_closed_at,
                  }
                : {
                    id: requestedPlayerId ?? profile?.id ?? PLAYER_ID,
                    account_closed_at: null,
                  }
              : profile &&
                  (requestedPlayerId === null || requestedPlayerId === PLAYER_ID)
                ? profile
                : null,
          error: null,
        })),
        order: vi.fn(async () => ({
          data: openPlayerRows,
          error: null,
        })),
        in: vi.fn(async (_column: string, values: string[]) => ({
          data: openPlayerRows.filter((row) => values.includes(row.id)),
          error: null,
        })),
        is: vi.fn(() => query),
        select: vi.fn((columns: string) => {
          selectedColumns = columns;
          return query;
        }),
      };

      return query;
    }

    if (table === "match_result_report_groups") {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: {
            match_id: FIRST_MATCH_ID,
            status: "confirmed",
            finalized_at: "2026-08-03T12:00:00.000Z",
          },
          error: null,
        })),
        select: vi.fn(() => query),
      };

      return query;
    }

    if (table === "match_result_submissions") {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: {
            match_id: FIRST_MATCH_ID,
            status: "approved",
          },
          error: null,
        })),
        select: vi.fn(() => query),
      };

      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "get_player_badge_match_participants") {
      return {
        data:
          options.participants ??
          [
            {
              player_id: PLAYER_ID,
            },
          ],
        error: null,
      };
    }

    if (name === "get_player_badge_match_threshold_summary") {
      return {
        data: [
          summaries[String(args.p_player_id)] ?? matchSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_match_excellence_summary") {
      return {
        data: [
          matchExcellenceSummaries[String(args.p_player_id)] ??
            matchExcellenceSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_reliable_competitor_summary") {
      return {
        data: [
          reliableCompetitorSummaries[String(args.p_player_id)] ??
            reliableCompetitorSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_comeback_commander_summary") {
      return {
        data:
          comebackCommanderSummaries[String(args.p_player_id)] ?? [],
        error: null,
      };
    }

    if (name === "get_player_badge_tournament_for_match") {
      return {
        data:
          options.matchTournamentRows ?? [{ tournament_id: FIRST_TOURNAMENT_ID }],
        error: null,
      };
    }

    if (name === "get_player_badge_tournament_authority_participants") {
      return {
        data:
          options.tournamentParticipants ??
          [
            {
              player_id: PLAYER_ID,
            },
          ],
        error: null,
      };
    }

    if (name === "get_player_badge_tournament_summary") {
      return {
        data: [
          tournamentSummaries[String(args.p_player_id)] ?? tournamentSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_bracket_progression_summary") {
      return {
        data: [
          bracketProgressionSummaries[String(args.p_player_id)] ??
            bracketProgressionSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_tournament_prestige_summary") {
      return {
        data: [
          tournamentPrestigeSummaries[String(args.p_player_id)] ??
            tournamentPrestigeSummary(),
        ],
        error: null,
      };
    }

    if (name === "get_player_badge_flawless_campaign_summary") {
      return {
        data:
          flawlessCampaignSummaries[String(args.p_player_id)] ?? [],
        error: null,
      };
    }

    if (name === "get_player_badge_finalized_season_for_tournament") {
      return {
        data:
          options.tournamentSeasonRows ?? [{ season_id: SEASON_ID }],
        error: null,
      };
    }

    if (name === "get_player_badge_season_authority_participants") {
      return {
        data:
          options.seasonParticipants ??
          [
            {
              player_id: PLAYER_ID,
            },
          ],
        error: null,
      };
    }

    if (name === "get_player_badge_season_summary") {
      return {
        data: [
          seasonSummaries[String(args.p_player_id)] ?? seasonSummary(),
        ],
        error: null,
      };
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });

  return {
    awards,
    client: { from, rpc } as unknown as BadgeAuthorityClient,
    from,
    rpc,
    upsert,
    upsertPayloads,
  };
}

describe("badge authority evaluators", () => {
  it("keeps production authority limited to implemented exact badges", () => {
    expect(PRODUCTION_BADGE_AUTHORITY_SLUGS).toEqual([
      "ironclad-recruit",
      "first-deployment",
      "first-victory",
      "battle-tested",
      "reliable-competitor",
      "comeback-commander",
      "flawless-campaign",
      "first-campaign",
      "iron-regular",
      "tournament-veteran",
      "rising-through-the-ranks",
      "season-campaigner",
      "five-victories",
      "ten-victories",
      "twenty-five-victories",
      "iron-streak",
      "unbroken",
      "clean-sweep",
      "giant-slayer",
      "giant-hunter",
      "first-advance",
      "semifinalist",
      "finalist",
      "academy-champion",
      "challenge-champion",
      "elite-champion",
      "double-champion",
      "triple-crown",
      "season-podium",
      "season-champion",
    ]);
  });

  it("awards IronClad Recruit for a verified eligible player", async () => {
    const fixture = createAuthorityClient();

    const result = await evaluateProfileBadgeAwards({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result).toMatchObject({
      createdCount: 1,
      createdSlugs: ["ironclad-recruit"],
      evaluatedSlugs: ["ironclad-recruit"],
    });
    expect(fixture.upsertPayloads[0]).toMatchObject({
      player_id: PLAYER_ID,
      badge_slug: "ironclad-recruit",
      source_type: "profile",
      source_id: PLAYER_ID,
      original_unlocked_at: "2026-08-02T10:00:00.000Z",
      source_metadata: expect.objectContaining({
        evaluator: "profile-status",
        requirement: "identity-and-elo-verification",
      }),
    });
  });

  it("does not award IronClad Recruit for an incomplete or unverified player", async () => {
    const fixture = createAuthorityClient({
      profile: verifiedProfile({
        profile_completed: false,
        relic_verified_elo: null,
      }),
    });

    const result = await evaluateProfileBadgeAwards({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.skippedReasons).toContain("profile_not_verified");
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("does not evaluate or backfill a closed player account", async () => {
    const fixture = createAuthorityClient({
      profile: verifiedProfile({
        account_closed_at: "2026-08-30T10:00:00.000Z",
      }),
      backfillPlayers: [PLAYER_ID],
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 1,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-30T12:00:00.000Z",
        }),
      },
    });

    const liveResult = await evaluateProfileBadgeAwards({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });
    const explicitResult = await evaluateAllBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
      evaluationMode: "reconciliation",
    });
    const directMatchResult = await evaluateMatchBadgeAwardsForMatch({
      matchId: FIRST_MATCH_ID,
      supabase: fixture.client,
    });
    const backfillResult = await backfillInitialBadgeAwards({
      playerIds: [PLAYER_ID],
      supabase: fixture.client,
    });

    expect(liveResult.createdCount).toBe(0);
    expect(explicitResult.createdCount).toBe(0);
    expect(directMatchResult.createdCount).toBe(0);
    expect(explicitResult.skippedReasons).toEqual([
      "player_closed_or_unavailable",
    ]);
    expect(
      reconcileBadgeUnlockedNotificationsForPlayerMock
    ).not.toHaveBeenCalled();
    expect(backfillResult.playersEvaluated).toBe(0);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("awards First Deployment for a qualifying played match", async () => {
    const fixture = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 1,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
        }),
      },
    });

    const result = await evaluateMatchBadgeAwardsForMatch({
      matchId: FIRST_MATCH_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toEqual(["first-deployment"]);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_match_participants",
      { p_match_id: FIRST_MATCH_ID }
    );
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_match_threshold_summary",
      { p_player_id: PLAYER_ID }
    );
  });

  it("does not count non-played default or void matches", async () => {
    const fixture = createAuthorityClient({
      participants: [],
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 10,
          win_count: 5,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
        }),
      },
    });

    const result = await evaluateMatchBadgeAwardsForMatch({
      matchId: FIRST_MATCH_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.skippedReasons).toContain("match_not_played");
    expect(fixture.rpc).not.toHaveBeenCalledWith(
      "get_player_badge_match_threshold_summary",
      expect.anything()
    );
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("does not award match badges when the database helpers filter cancelled or voided tournament history", async () => {
    const fixture = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary(),
      },
    });

    const result = await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.evaluatedSlugs).toEqual([
      "first-deployment",
      "battle-tested",
      "first-victory",
      "five-victories",
      "ten-victories",
      "twenty-five-victories",
      "reliable-competitor",
      "iron-streak",
      "unbroken",
      "clean-sweep",
      "giant-slayer",
      "giant-hunter",
      "comeback-commander",
    ]);
    expect(result.skippedReasons).toEqual([
      "first-deployment_threshold_not_met",
      "battle-tested_threshold_not_met",
      "first-victory_threshold_not_met",
      "five-victories_threshold_not_met",
      "ten-victories_threshold_not_met",
      "twenty-five-victories_threshold_not_met",
      "reliable-competitor_threshold_not_met",
      "iron-streak_threshold_not_met",
      "unbroken_threshold_not_met",
      "clean-sweep_threshold_not_met",
      "giant-slayer_threshold_not_met",
      "giant-hunter_threshold_not_met",
      "comeback_commander_evidence_unavailable",
    ]);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("awards First Victory only after a qualifying played victory", async () => {
    const winner = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 1,
          win_count: 1,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
          first_win_match_id: FIRST_WIN_ID,
          first_win_at: "2026-08-03T12:00:00.000Z",
        }),
      },
    });
    const loser = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 1,
          win_count: 0,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: winner.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: loser.client,
    });

    expect(winner.upsertPayloads.map((payload) => payload.badge_slug))
      .toContain("first-victory");
    expect(loser.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("first-victory");
  });

  it("requires ten qualifying matches for Battle Tested", async () => {
    const nineMatches = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 9,
          first_played_match_id: FIRST_MATCH_ID,
        }),
      },
    });
    const tenMatches = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 10,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          tenth_played_at: "2026-08-10T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: nineMatches.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tenMatches.client,
    });

    expect(nineMatches.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("battle-tested");
    expect(tenMatches.upsertPayloads.map((payload) => payload.badge_slug))
      .toContain("battle-tested");
  });

  it("awards Reliable Competitor from a ten-obligation participant-authority run", async () => {
    const nine = createAuthorityClient({
      reliableCompetitorSummaries: {
        [PLAYER_ID]: reliableCompetitorSummary({ best_run: 9 }),
      },
    });
    const ten = createAuthorityClient({
      reliableCompetitorSummaries: {
        [PLAYER_ID]: reliableCompetitorSummary({
          best_run: 10,
          tenth_match_id: TENTH_MATCH_ID,
          tenth_at: "2026-08-10T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: nine.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: ten.client,
    });

    expect(nine.upsertPayloads.map((payload) => payload.badge_slug)).not.toContain(
      "reliable-competitor"
    );
    expect(ten.upsertPayloads).toContainEqual(
      expect.objectContaining({
        badge_slug: "reliable-competitor",
        source_type: "match",
        source_id: TENTH_MATCH_ID,
        original_unlocked_at: "2026-08-10T12:00:00.000Z",
      })
    );
  });

  it("keeps Reliable Competitor idempotent and trusts the durable summary rather than legacy match counts", async () => {
    const fixture = createAuthorityClient({
      reliableCompetitorSummaries: {
        [PLAYER_ID]: reliableCompetitorSummary({
          best_run: 10,
          tenth_match_id: TENTH_MATCH_ID,
          tenth_at: "2026-08-10T12:00:00.000Z",
        }),
      },
      summaries: {
        [PLAYER_ID]: matchSummary({ played_match_count: 0 }),
      },
    });

    const first = await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });
    const second = await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(first.createdSlugs).toContain("reliable-competitor");
    expect(second.createdSlugs).not.toContain("reliable-competitor");
    expect(
      fixture.upsertPayloads.filter(
        (payload) => payload.badge_slug === "reliable-competitor"
      )
    ).toHaveLength(2);
  });

  it("awards Comeback Commander only from complete durable Game 1 loss and series win evidence", async () => {
    const fixture = createAuthorityClient({
      comebackCommanderSummaries: {
        [PLAYER_ID]: [comebackCommanderSummary()],
      },
    });

    const result = await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toContain("comeback-commander");
    expect(fixture.upsertPayloads).toContainEqual(
      expect.objectContaining({
        badge_slug: "comeback-commander",
        source_type: "match",
        source_id: FIRST_MATCH_ID,
        original_unlocked_at: "2026-08-10T12:00:00.000Z",
        source_metadata: expect.objectContaining({
          evaluator: "comeback-commander",
          seriesBestOf: 3,
          finalizedGameCount: 3,
        }),
      })
    );
  });

  it("keeps Comeback Commander locked when durable complete-series evidence is absent", async () => {
    const fixture = createAuthorityClient({
      comebackCommanderSummaries: {
        [PLAYER_ID]: [],
      },
    });

    const result = await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).not.toContain("comeback-commander");
    expect(result.skippedReasons).toContain(
      "comeback_commander_evidence_unavailable"
    );
  });

  it("requires five qualifying wins for Five Victories", async () => {
    const fourWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 4,
          win_count: 4,
          first_played_match_id: FIRST_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
        }),
      },
    });
    const fiveWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 5,
          win_count: 5,
          first_played_match_id: FIRST_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          fifth_win_at: "2026-08-11T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fourWins.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fiveWins.client,
    });

    expect(fourWins.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("five-victories");
    expect(fiveWins.upsertPayloads.map((payload) => payload.badge_slug))
      .toContain("five-victories");
  });

  it("requires ten qualifying wins for Ten Victories", async () => {
    const nineWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 9,
          win_count: 9,
          first_played_match_id: FIRST_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
        }),
      },
    });
    const tenWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 10,
          win_count: 10,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          tenth_win_match_id: TENTH_WIN_ID,
          tenth_win_at: "2026-08-12T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: nineWins.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tenWins.client,
    });

    expect(nineWins.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("ten-victories");
    expect(tenWins.upsertPayloads.map((payload) => payload.badge_slug))
      .toContain("ten-victories");
  });

  it("requires twenty-five qualifying wins for Twenty-Five Victories", async () => {
    const twentyFourWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 24,
          win_count: 24,
          first_played_match_id: FIRST_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          tenth_win_match_id: TENTH_WIN_ID,
        }),
      },
    });
    const twentyFiveWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 25,
          win_count: 25,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          tenth_win_match_id: TENTH_WIN_ID,
          twenty_fifth_win_match_id: TWENTY_FIFTH_WIN_ID,
          twenty_fifth_win_at: "2026-08-13T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twentyFourWins.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twentyFiveWins.client,
    });

    expect(twentyFourWins.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("twenty-five-victories");
    expect(twentyFiveWins.upsertPayloads.map((payload) => payload.badge_slug))
      .toContain("twenty-five-victories");
  });

  it("cascades win thresholds without creating duplicate awards", async () => {
    const tenWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 10,
          win_count: 10,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          tenth_win_match_id: TENTH_WIN_ID,
        }),
      },
    });
    const twentyFiveWins = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 25,
          win_count: 25,
          first_played_match_id: FIRST_MATCH_ID,
          tenth_played_match_id: TENTH_MATCH_ID,
          first_win_match_id: FIRST_WIN_ID,
          fifth_win_match_id: FIFTH_WIN_ID,
          tenth_win_match_id: TENTH_WIN_ID,
          twenty_fifth_win_match_id: TWENTY_FIFTH_WIN_ID,
        }),
      },
    });

    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tenWins.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twentyFiveWins.client,
    });
    await evaluateMatchBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twentyFiveWins.client,
    });

    expect(tenWins.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual([
        "first-deployment",
        "battle-tested",
        "first-victory",
        "five-victories",
        "ten-victories",
      ]);
    expect(twentyFiveWins.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual([
        "first-deployment",
        "battle-tested",
        "first-victory",
        "five-victories",
        "ten-victories",
        "twenty-five-victories",
        "first-deployment",
        "battle-tested",
        "first-victory",
        "five-victories",
        "ten-victories",
        "twenty-five-victories",
      ]);
    expect(twentyFiveWins.awards.size).toBe(6);
  });

  it("awards win streak thresholds from historical best streaks", async () => {
    const twoWinStreak = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 2,
        }),
      },
    });
    const threeWinStreak = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 3,
          third_streak_match_id: THIRD_STREAK_MATCH_ID,
          third_streak_at: "2026-08-14T12:00:00.000Z",
        }),
      },
    });
    const fiveWinStreak = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 5,
          third_streak_match_id: THIRD_STREAK_MATCH_ID,
          third_streak_at: "2026-08-14T12:00:00.000Z",
          fifth_streak_match_id: FIFTH_STREAK_MATCH_ID,
          fifth_streak_at: "2026-08-16T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twoWinStreak.client,
    });
    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: threeWinStreak.client,
    });
    const first = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fiveWinStreak.client,
    });
    const second = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fiveWinStreak.client,
    });

    expect(twoWinStreak.upsert).not.toHaveBeenCalled();
    expect(threeWinStreak.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["iron-streak"]);
    expect(first.createdSlugs).toEqual(["iron-streak", "unbroken"]);
    expect(second.createdCount).toBe(0);
    expect(fiveWinStreak.awards.size).toBe(2);
    expect(fiveWinStreak.upsertPayloads[1]).toMatchObject({
      badge_slug: "unbroken",
      source_type: "match",
      source_id: FIFTH_STREAK_MATCH_ID,
      original_unlocked_at: "2026-08-16T12:00:00.000Z",
      source_metadata: expect.objectContaining({
        evaluator: "win-streak",
        threshold: 5,
      }),
    });
  });

  it("does not award win streak thresholds without authoritative result timestamps", async () => {
    const missingThirdTimestamp = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 3,
          third_streak_match_id: THIRD_STREAK_MATCH_ID,
        }),
      },
    });
    const missingFifthTimestamp = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 5,
          third_streak_match_id: THIRD_STREAK_MATCH_ID,
          third_streak_at: "2026-08-14T12:00:00.000Z",
          fifth_streak_match_id: FIFTH_STREAK_MATCH_ID,
        }),
      },
    });

    const thirdResult = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: missingThirdTimestamp.client,
    });
    const fifthResult = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: missingFifthTimestamp.client,
    });

    expect(thirdResult.createdSlugs).toEqual([]);
    expect(thirdResult.skippedReasons).toContain(
      "iron-streak_timestamp_missing"
    );
    expect(missingThirdTimestamp.upsert).not.toHaveBeenCalled();
    expect(fifthResult.createdSlugs).toEqual(["iron-streak"]);
    expect(fifthResult.skippedReasons).toContain("unbroken_timestamp_missing");
    expect(
      missingFifthTimestamp.upsertPayloads.map((payload) => payload.badge_slug)
    )
      .toEqual(["iron-streak"]);
  });

  it("awards Clean Sweep only when the database summary finds a flawless BO3 or BO5 played win", async () => {
    const noCleanSweep = createAuthorityClient();
    const cleanSweep = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          clean_sweep_count: 1,
          first_clean_sweep_match_id: CLEAN_SWEEP_MATCH_ID,
          first_clean_sweep_at: "2026-08-17T12:00:00.000Z",
        }),
      },
    });

    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: noCleanSweep.client,
    });
    const result = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: cleanSweep.client,
    });

    expect(noCleanSweep.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("clean-sweep");
    expect(result.createdSlugs).toEqual(["clean-sweep"]);
    expect(cleanSweep.upsertPayloads[0]).toMatchObject({
      badge_slug: "clean-sweep",
      source_type: "match",
      source_id: CLEAN_SWEEP_MATCH_ID,
      source_metadata: expect.objectContaining({
        evaluator: "clean-sweep",
      }),
    });
  });

  it("cascades Giant Slayer and Giant Hunter upset thresholds", async () => {
    const belowThreshold = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          upset_win_count: 0,
        }),
      },
    });
    const oneUpset = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          upset_win_count: 1,
          first_upset_match_id: FIRST_UPSET_MATCH_ID,
          first_upset_at: "2026-08-18T12:00:00.000Z",
          first_upset_elo_delta: 200,
        }),
      },
    });
    const threeUpsets = createAuthorityClient({
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          upset_win_count: 3,
          first_upset_match_id: FIRST_UPSET_MATCH_ID,
          first_upset_at: "2026-08-18T12:00:00.000Z",
          first_upset_elo_delta: 200,
          third_upset_match_id: THIRD_UPSET_MATCH_ID,
          third_upset_at: "2026-08-20T12:00:00.000Z",
          third_upset_elo_delta: 250,
        }),
      },
    });

    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: belowThreshold.client,
    });
    await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: oneUpset.client,
    });
    const first = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: threeUpsets.client,
    });
    const second = await evaluateMatchExcellenceBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: threeUpsets.client,
    });

    expect(belowThreshold.upsert).not.toHaveBeenCalled();
    expect(oneUpset.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["giant-slayer"]);
    expect(first.createdSlugs).toEqual(["giant-slayer", "giant-hunter"]);
    expect(second.createdCount).toBe(0);
    expect(threeUpsets.awards.size).toBe(2);
    expect(threeUpsets.upsertPayloads[1]).toMatchObject({
      badge_slug: "giant-hunter",
      source_type: "match",
      source_id: THIRD_UPSET_MATCH_ID,
      source_metadata: expect.objectContaining({
        evaluator: "elo-upset",
        upsetEloDelta: 250,
      }),
    });
  });

  it("requires one completed tournament for First Campaign", async () => {
    const zeroCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary(),
      },
    });
    const oneCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 1,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          first_completed_at: "2026-08-14T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: zeroCompleted.client,
    });
    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: oneCompleted.client,
    });

    expect(zeroCompleted.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("first-campaign");
    expect(oneCompleted.upsertPayloads).toEqual([
      expect.objectContaining({
        badge_slug: "first-campaign",
        source_type: "tournament",
        source_id: FIRST_TOURNAMENT_ID,
        original_unlocked_at: "2026-08-14T12:00:00.000Z",
      }),
    ]);
  });

  it("requires three completed tournaments for Iron Regular", async () => {
    const twoCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 2,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
        }),
      },
    });
    const threeCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 3,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
          third_completed_at: "2026-08-15T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: twoCompleted.client,
    });
    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: threeCompleted.client,
    });

    expect(twoCompleted.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("iron-regular");
    expect(threeCompleted.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["first-campaign", "iron-regular"]);
  });

  it("requires ten completed tournaments for Tournament Veteran", async () => {
    const nineCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 9,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
        }),
      },
    });
    const tenCompleted = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 10,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
          tenth_completed_tournament_id: TENTH_TOURNAMENT_ID,
          tenth_completed_at: "2026-08-16T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: nineCompleted.client,
    });
    await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tenCompleted.client,
    });

    expect(nineCompleted.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("tournament-veteran");
    expect(tenCompleted.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["first-campaign", "iron-regular", "tournament-veteran"]);
  });

  it.each([
    ["academy", "challenge"],
    ["academy", "main"],
    ["challenge", "main"],
  ])(
    "awards Rising Through the Ranks for %s first and %s later",
    async (originalBracket, higherBracket) => {
      const fixture = createAuthorityClient({
        bracketProgressionSummaries: {
          [PLAYER_ID]: bracketProgressionSummary({
            original_bracket: originalBracket,
            original_tournament_id: FIRST_TOURNAMENT_ID,
            original_completed_at: "2026-08-14T12:00:00.000Z",
            higher_bracket: higherBracket,
            higher_tournament_id: HIGHER_BRACKET_TOURNAMENT_ID,
            higher_completed_at: "2026-08-15T12:00:00.000Z",
          }),
        },
      });

      const result = await evaluateTournamentBadgeAwardsForPlayer({
        playerId: PLAYER_ID,
        supabase: fixture.client,
      });

      expect(result.createdSlugs).toContain("rising-through-the-ranks");
      expect(fixture.upsertPayloads).toContainEqual(
        expect.objectContaining({
          badge_slug: "rising-through-the-ranks",
          source_type: "tournament",
          source_id: HIGHER_BRACKET_TOURNAMENT_ID,
          original_unlocked_at: "2026-08-15T12:00:00.000Z",
          source_metadata: expect.objectContaining({
            originalBracket,
            higherBracket,
            originalTournamentId: FIRST_TOURNAMENT_ID,
            thresholdTournamentId: HIGHER_BRACKET_TOURNAMENT_ID,
          }),
        })
      );
    }
  );

  it("does not award Rising Through the Ranks for non-increasing bracket history", async () => {
    const fixture = createAuthorityClient({
      bracketProgressionSummaries: {
        [PLAYER_ID]: bracketProgressionSummary({
          original_bracket: "main",
          original_tournament_id: FIRST_TOURNAMENT_ID,
          original_completed_at: "2026-08-14T12:00:00.000Z",
          higher_bracket: null,
          higher_tournament_id: null,
        }),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).not.toContain("rising-through-the-ranks");
    expect(fixture.upsertPayloads).not.toContainEqual(
      expect.objectContaining({ badge_slug: "rising-through-the-ranks" })
    );
  });

  it("uses the authoritative progression summary for duplicate, invalid, and ambiguous history", async () => {
    const fixture = createAuthorityClient({
      bracketProgressionSummaries: {
        [PLAYER_ID]: bracketProgressionSummary(),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).not.toContain("rising-through-the-ranks");
    expect(result.skippedReasons).toContain(
      "higher_bracket_threshold_not_met"
    );
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_bracket_progression_summary",
      { p_player_id: PLAYER_ID }
    );
  });

  it("keeps Rising Through the Ranks live evaluation idempotent", async () => {
    const fixture = createAuthorityClient({
      bracketProgressionSummaries: {
        [PLAYER_ID]: bracketProgressionSummary({
          original_bracket: "academy",
          original_tournament_id: FIRST_TOURNAMENT_ID,
          original_completed_at: "2026-08-14T12:00:00.000Z",
          higher_bracket: "challenge",
          higher_tournament_id: HIGHER_BRACKET_TOURNAMENT_ID,
          higher_completed_at: "2026-08-15T12:00:00.000Z",
        }),
      },
    });

    const first = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });
    const second = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(first.createdSlugs).toContain("rising-through-the-ranks");
    expect(second.createdCount).toBe(0);
    expect(
      fixture.upsertPayloads.filter(
        (payload) => payload.badge_slug === "rising-through-the-ranks"
      )
    ).toHaveLength(2);
    expect(fixture.awards).toContain(`${PLAYER_ID}:rising-through-the-ranks`);
  });

  it("evaluates Rising Through the Ranks from the completed-tournament hook", async () => {
    const fixture = createAuthorityClient({
      tournamentParticipants: [{ player_id: PLAYER_ID }],
      bracketProgressionSummaries: {
        [PLAYER_ID]: bracketProgressionSummary({
          original_bracket: "academy",
          original_tournament_id: FIRST_TOURNAMENT_ID,
          original_completed_at: "2026-08-14T12:00:00.000Z",
          higher_bracket: "challenge",
          higher_tournament_id: HIGHER_BRACKET_TOURNAMENT_ID,
          higher_completed_at: "2026-08-15T12:00:00.000Z",
        }),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForTournament({
      tournamentId: HIGHER_BRACKET_TOURNAMENT_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toContain("rising-through-the-ranks");
  });

  it("backfills Rising Through the Ranks idempotently from the same summary", async () => {
    const fixture = createAuthorityClient({
      bracketProgressionSummaries: {
        [PLAYER_ID]: bracketProgressionSummary({
          original_bracket: "challenge",
          original_tournament_id: FIRST_TOURNAMENT_ID,
          original_completed_at: "2026-08-14T12:00:00.000Z",
          higher_bracket: "main",
          higher_tournament_id: HIGHER_BRACKET_TOURNAMENT_ID,
          higher_completed_at: "2026-08-15T12:00:00.000Z",
        }),
      },
    });

    const first = await backfillInitialBadgeAwards({
      supabase: fixture.client,
      playerIds: [PLAYER_ID],
    });
    const second = await backfillInitialBadgeAwards({
      supabase: fixture.client,
      playerIds: [PLAYER_ID],
    });

    expect(first.badgeCounts["rising-through-the-ranks"]).toBe(1);
    expect(second.badgeCounts["rising-through-the-ranks"]).toBe(0);
  });

  it("requires a played official win that advances for First Advance", async () => {
    const noAdvance = createAuthorityClient();
    const oneAdvance = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          played_advance_win_count: 1,
          first_advance_match_id: FIRST_ADVANCE_MATCH_ID,
          first_advance_at: "2026-08-17T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: noAdvance.client,
    });
    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: oneAdvance.client,
    });
    const repeated = await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: oneAdvance.client,
    });

    expect(noAdvance.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("first-advance");
    expect(oneAdvance.upsertPayloads[0]).toEqual(
      expect.objectContaining({
        badge_slug: "first-advance",
        source_type: "match",
        source_id: FIRST_ADVANCE_MATCH_ID,
        original_unlocked_at: "2026-08-17T12:00:00.000Z",
        source_metadata: expect.objectContaining({
          evaluator: "tournament-progression",
          eventType: "played_match_win",
          originalUnlockedAtBasis: "match_official_result_decided_at",
        }),
      })
    );
    expect(repeated.createdCount).toBe(0);
    expect(oneAdvance.awards.size).toBe(1);
  });

  it("evaluates First Advance immediately after an in-progress played match advances the winner", async () => {
    const fixture = createAuthorityClient({
      matchTournamentRows: [],
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          played_advance_win_count: 1,
          first_advance_match_id: FIRST_ADVANCE_MATCH_ID,
          first_advance_at: "2026-08-17T12:00:00.000Z",
        }),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForMatch({
      matchId: FIRST_ADVANCE_MATCH_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toEqual(["first-advance"]);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_match_participants",
      { p_match_id: FIRST_ADVANCE_MATCH_ID }
    );
    expect(fixture.upsertPayloads[0]).toMatchObject({
      badge_slug: "first-advance",
      source_type: "match",
      source_id: FIRST_ADVANCE_MATCH_ID,
    });
  });

  it("does not award First Advance when loss, bye, default, admin-only, cancelled, voided, or non-advancing history is omitted by the database summary", async () => {
    const fixture = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary(),
      },
    });

    const result = await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).not.toContain("first-advance");
    expect(result.skippedReasons).toContain(
      "first-advance_threshold_not_met"
    );
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("awards semifinal and final reach badges only from round-reach facts", async () => {
    const semifinalOnly = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          semifinalist_count: 1,
          first_semifinal_tournament_id: FIRST_SEMIFINAL_TOURNAMENT_ID,
          first_semifinal_at: "2026-08-18T12:00:00.000Z",
        }),
      },
    });
    const finalist = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          semifinalist_count: 1,
          first_semifinal_tournament_id: FIRST_SEMIFINAL_TOURNAMENT_ID,
          first_semifinal_at: "2026-08-18T12:00:00.000Z",
          finalist_count: 1,
          first_finalist_tournament_id: FIRST_FINALIST_TOURNAMENT_ID,
          first_finalist_at: "2026-08-19T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: semifinalOnly.client,
    });
    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: finalist.client,
    });

    expect(semifinalOnly.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["semifinalist"]);
    expect(finalist.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["semifinalist", "finalist"]);
    expect(finalist.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("academy-champion");
  });

  it("awards division champions from authoritative tournament-win facts", async () => {
    const fixture = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          academy_championship_count: 1,
          first_academy_championship_tournament_id: FIRST_ACADEMY_TOURNAMENT_ID,
          first_academy_championship_at: "2026-08-20T12:00:00.000Z",
          challenge_championship_count: 1,
          first_challenge_championship_tournament_id:
            FIRST_CHALLENGE_TOURNAMENT_ID,
          first_challenge_championship_at: "2026-08-21T12:00:00.000Z",
          main_championship_count: 1,
          first_main_championship_tournament_id: FIRST_MAIN_TOURNAMENT_ID,
          first_main_championship_at: "2026-08-22T12:00:00.000Z",
        }),
      },
    });

    const result = await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toEqual([
      "academy-champion",
      "challenge-champion",
      "elite-champion",
    ]);
    expect(
      fixture.upsertPayloads.map((payload) => payload.source_metadata)
    ).toEqual([
      expect.objectContaining({
        evaluator: "division-championship",
        bracketType: "academy",
        eventType: "tournament_win",
      }),
      expect.objectContaining({
        evaluator: "division-championship",
        bracketType: "challenge",
        eventType: "tournament_win",
      }),
      expect.objectContaining({
        evaluator: "division-championship",
        bracketType: "main",
        eventType: "tournament_win",
      }),
    ]);
  });

  it("cascades championship prestige thresholds without duplicate awards", async () => {
    const oneChampion = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          academy_championship_count: 1,
          first_academy_championship_tournament_id: FIRST_ACADEMY_TOURNAMENT_ID,
          first_academy_championship_at: "2026-08-20T12:00:00.000Z",
          championship_count: 1,
        }),
      },
    });
    const tripleCrown = createAuthorityClient({
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          academy_championship_count: 1,
          first_academy_championship_tournament_id: FIRST_ACADEMY_TOURNAMENT_ID,
          first_academy_championship_at: "2026-08-20T12:00:00.000Z",
          challenge_championship_count: 1,
          first_challenge_championship_tournament_id:
            FIRST_CHALLENGE_TOURNAMENT_ID,
          first_challenge_championship_at: "2026-08-21T12:00:00.000Z",
          main_championship_count: 1,
          first_main_championship_tournament_id: FIRST_MAIN_TOURNAMENT_ID,
          first_main_championship_at: "2026-08-22T12:00:00.000Z",
          championship_count: 3,
          second_championship_tournament_id: SECOND_CHAMPIONSHIP_TOURNAMENT_ID,
          second_championship_at: "2026-08-21T12:00:00.000Z",
          triple_crown_bracket_count: 3,
          triple_crown_tournament_id: FIRST_MAIN_TOURNAMENT_ID,
          triple_crown_at: "2026-08-22T12:00:00.000Z",
        }),
      },
    });

    await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: oneChampion.client,
    });
    const first = await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tripleCrown.client,
    });
    const second = await evaluateTournamentPrestigeBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: tripleCrown.client,
    });

    expect(oneChampion.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual(["academy-champion"]);
    expect(first.createdSlugs).toEqual([
      "academy-champion",
      "challenge-champion",
      "elite-champion",
      "double-champion",
      "triple-crown",
    ]);
    expect(second.createdCount).toBe(0);
    expect(tripleCrown.awards.size).toBe(5);
  });

  it("evaluates tournament badges only from completed tournament participants", async () => {
    const invalidTournament = createAuthorityClient({
      tournamentParticipants: [],
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 10,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
          tenth_completed_tournament_id: TENTH_TOURNAMENT_ID,
        }),
      },
    });
    const completedTournament = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 3,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
        }),
      },
    });

    const invalid = await evaluateTournamentBadgeAwardsForTournament({
      tournamentId: FIRST_TOURNAMENT_ID,
      supabase: invalidTournament.client,
    });
    const completed = await evaluateTournamentBadgeAwardsForTournament({
      tournamentId: FIRST_TOURNAMENT_ID,
      supabase: completedTournament.client,
    });

    expect(invalid.createdCount).toBe(0);
    expect(invalid.skippedReasons).toContain("tournament_not_completed");
    expect(invalidTournament.upsert).not.toHaveBeenCalled();
    expect(completed.createdSlugs).toEqual([
      "first-campaign",
      "iron-regular",
    ]);
    expect(completedTournament.rpc).toHaveBeenCalledWith(
      "get_player_badge_tournament_authority_participants",
      { p_tournament_id: FIRST_TOURNAMENT_ID }
    );
  });

  it("does not award tournament badges from registration-only, cancelled, voided, in-progress, withdrawal, or no-show history omitted by the database summary", async () => {
    const fixture = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary(),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.evaluatedSlugs).toEqual([
      "rising-through-the-ranks",
      "first-campaign",
      "iron-regular",
      "tournament-veteran",
      "first-advance",
      "semifinalist",
      "finalist",
      "academy-champion",
      "challenge-champion",
      "elite-champion",
      "double-champion",
      "triple-crown",
      "flawless-campaign",
    ]);
    expect(result.skippedReasons).toEqual([
      "higher_bracket_threshold_not_met",
      "first-campaign_threshold_not_met",
      "iron-regular_threshold_not_met",
      "tournament-veteran_threshold_not_met",
      "first-advance_threshold_not_met",
      "semifinalist_threshold_not_met",
      "finalist_threshold_not_met",
      "academy-champion_threshold_not_met",
      "challenge-champion_threshold_not_met",
      "elite-champion_threshold_not_met",
      "double-champion_threshold_not_met",
      "triple-crown_threshold_not_met",
      "flawless_campaign_evidence_unavailable",
    ]);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("keeps repeated tournament threshold evaluation idempotent", async () => {
    const fixture = createAuthorityClient({
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 10,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
          tenth_completed_tournament_id: TENTH_TOURNAMENT_ID,
        }),
      },
    });

    const first = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });
    const second = await evaluateTournamentBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(first.createdSlugs).toEqual([
      "first-campaign",
      "iron-regular",
      "tournament-veteran",
    ]);
    expect(second.createdCount).toBe(0);
    expect(fixture.awards.size).toBe(3);
  });

  it("awards Season Campaigner only after four qualifying tournaments in one finalized season", async () => {
    const threeTournaments = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary(),
      },
    });
    const fourTournaments = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          season_campaigner_count: 1,
          first_season_campaigner_season_id: SEASON_ID,
          first_season_campaigner_at: "2026-08-24T12:00:00.000Z",
          first_season_campaigner_threshold_tournament_id:
            FOURTH_SEASON_TOURNAMENT_ID,
          first_season_campaigner_tournament_count: 4,
        }),
      },
    });

    const locked = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: threeTournaments.client,
    });
    const awarded = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fourTournaments.client,
    });

    expect(locked.createdCount).toBe(0);
    expect(locked.skippedReasons).toContain(
      "season-campaigner_threshold_not_met"
    );
    expect(awarded.createdSlugs).toEqual(["season-campaigner"]);
    expect(fourTournaments.upsertPayloads[0]).toMatchObject({
      player_id: PLAYER_ID,
      badge_slug: "season-campaigner",
      source_type: "season",
      source_id: SEASON_ID,
      original_unlocked_at: "2026-08-24T12:00:00.000Z",
      source_metadata: expect.objectContaining({
        evaluator: "season-campaigner",
        thresholdTournamentId: FOURTH_SEASON_TOURNAMENT_ID,
        qualifyingTournamentCount: 4,
      }),
    });
  });

  it("does not award Season Campaigner from split seasons or invalid participation omitted by the database summary", async () => {
    const fixture = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary(),
      },
    });

    const result = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.evaluatedSlugs).toEqual([
      "season-campaigner",
      "season-podium",
      "season-champion",
    ]);
    expect(result.skippedReasons).toEqual([
      "season-campaigner_threshold_not_met",
      "season-podium_threshold_not_met",
      "season-champion_threshold_not_met",
    ]);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("awards Season Podium from finalized official top-three season ranks", async () => {
    const rankFour = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary(),
      },
    });
    const rankThree = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 3,
        }),
      },
    });
    const rankTwo = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 2,
        }),
      },
    });
    const rankOne = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
        }),
      },
    });

    await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: rankFour.client,
    });
    const third = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: rankThree.client,
    });
    const second = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: rankTwo.client,
    });
    const first = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: rankOne.client,
    });

    expect(rankFour.upsert).not.toHaveBeenCalled();
    expect(third.createdSlugs).toEqual(["season-podium"]);
    expect(second.createdSlugs).toEqual(["season-podium"]);
    expect(first.createdSlugs).toEqual(["season-podium"]);
    expect(rankThree.upsertPayloads[0]).toMatchObject({
      badge_slug: "season-podium",
      source_type: "season",
      source_id: SEASON_ID,
      original_unlocked_at: "2026-08-25T12:00:00.000Z",
      source_metadata: expect.objectContaining({
        evaluator: "season-podium",
        officialRank: 3,
      }),
    });
  });

  it("awards Season Champion only from finalized official champion authority", async () => {
    const rankTwo = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 2,
        }),
      },
    });
    const champion = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
          champion_finish_count: 1,
          first_champion_season_id: SEASON_ID,
          first_champion_at: "2026-08-25T12:00:00.000Z",
          first_champion_rank: 1,
        }),
      },
    });

    const locked = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: rankTwo.client,
    });
    const awarded = await evaluateSeasonBadgeAwardsForPlayer({
      playerId: PLAYER_ID,
      supabase: champion.client,
    });

    expect(locked.createdSlugs).toEqual(["season-podium"]);
    expect(locked.createdSlugs).not.toContain("season-champion");
    expect(awarded.createdSlugs).toEqual([
      "season-podium",
      "season-champion",
    ]);
    expect(champion.upsertPayloads[1]).toMatchObject({
      badge_slug: "season-champion",
      source_type: "season",
      source_id: SEASON_ID,
      source_metadata: expect.objectContaining({
        evaluator: "season-champion",
        officialRank: 1,
      }),
    });
  });

  it("evaluates finalized season badges through the completed tournament live path", async () => {
    const fixture = createAuthorityClient({
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          season_campaigner_count: 1,
          first_season_campaigner_season_id: SEASON_ID,
          first_season_campaigner_at: "2026-08-24T12:00:00.000Z",
          first_season_campaigner_threshold_tournament_id:
            FOURTH_SEASON_TOURNAMENT_ID,
          first_season_campaigner_tournament_count: 4,
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
          champion_finish_count: 1,
          first_champion_season_id: SEASON_ID,
          first_champion_at: "2026-08-25T12:00:00.000Z",
          first_champion_rank: 1,
        }),
      },
    });

    const result = await evaluateTournamentBadgeAwardsForTournament({
      tournamentId: FIRST_TOURNAMENT_ID,
      supabase: fixture.client,
    });

    expect(result.createdSlugs).toEqual([
      "season-campaigner",
      "season-podium",
      "season-champion",
    ]);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_finalized_season_for_tournament",
      { p_tournament_id: FIRST_TOURNAMENT_ID }
    );
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_player_badge_season_authority_participants",
      { p_season_id: SEASON_ID }
    );
  });

  it("does not live-award season badges when the tournament season is not finalized", async () => {
    const fixture = createAuthorityClient({
      tournamentSeasonRows: [],
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          season_campaigner_count: 1,
          first_season_campaigner_season_id: SEASON_ID,
          first_season_campaigner_at: "2026-08-24T12:00:00.000Z",
          first_season_campaigner_threshold_tournament_id:
            FOURTH_SEASON_TOURNAMENT_ID,
          first_season_campaigner_tournament_count: 4,
        }),
      },
    });

    const result = await evaluateSeasonBadgeAwardsForTournament({
      tournamentId: FIRST_TOURNAMENT_ID,
      supabase: fixture.client,
    });

    expect(result.createdCount).toBe(0);
    expect(result.skippedReasons).toContain("season_not_finalized");
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it("keeps repeated season evaluation idempotent and preserves official ties from the summary", async () => {
    const fixture = createAuthorityClient({
      seasonParticipants: [
        { player_id: PLAYER_ID },
        { player_id: OTHER_PLAYER_ID },
      ],
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
        }),
        [OTHER_PLAYER_ID]: seasonSummary({
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
        }),
      },
    });

    const first = await evaluateSeasonBadgeAwardsForSeason({
      seasonId: SEASON_ID,
      supabase: fixture.client,
    });
    const second = await evaluateSeasonBadgeAwardsForSeason({
      seasonId: SEASON_ID,
      supabase: fixture.client,
    });

    expect(first.createdSlugs).toEqual(["season-podium", "season-podium"]);
    expect(second.createdCount).toBe(0);
    expect(fixture.awards.size).toBe(2);
  });

  it("keeps repeated and concurrent profile evaluation idempotent", async () => {
    const fixture = createAuthorityClient();

    const [first, second] = await Promise.all([
      evaluateProfileBadgeAwards({
        playerId: PLAYER_ID,
        supabase: fixture.client,
      }),
      evaluateProfileBadgeAwards({
        playerId: PLAYER_ID,
        supabase: fixture.client,
      }),
    ]);

    expect(first.createdCount + second.createdCount).toBe(1);
    expect(fixture.awards.size).toBe(1);
  });

  it("keeps repeated match source retries idempotent", async () => {
    const fixture = createAuthorityClient({
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 1,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
        }),
      },
    });

    const first = await evaluateMatchBadgeAwardsForMatch({
      matchId: FIRST_MATCH_ID,
      supabase: fixture.client,
    });
    const second = await evaluateMatchBadgeAwardsForMatch({
      matchId: FIRST_MATCH_ID,
      supabase: fixture.client,
    });

    expect(first.createdCount).toBe(1);
    expect(second.createdCount).toBe(0);
    expect([...fixture.awards]).toEqual([
      `${PLAYER_ID}:first-deployment`,
    ]);
  });

  it("backfills First Advance only from genuine played advancement history", async () => {
    const byeOnly = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary(),
      },
    });
    const playedAdvance = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      tournamentPrestigeSummaries: {
        [PLAYER_ID]: tournamentPrestigeSummary({
          played_advance_win_count: 1,
          first_advance_match_id: FIRST_ADVANCE_MATCH_ID,
          first_advance_at: "2026-08-17T12:00:00.000Z",
        }),
      },
    });

    const byeOnlyResult = await backfillInitialBadgeAwards({
      supabase: byeOnly.client,
    });
    const playedAdvanceResult = await backfillInitialBadgeAwards({
      supabase: playedAdvance.client,
    });
    const repeatedPlayedAdvance = await backfillInitialBadgeAwards({
      supabase: playedAdvance.client,
    });

    expect(byeOnlyResult.badgeCounts["first-advance"]).toBe(0);
    expect(byeOnly.upsertPayloads.map((payload) => payload.badge_slug))
      .not.toContain("first-advance");
    expect(playedAdvanceResult.badgeCounts["first-advance"]).toBe(1);
    expect(playedAdvance.upsertPayloads).toContainEqual(
      expect.objectContaining({
        badge_slug: "first-advance",
        source_type: "match",
        source_id: FIRST_ADVANCE_MATCH_ID,
      })
    );
    expect(repeatedPlayedAdvance.badgeCounts["first-advance"]).toBe(0);
  });

  it("backfills match excellence badges idempotently from played-match summaries", async () => {
    const fixture = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      matchExcellenceSummaries: {
        [PLAYER_ID]: matchExcellenceSummary({
          best_win_streak: 5,
          third_streak_match_id: THIRD_STREAK_MATCH_ID,
          third_streak_at: "2026-08-14T12:00:00.000Z",
          fifth_streak_match_id: FIFTH_STREAK_MATCH_ID,
          fifth_streak_at: "2026-08-16T12:00:00.000Z",
          clean_sweep_count: 1,
          first_clean_sweep_match_id: CLEAN_SWEEP_MATCH_ID,
          first_clean_sweep_at: "2026-08-17T12:00:00.000Z",
          upset_win_count: 3,
          first_upset_match_id: FIRST_UPSET_MATCH_ID,
          first_upset_at: "2026-08-18T12:00:00.000Z",
          first_upset_elo_delta: 200,
          third_upset_match_id: THIRD_UPSET_MATCH_ID,
          third_upset_at: "2026-08-20T12:00:00.000Z",
          third_upset_elo_delta: 250,
        }),
      },
    });

    const first = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });
    const second = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });

    expect(first.badgeCounts).toMatchObject({
      "iron-streak": 1,
      "unbroken": 1,
      "clean-sweep": 1,
      "giant-slayer": 1,
      "giant-hunter": 1,
    });
    expect(first.awardsCreated).toBe(6);
    expect(second.awardsCreated).toBe(0);
    expect(fixture.upsertPayloads.map((payload) => payload.badge_slug))
      .toEqual([
        "ironclad-recruit",
        "iron-streak",
        "unbroken",
        "clean-sweep",
        "giant-slayer",
        "giant-hunter",
        "ironclad-recruit",
        "iron-streak",
        "unbroken",
        "clean-sweep",
        "giant-slayer",
        "giant-hunter",
      ]);
  });

  it("backfills finalized season badges idempotently from season summaries", async () => {
    const fixture = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      seasonSummaries: {
        [PLAYER_ID]: seasonSummary({
          season_campaigner_count: 1,
          first_season_campaigner_season_id: SEASON_ID,
          first_season_campaigner_at: "2026-08-24T12:00:00.000Z",
          first_season_campaigner_threshold_tournament_id:
            FOURTH_SEASON_TOURNAMENT_ID,
          first_season_campaigner_tournament_count: 4,
          podium_finish_count: 1,
          first_podium_season_id: SEASON_ID,
          first_podium_at: "2026-08-25T12:00:00.000Z",
          first_podium_rank: 1,
          champion_finish_count: 1,
          first_champion_season_id: SEASON_ID,
          first_champion_at: "2026-08-25T12:00:00.000Z",
          first_champion_rank: 1,
        }),
      },
    });

    const first = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });
    const second = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });

    expect(first.badgeCounts).toMatchObject({
      "season-campaigner": 1,
      "season-podium": 1,
      "season-champion": 1,
    });
    expect(first.awardsCreated).toBe(4);
    expect(second.awardsCreated).toBe(0);
    expect(fixture.upsertPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          badge_slug: "season-campaigner",
          source_type: "season",
          source_id: SEASON_ID,
        }),
        expect.objectContaining({
          badge_slug: "season-podium",
          source_type: "season",
          source_id: SEASON_ID,
        }),
        expect.objectContaining({
          badge_slug: "season-champion",
          source_type: "season",
          source_id: SEASON_ID,
        }),
      ])
    );
  });

  it("runs an idempotent controlled backfill for only implemented authority badges", async () => {
    const fixture = createAuthorityClient({
      backfillPlayers: [PLAYER_ID, OTHER_PLAYER_ID],
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 10,
          win_count: 5,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
          tenth_played_match_id: TENTH_MATCH_ID,
          tenth_played_at: "2026-08-10T12:00:00.000Z",
          first_win_match_id: FIRST_WIN_ID,
          first_win_at: "2026-08-03T12:00:00.000Z",
          fifth_win_match_id: FIFTH_WIN_ID,
          fifth_win_at: "2026-08-11T12:00:00.000Z",
        }),
        [OTHER_PLAYER_ID]: matchSummary(),
      },
    });

    const first = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });
    const second = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });

    expect(first).toMatchObject({
      playersEvaluated: 2,
      awardsCreated: 5,
      errors: [],
    });
    expect(first.badgeCounts).toEqual({
      "ironclad-recruit": 1,
      "first-deployment": 1,
      "first-victory": 1,
      "battle-tested": 1,
      "reliable-competitor": 0,
      "comeback-commander": 0,
      "flawless-campaign": 0,
      "first-campaign": 0,
      "iron-regular": 0,
      "tournament-veteran": 0,
      "rising-through-the-ranks": 0,
      "season-campaigner": 0,
      "five-victories": 1,
      "ten-victories": 0,
      "twenty-five-victories": 0,
      "iron-streak": 0,
      "unbroken": 0,
      "clean-sweep": 0,
      "giant-slayer": 0,
      "giant-hunter": 0,
      "first-advance": 0,
      "semifinalist": 0,
      "finalist": 0,
      "academy-champion": 0,
      "challenge-champion": 0,
      "elite-champion": 0,
      "double-champion": 0,
      "triple-crown": 0,
      "season-podium": 0,
      "season-champion": 0,
    });
    expect(second.awardsCreated).toBe(0);
    expect(
      fixture.upsertPayloads.every((payload) =>
        [
          "ironclad-recruit",
          "first-deployment",
          "first-victory",
          "battle-tested",
          "reliable-competitor",
          "first-campaign",
          "iron-regular",
          "tournament-veteran",
          "season-campaigner",
          "five-victories",
          "ten-victories",
          "twenty-five-victories",
          "iron-streak",
          "unbroken",
          "clean-sweep",
          "giant-slayer",
          "giant-hunter",
          "first-advance",
          "semifinalist",
          "finalist",
          "academy-champion",
          "challenge-champion",
          "elite-champion",
          "double-champion",
          "triple-crown",
          "season-podium",
          "season-champion",
        ].includes(payload.badge_slug)
      )
    ).toBe(true);
  });

  it("backfills Batch 2 match and tournament thresholds idempotently", async () => {
    const fixture = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      summaries: {
        [PLAYER_ID]: matchSummary({
          played_match_count: 25,
          win_count: 25,
          first_played_match_id: FIRST_MATCH_ID,
          first_played_at: "2026-08-03T12:00:00.000Z",
          tenth_played_match_id: TENTH_MATCH_ID,
          tenth_played_at: "2026-08-10T12:00:00.000Z",
          first_win_match_id: FIRST_WIN_ID,
          first_win_at: "2026-08-03T12:00:00.000Z",
          fifth_win_match_id: FIFTH_WIN_ID,
          fifth_win_at: "2026-08-11T12:00:00.000Z",
          tenth_win_match_id: TENTH_WIN_ID,
          tenth_win_at: "2026-08-12T12:00:00.000Z",
          twenty_fifth_win_match_id: TWENTY_FIFTH_WIN_ID,
          twenty_fifth_win_at: "2026-08-13T12:00:00.000Z",
        }),
      },
      tournamentSummaries: {
        [PLAYER_ID]: tournamentSummary({
          completed_tournament_count: 10,
          first_completed_tournament_id: FIRST_TOURNAMENT_ID,
          first_completed_at: "2026-08-14T12:00:00.000Z",
          third_completed_tournament_id: THIRD_TOURNAMENT_ID,
          third_completed_at: "2026-08-15T12:00:00.000Z",
          tenth_completed_tournament_id: TENTH_TOURNAMENT_ID,
          tenth_completed_at: "2026-08-16T12:00:00.000Z",
        }),
      },
    });

    const first = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });
    const second = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });

    expect(first).toMatchObject({
      playersEvaluated: 1,
      awardsCreated: 10,
      errors: [],
    });
    expect(first.badgeCounts).toEqual({
      "ironclad-recruit": 1,
      "first-deployment": 1,
      "first-victory": 1,
      "battle-tested": 1,
      "reliable-competitor": 0,
      "comeback-commander": 0,
      "flawless-campaign": 0,
      "first-campaign": 1,
      "iron-regular": 1,
      "tournament-veteran": 1,
      "rising-through-the-ranks": 0,
      "season-campaigner": 0,
      "five-victories": 1,
      "ten-victories": 1,
      "twenty-five-victories": 1,
      "iron-streak": 0,
      "unbroken": 0,
      "clean-sweep": 0,
      "giant-slayer": 0,
      "giant-hunter": 0,
      "first-advance": 0,
      "semifinalist": 0,
      "finalist": 0,
      "academy-champion": 0,
      "challenge-champion": 0,
      "elite-champion": 0,
      "double-champion": 0,
      "triple-crown": 0,
      "season-podium": 0,
      "season-champion": 0,
    });
    expect(second.awardsCreated).toBe(0);
    expect(fixture.awards.size).toBe(10);
  });

  it("does not backfill match badges from cancelled or voided history omitted by the database summary", async () => {
    const fixture = createAuthorityClient({
      backfillPlayers: [PLAYER_ID],
      summaries: {
        [PLAYER_ID]: matchSummary(),
      },
    });

    const result = await backfillInitialBadgeAwards({
      supabase: fixture.client,
    });

    expect(result).toMatchObject({
      playersEvaluated: 1,
      awardsCreated: 1,
      errors: [],
    });
    expect(result.badgeCounts).toEqual({
      "ironclad-recruit": 1,
      "first-deployment": 0,
      "first-victory": 0,
      "battle-tested": 0,
      "reliable-competitor": 0,
      "comeback-commander": 0,
      "flawless-campaign": 0,
      "first-campaign": 0,
      "iron-regular": 0,
      "tournament-veteran": 0,
      "rising-through-the-ranks": 0,
      "season-campaigner": 0,
      "five-victories": 0,
      "ten-victories": 0,
      "twenty-five-victories": 0,
      "iron-streak": 0,
      "unbroken": 0,
      "clean-sweep": 0,
      "giant-slayer": 0,
      "giant-hunter": 0,
      "first-advance": 0,
      "semifinalist": 0,
      "finalist": 0,
      "academy-champion": 0,
      "challenge-champion": 0,
      "elite-champion": 0,
      "double-champion": 0,
      "triple-crown": 0,
      "season-podium": 0,
      "season-champion": 0,
    });
    expect(fixture.upsertPayloads.map((payload) => payload.badge_slug)).toEqual([
      "ironclad-recruit",
    ]);
  });
});
