import { getBadgeDefinitionBySlug } from "@/lib/badges/catalog";
import {
  isEarnedBadgeCollectionItem,
  mapBadgeCollection,
} from "@/lib/badges/presentation";
import type {
  BadgeCollectionItem,
  BadgePresentationEntitlement,
  BadgeRevealQueueItem,
  BadgeSlug,
  EarnedBadgeCollectionItem,
  LockedBadgeCollectionItem,
  PlayerBadgeAward,
} from "@/lib/badges/types";

export const mockFreeBadgeEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export const mockPremiumBadgeEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: true,
};

export const mockFreePlayerBadgeAwards: readonly PlayerBadgeAward[] = [
  {
    badgeSlug: "ironclad-recruit",
    awardedAt: "2026-08-01T10:00:00.000Z",
    originalAwardedAt: "2026-08-01T10:00:00.000Z",
    awardId: "fixture-award-ironclad-recruit",
    evidenceLabel: "Fixture identity readiness",
  },
  {
    badgeSlug: "first-victory",
    awardedAt: "2026-08-03T18:30:00.000Z",
    originalAwardedAt: "2026-08-03T18:30:00.000Z",
    awardId: "fixture-award-first-victory",
    evidenceLabel: "Fixture match result",
  },
];

export const mockPremiumPlayerBadgeAwards: readonly PlayerBadgeAward[] = [
  ...mockFreePlayerBadgeAwards,
  {
    badgeSlug: "elite-champion",
    awardedAt: "2026-08-09T21:15:00.000Z",
    originalAwardedAt: "2026-08-09T21:15:00.000Z",
    awardId: "fixture-award-elite-champion",
    evidenceLabel: "Fixture Main/Pro championship",
  },
];

export const mockFreePlayerBadgeCollection = mapBadgeCollection({
  awards: mockFreePlayerBadgeAwards,
  playerId: "fixture-free-player",
});

export const mockPremiumPlayerBadgeCollection = mapBadgeCollection({
  awards: mockPremiumPlayerBadgeAwards,
  playerId: "fixture-premium-player",
});

export const mockEarnedBadge = requireFixtureEarnedItem("ironclad-recruit");

export const mockLockedBadge = requireFixtureLockedItem("first-deployment");

export const mockPremiumSeenBadgeReveal: BadgeRevealQueueItem = {
  id: "fixture-premium-seen-elite-champion",
  item: requireFixtureEarnedItem("elite-champion"),
  queuedAt: "2026-08-10T09:00:00.000Z",
  reason: "retroactive-premium",
  entitlement: mockPremiumBadgeEntitlement,
  seenAt: "2026-08-10T09:05:00.000Z",
};

export const mockRetroactivePremiumRevealPending: BadgeRevealQueueItem = {
  id: "fixture-retroactive-premium-elite-champion",
  item: requireFixtureEarnedItem("elite-champion"),
  queuedAt: "2026-08-10T09:00:00.000Z",
  reason: "retroactive-premium",
  entitlement: mockPremiumBadgeEntitlement,
  seenAt: null,
};

export const mockNewUnlockQueued: BadgeRevealQueueItem = {
  id: "fixture-new-unlock-first-victory",
  item: requireFixtureEarnedItem("first-victory"),
  queuedAt: "2026-08-03T18:31:00.000Z",
  reason: "new-unlock",
  entitlement: mockFreeBadgeEntitlement,
  seenAt: null,
};

export const mockBadgeRevealQueue: readonly BadgeRevealQueueItem[] = [
  mockRetroactivePremiumRevealPending,
  mockNewUnlockQueued,
];

function requireFixtureEarnedItem(slug: BadgeSlug): EarnedBadgeCollectionItem {
  const item = requireFixtureItem(
    mockPremiumPlayerBadgeCollection.items,
    slug,
    "earned"
  );

  if (!isEarnedBadgeCollectionItem(item)) {
    throw new Error(`Fixture badge ${slug} must be earned.`);
  }

  return item;
}

function requireFixtureLockedItem(slug: BadgeSlug): LockedBadgeCollectionItem {
  const item = requireFixtureItem(
    mockFreePlayerBadgeCollection.items,
    slug,
    "locked"
  );

  if (item.state !== "locked") {
    throw new Error(`Fixture badge ${slug} must be locked.`);
  }

  return item;
}

function requireFixtureItem(
  items: readonly BadgeCollectionItem[],
  slug: BadgeSlug,
  expectedState: BadgeCollectionItem["state"]
) {
  const definition = getBadgeDefinitionBySlug(slug);
  const item = items.find((candidate) => candidate.definition.slug === slug);

  if (!definition || !item || item.state !== expectedState) {
    throw new Error(`Missing ${expectedState} badge fixture for ${slug}.`);
  }

  return item;
}
