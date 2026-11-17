import "server-only";

import { readyLink, readyQuestionCatalogue } from "./catalogue";
import type { ReadyMenuRequest, ReadyReply } from "./contracts";
import { answerKnowledgeTopic } from "./knowledge";
import { answerPlatformAction, resolveReadyRuleScope } from "./platform";
import { loadReadyEvents } from "./platform-data";
import type { ReadyIdentity } from "./usage";

async function publicEventContext(eventSlug: string) {
  try {
    // Carry a verified public event into a follow-up action without accepting a guest match reference.
    const [event] = await loadReadyEvents(eventSlug);
    return event ? { eventSlug: event.slug } : undefined;
  } catch {
    // The prepared guidance still applies when the public event lookup is unavailable.
    return undefined;
  }
}

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
  const eventSlug = input.context?.eventSlug;
  const publicFollowUp = topic === "prizes" || topic === "decisions";
  const context = identity ? input.context : eventSlug && publicFollowUp ? await publicEventContext(eventSlug) : undefined;
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
  const reply = answerKnowledgeTopic(topic, scope, context);
  if (!identity && topic === "governing-versions") {
    return {
      ...reply,
      details: "Sign in to check the document editions recorded for your own registration.",
      actions: [readyLink("sign-in", "Sign in", "/sign-in")],
      intent,
    };
  }
  return { ...reply, intent };
}
