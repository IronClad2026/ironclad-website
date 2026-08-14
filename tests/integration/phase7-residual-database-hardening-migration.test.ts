import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260814120000_phase7_residual_database_hardening.sql";
const previousMigrationName =
  "20260814111000_phase7_raw_leaderboard_read_privacy.sql";
const currentHardDeleteMigrationName =
  "20260812100000_tournament_hard_delete_guard.sql";
const currentAdjustmentMigrationName =
  "20260812120000_six_event_main_seasons_late_entry_bonus.sql";
const terminalMigrationName =
  "20260813100000_tournament_terminal_recovery.sql";
const academyConstraintMigrationName =
  "20260702100000_leaderboard_academy_rewards.sql";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationPath = resolve(migrationsDirectory, migrationName);
const migrationExists = existsSync(migrationPath);

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDirectory, name), "utf8").replace(
    /\r\n/g,
    "\n"
  );
}

function compact(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractFunction(source: string, functionName: string) {
  const createMarkers = [
    `create or replace function public.${functionName}(`,
    `create function public.${functionName}(`,
  ];
  const start = createMarkers.reduce((found, marker) => {
    const index = source.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = source.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in the migration contract.`);
  }

  return source.slice(start, end + 3);
}

const migration = migrationExists ? readMigration(migrationName) : "";
const compactMigration = compact(migration);
const hardDeleteSource = compact(
  migrationExists ? migration : readMigration(currentHardDeleteMigrationName)
);
const adjustmentSource = compact(
  migrationExists
    ? migration
    : readMigration(currentAdjustmentMigrationName)
);
const hardDelete = extractFunction(
  hardDeleteSource,
  "delete_tournament_data"
);
const academyAdjustment = extractFunction(
  adjustmentSource,
  migrationExists
    ? "add_leaderboard_admin_adjustment_without_terminal_guard"
    : "add_leaderboard_admin_adjustment"
);
const terminalMigration = compact(readMigration(terminalMigrationName));
const publicAdjustment = extractFunction(
  terminalMigration,
  "add_leaderboard_admin_adjustment"
);
const academyConstraintMigration = compact(
  readMigration(academyConstraintMigrationName)
);

describe("Phase 7 residual database hardening migration", () => {
  it("is one ordered transactional correction", () => {
    const migrationNames = readdirSync(migrationsDirectory).sort();

    expect(migrationExists).toBe(true);
    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toMatch(
      /create table|alter table|drop table|create trigger|drop trigger|create index|drop index|create extension/
    );
  });

  it("hardens the exact hard-delete RPC without changing its authority", () => {
    expect(hardDelete).toContain(
      "p_tournament_id uuid, p_deleted_by text ) returns jsonb language plpgsql security definer set search_path = pg_catalog"
    );
    expect(compactMigration).toContain(
      "alter function public.delete_tournament_data(uuid, text) owner to postgres"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.delete_tournament_data(uuid, text) from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.delete_tournament_data(uuid, text) to service_role"
    );
    expect(hardDelete).not.toMatch(
      /p_(force|override|skip_guard)|force\s*=|skip_guard\s*=/
    );
  });

  it("qualifies every hard-delete relation, helper, and invoked builtin", () => {
    for (const relation of [
      "tournaments",
      "tournament_brackets",
      "registrations",
      "generated_brackets",
      "tournament_matches",
      "match_result_submissions",
      "match_result_report_groups",
      "leaderboard_point_events",
      "tournament_deletion_jobs",
    ]) {
      expect(hardDelete).toContain(`public.${relation}`);
    }

    expect(hardDelete).toContain(
      "public.get_tournament_deletion_preview(p_tournament_id)"
    );

    for (const builtin of [
      "btrim",
      "split_part",
      "array_agg",
      "set_config",
      "jsonb_build_object",
      "to_jsonb",
    ]) {
      expect(hardDelete).toContain(`pg_catalog.${builtin}`);
      expect(hardDelete.replaceAll(`pg_catalog.${builtin}`, "")).not.toContain(
        `${builtin}(`
      );
    }

    // COALESCE is PostgreSQL syntax rather than a schema-qualified function.
    expect(hardDelete).toContain("coalesce(v_banner_image_url, '')");
    expect(hardDelete).not.toContain("pg_catalog.coalesce");
  });

  it("preserves the exact refusal, locks, deletion order, and cleanup result", () => {
    const tournamentLock = hardDelete.indexOf(
      "from public.tournaments where id = p_tournament_id for update"
    );
    const bracketLock = hardDelete.indexOf(
      "from public.tournament_brackets as bracket where bracket.tournament_id = p_tournament_id order by bracket.id for update"
    );
    const registrationLock = hardDelete.indexOf(
      "from public.registrations as registration where registration.tournament_id = p_tournament_id"
    );
    const refusal = hardDelete.indexOf(
      "message = 'tournament has launched or contains competitive history and cannot be permanently deleted.'"
    );
    const deletionJob = hardDelete.indexOf(
      "insert into public.tournament_deletion_jobs"
    );
    const submissionDelete = hardDelete.indexOf(
      "delete from public.match_result_submissions"
    );
    const generatedDelete = hardDelete.indexOf(
      "delete from public.generated_brackets"
    );
    const registrationDelete = hardDelete.indexOf(
      "delete from public.registrations"
    );
    const bracketDelete = hardDelete.indexOf(
      "delete from public.tournament_brackets"
    );
    const tournamentDelete = hardDelete.indexOf(
      "delete from public.tournaments"
    );

    expect(tournamentLock).toBeGreaterThan(-1);
    expect(bracketLock).toBeGreaterThan(tournamentLock);
    expect(registrationLock).toBeGreaterThan(bracketLock);
    expect(refusal).toBeGreaterThan(registrationLock);
    expect(hardDelete.slice(registrationLock, refusal)).toContain(
      "order by registration.id for update"
    );
    expect(hardDelete).toContain("errcode = 'p0001'");
    expect(deletionJob).toBeGreaterThan(refusal);
    expect(submissionDelete).toBeGreaterThan(deletionJob);
    expect(generatedDelete).toBeGreaterThan(submissionDelete);
    expect(registrationDelete).toBeGreaterThan(generatedDelete);
    expect(bracketDelete).toBeGreaterThan(registrationDelete);
    expect(tournamentDelete).toBeGreaterThan(bracketDelete);

    for (const contract of [
      "submission.replay_storage_path",
      "submission.screenshot_storage_path",
      "report_group.replay_storage_path",
      "'job_id', v_job_id",
      "'tournament_title', v_tournament_title",
      "'proof_paths', pg_catalog.to_jsonb(v_proof_paths)",
      "'banner_paths', pg_catalog.to_jsonb(v_banner_paths)",
      "'deleted_counts', v_counts",
    ]) {
      expect(hardDelete).toContain(contract);
    }
  });

  it("accepts Academy through the existing trusted adjustment core", () => {
    expect(academyAdjustment).toContain(
      "p_season_id uuid, p_player_id uuid, p_bracket_type text, p_points integer"
    );
    expect(academyAdjustment).toContain(
      "returns uuid language plpgsql security definer set search_path = pg_catalog"
    );

    const acceptedTypes = academyAdjustment.match(
      /p_bracket_type not in \(([^)]+)\)/
    )?.[1]
      .split(",")
      .map((value) => value.trim().replaceAll("'", ""))
      .sort();

    expect(acceptedTypes).toEqual([
      "academy",
      "challenge",
      "main",
      "overall",
    ]);
    expect(academyAdjustment).toContain("p_bracket_type, p_points");
    expect(academyAdjustment).toContain("'admin_adjustment'");
    expect(academyAdjustment).toContain("'admin'");
    expect(academyAdjustment).toContain(
      "v_season_run_id := public.recalculate_leaderboard_for_season( p_season_id, p_triggered_by_clerk_user_id )"
    );
    expect(academyAdjustment).toContain(
      "if v_season_run_status is distinct from 'completed'"
    );
  });

  it("preserves the public terminal wrapper and service-role boundary", () => {
    expect(publicAdjustment).toContain(
      "perform public.assert_tournament_not_terminal_nowait(v_tournament_id)"
    );
    expect(publicAdjustment).toContain(
      "return public.add_leaderboard_admin_adjustment_without_terminal_guard("
    );
    expect(publicAdjustment).toContain("set search_path = pg_catalog");
    expect(compactMigration).not.toMatch(
      /create(?: or replace)? function public\.add_leaderboard_admin_adjustment\(/
    );
    expect(compactMigration).toContain(
      "alter function public.add_leaderboard_admin_adjustment_without_terminal_guard( uuid, uuid, text, integer, text, uuid, uuid, uuid, text ) owner to postgres"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.add_leaderboard_admin_adjustment_without_terminal_guard( uuid, uuid, text, integer, text, uuid, uuid, uuid, text ) from public, anon, authenticated, service_role"
    );
    expect(terminalMigration).toContain(
      "grant execute on function public.add_leaderboard_admin_adjustment( uuid, uuid, text, integer, text, uuid, uuid, uuid, text ) to service_role"
    );
  });

  it("keeps Academy in its own ledger/cache and preserves Void adjudication", () => {
    for (const table of [
      "leaderboard_point_events",
      "leaderboard_player_season_stats",
      "leaderboard_player_all_time_stats",
      "leaderboard_season_champions",
    ]) {
      expect(academyConstraintMigration).toContain(
        `alter table public.${table}`
      );
    }
    expect(
      academyConstraintMigration.match(
        /check \(bracket_type in \('academy', 'challenge', 'main', 'overall'\)\)/g
      )
    ).toHaveLength(4);
    expect(terminalMigration).toContain(
      "where event.source = 'admin' and ( event.tournament_id = p_tournament_id"
    );
    expect(terminalMigration).toContain(
      "if public.tournament_has_linked_admin_adjustment(p_tournament_id) then raise exception 'tournament-linked administrator adjustment must be adjudicated before void'"
    );
    expect(compactMigration).not.toMatch(
      /create(?: or replace)? function public\.(recalculate_leaderboard|void_tournament|tournament_has_linked_admin_adjustment)/
    );
  });
});
