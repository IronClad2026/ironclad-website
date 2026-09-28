import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAtomicMigrationSql, migrationFiles, repositoryRoot, sha256 } from "./package.mjs";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const client = localClient(localPsqlArgument(), { database: "p03_atomic" });
const checks = [];
const pass = (name) => { checks.push(name); console.log("PASS " + name); };
const sql = buildAtomicMigrationSql();
const id = (n) => "d23a0000-0000-4000-8000-" + String(n).padStart(12, "0");
const auth = (query, actor = 1, admin = false) => `set role authenticated;
  set request.jwt.claims='{"role":"authenticated","sub":"p03-rehearsal-${actor}","metadata":{"role":"${admin ? "admin" : "player"}"}}'; ${query}`;
const project = (output) => JSON.parse(output.split(/\r?\n/).filter((line) => line.startsWith("{" )).at(-1));
const fingerprint = `select jsonb_object_agg(name,facts order by name) from (
  select 'tournaments' name,coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') facts from public.tournaments x union all
  select 'tournament_brackets',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.tournament_brackets x union all
  select 'registrations',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.registrations x union all
  select 'generated_brackets',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.generated_brackets x union all
  select 'bracket_rounds',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.bracket_rounds x union all
  select 'tournament_matches',coalesce(jsonb_agg(to_jsonb(x)-'communication_generation' order by id),'[]') from public.tournament_matches x union all
  select 'match_result_report_groups',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.match_result_report_groups x union all
  select 'match_result_submissions',coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.match_result_submissions x
) comparisons;`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(request) {
  const until = Date.now() + 15000;
  while (!request.stdout.includes("P03_PAUSED")) {
    assert(Date.now() < until, request.stderr || "Migration pause did not become ready");
    await sleep(25);
  }
}
async function denied(query, state) {
  const result = await client.start(query).done;
  assert.notEqual(result.code, 0, "Expected rejection");
  assert.match(result.stderr, new RegExp("\\b" + state + "\\b"));
}
try {
  await client.run("create database p03_atomic template p03_rehearsal; create database p03_candidate template p03_empty;", { db: "postgres" });
  const before = await client.run(fingerprint);
  const drifted = await client.start(sql.replace("-- P03 PACKAGE STEP ",
    "alter function public.admin_reset_tournament_match(uuid,text) set search_path=pg_catalog,public;\n-- P03 PACKAGE STEP ")).done;
  assert.notEqual(drifted.code, 0);
  assert.match(drifted.stderr, /P03 dependency changed/);
  assert.equal(await client.run("select to_regclass('public.match_rooms') is null and (select count(*) from supabase_migrations.schema_migrations)=146;"), "t");
  pass("changed existing authority definition aborts before Match Room capability installation");
  const failed = await client.start(sql.replace(/commit;\s*$/, "select 1/0;\ncommit;")).done;
  assert.notEqual(failed.code, 0);
  assert.equal(await client.run("select to_regclass('public.match_rooms') is null and (select count(*) from supabase_migrations.schema_migrations)=146 and not exists(select 1 from public.platform_settings where key='match_room');"), "t");
  assert.equal(await client.run(fingerprint), before);
  pass("injected final-step failure rolls back all schema, setting, ledger and competition facts");

  const blocker = client.start("begin; select 1 from public.tournament_matches limit 1 for update;\n\\echo P03_PAUSED", { interactive: true });
  await ready(blocker);
  const started = Date.now();
  await denied(sql, "55P03");
  assert(Date.now() - started < 8000, "DDL lock timeout was not bounded");
  blocker.child.stdin.end("rollback;\n");
  assert.equal((await blocker.done).code, 0);
  assert.equal(await client.run("select to_regclass('public.match_rooms') is null and not exists(select 1 from public.platform_settings where key='match_room');"), "t");
  pass("active match transaction aborts migration within bounded lock timeout and leaves no partial install");

  // Pause the ACTUAL package at every source-file boundary. The external
  // connections cannot see/grant/call any uncommitted Match Room capability.
  const marker = "-- P03 PACKAGE STEP ";
  const pieces = sql.split(marker);
  const migrating = client.start(pieces[0], { interactive: true, app: "p03-migration-visibility" });
  for (let n = 1; n < pieces.length; n++) {
    let chunk = marker + pieces[n];
    if (n === pieces.length - 1) chunk = chunk.replace(/commit;\s*$/, "");
    migrating.stdout = "";
    migrating.child.stdin.write(chunk + "\n\\echo P03_PAUSED\n");
    await ready(migrating);
    assert.equal(await client.run("select to_regprocedure('public.resolve_match_room(uuid)') is null and to_regclass('public.match_rooms') is null and not exists(select 1 from public.platform_settings where key='match_room');"), "t");
    await denied(auth(`select public.resolve_match_room('${id(301)}');`), "42883");
    await denied(`set role service_role; select public.resolve_match_room('${id(301)}');`, "42883");
  }
  migrating.child.stdin.end("commit;\n");
  assert.equal((await migrating.done).code, 0, migrating.stderr);
  pass("seven migration boundaries expose no RPC/table/setting to external authenticated or service-role callers before atomic commit");
  assert.equal(await client.run(fingerprint), before);
  pass("partial-tournament competition fingerprint identical before and after exact package");
  assert.equal(await client.run("select public.get_match_room_enabled()=false and (select count(*) from supabase_migrations.schema_migrations)=153 and (select count(*) from public.match_rooms)=0 and (select count(*) from public.match_room_assistance)=0;"), "t");
  pass("full package remains OFF and manufactures no historical room, conversation or assistance");
  assert.equal(project(await client.run(auth(`select public.resolve_match_room('${id(301)}');`))).room, null);
  await denied(auth(`select public.send_match_room_message('${id(301)}','${id(999)}','${id(998)}','blocked');`), "P0001");
  await denied(auth(`select public.mark_match_room_read('${id(999)}',0);`), "P0001");
  await denied(auth(`select public.request_match_room_assistance('${id(999)}',0);`), "P0001");
  await denied(auth(`select public.resolve_match_room_assistance('${id(999)}',1);`, 4, true), "P0001");
  pass("OFF rejects create/send/read/request/reopen/admin resolution from first externally visible write capability");
  await client.run("select public.set_match_room_enabled(true,'p03-rehearsal-4');");
  for (const match of [901, 902, 903, 904, 905, 906, 302]) {
    assert.equal(project(await client.run(auth(`select public.resolve_match_room('${id(match)}');`, 4, true))).room, null);
  }
  pass("completed early round and semifinal, one-player/TBD, empty final, BYE and unactivated future pair create no room after enable");
  const current = project(await client.run(auth(`select public.resolve_match_room('${id(301)}');`))).room;
  assert(current?.writable);
  const pending = project(await client.run(auth(`select public.resolve_match_room('${id(303)}');`))).room;
  assert(pending?.writable);
  const disputed = project(await client.run(auth(`select public.resolve_match_room('${id(311)}');`))).room;
  assert(disputed?.writable);
  pass("active two-player, pending review and disputed-result matches retain authoritative room eligibility");
  await client.run("select public.set_match_room_enabled(false,'p03-rehearsal-4');");
  await denied(sql, "55000");
  pass("package reapplication aborts cleanly against an unexpected ledger");

  await client.run(sql, { db: "p03_candidate" });
  for (const file of ["match-room-phase-1.sql", "match-room-phase-3.sql", "match-room-production-hardening.sql", "match-room-unread-summary.sql"]) {
    await client.run("select public.set_match_room_enabled(true,'match-room-test-4');", { db: "p03_candidate" });
    const output = await client.run(readFileSync(path.join(repositoryRoot, "tests/database", file), "utf8"), { db: "p03_candidate" });
    const summary = output.split(/\r?\n/).filter((line) => /ASSERTIONS=/.test(line) || /^\d+$/.test(line)).join(" ");
    pass(file + " " + summary);
  }
  await client.run("select public.set_match_room_enabled(false,'p03-rehearsal-4');", { db: "p03_candidate" });
  const report = { recordedAt: new Date().toISOString(), postgres: await client.run("show server_version;"),
    baselineMigrations: 146, packageMigrations: migrationFiles, packageSqlSha256: sha256(sql),
    competitionFingerprintSha256: sha256(before), checks, status: "PASS" };
  writeFileSync(path.join(repositoryRoot, "tests/p03-db/rehearsal-evidence.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("P03 DATABASE REHEARSAL: PASS");
} finally {
  for (const request of client.processes) request.child.kill();
}
