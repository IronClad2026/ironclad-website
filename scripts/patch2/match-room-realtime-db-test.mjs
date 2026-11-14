import "./block-remote-network.cjs";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Disposable PostgreSQL only. The existing outbox shim exercises the actual
// PostgreSQL role, policy and transaction behavior without a hosted socket.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = resolve(root, "../release-execution-tools");
const bin = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const run = resolve(root, ".release-local", `patch2-match-room-realtime-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(path|pathext|systemroot|windir|comspec|temp|tmp|userprofile|localappdata|appdata|number_of_processors)$/i.test(name),
));
const host = "127.0.0.1", port = 56753;
const options = { host, port, database: "postgres", user: "postgres", password, ssl: false,
  connectionTimeoutMillis: 1_000, statement_timeout: 10_000, lock_timeout: 2_000 };
const clients = [];
const checks = [];
const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const migrationFile = "supabase/migrations/20261114064733_patch2_match_staff_authorization.sql";
const migration = (await readFile(resolve(root, migrationFile), "utf8")).replaceAll("\r\n", "\n");
const patch = migration.match(/-- Retire shared topics\.[\s\S]*?'Participant-only invalidations\. Staff without a room registration use guarded polling\.';/)?.[0];
assert.ok(patch, "Exact Realtime migration section not found");
const closureMigration = await readFile(resolve(root, "supabase/migrations/20261113010000_patch2_durable_account_closure.sql"), "utf8");
const accountState = closureMigration.match(/create function ironclad_private\.patch2_account_state\(p_sub text\)[\s\S]*?\n\$\$;/)?.[0];
assert.ok(accountState, "Actual account state helper not found");
const noticeMigration = (await readFile(resolve(root, "supabase/migrations/20261113050025_patch2_public_gaming_profile_acknowledgement.sql"), "utf8")).replaceAll("\r\n", "\n");
const noticeState = noticeMigration.match(/create table ironclad_private\.public_gaming_profile_acknowledgements[\s\S]*?\n\$\$;\n\n(?=create function public\.get_public_gaming_profile_notice_state)/)?.[0];
assert.ok(noticeState, "Actual notice setting and receipt helpers not found");

function command(name, args) {
  const result = spawnSync(resolve(bin, `${name}.exe`), args, { env, windowsHide: true, encoding: "utf8", timeout: 60_000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
}
async function connect() {
  let lastError;
  for (let attempt = 0; attempt < 24; attempt++) {
    const client = new Client(options);
    try {
      await client.connect();
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await wait(250);
      continue;
    }
    clients.push(client);
    const target = await client.query("select inet_server_addr()=inet '127.0.0.1' and inet_server_port()=$1 as local", [port]);
    assert.equal(target.rows[0].local, true);
    return client;
  }
  throw new Error(`Disposable PostgreSQL connection failed (${lastError?.code ?? "unknown"})`, { cause: lastError });
}

let server, db, failure;
let log = "";
const id = (n) => `fe710000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const room = id(1);
const oldTopic = `match-room:${room}:1`;
const topic = (subject) => `match-room:v2:${room}:1:${digest(subject)}`;
const owner = () => db.query("reset role");
async function actor(subject, admin = false, role = "authenticated") {
  await owner();
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: subject, role, metadata: { role: admin ? "admin" : "player" } })]);
  await db.query(role === "authenticated" ? "set role authenticated" : "set role anon");
}
async function receive(name) {
  return (await db.query("select ironclad_private.can_receive_match_room_realtime($1) as allowed", [name])).rows[0].allowed;
}
const events = async () => (await db.query("select topic,payload,event,private from realtime.messages order by topic,id")).rows;
const emit = (client = db) => client.query("insert into public.match_messages(room_id) values($1)", [room]);

try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password + "\n", { flag: "wx" });
  command("initdb", ["-D", data, "-U", "postgres", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  await unlink(passwordFile);
  server = spawn(resolve(bin, "postgres.exe"), ["-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories=", "-c", "max_connections=8", "-c", "shared_buffers=32MB"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { log += chunk; });
  server.stderr.on("data", (chunk) => { log += chunk; });
  db = await connect();
  await db.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema ironclad_private;
    grant usage on schema auth,ironclad_private to authenticated;
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
    create table ironclad_private.patch2_closed_accounts(subject_digest bytea primary key);
    create table public.players(clerk_user_id text primary key, account_closed_at timestamptz);
    create table public.registrations(id uuid primary key,clerk_user_id text,tournament_id uuid,tournament_bracket_id uuid);
    create table public.tournaments(id uuid primary key,status text);
    create table public.tournament_brackets(id uuid primary key,tournament_id uuid,launched_at timestamptz);
    create table public.generated_brackets(id uuid primary key,tournament_bracket_id uuid,format text);
    create table public.tournament_division_not_held_closures(tournament_bracket_id uuid);
    create table public.tournament_matches(id uuid primary key,generated_bracket_id uuid,communication_generation bigint,
      player_one_registration_id uuid,player_two_registration_id uuid,status text,outcome_type text,activation_version int);
    create table public.match_rooms(id uuid primary key,match_id uuid,communication_generation bigint,
      player_one_registration_id uuid,player_two_registration_id uuid,closed_at timestamptz,content_purged_at timestamptz);
    create table public.match_messages(room_id uuid); create table public.match_room_assistance(room_id uuid,status text,request_version bigint);
    create table public.platform_settings(key text primary key,value jsonb);
    create function public.get_match_room_enabled() returns boolean language sql stable security definer set search_path=pg_catalog as $$
      select coalesce((select value->'enabled'='true'::jsonb from public.platform_settings where key='match_room'),false) $$;
    ${accountState}
    revoke all on function ironclad_private.patch2_account_state(text) from public,anon,authenticated,service_role;
    ${noticeState}
    insert into public.players values ('p-one',null),('p-two',null),('staff',null),('outsider',null);
    insert into public.tournaments values ('${id(2)}','in_progress');
    insert into public.tournament_brackets values ('${id(3)}','${id(2)}',now());
    insert into public.generated_brackets values ('${id(4)}','${id(3)}','single_elimination');
    insert into public.registrations values ('${id(5)}','p-one','${id(2)}','${id(3)}'),('${id(6)}','p-two','${id(2)}','${id(3)}');
    insert into public.tournament_matches values ('${id(7)}','${id(4)}',1,'${id(5)}','${id(6)}','in_progress',null,1);
    insert into public.match_rooms values ('${room}','${id(7)}',1,'${id(5)}','${id(6)}',null,null);
    insert into public.platform_settings values ('match_room','{"enabled":true}');
  `);
  await db.query(await readFile(resolve(root, "tests/consolidated-db/realtime-local-prelude.sql"), "utf8"));
  await db.query(await readFile(resolve(root, "supabase/migrations/20261001032959_production_private_match_room_realtime.sql"), "utf8"));
  await actor("staff", true);
  assert.equal(await receive(oldTopic), true);
  await owner();
  await emit();
  assert.deepEqual((await events()).map((entry) => entry.topic), [oldTopic]);
  await db.query(patch);

  for (const [subject, admin] of [["staff", true], ["outsider", false], ["p-one", true], ["p-two", false]]) {
    await actor(subject, admin);
    assert.equal(await receive(oldTopic), false);
    assert.equal(await receive(topic("p-one")), subject === "p-one");
    assert.equal(await receive(topic("p-two")), subject === "p-two");
    assert.equal(await receive(`match-room:v2:bad-uuid:1:${digest(subject)}`), false);
  }
  await actor("p-one");
  assert.equal(await receive(topic("p-one")), true);
  await db.query("select set_config('realtime.topic',$1,false)", [topic("p-one")]);
  await assert.rejects(db.query("insert into realtime.messages(topic,extension,event,payload,private) values ($1,'broadcast','invalidate','{}',true)", [topic("p-one")]), { code: "42501" });
  await actor(undefined, false, "anon");
  assert.equal((await events()).length, 0);
  checks.push("Old topic and staff outside the room denied, participant remains eligible with or without admin claim, anonymous and client send denied");

  await owner();
  await emit();
  const afterCutover = await events();
  assert.deepEqual(afterCutover.map((entry) => entry.topic), [oldTopic, topic("p-one"), topic("p-two")].sort());
  for (const entry of afterCutover.filter((entry) => entry.topic !== oldTopic)) {
    assert.equal(entry.private, true);
    assert.equal(entry.event, "invalidate");
    assert.deepEqual(Object.keys(entry.payload).sort(), ["communicationGeneration", "id", "roomId"]);
    assert.equal(entry.payload.roomId, room);
    assert.equal(entry.payload.communicationGeneration, 1);
  }
  checks.push("Cutover stops writes to the old topic and emits only minimal per-participant invalidations");

  const closure = await connect();
  await closure.query("begin; select pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));");
  await closure.query("insert into ironclad_private.patch2_closed_accounts values(decode($1,'hex'))", [digest("p-one")]);
  await emit();
  assert.equal((await events()).length, 3);
  await closure.query("commit");
  await emit();
  const afterClosure = await events();
  assert.equal(afterClosure.filter((entry) => entry.topic === topic("p-one")).length, 1);
  assert.equal(afterClosure.filter((entry) => entry.topic === topic("p-two")).length, 2);
  await actor("p-one", true);
  assert.equal(await receive(topic("p-one")), false);
  checks.push("Concurrent closure suppresses optional wakeup and a committed marker stops all later signals to the closed subject despite a stale admin claim");

  await owner();
  await db.query("begin isolation level repeatable read");
  await emit();
  await db.query("commit");
  assert.equal((await events()).length, 4);
  await db.query("begin");
  await emit();
  assert.equal((await events()).length, 5);
  await db.query("rollback");
  assert.equal((await events()).length, 4);
  checks.push("Stale transaction snapshots skip optional wakeup and rollback removes events");

  await db.query("update public.platform_settings set value=$1 where key='public_gaming_profile_notice'", [{ enabled: true, version: "public-gaming-profile-v1" }]);
  await emit();
  assert.equal((await events()).length, 4);
  await db.query("insert into ironclad_private.public_gaming_profile_acknowledgements(subject_digest,notice_version) values (decode($1,'hex'),'public-gaming-profile-v1')", [digest("p-two")]);
  await emit();
  assert.equal((await events()).length, 5);
  checks.push("Already joined subjects receive no new invalidations until the active profile notice is acknowledged");
} catch (error) {
  failure = error;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (server) command("pg_ctl", ["-D", data, "-m", "fast", "stop", "-w"]);
  await writeFile(resolve(run, "postgres.log"), log);
  await writeFile(resolve(run, "report.json"), JSON.stringify({ passed: !failure, scope: "disposable PostgreSQL and synthetic JWT claims, no hosted websocket", migrationFile, migrationSha256: digest(migration), checks }, null, 2) + "\n");
}
if (failure) throw failure;
console.log(JSON.stringify({ passed: true, checks, report: resolve(run, "report.json") }, null, 2));
