import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  metadata: {
    pageTitle: "Badge Collection | IronClad",
    pageDescription: "Review your IronClad Badge collection.",
    artworkAlt: "{name} Badge artwork",
  },
  rarity: {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
  },
  states: {
    earned: "Earned",
    locked: "Locked",
    new: "New",
  },
  dashboard: {
    eyebrow: "Badges",
    title: "IronClad Badge Collection",
    earnedWithBadges: "Your latest IronClad achievements are displayed here.",
    empty:
      "Earn Badges by competing, winning, and reaching milestones across IronClad tournaments.",
    earnedLabel: "Earned",
    viewCollection: "View Badge Collection",
    inspect: "Open the full collection to inspect every earned and locked Badge.",
    explore: "Explore every Badge and see what it takes to unlock them.",
    featuredAria: "Featured dashboard Badges",
    progressAria: "{earned} of {total} Badges earned",
    loadErrorTitle: "Badge collection unavailable",
    loadErrorDescription:
      "Your Badge collection could not be loaded. Your earned Badges are safe.",
    retry: "Retry",
  },
  collection: {
    back: "Back to Dashboard",
    eyebrow: "Achievement Archive",
    title: "Badge Collection",
    description:
      "Review every IronClad Badge, its rarity, and the achievement required to earn it.",
    earnedLabel: "Earned",
    showing: "Showing {shown} of {total} Badges",
    filters: {
      all: "All",
      earned: "Earned",
      locked: "Locked",
    },
    filtersAria: "Badge collection filters",
    slotsAria: "IronClad Badge collection slots",
    empty: "No Badges match this filter.",
  },
  detail: {
    eyebrow: "IronClad Achievement",
    badgeNumber: "Badge {number}",
    unlockMeaning: "Unlock requirement",
    status: "Status",
    originalAwarded: "Originally awarded",
    close: "Close Badge details",
    dismiss: "Dismiss Badge details",
  },
  reveal: {
    unlocked: "Badge unlocked",
    continue: "Complete reveal",
    notNow: "Not now",
    saving: "Saving reveal…",
    queuePosition: "Badge {current} of {total}",
    ackError:
      "Your Badge reveal was not saved. Check your connection and retry.",
    retry: "Retry acknowledgement",
    transferUnavailable:
      "The collection slot moved. Complete the reveal without motion.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "IronClad Recruit",
      unlockMeaning:
        "Complete identity and ELO verification and become an eligible IronClad player.",
    },
    "first-deployment": {
      name: "First Deployment",
      unlockMeaning: "Complete your first official IronClad match.",
    },
    "first-victory": {
      name: "First Victory",
      unlockMeaning: "Win your first official IronClad match.",
    },
    "battle-tested": {
      name: "Battle Tested",
      unlockMeaning: "Complete 10 official IronClad matches.",
    },
    "rising-through-the-ranks": {
      name: "Rising Through the Ranks",
      unlockMeaning:
        "Complete a qualifying tournament in a higher division than the first division in which you completed an IronClad tournament.",
    },
    "first-campaign": {
      name: "First Campaign",
      unlockMeaning: "Complete your first full IronClad tournament.",
    },
    "iron-regular": {
      name: "Iron Regular",
      unlockMeaning: "Complete 3 IronClad tournaments.",
    },
    "tournament-veteran": {
      name: "Tournament Veteran",
      unlockMeaning: "Complete 10 IronClad tournaments.",
    },
    "season-campaigner": {
      name: "Season Campaigner",
      unlockMeaning:
        "Complete at least 4 qualifying tournaments in one finalized IronClad season.",
    },
    "reliable-competitor": {
      name: "Reliable Competitor",
      unlockMeaning:
        "Complete 10 scheduled appearances without a confirmed player-caused or double no-show.",
    },
    "five-victories": {
      name: "Five Victories",
      unlockMeaning: "Win 5 official IronClad matches.",
    },
    "ten-victories": {
      name: "Ten Victories",
      unlockMeaning: "Win 10 official IronClad matches.",
    },
    "twenty-five-victories": {
      name: "Twenty-Five Victories",
      unlockMeaning: "Win 25 official IronClad matches.",
    },
    "iron-streak": {
      name: "Iron Streak",
      unlockMeaning: "Win 3 consecutive played official matches.",
    },
    unbroken: {
      name: "Unbroken",
      unlockMeaning: "Win 5 consecutive played official matches.",
    },
    "clean-sweep": {
      name: "Clean Sweep",
      unlockMeaning: "Win a BO3 2–0 or a BO5 3–0.",
    },
    "comeback-commander": {
      name: "Comeback Commander",
      unlockMeaning: "Lose Game 1 and then win the official series.",
    },
    "giant-slayer": {
      name: "Giant Slayer",
      unlockMeaning:
        "Defeat an opponent whose verified tournament ELO is at least 200 points higher.",
    },
    "giant-hunter": {
      name: "Giant Hunter",
      unlockMeaning: "Earn the Giant Slayer achievement 3 separate times.",
    },
    "flawless-campaign": {
      name: "Flawless Campaign",
      unlockMeaning:
        "Win an IronClad tournament after playing at least one official series without losing an individual game.",
    },
    "first-advance": {
      name: "First Advance",
      unlockMeaning: "Win your first played tournament bracket round.",
    },
    semifinalist: {
      name: "Semifinalist",
      unlockMeaning: "Reach an official IronClad tournament semifinal.",
    },
    finalist: {
      name: "Finalist",
      unlockMeaning: "Reach an official IronClad tournament final.",
    },
    "academy-champion": {
      name: "Academy Champion",
      unlockMeaning: "Win an official Academy division tournament.",
    },
    "challenge-champion": {
      name: "Challenge Champion",
      unlockMeaning: "Win an official Challenge division tournament.",
    },
    "elite-champion": {
      name: "Elite Champion",
      unlockMeaning: "Win an official Main/Elite division tournament.",
    },
    "double-champion": {
      name: "Double Champion",
      unlockMeaning: "Win 2 distinct IronClad tournaments.",
    },
    "triple-crown": {
      name: "Triple Crown",
      unlockMeaning:
        "Win Academy, Challenge, and Main/Elite division tournaments at least once each.",
    },
    "season-podium": {
      name: "Season Podium",
      unlockMeaning: "Finish a finalized official season in the top 3.",
    },
    "season-champion": {
      name: "Season Champion",
      unlockMeaning: "Finish 1st on a finalized official seasonal leaderboard.",
    },
  },
} as const;

export type BadgesDictionary = DictionaryShape<typeof dictionary>;

export default dictionary;
