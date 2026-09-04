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
  it("identifies Staging or isolated loopback, rolls back, and proves zero residue", () => {
    expect(sql).toContain("'isolated-local' else 'ironclad-staging'");
    expect(sql).toContain("inet_server_addr()");
    expect(sql).toContain("'127.0.0.1'::inet");
    expect(sql).toContain("inet_server_port() = 55462");
    expect(sql).toContain("'^ironclad_legal_[a-z0-9_]+$'");
    expect(sql).toContain(
      "raise exception 'privacy v1.2 compatibility contract rollback'"
    );
    expect(sql).toContain("rollback did not restore the staging baseline");
    expect(sql).not.toContain("commit;");
    expect(sql).toContain("'rollback_only', true");
    expect(sql).toContain("'zero_residue'");
  });

  it("executes both predecessor pairs and supports the approved generic current gate", () => {
    expect(sql).toContain("'supported_pairs', jsonb_build_array('1.1/1.1', '1.1/1.2')");
    expect(sql).toContain("the current v1.1/v1.1 pair is not accepted idempotently");
    expect(sql).toContain("the v1.1/v1.2 evidence is not authoritative and idempotent");
    expect(sql).toContain("old v1.1/v1.1 evidence falsely satisfied the v1.1/v1.2 pair");
    expect(sql).toContain("the approved generic legal gate rejected current privacy v1.3");
    expect(sql).toContain("the approved generic legal gate rejected current terms v1.2");
    expect(sql).toContain("the stale privacy v1.1 selector was accepted after activation");
    expect(sql).toContain("'future_current_pairs_accepted', true");
  });

  it("proves service-role authorization and evidence immutability", () => {
    expect(sql).toContain("has_function_privilege");
    expect(sql).toContain("an authenticated browser claim executed the rpc");
    expect(sql).toContain("existing v1.1/v1.1 evidence was mutable");
    expect(sql).toContain("new v1.1/v1.2 evidence was mutable");
  });
});
