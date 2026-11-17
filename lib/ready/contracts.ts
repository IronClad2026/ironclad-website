import { isReadyActionId, isReadyQuestionId } from "./catalogue";
import type { ReadyActionId, ReadyDestinationType, ReadyQuestionId } from "./catalogue";

export const READY_BODY_LIMIT = 2_400;

export type ReadyContext = {
  topic?: string;
  eventSlug?: string;
  matchId?: string;
};

export type ReadyIntent = { kind: "question"; id: ReadyQuestionId } | { kind: "action"; id: ReadyActionId };
export type ReadyMenuRequest = ReadyIntent & { context?: ReadyContext };

export type ReadySource = { title: string; url: string; section: string };

export type ReadyAction = (
  | { label: string; href: string }
  | { label: string; intent: ReadyIntent; context?: ReadyContext }
  | { label: string; copyText: string }
) & { actionId?: ReadyActionId; destinationType?: ReadyDestinationType };

export type ReadyReply = {
  text: string;
  details?: string;
  sources?: ReadySource[];
  actions?: ReadyAction[];
  context?: ReadyContext;
  intent?: ReadyIntent;
  fallback?: boolean;
};

const token = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readContext(value: unknown): ReadyContext | undefined | null {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).some((key) => !["topic", "eventSlug", "matchId"].includes(key))) return null;
  const { topic, eventSlug, matchId } = value;
  if (topic !== undefined && (typeof topic !== "string" || !token.test(topic))) return null;
  if (eventSlug !== undefined && (typeof eventSlug !== "string" || !token.test(eventSlug))) return null;
  if (matchId !== undefined && (typeof matchId !== "string" || !uuid.test(matchId))) return null;
  return { topic, eventSlug, matchId };
}

export function readReadyRequest(value: unknown): ReadyMenuRequest | null {
  if (!record(value) || Object.keys(value).some((key) => !["kind", "id", "context"].includes(key))) return null;
  const context = readContext(value.context);
  if (context === null) return null;
  const scope = context === undefined ? {} : { context };
  if (value.kind === "question" && isReadyQuestionId(value.id)) return { kind: "question", id: value.id, ...scope };
  if (value.kind === "action" && isReadyActionId(value.id)) return { kind: "action", id: value.id, ...scope };
  return null;
}
