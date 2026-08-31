-- Rollback-only executable proof for the exact Badge 5/28 Staging fixture.
begin;

set local client_min_messages = warning;
set local role postgres;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims =
  '{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"badge-cross-division-contract"}';
set local lock_timeout = '5s';
set local statement_timeout = '2min';

create function pg_temp.badge_cross_division_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Badge cross-division fixture failed: %', p_message;
  end if;
end;
$$;

insert into vault.decrypted_secrets (name, decrypted_secret)
values (
  'ironclad_staging_synthetic_uat_fixture_secret',
  'rollback-only-badge-cross-division-secret-0000000000000001'
)
on conflict (name) do update
set decrypted_secret = excluded.decrypted_secret;

do $$
declare
  v_secret text;
  v_player_id uuid;
  v_generic_player_id uuid;
  v_generic_registration uuid;
  v_challenge_registration uuid;
  v_main_registration uuid;
  v_result record;
  v_rejected boolean;
begin
  select decrypted_secret
  into strict v_secret
  from vault.decrypted_secrets
  where name = 'ironclad_staging_synthetic_uat_fixture_secret';

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
  ) values
    (
      '5b700000-0000-4000-8000-000000000001',
      'Badge Cross Division Challenge',
      'badge-cross-division-challenge',
      '1v1',
      'registration_open',
      'Rollback-only cross-division Challenge contract.',
      '',
      clock_timestamp() - interval '1 day',
      clock_timestamp() + interval '1 day',
      clock_timestamp() + interval '2 days',
      '',
      true
    ),
    (
      '5b700000-0000-4000-8000-000000000002',
      'Badge Cross Division Main',
      'badge-cross-division-main',
      '1v1',
      'registration_open',
      'Rollback-only cross-division Main contract.',
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
  ) values
    (
      '5b700000-0000-4000-8000-000000000101',
      '5b700000-0000-4000-8000-000000000001',
      'Challenge',
      '1100-1399',
      8
    ),
    (
      '5b700000-0000-4000-8000-000000000102',
      '5b700000-0000-4000-8000-000000000002',
      'Main',
      '1400+',
      8
    ),
    (
      '5b700000-0000-4000-8000-000000000103',
      '5b700000-0000-4000-8000-000000000001',
      'Academy',
      '0-1099',
      8
    );

  select * into strict v_result
  from public.provision_staging_synthetic_uat_player(
    v_secret,
    'TestAcademy1',
    'user_BadgeCrossDivisionAcademy1'
  );
  v_player_id := v_result.player_id;

  select * into strict v_result
  from public.provision_staging_synthetic_uat_player(
    v_secret,
    'TestChallenge1',
    'user_BadgeCrossDivisionChallenge1'
  );
  v_generic_player_id := v_result.player_id;

  select * into strict v_result
  from public.enrol_staging_synthetic_uat_player(
    v_secret,
    'TestChallenge1',
    '5b700000-0000-4000-8000-000000000001',
    '5b700000-0000-4000-8000-000000000101',
    false
  );
  v_generic_registration := v_result.registration_id;
  perform pg_temp.badge_cross_division_assert(
    v_result.player_id = v_generic_player_id
      and v_result.synthetic_elo = 1100
      and v_result.synthetic_division = 'Challenge'
      and v_result.registration_status = 'pending'
      and v_result.created,
    'normal synthetic enrollment must retain its base fixture eligibility'
  );

  perform pg_temp.badge_cross_division_assert(
    exists (
      select 1
      from public.registrations as registration
      join ironclad_private.staging_synthetic_uat_enrolments as fixture
        on fixture.registration_id = registration.id
      where registration.id = v_generic_registration
        and registration.profile_id = v_generic_player_id
        and registration.submitted_elo = 1100
        and registration.registration_provenance =
          'staging_synthetic_uat'
        and registration.fixture_contract_version =
          'staging-synthetic-v1'
    )
      and not exists (
        select 1
        from ironclad_private.staging_badge_cross_division_enrolments
        where registration_id = v_generic_registration
      ),
    'normal fixture evidence must not be replaced by cross-division evidence'
  );

  select * into strict v_result
  from public.enrol_staging_badge_cross_division_acceptance(
    v_secret,
    '5b700000-0000-4000-8000-000000000001',
    '5b700000-0000-4000-8000-000000000101'
  );
  v_challenge_registration := v_result.registration_id;

  perform pg_temp.badge_cross_division_assert(
    v_result.player_id = v_player_id
      and v_result.synthetic_elo = 1100
      and v_result.synthetic_division = 'Challenge'
      and v_result.registration_status = 'pending'
      and v_result.scenario_key = 'badge-05-28-cross-division'
      and v_result.created,
    'Challenge enrollment must use its one exact synthetic snapshot'
  );

  select * into strict v_result
  from public.cleanup_staging_synthetic_uat_enrolment(
    v_secret,
    'TestAcademy1',
    '5b700000-0000-4000-8000-000000000001'
  );
  perform pg_temp.badge_cross_division_assert(
    v_result.registration_id = v_challenge_registration
      and v_result.deleted,
    'generic exact-ID cleanup must remove an unlaunched cross enrollment'
  );
  perform pg_temp.badge_cross_division_assert(
    not exists (
      select 1
      from public.registrations
      where id = v_challenge_registration
    )
      and not exists (
        select 1
        from ironclad_private.staging_badge_cross_division_enrolments
        where registration_id = v_challenge_registration
      )
      and not exists (
        select 1
        from ironclad_private.staging_synthetic_uat_enrolments
        where registration_id = v_challenge_registration
      ),
    'cleanup must remove both private evidence rows with the registration'
  );

  select * into strict v_result
  from public.enrol_staging_badge_cross_division_acceptance(
    v_secret,
    '5b700000-0000-4000-8000-000000000001',
    '5b700000-0000-4000-8000-000000000101'
  );
  v_challenge_registration := v_result.registration_id;
  perform pg_temp.badge_cross_division_assert(
    v_result.created,
    'cleanup must free the fixed Challenge slot for an exact retry'
  );

  select * into strict v_result
  from public.enrol_staging_badge_cross_division_acceptance(
    v_secret,
    '5b700000-0000-4000-8000-000000000001',
    '5b700000-0000-4000-8000-000000000101'
  );
  perform pg_temp.badge_cross_division_assert(
    v_result.registration_id = v_challenge_registration
      and not v_result.created,
    'exact retry must return the existing Challenge enrollment'
  );

  select * into strict v_result
  from public.enrol_staging_badge_cross_division_acceptance(
    v_secret,
    '5b700000-0000-4000-8000-000000000002',
    '5b700000-0000-4000-8000-000000000102'
  );
  v_main_registration := v_result.registration_id;

  perform pg_temp.badge_cross_division_assert(
    v_result.synthetic_elo = 1400
      and v_result.synthetic_division = 'Main / Pro'
      and v_result.registration_status = 'pending'
      and v_result.created,
    'Main enrollment must use its one exact synthetic snapshot'
  );

  set constraints registrations_require_acceptance immediate;
  set constraints registrations_require_acceptance deferred;

  update public.registrations
  set registration_status = 'approved'
  where id in (
    v_generic_registration,
    v_challenge_registration,
    v_main_registration
  );

  perform pg_temp.badge_cross_division_assert(
    (
      select count(*) = 2
      from public.registrations as registration
      join ironclad_private.staging_badge_cross_division_enrolments
        as progression
        on progression.registration_id = registration.id
      join ironclad_private.staging_synthetic_uat_enrolments as fixture
        on fixture.registration_id = registration.id
      where registration.id in (
        v_challenge_registration,
        v_main_registration
      )
        and registration.registration_status = 'approved'
        and registration.elo_status = 'manual_review'
        and registration.submitted_elo = progression.synthetic_elo
        and registration.submitted_elo = fixture.synthetic_elo
        and registration.registration_provenance =
          'staging_synthetic_uat'
        and registration.fixture_contract_version =
          'staging-synthetic-v1'
        and registration.steam_name is null
        and registration.coh3_player_card_url is null
        and registration.elo_verified_elo is null
        and registration.elo_verification_source is null
        and registration.elo_verified_division is null
        and registration.elo_calculation_version is null
        and progression.steam_openid_verified is false
        and progression.steam_ownership_verified is false
        and progression.relic_live_lookup_verified is false
        and progression.linked_steam_legal_confirmation is false
    ),
    'both registrations must remain provider-null through normal approval'
  );

  perform pg_temp.badge_cross_division_assert(
    not exists (
      select 1
      from public.player_badge_awards as award
      where award.player_id = v_player_id
    )
      and not exists (
        select 1
        from public.match_participant_outcome_authority as authority
        where authority.registration_id in (
          v_challenge_registration,
          v_main_registration
        )
      )
      and not exists (
        select 1
        from public.tournament_championship_path_authority as path
        where path.registration_id in (
          v_challenge_registration,
          v_main_registration
        )
      ),
    'enrollment must not manufacture Badge or competition authority'
  );

  v_rejected := false;
  begin
    perform *
    from public.enrol_staging_badge_cross_division_acceptance(
      v_secret,
      '5b700000-0000-4000-8000-000000000001',
      '5b700000-0000-4000-8000-000000000103'
    );
  exception when invalid_parameter_value then
    v_rejected := true;
  end;
  perform pg_temp.badge_cross_division_assert(
    v_rejected,
    'Academy and arbitrary bracket inputs must be rejected'
  );
end;
$$;

select pg_temp.badge_cross_division_assert(
  not has_table_privilege(
    'service_role',
    'ironclad_private.staging_badge_cross_division_enrolments',
    'SELECT'
  )
    and not has_function_privilege(
      'anon',
      'public.enrol_staging_badge_cross_division_acceptance(text,uuid,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.enrol_staging_badge_cross_division_acceptance(text,uuid,uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.enrol_staging_badge_cross_division_acceptance(text,uuid,uuid)',
      'EXECUTE'
    ),
  'only service_role may use the public RPC and no API role may read evidence'
);

rollback;

select jsonb_build_object(
  'contract', 'staging-badge-cross-division-fixture',
  'challenge_snapshot', 'pass',
  'main_snapshot', 'pass',
  'provider_null', 'pass',
  'idempotency', 'pass',
  'authority_not_created', 'pass',
  'fixture_transaction', 'rolled_back',
  'database_rows_mutated', false
)::text;
