// LOCAL ONLY: node tests/database/match-room-production-hardening-concurrency.mjs <local-psql.exe>
// Clones the empty Phase 3 baseline and applies the current hardening migration locally.
// Clones the named template, then removes only its new database and login role.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const psql = process.argv[2];
assert(psql && process.argv.length === 3, "Pass only the local psql executable path");
const database = "ironclad_match_room_hardening_race_tests";
const sourceDatabase = "ironclad_match_room_phase3_tests";
const role = "ironclad_match_room_hardening_race_client";
const port = "56591";
const prefix = "match-room-hardening-race-";
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

const migration=readFileSync(new URL('../../supabase/migrations/20260920014644_match_room_production_hardening.sql',import.meta.url),'utf8');
const flag=(enabled)=>service("select public.set_match_room_enabled("+enabled+",'match-room-test-4');");
const tournamentLock=(n)=>"select 1 from public.tournaments where id="+quote(id(n))+" for update";
async function enterHeldRequest(request,sql){request.child.stdin.end(sql+'\ncommit;\n');return request.done;}
try {
  assert.equal(await run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()="+port+";",'postgres'),'t');
  assert.equal(await run("select not exists(select 1 from pg_database where datname="+quote(database)+") and not exists(select 1 from pg_roles where rolname="+quote(role)+");",'postgres'),'t');
  assert.equal(await run("select (select count(*) from public.players)=0 and to_regprocedure('public.get_match_room_assistance(uuid)') is not null;",sourceDatabase),'t');
  await run('create database '+database+' template '+sourceDatabase+';','postgres');createdDatabase=true;
  await run('create role '+role+' login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;','postgres');createdRole=true;
  await run('grant authenticated,service_role to '+role+';','postgres');
  const authorityHash="select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%tournament%' or p.proname like '%leaderboard%' or p.proname like '%result%' or p.proname like '%close_ironclad%');";
  const authorityBefore=await run(authorityHash);
  await run(migration);
  assert.equal(await run(authorityHash),authorityBefore);
  assert.equal(await run('select public.get_match_room_enabled();'),'f');
  passed('full forward migration defaults off and leaves every competitive/reset/closure authority body unchanged');
  await run(flag(true));
  const phase1=readFileSync(new URL('./match-room-phase-1.sql',import.meta.url),'utf8');
  await run(phase1.slice(phase1.indexOf('begin;'),phase1.indexOf('-- Physical boundary:'))+'\ncommit;');
  const roomId=projection(await start(authenticated(resolveRoom(roundRobinMatch))).done).room.id;
  const abMatch=id(301);
  const abRoom=projection(await start(authenticated(resolveRoom(abMatch))).done).room.id;
  await race(matchLock(roundRobinMatch),[
    authenticated(send(roundRobinMatch,roomId,1001,'A concurrent'),1),
    authenticated(send(roundRobinMatch,roomId,1002,'B concurrent'),2),
  ],async results=>{results.forEach(success);assert.equal(await run('select count(*) from public.match_messages where room_id='+quote(roomId)),'2');},'opposite senders retain serialized normal operation without busy errors');
  await race(matchLock(roundRobinMatch),[
    authenticated(send(roundRobinMatch,roomId,1003,'Retry body'),1),
    authenticated(send(roundRobinMatch,roomId,1003,'Retry body'),1),
  ],async results=>{assert.equal(results.map(projection).filter(r=>r.duplicate).length,1);},'same-key retries still create exactly one message');

  // Force the actual old inversion: the room session owns Match; real Not Held
  // owns Tournament and waits on that Match. No stored authority is replaced.
  const pausedRoom=await holder(matchLock(id(321)));
  const notHeld=start(service("select public.close_tournament_division_without_launch("+quote(id(13))+",'minimum_roster_not_reached','Controlled local concurrency','match-room-test-4');"),prefix+'not-held');
  await waitLocked([notHeld.app],pausedRoom);
  const roomBusy=await enterHeldRequest(pausedRoom,authenticated(resolveRoom(id(321))));
  rejected(roomBusy,'55P03');success(await notHeld.done);
  assert.equal(await run('select count(*) from public.tournament_division_not_held_closures where tournament_bracket_id='+quote(id(13))),'1');
  assert.equal(await run('select count(*) from public.match_rooms where match_id='+quote(id(321))),'0');
  assert.equal(await run('select count(*) from public.generated_brackets where tournament_bracket_id='+quote(id(13))),'0');
  passed('real Not Held vs room resolution settles without deadlock and no partial room or partial closure');

  // Every authenticated communication entry point shares the same context.
  const requests=[
    resolveRoom(roundRobinMatch),
    'select public.get_match_room_history('+quote(roomId)+',0,50);',
    'select public.get_match_room_earlier_history('+quote(roomId)+',4,50);',
    send(roundRobinMatch,roomId,1004,'Busy retry'),
    'select public.send_admin_match_room_message('+quote(roundRobinMatch)+','+quote(roomId)+','+quote(id(1005))+",'Admin busy');",
    read(roomId,3),
    'select public.get_match_room_assistance('+quote(roomId)+');',
    'select public.request_match_room_assistance('+quote(roomId)+',0);',
    'select public.resolve_match_room_assistance('+quote(roomId)+',1);',
  ];
  const busyGate=await holder(tournamentLock(2));
  for(let i=0;i<requests.length;i++){
    const jwt=authenticated(requests[i],i===4||i===8?4:1).replace('"role":"player"','"role":"admin"');
    rejected(await start(jwt,prefix+'busy-'+i).done,'55P03');
  }
  await release(busyGate);
  assert.equal(await run('select count(*) from public.match_messages where room_id='+quote(roomId)),'3');
  assert.equal(await run('select count(*) from public.match_room_reads where room_id='+quote(roomId)),'0');
  assert.equal(await run('select count(*) from public.match_room_assistance where room_id='+quote(roomId)),'0');
  const retried=projection(await start(authenticated(send(roundRobinMatch,roomId,1004,'Busy retry'))).done);
  assert.equal(retried.duplicate,false);assert.equal(retried.message.sequence,4);
  passed('all nine communication entry points fail55P03 atomically while tournament busy; same message key retries normally');

  // The exact committed setting row is the disable/write serial boundary.
  const heldSend=await holder(authenticated(send(roundRobinMatch,roomId,1006,'Admitted before disable')));
  const disable=start(flag(false),prefix+'disable-after-send');await waitLocked([disable.app],heldSend);
  await release(heldSend);success(await disable.done);
  assert.equal(await run('select count(*) from public.match_messages where room_id='+quote(roomId)),'5');
  rejected(await start(authenticated(send(roundRobinMatch,roomId,1007,'Rejected after disable'))).done,'P0001',/MATCH_ROOM_DISABLED/);
  passed('disable waits for admitted send; after disable completes no new message or alert can be admitted');
  await run(flag(true));
  const heldDisable=await holder(flag(false));
  const blockedSend=start(authenticated(send(roundRobinMatch,roomId,1008,'Waiting behind disable')),prefix+'send-after-disable');
  await waitLocked([blockedSend.app],heldDisable);await release(heldDisable);
  rejected(await blockedSend.done,'P0001',/MATCH_ROOM_DISABLED/);
  assert.equal(await run('select count(*) from public.match_messages where room_id='+quote(roomId)),'5');
  passed('disable-first rejects a queued sender after the setting transaction commits');
  await run(flag(true));
  const heldRequest=await holder(authenticated('select public.request_match_room_assistance('+quote(roomId)+',0);'));
  const disableHelp=start(flag(false),prefix+'disable-after-help');await waitLocked([disableHelp.app],heldRequest);
  await release(heldRequest);success(await disableHelp.done);
  assert.equal(await run('select request_version from public.match_room_assistance where room_id='+quote(roomId)),'1');
  rejected(await start(authenticated('select public.request_match_room_assistance('+quote(roomId)+',1);')).done,'P0001',/MATCH_ROOM_DISABLED/);
  passed('disable serializes assistance creation and denies later requests/reopens');
  await run(flag(true));

  // Real official-result completion already owns Match when deferred settlement
  // requires Tournament UPDATE. Communication must not hold Tournament waiting
  // for that Match; this would be the inverse deadlock with a naive reversal.
  await run(service("select public.admin_finalize_match_result_report_group("+quote(id(402))+",'reset','match-room-test-4','Clear pending fixture through supported report reset',null,null,null);"));
  const resultGate=await holder('select 1 from public.tournaments where id='+quote(id(2))+' for share');
  const result=start(service('select public.apply_admin_official_match_result_api('+quote(roundRobinMatch)+',2,0,'+quote(id(211))+",'match-room-test-4');"),prefix+'official-result');
  try { await waitLocked([result.app],resultGate); } catch(error) { throw new Error(String(error)+' RESULT: '+result.stdout+' '+result.stderr); }
  const roomRead=start(authenticated('select public.get_match_room_history('+quote(roomId)+',0,50);'),prefix+'read-after-result');
  await waitLocked([roomRead.app],resultGate);await release(resultGate);
  success(await result.done);const completed=projection(await roomRead.done);assert.equal(completed.room.writable,false);
  assert.equal(await run('select status from public.tournament_matches where id='+quote(roundRobinMatch)),'completed');
  passed('real final-result deferred settlement and room read complete without reversed-order deadlock');

  await race(matchLock(roundRobinMatch),[
    service('select public.admin_reset_tournament_match('+quote(roundRobinMatch)+",'match-room-test-4');"),
    authenticated('select public.get_match_room_history('+quote(roomId)+',0,50);'),
  ],async results=>{success(results[0]);assert.equal(projection(results[1]).room.writable,false);},'real RR reset and historical read retain generation privacy without extra authority locks',true);
  // Existing account-closure lock remains outermost and unchanged.
  const privacyLock="select pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0))";
  await race(privacyLock,[
    authenticated(send(abMatch,abRoom,1010,'Before recipient closure'),1),
    service("select public.close_ironclad_player_account('match-room-test-2');"),
  ],async results=>{results.forEach(success);assert.equal(await run("select not exists(select 1 from public.notifications where recipient_clerk_user_id='match-room-test-2');"),'t');},'send and existing account closure still serialize without notification or identity residue',true);
  const after=await run(authorityHash);assert.equal(after,authorityBefore);
  passed('all real concurrency scenarios leave competitive/reset/closure function definitions unchanged');
  const roomHash="select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','ironclad_private') and p.proname like '%match_room%';";
  const beforeRepeat=await run(roomHash);
  rejected(await start(migration).done,'42723');
  assert.equal(await run(roomHash),beforeRepeat);
  assert.equal(await run('select public.get_match_room_enabled();'),'t');
  passed('reapplication fails atomically and preserves current flag and room definitions');
  console.log('Passed '+assertions+' controlled hardening concurrency assertions.');
} finally {
  const pending=[...processes];for(const request of pending)request.child.kill();await Promise.all(pending.map(r=>r.done));
  if(createdDatabase)await run('drop database '+database+';','postgres');
  if(createdRole)await run('drop role '+role+';','postgres');
  console.log('Removed only the newly created local hardening race database and synthetic role.');
}
