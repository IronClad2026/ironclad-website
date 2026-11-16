import { isReadyKnowledgeTopic, readyModelCard } from "./knowledge";
import type { ReadyKnowledgeTopic } from "./knowledge";
import type { ReadyRuleScope } from "./platform";
import type { ReadyGrounding } from "./provider";

const hints = {
  disconnects: ["disconnect", "drops", "dropped", "lost", "connection", "pc", "crash", "crashes", "crashed", "pause", "pauses", "restart"],
  division: ["division", "divisions", "elo", "bracket", "academy", "challenge", "main", "pro", "threshold"],
  format: ["format", "round", "quarterfinal", "semifinal", "series", "matches", "games", "best"],
  final: ["final", "finals", "grand"],
  scheduling: ["schedule", "scheduling", "deadline", "contact", "time", "reply", "respond", "hours", "delayed"],
  replays: ["replay", "replays", "upload", "proof", "recording", "screenshot", "rec"],
  maps: ["map", "maps", "pool", "dice", "roll", "side", "sides", "veto"],
  lobby: ["lobby", "hosting", "victory", "settings", "resources", "cheats"],
  disputes: ["dispute", "appeal", "wrong", "review", "evidence"],
  "no-shows": ["show", "walkover", "forfeit", "absent"],
  results: ["report", "result", "results", "score", "confirm", "submit"],
  eligibility: ["eligible", "eligibility", "age", "steam", "relic", "verify"],
  registration: ["register", "registration", "signup", "enroll"],
  withdrawal: ["withdraw", "leave", "surrender", "dropout"],
} as const satisfies Partial<Record<ReadyKnowledgeTopic, readonly string[]>>;

const modifiers = ["early", "late", "before", "after", "minutes", "minute", "long", "more", "often",
  "limit", "exception", "cannot", "same", "difference", "refund", "mod", "mods",
  "spectator", "camera", "webcam", "resolution", "casters", "compensation", "certification", "vpn", "controller"];
const publicVocabulary = new Set<string>([...Object.values(hints).flat(), ...modifiers]);

export function buildReadyGrounding(
  question: string,
  scope: ReadyRuleScope,
  preferred: ReadyKnowledgeTopic | null,
  previousTopic?: string,
): ReadyGrounding | null {
  if (scope.kind === "unconfirmed" ||
    /\b(?:credentials?|passwords?|secrets?|tokens?|emails?|somebody else|someone else|another player|private data|transcripts?)\b/i.test(question)) return null;
  const words = question.normalize("NFKC").toLowerCase().match(/[a-z]+/g) ?? [];
  const signals = words.filter((word) => publicVocabulary.has(word)).slice(0, 18);
  const followUp = /^(?:and|what about|how about|can you explain|tell me more)\b/i.test(question);
  const previous = followUp && isReadyKnowledgeTopic(previousTopic) && Object.hasOwn(hints, previousTopic) ? previousTopic : undefined;
  const ranked = (Object.entries(hints) as [ReadyKnowledgeTopic, readonly string[]][])
    .map(([topic, terms]) => ({ topic, score: new Set(signals.filter((word) => terms.includes(word))).size }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  const ironcladCue = /\b(?:ironclad|tournaments?|event|match(?:es)?|rulebook|rules|elo|replays?|steam|relic|coh3)\b/i.test(question)
    || (/\b(?:game|pc)\b/i.test(question) && ranked.some(({ topic, score }) => topic === "disconnects" && score >= 2));
  if (!preferred && !previous && !ironcladCue) return null;
  if ((!signals.length || (!preferred && !ranked.length)) && !previous) return null;
  if (preferred && !Object.hasOwn(hints, preferred)) return null;
  const topics = preferred ? [preferred] : [...new Set([...(previous ? [previous] : []), ...ranked.map(({ topic }) => topic)])].slice(0, 3);
  const cards = topics.flatMap((topic) => {
    const card = readyModelCard(topic, scope);
    return card ? [card] : [];
  });
  return cards.length ? { signals: signals.join(" ") || "more detail", cards, previousTopic: previous } : null;
}
