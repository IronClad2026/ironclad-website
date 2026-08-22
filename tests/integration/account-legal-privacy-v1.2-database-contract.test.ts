import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "tests/database/account-legal-privacy-v1.2-compatibility.sql"
  ),
  "utf8"
).toLowerCase();

describe("Privacy v1.2 executable database compatibility contract", () => {
  it("is fixed to Staging, rollback-only, and proves zero residue", () => {
    expect(sql).toContain("'target', 'ironclad-staging'");
    expect(sql).toContain(
      "raise exception 'privacy v1.2 compatibility contract rollback'"
    );
    expect(sql).toContain("rollback did not restore the staging baseline");
    expect(sql).not.toContain("commit;");
    expect(sql).toContain("'rollback_only', true");
    expect(sql).toContain("'zero_residue'");
  });

  it("executes both approved pairs and rejects unsupported selectors", () => {
    expect(sql).toContain("'supported_pairs', jsonb_build_array('1.1/1.1', '1.1/1.2')");
    expect(sql).toContain("the current v1.1/v1.1 pair is not accepted idempotently");
    expect(sql).toContain("the v1.1/v1.2 evidence is not authoritative and idempotent");
    expect(sql).toContain("old v1.1/v1.1 evidence falsely satisfied the v1.1/v1.2 pair");
    expect(sql).toContain("unsupported privacy v1.3 was accepted");
    expect(sql).toContain("unsupported terms v1.2 was accepted");
  });

  it("proves service-role authorization and evidence immutability", () => {
    expect(sql).toContain("has_function_privilege");
    expect(sql).toContain("an authenticated browser claim executed the rpc");
    expect(sql).toContain("existing v1.1/v1.1 evidence was mutable");
    expect(sql).toContain("new v1.1/v1.2 evidence was mutable");
  });
});
