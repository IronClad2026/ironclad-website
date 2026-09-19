// Isolated browser fixture transport: no credentials, database or external calls.
import type { MatchRoom, MatchRoomMessage, SendMatchRoomMessageInput } from "@/lib/match-room";
import { uxMatch } from "@/tests/fixtures/match-result-ux";
const scenario = new URLSearchParams(location.search).get("scenario");
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const timestamp = "2026-09-19T01:00:00.000Z";
const messages: MatchRoomMessage[] = [];
const keys = new Map<string, MatchRoomMessage>();
let lastRead = 0;
let failedResponse = false;
let denied = scenario === "outsider";
let historyFails = false;
let resolveCalls = 0;
let historyCalls = 0;
function message(body: string, admin = false): MatchRoomMessage {
  const result: MatchRoomMessage = {
    id: crypto.randomUUID(), roomId, sequence: messages.length + 1,
    senderKind: admin ? "admin" : "player",
    senderRegistrationId: admin ? null : uxMatch.playerTwoRegistrationId,
    body, createdAt: timestamp,
  };
  messages.push(result); return result;
}
if (scenario === "history") {
  for (let index = 1; index <= 55; index++) message("History message " + index + " " + "long-text-".repeat(12));
} else {
  message("Opponent ready for the Match.");
  message("Please use the replay result controls below.", true);
}
function room(): MatchRoom {
  return {
    id: roomId, matchId: uxMatch.id, roomRevision: 1, communicationGeneration: 1,
    activationVersionSnapshot: 1,
    playerOneRegistrationId: uxMatch.playerOneRegistrationId!,
    playerTwoRegistrationId: uxMatch.playerTwoRegistrationId!,
    viewerRegistrationId: scenario === "admin" ? null : uxMatch.playerOneRegistrationId,
    createdAt: timestamp, closedAt: scenario === "closed" ? timestamp : null,
    closureReason: scenario === "closed" ? "match_completed" : null,
    writable: scenario !== "closed", lastSequence: messages.length, lastReadSequence: lastRead,
  };
}
const forbidden = () => ({ ok: false as const, code: "forbidden" as const });
export async function resolveMatchRoom() {
  resolveCalls++;
  if (denied) return forbidden();
  return { ok: true as const, data: { room: scenario === "unavailable" ? null : room() } };
}
export async function getMatchRoomHistory(input: {roomId:string;afterSequence:number;limit:number}) {
  historyCalls++;
  if (denied || input.roomId !== roomId) return forbidden();
  if (historyFails) return { ok: false as const, code: "unavailable" as const };
  const page = messages.filter((entry) => entry.sequence > input.afterSequence).slice(0,input.limit);
  const next = page.at(-1)?.sequence ?? input.afterSequence;
  return { ok: true as const, data: { room: room(), messages: structuredClone(page),
    hasMore: next < messages.length, nextAfterSequence: next } };
}
async function send(input: SendMatchRoomMessageInput, admin: boolean) {
  if (denied || input.expectedRoomId !== roomId) return forbidden();
  if (scenario === "closed") return { ok: false as const, code: "read_only" as const };
  const existing = keys.get(input.clientMessageId);
  if (existing) return { ok: true as const, data: { message: existing, duplicate: true } };
  const entry = message(input.body,admin);
  if (!admin) entry.senderRegistrationId = uxMatch.playerOneRegistrationId;
  keys.set(input.clientMessageId,entry);
  if (failedResponse) { failedResponse = false; return { ok: false as const, code: "unavailable" as const }; }
  return { ok: true as const, data: { message: entry, duplicate: false } };
}
export const sendMatchRoomMessage = (input: SendMatchRoomMessageInput) => send(input,false);
export const sendAdminMatchRoomMessage = (input: SendMatchRoomMessageInput) => send(input,true);
export async function markMatchRoomRead(input: {roomId:string;throughSequence:number}) {
  if (denied || input.roomId !== roomId) return forbidden();
  lastRead = Math.max(lastRead,Math.min(input.throughSequence,messages.length));
  return { ok: true as const, data: { roomId, lastReadSequence: lastRead } };
}
export const fixture = {
  incoming: (body: string) => message(body),
  failResponse: () => { failedResponse = true; },
  failHistory: (fail: boolean) => { historyFails = fail; },
  deny: () => { denied = true; },
  snapshot: () => ({ count: messages.length, lastRead, resolveCalls, historyCalls, messages: structuredClone(messages) }),
};
declare global { interface Window { matchRoomFixture: typeof fixture } }
window.matchRoomFixture = fixture;

