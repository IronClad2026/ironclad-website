import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820150000_badge_bracket_progression_authority.sql";
const previousMigrationName = "20260820140000_badge_season_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunction(functionName: string) {
  const marker = `create function public.${functionName}(`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found.`);
  }

  return compactMigration.slice(start, end + 3);
}

describe("badge bracket progression authority migration", () => {
  it("is ordered after the season batch and remains additive", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toContain("create table");
    expect(compactMigration).not.toContain("alter table");
    expect(compactMigration).not.toContain("drop table");
    expect(compactMigration).not.toContain("delete from public.");
  });

  it("keeps the progression helper service-role-only and safe", () => {
    const helper = extractFunction(
      "get_player_badge_bracket_progression_summary"
    );

    expect(helper).toContain("security definer");
    expect(helper).toContain("set search_path = pg_catalog");
    expect(helper).toContain("from public.leaderboard_point_events as event");
    expect(helper).toContain("join public.tournaments as tournament");
    expect(helper).toContain("join public.tournament_brackets as bracket");
    expect(helper).toContain("event.event_type = 'participation'");
    expect(helper).toContain("event.source in ('system', 'recalculation')");
    expect(helper).toContain("tournament.status = 'completed'");
    expect(helper).toContain("tournament.first_completed_at is not null");
    expect(helper).toContain("not public.is_registration_confirmed_no_show_for_leaderboard");
    expect(helper).toContain("withheld.event_type = 'participation_withheld'");
    expect(helper).toContain("order by qualifying.first_completed_at, qualifying.tournament_id");
    expect(helper).toContain("count(distinct participation.bracket_family)");
    expect(helper).toContain("original.bracket_family = 'academy'");
    expect(helper).toContain("original.bracket_family = 'challenge'");
    expect(helper).toContain("ordered.bracket_family in ('challenge', 'main')");
    expect(helper).toContain("ordered.bracket_family = 'main'");
    expect(compactMigration).toContain(
      "revoke all on function public.get_player_badge_bracket_progression_summary(uuid) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.get_player_badge_bracket_progression_summary(uuid) to service_role"
    );
  });
});
