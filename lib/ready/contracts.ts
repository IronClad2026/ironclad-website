export const READY_QUESTION_LIMIT = 300;
export const READY_BODY_LIMIT = 2_400;

export type ReadyContext = {
  topic?: string;
  eventSlug?: string;
  matchId?: string;
};

export type ReadyRequest = { question: string; context?: ReadyContext };

export type ReadySource = { title: string; url: string; section: string };

export type ReadyAction =
  | { label: string; href: string }
  | { label: string; question: string; context?: ReadyContext }
  | { label: string; copyText: string };

export type ReadyReply = {
  text: string;
  details?: string;
  sources?: ReadySource[];
  actions?: ReadyAction[];
  context?: ReadyContext;
};

const token = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readReadyRequest(value: unknown): ReadyRequest | null {
  if (!record(value) || typeof value.question !== "string") return null;
  if (Object.keys(value).some((key) => key !== "question" && key !== "context")) return null;
  const question = value.question.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!question || [...question].length > READY_QUESTION_LIMIT || /[\p{Cc}\p{Cf}]/u.test(question)) return null;
  if (value.context === undefined) return { question };
  if (!record(value.context)) return null;
  if (Object.keys(value.context).some((key) => !["topic", "eventSlug", "matchId"].includes(key))) return null;
  const { topic, eventSlug, matchId } = value.context;
  if (topic !== undefined && (typeof topic !== "string" || !token.test(topic))) return null;
  if (eventSlug !== undefined && (typeof eventSlug !== "string" || !token.test(eventSlug))) return null;
  if (matchId !== undefined && (typeof matchId !== "string" || !uuid.test(matchId))) return null;
  return { question, context: { topic, eventSlug, matchId } };
}
