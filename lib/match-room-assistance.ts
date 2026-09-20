export type MatchRoomAssistance = {
  roomId: string;
  status: "none" | "requested" | "resolved";
  requestVersion: number;
  requestedAt: string | null;
  resolvedAt: string | null;
  canResolve: boolean;
};

export type MatchRoomAssistanceInput = { roomId: string };
export type MutateMatchRoomAssistanceInput = MatchRoomAssistanceInput & {
  expectedRequestVersion: number;
};

export function isRoomAssistanceInput(value: unknown): value is MatchRoomAssistanceInput {
  return isRecord(value) && Object.keys(value).length === 1 && isUuid(value.roomId);
}

export function isMutateRoomAssistanceInput(value: unknown): value is MutateMatchRoomAssistanceInput {
  return isRecord(value) && Object.keys(value).length === 2 && isUuid(value.roomId) &&
    Number.isSafeInteger(value.expectedRequestVersion) && (value.expectedRequestVersion as number) >= 0;
}

export function parseRoomAssistance(value: unknown, roomId: string): MatchRoomAssistance | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !==
    "canResolve,requestVersion,requestedAt,resolvedAt,roomId,status" ||
    value.roomId !== roomId || !isUuid(value.roomId) || typeof value.canResolve !== "boolean" ||
    !Number.isSafeInteger(value.requestVersion) || (value.requestVersion as number) < 0) return null;
  if (value.status === "none") {
    if (value.requestVersion !== 0 || value.requestedAt !== null || value.resolvedAt !== null) return null;
  } else if (value.status === "requested" || value.status === "resolved") {
    if ((value.requestVersion as number) < 1 || !isTimestamp(value.requestedAt)) return null;
    if (value.status === "requested" ? value.resolvedAt !== null : !isTimestamp(value.resolvedAt)) return null;
    if (value.status === "resolved" && Date.parse(value.resolvedAt as string) < Date.parse(value.requestedAt as string)) return null;
  } else return null;
  return value as MatchRoomAssistance;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
