import { describe, expect, it } from "vitest";

import {
  BADGE_DEFINITIONS,
  BADGE_TOTAL,
  getBadgeDefinitionByNumber,
} from "@/lib/badges/catalog";
import {
  BADGE_REAL_ARTWORK_NUMBERS,
  getBadgeArtworkAsset,
  getBadgeAssetPath,
  getBadgeProgressSummary,
  getBadgeSlotPresentation,
  hasBadgeArtwork,
  mapBadgeCollection,
} from "@/lib/badges/presentation";
import type {
  BadgePresentationEntitlement,
  PlayerBadgeAward,
} from "@/lib/badges/types";

const firstVictoryAward: PlayerBadgeAward = {
  badgeSlug: "first-victory",
  awardedAt: "2026-08-03T18:30:00.000Z",
};

const freeEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

const premiumEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: true,
};

describe("badge presentation mapping", () => {
  it("resolves real artwork for canonical badges with available files", () => {
    const recruit = getBadgeDefinitionByNumber(1);
    const eliteChampion = getBadgeDefinitionByNumber(26);

    expect(BADGE_REAL_ARTWORK_NUMBERS).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      26,
    ]);
    expect(recruit).toBeDefined();
    expect(eliteChampion).toBeDefined();
    expect(hasBadgeArtwork(recruit!)).toBe(true);
    expect(getBadgeArtworkAsset(recruit!)).toEqual({
      src: "/assets/badges/1.png",
      alt: "IronClad Recruit badge artwork",
    });
    expect(getBadgeArtworkAsset(eliteChampion!)).toEqual({
      src: "/assets/badges/26.png",
      alt: "Elite Champion badge artwork",
    });
  });

  it("returns no artwork asset for badges that should use the fallback", () => {
    const fiveVictories = getBadgeDefinitionByNumber(11);
    const seasonChampion = getBadgeDefinitionByNumber(30);
    const collection = mapBadgeCollection({ awards: [] });
    const missingArtworkItem = collection.items.find(
      (item) => item.definition.number === 11
    );

    expect(fiveVictories).toBeDefined();
    expect(seasonChampion).toBeDefined();
    expect(hasBadgeArtwork(fiveVictories!)).toBe(false);
    expect(hasBadgeArtwork(seasonChampion!)).toBe(false);
    expect(getBadgeArtworkAsset(fiveVictories!)).toBeNull();
    expect(getBadgeAssetPath(missingArtworkItem!)).toBeNull();
  });

  it("derives earned state only from PlayerBadgeAward input", () => {
    const emptyCollection = mapBadgeCollection({ awards: [] });
    const awardedCollection = mapBadgeCollection({
      awards: [firstVictoryAward],
    });

    expect(emptyCollection.items).toHaveLength(BADGE_TOTAL);
    expect(emptyCollection.items.every((item) => item.state === "locked")).toBe(
      true
    );

    expect(
      awardedCollection.items.filter((item) => item.state === "earned")
    ).toHaveLength(1);
    expect(
      awardedCollection.items.find(
        (item) => item.definition.slug === "first-victory"
      )
    ).toMatchObject({
      state: "earned",
      award: firstVictoryAward,
    });
    expect(
      awardedCollection.items.find(
        (item) => item.definition.slug === "ironclad-recruit"
      )?.state
    ).toBe("locked");
  });

  it("does not let Premium entitlement change collection eligibility", () => {
    const collection = mapBadgeCollection({ awards: [firstVictoryAward] });
    const earnedItem = collection.items.find(
      (item) => item.definition.slug === "first-victory"
    );
    const lockedItem = collection.items.find(
      (item) => item.definition.slug === "elite-champion"
    );

    expect(earnedItem).toBeDefined();
    expect(lockedItem).toBeDefined();
    expect(collection.items.map((item) => item.state)).toEqual(
      mapBadgeCollection({ awards: [firstVictoryAward] }).items.map(
        (item) => item.state
      )
    );

    expect(
      getBadgeSlotPresentation(earnedItem!, freeEntitlement)
        .premiumEffectsEnabled
    ).toBe(false);
    expect(
      getBadgeSlotPresentation(earnedItem!, premiumEntitlement)
        .premiumEffectsEnabled
    ).toBe(true);
    expect(
      getBadgeSlotPresentation(lockedItem!, premiumEntitlement)
        .premiumEffectsEnabled
    ).toBe(false);
  });

  it("summarizes progress from the mapped collection", () => {
    const collection = mapBadgeCollection({
      awards: [
        { badgeSlug: "ironclad-recruit", awardedAt: "2026-08-01T00:00:00.000Z" },
        firstVictoryAward,
      ],
      definitions: BADGE_DEFINITIONS,
    });

    expect(getBadgeProgressSummary(collection)).toEqual({
      earnedCount: 2,
      totalCount: 30,
      lockedCount: 28,
      percentComplete: 7,
    });
  });
});
