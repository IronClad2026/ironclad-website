import { describe, expect, it } from "vitest";

import {
  BADGE_DEFINITIONS,
  BADGE_TOTAL,
  getBadgeDefinitionByNumber,
  getBadgeDefinitionBySlug,
  isPilotBadgeSlug,
} from "@/lib/badges/catalog";

describe("IronClad badge catalog", () => {
  it("contains exactly 30 badges", () => {
    expect(BADGE_DEFINITIONS).toHaveLength(BADGE_TOTAL);
    expect(BADGE_TOTAL).toBe(30);
  });

  it("uses numbers exactly 1 through 30", () => {
    expect(BADGE_DEFINITIONS.map((badge) => badge.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1)
    );
  });

  it("keeps badge ordering deterministic", () => {
    const orderedNumbers = BADGE_DEFINITIONS.map((badge) => badge.number);

    expect([...orderedNumbers].sort((left, right) => left - right)).toEqual(
      orderedNumbers
    );
  });

  it("uses unique slugs and numbers", () => {
    const numbers = BADGE_DEFINITIONS.map((badge) => badge.number);
    const slugs = BADGE_DEFINITIONS.map((badge) => badge.slug);

    expect(new Set(numbers).size).toBe(BADGE_TOTAL);
    expect(new Set(slugs).size).toBe(BADGE_TOTAL);
  });

  it("identifies the three pilot badges", () => {
    expect(getBadgeDefinitionByNumber(1)?.slug).toBe("ironclad-recruit");
    expect(getBadgeDefinitionByNumber(3)?.slug).toBe("first-victory");
    expect(getBadgeDefinitionByNumber(26)?.slug).toBe("elite-champion");

    expect(getBadgeDefinitionBySlug("ironclad-recruit")?.number).toBe(1);
    expect(getBadgeDefinitionBySlug("first-victory")?.number).toBe(3);
    expect(getBadgeDefinitionBySlug("elite-champion")?.number).toBe(26);

    expect(isPilotBadgeSlug("ironclad-recruit")).toBe(true);
    expect(isPilotBadgeSlug("first-victory")).toBe(true);
    expect(isPilotBadgeSlug("elite-champion")).toBe(true);
    expect(isPilotBadgeSlug("first-deployment")).toBe(false);
  });

  it("uses predictable missing-artwork-tolerant asset paths", () => {
    expect(getBadgeDefinitionBySlug("elite-champion")?.assets).toEqual({
      static: "/assets/badges/static/26-elite-champion.png",
      locked: "/assets/badges/locked/26-elite-champion.png",
      thumbnail: "/assets/badges/thumbnails/26-elite-champion.png",
    });
  });
});
