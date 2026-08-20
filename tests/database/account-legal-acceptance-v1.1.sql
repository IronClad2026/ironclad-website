-- Rollback-only account-wide legal acceptance contract.
-- Run only against the explicitly approved Staging project after the B1
-- migration has been applied. Every fixture and legal-register transition is
-- contained in one PL/pgSQL subtransaction and rolled back before the residue
-- proof.

set client_min_messages = warning;
set role postgres;

create temporary table account_legal_contract_baseline
on commit preserve rows
as
select
  (select count(*) from public.legal_documents) as legal_document_count,
  (select count(*) from public.account_legal_acceptances) as acceptance_count;

set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"b1-account-legal-contract"}';

create function pg_temp.account_legal_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Account legal contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_terms constant uuid := 'b1a10000-0000-4000-8000-000000000101';
  v_privacy constant uuid := 'b1a10000-0000-4000-8000-000000000102';
  v_clerk_user constant text := 'b1-account-legal-contract';
  v_first record;
  v_retry record;
  v_evidence public.account_legal_acceptances%rowtype;
  v_failed boolean;
begin
  begin
  perform pg_temp.account_legal_assert(
    to_regclass('public.account_legal_acceptances') is not null,
    'the account acceptance migration is not applied'
  );
  perform pg_temp.account_legal_assert(
    (select count(*) = 4 from public.legal_documents where status = 'effective')
      and exists (
        select 1 from public.legal_documents
        where document_kind = 'terms' and version = '1.0' and status = 'effective'
      )
      and exists (
        select 1 from public.legal_documents
        where document_kind = 'privacy' and version = '1.0' and status = 'effective'
      ),
    'Staging must start from the four-document v1.0 predecessor set'
  );
  perform pg_temp.account_legal_assert(
    not exists (
      select 1 from public.legal_documents where id in (v_terms, v_privacy)
    ) and not exists (
      select 1 from public.account_legal_acceptances
      where clerk_user_id = v_clerk_user
    ),
    'fixed contract fixtures already exist'
  );

  perform pg_temp.account_legal_assert(
    (
      select relrowsecurity and relforcerowsecurity
      from pg_catalog.pg_class
      where oid = 'public.account_legal_acceptances'::regclass
    ),
    'acceptance evidence must use FORCE RLS'
  );
  perform pg_temp.account_legal_assert(
    not has_table_privilege('anon', 'public.account_legal_acceptances', 'SELECT')
      and not has_table_privilege('authenticated', 'public.account_legal_acceptances', 'SELECT')
      and has_table_privilege('service_role', 'public.account_legal_acceptances', 'SELECT')
      and not has_table_privilege('service_role', 'public.account_legal_acceptances', 'INSERT,UPDATE,DELETE'),
    'table privileges are not read-only service-role access'
  );
  perform pg_temp.account_legal_assert(
    not has_function_privilege(
      'anon',
      'public.accept_current_account_legal_documents(text,uuid,uuid,boolean,boolean)',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.accept_current_account_legal_documents(text,uuid,uuid,boolean,boolean)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.accept_current_account_legal_documents(text,uuid,uuid,boolean,boolean)',
        'EXECUTE'
      ),
    'RPC execution privileges are not service-role-only'
  );

  update public.legal_documents
  set status = 'superseded'
  where status = 'effective'
    and document_kind in ('terms', 'privacy');

  insert into public.legal_documents (
    id,
    document_kind,
    version,
    immutable_url,
    status,
    published_at,
    effective_at,
    sha256
  ) values
    (
      v_terms,
      'terms',
      '1.1',
      'https://preview.invalid/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf',
      'effective',
      clock_timestamp(),
      clock_timestamp(),
      repeat('b', 64)
    ),
    (
      v_privacy,
      'privacy',
      '1.1',
      'https://preview.invalid/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf',
      'effective',
      clock_timestamp(),
      clock_timestamp(),
      repeat('c', 64)
    );

  select * into strict v_first
  from public.accept_current_account_legal_documents(
    v_clerk_user,
    v_terms,
    v_privacy,
    true,
    true
  );

  select * into strict v_retry
  from public.accept_current_account_legal_documents(
    v_clerk_user,
    v_terms,
    v_privacy,
    true,
    true
  );

  select * into strict v_evidence
  from public.account_legal_acceptances
  where clerk_user_id = v_clerk_user;

  perform pg_temp.account_legal_assert(
    v_first.acceptance_id = v_retry.acceptance_id
      and v_first.accepted_at = v_retry.accepted_at
      and v_evidence.id = v_first.acceptance_id
      and v_evidence.terms_document_id = v_terms
      and v_evidence.terms_version = '1.1'
      and v_evidence.terms_sha256 = repeat('b', 64)
      and v_evidence.privacy_document_id = v_privacy
      and v_evidence.privacy_version = '1.1'
      and v_evidence.privacy_sha256 = repeat('c', 64)
      and v_evidence.terms_accepted is true
      and v_evidence.privacy_acknowledged is true
      and (
        select count(*) = 1
        from public.account_legal_acceptances
        where clerk_user_id = v_clerk_user
      ),
    'exact-pair retry was not idempotent or authoritative'
  );

  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  v_failed := false;
  begin
    perform public.accept_current_account_legal_documents(
      v_clerk_user,
      v_terms,
      v_privacy,
      true,
      true
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.account_legal_assert(
    v_failed,
    'authenticated role claim executed the service-only RPC'
  );
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  v_failed := false;
  begin
    perform public.accept_current_account_legal_documents(
      v_clerk_user,
      'b1a10000-0000-4000-8000-000000000199',
      v_privacy,
      true,
      true
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.account_legal_assert(
    v_failed,
    'an untrusted wrong document selector was accepted'
  );

  v_failed := false;
  begin
    update public.account_legal_acceptances
    set terms_version = 'tampered'
    where id = v_first.acceptance_id;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.account_legal_assert(v_failed, 'evidence update was not blocked');

  v_failed := false;
  begin
    delete from public.account_legal_acceptances
    where id = v_first.acceptance_id;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.account_legal_assert(v_failed, 'ordinary evidence deletion was not blocked');

  perform pg_catalog.set_config('ironclad.legal_evidence_maintenance', 'on', true);
  delete from public.account_legal_acceptances
  where id = v_first.acceptance_id;
  perform pg_catalog.set_config('ironclad.legal_evidence_maintenance', 'off', true);
  perform pg_temp.account_legal_assert(
    not exists (
      select 1 from public.account_legal_acceptances where id = v_first.acceptance_id
    ),
    'controlled postgres legal-evidence deletion did not work'
  );
    raise exception 'Account legal contract rollback';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Account legal contract rollback' then
      raise;
    end if;
  end;

  perform pg_temp.account_legal_assert(
    (select count(*) from public.legal_documents) =
      (select legal_document_count from account_legal_contract_baseline)
      and (select count(*) from public.account_legal_acceptances) =
        (select acceptance_count from account_legal_contract_baseline)
      and not exists (
        select 1 from public.legal_documents
        where id in (v_terms, v_privacy)
      )
      and not exists (
        select 1 from public.account_legal_acceptances
        where clerk_user_id = v_clerk_user
      ),
    'rollback did not restore the Staging baseline'
  );
end;
$$;

select jsonb_build_object(
  'target', 'ironclad-staging',
  'rollback_only', true,
  'zero_residue',
    (select count(*) from public.legal_documents) =
      (select legal_document_count from account_legal_contract_baseline)
    and (select count(*) from public.account_legal_acceptances) =
      (select acceptance_count from account_legal_contract_baseline)
    and not exists (
      select 1 from public.legal_documents
      where id in (
        'b1a10000-0000-4000-8000-000000000101',
        'b1a10000-0000-4000-8000-000000000102'
      )
    )
    and not exists (
      select 1 from public.account_legal_acceptances
      where clerk_user_id = 'b1-account-legal-contract'
    )
) as account_legal_contract_result;
