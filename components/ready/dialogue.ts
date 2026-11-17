import type { MascotReaction, TalkStyle } from "./renderer";

export type DialogueId = "welcomeFirst" | "welcomeReturning" | "welcomeReady" | "welcomeNervous" | "welcomeRough" | "welcomeResolve";

export type DialogueAnswer = { id: string; label: string; next: DialogueId };

export type DialogueNode = {
  text: string;
  expression: "Neutral" | "Ghigno" | "Sad" | "Pensierosa";
  style: TalkStyle;
  intensity?: number;
  reaction?: MascotReaction;
  answers: readonly DialogueAnswer[];
};

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
    answers: [],
  },
  welcomeNervous: {
    text: "Even commanders get nervous. One match at a time.",
    expression: "Neutral",
    style: "Talk_Gentle",
    reaction: "Reaction_Nod",
    answers: [],
  },
  welcomeRough: {
    text: "Oh, poor you, Commander… let me shed a tactical tear.",
    expression: "Sad",
    intensity: 1,
    style: "Talk_Gentle",
    answers: [],
  },
  welcomeResolve: {
    text: "Permission to surrender? Denied. One match at a time, Commander.",
    expression: "Neutral",
    style: "Talk_Gentle",
    answers: [],
  },
};
