#!/usr/bin/env node

// Generate reviewed activation SQL only. This module never opens a database connection.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { validateP03LegalRuntime } from "./p03-legal-runtime.mjs";
import { assertPdfEffectiveDate, formatActivationDateDisplay } from "../phase15c/release-artifact-contract.mjs";
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateP03PrivacyPublication({ predecessor, corpus, release, pdfBytes }) {
  const date = release?.effectiveDate;
  const display = formatActivationDateDisplay(date);
  if (release.schemaVersion !== 1 || release.status !== "Final" || release.documents?.length !== 1
    || release.predecessorDocuments?.length !== 2 || corpus.documents?.length !== 4
    || corpus.effectiveDate !== date || corpus.effectiveDateDisplay !== display) throw new Error("Invalid Final Privacy v1.3 publication package.");
  const next = release.documents[0];
  if (next.kind !== "privacy" || next.version !== "1.3" || next.filename !== "ironclad-privacy-policy-v1.3.pdf"
    || next.publicPath !== "/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf" || next.effectiveDate !== date
    || next.sha256 !== hash(pdfBytes)) throw new Error("Privacy v1.3 artifact identity mismatch.");
  const currentPrivacy = corpus.documents.find((document) => document.kind === "privacy");
  if (currentPrivacy?.version !== "1.3" || currentPrivacy.status !== "Effective" || currentPrivacy.effectiveDate !== date
    || currentPrivacy.filename !== next.filename || currentPrivacy.publicPath !== next.publicPath) throw new Error("Final Privacy corpus differs.");
  for (const previous of predecessor.documents) {
    if (previous.kind !== "privacy" && JSON.stringify(corpus.documents.find((document) => document.kind === previous.kind)) !== JSON.stringify(previous)) throw new Error("Unchanged legal document differs.");
  }
  for (const kind of ["terms", "privacy"]) {
    const previous = predecessor.documents.find((document) => document.kind === kind);
    const rows = release.predecessorDocuments.filter((document) => document.kind === kind);
    if (rows.length !== 1 || previous?.version !== (kind === "terms" ? "1.1" : "1.2")
      || ["version", "filename", "publicPath", "effectiveDate"].some((key) => rows[0][key] !== previous[key])
      || rows[0].sha256 !== hash(readFileSync(join("public", previous.publicPath)))) throw new Error("Predecessor legal pair differs.");
  }
  assertPdfEffectiveDate(pdfBytes, display, "privacy");
  return { date, sha256: next.sha256, immutableUrl: `https://www.ironcladtournaments.com${next.publicPath}` };
}

export function buildP03PrivacyPublicationSql({ predecessor, date, sha256, apply = false }) {
  formatActivationDateDisplay(date);
  if (!/^[0-9a-f]{64}$/.test(sha256) || predecessor.documents?.length !== 4) throw new Error("Invalid exact publication identity.");
  const identities = predecessor.documents.map((document) => {
    const expected = { terms: "1.1", privacy: "1.2", rulebook: "3.1", ppa: "3.1" }[document.kind];
    if (document.version !== expected || document.status !== "Effective") throw new Error("Unexpected legal predecessor.");
    return `(${literal(document.kind)}, ${literal(document.version)}, ${literal(hash(readFileSync(join("public", document.publicPath))))})`;
  }).join(",\n      ");
  return `begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';
do $p03_privacy_successor$
declare
  v_now timestamptz := clock_timestamp();
  v_before jsonb;
  v_registration_acceptances bigint;
  v_account_acceptances bigint;
  v_count bigint;
  v_match_room_setting jsonb;
begin
  if (v_now at time zone 'Australia/Sydney')::date <> date ${literal(date)} then
    raise exception 'Publication date must be the actual Australia/Sydney date';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:p03-privacy-v1.3', 0)) then
    raise exception 'Privacy publication already running';
  end if;
  select value into v_match_room_setting from public.platform_settings where key = 'match_room' for share;
  if v_match_room_setting is distinct from '{"enabled":false}'::jsonb then
    raise exception 'Match Room must remain OFF during Privacy publication';
  end if;
  perform id from public.legal_documents order by document_kind, created_at for update;
  if (select count(*) from public.legal_documents where status = 'effective') <> 4
    or exists (select 1 from public.legal_documents where document_kind='privacy' and version='1.3')
    or exists (
      select 1 from (values ${identities}) as expected(kind, version, sha256)
      left join public.legal_documents document on document.document_kind=expected.kind
        and document.version=expected.version and document.sha256=expected.sha256 and document.status='effective'
      where document.id is null
    ) then raise exception 'Effective legal predecessors or successor identity differ'; end if;
  select jsonb_agg(to_jsonb(document) order by id) into v_before from public.legal_documents document
    where not (document_kind='privacy' and version='1.2' and status='effective');
  select count(*) into v_registration_acceptances from public.registration_acceptances;
  select count(*) into v_account_acceptances from public.account_legal_acceptances;
  update public.legal_documents set status='superseded'
    where document_kind='privacy' and version='1.2' and status='effective';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Exactly one Privacy predecessor must be superseded'; end if;
  insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
    values('privacy','1.3','https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf','effective',v_now,v_now,${literal(sha256)});
  if (select count(*) from public.legal_documents where status='effective') <> 4
    or (select count(*) from public.registration_acceptances) <> v_registration_acceptances
    or (select count(*) from public.account_legal_acceptances) <> v_account_acceptances
    or (select jsonb_agg(to_jsonb(document) order by id) from public.legal_documents document
      where not (document_kind='privacy' and version in ('1.2','1.3'))) is distinct from
      (select jsonb_agg(value order by value->>'id') from jsonb_array_elements(v_before) where not (value->>'document_kind'='privacy' and value->>'version'='1.2'))
    then raise exception 'Privacy publication postcondition failed'; end if;
end;
$p03_privacy_successor$;
${apply ? "commit;" : "rollback;"}
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const values = {};
  for (let i=0;i<args.length;i+=2) {
    if (!["--package-dir", "--out", "--approval"].includes(args[i]) || !args[i+1]) throw new Error("Expected explicit package directory/output and optional release approval.");
    values[args[i]]=args[i+1];
  }
  if (!values["--package-dir"] || !values["--out"]) throw new Error("Package directory and new output file are required.");
  if (values["--approval"] && values["--approval"] !== "PROCEED WITH P03 PRODUCTION RELEASE") throw new Error("Exact future user release instruction required.");
  const predecessor = JSON.parse(readFileSync("docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json","utf8"));
  const directory = resolve(values["--package-dir"]);
  const packageInput = { predecessor,
    corpus: JSON.parse(readFileSync(join(directory,"legal-corpus.json"),"utf8")),
    release: JSON.parse(readFileSync(join(directory,"legal-successor-release.json"),"utf8")),
    pdfBytes: readFileSync(join(directory,"ironclad-privacy-policy-v1.3.pdf")),
  };
  const runtime = validateP03LegalRuntime(process.cwd());
  if (runtime.mode !== "finalized-successor"
    || !isDeepStrictEqual(packageInput.corpus, JSON.parse(readFileSync("content/legal-corpus.json", "utf8")))
    || !isDeepStrictEqual(packageInput.release, JSON.parse(readFileSync("content/legal-successor-release.json", "utf8")))
    || !packageInput.pdfBytes.equals(readFileSync("public/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf"))) {
    throw new Error("Publication package must equal the exact finalized candidate runtime.");
  }
  const publication = validateP03PrivacyPublication(packageInput);
  writeFileSync(resolve(values["--out"]), buildP03PrivacyPublicationSql({ predecessor, ...publication, apply: !!values["--approval"] }), {flag:"wx"});
  console.log(JSON.stringify({status: values["--approval"] ? "APPROVAL-BOUND SQL PREPARED; NOT EXECUTED" : "ROLLBACK-ONLY SQL PREPARED; NOT EXECUTED"}));
}
