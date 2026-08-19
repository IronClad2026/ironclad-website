import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const loadAdminOperationsMetricsMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const dashboardMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/admin-operations", () => ({
  loadAdminOperationsMetrics: loadAdminOperationsMetricsMock,
}));
vi.mock("@/components/admin/operations/AdminOperationsDashboard", () => ({
  default: dashboardMock,
}));

import AdminOperationsPage from "@/app/admin/operations/page";

describe("Admin Operations page authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    loadAdminOperationsMetricsMock.mockReset();
    redirectMock.mockClear();
  });

  it.each([
    ["unauthenticated", anonymousIdentity],
    ["Player", playerIdentity],
  ])("redirects a %s identity before loading private metrics", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(
      AdminOperationsPage({ searchParams: Promise.resolve({ period: "7d" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(loadAdminOperationsMetricsMock).not.toHaveBeenCalled();
  });

  it("passes a validated period and private metrics to the dashboard for an Admin", async () => {
    const metrics = { generatedAt: "test-sentinel" };
    authMock.mockResolvedValue(adminIdentity);
    loadAdminOperationsMetricsMock.mockResolvedValue(metrics);

    const result = await AdminOperationsPage({
      searchParams: Promise.resolve({ period: "today" }),
    });

    expect(loadAdminOperationsMetricsMock).toHaveBeenCalledExactlyOnceWith(
      "today"
    );
    expect(result.type).toBe(dashboardMock);
    expect(result.props.metrics).toBe(metrics);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects if the independently authorized loader withholds data", async () => {
    authMock.mockResolvedValue(adminIdentity);
    loadAdminOperationsMetricsMock.mockResolvedValue(null);

    await expect(
      AdminOperationsPage({
        searchParams: Promise.resolve({ period: "unsupported" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(loadAdminOperationsMetricsMock).toHaveBeenCalledExactlyOnceWith(
      "30d"
    );
  });
});
