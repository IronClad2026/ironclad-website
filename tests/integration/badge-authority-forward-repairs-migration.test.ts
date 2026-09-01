import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260831130000_badge_authority_forward_repairs.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function extractFunction(name: string) {
  const startMarkers = [
    `create or replace function public.${name}(`,
    `create function public.${name}(`,
  ];
  const start = Math.max(...startMarkers.map((marker) => sql.indexOf(marker)));
  const end = sql.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${name} was not found in ${migrationName}.`);
  }

  return sql.slice(start, end + 3);
}

describe("Badge authority forward repairs migration", () => {
  it("is forward-only and follows the immutable applied history", () => {
    const names = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260831090000_service_role_badge_e2e_season_read.sql")
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
  });

  it("uses terminal_at for both tournament terminal authority paths", () => {
    const matchVoid = extractFunction("record_tournament_void_authority");
    const championshipVoid = extractFunction(
      "record_tournament_championship_path_void"
    );

    for (const functionSql of [matchVoid, championshipVoid]) {
      expect(functionSql).toContain(
        "coalesce(new.terminal_at, clock_timestamp())"
      );
      expect(functionSql).not.toContain("new.voided_at");
    }
  });

  it("derives reset-then-void revisions from the true latest game row", () => {
    const matchVoid = extractFunction("record_tournament_void_authority");
    const latestSelection = matchVoid.slice(
      matchVoid.indexOf("select authority.* into v_latest_game")
    );

    expect(matchVoid).toContain("pg_advisory_xact_lock");
    expect(matchVoid).toContain(
      "select distinct on (authority.match_id, authority.game_number) authority.match_id, authority.game_number"
    );
    expect(latestSelection).toContain(
      "order by authority.revision desc, authority.id desc limit 1"
    );
    expect(latestSelection).not.toMatch(
      /where[^;]*authority_state\s*=\s*'active'[^;]*order by authority\.revision/
    );
    expect(matchVoid).toContain(
      "v_latest_game.authority_state = 'active'"
    );
    expect(matchVoid).toContain("v_latest_game.revision + 1");
    expect(matchVoid).toContain("v_latest_game.id, 'invalidated'");
  });

  it("records automatic byes for the validated winner in either slot", () => {
    const corrections = extractFunction(
      "record_badge_match_authority_corrections"
    );

    expect(corrections).toContain("new.outcome_type = 'automatic_bye'");
    expect(corrections).toContain(
      "new.winner_registration_id in ( new.player_one_registration_id, new.player_two_registration_id )"
    );
    expect(corrections).toContain(
      "num_nonnulls( new.player_one_registration_id, new.player_two_registration_id ) = 1"
    );
    expect(corrections).toContain(
      "new.id, v_tournament_id, new.winner_registration_id, 'automatic_bye'"
    );
  });

  it("normalizes canonical scored direct-admin official results as played", () => {
    const corrections = extractFunction(
      "record_badge_match_authority_corrections"
    );

    expect(corrections).toContain("new.status = 'completed'");
    expect(corrections).toContain("new.player_one_score is not null");
    expect(corrections).toContain("new.player_two_score is not null");
    expect(corrections).toContain(
      "public.is_tournament_match_played_for_leaderboard(new.id)"
    );
    expect(corrections).toContain(
      "foreach v_registration_id in array array[ new.player_one_registration_id, new.player_two_registration_id ]"
    );
    expect(corrections).toContain("v_registration_id, 'played'");
  });

  it("resets Reliable Competitor on player and double no-shows", () => {
    const reliable = extractFunction(
      "get_player_badge_reliable_competitor_summary"
    );

    expect(reliable).toContain(
      "when next_authority.outcome_kind in ('player_no_show', 'double_no_show') then 0"
    );
    expect(reliable).toContain(
      "when next_authority.outcome_kind in ('played', 'opponent_no_show') then history.run_length + 1"
    );
    expect(reliable).not.toMatch(
      /next_authority\.outcome_kind\s*=\s*'automatic_bye'\s+then\s+history\.run_length\s*\+\s*1/
    );
  });

  it("requires at least one genuinely played series for Flawless Campaign", () => {
    const flawless = extractFunction(
      "get_player_badge_flawless_campaign_summary"
    );

    expect(sql).toContain(
      "rename to get_player_badge_flawless_campaign_summary_pre_played_requirement"
    );
    expect(flawless).toContain("where summary.played_segment_count > 0");
    expect(flawless).toContain("security definer");
    expect(sql).toContain(
      "grant execute on function public.get_player_badge_flawless_campaign_summary(uuid) to service_role"
    );
  });

  it("removes the historical E2E-only season table grant", () => {
    expect(sql).toContain(
      "revoke select on table public.leaderboard_tournament_season_memberships from service_role"
    );
  });
});
