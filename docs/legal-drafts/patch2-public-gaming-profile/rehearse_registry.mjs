import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(import.meta.url);
const root = resolve(dirname(source), "../../..");
const tools = resolve(root, "../release-execution-tools");
const bin = resolve(tools, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(tools, "pg-client/node_modules/pg"));
const allowedEnv = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS",
  "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnv.has(key.toUpperCase())));

if (!process.execArgv.some(arg => arg.endsWith("block-remote-network.cjs"))) {
  const child = spawnSync(process.execPath, ["--require", resolve(root, "scripts/patch2/block-remote-network.cjs"), source, ...process.argv.slice(2)], {
    env, cwd: root, windowsHide: true, stdio: "inherit",
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

assert.ok(Object.keys(process.env).every(key => allowedEnv.has(key.toUpperCase())));
assert.match(net.Socket.prototype.connect.toString(), /checkConnect/);
assert.equal(process.argv.length, 3, "Pass the offline synthetic package directory");
const output = resolve(process.argv[2]);
const registry = JSON.parse(await readFile(resolve(output, "legal-registry-preview.json"), "utf8"));
const transaction = await readFile(resolve(output, "legal-registry-rollback-rehearsal.sql"), "utf8");
const date = "2099-01-15";
assert.equal(registry.expectedEffectiveDateSydney, date);
assert.match(transaction, /\brollback;\s*$/i);
assert.doesNotMatch(transaction, /\bcommit\s*;/i);
const candidate = transaction.match(/release_candidate_sha=([0-9a-f]{40})/)?.[1];
const served = transaction.match(/release_served_legal_manifest_sha256=([0-9a-f]{64})/)?.[1];
assert.ok(candidate && served);

const host = "127.0.0.1";
const port = 56749;
const run = resolve(root, ".release-local", `gaming-profile-legal-run-${randomUUID()}`);
const data = resolve(run, "data");
const passwordFile = resolve(run, "init-password");
const password = randomBytes(32).toString("base64url");
const migration = name => readFile(resolve(root, "supabase/migrations", name), "utf8");
const initSettings = ["-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile", passwordFile, "--encoding=UTF8", "--locale=C", "--no-instructions"];
let server;
let db;

async function sameRetainedState(expected) {
  const actual = await db.query(`select
    (select jsonb_agg(to_jsonb(d) order by d.id) from public.legal_documents d) as docs,
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.registrations r) as registrations,
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.registration_acceptances r) as registration_acceptances,
    (select jsonb_agg(to_jsonb(a) order by a.id) from public.account_legal_acceptances a) as account_acceptances,
    (select to_jsonb(p) from ironclad_private.gaming_profile_publication_policy p where id) as policy`);
  if (expected) assert.deepEqual(actual.rows, expected);
  return actual.rows;
}

async function rejectTransaction(pattern, sql = transaction) {
  try {
    await assert.rejects(db.query(sql), pattern);
  } finally {
    await db.query("rollback");
  }
}

try {
  await mkdir(run, { recursive: true });
  await writeFile(passwordFile, password + "\n", { flag: "wx" });
  const initialized = spawnSync(resolve(bin, "initdb.exe"), initSettings, { env, windowsHide: true, encoding: "utf8", timeout: 60_000 });
  assert.equal(initialized.status, 0, initialized.stderr);
  await unlink(passwordFile);
  server = spawn(resolve(bin, "postgres.exe"), ["-D", data, "-h", host, "-p", String(port), "-c", "unix_socket_directories=", "-c", "max_connections=8", "-c", "shared_buffers=32MB"], {
    env, windowsHide: true, stdio: "ignore",
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidateClient = new Client({ host, port, database: "postgres", user: "postgres", password, connectionTimeoutMillis: 1000, statement_timeout: 15_000 });
    try {
      await candidateClient.connect();
      db = candidateClient;
      break;
    } catch {
      await candidateClient.end().catch(() => {});
      await wait(250);
    }
  }
  assert.ok(db, "Disposable PostgreSQL did not start");
  const baselineSource = await migration("20260818100000_phase15a_versioned_consent_discord.sql");
  const registrySchema = baselineSource.slice(baselineSource.indexOf("create table public.legal_documents"), baselineSource.indexOf("create table public.registration_acceptances"));
  assert.match(registrySchema, /create trigger legal_documents_protect_record/);
  const policySource = await migration("20261113110000_patch2_gaming_profile_publication.sql");
  const policyTable = policySource.slice(policySource.indexOf("create table ironclad_private.gaming_profile_publication_policy"), policySource.indexOf("-- Append a decision"));
  const activate = policySource.match(/create function ironclad_private\.activate_gaming_profile_publication\(\)[\s\S]+?\n\$\$;/)?.[0];
  assert.ok(activate);
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema ironclad_private;
    ${registrySchema} ${policyTable} ${activate}
    create table public.tournaments (slug text primary key, status text not null);
    create table public.registrations(id bigint primary key, value text);
    create table public.registration_acceptances(id bigint primary key, value text);
    create table public.account_legal_acceptances(id bigint primary key, value text);
    insert into public.tournaments values('hold-the-line', 'in_progress');
    insert into public.registrations values(1, 'synthetic event');
    insert into public.registration_acceptances values(1, 'synthetic registration acceptance');
    insert into public.account_legal_acceptances values(1, 'synthetic account acceptance');
    insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
    select 'rulebook', 'old-fixture-' || item, 'https://fixture.invalid/' || item,
      'superseded', now(), now(), repeat('b',64) from generate_series(1,8) item;`);
  for (const row of registry.requireExactEffectivePredecessors) {
    await db.query(`insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
      values ($1,$2,$3,'effective',now(),now(),$4)`, [row.document_kind, row.version, row.immutable_url, row.sha256]);
  }
  const original = await sameRetainedState();
  await rejectTransaction(/Missing verified target, candidate, or served legal artifact attestation/);
  await db.query(`select set_config('ironclad.release_project_ref','nsyjtqpvyxlzyujlbzos',false),
    set_config('ironclad.release_candidate_sha',$1,false), set_config('ironclad.release_served_legal_manifest_sha256',$2,false)`, [candidate, served]);
  await rejectTransaction(/HOLD THE LINE must be completed/);
  await db.query("update public.tournaments set status='completed' where slug='hold-the-line'");
  await rejectTransaction(/database clock must match the approved Sydney effective date/);
  await sameRetainedState(original);

  // The real SQL's future date was just denied above. Change only the exact
  // synthetic date literal in memory to test the remaining transaction today.
  const actual = (await db.query("select (clock_timestamp() at time zone 'Australia/Sydney')::date::text value")).rows[0].value;
  assert.match(actual, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(transaction.split(`date '${date}'`).length, 2);
  const todaySql = transaction.replace(`date '${date}'`, `date '${actual}'`);
  await db.query(todaySql);
  await sameRetainedState(original);

  await db.query("alter table public.legal_documents disable trigger legal_documents_protect_record");
  await db.query("update public.legal_documents set sha256=repeat('c',64) where document_kind='terms' and status='effective'");
  await db.query("alter table public.legal_documents enable trigger legal_documents_protect_record");
  await rejectTransaction(/effective legal predecessor set or the proposed versions have drifted/, todaySql);
  console.log("PASS: absent attestation, live event, future date, native successor activation with rollback, unchanged historical data, and predecessor drift.");
} finally {
  await db?.end();
  if (server) {
    const stopped = spawnSync(resolve(bin, "pg_ctl.exe"), ["-D", data, "-w", "-t", "10", "-m", "fast", "stop"], { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
    assert.equal(stopped.status, 0, stopped.stderr);
  }
}
