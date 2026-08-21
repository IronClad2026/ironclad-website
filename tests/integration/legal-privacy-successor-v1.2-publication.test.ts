import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hashReviewSourceBytes,
} from "../../scripts/legal-successor/finalize-privacy-v1.2.mjs";
import { validateReviewCandidate } from "../../scripts/legal-successor/privacy-document-successor-v1.2.mjs";

const root = process.cwd();
const corpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const runtimeRelease = JSON.parse(
  readFileSync(join(root, "content", "legal-successor-release.json"), "utf8")
);
const sourcePath = join(
  root,
  "content",
  "legal-privacy-successor-v1.2.json"
);
const candidatePath = join(
  root,
  "content",
  "legal-privacy-successor-v1.2-release-candidate.json"
);
const pdfPath = join(
  root,
  "public",
  "documents-rules-ppa",
  "ironclad-privacy-policy-v1.2.pdf"
);

const publishedHashes = new Map([
  [
    "ironclad-official-tournament-rulebook-v3.0.pdf",
    "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  ],
  [
    "ironclad-player-participation-agreement-v3.0.pdf",
    "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  ],
  [
    "ironclad-terms-of-service-v1.0.pdf",
    "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  ],
  [
    "ironclad-privacy-policy-v1.0.pdf",
    "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
  ],
  [
    "ironclad-terms-of-service-v1.1.pdf",
    "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
  ],
  [
    "ironclad-privacy-policy-v1.1.pdf",
    "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
  ],
]);

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("Privacy v1.2 review-draft publication boundary", () => {
  it("keeps current runtime and acceptance-facing legal state at v1.1/v1.1", () => {
    expect(
      corpus.documents.map(
        (document: { kind: string; status: string; version: string }) => ({
          kind: document.kind,
          status: document.status,
          version: document.version,
        })
      )
    ).toEqual([
      { kind: "rulebook", status: "Effective", version: "3.0" },
      { kind: "ppa", status: "Effective", version: "3.0" },
      { kind: "terms", status: "Effective", version: "1.1" },
      { kind: "privacy", status: "Effective", version: "1.1" },
    ]);
    expect(runtimeRelease.status).toBe("Final");
    expect(
      runtimeRelease.documents.map(
        (document: { kind: string; version: string }) =>
          `${document.kind}:${document.version}`
      )
    ).toEqual(["terms:1.1", "privacy:1.1"]);
    expect(JSON.stringify(corpus)).not.toContain("Privacy v1.2");
    expect(JSON.stringify(runtimeRelease)).not.toContain("1.2");
  });

  it("publishes exactly one immutable review-draft artifact and non-runtime manifest", () => {
    expect(existsSync(candidatePath)).toBe(true);
    expect(existsSync(pdfPath)).toBe(true);

    const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
    const sourceBytes = readFileSync(sourcePath);
    const pdfBytes = readFileSync(pdfPath);
    expect(validateReviewCandidate(candidate, corpus, runtimeRelease)).toEqual(
      candidate.document
    );
    expect(candidate).toMatchObject({
      effectiveDate: null,
      effectiveDateDisplay: "TBD",
      runtimeActivated: false,
      status: "Review Draft - Not Effective",
      source: { version: "1.2" },
      document: {
        filename: "ironclad-privacy-policy-v1.2.pdf",
        kind: "privacy",
        version: "1.2",
      },
    });
    expect(candidate.source.sha256).toBe(hashReviewSourceBytes(sourceBytes));
    expect(candidate.document.sha256).toBe(sha256(pdfBytes));
    expect(candidate.document.size).toBe(pdfBytes.length);
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const pdfSource = pdfBytes.toString("latin1");
    expect(pdfSource).toContain("REVIEW DRAFT - NOT EFFECTIVE");
    expect(pdfSource).toContain("Effective date: TBD");
    expect(pdfSource).not.toContain("Effective 20 August 2026");
  });

  it("preserves every already-published legal artifact byte-for-byte", () => {
    for (const [filename, expectedHash] of publishedHashes) {
      const path = join(root, "public", "documents-rules-ppa", filename);
      expect(existsSync(path)).toBe(true);
      expect(sha256(readFileSync(path))).toBe(expectedHash);
    }
  });
});
