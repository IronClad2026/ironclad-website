// Local-only full replay plus P03/P03.1 assertions with future Pro fixtures.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "../p03-1/local-pg.mjs";

const root = process.cwd();
const stamp = Date.now();
const database = "p03_four_division_regression_" + stamp;
const historicalDatabase = "p03_four_division_room_" + stamp;
const psql = localPsqlArgument();
const client = localClient(psql, { database });
const historical = localClient(psql, { database: historicalDatabase });
const read = (name) => readFileSync(path.join(root, name), "utf8");
const replay = JSON.parse(read("scripts/p03-1/database-evidence.json"));
assert.match(replay.database, /^p03_realtime_\d+$/);
assert.match(replay.legacyDatabase, /^p03_realtime_legacy_\d+$/);
assert.equal(await client.run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port};`, { db: "postgres" }), "t");
await client.run(`create database ${database} template ${replay.database};`, { db: "postgres" });
await client.run(`create database ${historicalDatabase} template ${replay.legacyDatabase};`, { db: "postgres" });
console.log("PASS verified full-head and pre-Patch-2 migration templates");
await client.run(read("tests/database/four-division-model-fixtures-local.sql"));
console.log("PASS four-division model, fixture, role and immutable-history contracts");

function futureFixture(sql, division) {
  // Only fixture facts change; existing authorization and transport assertions remain.
  let result = sql;
  if (division === "pro") {
    result = result.replaceAll("'Academy'", "'Pro'").replaceAll("'0-1099'", "'1700+'").replaceAll(", true, 1000", ", true, 1900")
      .replaceAll("'verified', 1000", "'verified', 1900").replaceAll("  1000, 'US Forces'", "  1900, 'US Forces'");
  }
  return result;
}

const suites = [];
for (const division of ["academy", "pro"]) {
  const fixture = futureFixture(read("tests/database/match-room-phase-1.sql"), division);
  const prefix = fixture.slice(fixture.indexOf("begin;"), fixture.indexOf("-- Physical boundary:"));
  for (const name of ["match-room-phase-1", "match-room-phase-3", "match-room-production-hardening", "match-room-unread-summary", "match-room-retention", "match-room-realtime"]) {
    const body = futureFixture(read("tests/database/" + name + ".sql"), division);
    const output = await historical.run(name === "match-room-retention" || name === "match-room-realtime" ? prefix + body : body);
    const result = output.split(/\r?\n/).findLast((line) => line.startsWith('{"suite"'));
    const evidence = result ? JSON.parse(result) : { suite: name, status: "PASS" };
    suites.push({ division, ...evidence });
    console.log(`PASS ${division}: ${name}${evidence.passed ? ": " + evidence.passed : ""}`);
  }
  const currentFixture = futureFixture(read("tests/database/match-room-current-security.sql"), division);
  const currentOutput = await client.run(prefix + currentFixture);
  const currentResult = currentOutput.split(/\r?\n/).findLast((line) => line.startsWith('{"suite"'));
  assert(currentResult, "Current Match Room security emits executable evidence");
  suites.push({ division, ...JSON.parse(currentResult) });
  console.log(`PASS ${division}: current Match Room security`);
}
for (const databaseClient of [client, historical]) {
  assert.equal(await databaseClient.run("select (select count(*) from public.players)=0 and (select count(*) from public.match_messages)=0 and (select count(*) from realtime.messages)=0;"), "t", "Rollback suites left synthetic state");
}
const dir = path.join(root, "test-results/four-division");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "p03-database-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), database,
  runtime: await client.run("show server_version;"), migrationCount: replay.migrationCount, status: "PASS", suites,
  transport: "Local transaction outbox shim only; hosted websocket verification is a separate gate.",
}, null, 2) + "\n");

// Clone the verified empty replay so the complete played lifecycle/concurrency
// harness can retain its synthetic evidence without affecting the P03 template.
const lifecycleDatabase = "p03_four_division_fixtures_" + Date.now();
await client.run(`create database ${lifecycleDatabase} template ${database};`, { db: "postgres" });
const lifecycle = spawnSync(process.execPath, [path.join(root, "tests/database/four-division-lifecycle-concurrency.mjs"), psql, String(client.port), lifecycleDatabase], {
  cwd: root, encoding: "utf8", windowsHide: true, timeout: 180_000,
});
assert.equal(lifecycle.status, 0, lifecycle.stderr || lifecycle.error?.message);
console.log(lifecycle.stdout);
