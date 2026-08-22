begin;

create or replace function public.accept_current_account_legal_documents(
  p_clerk_user_id text,
  p_expected_terms_document_id uuid,
  p_expected_privacy_document_id uuid,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean
)
returns table (
  acceptance_id uuid,
  accepted_at timestamptz,
  terms_document_id uuid,
  privacy_document_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_accepted_at timestamptz := clock_timestamp();
  v_terms public.legal_documents%rowtype;
  v_privacy public.legal_documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(p_clerk_user_id), '') is null
    or length(p_clerk_user_id) > 255
    or p_terms_accepted is distinct from true
    or p_privacy_acknowledged is distinct from true then
    raise exception 'Account legal acceptance is invalid'
      using errcode = '22023';
  end if;

  select document.*
  into v_terms
  from public.legal_documents as document
  where document.document_kind = 'terms'
    and document.status = 'effective'
    and document.effective_at is not null
    and document.effective_at <= v_accepted_at
    and document.sha256 is not null
  for key share;

  if not found
    or v_terms.id is distinct from p_expected_terms_document_id
    or v_terms.version is distinct from '1.1' then
    raise exception 'Current Terms acceptance is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_privacy
  from public.legal_documents as document
  where document.document_kind = 'privacy'
    and document.status = 'effective'
    and document.effective_at is not null
    and document.effective_at <= v_accepted_at
    and document.sha256 is not null
  for key share;

  if not found
    or v_privacy.id is distinct from p_expected_privacy_document_id
    or (
      v_privacy.version is distinct from '1.1'
      and v_privacy.version is distinct from '1.2'
    ) then
    raise exception 'Current Privacy acknowledgement is unavailable'
      using errcode = '22023';
  end if;

  insert into public.account_legal_acceptances (
    clerk_user_id,
    accepted_at,
    terms_document_id,
    terms_version,
    terms_url,
    terms_sha256,
    privacy_document_id,
    privacy_version,
    privacy_url,
    privacy_sha256,
    terms_accepted,
    privacy_acknowledged
  )
  values (
    p_clerk_user_id,
    v_accepted_at,
    v_terms.id,
    v_terms.version,
    v_terms.immutable_url,
    v_terms.sha256,
    v_privacy.id,
    v_privacy.version,
    v_privacy.immutable_url,
    v_privacy.sha256,
    true,
    true
  )
  on conflict on constraint account_legal_acceptances_document_pair_key
  do nothing;

  return query
  select
    acceptance.id,
    acceptance.accepted_at,
    acceptance.terms_document_id,
    acceptance.privacy_document_id
  from public.account_legal_acceptances as acceptance
  where acceptance.clerk_user_id = p_clerk_user_id
    and acceptance.terms_document_id = v_terms.id
    and acceptance.privacy_document_id = v_privacy.id
    and acceptance.terms_accepted is true
    and acceptance.privacy_acknowledged is true;
end;
$$;

alter function public.accept_current_account_legal_documents(
  text,
  uuid,
  uuid,
  boolean,
  boolean
) owner to postgres;

revoke all on function public.accept_current_account_legal_documents(
  text,
  uuid,
  uuid,
  boolean,
  boolean
) from public, anon, authenticated, service_role;

grant execute on function public.accept_current_account_legal_documents(
  text,
  uuid,
  uuid,
  boolean,
  boolean
) to service_role;

comment on function public.accept_current_account_legal_documents(
  text,
  uuid,
  uuid,
  boolean,
  boolean
) is
  'Records one immutable account-wide acceptance for either exact current Effective Terms v1.1 and Privacy v1.1 or exact current Effective Terms v1.1 and Privacy v1.2. Browser document IDs are untrusted concurrency selectors; all authoritative version, URL, hash, status, and timestamp facts are loaded and locked by the database.';

commit;
