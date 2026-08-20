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

type SuccessorManifest = {
  documents: {
    effectiveDate: string;
    filename: string;
    kind: "privacy" | "terms";
    publicPath: string;
    sha256: string;
    version: "1.1";
  }[];
  effectiveDate: string;
  effectiveDateDisplay: string;
  schemaVersion: number;
  status: "Final";
};

const root = process.cwd();
const corpusPath = join(root, "content", "legal-corpus.json");
const draftPath = join(root, "content", "legal-successors-v1.1.json");
const manifestPath = join(root, "content", "legal-successor-release.json");
const publicDirectory = join(root, "public", "documents-rules-ppa");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as LegalCorpus;
const draft = JSON.parse(readFileSync(draftPath, "utf8")) as {
  documents: { fromVersion: string; kind: string; version: string }[];
  effectiveDateToken: string;
  schemaVersion: number;
  status: string;
};
const manifest = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf8")) as SuccessorManifest)
  : null;

const historicalDocuments = {
  ppa: {
    effectiveDate: "2026-08-18",
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    sha256: "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
    version: "3.0",
  },
  privacy: {
    effectiveDate: "2026-08-18",
    filename: "ironclad-privacy-policy-v1.0.pdf",
    sha256: "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
    version: "1.0",
  },
  rulebook: {
    effectiveDate: "2026-08-18",
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    sha256: "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
    version: "3.0",
  },
  terms: {
    effectiveDate: "2026-08-18",
    filename: "ironclad-terms-of-service-v1.0.pdf",
    sha256: "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
    version: "1.0",
  },
} as const;

describe("versioned legal publication contract", () => {
  it("accepts only the initial Effective corpus or a finalized mixed-date successor", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.documents).toHaveLength(4);
    expect(corpus.documents.map((document) => document.kind).sort()).toEqual(
      Object.keys(historicalDocuments).sort()
    );

    if (manifest === null) {
      expect(corpus.effectiveDate).toBe("2026-08-18");
      expect(corpus.effectiveDateDisplay).toBe("18 August 2026");
      for (const document of corpus.documents) {
        const expected =
          historicalDocuments[document.kind as keyof typeof historicalDocuments];
        expect(document.status).toBe("Effective");
        expect(document.effectiveDate).toBe(expected.effectiveDate);
        expect(document.version).toBe(expected.version);
        expect(document.filename).toBe(expected.filename);
        expect(document.publicPath).toBe(
          `/documents-rules-ppa/${expected.filename}`
        );
      }
    } else {
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.status).toBe("Final");
      expect(corpus.effectiveDate).toBe(manifest.effectiveDate);
      expect(corpus.effectiveDateDisplay).toBe(manifest.effectiveDateDisplay);
      expect(manifest.documents.map((document) => document.kind).sort()).toEqual([
        "privacy",
        "terms",
      ]);

      for (const document of corpus.documents) {
        expect(document.status).toBe("Effective");
        if (document.kind === "rulebook" || document.kind === "ppa") {
          const expected = historicalDocuments[document.kind];
          expect(document.version).toBe(expected.version);
          expect(document.effectiveDate).toBe(expected.effectiveDate);
          expect(document.filename).toBe(expected.filename);
        } else {
          const release = manifest.documents.find(
            (candidate) => candidate.kind === document.kind
          );
          expect(release).toBeDefined();
          expect(document.version).toBe("1.1");
          expect(document.effectiveDate).toBe(manifest.effectiveDate);
          expect(document.filename).toBe(release?.filename);
          expect(document.publicPath).toBe(release?.publicPath);
        }
      }
    }

    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toMatch(
      /Review Draft|Not Effective|Actual Production activation date|\{\{PRODUCTION_EFFECTIVE_DATE\}\}/
    );
  });

  it("preserves historical PDFs and permits only finalized v1.1 successors", () => {
    const expectedArtifacts = new Map<string, string>(
      Object.values(historicalDocuments).map((document) => [
        document.filename,
        document.sha256,
      ])
    );
    for (const document of manifest?.documents ?? []) {
      expect(document.version).toBe("1.1");
      expect(document.effectiveDate).toBe(manifest?.effectiveDate);
      expect(document.sha256).toMatch(/^[0-9a-f]{64}$/);
      expectedArtifacts.set(document.filename, document.sha256);
    }

    const pdfNames = readdirSync(publicDirectory)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort();
    expect(pdfNames).toEqual([...expectedArtifacts.keys()].sort());

    for (const [filename, sha256] of expectedArtifacts) {
      const path = join(publicDirectory, filename);
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    }
  });

  it("keeps v1.1 as an undated Review Draft until controlled finalization", () => {
    expect(draft.schemaVersion).toBe(1);
    expect(draft.status).toBe("Review Draft");
    expect(draft.effectiveDateToken).toBe("{{PRODUCTION_EFFECTIVE_DATE}}");
    expect(draft.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromVersion: "1.0",
          kind: "terms",
          version: "1.1",
        }),
        expect.objectContaining({
          fromVersion: "1.0",
          kind: "privacy",
          version: "1.1",
        }),
      ])
    );

    if (manifest === null) {
      expect(
        existsSync(
          join(publicDirectory, "ironclad-terms-of-service-v1.1.pdf")
        )
      ).toBe(false);
      expect(
        existsSync(join(publicDirectory, "ironclad-privacy-policy-v1.1.pdf"))
      ).toBe(false);
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

  it("retains the historical hashes and canonical URLs in the Phase 15C runbook", () => {
    const runbook = readFileSync(
      join(root, "docs", "phase15c-publication-runbook.md"),
      "utf8"
    );

    for (const expected of Object.values(historicalDocuments)) {
      expect(runbook).toContain(expected.sha256);
      expect(runbook).toContain(
        `https://www.ironcladtournaments.com/documents-rules-ppa/${expected.filename}`
      );
    }
  });
});
