import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260831131000_badge_reconciliation_targets.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function extractFunction(name: string) {
  const marker = `create function public.${name}(`;
  const start = sql.indexOf(marker);
  const end = sql.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${name} was not found in ${migrationName}.`);
  }

  return sql.slice(start, end + 3);
}

describe("bounded Badge reconciliation migration", () => {
  it("is ordered after the authority repairs", () => {
    const names = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260831130000_badge_authority_forward_repairs.sql")
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
  });

  it("keeps one private, forced-RLS target per player", () => {
    expect(sql).toContain(
      "create table ironclad_private.badge_reconciliation_targets"
    );
    expect(sql).toContain("player_id uuid not null unique");
    expect(sql).toContain(
      "alter table ironclad_private.badge_reconciliation_targets force row level security"
    );
    expect(sql).toContain(
      "revoke all on table ironclad_private.badge_reconciliation_targets from public, anon, authenticated, service_role"
    );
    expect(sql).not.toMatch(
      /grant\s+[^;]+on\s+(?:table\s+)?ironclad_private\.badge_reconciliation_targets/
    );
  });

  it("rejects arbitrary reasons and excludes closed accounts", () => {
    expect(sql).toContain(
      "reason in ( 'profile_write', 'steam_identity', 'relic_snapshot', 'match_finalization', 'match_authority', 'tournament_completion', 'leaderboard_recalculation', 'season_finalization', 'evaluation_failure', 'manual_recovery' )"
    );
    expect(sql).toContain("player.account_closed_at is null");
    expect(sql).toContain("on conflict (player_id) do update");
    expect(sql).toContain("char_length(source_id) between 1 and 160");
  });

  it("exposes enqueue only to the service role", () => {
    expect(sql).toContain(
      "revoke all on function public.enqueue_badge_reconciliation_target( uuid, text, text, text ) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.enqueue_badge_reconciliation_target( uuid, text, text, text ) to service_role"
    );
  });

  it("claims a concurrency-safe bounded batch with a lease", () => {
    const claim = extractFunction("claim_badge_reconciliation_targets");

    expect(claim).toContain("p_limit < 1 or p_limit > 50");
    expect(claim).toContain("for update of target skip locked");
    expect(claim).toContain("limit p_limit");
    expect(claim).toContain("interval '15 minutes'");
    expect(claim).toContain("claim_token = pg_catalog.gen_random_uuid()");
    expect(claim).toContain("attempt_count = target.attempt_count + 1");
    expect(claim).toContain("player.account_closed_at is null");
  });

  it("completes only the exact claimed target and safely retries failures", () => {
    const complete = extractFunction("complete_badge_reconciliation_target");

    expect(complete).toContain("target.target_id = p_target_id");
    expect(complete).toContain("target.claim_token = p_claim_token");
    expect(complete).toContain("target.status = 'claimed'");
    expect(complete).toContain("status = 'completed'");
    expect(complete).toContain("status = 'pending'");
    expect(complete).toContain("least( 1800, greatest(30");
    expect(complete).toContain("return v_updated = 1");
  });

  it("queues current database-owned authorities without rolling them back", () => {
    for (const trigger of [
      "match_participant_authority_queue_badge_reconciliation",
      "leaderboard_point_events_queue_badge_reconciliation",
      "leaderboard_season_stats_queue_badge_reconciliation",
      "leaderboard_champions_queue_badge_reconciliation",
      "tournaments_queue_badge_reconciliation",
    ]) {
      expect(sql).toContain(`create trigger ${trigger}`);
    }

    expect(sql).toContain("when others then raise warning");
    expect(sql).toContain("return new; exception");
    expect(sql).toContain(
      "registration.registration_status = 'approved'"
    );
  });
});
