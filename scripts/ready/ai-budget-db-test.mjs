import "../patch2/block-remote-network.cjs";

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = resolve(root, "../release-execution-tools");
const pg = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const osKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => osKeys.has(key.toUpperCase())));
const host = "127.0.0.1";
const run = resolve(root, ".release-local", `ready-ai-budget-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const checks = [];
const clients = [];
const migration = "20261116121500_ready_ai_budget.sql";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const key = (namespace, id) => sha256(`synthetic:${namespace}:${id}`);

async function loopbackPort() {
  const listener = createServer();
  await new Promise((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, host, done);
  });
  const { port } = listener.address();
  await new Promise((done, reject) => listener.close((error) => error ? reject(error) : done()));
  return port;
}

async function verify(name, execute) {
  await execute();
  checks.push(name);
}

const port = await loopbackPort();
const postgres = () => new Client({
  host, port, database: "postgres", user: "postgres", password,
  ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 8000,
});

async function connect(role) {
  const client = postgres();
  clients.push(client);
  await client.connect();
  if (role) await client.query(`set role ${role}`);
  return client;
}

function reserve(client, { account, actor, session, utcDay, neurons = 1, cap = 2000 }) {
  return client.query("select public.reserve_ready_ai_usage($1,$2,$3,$4,$5,$6) as result", [
    account, key("user", actor), key("session", session), utcDay, neurons, cap,
  ]).then(({ rows }) => rows[0].result);
}

function expectReservations(results, approved) {
  assert.equal(results.filter((result) => result === "reserved").length, approved);
  assert.equal(results.filter((result) => result === "quota").length, results.length - approved);
}

let server;
let serverLog = "";
let digest;
let failure;

try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password + "\n", { flag: "wx" });
  try {
    const init = spawnSync(resolve(pg, "initdb.exe"), [
      "-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile", passwordFile,
      "--encoding=UTF8", "--locale=C", "--no-instructions",
    ], { env, windowsHide: true, encoding: "utf8", timeout: 60000 });
    assert.equal(init.status, 0, init.stderr);
  } finally {
    await unlink(passwordFile);
  }
  server = spawn(resolve(pg, "postgres.exe"), [
    "-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories=",
    "-c", "max_connections=16", "-c", "shared_buffers=32MB",
  ], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { serverLog += chunk; });
  server.stderr.on("data", (chunk) => { serverLog += chunk; });
  server.on("error", (error) => { serverLog += error.message; });

  let admin;
  for (let attempt = 0; attempt < 20 && !admin; attempt++) {
    const pending = postgres();
    try {
      await pending.connect();
      admin = pending;
      clients.push(admin);
    } catch {
      await pending.end().catch(() => {});
      await wait(250);
    }
  }
  assert.ok(admin, "Disposable PostgreSQL did not start");
  const attached = await admin.query("select current_setting('data_directory') directory, current_setting('server_version_num') version");
  assert.equal(resolve(attached.rows[0].directory).toLowerCase(), data.toLowerCase());
  assert.equal(attached.rows[0].version, "170011");

  await admin.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema ironclad_private;
    grant usage on schema ironclad_private to anon, authenticated, service_role;
    create table public.platform_settings(key text primary key, value jsonb not null);
    insert into public.platform_settings values ('match_chat_translation_enabled', '{"enabled":false}');
  `);
  const sql = (await readFile(resolve(root, "supabase/migrations", migration), "utf8")).replaceAll("\r\n", "\n");
  digest = sha256(sql);
  await admin.query(sql);

  const services = [];
  for (let index = 0; index < 11; index++) services.push(await connect("service_role"));
  const { seconds } = (await admin.query("select extract(second from clock_timestamp())::float8 seconds")).rows[0];
  // Cross-session minute assertions need all requests in the same UTC window.
  if (seconds >= 55) await wait(Math.ceil((60 - seconds) * 1000) + 60);
  const { utcDay } = (await admin.query("select to_char(now() at time zone 'UTC','YYYY-MM-DD') as \"utcDay\"")).rows[0];
  const [service] = services;
  const base = { actor: "reviewer", session: "login", utcDay };
  const counters = (account) => admin.query(`
    select counter, consumed from ironclad_private.ready_ai_budget
    where account=$1 order by window_start,counter
  `, [account]).then(({ rows }) => rows);

  await verify("Only service_role can reserve and application roles cannot read the counters", async () => {
    const input = { ...base, account: "1".repeat(32) };
    for (const role of ["anon", "authenticated"]) {
      const caller = await connect(role);
      await assert.rejects(reserve(caller, input), { code: "42501" });
      await assert.rejects(caller.query("select * from ironclad_private.ready_ai_budget"), { code: "42501" });
    }
    await assert.rejects(service.query("select * from ironclad_private.ready_ai_budget"), { code: "42501" });
    assert.deepEqual(await counters(input.account), []);
    assert.equal(await reserve(service, input), "reserved");
  });

  await verify("Concurrent reviewers share one Neuron cap and denied calls charge no counters", async () => {
    const account = "2".repeat(32);
    expectReservations(await Promise.all(services.map((client, index) => reserve(client, {
      account, actor: `reviewer-${index}`, session: `login-${index}`, utcDay, neurons: 70, cap: 300,
    }))), 4);
    const before = await counters(account);
    assert.deepEqual(before.find(({ counter }) => counter === "neurons"), { counter: "neurons", consumed: 280 });
    assert.deepEqual(before.find(({ counter }) => counter === "account"), { counter: "account", consumed: 4 });
    assert.equal(before.filter(({ counter }) => counter.startsWith("user:")).length, 4);
    assert.equal(before.filter(({ counter }) => counter.startsWith("session:")).length, 4);
    assert.equal(await reserve(service, { ...base, account, neurons: 21, cap: 300 }), "quota");
    assert.deepEqual(await counters(account), before);
    assert.equal(await reserve(service, { ...base, account, neurons: 20, cap: 300 }), "reserved");
    assert.equal((await counters(account)).find(({ counter }) => counter === "neurons").consumed, 300);
  });

  await verify("The same reviewer and session is limited across independent database connections", async () => {
    const account = "3".repeat(32);
    expectReservations(await Promise.all(services.map((client) => reserve(client, { ...base, account }))), 4);
    assert.deepEqual((await counters(account)).filter(({ counter }) => counter !== "neuron-ceiling")
      .map(({ consumed }) => consumed), new Array(7).fill(4));
    assert.equal(await reserve(service, { ...base, account, session: "next-login" }), "reserved");
    const before = await counters(account);
    assert.equal(await reserve(service, { ...base, account, session: "third-login" }), "quota");
    assert.deepEqual(await counters(account), before);
    assert.equal(await reserve(service, { ...base, account, actor: "another-reviewer", session: "other-login" }), "reserved");
  });

  await verify("Different sessions share reviewer limits and different reviewers share account-minute limits", async () => {
    expectReservations(await Promise.all(services.map((client, index) => reserve(client, {
      ...base, account: "4".repeat(32), session: `login-${index}`,
    }))), 5);
    expectReservations(await Promise.all(services.map((client, index) => reserve(client, {
      ...base, account: "5".repeat(32), actor: `reviewer-${index}`, session: `login-${index}`,
    }))), 10);
  });

  await verify("An older deployment cannot raise a reduced ceiling in the same UTC day", async () => {
    const account = "8".repeat(32);
    assert.equal(await reserve(services[0], { ...base, account, cap: 100, neurons: 20 }), "reserved");
    assert.equal(await reserve(services[1], { ...base, account, cap: 40, neurons: 10 }), "reserved");
    const before = await counters(account);
    assert.equal(before.find(({ counter }) => counter === "neuron-ceiling").consumed, 40);
    assert.equal(await reserve(services[2], { ...base, account, cap: 100, neurons: 11 }), "quota");
    assert.deepEqual(await counters(account), before);
    assert.equal(await reserve(services[3], { ...base, account, cap: 100, neurons: 10 }), "reserved");
    assert.equal((await counters(account)).find(({ counter }) => counter === "neurons").consumed, 40);
  });

  await verify("Prior UTC-day counters stay separate and spoofed UTC dates, budgets and identity values fail closed", async () => {
    const account = "6".repeat(32);
    const { yesterday, tomorrow } = (await admin.query(`
      select to_char((now() at time zone 'UTC') - interval '1 day','YYYY-MM-DD') yesterday,
             to_char((now() at time zone 'UTC') + interval '1 day','YYYY-MM-DD') tomorrow
    `)).rows[0];
    await admin.query(`
      insert into ironclad_private.ready_ai_budget values ($1, (($2::date)::timestamp at time zone 'UTC'), 'neurons', 2000, now()+interval '1 hour')
    `, [account, yesterday]);
    const before = await counters(account);
    for (const bad of [{ utcDay: yesterday }, { utcDay: tomorrow }, { cap: 2001 }, { neurons: 129 }, { account: "wrong" }]) {
      assert.equal(await reserve(service, { ...base, account, ...bad }), "unavailable");
    }
    assert.deepEqual(await counters(account), before);
    assert.equal(await reserve(service, { ...base, account, neurons: 1, cap: 1 }), "reserved");
    assert.deepEqual((await counters(account)).filter(({ counter }) => counter === "neurons").map(({ consumed }) => consumed), [2000, 1]);
  });

  await verify("Enabled, missing and malformed translation settings disable inference without quota charges", async () => {
    const account = "7".repeat(32);
    for (const value of ['{"enabled":true}', '{"enabled":"false"}', null]) {
      await admin.query("delete from public.platform_settings where key='match_chat_translation_enabled'");
      if (value) await admin.query("insert into public.platform_settings values ('match_chat_translation_enabled',$1)", [value]);
      assert.equal(await reserve(service, { ...base, account }), "unavailable");
      assert.deepEqual(await counters(account), []);
    }
    await admin.query("insert into public.platform_settings values ('match_chat_translation_enabled','{\"enabled\":false}')");
    assert.equal(await reserve(service, { ...base, account }), "reserved");
  });
} catch (error) {
  failure = error;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (server?.pid) {
    const stop = spawnSync(resolve(pg, "pg_ctl.exe"), ["-D", data, "-m", "fast", "stop", "-w"], {
      env, windowsHide: true, encoding: "utf8", timeout: 30000,
    });
    if (stop.status !== 0 && !failure) failure = new Error("Disposable PostgreSQL did not stop");
  }
  await writeFile(resolve(run, "postgres.log"), serverLog).catch(() => {});
  await writeFile(resolve(run, "report.json"), JSON.stringify({ passed: !failure, migration, digest, checks }, null, 2) + "\n").catch(() => {});
}

if (failure) throw failure;
console.log(JSON.stringify({ passed: true, checks, digest, report: resolve(run, "report.json") }, null, 2));
