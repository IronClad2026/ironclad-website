import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { getAdminMatchRoomSetting, setAdminMatchRoomEnabled } from "@/lib/match-room-settings";
import { updateMatchRoomEnabled } from "@/app/admin/system/match-room-actions";

const admin = { userId: "verified_admin", sessionClaims: { metadata: { role: "admin" } } };
function form(value: string) { const data = new FormData(); data.set("enabled", value); return data; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(admin);
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { enabled: false }, error: null });
});

describe("scoped Match Room emergency control", () => {
  it.each([null, {}, { role: "admin" }, { metadata: { role: "Admin" } }, { metadata: { role: "player" } }])("rejects noncanonical admin claims before service access", async (sessionClaims) => {
    mocks.auth.mockResolvedValue({ userId: "user", sessionClaims });
    expect(await getAdminMatchRoomSetting()).toEqual({ ok: false, code: "forbidden" });
    expect(await setAdminMatchRoomEnabled(false)).toEqual({ ok: false, code: "forbidden" });
    expect(await updateMatchRoomEnabled(null, form("false"))).toEqual({ ok: false, code: "forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("denies signed-out and failed identity checks", async () => {
    mocks.auth.mockResolvedValue({ userId: null, sessionClaims: admin.sessionClaims });
    expect((await setAdminMatchRoomEnabled(false)).ok).toBe(false);
    mocks.auth.mockRejectedValue(new Error("private identity error"));
    expect(await updateMatchRoomEnabled(null, form("false"))).toEqual({ ok: false, code: "forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("repeats authorization inside the trusted helper", async () => {
    mocks.auth.mockResolvedValueOnce(admin).mockResolvedValueOnce({ userId: "player", sessionClaims: {} });
    expect(await updateMatchRoomEnabled(null, form("false"))).toEqual({ ok: false, code: "forbidden" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["", "0", "FALSE", "yes"])('rejects ambiguous form value "%s"', async (value) => {
    expect(await updateMatchRoomEnabled(null, form(value))).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate values and runtime nonboolean helper inputs", async () => {
    const data = form("false"); data.append("enabled", "true");
    expect(await updateMatchRoomEnabled(null, data)).toEqual({ ok: false, code: "invalid_request" });
    expect(await setAdminMatchRoomEnabled("false" as unknown as boolean)).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([true, false])("sets only the exact control to %s with verified actor attribution", async (enabled) => {
    mocks.rpc.mockResolvedValue({ data: { enabled }, error: null });
    const data = form(String(enabled)); data.set("actor", "spoof"); data.set("key", "push");
    expect(await updateMatchRoomEnabled(null, data)).toEqual({ ok: true, enabled });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("set_match_room_enabled", {
      p_enabled: enabled, p_actor_clerk_user_id: "verified_admin",
    });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/admin/system");
  });
  it.each([true, false])("reads only the safe enabled Boolean (%s)", async (enabled) => {
    mocks.rpc.mockResolvedValue({ data: enabled, error: null });
    expect(await getAdminMatchRoomSetting()).toEqual({ ok: true, enabled });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_match_room_enabled");
  });
  it.each([null, "false", { enabled: false }, []])("fails closed on malformed read responses", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await getAdminMatchRoomSetting()).toEqual({ ok: false, code: "unavailable" });
  });
  it.each([null, true, { enabled: true }, { enabled: false, privateActor: "secret" }])("does not publish malformed writes or private RPC fields", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await updateMatchRoomEnabled(null, form("false"))).toEqual({ ok: false, code: "unavailable" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("contains service errors and transport failures without reporting a successful shutdown", async () => {
    mocks.rpc.mockResolvedValue({ data: { enabled: false }, error: { message: "private database error" } });
    expect(await updateMatchRoomEnabled(null, form("false"))).toEqual({ ok: false, code: "unavailable" });
    mocks.rpc.mockRejectedValue(new Error("secret transport failure"));
    expect(await getAdminMatchRoomSetting()).toEqual({ ok: false, code: "unavailable" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
