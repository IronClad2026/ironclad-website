import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = resolve(root, "../release-execution-tools");
const pgBin = process.env.CASTER_PHASE1_PG_BIN ?? resolve(tools, "postgresql-17.11/pgsql/bin");
const driver = process.env.CASTER_PHASE1_PG_DRIVER ?? resolve(tools, "pg-client/node_modules/pg");
const { Client } = createRequire(import.meta.url)(driver);
const run = resolve(root, ".release-local", `caster-phase1-db-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const checks = [];
const clients = [];
const migration = "20261126094926_caster_phase1_invitations.sql";
const continuationMigration = "20261126120736_caster_phase1_continuations.sql";
const prereqs = {
  closure: "20261113010000_patch2_durable_account_closure.sql",
  staff: "20261113045827_patch2_verified_staff_access.sql",
  legal: "20260819100000_account_legal_acceptance.sql",
  legalCurrent: "20260822160000_account_legal_future_gate_stability.sql",
  notice: "20261113050025_patch2_public_gaming_profile_acknowledgement.sql",
};
const hash = (text) => createHash("sha256").update(text).digest("hex");
const staff = "user_caster_fixture_staff";
const terms = randomUUID();
const privacy = randomUUID();
const host = "127.0.0.1";
const port = 56757;
const allowed = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS", "CASTER_PHASE1_PG_BIN", "CASTER_PHASE1_PG_DRIVER"]);
assert.ok(Object.keys(process.env).every((key) => allowed.has(key.toUpperCase())), "Use an OS-only environment");
assert.match(net.Socket.prototype.connect.toString(), /checkConnect/, "Preload the existing Patch 2 loopback guard");

function executable(name) {
  return resolve(pgBin, process.platform === "win32" ? `${name}.exe` : name);
}

const query = (client, statement, values = []) => client.query(statement, values);
const newClient = () => new Client({ host, port, user: "postgres", password, database: "postgres", connectionTimeoutMillis: 1000, statement_timeout: 10000 });
const rpc = (client, sql, args) => query(client, `select public.${sql} as result`, args).then(({ rows }) => rows[0].result);
const readMigration = (file) => readFile(resolve(root, "supabase/migrations", file), "utf8").then((sql) => sql.replaceAll("\r\n", "\n"));

async function role(client, name) {
  await query(client, "reset role");
  await query(client, "select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: name })]);
  await query(client, `set role ${name}`);
}

async function check(name, runCheck) {
  await runCheck();
  checks.push(name);
}

function section(sql, start, end) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Predecessor section missing: ${start}`);
  return sql.slice(from, to);
}

const issue = (client, key, reference = null, replaces = null, actor = staff) => rpc(client, "caster_phase1_issue($1,$2,$3,$4)", [actor, hash(key), reference, replaces]);
const continuationDigest = (key) => hash(`continuation:${key}`);
const prepare = (client, key, source = "unit-source", continuation = key, previous = null) =>
  rpc(client, "caster_phase1_prepare_continuation($1,$2,$3,$4)", [
    hash(key), continuationDigest(continuation), hash(source), previous ? continuationDigest(previous) : null,
  ]);
const getContinuation = (client, key) => rpc(client, "caster_phase1_get_continuation($1)", [continuationDigest(key)]);
const claim = (client, actor, key) => rpc(client, "caster_phase1_claim_continuation($1,$2)", [actor, continuationDigest(key)]);
const revoke = (client, id) => rpc(client, "caster_phase1_revoke($1,$2)", [staff, id]);
const application = (client, actor) => rpc(client, "caster_phase1_get_application($1)", [actor]);
const snapshot = (client, actor = staff) => rpc(client, "caster_phase1_admin_snapshot($1)", [actor]);
const accept = (client, actor, term = terms, policy = privacy) => query(client, "select * from public.caster_phase1_accept_legal($1,$2,$3)", [actor, term, policy]);

let postgres;
let serverLog = "";
let failure;
let digest;
let continuationMigrationDigest;
try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, `${password}\n`, { flag: "wx" });
  const init = spawnSync(executable("initdb"), ["-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile", passwordFile, "--encoding=UTF8", "--locale=C", "--no-instructions"], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  await unlink(passwordFile);
  assert.equal(init.status, 0, init.stderr);
  postgres = spawn(executable("postgres"), ["-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories=", "-c", "max_connections=12"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  postgres.stdout.on("data", (chunk) => { serverLog += chunk; });
  postgres.stderr.on("data", (chunk) => { serverLog += chunk; });
  let owner;
  for (let attempt = 0; attempt < 40; attempt++) {
    const pending = newClient();
    try {
      await pending.connect();
      owner = pending;
      clients.push(pending);
      break;
    } catch {
      await pending.end().catch(() => {});
      await wait(250);
    }
  }
  assert.ok(owner, "Disposable PostgreSQL did not start");
  assert.equal((await query(owner, "show data_directory")).rows[0].data_directory.toLowerCase(), data.replaceAll("\\", "/").toLowerCase());

  // Synthetic predecessor objects on disposable PostgreSQL. Replay the exact
  // relevant legal/notice migrations and closure/staff definitions beneath.
  await query(owner, `
    create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    grant anon, authenticated, service_role to authenticator;
    create schema auth; create schema ironclad_private; create schema storage; create schema realtime; create schema extensions;
    create extension pgcrypto with schema extensions;
    grant usage on schema auth, ironclad_private, storage, realtime to authenticated;
    grant usage on schema auth, ironclad_private to service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
    $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create table public.players(clerk_user_id text unique not null, account_closed_at timestamptz);
    create table public.platform_settings(key text primary key, value jsonb not null);
    create table public.legal_documents(id uuid primary key, document_kind text, status text, published_at timestamptz,
      effective_at timestamptz, sha256 text, immutable_url text, version text);
    create table storage.objects(bucket_id text);
    create table realtime.messages(topic text);
    create function realtime.topic() returns text language sql stable as $$ select current_setting('fixture.topic',true) $$;
    alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
    create policy fixture_storage on storage.objects to authenticated using(true) with check(true);
    create policy fixture_realtime on realtime.messages for select to authenticated using(true);
    grant select on storage.objects, realtime.messages to authenticated;
    insert into storage.objects values ('player-avatars'),('other-fixture');
    insert into realtime.messages values ('match-room:fixture:1'),('other-fixture');
  `);
  const closureSql = await readMigration(prereqs.closure);
  const staffSql = await readMigration(prereqs.staff);
  await query(owner, section(closureSql, "create table ironclad_private.patch2_closed_accounts", "create function ironclad_private.require_patch2_open_account"));
  await query(owner, section(staffSql, "create table ironclad_private.patch2_staff_authorizations", "-- Existing guarded inbox"));
  await query(owner, await readMigration(prereqs.legal));
  await query(owner, await readMigration(prereqs.legalCurrent));
  await query(owner, await readMigration(prereqs.notice));
  const sql = await readMigration(migration);
  digest = hash(sql);
  await query(owner, sql);
  const continuationSql = await readMigration(continuationMigration);
  continuationMigrationDigest = hash(continuationSql);
  await query(owner, continuationSql);
  await query(owner, `insert into public.legal_documents values
    ($1,'terms','effective',now(),now(),repeat('a',64),'https://fixture.invalid/terms','fixture-1'),
    ($2,'privacy','effective',now(),now(),repeat('b',64),'https://fixture.invalid/privacy','fixture-1')`, [terms, privacy]);
  await query(owner, "insert into ironclad_private.patch2_staff_authorizations(subject_digest,verification_reference) values(sha256(convert_to($1,'UTF8')),'synthetic fixture')", [staff]);
  await query(owner, "update public.platform_settings set value=jsonb_set(value,'{enabled}','true') where key='public_gaming_profile_notice'");

  const connect = async (name) => {
    const client = newClient();
    await client.connect();
    clients.push(client);
    await role(client, name);
    return client;
  };
  const server = await connect("service_role");
  const other = await connect("service_role");
  const direct = await connect("authenticated");
  const anon = await connect("anon");
  const secondPid = (await query(other, "select pg_backend_pid() pid")).rows[0].pid;

  async function observeRace(hold, contend) {
    await query(server, "begin");
    const first = await hold();
    const pending = contend();
    let blocked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const state = await query(owner, "select wait_event_type from pg_stat_activity where pid=$1", [secondPid]);
      if (state.rows[0]?.wait_event_type === "Lock") {
        blocked = true;
        break;
      }
      await wait(25);
    }
    await query(server, "commit");
    const second = await pending;
    assert.ok(blocked, "The competing transaction never waited for the held lock");
    return [first, second];
  }

  await check("RPC grants are service-only, private tables are RLS enabled, and ordinary accounts cannot issue, list or revoke", async () => {
    assert.ok((await query(owner, `select bool_and(c.relrowsecurity) guarded from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='ironclad_private' and c.relname like 'caster_%' and c.relkind='r'`)).rows[0].guarded);
    for (const client of [direct, anon]) {
      await assert.rejects(issue(client, "unauthorized"), { code: "42501" });
      await assert.rejects(snapshot(client), { code: "42501" });
      await assert.rejects(prepare(client, "unauthorized"), { code: "42501" });
      await assert.rejects(getContinuation(client, "unauthorized"), { code: "42501" });
      await assert.rejects(claim(client, staff, "unauthorized"), { code: "42501" });
      await assert.rejects(application(client, staff), { code: "42501" });
    }
    await assert.rejects(query(server, "select * from ironclad_private.caster_phase1_invitations"), { code: "42501" });
    await assert.rejects(query(server, "select * from ironclad_private.caster_phase1_continuations"), { code: "42501" });
    await assert.rejects(query(server, "select * from ironclad_private.caster_phase1_rate_secret"), { code: "42501" });
    await assert.rejects(query(server, "select ironclad_private.caster_phase1_source_pseudonym($1)", [hash("source")]), { code: "42501" });
    await assert.rejects(rpc(server, "caster_phase1_prepare($1,$2)", [hash("old-rpc"), hash("source")]), { code: "42501" });
    await assert.rejects(rpc(server, "caster_phase1_claim($1,$2)", [staff, hash("old-rpc")]), { code: "42501" });
    await assert.rejects(issue(server, "unauthorized", null, null, "user_unverified_staff"), { code: "42501" });
    await assert.rejects(snapshot(server, "user_unverified_staff"), { code: "42501" });
  });

  await check("Issuance requires no email, expires in exactly seven days, and preparation is read-only for invitation lifecycle", async () => {
    const issued = await issue(server, "first", "Known caster");
    assert.equal(issued.status, "issued");
    assert.equal(Date.parse(issued.invitation.expires_at) - Date.parse(issued.invitation.created_at), 7 * 86400000);
    assert.equal((await issue(server, "first")).status, "conflict");
    assert.equal((await issue(server, "bad-reference", "a".repeat(43))).status, "invalid");
    assert.deepEqual(await prepare(server, "unknown"), { status: "invalid" });
    const prepared = await prepare(server, "first");
    assert.equal(prepared.status, "valid");
    assert.deepEqual(await getContinuation(server, "first"), prepared);
    assert.deepEqual(await prepare(server, "first"), { status: "invalid" });
    assert.equal((await prepare(server, "first", "unit-source", "first-alt-browser")).status, "valid");
    assert.deepEqual(await getContinuation(server, "not-prepared"), { status: "unavailable" });
    assert.deepEqual(await rpc(server, "caster_phase1_get_continuation($1)", [hash("first")]), { status: "unavailable" });
    const stored = (await query(owner, `select continuation_digest, created_at, expires_at
      from ironclad_private.caster_phase1_continuations where invitation_id=$1`, [issued.invitation.id])).rows;
    assert.equal(stored.length, 2);
    assert.deepEqual(new Set(stored.map((row) => row.continuation_digest.toString("hex"))),
      new Set([continuationDigest("first"), continuationDigest("first-alt-browser")]));
    for (const row of stored) assert.equal(row.expires_at - row.created_at, 30 * 60000);
    const records = await snapshot(server);
    assert.equal(records.invitations[0].claimed_by, null);
    assert.deepEqual(records.events.map((event) => event.event_type), ["issued"]);
    assert.ok(!JSON.stringify(records).includes(hash("first")));
  });

  await check("Replacement revokes an outstanding invite, copies its reference, preserves history, and cannot be repeated", async () => {
    const old = await issue(server, "old", "Original caster");
    const replacement = await issue(server, "new", null, old.invitation.id);
    assert.equal(replacement.status, "issued");
    assert.equal(replacement.invitation.reference, "Original caster");
    assert.equal(replacement.invitation.replaces, old.invitation.id);
    assert.equal((await issue(server, "third", null, old.invitation.id)).status, "conflict");
    assert.deepEqual(await prepare(server, "old"), { status: "revoked" });
    assert.equal((await prepare(server, "new")).status, "valid");
    assert.ok((await snapshot(server)).events.some((event) => event.invitation_id === old.invitation.id && event.event_type === "revoked"));
    assert.deepEqual(await revoke(server, replacement.invitation.id), { status: "revoked" });
    assert.deepEqual(await revoke(server, replacement.invitation.id), { status: "revoked" });
    assert.equal((await snapshot(server)).events.filter((event) => event.invitation_id === replacement.invitation.id && event.event_type === "revoked").length, 1);
  });

  await check("Continuation expiry is bounded independently by the invitation and elapsed time", async () => {
    const expired = await issue(server, "expired");
    await query(owner, "update ironclad_private.caster_phase1_invitations set expires_at=now()+interval '2 minutes' where id=$1", [expired.invitation.id]);
    const prepared = await prepare(server, "expired");
    assert.equal(prepared.status, "valid");
    const receipt = (await query(owner, `select c.created_at, c.expires_at, i.expires_at as invite_expires_at
      from ironclad_private.caster_phase1_continuations c join ironclad_private.caster_phase1_invitations i on i.id=c.invitation_id
      where c.invitation_id=$1`, [expired.invitation.id])).rows[0];
    assert.equal(receipt.expires_at.getTime(), receipt.invite_expires_at.getTime());
    assert.ok(receipt.expires_at - receipt.created_at < 30 * 60000);
    await query(owner, `update ironclad_private.caster_phase1_continuations set created_at=now()-interval '31 minutes',
      expires_at=now()-interval '1 minute' where invitation_id=$1`, [expired.invitation.id]);
    await accept(server, "user_expired_claimant");
    assert.deepEqual(await getContinuation(server, "expired"), { status: "expired" });
    assert.deepEqual(await claim(server, "user_expired_claimant", "expired"), { status: "expired" });
    assert.equal((await getContinuation(server, "first")).status, "valid");
    await query(owner, "update ironclad_private.caster_phase1_invitations set created_at=now()-interval '8 days', expires_at=now()-interval '1 day' where id=$1", [expired.invitation.id]);
    assert.deepEqual(await prepare(server, "expired"), { status: "expired" });
    assert.equal((await issue(server, "expired-replacement", null, expired.invitation.id)).status, "issued");
  });

  await check("Caster legal acceptance preserves canonical evidence, blocks stale terms and leaves competitive acknowledgement in force", async () => {
    const applicant = "user_caster_applicant";
    assert.deepEqual(await claim(server, applicant, "first"), { status: "legal_required" });
    await assert.rejects(accept(server, applicant, randomUUID()), { code: "22023" });
    const one = await accept(server, applicant);
    const two = await accept(server, applicant);
    assert.equal(one.rows[0].acceptance_id, two.rows[0].acceptance_id);
    assert.equal(one.rows[0].terms_document_id, terms);
    assert.deepEqual(await application(server, applicant), { status: "open", application: null });
    await query(direct, "select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "authenticated", sub: applicant })]);
    await assert.rejects(query(direct, "select public.require_public_gaming_profile_notice_for_api()"), /PROFILE_NOTICE_REQUIRED/);
    await query(direct, "select set_config('fixture.topic','match-room:fixture:1',false)");
    assert.deepEqual((await query(direct, "select bucket_id from storage.objects")).rows, [{ bucket_id: "other-fixture" }]);
    assert.deepEqual((await query(direct, "select topic from realtime.messages")).rows, []);
    assert.equal((await query(owner, "select count(*)::int as registrations from public.players")).rows[0].registrations, 0);
  });

  await check("Two authenticated accounts racing for one invite produce exactly one named claimant and one private draft", async () => {
    const a = "user_caster_race_a";
    const b = "user_caster_race_b";
    await accept(server, a);
    await accept(server, b);
    const [first, second] = await observeRace(() => claim(server, a, "first"), () => claim(other, b, "first-alt-browser"));
    assert.equal(first.status, "claimed");
    assert.equal(first.application.status, "draft");
    assert.deepEqual(second, { status: "unavailable" });
    assert.deepEqual(await application(server, b), { status: "open", application: null });
    assert.deepEqual((await application(server, a)).application, first.application);
    assert.deepEqual(await getContinuation(server, "first"), { status: "unavailable" });
    assert.deepEqual(await getContinuation(server, "first-alt-browser"), { status: "unavailable" });
    assert.deepEqual(await claim(server, b, "first"), { status: "unavailable" });
    assert.deepEqual(await prepare(server, "first"), { status: "claimed" });
    assert.equal((await snapshot(server)).invitations.find((entry) => entry.reference === "Known caster").claimed_by, a);
  });

  await check("One account racing on two invites receives one application and leaves the second invite available", async () => {
    const actor = "user_caster_invite_swap";
    await accept(server, actor);
    await issue(server, "one-account-first");
    await issue(server, "one-account-second");
    await prepare(server, "one-account-first");
    await prepare(server, "one-account-second");
    const [first, second] = await observeRace(() => claim(server, actor, "one-account-first"), () => claim(other, actor, "one-account-second"));
    assert.equal(first.status, "claimed");
    assert.equal(second.status, "already_owned");
    assert.deepEqual(second.application, first.application);
    assert.equal((await getContinuation(server, "one-account-second")).status, "valid");
    assert.deepEqual(await claim(server, actor, "one-account-first"), second);
  });

  await check("Claim versus revoke is serialized and both lock orderings leave one valid audit trail", async () => {
    const first = await issue(server, "claim-first");
    const second = await issue(server, "revoke-first");
    await accept(server, "user_caster_claim_before_revoke");
    await accept(server, "user_caster_revoke_before_claim");
    await prepare(server, "claim-first");
    await prepare(server, "revoke-first");
    const initial = await observeRace(() => claim(server, "user_caster_claim_before_revoke", "claim-first"), () => revoke(other, first.invitation.id));
    assert.deepEqual(initial.map((result) => result.status), ["claimed", "claimed"]);
    const inverse = await observeRace(() => revoke(server, second.invitation.id), () => claim(other, "user_caster_revoke_before_claim", "revoke-first"));
    assert.deepEqual(inverse.map((result) => result.status), ["revoked", "revoked"]);
    assert.deepEqual(await application(server, "user_caster_revoke_before_claim"), { status: "open", application: null });
    assert.equal((await issue(server, "replacement-after-claim", null, first.invitation.id)).status, "claimed");
  });

  await check("Successful preparation invalidates only the previous browser continuation and leaves other devices intact", async () => {
    await issue(server, "replace-continuation");
    assert.equal((await prepare(server, "replace-continuation")).status, "valid");
    assert.equal((await prepare(server, "replace-continuation", "other-device", "other-live-browser")).status, "valid");
    assert.deepEqual(await prepare(server, "not-issued", "unit-source", "unsuccessful-replacement", "replace-continuation"), { status: "invalid" });
    assert.deepEqual(await prepare(server, "replace-continuation", "unit-source", "replace-continuation", "replace-continuation"), { status: "invalid" });
    assert.equal((await getContinuation(server, "replace-continuation")).status, "valid");
    assert.equal((await prepare(server, "replace-continuation", "unit-source", "new-browser-continuation", "replace-continuation")).status, "valid");
    assert.deepEqual(await getContinuation(server, "replace-continuation"), { status: "unavailable" });
    assert.equal((await getContinuation(server, "new-browser-continuation")).status, "valid");
    assert.equal((await getContinuation(server, "other-live-browser")).status, "valid");
    await accept(server, "user_caster_old_continuation");
    assert.deepEqual(await claim(server, "user_caster_old_continuation", "replace-continuation"), { status: "unavailable" });
    assert.deepEqual(await application(server, "user_caster_old_continuation"), { status: "open", application: null });
  });

  await check("A prepared replacement can race with a claim without deadlocking or reactivating the used invite", async () => {
    await issue(server, "claim-as-replacement-runs");
    await prepare(server, "claim-as-replacement-runs");
    await accept(server, "user_caster_replace_and_claim");
    const [claimed, replacement] = await observeRace(
      () => claim(server, "user_caster_replace_and_claim", "claim-as-replacement-runs"),
      () => prepare(other, "claim-as-replacement-runs", "unit-source", "concurrent-replacement", "claim-as-replacement-runs"),
    );
    assert.equal(claimed.status, "claimed");
    assert.equal(replacement.status, "claimed");
    assert.deepEqual(await getContinuation(server, "concurrent-replacement"), { status: "unavailable" });
    assert.deepEqual(await getContinuation(server, "claim-as-replacement-runs"), { status: "unavailable" });

    await issue(server, "replacement-before-claim");
    await prepare(server, "replacement-before-claim");
    await accept(server, "user_caster_replaced_while_claiming");
    const [replaced, staleClaim] = await observeRace(
      () => prepare(server, "replacement-before-claim", "unit-source", "winner-replacement", "replacement-before-claim"),
      () => claim(other, "user_caster_replaced_while_claiming", "replacement-before-claim"),
    );
    assert.equal(replaced.status, "valid");
    assert.deepEqual(staleClaim, { status: "unavailable" });
    assert.deepEqual(await getContinuation(server, "winner-replacement"), replaced);
  });

  await check("Closed Clerk accounts and revoked staff fail closed through existing Patch 2 authority", async () => {
    const subject = "user_caster_race_a";
    await query(owner, "insert into ironclad_private.patch2_closed_accounts(subject_digest) values(sha256(convert_to($1,'UTF8')))", [subject]);
    assert.equal(await rpc(server, "caster_phase1_account_open($1)", [subject]), false);
    assert.deepEqual(await application(server, subject), { status: "closed", application: null });
    assert.deepEqual(await claim(server, subject, "one-account-second"), { status: "closed" });
    await assert.rejects(accept(server, subject), { code: "42501" });
    await query(owner, "update ironclad_private.patch2_staff_authorizations set revoked_at=now()");
    await assert.rejects(snapshot(server), { code: "42501" });
  });

  await check("Short-window preparation limit covers valid and invalid input without consuming the invitation", async () => {
    for (let attempt = 0; attempt < 30; attempt++) assert.equal((await prepare(server, "not-an-invitation", "burst-source")).status, "invalid");
    assert.deepEqual(await prepare(server, "one-account-second", "burst-source"), { status: "rate_limited" });
    assert.equal((await prepare(server, "one-account-second", "new-browser-source", "new-browser-after-burst")).status, "valid");
    await query(owner, "update public.legal_documents set status='retired' where id=$1", [terms]);
    assert.deepEqual(await claim(server, "user_waits_for_legal", "one-account-second"), { status: "legal_unavailable" });
  });

  await check("Cleanup deletes bounded batches and persists a keyed source pseudonym without storing its input", async () => {
    await query(owner, `insert into ironclad_private.caster_phase1_request_limits
      select 'fixture-expired', sha256(convert_to(number::text,'UTF8')), now()-interval '3 hours', 1
      from generate_series(1,150) as number`);
    const expiredCount = async () => (await query(owner, `select count(*)::int as count
      from ironclad_private.caster_phase1_request_limits where action='fixture-expired'`)).rows[0].count;
    await query(owner, `insert into ironclad_private.caster_phase1_continuations
      select sha256(convert_to('expired-fixture-' || number,'UTF8')), invitation_id,
        now()-interval '35 minutes', now()-interval '5 minutes'
      from ironclad_private.caster_phase1_continuations cross join generate_series(1,150) as number
      where continuation_digest=decode($1,'hex')`, [continuationDigest("one-account-second")]);
    const expiredContinuations = async () => (await query(owner, `select count(*)::int as count
      from ironclad_private.caster_phase1_continuations where expires_at <= now()`)).rows[0].count;
    assert.equal((await prepare(server, "one-account-second", "cleanup-source", "cleanup-first")).status, "valid");
    assert.equal(await expiredCount(), 22);
    assert.equal(await expiredContinuations(), 22);
    assert.equal((await prepare(server, "one-account-second", "cleanup-source", "cleanup-second")).status, "valid");
    assert.equal(await expiredCount(), 0);
    assert.equal(await expiredContinuations(), 0);
    const buckets = (await query(owner, `select attempts, encode(subject_digest,'hex') as persisted
      from ironclad_private.caster_phase1_request_limits
      where action='prepare-source' and subject_digest=ironclad_private.caster_phase1_source_pseudonym($1)`, [hash("cleanup-source")])).rows;
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].attempts, 2);
    assert.notEqual(buckets[0].persisted, hash("cleanup-source"));
    assert.ok(!serverLog.includes(hash("cleanup-source")));
    assert.equal((await getContinuation(server, "cleanup-first")).status, "valid");
  });

  if (process.argv.includes("--full-lineage")) {
    // A second clean database in the disposable cluster verifies the complete
    // checked-in lineage. Reset the preceding fixture's cluster-wide role
    // setting so the notice migration can install it from scratch.
    await check("Complete checked-in Staging lineage replays using the existing loopback compatibility prelude", async () => {
      await query(owner, "create database caster_full_lineage");
      await query(owner, "alter role authenticator reset pgrst.db_pre_request");
      const full = new Client({ host, port, user: "postgres", password, database: "caster_full_lineage", connectionTimeoutMillis: 1000, statement_timeout: 60000 });
      await full.connect();
      clients.push(full);
      const prelude = await readFile(resolve(root, "tests/database/local-supabase-replay-prelude.sql"), "utf8");
      const realtime = await readFile(resolve(root, "tests/database/match-room-realtime-local-prelude.sql"), "utf8");
      await query(full, `${prelude}\n${realtime}`);
      const files = (await readdir(resolve(root, "supabase/migrations"))).filter((file) => file.endsWith(".sql")).sort();
      for (const file of files) {
        const migrationText = (await readMigration(file)).replace(
          /^create extension if not exists (?:pg_net|pg_cron) with schema extensions;$/gmu,
          "-- Local replay uses the non-networking prelude signatures",
        );
        try {
          await query(full, migrationText);
        } catch (error) {
          throw new Error(`Complete lineage failed at ${file}: ${error.message}`, { cause: error });
        }
      }
      const result = await query(full, `select to_regclass('ironclad_private.caster_phase1_invitations')::text as invitations,
        to_regclass('ironclad_private.caster_phase1_continuations')::text as continuations`);
      assert.equal(result.rows[0].invitations, "ironclad_private.caster_phase1_invitations");
      assert.equal(result.rows[0].continuations, "ironclad_private.caster_phase1_continuations");
    });
  }
} catch (error) {
  failure = error;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (postgres) {
    const stop = spawnSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "stop", "-w"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    if (stop.status !== 0 && !failure) failure = new Error("Disposable PostgreSQL did not stop");
  }
  await writeFile(resolve(run, "report.json"), JSON.stringify({ passed: !failure, checks, digest, continuationMigrationDigest }, null, 2) + "\n").catch(() => {});
  await writeFile(resolve(run, "postgres.log"), serverLog).catch(() => {});
}
if (failure) throw failure;
console.log(JSON.stringify({ passed: true, checks, digest, continuationMigrationDigest, report: resolve(run, "report.json") }, null, 2));
