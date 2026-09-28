export const MATCH_ROOM_UNREAD_BATCH_LIMIT = 128;

export type MatchRoomUnreadSource = "opponent" | "admin" | "generic";
export type MatchRoomUnreadItem = {
  matchId: string;
  roomId: string;
  unreadSource: MatchRoomUnreadSource;
};
export type MatchRoomUnreadInput = { matchIds: string[] };
export type MatchRoomUnreadSummary = { items: MatchRoomUnreadItem[] };

export function isMatchRoomUnreadInput(value: unknown): value is MatchRoomUnreadInput {
  if (!isRecord(value) || !hasExactKeys(value, ["matchIds"]) ||
    !Array.isArray(value.matchIds) || value.matchIds.length > MATCH_ROOM_UNREAD_BATCH_LIMIT ||
    !value.matchIds.every(isUuid)) return false;
  return new Set(value.matchIds.map((id) => id.toLowerCase())).size === value.matchIds.length;
}

/** Reject extra private fields, unrequested matches, duplicate matches or rooms. */
export function parseMatchRoomUnreadSummary(
  value: unknown,
  input: MatchRoomUnreadInput
): MatchRoomUnreadSummary | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items"]) || !Array.isArray(value.items) ||
    value.items.length > input.matchIds.length) return null;
  const requested = new Set(input.matchIds.map((id) => id.toLowerCase()));
  const seenMatches = new Set<string>();
  const seenRooms = new Set<string>();
  const items: MatchRoomUnreadItem[] = [];
  for (const row of value.items) {
    if (!isRecord(row) || !hasExactKeys(row, ["matchId", "roomId", "unreadSource"]) ||
      !isUuid(row.matchId) || !isUuid(row.roomId) ||
      !requested.has(row.matchId.toLowerCase()) || seenMatches.has(row.matchId.toLowerCase()) ||
      seenRooms.has(row.roomId.toLowerCase()) ||
      (row.unreadSource !== "opponent" && row.unreadSource !== "admin" && row.unreadSource !== "generic")) {
      return null;
    }
    seenMatches.add(row.matchId.toLowerCase());
    seenRooms.add(row.roomId.toLowerCase());
    items.push({ matchId: row.matchId, roomId: row.roomId, unreadSource: row.unreadSource });
  }
  return { items };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
