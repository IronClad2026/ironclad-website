import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPROVED_POLICY, privacyArtifactHash, validatePrivacyReadiness } from "../../../scripts/p03-release/privacy-readiness.mjs";
import { validateP03LegalRuntime } from "../../../scripts/legal-successor/p03-legal-runtime.mjs";
import { verifyPackage } from "../../../scripts/p03-db/package.mjs";

// The legal helper's deterministic corpus/PDF/mixed-state checks have their
// own legal-successor suite; these tests exercise its gate integration.
vi.mock("../../../scripts/legal-successor/p03-legal-runtime.mjs", () => ({ validateP03LegalRuntime: vi.fn() }));
beforeEach(() => { vi.mocked(validateP03LegalRuntime).mockReturnValue({ mode: "prepared-review", runtimePrivacyVersion: "1.2", effectiveDate: null }); });

const migration = "20260923062127_match_room_retention_and_privacy.sql";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "p03-privacy-readiness-"));
  const files = [
    `supabase/migrations/${migration}`, "scripts/p03-release/privacy.mjs", "scripts/p03-release/privacy-operations.md",
    "content/legal-privacy-successor-v1.3.json", "docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json",
    "docs/legal-drafts/p03-privacy-v1.3/ironclad-privacy-policy-v1.3.pdf", "docs/legal-drafts/p03-privacy-v1.3/review-manifest.json",
    "tests/database/match-room-retention.sql",
    "docs/p03-retention-decision.json", "docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json", "docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json",
    "scripts/legal-successor/prepare-p03-privacy.mjs", "scripts/legal-successor/p03-privacy-publication.mjs",
    "scripts/legal-successor/p03-legal-runtime.mjs",
  ];
  const write = (file: string, body: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), body); };
  for (const file of files) write(file, "synthetic fixture\n");
  write(files[3], JSON.stringify({ schemaVersion: 1, status: "Review Draft", effectiveDateToken: "{{PRODUCTION_EFFECTIVE_DATE}}", documents: [{ kind: "privacy", fromVersion: "1.2", version: "1.3" }] }));
  const pdfSha256 = privacyArtifactHash(root, { path: files[5], encoding: "binary" });
  write(files[6], JSON.stringify({ status: "Review Draft", effectiveDate: null, pdfSha256 }));
  write("docs/p03-retention-decision.json", JSON.stringify({ schemaVersion: 1, status: "Owner approved", routine: { days: 40, anchor: APPROVED_POLICY.anchor, individualMatchCompletionIsAnchor: false }, formalCases: { supportCaseMonths: 24, resultIntegrityMonths: 24, messageTextClassification: false }, publication: { reviewDraftOnly: true, productionActivationAuthorized: false }, productionMutationsAuthorized: false }));
  const manifest = {
    schemaVersion: 1, policy: { ...APPROVED_POLICY, routineDays: Number(APPROVED_POLICY.routineDays) }, publication: { status: "Review Draft", runtimeActivated: false, effectiveDate: null },
    retentionMigration: migration, privacyOperations: "scripts/p03-release/privacy.mjs",
    artifacts: files.map((file) => { const encoding = file.endsWith(".pdf") ? "binary" : "utf8-lf"; return { path: file, encoding, sha256: privacyArtifactHash(root, { path: file, encoding }) }; }),
  };
  const filename = path.join(root, "readiness.json");
  const save = () => writeFileSync(filename, JSON.stringify(manifest)); save();
  return { root, filename, manifest, save, files, write };
}
describe("implemented privacy and legal preparation gate", () => {
  it("validates the real repository artifact inventory and exact migration package", async () => {
    const actual = await vi.importActual<typeof import("../../../scripts/legal-successor/p03-legal-runtime.mjs")>("../../../scripts/legal-successor/p03-legal-runtime.mjs");
    vi.mocked(validateP03LegalRuntime).mockImplementation(actual.validateP03LegalRuntime);
    const repository = path.resolve(import.meta.dirname, "../../..");
    const result = validatePrivacyReadiness(repository, path.join(repository, "docs/p03-privacy-readiness.json"), verifyPackage(repository));
    expect(result.retentionMigration).toBe(migration);
    expect(["prepared-review", "finalized-successor"]).toContain(result.runtime.mode);
  });
  it("binds actual review artifacts, operator controls and additive migration to the package", () => {
    const value = fixture();
    expect(validatePrivacyReadiness(value.root, value.filename, [{ file: migration }]).retentionMigration).toBe(migration);
    expect(() => validatePrivacyReadiness(value.root, value.filename, [])).toThrow("atomic package");
    value.write(value.files[1], "changed operator authority");
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }])).toThrow("changed");
  });
  it("rejects wrong policy, missing retention tests and premature activation", () => {
    const value = fixture();
    value.manifest.policy.routineDays = 30; value.save();
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }])).toThrow("approved");
    value.manifest.policy.routineDays = 40; value.manifest.publication.runtimeActivated = true; value.save();
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }])).toThrow("non-effective");
    value.manifest.publication.runtimeActivated = false; value.manifest.artifacts = value.manifest.artifacts.filter((item) => !item.path.includes("tests/database")); value.save();
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }])).toThrow("missing");
  });
  it("normalizes only declared UTF-8 line endings and preserves binary hashes", () => {
    const value = fixture();
    const item = value.manifest.artifacts[0];
    value.write(item.path, readFileSync(path.join(value.root, item.path), "utf8").replaceAll("\n", "\r\n"));
    expect(privacyArtifactHash(value.root, item)).toBe(item.sha256);
    expect(privacyArtifactHash(value.root, { ...item, encoding: "binary" })).not.toBe(item.sha256);
    expect(() => privacyArtifactHash(value.root, { path: "../outside", encoding: "binary" })).toThrow("escapes");
    expect(() => privacyArtifactHash(value.root, { path: item.path, encoding: "implicit" })).toThrow("explicit");
  });
  it("accepts only a finalized successor for today's Sydney date at the live gate", () => {
    const value = fixture();
    expect(validatePrivacyReadiness(value.root, value.filename, [{ file: migration }]).runtime.mode).toBe("prepared-review");
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }], { live: true })).toThrow("review preparation alone cannot pass");
    vi.mocked(validateP03LegalRuntime).mockReturnValue({ mode: "finalized-successor", runtimePrivacyVersion: "1.3", effectiveDate: "2026-09-23", pdfSha256: "a".repeat(64) });
    expect(validatePrivacyReadiness(value.root, value.filename, [{ file: migration }], { live: true, now: new Date("2026-09-22T15:00:00Z") }).runtime.mode).toBe("finalized-successor");
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }], { live: true, now: new Date("2026-09-23T15:00:00Z") })).toThrow("actual Australia/Sydney");
    vi.mocked(validateP03LegalRuntime).mockImplementation(() => { throw new Error("mixed legal runtime rejected"); });
    expect(() => validatePrivacyReadiness(value.root, value.filename, [{ file: migration }])).toThrow("mixed legal runtime");
  });
});
