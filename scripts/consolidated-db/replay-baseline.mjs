import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { connect,run,scalar } from "./local-client.mjs";
import { root,read,baseline,catalogQuery,expectedFunctions } from "./package.mjs";
import { buildAtomicMigrationSql as p03Sql } from "../p03-db/package.mjs";
import {assertStructure} from './structure.mjs';

const client=await connect();
try {
  assert.equal(await scalar(client,"select to_regclass('public.tournaments') is null;"),true,"Requires empty disposable database");
  const providerMode=process.env.CONSOLIDATED_PROVIDER_MODE??"native-compatibility";
  assert(["native-compatibility","actual-supabase"].includes(providerMode));
  if(providerMode==="native-compatibility") {
    await run(client,read("tests/database/local-supabase-replay-prelude.sql"));
    await run(client,read("tests/consolidated-db/realtime-local-prelude.sql"));
  } else {
    const extensions=(await client.query("select extname,extversion from pg_extension where extname in ('pg_cron','pg_net','supabase_vault','pgcrypto');")).rows;
    assert(extensions.some(e=>e.extname==="pg_cron"),"Actual pg_cron is required");
    assert(extensions.some(e=>e.extname==="pg_net"),"Actual pg_net is required");
    assert(extensions.some(e=>e.extname==="supabase_vault"),"Actual Vault is required");
    const original=read('tests/database/local-supabase-replay-prelude.sql');
    const cutoff=original.indexOf('create or replace function extensions.gen_random_bytes');
    assert(cutoff>0);
    const authStorage=original.slice(0,cutoff).replace('create extension if not exists pgcrypto with schema public;','');
    assert(!/create (?:or replace )?(?:function|table)[\s\S]*?\b(?:net\.http_post|cron\.job|cron\.schedule|vault\.decrypted_secrets)/i.test(authStorage),'No extension stubs in actual provider mode');
    await run(client,authStorage);
    await run(client,read('tests/consolidated-db/realtime-provider-catalog.sql'));
    assert.equal(await scalar(client,"select to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null;"),true,"Actual Realtime schema/signature is required");
  }
  await run(client,"create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);");
  const preP03=JSON.parse(read("docs/p03-production-ledger.json")).migrations;
  const files=readdirSync(path.join(root,"supabase/migrations"));
  for(const migration of preP03) {
    const matching=files.filter(file=>file.startsWith(migration.version+"_"));
    assert.equal(matching.length,1,"Missing/ambiguous deployed Production source");
    let sql=read("supabase/migrations/"+matching[0]);
    if(providerMode==="native-compatibility") sql=sql.replace(/^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,"-- Native only: nonnetworking signatures in local prelude");
    await run(client,sql);
    await client.query("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)",[migration.version,migration.name]);
  }
  await run(client,p03Sql());
  assert.equal(Number(await scalar(client,"select count(*) from supabase_migrations.schema_migrations;")),baseline.ledger.length);
  // Catalog DDL only. Reconcile known source/ledger provenance into the exact
  // observed current Production definitions; no application row is copied.
  const definitions=JSON.parse(read("scripts/consolidated-db/production-function-definitions.json")).functions;
  await run(client,"begin; set local check_function_bodies=off;\n"+definitions.map(f=>f.definition+";").join("\n")+"\ncommit;");
  const functionActual=await scalar(client,catalogQuery);
  assert.deepEqual(functionActual,expectedFunctions,"Schema-only local baseline differs from verified Production function catalog");
  // Read-only captured metadata documents the provider defaults missing from
  // repository source. This is a LOCAL baseline reproduction, never a migration.
  await run(client,read('tests/consolidated-db/production-provider-table-acl.sql'));
  const structure=await assertStructure(client);
  const tables=await scalar(client,"select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p');");
  assert.equal(tables,62,"Current Production application table count");
  assert.equal(await scalar(client,"select count(*)::integer from public.players;"),0,"No Production players imported");
  assert.equal(await scalar(client,"select count(*)::integer from public.registrations;"),0,"No Production registrations imported");
  await client.query("update public.platform_settings set value='{\"enabled\":true}'::jsonb where key in ('elo_verification','match_room');");
  console.log(JSON.stringify({status:"PASS",scope:"empty schema-only Production baseline",providerMode,ledgerRows:153,applicationTables:62,exactApplicationFunctions:320,structure,localCatalogReconciliation:'observed provider Dxtm table ACLs on five old public relations',productionApplicationRowsImported:0}));
} finally { await client.end(); }
