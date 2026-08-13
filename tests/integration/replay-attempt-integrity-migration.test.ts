import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260814100000_replay_attempt_integrity.sql";
const previousMigrationName =
  "20260813102000_phase7_public_leaderboard_integration.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();

function functionBody(name: string) {
  const start = sql.indexOf(`create function public.${name}(`);
  const end = sql.indexOf("$$;", start);
  if (start < 0 || end < 0) throw new Error(`${name} is missing`);
  return sql.slice(start, end + 3);
}

describe("replay attempt integrity migration", () => {
  it("is the single ordered transactional PR A migration", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).not.toMatch(/create extension|cron\.|schedule\(|create.*job/);
  });

  it("keeps attempt state private and service-mediated", () => {
    expect(sql).toContain("create table public.match_replay_upload_attempts");
    expect(sql).toContain(
      "alter table public.match_replay_upload_attempts enable row level security"
    );
    expect(sql).toContain(
      "alter table public.match_replay_upload_attempts force row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.match_replay_upload_attempts from public, anon, authenticated, service_role"
    );
    expect(sql).not.toMatch(
      /create policy[^;]+on public\.match_replay_upload_attempts/
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[^;]+match_replay_upload_attempts/
    );
  });

  it("binds one active participant attempt to exact opaque paths and sizes", () => {
    expect(sql).toContain(
      "create unique index match_replay_upload_attempts_one_active_idx"
    );
    expect(sql).toContain(
      "where status in ('prepared', 'finalizing', 'cleaning', 'recycling')"
    );
    expect(sql).toContain("cardinality(declared_replay_sizes) = required_replay_count");
    expect(sql).toContain("where replay.size < 1 or replay.size > 10485760");
    expect(sql).toContain("game-' || v_index::text");
    expect(sql).toContain("cardinality(p_paths) <> 5");
  });

  it("atomically serializes preparation and bounds capability namespaces", () => {
    const prepare = functionBody("prepare_match_replay_upload_attempt");
    expect(prepare).toContain("for update");
    expect(prepare).toContain("interval '60 seconds'");
    expect(prepare).toContain("v_noncommitted_count < 3");
    expect(prepare).toContain("interval '2 hours 5 minutes'");
    expect(prepare).toContain("'outcome', 'cleanup_required'");
    expect(prepare).toContain("'outcome', 'recycle_required'");
    expect(prepare).toContain("for v_index in 1..5 loop");
    expect(prepare).toContain("gen_random_uuid()");
    expect(prepare).not.toContain("status = 'prepared', capability_issued_at");
  });

  it("recycles an expired namespace only after an exclusive final sweep", () => {
    const recycle = functionBody("complete_match_replay_attempt_recycling");
    expect(recycle).toContain("status <> 'recycling'");
    expect(recycle).toContain("recycle_claim_id <> p_recycle_claim_id");
    expect(recycle).toContain("recycle_lease_expires_at <= v_now");
    expect(recycle).toContain("replay_storage_paths = v_paths");
    expect(recycle).toContain("capability_issue_count + 1");
    expect(recycle).toContain("interval '2 hours 5 minutes'");
  });

  it("grants one finalization lease before stored-byte work", () => {
    const claim = functionBody("claim_match_replay_attempt_finalization");
    expect(claim).toContain("for update");
    expect(claim).toContain(
      "p_winner_registration_id is distinct from v_attempt.winner_registration_id"
    );
    expect(claim).toContain(
      "p_player_one_score is distinct from v_attempt.player_one_score"
    );
    expect(claim).toContain(
      "p_player_two_score is distinct from v_attempt.player_two_score"
    );
    expect(claim).toContain("final result does not match this replay attempt");
    expect(claim).toContain("status = 'finalizing'");
    expect(claim).toContain("interval '10 minutes'");
    expect(claim).toContain("replay finalization is already in progress");
    expect(claim).toContain("'outcome', 'committed'");
  });

  it("makes cleanup ownership mutually exclusive and committed proof immutable", () => {
    const cleanup = functionBody("claim_match_replay_attempt_cleanup");
    expect(cleanup).toContain("'outcome', 'preserved'");
    expect(cleanup).toContain("replay finalization owns this attempt");
    expect(cleanup).toContain("status = 'cleaning'");
    expect(cleanup).toContain("interval '5 minutes'");
    expect(cleanup).not.toContain("status = 'prepared'");
  });

  it("commits the existing report RPC and attempt state in one transaction", () => {
    const commit = functionBody("commit_match_replay_attempt_result");
    expect(commit).toContain("finalization_claim_id <> p_finalization_claim_id");
    expect(commit).toContain("public.submit_match_series_result_report(");
    expect(commit).toContain("status = 'committed'");
    expect(commit).toContain("committed_result = v_result");
    expect(
      commit.indexOf("v_result := public.submit_match_series_result_report(")
    ).toBeLessThan(
      commit.indexOf(
        "update public.match_replay_upload_attempts as attempt set status = 'committed'"
      )
    );
  });

  it("prevents direct service-role bypass of the attempt commit boundary", () => {
    expect(sql.match(/revoke execute on function public\.submit_match_series_result_report/g)).toHaveLength(
      3
    );
    expect(sql).toContain(
      "grant execute on function public.commit_match_replay_attempt_result"
    );
  });

  it("uses postgres-owned security definers with a pg_catalog search path", () => {
    for (const name of [
      "prepare_match_replay_upload_attempt",
      "claim_match_replay_attempt_finalization",
      "claim_match_replay_attempt_cleanup",
      "complete_match_replay_attempt_cleanup",
      "complete_match_replay_attempt_recycling",
      "commit_match_replay_attempt_result",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = pg_catalog");
      expect(sql).toContain(`alter function public.${name}(`);
    }
  });
});
