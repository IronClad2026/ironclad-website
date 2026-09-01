import { BADGE_DEFINITIONS, BADGE_TOTAL } from "@/lib/badges/catalog";
import type {
  BadgeCollection,
  BadgeCollectionItem,
  BadgeDefinition,
  BadgeNumber,
  BadgePresentationEntitlement,
  BadgeRarity,
  BadgeSlug,
  EarnedBadgeCollectionItem,
  PlayerBadgeAward,
} from "@/lib/badges/types";

export const BADGE_RARITY_LABELS: Record<BadgeRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const BADGE_VISUAL_SCALE: Record<BadgeNumber, number> = {
  1: 1,
  2: 1.03,
  3: 1,
  4: 1,
  5: 1,
  6: 1.03,
  7: 1.02,
  8: 1,
  9: 1,
  10: 1,
  11: 1.06,
  12: 0.98,
  13: 1.08,
  14: 0.99,
  15: 1.09,
  16: 0.97,
  17: 1,
  18: 0.99,
  19: 1,
  20: 1,
  21: 0.98,
  22: 1,
  23: 0.98,
  24: 1.21,
  25: 1.04,
  26: 1,
  27: 1.01,
  28: 0.97,
  29: 0.97,
  30: 0.98,
};

export const BADGE_RARITY_TOKENS: Record<
  BadgeRarity,
  {
    borderClassName: string;
    badgeClassName: string;
    textClassName: string;
    surfaceClassName: string;
    glowClassName: string;
  }
> = {
  common: {
    borderClassName: "border-zinc-400/25",
    badgeClassName: "border-zinc-400/25 bg-zinc-500/10 text-zinc-200",
    textClassName: "text-zinc-200",
    surfaceClassName: "bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(8,8,8,0.88))]",
    glowClassName: "shadow-[0_0_18px_rgba(161,161,170,0.14)]",
  },
  uncommon: {
    borderClassName: "border-emerald-400/30",
    badgeClassName: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    textClassName: "text-emerald-200",
    surfaceClassName: "bg-[linear-gradient(145deg,rgba(16,185,129,0.1),rgba(8,8,8,0.88))]",
    glowClassName: "shadow-[0_0_20px_rgba(16,185,129,0.16)]",
  },
  rare: {
    borderClassName: "border-sky-400/35",
    badgeClassName: "border-sky-400/35 bg-sky-500/10 text-sky-200",
    textClassName: "text-sky-200",
    surfaceClassName: "bg-[linear-gradient(145deg,rgba(14,165,233,0.12),rgba(8,8,8,0.88))]",
    glowClassName: "shadow-[0_0_22px_rgba(14,165,233,0.18)]",
  },
  epic: {
    borderClassName: "border-fuchsia-400/35",
    badgeClassName: "border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-200",
    textClassName: "text-fuchsia-200",
    surfaceClassName: "bg-[linear-gradient(145deg,rgba(217,70,239,0.12),rgba(8,8,8,0.9))]",
    glowClassName: "shadow-[0_0_24px_rgba(217,70,239,0.2)]",
  },
  legendary: {
    borderClassName: "border-orange-300/45",
    badgeClassName: "border-orange-300/45 bg-orange-500/15 text-orange-100",
    textClassName: "text-orange-100",
    surfaceClassName: "bg-[linear-gradient(145deg,rgba(249,115,22,0.18),rgba(8,8,8,0.9))]",
    glowClassName: "shadow-[0_0_28px_rgba(249,115,22,0.24)]",
  },
};

export function mapBadgeCollection({
  awards,
  playerId = null,
  definitions = BADGE_DEFINITIONS,
}: {
  awards: readonly PlayerBadgeAward[];
  playerId?: string | null;
  definitions?: readonly BadgeDefinition[];
}): BadgeCollection {
  const awardsBySlug = new Map<BadgeSlug, PlayerBadgeAward>();

  for (const award of awards) {
    if (!awardsBySlug.has(award.badgeSlug)) {
      awardsBySlug.set(award.badgeSlug, award);
    }
  }

  const items = definitions.map((definition): BadgeCollectionItem => {
    const award = awardsBySlug.get(definition.slug) ?? null;

    return award
      ? {
          definition,
          state: "earned",
          award,
        }
      : {
          definition,
          state: "locked",
          award: null,
        };
  });

  return {
    playerId,
    items,
    earnedCount: items.filter(isEarnedBadgeCollectionItem).length,
    totalCount: BADGE_TOTAL,
  };
}

export function isEarnedBadgeCollectionItem(
  item: BadgeCollectionItem
): item is EarnedBadgeCollectionItem {
  return item.state === "earned";
}

export function getBadgeProgressSummary(collection: BadgeCollection) {
  const earnedCount = collection.items.filter(isEarnedBadgeCollectionItem).length;
  const totalCount = collection.totalCount;

  return {
    earnedCount,
    totalCount,
    lockedCount: Math.max(totalCount - earnedCount, 0),
    percentComplete: Math.round((earnedCount / totalCount) * 100),
  };
}

export function getBadgeAssetPath(
  item: BadgeCollectionItem,
  preferred: "static" | "thumbnail" = "thumbnail"
) {
  void preferred;

  return getBadgeArtworkAsset(item.definition)?.src ?? null;
}

export function getBadgeFallbackLabel(definition: BadgeDefinition) {
  return String(definition.number).padStart(2, "0");
}

export function hasBadgeArtwork(definition: BadgeDefinition) {
  return typeof definition?.assets?.artwork === "string" && definition.assets.artwork.length > 0;
}

export function getBadgeArtworkAsset(definition: BadgeDefinition) {
  const artworkPath = definition?.assets?.artwork;

  if (!hasBadgeArtwork(definition) || !artworkPath) {
    return null;
  }

  return {
    src: artworkPath,
    alt: `${definition.name} badge artwork`,
    scale: getBadgeArtworkVisualScale(definition),
  };
}

export function getBadgeArtworkVisualScale(definition: BadgeDefinition) {
  return BADGE_VISUAL_SCALE[definition.number];
}

export function getBadgeRarityLabel(rarity: BadgeRarity) {
  return BADGE_RARITY_LABELS[rarity];
}

export function getBadgeSlotPresentation(
  item: BadgeCollectionItem,
  entitlement: BadgePresentationEntitlement
) {
  return {
    premiumEffectsEnabled:
      item.state === "earned" && entitlement.premiumEffectsEnabled,
    state: item.state,
    rarity: item.definition.rarity,
  };
}

export function getAwardDisplayDate(item: BadgeCollectionItem) {
  if (item.state !== "earned") {
    return null;
  }

  return item.award.originalAwardedAt ?? item.award.awardedAt;
}
