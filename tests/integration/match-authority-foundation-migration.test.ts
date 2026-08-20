import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820160000_match_authority_foundation.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("match authority foundation migration", () => {
  it("is additive and ordered after the badge foundation", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf("20260820150000_badge_bracket_progression_authority.sql")
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).toContain(
      "create table public.match_participant_outcome_authority"
    );
    expect(compactMigration).toContain(
      "create table public.match_game_result_authority"
    );
    expect(compactMigration).not.toContain("alter table public.tournament_matches");
  });

  it("stores revisioned participant terminal outcomes without a cascading match foreign key", () => {
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
      expect(compactMigration).toContain(`'${outcome}'`);
    }
    expect(compactMigration).toContain(
      "unique (match_id, registration_id, revision)"
    );
    expect(compactMigration).toContain("supersedes_id uuid");
    expect(compactMigration).not.toContain(
      "match_id uuid not null references public.tournament_matches"
    );
  });

  it("stores finalized games separately from submitted claims", () => {
    expect(compactMigration).toContain("game_number integer not null");
    expect(compactMigration).toContain("winner_registration_id uuid");
    expect(compactMigration).toContain("authority_state text not null default 'active'");
    expect(compactMigration).toContain("series_best_of integer not null");
    expect(compactMigration).toContain("game_authority_complete boolean not null default false");
    expect(compactMigration).toContain(
      "unique (match_id, game_number, revision)"
    );
    expect(compactMigration).toContain("submission.status = 'approved'");
    expect(compactMigration).toContain("submission.report_group_id = v_report_group_source_id");
    expect(compactMigration).toContain("v_game_authority_complete");
    expect(compactMigration).toContain(
      "count(distinct submission.claimed_winner_registration_id) > 1"
    );
    expect(compactMigration).not.toContain("where submission.status = 'pending'");
  });

  it("records corrections, resets, voids, and derived outcomes through database triggers", () => {
    for (const marker of [
      "tournament_matches_record_authority",
      "tournaments_record_authority_void",
      "'match_reset'",
      "'tournament_void'",
      "'automatic_bye'",
      "'deadline_double_forfeit'",
      "'invalidated'",
      "pg_advisory_xact_lock",
    ]) {
      expect(compactMigration).toContain(marker);
    }
    expect(compactMigration).toContain(
      "create trigger tournament_matches_record_authority"
    );
  });

  it("hardens table and function permissions against browser writes", () => {
    expect(compactMigration).toContain(
      "alter table public.match_participant_outcome_authority force row level security"
    );
    expect(compactMigration).toContain(
      "alter table public.match_game_result_authority force row level security"
    );
    expect(compactMigration).toContain(
      "revoke all on table public.match_participant_outcome_authority from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "revoke all on table public.match_game_result_authority from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain("set search_path = pg_catalog");
    expect(compactMigration).not.toContain("grant insert on table public.match_participant_outcome_authority to authenticated");
    expect(compactMigration).not.toContain("grant update on table public.match_game_result_authority to authenticated");
    expect(compactMigration).not.toContain("grant delete on table public.match_game_result_authority to authenticated");
  });

  it("does not introduce authority evaluators or awards for the remaining badges", () => {
    expect(compactMigration).not.toContain("player_badge_awards");
    expect(compactMigration).not.toContain("reliable-competitor");
    expect(compactMigration).not.toContain("comeback-commander");
    expect(compactMigration).not.toContain("flawless-campaign");
  });

  it("keeps ambiguous and legacy result provenance unknown", () => {
    expect(compactMigration).toContain("v_outcome_kind := 'unknown'");
    expect(compactMigration).toContain("v_proven_played := v_game_authority_complete");
    expect(compactMigration).toContain("report_group.result_type = 'normal'");
    expect(compactMigration).toContain("report_group.finalized_at is not null");
    expect(compactMigration).toContain("report_group_source_id");
  });

  it("returns only latest active game authority", () => {
    expect(compactMigration).toContain(
      "where authority.authority_state = 'active'"
    );
    expect(compactMigration).toContain("order by authority.game_number");
  });

  it("deduplicates one approved source per game after authoritative resolution", () => {
    expect(compactMigration).toContain(
      "select distinct on (submission.game_number)"
    );
    expect(compactMigration).toContain(
      "order by submission.game_number, submission.id"
    );
  });
});
