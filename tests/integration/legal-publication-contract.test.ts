import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPdfEffectiveDate,
  formatActivationDateDisplay,
} from "../../scripts/phase15c/release-artifact-contract.mjs";

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
  predecessorDocuments: {
    effectiveDate: string;
    filename: string;
    kind: "privacy" | "terms";
    publicPath: string;
    sha256: string;
    version: string;
  }[];
  documents: {
    effectiveDate: string;
    filename: string;
    kind: "privacy" | "terms";
    publicPath: string;
    sha256: string;
    version: string;
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
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8")
) as SuccessorManifest;

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

const publishedV11Artifacts = new Map([
  [
    "ironclad-terms-of-service-v1.1.pdf",
    "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
  ],
  [
    "ironclad-privacy-policy-v1.1.pdf",
    "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
  ],
]);

const publishedCompetitionV31Artifacts = new Map([
  [
    "ironclad-official-tournament-rulebook-v3.1.pdf",
    "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2",
  ],
  [
    "ironclad-player-participation-agreement-v3.1.pdf",
    "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b",
  ],
]);

describe("versioned legal publication contract", () => {
  it("publishes the exact active document identities from the Final manifest", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.documents).toHaveLength(4);
    expect(corpus.documents.map((document) => document.kind).sort()).toEqual(
      Object.keys(historicalDocuments).sort()
    );
    const displayDate = formatActivationDateDisplay(manifest.effectiveDate);
    expect(manifest).toMatchObject({
      effectiveDateDisplay: displayDate,
      schemaVersion: 1,
      status: "Final",
    });
    expect(corpus.effectiveDate).toBe(manifest.effectiveDate);
    expect(corpus.effectiveDateDisplay).toBe(displayDate);
    expect(manifest.documents).toHaveLength(1);
    expect(manifest.documents[0].kind).toBe("privacy");
    expect(manifest.documents[0].effectiveDate).toBe(manifest.effectiveDate);
    expect(manifest.predecessorDocuments.map((document) => document.kind).sort())
      .toEqual(["privacy", "terms"]);

    for (const document of [...manifest.predecessorDocuments, ...manifest.documents]) {
      expect(document.version).toMatch(/^\d+\.\d+$/);
      const title = document.kind === "terms" ? "terms-of-service" : "privacy-policy";
      expect(document.filename).toBe("ironclad-" + title + "-v" + document.version + ".pdf");
      expect(document.publicPath).toBe("/documents-rules-ppa/" + document.filename);
      expect(document.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(formatActivationDateDisplay(document.effectiveDate)).toBeTruthy();
      expect(document.effectiveDate <= manifest.effectiveDate).toBe(true);
    }
    const priorPrivacy = manifest.predecessorDocuments.find(
      (document) => document.kind === "privacy"
    )!;
    const priorVersion = priorPrivacy.version.split(".").map(Number);
    const nextVersion = manifest.documents[0].version.split(".").map(Number);
    expect(
      nextVersion[0] > priorVersion[0] ||
      (nextVersion[0] === priorVersion[0] && nextVersion[1] > priorVersion[1])
    ).toBe(true);

    const activeAccountDocuments = new Map(
      [...manifest.predecessorDocuments, ...manifest.documents].map((document) => [
        document.kind,
        document,
      ])
    );
    expect(activeAccountDocuments.get("terms")).toEqual({
      effectiveDate: "2026-08-20",
      filename: "ironclad-terms-of-service-v1.1.pdf",
      kind: "terms",
      publicPath: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
      sha256: publishedV11Artifacts.get("ironclad-terms-of-service-v1.1.pdf"),
      version: "1.1",
    });
    expect(
      corpus.documents.map((document) => ({
        effectiveDate: document.effectiveDate,
        filename: document.filename,
        kind: document.kind,
        publicPath: document.publicPath,
        status: document.status,
        version: document.version,
      }))
    ).toEqual([
      {
        effectiveDate: "2026-08-22",
        filename: "ironclad-official-tournament-rulebook-v3.1.pdf",
        kind: "rulebook",
        publicPath: "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf",
        status: "Effective",
        version: "3.1",
      },
      {
        effectiveDate: "2026-08-22",
        filename: "ironclad-player-participation-agreement-v3.1.pdf",
        kind: "ppa",
        publicPath: "/documents-rules-ppa/ironclad-player-participation-agreement-v3.1.pdf",
        status: "Effective",
        version: "3.1",
      },
      ...(["terms", "privacy"] as const).map((kind) => {
        const document = activeAccountDocuments.get(kind)!;
        return {
          effectiveDate: document.effectiveDate,
          filename: document.filename,
          kind,
          publicPath: document.publicPath,
          status: "Effective",
          version: document.version,
        };
      }),
    ]);

    expect(JSON.stringify([corpus, manifest])).not.toMatch(
      /Review Draft|Not Effective|Actual Production activation date|\{\{PRODUCTION_EFFECTIVE_DATE\}\}/
    );
  });

  it("preserves every historical PDF and binds the active Final manifest to current bytes", () => {
    const expectedArtifacts = new Map<string, string>([
      ...Object.values(historicalDocuments).map((document): [string, string] => [
        document.filename,
        document.sha256,
      ]),
      ...publishedV11Artifacts,
      ...publishedCompetitionV31Artifacts,
      [
        "ironclad-privacy-policy-v1.2.pdf",
        "aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6",
      ],
    ]);
    for (const document of [...manifest.predecessorDocuments, ...manifest.documents]) {
      const historicalHash = expectedArtifacts.get(document.filename);
      if (historicalHash !== undefined) {
        expect(document.sha256).toBe(historicalHash);
      }
      expectedArtifacts.set(document.filename, document.sha256);
      assertPdfEffectiveDate(
        readFileSync(join(publicDirectory, document.filename)),
        formatActivationDateDisplay(document.effectiveDate),
        document.kind
      );
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
