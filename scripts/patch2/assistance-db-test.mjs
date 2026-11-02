import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Fixed disposable target; never consumes env files/application credentials and
// has no remote connection fallback. PostgreSQL data remains ignored locally.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = resolve(ROOT, "../release-execution-tools");
const BIN = resolve(TOOLS, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(TOOLS, "pg-client/node_modules/pg"));
const HOST = "127.0.0.1", PORT = 56734;
const RUN = resolve(ROOT, ".release-local", `patch2-assistance-${randomUUID()}`);
assert.ok(RUN.startsWith(`${resolve(ROOT, ".release-local")}${sep}`));
const DATA = resolve(RUN, "data"), passwordFile = resolve(RUN, "init-password");
const password = randomBytes(32).toString("base64url");
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|DATABASE_|POSTGRES|SUPABASE|NEXT_PUBLIC_SUPABASE|CLERK|NEXT_PUBLIC_CLERK)/i.test(key)));
const migrationPath = "supabase/migrations/20261102192200_patch2_private_assistance_conversations.sql";
const migration = await readFile(resolve(ROOT, migrationPath), "utf8");
const actorMigrationPath = "supabase/migrations/20261102195256_patch2_private_assistance_active_actor.sql";
const actorMigration = await readFile(resolve(ROOT, actorMigrationPath), "utf8");
const digest = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
const sources = [];
async function authority(path, name) {
  const source = (await readFile(resolve(ROOT, path), "utf8")).replace(/\r\n/g, "\n");
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "i"));
  assert.ok(start >= 0, `Missing actual authority ${name}`);
  const end = source.indexOf("$$;", start); assert.ok(end > start);
  const sql = source.slice(start, end + 3); sources.push({ path, name, sha256: digest(sql) }); return sql;
}
const foundation = "supabase/migrations/20260928030127_match_room_staging_foundation.sql";
const authorities = await Promise.all([
  authority(foundation, "ironclad_private.match_room_privacy_actor"),
  authority(foundation, "ironclad_private.lock_match_room_privacy"),
  authority(foundation, "ironclad_private.match_room_retention_state"),
  authority(foundation, "public.purge_match_room_retention"),
  authority("supabase/migrations/20260908052210_member_rpc_current_account_acceptance.sql", "ironclad_private.require_current_account_legal_acceptance"),
  authority("supabase/migrations/20260810162000_transactional_email_notifications.sql", "public.initialize_transactional_email_state"),
  authority("supabase/migrations/20260919235836_match_room_phase_three.sql", "public.initialize_web_push_state"),
]);
const expectedStagingBodyHashes = {
  lock_match_room_privacy: "986e045cd47fa712a86705216e220b6ae368f941483a9b223fa629b8da671e7c",
  match_room_privacy_actor: "ad5407f98497bf9bbc872ca080d28d4b57ad64f037377da3488a64c240b5d6e2",
  match_room_retention_state: "c87ea163be6f2d24c2dcb08aa35e1b89ce77e96a6b29428d2e4993d82ceb7b5b",
  require_current_account_legal_acceptance: "21a9c8d5ccffd1caa945d90f3b1ae7a1aefc68deaa88e9dd1f87415e29722858",
  purge_match_room_retention: "9707e71254ec0e56a4105b213db8e9a367fd1c04f65e2448d5613a0d60c0ec3c",
  initialize_transactional_email_state: "33a3bd902bf242dcfcc394ee2e99b30e6560a7dceac503ac8153dde32bd259ed",
  initialize_web_push_state: "b54983750edd6c1a52d5df00404ecf40ed899f08a13b4fd8c9ec088f73d44e5c",
};
const deployedClosureSource = await authority("supabase/migrations/20260919235836_match_room_phase_three.sql", "public.close_ironclad_player_account");
const closureBodyHash = digest(deployedClosureSource.slice(deployedClosureSource.indexOf("$$") + 2, deployedClosureSource.lastIndexOf("$$")));
assert.equal(closureBodyHash, "fb39aeb7be5ad82e02b315b93bc96e0bb25468ca8e1ceba71e3703e695e178ea", "Deployed closure wrapper/source body mismatch");
const report = { target: `fresh PostgreSQL17 ${HOST}:${PORT}`, migration: migrationPath,
  migrationSha256: digest(migration), actorMigration: actorMigrationPath, actorMigrationSha256: digest(actorMigration), actualAuthoritySources: sources, checks: [], limitations: [
    "Actual new migration, Phase2 legacy/inbox migration, current legal guard, retention locks/state/purge and notification initializers execute on a minimal local domain schema, not a full Supabase rehearsal.",
    "Local auth.role/auth.jwt claim shims do not verify real Clerk signatures, login, browsers, PostgREST or provider credentials.",
    "Underlying account deletion is a fixture stand-in modeling the deployed final deletion/pseudonymization identity shapes; the actual new provenance-scrubbing wrapper and actor guard execute, but the complete pre-existing account deletion/Storage chain requires separate hosted review.",
    "No normal chat/result/deadline/replay authority, Storage bytes, providers, cron or remote resources execute; protected domain rows are compared for unintended change.",
  ] };
let postgres, database, failure, log = ""; const clients = new Set();
function command(name, args) {
  const r = spawnSync(resolve(BIN, `${name}.exe`), args, { env: childEnvironment, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr ?? r.stdout}`);
}
async function connect(name = "patch2_assistance_local") {
  const c = new Client({ host: HOST, port: PORT, database: "postgres", user: "postgres", password,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10_000, application_name: name });
  try { await c.connect(); } catch (e) { await c.end().catch(() => {}); throw e; }
  clients.add(c); return c;
}
async function claim(sub = "local_p1", role = "player", c = database, dbRole = "authenticated") {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claims',$2,false)",
    [dbRole, JSON.stringify({ sub, role: dbRole, metadata: { role } })]);
  await c.query(`set role ${dbRole}`);
}
async function owner() { await database.query("reset role"); }
async function query(sql, args = [], c = database) { return (await c.query(sql, args)).rows[0]?.value; }
const T1 = "00000000-0000-0000-0000-000000000001", T2 = "00000000-0000-0000-0000-000000000002";
const R1 = "00000000-0000-4000-8000-000000000061", R2 = "00000000-0000-4000-8000-000000000062";
const P1 = "00000000-0000-4000-8000-000000000021", P2 = "00000000-0000-4000-8000-000000000022";
const open = (room, nonce, body, c = database) => query("select public.open_private_assistance($1,$2,$3) value", [room, nonce, body], c);
const read = (id, tour = null, after = 0, limit = 50, c = database) => query("select public.read_private_assistance($1,$2,$3,$4) value", [id, after, limit, tour], c);
const reply = (id, nonce, body, tour = null, c = database) => query("select public.reply_private_assistance($1,$2,$3,$4) value", [id, nonce, body, tour], c);
const status = (id, next, version, tour = T1, c = database) => query("select public.set_private_assistance_status($1,$2,$3,$4) value", [tour, id, next, version], c);
const queue = (tour = T1, filter = "all", page = 1, selected = null) => query("select public.list_admin_private_assistance($1,$2,$3,$4) value", [tour, filter, page, selected]);
async function error(op, code, text) { await assert.rejects(op, e => { assert.equal(e.code, code); if (text) assert.match(e.message, text); return true; }); }
async function test(name, op) { await op(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function domain() {
  return digest(await query("select jsonb_build_object('registrations',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),'matches',(select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m),'tournaments',(select jsonb_agg(to_jsonb(t) order by id) from public.tournaments t),'sharedAssistance',(select jsonb_agg(to_jsonb(a) order by room_id) from public.match_room_assistance a),'normalChat',(select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m)) value"));
}
let first, second, foreign, initialNonce = randomUUID(), baseline;
try {
  await new Promise((accept, reject) => { const s = net.createServer(); s.once("error", reject); s.listen({ host: HOST, port: PORT, exclusive: true }, () => s.close(accept)); });
  await mkdir(resolve(ROOT, ".release-local"), { recursive: true }); await mkdir(RUN);
  await writeFile(passwordFile, `${password}\n`, { flag: "wx", mode: 0o600 });
  command("initdb", ["-D", DATA, "-U", "postgres", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  await unlink(passwordFile);
  postgres = spawn(resolve(BIN, "postgres.exe"), ["-D", DATA, "-h", HOST, "-p", String(PORT), "-c", "unix_socket_directories=", "-c", "max_connections=12", "-c", "shared_buffers=16MB"],
    { env: childEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  postgres.stdout.on("data", c => { log += c; }); postgres.stderr.on("data", c => { log += c; });
  for (let i = 0; i < 100; i++) { try { database = await connect(); break; } catch { await delay(100); } }
  assert.ok(database); const identity = (await database.query("select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_user")).rows[0];
  assert.equal(identity.host, HOST); assert.equal(identity.port, PORT); assert.equal(resolve(identity.directory), DATA); assert.equal(identity.current_user, "postgres");
  report.databaseIdentity = identity;
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/notification-schema.sql"), "utf8"));
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/assistance-schema.sql"), "utf8"));
  await database.query(await readFile(resolve(ROOT, "supabase/migrations/20261101230355_patch2_admin_inbox_legacy_assistance.sql"), "utf8"));
  for (const sql of authorities) await database.query(sql);
  report.loadedAuthorityBodyHashes = (await database.query("select p.proname name,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=any($1::text[]) and n.nspname in('public','ironclad_private') order by name", [Object.keys(expectedStagingBodyHashes)])).rows;
  for (const row of report.loadedAuthorityBodyHashes) assert.equal(row.sha256, expectedStagingBodyHashes[row.name], `Current Staging/source authority mismatch: ${row.name}`);
  assert.equal(report.loadedAuthorityBodyHashes.length, 7); report.actualClosureSourceBodyHash = closureBodyHash;
  await database.query("create trigger actual_email_initializer before insert on public.notifications for each row execute function public.initialize_transactional_email_state(); create trigger actual_push_initializer before insert on public.notifications for each row execute function public.initialize_web_push_state()");
  await database.query(migration); report.migrationApplied = true;
  assert.equal(digest(migration), "2eedac3923c0645e5133e14590c700b36357bbb2b17db6a0f80807d41bfeb922", "Applied migration must remain byte-for-byte unchanged");
  await database.query(actorMigration); report.actorMigrationApplied = true;
  baseline = await domain();
  await test("default-off flag, explicit signed actor boundary and old textless fail-closed", async () => {
    await claim(); assert.equal((await query("select public.get_private_assistance_context($1) value", [R1])).canCreate, false);
    await error(open(R1, initialNonce, "Initial private issue"), "P0001", /ASSISTANCE_DISABLED/);
    await error(query("select public.request_match_room_assistance($1,0) value", [R1]), "55000", /MESSAGE_REQUIRED/);
    await claim("unregistered"); await error(query("select public.get_private_assistance_context($1) value", [R1]), "42501");
    await claim("local_admin", "admin", database, "service_role"); await error(open(R1, initialNonce, "No service impersonation"), "42501");
    await owner(); await database.query("update public.platform_settings set value='{\"enabled\":true}' where key='private_assistance_new_requests_enabled'");
  });
  await test("required initial text, Unicode blank and 1000-codepoint body limits", async () => {
    await claim(); for (const body of [null, "", "\u200B\uFEFF \n", "a".repeat(1001)]) await error(open(R1, randomUUID(), body), "22023");
    first = await open(R1, initialNonce, "Initial private issue"); assert.equal(first.accepted, true); assert.equal(first.request.lastSequence, 1); assert.equal(first.request.version, 1);
    assert.equal(first.request.tournamentId, T1); assert.equal(first.request.requesterName, "Requester One");
    assert.equal(first.message.body, "Initial private issue"); assert.equal(first.acceptedClientMessageId, initialNonce);
    assert.equal(JSON.stringify(first).includes("local_p1"), false);
  });
  await test("exact creation retry succeeds after switch off; losing draft never acknowledged", async () => {
    await owner(); await database.query("update public.platform_settings set value='{\"enabled\":false}' where key='private_assistance_new_requests_enabled'");
    await claim(); const duplicate = await open(R1, initialNonce, "Initial private issue"); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.message.id, first.message.id);
    await error(open(R1, initialNonce, "Changed original"), "23505");
    const loser = await open(R1, randomUUID(), "Retain this unsent draft"); assert.equal(loser.accepted, false); assert.equal(loser.message, null); assert.equal(loser.acceptedClientMessageId, null);
    await claim("local_p2"); await error(read(first.request.id), "42501"); await error(reply(first.request.id, randomUUID(), "Opponent attack"), "42501");
    await error(open(R1, randomUUID(), "New disabled case"), "P0001", /ASSISTANCE_DISABLED/);
    await owner(); await database.query("update public.platform_settings set value='{\"enabled\":true}' where key='private_assistance_new_requests_enabled'");
  });
  await test("same-room opponents create separate private threads and same player can use two tournaments", async () => {
    await claim("local_p2"); second = await open(R1, randomUUID(), "Opponent's separate confidential issue");
    assert.notEqual(second.request.id, first.request.id); await error(read(first.request.id), "42501");
    await claim(); foreign = await open(R2, randomUUID(), "Other tournament issue"); assert.equal(foreign.request.tournamentId, T2);
    await owner(); assert.equal(await query("select count(*)::int value from ironclad_private.match_room_retention_cases where closed_at is null and case_kind='support'"), 3);
  });
  await test("active admin without a participant registration can read; missing Player and foreign tournament deny", async () => {
    await claim("local_admin_without_profile", "admin"); await error(queue(), "42501");
    await error(read(first.request.id, T1), "42501"); await error(reply(first.request.id, randomUUID(), "No active operator", T1), "42501");
    await claim("local_admin", "admin"); const q = await queue(); assert.equal(q.counts.all, 2);
    assert.equal((await read(first.request.id, T1)).messages.length, 1); await error(read(first.request.id), "42501");
    await error(read(first.request.id, T2), "42501"); assert.equal((await queue(T1, "all", 1, foreign.request.id)).selectedRequest, null);
    await error(status(first.request.id, "resolved", 1, T2), "42501");
    await error(reply(first.request.id, randomUUID(), "Wrong tournament", T2), "42501");
  });
  await test("admin reply is private/site-only and moves to In progress, bounded cursor stays ordered", async () => {
    await claim("local_admin", "admin"); const nonce = randomUUID(); const result = await reply(first.request.id, nonce, "Please confirm 19:30 UTC tomorrow", T1);
    assert.equal(result.request.status, "in_progress"); assert.equal(result.request.version, 2); assert.equal(result.message.sequence, 2);
    const retry = await reply(first.request.id, nonce, "Please confirm 19:30 UTC tomorrow", T1); assert.equal(retry.duplicate, true); assert.equal(retry.request.version, 2);
    await error(reply(first.request.id, nonce, "Changed response", T1), "23505");
    await claim(); const page = await read(first.request.id, null, 0, 1); assert.equal(page.messages.length, 1); assert.equal(page.nextAfterSequence, 1); assert.equal(page.hasMore, true);
    const tail = await read(first.request.id, null, 1, 50); assert.equal(tail.messages[0].body, "Please confirm 19:30 UTC tomorrow"); assert.equal(tail.hasMore, false);
    await error(read(first.request.id, null, -1), "22023"); await error(read(first.request.id, null, 0, 51), "22023");
    await owner(); const notices = (await database.query("select * from public.notifications where type like 'assistance.%' order by created_at")).rows;
    assert.equal(notices.length, 4); assert.ok(notices.every(n => n.push_delivery_status === null && n.email_delivery_status === null));
    assert.ok(notices.every(n => !n.message.includes("19:30") && !n.message.includes("confidential")));
    assert.equal(notices.filter(n => n.type === "assistance.admin_replied" && n.recipient_clerk_user_id === "local_p1").length, 1);
  });
  await test("status CAS, explicit resolve, requester reopen and notification dismissal stay separate", async () => {
    await claim("local_admin", "admin"); await error(status(first.request.id, "resolved", 1), "40001");
    let r = await status(first.request.id, "resolved", 2); assert.equal(r.request.version, 3); assert.ok(r.request.resolvedAt);
    assert.equal((await status(first.request.id, "resolved", 3)).changed, false);
    await owner(); const snapshot = await query("select to_jsonb(a) value from public.assistance_requests a where id=$1", [first.request.id]);
    await claim("local_admin", "admin", database, "service_role"); const notices = await query("select array_agg(id) value from public.notifications where type like 'assistance.%' and recipient_role='admin' and tournament_id=$1", [T1]);
    await query("select public.mutate_admin_notification_inbox('tournament',$1,'dismiss',$2) value", [T1, notices]);
    await owner(); assert.deepEqual(await query("select to_jsonb(a) value from public.assistance_requests a where id=$1", [first.request.id]), snapshot);
    await claim(); const result = await reply(first.request.id, randomUUID(), "The issue is still open"); assert.equal(result.request.status, "open"); assert.equal(result.request.version, 4); assert.equal(result.request.resolvedAt, null);
    await claim("local_admin", "admin"); await status(first.request.id, "resolved", 4);
    const adminReopen = await reply(first.request.id, randomUUID(), "Admin follow-up on resolved case", T1);
    assert.equal(adminReopen.request.status, "in_progress"); assert.equal(adminReopen.request.version, 6); assert.equal(adminReopen.request.resolvedAt, null);
  });
  await test("feature-off and terminal/reassigned room preserve existing thread read/reply/status", async () => {
    await owner(); await database.query("update public.platform_settings set value='{\"enabled\":false}' where key='private_assistance_new_requests_enabled'; update public.match_rooms set closed_at=now(),closure_reason='lifecycle_changed' where id='00000000-0000-4000-8000-000000000061'; update public.tournament_matches set player_one_registration_id=null where id=public.patch2_notification_test_uuid(201)");
    const expected = await domain(); await claim(); assert.equal((await read(first.request.id)).canReply, true);
    assert.equal((await query("select public.get_private_assistance_context($1) value", [R1])).request.id, first.request.id);
    await reply(first.request.id, randomUUID(), "Historical room follow-up");
    await claim("local_admin", "admin"); assert.equal((await queue()).newRequestsEnabled, false);
    let current = await read(first.request.id, T1); await status(first.request.id, "resolved", current.request.version);
    await owner(); assert.equal(await domain(), expected);
    // Restore only synthetic competition state to retain a separate invariant
    // snapshot for subsequent assistance-only mutations.
    await database.query("update public.match_rooms set closed_at=null,closure_reason=null where id='00000000-0000-4000-8000-000000000061'; update public.tournament_matches set player_one_registration_id='00000000-0000-4000-8000-000000000031' where id=public.patch2_notification_test_uuid(201); update public.platform_settings set value='{\"enabled\":true}' where key='private_assistance_new_requests_enabled'");
  });
  await test("legacy notification queue excludes private threads, old shared-room records remain scoped", async () => {
    await claim("local_admin", "admin", database, "service_role"); const q = await query("select public.read_legacy_assistance_queue($1,1,true) value", [T1]); assert.ok(q.requests.length > 0);
    assert.ok(q.requests.every(a => a.source_notification_id !== null));
    assert.equal(await query("select public.set_legacy_assistance_status($1,$2,'resolved',1,'local_admin') value", [foreign.request.id, T2]), false);
    await claim("local_admin", "admin"); assert.equal((await query("select public.list_legacy_room_assistance($1,1,true) value", [T1])).totalCount, 1);
    assert.equal((await query("select public.list_legacy_room_assistance($1,1,true) value", [T2])).totalCount, 0);
  });
  await test("raw table/privileged helper access is closed for browsers and service impersonation", async () => {
    await claim(); await error(database.query("select * from public.assistance_messages"), "42501"); await error(database.query("select * from public.assistance_requests"), "42501");
    await error(query("select ironclad_private.private_assistance_request_json($1) value", [first.request.id]), "42501");
    await claim("local_admin", "admin", database, "service_role"); await error(database.query("update public.assistance_requests set status='open',resolved_at=null where id=$1", [first.request.id]), "42501");
    await error(database.query("select * from public.assistance_messages"), "42501");
    await owner(); assert.equal(await domain(), baseline);
  });

  // Additional concurrency/privacy checks follow without resetting or replacing
  // any actual authority. Every process/connection remains fixed local-only.
  await test("concurrent same-account create IDs acknowledge exactly one initial body", async () => {
    await owner(); const room = randomUUID(); await database.query("insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) select $1,match_id,player_one_registration_id,player_two_registration_id from public.match_rooms where id=$2", [room, R1]);
    const a = await connect("assistance_create_a"), b = await connect("assistance_create_b");
    await claim("local_p1", "player", a); await claim("local_p1", "player", b);
    const outcomes = await Promise.all([open(room, randomUUID(), "Draft A", a), open(room, randomUUID(), "Draft B", b)]);
    assert.equal(outcomes.filter(r => r.accepted).length, 1); assert.equal(outcomes.filter(r => !r.accepted && r.acceptedClientMessageId === null).length, 1);
    assert.equal(outcomes[0].request.id, outcomes[1].request.id);
  });
  await test("concurrent opponents and exact duplicate replies remain isolated and idempotent", async () => {
    await owner(); const room = randomUUID(); await database.query("insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) select $1,match_id,player_one_registration_id,player_two_registration_id from public.match_rooms where id=$2", [room, R1]);
    const a = await connect("assistance_opponent_a"), b = await connect("assistance_opponent_b");
    await claim("local_p1", "player", a); await claim("local_p2", "player", b);
    const [one, two] = await Promise.all([open(room, randomUUID(), "Private A", a), open(room, randomUUID(), "Private B", b)]); assert.notEqual(one.request.id, two.request.id);
    const c = await connect("assistance_reply_duplicate"); await claim("local_p1", "player", c); const nonce = randomUUID();
    const r = await Promise.all([reply(one.request.id, nonce, "Exact retry", null, a), reply(one.request.id, nonce, "Exact retry", null, c)]);
    assert.equal(r.filter(x => x.duplicate).length, 1); assert.equal(r[0].message.id, r[1].message.id);
    await error(read(two.request.id, null, 0, 50, a), "42501");
  });
  await test("two-admin status race permits one CAS and keeps the other stale", async () => {
    const a = await connect("assistance_cas_a"), b = await connect("assistance_cas_b"); await claim("local_admin", "admin", a); await claim("local_admin2", "admin", b);
    const current = await read(second.request.id, T1, 0, 50, a);
    const r = await Promise.allSettled([status(second.request.id, "in_progress", current.request.version, T1, a), status(second.request.id, "resolved", current.request.version, T1, b)]);
    assert.equal(r.filter(x => x.status === "fulfilled").length, 1); assert.equal(r.find(x => x.status === "rejected").reason.code, "40001");
  });
  await test("current account-legal guard rejects missing acceptance without storing body", async () => {
    await owner(); await database.query("delete from public.account_legal_acceptances where clerk_user_id='local_p2'");
    await claim("local_p2"); await error(reply(second.request.id, randomUUID(), "Not legally accepted"), "42501", /ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED/);
    await owner(); await database.query("insert into public.account_legal_acceptances values('local_p2','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000072',true,true)");
  });
  await test("subject locate/export is bounded and never includes opponent's private conversation", async () => {
    await claim("local_admin", "admin", database, "service_role"); const located = await query("select public.locate_private_assistance_subject($1,1000,'local_admin') value", [P1]);
    assert.ok(located.requests.every(r => r.requestId !== second.request.id));
    const result = await query("select public.export_private_assistance_subject($1,$2,0,1000,'local_admin') value", [P1, first.request.id]); assert.ok(result.messages.length > 1);
    await error(query("select public.export_private_assistance_subject($1,$2,0,1000,'local_admin') value", [P1, second.request.id]), "42501");
    await error(query("select public.redact_private_assistance_messages($1,$2,$3,'local_admin') value", [P1, first.request.id, [first.message.id]]), "55000", /Retained case/);
  });
  let privacy, privacyRoom, privacyNonce;
  await test("resolved support retains 24 months; message-specific holds prevent private purge/redaction", async () => {
    await owner(); privacyRoom = randomUUID(); privacyNonce = randomUUID();
    await database.query("insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) select $1,match_id,player_one_registration_id,player_two_registration_id from public.match_rooms where id=$2", [privacyRoom, R2]);
    await claim(); privacy = await open(privacyRoom, privacyNonce, "Privacy fixture original");
    await claim("local_admin", "admin"); await reply(privacy.request.id, randomUUID(), "Private operator reply", T2);
    let current = await read(privacy.request.id, T2); await status(privacy.request.id, "resolved", current.request.version, T2);
    await owner(); await database.query("update public.tournaments set status='cancelled',terminal_at=now()-interval '26 months' where id=$1", [T2]);
    await claim("local_admin", "admin", database, "service_role");
    let result = await query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]]); assert.equal(result.privateAssistanceMessagesDeleted, 0);
    await owner();
    // Explicit historical snapshot preparation for fictional local rows only.
    // No clock, guard, current authority or retention function is altered.
    await database.query("update public.assistance_requests set resolved_at=now()-interval '25 months' where id=$1;", [privacy.request.id]);
    await database.query("update ironclad_private.match_room_retention_cases set closed_at=now()-interval '25 months' where case_reference=$1", [privacy.request.id]);
    await database.query("insert into ironclad_private.match_room_retention_holds(room_id,message_ids,case_reference,reason,expires_at) values($1,$2,$3,'legal',now()+interval '1 day')", [privacyRoom, [privacy.message.id], randomUUID()]);
    await claim("local_admin", "admin", database, "service_role");
    await error(query("select public.redact_private_assistance_messages($1,$2,$3,'local_admin') value", [P1, privacy.request.id, [privacy.message.id]]), "55000");
    result = await query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]]); assert.equal(result.privateAssistanceMessagesDeleted, 0);
    await claim(); const retained = await read(privacy.request.id); assert.equal(retained.request.contentPurgedAt, null); assert.equal(retained.messages[0].body, "Privacy fixture original");
  });
  await test("author-scoped redaction is irreversible and an exact nonce retry never resurrects body", async () => {
    await owner(); await database.query("update ironclad_private.match_room_retention_holds set released_at=now() where room_id=$1", [privacyRoom]);
    await claim("local_admin", "admin", database, "service_role");
    await error(query("select public.redact_private_assistance_messages($1,$2,$3,'local_admin') value", [P2, privacy.request.id, [privacy.message.id]]), "42501");
    assert.equal((await query("select public.redact_private_assistance_messages($1,$2,$3,'local_admin') value", [P1, privacy.request.id, [privacy.message.id]])).redactedCount, 1);
    assert.equal((await query("select public.redact_private_assistance_messages($1,$2,$3,'local_admin') value", [P1, privacy.request.id, [privacy.message.id]])).redactedCount, 0);
    await owner(); assert.equal(await query("select body_sha256 value from public.assistance_messages where id=$1", [privacy.message.id]), null);
    await claim(); await error(open(privacyRoom, privacyNonce, "Privacy fixture original"), "55000", /MESSAGE_REDACTED/);
    await error(open(privacyRoom, privacyNonce, "Changed content cannot reuse erased nonce"), "55000", /MESSAGE_REDACTED/);
    assert.equal((await read(privacy.request.id)).messages[0].body, null);
  });
  await test("actual purge waits for accepted reply transaction and rechecks reopened support hold", async () => {
    const a = await connect("assistance_privacy_reply"), b = await connect("assistance_privacy_purge");
    await claim("local_p1", "player", a); await claim("local_admin", "admin", b, "service_role");
    await a.query("begin"); const newReply = await reply(privacy.request.id, randomUUID(), "Accepted before privacy inspection", null, a);
    assert.equal(newReply.request.status, "open");
    const pending = query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]], b);
    let waiting = false; await owner();
    for (let i = 0; i < 100; i++) { const count = await query("select count(*)::int value from pg_stat_activity where application_name='assistance_privacy_purge' and wait_event_type='Lock'"); if (count === 1) { waiting = true; break; } await delay(10); }
    assert.equal(waiting, true); await a.query("commit"); const outcome = await pending; assert.equal(outcome.privateAssistanceMessagesDeleted, 0);
    await claim(); const current = await read(privacy.request.id); assert.equal(current.request.contentPurgedAt, null); assert.ok(current.messages.some(m => m.id === newReply.message.id && m.body === "Accepted before privacy inspection"));
  });
  await test("bounded 1000-body purge resumes, preserves request identity and permanently denies resurrection", async () => {
    await claim("local_admin", "admin"); let current = await read(privacy.request.id, T2); await status(privacy.request.id, "resolved", current.request.version, T2);
    await owner(); await database.query("update public.assistance_requests set resolved_at=now()-interval '25 months' where id=$1", [privacy.request.id]);
    await database.query("update ironclad_private.match_room_retention_cases set closed_at=now()-interval '25 months' where case_reference=$1", [privacy.request.id]);
    // A synthetic historical volume snapshot exercises bounded cleanup and
    // history pagination; canonical writer/rate behavior is tested separately.
    await database.query("insert into public.assistance_messages(request_id,sequence,sender_kind,author_player_id,client_message_id,body,body_sha256,created_at) select $1,$2::bigint+i,'admin','00000000-0000-4000-8000-000000000023',gen_random_uuid(),'Historical synthetic body',sha256(convert_to('Historical synthetic body','UTF8')),now()-interval '25 months' from generate_series(1,1005)i", [privacy.request.id, current.request.lastSequence]);
    await database.query("update public.assistance_requests set last_sequence=last_sequence+1005 where id=$1", [privacy.request.id]);
    await claim(); const page = await read(privacy.request.id, null, 0, 50); assert.equal(page.messages.length, 50); assert.equal(page.hasMore, true); assert.equal(page.nextAfterSequence, 50);
    await claim("local_admin", "admin", database, "service_role"); const firstBatch = await query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]]); assert.equal(firstBatch.privateAssistanceMessagesDeleted, 1000);
    await claim(); const tombstone = await read(privacy.request.id); assert.ok(tombstone.request.contentPurgedAt); assert.ok(tombstone.messages.every(m => m.body === null && m.redactedAt)); assert.equal(tombstone.canReply, false);
    await error(reply(privacy.request.id, randomUUID(), "Cannot resurrect"), "55000"); await error(open(privacyRoom, privacyNonce, "Privacy fixture original"), "55000");
    await claim("local_admin", "admin", database, "service_role"); const finalBatch = await query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]]); assert.equal(finalBatch.privateAssistanceMessagesDeleted, 8);
    const repeated = await query("select public.purge_match_room_retention($1,'local_admin') value", [[privacyRoom]]); assert.equal(repeated.privateAssistanceMessagesDeleted, 0);
    await owner(); assert.equal(await query("select count(*)::int value from public.assistance_requests where id=$1", [privacy.request.id]), 1);
    assert.equal(await query("select count(*)::int value from public.assistance_messages where request_id=$1", [privacy.request.id]), 0);
    assert.equal(await query("select count(*)::int value from public.assistance_messages where request_id=$1", [foreign.request.id]), 1);
    await database.query("update public.tournaments set status='in_progress',terminal_at=null where id=$1", [T2]);
    assert.equal(await domain(), baseline);
  });
  await test("complete tournament counts and page-25/status filters do not truncate", async () => {
    await claim("local_admin", "admin"); const before = await queue(); await owner();
    const inserted = await database.query("with rooms as(insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) select gen_random_uuid(),match_id,player_one_registration_id,player_two_registration_id from public.match_rooms cross join generate_series(1,26)i where id=$1 returning id,match_id), requests as(insert into public.assistance_requests(source_kind,tournament_id,tournament_bracket_id,room_id,match_id,requester_registration_id,requester_player_id,creation_client_message_id,last_sequence,created_at,updated_at) select 'private_match_room',$2,'00000000-0000-0000-0000-000000000801',id,match_id,'00000000-0000-4000-8000-000000000031',$3,gen_random_uuid(),1,now()-interval '1 year',now()-interval '1 year' from rooms returning *) insert into public.assistance_messages(request_id,sequence,sender_kind,author_player_id,client_message_id,body,body_sha256,created_at) select id,1,'requester',requester_player_id,creation_client_message_id,'Historical pagination fixture',sha256(convert_to('Historical pagination fixture','UTF8')),created_at from requests returning request_id", [R1, T1, P1]);
    assert.equal(inserted.rowCount, 26);
    await claim("local_admin", "admin"); const all = await queue(); assert.equal(all.counts.all, before.counts.all + 26); assert.equal(all.requests.length, 25); assert.equal(all.pageCount, 2);
    const page2 = await queue(T1, "all", 2); assert.equal(page2.requests.length, all.counts.all - 25); assert.equal(new Set([...all.requests, ...page2.requests].map(r => r.id)).size, all.counts.all);
    const opened = await queue(T1, "open", 99); assert.equal(opened.filteredCount, all.counts.open); assert.equal(opened.page, opened.pageCount);
    assert.equal((await queue(T2)).counts.all, 2);
  });
  await test("per-account rate limits reject new writes while exact accepted retries still work", async () => {
    await owner(); const count = await query("select count(*)::int value from public.assistance_requests where requester_player_id=$1 and source_kind='private_match_room' and created_at>now()-interval '1 minute'", [P1]); assert.equal(count, 5);
    const room = randomUUID(); await database.query("insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) select $1,match_id,player_one_registration_id,player_two_registration_id from public.match_rooms where id=$2", [room, R1]);
    await claim(); await error(open(room, randomUUID(), "Too many cases"), "P0001", /ASSISTANCE_RATE_LIMITED/); assert.equal((await open(R1, initialNonce, "Initial private issue")).duplicate, true);
    await owner(); await database.query("insert into public.assistance_messages(request_id,sequence,sender_kind,author_player_id,client_message_id,body,body_sha256) select $1,10000+i,'requester',$2,gen_random_uuid(),'Synthetic rate snapshot',sha256(convert_to('Synthetic rate snapshot','UTF8')) from generate_series(1,20)i", [foreign.request.id, P1]);
    await database.query("update public.assistance_requests set last_sequence=10020 where id=$1", [foreign.request.id]);
    await claim(); await error(reply(foreign.request.id, randomUUID(), "Too many replies"), "P0001", /ASSISTANCE_RATE_LIMITED/); assert.equal((await open(R1, initialNonce, "Initial private issue")).duplicate, true);
  });
  await test("account closure scrubs new Clerk provenance and denies closed requester", async () => {
    await claim("local_admin", "admin", database, "service_role"); await query("select public.close_ironclad_player_account('local_p2') value");
    await owner(); assert.equal(await query("select count(*)::int value from public.assistance_messages where actor_clerk_user_id='local_p2'"), 0);
    assert.ok(await query("select count(*)::int value from public.assistance_messages where author_player_id=$1 and body is not null", [P2]));
    await claim("local_p2"); await error(read(second.request.id), "42501");
  });
  await test("matching closed Player cannot retain private access through an admin JWT", async () => {
    await claim("local_admin_closed", "admin");
    await error(queue(), "42501"); await error(read(first.request.id, T1), "42501");
    await error(reply(first.request.id, randomUUID(), "Closed admin reply", T1), "42501");
    await error(status(first.request.id, "resolved", 1), "42501");
    await error(query("select public.list_legacy_room_assistance($1,1,true) value", [T1]), "42501");
  });
  await test("old admin JWT loses all access after underlying closure deletes its unreferenced Player", async () => {
    await claim("local_admin", "admin", database, "service_role"); await query("select public.close_ironclad_player_account('local_admin2') value");
    await owner(); assert.equal(await query("select count(*)::int value from public.players where clerk_user_id='local_admin2'"), 0);
    await claim("local_admin2", "admin"); await error(queue(), "42501"); await error(read(first.request.id, T1), "42501");
    await error(reply(first.request.id, randomUUID(), "Deleted admin identity", T1), "42501");
    await error(status(first.request.id, "resolved", 1), "42501");
  });
  await test("old admin JWT loses access when historical closure pseudonymizes its Clerk identity", async () => {
    // The earlier real new-wrapper call closed fictional local_p2. Its
    // underlying fixture stand-in models the deployed archived identity shape;
    // these assertions test the ACTUAL helper, never a full-closure claim.
    await owner(); assert.equal(await query("select count(*)::int value from public.players where clerk_user_id='local_p2'"), 0);
    assert.equal(await query("select count(*)::int value from public.players where id=$1 and clerk_user_id like 'closed-player-%' and account_closed_at is not null", [P2]), 1);
    await claim("local_p2", "admin"); await error(queue(), "42501"); await error(read(second.request.id, T1), "42501");
    await error(reply(second.request.id, randomUUID(), "Pseudonymized admin identity", T1), "42501");
    await error(query("select public.get_private_assistance_context($1) value", [R1]), "42501");
  });
  assert.equal(digest(await readFile(resolve(ROOT, migrationPath), "utf8")), report.migrationSha256, "Migration changed during execution; rerun snapshot");
  assert.equal(digest(await readFile(resolve(ROOT, actorMigrationPath), "utf8")), report.actorMigrationSha256, "Actor migration changed during execution; rerun snapshot");
  report.passed = true;
} catch (e) { failure = e; report.passed = false; report.failure = e.message; report.errorCode = e.code; report.errorContext = e.where; }
finally {
  for (const c of clients) await c.end().catch(() => {});
  if (postgres && postgres.exitCode === null) { try { command("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "-t", "15", "stop"]); } catch (e) { report.stopFailure = e.message; report.passed = false; } }
  if (postgres?.exitCode === null) await Promise.race([new Promise(accept => postgres.once("exit", accept)), delay(3000)]);
  report.stopped = !postgres || postgres.exitCode !== null; if (!report.stopped) report.passed = false;
  await writeFile(resolve(RUN, "postgres.log"), log).catch(() => {}); await writeFile(resolve(RUN, "report.json"), `${JSON.stringify(report, null, 2)}\n`).catch(() => {}); await unlink(passwordFile).catch(() => {});
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, stopped: report.stopped, report: resolve(RUN, "report.json"), failure: report.failure, errorCode: report.errorCode, errorContext: report.errorContext }, null, 2));
}
if (failure) console.error(failure.message);
if (!report.passed) process.exitCode = 1;
