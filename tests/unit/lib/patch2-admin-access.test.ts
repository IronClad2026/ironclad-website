import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasCurrentPatch2AdminAccess, requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), clerk: vi.fn(), getUser: vi.fn(), getSession: vi.fn(),
  admin: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerk }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));

const USER = "user_synthetic_patch2_admin";
const SESSION = "sess_synthetic_patch2_admin";
const CLAIMS = { metadata: { role: "admin" } };
const activeUser = { id: USER, publicMetadata: { role: "admin" }, banned: false, locked: false };
const activeSession = () => ({ id: SESSION, userId: USER, status: "active", expireAt: Date.now() + 60_000 });

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: USER, sessionId: SESSION, sessionClaims: CLAIMS });
  mocks.clerk.mockResolvedValue({ users: { getUser: mocks.getUser }, sessions: { getSession: mocks.getSession } });
  mocks.getUser.mockResolvedValue(activeUser);
  mocks.getSession.mockResolvedValue(activeSession());
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { account_closed_at: null }, error: null });
});

describe("current Patch 2 administrator access", () => {
  it("requires a signed-in session with the exact admin claim before provider access", async () => {
    await expect(hasCurrentPatch2AdminAccess(USER, { metadata: { role: "Admin" } }, SESSION)).resolves.toBe(false);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, null)).resolves.toBe(false);
    await expect(hasCurrentPatch2AdminAccess(null, CLAIMS, SESSION)).resolves.toBe(false);
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("looks up the current Clerk user and session before checking the caller's Player status", async () => {
    await expect(requireCurrentPatch2Admin()).resolves.toBe(USER);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(USER);
    expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("players");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("account_closed_at");
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("clerk_user_id", USER);
  });

  it.each([
    { publicMetadata: { role: "player" } }, { banned: true }, { locked: true }, { id: "foreign-user" },
  ])("denies a stale claim for a changed or blocked Clerk user: %j", async (changedUser) => {
    mocks.getUser.mockResolvedValue({ ...activeUser, ...changedUser });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    { status: "revoked" }, { status: "ended" }, { expireAt: 0 }, { userId: "foreign-user" }, { id: "foreign-session" },
  ])("denies expired, revoked, or mismatched sessions: %j", async (changedSession) => {
    mocks.getSession.mockResolvedValue({ ...activeSession(), ...changedSession });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("allows staff without a Player on the scoped inbox and registration pages only", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION)).resolves.toBe(true);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION, true)).resolves.toBe(false);
  });

  it("denies a linked closed Player even while Clerk is active", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { account_closed_at: "2026-11-13T00:00:00Z" }, error: null });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
  });

  it("fails closed without exposing provider or database failures", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("private Clerk response"));
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "private database response" } });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
  });
});
