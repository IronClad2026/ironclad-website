import { describe, expect, it } from "vitest";

import {
  BADGE_DEFINITIONS,
  BADGE_TOTAL,
  getBadgeDefinitionByNumber,
} from "@/lib/badges/catalog";
import {
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
  it("resolves real artwork for all canonical badges", () => {
    const recruit = getBadgeDefinitionByNumber(1);
    const eliteChampion = getBadgeDefinitionByNumber(26);

    expect(BADGE_DEFINITIONS).toHaveLength(30);
    expect(
      BADGE_DEFINITIONS.every(
        (definition) =>
          hasBadgeArtwork(definition) &&
          getBadgeArtworkAsset(definition)?.src ===
            `/assets/badges/${definition.number}.png`
      )
    ).toBe(true);
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

  it("does not generate fallback artwork for canonical badges", () => {
    const fiveVictories = getBadgeDefinitionByNumber(11);
    const seasonChampion = getBadgeDefinitionByNumber(30);
    const collection = mapBadgeCollection({ awards: [] });
    const fiveVictoriesItem = collection.items.find(
      (item) => item.definition.number === 11
    );

    expect(fiveVictories).toBeDefined();
    expect(seasonChampion).toBeDefined();
    expect(hasBadgeArtwork(fiveVictories!)).toBe(true);
    expect(hasBadgeArtwork(seasonChampion!)).toBe(true);
    expect(getBadgeArtworkAsset(fiveVictories!)).toEqual({
      src: "/assets/badges/11.png",
      alt: "Five Victories badge artwork",
    });
    expect(getBadgeAssetPath(fiveVictoriesItem!)).toBe("/assets/badges/11.png");
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
