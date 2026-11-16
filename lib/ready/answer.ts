import "server-only";

import type { ReadyReply, ReadyRequest } from "./contracts";
import { answerKnowledgeTopic, getKnowledgeTopic, isReadyKnowledgeTopic, readyKnowledgeTopics, READY_KNOWLEDGE_REVISION } from "./knowledge";
import { answerPlatform, resolveReadyRuleScope } from "./platform";
import { classifyReadyPublicTopic } from "./provider";
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

export async function resolveReadyAnswer(input: ReadyRequest, identity: ReadyIdentity, signal: AbortSignal): Promise<ReadyReply> {
  if (isReadyBoundaryAttempt(input.question)) {
    return {
      text: "I can help with public rules and matches you’re authorised to access, Commander.",
      actions: fallbackActions,
    };
  }

  const platform = await answerPlatform(input, identity.userId);
  signal.throwIfAborted();
  if (platform) return platform;

  let topic = getKnowledgeTopic(input.question, input.context?.topic);
  if (!topic && !input.context?.eventSlug && !input.context?.matchId) {
    const classified = await classifyReadyPublicTopic(input.question, readyKnowledgeTopics, identity, signal);
    signal.throwIfAborted();
    if (isReadyKnowledgeTopic(classified)) topic = classified;
  }
  if (!topic) {
    const related = /\b(?:ironclad|tournament|event|match|register|registration|rules?|bracket|opponent|replays?|admin|payout|prize|steam|discord)\b/i.test(input.question);
    return {
      text: related
        ? "I can’t confirm that from the available information, Commander. Let’s get an admin involved."
        : "That’s outside my orders, Commander. I can help with IronClad rules, tournaments, your matches and platform support.",
      actions: fallbackActions,
    };
  }

  const scope = await resolveReadyRuleScope(input.context, identity.userId, input.question);
  signal.throwIfAborted();
  if (scope.kind === "unconfirmed" && scope.events?.length) {
    return {
      text: "Which event should I use to check the governing documents, Commander?",
      actions: scope.events.map(({ title, slug }) => ({
        label: title,
        question: input.question,
        context: { topic, eventSlug: slug },
      })),
    };
  }
  if (scope.kind !== "general" || input.context?.eventSlug || input.context?.matchId) {
    return answerKnowledgeTopic(topic, scope, input.context);
  }

  const key = `${READY_KNOWLEDGE_REVISION}:${topic}`;
  const now = Date.now();
  const cached = publicCache.get(key);
  if (cached && cached.expires > now) return cached.reply;
  const reply = answerKnowledgeTopic(topic, scope);
  publicCache.set(key, { expires: now + 900_000, reply });
  return reply;
}
