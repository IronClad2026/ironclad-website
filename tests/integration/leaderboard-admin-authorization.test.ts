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

import {
  deleteLeaderboardRecalculationRuns,
  getRecentLeaderboardRecalculationRuns,
  recalculateLeaderboardAllTime,
  recalculateLeaderboardForCurrentSeason,
} from "@/lib/leaderboard/admin";

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

function createCurrentSeasonClient(activeSeasonId: string | null) {
  const seasonQuery = {
    eq: vi.fn(() => seasonQuery),
    maybeSingle: vi.fn(async () => ({
      data: activeSeasonId ? { id: activeSeasonId } : null,
      error: null,
    })),
    select: vi.fn(() => seasonQuery),
  };
  const runQuery = {
    eq: vi.fn(() => runQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: runId, status: "completed", notes: null },
      error: null,
    })),
    select: vi.fn(() => runQuery),
  };
  const client = {
    from: vi.fn((table: string) =>
      table === "leaderboard_seasons" ? seasonQuery : runQuery
    ),
    rpc: vi.fn(async () => ({ data: runId, error: null })),
  };

  return { client, seasonQuery };
}

function createThenableRunQuery(result: {
  data: Array<Record<string, unknown>>;
  error: null;
}) {
  const query = {
    delete: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return query;
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

  it("keeps current-season recovery available without pre-creating a season", async () => {
    const currentSeasonId = "2361a5dd-64c4-44b3-bf60-29f6772379a9";
    const recalculation = createCurrentSeasonClient(currentSeasonId);
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(recalculation.client);

    await expect(recalculateLeaderboardForCurrentSeason()).resolves.toEqual({
      status: "success",
      message: "Current season leaderboard recalculated.",
      runId,
    });
    expect(recalculation.client.rpc).toHaveBeenCalledWith(
      "recalculate_leaderboard_for_season",
      {
        p_season_id: currentSeasonId,
        p_triggered_by_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(recalculation.client.rpc).not.toHaveBeenCalledWith(
      "get_or_create_leaderboard_season",
      expect.anything()
    );
  });

  it("does not create an empty future season when no active season exists", async () => {
    const recalculation = createCurrentSeasonClient(null);
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(recalculation.client);

    await expect(recalculateLeaderboardForCurrentSeason()).resolves.toEqual({
      status: "error",
      message: "There is no active leaderboard season to recalculate.",
      runId: undefined,
    });
    expect(recalculation.client.rpc).not.toHaveBeenCalled();
  });

  it("reads recalculation history through the Clerk-authorized service client", async () => {
    const runQuery = createThenableRunQuery({
      data: [
        {
          id: runId,
          scope: "all_time",
          status: "completed",
          started_at: "2026-08-14T00:00:00.000Z",
          finished_at: "2026-08-14T00:00:01.000Z",
          notes: null,
          tournament_id: null,
          season_id: null,
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn(() => runQuery),
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(getRecentLeaderboardRecalculationRuns()).resolves.toEqual([
      expect.objectContaining({
        id: runId,
        scope: "all_time",
        status: "completed",
      }),
    ]);
    expect(client.from).toHaveBeenCalledWith("leaderboard_recalculation_runs");
    expect(runQuery.select).toHaveBeenCalledWith(
      "id, scope, status, started_at, finished_at, notes, tournament_id, season_id"
    );
  });

  it("rejects recalculation-history deletion before service-role access", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(deleteLeaderboardRecalculationRuns([runId])).resolves.toEqual({
      status: "error",
      message:
        "Only administrators can delete leaderboard recalculation run records.",
      runId: undefined,
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps administrator run-record deletion on the service-role path", async () => {
    const matchingQuery = createThenableRunQuery({
      data: [{ id: runId }],
      error: null,
    });
    const deletionQuery = createThenableRunQuery({
      data: [{ id: runId }],
      error: null,
    });
    const verificationQuery = createThenableRunQuery({ data: [], error: null });
    const queries = [matchingQuery, deletionQuery, verificationQuery];
    const client = {
      from: vi.fn(() => {
        const query = queries.shift();
        if (!query) {
          throw new Error("Unexpected recalculation-run query.");
        }
        return query;
      }),
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(deleteLeaderboardRecalculationRuns([runId])).resolves.toEqual({
      status: "success",
      message: "Deleted 1 recalculation run record.",
      deletedRunIds: [runId],
    });
    expect(client.from).toHaveBeenCalledTimes(3);
    expect(deletionQuery.delete).toHaveBeenCalledOnce();
    expect(verificationQuery.select).toHaveBeenCalledWith("id");
  });
});
