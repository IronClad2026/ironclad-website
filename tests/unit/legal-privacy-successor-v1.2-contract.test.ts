import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatDateDisplay } from "../../scripts/legal-successor/finalize-privacy-v1.2.mjs";
import {
  buildPrivacyV12TransactionSql,
  validateFinalPrivacyRelease,
} from "../../scripts/legal-successor/privacy-document-successor-v1.2.mjs";

const root = process.cwd();
const activationDate = "2026-08-22";
const corpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const release = JSON.parse(
  readFileSync(join(root, "content", "legal-successor-release.json"), "utf8")
);
const source = JSON.parse(
  readFileSync(
    join(root, "content", "legal-privacy-successor-v1.2.json"),
    "utf8"
  )
);
const pdfBytes = readFileSync(
  join(
    root,
    "public",
    "documents-rules-ppa",
    "ironclad-privacy-policy-v1.2.pdf"
  )
);

describe("final Privacy v1.2 publication contract", () => {
  it("publishes only Privacy v1.2 on the actual Sydney release date", () => {
    expect(corpus).toMatchObject({
      effectiveDate: activationDate,
      effectiveDateDisplay: formatDateDisplay(activationDate),
    });
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
        effectiveDate: "2026-08-18",
        kind: "rulebook",
        status: "Effective",
        version: "3.0",
      },
      {
        effectiveDate: "2026-08-18",
        kind: "ppa",
        status: "Effective",
        version: "3.0",
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

  it("retains the reviewed source and every approved Web Push disclosure", () => {
    expect(source).toMatchObject({
      effectiveDateToken: "{{PRODUCTION_EFFECTIVE_DATE}}",
      status: "Review Draft",
    });
    const privacy = JSON.stringify(
      corpus.documents.find(
        (document: { kind: string }) => document.kind === "privacy"
      )
    );
    for (const disclosure of [
      "Web Push subscription endpoint",
      "p256dh and auth cryptographic subscription key material",
      "treated as potentially personal information",
      "does not request notification permission automatically",
      "One Account may have multiple subscriptions",
      "authoritative unread in-app notification count",
      "exact number, a dot or no badge",
      "HTTP 404 or 410",
      "completed Account closure",
      "Refusing or disabling Push does not remove ordinary in-app notifications",
    ]) {
      expect(privacy).toContain(disclosure);
    }
  });

  it("binds the one-document release manifest to the immutable PDF", () => {
    const validated = validateFinalPrivacyRelease({
      activationDate,
      baseUrl: "https://www.ironcladtournaments.com",
      corpus,
      release,
    });
    expect(release.documents).toHaveLength(1);
    expect(validated.release).toMatchObject({
      effectiveDate: activationDate,
      kind: "privacy",
      version: "1.2",
    });
    expect(createHash("sha256").update(pdfBytes).digest("hex")).toBe(
      validated.release.sha256
    );
  });

  it("keeps activation SQL rollback-only unless apply is explicit", () => {
    const common = {
      activationDate,
      immutableUrl:
        "https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf",
      sha256: release.documents[0].sha256,
    };
    const rollbackSql = buildPrivacyV12TransactionSql(common);
    const applySql = buildPrivacyV12TransactionSql({ ...common, apply: true });

    expect(rollbackSql).toContain("rollback;");
    expect(rollbackSql).toContain("current Australia/Sydney date");
    expect(rollbackSql).toContain("account_legal_acceptances");
    expect(applySql).toContain("commit;");
    expect(applySql).not.toContain("rollback;");
  });

  it("fails closed for an unsupported release identity or origin", () => {
    const invalid = structuredClone(release);
    invalid.documents[0].version = "1.3";
    expect(() =>
      validateFinalPrivacyRelease({
        activationDate,
        baseUrl: "https://www.ironcladtournaments.com",
        corpus,
        release: invalid,
      })
    ).toThrow(/Final Privacy v1.2 release identity is invalid/i);

    expect(() =>
      validateFinalPrivacyRelease({
        activationDate,
        baseUrl: "https://preview.example.vercel.app",
        corpus,
        release,
      })
    ).toThrow(/canonical Production origin/i);
  });
});
