import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRulebookPpaV31TransactionSql,
  validatePublicationOrigin,
  validateRulebookPpaV31Source,
} from "../../scripts/legal-successor/rulebook-ppa-v3.1-publication.mjs";

const root = process.cwd();
const corpus = JSON.parse(
  readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
);
const expectedArtifacts = new Map([
  [
    "ironclad-official-tournament-rulebook-v3.0.pdf",
    "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  ],
  [
    "ironclad-player-participation-agreement-v3.0.pdf",
    "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  ],
  [
    "ironclad-terms-of-service-v1.1.pdf",
    "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
  ],
  [
    "ironclad-privacy-policy-v1.2.pdf",
    "aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6",
  ],
  [
    "ironclad-official-tournament-rulebook-v3.1.pdf",
    "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2",
  ],
  [
    "ironclad-player-participation-agreement-v3.1.pdf",
    "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b",
  ],
]);

function hashPublishedArtifacts() {
  return new Map(
    [...expectedArtifacts].map(([filename]) => [
      filename,
      createHash("sha256")
        .update(
          readFileSync(
            join(root, "public", "documents-rules-ppa", filename)
          )
        )
        .digest("hex"),
    ])
  );
}

function runtimeDocument(kind: string) {
  const document = corpus.documents.find(
    (candidate: { kind: string }) => candidate.kind === kind
  );
  if (!document) {
    throw new Error(`Missing runtime document: ${kind}`);
  }
  return document;
}

describe("Rulebook v3.1 and PPA v3.1 publication source", () => {
  it("locks the exact current and successor artifact identities", () => {
    expect(hashPublishedArtifacts()).toEqual(expectedArtifacts);
    expect(
      validateRulebookPpaV31Source({
        artifactHashes: hashPublishedArtifacts(),
        corpus,
      })
    ).toMatchObject({
      activationDate: "2026-08-22",
      successors: [
        {
          filename: "ironclad-official-tournament-rulebook-v3.1.pdf",
          kind: "rulebook",
          publicPath:
            "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf",
          sha256:
            "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2",
          version: "3.1",
        },
        {
          filename: "ironclad-player-participation-agreement-v3.1.pdf",
          kind: "ppa",
          publicPath:
            "/documents-rules-ppa/ironclad-player-participation-agreement-v3.1.pdf",
          sha256:
            "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b",
          version: "3.1",
        },
      ],
    });
    expect(runtimeDocument("terms")).toMatchObject({
      effectiveDate: "2026-08-20",
      filename: "ironclad-terms-of-service-v1.1.pdf",
      status: "Effective",
      version: "1.1",
    });
    expect(runtimeDocument("privacy")).toMatchObject({
      effectiveDate: "2026-08-22",
      filename: "ironclad-privacy-policy-v1.2.pdf",
      status: "Effective",
      version: "1.2",
    });
  });

  it.each([
    ["successor version", "rulebook", "version", "3.2"],
    ["successor path", "ppa", "publicPath", "/documents-rules-ppa/wrong.pdf"],
    ["successor date", "rulebook", "effectiveDate", "2026-08-23"],
    ["unchanged Terms", "terms", "version", "1.2"],
    ["unchanged Privacy", "privacy", "version", "1.1"],
  ])("fails closed for a changed %s", (_label, kind, field, value) => {
    const changed = structuredClone(corpus);
    const document = changed.documents.find(
      (candidate: { kind: string }) => candidate.kind === kind
    );
    document[field] = value;

    expect(() =>
      validateRulebookPpaV31Source({
        artifactHashes: expectedArtifacts,
        corpus: changed,
      })
    ).toThrow(/runtime legal document identities/i);
  });

  it("fails closed for missing, additional, or altered artifact bytes", () => {
    const missing = new Map(expectedArtifacts);
    missing.delete("ironclad-player-participation-agreement-v3.0.pdf");
    expect(() =>
      validateRulebookPpaV31Source({ artifactHashes: missing, corpus })
    ).toThrow(/exactly six locked legal artifacts/i);

    const additional = new Map(expectedArtifacts);
    additional.set("unexpected.pdf", "0".repeat(64));
    expect(() =>
      validateRulebookPpaV31Source({ artifactHashes: additional, corpus })
    ).toThrow(/exactly six locked legal artifacts/i);

    const altered = new Map(expectedArtifacts);
    altered.set(
      "ironclad-official-tournament-rulebook-v3.1.pdf",
      "0".repeat(64)
    );
    expect(() =>
      validateRulebookPpaV31Source({ artifactHashes: altered, corpus })
    ).toThrow(/artifact hash mismatch/i);
  });
});

describe("Rulebook v3.1 and PPA v3.1 publication origin", () => {
  it("accepts only the canonical Production origin", () => {
    expect(
      validatePublicationOrigin({
        environment: "production",
        origin: "https://www.ironcladtournaments.com",
      })
    ).toBe("https://www.ironcladtournaments.com");
    expect(() =>
      validatePublicationOrigin({
        environment: "production",
        origin: "https://ironcladtournaments.com",
      })
    ).toThrow(/canonical IronClad origin/i);
    expect(() =>
      validatePublicationOrigin({
        environment: "production",
        origin: "https://www.ironcladtournaments.com/privacy",
      })
    ).toThrow(/exact HTTPS origin/i);
  });

  it.each(["preview", "staging"])(
    "accepts an exact immutable Vercel origin for %s",
    (environment) => {
      expect(
        validatePublicationOrigin({
          environment,
          origin: "https://ironclad-legal-v31-a1b2c3.vercel.app",
        })
      ).toBe("https://ironclad-legal-v31-a1b2c3.vercel.app");
      expect(() =>
        validatePublicationOrigin({
          environment,
          origin: "https://preview.example.com",
        })
      ).toThrow(/exact HTTPS Vercel origin/i);
      expect(() =>
        validatePublicationOrigin({
          environment,
          origin: "https://ironclad.vercel.app.example.com",
        })
      ).toThrow(/exact HTTPS Vercel origin/i);
    }
  );
});

describe("Rulebook v3.1 and PPA v3.1 database transaction", () => {
  it("is rollback-only by default and binds every change to exact locked IDs", () => {
    const sql = buildRulebookPpaV31TransactionSql({
      environment: "production",
      origin: "https://www.ironcladtournaments.com",
    });

    expect(sql.trimEnd()).toMatch(/rollback;$/);
    expect(sql).not.toContain("commit;");
    expect(sql).toContain("for update;");
    expect(sql).toContain("count(*) from public.legal_documents) <> 7");
    expect(sql).toContain("where status = 'effective') <> 4");
    expect(sql).toContain("where status = 'superseded') <> 3");
    expect(sql).toContain("select document.id into strict v_rulebook_id");
    expect(sql).toContain("select document.id into strict v_ppa_id");
    expect(sql).toContain("select document.id into strict v_terms_id");
    expect(sql).toContain("select document.id into strict v_privacy_id");
    expect(sql.match(/update public\.legal_documents/g)).toHaveLength(2);
    expect(sql).toContain("where id = v_rulebook_id");
    expect(sql).toContain("where id = v_ppa_id");
    expect(sql).toContain("where id = v_terms_id");
    expect(sql).toContain("where id = v_privacy_id");
    expect(sql).toContain("count(*) from public.legal_documents) <> 9");
    expect(sql).toContain("where status = 'superseded') <> 5");
    for (const [filename, hash] of expectedArtifacts) {
      expect(sql).toContain(filename);
      expect(sql).toContain(hash);
    }
  });

  it("preserves evidence and registration tables and leaves no default residue", () => {
    const sql = buildRulebookPpaV31TransactionSql({
      environment: "staging",
      origin: "https://ironclad-legal-v31-a1b2c3.vercel.app",
    });

    expect(sql).toContain(
      "into v_registration_acceptances, v_registration_acceptance_ids"
    );
    expect(sql).toContain(
      "into v_account_acceptances, v_account_acceptance_ids"
    );
    expect(sql).toContain(
      "select count(*) into v_registrations\n  from public.registrations;"
    );
    expect(sql).toContain(
      "count(*) from public.registration_acceptances) is distinct from v_registration_acceptances"
    );
    expect(sql).toContain(
      "count(*) from public.account_legal_acceptances) is distinct from v_account_acceptances"
    );
    expect(sql).toContain(
      "from public.registration_acceptances as acceptance) is distinct from v_registration_acceptance_ids"
    );
    expect(sql).toContain(
      "from public.account_legal_acceptances as acceptance) is distinct from v_account_acceptance_ids"
    );
    expect(sql).toContain(
      "count(*) from public.registrations) is distinct from v_registrations"
    );
    expect(sql).not.toMatch(/\bdelete\b|\btruncate\b/i);
    expect(sql).not.toMatch(
      /update\s+public\.(registration_acceptances|account_legal_acceptances|registrations)/i
    );
    expect(sql).toContain("document.immutable_url ~ '^https://[a-z0-9]");
    expect(sql).toContain(
      "\\.vercel\\.app/documents-rules-ppa/ironclad-terms-of-service-v1\\.1\\.pdf$'"
    );
    expect(sql).not.toContain(
      "https://ironclad-legal-v31-a1b2c3.vercel.app/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf"
    );
    expect(sql).toContain(
      "https://ironclad-legal-v31-a1b2c3.vercel.app/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf"
    );
    expect(sql.trimEnd()).toMatch(/rollback;$/);
  });

  it("commits only when the caller explicitly selects apply mode", () => {
    const sql = buildRulebookPpaV31TransactionSql({
      apply: true,
      environment: "production",
      origin: "https://www.ironcladtournaments.com",
    });

    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).not.toContain("rollback;");
  });
});
