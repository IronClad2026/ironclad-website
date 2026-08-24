-- Rollback-only executable contract for the Staging synthetic UAT boundary.
-- The fixture secret is read inside the database transaction from Vault and is
-- never interpolated into this file or returned by the result projection.

begin;

set local client_min_messages = warning;
set local role postgres;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims =
  '{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"staging-synthetic-uat-database-contract"}';
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.staging_synthetic_uat_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Staging synthetic UAT contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_fixture_secret text;
  v_tournament constant uuid :=
    '5a700000-0000-4000-8000-000000000001';
  v_academy_bracket constant uuid :=
    '5a700000-0000-4000-8000-000000000101';
  v_challenge_bracket constant uuid :=
    '5a700000-0000-4000-8000-000000000102';
  v_academy_nine_player uuid;
  v_academy_ten_player uuid;
  v_academy_nine_registration uuid;
  v_academy_ten_registration uuid;
  v_result record;
  v_close_result jsonb;
  v_failed boolean;
  v_filler_registration uuid;
  v_index integer;
begin
  perform pg_temp.staging_synthetic_uat_assert(
    current_user = 'postgres',
    'the executable contract must SET ROLE postgres'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:staging-synthetic-uat-fixture-contract',
        0
      )
    ),
    'another synthetic fixture contract run holds the canary lock'
  );

  select nullif(btrim(secret.decrypted_secret), '')
  into strict v_fixture_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_staging_synthetic_uat_fixture_secret';

  perform pg_temp.staging_synthetic_uat_assert(
    char_length(v_fixture_secret) >= 32,
    'the Staging-only fixture Vault secret must exist'
  );

  -- Physical isolation, RLS, grants, and safe function configuration.
  perform pg_temp.staging_synthetic_uat_assert(
    pg_catalog.to_regclass(
      'ironclad_private.staging_synthetic_uat_players'
    ) is not null
      and pg_catalog.to_regclass(
        'ironclad_private.staging_synthetic_uat_enrolments'
      ) is not null,
    'both private provenance tables must exist'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    (
      select pg_catalog.count(*) = 2
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'ironclad_private'
        and relation.relname in (
          'staging_synthetic_uat_players',
          'staging_synthetic_uat_enrolments'
        )
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ),
    'both private provenance tables must use forced RLS'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    not pg_catalog.has_table_privilege(
      'anon',
      'ironclad_private.staging_synthetic_uat_players',
      'SELECT'
    )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'ironclad_private.staging_synthetic_uat_players',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role',
        'ironclad_private.staging_synthetic_uat_players',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'ironclad_private.staging_synthetic_uat_enrolments',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'ironclad_private.staging_synthetic_uat_enrolments',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role',
        'ironclad_private.staging_synthetic_uat_enrolments',
        'SELECT'
      ),
    'raw fixture provenance must be inaccessible to API roles'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    not pg_catalog.has_column_privilege(
      'authenticated',
      'public.registrations',
      'registration_provenance',
      'SELECT'
    )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.registrations',
        'fixture_contract_version',
        'SELECT'
      ),
    'authenticated registration reads must exclude fixture markers'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    pg_catalog.has_function_privilege(
      'service_role',
      'public.provision_staging_synthetic_uat_player(text,text,text)',
      'EXECUTE'
    )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.inspect_staging_synthetic_uat_player(text,text)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.enrol_staging_synthetic_uat_player(text,text,uuid,uuid,boolean)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.cleanup_staging_synthetic_uat_enrolment(text,text,uuid)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.provision_staging_synthetic_uat_player(text,text,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.provision_staging_synthetic_uat_player(text,text,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.enrol_staging_synthetic_uat_player(text,text,uuid,uuid,boolean)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.enrol_staging_synthetic_uat_player(text,text,uuid,uuid,boolean)',
        'EXECUTE'
      ),
    'only service_role may execute public fixture RPCs'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    (
      select pg_catalog.count(*) = 4
      from pg_catalog.pg_proc as routine
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname in (
          'provision_staging_synthetic_uat_player',
          'inspect_staging_synthetic_uat_player',
          'enrol_staging_synthetic_uat_player',
          'cleanup_staging_synthetic_uat_enrolment'
        )
        and routine.prosecdef
        and routine.proconfig @> array['search_path=pg_catalog']::text[]
    ),
    'all public fixture RPCs must be security-definer with safe search_path'
  );

  -- Independent fail-closed gates all reject without residue.
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role","ref":"nsyjtqpvyxlzyujlbzos","sub":"staging-synthetic-uat-database-contract"}',
    true
  );
  v_failed := false;
  begin
    perform *
    from public.inspect_staging_synthetic_uat_player(
      v_fixture_secret,
      'TestAcademy9'
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'the Production project ref must fail even with the Staging secret'
  );

  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","ref":"zzbnneprhjicmajpjkdg","sub":"staging-synthetic-uat-database-contract"}',
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_failed := false;
  begin
    perform *
    from public.inspect_staging_synthetic_uat_player(
      v_fixture_secret,
      'TestAcademy9'
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'a non-service JWT must fail even with the Staging project and secret'
  );

  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"staging-synthetic-uat-database-contract"}',
    true
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_failed := false;
  begin
    perform *
    from public.inspect_staging_synthetic_uat_player(
      repeat('wrong-fixture-secret-', 2),
      'TestAcademy9'
    );
  exception when insufficient_privilege then
    v_failed := true;
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'a wrong fixture secret must fail'
  );

  v_failed := false;
  begin
    perform *
    from public.provision_staging_synthetic_uat_player(
      v_fixture_secret,
      'OwnerRealAccount',
      'user_OwnerRealAccount'
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'an unapproved alias must fail'
  );

  perform pg_temp.staging_synthetic_uat_assert(
    not exists (
      select 1
      from ironclad_private.staging_synthetic_uat_players as fixture
      where fixture.approved_alias in ('TestAcademy9', 'TestAcademy10')
    )
      and not exists (
        select 1
        from public.players as player
        where player.id =
            '5a700000-0000-4000-8000-000000000901'::uuid
          or player.clerk_user_id in (
            'user_FixtureAcademy9',
            'user_FixtureAcademy10',
            'user_NormalNullSteam'
          )
      )
      and not exists (
        select 1
        from public.tournaments as tournament
        where tournament.id = v_tournament
      )
      and not exists (
        select 1
        from public.registrations as registration
        where registration.clerk_user_id like
          'staging-fixture-capacity-%'
      ),
    'deterministic rollback fixture identifiers must begin unused'
  );

  -- A normal profile still cannot self-complete with a null Steam identity.
  insert into public.players (
    id,
    clerk_user_id,
    display_name,
    in_game_name,
    country,
    region,
    timezone,
    avatar_url,
    profile_completed
  ) values (
    '5a700000-0000-4000-8000-000000000901',
    'user_NormalNullSteam',
    'Normal Null Steam',
    'Normal Null Steam',
    'Australia',
    'Oceania',
    'Australia/Sydney (UTC+10:00)',
    '/players/5a700000-0000-4000-8000-000000000901/avatar',
    true
  );
  perform pg_temp.staging_synthetic_uat_assert(
    (
      select not player.profile_completed and player.steam_id64 is null
      from public.players as player
      where player.id = '5a700000-0000-4000-8000-000000000901'
    ),
    'the normal null-Steam profile-completion predicate must be unchanged'
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
    'Staging Synthetic UAT Contract',
    'staging-synthetic-uat-contract',
    '1v1',
    'registration_open',
    'Rollback-only Staging synthetic UAT database contract.',
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
    (v_academy_bracket, v_tournament, 'Academy', '0-1099', 8),
    (v_challenge_bracket, v_tournament, 'Challenge', '1100-1399', 8);

  select * into strict v_result
  from public.provision_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy9',
    'user_FixtureAcademy9'
  );
  v_academy_nine_player := v_result.player_id;
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.alias = 'TestAcademy9'
      and v_result.profile_complete
      and not v_result.profile_public
      and not v_result.has_steam_identity
      and not v_result.has_provider_facts
      and v_result.current_elo is null
      and v_result.synthetic_elo = 1075
      and v_result.synthetic_division = 'Academy'
      and v_result.provenance = 'staging_synthetic_uat'
      and v_result.contract_version = 'staging-synthetic-v1'
      and v_result.created,
    'TestAcademy9 must provision as a truthful private fixture'
  );

  select * into strict v_result
  from public.provision_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy10',
    'user_FixtureAcademy10'
  );
  v_academy_ten_player := v_result.player_id;
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.synthetic_elo = 1099
      and v_result.synthetic_division = 'Academy'
      and v_result.current_elo is null,
    'TestAcademy10 must use its exact fixed catalogue facts'
  );

  perform pg_temp.staging_synthetic_uat_assert(
    (
      select pg_catalog.count(*) = 2
      from public.players as player
      join ironclad_private.staging_synthetic_uat_players as fixture
        on fixture.player_id = player.id
      where fixture.approved_alias in ('TestAcademy9', 'TestAcademy10')
        and player.profile_completed
        and not player.public_profile_enabled
        and not player.discord_public_enabled
        and player.discord_username is null
        and player.steam_id64 is null
        and player.steam_username is null
        and player.coh3_profile_id is null
        and player.coh3_player_card_url is null
        and player.current_elo is null
        and player.relic_verified_elo is null
        and player.relic_verified_faction is null
        and player.relic_verified_division is null
        and player.relic_elo_calculation_version is null
        and player.relic_elo_verified_at is null
        and player.relic_elo_last_attempt_at is null
        and fixture.clerk_environment = 'development'
        and fixture.clerk_test_user_verified
        and not fixture.steam_openid_verified
        and not fixture.steam_ownership_verified
        and not fixture.relic_live_lookup_verified
        and not fixture.linked_steam_legal_confirmation
    ),
    'fixture profiles must contain no real provider or linked-Steam facts'
  );

  v_failed := false;
  begin
    update public.players
    set steam_id64 = '76561198000000009'
    where id = v_academy_nine_player;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'even a service-role Steam write must not attach to a fixture'
  );

  perform pg_temp.staging_synthetic_uat_assert(
    not exists (
      select 1
      from public.public_player_profiles as public_player
      where public_player.id in (
        v_academy_nine_player,
        v_academy_ten_player
      )
    ),
    'private fixture players must be absent from the public projection'
  );

  -- Wrong division rejects before any registration or evidence is created.
  v_failed := false;
  begin
    perform *
    from public.enrol_staging_synthetic_uat_player(
      v_fixture_secret,
      'TestAcademy9',
      v_tournament,
      v_challenge_bracket,
      false
    );
  exception when others then
    v_failed := sqlerrm =
      'Synthetic ELO does not match the selected tournament division';
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed
      and not exists (
        select 1
        from public.registrations as registration
        where registration.profile_id = v_academy_nine_player
      ),
    'wrong-division fixture enrolment must reject atomically'
  );

  update public.tournaments
  set status = null
  where id = v_tournament;
  v_failed := false;
  begin
    perform *
    from public.enrol_staging_synthetic_uat_player(
      v_fixture_secret,
      'TestAcademy9',
      v_tournament,
      v_academy_bracket,
      false
    );
  exception when others then
    v_failed := sqlerrm = 'Tournament registration is not available';
  end;
  perform pg_temp.staging_synthetic_uat_assert(
    v_failed,
    'a nullable tournament status must fail closed'
  );
  update public.tournaments
  set status = 'registration_open'
  where id = v_tournament;

  -- The authoritative Division contract fixes every bracket at eight seats.
  -- Seven rollback-only normal-path rows fill the first seven seats so the
  -- two explicit fixture accounts exercise seat eight and FIFO overflow.
  -- These control rows are removed before deferred evidence is evaluated and
  -- the outer transaction rolls back every trace of them.
  for v_index in 1..7 loop
    v_filler_registration := (
      '5a700000-0000-4000-8000-'
        || pg_catalog.lpad((200 + v_index)::text, 12, '0')
    )::uuid;

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
      v_filler_registration,
      'staging-fixture-capacity-' || v_index::text,
      'Rollback Capacity Control ' || v_index::text,
      'Staging Synthetic UAT Contract',
      'Academy Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_academy_bracket,
      1000,
      1000,
      'US Forces',
      '1v1',
      clock_timestamp(),
      'relic',
      'Academy',
      'rollback-capacity-control-v1'
    );
  end loop;

  select * into strict v_result
  from public.enrol_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy9',
    v_tournament,
    v_academy_bracket,
    false
  );
  v_academy_nine_registration := v_result.registration_id;
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.registration_status = 'pending'
      and v_result.created
      and not v_result.waitlist_confirmation_required,
    'the first fixture must enter the active cohort as pending'
  );

  select * into strict v_result
  from public.enrol_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy9',
    v_tournament,
    v_academy_bracket,
    false
  );
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.registration_id = v_academy_nine_registration
      and v_result.registration_status = 'pending'
      and not v_result.created,
    'exact duplicate fixture enrolment must be idempotent'
  );

  select * into strict v_result
  from public.enrol_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy10',
    v_tournament,
    v_academy_bracket,
    false
  );
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.registration_id is null
      and v_result.registration_status is null
      and v_result.waitlist_confirmation_required
      and not v_result.created,
    'capacity must require explicit waitlist confirmation'
  );

  select * into strict v_result
  from public.enrol_staging_synthetic_uat_player(
    v_fixture_secret,
    'TestAcademy10',
    v_tournament,
    v_academy_bracket,
    true
  );
  v_academy_ten_registration := v_result.registration_id;
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.registration_status = 'waitlisted'
      and v_result.queue_position = 1
      and v_result.created
      and not v_result.waitlist_confirmation_required,
    'confirmed capacity overflow must preserve FIFO waitlisting'
  );

  perform set_config('ironclad.tournament_deletion', 'on', true);
  delete from public.registrations as registration
  where registration.clerk_user_id like 'staging-fixture-capacity-%'
    and registration.tournament_id = v_tournament;
  perform set_config('ironclad.tournament_deletion', 'off', true);

  set constraints registrations_require_acceptance immediate;
  set constraints registrations_require_acceptance deferred;

  perform pg_temp.staging_synthetic_uat_assert(
    (
      select pg_catalog.count(*) = 2
      from public.registrations as registration
      join ironclad_private.staging_synthetic_uat_enrolments as fixture
        on fixture.registration_id = registration.id
      where registration.id in (
        v_academy_nine_registration,
        v_academy_ten_registration
      )
        and registration.submitted_elo = fixture.synthetic_elo
        and registration.elo_status = 'manual_review'
        and registration.registration_provenance =
          'staging_synthetic_uat'
        and registration.fixture_contract_version =
          'staging-synthetic-v1'
        and registration.steam_name is null
        and registration.coh3_player_card_url is null
        and registration.elo_verified_elo is null
        and registration.elo_highest_faction is null
        and registration.elo_checked_at is null
        and registration.elo_verification_source is null
        and registration.elo_verified_division is null
        and registration.elo_calculation_version is null
        and fixture.provenance = 'staging_synthetic_uat'
        and fixture.contract_version = 'staging-synthetic-v1'
        and not fixture.steam_openid_verified
        and not fixture.steam_ownership_verified
        and not fixture.relic_live_lookup_verified
        and not fixture.linked_steam_legal_confirmation
    )
      and not exists (
        select 1
        from public.registration_acceptances as acceptance
        where acceptance.registration_id in (
          v_academy_nine_registration,
          v_academy_ten_registration
        )
      ),
    'synthetic evidence must be explicit and canonical legal evidence absent'
  );

  v_close_result := public.close_ironclad_player_account(
    'user_FixtureAcademy10'
  );
  perform pg_temp.staging_synthetic_uat_assert(
    v_close_result ->> 'outcome' = 'pseudonymized'
      and exists (
        select 1
        from public.players as player
        where player.id = v_academy_ten_player
          and player.account_closed_at is not null
          and player.clerk_user_id like 'deleted:%'
          and player.display_name = 'Former Competitor'
          and not player.profile_completed
          and not player.public_profile_enabled
      )
      and exists (
        select 1
        from ironclad_private.staging_synthetic_uat_players as fixture
        join ironclad_private.staging_synthetic_uat_enrolments as enrolment
          on enrolment.player_id = fixture.player_id
        where fixture.player_id = v_academy_ten_player
          and enrolment.registration_id = v_academy_ten_registration
      ),
    'fixture account closure must pseudonymize and retain coherent evidence'
  );

  select * into strict v_result
  from public.cleanup_staging_synthetic_uat_enrolment(
    v_fixture_secret,
    'TestAcademy10',
    v_tournament
  );
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.deleted
      and v_result.registration_id = v_academy_ten_registration,
    'cleanup must delete the exact waitlisted fixture enrolment'
  );

  select * into strict v_result
  from public.cleanup_staging_synthetic_uat_enrolment(
    v_fixture_secret,
    'TestAcademy9',
    v_tournament
  );
  perform pg_temp.staging_synthetic_uat_assert(
    v_result.deleted
      and v_result.registration_id = v_academy_nine_registration,
    'cleanup must delete the exact active fixture enrolment'
  );

  select * into strict v_result
  from public.cleanup_staging_synthetic_uat_enrolment(
    v_fixture_secret,
    'TestAcademy9',
    v_tournament
  );
  perform pg_temp.staging_synthetic_uat_assert(
    not v_result.deleted and v_result.registration_id is null,
    'cleanup must be idempotent after enrolment removal'
  );

  perform pg_temp.staging_synthetic_uat_assert(
    not exists (
      select 1
      from public.registrations as registration
      where registration.id in (
        v_academy_nine_registration,
        v_academy_ten_registration
      )
    )
      and not exists (
        select 1
        from ironclad_private.staging_synthetic_uat_enrolments as fixture
        where fixture.player_id in (
          v_academy_nine_player,
          v_academy_ten_player
        )
      )
      and (
        select pg_catalog.count(*) = 2
        from ironclad_private.staging_synthetic_uat_players as fixture
        where fixture.player_id in (
          v_academy_nine_player,
          v_academy_ten_player
        )
      ),
    'cleanup must remove enrolments and preserve reusable fixture players'
  );
end;
$$;

rollback;

select jsonb_build_object(
  'contract', 'staging-synthetic-uat-fixtures',
  'target', 'ironclad-staging',
  'production_ref_rejected', true,
  'service_role_only', true,
  'provider_facts_claimed', false,
  'canonical_acceptance_created', false,
  'capacity_and_waitlist_preserved', true,
  'public_projection_excluded', true,
  'cleanup_verified', true,
  'fixture_transaction', 'rolled_back',
  'zero_residue', true
) as staging_synthetic_uat_contract_result;
