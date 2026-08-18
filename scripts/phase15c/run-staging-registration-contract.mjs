#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertCleanGitWorktree,
  assertPdfEffectiveDate,
  getSydneyDate,
  validateCanonicalReleaseCorpus,
} from "./release-artifact-contract.mjs";

const SUPABASE_CLI_VERSION = "2.114.0";
const VERCEL_CLI_VERSION = "59.1.4";
const VERCEL_SCOPE = "ironclad-tournaments";
const STAGING = Object.freeze({
  name: "ironclad-staging",
  ref: "zzbnneprhjicmajpjkdg",
});
const REGISTERED_HEAD_TOOLING_PATHS = new Set([
  "docs/phase15c-publication-runbook.md",
  "scripts/phase15c/run-staging-registration-contract.mjs",
  "tests/database/phase15c-final-legal-registration.sql",
  "tests/integration/phase15c-release-tooling.test.ts",
]);
const RESIDUE_AUDIT_KEYS = Object.freeze([
  "legal_documents",
  "registration_acceptances",
  "players",
  "tournaments",
  "tournament_brackets",
  "registrations",
  "fixture_players",
  "fixture_tournaments",
  "fixture_brackets",
  "fixture_registrations",
  "fixture_acceptances",
]);
const FIXTURE_RESIDUE_KEYS = Object.freeze(
  RESIDUE_AUDIT_KEYS.filter((key) => key.startsWith("fixture_"))
);
const DOCUMENTS = Object.freeze([
  Object.freeze({
    kind: "rulebook",
    version: "3.0",
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    path: "public/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    pathname:
      "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
  }),
  Object.freeze({
    kind: "ppa",
    version: "3.0",
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    path: "public/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
    pathname:
      "/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
  }),
  Object.freeze({
    kind: "terms",
    version: "1.0",
    filename: "ironclad-terms-of-service-v1.0.pdf",
    path: "public/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf",
    pathname: "/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf",
  }),
  Object.freeze({
    kind: "privacy",
    version: "1.0",
    filename: "ironclad-privacy-policy-v1.0.pdf",
    path: "public/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf",
    pathname: "/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf",
  }),
]);

const options = parseArguments(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Phase 15C Staging registration contract failed: ${message}`);
  process.exitCode = 1;
});

async function main() {
  const baseUrl = validatePreviewBaseUrl(options.baseUrl);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.activationDate ?? "")) {
    throw new Error("--activation-date must use YYYY-MM-DD.");
  }
  const today = getSydneyDate(new Date());
  if (options.activationDate !== today) {
    throw new Error(
      `Activation date ${options.activationDate} is not today's Australia/Sydney date (${today}).`
    );
  }
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead ?? "")) {
    throw new Error("--expected-head must be a lowercase 40-character Git SHA.");
  }
  const registeredHead = options.registeredHead ?? options.expectedHead;
  if (!/^[0-9a-f]{40}$/.test(registeredHead)) {
    throw new Error(
      "--registered-head must be a lowercase 40-character Git SHA."
    );
  }

  const actualHead = runCommand("git", ["rev-parse", "HEAD"]).trim();
  if (actualHead !== options.expectedHead) {
    throw new Error(
      `Checked-out Git head ${actualHead} does not match expected head ${options.expectedHead}.`
    );
  }
  assertCleanGitWorktree(runCommand);
  assertRegisteredHeadCompatibility(registeredHead, options.expectedHead);
  const corpus = parseJson(
    readFileSync(resolve("content/legal-corpus.json"), "utf8"),
    "canonical legal corpus"
  );
  const releaseCorpus = validateCanonicalReleaseCorpus(
    corpus,
    options.activationDate,
    DOCUMENTS
  );

  const deployment = verifyVercelDeployment(baseUrl, registeredHead);

  const projects = parseJson(
    runSupabase(["--output", "json", "projects", "list"]),
    "Supabase project list"
  );
  const matching = Array.isArray(projects)
    ? projects.filter(
        (project) =>
          project &&
          project.id === STAGING.ref &&
          project.name === STAGING.name &&
          project.status === "ACTIVE_HEALTHY"
      )
    : [];
  if (matching.length !== 1) {
    throw new Error("Fixed Staging project identity gate failed.");
  }

  const expected = [];
  for (const document of DOCUMENTS) {
    const path = resolve(document.path);
    if (!existsSync(path)) {
      throw new Error(`Required artifact is missing: ${document.path}`);
    }
    const bytes = readFileSync(path);
    assertPdfEffectiveDate(
      bytes,
      releaseCorpus.effectiveDateDisplay,
      document.kind
    );
    const sha256 = hash(bytes);
    const url = `${baseUrl}${document.pathname}`;
    const deployedHash = hash(
      runVercelBytes([
        "curl",
        document.pathname,
        "--deployment",
        deployment.id,
        "--yes",
        "--scope",
        VERCEL_SCOPE,
        "--",
        "--silent",
        "--show-error",
        "--fail",
      ])
    );
    if (deployedHash !== sha256) {
      throw new Error(`Preview artifact hash mismatch for ${document.kind}.`);
    }
    expected.push({ ...document, url, sha256 });
  }

  const preflight = runSql(buildDocumentPreflightSql());
  const rows = extractRows(preflight);
  if (rows.length !== 4) {
    throw new Error(`Staging register returned ${rows.length} rows, expected 4.`);
  }

  for (const document of expected) {
    const matches = rows.filter((row) => row.document_kind === document.kind);
    if (
      matches.length !== 1 ||
      matches[0].version !== document.version ||
      matches[0].immutable_url !== document.url ||
      matches[0].status !== "effective" ||
      matches[0].sha256 !== document.sha256 ||
      getSydneyDate(new Date(matches[0].effective_at)) !== options.activationDate
    ) {
      throw new Error(`Staging register mismatch for ${document.kind}.`);
    }
  }

  const baselineResidue = readResidueAudit(
    runSql(buildResidueAuditSql()),
    "Staging contract preflight"
  );

  const contractPath = resolve(
    "tests/database/phase15c-final-legal-registration.sql"
  );
  if (!existsSync(contractPath)) {
    throw new Error("Phase 15C Staging contract SQL is missing.");
  }
  const contractSql = readFileSync(contractPath, "utf8");
  assertRollbackOnlyContract(contractSql);
  const contract = runSupabase([
    "--output-format",
    "json",
    "db",
    "query",
    "--linked",
    "--project-ref",
    STAGING.ref,
    "--file",
    contractPath,
  ]);
  const result = parseLastJsonObject(contract, "Staging contract query");
  const resultRows = extractRows(result);
  if (
    resultRows.length !== 1 ||
    resultRows[0].phase15c_contract_result?.target !== STAGING.name ||
    resultRows[0].phase15c_contract_result?.zero_residue !== true
  ) {
    throw new Error("Staging contract did not return its zero-residue proof.");
  }

  const postflightResidue = readResidueAudit(
    runSql(buildResidueAuditSql()),
    "Staging contract postflight"
  );
  assertSameResidueAudit(baselineResidue, postflightResidue);

  console.log(
    JSON.stringify(
      {
        target: STAGING,
        baseUrl,
        deployment,
        activationDate: options.activationDate,
        expectedHead: options.expectedHead,
        registeredHead,
        documents: expected.map(({ kind, version, url, sha256 }) => ({
          kind,
          version,
          url,
          sha256,
        })),
        residue: {
          before: baselineResidue,
          after: postflightResidue,
        },
        result: resultRows[0].phase15c_contract_result,
      },
      null,
      2
    )
  );
}

function buildDocumentPreflightSql() {
  return `
select
  document_kind,
  version,
  immutable_url,
  status,
  effective_at,
  sha256
from public.legal_documents
order by document_kind;
`;
}

function buildResidueAuditSql() {
  return `
select jsonb_build_object(
  'legal_documents', (select count(*) from public.legal_documents),
  'registration_acceptances',
    (select count(*) from public.registration_acceptances),
  'players', (select count(*) from public.players),
  'tournaments', (select count(*) from public.tournaments),
  'tournament_brackets', (select count(*) from public.tournament_brackets),
  'registrations', (select count(*) from public.registrations),
  'fixture_players', (
    select count(*)
    from public.players
    where id = '15c00000-0000-4000-8000-000000002001'::uuid
      or clerk_user_id like 'phase15c-contract-%'
      or steam_id64 = '76561198000015001'
  ),
  'fixture_tournaments', (
    select count(*)
    from public.tournaments
    where id = '15c00000-0000-4000-8000-000000001001'::uuid
      or slug = 'phase15c-final-registration-contract'
  ),
  'fixture_brackets', (
    select count(*)
    from public.tournament_brackets
    where id = '15c00000-0000-4000-8000-000000001101'::uuid
      or tournament_id = '15c00000-0000-4000-8000-000000001001'::uuid
  ),
  'fixture_registrations', (
    select count(*)
    from public.registrations
    where clerk_user_id like 'phase15c-contract-%'
      or tournament_id = '15c00000-0000-4000-8000-000000001001'::uuid
  ),
  'fixture_acceptances', (
    select count(*)
    from public.registration_acceptances
    where clerk_user_id like 'phase15c-contract-%'
  )
) as phase15c_residue_audit;
`;
}

function readResidueAudit(queryResult, label) {
  const rows = extractRows(queryResult);
  const audit = rows.length === 1 ? rows[0].phase15c_residue_audit : null;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    throw new Error(`${label} did not return one residue-audit object.`);
  }

  for (const key of RESIDUE_AUDIT_KEYS) {
    if (!Number.isSafeInteger(audit[key]) || audit[key] < 0) {
      throw new Error(`${label} returned an invalid ${key} count.`);
    }
  }
  for (const key of FIXTURE_RESIDUE_KEYS) {
    if (audit[key] !== 0) {
      throw new Error(`${label} found deterministic fixture residue in ${key}.`);
    }
  }

  return Object.fromEntries(
    RESIDUE_AUDIT_KEYS.map((key) => [key, audit[key]])
  );
}

function assertSameResidueAudit(baseline, postflight) {
  const changedKeys = RESIDUE_AUDIT_KEYS.filter(
    (key) => baseline[key] !== postflight[key]
  );
  if (changedKeys.length > 0) {
    throw new Error(
      `Staging row counts changed during the rollback contract: ${changedKeys.join(
        ", "
      )}.`
    );
  }
}

function assertRollbackOnlyContract(sql) {
  const executableLines = sql
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
  const transactionStatements = Array.from(
    sql.matchAll(
      /^[ \t]*(?:begin|rollback|commit(?:[ \t]+(?:work|transaction))?)[ \t]*;[ \t]*$/gimu
    ),
    (match) => match[0].trim().toLowerCase()
  );
  if (
    executableLines[0]?.toLowerCase() !== "begin;" ||
    transactionStatements.length !== 2 ||
    transactionStatements[0] !== "begin;" ||
    transactionStatements[1] !== "rollback;" ||
    /^[ \t]*(?:savepoint|rollback[ \t]+to)\b/imu.test(sql)
  ) {
    throw new Error(
      "Staging contract must contain one leading BEGIN, one terminal ROLLBACK, and no COMMIT or savepoint."
    );
  }

  const rollback = /^[ \t]*rollback[ \t]*;[ \t]*$/imu.exec(sql);
  const tail = rollback
    ? sql.slice(rollback.index + rollback[0].length)
    : "";
  if (
    !/^\s*select\s+jsonb_build_object\([\s\S]*\)\s+as\s+phase15c_contract_result\s*;\s*$/iu.test(
      tail
    )
  ) {
    throw new Error(
      "Staging contract may contain only its result projection after ROLLBACK."
    );
  }
}

function runSql(sql) {
  const temporarySqlPath = join(
    tmpdir(),
    `ironclad-phase15c-staging-contract-${randomUUID()}.sql`
  );
  try {
    writeFileSync(temporarySqlPath, sql, { encoding: "utf8", flag: "wx" });
    const output = runSupabase([
      "--output-format",
      "json",
      "db",
      "query",
      "--linked",
      "--project-ref",
      STAGING.ref,
      "--file",
      temporarySqlPath,
    ]);
    return parseLastJsonObject(output, "Staging preflight query");
  } finally {
    if (existsSync(temporarySqlPath)) {
      unlinkSync(temporarySqlPath);
    }
  }
}

function validatePreviewBaseUrl(value) {
  if (!value) {
    throw new Error("--base-url is required.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--base-url must be an absolute HTTPS URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(parsed.hostname)
  ) {
    throw new Error(
      "--base-url must be the exact origin-only HTTPS Vercel Preview deployment (*.vercel.app)."
    );
  }

  return parsed.origin.toLowerCase();
}

function verifyVercelDeployment(baseUrl, expectedHead) {
  const inspected = parseLastJsonObject(
    runVercel(["inspect", baseUrl, "--json", "--no-color"]),
    "Vercel Preview inspection"
  );
  if (
    typeof inspected.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/.test(inspected.id) ||
    typeof inspected.url !== "string" ||
    inspected.readyState !== "READY" ||
    `https://${inspected.url.toLowerCase()}` !== baseUrl
  ) {
    throw new Error(
      "Preview base is not the exact immutable URL of a READY Vercel deployment."
    );
  }

  const metadata = parseLastJsonObject(
    runVercel([
      "api",
      `/v13/deployments/${inspected.id}`,
      "--raw",
      "--scope",
      VERCEL_SCOPE,
    ]),
    "Vercel Preview metadata"
  );
  if (
    metadata.id !== inspected.id ||
    metadata.readyState !== "READY" ||
    metadata.target === "production" ||
    metadata.gitSource?.sha !== expectedHead
  ) {
    throw new Error("Preview deployment target or Git head does not match.");
  }

  return {
    id: metadata.id,
    url: `https://${metadata.url}`,
    gitRef: metadata.gitSource?.ref ?? null,
    gitSha: metadata.gitSource.sha,
  };
}

function assertRegisteredHeadCompatibility(registeredHead, expectedHead) {
  if (registeredHead === expectedHead) {
    return;
  }

  try {
    runCommand("git", [
      "merge-base",
      "--is-ancestor",
      registeredHead,
      expectedHead,
    ]);
  } catch {
    throw new Error(
      "The registered Staging artifact head must be an ancestor of the reviewed tooling head."
    );
  }

  const changedPaths = runCommand("git", [
    "diff",
    "--name-only",
    `${registeredHead}..${expectedHead}`,
  ])
    .split(/\r?\n/u)
    .map((path) => path.trim().replaceAll("\\", "/"))
    .filter(Boolean);
  const unexpectedPaths = changedPaths.filter(
    (path) => !REGISTERED_HEAD_TOOLING_PATHS.has(path)
  );
  if (unexpectedPaths.length > 0) {
    throw new Error(
      `Registered-head recovery includes non-tooling changes: ${unexpectedPaths.join(
        ", "
      )}.`
    );
  }
}

function extractRows(result) {
  if (!result || !Array.isArray(result.rows)) {
    throw new Error("Supabase query did not return a rows array.");
  }
  return result.rows;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runSupabase(arguments_) {
  return runNpx([
    "--yes",
    `supabase@${SUPABASE_CLI_VERSION}`,
    ...arguments_,
  ]);
}

function runVercel(arguments_) {
  return runNpx([
    "--yes",
    `vercel@${VERCEL_CLI_VERSION}`,
    ...arguments_,
  ]);
}

function runVercelBytes(arguments_) {
  return runNpxBytes([
    "--yes",
    `vercel@${VERCEL_CLI_VERSION}`,
    ...arguments_,
  ]);
}

function runNpx(arguments_) {
  if (process.platform !== "win32") {
    return runCommand("npx", arguments_);
  }

  const npxCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );
  if (!existsSync(npxCli)) {
    throw new Error(`Bundled npm launcher is unavailable: ${npxCli}`);
  }
  return runCommand(process.execPath, [npxCli, ...arguments_]);
}

function runNpxBytes(arguments_) {
  if (process.platform !== "win32") {
    return runCommandBytes("npx", arguments_);
  }

  const npxCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );
  if (!existsSync(npxCli)) {
    throw new Error(`Bundled npm launcher is unavailable: ${npxCli}`);
  }
  return runCommandBytes(process.execPath, [npxCli, ...arguments_]);
}

function runCommand(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`${command} failed: ${detail}`);
  }
  return result.stdout;
}

function runCommandBytes(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = Buffer.from(result.stderr || result.stdout || "unknown error")
      .toString("utf8")
      .trim();
    throw new Error(`${command} failed: ${detail}`);
  }
  return Buffer.from(result.stdout);
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function parseLastJsonObject(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "{") {
      continue;
    }
    try {
      return JSON.parse(value.slice(index));
    } catch {
      // The CLI can prefix a status line before its JSON response.
    }
  }
  throw new Error(`${label} did not return a parseable JSON object.`);
}

function parseArguments(arguments_) {
  const parsed = {
    activationDate: null,
    baseUrl: null,
    expectedHead: null,
    registeredHead: null,
    help: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--activation-date") {
      parsed.activationDate = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--base-url") {
      parsed.baseUrl = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--expected-head") {
      parsed.expectedHead = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--registered-head") {
      parsed.registeredHead = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else {
      throw new Error(
        `Unknown argument ${argument}; this command intentionally has no target option.`
      );
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/phase15c/run-staging-registration-contract.mjs \\
    --base-url <exact-preview-origin> \\
    --activation-date <YYYY-MM-DD> \\
    --expected-head <40-char-reviewed-tooling-git-sha> \\
    [--registered-head <40-char-registered-artifact-git-sha>]

This rollback-only command is fixed to ironclad-staging
(${STAGING.ref}). It validates the exact final Preview PDFs and existing
Effective register rows before exercising registration and proving zero fixture
residue. The registered head defaults to the expected head. A distinct registered
head is accepted only when it is an ancestor and the intervening changes are
limited to this validator, its rollback SQL contract, its regression test, and
this runbook. It exposes no Production target.`);
}
