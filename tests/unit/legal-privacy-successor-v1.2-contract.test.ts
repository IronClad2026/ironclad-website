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
      corpus: corpusAtPrivacyV12Publication(),
      release,
    });
    expect(release.documents).toHaveLength(1);
    expect(release.predecessorDocuments).toEqual([
      {
        effectiveDate: "2026-08-20",
        filename: "ironclad-terms-of-service-v1.1.pdf",
        kind: "terms",
        publicPath:
          "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
        sha256:
          "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
        version: "1.1",
      },
      {
        effectiveDate: "2026-08-20",
        filename: "ironclad-privacy-policy-v1.1.pdf",
        kind: "privacy",
        publicPath:
          "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
        sha256:
          "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
        version: "1.1",
      },
    ]);
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
        corpus: corpusAtPrivacyV12Publication(),
        release: invalid,
      })
    ).toThrow(/Final Privacy v1.2 release identity is invalid/i);

    expect(() =>
      validateFinalPrivacyRelease({
        activationDate,
        baseUrl: "https://preview.example.vercel.app",
        corpus: corpusAtPrivacyV12Publication(),
        release,
      })
    ).toThrow(/canonical Production origin/i);
  });

  it.each<[string, (invalid: typeof release) => void, RegExp]>([
    [
      "missing predecessor pair",
      (invalid: typeof release) => {
        invalid.predecessorDocuments = [];
      },
      /final one-document Privacy v1\.2 release/i,
    ],
    [
      "duplicate predecessor kind",
      (invalid: typeof release) => {
        invalid.predecessorDocuments[1] = structuredClone(
          invalid.predecessorDocuments[0]
        );
      },
      /predecessor identity/i,
    ],
    [
      "wrong predecessor hash",
      (invalid: typeof release) => {
        invalid.predecessorDocuments[1].sha256 = "f".repeat(64);
      },
      /privacy predecessor identity/i,
    ],
    [
      "wrong predecessor path",
      (invalid: typeof release) => {
        invalid.predecessorDocuments[0].publicPath =
          "/documents-rules-ppa/not-the-terms.pdf";
      },
      /terms predecessor identity/i,
    ],
  ])("fails closed for a %s", (_, mutate, expectedError) => {
    const invalid = structuredClone(release);
    mutate(invalid);

    expect(() =>
      validateFinalPrivacyRelease({
        activationDate,
        baseUrl: "https://www.ironcladtournaments.com",
        corpus: corpusAtPrivacyV12Publication(),
        release: invalid,
      })
    ).toThrow(expectedError);
  });
});
