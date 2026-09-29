// Generates a guarded transaction; it never connects to a database itself.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const STAGING_PROJECT_REF = "zzbnneprhjicmajpjkdg";
export const STAGING_LEGAL_BUCKET = "staging-legal-documents";
export const STAGING_LEGAL_STORAGE_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co/storage/v1/object/public/${STAGING_LEGAL_BUCKET}`;
const predecessors = [
  ["rulebook", "3.1", "02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2"],
  ["ppa", "3.1", "94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b"],
  ["terms", "1.1", "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1"],
  ["privacy", "1.2", "aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6"],
];
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function validateFourDivisionLegalRelease(root = process.cwd()) {
  const read = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
  const release = read("content/four-division-legal-release.json");
  const corpus = read("content/legal-corpus.json");
  const previous = read("content/legal-history/rulebook-ppa-v3.1-corpus.json");
  assert.equal(release.projectRef, STAGING_PROJECT_REF);
  assert.equal(release.environment, "staging");
  assert.equal(release.effectiveDate, "2026-09-29");
  assert.deepEqual(release.documents.map((document) => document.kind), ["rulebook", "ppa"]);
  for (const kind of ["terms", "privacy"]) {
    assert.deepEqual(corpus.documents.find((document) => document.kind === kind), previous.documents.find((document) => document.kind === kind));
  }
  for (const document of release.documents) {
    const source = corpus.documents.find((candidate) => candidate.kind === document.kind);
    assert.equal(source.version, "3.2");
    assert.equal(source.status, "Effective");
    assert.equal(source.effectiveDate, release.effectiveDate);
    assert.equal(source.filename, document.filename);
    assert.equal(source.publicPath, document.publicPath);
    assert.equal(hash(JSON.stringify(source)), document.sourceSha256);
    assert.equal(hash(readFileSync(path.join(root, "public", document.publicPath))), document.sha256);
  }
  for (const [kind, version, sha256] of predecessors) {
    const document = previous.documents.find((candidate) => candidate.kind === kind);
    assert.equal(document.version, version);
    assert.equal(hash(readFileSync(path.join(root, "public", document.publicPath))), sha256);
  }
  return release;
}

export function getFourDivisionLegalDocumentUrl(document, origin) {
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  assert.match(document.filename, /^ironclad-[a-z-]+-v3\.2\.pdf$/);
  if (origin === STAGING_LEGAL_STORAGE_ORIGIN) return `${origin}/${document.sha256}/${document.filename}`;
  assert.match(origin, /^https:\/\/ironclad-website-[a-z0-9]{9}-ironclad-tournaments\.vercel\.app$/, "Use the pinned Staging legal Storage origin or immutable tested Preview origin");
  return `${origin}${document.publicPath}`;
}

export function buildFourDivisionLegalSql({ projectRef, origin, apply = false, root = process.cwd() }) {
  assert.equal(projectRef, STAGING_PROJECT_REF, "Only the approved Staging project is authorized");
  const release = validateFourDivisionLegalRelease(root);
  const rows = predecessors.map(([kind, version, sha256]) => `('${kind}','${version}','${sha256}')`).join(",\n");
  const inserts = release.documents.map((document) => `('${document.kind}','3.2','${getFourDivisionLegalDocumentUrl(document, origin)}','effective',v_now,v_now,'${document.sha256}')`).join(",\n");
  const evidence = (table) => `(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.${table} r)`;
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.legal_documents in share row exclusive mode;
lock table public.registration_acceptances, public.account_legal_acceptances in share mode;
do $four_division_legal$
declare
  v_now timestamptz := clock_timestamp();
  v_registration_evidence text := ${evidence("registration_acceptances")};
  v_account_evidence text := ${evidence("account_legal_acceptances")};
  v_terms_privacy jsonb;
  v_predecessors jsonb;
  v_updated integer;
begin
  if (v_now at time zone 'Australia/Sydney')::date <> date '${release.effectiveDate}' then
    raise exception 'Legal successor date must match the actual Sydney publication date';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:four-division-legal-v3.2',0));
  if (select count(*) from public.legal_documents) <> 9
    or (select count(*) from public.legal_documents where status='effective') <> 4
    or exists (select 1 from (values ${rows}) expected(kind,version,sha256)
      left join public.legal_documents d on d.document_kind=expected.kind and d.version=expected.version
       and d.sha256=expected.sha256 and d.status='effective'
      where d.id is null) then
    raise exception 'Staging legal predecessor register changed; refuse publication';
  end if;
  select jsonb_agg(to_jsonb(d) order by d.id) into v_terms_privacy
    from public.legal_documents d where d.document_kind in ('terms','privacy');
  select jsonb_agg(to_jsonb(d)-'status'-'updated_at' order by d.id) into v_predecessors
    from public.legal_documents d;
  update public.legal_documents set status='superseded'
    where document_kind in ('rulebook','ppa') and version='3.1' and status='effective';
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then raise exception 'Exactly two predecessors must be superseded'; end if;
  insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
    values ${inserts};
  if (select count(*) from public.legal_documents) <> 11
    or (select count(*) from public.legal_documents where status='effective') <> 4
    or ${evidence("registration_acceptances")} is distinct from v_registration_evidence
    or ${evidence("account_legal_acceptances")} is distinct from v_account_evidence
    or (select jsonb_agg(to_jsonb(d) order by d.id) from public.legal_documents d where d.document_kind in ('terms','privacy')) is distinct from v_terms_privacy
    or (select jsonb_agg(to_jsonb(d)-'status'-'updated_at' order by d.id) from public.legal_documents d where d.version <> '3.2') is distinct from v_predecessors then
    raise exception 'Legal publication changed protected identities or acceptance evidence';
  end if;
end;
$four_division_legal$;
${apply ? "commit;" : "rollback;"}
`;
}
