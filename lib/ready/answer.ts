import "server-only";

import { readyQuestionCatalogue } from "./catalogue";
import type { ReadyMenuRequest, ReadyReply } from "./contracts";
import { answerKnowledgeTopic } from "./knowledge";
import { answerPlatformAction, resolveReadyRuleScope } from "./platform";
import type { ReadyIdentity } from "./usage";

export async function resolveReadyAnswer(input: ReadyMenuRequest, identity: ReadyIdentity | null, signal: AbortSignal): Promise<ReadyReply> {
  const userId = identity?.userId ?? null;
  if (input.kind === "action") {
    // Guests may choose a public event, but cannot pass a personal match through the conversation.
    const eventSlug = input.context?.eventSlug;
    const context = identity ? input.context : eventSlug ? { eventSlug } : undefined;
    const reply = await answerPlatformAction(input.id, context, userId);
    signal.throwIfAborted();
    return { ...reply, intent: { kind: input.kind, id: input.id } };
  }

  const topic = readyQuestionCatalogue[input.id].topic;
  const context = identity ? input.context : undefined;
  const scope = identity && topic !== "rules"
    ? await resolveReadyRuleScope(context, identity.userId, input.id === "governing-versions")
    : { kind: "general" } as const;
  signal.throwIfAborted();
  const intent = { kind: input.kind, id: input.id } as const;
  if (scope.kind === "unconfirmed" && scope.events?.length) {
    return {
      text: "Which event should I use to check the governing documents, Commander?",
      actions: scope.events.map(({ title, slug }) => ({
        label: title, intent, context: { topic, eventSlug: slug },
      })),
      intent,
    };
  }
  return { ...answerKnowledgeTopic(topic, scope, context), intent };
}
