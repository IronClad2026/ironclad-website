import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildAtomicMigrationSql, repositoryRoot, sha256, verifyPackage } from "./package.mjs";
import { FACTS, competitionSql } from "../p03-release/facts.mjs";
import { assessQuietWindow, canonical, capture, compare, connection, fileHash, matchRoomIsOff, readJson, run, saveJson, PRODUCTION_REF } from "../p03-release/core.mjs";

export const RELEASE_APPROVAL = "PROCEED WITH P03 PRODUCTION RELEASE";
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const summary = () => verifyPackage().map(({ file, version, name, sha256: hash }) => ({ file, version, name, sha256: hash }));

export function validateReceipt(receipt, seal, { local, approval, now = Date.now() }) {
  assert.equal(receipt.schemaVersion, 1, "Unsupported gate receipt schema");
  assert.equal(seal.schemaVersion, 1, "Unsupported release seal schema");
  assert.equal(approval, local ? "LOCAL P03 REHEARSAL" : RELEASE_APPROVAL, "Exact explicit approval is required");
  assert.equal(receipt.verdict, "PASS", "Release gate is not PASS");
  assert.deepEqual(receipt.reasons, [], "Release gate contains stop reasons");
  const checked = Date.parse(receipt.checkedAt);
  const expires = Date.parse(receipt.expiresAt);
  assert(Number.isFinite(checked) && Number.isFinite(expires) && checked <= now && expires > now && now - checked < 600000 && expires - checked <= 601000,
    "Release gate expired or has invalid timestamps");
  assert.equal(receipt.evidence.seal.candidateSha, seal.candidateSha, "Gate/seal candidate mismatch");
  assert.equal(receipt.evidence.production.projectRef, local ? "local" : PRODUCTION_REF, "Gate project identity mismatch");
  assert.equal(seal.productionProjectRef, local ? "local" : PRODUCTION_REF, "Seal project identity mismatch");
  if (local) assert.equal(receipt.mode, "local-rehearsal", "Loopback requires a dedicated rehearsal receipt");
  else assert.notEqual(receipt.mode, "local-rehearsal", "A rehearsal receipt cannot authorize Production");
  assert.equal(canonical(receipt.evidence.package), canonical(summary()), "Gate package changed");
  assert.equal(canonical(seal.migrations), canonical(summary()), "Sealed package changed");
}

export function buildGuardedSql(fingerprint) {
  const baselineFacts = Object.fromEntries(Object.entries(fingerprint.tables).map(([name, table]) => [name, table.rows]));
  const factsSql = competitionSql(fingerprint.tournamentIds);
  const tables = Object.keys(FACTS).map((table) => "public." + table).join(", ");
  const before = `set local timezone = 'UTC';
    -- Bounded SHARE locks serialize the last fingerprint with every authority
    -- that could change its facts. Any live writer makes this attempt abort.
    lock table ${tables} in share mode;
    create temporary table p03_before_facts(facts jsonb) on commit drop;
    insert into p03_before_facts ${factsSql}
    do $p03_before$ begin
      if (select facts from p03_before_facts) is distinct from ${quote(JSON.stringify(baselineFacts))}::jsonb then
        raise exception 'P03 competition changed after the final gate' using errcode='55000';
      end if;
    end; $p03_before$;`;
  const after = `create temporary table p03_after_facts(facts jsonb) on commit drop;
    insert into p03_after_facts ${factsSql}
    do $p03_after$ begin
      if (select facts from p03_before_facts) is distinct from (select facts from p03_after_facts) then
        raise exception 'P03 migration changed competition facts; rolling back the entire package' using errcode='55000';
      end if;
    end; $p03_after$;
    select jsonb_build_object('packageApplied',true,'competitionUnchanged',true,'matchRoomEnabled',public.get_match_room_enabled());`;
  return buildAtomicMigrationSql().replace("-- P03 PACKAGE STEP ", before + "\n-- P03 PACKAGE STEP ")
    .replace(/commit;\s*$/, after + "\ncommit;\n");
}

export function executePackage({ gateFile, sealFile, output, approval, localRehearsal = false }, env = process.env) {
  assert(output && !existsSync(output), "Use a new private output receipt filename");
  const receipt = readJson(gateFile);
  const seal = readJson(sealFile);
  const db = connection(env);
  assert.equal(db.local, localRehearsal, "Execution mode does not match endpoint");
  if (localRehearsal) assert(/^p03_executor_[a-z0-9_]+$/.test(db.database), "Executor rehearsal requires p03_executor_* disposable database");
  else assert.equal(db.projectRef, PRODUCTION_REF, "Production endpoint identity mismatch");
  validateReceipt(receipt, seal, { local: localRehearsal, approval });
  assert.equal(receipt.evidence.seal.sha256, fileHash(sealFile), "Release seal file changed");
  assert.equal(run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }), seal.candidateSha, "Candidate HEAD changed");
  if (!localRehearsal) {
    assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repositoryRoot }), "", "Candidate checkout is not clean");
    const remote = run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/master"], { cwd: repositoryRoot }).split(/\s/)[0];
    assert.equal(remote, seal.masterSha, "Live master changed since gate");
  }
  const fingerprintFile = gateFile + ".fingerprint.json";
  assert.equal(fileHash(fingerprintFile), receipt.evidence.production.fingerprintFileSha256, "Gate fingerprint file changed");
  const fingerprint = readJson(fingerprintFile);
  assert.equal(fingerprint.competitionSha256, receipt.evidence.production.competitionSha256, "Fingerprint does not match gate");
  assert.equal(fingerprint.candidateSha, seal.candidateSha, "Fingerprint candidate changed");
  const current = capture(db, fingerprint.tournamentIds, { candidateSha: seal.candidateSha });
  assert(compare(fingerprint, current).pass, "Competition changed since gate; rerun backup and gate");
  assert.equal(canonical(current.state.ledger), canonical(seal.expectedLedger), "Migration ledger changed");
  assert.equal(current.state.canSeeActivity, true, "Database role cannot inspect activity");
  assert(matchRoomIsOff(current.state), "Match Room is no longer provably OFF");
  assert.equal(current.state.matchRoomSetting, null, "An unexpected Match Room setting already exists");
  assert.equal(current.state.matchRoomTables, 0, "Unexpected prior Match Room tables");
  assert.equal(current.state.matchRoomCapabilities, 0, "Unexpected prior Match Room capabilities");
  const dependencies = readJson(path.join(repositoryRoot, "scripts/p03-db/dependencies.json"));
  for (const dependency of dependencies) assert.equal(current.state.dependencies[dependency.signature], dependency.md5,
    "Reviewed dependency changed: " + dependency.signature);
  assert.equal(current.state.blockers.length, 0, "Blocking transaction exists");
  assert.equal(current.state.lockWaits, 0, "Database lock contention exists");
  assert.equal(current.state.writeLocks, 0, "Database writers are active");
  if (!localRehearsal) assert.deepEqual(assessQuietWindow(current).reasons, [], "The quiet release window is no longer valid");
  const guardedSql = buildGuardedSql(fingerprint);
  // This is the only write-enabled connection, reached after all independent
  // gates. No key or password is ever passed in process arguments or logs.
  const childEnv = { ...db.env,
    PGAPPNAME: localRehearsal ? "ironclad-p03-executor-local" : "ironclad-p03-approved-release",
    PGOPTIONS: "-c default_transaction_read_only=off -c lock_timeout=2000 -c statement_timeout=60000 -c idle_in_transaction_session_timeout=60000" };
  // Verify the private destination is writable BEFORE sending any write SQL.
  // If the connection outcome is uncertain this intent remains for inspection;
  // operators must not automatically retry a possibly committed package.
  saveJson(output + ".intent.json", { createdAt: new Date().toISOString(), candidateSha: seal.candidateSha,
    projectRef: db.projectRef, gateSha256: fileHash(gateFile), guardedSqlSha256: sha256(guardedSql), status: "authorized-attempt" });
  const result = run(db.bin("psql"), ["-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { env: childEnv, input: guardedSql, timeout: 180000 });
  const confirmation = JSON.parse(result.split(/\r?\n/).filter((line) => line.startsWith("{" )).at(-1));
  assert.deepEqual(confirmation, { packageApplied: true, competitionUnchanged: true, matchRoomEnabled: false });
  const report = { schemaVersion: 1, appliedAt: new Date().toISOString(), mode: localRehearsal ? "local-rehearsal" : "production-approved",
    candidateSha: seal.candidateSha, masterSha: seal.masterSha, projectRef: db.projectRef,
    gateSha256: fileHash(gateFile), sealSha256: fileHash(sealFile), packageSqlSha256: sha256(buildAtomicMigrationSql()),
    guardedSqlSha256: sha256(guardedSql), competitionSha256: fingerprint.competitionSha256, ...confirmation };
  saveJson(output, report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      assert(args[index]?.startsWith("--") && args[index + 1], "Use named option/value pairs");
      assert(!Object.hasOwn(options, args[index]), "Duplicate option");
      options[args[index]] = args[index + 1];
    }
    if (command === "build") {
      assert.deepEqual(Object.keys(options), ["--output"], "build requires --output only");
      writeFileSync(options["--output"], buildAtomicMigrationSql(), { flag: "wx", mode: 0o600 });
      console.log("P03 PACKAGE BUILT: " + sha256(buildAtomicMigrationSql()));
    } else {
      assert(command === "apply" || command === "rehearse", "Choose build, apply, or rehearse");
      assert(Object.keys(options).length === 4 && ["--gate", "--seal", "--output", "--approval"].every((key) => options[key]), "Required: --gate --seal --output --approval");
      executePackage({ gateFile: options["--gate"], sealFile: options["--seal"], output: options["--output"], approval: options["--approval"], localRehearsal: command === "rehearse" });
      console.log("P03 MIGRATION PACKAGE: PASS (Match Room OFF; competition unchanged)");
    }
  } catch (error) {
    console.error("P03 MIGRATION PACKAGE: STOP — " + error.message.split(/\r?\n/)[0]);
    process.exitCode = 1;
  }
}
