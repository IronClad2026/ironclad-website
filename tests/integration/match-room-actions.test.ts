import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  legal: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({
  requireCurrentAccountLegalAcceptance: mocks.legal,
  AccountLegalMutationBlockedError: class extends Error {
    constructor(readonly reason: "required" | "unavailable") {
      super("Legal gate blocked");
    }
  },
}));

import {
  getMatchRoomHistory,
  getMatchRoomEarlierHistory,
  markMatchRoomRead,
  resolveMatchRoom,
  sendAdminMatchRoomMessage,
  sendMatchRoomMessage,
} from "@/app/tournaments/room-actions";
import { AccountLegalMutationBlockedError } from "@/lib/account-legal-mutation-guard";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ONE = "33333333-3333-4333-8333-333333333333";
const PLAYER_TWO = "44444444-4444-4444-8444-444444444444";
const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
const TIMESTAMP = "2026-09-19T01:00:00.000Z";
const input = {
  matchId: MATCH_ID,
  expectedRoomId: ROOM_ID,
  clientMessageId: MESSAGE_ID,
  body: "  Tuesday?\r\n안녕하세요 🎲  ",
};
const room = {
  id: ROOM_ID,
  matchId: MATCH_ID,
  roomRevision: 1,
  communicationGeneration: 1,
  activationVersionSnapshot: 1,
  playerOneRegistrationId: PLAYER_ONE,
  playerTwoRegistrationId: PLAYER_TWO,
  viewerRegistrationId: PLAYER_ONE,
  createdAt: TIMESTAMP,
  closedAt: null,
  closureReason: null,
  writable: true,
  lastSequence: 1,
  lastReadSequence: 0,
};
const message = {
  id: MESSAGE_ID,
  roomId: ROOM_ID,
  sequence: 1,
  senderKind: "player",
  senderRegistrationId: PLAYER_ONE,
  body: input.body,
  createdAt: TIMESTAMP,
};
const boundaries = [
  ["resolve", () => resolveMatchRoom({ matchId: MATCH_ID })],
  ["earlier history", () => getMatchRoomEarlierHistory({ roomId: ROOM_ID, beforeSequence: 2, limit: 50 })],
  ["history", () => getMatchRoomHistory({ roomId: ROOM_ID, afterSequence: 0, limit: 50 })],
  ["player send", () => sendMatchRoomMessage(input)],
  ["admin send", () => sendAdminMatchRoomMessage(input)],
  ["read", () => markMatchRoomRead({ roomId: ROOM_ID, throughSequence: 1 })],
] as const;

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "user_room_member", sessionClaims: {} });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.legal.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: { message, duplicate: false }, error: null });
});

describe("Match Room Server Action authorization", () => {
  it.each(boundaries)("authenticates the %s boundary before creating a database client", async (_, action) => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(action()).resolves.toEqual({ ok: false, code: "auth_required" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.legal).not.toHaveBeenCalled();
  });

  it("fails closed when Clerk cannot verify the session", async () => {
    mocks.auth.mockRejectedValue(new Error("Private authentication context"));
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: "auth_required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { role: "admin" },
    { public_metadata: { role: "admin" } },
    { metadata: { role: "Admin" } },
    { metadata: { role: "player" } },
  ])("does not accept noncanonical admin role claims", async (sessionClaims) => {
    mocks.auth.mockResolvedValue({ userId: "user_room_member", sessionClaims });
    await expect(sendAdminMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("checks exact admin authority and uses the separate admin-send RPC", async () => {
    mocks.auth.mockResolvedValue({
      userId: "user_room_admin",
      sessionClaims: { metadata: { role: "admin" } },
    });
    const adminMessage = { ...message, senderKind: "admin", senderRegistrationId: null };
    mocks.rpc.mockResolvedValue({ data: { message: adminMessage, duplicate: false }, error: null });

    await expect(sendAdminMatchRoomMessage(input))
      .resolves.toEqual({ ok: true, data: { message: adminMessage, duplicate: false } });
    expect(mocks.legal).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("send_admin_match_room_message", {
      p_match_id: MATCH_ID,
      p_expected_room_id: ROOM_ID,
      p_client_message_id: MESSAGE_ID,
      p_body: input.body,
    });
  });

  it.each(["required", "unavailable"] as const)("blocks sending when the legal gate is %s", async (reason) => {
    mocks.legal.mockRejectedValue(new AccountLegalMutationBlockedError(reason));
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({
      ok: false, code: reason === "required" ? "legal_required" : "legal_unavailable",
    });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("allows private history retrieval without requiring new legal acceptance", async () => {
    mocks.legal.mockRejectedValue(new AccountLegalMutationBlockedError("required"));
    const history = { room, messages: [message], hasMore: false, nextAfterSequence: 1 };
    mocks.rpc.mockResolvedValue({ data: history, error: null });

    await expect(getMatchRoomHistory({ roomId: ROOM_ID, afterSequence: 0, limit: 50 }))
      .resolves.toEqual({ ok: true, data: history });
    expect(mocks.legal).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("get_match_room_history", {
      p_room_id: ROOM_ID, p_after_sequence: 0, p_limit: 50,
    });
  });
});

describe("Match Room command contract", () => {
  it("sends only four trusted scalar parameters and preserves the exact body", async () => {
    await expect(sendMatchRoomMessage(input))
      .resolves.toEqual({ ok: true, data: { message, duplicate: false } });
    expect(mocks.rpc).toHaveBeenCalledWith("send_match_room_message", {
      p_match_id: MATCH_ID,
      p_expected_room_id: ROOM_ID,
      p_client_message_id: MESSAGE_ID,
      p_body: input.body,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/clerk|sender|opponent|admin|registration/i);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, senderRegistrationId: PLAYER_ONE },
    { ...input, senderKind: "admin" },
    { ...input, body: " ".repeat(10) },
    { ...input, body: "🎲".repeat(1001) },
    { ...input, clientMessageId: "invalid" },
  ])("rejects spoofed and invalid sends before any database operation", async (candidate) => {
    await expect(sendMatchRoomMessage(candidate))
      .resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.legal).not.toHaveBeenCalled();
  });

  it("resolves no room for a legitimate unready pairing", async () => {
    mocks.rpc.mockResolvedValue({ data: { room: null }, error: null });
    await expect(resolveMatchRoom({ matchId: MATCH_ID }))
      .resolves.toEqual({ ok: true, data: { room: null } });
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_match_room", { p_match_id: MATCH_ID });
  });

  it("returns the authoritative monotonic read cursor", async () => {
    const data = { roomId: ROOM_ID, lastReadSequence: 2 };
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(markMatchRoomRead({ roomId: ROOM_ID, throughSequence: 1 }))
      .resolves.toEqual({ ok: true, data });
    expect(mocks.rpc).toHaveBeenCalledWith("mark_match_room_read", {
      p_room_id: ROOM_ID, p_through_sequence: 1,
    });
  });

  it("preserves an idempotent retry receipt without resending under another identity", async () => {
    mocks.rpc.mockResolvedValue({ data: { message, duplicate: true }, error: null });
    await expect(sendMatchRoomMessage(input))
      .resolves.toEqual({ ok: true, data: { message, duplicate: true } });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rejects malformed private RPC output without exposing it", async () => {
    mocks.rpc.mockResolvedValue({
      data: { message: { ...message, actorClerkUserId: "private-actor" }, duplicate: false },
      error: null,
    });
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: "unavailable" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["42501", "MATCH_ROOM_INACCESSIBLE", "forbidden"],
    ["22023", "MATCH_ROOM_INVALID_INPUT", "invalid_request"],
    ["40001", "MATCH_ROOM_STALE", "stale_room"],
    ["55000", "MATCH_ROOM_READ_ONLY", "read_only"],
    ["23505", "MATCH_ROOM_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["P0001", "MATCH_ROOM_RATE_LIMITED", "rate_limited"],
    ["P0001", "private database detail", "unavailable"],
    ["XX000", "private database detail", "unavailable"],
  ])("maps database %s to a stable code without raw SQL details", async (code, text, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: text, details: "private detail" } });
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: expected });
  });

  it.each(["ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED", "ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE"])(
    "handles the database repeating legal enforcement: %s",
    async (text) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: text } });
      await expect(sendMatchRoomMessage(input)).resolves.toEqual({
        ok: false,
        code: text.endsWith("_REQUIRED") ? "legal_required" : "legal_unavailable",
      });
      expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    }
  );

  it("contains client creation and transport failures", async () => {
    mocks.client.mockRejectedValueOnce(new Error("private client detail"));
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: "unavailable" });
    mocks.client.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockRejectedValueOnce(new Error("private transport detail"));
    await expect(sendMatchRoomMessage(input)).resolves.toEqual({ ok: false, code: "unavailable" });
  });

  it("validates non-send action inputs before database access", async () => {
    await expect(resolveMatchRoom({ matchId: "invalid" })).resolves.toEqual({ ok: false, code: "invalid_request" });
    await expect(getMatchRoomHistory({ roomId: ROOM_ID, afterSequence: 0, limit: 51 }))
      .resolves.toEqual({ ok: false, code: "invalid_request" });
    await expect(markMatchRoomRead({ roomId: ROOM_ID, throughSequence: -1 }))
      .resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


describe("earlier Match Room history action", () => {
  const input = { roomId: ROOM_ID, beforeSequence: 2, limit: 50 };
  it("authenticates each bounded request without advancing reads or refreshing the workspace", async () => {
    const data = { room, messages: [message], hasMore: false, nextBeforeSequence: 1 };
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(getMatchRoomEarlierHistory(input)).resolves.toEqual({ ok: true, data });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_match_room_earlier_history", {
      p_room_id: ROOM_ID, p_before_sequence: 2, p_limit: 50,
    });
    expect(mocks.legal).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects unsafe cursors, oversized pages and spoofed identity before the RPC", async () => {
    for (const candidate of [
      { ...input, beforeSequence: 0 }, { ...input, limit: 51 },
      { ...input, actorClerkUserId: "spoofed" },
    ]) await expect(getMatchRoomEarlierHistory(candidate)).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed for unauthorized history and private unexpected response fields", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "private details" } });
    await expect(getMatchRoomEarlierHistory(input)).resolves.toEqual({ ok: false, code: "forbidden" });
    mocks.rpc.mockResolvedValueOnce({ data: {
      room, messages: [{ ...message, actorClerkUserId: "private" }], hasMore: false, nextBeforeSequence: 1,
    }, error: null });
    await expect(getMatchRoomEarlierHistory(input)).resolves.toEqual({ ok: false, code: "unavailable" });
  });
});
