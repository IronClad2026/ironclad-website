import { describe, expect, it } from "vitest";
import {
  isMarkMatchRoomReadInput,
  isMatchRoomHistoryInput,
  isMatchRoomEarlierHistoryInput,
  isMatchRoomMessageBody,
  isResolveMatchRoomInput,
  isSendMatchRoomMessageInput,
  parseMatchRoom,
  parseMatchRoomHistory,
  parseMatchRoomEarlierHistory,
  parseMatchRoomReadResult,
  parseMatchRoomSendResult,
  parseResolveMatchRoomResult,
} from "@/lib/match-room";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ONE = "33333333-3333-4333-8333-333333333333";
const PLAYER_TWO = "44444444-4444-4444-8444-444444444444";
const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
const OUTSIDER = "66666666-6666-4666-8666-666666666666";
const TIMESTAMP = "2026-09-19T01:00:00.000Z";
const room = {
  id: ROOM_ID,
  matchId: MATCH_ID,
  roomRevision: 1,
  communicationGeneration: 1,
  activationVersionSnapshot: 0,
  playerOneRegistrationId: PLAYER_ONE,
  playerTwoRegistrationId: PLAYER_TWO,
  viewerRegistrationId: PLAYER_ONE,
  createdAt: TIMESTAMP,
  closedAt: null,
  closureReason: null,
  writable: true,
  lastSequence: 2,
  lastReadSequence: 0,
};
const message = {
  id: MESSAGE_ID,
  roomId: ROOM_ID,
  sequence: 1,
  senderKind: "player",
  senderRegistrationId: PLAYER_ONE,
  body: "  Tuesday?\r\n20:00 works.  ",
  createdAt: TIMESTAMP,
};
const sendInput = {
  matchId: MATCH_ID,
  expectedRoomId: ROOM_ID,
  clientMessageId: MESSAGE_ID,
  body: message.body,
};
const historyInput = { roomId: ROOM_ID, afterSequence: 0, limit: 1 };
const history = {
  room,
  messages: [message],
  hasMore: true,
  nextAfterSequence: 1,
};

describe("Match Room input boundaries", () => {
  it("counts Unicode code points and preserves whitespace and line endings", () => {
    expect(isMatchRoomMessageBody("🎲".repeat(1000))).toBe(true);
    expect(isMatchRoomMessageBody("🎲".repeat(1001))).toBe(false);
    expect(isSendMatchRoomMessageInput(sendInput)).toBe(true);
    expect(sendInput.body).toBe("  Tuesday?\r\n20:00 works.  ");
    expect(isMatchRoomMessageBody("안녕하세요 — 你好")).toBe(true);
    expect(isMatchRoomMessageBody("<script>alert(1)</script>")).toBe(true);
  });

  it.each(["", " \t\r\n", "\u00a0\u1680\u2003\u2028\u202f\u3000\ufeff",
    "a".repeat(1001), "before\0after", "\ud800", "\udfff", null, 12])(
    "rejects blank, oversized or invalid Unicode text",
    (body) => expect(isMatchRoomMessageBody(body)).toBe(false)
  );

  it("rejects caller-chosen identity and authority fields at every input boundary", () => {
    expect(isResolveMatchRoomInput({ matchId: MATCH_ID, viewerId: PLAYER_ONE })).toBe(false);
    expect(isMatchRoomHistoryInput({ ...historyInput, admin: true })).toBe(false);
    expect(isSendMatchRoomMessageInput({ ...sendInput, senderRegistrationId: PLAYER_ONE })).toBe(false);
    expect(isSendMatchRoomMessageInput({ ...sendInput, senderKind: "admin" })).toBe(false);
    expect(isMarkMatchRoomReadInput({ roomId: ROOM_ID, throughSequence: 1, viewerId: PLAYER_ONE })).toBe(false);
  });

  it("requires bounded safe-integer cursors and page sizes", () => {
    for (const afterSequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
      expect(isMatchRoomHistoryInput({ ...historyInput, afterSequence })).toBe(false);
      expect(isMarkMatchRoomReadInput({ roomId: ROOM_ID, throughSequence: afterSequence })).toBe(false);
    }
    for (const limit of [0, -1, 51, 1.5, Infinity, "10"]) {
      expect(isMatchRoomHistoryInput({ ...historyInput, limit })).toBe(false);
    }
    expect(isMatchRoomHistoryInput({ ...historyInput, limit: 50 })).toBe(true);
    expect(isResolveMatchRoomInput({ matchId: "not-a-match" })).toBe(false);
    expect(isSendMatchRoomMessageInput({ ...sendInput, clientMessageId: "" })).toBe(false);
  });
});

describe("Match Room safe projections", () => {
  it("accepts round-robin activation zero and admin history without a registration", () => {
    expect(parseMatchRoom(room)).toEqual(room);
    expect(parseMatchRoom({ ...room, viewerRegistrationId: null })).not.toBeNull();
    expect(parseResolveMatchRoomResult({ room: null }, MATCH_ID)).toEqual({ room: null });
  });

  it.each([
    { playerTwoRegistrationId: PLAYER_ONE },
    { viewerRegistrationId: OUTSIDER },
    { lastReadSequence: 3 },
    { lastSequence: Number.MAX_SAFE_INTEGER + 1 },
    { roomRevision: 0 },
    { communicationGeneration: 0 },
    { closedAt: TIMESTAMP, closureReason: "lifecycle_changed", writable: true },
    { closedAt: TIMESTAMP, writable: false },
    { closedAt: TIMESTAMP, closureReason: "unknown", writable: false },
    { actorClerkUserId: "private-actor" },
    { discordUsername: "private-contact" },
  ])("fails closed for inconsistent or private room fields", (change) => {
    expect(parseMatchRoom({ ...room, ...change })).toBeNull();
  });

  it("checks the requested match and preserves closed history as read-only", () => {
    expect(parseResolveMatchRoomResult({ room }, OUTSIDER)).toBeNull();
    const closed = { ...room, closedAt: TIMESTAMP, closureReason: "lifecycle_changed", writable: false };
    expect(parseResolveMatchRoomResult({ room: closed }, MATCH_ID)).toEqual({ room: closed });
  });

  it("accepts bounded history and rejects cross-room, foreign-author and private messages", () => {
    expect(parseMatchRoomHistory(history, historyInput)).toEqual(history);
    for (const change of [
      { roomId: OUTSIDER },
      { senderRegistrationId: OUTSIDER },
      { senderKind: "admin", senderRegistrationId: PLAYER_ONE },
      { actorClerkUserId: "private-actor" },
      { clientMessageId: MESSAGE_ID },
      { sequence: 3 },
    ]) {
      expect(parseMatchRoomHistory({
        ...history, messages: [{ ...message, ...change }],
      }, historyInput)).toBeNull();
    }
    expect(parseMatchRoomHistory({ ...history, room: { ...room, id: OUTSIDER } }, historyInput)).toBeNull();
  });

  it("rejects repeated, out-of-order, oversized and incorrectly paginated history", () => {
    const second = { ...message, id: OUTSIDER, sequence: 2 };
    const two = { ...history, messages: [message, second], hasMore: false, nextAfterSequence: 2 };
    expect(parseMatchRoomHistory(two, { ...historyInput, limit: 2 })).toEqual(two);
    expect(parseMatchRoomHistory(two, historyInput)).toBeNull();
    expect(parseMatchRoomHistory({ ...two, messages: [second, message] }, { ...historyInput, limit: 2 })).toBeNull();
    expect(parseMatchRoomHistory({ ...two, messages: [message, { ...second, id: message.id }] },
      { ...historyInput, limit: 2 })).toBeNull();
    expect(parseMatchRoomHistory({ ...history, nextAfterSequence: 2 }, historyInput)).toBeNull();
    expect(parseMatchRoomHistory({ ...history, messages: [], nextAfterSequence: 0 }, historyInput)).toBeNull();
  });

  it("returns an unchanged cursor for an empty page", () => {
    const empty = { room, messages: [], hasMore: false, nextAfterSequence: 2 };
    expect(parseMatchRoomHistory(empty, { ...historyInput, afterSequence: 2 })).toEqual(empty);
  });

  it("binds send receipts to room, exact body and command authorship, including retries", () => {
    for (const duplicate of [false, true]) {
      const result = { message, duplicate };
      expect(parseMatchRoomSendResult(result, sendInput, "player")).toEqual(result);
    }
    for (const change of [
      { roomId: OUTSIDER },
      { body: message.body.trim() },
      { senderKind: "admin", senderRegistrationId: null },
      { actorClerkUserId: "private-actor" },
    ]) {
      expect(parseMatchRoomSendResult({
        message: { ...message, ...change }, duplicate: false,
      }, sendInput, "player")).toBeNull();
    }
    const admin = { message: { ...message, senderKind: "admin", senderRegistrationId: null }, duplicate: false };
    expect(parseMatchRoomSendResult(admin, sendInput, "admin")).toEqual(admin);
  });

  it("permits a monotonic newer read cursor but never a lower or cross-room cursor", () => {
    const input = { roomId: ROOM_ID, throughSequence: 1 };
    expect(parseMatchRoomReadResult({ roomId: ROOM_ID, lastReadSequence: 2 }, input))
      .toEqual({ roomId: ROOM_ID, lastReadSequence: 2 });
    expect(parseMatchRoomReadResult({ roomId: ROOM_ID, lastReadSequence: 0 }, input)).toBeNull();
    expect(parseMatchRoomReadResult({ roomId: OUTSIDER, lastReadSequence: 2 }, input)).toBeNull();
    expect(parseMatchRoomReadResult({ roomId: ROOM_ID, lastReadSequence: 2, viewerId: PLAYER_ONE }, input)).toBeNull();
  });
});


describe("earlier Match Room history boundaries", () => {
  const input = { roomId: ROOM_ID, beforeSequence: 3, limit: 2 };
  const second = { ...message, id: OUTSIDER, sequence: 2 };
  const earlier = { room, messages: [message, second], hasMore: false, nextBeforeSequence: 1 };

  it("requires an exclusive positive safe cursor and a bounded unspoofed request", () => {
    expect(isMatchRoomEarlierHistoryInput(input)).toBe(true);
    for (const beforeSequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3"]) {
      expect(isMatchRoomEarlierHistoryInput({ ...input, beforeSequence })).toBe(false);
    }
    for (const limit of [0, 51, 1.5, "50"]) {
      expect(isMatchRoomEarlierHistoryInput({ ...input, limit })).toBe(false);
    }
    expect(isMatchRoomEarlierHistoryInput({ ...input, actorId: PLAYER_ONE })).toBe(false);
  });

  it("accepts chronological earlier pages and stable empty cursors", () => {
    expect(parseMatchRoomEarlierHistory(earlier, input)).toEqual(earlier);
    const empty = { room, messages: [], hasMore: false, nextBeforeSequence: 1 };
    expect(parseMatchRoomEarlierHistory(empty, { ...input, beforeSequence: 1 })).toEqual(empty);
  });

  it("rejects overlaps, duplicates, wrong order and impossible cursors", () => {
    for (const change of [
      { messages: [second, message] },
      { messages: [message, { ...second, id: message.id }] },
      { messages: [message, { ...second, sequence: 1 }] },
      { nextBeforeSequence: 2 },
      { hasMore: true },
      { messages: [], nextBeforeSequence: 3, hasMore: true },
    ]) expect(parseMatchRoomEarlierHistory({ ...earlier, ...change }, input)).toBeNull();
    expect(parseMatchRoomEarlierHistory(earlier, { ...input, beforeSequence: 2 })).toBeNull();
    expect(parseMatchRoomEarlierHistory(earlier, { ...input, limit: 1 })).toBeNull();
  });

  it("rejects foreign rooms, authors and private response fields", () => {
    for (const change of [
      { roomId: OUTSIDER }, { senderRegistrationId: OUTSIDER },
      { actorClerkUserId: "secret" }, { clientMessageId: MESSAGE_ID },
    ]) expect(parseMatchRoomEarlierHistory({
      ...earlier, messages: [{ ...message, ...change }, second],
    }, input)).toBeNull();
    expect(parseMatchRoomEarlierHistory({ ...earlier, room: { ...room, id: OUTSIDER } }, input)).toBeNull();
    expect(parseMatchRoomEarlierHistory({ ...earlier, privateField: "secret" }, input)).toBeNull();
  });
});
