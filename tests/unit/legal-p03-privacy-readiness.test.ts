import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateP03LegalRuntime } from "../../scripts/legal-successor/p03-legal-runtime.mjs";
import { applyP03PrivacyDraft, finalizeP03PrivacyCorpus, buildP03PrivacyRelease } from "../../scripts/legal-successor/prepare-p03-privacy.mjs";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const corpus = readJson("docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json");
const source = readJson("content/legal-privacy-successor-v1.3.json");
const prepared = readJson("docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json");
const manifest = readJson("docs/legal-drafts/p03-privacy-v1.3/review-manifest.json");
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const privacy = prepared.documents.find((entry: { kind: string }) => entry.kind === "privacy");

describe("P03 Privacy v1.3 prepared successor", () => {
  it("is a separate exact draft and runtime only allows the exact predecessor or finalized successor", () => {
    expect(applyP03PrivacyDraft(corpus, source)).toEqual(prepared);
    expect(privacy).toMatchObject({ version: "1.3", status: "Review Draft", effectiveDate: null });
    expect(corpus.documents.find((entry: { kind: string }) => entry.kind === "privacy")).toMatchObject({ version: "1.2", status: "Effective" });
    expect(readJson("docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json")).toMatchObject({ status: "Final", documents: [{ kind: "privacy", version: "1.2" }] });
    expect(["prepared-review", "finalized-successor"]).toContain(validateP03LegalRuntime(process.cwd()).mode);
  });

  it("preserves every other document, support schedule and backup authority", () => {
    for (const entry of corpus.documents.filter((entry: { kind: string }) => entry.kind !== "privacy")) {
      expect(prepared.documents.find((item: { kind: string }) => item.kind === entry.kind)).toEqual(entry);
    }
    const oldRows = corpus.documents.find((entry: { kind: string }) => entry.kind === "privacy").sections.find((section: { number: string }) => section.number === "18").blocks.find((block: { type: string }) => block.type === "table").rows;
    const newRows = privacy.sections.find((section: { number: string }) => section.number === "18").blocks.find((block: { type: string }) => block.type === "table").rows;
    for (const row of oldRows) expect(newRows).toContainEqual(row);
  });

  it("binds the binary review artifact and contains the approved privacy boundaries", () => {
    expect(manifest.pdfSha256).toBe(digest("docs/legal-drafts/p03-privacy-v1.3/ironclad-privacy-policy-v1.3.pdf"));
    const text = JSON.stringify(privacy);
    for (const phrase of ["40 days after the Tournament officially closes", "does not start when an individual Match ends", "24 months after support", "24 months after the result becomes final", "never by classifying message text", "does not automatically anonymise message bodies", "requester's own rooms", "normal purge eligibility resumes", "maximum rolling 90-day backup window"]) expect(text).toContain(phrase);
  });

  it("refuses a review PDF as the Final successor artifact", () => {
    const final = finalizeP03PrivacyCorpus(corpus, source, "2026-09-23");
    const draftPdf = readFileSync("docs/legal-drafts/p03-privacy-v1.3/ironclad-privacy-policy-v1.3.pdf");
    expect(() => buildP03PrivacyRelease(corpus, final, draftPdf)).toThrow(/metadata/);
    expect(() => buildP03PrivacyRelease(corpus, prepared, draftPdf)).toThrow(/Draft/);
  });

  it("refuses missing, duplicated or changed source anchors", () => {
    const missing = structuredClone(source);
    missing.documents[0].operations[0].expected = "unreviewed predecessor";
    expect(() => applyP03PrivacyDraft(corpus, missing)).toThrow(/anchor/);
    const duplicated = structuredClone(corpus);
    const section = duplicated.documents.find((entry: { kind: string }) => entry.kind === "privacy").sections.find((entry: { number: string }) => entry.number === "2");
    section.blocks.push(structuredClone(section.blocks[0]));
    expect(() => applyP03PrivacyDraft(duplicated, source)).toThrow(/anchor/);
    expect(() => applyP03PrivacyDraft(prepared, source)).toThrow(/predecessor/);
  });

  it("stages a future actual-date successor without modifying its predecessor", () => {
    const before = JSON.stringify(corpus);
    const final = finalizeP03PrivacyCorpus(corpus, source, "2026-09-23");
    expect(final.documents.find((entry: { kind: string }) => entry.kind === "privacy")).toMatchObject({ version: "1.3", status: "Effective", effectiveDate: "2026-09-23" });
    expect(JSON.stringify(corpus)).toBe(before);
    for (const invalid of ["2026-02-30", "2026-13-01", "not-a-date"]) expect(() => finalizeP03PrivacyCorpus(corpus, source, invalid)).toThrow();
  });
});
