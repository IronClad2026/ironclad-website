import "server-only";

import type { ReadyReply, ReadyRequest } from "./contracts";
import { answerKnowledgeTopic, getKnowledgeTopic, isReadyKnowledgeTopic, READY_KNOWLEDGE_REVISION } from "./knowledge";
import { answerPlatform, resolveReadyRuleScope } from "./platform";
import { buildReadyGrounding } from "./grounding";
import { answerWithReadyModel, configuredReadyModel, readyAiEvidence } from "./provider";
import type { ReadyAiEvidence } from "./provider";
import type { ReadyIdentity } from "./usage";

const fallbackActions = [
  { label: "Open rules hub", href: "/rules" },
  { label: "Get admin help", question: "I need an admin" },
];
const publicCache = new Map<string, { expires: number; reply: ReadyReply }>();

export function isReadyBoundaryAttempt(question: string): boolean {
  const text = question.normalize("NFKC");
  return /\b(?:ignore|bypass)\b.{0,35}\b(?:instructions?|rules?|permissions?|safety|filters?)\b|\b(?:system prompt|service[ -]role|api keys?|passwords?|access tokens?|private transcripts?|admin notes?)\b/i.test(text);
}

export type ReadyResolvedReply = ReadyReply & { ai?: ReadyAiEvidence };

export async function resolveReadyAnswer(
  input: ReadyRequest,
  identity: ReadyIdentity,
  signal: AbortSignal,
  evaluationModel?: string | null,
): Promise<ReadyResolvedReply> {
  if (isReadyBoundaryAttempt(input.question)) {
    return {
      text: "I can help with public rules and matches you’re authorised to access, Commander.",
      actions: fallbackActions,
    };
  }

  const platform = await answerPlatform(input, identity.userId);
  signal.throwIfAborted();
  if (platform) return platform;

  const topic = getKnowledgeTopic(input.question, input.context?.topic);
  const model = configuredReadyModel(evaluationModel);
  const mightUseModel = model && buildReadyGrounding(input.question, { kind: "general" }, topic, input.context?.topic);
  const unsupported = (ai?: ReadyAiEvidence): ReadyResolvedReply => {
    const related = /\b(?:ironclad|tournament|event|match|register|registration|rules?|bracket|opponent|replays?|admin|payout|prize|steam|discord)\b/i.test(input.question);
    return {
      text: related || mightUseModel
        ? "I can’t confirm that from the available information, Commander. Let’s get an admin involved."
        : "That’s outside my orders, Commander. I can help with IronClad rules, tournaments, your matches and platform support.",
      actions: fallbackActions,
      ai,
    };
  };
  if (!topic && !mightUseModel) return unsupported();

  const scope = await resolveReadyRuleScope(input.context, identity.userId, input.question);
  signal.throwIfAborted();
  if (scope.kind === "unconfirmed" && scope.events?.length) {
    return {
      text: "Which event should I use to check the governing documents, Commander?",
      actions: scope.events.map(({ title, slug }) => ({
        label: title,
        question: input.question,
        context: { topic: topic ?? undefined, eventSlug: slug },
      })),
    };
  }
  const grounding = mightUseModel && buildReadyGrounding(input.question, scope, topic, input.context?.topic);
  let ai: ReadyAiEvidence | undefined;
  if (grounding) {
    const result = await answerWithReadyModel(grounding, identity, model, signal);
    signal.throwIfAborted();
    ai = readyAiEvidence(result);
    if (result.status === "used" && isReadyKnowledgeTopic(result.card)) {
      const reply = answerKnowledgeTopic(result.card, scope, input.context);
      const detail = result.detail ? grounding.cards.find(({ id }) => id === result.card)?.detail : undefined;
      return detail ? {
        ...reply,
        text: `${reply.text} ${detail}`,
        details: reply.details?.replace(detail, "").trim() || undefined,
        ai,
      } : { ...reply, ai };
    }
  }
  if (!topic) return unsupported(ai);
  if (scope.kind !== "general" || input.context?.eventSlug || input.context?.matchId) {
    return { ...answerKnowledgeTopic(topic, scope, input.context), ai };
  }

  const key = `${READY_KNOWLEDGE_REVISION}:${topic}`;
  const now = Date.now();
  const cached = publicCache.get(key);
  if (cached && cached.expires > now) return { ...cached.reply, ai };
  const reply = answerKnowledgeTopic(topic, scope);
  publicCache.set(key, { expires: now + 900_000, reply });
  return { ...reply, ai };
}
