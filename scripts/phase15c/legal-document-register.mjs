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

const SYDNEY_TIME_ZONE = "Australia/Sydney";
const SUPABASE_CLI_VERSION = "2.114.0";
const VERCEL_CLI_VERSION = "59.1.4";
const VERCEL_SCOPE = "ironclad-tournaments";
const TARGETS = Object.freeze({
  staging: Object.freeze({
    name: "ironclad-staging",
    ref: "zzbnneprhjicmajpjkdg",
  }),
  production: Object.freeze({
    name: "ironclad-v2",
    ref: "nsyjtqpvyxlzyujlbzos",
  }),
});
const PRODUCTION_BASE_URL = "https://www.ironcladtournaments.com";
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
const PROTECTED_PUBLIC_TABLES = Object.freeze([
  "bracket_rounds",
  "coh3_maps",
  "generated_brackets",
  "leaderboard_player_all_time_stats",
  "leaderboard_player_season_stats",
  "leaderboard_point_events",
  "leaderboard_recalculation_runs",
  "leaderboard_season_champions",
  "leaderboard_seasons",
  "leaderboard_tournament_season_memberships",
  "match_dice_rolls",
  "match_replay_upload_attempts",
  "match_result_report_groups",
  "match_result_submissions",
  "notifications",
  "platform_settings",
  "player_notification_dismissals",
  "player_report_group_notification_dismissals",
  "players",
  "poll_ballot_choices",
  "poll_eligible_voters",
  "poll_options",
  "polls",
  "profiles",
  "registration_acceptances",
  "registrations",
  "tournament_bracket_map_pool_corrections",
  "tournament_bracket_map_pool_entries",
  "tournament_brackets",
  "tournament_deletion_jobs",
  "tournament_matches",
  "tournament_standings",
  "tournaments",
]);

const options = parseArguments(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Phase 15C legal-register release failed: ${message}`);
  process.exitCode = 1;
});

async function main() {
  const target = TARGETS[options.target];

  if (!target) {
    throw new Error("--target must be either staging or production.");
  }

  const baseUrl = validateBaseUrl(options.baseUrl, options.target);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.activationDate ?? "")) {
    throw new Error("--activation-date must use YYYY-MM-DD.");
  }

  const today = getSydneyDate(new Date());
  if (options.activationDate !== today) {
    throw new Error(
      `Activation date ${options.activationDate} is not today's Australia/Sydney date (${today}); backdating and future-dating are refused.`
    );
  }

  if (!options.expectedHead) {
    throw new Error("Staging and Production both require --expected-head <40-char Git SHA>.");
  }

  if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) {
    throw new Error("--expected-head must be a lowercase 40-character Git SHA.");
  }

  const actualHead = runCommand("git", ["rev-parse", "HEAD"]).trim();
  if (actualHead !== options.expectedHead) {
    throw new Error(
      `Checked-out Git head ${actualHead} does not match expected head ${options.expectedHead}.`
    );
  }

  assertCleanGitWorktree(runCommand);
  if (options.target === "production") {
    assertProductionExpectedHead(options.expectedHead);
  }
  const corpus = parseJson(
    readFileSync(resolve("content/legal-corpus.json"), "utf8"),
    "canonical legal corpus"
  );
  const releaseCorpus = validateCanonicalReleaseCorpus(
    corpus,
    options.activationDate,
    DOCUMENTS
  );

  const deployment = verifyVercelDeployment(
    baseUrl,
    options.expectedHead,
    options.target
  );

  const projects = parseJson(
    runSupabase(["--output", "json", "projects", "list"]),
    "Supabase project list"
  );
  const matchingProjects = Array.isArray(projects)
    ? projects.filter(
        (project) =>
          project &&
          project.id === target.ref &&
          project.name === target.name &&
          project.status === "ACTIVE_HEALTHY"
      )
    : [];

  if (matchingProjects.length !== 1) {
    throw new Error(
      `Expected one healthy ${target.name} project with ref ${target.ref}; identity gate failed.`
    );
  }

  const documents = DOCUMENTS.map((document) => {
    const absolutePath = resolve(document.path);
    if (!existsSync(absolutePath)) {
      throw new Error(`Required artifact is missing: ${document.path}`);
    }

    const bytes = readFileSync(absolutePath);
    if (bytes.length === 0) {
      throw new Error(`Required artifact is empty: ${document.path}`);
    }
    assertPdfEffectiveDate(
      bytes,
      releaseCorpus.effectiveDateDisplay,
      document.kind
    );

    return {
      ...document,
      absolutePath,
      bytes,
      url: `${baseUrl}${document.pathname}`,
      sha256: sha256(bytes),
    };
  });

  for (const document of documents) {
    const response = await fetch(document.url, {
      cache: "no-store",
      headers: { "user-agent": "IronClad-Phase15C-release/1.0" },
    });
    if (!response.ok) {
      throw new Error(
        `Deployed artifact returned HTTP ${response.status}: ${document.url}`
      );
    }

    const deployedBytes = Buffer.from(await response.arrayBuffer());
    const deployedHash = sha256(deployedBytes);
    if (deployedHash !== document.sha256) {
      throw new Error(
        `Deployed artifact hash mismatch for ${document.kind}: expected ${document.sha256}, received ${deployedHash}.`
      );
    }
  }

  const preflightRows = extractRows(queryProject(target, buildPreflightSql()));
  if (preflightRows.length !== 1) {
    throw new Error("Database preflight did not return exactly one aggregate row.");
  }
  const preflight = preflightRows[0];
  assertPreflight(preflight, options.target);
  const audit = queryProject(target, buildAuditSql(documents));
  const currentRows = extractRows(audit);

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        target,
        baseUrl,
        deployment,
        activationDate: options.activationDate,
        expectedHead: options.expectedHead,
        documents: documents.map(({ kind, version, path, url, sha256 }) => ({
          kind,
          version,
          path,
          url,
          sha256,
        })),
        currentRegister: currentRows,
        preflight,
      },
      null,
      2
    )
  );

  if (!options.apply) {
    console.log("Dry run complete; no database rows were changed.");
    return;
  }

  const preApplyDeployment = verifyVercelDeployment(
    baseUrl,
    options.expectedHead,
    options.target
  );
  assertSameDeployment(
    deployment,
    preApplyDeployment,
    "immediately before database activation"
  );

  const result = queryProject(
    target,
    buildActivationSql(documents, options.activationDate, options.target)
  );
  const rows = extractRows(result);
  assertReleasedRows(rows, documents, options.activationDate, options.target);
  const postflightRows = extractRows(queryProject(target, buildPreflightSql()));
  if (postflightRows.length !== 1) {
    throw new Error("Database postflight did not return exactly one aggregate row.");
  }
  const postflight = postflightRows[0];
  assertPostflight(preflight, postflight, options.target);
  const postApplyDeployment = verifyVercelDeployment(
    baseUrl,
    options.expectedHead,
    options.target
  );
  assertSameDeployment(
    deployment,
    postApplyDeployment,
    "after database activation postflight"
  );

  console.log(
    JSON.stringify(
      {
        activated: true,
        target,
        activationDate: options.activationDate,
        legalDocumentCount: rows.length,
        registrationAcceptanceCount:
          rows[0]?.registration_acceptance_count ?? null,
        documents: rows,
        postflight,
      },
      null,
      2
    )
  );
}

function buildAuditSql(documents) {
  const expectedValues = documents.map(toExpectedSqlValue).join(",\n    ");
  return `
with expected(document_kind, version, immutable_url, sha256) as (
  values
    ${expectedValues}
)
select
  document.document_kind,
  document.version,
  document.immutable_url,
  document.status,
  document.published_at,
  document.effective_at,
  document.sha256,
  (select count(*)::integer from public.registration_acceptances)
    as registration_acceptance_count,
  (select count(*)::integer from public.registrations)
    as registration_count,
  (
    select count(*)::integer
    from public.tournaments
    where registration_enabled is true
      and status in ('registration_open', 'in_progress')
  ) as active_registration_tournaments,
  (
    select count(*)::integer
    from public.registrations
    where registration_status in (
      'pending',
      'manual_review',
      'approved',
      'waitlisted'
    )
  ) as active_registration_cohort,
  (
    document.document_kind is not null
    and expected.document_kind is not null
    and document.version = expected.version
    and document.immutable_url = expected.immutable_url
    and document.sha256 = expected.sha256
  ) as expected_identity
from public.legal_documents as document
left join expected using (document_kind)
order by document.document_kind;
`;
}

function buildPreflightSql() {
  const path = resolve("scripts/phase15c/audit-release-preflight.sql");
  if (!existsSync(path)) {
    throw new Error("Phase 15C release-preflight SQL is missing.");
  }
  return readFileSync(path, "utf8");
}

function buildActivationSql(documents, activationDate, targetName) {
  const expectedValues = documents.map(toExpectedSqlValue).join(",\n      ");
  const insertValues = documents
    .map(
      (document) =>
        `(${sqlLiteral(document.kind)}, ${sqlLiteral(document.version)}, ${sqlLiteral(
          document.url
        )}, ${sqlLiteral(document.sha256)})`
    )
    .join(",\n      ");
  const productionEmptyDomainGate =
    targetName === "production"
      ? `
  if (select count(*) from public.registration_acceptances) <> 0 then
    raise exception 'Production registration_acceptances must remain empty during Phase 15C activation';
  end if;

  if (select count(*) from public.registrations) <> 0 then
    raise exception 'Production registrations must remain empty during Phase 15C activation';
  end if;

  if (
    select count(*)
    from public.tournaments
    where registration_enabled is true
      and status in ('registration_open', 'in_progress')
  ) <> 0 then
    raise exception 'Production has an active Tournament registration window';
  end if;

  if (
    select count(*)
    from public.registrations
    where registration_status in (
      'pending',
      'manual_review',
      'approved',
      'waitlisted'
    )
  ) <> 0 then
    raise exception 'Production has an active registration cohort';
  end if;
`
      : "";

  return `
begin;

do $phase15c$
declare
  v_activation_date date := date ${sqlLiteral(activationDate)};
  v_now timestamptz := clock_timestamp();
  v_existing_count integer;
  v_protected_public_before jsonb;
  v_protected_public_after jsonb;
  v_storage_before jsonb;
  v_storage_after jsonb;
begin
  if (v_now at time zone ${sqlLiteral(SYDNEY_TIME_ZONE)})::date
      is distinct from v_activation_date then
    raise exception 'Activation date is not the current Australia/Sydney date';
  end if;

  if to_regclass('public.legal_documents') is null
    or to_regclass('public.registration_acceptances') is null then
    raise exception 'Phase 15A legal-register schema is unavailable';
  end if;
${productionEmptyDomainGate}
  select count(*)::integer
  into v_existing_count
  from public.legal_documents;

  if v_existing_count <> 0 then
    raise exception 'Legal-register row count is %, expected the pre-activation value 0',
      v_existing_count;
  end if;

  select ${buildProtectedPublicCountsSql()}
  into v_protected_public_before;
  select ${buildStorageCountsSql()}
  into v_storage_before;

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
    ${insertValues}
  ) as expected(document_kind, version, immutable_url, sha256);

  if exists (
    with expected(document_kind, version, immutable_url, sha256) as (
      values
      ${expectedValues}
    )
    select 1
    from public.legal_documents as document
    full join expected using (document_kind)
    where document.document_kind is null
      or expected.document_kind is null
      or document.version is distinct from expected.version
      or document.immutable_url is distinct from expected.immutable_url
      or document.sha256 is distinct from expected.sha256
      or document.status is distinct from 'effective'
      or document.published_at is null
      or document.effective_at is null
      or (document.effective_at at time zone ${sqlLiteral(
        SYDNEY_TIME_ZONE
      )})::date is distinct from v_activation_date
  ) then
    raise exception 'Legal-register contents do not exactly match the approved four-document release';
  end if;

  if (select count(*) from public.legal_documents) <> 4 then
    raise exception 'Phase 15C activation must create exactly four legal-document rows';
  end if;

  select ${buildProtectedPublicCountsSql()}
  into v_protected_public_after;
  select ${buildStorageCountsSql()}
  into v_storage_after;

  if v_protected_public_after is distinct from v_protected_public_before then
    raise exception 'Phase 15C activation changed protected public-table counts';
  end if;

  if v_storage_after is distinct from v_storage_before then
    raise exception 'Phase 15C activation changed Storage object counts';
  end if;
end;
$phase15c$;

commit;

${buildAuditSql(documents)}
`;
}

function buildProtectedPublicCountsSql() {
  const rows = PROTECTED_PUBLIC_TABLES.map(
    (table) =>
      `select ${sqlLiteral(table)} as table_name, count(*)::bigint as row_count from public.${table}`
  ).join("\n      union all\n      ");

  return `(
    select coalesce(
      jsonb_object_agg(counts.table_name, counts.row_count),
      '{}'::jsonb
    )
    from (
      ${rows}
    ) as counts
  )`;
}

function buildStorageCountsSql() {
  return `jsonb_build_object(
    'total', (select count(*)::bigint from storage.objects),
    'by_bucket', (
      select coalesce(
        jsonb_object_agg(bucket_counts.bucket_id, bucket_counts.row_count),
        '{}'::jsonb
      )
      from (
        select object.bucket_id, count(*)::bigint as row_count
        from storage.objects as object
        group by object.bucket_id
      ) as bucket_counts
    )
  )`;
}

function queryProject(target, sql) {
  const temporarySqlPath = join(
    tmpdir(),
    `ironclad-phase15c-${target.ref}-${randomUUID()}.sql`
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
      target.ref,
      "--file",
      temporarySqlPath,
    ]);
    return parseLastJsonObject(output, `${target.name} database query`);
  } finally {
    if (existsSync(temporarySqlPath)) {
      unlinkSync(temporarySqlPath);
    }
  }
}

function extractRows(queryResult) {
  if (!queryResult || !Array.isArray(queryResult.rows)) {
    throw new Error("Supabase database query did not return a rows array.");
  }
  return queryResult.rows;
}

function assertPreflight(preflight, targetName) {
  for (const field of [
    "legal_document_count",
    "registration_acceptance_count",
    "registration_count",
    "active_registration_tournaments",
    "active_registration_cohort",
  ]) {
    if (!Number.isInteger(preflight[field]) || preflight[field] < 0) {
      throw new Error(`Database preflight returned an invalid ${field}.`);
    }
  }

  if (preflight.legal_document_count !== 0) {
    throw new Error(
      `Legal register contains ${preflight.legal_document_count} rows; activation requires exactly 0.`
    );
  }

  if (
    targetName === "production" &&
    (preflight.registration_acceptance_count !== 0 ||
      preflight.registration_count !== 0 ||
      preflight.active_registration_tournaments !== 0 ||
      preflight.active_registration_cohort !== 0)
  ) {
    throw new Error(
      "Production preflight requires zero acceptances, registrations, active registration Tournaments, and active cohort rows."
    );
  }

  if (
    !preflight.protected_public_counts ||
    typeof preflight.protected_public_counts !== "object" ||
    !preflight.storage_counts ||
    typeof preflight.storage_counts !== "object"
  ) {
    throw new Error("Protected-domain aggregate snapshots are unavailable.");
  }
}

function assertReleasedRows(rows, documents, activationDate, targetName) {
  if (rows.length !== DOCUMENTS.length) {
    throw new Error(`Post-activation audit returned ${rows.length} rows, expected 4.`);
  }

  for (const document of documents) {
    const matching = rows.filter((row) => row.document_kind === document.kind);
    if (matching.length !== 1) {
      throw new Error(`Post-activation audit did not return one ${document.kind} row.`);
    }

    const row = matching[0];
    if (
      row.version !== document.version ||
      row.immutable_url !== document.url ||
      row.status !== "effective" ||
      row.sha256 !== document.sha256 ||
      row.expected_identity !== true ||
      getSydneyDate(new Date(row.effective_at)) !== activationDate
    ) {
      throw new Error(`Post-activation audit failed for ${document.kind}.`);
    }
  }

  if (
    targetName === "production" &&
    rows.some(
      (row) =>
        row.registration_acceptance_count !== 0 ||
        row.registration_count !== 0 ||
        row.active_registration_tournaments !== 0 ||
        row.active_registration_cohort !== 0
    )
  ) {
    throw new Error("Production post-activation zero-domain audit failed.");
  }
}

function assertPostflight(preflight, postflight, targetName) {
  if (
    postflight.legal_document_count !== 4 ||
    postflight.registration_acceptance_count !==
      preflight.registration_acceptance_count ||
    postflight.registration_count !== preflight.registration_count ||
    postflight.active_registration_tournaments !==
      preflight.active_registration_tournaments ||
    postflight.active_registration_cohort !==
      preflight.active_registration_cohort ||
    stableJson(postflight.protected_public_counts) !==
      stableJson(preflight.protected_public_counts) ||
    stableJson(postflight.storage_counts) !== stableJson(preflight.storage_counts)
  ) {
    throw new Error(
      "Post-activation audit did not prove the exact +4 legal-document delta and protected-domain non-interference."
    );
  }

  if (
    targetName === "production" &&
    (postflight.registration_acceptance_count !== 0 ||
      postflight.registration_count !== 0 ||
      postflight.active_registration_tournaments !== 0 ||
      postflight.active_registration_cohort !== 0)
  ) {
    throw new Error("Production postflight zero-domain gate failed.");
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateBaseUrl(value, targetName) {
  if (!value) {
    throw new Error("--base-url is required for both Staging and Production.");
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
    parsed.hash
  ) {
    throw new Error(
      "--base-url must be an origin-only HTTPS URL without credentials, port, path, query, or fragment."
    );
  }

  const origin = parsed.origin.toLowerCase();
  if (targetName === "production") {
    if (origin !== PRODUCTION_BASE_URL) {
      throw new Error(
        `Production --base-url must be exactly ${PRODUCTION_BASE_URL}.`
      );
    }
  } else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(parsed.hostname)) {
    throw new Error(
      "Staging --base-url must identify the exact immutable HTTPS Vercel Preview deployment (*.vercel.app)."
    );
  }

  return origin;
}

function verifyVercelDeployment(baseUrl, expectedHead, targetName) {
  const inspected = parseLastJsonObject(
    runVercel(["inspect", baseUrl, "--json", "--no-color"]),
    "Vercel deployment inspection"
  );
  if (
    typeof inspected.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/.test(inspected.id) ||
    typeof inspected.url !== "string" ||
    inspected.readyState !== "READY"
  ) {
    throw new Error("Vercel deployment is not a uniquely identified READY deployment.");
  }

  if (
    targetName === "staging" &&
    `https://${inspected.url.toLowerCase()}` !== baseUrl
  ) {
    throw new Error(
      "Staging --base-url resolves through an alias; use the exact immutable deployment URL returned by Vercel."
    );
  }
  if (targetName === "production" && inspected.target !== "production") {
    throw new Error("The canonical Production base does not resolve to a Production deployment.");
  }

  const metadata = parseLastJsonObject(
    runVercel([
      "api",
      `/v13/deployments/${inspected.id}`,
      "--raw",
      "--scope",
      VERCEL_SCOPE,
    ]),
    "Vercel deployment metadata"
  );
  if (
    metadata.id !== inspected.id ||
    metadata.readyState !== "READY" ||
    metadata.gitSource?.sha !== expectedHead
  ) {
    throw new Error(
      `Vercel deployment head ${metadata.gitSource?.sha ?? "unavailable"} does not match expected head ${expectedHead}.`
    );
  }
  if (targetName === "staging" && metadata.target === "production") {
    throw new Error("Staging requires a Preview deployment, not a Production deployment.");
  }

  return {
    id: metadata.id,
    url: `https://${metadata.url}`,
    target: metadata.target ?? "preview",
    gitRef: metadata.gitSource?.ref ?? null,
    gitSha: metadata.gitSource.sha,
  };
}

function assertProductionExpectedHead(expectedHead) {
  runCommand("git", ["fetch", "--quiet", "origin", "master"]);
  const originMaster = runCommand("git", [
    "rev-parse",
    "refs/remotes/origin/master",
  ]).trim();

  if (originMaster !== expectedHead) {
    throw new Error(
      `Production expected head ${expectedHead} is not the fetched origin/master head ${originMaster}.`
    );
  }
}

function assertSameDeployment(expected, actual, checkpoint) {
  if (
    actual.id !== expected.id ||
    actual.url !== expected.url ||
    actual.target !== expected.target ||
    actual.gitSha !== expected.gitSha
  ) {
    throw new Error(
      `Vercel deployment changed ${checkpoint}; database activation cannot continue safely.`
    );
  }
}

function toExpectedSqlValue(document) {
  return `(${sqlLiteral(document.kind)}, ${sqlLiteral(
    document.version
  )}, ${sqlLiteral(document.url)}, ${sqlLiteral(document.sha256)})`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(bytes) {
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

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function parseLastJsonObject(value, label) {
  const starts = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "{") {
      starts.push(index);
    }
  }

  for (const start of starts) {
    try {
      return JSON.parse(value.slice(start));
    } catch {
      // The CLI may prefix a status line; keep looking for the JSON payload.
    }
  }

  throw new Error(`${label} did not return a parseable JSON object.`);
}

function parseArguments(arguments_) {
  const parsed = {
    activationDate: null,
    apply: false,
    baseUrl: null,
    expectedHead: null,
    help: false,
    target: null,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") {
      parsed.apply = true;
    } else if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else if (argument === "--activation-date") {
      parsed.activationDate = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--base-url") {
      parsed.baseUrl = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--expected-head") {
      parsed.expectedHead = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--target") {
      parsed.target = arguments_[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/phase15c/legal-document-register.mjs \\
    --target <staging|production> \\
    --base-url <exact-deployment-origin> \\
    --activation-date <YYYY-MM-DD> \\
    --expected-head <40-char-git-sha> \\
    [--apply]

Without --apply, the command validates identity, date, local artifacts, hashes,
deployed bytes, exact Git head, and current register state without changing the
database. Staging requires its exact immutable Vercel Preview origin;
Production requires ${PRODUCTION_BASE_URL}.`);
}
