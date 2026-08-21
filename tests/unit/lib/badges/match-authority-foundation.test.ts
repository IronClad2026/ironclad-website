import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260821006000_match_authority_foundation.sql"
  ),
  "utf8"
).toLowerCase();

describe("match authority foundation contract", () => {
  it("keeps submitted claims separate from finalized game authority", () => {
    expect(sql).toContain("authority_state text not null default 'active'");
    expect(sql).toContain("from public.match_result_submissions as submission");
    expect(sql).toContain("submission.status = 'approved'");
    expect(sql).toContain("submission.report_group_id = v_report_group_source_id");
    expect(sql).toContain("game_authority_complete boolean not null default false");
    expect(sql).not.toContain("submission.status = 'pending'");
  });

  it("uses revision supersession instead of destructive history replacement", () => {
    expect(sql).toContain("supersedes_id");
    expect(sql).toContain("revision + 1");
    expect(sql).toContain("authority_state = 'invalidated'");
    expect(sql).toContain("outcome_kind text not null");
    expect(sql).toContain("'player_no_show'");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("keeps match provenance independent from cascading generated brackets", () => {
    expect(sql).toContain("match_id uuid not null,");
    expect(sql).toContain(
      "references public.tournaments(id) on delete restrict"
    );
    expect(sql).not.toContain("references public.tournament_matches(id)");
  });
});
