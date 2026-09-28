import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { capture, connection, fileHash, readJson, run, saveJson } from "../p03-release/core.mjs";
import { buildGuardedSql, executePackage } from "./execute.mjs";
import { localClient, localPsqlArgument } from "./local-pg.mjs";
import { repositoryRoot, verifyPackage } from "./package.mjs";

const psql = localPsqlArgument();
const client = localClient(psql);
const dbName = "p03_executor_" + Date.now();
await client.run("create database " + dbName + " template p03_rehearsal;", { db: "postgres" });
const env = { ...process.env, P03_DATABASE_URL: "postgresql://postgres@127.0.0.1:56623/" + dbName, P03_PG_BIN: path.dirname(psql) };
const db = connection(env);
const candidateSha = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
const baseline = readJson(path.join(repositoryRoot, "docs/p03-production-ledger.json"));
const migrations = verifyPackage().map(({ file, version, name, sha256 }) => ({ file, version, name, sha256 }));
const directory = mkdtempSync(path.join(tmpdir(), "p03-executor-evidence-"));
const sealFile = path.join(directory, "seal.json");
const gateFile = path.join(directory, "gate.json");
const output = path.join(directory, "applied.json");
const seal = { schemaVersion: 1, candidateSha, masterSha: baseline.master, productionProjectRef: "local", migrations, expectedLedger: baseline.migrations };
saveJson(sealFile, seal);
const ids = [1, 2, 3, 4].map((n) => "d23a0000-0000-4000-8000-" + String(n).padStart(12, "0"));
const fingerprint = capture(db, ids, { candidateSha });
saveJson(gateFile + ".fingerprint.json", fingerprint);
saveJson(gateFile, { schemaVersion: 1, mode: "local-rehearsal", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), verdict: "PASS", reasons: [], evidence: {
  seal: { sha256: fileHash(sealFile), candidateSha }, package: migrations,
  production: { projectRef: "local", fingerprintFileSha256: fileHash(gateFile + ".fingerprint.json"), competitionSha256: fingerprint.competitionSha256 },
} });
// Prove a changed competition fact aborts the complete already-installed package
// before COMMIT. User triggers are suppressed only for this injected synthetic
// corruption; transaction rollback restores them and the original competition.
const injected = buildGuardedSql(fingerprint).replace("create temporary table p03_after_facts",
  "alter table public.tournament_matches disable trigger user; update public.tournament_matches set player_one_score=9 where id='d23a0000-0000-4000-8000-000000000901'; create temporary table p03_after_facts");
const failing = await client.start(injected, { db: dbName }).done;
assert.notEqual(failing.code, 0);
assert.match(failing.stderr, /P03 migration changed competition facts/);
assert.equal(await client.run("select to_regclass('public.match_rooms') is null and (select count(*) from supabase_migrations.schema_migrations)=146;", { db: dbName }), "t");
assert.throws(() => executePackage({ gateFile, sealFile, output, approval: "PROCEED WITH P03 PRODUCTION RELEASE", localRehearsal: false }, env), /mode does not match/);
assert.throws(() => executePackage({ gateFile, sealFile, output, approval: "no", localRehearsal: true }, env), /approval/);
const result = executePackage({ gateFile, sealFile, output, approval: "LOCAL P03 REHEARSAL", localRehearsal: true }, env);
assert.equal(result.matchRoomEnabled, false);
assert.equal(result.competitionUnchanged, true);
writeFileSync(path.join(repositoryRoot, "tests/p03-db/executor-evidence.json"), JSON.stringify({
  ...result, checks: ["Injected competition mutation aborts and rolls back the entire package", "Production mode rejects a loopback endpoint", "Missing exact local approval blocks apply", "Exact production executor transaction applied to loopback fixture", "Before and after competition guards passed inside the migration transaction", "All migrations and ledger committed together with Match Room OFF"], status: "PASS",
}, null, 2) + "\n");
console.log("P03 GUARDED EXECUTOR REHEARSAL: PASS");
