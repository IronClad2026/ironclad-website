import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_PROJECT_REF = "nsyjtqpvyxlzyujlbzos";
export const PRODUCTION_ORIGIN = "https://www.ironcladtournaments.com";
const ACKNOWLEDGEMENT = "Release the approved candidate to Production.";
const current = [
  ["rulebook", "3.1", "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2"],
  ["ppa", "3.1", "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b"],
  ["terms", "1.1", "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1"],
  ["privacy", "1.3", "6e0d930983e2f7fb82b0e6fa17da52b8255a0102d23bd7532874db2aa28de00a"],
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

export function validateLegalArtifacts(root = process.cwd()) {
  const manifest = readJson(root, "content/production-four-division-legal-release.json");
  const corpus = readJson(root, "content/legal-corpus.json");
  const predecessor = readJson(root, "content/legal-history/production-rulebook-ppa-v3.1-corpus.json");
  const delivery = readJson(root, "content/legal-document-delivery.json");
  if (manifest.schemaVersion !== 1 || manifest.environment !== "production" ||
      manifest.projectRef !== PRODUCTION_PROJECT_REF || manifest.origin !== PRODUCTION_ORIGIN ||
      manifest.documents.length !== 2 || delivery.documents.length !== 12) {
    throw new Error("Production legal release identity is invalid.");
  }
  for (const protectedKind of ["terms", "privacy"]) {
    const before = predecessor.documents.find((document) => document.kind === protectedKind);
    const after = corpus.documents.find((document) => document.kind === protectedKind);
    if (!before || JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Production Terms or Privacy content changed.");
    }
  }
  const expected = new Map(current.map(([kind, version, sha256]) => [kind, { kind, version, sha256 }]));
  for (const document of manifest.documents) {
    if (!["rulebook", "ppa"].includes(document.kind) || document.version !== "3.2" ||
        !/^[a-f0-9]{64}$/.test(document.sha256) ||
        document.publicPath !== `/documents-rules-ppa/${document.filename}`) {
      throw new Error("Successor legal artifact is invalid.");
    }
    const bundled = corpus.documents.find((value) => value.kind === document.kind);
    if (bundled?.version !== document.version || bundled?.publicPath !== document.publicPath ||
        bundled?.effectiveDate !== document.effectiveDate ||
        createHash("sha256").update(JSON.stringify(bundled)).digest("hex") !== document.sourceSha256) throw new Error("Legal corpus is not aligned.");
    expected.set(document.kind, document);
  }
  if (new Set(manifest.documents.map((document) => document.kind)).size !== 2) {
    throw new Error("Both governing successors are required.");
  }
  for (const document of delivery.documents) {
    if (!/^\/documents-rules-ppa\/ironclad-[a-z-]+-v\d+\.\d+\.pdf$/.test(document.publicPath)) {
      throw new Error("Invalid PDF delivery path.");
    }
    const bytes = readFileSync(resolve(root, "public", `.${document.publicPath}`));
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" ||
        createHash("sha256").update(bytes).digest("hex") !== document.sha256) {
      throw new Error("Immutable legal PDF bytes changed.");
    }
  }
  for (const document of expected.values()) {
    if (!delivery.documents.some((value) => value.kind === document.kind &&
        value.version === document.version && value.sha256 === document.sha256)) {
      throw new Error("Expected governing document is not hash-bound for delivery.");
    }
  }
  return manifest;
}

// Offline SQL generation only. This module has no network or database client.
// Production execution is a separate, explicitly authorized release step.
export function buildProductionLegalSql({ projectRef, candidateSha, apply = false, authorization = "" }) {
  if (projectRef !== PRODUCTION_PROJECT_REF || !/^[a-f0-9]{40}$/.test(candidateSha ?? "")) {
    throw new Error("Exact Production project and candidate SHA are required.");
  }
  if (apply && authorization !== ACKNOWLEDGEMENT) throw new Error("Explicit Production release authorization is required.");
  const manifest = validateLegalArtifacts();
  const future = current.map((identity) => {
    const successor = manifest.documents.find((document) => document.kind === identity[0]);
    return successor ? [successor.kind, successor.version, successor.sha256] : identity;
  });
  const values = (identities) => identities.map((identity) => `(${identity.map(literal).join(", ")})`).join(",\n");
  const futureValues = values(future);
  return `-- Prepared for ${PRODUCTION_PROJECT_REF}; candidate ${candidateSha}.
-- Never execute before terminal-state GO, verified backup/restore, exact-head CI and user authorization.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';
do $production_legal_3_2$
declare
  v_now timestamptz := clock_timestamp();
  v_registration_hash text;
  v_account_hash text;
  v_registrations_hash text;
  v_existing_legal jsonb;
begin
  if current_setting('ironclad.release_project_ref', true) is distinct from '${PRODUCTION_PROJECT_REF}'
     or current_setting('ironclad.release_candidate_sha', true) is distinct from '${candidateSha}' then
    raise exception 'Missing independently verified Production target/candidate session attestation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:production-legal-3.2', 0));
  lock table public.legal_documents, public.registration_acceptances, public.account_legal_acceptances,
    public.registrations in share row exclusive mode;
  if (select count(*) from public.legal_documents where status='effective') <> 4 then
    raise exception 'Legal effective set is not exactly four documents';
  end if;
  if not exists (
    select 1 from (values ${futureValues}) as expected(kind, version, hash)
    left join public.legal_documents d on d.document_kind=expected.kind and d.version=expected.version
      and d.sha256=expected.hash and d.status='effective'
    where d.id is null
  ) then
    if (select count(*) from public.legal_documents) <> 12 or exists (
      select 1 from (values ${manifest.documents.map((document) => `(${literal(document.kind)},${literal(PRODUCTION_ORIGIN + document.publicPath)})`).join(",")}) as expected(kind,url)
      left join public.legal_documents d on d.document_kind=expected.kind and d.version='3.2'
        and d.immutable_url=expected.url and d.status='effective' where d.id is null
    ) then raise exception 'Retry legal set has drifted'; end if;
    return;
  end if;
  if (select count(*) from public.legal_documents) <> 10 or exists (
    select 1 from (values ${values(current)}) as expected(kind, version, hash)
    left join public.legal_documents d on d.document_kind=expected.kind and d.version=expected.version
      and d.sha256=expected.hash and d.status='effective'
    where d.id is null
  ) or exists (select 1 from public.legal_documents where (document_kind,version) in (('rulebook','3.2'),('ppa','3.2'))) then
    raise exception 'Legal registry differs from locked Production baseline';
  end if;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) into v_registration_hash from public.registration_acceptances a;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) into v_account_hash from public.account_legal_acceptances a;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) into v_registrations_hash from public.registrations r;
  select coalesce(jsonb_agg(to_jsonb(d) - 'status' - 'updated_at' order by d.id),'[]'::jsonb) into v_existing_legal from public.legal_documents d;
  update public.legal_documents set status='superseded'
    where document_kind in ('rulebook','ppa') and version='3.1' and status='effective';
${manifest.documents.map((document) => `  insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
    values (${literal(document.kind)},'3.2',${literal(PRODUCTION_ORIGIN + document.publicPath)},'effective',v_now,v_now,${literal(document.sha256)});`).join("\n")}
  if (select count(*) from public.legal_documents) <> 12
    or (select count(*) from public.legal_documents where status='effective') <> 4
    or exists (select 1 from (values ${futureValues}) as expected(kind, version, hash)
       left join public.legal_documents d on d.document_kind=expected.kind and d.version=expected.version
         and d.sha256=expected.hash and d.status='effective' where d.id is null)
    or (select coalesce(jsonb_agg(to_jsonb(d) - 'status' - 'updated_at' order by d.id),'[]'::jsonb)
        from public.legal_documents d where (d.document_kind,d.version) not in (('rulebook','3.2'),('ppa','3.2'))) is distinct from v_existing_legal
    or (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.registration_acceptances a) is distinct from v_registration_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.account_legal_acceptances a) is distinct from v_account_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) from public.registrations r) is distinct from v_registrations_hash then
    raise exception 'Legal publication changed historical authority or acceptance evidence';
  end if;
end;
$production_legal_3_2$;
${apply ? "commit;" : "rollback;"}
`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [command, candidateSha] = process.argv.slice(2);
  if (command === "check") {
    validateLegalArtifacts();
    console.log("Production legal artifacts verified; no publication performed.");
  } else if (command === "dry-run-sql") {
    console.log(buildProductionLegalSql({ projectRef: PRODUCTION_PROJECT_REF, candidateSha }));
  } else {
    throw new Error("Use check or dry-run-sql <exact-candidate-sha>. Production execution is unavailable in this CLI.");
  }
}
