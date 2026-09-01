import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260831132000_match_game_winner_authority.sql";
const previousMigrationName = "20260831131000_badge_reconciliation_targets.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function functionBody(schema: string, name: string, occurrence = 0) {
  const markers = [
    `create function ${schema}.${name}(`,
    `create or replace function ${schema}.${name}(`,
  ];
  let start = -1;
  let from = 0;

  for (let index = 0; index <= occurrence; index += 1) {
    start = Math.min(
      ...markers
        .map((marker) => sql.indexOf(marker, from))
        .filter((position) => position >= 0)
    );
    if (!Number.isFinite(start)) {
      throw new Error(`${schema}.${name} occurrence ${occurrence} is missing`);
    }
    from = start + 1;
  }

  const end = sql.indexOf("$$;", start);
  if (end < 0) throw new Error(`${schema}.${name} is incomplete`);
  return sql.slice(start, end + 3);
}

describe("per-game winner authority migration", () => {
  it("is the next forward-only transactional migration", () => {
    const names = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
  });

  it("stores a bounded ordered winner sequence on the private attempt", () => {
    expect(sql).toContain(
      "add column game_winner_registration_ids uuid[] not null"
    );
    expect(sql).toContain(
      "cardinality(game_winner_registration_ids) = required_replay_count"
    );
  });

  it("validates participant, score, order, and clinching semantics", () => {
    const validate = functionBody(
      "ironclad_private",
      "validate_match_game_winner_sequence"
    );

    expect(validate).toContain("select one winner for every played game");
    expect(validate).toContain("every game winner must be a match participant");
    expect(validate).toContain("game winners do not match the final score");
    expect(validate).toContain(
      "a played game cannot follow the series-clinching game"
    );
    expect(validate).toContain("security definer");
    expect(validate).toContain("set search_path = pg_catalog");
  });

  it("keeps preparation service-only and links one winner to each replay", () => {
    const prepare = functionBody(
      "public",
      "prepare_match_replay_upload_attempt",
      1
    );
    const submit = functionBody("public", "submit_match_series_result_report");

    expect(prepare).toContain(
      "game_winner_registration_ids = p_game_winner_registration_ids"
    );
    expect(submit).toContain("with ordinality");
    expect(submit).toContain(
      "set claimed_winner_registration_id = game_winner.winner_registration_id"
    );
    expect(submit).toContain(
      "per-game winner authority could not be linked completely"
    );
    expect(sql).toContain(
      "grant execute on function public.prepare_match_replay_upload_attempt( uuid, text, uuid, integer, integer, integer[], uuid[] ) to service_role"
    );
    expect(sql).not.toContain(
      "grant execute on function public.submit_match_series_result_report( uuid, text, uuid, integer, integer, text[], text[], uuid[], text )"
    );
  });

  it("preserves only in-flight legacy attempts at the commit boundary", () => {
    const commit = functionBody(
      "public",
      "commit_match_replay_attempt_result"
    );

    expect(commit).toContain(
      "if cardinality(v_attempt.game_winner_registration_ids) = 0 then"
    );
    expect(commit).toContain(
      "if least(v_attempt.player_one_score, v_attempt.player_two_score) > 0 then"
    );
    expect(commit).toContain(
      "resubmit this non-shutout result"
    );
    expect(commit).toContain("v_attempt.game_winner_registration_ids");
    expect(commit).toContain("status = 'committed'");
  });

  it("clears stale winner sequences across old-client preparation", () => {
    const clear = functionBody(
      "ironclad_private",
      "clear_stale_match_game_winner_sequence"
    );

    expect(sql).toContain(
      "rename to prepare_match_replay_upload_attempt_pre_game_winner_capture"
    );
    expect(clear).toContain(
      "new.game_winner_registration_ids := array[]::uuid[]"
    );
    expect(sql).toContain(
      "create trigger match_replay_upload_attempts_clear_stale_game_winners"
    );
    expect(sql).toContain(
      "game_winner_registration_ids = array[]::uuid[]"
    );
  });

  it("requires aggregate zero-loss scores as well as game authority", () => {
    const flawless = functionBody(
      "public",
      "get_player_badge_flawless_campaign_summary"
    );

    expect(flawless).toContain("summary.played_segment_count > 0");
    expect(flawless).toContain("path.outcome_kind = 'played'");
    expect(flawless).toContain(
      "source_match.winner_registration_id is distinct from summary.registration_id"
    );
    expect(flawless).toContain(
      "source_match.player_one_registration_id is null"
    );
    expect(flawless).toContain(
      "player_one_registration.tournament_id = summary.tournament_id"
    );
    expect(flawless).toContain("then source_match.player_two_score <> 0");
    expect(flawless).toContain("then source_match.player_one_score <> 0");
  });
});
