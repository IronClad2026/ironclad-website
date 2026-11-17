import "server-only";

import { isReadyQuestionId, readyLink, readyQuestionCatalogue } from "./catalogue";
import type { ReadyQuestionId } from "./catalogue";
import type { ReadyAction, ReadyContext, ReadyMenuRequest, ReadyReply } from "./contracts";
import { answerKnowledgeTopic, getKnowledgeTopic } from "./knowledge";
import { answerPlatform, answerPlatformAction, resolveReadyRuleScope } from "./platform";
import type { ReadyIdentity } from "./usage";

export function isReadyBoundaryAttempt(question: string): boolean {
  const text = question.normalize("NFKC");
  return /\b(?:ignore|bypass)\b.{0,35}\b(?:instructions?|rules?|permissions?|safety|filters?)\b|\b(?:system prompt|service[ -]role|api keys?|passwords?|access tokens?|private transcripts?|admin notes?)\b/i.test(text);
}

function supportActions(context?: ReadyContext): ReadyAction[] {
  return [
    readyLink("rules-hub", "Open rules hub", "/rules"),
    { label: "Contact an admin", intent: { kind: "action", id: "support-options" }, context },
  ];
}

function questionChoice(id: ReadyQuestionId, context?: ReadyContext, label = readyQuestionCatalogue[id].question): ReadyAction {
  return { label, intent: { kind: "question", id }, context };
}

async function preparedAnswer(
  id: ReadyQuestionId,
  context: ReadyContext | undefined,
  identity: ReadyIdentity | null,
  signal: AbortSignal,
  legacyQuestion = "",
): Promise<ReadyReply> {
  const topic = readyQuestionCatalogue[id].topic;
  const scope = !identity || topic === "rules" ? { kind: "general" } as const
    : await resolveReadyRuleScope(context, identity.userId, legacyQuestion, id === "governing-versions");
  signal.throwIfAborted();
  const intent = { kind: "question", id } as const;
  if (scope.kind === "unconfirmed" && scope.events?.length) {
    return {
      text: "Which event should I use to check the governing documents, Commander?",
      actions: scope.events.map(({ title, slug }) => questionChoice(id, { topic, eventSlug: slug }, title)),
      intent,
    };
  }
  return { ...answerKnowledgeTopic(topic, scope, context), intent };
}

const searchWords = new Set([
  "a", "about", "an", "and", "are", "be", "can", "come", "do", "does", "for", "how", "i", "in", "is", "it",
  "me", "my", "of", "on", "please", "some", "tell", "the", "this", "to", "we", "what", "when", "where", "which", "who", "with", "you",
]);

function searchTokens(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[’']/g, "").match(/[a-z0-9]+/g) ?? [];
}

const searchableQuestions = (Object.keys(readyQuestionCatalogue) as ReadyQuestionId[]).map((id) => {
  const { question, keywords } = readyQuestionCatalogue[id];
  const exact = searchTokens(question).join(" ");
  const keyWords = new Set(searchTokens(keywords));
  return { id, exact, keyWords, tokens: new Set([...searchTokens(question), ...keyWords]) };
});

function searchCatalogue(query: string): ReadyQuestionId[] {
  const words = searchTokens(query);
  const exact = searchableQuestions.find((entry) => entry.exact === words.join(" "));
  if (exact) return [exact.id];

  const significant = [...new Set(words.filter((word) => !searchWords.has(word)))];
  if (!significant.length) return [];
  const matches = searchableQuestions.map(({ id, tokens, keyWords }) => ({
    id,
    coverage: significant.filter((word) => tokens.has(word)).length / significant.length,
    score: significant.reduce((score, word) => score + (keyWords.has(word) ? 2 : tokens.has(word) ? 1 : 0), 0),
  })).filter(({ coverage, score }) => coverage >= (significant.length <= 2 ? 0.5 : 0.75) && score >= 2)
    .sort((a, b) => b.score - a.score);

  if (!matches.length) return [];
  const bestScore = matches[0].score;
  return matches.filter(({ score }) => score >= bestScore - 1).slice(0, 4).map(({ id }) => id);
}

export async function resolveReadyAnswer(input: ReadyMenuRequest, identity: ReadyIdentity | null, signal: AbortSignal): Promise<ReadyReply> {
  const context = identity ? input.context : undefined;
  const userId = identity?.userId ?? null;
  // Public navigation can look up a published event. Only authenticated flows may
  // carry personal match or registration context through Ready's conversation.
  const eventSlug = input.context?.eventSlug;
  const platformContext = context ?? (eventSlug ? { eventSlug } : undefined);
  if ("kind" in input) {
    if (input.kind === "action") {
      const reply = await answerPlatformAction(input.id, platformContext, userId);
      signal.throwIfAborted();
      return { ...reply, intent: { kind: input.kind, id: input.id } };
    }
    if (input.kind === "question") return preparedAnswer(input.id, context, identity, signal);

    const privateRequest = /\b(?:another|someone else|other)\b.{0,35}\b(?:player|account|user)\b/i.test(input.query) &&
      /\b(?:match|chat|transcript|personal|private|account|identity|deadline|replays?)\b/i.test(input.query);
    const matches = isReadyBoundaryAttempt(input.query) || privateRequest ? [] : searchCatalogue(input.query);
    if (matches.length === 1) {
      return { ...(await preparedAnswer(matches[0], context, identity, signal)), searchOutcome: "matched" };
    }
    if (matches.length > 1) {
      return {
        text: "Which prepared question did you mean, Commander?",
        actions: matches.map((id) => questionChoice(id, context)),
        searchOutcome: "ambiguous",
      };
    }
    return {
      text: "I couldn’t find a prepared answer for that, Commander. Choose a category from the Main menu or contact an admin.",
      actions: supportActions(context),
      searchOutcome: "no_result",
      fallback: true,
    };
  }

  if (isReadyBoundaryAttempt(input.question)) return {
    text: "I can help with public rules and matches you’re authorised to access, Commander.",
    actions: supportActions(),
    fallback: true,
  };
  const platform = await answerPlatform({ ...input, context: platformContext }, userId);
  signal.throwIfAborted();
  if (platform) return platform;

  const topic = getKnowledgeTopic(input.question, context?.topic);
  if (isReadyQuestionId(topic)) return preparedAnswer(topic, context, identity, signal, input.question);

  const related = /\b(?:ironclad|tournament|event|match|register|registration|rules?|bracket|opponent|replays?|admin|payout|prize|steam|discord)\b/i.test(input.question);
  return {
    text: related
      ? "I can’t confirm that from the available information, Commander. Let’s get an admin involved."
      : "That’s outside my orders, Commander. I can help with IronClad rules, tournaments, your matches and platform support.",
    actions: supportActions(context),
    fallback: true,
  };
}
