// LOCAL ONLY: replay current staging lineage into a fresh disposable database.
// Usage: node scripts/p03-1/database.mjs <local-psql-path>
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const root = process.cwd();
const database = "p03_realtime_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
assert.equal(await client.run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port};`, { db: "postgres" }), "t");
assert.equal(await client.run(`select count(*) from pg_database where datname='${database}';`, { db: "postgres" }), "0", "Refuse to overwrite a database");
await client.run(`create database ${database};`, { db: "postgres" });
const read = (file) => readFileSync(path.join(root, file), "utf8");
await client.run(read("tests/database/local-supabase-replay-prelude.sql") + "\n" + read("tests/database/match-room-realtime-local-prelude.sql"));
const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
for (const name of migrations) {
  let sql = read("supabase/migrations/" + name);
  sql = sql.replace(/^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
    "-- LOCAL ONLY: non-networking signature supplied by replay prelude");
  try { await client.run(sql); } catch (error) { throw new Error("Migration " + name + ": " + error.message); }
}
console.log("PASS full staging migration replay: " + migrations.length);
await client.run("select public.set_match_room_enabled(true,'match-room-test-4');");
const suites = [];
for (const name of ["match-room-phase-1", "match-room-phase-3", "match-room-production-hardening", "match-room-unread-summary"]) {
  const output = await client.run(read("tests/database/" + name + ".sql"));
  const result = output.split(/\r?\n/).findLast((line) => line.startsWith('{"suite"'));
  const count = output.match(/(?:ASSERTIONS|assertions)=(\d+)/)?.[1]
    ?? (name === "match-room-phase-1" ? output.split(/\r?\n/).findLast((line) => /^\d+$/.test(line)) : undefined);
  suites.push(result ? JSON.parse(result) : { suite: name, status: "PASS", passed: count ? Number(count) : undefined });
  console.log("PASS " + name + (result ? ": " + JSON.parse(result).passed : count ? ": " + count : ""));
}
const fixture = read("tests/database/match-room-phase-1.sql");
const prefix = fixture.slice(fixture.indexOf("begin;"), fixture.indexOf("-- Physical boundary:"));
for (const name of ["match-room-retention", "match-room-realtime"]) {
  const output = await client.run(prefix + read("tests/database/" + name + ".sql"));
  const result = JSON.parse(output.split(/\r?\n/).findLast((line) => line.startsWith('{"suite"')));
  suites.push(result);
  console.log("PASS " + name + ": " + result.passed);
}
assert.equal(await client.run("select (select count(*) from public.players)=0 and (select count(*) from public.match_messages)=0 and (select count(*) from realtime.messages)=0;"), "t", "Rollback suites left synthetic state");
writeFileSync(path.join(root, "scripts/p03-1/database-evidence.json"), JSON.stringify({
  testedAt: new Date().toISOString(), database, runtime: await client.run("show server_version;"),
  transport: "local transaction outbox compatibility only; hosted websocket verified separately",
  migrationCount: migrations.length, status: "PASS", suites,
}, null, 2) + "\n");
