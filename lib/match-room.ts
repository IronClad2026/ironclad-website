export const MATCH_ROOM_MESSAGE_MAX_LENGTH = 1000;
export const MATCH_ROOM_HISTORY_MAX_LIMIT = 50;

export type MatchRoomClosureReason =
  | "lifecycle_changed"
  | "match_completed"
  | "tournament_closed"
  | "match_unavailable";

export type MatchRoom = {
  id: string;
  matchId: string;
  roomRevision: number;
  communicationGeneration: number;
  activationVersionSnapshot: number;
  playerOneRegistrationId: string;
  playerTwoRegistrationId: string;
  viewerRegistrationId: string | null;
  createdAt: string;
  closedAt: string | null;
  closureReason: MatchRoomClosureReason | null;
  writable: boolean;
  lastSequence: number;
  lastReadSequence: number;
};

export type MatchRoomMessage = {
  id: string;
  roomId: string;
  sequence: number;
  senderKind: "player" | "admin";
  senderRegistrationId: string | null;
  body: string;
  createdAt: string;
};

export type ResolveMatchRoomInput = { matchId: string };
export type MatchRoomHistoryInput = {
  roomId: string;
  afterSequence: number;
  limit: number;
};
export type SendMatchRoomMessageInput = {
  matchId: string;
  expectedRoomId: string;
  clientMessageId: string;
  body: string;
};
export type MarkMatchRoomReadInput = {
  roomId: string;
  throughSequence: number;
};

export type ResolveMatchRoomResult = { room: MatchRoom | null };
export type MatchRoomHistory = {
  room: MatchRoom;
  messages: MatchRoomMessage[];
  hasMore: boolean;
  nextAfterSequence: number;
};
export type MatchRoomSendResult = {
  message: MatchRoomMessage;
  duplicate: boolean;
};
export type MatchRoomReadResult = {
  roomId: string;
  lastReadSequence: number;
};

export type MatchRoomErrorCode =
  | "auth_required"
  | "forbidden"
  | "invalid_request"
  | "stale_room"
  | "read_only"
  | "rate_limited"
  | "idempotency_conflict"
  | "legal_required"
  | "legal_unavailable"
  | "unavailable";
export type MatchRoomActionFailure = { ok: false; code: MatchRoomErrorCode };
export type MatchRoomActionResult<T> =
  | { ok: true; data: T }
  | MatchRoomActionFailure;

const ROOM_KEYS = [
  "id", "matchId", "roomRevision", "communicationGeneration",
  "activationVersionSnapshot", "playerOneRegistrationId",
  "playerTwoRegistrationId", "viewerRegistrationId", "createdAt",
  "closedAt", "closureReason", "writable", "lastSequence", "lastReadSequence",
] as const;
const MESSAGE_KEYS = [
  "id", "roomId", "sequence", "senderKind", "senderRegistrationId", "body",
  "createdAt",
] as const;
const CLOSURE_REASONS: readonly MatchRoomClosureReason[] = [
  "lifecycle_changed", "match_completed", "tournament_closed", "match_unavailable",
];

export function isResolveMatchRoomInput(value: unknown): value is ResolveMatchRoomInput {
  return isRecord(value) && hasExactKeys(value, ["matchId"]) && isUuid(value.matchId);
}

export function isMatchRoomHistoryInput(value: unknown): value is MatchRoomHistoryInput {
  return isRecord(value) &&
    hasExactKeys(value, ["roomId", "afterSequence", "limit"]) &&
    isUuid(value.roomId) &&
    isSequence(value.afterSequence) &&
    isPositiveInteger(value.limit) &&
    value.limit <= MATCH_ROOM_HISTORY_MAX_LIMIT;
}

export function isSendMatchRoomMessageInput(value: unknown): value is SendMatchRoomMessageInput {
  return isRecord(value) &&
    hasExactKeys(value, ["matchId", "expectedRoomId", "clientMessageId", "body"]) &&
    isUuid(value.matchId) &&
    isUuid(value.expectedRoomId) &&
    isUuid(value.clientMessageId) &&
    isMatchRoomMessageBody(value.body);
}

export function isMarkMatchRoomReadInput(value: unknown): value is MarkMatchRoomReadInput {
  return isRecord(value) &&
    hasExactKeys(value, ["roomId", "throughSequence"]) &&
    isUuid(value.roomId) &&
    isSequence(value.throughSequence);
}

/** Match PostgreSQL char_length while preserving the exact idempotent body. */
export function isMatchRoomMessageBody(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > MATCH_ROOM_MESSAGE_MAX_LENGTH * 2 ||
    value.trim().length === 0
  ) {
    return false;
  }

  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return false;
    length++;
    if (length > MATCH_ROOM_MESSAGE_MAX_LENGTH) return false;
  }
  return true;
}

export function parseMatchRoom(value: unknown): MatchRoom | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ROOM_KEYS) ||
    !isUuid(value.id) ||
    !isUuid(value.matchId) ||
    !isPositiveInteger(value.roomRevision) ||
    !isPositiveInteger(value.communicationGeneration) ||
    !isSequence(value.activationVersionSnapshot) ||
    !isUuid(value.playerOneRegistrationId) ||
    !isUuid(value.playerTwoRegistrationId) ||
    value.playerOneRegistrationId === value.playerTwoRegistrationId ||
    (value.viewerRegistrationId !== null &&
      value.viewerRegistrationId !== value.playerOneRegistrationId &&
      value.viewerRegistrationId !== value.playerTwoRegistrationId) ||
    !isTimestamp(value.createdAt) ||
    (value.closedAt !== null && !isTimestamp(value.closedAt)) ||
    !isClosureReason(value.closureReason) ||
    (value.closedAt === null) !== (value.closureReason === null) ||
    typeof value.writable !== "boolean" ||
    (value.closedAt !== null && value.writable) ||
    !isSequence(value.lastSequence) ||
    !isSequence(value.lastReadSequence) ||
    value.lastReadSequence > value.lastSequence
  ) {
    return null;
  }

  return {
    id: value.id,
    matchId: value.matchId,
    roomRevision: value.roomRevision,
    communicationGeneration: value.communicationGeneration,
    activationVersionSnapshot: value.activationVersionSnapshot,
    playerOneRegistrationId: value.playerOneRegistrationId,
    playerTwoRegistrationId: value.playerTwoRegistrationId,
    viewerRegistrationId: value.viewerRegistrationId,
    createdAt: value.createdAt,
    closedAt: value.closedAt,
    closureReason: value.closureReason,
    writable: value.writable,
    lastSequence: value.lastSequence,
    lastReadSequence: value.lastReadSequence,
  };
}

export function parseResolveMatchRoomResult(
  value: unknown,
  expectedMatchId: string
): ResolveMatchRoomResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ["room"])) return null;
  if (value.room === null) return { room: null };
  const room = parseMatchRoom(value.room);
  return room?.matchId === expectedMatchId ? { room } : null;
}

export function parseMatchRoomHistory(
  value: unknown,
  input: MatchRoomHistoryInput
): MatchRoomHistory | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["room", "messages", "hasMore", "nextAfterSequence"]) ||
    !Array.isArray(value.messages) ||
    value.messages.length > input.limit ||
    typeof value.hasMore !== "boolean" ||
    !isSequence(value.nextAfterSequence)
  ) {
    return null;
  }

  const room = parseMatchRoom(value.room);
  if (!room || room.id !== input.roomId) return null;
  const messages: MatchRoomMessage[] = [];
  const messageIds = new Set<string>();
  let sequence = input.afterSequence;
  for (const row of value.messages) {
    const message = parseMatchRoomMessage(row);
    if (
      !message ||
      message.roomId !== room.id ||
      message.sequence <= sequence ||
      message.sequence > room.lastSequence ||
      messageIds.has(message.id) ||
      (message.senderKind === "player" &&
        message.senderRegistrationId !== room.playerOneRegistrationId &&
        message.senderRegistrationId !== room.playerTwoRegistrationId)
    ) {
      return null;
    }
    messages.push(message);
    messageIds.add(message.id);
    sequence = message.sequence;
  }

  if (
    value.nextAfterSequence !== sequence ||
    (value.hasMore && (messages.length !== input.limit || sequence >= room.lastSequence))
  ) {
    return null;
  }

  return {
    room,
    messages,
    hasMore: value.hasMore,
    nextAfterSequence: value.nextAfterSequence,
  };
}

export function parseMatchRoomSendResult(
  value: unknown,
  input: SendMatchRoomMessageInput,
  senderKind: MatchRoomMessage["senderKind"]
): MatchRoomSendResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ["message", "duplicate"]) ||
    typeof value.duplicate !== "boolean") return null;
  const message = parseMatchRoomMessage(value.message);
  if (!message || message.roomId !== input.expectedRoomId ||
    message.senderKind !== senderKind || message.body !== input.body) return null;
  return { message, duplicate: value.duplicate };
}

export function parseMatchRoomReadResult(
  value: unknown,
  input: MarkMatchRoomReadInput
): MatchRoomReadResult | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["roomId", "lastReadSequence"]) ||
    value.roomId !== input.roomId ||
    !isSequence(value.lastReadSequence) ||
    value.lastReadSequence < input.throughSequence
  ) {
    return null;
  }
  return { roomId: input.roomId, lastReadSequence: value.lastReadSequence };
}

function parseMatchRoomMessage(value: unknown): MatchRoomMessage | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, MESSAGE_KEYS) ||
    !isUuid(value.id) ||
    !isUuid(value.roomId) ||
    !isPositiveInteger(value.sequence) ||
    (value.senderKind !== "player" && value.senderKind !== "admin") ||
    (value.senderKind === "player" ? !isUuid(value.senderRegistrationId) :
      value.senderRegistrationId !== null) ||
    !isMatchRoomMessageBody(value.body) ||
    !isTimestamp(value.createdAt)
  ) {
    return null;
  }
  return {
    id: value.id,
    roomId: value.roomId,
    sequence: value.sequence,
    senderKind: value.senderKind,
    senderRegistrationId: value.senderRegistrationId as string | null,
    body: value.body,
    createdAt: value.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isSequence(value) && value > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isClosureReason(value: unknown): value is MatchRoomClosureReason | null {
  return value === null || CLOSURE_REASONS.includes(value as MatchRoomClosureReason);
}
