import { beforeEach, describe, expect, it, vi } from "vitest";

const evaluateProfileBadgeAwardsMock = vi.hoisted(() => vi.fn());
const evaluateMatchBadgeAwardsForMatchMock = vi.hoisted(() => vi.fn());
const evaluateTournamentBadgeAwardsForMatchMock = vi.hoisted(() => vi.fn());
const enqueueBadgeReconciliationTargetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/badges/authority", () => ({
  BadgeAuthorityError: class BadgeAuthorityError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  evaluateProfileBadgeAwards: evaluateProfileBadgeAwardsMock,
  evaluateMatchBadgeAwardsForMatch: evaluateMatchBadgeAwardsForMatchMock,
  evaluateTournamentBadgeAwardsForMatch:
    evaluateTournamentBadgeAwardsForMatchMock,
}));

vi.mock("@/lib/badges/reconciliation", () => ({
  enqueueBadgeReconciliationTarget: enqueueBadgeReconciliationTargetMock,
}));

import {
  evaluateMatchBadgesAfterCommit,
  evaluateProfileBadgesAfterCommit,
  evaluateReportGroupBadgesAfterCommit,
} from "@/lib/badges/integration";

type IntegrationClient = NonNullable<
  Parameters<typeof evaluateMatchBadgesAfterCommit>[0]["supabase"]
>;

const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ONE_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_TWO_ID = "22222222-2222-4222-8222-222222222222";

describe("Badge post-commit integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    evaluateProfileBadgeAwardsMock.mockResolvedValue({ createdCount: 0 });
    evaluateMatchBadgeAwardsForMatchMock.mockResolvedValue({ createdCount: 0 });
    evaluateTournamentBadgeAwardsForMatchMock.mockResolvedValue({
      createdCount: 0,
    });
    enqueueBadgeReconciliationTargetMock.mockResolvedValue(true);
  });

  it("queues the exact player when a committed profile follow-up fails", async () => {
    evaluateProfileBadgeAwardsMock.mockRejectedValue(
      Object.assign(new Error("failed"), { code: "PROFILE_LOAD_FAILED" })
    );
    const client = createIntegrationClient();

    await expect(
      evaluateProfileBadgesAfterCommit({
        playerId: PLAYER_ONE_ID,
        reason: "profile_write",
        supabase: client,
      })
    ).resolves.toBeUndefined();

    expect(enqueueBadgeReconciliationTargetMock).toHaveBeenCalledWith({
      playerId: PLAYER_ONE_ID,
      reason: "profile_write",
      sourceType: "profile",
      sourceId: PLAYER_ONE_ID,
      supabase: client,
    });
  });

  it("maps registrations.profile_id for both participants when match evaluation fails", async () => {
    evaluateMatchBadgeAwardsForMatchMock.mockRejectedValue(
      Object.assign(new Error("failed"), {
        code: "MATCH_SUMMARY_LOAD_FAILED",
      })
    );
    const client = createIntegrationClient();

    await expect(
      evaluateMatchBadgesAfterCommit({ matchId: MATCH_ID, supabase: client })
    ).resolves.toBeUndefined();

    expect(enqueueBadgeReconciliationTargetMock).toHaveBeenCalledTimes(2);
    expect(enqueueBadgeReconciliationTargetMock).toHaveBeenCalledWith({
      playerId: PLAYER_ONE_ID,
      reason: "match_finalization",
      sourceType: "match",
      sourceId: MATCH_ID,
      supabase: client,
    });
    expect(enqueueBadgeReconciliationTargetMock).toHaveBeenCalledWith({
      playerId: PLAYER_TWO_ID,
      reason: "match_finalization",
      sourceType: "match",
      sourceId: MATCH_ID,
      supabase: client,
    });
  });

  it("resolves a finalized report group to current match authority", async () => {
    const client = createIntegrationClient();

    await evaluateReportGroupBadgesAfterCommit({
      reportGroupId: "44444444-4444-4444-8444-444444444444",
      supabase: client,
    });

    expect(evaluateMatchBadgeAwardsForMatchMock).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      supabase: client,
    });
    expect(evaluateTournamentBadgeAwardsForMatchMock).toHaveBeenCalledWith({
      matchId: MATCH_ID,
      supabase: client,
    });
    expect(enqueueBadgeReconciliationTargetMock).not.toHaveBeenCalled();
  });
});

function createIntegrationClient(): IntegrationClient {
  const from = vi.fn((table: string) => {
    if (table === "match_result_report_groups") {
      return maybeSingleQuery({ match_id: MATCH_ID });
    }

    if (table === "tournament_matches") {
      return maybeSingleQuery({
        player_one_registration_id:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        player_two_registration_id:
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      });
    }

    if (table === "registrations") {
      const query = {
        select: vi.fn(),
        in: vi.fn(async () => ({
          data: [
            { profile_id: PLAYER_ONE_ID },
            { profile_id: PLAYER_TWO_ID },
          ],
          error: null,
        })),
      };
      query.select.mockReturnValue(query);
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, rpc: vi.fn() } as unknown as IntegrationClient;
}

function maybeSingleQuery(data: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
