-- Rollback-only contract for the Terms v1.1 / Privacy v1.1 -> v1.2 bridge.
-- Run only against the explicitly approved IronClad Staging project after the
-- compatibility migration is applied. The deliberate sentinel exception rolls
-- back every fixture and acceptance before the final residue proof.

set client_min_messages = warning;
set role postgres;
set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"privacy-v1.2-compatibility-contract"}';

create temporary table account_legal_privacy_v12_baseline
on commit preserve rows
as
select
  (select count(*) from public.legal_documents) as legal_document_count,
  (select count(*) from public.account_legal_acceptances) as acceptance_count,
  (
    select id from public.legal_documents
    where document_kind = 'terms' and status = 'effective'
  ) as terms_document_id,
  (
    select id from public.legal_documents
    where document_kind = 'privacy' and status = 'effective'
  ) as privacy_document_id;

create function pg_temp.account_legal_privacy_v12_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Privacy v1.2 compatibility contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_privacy_v12 constant uuid := 'b1a12000-0000-4000-8000-000000000112';
  v_current_user constant text := 'privacy-v12-contract-current';
  v_terms public.legal_documents%rowtype;
  v_privacy_v11 public.legal_documents%rowtype;
  v_current_first record;
  v_current_retry record;
  v_next_first record;
  v_next_retry record;
  v_evidence public.account_legal_acceptances%rowtype;
  v_failed boolean;
begin
  begin
    select * into strict v_terms
    from public.legal_documents
    where document_kind = 'terms' and status = 'effective';

    select * into strict v_privacy_v11
    from public.legal_documents
    where document_kind = 'privacy' and status = 'effective';

    perform pg_temp.account_legal_privacy_v12_assert(
      v_terms.version = '1.1' and v_privacy_v11.version = '1.1',
      'Staging does not begin at the approved Terms v1.1 / Privacy v1.1 pair'
    );
    perform pg_temp.account_legal_privacy_v12_assert(
      not exists (
        select 1 from public.legal_documents where id = v_privacy_v12
      )
      and not exists (
        select 1 from public.account_legal_acceptances
        where clerk_user_id = v_current_user
      ),
      'fixed compatibility fixtures already exist'
    );
    perform pg_temp.account_legal_privacy_v12_assert(
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
      'RPC execution is not service-role-only'
    );

    select * into strict v_current_first
    from public.accept_current_account_legal_documents(
      v_current_user,
      v_terms.id,
      v_privacy_v11.id,
      true,
      true
    );
    select * into strict v_current_retry
    from public.accept_current_account_legal_documents(
      v_current_user,
      v_terms.id,
      v_privacy_v11.id,
      true,
      true
    );
    perform pg_temp.account_legal_privacy_v12_assert(
      v_current_first.acceptance_id = v_current_retry.acceptance_id
      and v_current_first.accepted_at = v_current_retry.accepted_at,
      'the current v1.1/v1.1 pair is not accepted idempotently'
    );

    update public.legal_documents
    set status = 'superseded'
    where id = v_privacy_v11.id;

    insert into public.legal_documents (
      id,
      document_kind,
      version,
      immutable_url,
      status,
      published_at,
      effective_at,
      sha256
    ) values (
      v_privacy_v12,
      'privacy',
      '1.2',
      'https://ironclad-website-legal-release.vercel.app/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf',
      'effective',
      clock_timestamp(),
      clock_timestamp(),
      repeat('d', 64)
    );

    perform pg_temp.account_legal_privacy_v12_assert(
      not exists (
        select 1 from public.account_legal_acceptances
        where clerk_user_id = v_current_user
          and terms_document_id = v_terms.id
          and privacy_document_id = v_privacy_v12
      ),
      'old v1.1/v1.1 evidence falsely satisfied the v1.1/v1.2 pair'
    );

    v_failed := false;
    begin
      perform public.accept_current_account_legal_documents(
        v_current_user,
        v_terms.id,
        v_privacy_v11.id,
        true,
        true
      );
    exception when others then
      v_failed := true;
    end;
    perform pg_temp.account_legal_privacy_v12_assert(
      v_failed,
      'the stale Privacy v1.1 selector was accepted after activation'
    );

    select * into strict v_next_first
    from public.accept_current_account_legal_documents(
      v_current_user,
      v_terms.id,
      v_privacy_v12,
      true,
      true
    );
    select * into strict v_next_retry
    from public.accept_current_account_legal_documents(
      v_current_user,
      v_terms.id,
      v_privacy_v12,
      true,
      true
    );
    select * into strict v_evidence
    from public.account_legal_acceptances
    where id = v_next_first.acceptance_id;

    perform pg_temp.account_legal_privacy_v12_assert(
      v_next_first.acceptance_id = v_next_retry.acceptance_id
      and v_next_first.accepted_at = v_next_retry.accepted_at
      and v_evidence.terms_document_id = v_terms.id
      and v_evidence.terms_version = '1.1'
      and v_evidence.terms_url = v_terms.immutable_url
      and v_evidence.terms_sha256 = v_terms.sha256
      and v_evidence.privacy_document_id = v_privacy_v12
      and v_evidence.privacy_version = '1.2'
      and v_evidence.privacy_url =
        'https://ironclad-website-legal-release.vercel.app/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf'
      and v_evidence.privacy_sha256 = repeat('d', 64)
      and v_evidence.terms_accepted is true
      and v_evidence.privacy_acknowledged is true
      and (
        select count(*) = 2
        from public.account_legal_acceptances
        where clerk_user_id = v_current_user
      )
      and exists (
        select 1 from public.account_legal_acceptances
        where id = v_current_first.acceptance_id
          and terms_document_id = v_terms.id
          and privacy_document_id = v_privacy_v11.id
          and privacy_version = '1.1'
      ),
      'the v1.1/v1.2 evidence is not authoritative and idempotent'
    );

    begin
      update public.legal_documents
      set status = 'superseded'
      where id = v_privacy_v12;
      insert into public.legal_documents (
        id,
        document_kind,
        version,
        immutable_url,
        status,
        published_at,
        effective_at,
        sha256
      ) values (
        'b1a13000-0000-4000-8000-000000000113',
        'privacy',
        '1.3',
        'https://preview.invalid/ironclad-privacy-policy-v1.3.pdf',
        'effective',
        clock_timestamp(),
        clock_timestamp(),
        repeat('e', 64)
      );
      v_failed := false;
      begin
        perform public.accept_current_account_legal_documents(
          'privacy-v12-contract-invalid-privacy',
          v_terms.id,
          'b1a13000-0000-4000-8000-000000000113',
          true,
          true
        );
      exception when others then
        v_failed := true;
      end;
      perform pg_temp.account_legal_privacy_v12_assert(
        not v_failed,
        'the approved generic legal gate rejected current Privacy v1.3'
      );
      raise exception 'Privacy v1.3 rejection rollback';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Privacy v1.3 rejection rollback' then
        raise;
      end if;
    end;

    begin
      update public.legal_documents
      set status = 'superseded'
      where id = v_terms.id;
      insert into public.legal_documents (
        id,
        document_kind,
        version,
        immutable_url,
        status,
        published_at,
        effective_at,
        sha256
      ) values (
        'b1a12000-0000-4000-8000-000000000111',
        'terms',
        '1.2',
        'https://preview.invalid/ironclad-terms-of-service-v1.2.pdf',
        'effective',
        clock_timestamp(),
        clock_timestamp(),
        repeat('f', 64)
      );
      v_failed := false;
      begin
        perform public.accept_current_account_legal_documents(
          'privacy-v12-contract-invalid-terms',
          'b1a12000-0000-4000-8000-000000000111',
          v_privacy_v12,
          true,
          true
        );
      exception when others then
        v_failed := true;
      end;
      perform pg_temp.account_legal_privacy_v12_assert(
        not v_failed,
        'the approved generic legal gate rejected current Terms v1.2'
      );
      raise exception 'Terms v1.2 rejection rollback';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Terms v1.2 rejection rollback' then
        raise;
      end if;
    end;

    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    v_failed := false;
    begin
      perform public.accept_current_account_legal_documents(
        'privacy-v12-contract-browser-role',
        v_terms.id,
        v_privacy_v12,
        true,
        true
      );
    exception when others then
      v_failed := true;
    end;
    perform pg_temp.account_legal_privacy_v12_assert(
      v_failed,
      'an authenticated browser claim executed the RPC'
    );
    perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

    v_failed := false;
    begin
      update public.account_legal_acceptances
      set privacy_version = 'tampered'
      where id = v_current_first.acceptance_id;
    exception when sqlstate '55000' then
      v_failed := true;
    end;
    perform pg_temp.account_legal_privacy_v12_assert(
      v_failed,
      'existing v1.1/v1.1 evidence was mutable'
    );

    v_failed := false;
    begin
      update public.account_legal_acceptances
      set privacy_version = 'tampered'
      where id = v_next_first.acceptance_id;
    exception when sqlstate '55000' then
      v_failed := true;
    end;
    perform pg_temp.account_legal_privacy_v12_assert(
      v_failed,
      'new v1.1/v1.2 evidence was mutable'
    );

    raise exception 'Privacy v1.2 compatibility contract rollback';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Privacy v1.2 compatibility contract rollback' then
      raise;
    end if;
  end;

  perform pg_temp.account_legal_privacy_v12_assert(
    (select count(*) from public.legal_documents) =
      (select legal_document_count from account_legal_privacy_v12_baseline)
    and (select count(*) from public.account_legal_acceptances) =
      (select acceptance_count from account_legal_privacy_v12_baseline)
    and exists (
      select 1 from public.legal_documents
      where id = (
        select terms_document_id from account_legal_privacy_v12_baseline
      )
        and document_kind = 'terms'
        and version = '1.1'
        and status = 'effective'
    )
    and exists (
      select 1 from public.legal_documents
      where id = (
        select privacy_document_id from account_legal_privacy_v12_baseline
      )
        and document_kind = 'privacy'
        and version = '1.1'
        and status = 'effective'
    )
    and not exists (
      select 1 from public.legal_documents where id = v_privacy_v12
    )
    and not exists (
      select 1 from public.account_legal_acceptances
      where clerk_user_id like 'privacy-v12-contract-%'
    ),
    'rollback did not restore the Staging baseline'
  );
end;
$$;

select jsonb_build_object(
  'target', case when inet_server_addr() = '127.0.0.1'::inet
    and inet_server_port() = 55462
    and current_database() ~ '^ironclad_legal_[a-z0-9_]+$'
    then 'isolated-local' else 'ironclad-staging' end,
  'supported_pairs', jsonb_build_array('1.1/1.1', '1.1/1.2'),
  'future_current_pairs_accepted', true,
  'old_evidence_preserved', true,
  'rollback_only', true,
  'zero_residue',
    (select count(*) from public.legal_documents) =
      (select legal_document_count from account_legal_privacy_v12_baseline)
    and (select count(*) from public.account_legal_acceptances) =
      (select acceptance_count from account_legal_privacy_v12_baseline)
    and not exists (
      select 1 from public.legal_documents
      where id = 'b1a12000-0000-4000-8000-000000000112'
    )
    and not exists (
      select 1 from public.account_legal_acceptances
      where clerk_user_id like 'privacy-v12-contract-%'
    )
) as account_legal_privacy_v12_compatibility_result;
