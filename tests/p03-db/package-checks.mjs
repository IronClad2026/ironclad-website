import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildAtomicMigrationSql, migrationBody, verifyPackage } from "../../scripts/p03-db/package.mjs";
import { RELEASE_APPROVAL, validateReceipt } from "../../scripts/p03-db/execute.mjs";

function fixture(local = false) {
  const migrations = verifyPackage().map(({ file, version, name, sha256 }) => ({ file, version, name, sha256 }));
  const now = Date.now();
  const seal = { schemaVersion: 1, candidateSha: "a".repeat(40), productionProjectRef: local ? "local" : "nsyjtqpvyxlzyujlbzos", migrations };
  const receipt = { schemaVersion: 1, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString(), verdict: "PASS", reasons: [],
    evidence: { seal: { candidateSha: seal.candidateSha }, production: { projectRef: seal.productionProjectRef }, package: migrations },
    ...(local ? { mode: "local-rehearsal" } : {}) };
  return { seal, receipt, options: { now, local, approval: local ? "LOCAL P03 REHEARSAL" : RELEASE_APPROVAL } };
}
test("package accepts exactly pinned original migrations plus bootstrap and final OFF gate", () => {
  assert.equal(verifyPackage().length, 6);
  const sql = buildAtomicMigrationSql();
  assert(sql.startsWith("begin;\n"));
  assert(sql.endsWith("commit;\n"));
  assert.equal((sql.match(/^-- P03 PACKAGE STEP /gm) ?? []).length, 6);
  assert(!/^set local lock_timeout = '10s';$/m.test(sql));
});
test("live gate dependency manifest agrees with atomic bootstrap contract", () => {
  const dependencies = JSON.parse(readFileSync(new URL("../../scripts/p03-db/dependencies.json", import.meta.url), "utf8"));
  const bootstrap = verifyPackage()[0].source;
  for (const dependency of dependencies) {
    assert(bootstrap.includes(dependency.signature));
    assert(bootstrap.includes(dependency.md5));
  }
  assert.equal(dependencies.length, 3);
});
test("SQL envelope policy rejects unexpected COMMIT inside package", () => {
  assert.throws(() => migrationBody("begin;\nselect 1;\ncommit;\nselect 2;\ncommit;"), /transaction control/);
  assert.throws(() => migrationBody("begin;\n\\connect other_database\ncommit;"), /psql commands/);
});
test("fresh exact Production approval can pass receipt validation only", () => {
  const { seal, receipt, options } = fixture(); validateReceipt(receipt, seal, options);
});
test("approval phrase is mandatory and exact", () => {
  const { seal, receipt, options } = fixture();
  for (const approval of [undefined, "PROCEED", "LOCAL P03 REHEARSAL"]) assert.throws(() => validateReceipt(receipt, seal, { ...options, approval }), /approval/);
});
test("STOP, expired, future-dated and excessively long-lived receipts fail closed", () => {
  for (const change of [{ verdict: "STOP" }, { reasons: ["blocked"] }, { expiresAt: new Date(0).toISOString() },
    { checkedAt: new Date(Date.now() + 60000).toISOString() }, { expiresAt: new Date(Date.now() + 3600000).toISOString() }]) {
    const { seal, receipt, options } = fixture(); assert.throws(() => validateReceipt({ ...receipt, ...change }, seal, options));
  }
});
test("rehearsal receipt can never authorize Production", () => {
  const { seal, receipt, options } = fixture();
  receipt.mode = "local-rehearsal";
  assert.throws(() => validateReceipt(receipt, seal, options), /cannot authorize Production/);
});
test("candidate, project and package mismatches stop", () => {
  for (const alter of [(r) => { r.evidence.seal.candidateSha = "b".repeat(40); },
    (r) => { r.evidence.production.projectRef = "zzbnneprhjicmajpjkdg"; },
    (r) => { r.evidence.package = []; }]) {
    const { seal, receipt, options } = fixture(); alter(receipt); assert.throws(() => validateReceipt(receipt, seal, options));
  }
});
test("dedicated loopback receipt requires dedicated local approval", () => {
  const { seal, receipt, options } = fixture(true); validateReceipt(receipt, seal, options);
  assert.throws(() => validateReceipt(receipt, seal, { ...options, approval: RELEASE_APPROVAL }), /approval/);
});
