import {
  isReadyActionId, isReadyCategoryId, isReadyQuestionId,
  type ReadyActionId, type ReadyCategoryId, type ReadyQuestionId,
} from "./catalogue";

type Category = { categoryId?: ReadyCategoryId };
type Question = { questionId: ReadyQuestionId };
type Answer = Question & { answerInstanceId: string };

export type ReadyUsageInput =
  | { type: "manual_open" | "engage" }
  | { type: "category_select"; categoryId: ReadyCategoryId }
  | ({ type: "question_select" } & Question & Category)
  | ({ type: "answer_display" } & Answer & Category)
  | ({ type: "action_click"; actionId: ReadyActionId; questionId?: ReadyQuestionId } & Category)
  | ({ type: "topic_missing" } & Category)
  | { type: "fallback"; outcome: "no_result" | "unavailable" | "unsupported" }
  | ({ type: "helpfulness"; helpful: boolean } & Answer)
  | { type: "technical_error"; outcome: "request_failed" | "invalid_reply" | "timeout" };

export type ReadyUsageRequest =
  | { kind: "choice"; enabled: boolean }
  | { kind: "event"; epoch: string; browserId: string; eventId: string; event: ReadyUsageInput };

export type ReadyUsageChoice = { enabled: boolean; epoch: string | null };

export function isReadyUsageUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, ...names: string[]) {
  return Object.keys(value).every((key) => names.includes(key));
}

function readEvent(value: unknown): ReadyUsageInput | null {
  if (!object(value)) return null;
  const { type, categoryId, questionId, answerInstanceId, actionId, outcome, helpful } = value;
  const category = categoryId === undefined || isReadyCategoryId(categoryId);
  const question = isReadyQuestionId(questionId);
  switch (type) {
    case "manual_open":
    case "engage": return hasOnly(value, "type") ? { type } : null;
    case "category_select": return hasOnly(value, "type", "categoryId") && isReadyCategoryId(categoryId)
      ? { type, categoryId } : null;
    case "question_select": return hasOnly(value, "type", "categoryId", "questionId") && category && question
      ? { type, categoryId, questionId } : null;
    case "answer_display": return hasOnly(value, "type", "categoryId", "questionId", "answerInstanceId") &&
      category && question && isReadyUsageUuid(answerInstanceId) ? { type, categoryId, questionId, answerInstanceId } : null;
    case "action_click": return hasOnly(value, "type", "categoryId", "questionId", "actionId") &&
      category && (question || questionId === undefined) && isReadyActionId(actionId)
      ? { type, categoryId, questionId, actionId } : null;
    case "topic_missing": return hasOnly(value, "type", "categoryId") && category
      ? categoryId === undefined ? { type } : { type, categoryId }
      : null;
    case "fallback": return hasOnly(value, "type", "outcome") &&
      (outcome === "no_result" || outcome === "unavailable" || outcome === "unsupported") ? { type, outcome } : null;
    case "technical_error": return hasOnly(value, "type", "outcome") &&
      (outcome === "request_failed" || outcome === "invalid_reply" || outcome === "timeout") ? { type, outcome } : null;
    case "helpfulness": return hasOnly(value, "type", "questionId", "answerInstanceId", "helpful") &&
      question && isReadyUsageUuid(answerInstanceId) && typeof helpful === "boolean"
      ? { type, questionId, answerInstanceId, helpful } : null;
    default: return null;
  }
}

export function readReadyUsageRequest(value: unknown): ReadyUsageRequest | null {
  if (!object(value)) return null;
  if (value.kind === "choice" && hasOnly(value, "kind", "enabled") && typeof value.enabled === "boolean") {
    return { kind: "choice", enabled: value.enabled };
  }
  if (value.kind !== "event" || !hasOnly(value, "kind", "epoch", "browserId", "eventId", "event") ||
    !isReadyUsageUuid(value.epoch) || !isReadyUsageUuid(value.browserId) || !isReadyUsageUuid(value.eventId)) return null;
  const event = readEvent(value.event);
  return event ? { kind: "event", epoch: value.epoch, browserId: value.browserId, eventId: value.eventId, event } : null;
}
