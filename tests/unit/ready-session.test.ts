import { afterEach, expect, it, vi } from "vitest";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { loadReadyActiveProfile } from "@/lib/ready/platform-data";
import { loadReadyAccess, loadReadyUsageReviewer } from "@/lib/ready/session";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock("@/lib/ready/platform-data", () => ({ loadReadyActiveProfile: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("checks account closure through the scoped server lookup only after fixture authentication", async () => {
  for (const [key, value] of Object.entries({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    CLERK_SECRET_KEY: "sk_test_example",
    READY_STAGING_REVIEW_ALIASES: "TestAcademy1",
  })) vi.stubEnv(key, value);
  vi.mocked(auth).mockResolvedValue({ userId: "actor", sessionId: "session" } as Awaited<ReturnType<typeof auth>>);
  const fixture = { id: "actor", banned: false, locked: false, privateMetadata: {
    ironclad_fixture_alias: "TestAcademy1",
    ironclad_fixture_source: "staging_synthetic_uat",
    ironclad_fixture_contract_version: "staging-synthetic-v1",
  } };
  const getUser = vi.fn().mockResolvedValue({ ...fixture, locked: true });
  vi.mocked(clerkClient).mockResolvedValue({ users: { getUser } } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  expect(await loadReadyUsageReviewer()).toBeNull();
  expect(loadReadyActiveProfile).not.toHaveBeenCalled();

  getUser.mockResolvedValue(fixture);
  vi.mocked(loadReadyActiveProfile).mockResolvedValue(null);
  expect(await loadReadyUsageReviewer()).toBeNull();
  expect(loadReadyActiveProfile).toHaveBeenCalledWith("actor");

  vi.mocked(loadReadyActiveProfile).mockResolvedValue({ id: "profile", profile_completed: true, account_closed_at: null });
  expect(await loadReadyUsageReviewer()).toEqual({ userId: "actor", sessionId: "session" });
});

it("does not look up a Clerk user or player profile for a visitor", async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null, sessionId: null } as Awaited<ReturnType<typeof auth>>);
  expect(await loadReadyAccess()).toEqual({ kind: "guest" });
  expect(clerkClient).not.toHaveBeenCalled();
  expect(loadReadyActiveProfile).not.toHaveBeenCalled();
});

it.each([{}, { role: "admin" }])("admits an active signed-in account independently of a player profile (%o)", async (publicMetadata) => {
  vi.mocked(auth).mockResolvedValue({ userId: "actor", sessionId: "session" } as Awaited<ReturnType<typeof auth>>);
  const getUser = vi.fn().mockResolvedValue({ id: "actor", banned: false, locked: false, privateMetadata: {}, publicMetadata });
  vi.mocked(clerkClient).mockResolvedValue({ users: { getUser } } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  expect(await loadReadyAccess()).toEqual({ kind: "signed-in", identity: { userId: "actor", sessionId: "session" } });
  expect(loadReadyActiveProfile).not.toHaveBeenCalled();
});

it.each([{ banned: true }, { locked: true }, { id: "different" }])("rejects a restricted Clerk account (%o)", async (restriction) => {
  vi.mocked(auth).mockResolvedValue({ userId: "actor", sessionId: "session" } as Awaited<ReturnType<typeof auth>>);
  const getUser = vi.fn().mockResolvedValue({ id: "actor", banned: false, locked: false, ...restriction });
  vi.mocked(clerkClient).mockResolvedValue({ users: { getUser } } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  expect(await loadReadyAccess()).toEqual({ kind: "restricted" });
});

it("fails closed when a signed-in actor is missing a session", async () => {
  vi.mocked(auth).mockResolvedValue({ userId: "actor", sessionId: null } as unknown as Awaited<ReturnType<typeof auth>>);
  expect(await loadReadyAccess()).toEqual({ kind: "restricted" });
  expect(clerkClient).not.toHaveBeenCalled();
});
