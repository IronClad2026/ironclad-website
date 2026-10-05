export type WarfrontCommandErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "LEGAL_REQUIRED"
  | "LEGAL_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_AVAILABLE"
  | "LIFECYCLE_CONFLICT"
  | "CONCURRENCY_CONFLICT"
  | "INTERNAL_ERROR";

export type WarfrontCommandError = {
  code: WarfrontCommandErrorCode;
  message: string;
  retryable: boolean;
};

export type CommandResult<T> =
  | {
      ok: true;
      data: T;
      correlationId: string;
    }
  | {
      ok: false;
      error: WarfrontCommandError;
      correlationId: string;
    };

export type CreateWarfrontCompanyInput = {
  name: string;
  tag: string;
  slug: string;
  description?: string | null;
  region?: string | null;
};

export type CreateWarfrontCompanyOutput = {
  companyId: string;
  role: "commander";
  createdAt: string;
  duplicate: boolean;
};

export type WarfrontCompanyIdInput = {
  companyId: string;
};

export type WarfrontCompanyMemberInput = {
  companyId: string;
  targetPlayerId: string;
};

export type WarfrontInvitationIdInput = {
  invitationId: string;
};

export type InviteWarfrontCompanyPlayerInput = {
  companyId: string;
  recipientPlayerId: string;
};

export type LeaveWarfrontCompanyOutput = {
  companyId: string;
  leftAt: string;
  openOperationCancelled: boolean;
};

export type RemoveWarfrontCompanyMemberOutput = {
  companyId: string;
  removedAt: string;
  openOperationCancelled: boolean;
};

export type PromoteWarfrontCompanyMemberOutput = {
  companyId: string;
  role: "officer";
  duplicate: boolean;
};

export type DemoteWarfrontCompanyOfficerOutput = {
  companyId: string;
  role: "member";
  duplicate: boolean;
};

export type TransferWarfrontCompanyCommanderOutput = {
  companyId: string;
  transferredAt: string;
  duplicate: boolean;
};

export type ArchiveWarfrontCompanyOutput = {
  companyId: string;
  status: "archived";
  archivedAt?: string;
  duplicate: boolean;
};

export type InviteWarfrontCompanyPlayerOutput = {
  invitationId: string;
  companyId: string;
  status: "pending";
  duplicate: boolean;
};

export type AcceptWarfrontCompanyInvitationOutput = {
  invitationId: string;
  companyId: string;
  status: "accepted";
  duplicate: boolean;
};

export type DeclineWarfrontCompanyInvitationOutput = {
  invitationId: string;
  status: "declined";
  duplicate: boolean;
};

export type RevokeWarfrontCompanyInvitationOutput = {
  invitationId: string;
  status: "invalidated";
  duplicate: boolean;
};

export type CancelWarfrontOpenOperationInput = {
  operationId: string;
};

export type WarfrontOperationFormat = "2v2" | "3v3" | "4v4";

export type IssueWarfrontOperationInput = {
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerPlayerIds: string[];
  region?: string | null;
  notes?: string | null;
};

export type AcceptWarfrontOperationInput = {
  operationId: string;
  opponentPlayerIds: string[];
};

export type SubmitWarfrontOperationResultInput = {
  operationId: string;
  clientSubmissionId: string;
  challengerWins: number;
  opponentWins: number;
};

export type ConfirmWarfrontOperationResultInput = {
  operationId: string;
};

export type DisputeWarfrontOperationResultInput = {
  operationId: string;
};

export type CancelWarfrontOpenOperationOutput = {
  operationId: string;
  status: "cancelled";
  cancelledAt: string;
  duplicate: boolean;
};

export type IssueWarfrontOperationOutput = {
  operationId: string;
  status: "open";
  challengerCompanyId: string;
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerRosterEloSnapshot: number;
  openedAt: string;
  expiresAt: string;
};

export type AcceptWarfrontOperationOutput = {
  operationId: string;
  status: "accepted";
  challengerCompanyId: string;
  opponentCompanyId: string;
  format: WarfrontOperationFormat;
  seriesBestOf: number;
  challengerRosterEloSnapshot: number;
  opponentRosterEloSnapshot: number;
  acceptedAt: string;
  rosterLockedAt: string;
};

export type WarfrontOperationSubmittedResult = {
  challengerWins: number;
  opponentWins: number;
  winnerSide: string;
};

export type WarfrontOperationResultState = {
  operationId: string;
  operationStatus: string;
  submittedResult: WarfrontOperationSubmittedResult;
  disputed: boolean;
};

export type SubmitWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  duplicate: boolean;
};

export type ConfirmWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  outcome: "confirmed" | "already_confirmed" | "already_finalized";
};

export type DisputeWarfrontOperationResultOutput = {
  result: WarfrontOperationResultState;
  outcome: "disputed" | "already_finalized";
};

export type WarfrontRoomSide = "challenger" | "opponent";
export type WarfrontRoomDiceGameState =
  | "locked"
  | "open"
  | "waiting"
  | "tied"
  | "complete";

export type WarfrontRoomCompany = {
  companyId: string;
  name: string;
  tag: string;
  slug: string;
  logo: string | null;
  banner: string | null;
};

export type WarfrontRoomRosterEntry = {
  side: WarfrontRoomSide;
  eloSnapshot: number;
  selectedAt: string;
  playerId: string | null;
  displayName: string;
};

export type WarfrontRoomDiceRoll = {
  side: WarfrontRoomSide;
  rolledByPlayerId: string;
  die1: number;
  die2: number;
  total: number;
  rolledAt: string;
};

export type WarfrontRoomDiceRound = {
  tieRound: number;
  rolls: WarfrontRoomDiceRoll[];
};

export type WarfrontRoomDiceGame = {
  gameNumber: 1 | 3 | 5;
  available: boolean;
  currentTieRound: number | null;
  state: WarfrontRoomDiceGameState;
  canRoll: boolean;
  winnerSide: WarfrontRoomSide | null;
  rounds: WarfrontRoomDiceRound[];
};

export type WarfrontRoomDice = {
  operationId: string;
  status: string;
  seriesBestOf: number;
  startedAt: string | null;
  viewerPlayerId: string;
  viewerSide: WarfrontRoomSide;
  isActionable: boolean;
  readOnlyReason: string | null;
  games: WarfrontRoomDiceGame[];
};

export type WarfrontRoomResultScore = {
  challengerWins: number;
  opponentWins: number;
  winnerSide: string;
};

export type WarfrontRoomResult = {
  operationId: string;
  operationStatus: string;
  seriesBestOf: number;
  submittedResult: WarfrontRoomResultScore | null;
  submittedAt: string | null;
  confirmationDeadline: string | null;
  challengerConfirmed: boolean;
  opponentConfirmed: boolean;
  disputed: boolean;
  disputingSide: WarfrontRoomSide | null;
  finalResult: WarfrontRoomResultScore | null;
  finalizationMode: string | null;
  finalizedAt: string | null;
  logicalAutoFinalizationDue: boolean;
  viewerSide: WarfrontRoomSide;
  canConfirm: boolean;
  canDispute: boolean;
  canAdminResolve: false;
};

export type WarfrontRoomAssistance = {
  operationId: string;
  status: "none" | "requested" | "resolved";
  requestedAt: string | null;
  resolvedAt: string | null;
};

export type WarfrontRoomChat = {
  contentState: "available" | "purged";
  contentPurgedAt: string | null;
  latestSequence: number | null;
  lastReadSequence: number | null;
  unreadCount: number;
};

export type WarfrontRoomCapabilities = {
  canRollByRoomState: boolean;
  canSubmitResultByRoomState: boolean;
  canConfirmResultByRoomState: boolean;
  canDisputeByRoomState: boolean;
  canReadChat: true;
  canSendChatByRoomState: boolean;
};

export type WarfrontOperationRoomBootstrap = {
  operationId: string;
  status: string;
  logicalStatus: string;
  format: string;
  seriesBestOf: number;
  region: string | null;
  openedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  serverNow: string;
  challengerCompany: WarfrontRoomCompany;
  opponentCompany: WarfrontRoomCompany;
  rosters: WarfrontRoomRosterEntry[];
  challengerRosterEloSnapshot: number;
  opponentRosterEloSnapshot: number;
  viewerPlayerId: string;
  viewerSide: WarfrontRoomSide;
  dice: WarfrontRoomDice;
  result: WarfrontRoomResult;
  assistance: WarfrontRoomAssistance;
  chat: WarfrontRoomChat;
  capabilities: WarfrontRoomCapabilities;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOM_SIDES: readonly WarfrontRoomSide[] = ["challenger", "opponent"];
const DICE_GAME_STATES: readonly WarfrontRoomDiceGameState[] = [
  "locked",
  "open",
  "waiting",
  "tied",
  "complete",
];
const ASSISTANCE_STATUSES = ["none", "requested", "resolved"] as const;
const CHAT_CONTENT_STATES = ["available", "purged"] as const;

export function isWarfrontOperationRoomId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isWarfrontOperationRoomId(value);
}

/** Rejects malformed or widened RPC payloads before they reach the Room UI. */
export function parseWarfrontOperationRoomBootstrap(
  value: unknown
): WarfrontOperationRoomBootstrap | null {
  if (!hasExactKeys(value, [
    "operationId",
    "status",
    "logicalStatus",
    "format",
    "seriesBestOf",
    "region",
    "openedAt",
    "expiresAt",
    "acceptedAt",
    "startedAt",
    "completedAt",
    "cancelledAt",
    "serverNow",
    "challengerCompany",
    "opponentCompany",
    "rosters",
    "challengerRosterEloSnapshot",
    "opponentRosterEloSnapshot",
    "viewerPlayerId",
    "viewerSide",
    "dice",
    "result",
    "assistance",
    "chat",
    "capabilities",
  ])) return null;

  const operationId = property(value, "operationId");
  const status = property(value, "status");
  const logicalStatus = property(value, "logicalStatus");
  const format = property(value, "format");
  const seriesBestOf = property(value, "seriesBestOf");
  const region = property(value, "region");
  const openedAt = property(value, "openedAt");
  const expiresAt = property(value, "expiresAt");
  const acceptedAt = property(value, "acceptedAt");
  const startedAt = property(value, "startedAt");
  const completedAt = property(value, "completedAt");
  const cancelledAt = property(value, "cancelledAt");
  const serverNow = property(value, "serverNow");
  const challengerCompany = parseCompany(property(value, "challengerCompany"));
  const opponentCompany = parseCompany(property(value, "opponentCompany"));
  const rosters = parseArray(property(value, "rosters"), parseRosterEntry);
  const challengerRosterEloSnapshot = property(value, "challengerRosterEloSnapshot");
  const opponentRosterEloSnapshot = property(value, "opponentRosterEloSnapshot");
  const viewerPlayerId = property(value, "viewerPlayerId");
  const viewerSide = property(value, "viewerSide");
  const dice = parseDice(property(value, "dice"));
  const result = parseResult(property(value, "result"));
  const assistance = parseAssistance(property(value, "assistance"));
  const chat = parseChat(property(value, "chat"));
  const capabilities = parseCapabilities(property(value, "capabilities"));

  if (
    !isWarfrontOperationRoomId(operationId) || !isString(status) ||
    !isString(logicalStatus) || !isString(format) || !isFiniteNumber(seriesBestOf) ||
    !isNullableString(region) || !isTimestamp(openedAt) || !isTimestamp(expiresAt) ||
    !isNullableTimestamp(acceptedAt) || !isNullableTimestamp(startedAt) ||
    !isNullableTimestamp(completedAt) || !isNullableTimestamp(cancelledAt) ||
    !isTimestamp(serverNow) ||
    !challengerCompany ||
    !opponentCompany ||
    !rosters ||
    !isFiniteNumber(challengerRosterEloSnapshot) || !isFiniteNumber(opponentRosterEloSnapshot) ||
    !isWarfrontOperationRoomId(viewerPlayerId) || !isRoomSide(viewerSide) ||
    !dice ||
    !result ||
    !assistance ||
    !chat ||
    !capabilities
  ) return null;

  return {
    operationId, status, logicalStatus, format, seriesBestOf, region, openedAt, expiresAt,
    acceptedAt, startedAt, completedAt, cancelledAt, serverNow,
    challengerCompany,
    opponentCompany,
    rosters,
    challengerRosterEloSnapshot, opponentRosterEloSnapshot, viewerPlayerId, viewerSide,
    dice,
    result,
    assistance,
    chat,
    capabilities,
  };
}

function parseCompany(value: unknown): WarfrontRoomCompany | null {
  if (!hasExactKeys(value, ["companyId", "name", "tag", "slug", "logo", "banner"])) return null;
  const companyId = property(value, "companyId"); const name = property(value, "name");
  const tag = property(value, "tag"); const slug = property(value, "slug");
  const logo = property(value, "logo"); const banner = property(value, "banner");
  if (
    !isWarfrontOperationRoomId(companyId) || !isString(name) || !isString(tag) ||
    !isString(slug) || !isNullableString(logo) || !isNullableString(banner)
  ) return null;
  return { companyId, name, tag, slug, logo, banner };
}

function parseRosterEntry(value: unknown): WarfrontRoomRosterEntry | null {
  if (!hasExactKeys(value, ["side", "eloSnapshot", "selectedAt", "playerId", "displayName"])) return null;
  const side = property(value, "side"); const eloSnapshot = property(value, "eloSnapshot");
  const selectedAt = property(value, "selectedAt"); const playerId = property(value, "playerId");
  const displayName = property(value, "displayName");
  if (
    !isRoomSide(side) || !isFiniteNumber(eloSnapshot) || !isTimestamp(selectedAt) ||
    !isNullableUuid(playerId) || !isString(displayName)
  ) return null;
  return { side, eloSnapshot, selectedAt, playerId, displayName };
}

function parseDice(value: unknown): WarfrontRoomDice | null {
  if (!hasExactKeys(value, [
    "operationId", "status", "seriesBestOf", "startedAt", "viewerPlayerId", "viewerSide",
    "isActionable", "readOnlyReason", "games",
  ])) return null;
  const operationId = property(value, "operationId"); const status = property(value, "status");
  const seriesBestOf = property(value, "seriesBestOf"); const startedAt = property(value, "startedAt");
  const viewerPlayerId = property(value, "viewerPlayerId"); const viewerSide = property(value, "viewerSide");
  const isActionable = property(value, "isActionable"); const readOnlyReason = property(value, "readOnlyReason");
  const games = parseArray(property(value, "games"), parseDiceGame);
  if (
    !isWarfrontOperationRoomId(operationId) || !isString(status) || !isFiniteNumber(seriesBestOf) ||
    !isNullableTimestamp(startedAt) || !isWarfrontOperationRoomId(viewerPlayerId) ||
    !isRoomSide(viewerSide) || !isBoolean(isActionable) || !isNullableString(readOnlyReason) ||
    !games
  ) return null;
  return { operationId, status, seriesBestOf, startedAt, viewerPlayerId, viewerSide, isActionable, readOnlyReason, games };
}

function parseDiceGame(value: unknown): WarfrontRoomDiceGame | null {
  if (!hasExactKeys(value, ["gameNumber", "available", "currentTieRound", "state", "canRoll", "winnerSide", "rounds"])) return null;
  const gameNumber = property(value, "gameNumber"); const available = property(value, "available");
  const currentTieRound = property(value, "currentTieRound"); const state = property(value, "state");
  const canRoll = property(value, "canRoll"); const winnerSide = property(value, "winnerSide");
  const rounds = parseArray(property(value, "rounds"), parseDiceRound);
  if (
    !isDiceGameNumber(gameNumber) || !isBoolean(available) || !isNullableSafeInteger(currentTieRound) ||
    !isDiceGameState(state) || !isBoolean(canRoll) || !isNullableRoomSide(winnerSide) ||
    !rounds
  ) return null;
  return { gameNumber, available, currentTieRound, state, canRoll, winnerSide, rounds };
}

function parseDiceRound(value: unknown): WarfrontRoomDiceRound | null {
  if (!hasExactKeys(value, ["tieRound", "rolls"])) return null;
  const tieRound = property(value, "tieRound"); const rolls = parseArray(property(value, "rolls"), parseDiceRoll);
  if (!isPositiveSafeInteger(tieRound) || !rolls) return null;
  return { tieRound, rolls };
}

function parseDiceRoll(value: unknown): WarfrontRoomDiceRoll | null {
  if (!hasExactKeys(value, ["side", "rolledByPlayerId", "die1", "die2", "total", "rolledAt"])) return null;
  const side = property(value, "side"); const rolledByPlayerId = property(value, "rolledByPlayerId");
  const die1 = property(value, "die1"); const die2 = property(value, "die2");
  const total = property(value, "total"); const rolledAt = property(value, "rolledAt");
  if (
    !isRoomSide(side) ||
    !isWarfrontOperationRoomId(rolledByPlayerId) ||
    !isDiceFace(die1) ||
    !isDiceFace(die2) ||
    !isDiceTotal(total) ||
    total !== die1 + die2 ||
    !isTimestamp(rolledAt)
  ) return null;
  return { side, rolledByPlayerId, die1, die2, total, rolledAt };
}

function parseResultScore(value: unknown): WarfrontRoomResultScore | null {
  if (!hasExactKeys(value, ["challengerWins", "opponentWins", "winnerSide"])) return null;
  const challengerWins = property(value, "challengerWins"); const opponentWins = property(value, "opponentWins"); const winnerSide = property(value, "winnerSide");
  if (!isFiniteNumber(challengerWins) || !isFiniteNumber(opponentWins) || !isString(winnerSide)) return null;
  return { challengerWins, opponentWins, winnerSide };
}

function parseResult(value: unknown): WarfrontRoomResult | null {
  if (!hasExactKeys(value, [
    "operationId", "operationStatus", "seriesBestOf", "submittedResult", "submittedAt",
    "confirmationDeadline", "challengerConfirmed", "opponentConfirmed", "disputed",
    "disputingSide", "finalResult", "finalizationMode", "finalizedAt",
    "logicalAutoFinalizationDue", "viewerSide", "canConfirm", "canDispute", "canAdminResolve",
  ])) return null;
  const operationId = property(value, "operationId"); const operationStatus = property(value, "operationStatus");
  const seriesBestOf = property(value, "seriesBestOf");
  const submittedResult = parseNullable(property(value, "submittedResult"), parseResultScore);
  const submittedAt = property(value, "submittedAt"); const confirmationDeadline = property(value, "confirmationDeadline");
  const challengerConfirmed = property(value, "challengerConfirmed"); const opponentConfirmed = property(value, "opponentConfirmed");
  const disputed = property(value, "disputed"); const disputingSide = property(value, "disputingSide");
  const finalResult = parseNullable(property(value, "finalResult"), parseResultScore);
  const finalizationMode = property(value, "finalizationMode"); const finalizedAt = property(value, "finalizedAt");
  const logicalAutoFinalizationDue = property(value, "logicalAutoFinalizationDue"); const viewerSide = property(value, "viewerSide");
  const canConfirm = property(value, "canConfirm"); const canDispute = property(value, "canDispute");
  const canAdminResolve = property(value, "canAdminResolve");
  if (
    !isWarfrontOperationRoomId(operationId) || !isString(operationStatus) || !isFiniteNumber(seriesBestOf) ||
    !submittedResult.valid || !isNullableTimestamp(submittedAt) || !isNullableTimestamp(confirmationDeadline) ||
    !isBoolean(challengerConfirmed) || !isBoolean(opponentConfirmed) || !isBoolean(disputed) ||
    !isNullableRoomSide(disputingSide) || !finalResult.valid || !isNullableString(finalizationMode) ||
    !isNullableTimestamp(finalizedAt) || !isBoolean(logicalAutoFinalizationDue) || !isRoomSide(viewerSide) ||
    !isBoolean(canConfirm) || !isBoolean(canDispute) || canAdminResolve !== false
  ) return null;
  return { operationId, operationStatus, seriesBestOf, submittedResult: submittedResult.value, submittedAt, confirmationDeadline, challengerConfirmed, opponentConfirmed, disputed, disputingSide, finalResult: finalResult.value, finalizationMode, finalizedAt, logicalAutoFinalizationDue, viewerSide, canConfirm, canDispute, canAdminResolve: false };
}

function parseAssistance(value: unknown): WarfrontRoomAssistance | null {
  if (!hasExactKeys(value, ["operationId", "status", "requestedAt", "resolvedAt"])) return null;
  const operationId = property(value, "operationId"); const status = property(value, "status");
  const requestedAt = property(value, "requestedAt"); const resolvedAt = property(value, "resolvedAt");
  if (!isWarfrontOperationRoomId(operationId) || !isOneOf(status, ASSISTANCE_STATUSES) || !isNullableTimestamp(requestedAt) || !isNullableTimestamp(resolvedAt)) return null;
  return { operationId, status, requestedAt, resolvedAt };
}

function parseChat(value: unknown): WarfrontRoomChat | null {
  if (!hasExactKeys(value, ["contentState", "contentPurgedAt", "latestSequence", "lastReadSequence", "unreadCount"])) return null;
  const contentState = property(value, "contentState"); const contentPurgedAt = property(value, "contentPurgedAt");
  const latestSequence = property(value, "latestSequence"); const lastReadSequence = property(value, "lastReadSequence");
  const unreadCount = property(value, "unreadCount");
  if (!isOneOf(contentState, CHAT_CONTENT_STATES) || !isNullableTimestamp(contentPurgedAt) || !isNullableSafeInteger(latestSequence) || !isNullableSafeInteger(lastReadSequence) || !isSafeInteger(unreadCount)) return null;
  return { contentState, contentPurgedAt, latestSequence, lastReadSequence, unreadCount };
}

function parseCapabilities(value: unknown): WarfrontRoomCapabilities | null {
  if (!hasExactKeys(value, [
    "canRollByRoomState", "canSubmitResultByRoomState", "canConfirmResultByRoomState",
    "canDisputeByRoomState", "canReadChat", "canSendChatByRoomState",
  ])) return null;
  const canRollByRoomState = property(value, "canRollByRoomState"); const canSubmitResultByRoomState = property(value, "canSubmitResultByRoomState");
  const canConfirmResultByRoomState = property(value, "canConfirmResultByRoomState"); const canDisputeByRoomState = property(value, "canDisputeByRoomState");
  const canReadChat = property(value, "canReadChat"); const canSendChatByRoomState = property(value, "canSendChatByRoomState");
  if (!isBoolean(canRollByRoomState) || !isBoolean(canSubmitResultByRoomState) || !isBoolean(canConfirmResultByRoomState) || !isBoolean(canDisputeByRoomState) || canReadChat !== true || !isBoolean(canSendChatByRoomState)) return null;
  return { canRollByRoomState, canSubmitResultByRoomState, canConfirmResultByRoomState, canDisputeByRoomState, canReadChat: true, canSendChatByRoomState };
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const next = parser(item);
    if (!next) return null;
    parsed.push(next);
  }
  return parsed;
}

function parseNullable<T>(
  value: unknown,
  parser: (candidate: unknown) => T | null
): { valid: true; value: T | null } | { valid: false } {
  if (value === null) return { valid: true, value: null };
  const parsed = parser(value);
  return parsed ? { valid: true, value: parsed } : { valid: false };
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is object {
  if (!isObject(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function property(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isTimestamp(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 1;
}

function isDiceFace(value: unknown): value is number {
  return isPositiveSafeInteger(value) && value <= 6;
}

function isDiceTotal(value: unknown): value is number {
  return isSafeInteger(value) && value >= 2 && value <= 12;
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || isSafeInteger(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRoomSide(value: unknown): value is WarfrontRoomSide {
  return isOneOf(value, ROOM_SIDES);
}

function isNullableRoomSide(value: unknown): value is WarfrontRoomSide | null {
  return value === null || isRoomSide(value);
}

function isDiceGameState(value: unknown): value is WarfrontRoomDiceGameState {
  return isOneOf(value, DICE_GAME_STATES);
}

function isDiceGameNumber(value: unknown): value is 1 | 3 | 5 {
  return value === 1 || value === 3 || value === 5;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}
