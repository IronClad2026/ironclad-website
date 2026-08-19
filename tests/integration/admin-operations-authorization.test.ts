import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  ADMIN_OPERATIONS_ERROR_MESSAGE,
  AdminOperationsMetricsError,
} from "@/lib/admin-operations-metrics";
import { loadAdminOperationsMetrics } from "@/lib/admin-operations";

type MockQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
};

function thenableQuery(result: MockQueryResult, rejection?: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: MockQueryResult) => unknown,
    reject: (reason: unknown) => unknown
  ) =>
    (rejection ? Promise.reject(rejection) : Promise.resolve(result)).then(
      resolve,
      reject
    );
  return query;
}

function adminClientWithResult(result: MockQueryResult, rejection?: unknown) {
  const from = vi.fn(() => thenableQuery(result, rejection));
  createSupabaseAdminClientMock.mockReturnValue({ from });
  return { from };
}

describe("Admin Operations loader authorization and failure isolation", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["unauthenticated", anonymousIdentity],
    ["Player", playerIdentity],
  ])("denies %s access before constructing a trusted client", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(loadAdminOperationsMetrics("30d")).resolves.toBeNull();

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("constructs the trusted client only after an Admin identity is proven", async () => {
    authMock.mockResolvedValue(adminIdentity);
    const { from } = adminClientWithResult({ data: [], error: null, count: 0 });

    const metrics = await loadAdminOperationsMetrics("today");

    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      createSupabaseAdminClientMock.mock.invocationCallOrder[0]
    );
    expect(from).toHaveBeenCalledTimes(10);
    expect(metrics).not.toBeNull();
    expect(metrics).toMatchObject({
      overview: {
        players: { value: 0 },
        registrations: { value: 0 },
        activeTournaments: { value: 0 },
        completedTournaments: { value: 0 },
        openIssues: { value: 0 },
      },
      players: { total: 0, openAccounts: 0 },
      registrations: {
        total: 0,
        withdrawalRate: null,
      },
      tournaments: { total: 0, completionRate: null },
      matches: { total: 0, completed: 0 },
      health: {
        completedTournamentRate: null,
        withdrawalRate: null,
      },
    });
  });

  it("does not convert a missing exact count into an invented zero", async () => {
    authMock.mockResolvedValue(adminIdentity);
    adminClientWithResult({ data: [], error: null, count: null });

    await expect(loadAdminOperationsMetrics("7d")).rejects.toMatchObject({
      name: "AdminOperationsMetricsError",
      message: ADMIN_OPERATIONS_ERROR_MESSAGE,
    });
  });

  it("sanitizes a provider query rejection", async () => {
    const privateProviderMessage =
      "private Supabase relation and credential detail";
    authMock.mockResolvedValue(adminIdentity);
    adminClientWithResult(
      { data: null, error: null, count: null },
      new Error(privateProviderMessage)
    );

    await expect(loadAdminOperationsMetrics("30d")).rejects.toEqual(
      new AdminOperationsMetricsError()
    );

    try {
      await loadAdminOperationsMetrics("30d");
    } catch (caught) {
      expect(String(caught)).not.toContain(privateProviderMessage);
    }
  });

  it("sanitizes trusted-client construction failures", async () => {
    const privateProviderMessage = "private service-role configuration detail";
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockImplementation(() => {
      throw new Error(privateProviderMessage);
    });

    await expect(loadAdminOperationsMetrics("all")).rejects.toMatchObject({
      name: "AdminOperationsMetricsError",
      message: ADMIN_OPERATIONS_ERROR_MESSAGE,
    });

    try {
      await loadAdminOperationsMetrics("all");
    } catch (caught) {
      expect(String(caught)).not.toContain(privateProviderMessage);
    }
  });
});
