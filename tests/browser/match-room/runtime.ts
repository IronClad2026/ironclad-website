// Isolated browser transport. Synthetic data only; no hosted requests or credentials.
import type { MatchRoom, MatchRoomMessage, SendMatchRoomMessageInput } from "@/lib/match-room";
import type { MatchRoomAssistance } from "@/lib/match-room-assistance";
import type { MatchRoomUnreadItem } from "@/lib/match-room-unread";
import { uxMatch } from "@/tests/fixtures/match-result-ux";
import { visibilityTransport } from "./visibility-runtime";
const params = new URLSearchParams(location.search);
const scenario = params.get("scenario");
export const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const timestamp = "2026-09-19T01:00:00.000Z";
type Viewer = "player" | "opponent" | "admin" | "replacement";
let viewer: Viewer = params.get("viewer") as Viewer || (scenario === "admin" ? "admin" : "player");
type Episode = { id: string; title: string; message: string; matchId: string; roomId: string };
type FixtureState = {
  messages: MatchRoomMessage[];
  keys: Record<string, MatchRoomMessage>;
  reads: Record<string, number>;
  assistance: Omit<MatchRoomAssistance, "canResolve">;
  episodes: Record<string, Episode | null>;
};
const shared = scenario === "notifications";
const storageKey = "ironclad-match-room-phase-3-browser-fixture";
let state: FixtureState = {
  messages: [], keys: {}, reads: {}, episodes: {},
  assistance: { roomId: ROOM_ID, status: "none", requestVersion: 0, requestedAt: null, resolvedAt: null },
};
let failedResponse = false;
let denied = scenario === "outsider";
let historyFails = false;
let resolveCalls = 0;
let historyCalls = 0;
let earlierCalls = 0;
let readCalls = 0;
let assistanceMutations = 0;
let summaryCalls = 0;
let enabled = true;
let readRaceMessage: string | null = null;
function reload() {
  if (shared && localStorage.getItem(storageKey)) {
    state = JSON.parse(localStorage.getItem(storageKey)!) as FixtureState;
  }
}
function persist() {
  if (shared) localStorage.setItem(storageKey, JSON.stringify(state));
  window.dispatchEvent(new Event("fixture-room-update"));
}
function message(body: string, admin = false, incoming = true): MatchRoomMessage {
  const result: MatchRoomMessage = {
    id: crypto.randomUUID(), roomId: ROOM_ID, sequence: state.messages.length + 1,
    senderKind: admin ? "admin" : "player",
    senderRegistrationId: admin ? null : incoming || viewer === "opponent"
      ? uxMatch.playerTwoRegistrationId : uxMatch.playerOneRegistrationId,
    body, createdAt: timestamp,
  };
  state.messages.push(result);
  return result;
}
if (shared && localStorage.getItem(storageKey)) reload();
else {
  if (scenario === "history") {
    for (let index = 1; index <= 125; index++) message("History message " + index + " " + "long-text-".repeat(12));
  } else {
    message("Opponent ready for the Match.");
    message("Please use the replay result controls below.", true);
  }
  persist();
}
function inaccessible() { return denied || viewer === "replacement"; }
function room(): MatchRoom {
  const closed = scenario === "closed" || scenario === "historical";
  return {
    id: ROOM_ID, matchId: uxMatch.id, roomRevision: 1, communicationGeneration: 1,
    activationVersionSnapshot: 1,
    playerOneRegistrationId: uxMatch.playerOneRegistrationId!,
    playerTwoRegistrationId: uxMatch.playerTwoRegistrationId!,
    viewerRegistrationId: viewer === "admin" ? null : viewer === "opponent"
      ? uxMatch.playerTwoRegistrationId : uxMatch.playerOneRegistrationId,
    createdAt: timestamp, closedAt: closed ? timestamp : null,
    closureReason: closed ? "match_completed" : null,
    writable: !closed, lastSequence: state.messages.length, lastReadSequence: state.reads[viewer] ?? 0,
  };
}
const forbidden = () => ({ ok: false as const, code: "forbidden" as const });
export async function resolveMatchRoom(input: { matchId: string }) {
  if (scenario === "visibility") return visibilityTransport.resolve(input);
  reload(); resolveCalls++;
  if (inaccessible()) return forbidden();
  return { ok: true as const, data: { room: scenario === "unavailable" ? null : room() } };
}
export async function getMatchRoomHistory(input: {roomId:string;afterSequence:number;limit:number}) {
  if (scenario === "visibility") return visibilityTransport.history(input);
  reload(); historyCalls++;
  if (inaccessible() || input.roomId !== ROOM_ID) return forbidden();
  if (historyFails) return { ok: false as const, code: "unavailable" as const };
  const page = state.messages.filter((entry) => entry.sequence > input.afterSequence).slice(0,input.limit);
  const next = page.at(-1)?.sequence ?? input.afterSequence;
  return { ok: true as const, data: { room: room(), messages: structuredClone(page),
    hasMore: next < state.messages.length, nextAfterSequence: next } };
}
export async function getMatchRoomEarlierHistory(input: {roomId:string;beforeSequence:number;limit:number}) {
  reload(); earlierCalls++;
  if (inaccessible() || input.roomId !== ROOM_ID) return forbidden();
  if (historyFails) return { ok: false as const, code: "unavailable" as const };
  const page = state.messages.filter((entry) => entry.sequence < input.beforeSequence).slice(-input.limit);
  const next = page[0]?.sequence ?? input.beforeSequence;
  return { ok: true as const, data: { room: room(), messages: structuredClone(page),
    hasMore: next > 1, nextBeforeSequence: next } };
}
function notify(admin: boolean) {
  const recipients = admin ? ["player", "opponent"] : [viewer === "opponent" ? "player" : "opponent"];
  for (const recipient of recipients) {
    if (recipient !== viewer && !state.episodes[recipient]) {
      state.episodes[recipient] = {
        id: crypto.randomUUID(), title: "New Match Room message",
        message: "You have new messages in your Match Room.", matchId: uxMatch.id, roomId: ROOM_ID,
      };
    }
  }
}
async function send(input: SendMatchRoomMessageInput, admin: boolean) {
  reload();
  if (inaccessible() || input.expectedRoomId !== ROOM_ID || (admin && viewer !== "admin")) return forbidden();
  if (!room().writable) return { ok: false as const, code: "read_only" as const };
  const key = viewer + ":" + input.clientMessageId;
  const existing = state.keys[key];
  if (existing) return { ok: true as const, data: { message: existing, duplicate: true } };
  const entry = message(input.body,admin,false);
  state.keys[key] = entry;
  notify(admin);
  persist();
  if (failedResponse) { failedResponse = false; return { ok: false as const, code: "unavailable" as const }; }
  return { ok: true as const, data: { message: entry, duplicate: false } };
}
export const sendMatchRoomMessage = (input: SendMatchRoomMessageInput) => send(input,false);
export const sendAdminMatchRoomMessage = (input: SendMatchRoomMessageInput) => send(input,true);
export async function markMatchRoomRead(input: {roomId:string;throughSequence:number}) {
  if (scenario === "visibility") return visibilityTransport.read(input);
  reload(); readCalls++;
  if (inaccessible() || input.roomId !== ROOM_ID) return forbidden();
  state.reads[viewer] = Math.max(state.reads[viewer] ?? 0,Math.min(input.throughSequence,state.messages.length));
  if (readRaceMessage) { message(readRaceMessage); readRaceMessage = null; }
  if (state.reads[viewer] >= state.messages.length) state.episodes[viewer] = null;
  persist();
  return { ok: true as const, data: { roomId: ROOM_ID, lastReadSequence: state.reads[viewer] } };
}
export async function getMatchRoomUnreadSummary(input: { matchIds: string[] }) {
  reload(); summaryCalls++;
  const items: MatchRoomUnreadItem[] = [];
  const active = room();
  if (enabled && !inaccessible() && viewer !== "admin" && active.writable && input.matchIds.includes(uxMatch.id)) {
    const unread = state.messages.filter((entry) => entry.sequence > (state.reads[viewer] ?? 0) &&
      (entry.senderKind === "admin" || entry.senderRegistrationId !== active.viewerRegistrationId));
    if (unread.length) {
      const admin = unread.some((entry) => entry.senderKind === "admin");
      const opponent = unread.some((entry) => entry.senderKind === "player");
      items.push({ matchId: uxMatch.id, roomId: ROOM_ID, unreadSource: admin && opponent ? "generic" : admin ? "admin" : "opponent" });
    }
  }
  return { ok: true as const, data: { items } };
}
function assistance(): MatchRoomAssistance {
  return { ...state.assistance, canResolve: viewer === "admin" && state.assistance.status === "requested" };
}
export async function getMatchRoomAssistance(input: { roomId: string }) {
  reload();
  if (inaccessible() || input.roomId !== ROOM_ID) return forbidden();
  return { ok: true as const, data: assistance() };
}
export async function requestMatchAdminAssistance(input: { roomId: string; expectedRequestVersion: number }) {
  reload();
  if (inaccessible() || input.roomId !== ROOM_ID) return forbidden();
  if (input.expectedRequestVersion !== state.assistance.requestVersion) return { ok: false as const, code: "stale_room" as const };
  if (state.assistance.status !== "requested") {
    assistanceMutations++;
    state.assistance = { roomId: ROOM_ID, status: "requested",
      requestVersion: state.assistance.requestVersion + 1, requestedAt: timestamp, resolvedAt: null };
    persist();
  }
  return { ok: true as const, data: assistance() };
}
export async function resolveMatchAdminAssistance(input: { roomId: string; expectedRequestVersion: number }) {
  reload();
  if (inaccessible() || viewer !== "admin" || input.roomId !== ROOM_ID) return forbidden();
  if (input.expectedRequestVersion !== state.assistance.requestVersion) return { ok: false as const, code: "stale_room" as const };
  if (state.assistance.status === "requested") {
    assistanceMutations++;
    state.assistance.status = "resolved"; state.assistance.resolvedAt = timestamp;
    persist();
  }
  return { ok: true as const, data: assistance() };
}
export async function getMatchRoomOpponentDiscord() { return { discordUsername: null }; }
export const fixture = {
  incoming: (body: string) => { reload(); const entry = message(body); persist(); return entry; },
  incomingAdmin: (body: string) => { reload(); const entry = message(body, true); persist(); return entry; },
  dismissNotification: () => { state.episodes[viewer] = null; persist(); },
  raceNextRead: (body: string) => { readRaceMessage = body; },
  setEnabled: (value: boolean) => { enabled = value; },
  failResponse: () => { failedResponse = true; },
  failHistory: (fail: boolean) => { historyFails = fail; },
  deny: () => { denied = true; },
  viewer: () => viewer,
  setViewer: (value: Viewer) => { viewer = value; window.dispatchEvent(new Event("fixture-viewer")); },
  duplicateRequest: () => requestMatchAdminAssistance({ roomId: ROOM_ID, expectedRequestVersion: state.assistance.requestVersion }),
  snapshot: () => {
    reload();
    return { count: state.messages.length, lastRead: state.reads[viewer] ?? 0, resolveCalls, historyCalls, summaryCalls,
      earlierCalls, readCalls, assistanceMutations, assistance: assistance(), episode: state.episodes[viewer] ?? null,
      messages: structuredClone(state.messages) };
  },
};
declare global { interface Window { matchRoomFixture: typeof fixture } }
window.matchRoomFixture = fixture;
