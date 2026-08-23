import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previousMigrationName =
  "20260823110000_match_result_conflict_transport.sql";
const migrationName =
  "20260823120000_private_by_default_player_profiles.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
).replace(/\r\n?/g, "\n");
const normalized = migration.toLowerCase().replace(/\s+/g, " ").trim();

function expectOrdered(markers: string[]) {
  let previous = -1;

  for (const marker of markers) {
    const index = normalized.indexOf(
      marker.toLowerCase().replace(/\s+/g, " ").trim(),
      previous + 1
    );

    expect(index, `Missing ordered marker: ${marker}`).toBeGreaterThan(
      previous
    );
    previous = index;
  }
}

describe("private-by-default Player profiles migration", () => {
  it("is one forward-only migration after the frozen ledger", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBe(
      migrationNames.indexOf(previousMigrationName) + 1
    );
    expect(normalized.match(/\bbegin;/g)).toHaveLength(1);
    expect(normalized.match(/\bcommit;/g)).toHaveLength(1);
    expect(normalized).not.toMatch(
      /\b(drop|truncate|delete|create table|create function|create policy|grant|revoke)\b/
    );
  });

  it("fails closed on schema drift before changing the default or rows", () => {
    expectOrdered([
      "to_regclass('public.players') is null",
      "lock table public.players in access exclusive mode",
      "from pg_catalog.pg_attribute as attribute",
      "attribute.attname = 'public_profile_enabled'",
      "pg_catalog.format_type(v_type_oid, null) <> 'boolean'",
      "if not v_not_null then",
      "v_default_expression not in ('false', 'true')",
      "if v_default_expression = 'true' then",
      "v_profile_count <> 2 or v_public_count <> 2",
      "update public.players",
      "alter table public.players",
    ]);

    expect(normalized).toContain("errcode = '42p01'");
    expect(normalized).toContain("errcode = '42703'");
    expect(normalized).toContain("errcode = '42804'");
    expect(normalized).toContain("errcode = '23502'");
  });

  it("sets the private default and remediates only the adjudicated bad-default rows", () => {
    expect(normalized).toContain(
      "alter table public.players alter column public_profile_enabled set default false"
    );
    expect(normalized).toContain(
      "update public.players set public_profile_enabled = false where public_profile_enabled is true"
    );
    expectOrdered([
      "if v_default_expression = 'true' then",
      "v_profile_count <> 2 or v_public_count <> 2",
      "update public.players",
      "alter table public.players",
    ]);
    expect(normalized.match(/update public\.players/g)).toHaveLength(1);
    expect(normalized).toMatch(
      /if v_default_expression = 'true' then .*?if v_profile_count <> 2 or v_public_count <> 2 then .*?raise exception using .*?end if; .*?update public\.players set public_profile_enabled = false where public_profile_enabled is true; .*?if exists \( select 1 from public\.players as player where player\.public_profile_enabled is true \) then .*?raise exception using .*?end if; end if;/
    );
    expect(normalized).not.toMatch(
      /where\s+(?:player\.)?(?:id|clerk_user_id|updated_at|avatar_url|profile_completed)/
    );
    expect(normalized).not.toContain("discord_public_enabled = false");
  });

  it("verifies the default and remediation before committing", () => {
    expectOrdered([
      "update public.players",
      "alter column public_profile_enabled",
      "pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)",
      "v_default_expression is distinct from 'false'",
      "commit;",
    ]);

    expect(normalized).toContain("errcode = '55000'");
    expect(normalized).toContain("set local lock_timeout = '10s'");
    expect(normalized).toContain("set local statement_timeout = '60s'");
  });
});
