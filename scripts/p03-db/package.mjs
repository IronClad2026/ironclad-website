import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const migrationFiles = Object.freeze([
  "20260923040206_match_room_production_bootstrap.sql",
  "20260919011425_match_room_phase_one.sql",
  "20260919235836_match_room_phase_three.sql",
  "20260920014644_match_room_production_hardening.sql",
  "20260922054205_match_room_unread_summary.sql",
  "20260923040754_match_room_disabled_assistance_gate.sql",
]);
export const LOCK_TIMEOUT_MS = 2000;
export const STATEMENT_TIMEOUT_MS = 60000;
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export const canonicalSql = (value) => value.replaceAll("\r\n", "\n");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function readMigrationPackage(root = repositoryRoot) {
  return migrationFiles.map((file) => {
    const bytes = readFileSync(path.join(root, "supabase", "migrations", file));
    const source = canonicalSql(bytes.toString("utf8"));
    return {
      file, version: file.slice(0, 14), name: file.slice(15, -4), source,
      sha256: sha256(source), rawSha256: sha256(bytes),
    };
  });
}

// This policy is intentionally NOT a general SQL migration parser. Only the
// checksummed six-file package is accepted. The immutable original SQL remains
// in the repository and ledger. Its transaction envelopes become ONE envelope.
export function migrationBody(source) {
  assert.match(source, /^begin;\s/i, "Expected migration BEGIN envelope");
  assert.match(source, /\scommit;\s*$/i, "Expected migration COMMIT envelope");
  let body = source.replace(/^begin;\s*/i, "").replace(/\scommit;\s*$/i, "");
  body = body.replace(/^set local lock_timeout = '10s';$/gm, "set local lock_timeout = '2s';");
  assert(!/^\\/m.test(body), "Migration must not contain psql commands");
  assert(!/^\s*(?:commit|rollback|start transaction)\s*;/im.test(body), "Unexpected transaction control");
  return body;
}

export function verifyPackage(root = repositoryRoot) {
  const actual = readMigrationPackage(root);
  const expected = JSON.parse(readFileSync(path.join(root, "scripts/p03-db/manifest.json"), "utf8"));
  assert.equal(expected.policy, "atomic-p03-v1");
  assert.deepEqual(actual.map(({ file, version, name, sha256 }) => ({ file, version, name, sha256 })), expected.migrations,
    "Migration package checksum or order mismatch");
  return actual;
}

export function buildAtomicMigrationSql({ root = repositoryRoot } = {}) {
  const migrations = verifyPackage(root);
  const baseline = JSON.parse(readFileSync(path.join(root, "docs/p03-production-ledger.json"), "utf8"));
  const expectedLedger = baseline.migrations.map(({ version, name }) => ({ version, name }))
    .sort((a, b) => a.version.localeCompare(b.version));
  const statements = [
    "begin;",
    "set local lock_timeout = '2s';",
    "set local statement_timeout = '60s';",
    "set local idle_in_transaction_session_timeout = '60s';",
    "select pg_advisory_xact_lock(hashtextextended('ironclad:p03-production-package:v1', 0));",
    `do $p03_preflight$
    begin
      if (select jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version)
          from supabase_migrations.schema_migrations) is distinct from ${literal(JSON.stringify(expectedLedger))}::jsonb then
        raise exception 'P03 migration ledger does not match the reviewed Production baseline' using errcode = '55000';
      end if;
    end;
    $p03_preflight$;`,
  ];
  for (const migration of migrations) {
    statements.push(`-- P03 PACKAGE STEP ${migration.file}\n${migrationBody(migration.source)}`);
    statements.push(`insert into supabase_migrations.schema_migrations(version, name, statements)
      values (${literal(migration.version)}, ${literal(migration.name)}, array[${literal(migration.source)}]::text[]);`);
  }
  statements.push(`do $p03_postflight$
    declare v_table text;
    begin
      if public.get_match_room_enabled() is distinct from false
        or (select value from public.platform_settings where key = 'match_room') is distinct from '{"enabled":false}'::jsonb
        or to_regprocedure('public.get_match_room_unread_summary(uuid[])') is null then
        raise exception 'P03 must finish completely installed and disabled' using errcode = '55000';
      end if;
      foreach v_table in array array['match_rooms', 'match_messages', 'match_room_reads',
        'match_room_assistance', 'match_room_notification_episodes'] loop
        if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=v_table and (not c.relrowsecurity or not c.relforcerowsecurity))
          or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
          or has_table_privilege('service_role', 'public.' || v_table, 'INSERT') then
          raise exception 'P03 private table boundary failed: %', v_table using errcode = '55000';
        end if;
      end loop;
      if exists(select 1 from public.match_rooms) or exists(select 1 from public.match_messages)
        or exists(select 1 from public.match_room_reads) or exists(select 1 from public.match_room_assistance)
        or exists(select 1 from public.match_room_notification_episodes) then
        raise exception 'P03 installation must not manufacture historical communication' using errcode = '55000';
      end if;
    end;
    $p03_postflight$;`);
  statements.push("commit;");
  return statements.join("\n\n") + "\n";
}
