// LOCAL ONLY. Usage: node tests/database/match-room-unread-concurrency.mjs <local-psql.exe>
// Requires an empty hardening baseline at the fixed loopback port below.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const psql = process.argv[2];
assert(psql && process.argv.length === 3, "Pass only the local psql executable");
const database = "ironclad_match_room_unread_race_tests";
const template = "ironclad_match_room_hardening_tests";
const role = "ironclad_match_room_unread_race_client";
const port = "56591";
const processes = new Set();
let createdDatabase = false;
let createdRole = false;
let assertions = 0;
const id = (n) => `d19a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function start(sql, app = "unread-race-control", db = database, interactive = false) {
  assert([database, template, "postgres"].includes(db));
  const child = spawn(psql, ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", db], {
    windowsHide: true,
    // Deliberately discard inherited PG connection variables and app secrets.
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
      TEMP: process.env.TEMP, TMP: process.env.TMP, PGAPPNAME: app, PGCONNECT_TIMEOUT: "5" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const request = { child, app, stdout: "", stderr: "", done: null };
  processes.add(request);
  child.stdout.on("data", (chunk) => { request.stdout += chunk; });
  child.stderr.on("data", (chunk) => { request.stderr += chunk; });
  request.done = new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 25_000);
    child.on("error", (error) => {
      clearTimeout(timer); processes.delete(request);
      resolve({ code: null, stdout: request.stdout.trim(), stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer); processes.delete(request);
      resolve({ code, stdout: request.stdout.trim(), stderr: request.stderr.trim() });
    });
  });
  child.stdin.on("error", () => undefined);
  child.stdin.write("set statement_timeout='20s'; set lock_timeout='15s'; set client_min_messages=warning;\n" + sql + "\n");
  if (!interactive) child.stdin.end();
  return request;
}

function success(result) {
  assert.equal(result.code, 0, result.stderr || "Local SQL failed");
  return result.stdout;
}
async function run(sql, db = database) { return success(await start(sql, undefined, db).done); }
function data(result) {
  return JSON.parse(success(result).split(/\r?\n/).filter((line) => line.startsWith("{")).at(-1));
}
function authenticated(sql, actor = 2, admin = false) {
  return `set session authorization ${role}; set role authenticated;
    set request.jwt.claim.role='authenticated';
    set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-${actor}","metadata":{"role":"${admin ? "admin" : "player"}"}}';
    ${sql}`;
}
function summary(matchId) { return `select public.get_match_room_unread_summary(array[${quote(matchId)}]::uuid[]);`; }
function send(matchId, roomId, key) {
  return `select public.send_match_room_message(${quote(matchId)},${quote(roomId)},${quote(id(key))},'Concurrent private fixture');`;
}
function read(roomId, sequence) { return `select public.mark_match_room_read(${quote(roomId)},${sequence});`; }
function passed(label) { assertions++; console.log(`PASS ${label}`); }
async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (!(await predicate())) { assert(Date.now() < deadline, label); await delay(30); }
}
async function locked(app) {
  await waitFor(async () => (await run(`select exists(select 1 from pg_stat_activity
    where datname=current_database() and application_name=${quote(app)} and wait_event_type='Lock');`)) === "t",
  `Request ${app} did not block`);
}
async function holder(matchId) {
  const held = start(`begin; select 1 from public.tournament_matches where id=${quote(matchId)} for update;
\\echo READY`, "unread-race-holder", database, true);
  await waitFor(() => held.stdout.includes("READY"), "Match lock was not acquired");
  return held;
}
async function release(held) { held.child.stdin.end("commit;\n"); success(await held.done); }

try {
  assert.equal(await run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port};`, "postgres"), "t");
  assert.equal(await run(`select not exists(select 1 from pg_database where datname=${quote(database)})
    and not exists(select 1 from pg_roles where rolname=${quote(role)});`, "postgres"), "t");
  assert.equal(await run("select (select count(*) from public.players)=0 and to_regprocedure('public.get_match_room_enabled()') is not null;", template), "t");
  await run(`create database ${database} template ${template};`, "postgres"); createdDatabase = true;
  await run(`create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;`, "postgres"); createdRole = true;
  await run(`grant authenticated to ${role};`, "postgres");
  const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
  const migrationName = readdirSync(migrationDirectory).find((name) => name.endsWith("_match_room_unread_summary.sql"));
  assert(migrationName);
  await run(readFileSync(new URL(migrationName, migrationDirectory), "utf8"));
  const fixture = readFileSync(new URL("./match-room-unread-summary.sql", import.meta.url), "utf8");
  const boundary = fixture.indexOf("select pg_temp.mr_assert(has_function_privilege");
  assert(boundary > 0);
  await run(fixture.slice(0, boundary) + "\ncommit;");
  await run("select public.set_match_room_enabled(true, 'match-room-test-4');");
  const matchId = id(311);
  const roomId = data(await start(authenticated(`select public.resolve_match_room(${quote(matchId)});`, 1)).done).room.id;
  success(await start(authenticated(send(matchId, roomId, 901), 1)).done);
  assert.equal(data(await start(authenticated(summary(matchId))).done).items.length, 1);

  // A read-only summary must not join the competition Match row lock queue.
  const readOnlyGate = await holder(matchId);
  assert.equal(data(await start(authenticated(summary(matchId))).done).items.length, 1);
  await release(readOnlyGate);
  passed("unread polling takes no competition row lock and remains read-only");

  // Queue the new send before acknowledgement of the older rendered sequence.
  // The summary shares B's actor lock and therefore follows B's committed ack.
  const firstGate = await holder(matchId);
  const newMessage = start(authenticated(send(matchId, roomId, 902), 1), "unread-race-new-message");
  await locked(newMessage.app);
  const oldAck = start(authenticated(read(roomId, 1)), "unread-race-old-ack");
  await locked(oldAck.app);
  const afterAck = start(authenticated(summary(matchId)), "unread-race-after-ack");
  await locked(afterAck.app);
  await release(firstGate);
  success(await newMessage.done); success(await oldAck.done);
  assert.equal(data(await afterAck.done).items.length, 1);
  assert.equal(await run(`select last_read_sequence from public.match_room_reads where room_id=${quote(roomId)} and viewer_clerk_user_id='match-room-test-2';`), "1");
  passed("send-before-read race keeps the newer unread message visible after stale acknowledgement");

  const secondGate = await holder(matchId);
  const currentAck = start(authenticated(read(roomId, 2)), "unread-race-current-ack");
  await locked(currentAck.app);
  const laterMessage = start(authenticated(send(matchId, roomId, 903), 1), "unread-race-later-message");
  await locked(laterMessage.app);
  await release(secondGate);
  success(await currentAck.done); success(await laterMessage.done);
  assert.equal(data(await start(authenticated(summary(matchId))).done).items.length, 1);
  success(await start(authenticated(read(roomId, 3))).done);
  assert.deepEqual(data(await start(authenticated(summary(matchId))).done), { items: [] });
  passed("read-before-send race restores attention for the next message and genuine catch-up clears it");

  // An admin who is also a participant must not receive their own admin send.
  success(await start(authenticated(`select public.send_admin_match_room_message(${quote(matchId)},${quote(roomId)},${quote(id(904))},'Own admin fixture');`, 2, true)).done);
  assert.deepEqual(data(await start(authenticated(summary(matchId), 2, true)).done), { items: [] });
  assert.equal(data(await start(authenticated(summary(matchId), 1)).done).items[0].unreadSource, "admin");
  passed("admin participant self-sends are excluded while the other participant sees admin attention");

  await run(`select public.admin_reset_tournament_match(${quote(matchId)},'match-room-test-4');`);
  assert.deepEqual(data(await start(authenticated(summary(matchId), 1)).done), { items: [] });
  const replacement = data(await start(authenticated(`select public.resolve_match_room(${quote(matchId)});`, 1)).done).room.id;
  assert.notEqual(replacement, roomId);
  assert.deepEqual(data(await start(authenticated(summary(matchId), 1)).done), { items: [] });
  passed("real same-pair reset excludes the old room before and after replacement resolution");

  console.log(`UNREAD_CONCURRENCY_ASSERTIONS=${assertions}`);
} finally {
  for (const request of processes) request.child.kill();
  await Promise.all([...processes].map((request) => request.done));
  // Cleanup only the exact, newly-created local clone and login role.
  if (createdDatabase) await run(`drop database ${database} with (force);`, "postgres");
  if (createdRole) await run(`drop role ${role};`, "postgres");
}
