import type { MatchRoomReadResult } from "@/lib/match-room";

export const MATCH_ROOM_READ_ACKNOWLEDGED_EVENT = "ironclad:match-room-read-acknowledged";
export type MatchRoomReadAcknowledged = MatchRoomReadResult & { matchId: string };

// A successful existing read acknowledgment invalidates the private projection.
// This event is never itself evidence that a room has no unread messages.
export function notifyMatchRoomReadAcknowledged(detail: MatchRoomReadAcknowledged) {
  window.dispatchEvent(new CustomEvent(MATCH_ROOM_READ_ACKNOWLEDGED_EVENT, { detail }));
}
