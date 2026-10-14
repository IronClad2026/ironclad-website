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
  it("continues the same one-of-six season through five real Pro Events without historical reclassification", () => {
    const corpus = JSON.parse(readFileSync("content/legal-corpus.json", "utf8"));
    const rulebook = corpus.documents.find((document: {kind:string}) => document.kind === "rulebook");
    const section = rulebook.sections.find((value: {number:string}) => value.number === "14");
    const text = (number: string) => section.blocks.find((block: {number?:string}) => block.number === number).text;
    expect(text("14.3")).toContain("preserved historical Event expressly identified in section 14.8");
    expect(text("14.3")).toContain("future Main completion cannot consume a Pro season slot");
    expect(text("14.5")).toContain("five subsequent genuine Pro Events");
    expect(text("14.5")).toContain("no finalisation, season title or completion award occurs at one of six");
    expect(text("14.8")).toContain("same genuine six-Event season with one of six");
    expect(text("14.8")).toContain("original eligibility, accepted governing documents, results and points");
    expect(text("14.8")).toContain("does not reclassify its historical Event or points");
    expect(text("14.8")).toContain("no season is retired or prematurely finalised");
    expect(text("14.8")).toContain("does not waive an earned Tournament prize");
    expect(text("14.8")).not.toContain("Its successor is a Pro season starting at zero");
  });
  it("grandfathers only historical eligibility and preserves prospective acceptance authority", () => {
    const corpus = JSON.parse(readFileSync("content/legal-corpus.json", "utf8"));
    const historical = JSON.parse(readFileSync("content/legal-history/production-rulebook-ppa-v3.1-corpus.json", "utf8"));
    const ppa = corpus.documents.find((document: {kind:string}) => document.kind === "ppa");
    const previous = historical.documents.find((document: {kind:string}) => document.kind === "ppa");
    const section = (document: typeof ppa, number: string) => document.sections.find((value: {number:string}) => value.number === number);
    const text = JSON.stringify(ppa);
    expect(text).toContain("every future Pro registration still requires fresh Relic verification and the 1700+ threshold");
    expect(text).toContain("does not replace the PPA accepted for that historical Event");
    const block = (document: typeof ppa, number: string) => section(document, "19").blocks.find((value: {number?:string}) => value.number === number);
    expect(block(ppa, "19.4")).toEqual(block(previous, "19.4"));
    expect(block(ppa, "19.5")).toEqual(block(previous, "19.5"));
    expect(section(ppa, "13")).toEqual(section(previous, "13"));
  });
});
