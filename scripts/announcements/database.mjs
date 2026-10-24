// LOCAL ONLY: reproduce the reviewed Production lineage in a new disposable
// database, then verify only the announcement enhancement. No app credentials,
// hosted connection, Production rows, or historical package edits are used.
// Usage: node scripts/announcements/database.mjs <local-psql-path>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localClient, localPsqlArgument } from "../p03-db/local-pg.mjs";
import { buildAtomicMigrationSql as p03Sql } from "../p03-db/package.mjs";
import { buildAtomicMigrationSql as consolidatedSql, catalogQuery, expectedFunctions } from "../consolidated-db/package.mjs";
import { buildPostDeploymentSql } from "../consolidated-db/post-deployment.mjs";
import { buildProductionLegalSql } from "../consolidated-legal/publication.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const port = Number(process.env.ANNOUNCEMENT_PG_PORT ?? "56623");
assert([56623, 56639].includes(port), "Only isolated announcement rehearsal ports are supported");
const database = "p03_announcements_" + Date.now();
const client = localClient(localPsqlArgument(), { port, database });
const run = (sql, options) => client.run("set client_encoding='UTF8';\n" + sql, options);
assert.equal(await run(`select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port};`, { db: "postgres" }), "t");
assert.equal(await run(`select count(*) from pg_database where datname=${literal(database)};`, { db: "postgres" }), "0",
  "Refuse to overwrite a database");
await run(`create database ${database};`, { db: "postgres" });
await run(read("tests/database/local-supabase-replay-prelude.sql") + "\n" + read("tests/consolidated-db/realtime-local-prelude.sql")
  + "\ncreate schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);");

const ledger = JSON.parse(read("docs/p03-production-ledger.json"));
const files = readdirSync(path.join(root, "supabase/migrations"));
for (const migration of ledger.migrations) {
  const matching = files.filter((file) => file.startsWith(migration.version + "_"));
  assert.equal(matching.length, 1, "Missing or ambiguous reviewed Production migration");
  const sql = read("supabase/migrations/" + matching[0]).replace(
    /^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
    "-- LOCAL ONLY: non-networking extension signatures supplied by replay prelude"
  );
  await run(sql + `\ninsert into supabase_migrations.schema_migrations(version,name) values(${literal(migration.version)},${literal(migration.name)});`);
}
await run(p03Sql());
const definitions = JSON.parse(read("scripts/consolidated-db/production-function-definitions.json")).functions;
await run("begin; set local check_function_bodies=off;\n"
  + definitions.map((item) => item.definition + ";").join("\n") + "\ncommit;");
assert.deepEqual(JSON.parse(await run(catalogQuery)), expectedFunctions, "Reviewed Production function catalog differs");
await run(read("tests/consolidated-db/production-provider-table-acl.sql"));
await run("update public.platform_settings set value='{\"enabled\":true}'::jsonb where key in ('elo_verification','match_room');");
console.log("PASS reviewed schema-only Production baseline: 153 migrations and 320 exact functions");

// Existing release builders and fixtures reproduce the already released 160-row
// lineage. Their immutable hashes and release guards remain intact. Synthetic
// legal/app attestations below apply exclusively to this verified local DB.
const candidateSha = "a".repeat(40);
const options = { projectRef: "nsyjtqpvyxlzyujlbzos", candidateSha };
const baselineSql = [
  read("tests/consolidated-db/lifecycle-helpers.sql"),
  read("tests/consolidated-db/legal-registry.sql"),
  read("tests/consolidated-db/legacy-history.sql"),
  read("tests/consolidated-db/retention-history.sql"),
  consolidatedSql(),
  `select set_config('ironclad.release_project_ref',${literal(options.projectRef)},false),
    set_config('ironclad.release_candidate_sha',${literal(candidateSha)},false),
    set_config('ironclad.release_app_verified_sha',${literal(candidateSha)},false);`,
  buildProductionLegalSql({ ...options, apply: true, authorization: "Release the approved candidate to Production." }),
  buildPostDeploymentSql(options),
].join("\n");
await run(baselineSql);
assert.equal(await run("select count(*) from supabase_migrations.schema_migrations;"), "160");
console.log("PASS current Production lineage: 160 migrations with synthetic legacy/legal history");

const feature = JSON.parse(read("docs/announcement-rich-documents-release.json")).source;
const legacyFunctions = `select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
  'definition',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text) order by p.oid::regprocedure::text)
  from pg_proc p where p.oid in ('public.list_active_announcements()'::regprocedure,
  'public.list_active_announcements_with_tournament()'::regprocedure,
  'public.publish_official_announcement(text,text,text,text,text,text,text)'::regprocedure,
  'public.publish_official_announcement_with_tournament(text,text,text,text,text,text,text,uuid)'::regprocedure,
  'public.withdraw_official_announcement(uuid,text)'::regprocedure,
  'public.mark_announcement_seen(text,uuid)'::regprocedure);`;
const legacyBefore = await run(legacyFunctions);
const featureSql = read(feature.path).replaceAll("\r\n", "\n");
assert.equal(createHash("sha256").update(featureSql, "utf8").digest("hex"), feature.lfSha256,
  "Announcement migration differs from reviewed source");
await run(featureSql);
assert.equal(await run(legacyFunctions), legacyBefore, "Feature altered legacy function definitions or permissions");
const output = await run(read("tests/database/announcement-rich-documents.sql"));
const result = JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith('{"suite"')));
assert.equal(result.status, "PASS");
assert.equal(result.passed, 49);
console.log(JSON.stringify({ ...result, database, runtime: await run("show server_version;"),
  baselineMigrations: 160, featureVersion: feature.version,
  limitation: "Stock PostgreSQL; non-networking pg_net/pg_cron/Vault/Realtime compatibility fixtures; no hosted provider, Clerk or Storage runtime proof" }));
