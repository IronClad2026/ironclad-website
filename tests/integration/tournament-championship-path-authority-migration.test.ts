import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820190000_tournament_championship_path_authority.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("tournament championship path authority migration", () => {
  it("is additive and ordered after the comeback authority", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260820180000_badge_comeback_commander_authority.sql")
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain(
      "create table public.tournament_championship_path_authority"
    );
    expect(sql).toContain(
      "create table public.tournament_championship_path_summary_authority"
    );
  });

  it("stores every supported terminal outcome without a match cascade", () => {
    for (const outcome of [
      "played",
      "opponent_no_show",
      "player_no_show",
      "double_no_show",
      "automatic_bye",
      "admin_default",
      "cancelled",
      "voided",
      "unknown",
    ]) {
      expect(sql).toContain(`'${outcome}'`);
    }
    expect(sql).toContain("unique (tournament_id, registration_id, path_index, revision)");
    expect(sql).not.toContain(
      "source_match_id uuid references public.tournament_matches"
    );
    expect(sql).not.toContain(
      "source_match_id uuid not null references public.tournament_matches"
    );
  });

  it("preserves revisions, latest-state suppression, and completeness evidence", () => {
    expect(sql).toContain("supersedes_id uuid");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("expected_path_segment_count");
    expect(sql).toContain("observed_path_segment_count");
    expect(sql).toContain("completeness_state in ('incomplete', 'complete', 'invalidated')");
    expect(sql).toContain("tournament.status = 'completed'");
    expect(sql).toContain("tournament.first_completed_at is not null");
    expect(sql).toContain("v_is_champion");
    expect(sql).toContain("v_expected_consistent");
    expect(sql).toContain("select distinct on (authority.path_index)");
    expect(sql).toContain("order by authority.path_index, authority.revision desc, authority.id desc");
  });

  it("invalidates durable path facts during regeneration and tournament void", () => {
    expect(sql).toContain(
      "create trigger generated_brackets_invalidate_championship_path_authority"
    );
    expect(sql).toContain("'bracket_regeneration'");
    expect(sql).toContain("'invalidatespath', true");
    expect(sql).toContain(
      "create trigger tournaments_record_championship_path_void"
    );
    expect(sql).toContain(
      "create trigger tournaments_record_championship_path_completion"
    );
    expect(sql).toContain("'tournament_void'");
    expect(sql).toContain("'invalidated'");
  });

  it("captures only real bracket participants and skips empty feeders", () => {
    expect(sql).toContain("new.outcome_type = 'empty_feeder'");
    expect(sql).toContain("new.player_one_registration_id");
    expect(sql).toContain("new.player_two_registration_id");
    expect(sql).toContain("generated.format = 'single_elimination'");
    expect(sql).toContain("bracket.name in ('academy', 'challenge', 'main')");
    expect(sql).toContain("v_slot_count = pg_catalog.power(2, v_round_count)::integer");
    expect(sql).toContain("v_min_round = 1");
    expect(sql).toContain("v_max_round = v_round_count");
  });

  it("keeps authority mutation server-only and does not add badge awarding", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain(
      "revoke all on table public.tournament_championship_path_authority from public, anon, authenticated, service_role"
    );
    expect(sql).toContain("grant execute on function public.get_tournament_championship_path_summary(uuid, uuid) to service_role");
    expect(sql).toContain("grant execute on function public.get_tournament_championship_path_segments(uuid, uuid) to service_role");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain("perform public.refresh_tournament_championship_path_summary");
    expect(sql).not.toContain("player_badge_awards");
    expect(sql).not.toContain("flawless-campaign");
  });
});
