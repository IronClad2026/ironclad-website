import type {
  BadgeDefinition,
  BadgeNumber,
  BadgeSlug,
} from "@/lib/badges/types";

export const BADGE_TOTAL = 30;

export const PILOT_BADGE_NUMBERS = [1, 3, 26] as const satisfies readonly BadgeNumber[];
export const PILOT_BADGE_SLUGS = [
  "ironclad-recruit",
  "first-victory",
  "elite-champion",
] as const satisfies readonly BadgeSlug[];

function badgeAssetPaths(number: BadgeNumber, slug: BadgeSlug) {
  void slug;

  return {
    artwork: `/assets/badges/${number}.png`,
  };
}

const canonicalBadgeDefinitions = [
  {
    number: 1,
    name: "IronClad Recruit",
    slug: "ironclad-recruit",
    rarity: "common",
    unlockMeaning:
      "Complete identity and ELO verification and become an eligible IronClad player.",
    assets: badgeAssetPaths(1, "ironclad-recruit"),
  },
  {
    number: 2,
    name: "First Deployment",
    slug: "first-deployment",
    rarity: "common",
    unlockMeaning: "Complete the first official IronClad match.",
    assets: badgeAssetPaths(2, "first-deployment"),
  },
  {
    number: 3,
    name: "First Victory",
    slug: "first-victory",
    rarity: "common",
    unlockMeaning: "Win the first official IronClad match.",
    assets: badgeAssetPaths(3, "first-victory"),
  },
  {
    number: 4,
    name: "Battle Tested",
    slug: "battle-tested",
    rarity: "uncommon",
    unlockMeaning: "Complete 10 official IronClad matches.",
    assets: badgeAssetPaths(4, "battle-tested"),
  },
  {
    number: 5,
    name: "Rising Through the Ranks",
    slug: "rising-through-the-ranks",
    rarity: "rare",
    unlockMeaning:
      "Complete a qualifying tournament in a higher division than the first division in which you completed one.",
    assets: badgeAssetPaths(5, "rising-through-the-ranks"),
  },
  {
    number: 6,
    name: "First Campaign",
    slug: "first-campaign",
    rarity: "common",
    unlockMeaning: "Complete the first full IronClad tournament.",
    assets: badgeAssetPaths(6, "first-campaign"),
  },
  {
    number: 7,
    name: "Iron Regular",
    slug: "iron-regular",
    rarity: "uncommon",
    unlockMeaning: "Complete 3 IronClad tournaments.",
    assets: badgeAssetPaths(7, "iron-regular"),
  },
  {
    number: 8,
    name: "Tournament Veteran",
    slug: "tournament-veteran",
    rarity: "rare",
    unlockMeaning: "Complete 10 IronClad tournaments.",
    assets: badgeAssetPaths(8, "tournament-veteran"),
  },
  {
    number: 9,
    name: "Season Campaigner",
    slug: "season-campaigner",
    rarity: "rare",
    unlockMeaning: "Complete at least 4 tournaments in one IronClad season.",
    assets: badgeAssetPaths(9, "season-campaigner"),
  },
  {
    number: 10,
    name: "Reliable Competitor",
    slug: "reliable-competitor",
    rarity: "rare",
    unlockMeaning:
      "Complete 10 scheduled matches without a confirmed player-caused no-show.",
    assets: badgeAssetPaths(10, "reliable-competitor"),
  },
  {
    number: 11,
    name: "Five Victories",
    slug: "five-victories",
    rarity: "uncommon",
    unlockMeaning: "Win 5 official IronClad matches.",
    assets: badgeAssetPaths(11, "five-victories"),
  },
  {
    number: 12,
    name: "Ten Victories",
    slug: "ten-victories",
    rarity: "rare",
    unlockMeaning: "Win 10 official IronClad matches.",
    assets: badgeAssetPaths(12, "ten-victories"),
  },
  {
    number: 13,
    name: "Twenty-Five Victories",
    slug: "twenty-five-victories",
    rarity: "epic",
    unlockMeaning: "Win 25 official IronClad matches.",
    assets: badgeAssetPaths(13, "twenty-five-victories"),
  },
  {
    number: 14,
    name: "Iron Streak",
    slug: "iron-streak",
    rarity: "rare",
    unlockMeaning: "Win 3 consecutive played official matches.",
    assets: badgeAssetPaths(14, "iron-streak"),
  },
  {
    number: 15,
    name: "Unbroken",
    slug: "unbroken",
    rarity: "epic",
    unlockMeaning: "Win 5 consecutive played official matches.",
    assets: badgeAssetPaths(15, "unbroken"),
  },
  {
    number: 16,
    name: "Clean Sweep",
    slug: "clean-sweep",
    rarity: "rare",
    unlockMeaning: "Win a BO3 2-0 or a BO5 3-0.",
    assets: badgeAssetPaths(16, "clean-sweep"),
  },
  {
    number: 17,
    name: "Comeback Commander",
    slug: "comeback-commander",
    rarity: "rare",
    unlockMeaning: "Lose Game 1 and then win the series.",
    assets: badgeAssetPaths(17, "comeback-commander"),
  },
  {
    number: 18,
    name: "Giant Slayer",
    slug: "giant-slayer",
    rarity: "rare",
    unlockMeaning:
      "Defeat an opponent whose verified tournament ELO is at least 200 points higher.",
    assets: badgeAssetPaths(18, "giant-slayer"),
  },
  {
    number: 19,
    name: "Giant Hunter",
    slug: "giant-hunter",
    rarity: "epic",
    unlockMeaning:
      "Earn the Giant Slayer achievement three separate times.",
    assets: badgeAssetPaths(19, "giant-hunter"),
  },
  {
    number: 20,
    name: "Flawless Campaign",
    slug: "flawless-campaign",
    rarity: "legendary",
    unlockMeaning:
      "Win an IronClad tournament after playing at least one official series, without losing a single individual game.",
    assets: badgeAssetPaths(20, "flawless-campaign"),
  },
  {
    number: 21,
    name: "First Advance",
    slug: "first-advance",
    rarity: "common",
    unlockMeaning: "Win the first tournament bracket round.",
    assets: badgeAssetPaths(21, "first-advance"),
  },
  {
    number: 22,
    name: "Semifinalist",
    slug: "semifinalist",
    rarity: "uncommon",
    unlockMeaning: "Reach an official IronClad tournament semifinal.",
    assets: badgeAssetPaths(22, "semifinalist"),
  },
  {
    number: 23,
    name: "Finalist",
    slug: "finalist",
    rarity: "rare",
    unlockMeaning: "Reach an official IronClad tournament final.",
    assets: badgeAssetPaths(23, "finalist"),
  },
  {
    number: 24,
    name: "Academy Champion",
    slug: "academy-champion",
    rarity: "epic",
    unlockMeaning: "Win an official Academy bracket tournament.",
    assets: badgeAssetPaths(24, "academy-champion"),
  },
  {
    number: 25,
    name: "Challenge Champion",
    slug: "challenge-champion",
    rarity: "epic",
    unlockMeaning: "Win an official Challenge bracket tournament.",
    assets: badgeAssetPaths(25, "challenge-champion"),
  },
  {
    number: 26,
    name: "Elite Champion",
    slug: "elite-champion",
    rarity: "legendary",
    unlockMeaning: "Win an official Main/Elite bracket tournament.",
    assets: badgeAssetPaths(26, "elite-champion"),
  },
  {
    number: 27,
    name: "Double Champion",
    slug: "double-champion",
    rarity: "epic",
    unlockMeaning: "Win 2 distinct IronClad tournaments.",
    assets: badgeAssetPaths(27, "double-champion"),
  },
  {
    number: 28,
    name: "Triple Crown",
    slug: "triple-crown",
    rarity: "legendary",
    unlockMeaning:
      "Win Academy, Challenge, and Elite/Main tournaments at least once each.",
    assets: badgeAssetPaths(28, "triple-crown"),
  },
  {
    number: 29,
    name: "Season Podium",
    slug: "season-podium",
    rarity: "epic",
    unlockMeaning: "Finish an official season in the top 3.",
    assets: badgeAssetPaths(29, "season-podium"),
  },
  {
    number: 30,
    name: "Season Champion",
    slug: "season-champion",
    rarity: "legendary",
    unlockMeaning: "Finish 1st on the official seasonal leaderboard.",
    assets: badgeAssetPaths(30, "season-champion"),
  },
] as const satisfies readonly BadgeDefinition[];

assertCanonicalBadgeCatalog(canonicalBadgeDefinitions);

export const BADGE_DEFINITIONS = canonicalBadgeDefinitions;

const badgeDefinitionsBySlug = new Map<BadgeSlug, BadgeDefinition>(
  BADGE_DEFINITIONS.map((definition) => [definition.slug, definition])
);
const badgeDefinitionsByNumber = new Map<BadgeNumber, BadgeDefinition>(
  BADGE_DEFINITIONS.map((definition) => [definition.number, definition])
);
const pilotSlugSet = new Set<BadgeSlug>(PILOT_BADGE_SLUGS);

export function getBadgeDefinitionBySlug(slug: BadgeSlug) {
  return badgeDefinitionsBySlug.get(slug) ?? null;
}

export function getBadgeDefinitionByNumber(number: BadgeNumber) {
  return badgeDefinitionsByNumber.get(number) ?? null;
}

export function isPilotBadgeSlug(slug: BadgeSlug) {
  return pilotSlugSet.has(slug);
}

function assertCanonicalBadgeCatalog(definitions: readonly BadgeDefinition[]) {
  if (definitions.length !== BADGE_TOTAL) {
    throw new Error(`IronClad badge catalog must contain exactly ${BADGE_TOTAL} badges.`);
  }

  const numbers = new Set<BadgeNumber>();
  const slugs = new Set<BadgeSlug>();

  definitions.forEach((definition, index) => {
    const expectedNumber = (index + 1) as BadgeNumber;

    if (definition.number !== expectedNumber) {
      throw new Error("IronClad badge catalog must be sorted from 1 to 30.");
    }

    if (numbers.has(definition.number)) {
      throw new Error(`Duplicate IronClad badge number: ${definition.number}`);
    }

    if (slugs.has(definition.slug)) {
      throw new Error(`Duplicate IronClad badge slug: ${definition.slug}`);
    }

    numbers.add(definition.number);
    slugs.add(definition.slug);
  });
}
