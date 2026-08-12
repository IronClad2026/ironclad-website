import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { recalculateLeaderboardAllTime } from "@/lib/leaderboard/admin";

const runId = "9e0dc4ee-1803-4d25-97fc-59f0da1ec72b";

function createRecalculationClient(options?: {
  rpcError?: { message: string };
  runStatus?: "pending" | "completed" | "failed";
}) {
  const runQuery = {
    eq: vi.fn(() => runQuery),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: runId,
        status: options?.runStatus ?? "completed",
        notes: null,
      },
      error: null,
    })),
    select: vi.fn(() => runQuery),
  };
  const client = {
    from: vi.fn(() => runQuery),
    rpc: vi.fn(async () => ({
      data: options?.rpcError ? null : runId,
      error: options?.rpcError ?? null,
    })),
  };

  return { client, runQuery };
}

describe("leaderboard manual recalculation authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["player", playerIdentity],
  ])("rejects the %s identity before service-role access", async (_name, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(recalculateLeaderboardAllTime()).resolves.toEqual({
      status: "error",
      message: "Only administrators can recalculate leaderboards.",
      runId: undefined,
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps the administrator all-time recovery RPC available", async () => {
    const recalculation = createRecalculationClient();
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(recalculation.client);

    await expect(recalculateLeaderboardAllTime()).resolves.toEqual({
      status: "success",
      message: "All-time leaderboard recalculated.",
      runId,
    });
    expect(recalculation.client.rpc).toHaveBeenCalledWith(
      "recalculate_leaderboard_all_time",
      { p_triggered_by_clerk_user_id: adminIdentity.userId }
    );
    expect(recalculation.client.from).toHaveBeenCalledWith(
      "leaderboard_recalculation_runs"
    );
  });

  it("returns safe application copy when the provider RPC fails", async () => {
    const privateProviderDetail = "private-clerk-id signed-path internal-detail";
    const recalculation = createRecalculationClient({
      rpcError: { message: privateProviderDetail },
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(recalculation.client);

    const result = await recalculateLeaderboardAllTime();

    expect(result).toEqual({
      status: "error",
      message: "All-time leaderboard recalculation failed.",
      runId: undefined,
    });
    expect(result.message).not.toContain(privateProviderDetail);
  });
});
