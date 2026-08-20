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
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  assertCleanGitWorktree,
  assertPdfEffectiveDate,
  formatActivationDateDisplay,
  getSydneyDate,
} from "../phase15c/release-artifact-contract.mjs";

const SUPABASE_CLI_VERSION = "2.114.0";
const VERCEL_CLI_VERSION = "59.1.4";
const VERCEL_SCOPE = "ironclad-tournaments";
const PRODUCTION_BASE_URL = "https://www.ironcladtournaments.com";
const TARGETS = Object.freeze({
  staging: Object.freeze({ name: "ironclad-staging", ref: "zzbnneprhjicmajpjkdg" }),
  production: Object.freeze({ name: "ironclad-v2", ref: "nsyjtqpvyxlzyujlbzos" }),
});
const UNCHANGED = Object.freeze([
  Object.freeze({
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    kind: "rulebook",
    publicPath:
      "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    version: "3.0",
    sha256: "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  }),
  Object.freeze({
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    kind: "ppa",
    publicPath:
      "/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
    version: "3.0",
    sha256: "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  }),
]);
const PREVIOUS = Object.freeze([
  Object.freeze({
    kind: "terms",
    version: "1.0",
    sha256: "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  }),
  Object.freeze({
    kind: "privacy",
    version: "1.0",
    sha256: "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
  }),
]);
const SUCCESSORS = Object.freeze({
  privacy: Object.freeze({
    filename: "ironclad-privacy-policy-v1.1.pdf",
    publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
  }),
  terms: Object.freeze({
    filename: "ironclad-terms-of-service-v1.1.pdf",
    publicPath: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
  }),
});

export function validateSuccessorRelease(corpus, manifest, activationDate) {
  const effectiveDateDisplay = formatActivationDateDisplay(activationDate);
  if (
    !corpus ||
    corpus.schemaVersion !== 1 ||
    corpus.effectiveDate !== activationDate ||
    corpus.effectiveDateDisplay !== effectiveDateDisplay ||
    !Array.isArray(corpus.documents) ||
    corpus.documents.length !== 4
  ) {
    throw new Error("The finalized current legal corpus is invalid.");
  }
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    manifest.status !== "Final" ||
    manifest.effectiveDate !== activationDate ||
    manifest.effectiveDateDisplay !== effectiveDateDisplay ||
    !Array.isArray(manifest.documents) ||
    manifest.documents.length !== 2
  ) {
    throw new Error("The finalized successor manifest is invalid.");
  }

  const current = new Map(corpus.documents.map((document) => [document.kind, document]));
  for (const expected of UNCHANGED) {
    const document = current.get(expected.kind);
    if (
      !document ||
      document.version !== expected.version ||
      document.status !== "Effective" ||
      document.effectiveDate !== "2026-08-18" ||
      document.filename !== expected.filename ||
      document.publicPath !== expected.publicPath
    ) {
      throw new Error(`${expected.kind} did not remain unchanged.`);
    }
  }

  const releases = [];
  for (const kind of ["terms", "privacy"]) {
    const document = current.get(kind);
    const release = manifest.documents.find((candidate) => candidate.kind === kind);
    const expected = SUCCESSORS[kind];
    if (
      !document ||
      !release ||
      document.version !== "1.1" ||
      document.status !== "Effective" ||
      document.effectiveDate !== activationDate ||
      document.filename !== expected.filename ||
      document.publicPath !== expected.publicPath ||
      document.filename !== release.filename ||
      document.publicPath !== release.publicPath ||
      release.version !== "1.1" ||
      release.effectiveDate !== activationDate ||
      release.filename !== expected.filename ||
      release.publicPath !== expected.publicPath ||
      !/^[0-9a-f]{64}$/.test(release.sha256)
    ) {
      throw new Error(`The finalized ${kind} successor is invalid.`);
    }
    releases.push(release);
  }

  return { effectiveDateDisplay, releases };
}

export function buildSuccessorTransactionSql({
  activationDate,
  apply,
  baseUrl,
  releases,
}) {
  const newValues = releases
    .map(
      (release) =>
        `(${sqlLiteral(release.kind)}, '1.1', ${sqlLiteral(
          `${baseUrl}${release.publicPath}`
        )}, ${sqlLiteral(release.sha256)})`
    )
    .join(",\n      ");
  const endStatement = apply ? "commit;" : "rollback;";

  return `
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

do $legal_successor$
declare
  v_now timestamptz := clock_timestamp();
  v_activation_date date := date ${sqlLiteral(activationDate)};
  v_registration_acceptances bigint;
  v_account_acceptances bigint;
  v_registrations bigint;
begin
  if (v_now at time zone 'Australia/Sydney')::date is distinct from v_activation_date then
    raise exception 'Successor activation date is not the current Australia/Sydney date';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:legal-document-successor-v1.1', 0)
  );

  if to_regclass('public.legal_documents') is null
    or to_regclass('public.registration_acceptances') is null
    or to_regclass('public.account_legal_acceptances') is null then
    raise exception 'Required legal-evidence schema is unavailable';
  end if;

  perform document.id
  from public.legal_documents as document
  where document.status = 'effective'
  order by document.document_kind
  for update;

  if (select count(*) from public.legal_documents) <> 4
    or (select count(*) from public.legal_documents where status = 'effective') <> 4 then
    raise exception 'Successor activation requires exactly four current initial legal rows';
  end if;

  if exists (
    select 1
    from (
      values
        ('rulebook', '3.0', '${UNCHANGED[0].sha256}'),
        ('ppa', '3.0', '${UNCHANGED[1].sha256}'),
        ('terms', '1.0', '${PREVIOUS[0].sha256}'),
        ('privacy', '1.0', '${PREVIOUS[1].sha256}')
    ) as expected(document_kind, version, sha256)
    left join public.legal_documents as document
      on document.document_kind = expected.document_kind
     and document.version = expected.version
     and document.sha256 = expected.sha256
     and document.status = 'effective'
    where document.id is null
  ) then
    raise exception 'Current legal register does not match the approved predecessor set';
  end if;

  select count(*) into v_registration_acceptances
  from public.registration_acceptances;
  select count(*) into v_account_acceptances
  from public.account_legal_acceptances;
  select count(*) into v_registrations
  from public.registrations;

  update public.legal_documents
  set status = 'superseded'
  where status = 'effective'
    and document_kind in ('terms', 'privacy')
    and version = '1.0';

  if not found then
    raise exception 'Predecessor Terms and Privacy were not superseded';
  end if;

  insert into public.legal_documents (
    document_kind,
    version,
    immutable_url,
    status,
    published_at,
    effective_at,
    sha256
  )
  select
    expected.document_kind,
    expected.version,
    expected.immutable_url,
    'effective',
    v_now,
    v_now,
    expected.sha256
  from (
    values
      ${newValues}
  ) as expected(document_kind, version, immutable_url, sha256);

  if (select count(*) from public.legal_documents) <> 6
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or (select count(*) from public.legal_documents where status = 'superseded') <> 2
    or (select count(*) from public.legal_documents where document_kind in ('rulebook', 'ppa') and status = 'effective') <> 2
    or (select count(*) from public.legal_documents where document_kind in ('terms', 'privacy') and version = '1.1' and status = 'effective') <> 2
    or (select count(*) from public.registration_acceptances) is distinct from v_registration_acceptances
    or (select count(*) from public.account_legal_acceptances) is distinct from v_account_acceptances
    or (select count(*) from public.registrations) is distinct from v_registrations then
    raise exception 'Successor activation postcondition failed';
  end if;
end;
$legal_successor$;

${endStatement}

select
  document_kind,
  version,
  immutable_url,
  status,
  published_at,
  effective_at,
  sha256
from public.legal_documents
order by document_kind, created_at;
`;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const target = TARGETS[options.target];
  if (!target) throw new Error("--target must be staging or production.");
  if (!options.expectedHead || !/^[0-9a-f]{40}$/.test(options.expectedHead)) {
    throw new Error("--expected-head must be an exact lowercase Git SHA.");
  }
  if (options.activationDate !== getSydneyDate(new Date())) {
    throw new Error("--activation-date must equal today's Australia/Sydney date.");
  }
  if (options.target === "staging" && options.apply) {
    throw new Error("Staging successor validation is rollback-only.");
  }
  if (options.target === "staging" && !options.rollbackValidate) {
    throw new Error("Staging requires --rollback-validate.");
  }
  if (options.target === "production" && options.rollbackValidate) {
    throw new Error("Production does not accept --rollback-validate.");
  }

  const baseUrl = validateBaseUrl(options.baseUrl, options.target);
  const actualHead = runCommand("git", ["rev-parse", "HEAD"]).trim();
  if (actualHead !== options.expectedHead) {
    throw new Error("Checked-out Git head does not match --expected-head.");
  }
  assertCleanGitWorktree(runCommand);
  if (options.target === "production") assertProductionHead(options.expectedHead);

  const corpus = JSON.parse(readFileSync(resolve("content/legal-corpus.json"), "utf8"));
  const manifestPath = resolve("content/legal-successor-release.json");
  if (!existsSync(manifestPath)) {
    throw new Error("The final successor manifest does not exist; Review Draft cannot activate.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const release = validateSuccessorRelease(
    corpus,
    manifest,
    options.activationDate
  );

  const deployment = verifyVercelDeployment(
    baseUrl,
    options.expectedHead,
    options.target
  );
  for (const document of release.releases) {
    const localPath = resolve("public/documents-rules-ppa", document.filename);
    if (!existsSync(localPath)) throw new Error(`Missing ${document.filename}.`);
    const localBytes = readFileSync(localPath);
    if (sha256(localBytes) !== document.sha256) {
      throw new Error(`${document.kind} local hash mismatch.`);
    }
    assertPdfEffectiveDate(
      localBytes,
      release.effectiveDateDisplay,
      document.kind
    );
    const deployedBytes =
      options.target === "staging"
        ? runVercelBytes([
            "curl",
            document.publicPath,
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
        : fetchProductionBytes(`${baseUrl}${document.publicPath}`);
    if (sha256(deployedBytes) !== document.sha256) {
      throw new Error(`${document.kind} deployed hash mismatch.`);
    }
  }

  const projects = JSON.parse(
    runSupabase(["--output", "json", "projects", "list"])
  );
  const matches = Array.isArray(projects)
    ? projects.filter(
        (project) =>
          project?.id === target.ref &&
          project?.name === target.name &&
          project?.status === "ACTIVE_HEALTHY"
      )
    : [];
  if (matches.length !== 1) throw new Error("Supabase project identity gate failed.");

  const shouldExecute = options.apply || options.rollbackValidate;
  const sql = buildSuccessorTransactionSql({
    activationDate: options.activationDate,
    apply: options.apply,
    baseUrl,
    releases: release.releases,
  });
  const before = queryProject(target, auditSql());
  if (!Array.isArray(before.rows) || before.rows.length !== 1) {
    throw new Error("Legal-register preflight did not return one audit row.");
  }
  console.log(
    JSON.stringify(
      {
        mode: options.apply
          ? "apply"
          : options.rollbackValidate
            ? "rollback-validation"
            : "dry-run",
        target,
        baseUrl,
        deployment,
        expectedHead: options.expectedHead,
        activationDate: options.activationDate,
        documents: release.releases,
        currentRegister: before.rows[0],
      },
      null,
      2
    )
  );
  if (!shouldExecute) {
    console.log("Dry run complete; no database rows were changed.");
    return;
  }

  if (options.apply) {
    const immediateDeployment = verifyVercelDeployment(
      baseUrl,
      options.expectedHead,
      options.target
    );
    if (immediateDeployment.id !== deployment.id) {
      throw new Error("Production deployment changed before successor activation.");
    }
  }

  const result = queryProject(target, sql);
  const after = queryProject(target, auditSql());
  if (!Array.isArray(after.rows) || after.rows.length !== 1) {
    throw new Error("Legal-register postflight did not return one audit row.");
  }
  if (
    options.rollbackValidate &&
    !legalAuditResultsMatch(before, after)
  ) {
    throw new Error("Rollback validation left database residue.");
  }
  if (options.apply) {
    const rows = result.rows;
    if (
      !Array.isArray(rows) ||
      rows.length !== 6 ||
      rows.filter((row) => row.status === "effective").length !== 4 ||
      rows.filter((row) => row.status === "superseded").length !== 2
    ) {
      throw new Error("Production successor postflight failed.");
    }
    const postflightDeployment = verifyVercelDeployment(
      baseUrl,
      options.expectedHead,
      options.target
    );
    if (postflightDeployment.id !== deployment.id) {
      throw new Error("Production deployment changed during successor activation.");
    }
  }
  console.log(JSON.stringify({ completed: true, result }, null, 2));
}

function auditSql() {
  return `select jsonb_build_object(
    'legal_documents', (select count(*) from public.legal_documents),
    'legal_rows', (select coalesce(jsonb_agg(to_jsonb(document) order by document.document_kind, document.created_at), '[]'::jsonb) from public.legal_documents as document),
    'registration_acceptances', (select count(*) from public.registration_acceptances),
    'account_legal_acceptances', (select count(*) from public.account_legal_acceptances),
    'registrations', (select count(*) from public.registrations)
  ) as legal_successor_audit;`;
}

function queryProject(target, sql) {
  const path = join(tmpdir(), `ironclad-legal-successor-${target.ref}-${randomUUID()}.sql`);
  try {
    writeFileSync(path, sql, { encoding: "utf8", flag: "wx" });
    return parseLastJsonObject(
      runSupabase([
        "--output-format",
        "json",
        "db",
        "query",
        "--linked",
        "--project-ref",
        target.ref,
        "--file",
        path,
      ])
    );
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
}

function validateBaseUrl(value, targetName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--base-url must be an absolute HTTPS origin.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("--base-url must be an origin-only HTTPS URL.");
  }
  const origin = parsed.origin.toLowerCase();
  if (targetName === "production" && origin !== PRODUCTION_BASE_URL) {
    throw new Error(`Production base must be ${PRODUCTION_BASE_URL}.`);
  }
  if (
    targetName === "staging" &&
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(parsed.hostname)
  ) {
    throw new Error("Staging requires an immutable Vercel Preview origin.");
  }
  return origin;
}

function verifyVercelDeployment(baseUrl, expectedHead, targetName) {
  const inspected = parseLastJsonObject(
    runVercel(["inspect", baseUrl, "--json", "--no-color"])
  );
  if (!/^dpl_[A-Za-z0-9]+$/.test(inspected.id ?? "") || inspected.readyState !== "READY") {
    throw new Error("Vercel deployment is not uniquely identified and READY.");
  }
  if (targetName === "staging" && `https://${inspected.url}`.toLowerCase() !== baseUrl) {
    throw new Error("Staging base resolves through an alias.");
  }
  if (targetName === "production" && inspected.target !== "production") {
    throw new Error("Canonical base does not resolve to Production.");
  }
  const metadata = parseLastJsonObject(
    runVercel([
      "api",
      `/v13/deployments/${inspected.id}`,
      "--raw",
      "--scope",
      VERCEL_SCOPE,
    ])
  );
  if (metadata.readyState !== "READY" || metadata.gitSource?.sha !== expectedHead) {
    throw new Error("Vercel deployment head does not match --expected-head.");
  }
  if (targetName === "staging" && metadata.target === "production") {
    throw new Error("Staging validation requires a Preview deployment.");
  }
  if (targetName === "production" && metadata.target !== "production") {
    throw new Error("Canonical Production metadata is not Production.");
  }
  return {
    id: metadata.id,
    url: `https://${metadata.url}`,
    target: metadata.target ?? "preview",
    gitSha: metadata.gitSource.sha,
  };
}

function assertProductionHead(expectedHead) {
  runCommand("git", ["fetch", "--quiet", "origin", "master"]);
  const originMaster = runCommand("git", [
    "rev-parse",
    "refs/remotes/origin/master",
  ]).trim();
  if (originMaster !== expectedHead) {
    throw new Error("Production expected head is not fetched origin/master.");
  }
}

function fetchProductionBytes(url) {
  const result = spawnSync("curl", ["--silent", "--show-error", "--fail", url], {
    encoding: null,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Production PDF fetch failed.");
  return Buffer.from(result.stdout);
}

function parseArguments(arguments_) {
  const parsed = {
    activationDate: null,
    apply: false,
    baseUrl: null,
    expectedHead: null,
    rollbackValidate: false,
    target: null,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") parsed.apply = true;
    else if (argument === "--rollback-validate") parsed.rollbackValidate = true;
    else if (["--activation-date", "--base-url", "--expected-head", "--target"].includes(argument)) {
      const key = {
        "--activation-date": "activationDate",
        "--base-url": "baseUrl",
        "--expected-head": "expectedHead",
        "--target": "target",
      }[argument];
      parsed[key] = arguments_[index + 1] ?? null;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (parsed.apply && parsed.rollbackValidate) {
    throw new Error("Choose --apply or --rollback-validate, not both.");
  }
  return parsed;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function legalAuditResultsMatch(before, after) {
  return (
    Array.isArray(before?.rows) &&
    before.rows.length === 1 &&
    Array.isArray(after?.rows) &&
    after.rows.length === 1 &&
    stableJson(before.rows[0]) === stableJson(after.rows[0])
  );
}

function runSupabase(arguments_) {
  return runNpx(["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...arguments_]);
}

function runVercel(arguments_) {
  return runNpx(["--yes", `vercel@${VERCEL_CLI_VERSION}`, ...arguments_]);
}

function runVercelBytes(arguments_) {
  return runNpxBytes(["--yes", `vercel@${VERCEL_CLI_VERSION}`, ...arguments_]);
}

function runNpx(arguments_) {
  if (process.platform !== "win32") return runCommand("npx", arguments_);
  return runCommand(process.execPath, [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
    ...arguments_,
  ]);
}

function runNpxBytes(arguments_) {
  if (process.platform !== "win32") return runCommandBytes("npx", arguments_);
  return runCommandBytes(process.execPath, [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
    ...arguments_,
  ]);
}

function runCommand(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result.stdout;
}

function runCommandBytes(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed.`);
  return Buffer.from(result.stdout);
}

function parseLastJsonObject(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "{") continue;
    try {
      return JSON.parse(value.slice(index));
    } catch {
      // Keep looking past CLI status prefixes.
    }
  }
  throw new Error("Command did not return a JSON object.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(
      `Legal successor release failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}
