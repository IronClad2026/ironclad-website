import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type CorpusDocument = {
  effectiveDate: string;
  filename: string;
  kind: string;
  publicPath: string;
  sections: {
    blocks: { number?: string; text?: string; type: string }[];
    number: string;
  }[];
  status: string;
  version: string;
};

type LegalCorpus = {
  documents: CorpusDocument[];
  effectiveDate: string;
  effectiveDateDisplay: string;
  schemaVersion: number;
};

const root = process.cwd();
const corpusPath = join(root, "content", "legal-corpus.json");
const publicDirectory = join(root, "public", "documents-rules-ppa");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as LegalCorpus;

const expectedDocuments = {
  ppa: {
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    sha256: "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
    version: "3.0",
  },
  privacy: {
    filename: "ironclad-privacy-policy-v1.0.pdf",
    sha256: "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
    version: "1.0",
  },
  rulebook: {
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    sha256: "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
    version: "3.0",
  },
  terms: {
    filename: "ironclad-terms-of-service-v1.0.pdf",
    sha256: "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
    version: "1.0",
  },
} as const;

describe("Phase 15C final legal publication contract", () => {
  it("publishes one internally consistent four-document Effective corpus", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.effectiveDate).toBe("2026-08-18");
    expect(corpus.effectiveDateDisplay).toBe("18 August 2026");
    expect(corpus.documents).toHaveLength(4);
    expect(corpus.documents.map((document) => document.kind).sort()).toEqual(
      Object.keys(expectedDocuments).sort()
    );

    for (const document of corpus.documents) {
      const expected =
        expectedDocuments[document.kind as keyof typeof expectedDocuments];

      expect(document.status).toBe("Effective");
      expect(document.effectiveDate).toBe(corpus.effectiveDate);
      expect(document.version).toBe(expected.version);
      expect(document.filename).toBe(expected.filename);
      expect(document.publicPath).toBe(
        `/documents-rules-ppa/${expected.filename}`
      );
    }

    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toMatch(
      /Review Draft|Not Effective|Actual Production activation date|15 September 2026/
    );
  });

  it("contains exactly the four approved immutable PDFs with locked hashes", () => {
    const pdfNames = readdirSync(publicDirectory)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort();

    expect(pdfNames).toEqual(
      Object.values(expectedDocuments)
        .map((document) => document.filename)
        .sort()
    );

    for (const expected of Object.values(expectedDocuments)) {
      const path = join(publicDirectory, expected.filename);
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        expected.sha256
      );
    }
  });

  it("preserves the approved PPA definition numbering", () => {
    const ppa = corpus.documents.find((document) => document.kind === "ppa");
    const definitions = ppa?.sections.find((section) => section.number === "2");

    expect(definitions?.blocks[0]).toEqual({
      number: "2.1",
      text: "For this Agreement:",
      type: "paragraph",
    });
    expect(definitions?.blocks[1].type).toBe("table");
    expect(definitions?.blocks[2].number).toBe("2.2");
  });

  it("records the same hashes and canonical URLs in the release runbook", () => {
    const runbook = readFileSync(
      join(root, "docs", "phase15c-publication-runbook.md"),
      "utf8"
    );

    for (const expected of Object.values(expectedDocuments)) {
      expect(runbook).toContain(expected.sha256);
      expect(runbook).toContain(
        `https://www.ironcladtournaments.com/documents-rules-ppa/${expected.filename}`
      );
    }
  });
});
