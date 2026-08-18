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
    expect(script).toContain("effective_at");
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
});
