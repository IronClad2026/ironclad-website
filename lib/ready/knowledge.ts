import type { RegistrationDocumentKind } from "@/lib/legal-document-types";
import type { ReadyAction, ReadyContext, ReadyReply, ReadySource } from "./contracts";
import type { ReadyRuleScope } from "./platform";
import type { ReadyModelCard } from "./provider";
import { readyLink } from "./catalogue";
import {
  publishedReadyVersions,
  readyDocument,
  readyRulesHubSource,
  type ReadyDocumentVersions,
} from "./knowledge-sources";

export { READY_KNOWLEDGE_REVISION } from "./knowledge-sources";

type Passage = {
  kind: RegistrationDocumentKind;
  section: string;
  page?: number | Readonly<Record<string, number>>;
  text: string;
  earlierText?: string;
  details?: string;
  tournamentLink?: boolean;
};

// These short, reviewed paraphrases retrieve only the passages relevant to the question.
// The three tournament editions retain the sections but sometimes paginate them differently.
const tournamentEditionPages = (legacy: number, current: number) => ({ "3.0": legacy, "3.1": legacy, "3.2": current });

const passages = {
  eligibility: {
    kind: "ppa", section: "§§ 3.1, 3.5 and 4.1–4.2", page: 4,
    text: "You need to be 18 or older, have lawful access to Company of Heroes 3 and use your own IronClad and Steam accounts. Link your Steam account so IronClad can verify your current 1v1 data with Relic.",
    tournamentLink: true,
  },
  registration: {
    kind: "rulebook", section: "§§ 5.1–5.4, 4.3–4.5 and 21.6", page: tournamentEditionPages(5, 6),
    text: "Sign in, complete your profile, link your own Steam account and open an eligible event in Tournaments. Registration is free. IronClad checks your current 1v1 data with Relic and records your acceptance of the exact documents shown.",
    details: "Registration requires the age and account-ownership declarations. Registration puts you into review or the waitlist depending on capacity and eligibility.",
    tournamentLink: true,
  },
  division: {
    kind: "rulebook", section: "§§ 4.4–4.6", page: 5,
    text: "Four-division events use your highest verified current 1v1 faction ELO. Academy is 0–1099, Challenge 1100–1399, Main 1400–1699 and Pro 1700 or above. Your registration snapshot fixes your division for that event.",
    earlierText: "Under this Rulebook, the highest verified current 1v1 faction ELO places you in Academy (0–1099), Challenge (1100–1399) or combined Main / Pro (1400 or above). Your registration snapshot fixes your division for the event.",
    tournamentLink: true,
  },
  waitlist: {
    kind: "rulebook", section: "§§ 5.3–5.6", page: tournamentEditionPages(5, 6),
    text: "The first eight valid sign-ups are reviewed. Eligible players who sign up later can join a first-come waitlist. If you receive an offer, accept it by the deadline shown to return to the review queue.",
    tournamentLink: true,
  },
  events: {
    kind: "rulebook", section: "§ 6.1", page: 6,
    text: "Open Tournaments and select the event. Its page shows the published format, registration status, divisions, deadlines, map pools and any applicable prize terms. Use that page for details specific to the event.",
    tournamentLink: true,
  },
  format: {
    kind: "rulebook", section: "§§ 3.1–3.3", page: 4,
    text: "The launch format is 1v1, with an eight-player single-elimination bracket per open division. Quarterfinals and semifinals are best-of-three. The grand final is best-of-five.",
    tournamentLink: true,
  },
  final: {
    kind: "rulebook", section: "§ 3.3", page: 4,
    text: "Under the launch rules, the grand final is best-of-five. Quarterfinals and semifinals are best-of-three.",
    details: "Check your tournament’s published format for the series it uses.",
  },
  scheduling: {
    kind: "rulebook", section: "§§ 9.1–9.9", page: 8,
    text: "Use the deadline displayed on your Match page. Make first contact as soon as practical, usually within 24 hours of activation. Seek Admin Assistance if there’s no reply after 48 hours, or sooner if you could miss the deadline.",
    details: "Those timings guide coordination. A missed contact target alone does not decide the match. Keep relevant scheduling evidence and agree a time that accounts for both time zones.",
  },
  results: {
    kind: "rulebook", section: "§§ 11.1–11.3, 11.7–11.11", page: 9,
    text: "Open your IronClad match and submit the series winner, final score and one unique CoH3 replay per game played. Your opponent can confirm or dispute the report before the displayed deadline.",
    details: "A confirmed, automatically approved or admin-approved result becomes official. Keep your local replay copies until the applicable review windows have passed.",
  },
  replays: {
    kind: "rulebook", section: "§§ 11.2–11.6", page: 9,
    text: "Attach the replays to your IronClad match result submission. Upload one unique CoH3 .rec file for each game actually played, with a limit of 10 MiB per file. A screenshot cannot replace a required replay.",
    details: "Replay proof is private. Access is limited to authorised match participants and admins, subject to the Privacy Policy and law.",
  },
  disconnects: {
    kind: "rulebook", section: "§§ 10.4–10.7 and 10.1–10.2", page: 9,
    text: "A genuine disconnect before 10:00 normally leads to a restart, subject to fairness exceptions. At or after 10:00, preserve the replay and ask an admin to rule. The clock alone does not award a win.",
    details: "For a genuine issue, each player normally has one pause per game of up to five minutes. An opponent agreement or admin approval is needed for extra or longer pauses.",
  },
  disputes: {
    kind: "rulebook", section: "§§ 12.1–12.3 and 11.7–11.10", page: tournamentEditionPages(9, 10),
    text: "Use the dispute option on the match before the displayed deadline. Give a truthful reason and keep the relevant replays and communications. An admin reviews the evidence and decides the outcome.",
  },
  "no-shows": {
    kind: "rulebook", section: "§§ 9.4–9.6 and 12.4–12.7", page: 8,
    text: "If your opponent hasn’t replied after 48 hours, or sooner if the deadline is at risk, request Admin Assistance.",
    details: "For an actual no-show, use the match’s no-show reporting process when available. Confirmation or admin review determines the result.",
  },
  withdrawal: {
    kind: "rulebook", section: "§§ 5.8 and 9.8", page: 6,
    text: "You can withdraw through the platform before launch. After launch, use Admin Assistance for help. The bracket, deadline and no-show rules apply, and an admin can confirm the next step.",
  },
  maps: {
    kind: "rulebook", section: "§§ 6.2–6.4 and 7.3–7.10", page: 7,
    text: "Use an eligible map from your division’s published pool. In games 1, 3 and 5, each player initiates their IronClad dice roll. The winner picks either side or map, and the opponent picks the other. Game 5 applies only if reached.",
    details: "In games 2 and 4, swap sides and let the previous game’s loser choose an unused eligible map. Confirm selections with your opponent. IronClad stores the rolls, and players coordinate the choices.",
    tournamentLink: true,
  },
  lobby: {
    kind: "rulebook", section: "§§ 8.1–8.3", page: 8,
    text: "Unless your event publishes an approved instruction otherwise, use a 1v1 lobby with 575 victory points, standard resources, random starting positions, cheats disabled and the agreed map and sides. Both players should verify the settings.",
    tournamentLink: true,
  },
  decisions: {
    kind: "rulebook", section: "§§ 6.10–6.11 and 6.14–6.17", page: 7,
    text: "Find approved Published Decisions on the event page. An advisory poll informs an admin’s decision. A binding poll determines its configured outcome when voting is valid. Its scope and the governing documents still apply.",
    tournamentLink: true,
  },
  prizes: {
    kind: "ppa", section: "§§ 13.1–13.7", page: tournamentEditionPages(7, 8),
    text: "Some events have no prize. For a prize-bearing event, use its published Prize Terms for the amount, eligibility, fees, payout method and estimated timing. A payment depends on official placement, eligibility and the required information.",
    tournamentLink: true,
  },
  privacy: {
    kind: "privacy", section: "§§ 11 and 13", page: { "1.0": 8, "1.1": 9, "1.2": 9 },
    text: "Match replay proof and Admin Assistance content are private operational information, with access restricted according to their purpose. See the Privacy Policy for how evidence and support information are used and retained.",
  },
  terms: {
    kind: "terms", section: "§§ 2 and 4", page: 4,
    text: "The Terms cover use of the IronClad platform. The Participation Agreement governs player participation, the Rulebook covers competition mechanics, and the Privacy Policy covers personal information.",
  },
  agreement: {
    kind: "ppa", section: "§§ 1–2", page: 3,
    text: "The Player Participation Agreement sets the conditions for taking part in IronClad events. Read it with the Rulebook for competition mechanics and with any published terms scoped to your event.",
  },
  "governing-versions": {
    kind: "rulebook", section: "§§ 21.3–21.8", page: tournamentEditionPages(13, 14),
    text: "An existing registration keeps its own recorded document versions. A newer document generally applies to new registrations. Check the version recorded for your event, and ask an admin if a published decision affects it.",
  },
  factions: {
    kind: "rulebook", section: "§§ 7.1 and 7.7", page: 7,
    text: "You may play any permitted faction within your assigned side. Agree who has which side and which map you’ll use with your opponent before loading the game.",
  },
  dice: {
    kind: "rulebook", section: "§§ 7.3–7.10", page: 7,
    text: "Each player starts their own IronClad 2d6 roll for games 1, 3 and 5, if reached. If the totals tie, both players roll again. The higher total chooses side or an eligible unused map, and the opponent chooses the other.",
    details: "Rolls for games 3 and 5 can be done in advance. IronClad records the rolls. Players agree the actual map and side in the Match Room.",
  },
  pauses: {
    kind: "rulebook", section: "§§ 10.1–10.2 and 9.1", page: tournamentEditionPages(8, 9),
    text: "For a genuine issue, each player normally has one pause per game of up to five minutes. An opponent agreement or admin approval is needed for extra or longer pauses.",
    details: "A game pause and a held match deadline are separate. Check your Match workspace for the current deadline or hold.",
  },
  "submission-help": {
    kind: "rulebook", section: "§§ 11.1–11.6", page: 9,
    text: "Use the result form in the workspace for your own active match. Check that the opponent is assigned and that you have the series score and one unique replay for each game actually played.",
    details: "If you can’t find the form or it shows a restriction, check the status and deadline in the Match workspace. Ask an admin if you need help with the restriction.",
  },
} satisfies Record<string, Passage>;

type PassageTopic = keyof typeof passages;
export type ReadyKnowledgeTopic = PassageTopic | "rules" | "discord";

export const readyKnowledgeTopics = [
  "rules", "discord", ...Object.keys(passages) as PassageTopic[],
] as readonly ReadyKnowledgeTopic[];

export function isReadyKnowledgeTopic(value: unknown): value is ReadyKnowledgeTopic {
  return typeof value === "string" && readyKnowledgeTopics.some((topic) => topic === value);
}

/** The provider receives only vetted passage text. Event names and URLs remain local. */
export function readyModelCard(topic: ReadyKnowledgeTopic, scope: ReadyRuleScope): ReadyModelCard | null {
  if (scope.kind === "unconfirmed" || topic === "rules" || topic === "discord") return null;
  const passage: Passage = passages[topic];
  const versions = scope.kind === "known" ? scope.versions : publishedReadyVersions;
  if (!readyDocument(passage.kind, versions[passage.kind])) return null;
  const summary = versions.rulebook === "3.2" ? passage.text : passage.earlierText ?? passage.text;
  return { id: topic, summary, detail: passage.details };
}

function sourceFor(
  kind: RegistrationDocumentKind,
  versions: ReadyDocumentVersions,
  section: string,
  page?: Passage["page"],
): ReadySource | null {
  const version = versions[kind];
  const document = readyDocument(kind, version);
  if (!document) return null;
  const pageNumber = typeof page === "number" ? page : page?.[version];
  return {
    title: document.title,
    url: pageNumber ? `${document.url}#page=${pageNumber}` : document.url,
    section: pageNumber ? `${section}, opens to p. ${pageNumber}` : section,
  };
}

function adminHelp(context: ReadyContext): ReadyAction {
  return { label: "Get admin help", intent: { kind: "action", id: "support-options" }, context };
}

function unconfirmed(context: ReadyContext, eventTitle?: string): ReadyReply {
  return {
    text: "I can’t confirm the governing document version for this event, Commander. Let’s get an admin involved.",
    details: eventTitle ? `Selected event: ${eventTitle}.` : undefined,
    actions: [adminHelp(context), readyLink("rules-hub", "Open rules hub", readyRulesHubSource.url)],
    context,
    fallback: true,
  };
}

export function answerKnowledgeTopic(
  topic: ReadyKnowledgeTopic,
  eventScope: ReadyRuleScope = { kind: "general" },
  context?: ReadyContext,
): ReadyReply {
  const nextContext = { ...context, topic };
  if (topic === "rules") {
    return {
      text: "Open the rules hub for the official Rulebook, Participation Agreement, Terms and Privacy Policy. Existing events use the applicable recorded versions.",
      sources: [readyRulesHubSource],
      actions: [readyLink("rules-hub", "Open rules hub", readyRulesHubSource.url)],
      context: nextContext,
    };
  }
  if (eventScope.kind === "unconfirmed") return unconfirmed(nextContext, eventScope.eventTitle);
  const versions = eventScope.kind === "known" ? eventScope.versions : publishedReadyVersions;
  const passage: Passage = topic === "discord" ? {
    kind: "rulebook", section: "§§ 4.8 and 9.3", page: 5,
    text: "Discord is optional for registration. Check IronClad notifications for match and tournament updates. Match participants can use in-site Admin Assistance when they need help.",
  } : passages[topic];
  const source = sourceFor(passage.kind, versions, passage.section, passage.page);
  if (!source) return unconfirmed(nextContext, eventScope.kind === "known" ? eventScope.eventTitle : undefined);
  const sources = [source];

  if (topic === "governing-versions" && eventScope.kind === "known") {
    const sections = { ppa: "§§ 19–20", terms: "§ 22", privacy: "§ 25" } as const;
    for (const kind of ["ppa", "terms", "privacy"] as const) {
      const document = sourceFor(kind, versions, sections[kind]);
      if (!document) return unconfirmed(nextContext, eventScope.eventTitle);
      sources.push(document);
    }
  }

  const eventHref = eventScope.kind === "known" && context?.eventSlug
    ? `/tournaments?${new URLSearchParams({ tournament: context.eventSlug })}` : "/tournaments";
  const actions: ReadyAction[] = [];
  if (topic === "decisions" || topic === "prizes") {
    actions.push({
      label: topic === "decisions" ? "Find published decisions" : "Find event prize terms",
      intent: { kind: "action", id: topic === "decisions" ? "event-decisions" : "event-prizes" },
      context: nextContext,
    });
  } else if (passage.tournamentLink) {
    actions.push(readyLink("find-tournament", "Open Tournaments", eventHref));
  }
  if (["disconnects", "disputes", "no-shows", "withdrawal", "scheduling", "pauses", "submission-help"].includes(topic)) {
    actions.push(adminHelp(nextContext));
  }
  if (["results", "disputes", "replays", "submission-help"].includes(topic)) {
    actions.push({ label: "Find my match workspace", intent: { kind: "action", id: "my-match" }, context: nextContext });
  }
  const paragraph = versions.rulebook === "3.2" ? passage.text : passage.earlierText ?? passage.text;
  const details = [
    eventScope.kind === "known" ? `Sources for ${eventScope.eventTitle} use the version recorded for your registration.` : "",
    passage.details,
  ].filter(Boolean).join(" ");
  return { text: paragraph, details: details || undefined, sources, actions, context: nextContext };
}
