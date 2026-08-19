import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "tests/database/account-legal-acceptance-v1.1.sql"
  ),
  "utf8"
).toLowerCase();

describe("account legal acceptance executable database contract", () => {
  it("is fixed to Staging, rollback-only, and proves zero residue", () => {
    expect(sql).toContain("'target', 'ironclad-staging'");
    expect(sql).toContain("raise exception 'account legal contract rollback'");
    expect(sql).toContain("rollback did not restore the staging baseline");
    expect(sql).not.toContain("commit;");
    expect(sql).toContain("'rollback_only', true");
    expect(sql).toContain("'zero_residue'");
  });

  it("executes the authorization, exact-pair, idempotence, and immutability cases", () => {
    expect(sql).toContain("set request.jwt.claim.role = 'service_role'");
    expect(sql).toContain("'request.jwt.claim.role', 'authenticated'");
    expect(sql).toContain("has_function_privilege");
    expect(sql).toContain("v_first.acceptance_id = v_retry.acceptance_id");
    expect(sql).toContain("an untrusted wrong document selector was accepted");
    expect(sql).toContain("evidence update was not blocked");
    expect(sql).toContain("ordinary evidence deletion was not blocked");
    expect(sql).toContain("ironclad.legal_evidence_maintenance");
  });
});
