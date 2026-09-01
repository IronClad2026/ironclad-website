import { mapBadgeCollection } from "@/lib/badges/presentation";
import type {
  BadgeCollection,
  BadgeCollectionItem,
  BadgePresentationEntitlement,
  PlayerBadgeAward,
} from "@/lib/badges/types";

export type DashboardBadgeData = {
  collection: BadgeCollection;
  entitlement: BadgePresentationEntitlement;
};

const standardBadgeEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export function buildDashboardBadgeData({
  playerId = null,
  awards = [],
  entitlement = standardBadgeEntitlement,
}: {
  playerId?: string | null;
  awards?: readonly PlayerBadgeAward[];
  entitlement?: BadgePresentationEntitlement;
} = {}): DashboardBadgeData {
  return {
    collection: mapBadgeCollection({
      awards,
      playerId,
    }),
    entitlement,
  };
}

export function getDashboardBadgeShowcaseItems(
  collection: BadgeCollection,
  limit = 6
): BadgeCollectionItem[] {
  const boundedLimit = Math.max(0, Math.min(limit, collection.totalCount));
  const earned = collection.items
    .filter((item) => item.state === "earned")
    .sort(compareEarnedBadgesByRecentAward);

  if (earned.length > 0) {
    return earned.slice(0, boundedLimit);
  }

  return collection.items
    .slice()
    .sort((left, right) => left.definition.number - right.definition.number)
    .slice(0, boundedLimit);
}

function compareEarnedBadgesByRecentAward(
  left: BadgeCollectionItem,
  right: BadgeCollectionItem
) {
  if (left.state !== "earned" || right.state !== "earned") {
    return left.definition.number - right.definition.number;
  }

  const rightAwarded = Date.parse(
    right.award.originalAwardedAt ?? right.award.awardedAt
  );
  const leftAwarded = Date.parse(
    left.award.originalAwardedAt ?? left.award.awardedAt
  );

  return (
    (Number.isFinite(rightAwarded) ? rightAwarded : 0) -
      (Number.isFinite(leftAwarded) ? leftAwarded : 0) ||
    left.definition.number - right.definition.number
  );
}
