import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const loadAdminOperationsMetricsMock = vi.hoisted(() => vi.fn());
const loadAdminWebsiteTrafficMock = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/vercel-web-analytics", () => ({
  loadAdminWebsiteTraffic: loadAdminWebsiteTrafficMock,
}));
vi.mock("@/components/admin/operations/AdminOperationsDashboard", () => ({
  default: dashboardMock,
}));

import AdminOperationsPage from "@/app/admin/operations/page";

describe("Admin Operations page authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    loadAdminOperationsMetricsMock.mockReset();
    loadAdminWebsiteTrafficMock.mockReset();
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
    expect(loadAdminWebsiteTrafficMock).not.toHaveBeenCalled();
  });

  it("passes operational and traffic results to the dashboard for an Admin", async () => {
    const metrics = { generatedAt: "test-sentinel" };
    const websiteTraffic = {
      status: "unavailable",
      reason: "non-production",
    };
    authMock.mockResolvedValue(adminIdentity);
    loadAdminOperationsMetricsMock.mockResolvedValue(metrics);
    loadAdminWebsiteTrafficMock.mockResolvedValue(websiteTraffic);

    const result = await AdminOperationsPage({
      searchParams: Promise.resolve({ period: "today" }),
    });

    expect(loadAdminOperationsMetricsMock).toHaveBeenCalledExactlyOnceWith(
      "today"
    );
    expect(loadAdminWebsiteTrafficMock).toHaveBeenCalledExactlyOnceWith();
    expect(result.type).toBe(dashboardMock);
    expect(result.props.metrics).toBe(metrics);
    expect(result.props.websiteTraffic).toBe(websiteTraffic);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects if the independently authorized loader withholds data", async () => {
    authMock.mockResolvedValue(adminIdentity);
    loadAdminOperationsMetricsMock.mockResolvedValue(null);
    loadAdminWebsiteTrafficMock.mockResolvedValue({
      status: "unavailable",
      reason: "non-production",
    });

    await expect(
      AdminOperationsPage({
        searchParams: Promise.resolve({ period: "unsupported" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(loadAdminOperationsMetricsMock).toHaveBeenCalledExactlyOnceWith(
      "30d"
    );
    expect(loadAdminWebsiteTrafficMock).toHaveBeenCalledExactlyOnceWith();
  });

  it("redirects if the independently authorized traffic loader withholds data", async () => {
    authMock.mockResolvedValue(adminIdentity);
    loadAdminOperationsMetricsMock.mockResolvedValue({
      generatedAt: "test-sentinel",
    });
    loadAdminWebsiteTrafficMock.mockResolvedValue(null);

    await expect(
      AdminOperationsPage({
        searchParams: Promise.resolve({ period: "7d" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(loadAdminOperationsMetricsMock).toHaveBeenCalledExactlyOnceWith(
      "7d"
    );
    expect(loadAdminWebsiteTrafficMock).toHaveBeenCalledExactlyOnceWith();
  });
});
