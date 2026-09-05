import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "tests/database/account-legal-future-gate-stability.sql"
  ),
  "utf8"
).toLowerCase();

describe("future-stable account legal executable database contract", () => {
  it("requires verified Staging or guarded loopback identity and is rollback-only", () => {
    expect(sql).toContain(
      "current_setting('ironclad.target_project_ref', true)"
    );
    expect(sql).toContain("is distinct from 'zzbnneprhjicmajpjkdg'");
    expect(sql).toContain("'isolated-local' else 'ironclad-staging'");
    expect(sql).toContain("inet_server_addr()");
    expect(sql).toContain("'127.0.0.1'::inet");
    expect(sql).toContain("inet_server_port() = 55462");
    expect(sql).toContain("'^ironclad_legal_[a-z0-9_]+$'");
    expect(sql).toContain("raise exception 'future legal gate contract rollback'");
    expect(sql).not.toContain("commit;");
    expect(sql).toContain("'rollback_only', true");
    expect(sql).toContain("'zero_residue'");
  });

  it("fingerprints the complete register and evidence baseline", () => {
    expect(sql).toContain("legal_document_count");
    expect(sql).toContain("acceptance_count");
    expect(sql).toContain("legal_document_fingerprint");
    expect(sql).toContain("acceptance_fingerprint");
    expect(sql).toContain("string_agg(to_jsonb(document)::text");
    expect(sql).toContain("string_agg(to_jsonb(acceptance)::text");
    expect(sql).toContain("rollback did not restore the exact staging baseline");
  });

  it("proves drafts are inert and future-effective documents fail closed", () => {
    expect(sql).toContain("'review_draft'");
    expect(sql).toContain("non-effective future drafts changed the current gate");
    expect(sql).toContain("clock_timestamp() + interval '1 day'");
    expect(sql).toContain(
      "future-effective documents were accepted before their effective time"
    );
    expect(sql).toContain("future-effective boundary rollback");
  });

  it("accepts unfamiliar current versions while rejecting untrusted selectors", () => {
    expect(sql).toContain("'future-terms-77.13'");
    expect(sql).toContain("'future-privacy-88.21'");
    expect(sql).toContain(
      "unfamiliar current versions did not produce exact immutable evidence"
    );
    expect(sql).toContain(
      "old evidence falsely satisfied the unfamiliar current pair"
    );
    expect(sql).toContain(
      "a stale, mixed, or wrong document selector was accepted"
    );
  });

  it("proves authorization, validation, idempotence, and immutability", () => {
    expect(sql).toContain("rpc execution is not service-role-only");
    expect(sql).toContain("the current exact pair is not authoritative and idempotent");
    expect(sql).toContain("invalid identity or acceptance controls were accepted");
    expect(sql).toContain("an authenticated browser claim executed the rpc");
    expect(sql).toContain("predecessor evidence was mutable");
    expect(sql).toContain("successor evidence was mutable");
    expect(sql).toContain("successor evidence was deletable");
  });
});
