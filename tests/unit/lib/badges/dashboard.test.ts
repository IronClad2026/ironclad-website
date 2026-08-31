import { describe, expect, it } from "vitest";

import {
  buildDashboardBadgeData,
  getDashboardBadgeShowcaseItems,
} from "@/lib/badges/dashboard";
import { getBadgeProgressSummary } from "@/lib/badges/presentation";
import type { PlayerBadgeAward } from "@/lib/badges/types";

const firstVictoryAward: PlayerBadgeAward = {
  badgeSlug: "first-victory",
  awardedAt: "2026-08-03T18:30:00.000Z",
  originalAwardedAt: "2026-08-03T18:30:00.000Z",
};

describe("dashboard badge data adapter", () => {
  it("defaults to production-safe empty awards with all canonical badges locked", () => {
    const data = buildDashboardBadgeData({ playerId: "player-1" });

    expect(data.collection.playerId).toBe("player-1");
    expect(data.collection.items).toHaveLength(30);
    expect(data.collection.items.every((item) => item.state === "locked")).toBe(
      true
    );
    expect(data.entitlement).toEqual({ premiumEffectsEnabled: false });
    expect(getBadgeProgressSummary(data.collection)).toMatchObject({
      earnedCount: 0,
      lockedCount: 30,
      totalCount: 30,
    });
  });

  it("marks badges earned only from explicit PlayerBadgeAward input", () => {
    const data = buildDashboardBadgeData({
      awards: [firstVictoryAward],
    });

    expect(
      data.collection.items.filter((item) => item.state === "earned")
    ).toHaveLength(1);
    expect(
      data.collection.items.find(
        (item) => item.definition.slug === "first-victory"
      )
    ).toMatchObject({
      state: "earned",
      award: firstVictoryAward,
    });
    expect(
      data.collection.items.find(
        (item) => item.definition.slug === "ironclad-recruit"
      )?.state
    ).toBe("locked");
  });

  it("selects the most recently earned badges for the dashboard showcase", () => {
    const data = buildDashboardBadgeData({
      awards: [
        award("ironclad-recruit", "2026-08-01T10:00:00.000Z"),
        award("first-victory", "2026-08-03T10:00:00.000Z"),
        award("elite-champion", "2026-08-09T10:00:00.000Z"),
      ],
    });

    expect(
      getDashboardBadgeShowcaseItems(data.collection, 2).map(
        (item) => item.definition.slug
      )
    ).toEqual(["elite-champion", "first-victory"]);
  });

  it("uses locked canonical teaser badges when there are no earned awards", () => {
    const data = buildDashboardBadgeData();
    const items = getDashboardBadgeShowcaseItems(data.collection, 4);

    expect(items).toHaveLength(4);
    expect(items.map((item) => item.definition.number)).toEqual([1, 2, 3, 4]);
    expect(items.every((item) => item.state === "locked")).toBe(true);
  });

  it("keeps the showcase bounded by the canonical collection size", () => {
    const data = buildDashboardBadgeData();

    expect(getDashboardBadgeShowcaseItems(data.collection, 99)).toHaveLength(30);
    expect(getDashboardBadgeShowcaseItems(data.collection, -1)).toHaveLength(0);
  });
});

function award(
  badgeSlug: PlayerBadgeAward["badgeSlug"],
  awardedAt: string
): PlayerBadgeAward {
  return {
    badgeSlug,
    awardedAt,
    originalAwardedAt: awardedAt,
  };
}
