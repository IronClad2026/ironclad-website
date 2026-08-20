import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820200000_badge_flawless_campaign_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("flawless campaign authority migration", () => {
  it("is additive and ordered after championship path authority", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260820190000_tournament_championship_path_authority.sql")
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain(
      "create or replace function public.get_player_badge_flawless_campaign_summary"
    );
  });

  it("requires authoritative champion and complete latest path evidence", () => {
    expect(sql).toContain("event.event_type = 'tournament_win'");
    expect(sql).toContain("event.source in ('system', 'recalculation')");
    expect(sql).toContain("tournament.status = 'completed'");
    expect(sql).toContain("summary.completeness_state");
    expect(sql).toContain("summary.revision desc");
    expect(sql).toContain("path.revision desc");
    expect(sql).toContain("stats.completeness_state = 'complete'");
    expect(sql).toContain("stats.path_segments_valid");
  });

  it("allows only bye/no-show non-played segments and requires clean games", () => {
    expect(sql).toContain("'played', 'opponent_no_show', 'automatic_bye'");
    expect(sql).toContain("game.game_authority_complete");
    expect(sql).toContain("games.winner_registration_id = games.registration_id");
    expect(sql).toContain("complete_contiguous_game_set");
    expect(sql).toContain("stats.played_segment_count = 0");
    expect(sql).not.toContain("'player_no_show'");
    expect(sql).not.toContain("'admin_default'");
  });

  it("uses latest revisions and remains service-role-only", () => {
    expect(sql).toContain("select distinct on (path.tournament_id, path.registration_id, path.path_index)");
    expect(sql).toContain("select distinct on (authority.match_id, authority.registration_id)");
    expect(sql).toContain("select distinct on (game.match_id, game.game_number)");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain(
      "revoke all on function public.get_player_badge_flawless_campaign_summary(uuid) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.get_player_badge_flawless_campaign_summary(uuid) to service_role"
    );
    expect(sql).not.toContain("grant execute on function public.get_player_badge_flawless_campaign_summary(uuid) to authenticated");
  });
});
