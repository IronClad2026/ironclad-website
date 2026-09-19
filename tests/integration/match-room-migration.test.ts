import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationDirectory).filter((name) =>
  name.endsWith("_match_room_phase_one.sql")
);
if (migrationNames.length !== 1) {
  throw new Error("Expected exactly one Match Room phase-one forward migration.");
}
const migrationName = migrationNames[0];
const migration = readFileSync(resolve(migrationDirectory, migrationName), "utf8");
const sql = migration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const databaseTest = readFileSync(
  resolve(process.cwd(), "tests/database/match-room-phase-1.sql"),
  "utf8"
);

describe("Match Room phase 1 release boundary", () => {
  it("ships as an additive transactional forward migration without extra services", () => {
    expect(readdirSync(migrationDirectory).sort().at(-1)).toBe(migrationName);
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/commit;$/i);
    expect(sql).toContain("add column communication_generation bigint not null default 1");
    expect(sql).not.toMatch(/pg_get_functiondef|create extension|create publication|alter publication|realtime\.|storage\.|cron\./i);
    expect(sql).not.toMatch(/update public\.tournament_matches set (?:status|player_one_score|player_two_score|winner_registration_id|deadline_at)\s*=/i);
  });

  it("keeps raw private tables outside role grants and defines safe privileged paths", () => {
    for (const table of ["match_rooms", "match_messages", "match_room_reads"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
    }
    expect(sql).not.toMatch(/create policy|grant (?:all|select|insert|update|delete|truncate)\b/i);
    expect(sql).not.toMatch(/on delete cascade/i);
    const definitions = [...sql.matchAll(/create (?:or replace )?function ([\w.]+)\([^]*?\bas \$\$/gi)];
    expect(definitions.length).toBeGreaterThan(10);
    for (const definition of definitions) {
      expect(definition[0], definition[1]).toMatch(/security definer set search_path = pg_catalog/i);
    }
    expect(sql).toContain("revoke all on function public.admin_reset_tournament_match_without_communication_generation(uuid, text) from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke all on function public.close_ironclad_player_account_without_match_rooms(text) from public, anon, authenticated, service_role;");
  });

  it("ships rollback-only executable role, reset, attribution, and failure-path checks", () => {
    expect(databaseTest).toMatch(/^begin;/m);
    expect(databaseTest).toMatch(/^rollback;/m);
    expect(databaseTest).not.toMatch(/^commit;/m);
    for (const required of [
      "set local role authenticated;",
      "set local role anon;",
      "public.admin_reset_tournament_match(",
      "public.admin_finalize_match_result_report_group(",
      "public.close_ironclad_player_account(",
      "MATCH_ROOM_TEST_MARKER_FAILURE",
      "stale JWT after account closure cannot read",
      "replacement C cannot read original AB transcript",
      "failed marker leaves scores result state rooms and reports unchanged",
    ]) {
      expect(databaseTest).toContain(required);
    }
  });
});
