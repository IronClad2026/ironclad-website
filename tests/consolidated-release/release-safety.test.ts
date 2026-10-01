import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CHECKS, HISTORY, HISTORICAL_CHECK_CONSTRAINTS, preflightSql, PRODUCTION_REF } from "../../scripts/consolidated-release/sql.mjs";
import { assessPreflight, compareHistory, comparePublishedLegal, compareActivation, canonicalManifestHash, historyDigest, validateSnapshot } from "../../scripts/consolidated-release/gate.mjs";
import { scanText } from "../../scripts/consolidated-release/source-check.mjs";

const manifest = { ...JSON.parse(readFileSync("scripts/consolidated-release/manifest.json", "utf8")), resolvedLegalPlanSha256: "b".repeat(64), resolvedMigrationPackageSha256: "b".repeat(64) };
const head = "a".repeat(40);
const hash = "b".repeat(64);
const now = Date.parse("2026-10-01T04:00:00Z");
const target = "10000000-0000-4000-8000-000000000001";
function snapshot(phase = "before-schema") {
  return {
    schemaVersion: 1, format: "aggregate-only-v1", candidateSha: head, projectRef: PRODUCTION_REF, phase,
    capturedAt: new Date(now).toISOString(), readOnly: true, requestedTournamentCount: 1, scopeSha256: hash,
    checks: Object.fromEntries([...Object.keys(CHECKS), ...(phase !== "before-schema" ? ["unknownDivisionModels", "reclassifiedHistoricalTournaments", "reclassifiedHistoricalSeasons", phase === "after-activation" ? "showcaseNotOn" : "showcaseNotOff", "manufacturedShowcaseRows", "manufacturedHighlightRows", "highlightsNotOff", ...(phase === "after-activation" ? ["postDeploymentGuardLedgerMismatch"] : [])] : [])].map((key) => [key, 0])),
    tables: Object.fromEntries(Object.keys(HISTORY).map((name) => [name, { count: 1, sha256: hash }])), ledgerRowCount: phase === "before-schema" ? 153 : phase === "after-schema" ? 158 : 159, ledgerSha256: hash,
  };
}
function evidence(state = snapshot()) {
  return {
    candidateSha: head, productionBaseSha: manifest.productionBaseSha, currentProductionSha: manifest.productionBaseSha,
    targetAttestation: { projectRef: PRODUCTION_REF, verified: true, receiptSha256: hash },
    schemaDrift: { verified: true, receiptSha256: hash, ledgerSha256: hash },
    ci: manifest.requiredCiJobs.map((name: string) => ({ name, headSha: head, conclusion: "success", receiptSha256: hash })),
    knownIssues: { P0: 0, P1: 0, P2: 0 },
    backup: { verified: true, projectRef: PRODUCTION_REF, capturedAt: new Date(now).toISOString(), backupSha256: hash, restoreVerified: true, restoreReceiptSha256: hash, snapshotSha256: historyDigest(state) },
    quietWindow: { competitionWritesFrozen: true, registrationAndCreationFrozen: true, operatorVerified: true, receiptSha256: hash },
    highlightsProviderOff: true, legalPublicationPlanSha256: hash, migrationPackageSha256: hash, previewIsolation: "not-used", checkedAt: new Date(now).toISOString(),
  };
}

describe("offline final Production preflight", () => {
  it("GO binds exact candidate evidence but never authorizes or performs release", () => {
    const result = assessPreflight(snapshot(), evidence(), manifest, now);
    expect(result).toMatchObject({ verdict: "GO", candidateSha: head, productionAuthorized: false, productionMutated: false });
  });
  it("never extends a GO beyond the original snapshot expiry", () => {
    const state = snapshot(); state.capturedAt = new Date(now - 590000).toISOString();
    expect(assessPreflight(state, evidence(state), manifest, now).expiresAt).toBe(new Date(now + 10000).toISOString());
  });
  it.each(Object.keys(CHECKS))("STOP for actual nonzero %s without repair", (name) => {
    const state = snapshot(); state.checks[name] = 1;
    expect(assessPreflight(state, evidence(state), manifest, now).reasons).toContain(`STOP:${name}`);
  });
  it.each(["undefined", "null", "false", "unknown"])("malformed evidence %s fails closed", (input) => {
    const value = input === "undefined" ? undefined : input === "null" ? null : input === "false" ? false : {};
    expect(assessPreflight(undefined, value, manifest, now).verdict).toBe("STOP");
  });
  it("rejects stale/future/read-write/wrong-project/incomplete snapshots", () => {
    const state = snapshot(); state.capturedAt = new Date(now - 601000).toISOString();
    expect(validateSnapshot(state, { candidateSha: head, now })).toContain("SNAPSHOT_STALE_OR_CLOCK_INVALID");
    state.capturedAt = new Date(now + 31000).toISOString(); state.readOnly = false; state.projectRef = manifest.stagingProjectRef;
    expect(validateSnapshot(state, { candidateSha: head, now })).toContain("SNAPSHOT_TARGET_OR_READONLY_INVALID");
    delete state.checks.missingSettlements;
    expect(validateSnapshot(state, { candidateSha: head, now })).toContain("CHECK_INVENTORY_INVALID");
  });
  it("rejects P2, skipped CI, old-head CI, missing restore, unverified drift and active provider", () => {
    const state = snapshot(); const proof = evidence(state);
    proof.knownIssues.P2 = 1; proof.ci[0].headSha = "c".repeat(40); proof.ci[1].conclusion = "skipped";
    proof.backup.restoreVerified = false; proof.schemaDrift.verified = false; proof.highlightsProviderOff = false;
    expect(assessPreflight(state, proof, manifest, now).reasons).toEqual(expect.arrayContaining(["RELEVANT_P0_P1_P2_NOT_ZERO", "EXACT_HEAD_MANDATORY_CI_INCOMPLETE", "BACKUP_AND_RESTORE_EVIDENCE_INVALID", "SCHEMA_DRIFT_UNVERIFIED", "HIGHLIGHTS_MUST_REMAIN_OFF"]));
  });
  it("rejects unexpected raw rows/PII/proof paths and bounded hash overflow", () => {
    const state = snapshot(); const tables = state.tables as Record<string, Record<string, unknown>>;
    tables.registrations.rows = [{ email: "synthetic@example.invalid" }];
    tables.tournament_matches.sha256 = null;
    expect(validateSnapshot(state, { candidateSha: head, now })).toEqual(expect.arrayContaining(["HISTORY_INVALID_OR_OVERFLOW:registrations", "HISTORY_INVALID_OR_OVERFLOW:tournament_matches"]));
  });
  it("compares all existing history with no automatic legal/settings exemptions", () => {
    const before = snapshot(); const after = snapshot("after-schema");
    expect(compareHistory(before, after, head, now).verdict).toBe("PASS");
    after.tables.legal_documents.sha256 = "d".repeat(64);
    after.tables.player_badge_awards.count += 1;
    expect(compareHistory(before, after, head, now).reasons).toEqual(expect.arrayContaining(["HISTORY_CHANGED:legal_documents", "HISTORY_CHANGED:player_badge_awards"]));
    after.scopeSha256 = "e".repeat(64);
    expect(compareHistory(before, after, head, now).reasons).toContain("HISTORY_PHASE_OR_SCOPE_MISMATCH");
  });
  it("retains an immutable historic before checkpoint but requires a fresh after snapshot", () => {
    const before = snapshot(); before.capturedAt = new Date(now - 3600000).toISOString();
    const after = snapshot("after-schema");
    expect(compareHistory(before, after, head, now).verdict).toBe("PASS");
    after.capturedAt = new Date(now - 601000).toISOString();
    expect(compareHistory(before, after, head, now).verdict).toBe("STOP");
  });
  it("only permits a hash-bound exact approved legal delta; accepts no acceptance/history changes", () => {
    const before = snapshot("after-schema"); const after = snapshot("after-schema");
    before.tables.legal_documents.count = 10; after.tables.legal_documents.count = 12; after.tables.legal_documents.sha256 = "c".repeat(64);
    const receipt = { projectRef: PRODUCTION_REF, candidateSha: head, publicationPlanSha256: hash, receiptSha256: hash, beforeLegalSha256: hash, afterLegalSha256: "c".repeat(64), predecessorRowsPreserved: true, effectiveSet: "rulebook:3.2,ppa:3.2,terms:1.1,privacy:1.3", checkedAt: new Date(now).toISOString() };
    expect(comparePublishedLegal(before, after, head, receipt, now, hash).verdict).toBe("PASS");
    after.tables.registration_acceptances.sha256 = "d".repeat(64);
    expect(comparePublishedLegal(before, after, head, receipt, now, hash).reasons).toContain("HISTORY_CHANGED:registration_acceptances");
    receipt.predecessorRowsPreserved = false;
    expect(comparePublishedLegal(before, after, head, receipt, now, hash).reasons).toContain("EXACT_LEGAL_PUBLICATION_RECEIPT_INVALID");
  });
  it("does not accept a hash-shaped substitute for the reviewed local package/legal manifest", () => {
    const proof = evidence(); proof.legalPublicationPlanSha256 = "e".repeat(64);
    expect(assessPreflight(snapshot(), proof, manifest, now).reasons).toContain("APPROVED_PACKAGE_OR_LEGAL_PLAN_UNBOUND");
  });
  it("binds identical canonical Git manifest bytes across Windows CRLF and Linux LF", () => {
    const source = '{\n  "schemaVersion": 1,\n  "productionAuthorized": false\n}\n';
    expect(canonicalManifestHash(Buffer.from(source))).toBe(canonicalManifestHash(Buffer.from(source.replaceAll("\n", "\r\n"))));
    expect(canonicalManifestHash(Buffer.from(source))).not.toBe(canonicalManifestHash(Buffer.from(source.replace("false", "true"))));
  });
  it("checks guarded postdeployment activation and unchanged history before unfreeze", () => {
    const before = snapshot("after-schema"); const after = snapshot("after-activation"); after.ledgerSha256 = "c".repeat(64);
    const receipt = { projectRef: PRODUCTION_REF, candidateSha: head, postDeploymentManifestSha256: hash, receiptSha256: hash, oldCreationRetired: true, existingLegacyEditsPreserved: true, explicitFourCreationPreserved: true, checkedAt: new Date(now).toISOString() };
    expect(compareActivation(before, after, head, receipt, hash, now).verdict).toBe("PASS");
    after.checks.showcaseNotOn = 1;
    expect(compareActivation(before, after, head, receipt, hash, now).reasons).toContain("STOP:showcaseNotOn");
    after.checks.showcaseNotOn = 0; receipt.oldCreationRetired = false;
    expect(compareActivation(before, after, head, receipt, hash, now).reasons).toContain("POSTDEPLOYMENT_READONLY_RECEIPT_INVALID");
  });
});

describe("SQL generation and source isolation", () => {
  it("every fingerprint relation/column is present in the schema-only Production catalog", () => {
    const catalog = JSON.parse(readFileSync("scripts/consolidated-db/production-schema-baseline.json", "utf8"));
    const columns = new Set(catalog.columns.map((column: { schema: string; table_name: string; column_name: string }) => `${column.schema}.${column.table_name}.${column.column_name}`));
    for (const [name, relation] of Object.entries(HISTORY)) for (const field of relation.fields) expect(columns.has(`${relation.schema}.${name}.${field}`), `${relation.schema}.${name}.${field}`).toBe(true);
  });
  it("uses only a read-only transaction and direct table SELECTs; exports aggregate envelope", () => {
    const sql = preflightSql({ candidateSha: head, targetRef: PRODUCTION_REF, tournamentIds: [target] });
    expect(sql).toContain("begin transaction isolation level repeatable read read only;");
    expect(sql).toContain("rollback;");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|call|perform)\b/i);
    expect(sql).not.toMatch(/public\.[a-z0-9_]+\(/i);
    expect(sql).toContain("'format','aggregate-only-v1'");
    expect(sql).toContain("limit 20001");
    expect(sql).toContain("else null end as sha256");
    expect(sql).toContain("partialLegacyMainSeasons");
    expect(sql).toContain("ironclad_private.match_room_retention_holds");
    expect(sql).toContain("ironclad_private.badge_reconciliation_targets");
    expect(sql).not.toContain("public.match_room_retention_holds");
    expect(sql).toContain("'invalidHistoricEndAfterStart'");
    expect(sql).toContain("'invalidHistoricFormat'");
    expect(sql).toContain("'invalidHistoricRegistrationDates'");
    expect(sql).toContain("'invalidHistoricSlug'");
    expect(sql).toContain("'invalidHistoricStartAfterRegistration'");
    expect(sql.match(/\) is false/g)).toHaveLength(5);
    expect(sql).toContain("'historicConstraintInventoryMismatch'");
    expect(sql).toContain("c.convalidated is distinct from false");
    expect(sql).toContain("pg_catalog.pg_get_constraintdef(c.oid) is distinct from expected.definition");
    expect(HISTORICAL_CHECK_CONSTRAINTS.map((check) => check.name)).toEqual(["tournaments_end_after_start", "tournaments_format_check", "tournaments_registration_dates", "tournaments_slug_format", "tournaments_start_after_registration"]);
    expect(HISTORICAL_CHECK_CONSTRAINTS.every((check) => check.definition.endsWith(" NOT VALID"))).toBe(true);
  });
  it("before-schema works without new metadata, after-schema requires explicit authority and media OFF", () => {
    const before = preflightSql({ candidateSha: head, targetRef: PRODUCTION_REF, tournamentIds: [target] });
    const after = preflightSql({ candidateSha: head, targetRef: PRODUCTION_REF, tournamentIds: [target], phase: "after-schema" });
    expect(before).not.toContain("s.official_bracket_type"); expect(before).not.toContain("division_model_version");
    expect(after).toContain("s.official_bracket_type"); expect(after).toContain("t.division_model_version='four_division_v1' and b.name='Pro'");
    expect(after).toContain("key='player_combat_highlights'");
    expect(after).toContain("division_model_version is distinct from 'legacy_three_v1'");
    expect(after).toContain("official_bracket_type is distinct from 'main'");
    expect(after).toContain("key='player_showcase'");
    expect(after).toContain("ironclad_private.player_combat_highlight_uploads");
    const activated = preflightSql({ candidateSha: head, targetRef: PRODUCTION_REF, tournamentIds: [target], phase: "after-activation" });
    expect(activated).toContain("'showcaseNotOn'");
    expect(activated).toContain("version='20261001040810'");
    expect(activated).toContain("'postDeploymentGuardLedgerMismatch'");
  });
  it("rejects wrong target, missing SHA, duplicate or injected UUIDs, excessive scopes and unknown phase", () => {
    const valid = { candidateSha: head, targetRef: PRODUCTION_REF, tournamentIds: [target] };
    expect(() => preflightSql({ ...valid, targetRef: manifest.stagingProjectRef })).toThrow();
    expect(() => preflightSql({ ...valid, candidateSha: "HEAD" })).toThrow();
    expect(() => preflightSql({ ...valid, tournamentIds: [target, target] })).toThrow();
    expect(() => preflightSql({ ...valid, tournamentIds: ["'; delete from public.players; --"] })).toThrow();
    expect(() => preflightSql({ ...valid, phase: "repair" })).toThrow();
  });
  it("flags fixture/provider/secret text without printing any matched sensitive value", () => {
    const result = scanText("app/unsafe.ts", 'const user="TestPro"; const key="sk_live_this_is_synthetic_only"; const endpoint="https://staging-media.workers.dev";');
    expect(result.map((finding) => finding.rule)).toEqual(expect.arrayContaining(["fixture-identity", "embedded-secret", "provider-endpoint"]));
    expect(JSON.stringify(result)).not.toContain("sk_live_"); expect(JSON.stringify(result)).not.toContain("TestPro");
  });
  it("rejects embedded cross-environment identity constants or runtime imports of fixture tooling", () => {
    expect(scanText("app/unsafe.ts", `const player="${target}";`).map((finding) => finding.rule)).toContain("embedded-identity");
    expect(scanText("lib/unsafe.ts", 'import data from "@/tests/fixtures/private";').map((finding) => finding.rule)).toContain("runtime-tooling-import");
  });
  it("only exact guard lines and exact non-secret CI placeholders are exempt", () => {
    expect(scanText("lib/p03-preview-safety.ts", 'const STAGING_REF = "zzbnneprhjicmajpjkdg";')).toEqual([]);
    expect(scanText("lib/p03-preview-safety.ts", 'const target = "zzbnneprhjicmajpjkdg";')).toHaveLength(1);
    expect(scanText(".github/workflows/ci.yml", " CLERK_SECRET_KEY: sk_test_not-a-real-secret")).toEqual([]);
    expect(scanText(".github/workflows/ci.yml", " CLERK_SECRET_KEY: sk_test_actual_value_forbidden")).toHaveLength(1);
  });
  it("CLI has no database/network/child-process/mutation API or default live command", () => {
    const source = readFileSync("scripts/consolidated-release/cli.mjs", "utf8");
    expect(source).not.toMatch(/from ["'](?:pg|node:child_process|@supabase)|fetch\(|execSync\(|spawn\(|process\.env/);
    expect(source).toContain("Unknown or incomplete offline command");
  });
  it.each(["migration-sql", "legal-sql", "postdeployment-sql"])("%s only prints target/head-bound preparation SQL ending in rollback", (mode) => {
    const result = spawnSync(process.execPath, ["scripts/consolidated-release/cli.mjs", mode, "--candidate", head, "--target", PRODUCTION_REF], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`-- PREPARATION ONLY: ${mode}; candidate ${head}; target ${PRODUCTION_REF}.`);
    expect(result.stdout).toContain("NO RELEASE AUTHORIZATION");
    expect(result.stdout).toMatch(/rollback;\s*$/);
    const denied = spawnSync(process.execPath, ["scripts/consolidated-release/cli.mjs", mode, "--candidate", head, "--target", manifest.stagingProjectRef], { encoding: "utf8" });
    expect(denied.status).toBe(2);
    expect(denied.stdout).toBe("");
  });
});
