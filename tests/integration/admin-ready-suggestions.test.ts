import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerk: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  accountState: vi.fn(),
  legalAcceptance: vi.fn(),
  suggestions: vi.fn(),
  review: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerk }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legalAcceptance }));

import { loadReadySuggestions, mutateReadySuggestion, readySuggestionFilters } from "@/lib/ready/suggestions-admin";

const identity = { userId: "admin-ready-test", sessionId: "session-ready-test", sessionClaims: { metadata: { role: "admin" } } };
const clerkUser = { id: identity.userId, banned: false, locked: false, publicMetadata: { role: "admin" } };
const suggestion = {
  id: "50d6113a-c3ed-4e4c-acdc-da012a83f32f",
  categoryId: "rules",
  submittedAt: "2026-11-16T20:00:00+00:00",
  description: "Example suggestion for a Ready topic.",
  status: "new",
  menuVersion: "3",
  catalogueVersion: "1",
};

describe("Written Ready suggestions admin access", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zzbnneprhjicmajpjkdg.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("READY_STAGING_REVIEW_ALIASES", "");
    mocks.auth.mockResolvedValue(identity);
    mocks.user.mockResolvedValue(clerkUser);
    mocks.session.mockResolvedValue({
      id: identity.sessionId, userId: identity.userId, status: "active", expireAt: Date.now() + 60_000,
    });
    mocks.clerk.mockResolvedValue({ users: { getUser: mocks.user }, sessions: { getSession: mocks.session } });
    mocks.accountState.mockResolvedValue({ data: "verified-staff", error: null });
    mocks.suggestions.mockResolvedValue({
      data: { rows: [{ ...suggestion, privateMetadata: "unexpected-private-value" }], total: 21 }, error: null,
    });
    mocks.review.mockResolvedValue({ data: "updated", error: null });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_patch2_admin_account_state") return { abortSignal: mocks.accountState };
      if (name === "get_ready_topic_suggestions") return { abortSignal: mocks.suggestions };
      if (name === "review_ready_topic_suggestion") return { abortSignal: mocks.review };
      throw new Error("Unexpected database call");
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("loads a bounded, filtered page for authorized admins while usage analytics are disabled", async () => {
    const filters = readySuggestionFilters("new", "2");
    await expect(loadReadySuggestions(filters)).resolves.toEqual({
      status: "ready", filters, items: [suggestion], total: 21, pages: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_ready_topic_suggestions", { p_status: "new", p_limit: 20, p_offset: 20 });
    expect(mocks.user).toHaveBeenCalledTimes(2);
  });

  it.each(["player", "signed-out", "stale admin claim", "wrong Supabase environment"])(
    "blocks a %s from reading or mutating a suggestion",
    async (reason) => {
      if (reason === "player") mocks.auth.mockResolvedValue({ ...identity, sessionClaims: { metadata: { role: "player" } } });
      if (reason === "signed-out") mocks.auth.mockResolvedValue({ userId: null, sessionId: null, sessionClaims: null });
      if (reason === "stale admin claim") mocks.user.mockResolvedValue({ ...clerkUser, publicMetadata: { role: "player" } });
      if (reason === "wrong Supabase environment") vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unknown.supabase.co");
      await expect(loadReadySuggestions(readySuggestionFilters(null, null))).resolves.toEqual({ status: "unauthorized" });
      await expect(mutateReadySuggestion(suggestion.id, null, "delete")).resolves.toBe("unauthorized");
      expect(mocks.suggestions).not.toHaveBeenCalled();
      expect(mocks.review).not.toHaveBeenCalled();
    },
  );

  it("withholds suggestion text after a mid-request admin role change", async () => {
    mocks.user.mockResolvedValueOnce(clerkUser).mockResolvedValueOnce({ ...clerkUser, publicMetadata: { role: "player" } });
    await expect(loadReadySuggestions(readySuggestionFilters(null, null))).resolves.toEqual({ status: "unauthorized" });
    expect(mocks.suggestions).toHaveBeenCalledOnce();
  });

  it("distinguishes an unavailable suggestion store from a genuinely empty list", async () => {
    const filters = readySuggestionFilters("unknown", "0");
    mocks.suggestions.mockResolvedValueOnce({ data: { rows: [], total: 0 }, error: null });
    await expect(loadReadySuggestions(filters)).resolves.toEqual({
      status: "ready", filters: { status: null, page: 1 }, items: [], total: 0, pages: 1,
    });
    mocks.suggestions.mockResolvedValueOnce({ data: null, error: { code: "test-unavailable" } });
    await expect(loadReadySuggestions(filters)).resolves.toEqual({ status: "unavailable", filters });
  });

  it("validates the operation and status, and preserves the account notice requirement", async () => {
    await expect(mutateReadySuggestion("bad-id", "reviewed", "review")).resolves.toBe("invalid");
    await expect(mutateReadySuggestion(suggestion.id, "bad-status", "review")).resolves.toBe("invalid");
    await expect(mutateReadySuggestion(suggestion.id, "reviewed", "bad-operation")).resolves.toBe("invalid");
    mocks.legalAcceptance.mockRejectedValueOnce(new Error("notice required"));
    await expect(mutateReadySuggestion(suggestion.id, "reviewed", "review")).resolves.toBe("notice-required");
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("rechecks authorization after accepting the notices and immediately before mutation", async () => {
    mocks.accountState.mockResolvedValueOnce({ data: "verified-staff", error: null })
      .mockResolvedValueOnce({ data: "closed", error: null });
    await expect(mutateReadySuggestion(suggestion.id, null, "delete")).resolves.toBe("unauthorized");
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("accepts only persistence-confirmed review and delete responses", async () => {
    await expect(mutateReadySuggestion(suggestion.id, "added", "review")).resolves.toBe("updated");
    expect(mocks.rpc).toHaveBeenCalledWith("review_ready_topic_suggestion", {
      p_id: suggestion.id, p_status: "added", p_delete: false,
    });
    mocks.review.mockResolvedValueOnce({ data: "deleted", error: null });
    await expect(mutateReadySuggestion(suggestion.id, null, "delete")).resolves.toBe("deleted");
    expect(mocks.rpc).toHaveBeenCalledWith("review_ready_topic_suggestion", {
      p_id: suggestion.id, p_status: null, p_delete: true,
    });
    mocks.review.mockResolvedValueOnce({ data: "not_found", error: null });
    await expect(mutateReadySuggestion(suggestion.id, null, "delete")).resolves.toBe("missing");
    mocks.review.mockResolvedValueOnce({ data: null, error: { code: "test-timeout" } });
    await expect(mutateReadySuggestion(suggestion.id, "reviewed", "review")).resolves.toBe("unavailable");
  });
});
