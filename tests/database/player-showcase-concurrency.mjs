// LOCAL ONLY: node tests/database/player-showcase-concurrency.mjs <local-psql.exe>
// Requires a fully migrated disposable ironclad_showcase_contract database on
// 127.0.0.1:55464. Clones a fresh test database; never uses remote credentials.
// The isolated database is retained for inspection, not dropped automatically.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const psql = process.argv[2];
assert(psql, "A local psql executable is required");
const template = "ironclad_showcase_contract";
const database = `ironclad_showcase_races_${randomBytes(4).toString("hex")}`;
const port = "55464";

function start(sql, name = "showcase-query", db = database) {
  const child = spawn(
    psql,
    ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", db,
      "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    {
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: process.env.PATH,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PGCONNECT_TIMEOUT: "3",
        PGAPPNAME: name,
      },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timeout = setTimeout(() => child.kill(), 20_000);
  const result = new Promise((resolve, reject) => {
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output: output.trim() });
    });
  });
  child.stdin.end("set statement_timeout='15s';\n" + sql);
  return result;
}

async function query(sql, db = database) {
  const result = await start(sql, "showcase-query", db);
  assert.equal(result.code, 0, result.output);
  return result.output.split(/\r?\n/).at(-1);
}

async function waitFor(sql) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if ((await query(sql)) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Expected local database lock state was not observed");
}

const locked = (name) =>
  `select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock');`;
const owner = (identity, sql) =>
  `set role authenticated; set request.jwt.claims='{"role":"authenticated","sub":"${identity}"}'; ${sql}`;
const service = (sql) =>
  `set request.jwt.claims='{"role":"service_role","sub":"showcase-race-admin"}'; ${sql}`;
const playerId = (number) => `75000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

assert.equal(
  await query(
    `select current_database()='${template}' and inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port};`,
    template
  ),
  "t",
  "Only the named local disposable template may be used"
);
await query(`create database ${database} template ${template};`, "postgres");

const source = readFileSync(new URL("./player-showcase-phase-a.sql", import.meta.url), "utf8");
const fixtureStart = source.indexOf("-- Fixed fixture IDs");
const fixtureEnd = source.indexOf("-- Actual role permissions");
assert(fixtureStart >= 0 && fixtureEnd > fixtureStart, "Fixture boundaries must exist");
await query(service(source.slice(fixtureStart, fixtureEnd)));
await query(service(`
  update public.platform_settings set value='{"enabled":true}'::jsonb where key='player_showcase';
  insert into public.leaderboard_player_all_time_stats(player_id,bracket_type)
  values ('${playerId(3)}','main');
  select public.accept_current_account_legal_documents(identity,
    '75200000-0000-4000-8000-000000000001',
    '75200000-0000-4000-8000-000000000002',true,true)
  from (values ('showcase-local-owner'),('showcase-local-closing'),('showcase-local-deleting')) as identities(identity);
`));

async function orderedRace(number, firstSql, secondSql, firstCode, secondCode) {
  const name = `showcase-race-${number}`;
  const blocker = start(
    `begin; select id from public.players where id='${playerId(number)}' for update; select pg_sleep(3); commit;`,
    name + "-blocker"
  );
  await waitFor(
    `select exists(select 1 from pg_stat_activity where application_name='${name}-blocker' and wait_event='PgSleep');`
  );
  const first = start(firstSql, name + "-first");
  await waitFor(locked(name + "-first"));
  const second = start(secondSql, name + "-second");
  await waitFor(locked(name + "-second"));
  const results = await Promise.all([blocker, first, second]);
  for (const result of results) {
    assert.equal(result.code, 0, result.output);
    assert(!/deadlock detected|statement timeout/i.test(result.output), result.output);
  }
  assert.equal(JSON.parse(results[1].output.split(/\r?\n/).at(-1))[firstCode.key], firstCode.value);
  assert.equal(JSON.parse(results[2].output.split(/\r?\n/).at(-1))[secondCode.key], secondCode.value);
}

await orderedRace(
  1,
  owner("showcase-local-owner", "select public.save_my_player_showcase_thought('First write',0);"),
  owner("showcase-local-owner", "select public.save_my_player_showcase_badge('75100000-0000-4000-8000-000000000001',0);"),
  { key: "code", value: "saved" },
  { key: "code", value: "conflict" }
);
assert.equal(await query(`select count(*)=1 and max(revision)=1 from public.player_showcases where player_id='${playerId(1)}';`), "t");

await orderedRace(
  3,
  service("select public.close_ironclad_player_account('showcase-local-closing');"),
  owner("showcase-local-closing", "select public.save_my_player_showcase_thought('Late first write',0);"),
  { key: "outcome", value: "pseudonymized" },
  { key: "code", value: "profile-required" }
);
await orderedRace(
  4,
  owner("showcase-local-deleting", "select public.save_my_player_showcase_thought('Write before closure',0);"),
  service("select public.close_ironclad_player_account('showcase-local-deleting');"),
  { key: "code", value: "saved" },
  { key: "outcome", value: "deleted" }
);
assert.equal(
  await query(`select not exists(select 1 from public.player_showcases where player_id in ('${playerId(3)}','${playerId(4)}'));`),
  "t"
);
console.log(`PASS: three bounded local Showcase races; retained ${database} on 127.0.0.1:${port}`);
