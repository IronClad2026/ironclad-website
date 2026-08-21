import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260821008000_badge_comeback_commander_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("Comeback Commander authority migration", () => {
  it("is additive and ordered after Batch 7B", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260821007000_badge_reliable_competitor_authority.sql")
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
  });

  it("requires latest active complete durable game authority", () => {
    expect(compactMigration).toContain(
      "create function public.get_player_badge_comeback_commander_summary"
    );
    expect(compactMigration).toContain(
      "select distinct on (authority.match_id, authority.game_number)"
    );
    expect(compactMigration).toContain("authority.revision desc");
    expect(compactMigration).toContain(
      "where game.authority_state = 'active'"
    );
    expect(compactMigration).toContain("series.game_authority_complete");
    expect(compactMigration).toContain(
      "series.archived_game_count = series.finalized_game_count"
    );
    expect(compactMigration).toContain("series.first_game_number = 1");
    expect(compactMigration).toContain(
      "series.last_game_number = series.finalized_game_count"
    );
    expect(compactMigration).toContain(
      "series.game1_winner_registration_id <> player_registration.id"
    );
  });

  it("requires the authoritative played series winner and excludes invalid paths", () => {
    expect(compactMigration).toContain("participant.outcome_kind = 'played'");
    expect(compactMigration).toContain(
      "tournament_match.winner_registration_id = player_registration.id"
    );
    expect(compactMigration).toContain(
      "public.is_tournament_match_played_for_leaderboard"
    );
    expect(compactMigration).toContain("tournament_match.outcome_type is null");
    expect(compactMigration).toContain(
      "tournament.status not in ('cancelled', 'voided')"
    );
    expect(compactMigration).not.toContain("match_result_submissions");
    expect(compactMigration).not.toContain("player_one_score");
  });

  it("is hardened as a service-role-only security definer", () => {
    expect(compactMigration).toContain("security definer");
    expect(compactMigration).toContain("set search_path = pg_catalog");
    expect(compactMigration).toContain(
      "revoke all on function public.get_player_badge_comeback_commander_summary(uuid) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.get_player_badge_comeback_commander_summary(uuid) to service_role"
    );
  });

  it("does not implement Flawless Campaign", () => {
    expect(compactMigration).not.toContain("flawless-campaign");
    expect(compactMigration).not.toContain("player_badge_awards");
  });
});
