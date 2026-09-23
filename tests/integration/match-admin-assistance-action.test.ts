import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rpc: vi.fn(), authenticated: vi.fn(), history: vi.fn(), legal: vi.fn(), profile: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated }));
vi.mock("@/app/tournaments/room-actions", () => ({ getMatchRoomHistory: mocks.history }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("@/lib/public-players", () => ({ getPublicPlayerById: mocks.profile }));
import { getMatchRoomAssistance, getMatchRoomOpponentDiscord, requestMatchAdminAssistance, resolveMatchAdminAssistance } from "@/app/tournaments/support-actions";

const ROOM = "22222222-2222-4222-8222-222222222222";
const REG = "33333333-3333-4333-8333-333333333333";
const OPPONENT = "44444444-4444-4444-8444-444444444444";
const PROFILE = "66666666-6666-4666-8666-666666666666";
const input = { roomId: ROOM, expectedRequestVersion: 0 };
const requested = { roomId: ROOM, status: "requested", requestVersion: 1, requestedAt: "2026-09-20T01:00:00.000Z", resolvedAt: null, canResolve: false };
const room = { id: ROOM, viewerRegistrationId: REG, playerOneRegistrationId: REG, playerTwoRegistrationId: OPPONENT };
function client() {
  const filters: [string, unknown][] = [];
  const builder = { select: () => builder, eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; }, maybeSingle: async () => ({ data: { profile_id: PROFILE }, error: null }) };
  return { filters, from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_original", sessionClaims: {} });
  mocks.legal.mockResolvedValue(undefined);
  mocks.history.mockResolvedValue({ ok: true, data: { room } });
  mocks.authenticated.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: requested, error: null });
  mocks.admin.mockReturnValue(client());
});

describe("room assistance commands", () => {
  it("reports shutdown denial without returning private database errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "MATCH_ROOM_DISABLED" } });
    expect(await requestMatchAdminAssistance(input)).toEqual({ ok: false, code: "disabled" });
    expect(await requestMatchAdminAssistance({ ...input, expectedRequestVersion: 1 })).toEqual({ ok: false, code: "disabled" });
  });
  it("requires authentication before any private RPC", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(await requestMatchAdminAssistance(input)).toEqual({ ok: false, code: "auth_required" });
    expect(await getMatchRoomAssistance({ roomId: ROOM })).toEqual({ ok: false, code: "auth_required" });
    expect(mocks.authenticated).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("uses the authenticated immutable-room command and no browser actor or service-role writes", async () => {
    expect(await requestMatchAdminAssistance(input)).toEqual({ ok: true, data: requested });
    expect(mocks.rpc).toHaveBeenCalledWith("request_match_room_assistance", { p_room_id: ROOM, p_expected_request_version: 0 });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("reads without a mutation legal guard", async () => {
    expect((await getMatchRoomAssistance({ roomId: ROOM })).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("get_match_room_assistance", { p_room_id: ROOM });
    expect(mocks.legal).not.toHaveBeenCalled();
  });
  it.each([null, { ...input, actorId: "spoof" }, { ...input, expectedRequestVersion: -1 }, { ...input, roomId: "invalid" }])("rejects invalid or identity-bearing input", async (value) => {
    expect(await requestMatchAdminAssistance(value as typeof input)).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires exact admin metadata for resolution", async () => {
    expect(await resolveMatchAdminAssistance({ ...input, expectedRequestVersion: 1 })).toEqual({ ok: false, code: "forbidden" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: "admin_actor", sessionClaims: { metadata: { role: "admin" } } });
    mocks.rpc.mockResolvedValue({ data: { ...requested, status: "resolved", resolvedAt: "2026-09-20T01:01:00.000Z" }, error: null });
    expect((await resolveMatchAdminAssistance({ ...input, expectedRequestVersion: 1 })).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_match_room_assistance", { p_room_id: ROOM, p_expected_request_version: 1 });
    expect(mocks.legal).toHaveBeenCalledOnce();
  });
  it("retains the same expected version on retry and requires the returned version for reopen", async () => {
    await requestMatchAdminAssistance(input);
    await requestMatchAdminAssistance(input);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    await requestMatchAdminAssistance({ ...input, expectedRequestVersion: 1 });
    expect(mocks.rpc.mock.calls[2][1].p_expected_request_version).toBe(1);
  });
  it.each([["42501", "forbidden"], ["40001", "stale_room"], ["22023", "invalid_request"], ["other", "unavailable"]])("maps %s without disclosing error content", async (code, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private error details" } });
    expect(await requestMatchAdminAssistance(input)).toEqual({ ok: false, code: expected });
  });
  it("rejects responses with another room or private extra fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...requested, roomId: OPPONENT }, error: null });
    expect((await requestMatchAdminAssistance(input)).ok).toBe(false);
    mocks.rpc.mockResolvedValue({ data: { ...requested, resolvedBy: "private_actor" }, error: null });
    expect((await requestMatchAdminAssistance(input)).ok).toBe(false);
  });
  it("fails closed when acceptance or the RPC transport fails", async () => {
    mocks.legal.mockRejectedValue(new Error("unavailable"));
    expect((await requestMatchAdminAssistance(input)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.legal.mockResolvedValue(undefined);
    mocks.authenticated.mockRejectedValue(new Error("offline"));
    expect(await requestMatchAdminAssistance(input)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("unchanged optional Discord privacy", () => {
  it("uses the fixed opponent's live public opt-in on every click", async () => {
    const db = client(); mocks.admin.mockReturnValue(db);
    mocks.profile.mockResolvedValueOnce({ publicProfileEnabled: true, discordPublicEnabled: true, discordUsername: "shared.name" });
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: "shared.name" });
    expect(db.filters).toEqual([["id", OPPONENT]]);
    expect(mocks.profile).toHaveBeenCalledWith(PROFILE);
    mocks.profile.mockResolvedValueOnce(null);
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
  });
  it("denies hidden contact and unauthorized retained-room access", async () => {
    mocks.profile.mockResolvedValue({ publicProfileEnabled: true, discordPublicEnabled: false, discordUsername: "private.name" });
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
    mocks.history.mockResolvedValue({ ok: false, code: "forbidden" }); mocks.profile.mockClear();
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
