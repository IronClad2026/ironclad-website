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
      artwork: "/assets/badges/26.png",
    });
  });

  it("keeps canonical badge identity fields unchanged", () => {
    expect(
      BADGE_DEFINITIONS.map((badge) =>
        [
          badge.number,
          badge.name,
          badge.slug,
          badge.rarity,
          badge.unlockMeaning,
        ].join("|")
      )
    ).toEqual([
      "1|IronClad Recruit|ironclad-recruit|common|Complete identity and ELO verification and become an eligible IronClad player.",
      "2|First Deployment|first-deployment|common|Complete the first official IronClad match.",
      "3|First Victory|first-victory|common|Win the first official IronClad match.",
      "4|Battle Tested|battle-tested|uncommon|Complete 10 official IronClad matches.",
      "5|Rising Through the Ranks|rising-through-the-ranks|rare|Compete successfully in a higher bracket than the player originally entered.",
      "6|First Campaign|first-campaign|common|Complete the first full IronClad tournament.",
      "7|Iron Regular|iron-regular|uncommon|Complete 3 IronClad tournaments.",
      "8|Tournament Veteran|tournament-veteran|rare|Complete 10 IronClad tournaments.",
      "9|Season Campaigner|season-campaigner|rare|Complete at least 4 tournaments in one IronClad season.",
      "10|Reliable Competitor|reliable-competitor|rare|Complete 10 scheduled matches without a confirmed player-caused no-show.",
      "11|Five Victories|five-victories|uncommon|Win 5 official IronClad matches.",
      "12|Ten Victories|ten-victories|rare|Win 10 official IronClad matches.",
      "13|Twenty-Five Victories|twenty-five-victories|epic|Win 25 official IronClad matches.",
      "14|Iron Streak|iron-streak|rare|Win 3 consecutive played official matches.",
      "15|Unbroken|unbroken|epic|Win 5 consecutive played official matches.",
      "16|Clean Sweep|clean-sweep|rare|Win a BO3 2-0 or a BO5 3-0.",
      "17|Comeback Commander|comeback-commander|rare|Lose Game 1 and then win the series.",
      "18|Giant Slayer|giant-slayer|rare|Defeat an opponent whose verified tournament ELO is at least 200 points higher.",
      "19|Giant Hunter|giant-hunter|epic|Earn the Giant Slayer achievement three separate times.",
      "20|Flawless Campaign|flawless-campaign|legendary|Win an IronClad tournament without losing a single individual game.",
      "21|First Advance|first-advance|common|Win the first tournament bracket round.",
      "22|Semifinalist|semifinalist|uncommon|Reach an official IronClad tournament semifinal.",
      "23|Finalist|finalist|rare|Reach an official IronClad tournament final.",
      "24|Academy Champion|academy-champion|epic|Win an official Academy bracket tournament.",
      "25|Challenge Champion|challenge-champion|epic|Win an official Challenge bracket tournament.",
      "26|Elite Champion|elite-champion|legendary|Win an official Main/Elite bracket tournament.",
      "27|Double Champion|double-champion|epic|Win 2 distinct IronClad tournaments.",
      "28|Triple Crown|triple-crown|legendary|Win Academy, Challenge, and Elite/Main tournaments at least once each.",
      "29|Season Podium|season-podium|epic|Finish an official season in the top 3.",
      "30|Season Champion|season-champion|legendary|Finish 1st on the official seasonal leaderboard.",
    ]);
  });
});
