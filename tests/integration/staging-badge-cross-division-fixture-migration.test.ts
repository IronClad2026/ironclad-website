import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260831133000_staging_badge_cross_division_acceptance.sql";
const previousMigrationName = "20260831132000_match_game_winner_authority.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function functionBody(schema: string, name: string) {
  const markers = [
    `create function ${schema}.${name}(`,
    `create or replace function ${schema}.${name}(`,
  ];
  const starts = markers
    .map((marker) => sql.indexOf(marker))
    .filter((position) => position >= 0);
  const start = Math.min(...starts);
  const end = sql.indexOf("$$;", start);
  if (!Number.isFinite(start) || end < 0) {
    throw new Error(`${schema}.${name} is missing`);
  }
  return sql.slice(start, end + 3);
}

describe("Staging Badge cross-division acceptance fixture", () => {
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

  it("keeps exact provenance private behind forced RLS", () => {
    expect(sql).toContain(
      "create table ironclad_private.staging_badge_cross_division_enrolments"
    );
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain(
      "revoke all on table ironclad_private.staging_badge_cross_division_enrolments from public, anon, authenticated, service_role"
    );
    expect(sql).toContain("unique (player_id, synthetic_division)");
  });

  it("has only the fixed Challenge and Main snapshots", () => {
    const definition = functionBody(
      "ironclad_private",
      "staging_badge_cross_division_definition"
    );
    expect(definition).toContain("('challenge'::text, 1100, 'challenge'::text)");
    expect(definition).toContain("('main'::text, 1400, 'main / pro'::text)");
    expect(definition).not.toContain("academy'::text, 700");
  });

  it("hard-codes TestAcademy1 and never accepts identity or ELO input", () => {
    const enrol = functionBody(
      "public",
      "enrol_staging_badge_cross_division_acceptance"
    );
    expect(enrol).toContain("fixture.approved_alias = 'testacademy1'");
    expect(enrol).toContain("fixture.synthetic_elo = 700");
    expect(enrol).toContain("fixture.synthetic_division = 'academy'");
    expect(enrol).toContain(
      "ironclad_private.assert_staging_synthetic_uat_access"
    );
    expect(enrol).not.toMatch(/p_(alias|player|elo|division|scenario)/);
  });

  it("creates only a pending manual-review registration and evidence", () => {
    const enrol = functionBody(
      "public",
      "enrol_staging_badge_cross_division_acceptance"
    );
    expect(enrol).toContain("'pending', 'manual_review'");
    expect(enrol).toContain("'staging_synthetic_uat'");
    expect(enrol).toContain("'staging-synthetic-v1'");
    expect(enrol).toContain("v_player.steam_id64 is not null");
    expect(enrol).toContain("v_player.relic_verified_elo is not null");
    expect(enrol).not.toMatch(
      /insert into public\.(player_badge_awards|notifications|match_game_result_authority|match_participant_outcome_authority|tournament_championship_path_authority)/
    );
  });

  it("is service-only and reuses exact Staging and Vault gates", () => {
    expect(sql).toContain(
      "revoke all on function public.enrol_staging_badge_cross_division_acceptance(text, uuid, uuid) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.enrol_staging_badge_cross_division_acceptance(text, uuid, uuid) to service_role"
    );
    expect(sql).not.toContain("nsyjtqpvyxlzyujlbzos");
  });
});
