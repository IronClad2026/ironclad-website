import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflightSql, SHA } from "./sql.mjs";
import { assessPreflight, compareHistory, comparePublishedLegal, compareActivation, canonicalManifestHash, digest } from "./gate.mjs";
import { checkSource } from "./source-check.mjs";
import { buildAtomicMigrationSql } from "../consolidated-db/package.mjs";
import { buildPostDeploymentSql } from "../consolidated-db/post-deployment.mjs";
import { buildProductionLegalSql } from "../consolidated-legal/publication.mjs";

// Intentionally no database, network, child-process, deployment or mutation API.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const mode = args.shift();
const options = {};
try {
  for (let index = 0; index < args.length; index += 2) {
    if (!/^--[a-z-]+$/.test(args[index]) || !args[index + 1] || args[index + 1].startsWith("--") || options[args[index]]) throw new Error("Malformed arguments.");
    options[args[index]] = args[index + 1];
  }
  const load = (name) => {
    if (!options[name] || statSync(options[name]).size > 1048576) throw new Error("Missing or oversized aggregate evidence.");
    return JSON.parse(readFileSync(options[name], "utf8").replace(/^\uFEFF/, ""));
  };
  const fileHash = (relative) => canonicalManifestHash(readFileSync(path.join(root, relative)));
  const bindings = () => ({ legalPublicationPlanSha256: fileHash(manifest.legalPublicationManifest), migrationPackageSha256: digest({ preDeploymentManifestSha256: fileHash(manifest.migrationManifest), postDeploymentManifestSha256: fileHash(manifest.postDeploymentManifest) }), postDeploymentManifestSha256: fileHash(manifest.postDeploymentManifest) });
  let result;
  if (mode === "sql") {
    if (Object.keys(options).some((key) => !["--candidate", "--target", "--tournaments", "--phase"].includes(key))) throw new Error("Unknown option.");
    process.stdout.write(preflightSql({ candidateSha: options["--candidate"], targetRef: options["--target"], tournamentIds: options["--tournaments"]?.split(","), phase: options["--phase"] }));
  } else if (["migration-sql", "legal-sql", "postdeployment-sql"].includes(mode) && Object.keys(options).sort().join() === "--candidate,--target") {
    if (!SHA.test(options["--candidate"]) || options["--target"] !== manifest.productionProjectRef) throw new Error("Exact candidate and explicit Production target required.");
    const source = mode === "migration-sql" ? buildAtomicMigrationSql() : mode === "legal-sql" ? buildProductionLegalSql({ projectRef: options["--target"], candidateSha: options["--candidate"] }) : buildPostDeploymentSql({ projectRef: options["--target"], candidateSha: options["--candidate"] });
    // Only construction: even a rehearsal of this DDL is forbidden on Production
    // until separately authorized. Final execution SQL uses documented builders.
    process.stdout.write(`-- PREPARATION ONLY: ${mode}; candidate ${options["--candidate"]}; target ${options["--target"]}.\n-- NO RELEASE AUTHORIZATION. Rehearse only on disposable synthetic databases.\n-- Default ROLLBACK; do not execute on Production even as a dry-run without authorization.\n${source.replace(/\bcommit;\s*$/i, "rollback;\n")}`);
  } else if (mode === "bindings" && Object.keys(options).join() === "--candidate" && SHA.test(options["--candidate"])) {
    result = { verdict: "PREPARATION_ONLY", candidateSha: options["--candidate"], productionProjectRef: manifest.productionProjectRef, ...bindings(), productionAuthorized: false, productionMutated: false };
  } else if (mode === "gate" && Object.keys(options).sort().join() === "--evidence,--snapshot") {
    const hashes = bindings();
    result = assessPreflight(load("--snapshot"), load("--evidence"), { ...manifest, resolvedLegalPlanSha256: hashes.legalPublicationPlanSha256, resolvedMigrationPackageSha256: hashes.migrationPackageSha256 });
  } else if (mode === "compare" && Object.keys(options).sort().join() === "--after,--before,--candidate") {
    result = compareHistory(load("--before"), load("--after"), options["--candidate"]);
  } else if (mode === "compare-legal" && Object.keys(options).sort().join() === "--after,--before,--candidate,--receipt") {
    const planHash = fileHash(manifest.legalPublicationManifest);
    result = comparePublishedLegal(load("--before"), load("--after"), options["--candidate"], load("--receipt"), Date.now(), planHash);
  } else if (mode === "compare-activation" && Object.keys(options).sort().join() === "--after,--before,--candidate,--receipt") {
    const postHash = fileHash(manifest.postDeploymentManifest);
    result = compareActivation(load("--before"), load("--after"), options["--candidate"], load("--receipt"), postHash);
  } else if (mode === "check-source" && Object.keys(options).length === 0) {
    result = checkSource(root);
  } else throw new Error("Unknown or incomplete offline command.");
  if (result) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = result.verdict === "STOP" ? 2 : 0; }
} catch {
  // Neither evidence contents nor filesystem/database error details are printed.
  process.stderr.write("STOP: invalid offline command or malformed aggregate evidence. No Production operation was performed.\n");
  process.exitCode = 2;
}
