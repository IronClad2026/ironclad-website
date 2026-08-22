import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type LegalBlock = {
  number?: string;
  text?: string;
  type: string;
};

type LegalDocument = {
  effectiveDate: string;
  filename: string;
  kind: string;
  publicPath: string;
  sections: {
    blocks: LegalBlock[];
    number: string;
  }[];
  status: string;
  version: string;
};

type LegalCorpus = {
  activationDatePolicy: string;
  documents: LegalDocument[];
};

const root = process.cwd();
const corpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
) as LegalCorpus;

function document(kind: "rulebook" | "ppa" | "terms" | "privacy") {
  const value = corpus.documents.find((candidate) => candidate.kind === kind);
  expect(value, kind).toBeDefined();
  return value as LegalDocument;
}

function paragraph(
  legalDocument: LegalDocument,
  sectionNumber: string,
  paragraphNumber: string
) {
  const section = legalDocument.sections.find(
    (candidate) => candidate.number === sectionNumber
  );
  const block = section?.blocks.find(
    (candidate) => candidate.number === paragraphNumber
  );
  expect(block, `${legalDocument.kind} ${paragraphNumber}`).toBeDefined();
  return block?.text ?? "";
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("Rulebook and PPA prospective successor wording", () => {
  it("publishes the exact v3.1 identities and activation date", () => {
    expect(corpus.activationDatePolicy).toBe(
      "The current document set may contain different Effective dates. Rulebook v3.1 and PPA v3.1 use 22 August 2026, Terms v1.1 retains 20 August 2026, and Privacy v1.2 uses its actual controlled Production publication date."
    );
    expect(document("rulebook")).toMatchObject({
      effectiveDate: "2026-08-22",
      filename: "ironclad-official-tournament-rulebook-v3.1.pdf",
      publicPath:
        "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf",
      status: "Effective",
      version: "3.1",
    });
    expect(document("ppa")).toMatchObject({
      effectiveDate: "2026-08-22",
      filename: "ironclad-player-participation-agreement-v3.1.pdf",
      publicPath:
        "/documents-rules-ppa/ironclad-player-participation-agreement-v3.1.pdf",
      status: "Effective",
      version: "3.1",
    });
  });

  it("keeps an existing registration on its presented Rulebook version", () => {
    const rulebook = document("rulebook");
    const successor = paragraph(rulebook, "21", "21.4");

    expect(successor).toBe(
      "An Effective document must not be materially overwritten under the same version. A material revision requires a new version and artifact, appropriate notice and renewed acceptance where required. A successor Rulebook normally applies only prospectively to future registrations and Events. The version presented for an existing registration continues to govern that Tournament unless a narrow decision is made under section 21.5."
    );
    expect(paragraph(rulebook, "21", "21.5")).toBe(
      "Narrow emergency decisions may be issued only where reasonably necessary and must not authorise unrelated retrospective changes."
    );
    expect(successor).not.toMatch(/[\u2010\u2011\u2012\u2013\u2014\u2212]/u);
  });

  it("prevents a successor PPA from silently replacing an active acceptance", () => {
    const ppa = document("ppa");
    const scope = paragraph(ppa, "1", "1.5");
    const successor = paragraph(ppa, "19", "19.4");

    expect(scope).toBe(
      "This PPA applies to IronClad-hosted CoH3 1v1 Tournaments. A successor PPA normally applies only prospectively to future registrations. The version presented for and accepted with an existing registration continues to govern that Tournament except to the extent of a bounded decision made under the Governing Documents' emergency authority."
    );
    expect(successor).toBe(
      "A material change requires a new version, appropriate notice and renewed acceptance or acknowledgement where required. A successor PPA normally applies only prospectively to future registrations. The PPA version presented for and accepted with an existing registration continues to govern that Tournament except to the extent of a bounded decision made under the Governing Documents' emergency authority. Continued browsing is not a substitute for Tournament acceptance."
    );
    expect(paragraph(ppa, "19", "19.5")).toBe(
      "Emergency rulings must address genuine needs and cannot rewrite unrelated completed results."
    );
    expect(`${scope}${successor}`).not.toContain("unless a later Effective version");
    expect(`${scope}${successor}`).not.toMatch(
      /[\u2010\u2011\u2012\u2013\u2014\u2212]/u
    );
  });

  it("leaves Terms v1.1 and Privacy v1.2 byte-for-byte unchanged", () => {
    expect(sha256(document("terms"))).toBe(
      "a591351f4353382633b730ac610dc5c8ecba48444d60e35a30eabc68da23b88f"
    );
    expect(sha256(document("privacy"))).toBe(
      "1a6f2ce739c623445675a2b68012d1a0e3ca6e745a8d0315d86ac29e229e6e8f"
    );
    expect(document("terms")).toMatchObject({
      effectiveDate: "2026-08-20",
      filename: "ironclad-terms-of-service-v1.1.pdf",
      version: "1.1",
    });
    expect(document("privacy")).toMatchObject({
      effectiveDate: "2026-08-22",
      filename: "ironclad-privacy-policy-v1.2.pdf",
      version: "1.2",
    });
  });

  it("allows the new immutable filenames without removing historical support", () => {
    const generator = readFileSync(
      join(root, "scripts", "generate-legal-pdfs.py"),
      "utf8"
    );

    for (const filename of [
      "ironclad-official-tournament-rulebook-v3.0.pdf",
      "ironclad-official-tournament-rulebook-v3.1.pdf",
      "ironclad-player-participation-agreement-v3.0.pdf",
      "ironclad-player-participation-agreement-v3.1.pdf",
    ]) {
      expect(generator).toContain(filename);
    }
  });
});
