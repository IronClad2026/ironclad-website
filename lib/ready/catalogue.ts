import type { ReadyKnowledgeTopic } from "./knowledge";

export const READY_MENU_VERSION = "2";
export const READY_CATALOGUE_VERSION = "1";
export const READY_MAIN_MESSAGE = "What can I help you with today, Commander?";

export const readyCategoryLabels = {
  match: "My match",
  results: "Results & replays",
  rules: "Rules & match help",
  tournaments: "Tournaments & registration",
  profile: "My profile & progress",
  support: "Contact an admin",
} as const;
export type ReadyCategoryId = keyof typeof readyCategoryLabels;

function prepared(category: ReadyCategoryId, topic: ReadyKnowledgeTopic, question: string) {
  return { category, topic, label: question, question };
}

export const readyQuestionCatalogue = {
  eligibility: prepared("tournaments", "eligibility", "Who can enter?"),
  registration: prepared("tournaments", "registration", "How do I register?"),
  division: prepared("tournaments", "division", "How is my division decided?"),
  waitlist: prepared("tournaments", "waitlist", "How does the waitlist work?"),
  events: prepared("tournaments", "events", "Where can I find an event?"),
  format: prepared("rules", "format", "What is the match format?"),
  final: prepared("rules", "final", "How many games are in the grand final?"),
  scheduling: prepared("rules", "scheduling", "When should I contact my opponent?"),
  results: prepared("results", "results", "How do results and confirmations work?"),
  replays: prepared("results", "replays", "Which replay files are required?"),
  disconnects: prepared("rules", "disconnects", "What happens if the game disconnects or lags?"),
  disputes: prepared("results", "disputes", "How do I dispute a result?"),
  "no-shows": prepared("rules", "no-shows", "What if my opponent is not responding?"),
  withdrawal: prepared("tournaments", "withdrawal", "Can I withdraw from an event?"),
  maps: prepared("rules", "maps", "How do we choose sides and maps?"),
  lobby: prepared("rules", "lobby", "Which lobby settings should we use?"),
  decisions: prepared("tournaments", "decisions", "How do published decisions work?"),
  prizes: prepared("tournaments", "prizes", "Where are the event prize terms?"),
  privacy: prepared("tournaments", "privacy", "Who can see replays and assistance requests?"),
  terms: prepared("tournaments", "terms", "What do the Terms of Service cover?"),
  agreement: prepared("tournaments", "agreement", "What is the Player Participation Agreement?"),
  "governing-versions": prepared("tournaments", "governing-versions", "Which document editions apply to my event?"),
  rules: prepared("tournaments", "rules", "Where are the official rules?"),
  discord: prepared("tournaments", "discord", "Do I need Discord to register?"),
  factions: prepared("rules", "factions", "Which faction can I play?"),
  dice: prepared("rules", "dice", "When do we roll dice?"),
  pauses: prepared("rules", "pauses", "How long can I pause?"),
  "submission-help": prepared("results", "submission-help", "Why can’t I submit?"),
} as const;
export type ReadyQuestionId = keyof typeof readyQuestionCatalogue;

const destination = {
  tournaments: "tournaments",
  match: "match",
  rules: "rules",
  profile: "profile",
  notifications: "notifications",
  rankings: "rankings",
  admin_assistance: "admin_assistance",
  discord: "discord",
  copy_reference: "copy_reference",
} as const;
export type ReadyDestinationType = keyof typeof destination;
function action(category: ReadyCategoryId, label: string, destinationType: ReadyDestinationType) {
  return { category, label, destinationType };
}

export const readyActionCatalogue = {
  "my-match": action("match", "Open my match", "match"),
  opponent: action("match", "My opponent", "match"),
  "opponent-chat": action("match", "Open opponent chat", "match"),
  deadline: action("match", "Deadline & match status", "match"),
  bracket: action("match", "View my bracket", "match"),
  "past-match": action("match", "Find a past match", "match"),
  "submit-result": action("results", "Submit my result", "match"),
  "upload-replays": action("results", "Upload replays", "match"),
  "find-tournament": action("tournaments", "Browse tournaments", "tournaments"),
  "open-registration": action("tournaments", "Open registration", "tournaments"),
  "registration-status": action("tournaments", "Check my registration status", "tournaments"),
  "event-rules": action("tournaments", "Open event rules", "rules"),
  "event-prizes": action("tournaments", "View published event prize terms", "tournaments"),
  "event-decisions": action("tournaments", "View published event decisions", "tournaments"),
  "rules-hub": action("rules", "Open the official rules hub", "rules"),
  "profile-steam": action("profile", "Profile & Steam", "profile"),
  notifications: action("profile", "Notifications", "notifications"),
  history: action("profile", "My history & statistics", "profile"),
  statistics: action("profile", "My statistics", "profile"),
  rankings: action("profile", "Rankings & points", "rankings"),
  dashboard: action("profile", "Open dashboard", "profile"),
  "admin-assistance": action("support", "In-site Admin Assistance", "admin_assistance"),
  "support-options": action("support", "Contact an admin", "admin_assistance"),
  "discord-ticket": action("support", "Open Discord ticket channel", "discord"),
  "discord-invite": action("support", "Join the IronClad Discord server", "discord"),
  "copy-match-reference": action("support", "Copy my match reference", "copy_reference"),
  "sign-in": action("profile", "Sign in", "profile"),
} as const;
export type ReadyActionId = keyof typeof readyActionCatalogue;

export function readyLink(actionId: ReadyActionId, label: string, href: string) {
  return { label, href, actionId, destinationType: readyActionCatalogue[actionId].destinationType };
}

export type ReadyMenuChoice =
  | { kind: "question"; id: ReadyQuestionId; label: string }
  | { kind: "action"; id: ReadyActionId; label: string }
  | { kind: "group"; id: string; label: string; message: string; choices: ReadyMenuChoice[] };

export function isReadyCategoryId(id: unknown): id is ReadyCategoryId {
  return typeof id === "string" && Object.hasOwn(readyCategoryLabels, id);
}
export function isReadyQuestionId(id: unknown): id is ReadyQuestionId {
  return typeof id === "string" && Object.hasOwn(readyQuestionCatalogue, id);
}
export function isReadyActionId(id: unknown): id is ReadyActionId {
  return typeof id === "string" && Object.hasOwn(readyActionCatalogue, id);
}
export function isReadyDestinationType(id: unknown): id is ReadyDestinationType {
  return typeof id === "string" && Object.hasOwn(destination, id);
}

function q(id: ReadyQuestionId, label = readyQuestionCatalogue[id].label): ReadyMenuChoice {
  return { kind: "question", id, label };
}
function a(id: ReadyActionId, label = readyActionCatalogue[id].label): ReadyMenuChoice {
  return { kind: "action", id, label };
}
function group(id: string, label: string, message: string, ...choices: ReadyMenuChoice[]): ReadyMenuChoice {
  return { kind: "group", id, label, message, choices };
}
function category(id: ReadyCategoryId, message: string, ...choices: ReadyMenuChoice[]) {
  return { id, label: readyCategoryLabels[id], message, choices };
}

export const readyCategories = [
  category("match", "Let’s check your mission, Commander. What do you need?",
    a("opponent"), a("opponent-chat"), a("deadline"), a("bracket"), a("my-match"), a("past-match")),
  category("results", "Let’s get your match recorded, Commander.",
    a("submit-result"), a("upload-replays"),
    group("result-review", "Confirm or dispute a result", "Choose what you’d like to check, Commander.",
      q("results"), q("disputes")),
    q("submission-help"), q("replays", "Replay requirements")),
  category("rules", "What happened on the battlefield, Commander?",
    q("disconnects", "Disconnects & lag"), q("no-shows", "Opponent not responding"),
    group("pause-deadline", "Pauses & deadlines", "Let’s check the timing rules, Commander.",
      q("pauses"), q("scheduling"), a("deadline")),
    group("map-format", "Maps & match format", "Which match rule do you need, Commander?",
      q("maps"), q("factions"), q("dice"), q("lobby"), q("format"), q("final"))),
  category("tournaments", "Let’s find your next campaign, Commander.",
    group("event-join", "Find or join a tournament", "Choose how you’d like to find an event, Commander.",
      a("find-tournament"), a("open-registration"), q("events"), q("discord")),
    group("registration-waitlist", "My registration & waitlist", "Let’s check your entry, Commander.",
      a("registration-status"), q("registration"), q("waitlist"), q("withdrawal")),
    group("eligibility-divisions", "Eligibility & divisions", "Which entry requirement do you need, Commander?",
      q("eligibility"), q("division")),
    group("event-governance", "Event rules, prizes & decisions", "Which event information do you need, Commander?",
      a("event-rules"), a("event-prizes"), a("event-decisions"),
      group("published-terms", "Prepared prize & decision answers", "Choose a prepared question, Commander.",
        q("prizes"), q("decisions")),
      group("governing-documents", "Official documents & editions", "Choose a governing document or edition, Commander.",
        q("rules"), q("governing-versions"), q("terms"), q("agreement"), q("privacy")))),
  category("profile", "What would you like to check, Commander?",
    a("profile-steam"), a("notifications"), a("history"), a("rankings")),
  category("support", "Need backup, Commander? Choose how to reach the team.",
    a("admin-assistance"), a("discord-ticket"), a("copy-match-reference")),
];
