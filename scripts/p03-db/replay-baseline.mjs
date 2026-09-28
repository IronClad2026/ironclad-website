import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { repositoryRoot } from "./package.mjs";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const client = localClient(localPsqlArgument());
assert.equal(await client.run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623;"), "t");
assert.equal(await client.run("select to_regclass('public.tournaments') is null;"), "t", "Requires empty disposable p03_rehearsal");
const prelude = readFileSync(path.join(repositoryRoot, "tests/database/local-supabase-replay-prelude.sql"), "utf8");
await client.run(prelude + "\ncreate schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);");
const ledger = JSON.parse(readFileSync(path.join(repositoryRoot, "docs/p03-production-ledger.json"), "utf8"));
const files = readdirSync(path.join(repositoryRoot, "supabase/migrations"));
for (const migration of ledger.migrations) {
  const matching = files.filter((file) => file.startsWith(migration.version + "_"));
  assert.equal(matching.length, 1, "Missing or ambiguous Production migration " + migration.version);
  let sql = readFileSync(path.join(repositoryRoot, "supabase/migrations", matching[0]), "utf8");
  // Stock PostgreSQL lacks hosted HTTP/cron extensions. The checked-in local
  // prelude supplies their non-networking signatures; P03 SQL is never changed.
  sql = sql.replace(/^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
    "-- LOCAL ONLY: hosted extension replaced by the replay prelude");
  await client.run(sql + `\ninsert into supabase_migrations.schema_migrations(version,name) values('${migration.version}','${migration.name.replaceAll("'", "''")}');`);
  console.log("PASS baseline " + migration.version);
}
console.log("PASS Production baseline migration replay: " + ledger.migrations.length);
