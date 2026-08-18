-- Rollback-only Phase 15C final-corpus registration contract.
--
-- Invoke only through scripts/phase15c/run-staging-registration-contract.mjs.
-- The wrapper has no Production target and fixes the Supabase project ref to
-- ironclad-staging. This SQL independently requires four Effective documents
-- whose immutable URLs use the exact Vercel Preview host family, so the
-- canonical Production register is rejected.

set client_min_messages = warning;
set role postgres;
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"phase15c-contract-admin"}';

create temporary table phase15c_contract_baseline
on commit preserve rows
as
select
  (select count(*) from public.legal_documents) as legal_document_count,
  (select count(*) from public.registration_acceptances) as acceptance_count,
  (select count(*) from public.players) as player_count,
  (select count(*) from public.tournaments) as tournament_count,
  (select count(*) from public.tournament_brackets) as bracket_count,
  (select count(*) from public.registrations) as registration_count;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.phase15c_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Phase 15C contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_tournament constant uuid :=
    '15c00000-0000-4000-8000-000000001001';
  v_bracket constant uuid :=
    '15c00000-0000-4000-8000-000000001101';
  v_player constant uuid :=
    '15c00000-0000-4000-8000-000000002001';
  v_tampered_registrations constant uuid[] := array[
    '15c00000-0000-4000-8000-000000003001'::uuid,
    '15c00000-0000-4000-8000-000000003002'::uuid,
    '15c00000-0000-4000-8000-000000003003'::uuid
  ];
  v_rulebook public.legal_documents%rowtype;
  v_ppa public.legal_documents%rowtype;
  v_terms public.legal_documents%rowtype;
  v_privacy public.legal_documents%rowtype;
  v_controls boolean[];
  v_control_index integer;
  v_tamper_index integer;
  v_failed boolean;
  v_rpc_result record;
  v_rpc_registration uuid;
begin
  perform pg_temp.phase15c_assert(
    current_user = 'postgres',
    'the database contract must SET ROLE postgres'
  );
  perform pg_temp.phase15c_assert(
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:phase15c-final-registration-contract',
        0
      )
    ),
    'another Phase 15C contract run holds the fixture canary'
  );

  perform pg_temp.phase15c_assert(
    (select count(*) = 4 from public.legal_documents)
      and (
        select count(*) = 4
        from public.legal_documents
        where status = 'effective'
          and published_at is not null
          and effective_at is not null
          and effective_at <= clock_timestamp()
          and sha256 ~ '^[0-9a-f]{64}$'
          and immutable_url ~
            '^https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app/documents-rules-ppa/ironclad-.+\.pdf$'
      ),
    'Staging must contain exactly four Effective Preview-hosted documents'
  );

  select * into strict v_rulebook
  from public.legal_documents
  where document_kind = 'rulebook'
    and version = '3.0'
    and status = 'effective';
  select * into strict v_ppa
  from public.legal_documents
  where document_kind = 'ppa'
    and version = '3.0'
    and status = 'effective';
  select * into strict v_terms
  from public.legal_documents
  where document_kind = 'terms'
    and version = '1.0'
    and status = 'effective';
  select * into strict v_privacy
  from public.legal_documents
  where document_kind = 'privacy'
    and version = '1.0'
    and status = 'effective';

  perform pg_temp.phase15c_assert(
    not exists (
      select 1
      from public.players
      where id = v_player
        or clerk_user_id like 'phase15c-contract-%'
        or steam_id64 = '76561198000015001'
    )
      and not exists (
        select 1
        from public.tournaments
        where id = v_tournament
          or slug = 'phase15c-final-registration-contract'
      )
      and not exists (
        select 1
        from public.registrations
        where clerk_user_id like 'phase15c-contract-%'
      )
      and not exists (
        select 1
        from public.registration_acceptances
        where clerk_user_id like 'phase15c-contract-%'
      ),
    'deterministic fixture identifiers must begin unused'
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
    'Phase 15C Final Registration Contract',
    'phase15c-final-registration-contract',
    '1v1',
    'registration_open',
    'Rollback-only Staging contract fixture.',
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
    'phase15c-contract-player',
    'Phase 15C Contract Player',
    'Phase 15C Contract Player',
    '   ',
    true,
    'Phase 15C Steam',
    '76561198000015001',
    'AU',
    'OCE',
    'Australia/Sydney',
    'avatars/phase15c-contract-player/avatar.png'
  );

  perform pg_temp.phase15c_assert(
    exists (
      select 1
      from public.players
      where id = v_player
        and discord_username is null
        and discord_public_enabled is false
        and profile_completed
    ),
    'blank Discord must remain valid, private, and completion-neutral'
  );

  -- Exercise each of the six governing controls independently. The combined
  -- account-and-Steam control is stored as both ownership confirmations.
  for v_control_index in 1..6 loop
    v_controls := array[true, true, true, true, true, true];
    v_controls[v_control_index] := false;
    v_failed := false;

    begin
      perform *
      from public.submit_verified_player_registration(
        v_player,
        'phase15c-contract-player',
        '76561198000015001',
        v_tournament,
        v_bracket,
        1000,
        'US Forces',
        'Academy',
        'phase15c-final-contract-v1',
        v_rulebook.id,
        v_ppa.id,
        v_terms.id,
        v_privacy.id,
        v_controls[1],
        v_controls[2],
        v_controls[3],
        v_controls[4],
        v_controls[5],
        v_controls[6],
        false
      );
    exception when invalid_parameter_value then
      v_failed := sqlerrm = 'Registration consent is invalid';
    end;

    perform pg_temp.phase15c_assert(
      v_failed
        and not exists (
          select 1
          from public.registrations
          where clerk_user_id = 'phase15c-contract-player'
        )
        and not exists (
          select 1
          from public.registration_acceptances
          where clerk_user_id = 'phase15c-contract-player'
        ),
      'each missing governing control must reject without residue: '
        || v_control_index
    );
  end loop;

  -- An untrusted selector for the wrong document kind must fail before either
  -- the registration or its evidence is created.
  v_failed := false;
  begin
    perform *
    from public.submit_verified_player_registration(
      v_player,
      'phase15c-contract-player',
      '76561198000015001',
      v_tournament,
      v_bracket,
      1000,
      'US Forces',
      'Academy',
      'phase15c-final-contract-v1',
      v_ppa.id,
      v_ppa.id,
      v_terms.id,
      v_privacy.id,
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
  perform pg_temp.phase15c_assert(
    v_failed
      and not exists (
        select 1
        from public.registrations
        where clerk_user_id = 'phase15c-contract-player'
      ),
    'a tampered document selector must reject atomically'
  );

  -- Direct attempts to forge each trusted snapshot fact independently must
  -- roll back the paired registration as one PL/pgSQL subtransaction.
  for v_tamper_index in 1..array_length(v_tampered_registrations, 1) loop
    v_failed := false;
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
        v_tampered_registrations[v_tamper_index],
        'phase15c-contract-tamper-' || v_tamper_index,
        'Phase 15C Tamper Fixture',
        'Phase 15C Final Registration Contract',
        'Academy Bracket',
        'pending',
        'verified',
        '',
        v_tournament,
        v_bracket,
        1000,
        1000,
        'US Forces',
        '1v1',
        clock_timestamp(),
        'relic',
        'Academy',
        'phase15c-final-contract-v1'
      );

      insert into public.registration_acceptances (
        registration_id,
        tournament_id,
        clerk_user_id,
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
        v_tampered_registrations[v_tamper_index],
        v_tournament,
        'phase15c-contract-tamper-' || v_tamper_index,
        v_rulebook.id,
        case
          when v_tamper_index = 1 then v_rulebook.version || '-tampered'
          else v_rulebook.version
        end,
        v_rulebook.immutable_url,
        v_rulebook.sha256,
        v_ppa.id,
        v_ppa.version,
        case
          when v_tamper_index = 2 then v_ppa.immutable_url || '.tampered'
          else v_ppa.immutable_url
        end,
        v_ppa.sha256,
        v_terms.id,
        v_terms.version,
        v_terms.immutable_url,
        case
          when v_tamper_index = 3 and v_terms.sha256 = repeat('0', 64)
            then repeat('1', 64)
          when v_tamper_index = 3 then repeat('0', 64)
          else v_terms.sha256
        end,
        v_privacy.id,
        v_privacy.version,
        v_privacy.immutable_url,
        v_privacy.sha256,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      );
    exception when check_violation then
      v_failed := sqlerrm = 'Registration consent is invalid';
    end;
    perform pg_temp.phase15c_assert(
      v_failed
        and not exists (
          select 1
          from public.registrations
          where id = v_tampered_registrations[v_tamper_index]
        )
        and not exists (
          select 1
          from public.registration_acceptances
          where registration_id = v_tampered_registrations[v_tamper_index]
        ),
      'forged snapshot fact must reject registration and evidence: '
        || case v_tamper_index
          when 1 then 'version'
          when 2 then 'URL'
          when 3 then 'SHA-256'
        end
    );
  end loop;

  select *
  into strict v_rpc_result
  from public.submit_verified_player_registration(
    v_player,
    'phase15c-contract-player',
    '76561198000015001',
    v_tournament,
    v_bracket,
    1000,
    'US Forces',
    'Academy',
    'phase15c-final-contract-v1',
    v_rulebook.id,
    v_ppa.id,
    v_terms.id,
    v_privacy.id,
    true,
    true,
    true,
    true,
    true,
    true,
    false
  );
  v_rpc_registration := v_rpc_result.id;

  perform pg_temp.phase15c_assert(
    v_rpc_registration is not null
      and v_rpc_result.waitlist_confirmation_required is false
      and (
        select count(*) = 1
        from public.registration_acceptances as acceptance
        join public.registrations as registration
          on registration.id = acceptance.registration_id
        where acceptance.registration_id = v_rpc_registration
          and registration.clerk_user_id = 'phase15c-contract-player'
          and registration.tournament_id = v_tournament
          and registration.discord_username is null
          and acceptance.clerk_user_id = 'phase15c-contract-player'
          and acceptance.tournament_id = v_tournament
          and acceptance.accepted_at >= registration.created_at
          and acceptance.accepted_at <= clock_timestamp()
          and acceptance.rulebook_document_id = v_rulebook.id
          and acceptance.rulebook_version = v_rulebook.version
          and acceptance.rulebook_url = v_rulebook.immutable_url
          and acceptance.rulebook_sha256 = v_rulebook.sha256
          and acceptance.ppa_document_id = v_ppa.id
          and acceptance.ppa_version = v_ppa.version
          and acceptance.ppa_url = v_ppa.immutable_url
          and acceptance.ppa_sha256 = v_ppa.sha256
          and acceptance.terms_document_id = v_terms.id
          and acceptance.terms_version = v_terms.version
          and acceptance.terms_url = v_terms.immutable_url
          and acceptance.terms_sha256 = v_terms.sha256
          and acceptance.privacy_document_id = v_privacy.id
          and acceptance.privacy_version = v_privacy.version
          and acceptance.privacy_url = v_privacy.immutable_url
          and acceptance.privacy_sha256 = v_privacy.sha256
          and acceptance.rulebook_accepted
          and acceptance.ppa_accepted
          and acceptance.terms_accepted
          and acceptance.privacy_acknowledged
          and acceptance.age_18_confirmed
          and acceptance.own_ironclad_account_confirmed
          and acceptance.linked_steam_account_confirmed
      ),
    'RPC must atomically snapshot the authoritative final four documents'
  );

  v_failed := false;
  begin
    update public.registration_acceptances
    set age_18_confirmed = false
    where registration_id = v_rpc_registration;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15c_assert(
    v_failed,
    'acceptance updates must remain immutable'
  );

  v_failed := false;
  begin
    delete from public.registration_acceptances
    where registration_id = v_rpc_registration;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.phase15c_assert(
    v_failed,
    'acceptance deletion must remain immutable'
  );

  set constraints registrations_require_acceptance immediate;
  set constraints registrations_require_acceptance deferred;
end;
$$;

rollback;

do $$
declare
  v_baseline pg_temp.phase15c_contract_baseline%rowtype;
begin
  select * into strict v_baseline
  from pg_temp.phase15c_contract_baseline;

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
      is distinct from v_baseline.registration_count then
    raise exception 'Phase 15C contract changed Staging row counts';
  end if;

  if exists (
    select 1
    from public.players
    where clerk_user_id like 'phase15c-contract-%'
      or steam_id64 = '76561198000015001'
  )
    or exists (
      select 1
      from public.tournaments
      where slug = 'phase15c-final-registration-contract'
    )
    or exists (
      select 1
      from public.registrations
      where clerk_user_id like 'phase15c-contract-%'
    )
    or exists (
      select 1
      from public.registration_acceptances
      where clerk_user_id like 'phase15c-contract-%'
    ) then
    raise exception 'Phase 15C deterministic fixture residue remains';
  end if;
end;
$$;

select jsonb_build_object(
  'contract', 'phase15c-final-legal-registration',
  'target', 'ironclad-staging',
  'final_documents', 4,
  'six_controls', 'rejected_individually_when_false',
  'trusted_snapshot', 'version-url-sha256-and-database-time',
  'tamper_rejection', true,
  'atomic_registration_acceptance', true,
  'blank_discord', true,
  'acceptance_immutable', true,
  'fixture_transaction', 'rolled_back',
  'zero_residue', true
) as phase15c_contract_result;
