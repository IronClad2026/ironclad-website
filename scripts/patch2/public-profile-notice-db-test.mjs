import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = resolve(root, "../release-execution-tools");
const pg = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const osKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS"]);
assert.ok(Object.keys(process.env).every((key) => osKeys.has(key.toUpperCase())), "This rehearsal requires an OS-only environment");
assert.match(net.Socket.prototype.connect.toString(), /checkConnect/, "Loopback network guard is missing");

const run = resolve(root, ".release-local", `public-profile-notice-run-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const host = "127.0.0.1";
const port = 56743;
const version = "public-gaming-profile-v1";
const checks = [];
const clients = [];
const options = { host, port, database: "postgres", connectionTimeoutMillis: 1000, statement_timeout: 10000 };
const postgres = () => new Client({ ...options, user: "postgres", password });
const query = (client, statement, values = []) => client.query(statement, values);
async function actor(role, subject, executor = db) {
  await query(executor, "reset role");
  await query(executor, "select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role, sub: subject })]);
  await query(executor, `set role ${role}`);
}
async function verify(name, execute) {
  await execute();
  checks.push(name);
}
let processHandle;
let db;
let digest;
let failure;

try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password, { flag: "wx" });
  const init = spawnSync(resolve(pg, "initdb.exe"), ["-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile", passwordFile, "--no-sync"], {
    windowsHide: true, encoding: "utf8", timeout: 60000,
  });
  assert.equal(init.status, 0, init.stderr);
  await unlink(passwordFile);
  processHandle = spawn(resolve(pg, "postgres.exe"), ["-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories="], { windowsHide: true, stdio: "ignore" });
  for (let attempt = 0; attempt < 20; attempt++) {
    const pending = postgres();
    try {
      await pending.connect();
      db = pending;
      clients.push(db);
      break;
    } catch {
      await pending.end().catch(() => {});
      await wait(250);
    }
  }
  assert.ok(db, "Disposable PostgreSQL did not start");
  // Hosted API transport is tested separately. This fixture contains only
  // synthetic objects and claims and uses PostgreSQL's real privileges/RLS.
  await query(db, `
    create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    grant anon, authenticated, service_role to authenticator;
    create schema auth; create schema ironclad_private; create schema storage; create schema realtime;
    grant usage on schema auth, ironclad_private, storage, realtime to authenticated;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
    $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to service_role;
    create table public.platform_settings(key text primary key, value jsonb not null);
    create table public.players(clerk_user_id text unique not null, account_closed_at timestamptz);
    create table ironclad_private.patch2_closed_accounts(subject_digest bytea primary key);
    create function ironclad_private.patch2_account_state(p_sub text) returns text
    language sql stable set search_path=pg_catalog as $$
      select case when exists(select from ironclad_private.patch2_closed_accounts where subject_digest=sha256(convert_to(p_sub,'UTF8')))
             or exists(select from public.players where clerk_user_id=p_sub and account_closed_at is not null) then 'denied'
             when exists(select from public.players where clerk_user_id=p_sub) then 'active-player' else 'no-player' end
    $$;
    create table storage.objects(bucket_id text);
    create table realtime.messages(topic text);
    create function realtime.topic() returns text language sql stable as $$ select current_setting('fixture.topic',true) $$;
    alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
    create policy fixture_storage on storage.objects to authenticated using(true) with check(true);
    create policy fixture_realtime on realtime.messages for select to authenticated using(true);
    grant select,insert,update,delete on storage.objects to authenticated;
    grant select on realtime.messages to authenticated;
    insert into storage.objects values ('player-avatars'),('other-fixture');
    insert into realtime.messages values ('match-room:fixture:1'),('other-fixture');
  `);
  const filename = "20261113050025_patch2_public_gaming_profile_acknowledgement.sql";
  const sql = (await readFile(resolve(root, "supabase/migrations", filename), "utf8")).replaceAll("\r\n", "\n");
  digest = createHash("sha256").update(sql).digest("hex");
  await query(db, sql);

  const state = (subject, executor = db) => query(executor, "select public.get_public_gaming_profile_notice_state($1) result", [subject]).then((result) => result.rows[0].result);
  const acknowledge = (subject, expected = version, executor = db) =>
    query(executor, "select public.acknowledge_public_gaming_profile_notice($1,$2) result", [subject, expected]).then((result) => result.rows[0].result);
  const memberHook = () => query(db, "select public.require_public_gaming_profile_notice_for_api()");
  const fixture = "user_ackfixture";
  await verify("Migration installs an inert notice and exact PostgREST hook", async () => {
    const setting = await query(db, "select value from public.platform_settings where key='public_gaming_profile_notice'");
    assert.deepEqual(setting.rows[0].value, { enabled: false, version });
    const role = await query(db, "select rolconfig from pg_roles where rolname='authenticator'");
    assert.ok(role.rows[0].rolconfig.includes("pgrst.db_pre_request=public.require_public_gaming_profile_notice_for_api"));
    await actor("service_role", fixture);
    assert.deepEqual(await state(fixture), { version: null, satisfied: true });
    await assert.rejects(acknowledge(fixture), { code: "22023" });
    await actor("authenticated", fixture);
    await memberHook();
  });

  await query(db, "reset role");
  await query(db, "update public.platform_settings set value=jsonb_set(value,'{enabled}','true') where key='public_gaming_profile_notice'");
  await verify("Only trusted app can read or write a receipt, member API is denied and public/workers still work", async () => {
    await actor("authenticated", fixture);
    await assert.rejects(state(fixture), { code: "42501" });
    await assert.rejects(acknowledge(fixture), { code: "42501" });
    await assert.rejects(memberHook(), /PROFILE_NOTICE_REQUIRED/);
    await actor("anon");
    await memberHook();
    await actor("service_role");
    await memberHook();
    assert.deepEqual(await state(fixture), { version, satisfied: false });
    await assert.rejects(acknowledge(fixture, "old-version"), { code: "22023" });
    await assert.rejects(query(db, "select * from ironclad_private.public_gaming_profile_acknowledgements"), { code: "42501" });
  });

  await verify("Avatar access and match-room Realtime are restricted without widening unrelated policies", async () => {
    await actor("authenticated", fixture);
    assert.deepEqual((await query(db, "select bucket_id from storage.objects")).rows, [{ bucket_id: "other-fixture" }]);
    await assert.rejects(query(db, "insert into storage.objects values('player-avatars')"), { code: "42501" });
    assert.deepEqual((await query(db, "select topic from realtime.messages")).rows, [{ topic: "other-fixture" }]);
  });

  await verify("Two concurrent sessions save the same single timestamp and only their own identity is acknowledged", async () => {
    await actor("service_role", fixture);
    const second = postgres();
    clients.push(second);
    await second.connect();
    await actor("service_role", fixture, second);
    const [firstTime, secondTime] = await Promise.all([acknowledge(fixture), acknowledge(fixture, version, second)]);
    assert.ok(firstTime instanceof Date);
    assert.equal(firstTime.getTime(), secondTime.getTime());
    assert.deepEqual(await state(fixture), { version, satisfied: true });
    assert.deepEqual(await state("user_otherfixture"), { version, satisfied: false });
    await query(db, "reset role");
    assert.equal((await query(db, "select count(*)::int count from ironclad_private.public_gaming_profile_acknowledgements")).rows[0].count, 1);
    await actor("authenticated", fixture);
    await memberHook();
    assert.equal((await query(db, "select bucket_id from storage.objects")).rowCount, 2);
    assert.equal((await query(db, "select topic from realtime.messages")).rowCount, 2);
  });

  await verify("Closure and notice version changes cannot create a false acknowledgement", async () => {
    await query(db, "reset role");
    await query(db, "insert into ironclad_private.patch2_closed_accounts values(sha256(convert_to('user_closedfixture','UTF8')))");
    await query(db, "update public.platform_settings set value=jsonb_set(value,'{version}',to_jsonb('public-gaming-profile-v2'::text)) where key='public_gaming_profile_notice'");
    await actor("service_role", fixture);
    await assert.rejects(acknowledge("user_closedfixture", "public-gaming-profile-v2"), { code: "42501" });
    assert.deepEqual(await state(fixture), { version: "public-gaming-profile-v2", satisfied: false });
    await assert.rejects(acknowledge(fixture), { code: "22023" });
    await actor("authenticated", fixture);
    await assert.rejects(memberHook(), /PROFILE_NOTICE_REQUIRED/);
  });
} catch (error) {
  failure = error;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (processHandle) {
    const stop = spawnSync(resolve(pg, "pg_ctl.exe"), ["-D", data, "-m", "fast", "stop", "-w"], { windowsHide: true, encoding: "utf8", timeout: 30000 });
    if (stop.status !== 0 && !failure) failure = new Error("Disposable PostgreSQL did not stop");
  }
  await writeFile(resolve(run, "report.json"), JSON.stringify({ passed: !failure, checks, digest }, null, 2) + "\n").catch(() => {});
}
if (failure) throw failure;
console.log(JSON.stringify({ passed: true, checks, digest, report: resolve(run, "report.json") }, null, 2));
