import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const migrationFiles = Object.freeze([
  "20261001032942_production_showcase_authority.sql",
  "20261001032957_production_combat_highlights_authority.sql",
  "20261001032959_production_private_match_room_realtime.sql",
  "20261001033000_production_versioned_competition_authority.sql",
  "20261001033001_production_versioned_accounting_badges.sql",
]);
export const read = (name) => readFileSync(path.join(root, name), "utf8");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export const baseline = JSON.parse(read("scripts/consolidated-db/production-schema-baseline.json"));
export const functionKey = ({ schema, name, args }) => `${schema}.${name}(${args})`;
export const expectedFunctions = Object.fromEntries(baseline.functions.map((f) => [functionKey(f), f.normalized_md5]));
export const catalogQuery = `select coalesce(jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',md5(replace(pg_get_functiondef(p.oid),chr(13),''))),'{}'::jsonb) as value
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','ironclad_private')
and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');`;

export function readPackage() {
  return migrationFiles.map((file) => {
    const source = read("supabase/migrations/" + file).replaceAll("\r", "");
    assert.match(source, /^-- Production forward reconciliation/);
    assert.match(source, /\nbegin;\s/i);
    assert.match(source, /\ncommit;\s*$/i);
    assert(!/zzbnneprhjicmajpjkdg|create_staging_legacy_transition|resolve_staging_synthetic|Test(?:Academy|Challenge|Main|Pro)/.test(source), "Forward migration contains a Staging authority/resource");
    return { file, version: file.slice(0, 14), name: file.slice(15, -4), source, sha256: sha256(source) };
  });
}

export function verifyPackage() {
  const actual = readPackage();
  const expected = JSON.parse(read("scripts/consolidated-db/manifest.json"));
  assert.equal(expected.policy, "atomic-consolidated-production-v1");
  assert.deepEqual(actual.map(({file,version,name,sha256}) => ({file,version,name,sha256})),expected.migrations,"Reviewed forward package changed");
  return actual;
}

export function body(source) {
  const value = source.replace(/^[\s\S]*?\nbegin;\s*/i, "").replace(/\ncommit;\s*$/i, "");
  assert(!/^\\/m.test(value), "No psql commands in the Production package");
  assert(!/^\s*(?:commit|rollback|start transaction)\s*;/im.test(value), "Unexpected inner transaction");
  return value;
}

// Pure SQL construction only. This module never connects to any environment.
// Live execution is exclusively the separately authorized release executor's job.
export function buildAtomicMigrationSql({ injectFailure = false } = {}) {
  const migrations = verifyPackage();
  const expectedLedger = baseline.ledger.map(({version,name})=>({version,name}));
  const sql = ["begin;", "set local lock_timeout='5s';", "set local statement_timeout='120s';",
    "set local idle_in_transaction_session_timeout='120s';",
    "select pg_advisory_xact_lock(hashtextextended('ironclad:consolidated-production:v1',0));",
    `do $baseline$ begin
      if (select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)
        is distinct from ${literal(JSON.stringify(expectedLedger))}::jsonb then raise exception 'Production ledger changed; STOP and review' using errcode='55000'; end if;
      if (${catalogQuery.replace(/;\s*$/, "")}) is distinct from ${literal(JSON.stringify(expectedFunctions))}::jsonb then
        raise exception 'Production function catalog changed; STOP and review' using errcode='55000'; end if;
    end; $baseline$;`];
  for (const migration of migrations) {
    sql.push(`-- Forward package step: ${migration.file}\n${body(migration.source)}`);
    sql.push(`insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(migration.version)},${literal(migration.name)},array[${literal(migration.source)}]::text[]);`);
  }
  sql.push(`do $postflight$ begin
    if (select value from public.platform_settings where key='player_showcase') is distinct from '{"enabled":false}'::jsonb
      or (select value from public.platform_settings where key='player_combat_highlights') is distinct from '{"enabled":false}'::jsonb then
      raise exception 'Optional features must finish disabled'; end if;
    if exists(select 1 from public.player_showcases) or exists(select 1 from public.player_combat_highlight_slots)
      or exists(select 1 from ironclad_private.player_combat_highlight_uploads) or exists(select 1 from ironclad_private.player_combat_highlight_reports) then
      raise exception 'Installation must not manufacture media/showcase data'; end if;
    if exists(select 1 from public.tournaments where division_model_version<>'legacy_three_v1')
      or exists(select 1 from public.leaderboard_seasons where official_bracket_type<>'main') then
      raise exception 'Existing competition metadata was reinterpreted'; end if;
  end; $postflight$;`);
  if (injectFailure) sql.push("do $failure$ begin raise exception 'LOCAL_REHEARSAL_INJECTED_FAILURE'; end; $failure$;");
  sql.push("commit;");
  return sql.join("\n\n")+"\n";
}

export function retryState(rows) {
  const migrations = verifyPackage();
  const current = rows.filter((row)=>migrations.some((m)=>m.version===row.version));
  if (current.length===0) return "unapplied";
  assert.equal(current.length,migrations.length,"Partial migration ledger: STOP and recover; do not resume guessed SQL");
  for (const migration of migrations) {
    const row = current.find((r)=>r.version===migration.version);
    assert.equal(row.name,migration.name,"Version/name mismatch");
    assert.deepEqual(row.statements,[migration.source],"Applied SQL checksum mismatch");
  }
  return "already-applied";
}
