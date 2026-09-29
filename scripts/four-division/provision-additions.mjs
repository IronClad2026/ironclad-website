// Task-scoped extension of the permanent fixture CLI. Default is read-only.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_FIXTURES, loadFixtureEnvironment, validateRuntimeGuards,
  assertClerkDevelopmentInstance, executeFixtureCommand, parseArgs,
} from "../lib/staging-synthetic-uat.mjs";

const source = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const aliases = ["TestMain11", "TestMain12", "TestMain13", "TestMain14", "TestPro1", "TestPro2", "TestPro3", "TestPro4"];
const existingAliases = Object.keys(APPROVED_FIXTURES).slice(0, 30);
const key = (alias, suffix) => `STAGING_SYNTHETIC_UAT_${alias.toUpperCase()}_${suffix}`;
try {
  assert(process.argv.length <= 3 && (!process.argv[2] || ["--check", "--apply"].includes(process.argv[2])));
  const env = await loadFixtureEnvironment({ rootDir: source, processEnv: {} });
  const existing = existingAliases.map((alias) => validateRuntimeGuards(env, alias));
  const missing = aliases.filter((alias) => !env[key(alias, "EMAIL")] && !env[key(alias, "PASSWORD")]);
  for (const alias of aliases.filter((candidate) => !missing.includes(candidate))) validateRuntimeGuards(env, alias);
  if (process.argv[2] !== "--apply") {
    console.log(JSON.stringify({ status: "plan", approvedAdditions: aliases, existingCredentialsValidated: existing.length, newCredentialPairsRequired: missing.length, remoteWrites: 0 }));
  } else {
    await assertClerkDevelopmentInstance(existing[0]);
    const seed = env[key("TestMain1", "EMAIL")];
    assert(/testmain1/i.test(seed), "approved_email_pattern_rejected");
    const lines = [];
    for (const alias of missing) {
      env[key(alias, "EMAIL")] = seed.replace(/testmain1/ig, alias.toLowerCase());
      env[key(alias, "PASSWORD")] = `IronClad-${randomBytes(24).toString("base64url")}`;
      validateRuntimeGuards(env, alias);
      lines.push(`${key(alias, "EMAIL")}=${env[key(alias, "EMAIL")]}`, `${key(alias, "PASSWORD")}=${env[key(alias, "PASSWORD")]}`);
    }
    assert.equal(new Set(Object.keys(APPROVED_FIXTURES).map((alias) => env[key(alias, "EMAIL")].toLowerCase())).size, 38);
    if (lines.length) await appendFile(resolve(source, ".env.staging-uat.local"), `\n# Approved four-division permanent fixture additions\n${lines.join("\n")}\n`, "utf8");
    const persisted = await loadFixtureEnvironment({ rootDir: source, processEnv: {} });
    for (const config of existing) {
      assert.equal(persisted[key(config.fixture.alias, "EMAIL")], config.email);
      assert.equal(persisted[key(config.fixture.alias, "PASSWORD")], config.password);
    }
    const results = [];
    for (const alias of aliases) {
      const result = await executeFixtureCommand(parseArgs(["provision", "--alias", alias]), { env: persisted, rootDir: root });
      results.push(result);
      console.log(JSON.stringify({ alias, status: result.status, loginVerified: result.passwordVerified, profilePrivate: result.profilePrivate }));
    }
    const evidence = { timestamp: new Date().toISOString(), approvedAdditions: aliases, results, originalCredentialPairsPreserved: 30, newCredentialPairsStored: missing.length, credentialsIncluded: false, productionTouched: false };
    await mkdir(resolve(root, "test-results/four-division"), { recursive: true });
    await writeFile(resolve(root, "test-results/four-division/provision-additions-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({ status: "provisioned", count: results.length, newClerkAccounts: results.filter((r) => r.clerkUserCreated).length, oldCredentialsPreserved: true }));
  }
} catch {
  console.error(JSON.stringify({ status: "approved_fixture_additions_failed", credentialsIncluded: false }));
  process.exitCode = 1;
}
