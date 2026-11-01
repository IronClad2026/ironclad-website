import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// This runner never consumes an application credential, env file, connection
// string, or database target supplied by its caller.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = resolve(ROOT, "../release-execution-tools");
const BIN = resolve(TOOLS, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(TOOLS, "pg-client/node_modules/pg"));
const PORT = 56732;
const HOST = "127.0.0.1";
const RUN = resolve(ROOT, ".release-local", `patch2-registration-${randomUUID()}`);
assert.ok(RUN.startsWith(`${resolve(ROOT, ".release-local")}${sep}`));
const DATA = resolve(RUN, "data");
const password = randomBytes(32).toString("base64url");
const passwordFile = resolve(RUN, "init-password");
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|DATABASE_|POSTGRES|SUPABASE|NEXT_PUBLIC_SUPABASE|CLERK|NEXT_PUBLIC_CLERK)/i.test(key)
));
const sourcePath = "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql";
const migrationPath = "supabase/migrations/20261101220837_patch2_scoped_registration_review.sql";
const source = await readFile(resolve(ROOT, sourcePath), "utf8");
const migration = await readFile(resolve(ROOT, migrationPath), "utf8");
const authorityStart = source.indexOf("create or replace function public.review_tournament_registration(");
const authorityEnd = source.indexOf("create or replace function public.process_expired_waitlist_offers(", authorityStart);
assert.ok(authorityStart >= 0 && authorityEnd > authorityStart, "Actual committed authority could not be extracted");
const authority = source.slice(authorityStart, authorityEnd);
const report = {
  target: "new disposable PostgreSQL 17 cluster; TCP 127.0.0.1:56732 only",
  sourceAuthority: sourcePath,
  sourceAuthoritySha256: createHash("sha256").update(authority).digest("hex"),
  migration: migrationPath,
  migrationSha256: createHash("sha256").update(migration).digest("hex"),
  clusterDirectory: RUN,
  checks: [],
  limitations: [
    "Minimal PostgreSQL fixture with the actual committed review authority; not a full Supabase migration rehearsal.",
    "No capacity, ELO, FIFO promotion, registration acceptance, notification, Storage, Clerk, RLS, or production match triggers are loaded or claimed as tested.",
    "The auth.role() shim reads a local test session claim; actual Supabase JWT verification is not exercised.",
    "The extra update-observation trigger is test instrumentation only.",
  ],
};
let postgres;
let database;
let log = "";
let failure;
const clients = new Set();

function command(name, args) {
  const result = spawnSync(resolve(BIN, `${name}.exe`), args, {
    env: childEnvironment, encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
}

async function unusedPort() {
  await new Promise((accept, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: HOST, port: PORT, exclusive: true }, () => server.close(accept));
  });
}

async function connect(applicationName = "ironclad_patch2_registration_test") {
  const client = new Client({
    host: HOST, port: PORT, database: "postgres", user: "postgres", password,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10_000,
    application_name: applicationName,
  });
  try { await client.connect(); }
  catch (error) { await client.end().catch(() => {}); throw error; }
  clients.add(client);
  return client;
}

async function close(client) {
  clients.delete(client);
  await client.end();
}

const id = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const T1 = id(1), T2 = id(2), B1 = id(101), B2 = id(102);
const R = (number) => id(1000 + number);
const scopedSql = "select * from public.review_tournament_registration_scoped($1::uuid,$2::uuid,$3::text,$4::text)";
const bulkSql = "select * from public.approve_tournament_registrations_scoped($1::uuid,$2::uuid[])";
const review = (tournament, registration, status, note = null, client = database) =>
  client.query(scopedSql, [tournament, registration, status, note]);
const bulk = (tournament, registrations, client = database) =>
  client.query(bulkSql, [tournament, registrations]);
const snapshot = async () => (await database.query("select * from public.registrations order by id")).rows;
const row = async (registration) => (await database.query("select * from public.registrations where id=$1", [registration])).rows[0];

async function expectError(operation, code, message) {
  await assert.rejects(operation, (error) => {
    if (code) assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}

async function unchanged(operation, code = "22023", message) {
  const before = await snapshot();
  await expectError(operation, code, message);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await database.query("select count(*)::int n from public.patch2_update_observations")).rows[0].n, 0);
}

async function test(name, operation) {
  await database.query("reset role; select set_config('request.jwt.claim.role','service_role',false)");
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/fixtures.sql"), "utf8"));
  try {
    await operation();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await database.query("reset role; select set_config('request.jwt.claim.role','service_role',false)");
  }
}

async function waitForLock(applicationName) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { rows } = await database.query(
      "select count(*)::int n from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [applicationName]
    );
    if (rows[0].n === 1) return;
    await delay(25);
  }
  throw new Error("The local concurrent request did not reach its expected lock wait");
}

async function scopeRace(useBulk) {
  const name = `patch2_scope_race_${useBulk ? "bulk" : "single"}`;
  const blocker = await connect(`${name}_blocker`);
  const contender = await connect(name);
  let pending;
  try {
    await blocker.query("begin");
    await blocker.query("select id from public.tournament_brackets where id=$1 for update", [B1]);
    await contender.query("select set_config('request.jwt.claim.role','service_role',false)");
    pending = (useBulk ? bulk(T1, [R(1)], contender) : review(T1, R(1), "approved", null, contender))
      .then(() => ({ accepted: true }), (error) => ({ error }));
    await waitForLock(name);
    await blocker.query("update public.registrations set tournament_id=$1,tournament_bracket_id=$2 where id=$3", [T2, B2, R(1)]);
    await blocker.query("commit");
    const outcome = await pending;
    assert.equal(outcome.error?.code, "22023", "Scope race must reject after obtaining its locks");
    assert.equal((await row(R(1))).registration_status, "pending");
    assert.equal((await row(R(1))).tournament_id, T2);
    const observations = (await database.query("select * from public.patch2_update_observations")).rows;
    assert.equal(observations.length, 1, "Only the explicit concurrent context move may write");
  } finally {
    await blocker.query("rollback");
    if (pending) await pending;
    await close(blocker);
    await close(contender);
  }
}

try {
  await unusedPort();
  // recursive:false intentionally fails if this exact run directory exists.
  await mkdir(resolve(ROOT, ".release-local"), { recursive: true });
  await mkdir(RUN);
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600, flag: "wx" });
  command("initdb", ["-D", DATA, "-U", "postgres", "--pwfile", passwordFile,
    "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  await unlink(passwordFile);
  postgres = spawn(resolve(BIN, "postgres.exe"), ["-D", DATA, "-h", HOST, "-p", String(PORT),
    "-c", "unix_socket_directories=", "-c", "max_connections=12", "-c", "shared_buffers=16MB"],
  { env: childEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  postgres.stdout.on("data", (chunk) => { log += chunk; });
  postgres.stderr.on("data", (chunk) => { log += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (postgres.exitCode !== null) throw new Error(`Local PostgreSQL exited before readiness: ${log}`);
    try { database = await connect(); break; } catch { await delay(100); }
  }
  assert.ok(database, "Local PostgreSQL did not become ready");
  const identity = (await database.query("select host(inet_server_addr()) host,inet_server_port() port,current_user,version() version,current_setting('listen_addresses') listen,current_setting('data_directory') data_directory")).rows[0];
  assert.equal(identity.host, HOST);
  assert.equal(identity.port, PORT);
  assert.equal(identity.current_user, "postgres");
  assert.equal(identity.listen, HOST);
  assert.equal(resolve(identity.data_directory), DATA);
  assert.match(identity.version, /PostgreSQL 17\./);
  report.databaseIdentity = identity;
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/schema.sql"), "utf8"));
  await database.query(authority);
  const beforeAuthority = (await database.query("select pg_get_functiondef('public.review_tournament_registration(uuid,text,text)'::regprocedure) definition")).rows[0].definition;
  await database.query(migration);
  await database.query(migration);
  const afterAuthority = (await database.query("select pg_get_functiondef('public.review_tournament_registration(uuid,text,text)'::regprocedure) definition")).rows[0].definition;
  assert.equal(afterAuthority, beforeAuthority);
  report.migrationAppliedTwice = true;
  report.originalAuthorityUnchanged = true;

  await test("new wrappers are service-role-only, SECURITY DEFINER with pg_catalog search_path", async () => {
    const { rows } = await database.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role from pg_proc p where p.oid in ('public.review_tournament_registration_scoped(uuid,uuid,text,text)'::regprocedure,'public.approve_tournament_registrations_scoped(uuid,uuid[])'::regprocedure)");
    assert.equal(rows.length, 2);
    for (const entry of rows) {
      assert.equal(entry.prosecdef, true); assert.deepEqual(entry.proconfig, ["search_path=pg_catalog"]);
      assert.equal(entry.anon, false); assert.equal(entry.authenticated, false); assert.equal(entry.service_role, true);
    }
  });
  for (const role of ["anon", "authenticated"]) {
    await test(`${role} cannot execute either wrapper even with a spoofed service role claim`, async () => {
      const before = await snapshot();
      await database.query(`set role ${role}`);
      await expectError(() => review(T1, R(1), "approved"), "42501", /permission denied/);
      await expectError(() => bulk(T1, [R(1)]), "42501", /permission denied/);
      await database.query("reset role");
      assert.deepEqual(await snapshot(), before);
    });
    await test(`${role} claim is rejected inside both wrappers`, async () => {
      await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
      await unchanged(() => review(T1, R(1), "approved"), "42501", /Not authorized/);
      await unchanged(() => bulk(T1, [R(1)]), "42501", /Not authorized/);
    });
  }
  await test("service_role can review one player in T1 while the same player in T2 remains pending", async () => {
    await database.query("set role service_role");
    const result = await review(T1, R(1), "approved");
    await database.query("reset role");
    assert.deepEqual(result.rows, [{ registration_id: R(1), tournament_id: T1, tournament_bracket_id: B1, registration_status: "approved" }]);
    assert.equal((await row(R(1))).admin_notes, "retained note");
    assert.equal((await row(R(8))).registration_status, "pending");
  });
  for (const [label, tournament, registration] of [
    ["missing tournament context", null, R(1)], ["missing registration context", T1, null],
    ["wrong tournament", T1, R(8)], ["unknown ID", T1, id(9999)],
    ["legacy unassociated record", T1, R(9)], ["missing bracket", T1, R(10)],
    ["bracket belongs to another tournament", T1, R(11)],
  ]) await test(`single review rejects ${label} without writing`, () => unchanged(() => review(tournament, registration, "approved")));

  for (const [label, tournament, registrations] of [
    ["missing tournament", null, [R(1)]], ["null array", T1, null], ["empty array", T1, []],
    ["duplicate IDs", T1, [R(1), R(1)]], ["null member", T1, [R(1), null]],
    ["over 100 targets", T1, Array.from({ length: 101 }, (_, i) => id(2000 + i))],
    ["mixed tournaments", T1, [R(1), R(8)]], ["one missing ID", T1, [R(1), id(9999)]],
    ["one unassociated legacy ID", T1, [R(1), R(9)]], ["one mismatched bracket", T1, [R(1), R(11)]],
  ]) await test(`bulk rejects ${label} before any write`, () => unchanged(() => bulk(tournament, registrations)));

  await test("bulk processes eligible rows by created_at then ID, independent of submitted order", async () => {
    await database.query("set role service_role");
    const { rows } = await bulk(T1, [R(1), R(12), R(2)]);
    await database.query("reset role");
    assert.deepEqual(rows, [R(2), R(12), R(1)].map((registration_id) => ({ registration_id, error_message: null })));
    const observed = (await database.query("select registration_id from public.patch2_update_observations order by sequence_number")).rows;
    assert.deepEqual(observed.map((x) => x.registration_id), [R(2), R(12), R(1)]);
    assert.equal((await row(R(1))).admin_notes, "retained note");
    assert.equal((await row(R(8))).registration_status, "pending");
  });
  await test("same-scope bulk reports all statuses and isolates actual launched-roster failure", async () => {
    const { rows } = await bulk(T1, [R(1), R(2), R(3), R(4), R(5), R(6), R(7)]);
    assert.equal(rows.length, 7);
    const outcomes = new Map(rows.map((entry) => [entry.registration_id, entry.error_message]));
    assert.equal(outcomes.get(R(1)), null); assert.equal(outcomes.get(R(2)), null);
    assert.match(outcomes.get(R(3)), /already approved/);
    assert.match(outcomes.get(R(4)), /individual administrator review/);
    assert.match(outcomes.get(R(5)), /FIFO spot offer/);
    assert.match(outcomes.get(R(6)), /withdrawal is final/);
    assert.match(outcomes.get(R(7)), /division has launched/);
    assert.equal((await row(R(1))).registration_status, "approved");
    assert.equal((await row(R(2))).registration_status, "approved");
    assert.equal((await row(R(7))).registration_status, "pending");
    assert.equal((await row(R(5))).waitlist_offer_status, "offered");
    assert.equal((await row(R(8))).registration_status, "pending");
  });
  for (const [label, registration, status, message] of [
    ["launched roster status change", R(7), "approved", /division has launched/],
    ["admin-created withdrawal", R(1), "withdrawn", /Only the player can withdraw/],
    ["admin-created waitlisting", R(1), "waitlisted", /cannot move a player to waitlist/],
    ["waitlist promotion without accepted offer", R(5), "approved", /must accept an offer/],
    ["withdrawn restoration", R(6), "pending", /withdrawn registration is final/],
    ["unknown status", R(1), "invented", /Invalid registration review status/],
  ]) await test(`actual review authority preserves ${label}`, () => unchanged(() => review(T1, registration, status), "P0001", message));
  for (const registration of [R(13), R(14), R(15)])
    await test(`actual resolved waitlist guard retains ${registration.slice(-4)}`, () => unchanged(() => review(T1, registration, "rejected"), "P0001", /resolved waitlist registration is final/));
  await test("rejecting an offered waitlist row cancels its offer using existing authority", async () => {
    await review(T1, R(5), "rejected");
    const result = await row(R(5));
    assert.equal(result.registration_status, "rejected"); assert.equal(result.waitlist_offer_status, "cancelled");
    assert.ok(result.waitlist_offer_resolved_at instanceof Date);
  });
  await test("launched roster same-status note edits remain supported", async () => {
    await review(T1, R(7), "pending", "local note");
    assert.equal((await row(R(7))).admin_notes, "local note");
  });
  await test("note boundary accepts 1000 characters, rejects 1001 atomically, null retains and empty clears", async () => {
    await review(T1, R(1), "pending", "n".repeat(1000));
    const before = await snapshot();
    await expectError(() => review(T1, R(1), "approved", "n".repeat(1001)), "P0001", /cannot exceed 1000/);
    assert.deepEqual(await snapshot(), before);
    await review(T1, R(1), "pending", null);
    assert.equal((await row(R(1))).admin_notes.length, 1000);
    await review(T1, R(1), "pending", "");
    assert.equal((await row(R(1))).admin_notes, "");
  });
  await test("existing unscoped authority signature remains callable for already-open clients", async () => {
    await database.query("set role service_role");
    await database.query("select * from public.review_tournament_registration($1::uuid,'manual_review',null)", [R(1)]);
    await database.query("reset role");
    assert.equal((await row(R(1))).registration_status, "manual_review");
  });
  await test("single review rejects context moved while waiting for bracket lock", () => scopeRace(false));
  await test("bulk revalidates the entire selection after bracket lock wait", () => scopeRace(true));
  report.passed = report.checks.every((entry) => entry.passed);
} catch (error) {
  failure = error;
  report.passed = false;
  report.failure = error.message;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (postgres && postgres.exitCode === null) {
    try { command("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "-t", "15", "stop"]); }
    catch (error) { report.stopFailure = error.message; report.passed = false; }
  }
  report.stopped = !postgres || postgres.exitCode !== null;
  if (postgres && !report.stopped) {
    await Promise.race([new Promise((accept) => postgres.once("exit", accept)), delay(3000)]);
    report.stopped = postgres.exitCode !== null;
  }
  if (!report.stopped) report.passed = false;
  // Preserve only disposable local evidence; never recursively remove a path.
  await writeFile(resolve(RUN, "postgres.log"), log).catch(() => {});
  await writeFile(resolve(RUN, "report.json"), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
  await unlink(passwordFile).catch(() => {});
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length,
    failures: report.checks.filter((entry) => !entry.passed).length, stopped: report.stopped,
    report: resolve(RUN, "report.json"), limitations: report.limitations, failure: report.failure,
    stopFailure: report.stopFailure }, null, 2));
}
if (failure) console.error(failure.message);
if (!report.passed) process.exitCode = 1;
