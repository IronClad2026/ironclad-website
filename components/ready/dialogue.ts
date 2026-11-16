import type { MascotReaction, TalkStyle } from "./renderer";

export type DialogueId = "welcomeFirst" | "welcomeReturning" | "welcomeReady" | "welcomeNervous" | "welcomeRough" | "help";

export type DialogueAnswer = { id: string; label: string } & (
  { next: DialogueId } | { question: string } | { href: string }
);

export type DialogueNode = {
  text: string;
  expression: "Neutral" | "Ghigno" | "Sad" | "Pensierosa";
  style: TalkStyle;
  intensity?: number;
  reaction?: MascotReaction;
  answers: readonly DialogueAnswer[];
};

const help = { id: "show-help", label: "Show me where to go", next: "help" } as const;
const match = { id: "open-match", label: "Open my match", question: "Open my match" } as const;
const rules = { id: "open-rules", label: "Open rules and support", href: "/rules" } as const;
const welcomeAnswers = [
  { id: "ready", label: "Time to kick some ass!", next: "welcomeReady" },
  { id: "nervous", label: "A little nervous…", next: "welcomeNervous" },
  { id: "rough", label: "I’m never winning this… white flag’s up!", next: "welcomeRough" },
] as const;

export const dialogue: Record<DialogueId, DialogueNode> = {
  welcomeFirst: {
    text: "Welcome to IronClad, Commander. How’s morale today?",
    expression: "Neutral",
    style: "Talk_Normal",
    reaction: "Reaction_Nod",
    answers: welcomeAnswers,
  },
  welcomeReturning: {
    text: "Welcome back, Commander. How’s morale today?",
    expression: "Neutral",
    style: "Talk_Normal",
    answers: welcomeAnswers,
  },
  welcomeReady: {
    text: "That’s the spirit. Let’s give them a match to remember.",
    expression: "Ghigno",
    style: "Talk_Enthusiastic",
    reaction: "Reaction_Nod",
    answers: [help, match],
  },
  welcomeNervous: {
    text: "Even commanders get nervous. One match at a time.",
    expression: "Neutral",
    style: "Talk_Gentle",
    reaction: "Reaction_Nod",
    answers: [help, rules],
  },
  welcomeRough: {
    text: "Permission to surrender? Denied. One match at a time, Commander.",
    expression: "Sad",
    intensity: 1,
    style: "Talk_Gentle",
    answers: [help],
  },
  help: {
    text: "Where would you like to go, Commander?",
    expression: "Neutral",
    style: "Talk_Normal",
    answers: [
      { ...match, label: "My match" },
      { id: "open-tournaments", label: "Tournament information", href: "/tournaments" },
      { ...rules, label: "Rules and support" },
      { id: "admin-assistance", label: "Contact an admin", question: "I need an admin" },
    ],
  },
};
