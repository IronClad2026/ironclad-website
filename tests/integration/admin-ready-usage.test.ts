import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerk: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  accountState: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerk }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));

import { loadReadyUsageReport, parseReadyUsageFilters } from "@/lib/ready/usage-admin";

const identity = { userId: "admin-review-test", sessionId: "review-session-test", sessionClaims: { metadata: { role: "admin" } } };
const clerkUser = { id: identity.userId, banned: false, locked: false, publicMetadata: { role: "admin" } };
const dbResponse = () => ({
  coverage: { availableFrom: "2026-03-06", retainedDetailFrom: "2026-08-21", collected: true, timezone: "Australia/Sydney" },
  versions: [{ menuVersion: "1", catalogueVersion: "1" }],
  totals: {
    engagedAccounts: 1, engagedSessions: 2, manualOpenings: 3, categorySelections: 2, questionSelections: 2,
    answerDisplays: 2, actionClicks: 1, unmatchedSearches: 1, fallbacks: 1, technicalErrors: 0, helpful: 1, stillNeedHelp: 0,
  },
  trend: [{ date: "2026-11-17", manualOpenings: 3, answerDisplays: 2, actionClicks: 1 }],
  categories: [{ id: "rules", count: 2 }],
  questions: [{ id: "scheduling", selections: 2, displays: 2, helpful: 1, stillNeedHelp: 0 }],
  destinations: [{ id: "rules", count: 1 }],
});

describe("Admin Ready usage access", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T16:00:00.000Z"));
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zzbnneprhjicmajpjkdg.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("READY_STAGING_REVIEW_ALIASES", "TestAcademy1");

    mocks.auth.mockResolvedValue(identity);
    mocks.user.mockResolvedValue(clerkUser);
    mocks.session.mockResolvedValue({
      id: identity.sessionId, userId: identity.userId, status: "active", expireAt: Date.now() + 60_000,
    });
    mocks.clerk.mockResolvedValue({ users: { getUser: mocks.user }, sessions: { getSession: mocks.session } });
    mocks.accountState.mockResolvedValue({ data: "verified-staff", error: null });
    mocks.report.mockImplementation(async () => ({ data: dbResponse(), error: null }));
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_patch2_admin_account_state") return { abortSignal: mocks.accountState };
      if (name === "get_ready_usage_report") return { abortSignal: mocks.report };
      throw new Error("Unexpected database call");
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("checks account and role before querying, rechecks after, and reports trusted distinct counts", async () => {
    const result = await loadReadyUsageReport({ period: "7d", version: "1/1", role: "admin", accountId: "other-account" });

    expect(result).toMatchObject({
      status: "ready",
      report: { totals: { engagedAccounts: 1, engagedSessions: 2, manualOpenings: 3 } },
    });
    expect(mocks.rpc.mock.calls).toEqual([
      ["get_patch2_admin_account_state", { p_clerk_user_id: identity.userId }],
      ["get_ready_usage_report", {
        p_start: "2026-11-11", p_end: "2026-11-17", p_menu_version: "1", p_catalogue_version: "1", p_cohort: "reviewer",
      }],
      ["get_patch2_admin_account_state", { p_clerk_user_id: identity.userId }],
    ]);
    expect(mocks.user).toHaveBeenCalledTimes(2);
  });

  it("blocks a stale admin claim after Clerk demotion before opening the report", async () => {
    mocks.user.mockResolvedValue({ ...clerkUser, publicMetadata: { role: "player" } });
    await expect(loadReadyUsageReport({})).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("withholds the aggregate if Clerk demotes the admin while the report is loading", async () => {
    mocks.user.mockResolvedValueOnce(clerkUser).mockResolvedValueOnce({ ...clerkUser, publicMetadata: { role: "player" } });
    await expect(loadReadyUsageReport({})).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.report).toHaveBeenCalledOnce();
    expect(mocks.user).toHaveBeenCalledTimes(2);
  });

  it.each(["closed immediately", "closed while reading"])("denies access when the site account is %s", async (reason) => {
    if (reason === "closed while reading") mocks.accountState.mockResolvedValueOnce({ data: "verified-staff", error: null });
    mocks.accountState.mockResolvedValue({ data: "closed", error: null });
    await expect(loadReadyUsageReport({})).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.report).toHaveBeenCalledTimes(reason === "closed while reading" ? 1 : 0);
  });

  it("rejects a player claiming an admin role in the query", async () => {
    mocks.auth.mockResolvedValue({ ...identity, sessionClaims: { metadata: { role: "player" } } });
    await expect(loadReadyUsageReport({ role: "admin", cohort: "reviewer" })).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the reviewer data out of the player adoption view and outside the Staging trial", async () => {
    await expect(loadReadyUsageReport({ cohort: "player" })).resolves.toMatchObject({ status: "not-collected" });
    expect(mocks.report).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(loadReadyUsageReport({ cohort: "reviewer" })).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("omits identity data and exact distinct counts for a range containing archived days", async () => {
    const row = dbResponse();
    mocks.report.mockResolvedValue({
      data: { ...row, accountKey: "opaque-account", questions: [{ ...row.questions[0], privateMatchReference: "match-private" }] },
      error: null,
    });
    const result = await loadReadyUsageReport({ period: "custom", start: "2025-10-01", end: "2026-01-01" });
    expect(result).toMatchObject({ status: "unavailable" }); // Conflicting daily rows fail closed.

    mocks.report.mockResolvedValue({
      data: { ...row, trend: [], accountKey: "opaque-account", questions: [{ ...row.questions[0], privateMatchReference: "match-private" }] },
      error: null,
    });
    const withArchive = await loadReadyUsageReport({ period: "custom", start: "2026-03-01", end: "2026-11-17" });
    expect(withArchive).toMatchObject({ status: "ready", report: { totals: { engagedAccounts: null, engagedSessions: null } } });
    expect(JSON.stringify(withArchive)).not.toMatch(/opaque-account|match-private/);
  });

  it("distinguishes wholly expired dates from temporary service failures", async () => {
    await expect(loadReadyUsageReport({ period: "custom", start: "2025-01-01", end: "2025-11-17" }))
      .resolves.toMatchObject({ status: "outside-retention" });
    expect(mocks.report).not.toHaveBeenCalled();
    mocks.report.mockRejectedValueOnce(new Error("test database unavailable"));
    await expect(loadReadyUsageReport({})).resolves.toMatchObject({ status: "unavailable" });
  });
});

describe("Ready usage date filters", () => {
  const now = new Date("2026-11-16T16:00:00.000Z");

  it("handles Sydney midnight and archive bounds", () => {
    expect(parseReadyUsageFilters({ period: "30d" }, now))
      .toMatchObject({ today: "2026-11-17", retainedFrom: "2025-11-18", start: "2026-10-19", end: "2026-11-17" });
    expect(parseReadyUsageFilters({}, new Date("2028-02-29T01:00:00Z")))
      .toMatchObject({ today: "2028-02-29", retainedFrom: "2027-03-01" });
  });

  it.each([
    { start: "2026-02-31", end: "2026-03-05" },
    { start: "2026-10-20", end: "2026-10-19" },
    { start: "2026-10-19", end: "2026-11-18" },
    { start: "2025-11-16", end: "2026-11-17" },
  ])("falls back to a bounded date range for invalid dates or spans %j", (dates) => {
    expect(parseReadyUsageFilters({ period: "custom", ...dates }, now))
      .toMatchObject({ period: "30d", invalidRange: true, start: "2026-10-19", end: "2026-11-17" });
  });
});
