// Synthetic per-room unread episodes for browser visibility tests only.
import type { MatchRoom, MatchRoomMessage } from "@/lib/match-room";
import { uxMatch } from "@/tests/fixtures/match-result-ux";

export const FIRST_ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SECOND_ROOM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const SECOND_MATCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const timestamp = "2026-09-19T01:00:00.000Z";
type State = {
  room: MatchRoom;
  messages: MatchRoomMessage[];
  historyCalls: number;
  readCalls: number;
  episode: string | null;
  pushStatus: "pending" | "skipped";
};
const states = new Map<string, State>();
for (const [roomId, matchId, label] of [
  [FIRST_ROOM_ID, uxMatch.id, "First room"],
  [SECOND_ROOM_ID, SECOND_MATCH_ID, "Second room"],
]) {
  states.set(roomId, {
    room: {
      id: roomId, matchId, roomRevision: 1, communicationGeneration: 1,
      activationVersionSnapshot: 1, playerOneRegistrationId: uxMatch.playerOneRegistrationId!,
      playerTwoRegistrationId: uxMatch.playerTwoRegistrationId!, viewerRegistrationId: uxMatch.playerOneRegistrationId,
      createdAt: timestamp, closedAt: null, closureReason: null, writable: true,
      lastSequence: 1, lastReadSequence: 0,
    },
    messages: [{ id: crypto.randomUUID(), roomId, sequence: 1, senderKind: "player",
      senderRegistrationId: uxMatch.playerTwoRegistrationId, body: label + " unread message", createdAt: timestamp }],
    historyCalls: 0, readCalls: 0, episode: crypto.randomUUID(), pushStatus: "pending",
  });
}
const ok = <T,>(data: T) => ({ ok: true as const, data: structuredClone(data) });
export const visibilityTransport = {
  resolve: ({ matchId }: { matchId: string }) => ok({ room: [...states.values()].find((state) => state.room.matchId === matchId)!.room }),
  history: (input: { roomId: string; afterSequence: number; limit: number }) => {
    const state = states.get(input.roomId)!;
    state.historyCalls++;
    const messages = state.messages.filter((entry) => entry.sequence > input.afterSequence).slice(0, input.limit);
    const nextAfterSequence = messages.at(-1)?.sequence ?? input.afterSequence;
    return ok({ room: state.room, messages, hasMore: nextAfterSequence < state.room.lastSequence, nextAfterSequence });
  },
  read: ({ roomId, throughSequence }: { roomId: string; throughSequence: number }) => {
    const state = states.get(roomId)!;
    state.readCalls++;
    state.room.lastReadSequence = Math.max(state.room.lastReadSequence, Math.min(throughSequence, state.room.lastSequence));
    if (state.room.lastReadSequence === state.room.lastSequence) {
      state.episode = null;
      state.pushStatus = "skipped";
    }
    return ok({ roomId, lastReadSequence: state.room.lastReadSequence });
  },
};
export const visibilityFixture = {
  incoming: (roomId: string, body: string) => {
    const state = states.get(roomId)!;
    state.room.lastSequence++;
    state.messages.push({ id: crypto.randomUUID(), roomId, sequence: state.room.lastSequence,
      senderKind: "player", senderRegistrationId: uxMatch.playerTwoRegistrationId, body, createdAt: timestamp });
    state.episode ??= crypto.randomUUID();
    state.pushStatus = "pending";
  },
  snapshot: (roomId: string) => structuredClone(states.get(roomId)!),
};
declare global { interface Window { matchRoomVisibilityFixture: typeof visibilityFixture } }
window.matchRoomVisibilityFixture = visibilityFixture;
