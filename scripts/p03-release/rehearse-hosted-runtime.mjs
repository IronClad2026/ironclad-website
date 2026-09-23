// GitHub-hosted Linux CI only. Synthetic data + actual Supabase extension
// binaries, with no Production credentials and no externally reachable server.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backup, restore, validateExtensionRuntime } from "./backup.mjs";
import { capture, connection, digest, readJson, readOnlySql, run, saveJson } from "./core.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const image = "supabase/postgres:17.6.1.127";
const extensions = readJson(path.join(root, "scripts/p03-release/production-extensions.json")).extensions;
const ledger = readJson(path.join(root, "docs/p03-production-ledger.json")).migrations;
const suffix = randomUUID().slice(0, 8);
const network = `p03-restore-ci-${suffix}`;
const sourceName = `p03-restore-source-${suffix}`;
const restoreName = `p03-restore-target-${suffix}`;
const sourceDatabase = "p03_hosted_source";
const targetDatabase = "p03_restore_hosted";
const created = [];
let networkCreated = false;
const steps = [];
const passed = (step) => { steps.push(step); console.log(`PASS ${step}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

function localEnvironment(hostname, database, container) {
  return {
    ...process.env,
    P03_DATABASE_URL: `postgresql://postgres@${hostname}:5432/${database}`,
    P03_RESTORE_DATABASE_URL: `postgresql://postgres@${hostname}:5432/${database}`,
    P03_LOCAL_CONTAINER: container,
    P03_RESTORE_CONTAINER: container,
    P03_PG_BIN: process.env.P03_PG_BIN || "/usr/lib/postgresql/17/bin",
  };
}

function sql(db, input) {
  assert.equal(db.local, true, "Hosted-runtime rehearsal cannot use a remote database");
  assert(process.platform === "linux" && process.env.GITHUB_ACTIONS === "true" && db.containerAttestation?.name === sourceName, "SQL diagnostics are restricted to this synthetic source container");
  const result = spawnSync(db.bin("psql"), ["-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input, env: { ...db.env, PGOPTIONS: "-c statement_timeout=60000 -c lock_timeout=2000" }, timeout: 90000, encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  // This dedicated container contains only committed synthetic fixture data.
  // Production/restore commands retain core.run's suppression of all stderr.
  if (result.error || result.status !== 0) console.error(`Synthetic source SQL diagnostic: ${(result.stderr ?? result.error?.code ?? "unavailable").slice(-4096)}`);
  assert(!result.error && result.status === 0, "Synthetic source SQL failed");
  return result.stdout.trim();
}

async function startContainer(name, database) {
  // Skip the image's project-init scripts, creating a clean PostgreSQL cluster
  // with the image's real extension binaries. Source/target must be separate
  // clusters because pg_cron pins its metadata to cron.database_name.
  const networkState = JSON.parse(run("docker", ["network", "inspect", network]))[0];
  const subnet = networkState.IPAM?.Config?.find((entry) => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(entry.Subnet ?? ""))?.Subnet;
  assert(networkState.Internal === true && subnet, "Rehearsal requires its isolated IPv4 bridge subnet");
  const shell = `set -eu
initdb -D /tmp/p03-data -U postgres --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale >/dev/null
echo 'host all postgres ${subnet} trust' >> /tmp/p03-data/pg_hba.conf
exec postgres -D /tmp/p03-data -c listen_addresses='*' -c unix_socket_directories=/tmp -c shared_preload_libraries=pg_cron,pg_net,pg_stat_statements -c cron.database_name=${database} -c cron.launch_active_jobs=off -c pg_net.database_name=postgres -c max_connections=30`;
  run("docker", ["run", "--detach", "--name", name, "--network", network, "--user", "postgres", "--entrypoint", "sh", image, "-c", shell]);
  created.push(name);
  const containerIp = JSON.parse(run("docker", ["inspect", name]))[0].NetworkSettings.Networks[network].IPAddress;
  const admin = connection(localEnvironment(containerIp, "postgres", name));
  admin.env.PGCONNECT_TIMEOUT = "2";
  let socketReady = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      run("docker", ["exec", name, "psql", "-X", "-h", "/tmp", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", "select 1;"], { timeout: 2000 });
      socketReady = true;
      break;
    } catch { await sleep(1000); }
  }
  assert(socketReady, "Disposable container local socket did not become ready within 45 seconds");
  // Create exactly once: an uncertain result must fail, never retry a mutation.
  run("docker", ["exec", name, "createdb", "-h", "/tmp", "-U", "postgres", "--template=template0", database], { timeout: 5000 });
  let ready = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    try { readOnlySql(admin, "select 1;", 2000); ready = true; break; } catch { await sleep(1000); }
  }
  if (!ready) {
    const state = JSON.parse(run("docker", ["inspect", name]))[0].State;
    console.error(JSON.stringify({ syntheticContainer: name, status: state.Status, exitCode: state.ExitCode }));
    // This container is still empty and has never received application data or
    // credentials. Bounded startup diagnostics are safe to expose in CI logs.
    const logs = spawnSync("docker", ["logs", "--tail", "35", name], { encoding: "utf8", timeout: 10000, maxBuffer: 16384 });
    console.error(`${logs.stdout ?? ""}${logs.stderr ?? ""}`.slice(-4096));
    const probe = spawnSync(admin.bin("psql"), ["-X", "--no-password", "-qAt", "-c", "select 1;"], { env: admin.env, encoding: "utf8", timeout: 10000, maxBuffer: 4096 });
    console.error(JSON.stringify({ initializedThroughLocalSocket: true, clientError: probe.error?.code, clientStatus: probe.status, clientDiagnostic: probe.stderr?.slice(-2048) }));
  }
  assert(ready, "Disposable container did not become ready within the startup bound");
  return connection(localEnvironment(containerIp, database, name));
}

function installRealExtensions(db) {
  const available = JSON.parse(readOnlySql(db, "select jsonb_agg(jsonb_build_object('name',name,'default_version',default_version)) from pg_available_extensions;"));
  validateExtensionRuntime(extensions, available);
  sql(db, "create schema extensions; create schema vault;");
  for (const extension of extensions) {
    assert(/^[a-z_][a-z0-9_-]*$/.test(extension.name));
    assert(/^[a-z_][a-z0-9_]*$/.test(extension.schema));
    if (extension.name === "plpgsql") continue;
    console.log(`Installing observed extension ${extension.name}@${extension.version}`);
    sql(db, `create extension "${extension.name}" with schema "${extension.schema}" version ${literal(extension.version)};`);
  }
  const installed = JSON.parse(readOnlySql(db, "select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace;"));
  assert.equal(digest(installed), digest([...extensions].sort((a, b) => a.name.localeCompare(b.name))), "Actual installed extension set differs from Production inventory");
}

function seedSource(db) {
  const original = readFileSync(path.join(root, "tests/database/local-supabase-replay-prelude.sql"), "utf8");
  const cutoff = original.indexOf("create or replace function extensions.gen_random_bytes");
  assert(cutoff > 0, "Auth/Storage-only prelude boundary changed");
  const prelude = original.slice(0, cutoff).replace("create extension if not exists pgcrypto with schema public;", "");
  assert(!/create (?:or replace )?(?:function|table)[\s\S]*?\b(?:net\.http_post|cron\.job|cron\.schedule|vault\.decrypted_secrets)/i.test(prelude), "Hosted extensions must never be replaced by local stubs");
  sql(db, prelude + "\ncreate schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);");
  const files = readdirSync(path.join(root, "supabase/migrations"));
  for (const migration of ledger) {
    const matches = files.filter((file) => file.startsWith(`${migration.version}_`));
    assert.equal(matches.length, 1, "Reviewed baseline migration missing or ambiguous");
    const source = readFileSync(path.join(root, "supabase/migrations", matches[0]), "utf8");
    // Deliberately no CREATE EXTENSION stripping or function substitution.
    try { sql(db, source + `\ninsert into supabase_migrations.schema_migrations(version,name) values(${literal(migration.version)},${literal(migration.name)});`); }
    catch { throw new Error(`Synthetic hosted-runtime baseline migration ${migration.version} failed; no Production connection exists.`); }
  }
  const fixture = readFileSync(path.join(root, "tests/database/match-room-phase-1.sql"), "utf8");
  const fixtureCutoff = fixture.indexOf("-- Physical boundary:");
  assert(fixtureCutoff > 0);
  const prefix = fixture.slice(fixture.indexOf("begin;"), fixtureCutoff).replaceAll("d19a0000", "d23a0000").replaceAll("match-room-test-", "p03-rehearsal-");
  sql(db, prefix + readFileSync(path.join(root, "tests/p03-db/partial-tournament.sql"), "utf8") + "\ncommit;");
  assert.equal(readOnlySql(db, "select count(*) from cron.job;"), "4", "Expected real pg_cron job metadata from baseline migrations");
  assert.equal(readOnlySql(db, "select current_setting('cron.launch_active_jobs');"), "off");
}

try {
  assert(process.platform === "linux" && process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_TEMP, "Run this dedicated synthetic rehearsal on a GitHub-hosted Linux runner");
  assert(!process.env.DOCKER_HOST || process.env.DOCKER_HOST === "unix:///var/run/docker.sock", "Remote Docker daemons are forbidden");
  const context = JSON.parse(run("docker", ["context", "inspect"]))[0];
  assert.equal(context.Endpoints?.docker?.Host, "unix:///var/run/docker.sock", "Docker context must use this runner's local daemon");
  const outputRoot = path.join(process.env.RUNNER_TEMP, `p03-hosted-backup-${suffix}`);
  const evidenceFile = path.join(root, "test-results/p03-hosted-backup-evidence.json");
  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  run("docker", ["pull", image], { timeout: 300000 });
  const imageMetadata = JSON.parse(run("docker", ["image", "inspect", image]))[0];
  run("docker", ["network", "create", "--internal", network]); networkCreated = true;
  const source = await startContainer(sourceName, sourceDatabase);
  const target = await startContainer(restoreName, targetDatabase);
  passed("Two positively attested local PostgreSQL containers use an internal Docker network with no published ports; cron execution is OFF");
  installRealExtensions(source);
  passed("All seven observed Production extension names, versions and schemas are installed from real Supabase binaries");
  seedSource(source);
  passed("All 146 raw Production baseline migrations replayed; synthetic Auth/Storage only, no cron/net/vault extension stubs");
  const ids = [1, 2, 3, 4].map((n) => `d23a0000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  const candidateSha = run("git", ["rev-parse", "HEAD"], { cwd: root });
  const before = capture(source, ids, { candidateSha });
  const manifest = backup({ repository: root, directory: outputRoot, tournamentIds: ids, candidateSha, expectedProjectRef: "local", env: localEnvironment(source.env.PGHOST, sourceDatabase, sourceName) });
  passed("Exact release-day backup command created a complete logical archive, schema, critical export and checksums");
  const validation = restore({ directory: outputRoot, env: localEnvironment(target.env.PGHOST, targetDatabase, restoreName) });
  passed("Exact attested-local restore command restored the complete archive; 22 competition tables, schema and seven extension versions match");
  const report = {
    schemaVersion: 1, checkedAt: new Date().toISOString(), candidateSha,
    mode: "github-actions-synthetic-supabase-runtime", image, imageId: imageMetadata.Id, imageDigests: imageMetadata.RepoDigests,
    sourceServerVersion: before.state.serverVersion, baselineMigrations: ledger.length, extensions,
    archiveSha256: validation.archiveSha256, backupManifestSha256: validation.backupManifestSha256,
    competitionSha256: manifest.competitionSha256, schemaSha256: validation.schemaSha256,
    checks: steps, status: "PASS", productionDataRead: false, productionDataMutated: false,
    limitations: ["Synthetic Auth and Storage metadata, no hosted project data", "No Clerk or Storage object bytes", "Vault schema restored; encryption-root recovery and actual hosted logical archive remain release-day checks", "This evidence cannot replace a fresh release-day backup and restore receipt"],
  };
  saveJson(evidenceFile, report);
  console.log("P03 HOSTED EXTENSION BACKUP REHEARSAL: PASS");
} finally {
  // Only exact, random, disposable resources successfully created in this run.
  for (const container of created.reverse()) { try { run("docker", ["rm", "--force", container]); } catch { console.error("Disposable container cleanup needs attention."); } }
  if (networkCreated) { try { run("docker", ["network", "rm", network]); } catch { console.error("Disposable network cleanup needs attention."); } }
}
