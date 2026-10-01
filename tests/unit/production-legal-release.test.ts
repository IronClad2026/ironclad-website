import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProductionLegalSql, validateLegalArtifacts, PRODUCTION_PROJECT_REF } from "../../scripts/consolidated-legal/publication.mjs";

describe("Production legal release candidate", () => {
  const candidateSha = "a".repeat(40);
  it("hash-verifies every PDF and preserves exact Privacy1.3/Terms1.1 content", () => {
    const manifest = validateLegalArtifacts();
    expect(manifest.documents.map((document: {kind: string; version: string}) => [document.kind, document.version])).toEqual([["rulebook","3.2"],["ppa","3.2"]]);
    const current = JSON.parse(readFileSync("content/legal-corpus.json","utf8"));
    const historical = JSON.parse(readFileSync("content/legal-history/production-rulebook-ppa-v3.1-corpus.json","utf8"));
    for (const kind of ["privacy","terms"]) expect(current.documents.find((document: {kind: string})=>document.kind===kind)).toEqual(historical.documents.find((document: {kind: string})=>document.kind===kind));
  });
  it("defaults to rollback and preserves historical IDs, URL/hash bytes and both acceptance tables", () => {
    const sql = buildProductionLegalSql({ projectRef: PRODUCTION_PROJECT_REF, candidateSha });
    expect(sql.trim().endsWith("rollback;")).toBe(true);
    expect(sql).toContain("share row exclusive mode");
    expect(sql).toContain("Legal publication changed historical authority or acceptance evidence");
    expect(sql).toContain("('privacy', '1.3'");
  });
  it("rejects wrong targets and unlabeled commits and binds exact candidate attestation", () => {
    expect(() => buildProductionLegalSql({projectRef: "other",candidateSha})).toThrow();
    expect(() => buildProductionLegalSql({projectRef: PRODUCTION_PROJECT_REF,candidateSha:"HEAD"})).toThrow();
    expect(() => buildProductionLegalSql({projectRef: PRODUCTION_PROJECT_REF,candidateSha,apply:true})).toThrow();
    expect(buildProductionLegalSql({projectRef: PRODUCTION_PROJECT_REF,candidateSha,apply:true,authorization:"Release the approved candidate to Production."}).trim().endsWith("commit;")).toBe(true);
  });
  it("states immutable legacy eligibility, separate scoring and a genuine six-event transition", () => {
    const corpus = JSON.parse(readFileSync("content/legal-corpus.json","utf8"));
    const rulebook = JSON.stringify(corpus.documents.find((document: {kind:string})=>document.kind==="rulebook"));
    expect(rulebook).toContain("Historical records are not reclassified");
    expect(rulebook).toContain("1400-1699");
    expect(rulebook).toContain("1700+");
    expect(rulebook).toContain("Only one official season is active");
  });
});
