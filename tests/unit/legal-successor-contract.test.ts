import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getLegalDocumentEffectiveDateDisplay,
  resolveEffectiveDateToken,
} from "@/lib/legal-corpus-publication";
import {
  applySuccessorDraft,
  formatDateDisplay,
} from "../../scripts/legal-successor/finalize-v1.1.mjs";
import {
  buildSuccessorTransactionSql,
  validateSuccessorRelease,
} from "../../scripts/legal-successor/legal-document-successor.mjs";

const root = process.cwd();
const currentCorpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const reviewDraft = JSON.parse(
  readFileSync(join(root, "content", "legal-successors-v1.1.json"), "utf8")
);
const currentTerms = currentCorpus.documents.find(
  (document: { kind: string }) => document.kind === "terms"
);
const activationDate =
  currentTerms?.version === "1.1"
    ? currentTerms.effectiveDate
    : "2026-09-15";

function finalizeForTest() {
  if (currentTerms?.version === "1.1") {
    return structuredClone(currentCorpus);
  }
  return applySuccessorDraft(currentCorpus, reviewDraft, activationDate);
}

function manifestFor(corpus: ReturnType<typeof finalizeForTest>) {
  return {
    documents: corpus.documents
      .filter((document: { kind: string }) =>
        document.kind === "terms" || document.kind === "privacy"
      )
      .map(
        (document: {
          effectiveDate: string;
          filename: string;
          kind: string;
          publicPath: string;
          version: string;
        }) => ({
          effectiveDate: document.effectiveDate,
          filename: document.filename,
          kind: document.kind,
          publicPath: document.publicPath,
          sha256: document.kind === "terms" ? "a".repeat(64) : "b".repeat(64),
          version: document.version,
        })
      ),
    effectiveDate: activationDate,
    effectiveDateDisplay: formatDateDisplay(activationDate),
    schemaVersion: 1,
    status: "Final",
  };
}

describe("Terms and Privacy v1.1 successor contract", () => {
  it("keeps the successor undated until an explicit Production-day finalization", () => {
    expect(reviewDraft.status).toBe("Review Draft");
    expect(reviewDraft.effectiveDateToken).toBe(
      "{{PRODUCTION_EFFECTIVE_DATE}}"
    );
    expect(JSON.stringify(reviewDraft)).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);

    expect(() =>
      applySuccessorDraft(currentCorpus, reviewDraft, "2026-02-30")
    ).toThrow(/valid calendar date/i);

    const wrongIdentity = structuredClone(reviewDraft);
    wrongIdentity.documents[0].filename = "unapproved.pdf";
    expect(() =>
      applySuccessorDraft(currentCorpus, wrongIdentity, activationDate)
    ).toThrow(/Review Draft identity is invalid/i);
  });

  it("changes only Terms and Privacy and adds the approved narrow disclosures", () => {
    const finalized = finalizeForTest();
    const beforeByKind = new Map(
      currentCorpus.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );
    const afterByKind = new Map(
      finalized.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );

    expect(afterByKind.get("rulebook")).toEqual(beforeByKind.get("rulebook"));
    expect(afterByKind.get("ppa")).toEqual(beforeByKind.get("ppa"));
    expect(afterByKind.get("terms")).toMatchObject({
      effectiveDate: activationDate,
      filename: "ironclad-terms-of-service-v1.1.pdf",
      version: "1.1",
    });
    expect(afterByKind.get("privacy")).toMatchObject({
      effectiveDate: activationDate,
      filename: "ironclad-privacy-policy-v1.1.pdf",
      version: "1.1",
    });
    expect(finalized.effectiveDate).toBe(activationDate);
    expect(finalized.effectiveDateDisplay).toBe(
      formatDateDisplay(activationDate)
    );

    const terms = JSON.stringify(afterByKind.get("terms"));
    const privacy = JSON.stringify(afterByKind.get("privacy"));
    expect(terms).toContain("Optional analytics consent is separate");
    expect(terms).toContain("private, immutable evidence");
    expect(privacy).toContain("account-wide successor acceptance record");
    expect(privacy).toContain("7 years from the database acceptance timestamp");
    expect(privacy).toContain("Account closure does not shorten this period");
    expect(privacy).toContain("ironclad_locale");
    expect(privacy).toContain("ironclad_analytics_consent");
    expect(privacy).toContain("Traffic reports may undercount");
    expect(privacy).toContain("does not promise automatic deletion at exactly 30 days");
    expect(privacy).toContain("does not identify a globally unique person across days");
  });

  it("renders Effective-date tokens from each document rather than the corpus latest date", () => {
    expect(formatDateDisplay("2026-08-18")).toBe("18 August 2026");
    expect(
      getLegalDocumentEffectiveDateDisplay({ effectiveDate: "2026-09-15" })
    ).toBe("15 September 2026");
    expect(
      resolveEffectiveDateToken("Effective {{EFFECTIVE_DATE}}", {
        effectiveDate: "2026-08-18",
      })
    ).toBe("Effective 18 August 2026");
    expect(
      resolveEffectiveDateToken("Effective {{EFFECTIVE_DATE}}", {
        effectiveDate: "2026-09-15",
      })
    ).toBe("Effective 15 September 2026");
  });

  it("requires the fixed two-document manifest and canonical successor paths", () => {
    const finalized = finalizeForTest();
    const manifest = manifestFor(finalized);

    expect(
      validateSuccessorRelease(finalized, manifest, activationDate)
    ).toMatchObject({
      effectiveDateDisplay: formatDateDisplay(activationDate),
      releases: expect.arrayContaining([
        expect.objectContaining({ kind: "terms", version: "1.1" }),
        expect.objectContaining({ kind: "privacy", version: "1.1" }),
      ]),
    });

    const invalid = structuredClone(manifest);
    invalid.documents[0].publicPath = "/documents-rules-ppa/unapproved.pdf";
    expect(() =>
      validateSuccessorRelease(finalized, invalid, activationDate)
    ).toThrow(/successor is invalid/i);
  });

  it("builds a rollback-only validation transaction or explicit atomic apply", () => {
    const finalized = finalizeForTest();
    const releases = manifestFor(finalized).documents;
    const common = {
      activationDate,
      baseUrl: "https://preview.example.vercel.app",
      releases,
    };
    const rollbackSql = buildSuccessorTransactionSql({
      ...common,
      apply: false,
    });
    const applySql = buildSuccessorTransactionSql({ ...common, apply: true });

    expect(rollbackSql).toContain("rollback;");
    expect(rollbackSql).toContain("account_legal_acceptances");
    expect(rollbackSql).toContain("status = 'superseded'");
    expect(rollbackSql).toContain("version = '1.1'");
    expect(applySql).toContain("commit;");
    expect(applySql).not.toContain("rollback;");
  });

  it("keeps PDF token substitution and rendering document-specific", () => {
    const source = readFileSync(
      join(root, "scripts", "generate-legal-pdfs.py"),
      "utf8"
    );

    expect(source).toContain(
      'corpus["documents"] = [resolve_document_tokens(document) for document in documents]'
    );
    expect(source).toContain(
      '{"{{EFFECTIVE_DATE}}": format_date(effective_date)}'
    );
    expect(source).toContain('format_date(document["effectiveDate"])');
    expect(source).not.toContain(
      'replace_tokens(corpus, {"{{EFFECTIVE_DATE}}": display_date})'
    );
  });
});
