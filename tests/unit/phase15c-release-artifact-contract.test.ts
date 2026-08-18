import { describe, expect, it, vi } from "vitest";

import {
  assertCleanGitWorktree,
  assertPdfEffectiveDate,
  formatActivationDateDisplay,
  validateCanonicalReleaseCorpus,
} from "../../scripts/phase15c/release-artifact-contract.mjs";

const documents = [
  {
    filename: "rulebook.pdf",
    kind: "rulebook",
    pathname: "/documents/rulebook.pdf",
    version: "3.0",
  },
  {
    filename: "ppa.pdf",
    kind: "ppa",
    pathname: "/documents/ppa.pdf",
    version: "3.0",
  },
  {
    filename: "terms.pdf",
    kind: "terms",
    pathname: "/documents/terms.pdf",
    version: "1.0",
  },
  {
    filename: "privacy.pdf",
    kind: "privacy",
    pathname: "/documents/privacy.pdf",
    version: "1.0",
  },
];

const corpus = {
  documents: documents.map((document) => ({
    effectiveDate: "2026-08-18",
    filename: document.filename,
    kind: document.kind,
    publicPath: document.pathname,
    status: "Effective",
    version: document.version,
  })),
  effectiveDate: "2026-08-18",
  effectiveDateDisplay: "18 August 2026",
  schemaVersion: 1,
};

describe("Phase 15C release artifact contract", () => {
  it("requires the CLI, web corpus, document metadata, and display date to agree", () => {
    expect(
      validateCanonicalReleaseCorpus(corpus, "2026-08-18", documents)
    ).toEqual({ effectiveDateDisplay: "18 August 2026" });

    expect(() =>
      validateCanonicalReleaseCorpus(corpus, "2026-08-19", documents)
    ).toThrow(/Effective date does not match/i);
    expect(() =>
      validateCanonicalReleaseCorpus(
        {
          ...corpus,
          documents: corpus.documents.map((document, index) =>
            index === 0
              ? { ...document, effectiveDate: "2026-08-17" }
              : document
          ),
        },
        "2026-08-18",
        documents
      )
    ).toThrow(/rulebook metadata/i);
  });

  it("requires each PDF metadata subject to carry the same Effective date", () => {
    expect(() =>
      assertPdfEffectiveDate(
        Buffer.from("/Subject (Effective 18 August 2026)", "latin1"),
        "18 August 2026",
        "rulebook"
      )
    ).not.toThrow();
    expect(() =>
      assertPdfEffectiveDate(
        Buffer.from("/Subject (Effective 17 August 2026)", "latin1"),
        "18 August 2026",
        "rulebook"
      )
    ).toThrow(/PDF metadata/i);
  });

  it("refuses both tracked and untracked exact-head drift", () => {
    const clean = vi.fn(() => "");
    const dirty = vi.fn(() => " M app/rules/page.tsx\n?? untracked.sql\n");

    expect(() => assertCleanGitWorktree(clean)).not.toThrow();
    expect(() => assertCleanGitWorktree(dirty)).toThrow(/not clean/i);
    expect(clean).toHaveBeenCalledWith("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
  });

  it("formats only valid calendar dates", () => {
    expect(formatActivationDateDisplay("2026-08-18")).toBe("18 August 2026");
    expect(() => formatActivationDateDisplay("2026-02-30")).toThrow(
      /valid calendar date/i
    );
  });
});
