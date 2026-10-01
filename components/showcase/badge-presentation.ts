import { getBadgeDefinitionBySlug } from "@/lib/badges/catalog";
import type { EarnedBadgeCollectionItem } from "@/lib/badges/types";
import type { PublicShowcaseBadge } from "@/lib/player-showcase/types";

/** Only canonical artwork and public display data enter the presentation layer. */
export function getShowcaseBadgeItem(badge: PublicShowcaseBadge): EarnedBadgeCollectionItem | null {
  const definition = getBadgeDefinitionBySlug(badge.slug);
  if (!definition) return null;
  return {
    definition,
    state: "earned",
    award: {
      badgeSlug: badge.slug,
      awardedAt: badge.unlockedAt ?? "",
      originalAwardedAt: badge.unlockedAt,
    },
  };
}
