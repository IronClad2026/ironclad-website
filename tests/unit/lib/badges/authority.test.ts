import { describe, expect, it, vi } from "vitest";
import {
  backfillInitialBadgeAwards,
  evaluateMatchBadgeAwardsForMatch,
  evaluateMatchBadgeAwardsForPlayer,
  evaluateProfileBadgeAwards,
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
  participants?: Array<Record<string, unknown>>;
  backfillPlayers?: string[];
  existingAwards?: string[];
};

function verifiedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
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
    ...overrides,
  };
}

function createAuthorityClient(options: FakeAuthorityClientOptions = {}) {
  const awards = new Set(options.existingAwards ?? []);
  const upsertPayloads: BadgeAwardPayload[] = [];
  const profile = options.profile === undefined
    ? verifiedProfile()
    : options.profile;
  const summaries: Record<string, Record<string, unknown>> =
    options.summaries ?? {
    [PLAYER_ID]: matchSummary(),
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
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
        order: vi.fn(async () => ({
          data: backfillPlayers.map((id) => ({ id })),
          error: null,
        })),
        select: vi.fn(() => query),
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

    if (name === "get_player_badge_match_summary") {
      return {
        data: [
          summaries[String(args.p_player_id)] ?? matchSummary(),
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
      "get_player_badge_match_summary",
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
      "get_player_badge_match_summary",
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
    ]);
    expect(result.skippedReasons).toEqual([
      "first-deployment_threshold_not_met",
      "battle-tested_threshold_not_met",
      "first-victory_threshold_not_met",
      "five-victories_threshold_not_met",
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

  it("runs an idempotent controlled backfill for only the first five authority badges", async () => {
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
      "five-victories": 1,
    });
    expect(second.awardsCreated).toBe(0);
    expect(
      fixture.upsertPayloads.every((payload) =>
        [
          "ironclad-recruit",
          "first-deployment",
          "first-victory",
          "battle-tested",
          "five-victories",
        ].includes(payload.badge_slug)
      )
    ).toBe(true);
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
      "five-victories": 0,
    });
    expect(fixture.upsertPayloads.map((payload) => payload.badge_slug)).toEqual([
      "ironclad-recruit",
    ]);
  });
});
