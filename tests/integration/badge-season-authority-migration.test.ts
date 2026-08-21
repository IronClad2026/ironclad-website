import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260821004000_badge_season_authority.sql";
const previousMigrationName =
  "20260821003000_badge_streak_clean_upset_authority.sql";
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

describe("badge season authority migration", () => {
  it("is ordered after the streak/clean/upset batch and remains additive", () => {
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

  it("keeps season helper RPCs service-role-only with safe search paths", () => {
    for (const functionName of [
      "get_player_badge_finalized_season_for_tournament",
      "get_player_badge_season_authority_participants",
      "get_player_badge_season_summary",
    ]) {
      const helper = extractFunction(functionName);

      expect(helper).toContain("security definer");
      expect(helper).toContain("set search_path = pg_catalog");
      expect(helper).not.toContain("execute ");
      expect(compactMigration).toContain(
        `revoke all on function public.${functionName}(uuid) from public, anon, authenticated, service_role`
      );
      expect(compactMigration).toContain(
        `grant execute on function public.${functionName}(uuid) to service_role`
      );
    }
  });

  it("maps tournaments only to finalized, non-under-review official seasons", () => {
    const helper = extractFunction(
      "get_player_badge_finalized_season_for_tournament"
    );

    expect(helper).toContain(
      "from public.leaderboard_tournament_season_memberships as membership"
    );
    expect(helper).toContain(
      "join public.leaderboard_seasons as season on season.id = membership.season_id"
    );
    expect(helper).toContain("membership.voided_at is null");
    expect(helper).toContain("tournament.status = 'completed'");
    expect(helper).toContain("tournament.first_completed_at is not null");
    expect(helper).toContain("season.finalized_at is not null");
    expect(helper).toContain("season.under_review_at is null");
  });

  it("loads season participants from official participation, podium, and champion facts", () => {
    const helper = extractFunction(
      "get_player_badge_season_authority_participants"
    );

    expect(helper).toContain("season.finalized_at is not null");
    expect(helper).toContain("season.under_review_at is null");
    expect(helper).toContain("from public.leaderboard_point_events as event");
    expect(helper).toContain(
      "join public.leaderboard_tournament_season_memberships as membership"
    );
    expect(helper).toContain("membership.voided_at is null");
    expect(helper).toContain("tournament.status = 'completed'");
    expect(helper).toContain("event.event_type = 'participation'");
    expect(helper).toContain("event.source in ('system', 'recalculation')");
    expect(helper).toContain("event.registration_id is not null");
    expect(helper).toContain("event.tournament_bracket_id is not null");
    expect(helper).toContain("withheld.event_type = 'participation_withheld'");
    expect(helper).toContain("season_stats.bracket_type = 'main'");
    expect(helper).toContain("season_stats.current_rank <= 3");
    expect(helper).toContain("champion.bracket_type = 'main'");
    expect(helper).toContain("champion.final_rank = 1");
    expect(helper).toContain("select distinct candidate.player_id");
  });

  it("derives Season Campaigner from four distinct completed tournaments in one finalized season", () => {
    const summary = extractFunction("get_player_badge_season_summary");

    expect(summary).toContain("finalized_seasons as");
    expect(summary).toContain("season.finalized_at is not null");
    expect(summary).toContain("season.under_review_at is null");
    expect(summary).toContain("qualifying_participation as");
    expect(summary).toContain("membership.voided_at is null");
    expect(summary).toContain("tournament.status = 'completed'");
    expect(summary).toContain("tournament.first_completed_at is not null");
    expect(summary).toContain("event.event_type = 'participation'");
    expect(summary).toContain("event.source in ('system', 'recalculation')");
    expect(summary).toContain("withheld.event_type = 'participation_withheld'");
    expect(summary).toContain(
      "group by event.season_id, event.tournament_id"
    );
    expect(summary).toContain("partition by participation.season_id");
    expect(summary).toContain("where ranked.tournament_number = 4");
    expect(summary).toContain("threshold_tournament_id");
    expect(summary).toContain("season_tournament_count");
  });

  it("derives season podium and champion only from finalized Main-season authority", () => {
    const summary = extractFunction("get_player_badge_season_summary");

    expect(summary).toContain(
      "from public.leaderboard_player_season_stats as season_stats"
    );
    expect(summary).toContain("season_stats.bracket_type = 'main'");
    expect(summary).toContain("season_stats.current_rank <= 3");
    expect(summary).toContain(
      "from public.leaderboard_season_champions as champion"
    );
    expect(summary).toContain("champion.bracket_type = 'main'");
    expect(summary).toContain("champion.final_rank = 1");
    expect(summary).toContain("first_podium_rank");
    expect(summary).toContain("first_champion_rank");
    expect(summary).toContain("first_podium_at");
    expect(summary).toContain("first_champion_at");
  });
});
