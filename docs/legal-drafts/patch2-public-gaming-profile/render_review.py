"""Render offline review copies from the pinned corpus and draft provisions."""

import hashlib
import importlib.util
import json
import re
from argparse import ArgumentParser
from datetime import date
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MANIFEST = json.loads((HERE / "review-manifest.json").read_text(encoding="utf-8"))


def require_text(path, expected_sha):
    value = path.read_text(encoding="utf-8")
    if hashlib.sha256(value.encode("utf-8")).hexdigest() != expected_sha:
        raise ValueError(f"Review source drifted: {path.name}")
    return value


def write_json(path, value):
    path.write_bytes((json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))


def build_review_corpus():
    originals = {path: require_text(ROOT / path, digest) for path, digest in MANIFEST["predecessorSources"].items()}
    corpus = json.loads(originals["content/legal-corpus.json"])
    delivery = json.loads(originals["content/legal-document-delivery.json"])
    text = require_text(HERE / MANIFEST["source"]["path"], MANIFEST["source"]["sha256"])
    documents = {document["kind"]: document for document in corpus["documents"]}

    def clause(prefix):
        matches = [line.split("**", 2)[2].strip() for line in text.splitlines() if line.startswith(prefix)]
        if len(matches) != 1:
            raise ValueError(f"Expected one review clause for {prefix}")
        return matches[0]

    def blocks(kind, number):
        return next(section["blocks"] for section in documents[kind]["sections"] if section["number"] == number)

    def replace_numbered(kind, section, number):
        target = next(item for item in blocks(kind, section) if item.get("number") == number)
        target["text"] = clause(f"**{number}** ")

    def paragraph(content):
        return {"type": "paragraph", "text": content}

    def replace_exact(source, expected, replacement):
        matches = [item for item in source if item.get("text") == expected]
        if len(matches) != 1:
            raise ValueError(f"Expected one predecessor paragraph for {expected}")
        matches[0]["text"] = replacement

    for item in MANIFEST["documents"]:
        kind = item["kind"]
        document = documents[kind]
        previous = next(entry for entry in delivery["documents"] if entry["kind"] == kind and entry["version"] == item["predecessorVersion"])
        expected_hash = item["predecessorPdfSha256"]
        actual_hash = hashlib.sha256((ROOT / "public" / previous["publicPath"].lstrip("/")).read_bytes()).hexdigest()
        if document["version"] != item["predecessorVersion"] or previous["sha256"] != expected_hash or actual_hash != expected_hash:
            raise ValueError(f"Predecessor version or delivery hash drifted for {kind}")
        document.update(version=item["version"], status="Review Draft", effectiveDate=None,
                        publicPath=item["proposedPublicPath"], filename=Path(item["proposedPublicPath"]).name)

    replace_numbered("rulebook", "19", "19.2")
    replace_numbered("rulebook", "19", "19.3")
    replace_numbered("ppa", "14", "14.3")
    replace_numbered("ppa", "20", "20.2")
    terms = blocks("terms", "8")
    old_terms = next(item["text"] for item in terms if item.get("text", "").startswith("Public-profile visibility is separate"))
    replace_exact(terms, old_terms, clause("**Section 8, replacement for the final profile paragraph.**"))

    info = blocks("privacy", "3")
    info[4]["items"][info[4]["items"].index("profile visibility settings;")] = (
        "historical profile visibility settings, optional profile disclosure choices and the minimum evidence needed to apply those choices or review an individual restriction;"
    )
    info[6]["items"].insert(4, "verified canonical Relic profile identifier;")
    info.insert(14, paragraph(
        "The gaming-profile notice receipt records a protected reference to the authenticated account, the notice version and the acknowledgement time. Separate records can identify optional disclosure choices, verified prior permission and individual restrictions."
    ))
    purposes = blocks("privacy", "5")[0]
    purposes["text"] = purposes["text"].replace("create and maintain profiles;", "create and maintain public gaming profiles and private account management under the applicable visibility rules;").replace("publish factual Competition History;", "publish factual Competition History and, where applicable, connect verified public profile identity through supported competition integrations;")
    grounds = blocks("privacy", "6")
    grounds[2]["text"] = clause("**Section 6, publication and choices.**")
    profiles = blocks("privacy", "8")
    profiles[:] = [paragraph(clause("**Section 8, profiles and transition.**")), paragraph(next(
        line for line in text.splitlines() if line.startswith("Avatar files stay in private Storage.")
    ))]
    verification = blocks("privacy", "9")
    verification.insert(-1, paragraph(clause("**Section 9, verification and integration.**")))
    public = blocks("privacy", "14")
    public[0]["text"] = clause("**Section 14, public information.**")
    public[1]["text"] = "Withdrawing an optional disclosure choice, restricting a gaming profile or closing an Account leaves factual Competition History subject to the rules for each event."
    public.pop(3)  # Its indexing warning is incorporated into the new opening paragraph.
    recipients = blocks("privacy", "15")[1]["items"]
    recipients.insert(next(index for index, item in enumerate(recipients) if item.startswith("Relic:")) + 1,
                      "CoH3Stats: authorized read-only access to supported competition data. The integration may receive the verified canonical Relic profile identifier and its public IronClad profile link when the profile is public and the optional disclosure choice or verified prior permission covers that use. The Relic identifier does not appear on public pages. This integration has no authority to verify eligibility or change competition records.")
    rights = blocks("privacy", "20")
    rights[0]["text"] = rights[0]["text"].replace("changes to public-profile or public-Discord settings", "changes to optional profile disclosure or public-Discord settings")
    rights[6]["text"] = rights[6]["text"].replace("Withdrawing public-profile, Discord or media permission", "Withdrawing permission for optional profile details, public Discord or media")
    rights.insert(2, paragraph("An unresolved, recorded privacy objection restricts the individual gaming profile while IronClad reviews it. The outcome is recorded separately from any acknowledgement."))

    corpus.update(effectiveDate=None, effectiveDateDisplay="TBD", activationDatePolicy="Draft for review. No effective date has been assigned.")
    return corpus


def build_finalization_payload(corpus, digests, display_date):
    original = json.loads(require_text(ROOT / "content/legal-corpus.json", MANIFEST["predecessorSources"]["content/legal-corpus.json"]))
    delivery = json.loads(require_text(ROOT / "content/legal-document-delivery.json", MANIFEST["predecessorSources"]["content/legal-document-delivery.json"]))
    predecessor_documents = []
    successor_documents = []

    for previous, successor in zip(original["documents"], corpus["documents"], strict=True):
        if previous["kind"] != successor["kind"]:
            raise ValueError("Predecessor and successor document kinds differ")
        kind = previous["kind"]
        immutable = next(entry for entry in delivery["documents"] if entry["kind"] == kind and entry["version"] == previous["version"])
        predecessor_documents.append({
            **{key: previous[key] for key in ("kind", "version", "effectiveDate", "filename", "publicPath")},
            "sha256": immutable["sha256"],
        })
        if any(row["kind"] == kind and row["version"] == successor["version"] for row in delivery["documents"]):
            raise ValueError(f"A delivery entry already exists for {kind} {successor['version']}")
        successor_documents.append({
            **{key: successor[key] for key in ("kind", "version", "effectiveDate", "filename", "publicPath")},
            "sha256": digests[kind],
        })

    account_kinds = {"terms", "privacy"}
    release = {
        "schemaVersion": 1, "status": "Final", "effectiveDate": corpus["effectiveDate"],
        "effectiveDateDisplay": display_date,
        "predecessorDocuments": [row for row in predecessor_documents if row["kind"] in account_kinds],
        "documents": [row for row in successor_documents if row["kind"] in account_kinds],
    }
    origin = "https://www.ironcladtournaments.com"

    def registry_row(row):
        return {"document_kind": row["kind"], "version": row["version"],
                "immutable_url": origin + row["publicPath"], "status": "effective", "sha256": row["sha256"]}

    registry_preview = {
        "schemaVersion": 1, "execution": "preview-only", "expectedEffectiveDateSydney": corpus["effectiveDate"],
        "requireExactEffectivePredecessors": [registry_row(row) for row in predecessor_documents],
        "successors": [registry_row(row) for row in successor_documents],
        "publicationTimestamps": "Set published_at and effective_at from the database clock during the separately approved Sydney publication date.",
    }
    delivery["documents"].extend({key: row[key] for key in ("kind", "version", "publicPath", "sha256")} for row in successor_documents)
    return release, delivery, registry_preview


def build_registry_rehearsal_sql(registry, candidate_sha):
    def literal(value):
        return "'" + value.replace("'", "''") + "'"

    def values(rows):
        return ",\n    ".join("(" + ",".join(literal(row[key]) for key in (
            "document_kind", "version", "immutable_url", "sha256"
        )) + ")" for row in rows)

    attestation = hashlib.sha256(json.dumps(registry, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    previous = values(registry["requireExactEffectivePredecessors"])
    successors = values(registry["successors"])
    return f"""-- Offline rollback rehearsal only. No release authorization is implied.
-- Independently verify the exact candidate and all four live PDF hashes before setting session attestations.
-- Required settings: ironclad.release_project_ref=nsyjtqpvyxlzyujlbzos
-- ironclad.release_candidate_sha={candidate_sha}
-- ironclad.release_served_legal_manifest_sha256={attestation}
begin;
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';
do $patch2_legal$ declare
  v_now timestamptz;
  v_original_legal jsonb;
  v_registration_hash text;
  v_registration_records_hash text;
  v_account_hash text;
  v_event_count integer;
  v_rows integer;
begin
  if current_setting('ironclad.release_project_ref', true) is distinct from 'nsyjtqpvyxlzyujlbzos'
    or current_setting('ironclad.release_candidate_sha', true) is distinct from {literal(candidate_sha)}
    or current_setting('ironclad.release_served_legal_manifest_sha256', true) is distinct from {literal(attestation)} then
    raise exception 'Missing verified target, candidate, or served legal artifact attestation';
  end if;
  perform 1 from ironclad_private.gaming_profile_publication_policy where id and activated_at is null for update;
  if not found then raise exception 'Profile publication policy must be installed and inactive'; end if;

  perform 1 from public.tournaments where slug = 'hold-the-line' for share;
  get diagnostics v_event_count = row_count;
  if v_event_count <> 1 or not exists (
    select from public.tournaments where slug = 'hold-the-line' and status = 'completed'
  ) then raise exception 'HOLD THE LINE must be completed'; end if;

  lock table public.legal_documents, public.registration_acceptances, public.account_legal_acceptances,
    public.registrations in share row exclusive mode;
  v_now := clock_timestamp();
  if (v_now at time zone 'Australia/Sydney')::date is distinct from date {literal(registry['expectedEffectiveDateSydney'])} then
    raise exception 'The database clock must match the approved Sydney effective date';
  end if;
  if (select count(*) from public.legal_documents) <> 12
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or exists (select 1 from (values {previous}) p(kind, version, url, hash)
      left join public.legal_documents d on (d.document_kind, d.version, d.immutable_url, d.sha256, d.status)
        = (p.kind, p.version, p.url, p.hash, 'effective') where d.id is null)
    or exists (select 1 from (values {successors}) n(kind, version, url, hash)
      join public.legal_documents d on (d.document_kind, d.version) = (n.kind, n.version) or d.immutable_url = n.url) then
    raise exception 'The effective legal predecessor set or the proposed versions have drifted';
  end if;
  select coalesce(jsonb_agg(to_jsonb(d) - 'status' - 'updated_at' order by d.id),'[]'::jsonb)
    into v_original_legal from public.legal_documents d;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text)
    into v_registration_hash from public.registration_acceptances a;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text)
    into v_account_hash from public.account_legal_acceptances a;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text)
    into v_registration_records_hash from public.registrations r;

  update public.legal_documents d set status = 'superseded'
    from (values {previous}) p(kind, version, url, hash)
    where (d.document_kind, d.version, d.immutable_url, d.sha256, d.status)
      = (p.kind, p.version, p.url, p.hash, 'effective');
  get diagnostics v_rows = row_count;
  if v_rows <> 4 then raise exception 'Expected exactly four superseded documents'; end if;

  insert into public.legal_documents (document_kind, version, immutable_url, sha256, status, published_at, effective_at)
    select n.kind, n.version, n.url, n.hash, 'effective', v_now, v_now
    from (values {successors}) n(kind, version, url, hash);
  if ironclad_private.activate_gaming_profile_publication() is null then
    raise exception 'Profile publication activation returned no timestamp';
  end if;
  if (select count(*) from public.legal_documents) <> 16
    or (select count(*) from public.legal_documents where status = 'effective') <> 4
    or exists (select 1 from (values {successors}) n(kind, version, url, hash)
      left join public.legal_documents d on (d.document_kind, d.version, d.immutable_url, d.sha256, d.status)
        = (n.kind, n.version, n.url, n.hash, 'effective') where d.id is null)
    or (select coalesce(jsonb_agg(to_jsonb(d) - 'status' - 'updated_at' order by d.id),'[]'::jsonb)
        from public.legal_documents d where not exists (select 1 from (values {successors}) n(kind, version, url, hash)
          where (d.document_kind, d.version) = (n.kind, n.version))) is distinct from v_original_legal
    or (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text)
        from public.registration_acceptances a) is distinct from v_registration_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text)
        from public.account_legal_acceptances a) is distinct from v_account_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text)
        from public.registrations r) is distinct from v_registration_records_hash
    or not exists (select from ironclad_private.gaming_profile_publication_policy policy
      join public.legal_documents terms on terms.id = policy.terms_document_id
      join public.legal_documents privacy on privacy.id = policy.privacy_document_id
      where policy.id and policy.activated_at >= v_now
        and terms.document_kind = 'terms' and terms.version = '1.2' and terms.status = 'effective'
        and privacy.document_kind = 'privacy' and privacy.version = '1.4' and privacy.status = 'effective') then
    raise exception 'The successor set, retained document identities or acceptance records did not match';
  end if;
end $patch2_legal$;
-- The notice version is unchanged. Verify publication before separate v2 activation.
rollback;
"""


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new offline directory outside the repository")
    parser.add_argument("--effective-date", metavar="YYYY-MM-DD", help="produce a dated, local-only finalization rehearsal")
    parser.add_argument("--candidate-sha", help="include a rollback-only registry SQL file bound to this exact build")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(ROOT) or output.exists():
        parser.error("Use a new output directory outside the repository")
    if args.effective_date is not None:
        try:
            effective_date = date.fromisoformat(args.effective_date)
        except ValueError:
            parser.error("Specify the proposed Sydney date as YYYY-MM-DD")
        if effective_date.isoformat() != args.effective_date:
            parser.error("Specify the proposed Sydney date as YYYY-MM-DD")
    review_draft = args.effective_date is None
    if args.candidate_sha is not None and (review_draft or not re.fullmatch(r"[0-9a-f]{40}", args.candidate_sha)):
        parser.error("A dated rehearsal and an exact 40-character Git SHA are required for registry SQL")
    spec = importlib.util.spec_from_file_location("ironclad_pdf", ROOT / "scripts" / "generate-legal-pdfs.py")
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    corpus = build_review_corpus()
    fonts = renderer.register_fonts()
    styles = renderer.make_styles(fonts)
    corpus_bytes = (json.dumps(corpus, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if hashlib.sha256(corpus_bytes).hexdigest() != MANIFEST["offlineDraftCorpusSha256"]:
        raise ValueError("Rendered review corpus does not match the reviewed bytes")
    display_date = "TBD"
    if not review_draft:
        original = json.loads(require_text(ROOT / "content/legal-corpus.json", MANIFEST["predecessorSources"]["content/legal-corpus.json"]))
        if effective_date <= max(date.fromisoformat(document["effectiveDate"]) for document in original["documents"]):
            parser.error("The proposed date must follow the current documents")
        display_date = renderer.format_date(args.effective_date)
        corpus.update(effectiveDate=args.effective_date, effectiveDateDisplay=display_date,
                      activationDatePolicy="Successor documents use the actual controlled Australia/Sydney publication date.")
        for document in corpus["documents"]:
            document.update(status="Effective", effectiveDate=args.effective_date)
    output.mkdir(parents=True)
    write_json(output / "legal-corpus.json", corpus)
    digests = {}
    for document in corpus["documents"]:
        resolved = renderer.resolve_document_tokens(document, review_draft=review_draft)
        renderer.validate_blocks(resolved["introBlocks"], f"{document['kind']}.introBlocks")
        for section in resolved["sections"]:
            renderer.validate_blocks(section["blocks"], f"{document['kind']}.{section['number']}")
        path = output / document["filename"]
        renderer.build_pdf(path, resolved, display_date, fonts, styles, review_draft=review_draft)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        digests[document["kind"]] = digest
        item = next(item for item in MANIFEST["documents"] if item["kind"] == document["kind"])
        if review_draft and digest != item["reviewPdfSha256"]:
            raise ValueError(f"Rendered review PDF does not match the reviewed bytes for {path.name}")
        print(f"{digest}  {path.name}")
    if not review_draft:
        release, delivery, registry_preview = build_finalization_payload(corpus, digests, display_date)
        write_json(output / "legal-successor-release.json", release)
        write_json(output / "legal-document-delivery.json", delivery)
        write_json(output / "legal-registry-preview.json", registry_preview)
        if args.candidate_sha is not None:
            (output / "legal-registry-rollback-rehearsal.sql").write_text(
                build_registry_rehearsal_sql(registry_preview, args.candidate_sha), encoding="utf-8", newline="\n"
            )


if __name__ == "__main__":
    main()
