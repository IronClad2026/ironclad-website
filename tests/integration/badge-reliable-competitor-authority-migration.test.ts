import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

const migrationName = "20260821007000_badge_reliable_competitor_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("Reliable Competitor authority migration", () => {
  it("is additive and ordered after the match authority foundation", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260821006000_match_authority_foundation.sql")
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
  });

  it("resolves latest participant revisions and uses immutable finalized chronology", () => {
    expect(compactMigration).toContain(
      "create function public.get_player_badge_reliable_competitor_summary"
    );
    expect(compactMigration).toContain(
      "select distinct on (authority.match_id, authority.registration_id)"
    );
    expect(compactMigration).toContain("authority.revision desc");
    expect(compactMigration).toContain(
      "order by authority.finalized_at, authority.match_id, authority.id"
    );
    expect(compactMigration).not.toContain("updated_at");
  });

  it("implements the conservative outcome sequence", () => {
    expect(compactMigration).toContain(
      "when ordered.outcome_kind in ('played', 'opponent_no_show') then 1"
    );
    expect(compactMigration).toContain(
      "when next_authority.outcome_kind = 'player_no_show' then 0"
    );
    expect(compactMigration).toContain(
      "history.run_length + 1 >= 10"
    );
    for (const neutral of [
      "double_no_show",
      "automatic_bye",
      "admin_default",
      "cancelled",
      "voided",
      "unknown",
    ]) {
      expect(compactMigration).not.toContain(
        `outcome_kind = '${neutral}' then 0`
      );
    }
  });

  it("is hardened as a service-role-only security definer", () => {
    expect(compactMigration).toContain("security definer");
    expect(compactMigration).toContain("set search_path = pg_catalog");
    expect(compactMigration).toContain(
      "revoke all on function public.get_player_badge_reliable_competitor_summary(uuid) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.get_player_badge_reliable_competitor_summary(uuid) to service_role"
    );
    expect(compactMigration).not.toContain("player_badge_awards");
  });

  it("does not add authority for Badges 17 or 20", () => {
    expect(compactMigration).not.toContain("comeback-commander");
    expect(compactMigration).not.toContain("flawless-campaign");
  });
});
