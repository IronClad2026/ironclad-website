import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Fixed disposable target only: no env files, connection strings, application
// credentials, production data, or remote fallback are consumed by this runner.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = resolve(ROOT, "../release-execution-tools");
const BIN = resolve(TOOLS, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(TOOLS, "pg-client/node_modules/pg"));
const HOST = "127.0.0.1", PORT = 56733;
const RUN = resolve(ROOT, ".release-local", `patch2-notifications-${randomUUID()}`);
assert.ok(RUN.startsWith(`${resolve(ROOT, ".release-local")}${sep}`));
const DATA = resolve(RUN, "data"), passwordFile = resolve(RUN, "init-password");
const password = randomBytes(32).toString("base64url");
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|DATABASE_|POSTGRES|SUPABASE|NEXT_PUBLIC_SUPABASE|CLERK|NEXT_PUBLIC_CLERK)/i.test(key)
));
const migrationPath = "supabase/migrations/20261101230355_patch2_admin_inbox_legacy_assistance.sql";
const migration = await readFile(resolve(ROOT, migrationPath), "utf8");
const backfillStart = migration.indexOf("\ninsert into public.assistance_requests(");
const backfillEnd = migration.indexOf("\ncreate function public.admin_notification_scope_matches(", backfillStart);
assert.ok(backfillStart >= 0 && backfillEnd > backfillStart, "Actual migration legacy backfill not found");
const legacyBackfill = migration.slice(backfillStart, backfillEnd);
const guardPath = "supabase/migrations/20260821120000_web_push_notifications.sql";
const priorSource = (await readFile(resolve(ROOT, guardPath), "utf8")).replace(/\r\n/g, "\n");
const guardStart = priorSource.indexOf("create or replace function public.protect_notification_client_mutation()");
const guardEnd = priorSource.indexOf("\n$$;", guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart, "Actual previous notification mutation guard not found");
const priorGuard = priorSource.slice(guardStart, guardEnd + 4);
const registrationAuthorityPath = "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql";
const registrationSource = (await readFile(resolve(ROOT, registrationAuthorityPath), "utf8")).replace(/\r\n/g, "\n");
const authorityStart = registrationSource.indexOf("create or replace function public.review_tournament_registration(");
const authorityEnd = registrationSource.indexOf("create or replace function public.process_expired_waitlist_offers(", authorityStart);
assert.ok(authorityStart >= 0 && authorityEnd > authorityStart);
const registrationAuthority = registrationSource.slice(authorityStart, authorityEnd);
const registrationMigrationPath = "supabase/migrations/20261101220837_patch2_scoped_registration_review.sql";
const registrationMigration = await readFile(resolve(ROOT, registrationMigrationPath), "utf8");
const foundationPath = "supabase/migrations/20260613127000_platform_notifications.sql";
const foundationSource = (await readFile(resolve(ROOT, foundationPath), "utf8")).replace(/\r\n/g, "\n");
const adminJwtStart = foundationSource.indexOf("create or replace function public.is_admin_jwt()");
const adminJwtEnd = foundationSource.indexOf("\n$$;", adminJwtStart);
const policyStart = foundationSource.indexOf("alter table public.notifications enable row level security;");
assert.ok(adminJwtStart >= 0 && adminJwtEnd > adminJwtStart && policyStart > adminJwtEnd);
const foundationPolicies = foundationSource.slice(policyStart);
const adminJwt = foundationSource.slice(adminJwtStart, adminJwtEnd + 4);
const privacyPath = "supabase/migrations/20260725090000_match_result_privacy_hardening.sql";
const privacySource = (await readFile(resolve(ROOT, privacyPath), "utf8")).replace(/\r\n/g, "\n");
const privacyEnd = privacySource.indexOf("-- The proof route must authorize");
assert.ok(privacyEnd > 0);
const privacyBoundary = privacySource.slice(0, privacyEnd);
const finishPath = "supabase/migrations/20260919235836_match_room_phase_three.sql";
const finishSource = (await readFile(resolve(ROOT, finishPath), "utf8")).replace(/\r\n/g, "\n");
const finishStart = finishSource.indexOf("create function ironclad_private.finish_match_room_notification(");
const finishEnd = finishSource.indexOf("\n$$;", finishStart);
assert.ok(finishStart >= 0 && finishEnd > finishStart);
const finishNotification = finishSource.slice(finishStart, finishEnd + 4);
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const report = {
  target: "fresh PostgreSQL 17 cluster; TCP 127.0.0.1:56733 only",
  migration: migrationPath, migrationSha256: digest(migration),
  registrationMigration: registrationMigrationPath, registrationMigrationSha256: digest(registrationMigration),
  registrationAuthoritySource: registrationAuthorityPath, registrationAuthoritySourceSha256: digest(registrationAuthority),
  notificationPolicySources: [foundationPath, privacyPath], privacyBoundarySha256: digest(privacyBoundary),
  trustedNotificationAuthoritySource: finishPath, trustedNotificationAuthoritySha256: digest(finishNotification),
  priorGuardSource: guardPath, priorGuardSha256: digest(priorGuard),
  clusterDirectory: RUN, checks: [], limitations: [
    "Both actual prepared migrations are applied together to a minimal combined fixture; not a full Supabase migration rehearsal.",
    "Actual committed registration review authority, prior notification guard, notification RLS/privacy boundary, and private notification-finishing authority are loaded. Local auth.role()/auth.jwt() claim shims do not exercise real Clerk JWT verification.",
    "Temporary broad grants/policy in one explicitly named adversarial test exercise the invoker trigger independently of the closed raw-browser RLS boundary; those grants are restored afterward.",
    "Actual capacity/ELO/FIFO, registration acceptance, result/confirmation/dispute, replay, and privacy-purge authority chains are not loaded. Synthetic domain rows are compared for unintended changes.",
    "No email, push, workers, network provider, Storage, production data, or remote resource is used.",
  ],
};
let postgres, database, failure, log = "";
const clients = new Set();
function command(name, args) {
  const r = spawnSync(resolve(BIN, `${name}.exe`), args, { env: childEnvironment, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr ?? r.stdout}`);
}
async function unusedPort() {
  await new Promise((accept, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen({ host: HOST, port: PORT, exclusive: true }, () => server.close(accept));
  });
}
async function connect(applicationName = "ironclad_patch2_notification_test") {
  const client = new Client({ host: HOST, port: PORT, database: "postgres", user: "postgres", password,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10_000, application_name: applicationName });
  try { await client.connect(); } catch (error) { await client.end().catch(() => {}); throw error; }
  clients.add(client); return client;
}
async function close(client) { clients.delete(client); await client.end(); }
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const T1 = id(1), T2 = id(2), N = (t, n) => id(t * 1000 + n);
const U = (n) => id(3000 + n), F = (n) => id(4000 + n), P = (n) => id(5000 + n);
const readSql = "select public.read_admin_notification_inbox($1::text,$2::uuid,$3::int,$4::boolean,$5::uuid) value";
const mutateSql = "select public.mutate_admin_notification_inbox($1::text,$2::uuid,$3::text,$4::uuid[]) value";
const inbox = async (scope = "tournament", tournament = T1, page = 1, unread = false, selected = null, client = database) =>
  (await client.query(readSql, [scope, tournament, page, unread, selected])).rows[0].value;
const mutate = async (action, ids = null, scope = "tournament", tournament = T1, client = database) =>
  (await client.query(mutateSql, [scope, tournament, action, ids])).rows[0].value;
const queue = async (tournament = T1, includeResolved = false, page = 1) =>
  (await database.query("select public.read_legacy_assistance_queue($1::uuid,$2::int,$3::boolean) value", [tournament, page, includeResolved])).rows[0].value;
const status = async (caseId, tournament, nextStatus, version, actor = "local_admin_a", client = database) =>
  (await client.query("select public.set_legacy_assistance_status($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text) value", [caseId, tournament, nextStatus, version, actor])).rows[0].value;
const notice = async (notificationId) => (await database.query("select * from public.notifications where id=$1", [notificationId])).rows[0];
const assistance = async (notificationId) => (await database.query("select * from public.assistance_requests where source_notification_id=$1", [notificationId])).rows[0];
const domainSnapshot = async () => digest((await database.query("select jsonb_build_object('registrations',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),'matches',(select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m),'rooms',(select jsonb_agg(to_jsonb(m) order by id) from public.match_rooms m),'roomAssistance',(select jsonb_agg(to_jsonb(a) order by room_id) from public.match_room_assistance a)) value")).rows[0].value);
const fullSnapshot = async () => digest({ domain: await domainSnapshot(),
  notices: (await database.query("select * from public.notifications order by id")).rows,
  cases: (await database.query("select * from public.assistance_requests order by id")).rows });
async function expectError(operation, code, message) {
  await assert.rejects(operation, (error) => { if (code) assert.equal(error.code, code); if (message) assert.match(error.message, message); return true; });
}
async function unchanged(operation, code = "22023", message) {
  const before = await fullSnapshot(); await expectError(operation, code, message); assert.equal(await fullSnapshot(), before);
}
async function claim(role = "service_role", sub = "local_admin_a", client = database) {
  await client.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claims',$3,false)",
    [role, sub, JSON.stringify({ role, sub, metadata: { role: sub.startsWith("local_admin") ? "admin" : "player" } })]);
}
async function test(name, operation, reset = true) {
  await database.query("reset role"); await claim();
  if (reset) {
    await database.query("truncate public.assistance_requests,public.match_room_assistance,public.match_rooms,public.notifications,public.registrations,public.tournament_brackets,public.tournament_matches,public.tournaments,public.players restart identity");
    // Hydrate a historical snapshot first (including the existing state-to-
    // notification link), then execute the migration's actual backfill again.
    await database.query("alter table public.notifications disable trigger notifications_capture_legacy_assistance");
    try { await database.query("select public.patch2_seed_notifications()"); }
    finally { await database.query("alter table public.notifications enable trigger notifications_capture_legacy_assistance"); }
    await database.query(legacyBackfill);
  }
  try { await operation(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { await database.query("reset role"); await claim(); }
}
async function waitForLock(name) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { rows } = await database.query("select count(*)::int n from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [name]);
    if (rows[0].n === 1) return; await delay(25);
  }
  throw new Error("Concurrent local request did not reach expected row lock wait");
}

try {
  await unusedPort(); await mkdir(resolve(ROOT, ".release-local"), { recursive: true }); await mkdir(RUN);
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600, flag: "wx" });
  command("initdb", ["-D", DATA, "-U", "postgres", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  await unlink(passwordFile);
  postgres = spawn(resolve(BIN, "postgres.exe"), ["-D", DATA, "-h", HOST, "-p", String(PORT), "-c", "unix_socket_directories=", "-c", "max_connections=12", "-c", "shared_buffers=16MB"],
    { env: childEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  postgres.stdout.on("data", (chunk) => { log += chunk; }); postgres.stderr.on("data", (chunk) => { log += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (postgres.exitCode !== null) throw new Error(`Local PostgreSQL exited before readiness: ${log}`);
    try { database = await connect(); break; } catch { await delay(100); }
  }
  assert.ok(database, "Local PostgreSQL did not become ready");
  const identity = (await database.query("select host(inet_server_addr()) host,inet_server_port() port,current_user,version() version,current_setting('listen_addresses') listen,current_setting('data_directory') data_directory")).rows[0];
  assert.equal(identity.host, HOST); assert.equal(identity.port, PORT); assert.equal(identity.current_user, "postgres");
  assert.equal(identity.listen, HOST); assert.equal(resolve(identity.data_directory), DATA); assert.match(identity.version, /PostgreSQL 17\./);
  report.databaseIdentity = identity;
  await database.query(await readFile(resolve(ROOT, "tests/patch2-db/notification-schema.sql"), "utf8"));
  await database.query(adminJwt);
  await database.query(foundationPolicies);
  await database.query(privacyBoundary + "\ncommit;");
  await database.query(registrationAuthority);
  const beforeReviewAuthority = (await database.query("select pg_get_functiondef('public.review_tournament_registration(uuid,text,text)'::regprocedure) definition")).rows[0].definition;
  await database.query(registrationMigration);
  await database.query(priorGuard);
  await database.query(finishNotification);
  await database.query(`alter function ironclad_private.finish_match_room_notification(uuid,boolean) owner to postgres;
    revoke all on function ironclad_private.finish_match_room_notification(uuid,boolean) from public,anon,authenticated,service_role;
    create function public.patch2_test_trusted_finish(uuid,boolean) returns void language sql security definer set search_path=pg_catalog as $$
      select ironclad_private.finish_match_room_notification($1,$2); $$;
    revoke all on function public.patch2_test_trusted_finish(uuid,boolean) from public,anon,service_role;
    grant execute on function public.patch2_test_trusted_finish(uuid,boolean) to authenticated;`);
  await database.query("create trigger notifications_client_mutation_guard before insert or update or delete on public.notifications for each row execute function public.protect_notification_client_mutation()");
  const beforeMigration = await domainSnapshot();
  await claim(); await database.query(migration); report.migrationApplied = true;
  assert.equal((await database.query("select pg_get_functiondef('public.review_tournament_registration(uuid,text,text)'::regprocedure) definition")).rows[0].definition, beforeReviewAuthority);
  report.bothMigrationsAppliedTogether = true;
  report.originalReviewAuthorityUnchanged = true;
  report.loadedAuthorityBodyHashes = (await database.query("select n.nspname schema,p.proname name,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('review_tournament_registration','protect_notification_client_mutation')) or (n.nspname='ironclad_private' and p.proname='finish_match_room_notification') order by n.nspname,p.proname")).rows;
  assert.equal(await domainSnapshot(), beforeMigration);

  await test("migration captures visible, hidden-unknown and unassigned legacy requests without changing domain rows", async () => {
    const rows = (await database.query("select * from public.assistance_requests")).rows;
    assert.equal(rows.length, 4);
    assert.equal((await assistance(N(1, 1))).status, "open");
    assert.equal((await assistance(N(1, 90))).legacy_resolution_unknown, true);
    assert.equal((await assistance(N(1, 90))).status, "open");
    assert.equal((await assistance(U(1))).tournament_id, null);
    assert.equal((await queue(T1)).totalCount, 3); assert.equal((await queue(null)).totalCount, 1);
    assert.equal(await domainSnapshot(), beforeMigration);
  }, false);
  await test("modern notices require actual matching room plus exact canonical event or transferred participant state", async () => {
    for (const n of [3, 4, 6]) assert.equal(await assistance(N(1, n)), undefined);
    assert.ok(await assistance(N(1, 5)), "Malformed old room hint remains legacy");
  });
  await test("newly inserted legacy requests capture once; modern inserts do not", async () => {
    await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id) values($1,'admin','match.admin_assistance_requested','New legacy','Local issue',$2)", [id(9001), T1]);
    assert.equal((await assistance(id(9001))).status, "open");
    await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id,match_id,metadata,event_key) values($1,'admin','match.admin_assistance_requested','New modern','Local issue',$2,$3,'{\"roomId\":\"10000000-0000-4000-8000-000000000001\"}','match-room:10000000-0000-4000-8000-000000000001:assistance:7')", [id(9002), T1, id(201)]);
    assert.equal(await assistance(id(9002)), undefined);
    await mutate("dismiss", [id(9001), id(9001)]); await mutate("dismiss", [id(9001)]);
    assert.equal((await database.query("select count(*)::int n from public.assistance_requests where source_notification_id=$1", [id(9001)])).rows[0].n, 1);
  });
  await test("an old service-role assistance writer is durably captured without a new inbox client", async () => {
    await database.query("set role service_role");
    await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id) values($1,'admin','match.admin_assistance_requested','Old service request','Unanswered legacy issue',$2)", [id(9005), T1]);
    await database.query("reset role");
    const captured = await assistance(id(9005)); assert.equal(captured.status, "open");
    assert.equal(captured.tournament_id, T1); assert.equal(captured.legacy_resolution_unknown, false);
    assert.equal((await queue(T1)).requests.some((request) => request.source_notification_id === id(9005)), true);
  });
  await test("unknown UUID, wrong match, untransferred room and malformed canonical hints retain legacy review", async () => {
    const room = "10000000-0000-4000-8000-000000000002";
    await database.query("insert into public.match_rooms values($1,$2,$3,null)", [room, id(201), id(101)]);
    const cases = [
      [id(9010), "10000000-0000-4000-8000-000000000099", id(201), null],
      [id(9011), "10000000-0000-4000-8000-000000000001", id(202), "match-room:10000000-0000-4000-8000-000000000001:assistance:4"],
      [id(9012), room, id(201), null],
      [id(9013), room, id(201), `match-room:${room}:assistance:0`],
      [id(9014), room, id(201), `match-room:${room}:assistance:1:extra`],
    ];
    for (const [notificationId, roomId, matchId, eventKey] of cases) {
      await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id,registration_id,match_id,metadata,event_key) values($1,'admin','match.admin_assistance_requested','Old hint','Needs review',$2,$3,$4,$5::jsonb,$6)", [notificationId, T1, id(101), matchId, JSON.stringify({ roomId }), eventKey]);
      assert.equal((await assistance(notificationId)).status, "open");
    }
  });
  await test("canonical writer's matching notice is excluded before assistance state exists", async () => {
    const room = "10000000-0000-4000-8000-000000000002";
    await database.query("insert into public.match_rooms values($1,$2,$3,null)", [room, id(201), id(101)]);
    await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id,match_id,metadata,event_key) values($1,'admin','match.admin_assistance_requested','Canonical request','State follows notification',$2,$3,$4::jsonb,$5)", [id(9015), T1, id(201), JSON.stringify({ roomId: room }), `match-room:${room}:assistance:1`]);
    assert.equal(await assistance(id(9015)), undefined);
    assert.equal((await database.query("select count(*)::int n from public.match_room_assistance where room_id=$1", [room])).rows[0].n, 0);
  });
  await test("old writer after resolved canonical room state creates a separate open legacy case that dismissal preserves", async () => {
    const room = "10000000-0000-4000-8000-000000000001";
    await database.query("update public.match_room_assistance set status='resolved' where room_id=$1", [room]);
    await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id,registration_id,match_id,metadata,event_key) values($1,'admin','match.admin_assistance_requested','Old client request','Separate unanswered issue',$2,$3,$4,$5::jsonb,'old-writer-after-resolution')", [id(9016), T1, id(101), id(201), JSON.stringify({ roomId: room })]);
    const record = await assistance(id(9016)); assert.equal(record.status, "open");
    const beforeCase = digest(record), domain = await domainSnapshot(); await mutate("dismiss", [id(9016)]);
    assert.equal(digest(await assistance(id(9016))), beforeCase); assert.equal(await domainSnapshot(), domain);
    assert.equal((await database.query("select status from public.match_room_assistance where room_id=$1", [room])).rows[0].status, "resolved");
  });
  await test("old writer concurrent with room-status resolution still captures a separate open case", async () => {
    const resolver = await connect("patch2_old_writer_resolver"), writer = await connect("patch2_old_writer_concurrent");
    const room = "10000000-0000-4000-8000-000000000001";
    try {
      await resolver.query("begin"); await resolver.query("update public.match_room_assistance set status='resolved' where room_id=$1", [room]);
      await writer.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id,registration_id,match_id,metadata,event_key) values($1,'admin','match.admin_assistance_requested','Concurrent old client','Separate unanswered issue',$2,$3,$4,$5::jsonb,'old-writer-during-resolution')", [id(9017), T1, id(101), id(201), JSON.stringify({ roomId: room })]);
      await resolver.query("commit"); assert.equal((await assistance(id(9017))).status, "open");
      await mutate("dismiss", [id(9017)]); assert.equal((await assistance(id(9017))).status, "open");
    } finally { await resolver.query("rollback"); await close(resolver); await close(writer); }
  });
  await test("full and unread pagination use complete scoped counts and bounded pages", async () => {
    const seen = [];
    for (let p = 1; p <= 4; p += 1) {
      const result = await inbox("tournament", T1, p);
      assert.equal(result.totalCount, 80); assert.equal(result.unreadCount, 60); assert.equal(result.filteredCount, 80);
      assert.equal(result.pageCount, 4); assert.equal(result.page, p); assert.equal(result.notifications.length, p === 4 ? 5 : 25);
      seen.push(...result.notifications.map((n) => n.id));
    }
    assert.deepEqual(seen, Array.from({ length: 80 }, (_, i) => N(1, 80 - i)));
    const unread = await inbox("tournament", T1, 3, true);
    assert.equal(unread.totalCount, 80); assert.equal(unread.unreadCount, 60); assert.equal(unread.filteredCount, 60);
    assert.equal(unread.pageCount, 3); assert.equal(unread.notifications.length, 10); assert.ok(unread.notifications.every((n) => n.read_at === null));
    assert.equal((await inbox("tournament", T1, 999)).page, 4);
    assert.equal((await inbox("tournament", T2)).totalCount, 80);
  });
  await test("scoped detail can select off-page own row; foreign, missing, hidden and player details return null", async () => {
    assert.equal((await inbox("tournament", T1, 1, false, N(1, 1))).selectedNotification.id, N(1, 1));
    for (const target of [N(2, 1), id(9999), N(1, 90), P(1), F(1), U(1)])
      assert.equal((await inbox("tournament", T1, 1, false, target)).selectedNotification, null);
  });
  await test("explicit platform and unassigned scopes never infer tournament or misclassify flagged tournament rows", async () => {
    const platform = await inbox("platform", null), unassigned = await inbox("unassigned", null);
    assert.equal(platform.totalCount, 2); assert.equal(unassigned.totalCount, 4);
    assert.ok(platform.notifications.every((n) => n.tournament_id === null && n.metadata.adminInboxScope === "platform"));
    assert.ok(unassigned.notifications.some((n) => n.id === U(2) && n.registration_id === id(101)));
    assert.equal((await inbox("platform", null, 1, false, N(1, 2))).selectedNotification, null);
    assert.equal((await inbox("unassigned", null, 1, false, N(1, 2))).selectedNotification, null);
  });
  await test("mark-one and selected across pages stay tournament scoped and idempotent", async () => {
    assert.equal(await mutate("read", [N(1, 1)]), 1);
    assert.equal(await mutate("read", [N(1, 1)]), 0);
    assert.equal(await mutate("read", [N(1, 2), N(1, 79), N(1, 79)]), 2);
    assert.equal((await inbox()).unreadCount, 57); assert.equal((await inbox("tournament", T2)).unreadCount, 60);
  });
  await test("mark all reads every active tournament page, excluding hidden and other scopes", async () => {
    const beforeDomain = await domainSnapshot(); assert.equal(await mutate("read_all"), 60);
    assert.equal((await inbox()).unreadCount, 0); assert.equal((await inbox()).totalCount, 80);
    assert.equal((await inbox("tournament", T2)).unreadCount, 60);
    assert.equal((await notice(N(1, 90))).read_at, null); assert.equal((await notice(P(1))).read_at, null);
    assert.equal(await mutate("read_all"), 0); assert.equal(await domainSnapshot(), beforeDomain);
    const unread = await inbox("tournament", T1, 99, true);
    assert.equal(unread.filteredCount, 0); assert.equal(unread.pageCount, 1); assert.equal(unread.page, 1); assert.equal(unread.notifications.length, 0);
  });
  for (const action of ["read", "dismiss"]) for (const [label, ids] of [
    ["mixed tournaments", [N(1, 1), N(2, 1)]], ["missing target", [N(1, 1), id(9999)]],
    ["player notification", [N(1, 1), P(1)]], ["wrong inbox scope", [N(1, 1), U(1)]],
  ]) await test(`${action} rejects ${label} atomically`, () => unchanged(() => mutate(action, ids)));
  for (const [label, operation] of [
    ["missing tournament", () => inbox("tournament", null)], ["extra tournament in platform", () => inbox("platform", T1)],
    ["unknown scope", () => inbox("invented", null)], ["zero page", () => inbox("tournament", T1, 0)],
    ["null unread", () => inbox("tournament", T1, 1, null)], ["nonexistent tournament", () => inbox("tournament", id(9999))],
    ["platform read-all", () => mutate("read_all", null, "platform", null)],
    ["unassigned read-all", () => mutate("read_all", null, "unassigned", null)],
    ["read-all explicit IDs", () => mutate("read_all", [N(1, 1)])],
    ["empty selected", () => mutate("read", [])], ["null selected", () => mutate("dismiss", null)],
    ["null target", () => mutate("dismiss", [N(1, 1), null])],
    ["over100", () => mutate("read", Array.from({ length: 101 }, (_, i) => id(10000 + i)))],
    ["unknown action", () => mutate("invented", [N(1, 1)])],
  ]) await test(`explicit context validation rejects ${label}`, () => unchanged(operation));
  await test("platform and unassigned individual actions remain distinct", async () => {
    assert.equal(await mutate("read", [F(1)], "platform", null), 1);
    await unchanged(() => mutate("dismiss", [U(1)], "platform", null));
    assert.equal(await mutate("dismiss", [U(1)], "unassigned", null), 1);
    assert.ok(await assistance(U(1))); assert.equal((await queue(null)).totalCount, 1);
  });
  await test("two simulated service callers see shared administrator read and dismissal state", async () => {
    await claim("service_role", "local_admin_a"); await mutate("read", [N(1, 1)]);
    await claim("service_role", "local_admin_b"); assert.ok((await inbox("tournament", T1, 1, false, N(1, 1))).selectedNotification.read_at);
    await mutate("dismiss", [N(1, 1)]); await claim("service_role", "local_admin_a");
    assert.equal((await inbox("tournament", T1, 1, false, N(1, 1))).selectedNotification, null);
    assert.equal((await assistance(N(1, 1))).status, "open");
  });
  await test("modern and legacy dismissal preserves notification rows, queue, waitlist, results, bracket, deadlines and replays", async () => {
    const beforeDomain = await domainSnapshot(), beforeCases = digest((await database.query("select * from public.assistance_requests order by id")).rows);
    const total = (await database.query("select count(*)::int n from public.notifications")).rows[0].n;
    await mutate("read", [N(1, 1), N(1, 6)]); await mutate("dismiss", [N(1, 1), N(1, 6)]);
    assert.ok((await notice(N(1, 1))).in_app_hidden_at); assert.ok((await notice(N(1, 6))).in_app_hidden_at);
    assert.equal((await database.query("select count(*)::int n from public.notifications")).rows[0].n, total);
    assert.equal(await domainSnapshot(), beforeDomain);
    assert.equal(digest((await database.query("select * from public.assistance_requests order by id")).rows), beforeCases);
    assert.equal((await queue(T1)).totalCount, 3);
  });
  await test("defensive dismissal captures a legacy import that bypassed its insert trigger", async () => {
    await database.query("alter table public.notifications disable trigger notifications_capture_legacy_assistance");
    try { await database.query("insert into public.notifications(id,recipient_role,type,title,message,tournament_id) values($1,'admin','match.admin_assistance_requested','Imported request','Unanswered',$2)", [id(9003), T1]); }
    finally { await database.query("alter table public.notifications enable trigger notifications_capture_legacy_assistance"); }
    assert.equal(await assistance(id(9003)), undefined); await mutate("dismiss", [id(9003)]);
    assert.equal((await assistance(id(9003))).status, "open"); assert.equal((await assistance(id(9003))).legacy_resolution_unknown, false);
  });
  await test("legacy status is explicit, tournament scoped and compare-and-set protected", async () => {
    const record = await assistance(N(1, 1)), beforeNotice = digest(await notice(N(1, 1))), beforeDomain = await domainSnapshot();
    assert.equal(await status(record.id, T2, "resolved", 1), false);
    assert.equal(await status(record.id, T1, "in_progress", 1), true);
    assert.equal(await status(record.id, T1, "resolved", 1, "local_admin_b"), false);
    assert.equal(await status(record.id, T1, "resolved", 2, "local_admin_b"), true);
    const updated = await assistance(N(1, 1)); assert.equal(updated.status, "resolved"); assert.equal(Number(updated.version), 3);
    assert.equal(updated.updated_by_player_id, id(11)); assert.ok(updated.resolved_at);
    assert.equal((await queue(T1)).totalCount, 2); assert.equal((await queue(T1, true)).totalCount, 3);
    assert.equal(digest(await notice(N(1, 1))), beforeNotice); assert.equal(await domainSnapshot(), beforeDomain);
  });
  await test("status privacy stores nullable player FK with no raw Clerk ID and survives pseudonymization/deletion", async () => {
    const columns = (await database.query("select column_name from information_schema.columns where table_schema='public' and table_name='assistance_requests'")).rows.map((r) => r.column_name);
    assert.ok(columns.includes("updated_by_player_id")); assert.ok(!columns.includes("updated_by_clerk_user_id"));
    const record = await assistance(N(1, 1));
    assert.equal(await status(record.id, T1, "in_progress", 1, "local_admin_closed"), true);
    assert.equal((await assistance(N(1, 1))).updated_by_player_id, null);
    assert.equal(await status(record.id, T1, "in_progress", 2, "local_admin_missing"), true);
    assert.equal((await assistance(N(1, 1))).updated_by_player_id, null);
    assert.equal(await status(record.id, T1, "in_progress", 3), true);
    await database.query("update public.players set clerk_user_id='deleted:local-admin-a',account_closed_at=now() where id=$1", [id(10)]);
    const updated = await assistance(N(1, 1)); assert.equal(updated.updated_by_player_id, id(10));
    assert.ok(!JSON.stringify(updated).includes("local_admin_a"));
    await database.query("delete from public.players where id=$1", [id(10)]);
    assert.equal((await assistance(N(1, 1))).updated_by_player_id, null);
  });
  await test("explicit review of an uncertain legacy request clears uncertainty without changing inbox state", async () => {
    const record = await assistance(N(1, 90)), beforeNotice = digest(await notice(N(1, 90)));
    assert.equal(await status(record.id, T1, "in_progress", 1), true);
    assert.equal((await assistance(N(1, 90))).legacy_resolution_unknown, false);
    assert.equal(digest(await notice(N(1, 90))), beforeNotice);
  });
  const rpcSignatures = ["public.read_admin_notification_inbox(text,uuid,integer,boolean,uuid)", "public.mutate_admin_notification_inbox(text,uuid,text,uuid[])", "public.read_legacy_assistance_queue(uuid,integer,boolean)", "public.set_legacy_assistance_status(uuid,uuid,text,bigint,text)"];
  await test("all new RPCs are service-role-only security-definer with safe search_path; legacy table has RLS", async () => {
    for (const signature of rpcSignatures) {
      const r = (await database.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role from pg_proc p where p.oid=$1::regprocedure", [signature])).rows[0];
      assert.equal(r.prosecdef, true); assert.deepEqual(r.proconfig, ["search_path=pg_catalog"]);
      assert.equal(r.anon, false); assert.equal(r.authenticated, false); assert.equal(r.service_role, true);
    }
    assert.equal((await database.query("select relrowsecurity from pg_class where oid='public.assistance_requests'::regclass")).rows[0].relrowsecurity, true);
    assert.equal((await database.query("select count(*)::int n from pg_policies where schemaname='public' and tablename='notifications' and policyname='Admins can mark admin notifications read'")).rows[0].n, 0);
  });
  for (const role of ["anon", "authenticated"]) {
    await test(`${role} execution is denied for inbox and assistance RPCs even with spoofed service claim`, async () => {
      const record = await assistance(N(1, 1)), before = await fullSnapshot(); await database.query(`set role ${role}`);
      for (const operation of [() => inbox(), () => mutate("read", [N(1, 1)]), () => queue(), () => status(record.id, T1, "resolved", 1)])
        await expectError(operation, "42501", /permission denied/);
      await database.query("reset role"); assert.equal(await fullSnapshot(), before);
    });
    await test(`${role} claim is rejected within inbox and assistance RPC bodies`, async () => {
      const record = await assistance(N(1, 1)); await claim(role);
      for (const operation of [() => inbox(), () => mutate("read", [N(1, 1)]), () => queue(), () => status(record.id, T1, "resolved", 1)])
        await unchanged(operation, "42501", /Service role required/);
    });
  }
  await test("actual hardened notification RLS retains zero raw browser policies and no full-row SELECT grant", async () => {
    assert.equal((await database.query("select count(*)::int n from pg_policies where schemaname='public' and tablename='notifications'")).rows[0].n, 0);
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await database.query("select has_table_privilege($1,'public.notifications','SELECT') allowed", [role])).rows[0].allowed, false);
    }
  });
  for (const subject of ["local_same_player", "local_admin_a"]) {
    await test(`hardened browser boundary denies ${subject} raw player, hybrid and admin reads/updates`, async () => {
      const before = await fullSnapshot(); await claim("authenticated", subject); await database.query("set role authenticated");
      for (const target of [P(1), P(2), N(1, 1)]) {
        await expectError(() => database.query("select * from public.notifications where id=$1", [target]), "42501", /permission denied/);
        await expectError(() => database.query("update public.notifications set read_at=now() where id=$1", [target]), "42501", /permission denied/);
      }
      await database.query("reset role"); assert.equal(await fullSnapshot(), before);
    });
  }
  await test("temporary adversarial browser grants cannot bypass invoker admin guard; safe player/null-role read and hide still work", async () => {
    await database.query("insert into public.notifications(id,recipient_clerk_user_id,recipient_role,type,title,message) values($1,'local_same_player',null,'local.player','Null role player','Local fixture')", [P(3)]);
    await database.query(`grant select,update,delete on public.notifications to authenticated;
      create policy patch2_trigger_adversary on public.notifications for all to authenticated using(true) with check(true);`);
    try {
      await claim("authenticated", "local_admin_a"); await database.query("set role authenticated");
      for (const target of [N(1, 1), P(2)]) {
        await expectError(() => database.query("update public.notifications set read_at=now() where id=$1", [target]), "42501", /selected tournament inbox/);
        await expectError(() => database.query("update public.notifications set in_app_hidden_at=now() where id=$1", [target]), "42501", /selected tournament inbox/);
      }
      for (const target of [P(1), P(3)]) {
        assert.equal((await database.query("update public.notifications set read_at=now(),in_app_hidden_at=now() where id=$1", [target])).rowCount, 1);
      }
    } finally {
      await database.query("reset role; drop policy patch2_trigger_adversary on public.notifications; revoke all privileges on public.notifications from authenticated");
    }
    assert.ok((await notice(P(1))).read_at); assert.ok((await notice(P(3))).in_app_hidden_at);
    assert.equal((await notice(N(1, 1))).read_at, null); assert.equal((await notice(P(2))).read_at, null);
  });
  for (const [label, sql] of [
    ["global read", "update public.notifications set read_at=now() where recipient_role='admin'"],
    ["global hide", "update public.notifications set in_app_hidden_at=now() where recipient_role='admin'"],
    ["legacy physical delete", "delete from public.notifications where recipient_role='admin' and event_key is null"],
  ]) await test(`old raw service-role ${label} fails atomically after both migrations`, async () => {
    const before = await fullSnapshot(); await database.query("set role service_role");
    await expectError(() => database.query(sql), "42501", /scoped admin inbox/);
    await database.query("reset role"); assert.equal(await fullSnapshot(), before);
  });
  await test("new scoped RPC succeeds under actual service-role database execution context", async () => {
    const domain = await domainSnapshot(); await database.query("set role service_role");
    assert.equal(await mutate("read", [N(1, 1)]), 1); assert.equal(await mutate("dismiss", [N(1, 1)]), 1);
    assert.equal((await queue(T1)).requests.some((request) => request.source_notification_id === N(1, 1)), true);
    await database.query("reset role"); assert.equal(await domainSnapshot(), domain);
    assert.equal((await assistance(N(1, 1))).status, "open");
  });
  await test("raw service outbox status writes remain permitted without changing inbox visibility", async () => {
    await database.query("set role service_role");
    assert.equal((await database.query("update public.notifications set push_delivery_status='retryable_failure',push_attempt_count=1 where id=$1", [N(1, 1)])).rowCount, 1);
    await database.query("reset role");
    assert.equal((await notice(N(1, 1))).push_delivery_status, "retryable_failure");
    assert.equal((await notice(N(1, 1))).read_at, null); assert.equal((await notice(N(1, 1))).in_app_hidden_at, null);
  });
  await test("authenticated postgres-owned actual notification finisher preserves modern resolution and cancels pending push", async () => {
    const before = await domainSnapshot();
    await database.query("update public.notifications set push_delivery_status='pending',push_next_attempt_at='2026-12-01Z' where id=$1", [N(1, 3)]);
    await claim("authenticated", "local_admin_a"); await database.query("set role authenticated");
    await database.query("select public.patch2_test_trusted_finish($1,true)", [N(1, 3)]);
    await database.query("reset role");
    const finished = await notice(N(1, 3));
    assert.ok(finished.read_at); assert.ok(finished.in_app_hidden_at);
    assert.equal(finished.push_delivery_status, "skipped"); assert.equal(finished.push_next_attempt_at, null);
    assert.equal(finished.push_last_error_code, "NO_LONGER_UNREAD"); assert.ok(finished.push_completed_at);
    assert.equal(await domainSnapshot(), before);
  });
  await test("actual trusted notification finisher preserves an active processing push claim", async () => {
    await database.query("update public.notifications set push_delivery_status='processing',push_claim_token=$1,push_claim_expires_at='2026-12-01Z' where id=$2", [id(9876), N(1, 6)]);
    await claim("authenticated", "local_admin_a"); await database.query("set role authenticated");
    await database.query("select public.patch2_test_trusted_finish($1,true)", [N(1, 6)]);
    await database.query("reset role");
    const finished = await notice(N(1, 6)); assert.ok(finished.read_at); assert.ok(finished.in_app_hidden_at);
    assert.equal(finished.push_delivery_status, "processing"); assert.equal(finished.push_claim_token, id(9876));
    assert.equal(finished.push_completed_at, null);
  });
  await test("legacy registration review signature and both new scoped wrappers coexist under service-role execution", async () => {
    await database.query("insert into public.registrations(id,tournament_id,tournament_bracket_id,clerk_user_id,registration_status) values($1,$2,$3,'legacy_review_fixture','pending'),($4,$2,$3,'scoped_review_fixture','pending'),($5,$2,$3,'bulk_review_fixture','pending')", [id(9101), T1, id(801), id(9102), id(9103)]);
    await database.query("set role service_role");
    assert.equal((await database.query("select * from public.review_tournament_registration($1,'rejected','Old session rejection')", [id(9101)])).rows[0].registration_status, "rejected");
    assert.equal((await database.query("select * from public.review_tournament_registration_scoped($1,$2,'approved','Scoped approval')", [T1, id(9102)])).rows[0].registration_status, "approved");
    const result = await database.query("select * from public.approve_tournament_registrations_scoped($1,$2::uuid[])", [T1, [id(9103)]]);
    assert.equal(result.rows[0].error_message, null);
    await database.query("reset role");
    assert.equal((await database.query("select admin_notes from public.registrations where id=$1", [id(9101)])).rows[0].admin_notes, "Old session rejection");
    assert.equal((await database.query("select registration_status from public.registrations where id=$1", [id(9103)])).rows[0].registration_status, "approved");
  });
  await test("old signature retains waitlist note/rejection behavior and withdrawn/launch finality after both migrations", async () => {
    await database.query("insert into public.registrations(id,tournament_id,tournament_bracket_id,clerk_user_id,registration_status) values($1,$2,$3,'withdrawn_fixture','withdrawn'),($4,$2,$5,'launched_fixture','pending')", [id(9201), T1, id(801), id(9202), id(803)]);
    await database.query("set role service_role");
    await database.query("select * from public.review_tournament_registration($1,'waitlisted','Waitlist note')", [id(101)]);
    await database.query("select * from public.review_tournament_registration($1,'rejected',null)", [id(101)]);
    await expectError(() => database.query("select * from public.review_tournament_registration($1,'approved',null)", [id(9201)]), "P0001", /withdrawn registration is final/);
    await database.query("select * from public.review_tournament_registration($1,'withdrawn','Historical note')", [id(9201)]);
    await expectError(() => database.query("select * from public.review_tournament_registration($1,'approved',null)", [id(9202)]), "P0001", /division has launched/);
    await database.query("select * from public.review_tournament_registration($1,'pending','Launched note')", [id(9202)]);
    await database.query("reset role");
    const waitlist = (await database.query("select * from public.registrations where id=$1", [id(101)])).rows[0];
    assert.equal(waitlist.admin_notes, "Waitlist note"); assert.equal(waitlist.registration_status, "rejected");
    assert.equal(waitlist.waitlist_offer_status, "cancelled"); assert.ok(waitlist.waitlist_offer_resolved_at);
  });
  await test("concurrent duplicate read and dismissal are idempotent and create one unchanged legacy case", async () => {
    const a = await connect("patch2_notif_idempotent_a"), b = await connect("patch2_notif_idempotent_b");
    try {
      await claim("service_role", "local_admin_a", a); await claim("service_role", "local_admin_b", b);
      const before = digest(await assistance(N(1, 1))), domain = await domainSnapshot();
      assert.deepEqual((await Promise.all([mutate("read", [N(1, 1)], "tournament", T1, a), mutate("read", [N(1, 1)], "tournament", T1, b)])).sort(), [0, 1]);
      assert.deepEqual((await Promise.all([mutate("dismiss", [N(1, 1)], "tournament", T1, a), mutate("dismiss", [N(1, 1)], "tournament", T1, b)])).sort(), [0, 1]);
      assert.equal(digest(await assistance(N(1, 1))), before); assert.equal(await domainSnapshot(), domain);
      assert.equal((await database.query("select count(*)::int n from public.assistance_requests where source_notification_id=$1", [N(1, 1)])).rows[0].n, 1);
    } finally { await close(a); await close(b); }
  });
  await test("simultaneous read and dismissal both succeed without resolving support", async () => {
    const a = await connect("patch2_notif_mixed_a"), b = await connect("patch2_notif_mixed_b");
    try {
      await claim("service_role", "local_admin_a", a); await claim("service_role", "local_admin_b", b);
      const results = await Promise.all([mutate("read", [N(1, 1)], "tournament", T1, a), mutate("dismiss", [N(1, 1)], "tournament", T1, b)]);
      assert.ok(results.every((n) => n === 0 || n === 1)); assert.ok((await notice(N(1, 1))).in_app_hidden_at);
      assert.equal((await assistance(N(1, 1))).status, "open"); assert.equal(Number((await assistance(N(1, 1))).version), 1);
    } finally { await close(a); await close(b); }
  });
  await test("concurrent assistance compare-and-set permits one explicit status transition", async () => {
    const a = await connect("patch2_case_cas_a"), b = await connect("patch2_case_cas_b");
    try {
      await claim("service_role", "local_admin_a", a); await claim("service_role", "local_admin_b", b);
      const record = await assistance(N(1, 1));
      const outcomes = await Promise.all([status(record.id, T1, "in_progress", 1, "local_admin_a", a), status(record.id, T1, "resolved", 1, "local_admin_b", b)]);
      assert.deepEqual(outcomes.sort(), [false, true]); assert.equal(Number((await assistance(N(1, 1))).version), 2);
    } finally { await close(a); await close(b); }
  });
  await test("scope change during row-lock wait rejects the complete batch before writing", async () => {
    const blocker = await connect("patch2_notif_scope_blocker"), contender = await connect("patch2_notif_scope_waiter"); let pending;
    try {
      await blocker.query("begin"); await blocker.query("select id from public.notifications where id=$1 for update", [N(1, 2)]);
      await claim("service_role", "local_admin_b", contender);
      pending = mutate("read", [N(1, 2), N(1, 7)], "tournament", T1, contender).then(() => ({ accepted: true }), (error) => ({ error }));
      await waitForLock("patch2_notif_scope_waiter");
      await blocker.query("update public.notifications set tournament_id=$1 where id=$2", [T2, N(1, 2)]); await blocker.query("commit");
      const outcome = await pending; assert.equal(outcome.error?.code, "22023");
      assert.equal((await notice(N(1, 2))).read_at, null); assert.equal((await notice(N(1, 7))).read_at, null);
    } finally { await blocker.query("rollback"); if (pending) await pending; await close(blocker); await close(contender); }
  });
  assert.equal(digest(await readFile(resolve(ROOT, migrationPath), "utf8")), report.migrationSha256, "Migration changed while tests were running; rerun the new snapshot");
  report.passed = report.checks.every((entry) => entry.passed);
} catch (error) { failure = error; report.passed = false; report.failure = error.message; }
finally {
  for (const client of clients) await client.end().catch(() => {});
  if (postgres && postgres.exitCode === null) {
    try { command("pg_ctl", ["-D", DATA, "-m", "fast", "-w", "-t", "15", "stop"]); }
    catch (error) { report.stopFailure = error.message; report.passed = false; }
  }
  report.stopped = !postgres || postgres.exitCode !== null;
  if (postgres && !report.stopped) { await Promise.race([new Promise((accept) => postgres.once("exit", accept)), delay(3000)]); report.stopped = postgres.exitCode !== null; }
  if (!report.stopped) report.passed = false;
  await writeFile(resolve(RUN, "postgres.log"), log).catch(() => {});
  await writeFile(resolve(RUN, "report.json"), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
  await unlink(passwordFile).catch(() => {});
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter((r) => !r.passed).length,
    stopped: report.stopped, report: resolve(RUN, "report.json"), failure: report.failure, stopFailure: report.stopFailure, limitations: report.limitations }, null, 2));
}
if (failure) console.error(failure.message);
if (!report.passed) process.exitCode = 1;
