import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasCurrentPatch2AdminAccess, requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), clerk: vi.fn(), getUser: vi.fn(), getSession: vi.fn(),
  admin: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn(),
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
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockResolvedValue({ data: "active-player", error: null });
});

describe("current Patch 2 administrator access", () => {
  it("requires a signed-in session with the exact admin claim before provider access", async () => {
    await expect(hasCurrentPatch2AdminAccess(USER, { metadata: { role: "Admin" } }, SESSION)).resolves.toBe(false);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, null)).resolves.toBe(false);
    await expect(hasCurrentPatch2AdminAccess(null, CLAIMS, SESSION)).resolves.toBe(false);
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("looks up the current Clerk user and session before checking durable account state", async () => {
    await expect(requireCurrentPatch2Admin()).resolves.toBe(USER);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(USER);
    expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_patch2_admin_account_state", {
      p_clerk_user_id: USER,
    });
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
    mocks.abortSignal.mockResolvedValue({ data: "no-player", error: null });
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION)).resolves.toBe(true);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION, true)).resolves.toBe(false);
  });

  it("uses verified account states without widening private assistance access", async () => {
    mocks.abortSignal.mockResolvedValueOnce({ data: "verified-active-player", error: null })
      .mockResolvedValue({ data: "verified-staff", error: null });
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION, true)).resolves.toBe(true);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION)).resolves.toBe(true);
    await expect(hasCurrentPatch2AdminAccess(USER, CLAIMS, SESSION, true)).resolves.toBe(false);
  });

  it("rechecks durable state and denies a previously authorized staff session after closure", async () => {
    mocks.abortSignal.mockResolvedValueOnce({ data: "no-player", error: null })
      .mockResolvedValueOnce({ data: "denied", error: null });
    await expect(requireCurrentPatch2Admin()).resolves.toBe(USER);
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed for an unknown database response", async () => {
    mocks.abortSignal.mockResolvedValue({ data: "unknown", error: null });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
  });

  it("fails closed without exposing provider or database failures", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("private Clerk response"));
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.abortSignal.mockResolvedValue({ data: null, error: { message: "private database response" } });
    await expect(requireCurrentPatch2Admin()).rejects.toThrow("Unauthorized");
  });
});
