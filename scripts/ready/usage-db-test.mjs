import "../patch2/block-remote-network.cjs";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../..");
const tools = resolve(root, "../release-execution-tools");
const pg = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const migration = "20261117090000_ready_usage_tracking.sql";
const cloudMigration = "20261117143000_ready_cloud_usage.sql";
const suggestionMigration = "20261117190000_ready_topic_suggestions.sql";
const run = resolve(root, ".release-local", `ready-usage-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "password");
const password = randomBytes(32).toString("base64url");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(key)));
const clients = [];
const checks = [];
let postgres;
let failure;

const listener = createServer();
await new Promise((ok, fail) => {
  listener.once("error", fail);
  listener.listen(0, "127.0.0.1", ok);
});
const { port } = listener.address();
await new Promise((ok) => listener.close(ok));

async function open(role) {
  const client = new Client({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres",
    ssl: false, connectionTimeoutMillis: 900, statement_timeout: 8000 });
  try {
    await client.connect();
    if (role) await client.query(`set role ${role}`);
    clients.push(client);
    return client;
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

async function verify(label, action) {
  await action();
  checks.push(label);
}

try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password + "\n", { flag: "wx" });
  try {
    const init = spawnSync(resolve(pg, "initdb.exe"), ["-D", data, "-U", "postgres", "--pwfile", passwordFile,
      "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions"],
    { env, windowsHide: true, encoding: "utf8", timeout: 60_000 });
    assert.equal(init.status, 0, init.stderr);
  } finally {
    await unlink(passwordFile);
  }
  postgres = spawn(resolve(pg, "postgres.exe"), ["-D", data, "-h", "127.0.0.1", "-p", String(port),
    "-c", "unix_socket_directories=", "-c", "max_connections=15", "-c", "shared_buffers=32MB"],
  { env, windowsHide: true, stdio: "ignore" });
  let owner;
  for (let attempt = 0; attempt < 22 && !owner; attempt++) {
    try { owner = await open(); } catch { await wait(250); }
  }
  assert.ok(owner, "Disposable PostgreSQL did not start");
  const attachment = (await owner.query("select current_setting('data_directory') as directory")).rows[0];
  assert.equal(resolve(attachment.directory).toLowerCase(), data.toLowerCase());
  await owner.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema ironclad_private;
    grant usage on schema ironclad_private to anon, authenticated, service_role;
    create table public.players (id uuid primary key, account_closed_at timestamptz);
  `);
  await owner.query(await readFile(resolve(root, "supabase/migrations", migration), "utf8"));
  const service = await open("service_role");
  const secondService = await open("service_role");
  const account = Array.from({ length: 6 }, () => randomUUID());
  await owner.query("insert into public.players select unnest($1::uuid[])", [account]);
  const choice = async (player, enabled) => (await service.query("select public.set_ready_usage_choice($1,$2) as value", [player, enabled])).rows[0].value;
  const epoch = (await choice(account[0], true)).epoch;
  const other = (await choice(account[1], true)).epoch;
  const browser = randomUUID(), otherBrowser = randomUUID(), answer = randomUUID();
  const { today } = (await owner.query("select ((now() at time zone 'Australia/Sydney')::date)::text as today")).rows[0];
  const report = async (start = today, end = today, menu = "1") => (await service.query(
    "select public.get_ready_usage_report($1,$2,$3,'1','reviewer') as value", [start, end, menu],
  )).rows[0].value;
  const event = async (type, fields = {}, client = service) => {
    const value = { player: account[0], epoch, browser, id: randomUUID(), category: null,
      question: null, action: null, destination: null, outcome: null, helpful: null, answer: null, menu: "1", ...fields };
    return (await client.query("select public.record_ready_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'1') as result",
      [value.player, value.epoch, value.browser, value.id, type, value.category, value.question, value.action,
        value.destination, value.outcome, value.helpful, value.answer, value.menu])).rows[0].result;
  };

  await verify("API roles cannot read counters, write events or read the report", async () => {
    for (const role of ["anon", "authenticated"]) {
      const denied = await open(role);
      await assert.rejects(denied.query("select * from ironclad_private.ready_usage_events"), { code: "42501" });
      await assert.rejects(denied.query("select public.get_ready_usage_report(current_date,current_date,'1','1','reviewer')"), { code: "42501" });
      await assert.rejects(event("manual_open", {}, denied), { code: "42501" });
    }
    await assert.rejects(service.query("select * from ironclad_private.ready_usage_events"), { code: "42501" });
  });
  await verify("Opens and answer displays alone do not engage; retries and votes deduplicate", async () => {
    const id = randomUUID();
    assert.deepEqual((await Promise.all([
      event("manual_open", { id }), event("manual_open", { id }, secondService),
    ])).sort(), ["duplicate", "stored"]);
    assert.equal(await event("manual_open"), "stored");
    assert.equal(await event("answer_display", { question: "format", answer }), "stored");
    assert.equal((await report()).totals.engagedSessions, 0);
    assert.equal(await event("helpfulness", { question: "format", answer: randomUUID(), helpful: true }), "invalid");
    assert.equal(await event("helpfulness", { question: "format", answer, helpful: true }), "stored");
    assert.equal(await event("helpfulness", { question: "format", answer, helpful: false }), "duplicate");
  });
  await verify("Distinct accounts and sessions are exact across a range and align with the chosen version", async () => {
    assert.equal(await event("category_select", { category: "match" }), "stored");
    assert.equal(await event("engage", { browser: otherBrowser }), "stored");
    await owner.query("update ironclad_private.ready_usage_sessions set last_event_at = now() - interval '31 minutes' where browser_key=$1", [browser]);
    assert.equal(await event("question_select", { question: "format" }), "stored");
    assert.equal(await event("engage", { player: account[1], epoch: other }), "stored");
    assert.equal(await event("action_click", { action: "open_match", destination: "match" }), "stored");
    assert.equal(await event("search_outcome", { outcome: "no_result", question: "raw or guessed content" }), "invalid");
    assert.equal(await event("search_outcome", { outcome: "no_result" }), "stored");
    const { totals, questions, categories, destinations } = await report();
    assert.deepEqual(totals, { engagedAccounts: 2, engagedSessions: 4, manualOpenings: 2, categorySelections: 1,
      questionSelections: 1, answerDisplays: 1, actionClicks: 1, unmatchedSearches: 1, fallbacks: 0,
      technicalErrors: 0, helpful: 1, stillNeedHelp: 0 });
    assert.deepEqual(questions, [{ id: "format", selections: 1, displays: 1, helpful: 1, stillNeedHelp: 0 }]);
    assert.deepEqual(categories, [{ id: "match", count: 1 }]);
    assert.deepEqual(destinations, [{ id: "match", count: 1 }]);
    assert.equal((await report(today, today, "2")).coverage.collected, false);
  });
  await verify("Cloud-only flags store only known category or unknown and preserve legacy measurements", async () => {
    await owner.query(await readFile(resolve(root, "supabase/migrations", cloudMigration), "utf8"));
    const id = randomUUID();
    const known = { id, category: "rules", menu: "2" };
    assert.deepEqual((await Promise.all([
      event("topic_missing", known), event("topic_missing", known, secondService),
    ])).sort(), ["duplicate", "stored"]);
    assert.equal(await event("topic_missing", { menu: "2" }), "stored");
    assert.equal(await event("topic_missing", { menu: "2", category: "guessed_category" }), "invalid");
    assert.equal(await event("topic_missing", { menu: "2", question: "disconnects" }), "invalid");
    assert.equal(await event("topic_missing", { menu: "2", outcome: "raw text" }), "invalid");
    assert.equal(await event("topic_missing", { category: "rules" }), "invalid");
    assert.equal(await event("search_outcome", { menu: "2", outcome: "no_result" }), "invalid");
    assert.equal(await event("topic_missing", { player: account[2], menu: "2" }), "off");
    const displayed = { menu: "2", question: "disconnects", answer: randomUUID() };
    assert.equal(await event("answer_display", displayed), "stored");
    assert.equal(await event("helpfulness", { ...displayed, helpful: false }), "stored");
    const current = await report(today, today, "2");
    assert.deepEqual(current.missingByCategory, [{ id: "rules", count: 1 }, { id: "unknown", count: 1 }]);
    assert.equal(current.totals.missingTopics, 2);
    assert.equal(current.totals.unmatchedSearches, 0);
    assert.equal(current.totals.engagedAccounts, 1);
    assert.deepEqual(current.questions, [{ id: "disconnects", selections: 0, displays: 1, helpful: 0, stillNeedHelp: 1 }]);
    const legacy = await report();
    assert.equal(legacy.totals.missingTopics, 0);
    assert.equal(legacy.totals.unmatchedSearches, 1);
    assert.deepEqual(legacy.missingByCategory, []);
    for (const role of ["anon", "authenticated"]) {
      const denied = await open(role);
      await assert.rejects(event("topic_missing", { menu: "2" }, denied), { code: "42501" });
      await assert.rejects(denied.query("select public.get_ready_usage_report(current_date,current_date,'2','1','reviewer')"), { code: "42501" });
    }
  });
  await verify("Withdrawal invalidates pending and outdated epochs and closure removes linked records", async () => {
    assert.equal(await event("engage", { player: account[2] }), "off");
    assert.deepEqual(await choice(account[0], false), { enabled: false, epoch: null });
    assert.equal(await event("engage"), "off");
    const resumed = await choice(account[0], true);
    assert.notEqual(resumed.epoch, epoch);
    assert.equal(await event("engage"), "off");
    assert.equal(await event("engage", { epoch: resumed.epoch }), "stored");
    const own = (await owner.query("select account_key from ironclad_private.ready_usage_consent where player_id=$1", [account[0]])).rows[0].account_key;
    await owner.query("update public.players set account_closed_at=now() where id=$1", [account[0]]);
    for (const table of ["ready_usage_consent", "ready_usage_sessions", "ready_usage_events"]) {
      assert.equal((await owner.query(`select count(*)::integer n from ironclad_private.${table} where account_key=$1`, [own])).rows[0].n, 0);
    }
    assert.equal(await event("manual_open", { epoch: resumed.epoch }), "off");
    assert.equal((await report()).totals.engagedAccounts, 1);
  });
  await verify("Retention rolls up only sufficiently large cells, drops identifiers and discards expired archives", async () => {
    for (const player of account.slice(1)) await choice(player, true);
    await owner.query(`
      insert into ironclad_private.ready_usage_events
        (event_id, account_key, session_key, received_at, usage_day, event_type, menu_version, catalogue_version)
      select gen_random_uuid(), account_key, gen_random_uuid(), now() - days * interval '1 day',
        $1::date - days, 'manual_open','1','1'
      from ironclad_private.ready_usage_consent cross join (values (100), (400)) as ages(days)
    `, [today]);
    await owner.query(`
      insert into ironclad_private.ready_usage_events
        (event_id, account_key, session_key, received_at, usage_day, event_type, menu_version, catalogue_version)
      select gen_random_uuid(), account_key, gen_random_uuid(), now() - interval '101 days',
        $1::date - 101, 'manual_open','1','1' from ironclad_private.ready_usage_consent limit 1
    `, [today]);
    await assert.rejects(service.query("select ironclad_private.maintain_ready_usage()"), { code: "42501" });
    await owner.query("select ironclad_private.maintain_ready_usage(); select ironclad_private.maintain_ready_usage()");
    assert.equal((await owner.query("select count(*)::integer n from ironclad_private.ready_usage_events where usage_day < $1::date - 88", [today])).rows[0].n, 0);
    const daily = (await owner.query("select total::integer from ironclad_private.ready_usage_daily")).rows;
    assert.deepEqual(daily, [{ total: 5 }]);
    const past = (await owner.query("select ($1::date - 100)::text as value", [today])).rows[0].value;
    assert.equal((await report(past, today)).totals.engagedAccounts, null);
    assert.equal((await report(past, today)).totals.manualOpenings, 5);
  });
  await owner.query(await readFile(resolve(root, "supabase/migrations", suggestionMigration), "utf8"));
  const guestRateKey = randomBytes(32).toString("hex");
  const memberRateKey = randomBytes(32).toString("hex");
  const id = randomUUID();
  const sameWording = "Staging fixture: explain replays for returning players.";
  const save = async (client, { key = guestRateKey, suggestionId = id, description = sameWording, category = "results" } = {}) =>
    (await client.query("select public.submit_ready_topic_suggestion($1,$2,$3,'2','1',$4) as value",
      [suggestionId, description, category, key])).rows[0].value;
  const list = async (client = service, status = null, limit = 20, offset = 0) =>
    (await client.query("select public.get_ready_topic_suggestions($1,$2,$3) as value", [status, limit, offset])).rows[0].value;
  const review = async (client, status, remove, suggestionId = id) =>
    (await client.query("select public.review_ready_topic_suggestion($1,$2,$3) as value", [suggestionId, status, remove])).rows[0].value;

  await verify("Written suggestions deduplicate concurrent retry IDs without deduplicating text", async () => {
    const statuses = await Promise.all([save(service), save(secondService)]);
    assert.deepEqual(statuses.sort(), ["duplicate", "stored"]);
    assert.equal(await save(service, { description: "Different wording with the same ID." }), "conflict");
    assert.equal(await save(service, { suggestionId: randomUUID(), key: memberRateKey, category: null }), "stored");
    assert.equal(await save(service, { suggestionId: randomUUID(), description: " ".repeat(500) }), "invalid");
    assert.equal(await save(service, { suggestionId: randomUUID(), description: "A".repeat(501) }), "invalid");
    assert.equal(await save(service, { suggestionId: randomUUID(), category: "guessed" }), "invalid");
    const suggestions = await list();
    assert.equal(suggestions.total, 2);
    const row = suggestions.rows.find((item) => item.id === id);
    assert.deepEqual(Object.keys(row).sort(), ["id", "submittedAt", "categoryId", "description", "menuVersion", "catalogueVersion", "status"].sort());
    assert.ok(Number.isFinite(Date.parse(row.submittedAt)));
    assert.equal(row.description, sameWording);
    assert.equal(row.status, "new");
    assert.equal(await list(service, null, 51), null);
  });

  await verify("Written suggestion quota is atomic, anonymous and separate from opt-in usage", async () => {
    const parallel = Array.from({ length: 8 }, () => randomUUID()).map((suggestionId, i) =>
      save(i % 2 ? service : secondService, { suggestionId }));
    const statuses = await Promise.all(parallel);
    assert.equal(statuses.filter((value) => value === "stored").length, 4);
    assert.equal(statuses.filter((value) => value === "rate_limited").length, 4);
    assert.equal(await save(service), "duplicate");
    for (const role of ["anon", "authenticated", "service_role"]) {
      const denied = await open(role);
      await assert.rejects(denied.query("select description from ironclad_private.ready_topic_suggestions"), { code: "42501" });
      await assert.rejects(denied.query("select actor_key from ironclad_private.ready_topic_suggestion_limits"), { code: "42501" });
      if (role === "service_role") continue;
      await assert.rejects(save(denied), { code: "42501" });
      await assert.rejects(list(denied), { code: "42501" });
      await assert.rejects(review(denied, "reviewed", false), { code: "42501" });
    }
  });

  await verify("Only service RPCs can review and delete, with status filtering and retention", async () => {
    assert.equal(await review(service, "reviewed", false), "updated");
    assert.equal((await list(service, "reviewed", 1, 0)).rows[0].id, id);
    assert.deepEqual(await list(service, "reviewed", 1, 1), { total: 1, rows: [] });
    assert.equal(await review(service, "added", false), "updated");
    assert.equal((await list(service, "added")).total, 1);
    assert.equal(await review(service, null, true), "deleted");
    assert.equal(await review(service, null, true), "not_found");
    await owner.query(`
      update ironclad_private.ready_topic_suggestions set submitted_at = now() - interval '91 days'
        where id = (select id from ironclad_private.ready_topic_suggestions limit 1);
      insert into ironclad_private.ready_topic_suggestion_limits values (now() - interval '2 hours', repeat('a', 64), 1);
      select ironclad_private.maintain_ready_topic_suggestions();
    `);
    assert.equal((await list()).total, 4);
    assert.equal((await owner.query("select count(*)::int as n from ironclad_private.ready_topic_suggestion_limits")).rows[0].n, 2);
  });
} catch (error) {
  failure = error;
} finally {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  if (postgres?.pid) {
    const stop = spawnSync(resolve(pg, "pg_ctl.exe"), ["-D", data, "-m", "fast", "stop", "-w"],
      { env, windowsHide: true, encoding: "utf8", timeout: 30_000 });
    if (stop.status !== 0 && !failure) failure = new Error("Disposable PostgreSQL did not stop");
  }
  await writeFile(resolve(run, "report.json"), JSON.stringify({ passed: !failure, migrations: [migration, cloudMigration, suggestionMigration], checks }, null, 2) + "\n");
}
if (failure) throw failure;
console.log(JSON.stringify({ passed: true, checks }, null, 2));
