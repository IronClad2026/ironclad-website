import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { repositoryRoot } from "./package.mjs";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const client = localClient(localPsqlArgument());
assert.equal(await client.run("select to_regclass('public.match_rooms') is null and (select count(*) from public.players)=0;"), "t");
if (await client.run("select exists(select 1 from pg_database where datname='p03_empty');", { db: "postgres" }) === "f") {
  await client.run("create database p03_empty template p03_rehearsal;", { db: "postgres" });
}
if (await client.run("select exists(select 1 from pg_database where datname='p03_restore_backup');", { db: "postgres" }) === "f") {
  await client.run("create database p03_restore_backup;", { db: "postgres" });
}
const fixture = readFileSync(path.join(repositoryRoot, "tests/database/match-room-phase-1.sql"), "utf8");
const cutoff = fixture.indexOf("-- Physical boundary:");
assert(cutoff > 0);
const prefix = fixture.slice(fixture.indexOf("begin;"), cutoff)
  .replaceAll("d19a0000", "d23a0000").replaceAll("match-room-test-", "p03-rehearsal-");
await client.run(prefix + readFileSync(path.join(repositoryRoot, "tests/p03-db/partial-tournament.sql"), "utf8") + "\ncommit;");
console.log("PASS seeded pre-P03 partial tournament; empty baseline p03_empty and restore target p03_restore_backup created");
