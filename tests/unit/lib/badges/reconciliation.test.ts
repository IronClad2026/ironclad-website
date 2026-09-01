import { beforeEach, describe, expect, it, vi } from "vitest";

const evaluateAllBadgeAwardsForPlayerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/badges/authority", () => ({
  BadgeAuthorityError: class BadgeAuthorityError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  evaluateAllBadgeAwardsForPlayer: evaluateAllBadgeAwardsForPlayerMock,
}));

import {
  BadgeReconciliationWorkerError,
  enqueueBadgeReconciliationTarget,
  runBadgeReconciliationWorker,
} from "@/lib/badges/reconciliation";

type ReconciliationClient = NonNullable<
  Parameters<typeof runBadgeReconciliationWorker>[0]
>["supabase"];

describe("Badge reconciliation runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateAllBadgeAwardsForPlayerMock.mockResolvedValue({
      createdCount: 0,
    });
  });

  it("enqueues an exact open-player target through the service-only RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));

    await expect(
      enqueueBadgeReconciliationTarget({
        playerId: "11111111-1111-4111-8111-111111111111",
        reason: "profile_write",
        sourceType: "profile",
        sourceId: "11111111-1111-4111-8111-111111111111",
        supabase: { rpc } as unknown as ReconciliationClient,
      })
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("enqueue_badge_reconciliation_target", {
      p_player_id: "11111111-1111-4111-8111-111111111111",
      p_reason: "profile_write",
      p_source_type: "profile",
      p_source_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("claims a bounded batch, evaluates exact players, and completes independently", async () => {
    const firstPlayerId = "11111111-1111-4111-8111-111111111111";
    const secondPlayerId = "22222222-2222-4222-8222-222222222222";
    evaluateAllBadgeAwardsForPlayerMock.mockImplementation(
      async ({ playerId }: { playerId: string }) => {
        if (playerId === secondPlayerId) {
          throw Object.assign(new Error("failed"), {
            code: "MATCH_SUMMARY_LOAD_FAILED",
          });
        }
        return { createdCount: 1 };
      }
    );

    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_badge_reconciliation_targets") {
        return {
          data: [
            claimedTarget("target-1", firstPlayerId, "token-1"),
            claimedTarget("target-2", secondPlayerId, "token-2"),
          ],
          error: null,
        };
      }
      if (name === "complete_badge_reconciliation_target") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}: ${JSON.stringify(args)}`);
    });

    const result = await runBadgeReconciliationWorker({
      limit: 999,
      supabase: { rpc } as unknown as ReconciliationClient,
    });

    expect(rpc).toHaveBeenCalledWith("claim_badge_reconciliation_targets", {
      p_limit: 50,
    });
    expect(evaluateAllBadgeAwardsForPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: firstPlayerId,
        evaluationMode: "reconciliation",
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      "complete_badge_reconciliation_target",
      expect.objectContaining({
        p_target_id: "target-1",
        p_claim_token: "token-1",
        p_succeeded: true,
        p_error_code: null,
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      "complete_badge_reconciliation_target",
      expect.objectContaining({
        p_target_id: "target-2",
        p_claim_token: "token-2",
        p_succeeded: false,
        p_error_code: "MATCH_SUMMARY_LOAD_FAILED",
      })
    );
    expect(result).toEqual({
      claimed: 2,
      completed: 1,
      retryableFailures: 1,
      completionFailures: 0,
    });
  });

  it("rejects malformed claim rows instead of evaluating an untrusted target", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ target_id: "target-without-a-player" }],
      error: null,
    }));

    await expect(
      runBadgeReconciliationWorker({
        supabase: { rpc } as unknown as ReconciliationClient,
      })
    ).rejects.toBeInstanceOf(BadgeReconciliationWorkerError);
    expect(evaluateAllBadgeAwardsForPlayerMock).not.toHaveBeenCalled();
  });
});

function claimedTarget(
  targetId: string,
  playerId: string,
  claimToken: string
) {
  return {
    target_id: targetId,
    player_id: playerId,
    claim_token: claimToken,
    reason: "match_authority",
    source_type: "match",
    source_id: "33333333-3333-4333-8333-333333333333",
    attempt_count: 1,
  };
}
