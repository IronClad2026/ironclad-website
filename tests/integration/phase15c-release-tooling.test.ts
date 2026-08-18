import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Phase 15C release-tooling target gates", () => {
  it.each([
    "scripts/phase15c/legal-document-register.mjs",
    "scripts/phase15c/run-staging-registration-contract.mjs",
  ])("matches the Supabase project ref against the CLI project id in %s", (path) => {
    const script = source(path);

    expect(script).toMatch(/project\.id === (?:target|STAGING)\.ref/);
    expect(script).not.toMatch(/project\.ref === (?:target|STAGING)\.ref/);
  });

  it("keeps the Staging acceptance wrapper target-fixed", () => {
    const script = source(
      "scripts/phase15c/run-staging-registration-contract.mjs"
    );

    expect(script).toContain('name: "ironclad-staging"');
    expect(script).toContain('ref: "zzbnneprhjicmajpjkdg"');
    expect(script).not.toMatch(/--target|ironclad-v2|nsyjtqpvyxlzyujlbzos/);
    expect(script).toContain("--activation-date");
    expect(script).toContain("--registered-head");
    expect(script).toContain("effective_at");
  });

  it("limits a distinct registered Staging head to reviewed tooling-only recovery", () => {
    const script = source(
      "scripts/phase15c/run-staging-registration-contract.mjs"
    );

    expect(script).toContain("REGISTERED_HEAD_TOOLING_PATHS");
    expect(script).toContain('"merge-base"');
    expect(script).toContain('"--is-ancestor"');
    expect(script).toContain('"diff"');
    expect(script).toContain('"--name-only"');
    expect(script).toContain(
      '"scripts/phase15c/run-staging-registration-contract.mjs"'
    );
    expect(script).toContain(
      '"tests/integration/phase15c-release-tooling.test.ts"'
    );
    expect(script).toContain(
      '"tests/database/phase15c-final-legal-registration.sql"'
    );
    expect(script).toContain('"docs/phase15c-publication-runbook.md"');
  });

  it("requires clean exact-head state and canonical date parity in both wrappers", () => {
    for (const path of [
      "scripts/phase15c/legal-document-register.mjs",
      "scripts/phase15c/run-staging-registration-contract.mjs",
    ]) {
      const script = source(path);
      expect(script).toContain("assertCleanGitWorktree(runCommand)");
      expect(script).toContain("validateCanonicalReleaseCorpus(");
      expect(script).toContain("assertPdfEffectiveDate(");
    }
  });

  it("does not silently omit PostgreSQL PUBLIC grants from the schema audit", () => {
    const audit = source("scripts/phase15c/audit-phase15a-schema.sql");

    expect(audit.match(/left join pg_roles as grantee/g)).toHaveLength(2);
    expect(audit.match(/acl\.grantee = 0/g)?.length).toBeGreaterThanOrEqual(4);
    expect(audit).toContain("then 'PUBLIC'");
  });

  it("binds Production activation to fetched origin/master and one stable deployment", () => {
    const script = source("scripts/phase15c/legal-document-register.mjs");

    expect(script).toContain('runCommand("git", ["fetch", "--quiet", "origin", "master"])');
    expect(script).toContain('"refs/remotes/origin/master"');
    expect(script).toContain("assertProductionExpectedHead(options.expectedHead)");
    expect(script.match(/assertSameDeployment\(/g)).toHaveLength(3);
    expect(script).toContain('"immediately before database activation"');
    expect(script).toContain('"after database activation postflight"');
  });

  it("exercises version, URL, and SHA-256 tamper rejection independently", () => {
    const contract = source(
      "tests/database/phase15c-final-legal-registration.sql"
    );

    expect(contract).toContain("for v_tamper_index in 1..array_length");
    expect(contract).toContain("when v_tamper_index = 1 then v_rulebook.version");
    expect(contract).toContain("when v_tamper_index = 2 then v_ppa.immutable_url");
    expect(contract).toContain("when v_tamper_index = 3 and v_terms.sha256");
    expect(contract).toContain("when 1 then 'version'");
    expect(contract).toContain("when 2 then 'URL'");
    expect(contract).toContain("when 3 then 'SHA-256'");
  });

  it("proves rollback residue with independent before-and-after queries", () => {
    const script = source(
      "scripts/phase15c/run-staging-registration-contract.mjs"
    );
    const contract = source(
      "tests/database/phase15c-final-legal-registration.sql"
    );

    expect(script).toContain("buildResidueAuditSql()");
    expect(script).toContain("baselineResidue");
    expect(script).toContain("postflightResidue");
    expect(script).toContain(
      "assertSameResidueAudit(baselineResidue, postflightResidue)"
    );
    expect(script).toContain("FIXTURE_RESIDUE_KEYS");
    expect(script).toContain("assertRollbackOnlyContract(contractSql)");
    const executableLines = contract
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("--"));
    const transactionStatements = contract
      .match(
        /^[ \t]*(?:begin|rollback|commit(?:[ \t]+(?:work|transaction))?)[ \t]*;[ \t]*$/gimu
      )
      ?.map((line) => line.trim().toLowerCase());
    expect(executableLines[0]).toBe("begin;");
    expect(transactionStatements).toEqual(["begin;", "rollback;"]);
    expect(contract).toContain("set local role postgres;");
    expect(contract).toContain("set local request.jwt.claim.role");
    expect(contract).toContain("set local request.jwt.claims");
    expect(contract).toMatch(
      /rollback;\s*select\s+jsonb_build_object\([\s\S]*\)\s+as\s+phase15c_contract_result;\s*$/iu
    );
    expect(contract).not.toMatch(/^[ \t]*(?:savepoint|rollback[ \t]+to)\b/imu);
    expect(contract).not.toContain("pg_temp.phase15c_contract_baseline");
  });

  it("hashes protected Preview PDFs through the exact inspected deployment", () => {
    const script = source("scripts/phase15c/legal-document-register.mjs");

    expect(script).toContain('options.target === "staging"');
    expect(script).toContain("? runVercelBytes([");
    expect(script).toContain('"--deployment",');
    expect(script).toContain("deployment.id");
    expect(script).toContain('"--fail"');
    expect(script).toContain('response.headers.get("content-type")');
  });

  it("hashes protected Staging-contract PDFs through the registered deployment", () => {
    const script = source(
      "scripts/phase15c/run-staging-registration-contract.mjs"
    );

    expect(script).toContain("runVercelBytes([");
    expect(script).toContain('"--deployment",');
    expect(script).toContain("deployment.id");
    expect(script).toContain('"--fail"');
    expect(script).toContain(
      "verifyVercelDeployment(baseUrl, registeredHead)"
    );
  });
});
