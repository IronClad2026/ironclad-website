// LOCAL ONLY: node tests/database/match-room-phase-3-concurrency.mjs <local-psql.exe>
// Requires the empty full replay plus Phase 3 migration at 127.0.0.1:56591.
// Clones the named template, then removes only its new database and login role.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const psql = process.argv[2];
assert(psql && process.argv.length === 3, "Pass only the local psql executable path");
const database = "ironclad_match_room_phase3_race_tests";
const sourceDatabase = "ironclad_match_room_phase3_tests";
const role = "ironclad_match_room_phase3_race_client";
const port = "56591";
const prefix = "match-room-phase3-race-";
const processes = new Set();
let createdDatabase = false;
let createdRole = false;
let assertions = 0;
let raceNumber = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (n) => `d19a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const roundRobinMatch = id(311);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

function start(sql, app = prefix + "control", db = database, interactive = false) {
  assert([database, sourceDatabase, "postgres"].includes(db), "Unexpected database");
  const child = spawn(psql, [
    "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", db,
  ], {
    windowsHide: true,
    // Do not inherit PGHOSTADDR, PGSERVICE, PGOPTIONS, passwords, or app secrets.
    env: {
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PGAPPNAME: app,
      PGCONNECT_TIMEOUT: "5",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const request = { child, stdout: "", stderr: "", app, done: null };
  processes.add(request);
  child.stdout.on("data", (chunk) => { request.stdout += chunk; });
  child.stderr.on("data", (chunk) => { request.stderr += chunk; });
  // SQLSTATEs are checked from stderr; never infer success from an empty result.
  request.done = new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); }, 30_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      processes.delete(request);
      resolve({ code: null, stdout: request.stdout.trim(), stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      processes.delete(request);
      resolve({ code, stdout: request.stdout.trim(), stderr: request.stderr.trim() });
    });
  });
  child.stdin.on("error", () => undefined);
  child.stdin.write("set statement_timeout='20s'; set lock_timeout='15s'; set client_min_messages=warning;\n" + sql + "\n");
  if (!interactive) child.stdin.end();
  return request;
}

function success(result) {
  assert.equal(result.code, 0, result.stderr || "Local psql session did not finish successfully");
}
function rejected(result, state, message) {
  assert.notEqual(result.code, 0, "A rejected operation unexpectedly succeeded");
  assert.match(result.stderr, new RegExp("\\b" + state + "\\b"));
  if (message) assert.match(result.stderr, message);
}
function projection(result) {
  success(result);
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("{"));
  assert.equal(lines.length, 1, "Expected exactly one JSON RPC result");
  return JSON.parse(lines[0]);
}
async function run(sql, db = database) {
  const result = await start(sql, prefix + "control", db).done;
  success(result);
  return result.stdout;
}
function authenticated(sql, actor = 1) {
  return `set session authorization ${role}; set role authenticated;
    set request.jwt.claim.role='authenticated';
    set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-${actor}","metadata":{"role":"player"}}';
    ${sql}`;
}
function service(sql) {
  return `set session authorization ${role}; set role service_role;
    set request.jwt.claim.role='service_role';
    set request.jwt.claims='{"role":"service_role","sub":"match-room-test-4","metadata":{"role":"admin"}}';
    ${sql}`;
}
async function waitUntil(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, `Did not observe ${label}`);
    await delay(40);
  }
}
async function holder(sql) {
  const app = prefix + "holder";
  const request = start(`begin; select 'HOLDER_PID:' || pg_backend_pid(); ${sql};
\\echo LOCK_READY`, app, database, true);
  await waitUntil(() => request.stdout.includes("LOCK_READY"), "the control transaction holding its lock");
  const pid = request.stdout.match(/HOLDER_PID:(\d+)/)?.[1];
  assert(pid, "Holder PID was not returned");
  request.pid = Number(pid);
  return request;
}
async function release(request) {
  request.child.stdin.end("commit;\n");
  const result = await request.done;
  success(result);
  return result;
}
async function waitLocked(apps, gate) {
  // Same-actor calls may queue on an advisory lock behind another request.
  // Follow the full blocker chain to prove every call reaches this held lock.
  const names = apps.map(quote).join(",");
  await waitUntil(async () => (await run(`
    with recursive chain(app,pid) as (
      select application_name,pid from pg_stat_activity
      where datname=current_database() and application_name in(${names})
        and wait_event_type='Lock'
      union
      select chain.app, unnest(pg_blocking_pids(chain.pid)) from chain
    )
    select count(distinct app)=${apps.length} from chain where pid=${gate.pid};`)) === "t",
  `${apps.length} session(s) blocked behind the held database lock`);
}
function passed(label) {
  assertions++;
  console.log(`PASS ${label}`);
}
async function race(lock, commands, verify, label, ordered = false) {
  raceNumber++;
  const gate = await holder(lock);
  const requests = [];
  for (let n = 0; n < commands.length; n++) {
    const request = start(commands[n], prefix + `${raceNumber}-${n}`);
    requests.push(request);
    if (ordered) await waitLocked([request.app], gate);
  }
  if (!ordered) await waitLocked(requests.map((request) => request.app), gate);
  await release(gate);
  const results = await Promise.all(requests.map((request) => request.done));
  for (const result of results) {
    assert(!/deadlock detected|statement timeout|lock timeout/i.test(result.stderr),
      "Race must settle without deadlock or timeout");
  }
  await verify(results);
  passed(label);
}
const matchLock = (matchId) =>
  `select 1 from public.tournament_matches where id='${matchId}' for update`;
const resolveRoom = (matchId) => `select public.resolve_match_room('${matchId}');`;
const send = (matchId, roomId, key, body) =>
  `select public.send_match_room_message('${matchId}','${roomId}','${id(key)}',${quote(body)});`;
const read = (roomId, sequence) =>
  `select public.mark_match_room_read('${roomId}',${sequence});`;

try {
  assert.equal(await run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()="+port+";", "postgres"), "t");
  assert.equal(await run("select not exists(select 1 from pg_database where datname="+quote(database)+") and not exists(select 1 from pg_roles where rolname="+quote(role)+");", "postgres"), "t",
    "Refusing to overwrite a preexisting local database or role");
  assert.equal(await run("select (select count(*) from public.players)=0 and to_regprocedure('public.get_match_room_assistance(uuid)') is not null;",sourceDatabase),"t");
  await run("create database "+database+" template "+sourceDatabase+";","postgres");
  createdDatabase=true;
  await run("create role "+role+" login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;","postgres");
  createdRole=true;
  await run("grant authenticated,service_role to "+role+";","postgres");
  const source=readFileSync(new URL("./match-room-phase-1.sql",import.meta.url),"utf8");
  await run(source.slice(source.indexOf("begin;"),source.indexOf("-- Physical boundary:"))+"\ncommit;");
  const roomId=projection(await start(authenticated(resolveRoom(roundRobinMatch))).done).room.id;
  const roomMatch=roundRobinMatch;
  const messageCount="select count(*) from public.match_messages where room_id="+quote(roomId)+";";
  const noticeCount="select count(*) from public.notifications where type='match.message_received' and match_id="+quote(roomMatch)+";";
  const recipientEpisodes=" from public.match_room_notification_episodes where room_id="+quote(roomId)+" and recipient_registration_id="+quote(id(212))+";";
  await race(matchLock(roomMatch),[
    authenticated(send(roomMatch,roomId,1001,"A concurrent"),1),
    authenticated(send(roomMatch,roomId,1002,"B concurrent"),2),
  ],async(results)=>{
    results.forEach(success);
    assert.equal(await run("select count(*) from public.match_room_notification_episodes where room_id="+quote(roomId)+" and resolved_at is null;"),"2");
    assert.equal(await run(noticeCount),"2");
  },"opposite senders serialize without actor-lock deadlock and create one episode each");
  await race(matchLock(roomMatch),[
    authenticated(send(roomMatch,roomId,1003,"Retry body"),1),
    authenticated(send(roomMatch,roomId,1003,"Retry body"),1),
  ],async(results)=>{
    const receipts=results.map(projection);
    assert.equal(receipts.filter((x)=>x.duplicate).length,1);
    assert.equal(await run(messageCount),"3");
    assert.equal(await run(noticeCount),"2");
  },"concurrent same-key retry creates one message and no new episode");
  await race(matchLock(roomMatch),[
    authenticated(read(roomId,3),2),
    authenticated(send(roomMatch,roomId,1004,"After catchup"),1),
  ],async(results)=>{
    results.forEach(success);
    assert.equal(await run("select count(*)=2 and count(*) filter(where resolved_at is null)=1"+recipientEpisodes),"t");
  },"catchup-before-send resolves prior episode and creates exactly one successor",true);
  await race(matchLock(roomMatch),[
    authenticated(send(roomMatch,roomId,1005,"Before stale cursor"),1),
    authenticated(read(roomId,4),2),
  ],async(results)=>{
    results.forEach(success);
    assert.equal(await run("select count(*)=2 and count(*) filter(where resolved_at is null)=1"+recipientEpisodes),"t");
  },"send-before-partial-cursor preserves the existing unread episode",true);
  await race(matchLock(roomMatch),[
    authenticated("select public.request_match_room_assistance("+quote(roomId)+",0);",1),
    authenticated("select public.request_match_room_assistance("+quote(roomId)+",0);",2),
  ],async(results)=>{
    const states=results.map(projection);
    assert(states.every((x)=>x.status==="requested"&&x.requestVersion===1));
    assert.equal(await run("select count(*) from public.notifications where type='match.admin_assistance_requested' and match_id="+quote(roomMatch)+";"),"1");
  },"both participants requesting help create one operational request");
  await run(authenticated(read(roomId,5),2));
  const privacyLock="select pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0))";
  await race(privacyLock,[
    authenticated(send(roomMatch,roomId,1006,"Sent immediately before recipient closure"),1),
    service("select public.close_ironclad_player_account('match-room-test-2');"),
  ],async(results)=>{
    results.forEach(success);
    assert.equal(await run("select not exists(select 1 from public.notifications where recipient_clerk_user_id='match-room-test-2') and not exists(select 1 from public.match_room_notification_episodes where recipient_registration_id="+quote(id(212))+" and resolved_at is null);"),"t");
  },"recipient closure after send removes notifications and resolves recipient episode without deadlock",true);
  await run("update public.tournament_matches set player_two_registration_id="+quote(id(213))+" where id="+quote(roomMatch)+";");
  const replacement=projection(await start(authenticated(resolveRoom(roomMatch))).done).room.id;
  await race(privacyLock,[
    service("select public.close_ironclad_player_account('match-room-test-3');"),
    authenticated(send(roomMatch,replacement,1007,"After recipient closure"),1),
  ],async(results)=>{
    results.forEach(success);
    assert.equal(await run("select not exists(select 1 from public.notifications where recipient_clerk_user_id='match-room-test-3') and not exists(select 1 from public.match_room_notification_episodes where room_id="+quote(replacement)+");"),"t");
  },"recipient closure before send prevents stale-identity notifications without deadlock",true);
  const fingerprint="select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ironclad_private';";
  const before=await run(fingerprint);
  const repeat=await start(readFileSync(new URL("../../supabase/migrations/20260919235836_match_room_phase_three.sql",import.meta.url),"utf8")).done;
  rejected(repeat,"42P07");
  assert.equal(await run(fingerprint),before);
  passed("rejected migration reapplication preserves existing authority definitions");
  console.log("Passed "+assertions+" controlled Phase 3 PostgreSQL concurrency assertions.");
} finally {
  const pending=[...processes];
  for(const request of pending)request.child.kill();
  await Promise.all(pending.map((request)=>request.done));
  if(createdDatabase)await run("drop database "+database+";","postgres");
  if(createdRole)await run("drop role "+role+";","postgres");
  console.log("Removed only the newly created Phase 3 race database and synthetic role.");
}
