import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260817100000_authenticated_match_dice_rolloff.sql";
const previousMigrationName =
  "20260815100000_coh3_map_catalogue_division_pools.sql";
const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationPath = resolve(migrationsDirectory, migrationName);
const migrationExists = existsSync(migrationPath);
const migration = migrationExists
  ? readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
  : "";
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();
const databaseContract = readFileSync(
  resolve(
    process.cwd(),
    "tests/database/feature-b-authenticated-match-dice-rolloff.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function functionBody(name: string) {
  const start = sql.indexOf(`create function public.${name}(`);
  const end = sql.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${name} is missing from the Feature B migration.`);
  }

  return sql.slice(start, end + 3);
}

describe("authenticated match dice roll-off migration", () => {
  it("is one ordered transactional migration after Feature A", () => {
    const names = readdirSync(migrationsDirectory).sort();

    expect(migrationExists).toBe(true);
    expect(names.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql.match(/create table /g)).toHaveLength(1);
    expect(sql).not.toMatch(
      /create extension|create policy|storage\.|cron\.|realtime|publication/
    );
  });

  it("creates one immutable participant-roll table with the natural key", () => {
    expect(sql).toContain("create table public.match_dice_rolls");

    for (const column of [
      "match_id uuid not null",
      "activation_version integer not null",
      "game_number smallint not null",
      "tie_round integer not null",
      "participant_registration_id uuid not null",
      "die_1 smallint not null",
      "die_2 smallint not null",
      "rolled_at timestamptz not null default pg_catalog.clock_timestamp()",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain(
      "primary key ( match_id, activation_version, game_number, tie_round, participant_registration_id )"
    );
    expect(sql).toContain("check (activation_version > 0)");
    expect(sql).toContain("check (game_number in (1, 3, 5))");
    expect(sql).toContain("check (tie_round >= 1)");
    expect(sql).toContain("check (die_1 between 1 and 6)");
    expect(sql).toContain("check (die_2 between 1 and 6)");
    expect(sql).toContain(
      "references public.tournament_matches(id) on delete cascade"
    );
    expect(sql).toContain(
      "references public.registrations(id) on delete restrict"
    );
    expect(sql).not.toMatch(
      /\b(total|winner|is_tie|opponent|clerk_user_id|player_name)\b[^']*(?:smallint|integer|uuid|text|boolean)/
    );
  });

  it("forces RLS and exposes no raw table access", () => {
    expect(sql).toContain(
      "alter table public.match_dice_rolls enable row level security"
    );
    expect(sql).toContain(
      "alter table public.match_dice_rolls force row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.match_dice_rolls from public, anon, authenticated, service_role"
    );
    expect(sql).not.toMatch(/create policy[^;]+match_dice_rolls/);
    expect(sql).not.toMatch(
      /grant (?:select|insert|update|delete|all)[^;]+match_dice_rolls/
    );
  });

  it("exposes exactly one authenticated read RPC and one authenticated roll RPC", () => {
    const publicFunctions = [...sql.matchAll(/create function public\.([a-z0-9_]+)\(/g)]
      .map((match) => match[1]);

    expect(publicFunctions).toEqual([
      "get_match_dice_rolloff",
      "roll_match_dice",
    ]);
    expect(sql).toContain(
      "create function public.get_match_dice_rolloff( p_match_id uuid ) returns jsonb"
    );
    expect(sql).toContain(
      "create function public.roll_match_dice( p_match_id uuid, p_expected_activation_version integer, p_game_number smallint, p_expected_tie_round integer ) returns jsonb"
    );

    for (const signature of [
      "public.get_match_dice_rolloff(uuid)",
      "public.roll_match_dice(uuid, integer, smallint, integer)",
    ]) {
      expect(sql).toContain(`alter function ${signature} owner to postgres`);
      expect(sql).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
      expect(sql).toContain(
        `grant execute on function ${signature} to authenticated`
      );
    }
  });

  it("derives participant/admin read authority without exposing raw identities", () => {
    const read = functionBody("get_match_dice_rolloff");

    expect(read).toContain("auth.jwt() ->> 'sub'");
    expect(read).toContain("coalesce(public.is_admin_jwt(), false)");
    expect(read).toContain("registration.clerk_user_id = v_clerk_user_id");
    expect(read).toContain("v_viewer_slot");
    expect(read).toContain("'viewerrole'");
    expect(read).toContain("'viewerslot'");
    expect(read).toContain("'participants'");
    expect(read).toContain("'activations'");
    expect(read).toContain("'games'");
    expect(read).toContain("'rounds'");
    expect(read).toContain("'rolls'");
    expect(read).toContain("'participantlabel'");
    expect(read).toContain("roll.match_id = p_match_id");
    expect(read).toContain("opponent rolled before reset");
    expect(read).not.toContain("viewer_roll.participant_registration_id");
    expect(read).not.toContain("'registrationid'");
    expect(read).not.toContain("'clerkuserid'");
    expect(read).not.toContain("'clerk_user_id'");
    expect(read).toContain("v_match.series_best_of not in (3, 5)");
  });

  it("fails closed outside a launched actionable single-elimination match", () => {
    const roll = functionBody("roll_match_dice");
    const read = functionBody("get_match_dice_rolloff");

    for (const contract of [
      "v_format is distinct from 'single_elimination'",
      "v_launched_at is null",
      "v_tournament_status is distinct from 'in_progress'",
      "v_match.status is distinct from 'in_progress'",
      "v_match.activation_version < 1",
      "v_match.official_result_submission_id is not null",
      "v_match.winner_registration_id is not null",
      "v_match.outcome_type is not null",
      "v_match.hold_started_at is not null",
      "pg_catalog.clock_timestamp() >= v_match.deadline_at",
    ]) {
      expect(roll).toContain(contract);
    }

    expect(roll).toContain("for update");
    expect(roll).toContain("for share");
    expect(roll.indexOf("registration.clerk_user_id = v_clerk_user_id"))
      .toBeLessThan(roll.indexOf("v_format is distinct from 'single_elimination'"));
    expect(roll).toContain("v_match.activation_version <> p_expected_activation_version");
    expect(roll).not.toContain("public.is_admin_jwt()");
    expect(read).toContain("'unsupported_format'");
    expect(read).toContain("'division_not_launched'");
    expect(read).toContain("'tournament_not_in_progress'");
    expect(read).toContain("'match_not_in_progress'");
    expect(read).toContain("'admin_hold'");
    expect(read).toContain("'deadline_elapsed'");
  });

  it("enforces independent Game 1/3 and exact BO5 Game 5", () => {
    const roll = functionBody("roll_match_dice");

    expect(roll).toContain("p_game_number not in (1, 3, 5)");
    expect(roll).toContain("v_match.series_best_of not in (3, 5)");
    expect(roll).toContain(
      "p_game_number = 5 and v_match.series_best_of <> 5"
    );
    expect(roll).not.toMatch(/player_one_score|player_two_score/);
    expect(roll).not.toMatch(/game_number\s*[<>=]+\s*v_match\.series_best_of/);
  });

  it("serializes idempotent rolls and opens only a completed tie", () => {
    const roll = functionBody("roll_match_dice");

    expect(roll).toContain("p_expected_tie_round < 1");
    expect(roll).toContain("tie_round = p_expected_tie_round");
    expect(roll).toContain("participant_registration_id = v_registration_id");
    expect(roll).toContain("return pg_catalog.jsonb_build_object(");
    expect(roll).toContain("'created', false");
    expect(roll).toContain("v_latest_roll_count = 2");
    expect(roll).toContain("v_latest_total_one = v_latest_total_two");
    expect(roll).toContain("v_required_tie_round := v_latest_tie_round + 1");
    expect(roll).toContain("v_required_tie_round <> p_expected_tie_round");
    expect(roll).toContain("on conflict do nothing");
    expect(roll).toContain("'created', v_created");
    expect(roll).not.toMatch(/update public\.match_dice_rolls/);
    expect(roll).not.toMatch(/delete from public\.match_dice_rolls/);
  });

  it("uses rejection-sampled secure bytes only after authorization", () => {
    const roll = functionBody("roll_match_dice");
    const rngCall = roll.search(
      /(?:extensions|public)\.gen_random_bytes\(1\)/
    );

    expect(rngCall).toBeGreaterThan(-1);
    expect(roll).toContain("pg_catalog.get_byte(");
    expect(roll).toContain("v_random_byte < 252");
    expect(roll).toContain("pg_catalog.mod(v_random_byte, 6) + 1");
    expect(rngCall).toBeGreaterThan(
      roll.indexOf("registration.clerk_user_id = v_clerk_user_id")
    );
    expect(rngCall).toBeGreaterThan(
      roll.indexOf("v_required_tie_round <> p_expected_tie_round")
    );
    expect(roll).not.toContain("random()");
  });

  it("returns slot-based immutable facts and does not touch established systems", () => {
    const roll = functionBody("roll_match_dice");

    for (const key of [
      "'snapshot'",
      "'roll'",
      "'activationversion'",
      "'gamenumber'",
      "'tieround'",
      "'participantslot'",
      "'die1'",
      "'die2'",
      "'total'",
      "'rolledat'",
      "'created'",
    ]) {
      expect(roll).toContain(key);
    }

    expect(sql).not.toMatch(
      /(?:insert into|update|delete from) public\.(?:match_result_submissions|match_result_report_groups|tournament_standings|leaderboard_point_events|notifications|coh3_maps|tournament_bracket_map_pool_entries)/
    );
    expect(sql).not.toContain("match-proofs");
    expect(sql).not.toContain("replay_storage_path");
    expect(sql).not.toContain("apply_official_match_result");
    expect(sql).not.toContain("recalculate_leaderboard");
    expect(sql).not.toContain("round_robin_reset");
  });

  it("ships one rollback-only executable database contract", () => {
    expect(databaseContract).toContain("\\set on_error_stop on");
    expect(databaseContract).toContain(
      "begin isolation level repeatable read;"
    );
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).not.toContain("commit;");
    expect(databaseContract).toContain("session_replication_role");
    expect(databaseContract).toContain("feature-b-outsider");
    expect(databaseContract).toContain("feature-b-admin");
    expect(databaseContract).toContain("'unsupported_format'");
    expect(databaseContract).toContain("'cancelled'");
    expect(databaseContract).toContain("'voided'");
    expect(databaseContract).toContain("fixture residue remains");
  });
});
