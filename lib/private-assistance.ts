export const ASSISTANCE_MESSAGE_MAX_LENGTH = 1000;
export const ASSISTANCE_HISTORY_LIMIT = 50;
export const ASSISTANCE_PAGE_SIZE = 25;

export type AssistanceStatus = "open" | "in_progress" | "resolved";
export type AssistanceFilter = "all" | AssistanceStatus;
export type AssistanceErrorCode = "auth_required" | "forbidden" | "invalid_request" |
  "disabled" | "conflict" | "rate_limited" | "legal_required" | "unavailable";
export type AssistanceResult<T> = { ok: true; data: T } | { ok: false; code: AssistanceErrorCode };

export type AssistanceRoom = {
  roomId: string;
  tournamentId: string;
  tournamentTitle: string;
  tournamentBracketId: string;
  divisionName: string;
  matchId: string;
  matchReference: string;
  reference: string;
};

export type AssistanceRequest = Omit<AssistanceRoom, "roomId"> & {
  id: string;
  roomId: string;
  requesterRegistrationId: string;
  requesterName: string;
  status: AssistanceStatus;
  version: number;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  contentPurgedAt: string | null;
};

export type AssistanceMessage = {
  id: string;
  requestId: string;
  sequence: number;
  senderKind: "requester" | "admin";
  body: string | null;
  createdAt: string;
  redactedAt: string | null;
};

export type AssistanceContext = {
  newRequestsEnabled: boolean;
  canCreate: boolean;
  room: AssistanceRoom;
  request: AssistanceRequest | null;
  discordUrl: string | null;
};

export type AssistanceConversation = {
  request: AssistanceRequest;
  messages: AssistanceMessage[];
  hasMore: boolean;
  nextAfterSequence: number;
  canReply: boolean;
  canSetStatus: boolean;
};

export type AssistanceMutation = {
  request: AssistanceRequest;
  message: AssistanceMessage | null;
  accepted: boolean;
  acceptedClientMessageId: string | null;
  duplicate: boolean;
};

export type AssistanceAdminQueue = {
  tournamentId: string;
  requests: AssistanceRequest[];
  counts: { all: number; open: number; in_progress: number; resolved: number };
  filteredCount: number;
  page: number;
  pageCount: number;
  filter: AssistanceFilter;
  selectedRequest: AssistanceRequest | null;
  newRequestsEnabled: boolean;
};

export type AssistanceHistoryInput = {
  requestId: string;
  tournamentId: string;
  afterSequence: number;
  limit: number;
};
export type AssistanceOpenInput = { roomId: string; clientMessageId: string; body: string };
export type AssistanceReplyInput = {
  requestId: string; tournamentId: string; clientMessageId: string; body: string;
};
export type AssistanceStatusInput = {
  requestId: string; tournamentId: string; status: AssistanceStatus; expectedVersion: number;
};
export type AssistanceQueueInput = {
  tournamentId: string; filter: AssistanceFilter; page: number; selectedId: string | null;
};

export function isAssistanceUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function isAssistanceStatus(value: unknown): value is AssistanceStatus {
  return value === "open" || value === "in_progress" || value === "resolved";
}
export function isAssistanceFilter(value: unknown): value is AssistanceFilter {
  return value === "all" || isAssistanceStatus(value);
}
export function isAssistanceRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function hasAssistanceKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
export function isAssistanceBody(value: unknown): value is string {
  return typeof value === "string" && value.length <= ASSISTANCE_MESSAGE_MAX_LENGTH * 2 &&
    /[^\s\u0085\u200b\u2060]/u.test(value) && Array.from(value).length <= ASSISTANCE_MESSAGE_MAX_LENGTH;
}
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const timestamp = (v: unknown): v is string => typeof v === "string" && v.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const nullableTimestamp = (v: unknown): v is string | null => v === null || timestamp(v);
const label = (v: unknown): v is string => typeof v === "string" && v.length <= 2000;

// Explicit projections keep unexpected database fields (especially identities)
// out of serialized Server Action responses.
export function parseAssistanceRoom(value: unknown): AssistanceRoom | null {
  if (!isAssistanceRecord(value) || !isAssistanceUuid(value.roomId) || !isAssistanceUuid(value.tournamentId) ||
    !isAssistanceUuid(value.tournamentBracketId) || !isAssistanceUuid(value.matchId) ||
    !label(value.tournamentTitle) || !label(value.divisionName) || !label(value.matchReference) || !label(value.reference)) return null;
  return { roomId: value.roomId, tournamentId: value.tournamentId, tournamentBracketId: value.tournamentBracketId,
    matchId: value.matchId, tournamentTitle: value.tournamentTitle, divisionName: value.divisionName,
    matchReference: value.matchReference, reference: value.reference };
}

export function parseAssistanceRequest(value: unknown): AssistanceRequest | null {
  const room = parseAssistanceRoom(value);
  if (!room || !isAssistanceRecord(value) || !isAssistanceUuid(value.id) ||
    !isAssistanceUuid(value.requesterRegistrationId) || !label(value.requesterName) || !isAssistanceStatus(value.status) ||
    !integer(value.version, 1) || !integer(value.lastSequence) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) ||
    !nullableTimestamp(value.resolvedAt) || !nullableTimestamp(value.contentPurgedAt) ||
    ((value.status === "resolved") !== (value.resolvedAt !== null))) return null;
  return { ...room, id: value.id, requesterRegistrationId: value.requesterRegistrationId,
    requesterName: value.requesterName, status: value.status, version: value.version, lastSequence: value.lastSequence,
    createdAt: value.createdAt, updatedAt: value.updatedAt, resolvedAt: value.resolvedAt, contentPurgedAt: value.contentPurgedAt };
}

export function parseAssistanceMessage(value: unknown): AssistanceMessage | null {
  if (!isAssistanceRecord(value) || !isAssistanceUuid(value.id) || !isAssistanceUuid(value.requestId) || !integer(value.sequence, 1) ||
    (value.senderKind !== "requester" && value.senderKind !== "admin") || !timestamp(value.createdAt) ||
    !nullableTimestamp(value.redactedAt) || (value.body !== null && !isAssistanceBody(value.body)) ||
    (value.body === null && value.redactedAt === null)) return null;
  return { id: value.id, requestId: value.requestId, sequence: value.sequence, senderKind: value.senderKind,
    body: value.body, createdAt: value.createdAt, redactedAt: value.redactedAt };
}

export function parseAssistanceContext(value: unknown): AssistanceContext | null {
  if (!isAssistanceRecord(value) || typeof value.newRequestsEnabled !== "boolean" || typeof value.canCreate !== "boolean") return null;
  if (value.discordUrl !== null && (typeof value.discordUrl !== "string" ||
    !/^https:\/\/discord\.com\/channels\/\d+\/\d+(?:\/\d+)?$/.test(value.discordUrl))) return null;
  const room = parseAssistanceRoom(value.room);
  const request = value.request === null ? null : parseAssistanceRequest(value.request);
  if (!room || (value.request !== null && !request) || (request &&
    (request.roomId !== room.roomId || request.tournamentId !== room.tournamentId ||
      request.tournamentBracketId !== room.tournamentBracketId || request.matchId !== room.matchId)) ||
    (value.canCreate && (!value.newRequestsEnabled || request !== null))) return null;
  return { room, request, newRequestsEnabled: value.newRequestsEnabled, canCreate: value.canCreate, discordUrl: value.discordUrl };
}

export function parseAssistanceConversation(value: unknown): AssistanceConversation | null {
  if (!isAssistanceRecord(value) || !Array.isArray(value.messages) || value.messages.length > ASSISTANCE_HISTORY_LIMIT ||
    typeof value.hasMore !== "boolean" || !integer(value.nextAfterSequence) ||
    typeof value.canReply !== "boolean" || typeof value.canSetStatus !== "boolean") return null;
  const request = parseAssistanceRequest(value.request);
  const messages = value.messages.map(parseAssistanceMessage);
  if (!request || messages.some((m) => !m || m.requestId !== request.id) ||
    messages.some((m, i) => i > 0 && m!.sequence <= messages[i - 1]!.sequence) ||
    messages.some((m) => m!.sequence > request.lastSequence) || value.nextAfterSequence > request.lastSequence ||
    (messages.length > 0 && value.nextAfterSequence !== messages[messages.length - 1]!.sequence)) return null;
  return { request, messages: messages as AssistanceMessage[], hasMore: value.hasMore,
    nextAfterSequence: value.nextAfterSequence, canReply: value.canReply, canSetStatus: value.canSetStatus };
}

export function parseAssistanceMutation(value: unknown): AssistanceMutation | null {
  if (!isAssistanceRecord(value) || typeof value.accepted !== "boolean" || typeof value.duplicate !== "boolean" ||
    (value.acceptedClientMessageId !== null && !isAssistanceUuid(value.acceptedClientMessageId))) return null;
  const request = parseAssistanceRequest(value.request);
  const message = value.message === null ? null : parseAssistanceMessage(value.message);
  if (!request || (value.message !== null && !message) || (message && message.requestId !== request.id) ||
    (value.accepted && (!message || !value.acceptedClientMessageId)) ||
    (!value.accepted && (message !== null || value.acceptedClientMessageId !== null))) return null;
  return { request, message, accepted: value.accepted,
    acceptedClientMessageId: value.acceptedClientMessageId, duplicate: value.duplicate };
}

export function parseAssistanceQueue(value: unknown, tournamentId: string): AssistanceAdminQueue | null {
  if (!isAssistanceRecord(value) || value.tournamentId !== tournamentId || !Array.isArray(value.requests) ||
    value.requests.length > ASSISTANCE_PAGE_SIZE || !isAssistanceRecord(value.counts) ||
    !isAssistanceFilter(value.filter) || !integer(value.filteredCount) || !integer(value.page, 1) || !integer(value.pageCount, 1) ||
    typeof value.newRequestsEnabled !== "boolean") return null;
  const { all, open, in_progress, resolved } = value.counts;
  if (!integer(all) || !integer(open) || !integer(in_progress) || !integer(resolved) || all !== open + in_progress + resolved ||
    value.filteredCount !== (value.filter === "all" ? all : value.counts[value.filter]) ||
    value.pageCount !== Math.max(1, Math.ceil(value.filteredCount / ASSISTANCE_PAGE_SIZE)) || value.page > value.pageCount) return null;
  const requests = value.requests.map(parseAssistanceRequest);
  const selectedRequest = value.selectedRequest === null ? null : parseAssistanceRequest(value.selectedRequest);
  if (requests.length !== Math.min(ASSISTANCE_PAGE_SIZE, value.filteredCount - (value.page - 1) * ASSISTANCE_PAGE_SIZE) ||
    requests.some((r) => !r || r.tournamentId !== tournamentId || (value.filter !== "all" && r.status !== value.filter)) ||
    new Set(requests.map((r) => r?.id)).size !== requests.length ||
    (value.selectedRequest !== null && (!selectedRequest || selectedRequest.tournamentId !== tournamentId))) return null;
  return { tournamentId, requests: requests as AssistanceRequest[], counts: { all, open, in_progress, resolved },
    filteredCount: value.filteredCount, page: value.page, pageCount: value.pageCount, filter: value.filter,
    selectedRequest, newRequestsEnabled: value.newRequestsEnabled };
}
