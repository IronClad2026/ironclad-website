import { createHash } from "node:crypto";
import { CHECKS, HISTORY, PRODUCTION_REF, SHA } from "./sql.mjs";

const HEX = /^[0-9a-f]{64}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const canonicalManifestHash = (bytes) => createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
export const historyDigest = (snapshot) => digest({ tables: snapshot.tables, ledgerSha256: snapshot.ledgerSha256, scopeSha256: snapshot.scopeSha256 });

export function validateSnapshot(snapshot, { candidateSha = "", now = Date.now(), maxAgeSeconds = 600 } = {}) {
  const reasons = [];
  if (!exactKeys(snapshot, ["schemaVersion", "format", "candidateSha", "projectRef", "phase", "capturedAt", "readOnly", "requestedTournamentCount", "scopeSha256", "checks", "tables", "ledgerRowCount", "ledgerSha256"])) return ["SNAPSHOT_SHAPE_INVALID"];
  if (snapshot.schemaVersion !== 1 || snapshot.format !== "aggregate-only-v1") reasons.push("SNAPSHOT_FORMAT_INVALID");
  if (!SHA.test(candidateSha ?? "") || snapshot.candidateSha !== candidateSha) reasons.push("SNAPSHOT_HEAD_MISMATCH");
  if (snapshot.projectRef !== PRODUCTION_REF || snapshot.readOnly !== true) reasons.push("SNAPSHOT_TARGET_OR_READONLY_INVALID");
  if (!["before-schema", "after-schema", "after-activation"].includes(snapshot.phase)) reasons.push("SNAPSHOT_PHASE_INVALID");
  if (snapshot.ledgerRowCount !== ({ "before-schema": 153, "after-schema": 158, "after-activation": 159 })[snapshot.phase]) reasons.push("LEDGER_ROW_COUNT_DRIFT");
  const age = now - Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(age) || age < -30000 || age > maxAgeSeconds * 1000) reasons.push("SNAPSHOT_STALE_OR_CLOCK_INVALID");
  if (!Number.isSafeInteger(snapshot.requestedTournamentCount) || snapshot.requestedTournamentCount < 1 || snapshot.requestedTournamentCount > 5) reasons.push("SNAPSHOT_SCOPE_INVALID");
  if (!HEX.test(snapshot.scopeSha256 ?? "")) reasons.push("SNAPSHOT_SCOPE_INVALID");
  const expectedChecks = [...Object.keys(CHECKS), ...(snapshot.phase !== "before-schema" ? ["unknownDivisionModels", "reclassifiedHistoricalTournaments", "reclassifiedHistoricalSeasons", snapshot.phase === "after-activation" ? "showcaseNotOn" : "showcaseNotOff", "manufacturedShowcaseRows", "manufacturedHighlightRows", "highlightsNotOff", ...(snapshot.phase === "after-activation" ? ["postDeploymentGuardLedgerMismatch"] : [])] : [])];
  if (!exactKeys(snapshot.checks, expectedChecks)) reasons.push("CHECK_INVENTORY_INVALID");
  else for (const [name, count] of Object.entries(snapshot.checks)) {
    if (!Number.isSafeInteger(count) || count < 0) reasons.push(`CHECK_INVALID:${name}`);
    else if (count !== 0) reasons.push(`STOP:${name}`);
  }
  if (!exactKeys(snapshot.tables, Object.keys(HISTORY))) reasons.push("HISTORY_INVENTORY_INVALID");
  else for (const [name, table] of Object.entries(snapshot.tables)) {
    if (!exactKeys(table, ["count", "sha256"]) || !Number.isSafeInteger(table.count) || table.count < 0 || table.count > 100000 || !HEX.test(table.sha256 ?? "")) reasons.push(`HISTORY_INVALID_OR_OVERFLOW:${name}`);
  }
  if (!HEX.test(snapshot.ledgerSha256 ?? "")) reasons.push("LEDGER_FINGERPRINT_INVALID");
  return reasons;
}

/** Offline attestation gate. A GO is never Production-release authorization. */
export function assessPreflight(snapshot, evidence, manifest, now = Date.now()) {
  const reasons = validateSnapshot(snapshot, { candidateSha: evidence?.candidateSha, now, maxAgeSeconds: manifest.preflightMaxAgeSeconds });
  const required = ["candidateSha", "productionBaseSha", "currentProductionSha", "targetAttestation", "schemaDrift", "ci", "knownIssues", "backup", "quietWindow", "highlightsProviderOff", "legalPublicationPlanSha256", "migrationPackageSha256", "previewIsolation", "checkedAt"];
  if (!exactKeys(evidence, required)) reasons.push("EVIDENCE_SHAPE_INVALID");
  if (!SHA.test(evidence?.candidateSha ?? "") || evidence.productionBaseSha !== manifest.productionBaseSha || evidence.currentProductionSha !== manifest.productionBaseSha) reasons.push("PRODUCTION_OR_CANDIDATE_PIN_INVALID");
  const age = now - Date.parse(evidence?.checkedAt);
  if (!Number.isFinite(age) || age < -30000 || age > manifest.preflightMaxAgeSeconds * 1000) reasons.push("ATTESTATIONS_STALE");
  if (!exactKeys(evidence?.targetAttestation, ["projectRef", "verified", "receiptSha256"]) || evidence.targetAttestation.projectRef !== PRODUCTION_REF || evidence.targetAttestation.verified !== true || !HEX.test(evidence.targetAttestation.receiptSha256)) reasons.push("TARGET_NOT_INDEPENDENTLY_ATTESTED");
  if (!exactKeys(evidence?.schemaDrift, ["verified", "receiptSha256", "ledgerSha256"]) || evidence.schemaDrift.verified !== true || evidence.schemaDrift.ledgerSha256 !== snapshot?.ledgerSha256 || !HEX.test(evidence.schemaDrift.receiptSha256)) reasons.push("SCHEMA_DRIFT_UNVERIFIED");
  if (!Array.isArray(evidence?.ci) || evidence.ci.length !== manifest.requiredCiJobs.length || manifest.requiredCiJobs.some((name) => evidence.ci.filter((job) => exactKeys(job, ["name", "headSha", "conclusion", "receiptSha256"]) && job.name === name && job.headSha === evidence.candidateSha && job.conclusion === "success" && HEX.test(job.receiptSha256)).length !== 1)) reasons.push("EXACT_HEAD_MANDATORY_CI_INCOMPLETE");
  if (!exactKeys(evidence?.knownIssues, ["P0", "P1", "P2"]) || Object.values(evidence.knownIssues).some((count) => count !== 0)) reasons.push("RELEVANT_P0_P1_P2_NOT_ZERO");
  if (!exactKeys(evidence?.backup, ["verified", "projectRef", "capturedAt", "backupSha256", "restoreVerified", "restoreReceiptSha256", "snapshotSha256"]) || evidence.backup.verified !== true || evidence.backup.projectRef !== PRODUCTION_REF || evidence.backup.restoreVerified !== true || !HEX.test(evidence.backup.backupSha256) || !HEX.test(evidence.backup.restoreReceiptSha256) || !object(snapshot?.tables) || evidence.backup.snapshotSha256 !== historyDigest(snapshot) || !Number.isFinite(Date.parse(evidence.backup.capturedAt)) || Date.parse(evidence.backup.capturedAt) > now || now - Date.parse(evidence.backup.capturedAt) > 24 * 3600000) reasons.push("BACKUP_AND_RESTORE_EVIDENCE_INVALID");
  if (!exactKeys(evidence?.quietWindow, ["competitionWritesFrozen", "registrationAndCreationFrozen", "operatorVerified", "receiptSha256"]) || evidence.quietWindow.competitionWritesFrozen !== true || evidence.quietWindow.registrationAndCreationFrozen !== true || evidence.quietWindow.operatorVerified !== true || !HEX.test(evidence.quietWindow.receiptSha256)) reasons.push("QUIET_WINDOW_UNVERIFIED");
  if (evidence?.highlightsProviderOff !== true) reasons.push("HIGHLIGHTS_MUST_REMAIN_OFF");
  if (!HEX.test(evidence?.legalPublicationPlanSha256 ?? "") || !HEX.test(evidence?.migrationPackageSha256 ?? "") || evidence.legalPublicationPlanSha256 !== manifest.resolvedLegalPlanSha256 || evidence.migrationPackageSha256 !== manifest.resolvedMigrationPackageSha256) reasons.push("APPROVED_PACKAGE_OR_LEGAL_PLAN_UNBOUND");
  if (evidence?.previewIsolation !== "not-used" && evidence?.previewIsolation !== "verified-isolated-nonproduction") reasons.push("PREVIEW_ISOLATION_UNVERIFIED");
  const recordedTimes = [Date.parse(snapshot?.capturedAt), Date.parse(evidence?.checkedAt)].filter(Number.isFinite);
  const expiresAt = Math.min(now + manifest.preflightMaxAgeSeconds * 1000, ...recordedTimes.map((time) => time + manifest.preflightMaxAgeSeconds * 1000));
  return { schemaVersion: 1, verdict: reasons.length ? "STOP" : "GO", reasons: [...new Set(reasons)], candidateSha: SHA.test(evidence?.candidateSha ?? "") ? evidence.candidateSha : null, expiresAt: new Date(expiresAt).toISOString(), productionAuthorized: false, productionMutated: false, instruction: "Read-only preflight only. Explicit user authorization bound to this candidate, target, package and legal plan is still required. Re-run after expiry or any state change." };
}

/** DB-only boundary: all existing history, including legal registry, must match. */
export function compareHistory(before, after, candidateSha, now = Date.now()) {
  const reasons = [...validateSnapshot(before, { candidateSha, now, maxAgeSeconds: Infinity }), ...validateSnapshot(after, { candidateSha, now })];
  if (before?.phase !== "before-schema" || after?.phase !== "after-schema" || before.requestedTournamentCount !== after.requestedTournamentCount || before.scopeSha256 !== after.scopeSha256) reasons.push("HISTORY_PHASE_OR_SCOPE_MISMATCH");
  if (object(before?.tables) && object(after?.tables)) for (const name of Object.keys(HISTORY)) {
    if (before.tables[name]?.count !== after.tables[name]?.count || before.tables[name]?.sha256 !== after.tables[name]?.sha256) reasons.push(`HISTORY_CHANGED:${name}`);
  }
  return { verdict: reasons.length ? "STOP" : "PASS", reasons: [...new Set(reasons)], productionMutated: false };
}

/** Legal-only boundary: exact successor receipt, never an arbitrary ignore list. */
export function comparePublishedLegal(before, after, candidateSha, receipt, now = Date.now(), publicationPlanSha256 = "") {
  const reasons = [...validateSnapshot(before, { candidateSha, now, maxAgeSeconds: Infinity }), ...validateSnapshot(after, { candidateSha, now })];
  const keys = ["projectRef", "candidateSha", "publicationPlanSha256", "receiptSha256", "beforeLegalSha256", "afterLegalSha256", "predecessorRowsPreserved", "effectiveSet", "checkedAt"];
  if (!exactKeys(receipt, keys) || receipt.projectRef !== PRODUCTION_REF || receipt.candidateSha !== candidateSha || !HEX.test(publicationPlanSha256) || receipt.publicationPlanSha256 !== publicationPlanSha256 || !HEX.test(receipt.receiptSha256) || receipt.beforeLegalSha256 !== before?.tables?.legal_documents?.sha256 || receipt.afterLegalSha256 !== after?.tables?.legal_documents?.sha256 || receipt.predecessorRowsPreserved !== true || receipt.effectiveSet !== "rulebook:3.2,ppa:3.2,terms:1.1,privacy:1.3") reasons.push("EXACT_LEGAL_PUBLICATION_RECEIPT_INVALID");
  const age = now - Date.parse(receipt?.checkedAt);
  if (!Number.isFinite(age) || age < -30000 || age > 600000) reasons.push("LEGAL_RECEIPT_STALE");
  if (before?.phase !== "after-schema" || after?.phase !== "after-schema" || before?.scopeSha256 !== after?.scopeSha256 || before?.ledgerSha256 !== after?.ledgerSha256 || before?.tables?.legal_documents?.count !== 10 || after?.tables?.legal_documents?.count !== 12) reasons.push("LEGAL_BOUNDARY_SCOPE_OR_REGISTRY_INVALID");
  if (object(before?.tables) && object(after?.tables)) for (const name of Object.keys(HISTORY).filter((key) => key !== "legal_documents")) {
    if (before.tables[name]?.count !== after.tables[name]?.count || before.tables[name]?.sha256 !== after.tables[name]?.sha256) reasons.push(`HISTORY_CHANGED:${name}`);
  }
  return { verdict: reasons.length ? "STOP" : "PASS", reasons: [...new Set(reasons)], productionMutated: false, instruction: "Legal delta requires independently verified exact publication receipts. This comparator does not publish or authenticate them." };
}

export function compareActivation(before, after, candidateSha, receipt, postDeploymentManifestSha256 = "", now = Date.now()) {
  const reasons = [...validateSnapshot(before, { candidateSha, now, maxAgeSeconds: Infinity }), ...validateSnapshot(after, { candidateSha, now })];
  const keys = ["projectRef", "candidateSha", "postDeploymentManifestSha256", "receiptSha256", "oldCreationRetired", "existingLegacyEditsPreserved", "explicitFourCreationPreserved", "checkedAt"];
  if (!exactKeys(receipt, keys) || receipt.projectRef !== PRODUCTION_REF || receipt.candidateSha !== candidateSha || !HEX.test(postDeploymentManifestSha256) || receipt.postDeploymentManifestSha256 !== postDeploymentManifestSha256 || !HEX.test(receipt.receiptSha256) || receipt.oldCreationRetired !== true || receipt.existingLegacyEditsPreserved !== true || receipt.explicitFourCreationPreserved !== true) reasons.push("POSTDEPLOYMENT_READONLY_RECEIPT_INVALID");
  const age = now - Date.parse(receipt?.checkedAt);
  if (!Number.isFinite(age) || age < -30000 || age > 600000) reasons.push("POSTDEPLOYMENT_RECEIPT_STALE");
  if (before?.phase !== "after-schema" || after?.phase !== "after-activation" || before?.scopeSha256 !== after?.scopeSha256 || before?.ledgerSha256 === after?.ledgerSha256) reasons.push("ACTIVATION_BOUNDARY_INVALID");
  if (object(before?.tables) && object(after?.tables)) for (const name of Object.keys(HISTORY)) {
    if (before.tables[name]?.count !== after.tables[name]?.count || before.tables[name]?.sha256 !== after.tables[name]?.sha256) reasons.push(`HISTORY_CHANGED:${name}`);
  }
  return { verdict: reasons.length ? "STOP" : "PASS", reasons: [...new Set(reasons)], productionMutated: false, instruction: "Read-only postdeployment comparison only. Verify function receipts without creating a real test tournament; reopen writes only after all gates pass." };
}
