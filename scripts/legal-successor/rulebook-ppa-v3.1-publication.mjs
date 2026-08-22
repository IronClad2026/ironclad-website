#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACTIVATION_DATE = "2026-08-22";
const CANONICAL_PRODUCTION_ORIGIN =
  "https://www.ironcladtournaments.com";
const RUNTIME_CORPUS_PATH = resolve("content/legal-corpus.json");
const PUBLIC_DIRECTORY = resolve("public/documents-rules-ppa");

const CURRENT_EFFECTIVE = Object.freeze([
  Object.freeze({
    effectiveDate: "2026-08-18",
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    kind: "rulebook",
    publicPath:
      "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    sha256:
      "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
    version: "3.0",
  }),
  Object.freeze({
    effectiveDate: "2026-08-18",
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    kind: "ppa",
    publicPath:
      "/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
    sha256:
      "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
    version: "3.0",
  }),
  Object.freeze({
    effectiveDate: "2026-08-20",
    filename: "ironclad-terms-of-service-v1.1.pdf",
    kind: "terms",
    publicPath: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
    sha256:
      "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
    version: "1.1",
  }),
  Object.freeze({
    effectiveDate: ACTIVATION_DATE,
    filename: "ironclad-privacy-policy-v1.2.pdf",
    kind: "privacy",
    publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf",
    sha256:
      "aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6",
    version: "1.2",
  }),
]);

const STAGING_CURRENT_PRIVACY = Object.freeze({
  effectiveDate: "2026-08-20",
  filename: "ironclad-privacy-policy-v1.1.pdf",
  kind: "privacy",
  publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
  sha256: "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
  version: "1.1",
});

const STAGING_CURRENT_EFFECTIVE = Object.freeze([
  ...CURRENT_EFFECTIVE.slice(0, 3),
  STAGING_CURRENT_PRIVACY,
]);

const SUCCESSORS = Object.freeze([
  Object.freeze({
    effectiveDate: ACTIVATION_DATE,
    filename: "ironclad-official-tournament-rulebook-v3.1.pdf",
    kind: "rulebook",
    publicPath:
      "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf",
    sha256:
      "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2",
    version: "3.1",
  }),
  Object.freeze({
    effectiveDate: ACTIVATION_DATE,
    filename: "ironclad-player-participation-agreement-v3.1.pdf",
    kind: "ppa",
    publicPath:
      "/documents-rules-ppa/ironclad-player-participation-agreement-v3.1.pdf",
    sha256:
      "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b",
    version: "3.1",
  }),
]);

const ARTIFACTS = Object.freeze([
  ...CURRENT_EFFECTIVE,
  STAGING_CURRENT_PRIVACY,
  ...SUCCESSORS,
]);

export function validateRulebookPpaV31Source({ artifactHashes, corpus }) {
  if (
    !corpus ||
    corpus.schemaVersion !== 1 ||
    corpus.effectiveDate !== ACTIVATION_DATE ||
    corpus.effectiveDateDisplay !== "22 August 2026" ||
    !Array.isArray(corpus.documents) ||
    corpus.documents.length !== 4
  ) {
    throw new Error("The final four-document runtime corpus is invalid.");
  }

  const expectedRuntime = new Map(
    [...SUCCESSORS, ...CURRENT_EFFECTIVE.filter((document) =>
      document.kind === "terms" || document.kind === "privacy"
    )].map((document) => [document.kind, document])
  );
  const runtimeKinds = new Set();
  for (const document of corpus.documents) {
    const expected = expectedRuntime.get(document?.kind);
    if (
      !expected ||
      runtimeKinds.has(document.kind) ||
      document.version !== expected.version ||
      document.status !== "Effective" ||
      document.effectiveDate !== expected.effectiveDate ||
      document.filename !== expected.filename ||
      document.publicPath !== expected.publicPath
    ) {
      throw new Error("The runtime legal document identities are invalid.");
    }
    runtimeKinds.add(document.kind);
  }
  if (runtimeKinds.size !== expectedRuntime.size) {
    throw new Error("The runtime legal document set is incomplete.");
  }

  const hashes = normalizeArtifactHashes(artifactHashes);
  if (hashes.size !== ARTIFACTS.length) {
    throw new Error("Exactly seven locked legal artifacts are required.");
  }
  for (const artifact of ARTIFACTS) {
    if (hashes.get(artifact.filename) !== artifact.sha256) {
      throw new Error(`Artifact hash mismatch: ${artifact.filename}`);
    }
  }

  return Object.freeze({
    activationDate: ACTIVATION_DATE,
    successors: SUCCESSORS,
  });
}

export function validatePublicationOrigin({ environment, origin }) {
  if (!new Set(["preview", "production", "staging"]).has(environment)) {
    throw new Error("Environment must be preview, staging, or production.");
  }

  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Publication origin must be an absolute HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Publication origin must be an exact HTTPS origin.");
  }

  if (environment === "production") {
    if (url.origin !== CANONICAL_PRODUCTION_ORIGIN) {
      throw new Error(
        "Production publication requires the canonical IronClad origin."
      );
    }
  } else if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(
      url.hostname
    )
  ) {
    throw new Error(
      "Preview and Staging publication require an exact HTTPS Vercel origin."
    );
  }

  return url.origin;
}

export function buildRulebookPpaV31TransactionSql({
  apply = false,
  environment,
  origin,
}) {
  const publicationOrigin = validatePublicationOrigin({ environment, origin });
  const currentEffective =
    environment === "staging" ? STAGING_CURRENT_EFFECTIVE : CURRENT_EFFECTIVE;
  const registerShape =
    environment === "staging"
      ? Object.freeze({
          beforeTotal: 6,
          beforeSuperseded: 2,
          afterTotal: 8,
          afterSuperseded: 4,
          label: "six-row Staging v1.1 register",
        })
      : Object.freeze({
          beforeTotal: 7,
          beforeSuperseded: 3,
          afterTotal: 9,
          afterSuperseded: 5,
          label: "seven-row v1.2 register",
        });
  const expectedEffectiveValues = currentEffective.map(
    (document) =>
      `(${sqlLiteral(document.kind)}, ${sqlLiteral(
        document.version
      )}, ${sqlLiteral(document.sha256)})`
  ).join(",\n        ");
  const finish = apply ? "commit;" : "rollback;";

  return `
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

do $rulebook_ppa_v3_1$
declare
  v_now timestamptz := clock_timestamp();
  v_activation_date date := date '${ACTIVATION_DATE}';
  v_rulebook_id uuid;
  v_ppa_id uuid;
  v_terms_id uuid;
  v_privacy_id uuid;
  v_new_rulebook_id uuid;
  v_new_ppa_id uuid;
  v_registration_acceptances bigint;
  v_registration_acceptance_ids uuid[];
  v_account_acceptances bigint;
  v_account_acceptance_ids uuid[];
  v_registrations bigint;
  v_updated bigint;
begin
  if (v_now at time zone 'Australia/Sydney')::date is distinct from v_activation_date then
    raise exception 'Rulebook/PPA v3.1 activation date is not the current Australia/Sydney date';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:rulebook-ppa-successor-v3.1', 0)
  );

  if to_regclass('public.legal_documents') is null
    or to_regclass('public.registration_acceptances') is null
    or to_regclass('public.account_legal_acceptances') is null
    or to_regclass('public.registrations') is null then
    raise exception 'Required legal-evidence schema is unavailable';
  end if;

  perform document.id
  from public.legal_documents as document
  where document.status = 'effective'
  order by document.document_kind, document.id
  for update;

  if (select count(*) from public.legal_documents) <> ${registerShape.beforeTotal}
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or (select count(*) from public.legal_documents where status = 'superseded') <> ${registerShape.beforeSuperseded} then
    raise exception 'Rulebook/PPA v3.1 activation requires the exact ${registerShape.label} shape';
  end if;

  if exists (
    select 1
    from (
      values
        ${expectedEffectiveValues}
    ) as expected(document_kind, version, sha256)
    left join public.legal_documents as document
      on document.document_kind = expected.document_kind
     and document.version = expected.version
     and document.sha256 = expected.sha256
     and document.status = 'effective'
    where document.id is null
  ) then
    raise exception 'Current legal register does not match the exact locked environment baseline';
  end if;

  select document.id into strict v_rulebook_id
  from public.legal_documents as document
  where document.document_kind = 'rulebook'
    and document.version = '3.0'
    and ${currentImmutableUrlPredicate({
      alias: "document",
      document: currentEffective[0],
      environment,
      publicationOrigin,
    })}
    and document.sha256 = '${currentEffective[0].sha256}'
    and document.status = 'effective';

  select document.id into strict v_ppa_id
  from public.legal_documents as document
  where document.document_kind = 'ppa'
    and document.version = '3.0'
    and ${currentImmutableUrlPredicate({
      alias: "document",
      document: currentEffective[1],
      environment,
      publicationOrigin,
    })}
    and document.sha256 = '${currentEffective[1].sha256}'
    and document.status = 'effective';

  select document.id into strict v_terms_id
  from public.legal_documents as document
  where document.document_kind = 'terms'
    and document.version = '1.1'
    and ${currentImmutableUrlPredicate({
      alias: "document",
      document: currentEffective[2],
      environment,
      publicationOrigin,
    })}
    and document.sha256 = '${currentEffective[2].sha256}'
    and document.status = 'effective';

  select document.id into strict v_privacy_id
  from public.legal_documents as document
  where document.document_kind = 'privacy'
    and document.version = '${currentEffective[3].version}'
    and ${currentImmutableUrlPredicate({
      alias: "document",
      document: currentEffective[3],
      environment,
      publicationOrigin,
    })}
    and document.sha256 = '${currentEffective[3].sha256}'
    and document.status = 'effective';

  select
    count(*),
    coalesce(array_agg(acceptance.id order by acceptance.id), array[]::uuid[])
  into v_registration_acceptances, v_registration_acceptance_ids
  from public.registration_acceptances as acceptance;
  select
    count(*),
    coalesce(array_agg(acceptance.id order by acceptance.id), array[]::uuid[])
  into v_account_acceptances, v_account_acceptance_ids
  from public.account_legal_acceptances as acceptance;
  select count(*) into v_registrations
  from public.registrations;

  update public.legal_documents
  set status = 'superseded'
  where id = v_rulebook_id
    and document_kind = 'rulebook'
    and version = '3.0'
    and ${currentImmutableUrlPredicate({
      document: currentEffective[0],
      environment,
      publicationOrigin,
    })}
    and sha256 = '${currentEffective[0].sha256}'
    and status = 'effective';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Exactly one locked Rulebook v3.0 row must be superseded';
  end if;

  update public.legal_documents
  set status = 'superseded'
  where id = v_ppa_id
    and document_kind = 'ppa'
    and version = '3.0'
    and ${currentImmutableUrlPredicate({
      document: currentEffective[1],
      environment,
      publicationOrigin,
    })}
    and sha256 = '${currentEffective[1].sha256}'
    and status = 'effective';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Exactly one locked PPA v3.0 row must be superseded';
  end if;

  insert into public.legal_documents (
    document_kind,
    version,
    immutable_url,
    status,
    published_at,
    effective_at,
    sha256
  ) values (
    'rulebook',
    '3.1',
    ${sqlLiteral(`${publicationOrigin}${SUCCESSORS[0].publicPath}`)},
    'effective',
    v_now,
    v_now,
    '${SUCCESSORS[0].sha256}'
  ) returning id into strict v_new_rulebook_id;

  insert into public.legal_documents (
    document_kind,
    version,
    immutable_url,
    status,
    published_at,
    effective_at,
    sha256
  ) values (
    'ppa',
    '3.1',
    ${sqlLiteral(`${publicationOrigin}${SUCCESSORS[1].publicPath}`)},
    'effective',
    v_now,
    v_now,
    '${SUCCESSORS[1].sha256}'
  ) returning id into strict v_new_ppa_id;

  if (select count(*) from public.legal_documents) <> ${registerShape.afterTotal}
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or (select count(*) from public.legal_documents where status = 'superseded') <> ${registerShape.afterSuperseded}
    or not exists (
      select 1 from public.legal_documents
      where id = v_rulebook_id
        and document_kind = 'rulebook'
        and version = '3.0'
        and ${currentImmutableUrlPredicate({
          document: currentEffective[0],
          environment,
          publicationOrigin,
        })}
        and sha256 = '${currentEffective[0].sha256}'
        and status = 'superseded'
    )
    or not exists (
      select 1 from public.legal_documents
      where id = v_ppa_id
        and document_kind = 'ppa'
        and version = '3.0'
        and ${currentImmutableUrlPredicate({
          document: currentEffective[1],
          environment,
          publicationOrigin,
        })}
        and sha256 = '${currentEffective[1].sha256}'
        and status = 'superseded'
    )
    or not exists (
      select 1 from public.legal_documents
      where id = v_terms_id
        and document_kind = 'terms'
        and version = '1.1'
        and ${currentImmutableUrlPredicate({
          document: currentEffective[2],
          environment,
          publicationOrigin,
        })}
        and sha256 = '${currentEffective[2].sha256}'
        and status = 'effective'
    )
    or not exists (
      select 1 from public.legal_documents
      where id = v_privacy_id
        and document_kind = 'privacy'
        and version = '${currentEffective[3].version}'
        and ${currentImmutableUrlPredicate({
          document: currentEffective[3],
          environment,
          publicationOrigin,
        })}
        and sha256 = '${currentEffective[3].sha256}'
        and status = 'effective'
    )
    or not exists (
      select 1 from public.legal_documents
      where id = v_new_rulebook_id
        and document_kind = 'rulebook'
        and version = '3.1'
        and immutable_url = ${sqlLiteral(
          `${publicationOrigin}${SUCCESSORS[0].publicPath}`
        )}
        and sha256 = '${SUCCESSORS[0].sha256}'
        and status = 'effective'
    )
    or not exists (
      select 1 from public.legal_documents
      where id = v_new_ppa_id
        and document_kind = 'ppa'
        and version = '3.1'
        and immutable_url = ${sqlLiteral(
          `${publicationOrigin}${SUCCESSORS[1].publicPath}`
        )}
        and sha256 = '${SUCCESSORS[1].sha256}'
        and status = 'effective'
    )
    or (select count(*) from public.registration_acceptances) is distinct from v_registration_acceptances
    or (select coalesce(array_agg(acceptance.id order by acceptance.id), array[]::uuid[])
        from public.registration_acceptances as acceptance) is distinct from v_registration_acceptance_ids
    or (select count(*) from public.account_legal_acceptances) is distinct from v_account_acceptances
    or (select coalesce(array_agg(acceptance.id order by acceptance.id), array[]::uuid[])
        from public.account_legal_acceptances as acceptance) is distinct from v_account_acceptance_ids
    or (select count(*) from public.registrations) is distinct from v_registrations then
    raise exception 'Rulebook/PPA v3.1 activation postcondition failed';
  end if;
end;
$rulebook_ppa_v3_1$;

${finish}
`;
}

function currentImmutableUrlPredicate({
  alias = null,
  document,
  environment,
  publicationOrigin,
}) {
  const column = alias ? `${alias}.immutable_url` : "immutable_url";
  if (environment === "production") {
    return `${column} = ${sqlLiteral(
      `${publicationOrigin}${document.publicPath}`
    )}`;
  }

  const pathPattern = document.publicPath.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  return `${column} ~ ${sqlLiteral(
    `^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.vercel\\.app${pathPattern}$`
  )}`;
}

function normalizeArtifactHashes(candidate) {
  if (candidate instanceof Map) {
    return candidate;
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return new Map(Object.entries(candidate));
  }
  throw new Error("Artifact hashes must be supplied as a Map or object.");
}

function readArtifactHashes() {
  return new Map(
    ARTIFACTS.map((artifact) => {
      const bytes = readFileSync(join(PUBLIC_DIRECTORY, artifact.filename));
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error(`Artifact is not a PDF: ${artifact.filename}`);
      }
      return [
        artifact.filename,
        createHash("sha256").update(bytes).digest("hex"),
      ];
    })
  );
}

function parseArguments(arguments_) {
  let apply = false;
  let environment = null;
  let origin = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--environment") {
      environment = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--origin") {
      origin = arguments_[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  validatePublicationOrigin({ environment, origin });
  return { apply, environment, origin };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const corpus = JSON.parse(readFileSync(RUNTIME_CORPUS_PATH, "utf8"));
  validateRulebookPpaV31Source({
    artifactHashes: readArtifactHashes(),
    corpus,
  });
  console.log(buildRulebookPpaV31TransactionSql(arguments_));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(
      `Rulebook/PPA v3.1 publication SQL generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}
