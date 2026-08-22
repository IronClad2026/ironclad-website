import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyPrivacySuccessorDraft,
  assertCurrentRuntimeCorpus,
  assertCurrentRuntimeRelease,
  buildFinalPrivacyRelease,
  buildReviewCandidateManifest,
  finalizePrivacySuccessor,
  formatDateDisplay,
} from "../../scripts/legal-successor/finalize-privacy-v1.2.mjs";
import {
  buildPrivacyV12TransactionSql,
  validateFinalPrivacyRelease,
  validateReviewCandidate,
} from "../../scripts/legal-successor/privacy-document-successor-v1.2.mjs";

const root = process.cwd();
const currentCorpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const currentRelease = JSON.parse(
  readFileSync(join(root, "content", "legal-successor-release.json"), "utf8")
);
const reviewDraftBytes = readFileSync(
  join(root, "content", "legal-privacy-successor-v1.2.json")
);
const reviewDraft = JSON.parse(reviewDraftBytes.toString("utf8"));

describe("Privacy v1.2 review-draft preparation", () => {
  it("keeps the current runtime corpus and release pair at v1.1/v1.1", () => {
    expect(() => assertCurrentRuntimeCorpus(currentCorpus)).not.toThrow();
    expect(() => assertCurrentRuntimeRelease(currentRelease)).not.toThrow();

    expect(
      currentCorpus.documents.find(
        (document: { kind: string }) => document.kind === "terms"
      )
    ).toMatchObject({ status: "Effective", version: "1.1" });
    expect(
      currentCorpus.documents.find(
        (document: { kind: string }) => document.kind === "privacy"
      )
    ).toMatchObject({ status: "Effective", version: "1.1" });
    expect(
      currentRelease.documents.map(
        (document: { kind: string; version: string }) =>
          `${document.kind}:${document.version}`
      )
    ).toEqual(["terms:1.1", "privacy:1.1"]);
  });

  it("creates only a non-effective Privacy v1.2 staged corpus", () => {
    const staged = applyPrivacySuccessorDraft(currentCorpus, reviewDraft);
    const before = new Map(
      currentCorpus.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );
    const after = new Map(
      staged.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );

    expect(after.get("rulebook")).toEqual(before.get("rulebook"));
    expect(after.get("ppa")).toEqual(before.get("ppa"));
    expect(after.get("terms")).toEqual(before.get("terms"));
    expect(after.get("privacy")).toMatchObject({
      effectiveDate: null,
      filename: "ironclad-privacy-policy-v1.2.pdf",
      publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf",
      status: "Review Draft",
      version: "1.2",
    });
    expect(staged.effectiveDate).toBe(currentCorpus.effectiveDate);
    expect(staged.effectiveDateDisplay).toBe(currentCorpus.effectiveDateDisplay);
  });

  it("adds the minimum Web Push and badge disclosures", () => {
    const staged = applyPrivacySuccessorDraft(currentCorpus, reviewDraft);
    const privacy = JSON.stringify(
      staged.documents.find(
        (document: { kind: string }) => document.kind === "privacy"
      )
    );

    expect(privacy).toContain("Web Push subscription endpoint");
    expect(privacy).toContain(
      "p256dh and auth cryptographic subscription key material"
    );
    expect(privacy).toContain("treated as potentially personal information");
    expect(privacy).toContain(
      "does not request notification permission automatically"
    );
    expect(privacy).toContain("One Account may have multiple subscriptions");
    expect(privacy).toContain("authoritative unread in-app notification count");
    expect(privacy).toContain("exact number, a dot or no badge");
    expect(privacy).toContain("HTTP 404 or 410");
    expect(privacy).toContain("completed Account closure");
    expect(privacy).toContain(
      "Refusing or disabling Push does not remove ordinary in-app notifications"
    );
    expect(privacy).toContain(
      "does not collect a device fingerprint, IP address, arbitrary user-agent string, browser history or device name merely to operate Push"
    );
  });

  it("fails closed when the predecessor anchor or successor identity drifts", () => {
    const wrongIdentity = structuredClone(reviewDraft);
    wrongIdentity.documents[0].filename = "unapproved.pdf";
    expect(() =>
      applyPrivacySuccessorDraft(currentCorpus, wrongIdentity)
    ).toThrow(/filename is invalid/i);

    const wrongAnchor = structuredClone(reviewDraft);
    wrongAnchor.documents[0].operations[0].expected = "missing anchor";
    expect(() =>
      applyPrivacySuccessorDraft(currentCorpus, wrongAnchor)
    ).toThrow(/Expected one paragraph match/i);

    const wrongRuntime = structuredClone(currentCorpus);
    wrongRuntime.documents.find(
      (document: { kind: string }) => document.kind === "privacy"
    ).version = "1.0";
    expect(() => assertCurrentRuntimeCorpus(wrongRuntime)).toThrow(
      /Expected current Effective privacy v1.1/i
    );

    const wrongRelease = structuredClone(currentRelease);
    wrongRelease.documents.find(
      (document: { kind: string }) => document.kind === "privacy"
    ).sha256 = "0".repeat(64);
    expect(() => assertCurrentRuntimeRelease(wrongRelease)).toThrow(
      /Expected finalized runtime privacy v1.1/i
    );
  });

  it("builds a deterministic, explicitly unactivated candidate manifest", () => {
    const pdfBytes = Buffer.from("%PDF-1.4\nreview candidate\n");
    const first = buildReviewCandidateManifest({
      pdfBytes,
      sourceBytes: reviewDraftBytes,
    });
    const second = buildReviewCandidateManifest({
      pdfBytes,
      sourceBytes: reviewDraftBytes,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      effectiveDate: null,
      effectiveDateDisplay: "TBD",
      runtimeActivated: false,
      status: "Review Draft - Not Effective",
      preparedAgainstRuntime: {
        privacyVersion: "1.1",
        termsVersion: "1.1",
      },
      document: { kind: "privacy", version: "1.2" },
    });
    expect(JSON.stringify(first)).not.toMatch(/generatedAt|preparedAt|20\d{2}-\d{2}-\d{2}/);
  });

  it("validates the review candidate without activating runtime state", () => {
    const candidate = buildReviewCandidateManifest({
      pdfBytes: Buffer.from("%PDF-1.4\nreview candidate\n"),
      sourceBytes: reviewDraftBytes,
    });
    expect(
      validateReviewCandidate(candidate, currentCorpus, currentRelease)
    ).toMatchObject({ kind: "privacy", version: "1.2" });

    const falselyActive = structuredClone(candidate);
    falselyActive.runtimeActivated = true;
    expect(() =>
      validateReviewCandidate(falselyActive, currentCorpus, currentRelease)
    ).toThrow(/review candidate is invalid/i);
  });

  it("prepares rollback-by-default SQL for a future owner-authorized publication", () => {
    const common = {
      activationDate: "2026-09-15",
      immutableUrl:
        "https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf",
      sha256: "c".repeat(64),
    };
    const rollbackSql = buildPrivacyV12TransactionSql(common);
    const applySql = buildPrivacyV12TransactionSql({ ...common, apply: true });

    expect(rollbackSql).toContain("rollback;");
    expect(rollbackSql).toContain("ironclad:privacy-document-successor-v1.2");
    expect(rollbackSql).toContain("current Australia/Sydney date");
    expect(rollbackSql).toContain("document_kind = 'privacy'");
    expect(rollbackSql).toContain("version = '1.1'");
    expect(rollbackSql).toContain("'privacy',\n    '1.2'");
    expect(rollbackSql).toContain("account_legal_acceptances");
    expect(rollbackSql).toContain("registration_acceptances");
    expect(applySql).toContain("commit;");
    expect(applySql).not.toContain("rollback;");

    expect(() =>
      buildPrivacyV12TransactionSql({
        ...common,
        immutableUrl: `${common.immutableUrl}?draft=1`,
      })
    ).toThrow(/canonical immutable Production URL/i);
  });

  it("requires an actually dated final release before future activation", () => {
    const staged = applyPrivacySuccessorDraft(currentCorpus, reviewDraft);
    expect(() =>
      validateFinalPrivacyRelease({
        activationDate: "2026-09-15",
        baseUrl: "https://www.ironcladtournaments.com",
        corpus: staged,
        release: {
          status: "Review Draft - Not Effective",
          documents: [],
        },
      })
    ).toThrow(/Finalized Privacy v1.2 is invalid/i);
  });

  it("finalizes only Privacy v1.2 for an explicit publication date", () => {
    const activationDate = "2026-08-22";
    const finalized = finalizePrivacySuccessor(
      currentCorpus,
      reviewDraft,
      activationDate
    );
    const before = new Map(
      currentCorpus.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );
    const after = new Map(
      finalized.documents.map((document: { kind: string }) => [
        document.kind,
        document,
      ])
    );

    expect(after.get("rulebook")).toEqual(before.get("rulebook"));
    expect(after.get("ppa")).toEqual(before.get("ppa"));
    expect(after.get("terms")).toEqual(before.get("terms"));
    expect(after.get("privacy")).toMatchObject({
      effectiveDate: activationDate,
      filename: "ironclad-privacy-policy-v1.2.pdf",
      status: "Effective",
      version: "1.2",
    });
    expect(finalized).toMatchObject({
      effectiveDate: activationDate,
      effectiveDateDisplay: formatDateDisplay(activationDate),
    });

    const release = buildFinalPrivacyRelease({
      activationDate,
      pdfBytes: Buffer.from("%PDF-1.4\nfinal privacy\n"),
    });
    expect(
      validateFinalPrivacyRelease({
        activationDate,
        baseUrl: "https://www.ironcladtournaments.com",
        corpus: finalized,
        release,
      })
    ).toMatchObject({ activationDate, release: release.documents[0] });
    expect(release.documents).toHaveLength(1);
    expect(release.documents[0]).toMatchObject({
      kind: "privacy",
      version: "1.2",
    });
  });

  it("keeps the effective v1.1 PDF generator path backward-compatible", () => {
    const source = readFileSync(
      join(root, "scripts", "generate-legal-pdfs.py"),
      "utf8"
    );

    expect(source).toContain("--review-draft");
    expect(source).toContain('selected_kinds != ("privacy",)');
    expect(source).toContain("REVIEW DRAFT - NOT EFFECTIVE");
    expect(source).toContain("Effective date: TBD");
    expect(source).toContain(
      'corpus["documents"] = [resolve_document_tokens(document) for document in documents]'
    );
    expect(source).toContain(
      '{"{{EFFECTIVE_DATE}}": format_date(effective_date)}'
    );
    expect(source).toContain('format_date(document["effectiveDate"])');
  });
});
