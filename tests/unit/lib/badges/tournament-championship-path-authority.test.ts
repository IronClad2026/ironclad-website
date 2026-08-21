import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260821009000_tournament_championship_path_authority.sql"
  ),
  "utf8"
).toLowerCase();

describe("championship path authority contract", () => {
  it("models neutral, disqualifying, and invalidated path outcomes", () => {
    expect(sql).toContain("'automatic_bye'");
    expect(sql).toContain("'opponent_no_show'");
    expect(sql).toContain("'admin_default'");
    expect(sql).toContain("'double_no_show'");
    expect(sql).toContain("'unknown'");
    expect(sql).toContain("outcome_kind");
    expect(sql).toContain("authority_state in ('active', 'invalidated')");
  });

  it("uses stable path position and bracket provenance instead of mutable chronology", () => {
    expect(sql).toContain("path_index integer not null");
    expect(sql).toContain("round_number integer not null");
    expect(sql).toContain("source_generated_bracket_id uuid");
    expect(sql).toContain("source_round_id uuid");
    expect(sql).not.toContain("updated_at");
  });

  it("requires authoritative completion before a path can be complete", () => {
    expect(sql).toContain("new.event_type = 'tournament_win'");
    expect(sql).toContain("tournament.status");
    expect(sql).toContain("v_observed = v_expected");
    expect(sql).toContain("v_is_champion");
    expect(sql).toContain("v_expected_consistent");
    expect(sql).toContain("v_state := 'complete'");
    expect(sql).toContain("'campaignevaluationdeferred', true");
  });

  it("keeps Badge 20 and existing badge authority untouched", () => {
    expect(sql).not.toContain("create function public.evaluate_flawless_campaign");
    expect(sql).not.toContain("insert into public.player_badge_awards");
    expect(sql).not.toContain("reliable-competitor");
    expect(sql).not.toContain("comeback-commander");
  });
});
