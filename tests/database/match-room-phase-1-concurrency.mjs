// LOCAL ONLY: node tests/database/match-room-phase-1-concurrency.mjs <local-psql.exe>
// Requires the empty full replay plus Phase 1 migration at 127.0.0.1:56591.
// Clones the named template, then removes only its new database and login role.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const psql = process.argv[2];
assert(psql && process.argv.length === 3, "Pass only the local psql executable path");
const database = "ironclad_match_room_race_tests";
const sourceDatabase = "ironclad_match_room_tests";
const role = "ironclad_match_room_race_client";
const port = "56591";
const prefix = "match-room-race-";
const processes = new Set();
let createdDatabase = false;
let createdRole = false;
let assertions = 0;
let raceNumber = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (n) => `d19a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const match = id(301);
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
const actorLock = (actor) =>
  `select pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:match-room-test-${actor}',0))`;
const resolveRoom = (matchId) => `select public.resolve_match_room('${matchId}');`;
const send = (matchId, roomId, key, body) =>
  `select public.send_match_room_message('${matchId}','${roomId}','${id(key)}',${quote(body)});`;
const read = (roomId, sequence) =>
  `select public.mark_match_room_read('${roomId}',${sequence});`;

try {
  assert.equal(await run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port};`,
    "postgres"), "t", "Only the fixed local PostgreSQL server is allowed");
  assert.equal(await run(`select not exists(select 1 from pg_database where datname='${database}')
    and not exists(select 1 from pg_roles where rolname='${role}');`, "postgres"), "t",
  "Refusing to overwrite a preexisting database or role");
  assert.equal(await run(`select current_database()='${sourceDatabase}'
    and inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port}
    and (select count(*) from public.players)=0
    and (select count(*) from public.tournaments)=0
    and (select count(*) from public.registrations)=0
    and (select count(*) from public.match_rooms)=0
    and (select count(*) from public.match_messages)=0
    and to_regprocedure('public.resolve_match_room(uuid)') is not null;`, sourceDatabase),
  "t", "The named migrated template must contain no business data");

  await run(`create database ${database} template ${sourceDatabase};`, "postgres");
  createdDatabase = true;
  await run(`create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;`, "postgres");
  createdRole = true;
  await run(`grant authenticated,service_role to ${role};`, "postgres");

  const source = readFileSync(new URL("./match-room-phase-1.sql", import.meta.url), "utf8");
  const fixtureStart = source.indexOf("begin;");
  const fixtureEnd = source.indexOf("-- Physical boundary: deny all raw paths, including service-role shortcuts.");
  assert(fixtureStart >= 0 && fixtureEnd > fixtureStart, "Synthetic fixture boundaries must exist");
  await run(source.slice(fixtureStart, fixtureEnd) + "\ncommit;");
  assert.equal(await run(authenticated(`select current_user='authenticated'
    and session_user='${role}' and not(select rolsuper or rolbypassrls
      from pg_roles where rolname=session_user);`)), "t");
  assert.equal(await run(service(`select current_user='service_role' and session_user='${role}';`)), "t");
  passed("actual non-owner member sessions and explicit trusted-service session");

  let roomId;
  await race(matchLock(match), [
    authenticated(resolveRoom(match), 1), authenticated(resolveRoom(match), 2),
  ], async (results) => {
    const rooms = results.map((result) => projection(result).room);
    assert(rooms[0]?.id && rooms[1]?.id, "Both legitimate participants must resolve a room");
    assert.equal(rooms[0].id, rooms[1].id);
    roomId = rooms[0].id;
    assert.equal(await run(`select count(*)=1 and max(room_revision)=1
      from public.match_rooms where match_id='${match}';`), "t");
  }, "concurrent room creation yields exactly one fixed-membership room");

  await race(matchLock(match), [
    authenticated(send(match, roomId, 1001, "Identical retry")),
    authenticated(send(match, roomId, 1001, "Identical retry")),
  ], async (results) => {
    const receipts = results.map(projection);
    assert.equal(receipts.filter((result) => result.duplicate).length, 1);
    assert.deepEqual(receipts[0].message, receipts[1].message);
    assert.equal(await run(`select count(*)=1 and max(sequence)=1 from public.match_messages
      where room_id='${roomId}';`), "t");
  }, "same sender and client key insert once across concurrent sessions");

  await race(matchLock(match), [
    authenticated(send(match, roomId, 1002, "Conflicting body A")),
    authenticated(send(match, roomId, 1002, "Conflicting body B")),
  ], async (results) => {
    assert.equal(results.filter((result) => result.code === 0).length, 1);
    rejected(results.find((result) => result.code !== 0), "23505");
    assert.equal(projection(results.find((result) => result.code === 0)).duplicate, false);
    assert.equal(await run(`select count(*)=1 from public.match_messages
      where room_id='${roomId}' and client_message_id='${id(1002)}';`), "t");
  }, "conflicting payloads sharing a client key cannot overwrite the winning message");

  await race(matchLock(match), [
    authenticated(send(match, roomId, 1003, "First participant sequence"), 1),
    authenticated(send(match, roomId, 1004, "Second participant sequence"), 2),
  ], async (results) => {
    const receipts = results.map(projection);
    assert.deepEqual(receipts.map((result) => result.message.sequence).sort((a, b) => a - b), [3, 4]);
    assert.equal(await run(`select count(*)=4 and count(distinct sequence)=4
      and min(sequence)=1 and max(sequence)=4 from public.match_messages where room_id='${roomId}';`), "t");
  }, "two participants allocate distinct, contiguous room sequences");

  const rrRoom = projection(await start(authenticated(resolveRoom(roundRobinMatch))).done).room.id;
  await race(matchLock(roundRobinMatch),
    Array.from({ length: 20 }, (_, n) =>
      authenticated(send(roundRobinMatch, rrRoom, 1100 + n, "Rate limit contender " + n))),
    async (results) => {
      const accepted = results.filter((result) => result.code === 0);
      const denied = results.filter((result) => result.code !== 0);
      assert.equal(accepted.length, 15, "The database must enforce the fifteen-message window");
      assert.equal(denied.length, 5);
      denied.forEach((result) => rejected(result, "P0001", /MATCH_ROOM_RATE_LIMITED/));
      assert.deepEqual(accepted.map((result) => projection(result).message.sequence).sort((a, b) => a - b),
        Array.from({ length: 15 }, (_, n) => n + 1));
      assert.equal(await run(`select count(*)=15 and count(distinct sequence)=15
        from public.match_messages where room_id='${rrRoom}';`), "t");
      const other = projection(await start(authenticated(send(roundRobinMatch, rrRoom, 1200,
        "The other participant has an independent limit"), 2)).done);
      assert.equal(other.message.sequence, 16);
    }, "twenty simultaneous sends respect the per-actor limit without blocking the other participant");

  await race(matchLock(match), [
    authenticated(read(roomId, 4), 2),
    authenticated(send(match, roomId, 1300, "New unread message"), 1),
  ], async (results) => {
    assert.equal(projection(results[0]).lastReadSequence, 4);
    assert.equal(projection(results[1]).message.sequence, 5);
    assert.equal(await run(`select r.last_read_sequence=4 and room.last_sequence=5
      from public.match_room_reads r join public.match_rooms room on room.id=r.room_id
      where r.room_id='${roomId}' and r.viewer_clerk_user_id='match-room-test-2';`), "t");
  }, "reading a displayed cursor while a new message arrives leaves the new message unread");

  await race(matchLock(match), [
    authenticated(read(roomId, 5), 2),
    authenticated(read(roomId, 3), 2),
  ], async (results) => {
    results.forEach(success);
    assert.equal(await run(`select last_read_sequence from public.match_room_reads
      where room_id='${roomId}' and viewer_clerk_user_id='match-room-test-2';`), "5");
  }, "concurrent stale read requests never move the cursor backwards");

  // A successful send owns its actor lock until COMMIT. Closure must wait, then
  // remove direct attribution, including the message that committed just before it.
  const sentBeforeClosure = await holder(authenticated(send(match, roomId, 1400,
    "Retained text is not anonymized by removing actor attribution"), 1));
  const closingA = start(service("select public.close_ironclad_player_account('match-room-test-1');"),
    prefix + "close-after-send");
  await waitLocked([closingA.app], sentBeforeClosure);
  const sendReceipt = projection(await release(sentBeforeClosure));
  assert.equal(sendReceipt.message.sequence, 6);
  success(await closingA.done);
  assert.equal(await run(`select count(*)=1 and bool_and(actor_clerk_user_id is null)
    from public.match_messages where room_id='${roomId}' and client_message_id='${id(1400)}';`), "t");
  assert.equal(await run(`select not exists(select 1 from public.match_messages where actor_clerk_user_id='match-room-test-1')
    and not exists(select 1 from public.match_room_reads where viewer_clerk_user_id='match-room-test-1');`), "t");
  passed("account closure waits for an in-flight send and then removes its direct actor attribution");

  await race(actorLock(2), [
    service("select public.close_ironclad_player_account('match-room-test-2');"),
    authenticated(send(match, roomId, 1401, "Must not survive account closure"), 2),
  ], async (results) => {
    success(results[0]);
    rejected(results[1], "42501");
    assert.equal(await run(`select not exists(select 1 from public.match_messages where client_message_id='${id(1401)}')
      and not exists(select 1 from public.match_room_reads where viewer_clerk_user_id='match-room-test-2')
      and not exists(select 1 from public.match_messages where actor_clerk_user_id='match-room-test-2');`), "t");
    const staleRead = await start(authenticated(read(roomId, 6), 2)).done;
    rejected(staleRead, "42501");
  }, "closure queued first denies the stale-session send and prevents read-state recreation", true);


  // This is a forward-only migration, not an idempotent schema installer.
  // A mistaken second application must fail inside BEGIN and roll back wholly.
  const tableNames = (await run(`select format('%I.%I',n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in('public','ironclad_private') and c.relkind in('r','p')
    order by n.nspname,c.relname;`)).split(/\r?\n/).filter(Boolean);
  const tableFingerprints = tableNames.map((table) =>
    `select ${quote(table)} as name,md5(coalesce(string_agg(row_to_json(r)::text,E'\\n'
      order by row_to_json(r)::text),'')) as hash from ${table} r`).join("\nunion all\n");
  const schemaFingerprint = `
    with definitions(kind,name,definition) as (
      select 'schema',n.nspname,jsonb_build_array(n.nspowner,n.nspacl)::text
        from pg_namespace n where n.nspname in('public','ironclad_private')
      union all
      select 'relation',format('%I.%I',n.nspname,c.relname),
        jsonb_build_array(c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions)::text
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in('public','ironclad_private')
      union all
      select 'column',format('%I.%I.%I',n.nspname,c.relname,a.attname),
        jsonb_build_array(a.attnum,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,
          a.attcollation,a.attacl,pg_get_expr(d.adbin,d.adrelid))::text
        from pg_attribute a join pg_class c on c.oid=a.attrelid
        join pg_namespace n on n.oid=c.relnamespace
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where n.nspname in('public','ironclad_private') and a.attnum>0 and not a.attisdropped
      union all
      select 'constraint',format('%I.%I.%I',n.nspname,c.relname,k.conname),
        pg_get_constraintdef(k.oid)||':'||k.convalidated::text
        from pg_constraint k join pg_class c on c.oid=k.conrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','ironclad_private')
      union all
      select 'index',indexrelid::regclass::text,pg_get_indexdef(indexrelid)
        from pg_index i join pg_class c on c.oid=i.indrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','ironclad_private')
      union all
      select 'trigger',format('%I.%I.%I',n.nspname,c.relname,t.tgname),
        pg_get_triggerdef(t.oid)||':'||t.tgenabled::text
        from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','ironclad_private')
      union all
      select 'policy',format('%I.%I.%I',n.nspname,c.relname,p.polname),
        jsonb_build_array(p.polcmd,p.polpermissive,p.polroles,
          pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text
        from pg_policy p join pg_class c on c.oid=p.polrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','ironclad_private')
      union all
      select 'function',p.oid::regprocedure::text,
        pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||':'||p.proowner::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in('public','ironclad_private') and p.prokind in('f','p')
    )
    select md5(string_agg(kind||':'||name||':'||definition,E'\\n' order by kind,name))
    from definitions;`;
  const beforeData = await run(tableFingerprints);
  const beforeSchema = await run(schemaFingerprint);
  const repeat = await start(readFileSync(new URL(
    "../../supabase/migrations/20260919011425_match_room_phase_one.sql", import.meta.url), "utf8"),
    prefix + "repeat-migration").done;
  rejected(repeat, "42701");
  assert.equal(await run(schemaFingerprint), beforeSchema,
    "Rejected migration reapplication changed schema or authority definitions");
  assert.equal(await run(tableFingerprints), beforeData,
    "Rejected migration reapplication changed stored data");
  passed("rejected second migration application preserves schema, ACLs and every public/private table row");

  console.log(`Passed ${assertions} controlled PostgreSQL concurrency assertions.`);
} finally {
  const pending = [...processes];
  for (const request of pending) request.child.kill();
  await Promise.all(pending.map((request) => request.done));
  if (createdDatabase) {
    await run(`drop database ${database};`, "postgres");
  }
  if (createdRole) {
    await run(`drop role ${role};`, "postgres");
  }
  if (createdDatabase || createdRole) {
    console.log("Removed only the newly created Match Room race database and synthetic role.");
  }
}
