import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.client }));

import { getMatchRoomUnreadSummary } from "@/app/tournaments/room-unread-actions";
import {
  MATCH_ROOM_UNREAD_BATCH_LIMIT,
  isMatchRoomUnreadInput,
  parseMatchRoomUnreadSummary,
  type MatchRoomUnreadInput,
} from "@/lib/match-room-unread";

const matchId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const input = { matchIds: [matchId] };
const item = { matchId, roomId, unreadSource: "opponent" };

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "current-player", sessionClaims: {} });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { items: [item] }, error: null });
});

describe("private Match Room unread batch boundary", () => {
  it("authenticates signed-out viewers before accessing Supabase", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: false, code: "auth_required" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("fails closed when authentication is unavailable", async () => {
    mocks.auth.mockRejectedValue(new Error("private auth detail"));
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: false, code: "auth_required" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("makes one JWT-scoped RPC without a client identity or role", async () => {
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: true, data: { items: [item] } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_match_room_unread_summary", { p_match_ids: [matchId] });
  });

  it("uses the same participant RPC for an admin, without a privileged client", async () => {
    mocks.auth.mockResolvedValue({ userId: "admin", sessionClaims: { metadata: { role: "admin" } } });
    mocks.rpc.mockResolvedValue({ data: { items: [] }, error: null });
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: true, data: { items: [] } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_match_room_unread_summary", { p_match_ids: [matchId] });
  });

  it("returns an empty authenticated scope without a database call", async () => {
    await expect(getMatchRoomUnreadSummary({ matchIds: [] })).resolves.toEqual({ ok: true, data: { items: [] } });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { matchIds: "bad" }, { matchIds: ["bad"] },
    { matchIds: [matchId], clerkUserId: "forged" },
    { matchIds: [matchId], role: "admin" }, { matchIds: [matchId, matchId] },
    { matchIds: Array.from({ length: MATCH_ROOM_UNREAD_BATCH_LIMIT + 1 }, (_, n) =>
      `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`) },
  ])("rejects invalid, forged or unbounded input before an RPC: %j", async (value) => {
    await expect(getMatchRoomUnreadSummary(value as MatchRoomUnreadInput))
      .resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("accepts an empty projection when the database kill switch is off", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [] }, error: null });
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: true, data: { items: [] } });
  });

  it.each(["42501", "PGRST202", "XX000"])("sanitizes database failure %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private Clerk ID and message" } });
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({
      ok: false, code: code === "42501" ? "forbidden" : "unavailable",
    });
  });

  it("contains thrown transport failures", async () => {
    mocks.client.mockRejectedValue(new Error("secret"));
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: false, code: "unavailable" });
  });

  it("does not return malformed or overexposed database rows", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [{ ...item, body: "private" }] }, error: null });
    await expect(getMatchRoomUnreadSummary(input)).resolves.toEqual({ ok: false, code: "unavailable" });
  });
});

describe("Match Room unread projection validation", () => {
  it.each(["opponent", "admin", "generic"])("accepts the safe %s source", (unreadSource) => {
    const result = { items: [{ ...item, unreadSource }] };
    expect(parseMatchRoomUnreadSummary(result, input)).toEqual(result);
  });

  it.each([
    null, [], { items: "bad" }, { items: [], userId: "private" },
    { items: [{ ...item, unreadSource: "player" }] },
    { items: [{ ...item, roomId: "invalid" }] },
    { items: [{ ...item, matchId: otherId }] },
    { items: [{ ...item, actorClerkUserId: "private" }] },
    { items: [item, item] },
  ])("rejects unsafe projection %j", (value) => {
    expect(parseMatchRoomUnreadSummary(value, input)).toBeNull();
  });

  it("rejects two requested matches attributed to the same immutable room", () => {
    expect(parseMatchRoomUnreadSummary({ items: [item, { ...item, matchId: otherId }] },
      { matchIds: [matchId, otherId] })).toBeNull();
  });

  it("rejects duplicate UUIDs differing only by casing", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(isMatchRoomUnreadInput({ matchIds: [id, id.toUpperCase()] })).toBe(false);
  });
});
