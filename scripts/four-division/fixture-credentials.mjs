// Private user-requested artifact only. Reads approved credentials in memory;
// never copies environment files, provisions accounts, or prints credentials.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APPROVED_FIXTURES, FUTURE_FIXTURE_POOLS, PREPARED_REGISTRATION_IDENTITIES,
  getFixtureDivision, loadFixtureEnvironment, validateRuntimeGuards, verifyFixtureLogins,
} from "../lib/staging-synthetic-uat.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const approvedEnvironmentDirectory = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const relativeOutput = "test-results/four-division/private-permanent-staging-fixtures.txt";

export function renderPrivateFixtureCredentials(configs) {
  const aliases = Object.keys(APPROVED_FIXTURES);
  if (configs.length !== 38 || configs.some((config, index) =>
    config.fixture.alias !== aliases[index] || !config.email || !config.password ||
    /[\r\n\0]/.test(config.email) || /[\r\n\0]/.test(config.password)
  )) throw new Error("credential_export_contract_rejected");
  const lines = [
    "PRIVATE — Permanent IronClad Staging synthetic player credentials",
    "Approved Clerk Development instance only. Synthetic identities do not prove Steam ownership or live Relic results.",
    "Staging: https://ironclad-website-git-staging-ironclad-tournaments.vercel.app",
    "Original fixture ELO and identity provenance remain unchanged. Normal registration eligibility uses the target tournament model.",
    "",
  ];
  for (const config of configs) {
    const { alias, syntheticElo, syntheticDivision } = config.fixture;
    const prepared = PREPARED_REGISTRATION_IDENTITIES[alias];
    lines.push(`Alias: ${alias}`, `Email: ${config.email}`, `Password: ${config.password}`,
      `Original synthetic ELO: ${syntheticElo}`, `Identity division: ${syntheticDivision}`,
      `Future division: ${getFixtureDivision(alias)}`,
      ...(prepared ? [`Normal browser registration ELO: ${prepared.elo}`] : []), "");
  }
  lines.push(`Future Main pool: ${FUTURE_FIXTURE_POOLS.main.join(", ")}`,
    `Future Pro pool: ${FUTURE_FIXTURE_POOLS.pro.join(", ")}`, "");
  return lines.join("\n");
}

export async function writeVerifiedFixtureCredentials({ write = false } = {}) {
  const env = await loadFixtureEnvironment({ rootDir: approvedEnvironmentDirectory, processEnv: {} });
  const aliases = Object.keys(APPROVED_FIXTURES);
  const configs = aliases.map((alias) => validateRuntimeGuards(env, alias));
  if (!write) return { status: "validated", fixtureCount: configs.length, artifactWritten: false };
  const results = await verifyFixtureLogins({ aliases, env, rootDir: root });
  if (results.length !== 38 || results.some((result) => result.loginVerified !== true)) {
    throw new Error("credential_verification_incomplete");
  }
  execFileSync("git", ["check-ignore", "--quiet", "--", relativeOutput], {
    cwd: root, windowsHide: true, stdio: "ignore",
  });
  const destination = resolve(root, relativeOutput);
  const content = renderPrivateFixtureCredentials(configs);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(destination, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST" || await readFile(destination, "utf8") !== content) {
      throw new Error("credential_artifact_write_rejected");
    }
  }
  return { status: "verified", fixtureCount: 38, loginVerified: 38, artifactWritten: true, path: destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && !["--check", "--write"].includes(process.argv[2]))) {
      throw new Error("arguments_rejected");
    }
    console.log(JSON.stringify(await writeVerifiedFixtureCredentials({ write: process.argv[2] === "--write" })));
  } catch {
    // Deliberately do not reflect any input, provider response, or exception.
    console.error(JSON.stringify({ status: "private_credential_export_failed", artifactWritten: false }));
    process.exitCode = 1;
  }
}
