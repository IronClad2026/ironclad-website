"use server";

import { savePlayerShowcaseBadge, savePlayerShowcaseThought } from "@/lib/player-showcase/mutations";

export async function saveCurrentThought(input: { currentThought: string | null; revision: number }) {
  return savePlayerShowcaseThought(input);
}

export async function saveFeaturedBadge(input: { awardId: string | null; revision: number }) {
  return savePlayerShowcaseBadge(input);
}
