-- Rollback-only contract for reusable future Terms and Privacy acceptance.
-- Run only against the explicitly resolved IronClad Staging project after
-- setting `ironclad.target_project_ref` from the verified connection target.
-- The deliberate sentinel exception rolls back every durable fixture.

set client_min_messages = warning;
set role postgres;
set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';
set ironclad.legal_evidence_maintenance = 'off';
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"future-legal-gate-contract"}';

do $$
begin
  if current_setting('ironclad.target_project_ref', true)
      is distinct from 'zzbnneprhjicmajpjkdg' then
    raise exception
      'Future legal gate contract target must be verified IronClad Staging';
  end if;
end;
$$;

create temporary table account_legal_future_gate_baseline
on commit preserve rows
as
select
  (select count(*) from public.legal_documents) as legal_document_count,
  (select count(*) from public.account_legal_acceptances) as acceptance_count,
  (
    select pg_catalog.md5(
      coalesce(
        string_agg(to_jsonb(document)::text, E'\n' order by document.id),
        ''
      )
    )
    from public.legal_documents as document
  ) as legal_document_fingerprint,
  (
    select pg_catalog.md5(
      coalesce(
        string_agg(to_jsonb(acceptance)::text, E'\n' order by acceptance.id),
        ''
      )
    )
    from public.account_legal_acceptances as acceptance
  ) as acceptance_fingerprint,
  (
    select id
    from public.legal_documents
    where document_kind = 'terms' and status = 'effective'
  ) as terms_document_id,
  (
    select id
    from public.legal_documents
    where document_kind = 'privacy' and status = 'effective'
  ) as privacy_document_id;

create function pg_temp.account_legal_future_gate_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Future legal gate contract failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.account_legal_future_gate_rejects(
  p_clerk_user_id text,
  p_terms_document_id uuid,
  p_privacy_document_id uuid,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean,
  p_expected_sqlstate text,
  p_expected_message text
)
returns boolean
language plpgsql
as $$
begin
  perform public.accept_current_account_legal_documents(
    p_clerk_user_id,
    p_terms_document_id,
    p_privacy_document_id,
    p_terms_accepted,
    p_privacy_acknowledged
  );
  return false;
exception when others then
  return sqlstate = p_expected_sqlstate
    and sqlerrm = p_expected_message;
end;
$$;

create function pg_temp.account_legal_future_gate_baseline_restored()
returns boolean
language sql
stable
as $$
  select
    (select count(*) from public.legal_documents) = baseline.legal_document_count
    and (select count(*) from public.account_legal_acceptances) =
      baseline.acceptance_count
    and (
      select pg_catalog.md5(
        coalesce(
          string_agg(to_jsonb(document)::text, E'\n' order by document.id),
          ''
        )
      )
      from public.legal_documents as document
    ) = baseline.legal_document_fingerprint
    and (
      select pg_catalog.md5(
        coalesce(
          string_agg(to_jsonb(acceptance)::text, E'\n' order by acceptance.id),
          ''
        )
      )
      from public.account_legal_acceptances as acceptance
    ) = baseline.acceptance_fingerprint
    and exists (
      select 1
      from public.legal_documents
      where id = baseline.terms_document_id
        and document_kind = 'terms'
        and status = 'effective'
    )
    and exists (
      select 1
      from public.legal_documents
      where id = baseline.privacy_document_id
        and document_kind = 'privacy'
        and status = 'effective'
    )
  from account_legal_future_gate_baseline as baseline;
$$;

do $$
declare
  v_future_terms_id constant uuid :=
    'f0716000-0000-4000-8000-000000000211';
  v_future_privacy_id constant uuid :=
    'f0716000-0000-4000-8000-000000000212';
  v_wrong_id constant uuid :=
    'f0716000-0000-4000-8000-000000000299';
  v_contract_user constant text := 'future-legal-gate-contract-account';
  v_current_terms public.legal_documents%rowtype;
  v_current_privacy public.legal_documents%rowtype;
  v_current_first record;
  v_current_retry record;
  v_current_after_drafts record;
  v_future_first record;
  v_future_retry record;
  v_current_evidence public.account_legal_acceptances%rowtype;
  v_future_evidence public.account_legal_acceptances%rowtype;
  v_current_evidence_fingerprint text;
  v_draft_at timestamptz := clock_timestamp() - interval '1 second';
  v_future_at timestamptz := clock_timestamp() + interval '1 day';
  v_failed boolean;
begin
  begin
    perform pg_temp.account_legal_future_gate_assert(
      to_regclass('public.account_legal_acceptances') is not null,
      'account legal acceptance evidence is unavailable'
    );
    perform pg_temp.account_legal_future_gate_assert(
      to_regprocedure(
        'public.accept_current_account_legal_documents(text,uuid,uuid,boolean,boolean)'
      ) is not null,
      'the current account legal acceptance RPC is unavailable'
    );
    perform pg_temp.account_legal_future_gate_assert(
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

    select * into strict v_current_terms
    from public.legal_documents
    where document_kind = 'terms'
      and status = 'effective'
      and published_at <= clock_timestamp()
      and effective_at <= clock_timestamp()
      and sha256 is not null;

    select * into strict v_current_privacy
    from public.legal_documents
    where document_kind = 'privacy'
      and status = 'effective'
      and published_at <= clock_timestamp()
      and effective_at <= clock_timestamp()
      and sha256 is not null;

    perform pg_temp.account_legal_future_gate_assert(
      not exists (
        select 1
        from public.legal_documents
        where id in (v_future_terms_id, v_future_privacy_id, v_wrong_id)
      )
      and not exists (
        select 1
        from public.legal_documents
        where (document_kind = 'terms' and version = 'future-terms-77.13')
          or (document_kind = 'privacy' and version = 'future-privacy-88.21')
      )
      and not exists (
        select 1
        from public.account_legal_acceptances
        where clerk_user_id like 'future-legal-gate-contract-%'
      ),
      'fixed future-gate fixtures already exist'
    );

    select * into strict v_current_first
    from public.accept_current_account_legal_documents(
      v_contract_user,
      v_current_terms.id,
      v_current_privacy.id,
      true,
      true
    );
    select * into strict v_current_retry
    from public.accept_current_account_legal_documents(
      v_contract_user,
      v_current_terms.id,
      v_current_privacy.id,
      true,
      true
    );
    select * into strict v_current_evidence
    from public.account_legal_acceptances
    where id = v_current_first.acceptance_id;
    v_current_evidence_fingerprint :=
      pg_catalog.md5(to_jsonb(v_current_evidence)::text);

    perform pg_temp.account_legal_future_gate_assert(
      v_current_first.acceptance_id = v_current_retry.acceptance_id
      and v_current_first.accepted_at = v_current_retry.accepted_at
      and v_current_evidence.terms_document_id = v_current_terms.id
      and v_current_evidence.terms_version = v_current_terms.version
      and v_current_evidence.terms_url = v_current_terms.immutable_url
      and v_current_evidence.terms_sha256 = v_current_terms.sha256
      and v_current_evidence.privacy_document_id = v_current_privacy.id
      and v_current_evidence.privacy_version = v_current_privacy.version
      and v_current_evidence.privacy_url = v_current_privacy.immutable_url
      and v_current_evidence.privacy_sha256 = v_current_privacy.sha256
      and v_current_evidence.accepted_at = v_current_first.accepted_at,
      'the current exact pair is not authoritative and idempotent'
    );

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
        v_future_terms_id,
        'terms',
        'future-terms-77.13',
        'https://future-legal-gate.invalid/terms-77.13.pdf',
        'review_draft',
        v_draft_at,
        v_draft_at,
        repeat('a', 64)
      ),
      (
        v_future_privacy_id,
        'privacy',
        'future-privacy-88.21',
        'https://future-legal-gate.invalid/privacy-88.21.pdf',
        'review_draft',
        v_draft_at,
        v_draft_at,
        repeat('b', 64)
      );

    select * into strict v_current_after_drafts
    from public.accept_current_account_legal_documents(
      v_contract_user,
      v_current_terms.id,
      v_current_privacy.id,
      true,
      true
    );
    perform pg_temp.account_legal_future_gate_assert(
      v_current_after_drafts.acceptance_id = v_current_first.acceptance_id
      and v_current_after_drafts.accepted_at = v_current_first.accepted_at
      and exists (
        select 1 from public.legal_documents
        where id = v_future_terms_id and status = 'review_draft'
      )
      and exists (
        select 1 from public.legal_documents
        where id = v_future_privacy_id and status = 'review_draft'
      )
      and not exists (
        select 1
        from public.account_legal_acceptances
        where clerk_user_id = v_contract_user
          and terms_document_id = v_future_terms_id
          and privacy_document_id = v_future_privacy_id
      ),
      'non-effective future drafts changed the current gate'
    );

    begin
      update public.legal_documents
      set status = 'superseded'
      where id in (v_current_terms.id, v_current_privacy.id);

      update public.legal_documents
      set
        status = 'effective',
        published_at = v_future_at,
        effective_at = v_future_at
      where id in (v_future_terms_id, v_future_privacy_id);

      perform pg_temp.account_legal_future_gate_assert(
        pg_temp.account_legal_future_gate_rejects(
          'future-legal-gate-contract-future-dated',
          v_future_terms_id,
          v_future_privacy_id,
          true,
          true,
          '22023',
          'Current account legal document pair is unavailable'
        ),
        'future-effective documents were accepted before their effective time'
      );
      raise exception 'Future-effective boundary rollback';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Future-effective boundary rollback' then
        raise;
      end if;
    end;

    perform pg_temp.account_legal_future_gate_assert(
      exists (
        select 1 from public.legal_documents
        where id = v_current_terms.id and status = 'effective'
      )
      and exists (
        select 1 from public.legal_documents
        where id = v_current_privacy.id and status = 'effective'
      )
      and exists (
        select 1 from public.legal_documents
        where id = v_future_terms_id and status = 'review_draft'
      )
      and exists (
        select 1 from public.legal_documents
        where id = v_future_privacy_id and status = 'review_draft'
      ),
      'future-effective boundary rehearsal did not roll back'
    );

    update public.legal_documents
    set status = 'superseded'
    where id in (v_current_terms.id, v_current_privacy.id);

    update public.legal_documents
    set status = 'effective'
    where id in (v_future_terms_id, v_future_privacy_id);

    perform pg_temp.account_legal_future_gate_assert(
      not exists (
        select 1
        from public.account_legal_acceptances
        where clerk_user_id = v_contract_user
          and terms_document_id = v_future_terms_id
          and privacy_document_id = v_future_privacy_id
      ),
      'old evidence falsely satisfied the unfamiliar current pair'
    );
    perform pg_temp.account_legal_future_gate_assert(
      pg_temp.account_legal_future_gate_rejects(
        v_contract_user,
        v_current_terms.id,
        v_current_privacy.id,
        true,
        true,
        '22023',
        'Current Terms acceptance is unavailable'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-mixed-a',
        v_future_terms_id,
        v_current_privacy.id,
        true,
        true,
        '22023',
        'Current Privacy acknowledgement is unavailable'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-mixed-b',
        v_current_terms.id,
        v_future_privacy_id,
        true,
        true,
        '22023',
        'Current Terms acceptance is unavailable'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-wrong-a',
        v_wrong_id,
        v_future_privacy_id,
        true,
        true,
        '22023',
        'Current Terms acceptance is unavailable'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-wrong-b',
        v_future_terms_id,
        v_wrong_id,
        true,
        true,
        '22023',
        'Current Privacy acknowledgement is unavailable'
      ),
      'a stale, mixed, or wrong document selector was accepted'
    );

    select * into strict v_future_first
    from public.accept_current_account_legal_documents(
      v_contract_user,
      v_future_terms_id,
      v_future_privacy_id,
      true,
      true
    );
    select * into strict v_future_retry
    from public.accept_current_account_legal_documents(
      v_contract_user,
      v_future_terms_id,
      v_future_privacy_id,
      true,
      true
    );
    select * into strict v_future_evidence
    from public.account_legal_acceptances
    where id = v_future_first.acceptance_id;

    perform pg_temp.account_legal_future_gate_assert(
      v_future_first.acceptance_id = v_future_retry.acceptance_id
      and v_future_first.accepted_at = v_future_retry.accepted_at
      and v_future_evidence.terms_document_id = v_future_terms_id
      and v_future_evidence.terms_version = 'future-terms-77.13'
      and v_future_evidence.terms_url =
        'https://future-legal-gate.invalid/terms-77.13.pdf'
      and v_future_evidence.terms_sha256 = repeat('a', 64)
      and v_future_evidence.privacy_document_id = v_future_privacy_id
      and v_future_evidence.privacy_version = 'future-privacy-88.21'
      and v_future_evidence.privacy_url =
        'https://future-legal-gate.invalid/privacy-88.21.pdf'
      and v_future_evidence.privacy_sha256 = repeat('b', 64)
      and v_future_evidence.accepted_at = v_future_first.accepted_at
      and v_future_evidence.accepted_at is not null
      and v_future_evidence.terms_accepted is true
      and v_future_evidence.privacy_acknowledged is true
      and (
        select count(*) = 2
        from public.account_legal_acceptances
        where clerk_user_id = v_contract_user
      )
      and (
        select pg_catalog.md5(to_jsonb(acceptance)::text)
        from public.account_legal_acceptances as acceptance
        where id = v_current_first.acceptance_id
      ) = v_current_evidence_fingerprint,
      'unfamiliar current versions did not produce exact immutable evidence'
    );

    perform pg_temp.account_legal_future_gate_assert(
      pg_temp.account_legal_future_gate_rejects(
        '',
        v_future_terms_id,
        v_future_privacy_id,
        true,
        true,
        '22023',
        'Account legal acceptance is invalid'
      )
      and pg_temp.account_legal_future_gate_rejects(
        repeat('x', 256),
        v_future_terms_id,
        v_future_privacy_id,
        true,
        true,
        '22023',
        'Account legal acceptance is invalid'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-invalid-controls-a',
        v_future_terms_id,
        v_future_privacy_id,
        false,
        true,
        '22023',
        'Account legal acceptance is invalid'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-invalid-controls-b',
        v_future_terms_id,
        v_future_privacy_id,
        true,
        false,
        '22023',
        'Account legal acceptance is invalid'
      )
      and pg_temp.account_legal_future_gate_rejects(
        'future-legal-gate-contract-invalid-controls-null',
        v_future_terms_id,
        v_future_privacy_id,
        null,
        true,
        '22023',
        'Account legal acceptance is invalid'
      ),
      'invalid identity or acceptance controls were accepted'
    );

    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'authenticated',
      true
    );
    v_failed := pg_temp.account_legal_future_gate_rejects(
      'future-legal-gate-contract-browser',
      v_future_terms_id,
      v_future_privacy_id,
      true,
      true,
      'P0001',
      'Not authorized'
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'service_role',
      true
    );
    perform pg_temp.account_legal_future_gate_assert(
      v_failed,
      'an authenticated browser claim executed the RPC'
    );

    v_failed := false;
    begin
      update public.account_legal_acceptances
      set terms_version = 'tampered'
      where id = v_current_first.acceptance_id;
    exception when sqlstate '55000' then
      v_failed := true;
    end;
    perform pg_temp.account_legal_future_gate_assert(
      v_failed,
      'predecessor evidence was mutable'
    );

    v_failed := false;
    begin
      update public.account_legal_acceptances
      set privacy_version = 'tampered'
      where id = v_future_first.acceptance_id;
    exception when sqlstate '55000' then
      v_failed := true;
    end;
    perform pg_temp.account_legal_future_gate_assert(
      v_failed,
      'successor evidence was mutable'
    );

    v_failed := false;
    begin
      delete from public.account_legal_acceptances
      where id = v_future_first.acceptance_id;
    exception when sqlstate '55000' then
      v_failed := true;
    end;
    perform pg_temp.account_legal_future_gate_assert(
      v_failed,
      'successor evidence was deletable'
    );

    raise exception 'Future legal gate contract rollback';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Future legal gate contract rollback' then
      raise;
    end if;
  end;

  perform pg_temp.account_legal_future_gate_assert(
    pg_temp.account_legal_future_gate_baseline_restored()
    and not exists (
      select 1
      from public.legal_documents
      where id in (v_future_terms_id, v_future_privacy_id, v_wrong_id)
    )
    and not exists (
      select 1
      from public.account_legal_acceptances
      where clerk_user_id like 'future-legal-gate-contract-%'
    ),
    'rollback did not restore the exact Staging baseline'
  );
end;
$$;

select jsonb_build_object(
  'target', 'ironclad-staging',
  'target_identity_verified',
    current_setting('ironclad.target_project_ref', true) =
      'zzbnneprhjicmajpjkdg',
  'current_pair_idempotent', true,
  'draft_zero_effect', true,
  'future_effective_boundary_fail_closed', true,
  'unfamiliar_current_pair_accepted', true,
  'stale_mixed_wrong_selectors_rejected', true,
  'invalid_callers_and_controls_rejected', true,
  'evidence_immutable', true,
  'rollback_only', true,
  'zero_residue', pg_temp.account_legal_future_gate_baseline_restored()
) as account_legal_future_gate_stability_result;
