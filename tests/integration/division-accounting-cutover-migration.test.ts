import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260903160000_division_accounting_cutover.sql";
const previousMigrationName = "20260903130000_not_held_division_closure.sql";

const source = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const migration = source.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunction(qualifiedName: string) {
  const markers = [
    `create function ${qualifiedName}(`,
    `create or replace function ${qualifiedName}(`,
  ];
  const start = markers.reduce((found, marker) => {
    const index = migration.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = migration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${qualifiedName} was not found in ${migrationName}.`);
  }

  return migration.slice(start, end + 3);
}

const settlement = extractFunction("public.settle_leaderboard_division");
const writeGate = extractFunction("public.leaderboard_require_write_access");
const coordinator = extractFunction(
  "public.recalculate_leaderboard_for_tournament"
);
const completionTrigger = extractFunction(
  "public.settle_leaderboard_division_on_match_result"
);
const seasonFinalizer = extractFunction(
  "public.finalize_leaderboard_main_season_if_ready"
);
describe("Division accounting cutover migration", () => {
  it("is ordered, transactional, and introduces no second persistent subsystem", () => {
    const names = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(names.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(
      /create table|alter type|create type|add column|create extension/
    );
    expect(migration).not.toMatch(/create table [^;]*(?:queue|worker)/);
    expect(migration).not.toMatch(
      /create(?: or replace)? function [^(]*(?:process|claim).*badge.*reconciliation/
    );
    expect(migration).toContain(
      "alter table public.leaderboard_division_settlements force row level security"
    );
  });

  it("activates the PR 5 calculator behind one Division writer", () => {
    expect(settlement).toContain(
      "ironclad_private.calculate_leaderboard_division_point_events( p_tournament_bracket_id )"
    );
    expect(settlement).toContain(
      "pg_advisory_xact_lock( pg_catalog.hashtextextended( 'ironclad:leaderboard:division:'"
    );
    expect(settlement).toContain("for update of tournament, bracket");
    expect(settlement).toContain("order by match.id for update");
    expect(settlement).toContain(
      "insert into public.leaderboard_division_settlements"
    );
    expect(settlement).toContain(
      "on conflict (tournament_bracket_id) do update"
    );
    expect(settlement).not.toContain(
      "recalculate_leaderboard_for_tournament_without_terminal_guard"
    );
    expect(migration).toContain(
      "revoke all on function public.settle_leaderboard_division(uuid, text) from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.settle_leaderboard_division(uuid, text) to service_role"
    );
  });

  it("settles only launched, held, complete Divisions with resolved results", () => {
    for (const marker of [
      "a terminal event division cannot be settled",
      "a not held division cannot be settled as competition",
      "tournament division must be launched before settlement",
      "tournament division requires exactly one generated bracket",
      "public.is_generated_bracket_complete(v_generated_bracket_id)",
      "tournament division must be complete before settlement",
      "report_group.finalized_at is null",
      "submission.status = 'pending'",
      "tournament division has unresolved result authority",
    ]) {
      expect(settlement).toContain(marker);
    }
  });

  it("preserves existing point IDs on exact historical parity and Admin adjustments", () => {
    expect(settlement).toContain(
      "exact historical event-level scoring is adopted in place"
    );
    expect(settlement).toContain(
      "event.source in ('system', 'recalculation')"
    );
    expect(settlement).toContain("event.event_type <> 'admin_adjustment'");
    expect(settlement).toContain(
      "if not v_events_match then delete from public.leaderboard_point_events"
    );
    expect(settlement).toContain(
      "where event.event_type <> 'missing_tournament_bonus'"
    );
    expect(settlement).toContain(
      "last_reconciled_at = greatest( clock_timestamp(), public.leaderboard_division_settlements.settled_at )"
    );
  });

  it("keeps the Event path as a coordinator over the same writer", () => {
    expect(coordinator).toContain(
      "perform public.settle_leaderboard_division( v_bracket.id, p_triggered_by_clerk_user_id )"
    );
    expect(coordinator).toContain(
      "public.is_generated_bracket_complete(generated.id)"
    );
    expect(coordinator).toContain(
      "from public.tournament_division_not_held_closures as closure"
    );
    expect(coordinator).not.toMatch(
      /insert into public\.leaderboard_point_events|delete from public\.leaderboard_point_events/
    );
    expect(coordinator).not.toContain(
      "recalculate_leaderboard_for_tournament_without_terminal_guard"
    );
  });

  it("uses one deferred completion trigger and the existing failure audit path", () => {
    expect(migration).toContain(
      "create constraint trigger tournament_matches_settle_completed_division after insert or update of status, winner_registration_id on public.tournament_matches deferrable initially deferred"
    );
    expect(completionTrigger).toContain(
      "perform public.settle_leaderboard_division( v_tournament_bracket_id, null )"
    );
    expect(completionTrigger).toContain(
      "insert into public.leaderboard_recalculation_runs"
    );
    expect(completionTrigger).toContain(
      "automatic division settlement failed: sqlstate %s"
    );
    expect(completionTrigger).toContain(
      "pg_catalog.pg_try_advisory_xact_lock"
    );
    expect(completionTrigger).toContain("using errcode = '55p03'");
    expect(settlement).toContain("if pg_catalog.pg_trigger_depth() = 0 then");
    expect(settlement).toContain(
      "perform public.leaderboard_require_write_access()"
    );
    expect(writeGate).toContain(
      "session_user = 'postgres' or pg_catalog.pg_trigger_depth() > 0"
    );
    expect(migration).toContain(
      "revoke all on function public.leaderboard_require_write_access() from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.leaderboard_require_write_access() to service_role"
    );
  });

  it("advances only the sixth completed Main Division and snapshots the podium", () => {
    expect(settlement).toContain("elsif v_bracket_type = 'main' then");
    expect(settlement).toContain("from generate_series(1, 6)");
    expect(settlement).toContain(
      "if v_bracket_type = 'main' then update public.leaderboard_tournament_season_memberships"
    );
    expect(settlement).toContain(
      "select public.finalize_leaderboard_main_season_if_ready(v_season_id)"
    );
    expect(seasonFinalizer).toContain("if v_event_count <> 6 then");
    expect(seasonFinalizer).toContain("membership.scored_at is null");
    expect(seasonFinalizer).toContain(
      "season_stats.current_rank between 1 and 3"
    );
    expect(seasonFinalizer).toContain(
      "select public.get_or_create_leaderboard_season(current_date)"
    );
  });

  it("moves only Badge invocation scope and keeps the existing authority", () => {
    expect(settlement).toContain(
      "ironclad_private.enqueue_badge_reconciliation_target( v_badge_player_id, 'tournament_completion', 'tournament', v_tournament_id::text )"
    );
    expect(settlement).toContain(
      "from ironclad_private.badge_reconciliation_targets as target"
    );
    expect(migration).toContain(
      "drop trigger if exists tournaments_queue_badge_reconciliation on public.tournaments"
    );
    expect(migration).toContain(
      "drop trigger if exists leaderboard_division_settlements_queue_badges on public.leaderboard_division_settlements"
    );
    expect(migration).not.toContain(
      "create trigger leaderboard_division_settlements_queue_badges"
    );
    expect(migration).toContain(
      "drop trigger if exists tournaments_record_championship_path_completion on public.tournaments"
    );
    expect(migration).not.toMatch(
      /insert into public\.player_badge_awards|insert into public\.player_badge_reveals|insert into public\.notifications/
    );
    expect(migration).not.toMatch(
      /create(?: or replace)? function .*evaluate.*badge|create table .*badge/
    );
  });

  it("preserves Badge definitions, thresholds, notifications, and Reveal semantics", () => {
    expect(migration).not.toMatch(
      /badge_slug|badge\.unlocked|create_in_app_notification|acknowledge_player_badge_reveal/
    );
    expect(migration).not.toMatch(
      /(?:insert into|update|delete from) public\.player_badge_(?:awards|reveals)/
    );
    expect(migration).not.toMatch(
      /(?:insert into|update|delete from) public\.badge_definitions/
    );
  });
});
