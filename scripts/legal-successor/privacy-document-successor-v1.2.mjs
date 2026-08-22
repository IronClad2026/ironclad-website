#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RUNTIME_CORPUS_PATH = resolve("content/legal-corpus.json");
const RUNTIME_RELEASE_PATH = resolve("content/legal-successor-release.json");
const PUBLIC_DIRECTORY = resolve("public/documents-rules-ppa");

const PREDECESSORS = Object.freeze([
  Object.freeze({
    kind: "rulebook",
    sha256: "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
    version: "3.0",
  }),
  Object.freeze({
    kind: "ppa",
    sha256: "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
    version: "3.0",
  }),
  Object.freeze({
    kind: "terms",
    sha256: "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
    version: "1.1",
  }),
  Object.freeze({
    kind: "privacy",
    sha256: "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
    version: "1.1",
  }),
]);

const ACCOUNT_GATE_PREDECESSORS = Object.freeze([
  Object.freeze({
    effectiveDate: "2026-08-20",
    filename: "ironclad-terms-of-service-v1.1.pdf",
    kind: "terms",
    publicPath: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
    sha256: "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
    version: "1.1",
  }),
  Object.freeze({
    effectiveDate: "2026-08-20",
    filename: "ironclad-privacy-policy-v1.1.pdf",
    kind: "privacy",
    publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
    sha256: "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
    version: "1.1",
  }),
]);

export function validateReviewCandidate(candidate, corpus, release) {
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    candidate.status !== "Review Draft - Not Effective" ||
    candidate.runtimeActivated !== false ||
    candidate.effectiveDate !== null ||
    candidate.effectiveDateDisplay !== "TBD" ||
    candidate.preparedAgainstRuntime?.termsVersion !== "1.1" ||
    candidate.preparedAgainstRuntime?.privacyVersion !== "1.1" ||
    candidate.source?.path !== "content/legal-privacy-successor-v1.2.json" ||
    candidate.source?.version !== "1.2" ||
    !/^[0-9a-f]{64}$/.test(candidate.source?.sha256 ?? "") ||
    candidate.document?.kind !== "privacy" ||
    candidate.document?.version !== "1.2" ||
    candidate.document?.filename !== "ironclad-privacy-policy-v1.2.pdf" ||
    candidate.document?.publicPath !==
      "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf" ||
    !/^[0-9a-f]{64}$/.test(candidate.document?.sha256 ?? "") ||
    !Number.isSafeInteger(candidate.document?.size) ||
    candidate.document.size <= 0
  ) {
    throw new Error("The Privacy v1.2 review candidate is invalid.");
  }

  const expectedRuntime = new Map([
    [
      "rulebook",
      {
        effectiveDate: "2026-08-18",
        filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
        version: "3.0",
      },
    ],
    [
      "ppa",
      {
        effectiveDate: "2026-08-18",
        filename: "ironclad-player-participation-agreement-v3.0.pdf",
        version: "3.0",
      },
    ],
    [
      "terms",
      {
        effectiveDate: "2026-08-20",
        filename: "ironclad-terms-of-service-v1.1.pdf",
        version: "1.1",
      },
    ],
    [
      "privacy",
      {
        effectiveDate: "2026-08-20",
        filename: "ironclad-privacy-policy-v1.1.pdf",
        version: "1.1",
      },
    ],
  ]);
  if (
    corpus?.effectiveDate !== "2026-08-20" ||
    corpus?.effectiveDateDisplay !== "20 August 2026" ||
    !Array.isArray(corpus?.documents) ||
    corpus.documents.length !== 4
  ) {
    throw new Error("The runtime legal corpus is invalid.");
  }
  for (const [kind, expected] of expectedRuntime) {
    const document = corpus.documents.find((candidate) => candidate.kind === kind);
    if (
      !document ||
      document.version !== expected.version ||
      document.status !== "Effective" ||
      document.effectiveDate !== expected.effectiveDate ||
      document.filename !== expected.filename ||
      document.publicPath !== `/documents-rules-ppa/${expected.filename}`
    ) {
      throw new Error(
        `Runtime ${kind} must remain Effective v${expected.version}.`
      );
    }
  }

  const expectedRelease = new Map(
    PREDECESSORS.filter(
      (document) => document.kind === "terms" || document.kind === "privacy"
    ).map((document) => [document.kind, document])
  );
  if (
    release?.status !== "Final" ||
    release.effectiveDate !== "2026-08-20" ||
    release.effectiveDateDisplay !== "20 August 2026" ||
    !Array.isArray(release.documents) ||
    release.documents.length !== 2 ||
    [...expectedRelease].some(([kind, expected]) => {
      const document = release.documents.find(
        (candidate) => candidate.kind === kind
      );
      const runtime = expectedRuntime.get(kind);
      return (
        !document ||
        !runtime ||
        document.version !== expected.version ||
        document.effectiveDate !== runtime.effectiveDate ||
        document.filename !== runtime.filename ||
        document.publicPath !== `/documents-rules-ppa/${runtime.filename}` ||
        document.sha256 !== expected.sha256
      );
    })
  ) {
    throw new Error("The runtime Terms/Privacy release must remain v1.1/v1.1.");
  }
  return candidate.document;
}

export function validateFinalPrivacyRelease({
  activationDate,
  baseUrl,
  corpus,
  release,
}) {
  assertCalendarDate(activationDate);
  const origin = validateProductionOrigin(baseUrl);
  if (
    !corpus ||
    !Array.isArray(corpus.documents) ||
    corpus.documents.length !== 4
  ) {
    throw new Error("A finalized four-document corpus is required.");
  }
  const privacy = corpus.documents.find((document) => document.kind === "privacy");
  const terms = corpus.documents.find((document) => document.kind === "terms");
  if (
    !privacy ||
    privacy.version !== "1.2" ||
    privacy.status !== "Effective" ||
    privacy.effectiveDate !== activationDate ||
    privacy.filename !== "ironclad-privacy-policy-v1.2.pdf" ||
    privacy.publicPath !== "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf"
  ) {
    throw new Error("Finalized Privacy v1.2 is invalid.");
  }
  if (!terms || terms.version !== "1.1" || terms.status !== "Effective") {
    throw new Error("Terms v1.1 must remain Effective and unchanged.");
  }
  for (const predecessor of PREDECESSORS.filter(
    (document) => document.kind === "rulebook" || document.kind === "ppa"
  )) {
    const document = corpus.documents.find(
      (candidate) => candidate.kind === predecessor.kind
    );
    if (
      !document ||
      document.version !== predecessor.version ||
      document.status !== "Effective"
    ) {
      throw new Error(`${predecessor.kind} changed during Privacy finalization.`);
    }
  }
  if (
    !release ||
    release.schemaVersion !== 1 ||
    release.status !== "Final" ||
    release.effectiveDate !== activationDate ||
    release.effectiveDateDisplay !== "22 August 2026" ||
    !Array.isArray(release.predecessorDocuments) ||
    release.predecessorDocuments.length !== 2 ||
    !Array.isArray(release.documents) ||
    release.documents.length !== 1
  ) {
    throw new Error("A final one-document Privacy v1.2 release is required.");
  }
  for (const expected of ACCOUNT_GATE_PREDECESSORS) {
    const matches = release.predecessorDocuments.filter(
      (document) => document?.kind === expected.kind
    );
    if (
      matches.length !== 1 ||
      Object.entries(expected).some(
        ([field, value]) => matches[0]?.[field] !== value
      )
    ) {
      throw new Error(
        `Final Privacy v1.2 ${expected.kind} predecessor identity is invalid.`
      );
    }
  }
  const released = release.documents[0];
  if (
    released.kind !== "privacy" ||
    released.version !== "1.2" ||
    released.effectiveDate !== activationDate ||
    released.filename !== privacy.filename ||
    released.publicPath !== privacy.publicPath ||
    !/^[0-9a-f]{64}$/.test(released.sha256 ?? "")
  ) {
    throw new Error("Final Privacy v1.2 release identity is invalid.");
  }
  return {
    activationDate,
    immutableUrl: `${origin}${released.publicPath}`,
    release: released,
  };
}

export function buildPrivacyV12TransactionSql({
  activationDate,
  apply = false,
  immutableUrl,
  sha256,
}) {
  assertCalendarDate(activationDate);
  if (
    !/^https:\/\/www\.ironcladtournaments\.com\/documents-rules-ppa\/ironclad-privacy-policy-v1\.2\.pdf$/.test(
      immutableUrl ?? ""
    )
  ) {
    throw new Error("Privacy v1.2 requires its canonical immutable Production URL.");
  }
  if (!/^[0-9a-f]{64}$/.test(sha256 ?? "")) {
    throw new Error("Privacy v1.2 requires an exact lowercase SHA-256 hash.");
  }
  const finish = apply ? "commit;" : "rollback;";
  const predecessorValues = PREDECESSORS.map(
    (document) =>
      `(${sqlLiteral(document.kind)}, ${sqlLiteral(document.version)}, ${sqlLiteral(
        document.sha256
      )})`
  ).join(",\n        ");

  return `
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

do $privacy_v1_2$
declare
  v_now timestamptz := clock_timestamp();
  v_activation_date date := date ${sqlLiteral(activationDate)};
  v_registration_acceptances bigint;
  v_account_acceptances bigint;
  v_registrations bigint;
  v_updated bigint;
begin
  if (v_now at time zone 'Australia/Sydney')::date is distinct from v_activation_date then
    raise exception 'Privacy v1.2 activation date is not the current Australia/Sydney date';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:privacy-document-successor-v1.2', 0)
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

  if (select count(*) from public.legal_documents) <> 6
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or (select count(*) from public.legal_documents where status = 'superseded') <> 2 then
    raise exception 'Privacy v1.2 activation requires the exact v1.1 register shape';
  end if;

  if exists (
    select 1
    from (
      values
        ${predecessorValues}
    ) as expected(document_kind, version, sha256)
    left join public.legal_documents as document
      on document.document_kind = expected.document_kind
     and document.version = expected.version
     and document.sha256 = expected.sha256
     and document.status = 'effective'
    where document.id is null
  ) then
    raise exception 'Current legal register does not match the locked v1.1 predecessor set';
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
    and document_kind = 'privacy'
    and version = '1.1';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Exactly one Effective Privacy v1.1 row must be superseded';
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
    'privacy',
    '1.2',
    ${sqlLiteral(immutableUrl)},
    'effective',
    v_now,
    v_now,
    ${sqlLiteral(sha256)}
  );

  if (select count(*) from public.legal_documents) <> 7
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or (select count(*) from public.legal_documents where status = 'superseded') <> 3
    or (select count(*) from public.legal_documents where document_kind = 'terms' and version = '1.1' and status = 'effective') <> 1
    or (select count(*) from public.legal_documents where document_kind = 'privacy' and version = '1.2' and status = 'effective') <> 1
    or (select count(*) from public.registration_acceptances) is distinct from v_registration_acceptances
    or (select count(*) from public.account_legal_acceptances) is distinct from v_account_acceptances
    or (select count(*) from public.registrations) is distinct from v_registrations then
    raise exception 'Privacy v1.2 activation postcondition failed';
  end if;
end;
$privacy_v1_2$;

${finish}
`;
}

function assertCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new Error("Activation date must use YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Activation date is not a valid calendar date.");
  }
}

function validateProductionOrigin(value) {
  const url = new URL(value);
  if (
    url.origin !== "https://www.ironcladtournaments.com" ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Privacy v1.2 publication requires the canonical Production origin.");
  }
  return url.origin;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArguments(arguments_) {
  let activationDate = null;
  let apply = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--activation-date") {
      activationDate = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--apply") {
      apply = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  assertCalendarDate(activationDate);
  return { activationDate, apply };
}

function main() {
  const { activationDate, apply } = parseArguments(process.argv.slice(2));
  const corpus = JSON.parse(readFileSync(RUNTIME_CORPUS_PATH, "utf8"));
  const release = JSON.parse(readFileSync(RUNTIME_RELEASE_PATH, "utf8"));
  const validated = validateFinalPrivacyRelease({
    activationDate,
    baseUrl: "https://www.ironcladtournaments.com",
    corpus,
    release,
  });
  const pdfPath = join(PUBLIC_DIRECTORY, validated.release.filename);
  const pdfHash = createHash("sha256")
    .update(readFileSync(pdfPath))
    .digest("hex");
  if (pdfHash !== validated.release.sha256) {
    throw new Error("Final Privacy v1.2 PDF does not match its release manifest.");
  }
  console.log(
    buildPrivacyV12TransactionSql({
      activationDate,
      apply,
      immutableUrl: validated.immutableUrl,
      sha256: validated.release.sha256,
    })
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(
      `Privacy v1.2 publication SQL generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}
