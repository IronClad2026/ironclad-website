import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { localClient, localPsqlArgument } from "../p03-db/local-pg.mjs";
import { buildAtomicMigrationSql as p03Sql } from "../p03-db/package.mjs";
import { buildAtomicMigrationSql as consolidatedSql, catalogQuery as reviewedProductionFunctions, expectedFunctions } from "../consolidated-db/package.mjs";
import { buildPostDeploymentSql } from "../consolidated-db/post-deployment.mjs";
import { buildProductionLegalSql } from "../consolidated-legal/publication.mjs";
import { checkRecoveryBuild, recoveryMediaFixture } from "./recovery-smoke.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8").replaceAll("\r\n", "\n");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 5_000_000 });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const manifest = JSON.parse(read("docs/combined-release-migrations.json"));
const production = manifest.production.ref;
const staging = manifest.staging.ref;
const patch2 = manifest.frozenPatch2Source;
const before = manifest.productionBaseline.map((step) => ({ name: step.file.split("/").at(-1),
  path: step.file, receipt: step.receipt, expected: step.sha256, localForward: step.file.startsWith("docs/") }));
const postProduction = manifest.upgrade.map((step) => ({ name: step.file.split("/").at(-1),
  path: step.file, expected: step.sha256, receipt: step.stageReceipt, localForward: true }));
assert.equal(before.length, 165);
assert.equal(postProduction.length, 25);
const mediaMigration = "20261127052305_caster_tournament_media.sql";
assert.equal(postProduction.at(-1)?.name, mediaMigration);
assert(postProduction.every((step) => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(step.path)));
assert(!postProduction.some((step) => /ready_ai_budget|gaming_profile_publication|match_chat_translation/.test(step.name)));
const port = Number(process.env.P03_PG_PORT ?? "56624");
assert.equal(port, 56624, "Use a new disposable loopback-only rehearsal cluster on port 56624");
const database = "p03_combined_upgrade_"+Date.now();
const client = localClient(localPsqlArgument(),{database,port});
assert.equal(await client.run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port}`,{db:"postgres"}), "t");
assert.equal(await client.run("select count(*) from pg_catalog.pg_roles where rolname='authenticator'",{db:"postgres"}),"0","Start a fresh disposable cluster to avoid cluster-level role settings");
const run=(sql)=>client.run("set client_encoding='UTF8';\n"+sql);
const out={ production, staging, patch2, database, predecessor:before.length, catalog:null, steps:[], checks:[] };
const file=new URL("test-results/combined-production-equivalent-result.json",root);
const checkpoint=()=>{mkdirSync(new URL("test-results/",root),{recursive:true});writeFileSync(file,JSON.stringify(out,null,2)+"\n");};
const sql = ({path,expected,localForward}) => {
  const body = (localForward ? read(path) : git("show",`${production}:${path}`)).replaceAll("\r\n", "\n");
  assert.equal(hash(body),expected,`Pinned bytes ${path}`);
  return body;
};
const offline = (raw) => raw.replace(/^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,"-- Disposable non-networking extension shim supplied by the prelude.");
const releaseFile = read;
const literal=(value)=>"'"+value.replaceAll("'","''")+"'";
const catalogQuery = `select jsonb_build_object(
  'qualified_view_digest', encode(sha256(convert_to(pg_get_viewdef('ironclad_private.leaderboard_qualified_season_events'::regclass),'UTF8')),'hex'),
  'finalize_digest', encode(sha256(convert_to(pg_get_functiondef('public.finalize_leaderboard_main_season_if_ready(uuid)'::regprocedure),'UTF8')),'hex'),
  'path_digest', encode(sha256(convert_to(pg_get_functiondef('public.record_tournament_championship_path_authority()'::regprocedure),'UTF8')),'hex'),
  'public_standings', encode(sha256(convert_to(pg_get_viewdef('public.leaderboard_public_season_standings'::regclass),'UTF8')),'hex'),
  'notice', to_regprocedure('public.get_public_gaming_profile_notice_state(text)') is not null,
  'staff', to_regprocedure('public.get_patch2_admin_account_state(text)') is not null,
  'closure', to_regprocedure('ironclad_private.patch2_account_state(text)') is not null,
  'ready', to_regclass('ironclad_private.ready_usage_consent') is not null,
  'caster', to_regclass('ironclad_private.caster_applications') is not null)`;
const legacyMatchStaffGrant = "select has_function_privilege('authenticated','public.send_admin_match_room_message(uuid,uuid,uuid,text)','execute')";
const casterRecoverySnapshot = () => Promise.all([
  ...[
    "caster_phase1_invitations", "caster_applications", "caster_memberships", "caster_profiles", "caster_profile_revisions",
    "caster_assignments", "caster_assignment_events", "caster_application_events", "caster_media_links", "caster_media_events",
  ].map((table) => ({ table, source:`ironclad_private.${table}` })),
  { table:"caster_managed_tournament_media", source:"(select * from public.tournament_media where caster_managed)" },
].map(async ({ table, source }) => JSON.parse(await run(`select jsonb_build_object('table','${table}','rows',count(*),
  'digest', encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(item) order by to_jsonb(item)::text),'[]'::jsonb)::text,'UTF8')),'hex'))
  from ${source} item`))));
const service = (body)=>run(`begin; set local role service_role; set local request.jwt.claims='{"role":"service_role"}';\n${body}\ncommit;`);

async function seedLegacyVerifiedCoverage() {
  const verifiedId = await service(`select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
    (select (a->>'application_id')::uuid from jsonb_array_elements(
      public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Other',0)->'casters') a)
  ],'ca570004-0000-4000-8000-000000000002',null,null,null,null,null,null,false,null)#>>'{assignments,0,id}';`);
  assert.match(verifiedId,/^[0-9a-f-]{36}$/);
  assert.equal(await service(`select public.caster_phase4_admin_save('user_CasterPhase3Staff',${literal(verifiedId)},1,null,null,null,null,'complete',
    null,now()-interval '5 hours',null,null,null,false,null)->>'status';`),"ok");
  return verifiedId;
}

async function addPopulatedRecoveryMedia() {
  const { tournamentId, legacyTitle, casterTitle, casterUrl } = recoveryMediaFixture;
  await service(`insert into public.tournament_media(tournament_id,title,url,media_type,published)
    values(${literal(tournamentId)},${literal(legacyTitle)},'https://www.twitch.tv/videos/83820','video',true);`);
  const casterId = await service(`select public.caster_media_save('user_CasterPhase3Other',null,null,${literal(tournamentId)},null,null,
    ${literal(casterTitle)},${literal(casterUrl)},null,'save')#>>'{media,id}';`);
  assert.match(casterId,/^[0-9a-f-]{36}$/);
  assert.equal(await service(`select exists(select from jsonb_array_elements(public.caster_media_public_tournaments(array[${literal(tournamentId)}::uuid],true)) item
    where item->>'id'=${literal(casterId)}) and not exists(select from jsonb_array_elements(public.caster_media_public_tournaments(array[${literal(tournamentId)}::uuid],false)) item
    where item->>'id'=${literal(casterId)}) and exists(select from jsonb_array_elements(public.caster_media_public_tournaments(array[${literal(tournamentId)}::uuid],false)) item
    where item->>'title'=${literal(legacyTitle)});`),"t","Recovery controls must diverge with the feature flag");
  assert.equal(await service(`select caster_managed and not published from public.tournament_media where id=${literal(casterId)};`),"t");
  await assert.rejects(service(`update public.tournament_media set published=true where id=${literal(casterId)};`),/authorized workflow/i);
}

async function verifyForwardPermissions() {
  const checks = await run(`select
    not has_table_privilege('authenticated','public.gaming_profile_disclosure','SELECT') and
    not has_table_privilege('anon','public.gaming_profile_disclosure','SELECT') and
    has_table_privilege('service_role','public.gaming_profile_disclosure','SELECT') and
    not has_function_privilege('authenticated','public.get_gaming_profile_avatar_target(uuid,text)','EXECUTE') and
    has_function_privilege('service_role','public.get_gaming_profile_avatar_target(uuid,text)','EXECUTE') and
    not has_table_privilege('service_role','ironclad_private.ready_suggestion_rate_key','SELECT') and
    not has_function_privilege('authenticated','public.submit_ready_topic_suggestion_with_private_quota(uuid,text,text,text,text,text)','EXECUTE') and
    has_function_privilege('service_role','public.submit_ready_topic_suggestion_with_private_quota(uuid,text,text,text,text,text)','EXECUTE') and
    to_regprocedure('public.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text)') is null and
    not has_function_privilege('service_role','public.caster_phase4_admin_assign(text,uuid[],uuid,uuid,uuid,timestamptz,text,text,uuid,boolean,text)','EXECUTE') and
    not has_function_privilege('service_role','public.caster_phase4_public_schedules(uuid[])','EXECUTE') and
    not has_table_privilege('service_role','ironclad_private.caster_media_links','SELECT') and
    not has_table_privilege('service_role','ironclad_private.caster_media_events','SELECT') and
    (select count(*)=11 and bool_and(has_function_privilege('service_role',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'caster_media_%') and
    (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='ironclad_private' and relkind='r' and (relname like 'caster_%' or relname='ready_suggestion_rate_key'))`);
  assert.equal(checks,"t","Service-only Ready and Patch 2 permissions or Caster RLS differ");
  const quota = await run(`begin;
    set local role service_role;
    set local request.jwt.claims='{"role":"service_role"}';
    select public.submit_ready_topic_suggestion_with_private_quota(
      ('00000000-0000-4000-8000-'||lpad(number::text,12,'0'))::uuid,'Synthetic suggestion',null,'2','1',repeat('a',64))
    from generate_series(1,6) number;
    select public.submit_ready_topic_suggestion_with_private_quota(
      '00000000-0000-4000-8000-000000000001','Synthetic suggestion',null,'2','1',repeat('a',64));
    rollback;`);
  assert.deepEqual(quota.split(/\r?\n/),[...Array(5).fill("stored"),"rate_limited","duplicate"]);
}

try {
  await client.run(`create database ${database}`,{db:"postgres"});
  await run(read("tests/database/local-supabase-replay-prelude.sql")+releaseFile("tests/consolidated-db/realtime-local-prelude.sql")+
    `\ncreate schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
      -- The local package installs pgcrypto in public. Hosted Production was
      -- verified to resolve this PostgreSQL extension signature in extensions.
      create function extensions.hmac(bytea, bytea, text) returns bytea language sql immutable strict
        as $$ select public.hmac($1,$2,$3) $$;`);
  const ledger=JSON.parse(releaseFile("docs/p03-production-ledger.json"));
  for(const m of ledger.migrations){
    const resolved=before.find(({receipt})=>m.version===receipt);
    assert.ok(resolved,`Missing live predecessor ${m.version}`);
    out.step=resolved.name;
    await run(offline(sql(resolved))+`\ninsert into supabase_migrations.schema_migrations(version,name) values(${literal(m.version)},${literal(m.name)});`);
  }
  out.step="frozen Production Match Room, legal and versioned competition packages";
  await run(p03Sql());
  const definitions=JSON.parse(releaseFile("scripts/consolidated-db/production-function-definitions.json")).functions;
  await run("begin; set local check_function_bodies=off;\n"+definitions.map((item)=>item.definition+";").join("\n")+"\ncommit;");
  assert.deepEqual(JSON.parse(await run(reviewedProductionFunctions)),expectedFunctions);
  await run(releaseFile("tests/consolidated-db/production-provider-table-acl.sql"));
  await run("update public.platform_settings set value='{\"enabled\":true}'::jsonb where key in ('elo_verification','match_room');");
  const approvedPackage={projectRef:"nsyjtqpvyxlzyujlbzos",candidateSha:"a".repeat(40)};
  const syntheticSql=["lifecycle-helpers.sql","legal-registry.sql","legacy-history.sql","retention-history.sql"]
    .map((file)=>releaseFile("tests/consolidated-db/"+file));
  await run([...syntheticSql,consolidatedSql(),
    `select set_config('ironclad.release_project_ref',${literal(approvedPackage.projectRef)},false),
    set_config('ironclad.release_candidate_sha',${literal(approvedPackage.candidateSha)},false),
    set_config('ironclad.release_app_verified_sha',${literal(approvedPackage.candidateSha)},false);`,
    buildProductionLegalSql({...approvedPackage,apply:true,authorization:"Release the approved candidate to Production."}),
    buildPostDeploymentSql(approvedPackage),].join("\n"));
  assert.equal(await run("select count(*)::integer from supabase_migrations.schema_migrations"),"160");
  out.checks.push("Reused 153-migration 320-function reviewed Production baseline and synthetic legal/competition upgrade to 160 receipts");
  for (const m of before.filter((m)=>m.receipt>="20261024194450")) {
    out.step = m.name;
    await run(offline(sql(m)) + `\ninsert into supabase_migrations.schema_migrations(version,name) values(${literal(m.receipt)},${literal(m.name)});`);
    out.steps.push({name:m.name,phase:"predecessor",receipt:m.receipt});
  }
  assert.equal(await run("select count(*)::integer from supabase_migrations.schema_migrations"),"165");
  out.catalog=JSON.parse(await run(catalogQuery));
  assert.equal(out.catalog.qualified_view_digest,"648c94fa8f0a02477d3e2bde6a8e8af63de3d9f9de8b417ed8ee3257bd6e59a3");
  assert.equal(out.catalog.finalize_digest,"acfee729310cd908c1fc7ceb2c4a1bbbd4c014ee45d916da57107a5bcd72c173");
  assert.equal(out.catalog.notice,false);
  assert.equal(out.catalog.staff,false);
  assert.equal(out.catalog.closure,false);
  assert.equal(out.catalog.ready,false);
  assert.equal(out.catalog.caster,false);
  const legacyGrant = await run(legacyMatchStaffGrant);
  out.checks.push("Live hotfix view and function fingerprints match; Patch 2, Ready and Caster absent at predecessor");
  checkpoint();
  const durabilityQuery=`select jsonb_build_object('legal',(select jsonb_agg(to_jsonb(d) order by d.id) from public.legal_documents d),
    'reg',(select count(*) from public.registrations),'outcomes',(select count(*) from public.match_participant_outcome_authority),
    'point_history',(select count(*) from public.leaderboard_point_events),'memberships',(select count(*) from public.leaderboard_tournament_season_memberships))`;
  const retention = await run(durabilityQuery);
  let predecessorFixtureRetention;
  let verifiedId;
  for (const m of postProduction) {
    if (m.name === mediaMigration) {
      out.step="legacy Caster publication and verified coverage fixture";
      assert.equal(await run(durabilityQuery),retention,"Preceding upgrade preserved durable competition records and legal versions");
      await run(read("tests/database/caster-phase3-publication.sql"));
      await run(read("tests/database/caster-phase4-coverage.sql"));
      verifiedId = await seedLegacyVerifiedCoverage();
      assert.equal(await service("select public.close_ironclad_player_account('user_CasterPhase3Closed')->>'outcome';"),"not_found");
      predecessorFixtureRetention = await run(durabilityQuery);
      out.checks.push("Legacy Caster publication and coverage fixtures passed on the upgraded predecessor before scheduling retirement");
    }
    out.step=m.name;
    const raw=sql(m);
    const receipt = m.name.slice(0,14);
    const receiptSql = `insert into supabase_migrations.schema_migrations(version,name) values(${literal(receipt)},${literal(m.name)});`;
    assert.match(raw,/\bcommit;\s*$/i,`Reviewed migration must use an atomic transaction ${m.name}`);
    await run(offline(raw).replace(/\bcommit;\s*$/i,() => `${receiptSql}\ncommit;`));
    out.steps.push({name:m.name,phase:"upgrade",checksum:hash(raw),stagingReceipt:m.receipt??null});
    checkpoint();
  }
  out.step="post-upgrade catalog";
  const end = JSON.parse(await run(catalogQuery));
  for (const key of ["qualified_view_digest","finalize_digest","path_digest","public_standings"]) assert.equal(end[key],out.catalog[key]);
  for (const key of ["notice","staff","closure","ready"]) assert.equal(end[key],true);
  assert.ok(predecessorFixtureRetention && verifiedId,"Missing pre-transition Caster fixtures");
  assert.equal(await run(durabilityQuery),predecessorFixtureRetention,"Final migration preserves competition records and legal versions with legacy records populated");
  out.checks.push("Upgrade preserves the two live hotfix fingerprints, the Pro path definition and legal document inventory");
  assert.equal(await run("select count(*)::int from supabase_migrations.schema_migrations"),"190");
  await verifyForwardPermissions();
  out.checks.push("RLS, service-only profile/Ready grants, suggestion rate limit, duplicate retries and denied direct client paths passed");
  assert.equal(legacyGrant,"t","Expected predecessor staff direct RPC grant");
  assert.equal(await run(legacyMatchStaffGrant),"f","Legacy staff grant must be revoked");
  assert.equal(await run("select has_function_privilege('service_role','public.call_patch2_match_staff(text,jsonb,text)','execute')"),"t");
  out.checks.push("The original live deployment crosses a changed Match Room authority contract; recovery must use the upgraded Patch 2 build with features off");
  out.step="caster Tournament Media transition fixtures";
  await run(`set fixture.caster_verified_history=${literal(verifiedId)};\n`+read("tests/database/caster-tournament-media.sql"));
  await addPopulatedRecoveryMedia();
  out.checks.push("Caster Tournament Media and legacy verified-history transition passed, including active public fixture and feature-off no-leak SQL control");
  await assert.rejects(run("begin; create table public.local_combined_retry_probe(checkpoint int); select 1/0; commit;"),/division by zero/i);
  assert.equal(await run("select to_regclass('public.local_combined_retry_probe') is null"),"t");
  await run("begin; create table public.local_combined_retry_probe(checkpoint int); select 1; rollback;");
  out.checks.push("A failed transaction left neither its object nor receipt. A clean retry could execute against the unchanged boundary");
  const snapshot = await casterRecoverySnapshot();
  assert.ok(snapshot.every((item)=>item.rows>0),"Expected durable synthetic records for recovery");
  out.casterRecoveryDatasets = snapshot;
  if (process.env.COMBINED_RECOVERY_POSTGREST) {
    out.step = "feature-disabled recovery build over upgraded database";
    out.appRecovery = await checkRecoveryBuild({ root, database, port, binary: process.env.COMBINED_RECOVERY_POSTGREST });
    assert.deepEqual(await casterRecoverySnapshot(),snapshot,"Recovery must preserve invitations, applications, publications, coverage, Tournament Media and audit records");
    out.checks.push("The feature-disabled app served legacy Tournament Media, suppressed caster-managed media and preserved all eleven Caster datasets");
  }
  delete out.step;
  out.ok=true;
} catch (error) {
  out.ok=false;
  out.failure=String(error.message).split("\n").slice(0,5).join("\n");
  process.exitCode=1;
} finally {
  checkpoint();
  console.log(JSON.stringify({ok:out.ok, steps:out.steps.length, stage:out.step, failure:out.failure, checks:out.checks}));
}
