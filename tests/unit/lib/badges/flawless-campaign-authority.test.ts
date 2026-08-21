import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  resolve(process.cwd(), "lib/badges/authority.ts"),
  "utf8"
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260821010000_badge_flawless_campaign_authority.sql"
  ),
  "utf8"
);

describe("flawless campaign authority contract", () => {
  it("adds only the Badge 20 production evaluator", () => {
    expect(authority).toContain('"flawless-campaign"');
    expect(authority).toContain(
      "get_player_badge_flawless_campaign_summary"
    );
    expect(authority).toContain("evaluateFlawlessCampaignBadgeAwardsForPlayer");
  });

  it("persists tournament completion evidence, not match or evaluation time", () => {
    expect(authority).toContain('sourceType: "tournament"');
    expect(authority).toContain("sourceId: evidence.tournamentId");
    expect(authority).toContain("originalUnlockedAt: evidence.firstCompletedAt");
    expect(authority).toContain("originalUnlockedAtBasis: \"tournament_first_completed_at\"");
  });

  it("does not introduce Badge 20 into SQL award persistence or client authority", () => {
    expect(migration).not.toContain("insert into public.player_badge_awards");
    expect(migration).not.toContain("grant execute on function public.get_player_badge_flawless_campaign_summary(uuid) to authenticated");
  });
});
