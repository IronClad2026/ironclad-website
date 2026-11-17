import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const repositoryRoot = process.cwd();
const template = JSON.parse(readFileSync(path.join(repositoryRoot, "scripts/p03-1/database-evidence.json"), "utf8")).database;
assert(/^p03_realtime_\d+$/.test(template));
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const database = "p03_attention_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
const id = (n) => "d19a0000-0000-4000-8000-" + String(n).padStart(12, "0");
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const actor = (sql, n = 1) => `set role authenticated; set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-${n}"}';${sql}`;
const staff = (sql) => `set role service_role; set request.jwt.claims='{"role":"service_role"}';${sql}`;
const flag = (value) => staff(`select public.set_match_room_enabled(${value},'match-room-test-4');`);
const assistance = (room, version) => staff(version === undefined
  ? `select public.call_patch2_private_assistance('get_match_room_assistance',jsonb_build_object('p_room_id',${quote(room)}),'match-room-test-4',true);`
  : `select public.call_patch2_private_assistance('resolve_match_room_assistance',jsonb_build_object('p_room_id',${quote(room)},'p_expected_request_version',${version}),'match-room-test-4',true);`);
const summary = () => `select public.get_match_room_unread_summary(array['${id(311)}'::uuid]);`;
const project = (text) => JSON.parse(text.split(/\r?\n/).filter((line) => line.startsWith("{" )).at(-1));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const pass = (label) => { checks.push(label); console.log("PASS " + label); };
async function until(fn) {
  const end = Date.now() + 5000;
  while (!await fn()) { assert(Date.now() < end, "Controlled session state not observed"); await pause(25); }
}
async function hold(sql) {
  const request = client.start("begin;" + sql + "\n\\echo P03_READY", { interactive: true });
  await until(() => request.stdout.includes("P03_READY"));
  return request;
}
async function release(request) { request.child.stdin.end("commit;\n"); const result = await request.done; assert.equal(result.code, 0, result.stderr); }
async function blocked(app) { await until(async () => await client.run(`select exists(select 1 from pg_stat_activity where datname=current_database() and application_name=${quote(app)} and wait_event_type='Lock');`) === "t"); }
try {
  await client.run("create database " + database + " template " + template + ";", { db: "postgres" });
  const fixture = readFileSync(path.join(repositoryRoot, "tests/database/match-room-phase-1.sql"), "utf8");
  await client.run(fixture.slice(fixture.indexOf("begin;"), fixture.indexOf("-- Physical boundary:")) + `
    insert into ironclad_private.patch2_staff_authorizations(subject_digest,verification_reference)
    values(sha256(convert_to('match-room-test-4','UTF8')),'disposable attention race fixture');
    commit;
  `);
  await client.run(flag(true));
  let room = project(await client.run(actor(`select public.resolve_match_room('${id(311)}');`))).room.id;
  const send = (sequence) => actor(`select public.send_match_room_message('${id(311)}','${room}','${id(1700 + sequence)}','Synthetic race ${sequence}');`);
  await client.run(send(1));
  await client.run(actor(`select public.mark_match_room_read('${room}',1);`, 2));
  const inFlight = await hold(send(2));
  assert.equal(project(await client.run(actor(summary(), 2))).items.length, 0);
  await release(inFlight);
  assert.equal(project(await client.run(actor(summary(), 2))).items[0].unreadSource, "opponent");
  pass("unread summary sees only committed messages and never acknowledges an in-flight message");

  const reading = await hold(actor(`select public.mark_match_room_read('${room}',2);`, 2));
  const sending = client.start(send(3), { app: "p03-send-during-read" });
  await blocked("p03-send-during-read");
  await release(reading);
  assert.equal((await sending.done).code, 0, sending.stderr);
  assert.equal(project(await client.run(actor(summary(), 2))).items[0].unreadSource, "opponent");
  pass("new message queued during read remains unread in the card summary after both commit");

  const oldRoom = room;
  const reassigning = await hold(`update public.tournament_matches set player_two_registration_id='${id(213)}' where id='${id(311)}';`);
  assert.equal(project(await client.run(actor(summary(), 2))).items[0].roomId, oldRoom);
  await release(reassigning);
  assert.equal(project(await client.run(actor(summary(), 2))).items.length, 0);
  assert.equal(project(await client.run(actor(summary(), 3))).items.length, 0);
  room = project(await client.run(actor(`select public.resolve_match_room('${id(311)}');`))).room.id;
  assert.notEqual(room, oldRoom);
  pass("reassignment atomically removes old-pair unread attention and exposes no old-room state to the replacement");

  // Textless creation is retired. Staff can still resolve requests that were
  // already stored, so seed that historical input for both lock orderings.
  await client.run(`insert into public.match_room_assistance(room_id,status,request_version,requested_by_registration_id,requested_at)
    values(${quote(room)},'requested',1,'${id(211)}',now());`);
  const resolving = await hold(assistance(room, 1));
  const disabling = client.start(flag(false), { app: "p03-disable-after-resolve" });
  await blocked("p03-disable-after-resolve");
  await release(resolving);
  assert.equal((await disabling.done).code, 0, disabling.stderr);
  const resolved = project(await client.run(assistance(room)));
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.canResolve, false);
  pass("disable waits for an admitted admin resolution and OFF projects canResolve false");

  await client.run(flag(true));
  await client.run(`update public.match_room_assistance set status='requested',request_version=2,requested_at=now(),
    resolved_at=null,resolved_by_clerk_user_id=null where room_id=${quote(room)};`);
  const disabled = await hold(flag(false));
  const blockedResolution = client.start(assistance(room, 2), { app: "p03-resolve-after-disable" });
  await blocked("p03-resolve-after-disable");
  await release(disabled);
  const result = await blockedResolution.done;
  assert.notEqual(result.code, 0); assert.match(result.stderr, /MATCH_ROOM_DISABLED/);
  const state = project(await client.run(assistance(room)));
  assert.equal(state.status, "requested"); assert.equal(state.canResolve, false);
  pass("disable-first rejects queued admin resolution without changing assistance state");
  writeFileSync(path.join(repositoryRoot, "scripts/p03-1/attention-concurrency-evidence.json"), JSON.stringify({
    recordedAt: new Date().toISOString(), postgres: await client.run("show server_version;"), checks, status: "PASS",
  }, null, 2) + "\n");
  console.log("P03 ATTENTION CONCURRENCY: PASS");
} finally { for (const request of client.processes) request.child.kill(); }
