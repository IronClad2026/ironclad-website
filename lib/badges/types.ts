export type BadgeNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30;

export type BadgeSlug =
  | "ironclad-recruit"
  | "first-deployment"
  | "first-victory"
  | "battle-tested"
  | "rising-through-the-ranks"
  | "first-campaign"
  | "iron-regular"
  | "tournament-veteran"
  | "season-campaigner"
  | "reliable-competitor"
  | "five-victories"
  | "ten-victories"
  | "twenty-five-victories"
  | "iron-streak"
  | "unbroken"
  | "clean-sweep"
  | "comeback-commander"
  | "giant-slayer"
  | "giant-hunter"
  | "flawless-campaign"
  | "first-advance"
  | "semifinalist"
  | "finalist"
  | "academy-champion"
  | "challenge-champion"
  | "elite-champion"
  | "double-champion"
  | "triple-crown"
  | "season-podium"
  | "season-champion";

export type BadgeRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type BadgeAssetPaths = {
  static: string;
  locked: string;
  thumbnail: string;
};

export type BadgeDefinition = {
  number: BadgeNumber;
  name: string;
  slug: BadgeSlug;
  rarity: BadgeRarity;
  unlockMeaning: string;
  assets: BadgeAssetPaths;
};

export type PlayerBadgeAward = {
  badgeSlug: BadgeSlug;
  awardedAt: string;
  originalAwardedAt?: string | null;
  awardId?: string | null;
  evidenceLabel?: string | null;
};

export type LockedBadgeCollectionItem = {
  definition: BadgeDefinition;
  state: "locked";
  award: null;
};

export type EarnedBadgeCollectionItem = {
  definition: BadgeDefinition;
  state: "earned";
  award: PlayerBadgeAward;
};

export type BadgeCollectionItem =
  | LockedBadgeCollectionItem
  | EarnedBadgeCollectionItem;

export type BadgeCollection = {
  playerId: string | null;
  items: BadgeCollectionItem[];
  earnedCount: number;
  totalCount: 30;
};

export type BadgePresentationEntitlement = {
  premiumEffectsEnabled: boolean;
};

export type BadgeRevealQueueItem = {
  id: string;
  item: EarnedBadgeCollectionItem;
  queuedAt: string;
  reason: "new-unlock" | "retroactive-premium";
  entitlement: BadgePresentationEntitlement;
  seenAt: string | null;
};
