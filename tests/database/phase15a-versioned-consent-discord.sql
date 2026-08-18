\set ON_ERROR_STOP on

-- Rollback-only Phase 15A database contract.
--
-- Run only against a disposable/local database or the explicitly approved
-- Staging project after the Phase 15A migration has been applied. The caller
-- must be able to SET ROLE postgres. No credentials or project identity are
-- embedded here, and every public-schema fixture mutation is rolled back.

set client_min_messages = warning;
set role postgres;
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"phase15a-contract-admin"}';

create temporary table phase15a_contract_baseline
on commit preserve rows
as
select
  (select count(*) from public.legal_documents) as legal_document_count,
  (select count(*) from public.registration_acceptances) as acceptance_count,
  (select count(*) from public.players) as player_count,
  (select count(*) from public.tournaments) as tournament_count,
  (select count(*) from public.tournament_brackets) as bracket_count,
  (select count(*) from public.registrations) as registration_count,
  (select count(*) from public.notifications) as notification_count,
  (select count(*) from public.tournament_deletion_jobs) as deletion_job_count;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.phase15a_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Phase 15A contract failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.phase15a_table_acl_is_private(
  p_role name,
  p_table regclass,
  p_select_allowed boolean
)
returns boolean
language sql
stable
as $$
  select
    case
      when p_select_allowed then
        has_table_privilege(p_role, p_table, 'SELECT')
      else
        not has_table_privilege(p_role, p_table, 'SELECT')
    end
    and not has_table_privilege(p_role, p_table, 'INSERT')
    and not has_table_privilege(p_role, p_table, 'UPDATE')
    and not has_table_privilege(p_role, p_table, 'DELETE')
    and not has_table_privilege(p_role, p_table, 'TRUNCATE')
    and not has_table_privilege(p_role, p_table, 'REFERENCES')
    and not has_table_privilege(p_role, p_table, 'TRIGGER')
    and not has_table_privilege(p_role, p_table, 'MAINTAIN');
$$;

create function pg_temp.phase15a_insert_registration(
  p_registration_id uuid,
  p_clerk_user_id text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid
)
returns void
language plpgsql
as $$
begin
  insert into public.registrations (
    id,
    clerk_user_id,
    player_name,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    admin_notes,
    tournament_id,
    tournament_bracket_id,
    submitted_elo,
    elo_verified_elo,
    elo_highest_faction,
    elo_checked_mode,
    elo_checked_at,
    elo_verification_source,
    elo_verified_division,
    elo_calculation_version
  ) values (
    p_registration_id,
    p_clerk_user_id,
    p_clerk_user_id,
    'Phase 15A Contract Tournament',
    'Academy Bracket',
    'pending',
    'verified',
    '',
    p_tournament_id,
    p_tournament_bracket_id,
    1000,
    1000,
    'US Forces',
    '1v1',
    clock_timestamp(),
    'relic',
    'Academy',
    'phase15a-contract-v1'
  );
end;
$$;

create function pg_temp.phase15a_insert_acceptance(
  p_registration_id uuid,
  p_clerk_user_id text,
  p_tournament_id uuid,
  p_rulebook_version text default 'NON-PRODUCTION-PHASE15A-RULEBOOK-1'
)
returns void
language plpgsql
as $$
begin
  insert into public.registration_acceptances (
    registration_id,
    tournament_id,
    clerk_user_id,
    accepted_at,
    rulebook_document_id,
    rulebook_version,
    rulebook_url,
    rulebook_sha256,
    ppa_document_id,
    ppa_version,
    ppa_url,
    ppa_sha256,
    terms_document_id,
    terms_version,
    terms_url,
    terms_sha256,
    privacy_document_id,
    privacy_version,
    privacy_url,
    privacy_sha256,
    rulebook_accepted,
    ppa_accepted,
    terms_accepted,
    privacy_acknowledged,
    age_18_confirmed,
    own_ironclad_account_confirmed,
    linked_steam_account_confirmed
  ) values (
    p_registration_id,
    p_tournament_id,
    p_clerk_user_id,
    '2000-01-01 00:00:00+00'::timestamptz,
    '15a00000-0000-4000-8000-000000000101',
    p_rulebook_version,
    'https://example.invalid/phase15a/rulebook/1',
    repeat('1', 64),
    '15a00000-0000-4000-8000-000000000102',
    'NON-PRODUCTION-PHASE15A-PPA-1',
    'https://example.invalid/phase15a/ppa/1',
    repeat('2', 64),
    '15a00000-0000-4000-8000-000000000103',
    'NON-PRODUCTION-PHASE15A-TERMS-1',
    'https://example.invalid/phase15a/terms/1',
    repeat('3', 64),
    '15a00000-0000-4000-8000-000000000104',
    'NON-PRODUCTION-PHASE15A-PRIVACY-1',
    'https://example.invalid/phase15a/privacy/1',
    repeat('4', 64),
    true,
    true,
    true,
    true,
    true,
    true,
    true
  );
end;
$$;

do $$
declare
  v_tournament constant uuid :=
    '15a00000-0000-4000-8000-000000001001';
  v_bracket constant uuid :=
    '15a00000-0000-4000-8000-000000001101';
  v_player constant uuid :=
    '15a00000-0000-4000-8000-000000002001';
  v_missing_acceptance constant uuid :=
    '15a00000-0000-4000-8000-000000003001';
  v_tampered_acceptance constant uuid :=
    '15a00000-0000-4000-8000-000000003002';
  v_insert_delete constant uuid :=
    '15a00000-0000-4000-8000-000000003003';
  v_direct_valid constant uuid :=
    '15a00000-0000-4000-8000-000000003004';
  v_rpc_registration uuid;
  v_rpc_result record;
  v_rpc_oid oid;
  v_helper_signature text;
  v_helper_oid oid;
  v_close_result jsonb;
  v_failed boolean;
  v_previous_maintenance text;
begin
  perform pg_temp.phase15a_assert(
    session_user = 'postgres',
    'the maintenance contract requires a postgres session owner'
  );
  perform pg_temp.phase15a_assert(
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('ironclad:phase15a-contract', 0)
    ),
    'another Phase 15A contract run already holds the fixture canary'
  );
  perform pg_temp.phase15a_assert(
    not exists (
      select 1
      from public.legal_documents
      where status = 'effective'
    ),
    'Staging must not begin with an Effective legal-document fixture'
  );

  perform pg_temp.phase15a_assert(
    (
      select bool_and(class.relrowsecurity and class.relforcerowsecurity)
      from pg_catalog.pg_class as class
      where class.oid in (
        'public.legal_documents'::regclass,
        'public.registration_acceptances'::regclass
      )
    ),
    'both legal tables must have forced RLS'
  );
  perform pg_temp.phase15a_assert(
    (
      select count(*) = 0
      from pg_catalog.pg_policy as policy
      where policy.polrelid in (
        'public.legal_documents'::regclass,
        'public.registration_acceptances'::regclass
      )
    ),
    'the private legal tables must expose no RLS policy'
  );
  perform pg_temp.phase15a_assert(
    pg_temp.phase15a_table_acl_is_private(
      'anon',
      'public.legal_documents',
      false
    )
      and pg_temp.phase15a_table_acl_is_private(
        'authenticated',
        'public.legal_documents',
        false
      )
      and pg_temp.phase15a_table_acl_is_private(
        'service_role',
        'public.legal_documents',
        true
      ),
    'legal-document grants must be service-role read-only'
  );
  perform pg_temp.phase15a_assert(
    pg_temp.phase15a_table_acl_is_private(
      'anon',
      'public.registration_acceptances',
      false
    )
      and pg_temp.phase15a_table_acl_is_private(
        'authenticated',
        'public.registration_acceptances',
        false
      )
      and pg_temp.phase15a_table_acl_is_private(
        'service_role',
        'public.registration_acceptances',
        true
      ),
    'acceptance grants must be service-role read-only'
  );
  perform pg_temp.phase15a_assert(
    (
      select role.rolbypassrls
      from pg_catalog.pg_roles as role
      where role.rolname = 'service_role'
    ),
    'service_role must retain the trusted RLS bypass boundary'
  );

  v_rpc_oid := pg_catalog.to_regprocedure(
    'public.submit_verified_player_registration(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean)'
  );
  perform pg_temp.phase15a_assert(
    v_rpc_oid is not null
      and (
        select procedure.prosecdef
          and procedure.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
        from pg_catalog.pg_proc as procedure
        where procedure.oid = v_rpc_oid
      )
      and has_function_privilege('service_role', v_rpc_oid, 'EXECUTE')
      and not has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
      and not has_function_privilege(
        'authenticated',
        v_rpc_oid,
        'EXECUTE'
    ),
    'only service_role may execute the atomic registration RPC'
  );

  foreach v_helper_signature in array array[
    'public.protect_legal_document_record()',
    'public.guard_registration_acceptance_insert()',
    'public.protect_registration_acceptance_record()',
    'public.require_registration_acceptance_on_commit()'
  ]
  loop
    v_helper_oid := pg_catalog.to_regprocedure(v_helper_signature);
    perform pg_temp.phase15a_assert(
      v_helper_oid is not null
        and (
          select procedure.prosecdef
            and procedure.proconfig = array['search_path=pg_catalog']::text[]
            and pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
          from pg_catalog.pg_proc as procedure
          where procedure.oid = v_helper_oid
        )
        and not has_function_privilege(
          'anon',
          v_helper_oid,
          'EXECUTE'
        )
        and not has_function_privilege(
          'authenticated',
          v_helper_oid,
          'EXECUTE'
        )
        and not has_function_privilege(
          'service_role',
          v_helper_oid,
          'EXECUTE'
        ),
      'trigger helper ACL or security boundary is invalid: '
        || v_helper_signature
    );
  end loop;

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
      '15a00000-0000-4000-8000-000000000101',
      'rulebook',
      'NON-PRODUCTION-PHASE15A-RULEBOOK-1',
      'https://example.invalid/phase15a/rulebook/1',
      'effective',
      clock_timestamp() - interval '2 minutes',
      clock_timestamp() - interval '1 minute',
      repeat('1', 64)
    ),
    (
      '15a00000-0000-4000-8000-000000000102',
      'ppa',
      'NON-PRODUCTION-PHASE15A-PPA-1',
      'https://example.invalid/phase15a/ppa/1',
      'effective',
      clock_timestamp() - interval '2 minutes',
      clock_timestamp() - interval '1 minute',
      repeat('2', 64)
    ),
    (
      '15a00000-0000-4000-8000-000000000103',
      'terms',
      'NON-PRODUCTION-PHASE15A-TERMS-1',
      'https://example.invalid/phase15a/terms/1',
      'effective',
      clock_timestamp() - interval '2 minutes',
      clock_timestamp() - interval '1 minute',
      repeat('3', 64)
    ),
    (
      '15a00000-0000-4000-8000-000000000104',
      'privacy',
      'NON-PRODUCTION-PHASE15A-PRIVACY-1',
      'https://example.invalid/phase15a/privacy/1',
      'effective',
      clock_timestamp() - interval '2 minutes',
      clock_timestamp() - interval '1 minute',
      repeat('4', 64)
    ),
    (
      '15a00000-0000-4000-8000-000000000105',
      'rulebook',
      'NON-PRODUCTION-PHASE15A-REVIEW-DRAFT-1',
      'https://example.invalid/phase15a/rulebook/review-draft-1',
      'review_draft',
      null,
      null,
      null
    );

  v_failed := false;
  begin
    update public.legal_documents
    set version = 'tampered-version'
    where id = '15a00000-0000-4000-8000-000000000101';
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'versioned legal-document identity must be immutable'
  );

  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    registration_open_at,
    registration_close_at,
    start_date,
    prize_pool,
    registration_enabled
  ) values (
    v_tournament,
    'Phase 15A Contract Tournament',
    'phase15a-contract-tournament',
    '1v1',
    'registration_open',
    'Rollback-only Phase 15A database contract fixture.',
    '',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '1 day',
    clock_timestamp() + interval '2 days',
    '',
    true
  );

  insert into public.tournament_brackets (
    id,
    tournament_id,
    name,
    elo_rules,
    max_players
  ) values (
    v_bracket,
    v_tournament,
    'Academy',
    '0-1099',
    8
  );

  -- A registration without acceptance must fail when the deferred contract is
  -- forced, and the PL/pgSQL subtransaction must roll the registration back.
  v_failed := false;
  begin
    perform pg_temp.phase15a_insert_registration(
      v_missing_acceptance,
      'phase15a-contract-missing',
      v_tournament,
      v_bracket
    );
    set constraints registrations_require_acceptance immediate;
  exception when check_violation then
    v_failed := sqlerrm =
      'Every new registration requires one atomic acceptance';
  end;
  set constraints registrations_require_acceptance deferred;
  perform pg_temp.phase15a_assert(
    v_failed
      and not exists (
        select 1
        from public.registrations
        where id = v_missing_acceptance
      ),
    'a lone registration must fail and roll back'
  );

  -- Acceptance cannot be pre-created or detached from a live registration.
  v_failed := false;
  begin
    perform pg_temp.phase15a_insert_acceptance(
      '15a00000-0000-4000-8000-000000009999',
      'phase15a-contract-orphan',
      v_tournament
    );
  exception when check_violation then
    v_failed := sqlerrm = 'Registration acceptance identity is invalid';
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'an orphan acceptance must fail immediately'
  );

  -- Browser-like tampering with a trusted snapshot must reject both rows.
  v_failed := false;
  begin
    perform pg_temp.phase15a_insert_registration(
      v_tampered_acceptance,
      'phase15a-contract-tamper',
      v_tournament,
      v_bracket
    );
    perform pg_temp.phase15a_insert_acceptance(
      v_tampered_acceptance,
      'phase15a-contract-tamper',
      v_tournament,
      'tampered-version'
    );
  exception when check_violation then
    v_failed := sqlerrm = 'Registration consent is invalid';
  end;
  perform pg_temp.phase15a_assert(
    v_failed
      and not exists (
        select 1
        from public.registrations
        where id = v_tampered_acceptance
      )
      and not exists (
        select 1
        from public.registration_acceptances
        where registration_id = v_tampered_acceptance
      ),
    'tampered acceptance facts must roll back registration and evidence'
  );

  -- Inserting both rows and then deleting only the registration in the same
  -- transaction must not leave acceptance evidence orphaned.
  v_failed := false;
  begin
    perform pg_temp.phase15a_insert_registration(
      v_insert_delete,
      'phase15a-contract-insert-delete',
      v_tournament,
      v_bracket
    );
    perform pg_temp.phase15a_insert_acceptance(
      v_insert_delete,
      'phase15a-contract-insert-delete',
      v_tournament
    );
    perform set_config('ironclad.tournament_deletion', 'on', true);
    delete from public.registrations where id = v_insert_delete;
    set constraints registrations_require_acceptance immediate;
  exception when check_violation then
    v_failed := sqlerrm =
      'Registration acceptance cannot outlive a registration created in the same transaction';
  end;
  set constraints registrations_require_acceptance deferred;
  perform pg_temp.phase15a_assert(
    v_failed
      and not exists (
        select 1
        from public.registration_acceptances
        where registration_id = v_insert_delete
      ),
    'insert-accept-delete must roll back rather than leave an orphan'
  );

  perform pg_temp.phase15a_insert_registration(
    v_direct_valid,
    'phase15a-contract-direct-valid',
    v_tournament,
    v_bracket
  );
  perform pg_temp.phase15a_insert_acceptance(
    v_direct_valid,
    'phase15a-contract-direct-valid',
    v_tournament
  );
  set constraints registrations_require_acceptance immediate;
  set constraints registrations_require_acceptance deferred;
  perform pg_temp.phase15a_assert(
    exists (
      select 1
      from public.registration_acceptances as acceptance
      join public.registrations as registration
        on registration.id = acceptance.registration_id
      where acceptance.registration_id = v_direct_valid
        and acceptance.accepted_at >= registration.created_at
        and acceptance.accepted_at > '2000-01-01'::timestamptz
        and acceptance.rulebook_sha256 = repeat('1', 64)
        and acceptance.ppa_sha256 = repeat('2', 64)
        and acceptance.terms_sha256 = repeat('3', 64)
        and acceptance.privacy_sha256 = repeat('4', 64)
        and acceptance.age_18_confirmed
        and acceptance.own_ironclad_account_confirmed
        and acceptance.linked_steam_account_confirmed
    ),
    'valid evidence must use database time and trusted document snapshots'
  );

  v_failed := false;
  begin
    update public.registration_acceptances
    set age_18_confirmed = false
    where registration_id = v_direct_valid;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'ordinary acceptance updates must fail'
  );

  v_failed := false;
  begin
    delete from public.registration_acceptances
    where registration_id = v_direct_valid;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'ordinary acceptance deletion must fail even for postgres'
  );

  -- Discord remains optional in the database completion predicate. A supplied
  -- value survives unrelated updates; clearing it normalizes to NULL and
  -- disables public visibility without making the profile incomplete.
  insert into public.players (
    id,
    clerk_user_id,
    display_name,
    in_game_name,
    discord_username,
    discord_public_enabled,
    steam_username,
    steam_id64,
    country,
    region,
    timezone,
    avatar_url
  ) values (
    v_player,
    'phase15a-contract-player',
    'Phase 15A Contract Player',
    'Phase 15A Contract Player',
    'phase15a-player',
    true,
    'Phase 15A Steam',
    '76561198000015001',
    'AU',
    'OCE',
    'Australia/Sydney',
    'avatars/phase15a-contract-player/avatar.png'
  );
  update public.players
  set bio = 'Unrelated profile update.'
  where id = v_player;
  perform pg_temp.phase15a_assert(
    exists (
      select 1
      from public.players
      where id = v_player
        and discord_username = 'phase15a-player'
        and discord_public_enabled
        and profile_completed
    ),
    'a supplied Discord value and opt-in must survive unrelated updates'
  );

  update public.players
  set discord_username = '   '
  where id = v_player;
  perform pg_temp.phase15a_assert(
    exists (
      select 1
      from public.players
      where id = v_player
        and discord_username is null
        and discord_public_enabled is false
        and profile_completed
    ),
    'blank Discord must be valid, private, and completion-neutral'
  );

  -- A Review Draft selector and a missing control must both fail before any
  -- registration or acceptance row is created.
  v_failed := false;
  begin
    perform *
    from public.submit_verified_player_registration(
      v_player,
      'phase15a-contract-player',
      '76561198000015001',
      v_tournament,
      v_bracket,
      1000,
      'US Forces',
      'Academy',
      'phase15a-contract-v1',
      '15a00000-0000-4000-8000-000000000105',
      '15a00000-0000-4000-8000-000000000102',
      '15a00000-0000-4000-8000-000000000103',
      '15a00000-0000-4000-8000-000000000104',
      true,
      true,
      true,
      true,
      true,
      true,
      false
    );
  exception when invalid_parameter_value then
    v_failed := sqlerrm = 'Registration document set is unavailable';
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'Review Draft documents must not authorize registration'
  );

  v_failed := false;
  begin
    perform *
    from public.submit_verified_player_registration(
      v_player,
      'phase15a-contract-player',
      '76561198000015001',
      v_tournament,
      v_bracket,
      1000,
      'US Forces',
      'Academy',
      'phase15a-contract-v1',
      '15a00000-0000-4000-8000-000000000101',
      '15a00000-0000-4000-8000-000000000102',
      '15a00000-0000-4000-8000-000000000103',
      '15a00000-0000-4000-8000-000000000104',
      true,
      true,
      true,
      true,
      false,
      true,
      false
    );
  exception when invalid_parameter_value then
    v_failed := sqlerrm = 'Registration consent is invalid';
  end;
  perform pg_temp.phase15a_assert(
    v_failed
      and not exists (
        select 1
        from public.registrations
        where clerk_user_id = 'phase15a-contract-player'
      ),
    'a missing 18+ control must reject without residue'
  );

  select *
  into strict v_rpc_result
  from public.submit_verified_player_registration(
    v_player,
    'phase15a-contract-player',
    '76561198000015001',
    v_tournament,
    v_bracket,
    1000,
    'US Forces',
    'Academy',
    'phase15a-contract-v1',
    '15a00000-0000-4000-8000-000000000101',
    '15a00000-0000-4000-8000-000000000102',
    '15a00000-0000-4000-8000-000000000103',
    '15a00000-0000-4000-8000-000000000104',
    true,
    true,
    true,
    true,
    true,
    true,
    false
  );
  v_rpc_registration := v_rpc_result.id;

  perform pg_temp.phase15a_assert(
    v_rpc_registration is not null
      and v_rpc_result.waitlist_confirmation_required is false
      and (
        select count(*) = 1
        from public.registration_acceptances as acceptance
        join public.registrations as registration
          on registration.id = acceptance.registration_id
        where acceptance.registration_id = v_rpc_registration
          and registration.clerk_user_id = 'phase15a-contract-player'
          and registration.tournament_id = v_tournament
          and registration.registration_status = 'pending'
          and acceptance.clerk_user_id = 'phase15a-contract-player'
          and acceptance.tournament_id = v_tournament
          and acceptance.accepted_at >= registration.created_at
          and acceptance.rulebook_document_id =
            '15a00000-0000-4000-8000-000000000101'
          and acceptance.rulebook_version =
            'NON-PRODUCTION-PHASE15A-RULEBOOK-1'
          and acceptance.rulebook_url =
            'https://example.invalid/phase15a/rulebook/1'
          and acceptance.rulebook_sha256 = repeat('1', 64)
          and acceptance.ppa_document_id =
            '15a00000-0000-4000-8000-000000000102'
          and acceptance.ppa_version =
            'NON-PRODUCTION-PHASE15A-PPA-1'
          and acceptance.ppa_url =
            'https://example.invalid/phase15a/ppa/1'
          and acceptance.ppa_sha256 = repeat('2', 64)
          and acceptance.terms_document_id =
            '15a00000-0000-4000-8000-000000000103'
          and acceptance.terms_version =
            'NON-PRODUCTION-PHASE15A-TERMS-1'
          and acceptance.terms_url =
            'https://example.invalid/phase15a/terms/1'
          and acceptance.terms_sha256 = repeat('3', 64)
          and acceptance.privacy_document_id =
            '15a00000-0000-4000-8000-000000000104'
          and acceptance.privacy_version =
            'NON-PRODUCTION-PHASE15A-PRIVACY-1'
          and acceptance.privacy_url =
            'https://example.invalid/phase15a/privacy/1'
          and acceptance.privacy_sha256 = repeat('4', 64)
          and acceptance.rulebook_accepted
          and acceptance.ppa_accepted
          and acceptance.terms_accepted
          and acceptance.privacy_acknowledged
          and acceptance.age_18_confirmed
          and acceptance.own_ironclad_account_confirmed
          and acceptance.linked_steam_account_confirmed
      ),
    'the RPC must create exactly one trusted acceptance with registration'
  );

  -- Fire the insert constraint while the registration exists. The following
  -- hard deletion therefore models a later transaction, while this script can
  -- still roll every fixture back as one unit.
  set constraints registrations_require_acceptance immediate;
  set constraints registrations_require_acceptance deferred;

  perform public.delete_tournament_data(
    v_tournament,
    'phase15a-contract-admin'
  );
  perform pg_temp.phase15a_assert(
    not exists (
      select 1 from public.tournaments where id = v_tournament
    )
      and not exists (
        select 1
        from public.registrations
        where id = v_rpc_registration
      )
      and exists (
        select 1
        from public.registration_acceptances
        where registration_id = v_rpc_registration
          and tournament_id = v_tournament
          and clerk_user_id = 'phase15a-contract-player'
      ),
    'hard deletion must retain the private acceptance snapshot'
  );

  v_close_result := public.close_ironclad_player_account(
    'phase15a-contract-player'
  );
  perform pg_temp.phase15a_assert(
    v_close_result ->> 'outcome' = 'deleted'
      and not exists (
        select 1
        from public.players
        where clerk_user_id = 'phase15a-contract-player'
      )
      and exists (
        select 1
        from public.registration_acceptances
        where registration_id = v_rpc_registration
          and clerk_user_id = 'phase15a-contract-player'
      ),
    'history-free account closure must succeed and retain private evidence'
  );

  v_failed := false;
  begin
    delete from public.registration_acceptances
    where registration_id = v_rpc_registration;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15a_assert(
    v_failed,
    'retained evidence must remain immutable after closure and hard deletion'
  );

  v_previous_maintenance := current_setting(
    'ironclad.legal_evidence_maintenance',
    true
  );
  perform set_config(
    'ironclad.legal_evidence_maintenance',
    'on',
    true
  );
  delete from public.registration_acceptances
  where registration_id = v_direct_valid;
  perform set_config(
    'ironclad.legal_evidence_maintenance',
    coalesce(v_previous_maintenance, ''),
    true
  );
  perform pg_temp.phase15a_assert(
    not exists (
      select 1
      from public.registration_acceptances
      where registration_id = v_direct_valid
    )
      and coalesce(
        current_setting('ironclad.legal_evidence_maintenance', true),
        ''
      ) <> 'on',
    'explicit owner-only maintenance deletion must be narrow and local'
  );
end;
$$;

rollback;

do $$
declare
  v_baseline pg_temp.phase15a_contract_baseline%rowtype;
begin
  select * into strict v_baseline
  from pg_temp.phase15a_contract_baseline;

  if (select count(*) from public.legal_documents)
      is distinct from v_baseline.legal_document_count
    or (select count(*) from public.registration_acceptances)
      is distinct from v_baseline.acceptance_count
    or (select count(*) from public.players)
      is distinct from v_baseline.player_count
    or (select count(*) from public.tournaments)
      is distinct from v_baseline.tournament_count
    or (select count(*) from public.tournament_brackets)
      is distinct from v_baseline.bracket_count
    or (select count(*) from public.registrations)
      is distinct from v_baseline.registration_count
    or (select count(*) from public.notifications)
      is distinct from v_baseline.notification_count
    or (select count(*) from public.tournament_deletion_jobs)
      is distinct from v_baseline.deletion_job_count then
    raise exception 'Phase 15A contract changed Staging row counts';
  end if;

  if exists (
    select 1
    from public.legal_documents
    where id >= '15a00000-0000-4000-8000-000000000101'::uuid
      and id <= '15a00000-0000-4000-8000-000000000105'::uuid
  )
    or exists (
      select 1
      from public.registration_acceptances
      where clerk_user_id like 'phase15a-contract-%'
    )
    or exists (
      select 1
      from public.players
      where clerk_user_id like 'phase15a-contract-%'
        or steam_id64 = '76561198000015001'
    )
    or exists (
      select 1
      from public.tournaments
      where slug = 'phase15a-contract-tournament'
    )
    or exists (
      select 1
      from public.tournament_brackets
      where id = '15a00000-0000-4000-8000-000000001101'
    )
    or exists (
      select 1
      from public.registrations
      where clerk_user_id like 'phase15a-contract-%'
    )
    or exists (
      select 1
      from public.notifications
      where recipient_clerk_user_id like 'phase15a-contract-%'
        or actor_clerk_user_id like 'phase15a-contract-%'
        or position('phase15a-contract-' in metadata::text) > 0
    )
    or exists (
      select 1
      from public.tournament_deletion_jobs
      where requested_by = 'phase15a-contract-admin'
    ) then
    raise exception 'Phase 15A deterministic fixture residue remains';
  end if;
end;
$$;

select pg_catalog.jsonb_build_object(
  'contract', 'phase15a-versioned-consent-discord',
  'fixture_transaction', 'rolled_back',
  'zero_residue', true
)::text;
