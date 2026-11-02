import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPrivateAssistanceContext, openPrivateAssistance, readPrivateAssistance, replyPrivateAssistance } from "@/app/tournaments/private-assistance-actions";
import { getAdminPrivateAssistanceQueue, setPrivateAssistanceStatus } from "@/app/admin/tournaments/assistance-actions";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), legal: vi.fn(), client: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.client }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const request = { id: ID, roomId: ROOM, tournamentId: T, tournamentBracketId: CLIENT, matchId: ID,
  tournamentTitle: "Synthetic", divisionName: "Academy", matchReference: "Round 1", reference: "Synthetic / Round 1",
  requesterRegistrationId: CLIENT, requesterName: "Synthetic", status: "open", version: 1, lastSequence: 1,
  createdAt: "2026-11-02T20:00:00Z", updatedAt: "2026-11-02T20:00:00Z", resolvedAt: null, contentPurgedAt: null };
const message = { id: CLIENT, requestId: ID, sequence: 1, senderKind: "requester", body: "Help with match time", createdAt: request.createdAt, redactedAt: null };
const mutation = { request, message, accepted: true, acceptedClientMessageId: CLIENT, duplicate: false };
const opening = { roomId: ROOM, clientMessageId: CLIENT, body: message.body };
const history = { requestId: ID, tournamentId: T, afterSequence: 0, limit: 50 };
const reply = { requestId: ID, tournamentId: T, clientMessageId: CLIENT, body: "Help" };
const queue = { tournamentId: T, filter: "all" as const, page: 1, selectedId: null };
beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "trusted-player", sessionClaims: {} });
  mocks.legal.mockResolvedValue(undefined);
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: mutation, error: null });
});
describe("private assistance authenticated action boundary", () => {
  it("authenticates before database access and does not accept a client role", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(await openPrivateAssistance(opening)).toEqual({ ok: false, code: "auth_required" });
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: "player", sessionClaims: {} });
    expect(await getAdminPrivateAssistanceQueue(queue)).toEqual({ ok: false, code: "forbidden" });
    expect(await setPrivateAssistanceStatus({ requestId: ID, tournamentId: T, status: "resolved", expectedVersion: 1 })).toEqual({ ok: false, code: "forbidden" });
  });
  it.each([null, { ...opening, playerId: ID }, { ...opening, tournamentId: T }, { ...opening, body: false },
    { ...opening, body: "\n " }, { ...opening, body: "a".repeat(1001) }])("rejects missing, forged or malformed creation fields", async (input) => {
    expect(await openPrivateAssistance(input as typeof opening)).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("sends only room, stable client message identity and initial text to the authenticated RPC", async () => {
    expect(await openPrivateAssistance(opening)).toEqual({ ok: true, data: mutation });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("open_private_assistance", {
      p_room_id: ROOM, p_client_message_id: CLIENT, p_body: message.body,
    });
  });
  it("checks legal acceptance for writes but retains read access", async () => {
    mocks.legal.mockRejectedValue(new Error("private"));
    expect(await replyPrivateAssistance(reply)).toEqual({ ok: false, code: "legal_required" });
    mocks.rpc.mockResolvedValue({ data: { request, messages: [message], hasMore: false, nextAfterSequence: 1, canReply: true, canSetStatus: false }, error: null });
    expect((await readPrivateAssistance(history)).ok).toBe(true);
  });
  it("rejects foreign returned context and never trusts an ACK for a different draft", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...mutation, acceptedClientMessageId: T }, error: null });
    expect((await openPrivateAssistance(opening)).ok).toBe(false);
    mocks.rpc.mockResolvedValue({ data: { ...mutation, request: { ...request, tournamentId: ROOM } }, error: null });
    expect((await replyPrivateAssistance(reply)).ok).toBe(false);
  });
  it("passes explicit tournament context for history/replies and refuses contextless old clients", async () => {
    await replyPrivateAssistance(reply);
    expect(mocks.rpc).toHaveBeenCalledWith("reply_private_assistance", {
      p_request_id: ID, p_tournament_id: T, p_client_message_id: CLIENT, p_body: "Help",
    });
    mocks.rpc.mockClear();
    expect(await readPrivateAssistance({ ...history, tournamentId: undefined } as unknown as typeof history)).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["42501", "forbidden"], ["40001", "conflict"], ["23505", "conflict"], ["22023", "invalid_request"]])("maps %s without leaking a database error", async (code, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "PRIVATE_BODY" } });
    expect(await openPrivateAssistance(opening)).toEqual({ ok: false, code: expected });
  });
  it("uses the confirmed fixed Discord destination rather than trusting RPC configuration", async () => {
    mocks.rpc.mockResolvedValue({ data: { room: request, request: null, canCreate: true, newRequestsEnabled: true, discordUrl: "https://untrusted.example" }, error: null });
    const result = await getPrivateAssistanceContext({ roomId: ROOM });
    expect(result.ok && result.data.discordUrl).toBe("https://discord.com/channels/1440092095619662105/1440201093110960137");
  });
});
