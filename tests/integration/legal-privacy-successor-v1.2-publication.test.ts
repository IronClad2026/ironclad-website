import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateFinalPrivacyRelease } from "../../scripts/legal-successor/privacy-document-successor-v1.2.mjs";

const root = process.cwd();
const activationDate = "2026-08-22";
const corpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const release = JSON.parse(
  readFileSync(join(root, "content", "legal-successor-release.json"), "utf8")
);
const candidatePath = join(
  root,
  "content",
  "legal-privacy-successor-v1.2-release-candidate.json"
);
const sourcePath = join(root, "content", "legal-privacy-successor-v1.2.json");
const pdfPath = join(
  root,
  "public",
  "documents-rules-ppa",
  "ironclad-privacy-policy-v1.2.pdf"
);

function corpusAtPrivacyV12Publication() {
  const historical = structuredClone(corpus);
  const rulebook = historical.documents.find(
    (document: { kind: string }) => document.kind === "rulebook"
  ) as Record<string, unknown> | undefined;
  const ppa = historical.documents.find(
    (document: { kind: string }) => document.kind === "ppa"
  ) as Record<string, unknown> | undefined;
  if (!rulebook || !ppa) {
    throw new Error("Historical Privacy v1.2 corpus is incomplete.");
  }
  Object.assign(rulebook, {
    effectiveDate: "2026-08-18",
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    publicPath:
      "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    version: "3.0",
  });
  Object.assign(ppa, {
    effectiveDate: "2026-08-18",
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    publicPath:
      "/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
    version: "3.0",
  });
  return historical;
}

const historicalHashes = new Map([
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

describe("Privacy v1.2 finalized publication boundary", () => {
  it("contains the exact mixed-date Effective corpus", () => {
    expect(
      corpus.documents.map(
        (document: {
          effectiveDate: string;
          kind: string;
          status: string;
          version: string;
        }) => ({
          effectiveDate: document.effectiveDate,
          kind: document.kind,
          status: document.status,
          version: document.version,
        })
      )
    ).toEqual([
      {
        effectiveDate: "2026-08-22",
        kind: "rulebook",
        status: "Effective",
        version: "3.1",
      },
      {
        effectiveDate: "2026-08-22",
        kind: "ppa",
        status: "Effective",
        version: "3.1",
      },
      {
        effectiveDate: "2026-08-20",
        kind: "terms",
        status: "Effective",
        version: "1.1",
      },
      {
        effectiveDate: activationDate,
        kind: "privacy",
        status: "Effective",
        version: "1.2",
      },
    ]);
  });

  it("publishes one final manifest whose hash matches the PDF", () => {
    const validated = validateFinalPrivacyRelease({
      activationDate,
      baseUrl: "https://www.ironcladtournaments.com",
      corpus: corpusAtPrivacyV12Publication(),
      release,
    });
    const pdfBytes = readFileSync(pdfPath);

    expect(validated.release).toEqual(release.documents[0]);
    expect(sha256(pdfBytes)).toBe(release.documents[0].sha256);
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const pdfSource = pdfBytes.toString("latin1");
    expect(pdfSource).toContain("Effective 22 August 2026");
    expect(pdfSource).not.toContain("REVIEW DRAFT - NOT EFFECTIVE");
    expect(pdfSource).not.toContain("Effective date: TBD");
  });

  it("removes the stale candidate but retains reviewed source provenance", () => {
    expect(existsSync(candidatePath)).toBe(false);
    expect(existsSync(sourcePath)).toBe(true);
    const source = JSON.parse(readFileSync(sourcePath, "utf8"));
    expect(source).toMatchObject({
      effectiveDateToken: "{{PRODUCTION_EFFECTIVE_DATE}}",
      status: "Review Draft",
    });
  });

  it("preserves every previously published legal artifact byte-for-byte", () => {
    for (const [filename, expectedHash] of historicalHashes) {
      const path = join(root, "public", "documents-rules-ppa", filename);
      expect(existsSync(path)).toBe(true);
      expect(sha256(readFileSync(path))).toBe(expectedHash);
    }
  });
});
