-- Staging-only, rollback-only reproduction of the EXISTING identity loss.
-- The caller must first resolve the connected project as IronClad Staging and
-- set ironclad.target_project_ref to that verified connection target. This is
-- not a migration and does not implement any proposed binding/registration fix.
--
-- Uses the original claim + eight-argument save RPC with origin-mode triggers.
-- The known provider profile ID below represents an independently tested
-- exact-Steam-matched provider fixture; this SQL makes no provider HTTP request
-- and does not perform Steam OpenID authentication or browser onboarding.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local idle_in_transaction_session_timeout = '1min';
set local client_min_messages = warning;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims =
  '{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"phase2-relic-binding-reproduction"}';

do $$
begin
  if current_setting('ironclad.target_project_ref', true)
    is distinct from 'zzbnneprhjicmajpjkdg' then
    raise exception 'Relic binding reproduction requires verified IronClad Staging';
  end if;

  if current_user <> 'postgres'
    or current_setting('session_replication_role') <> 'origin' then
    raise exception 'Relic binding reproduction requires postgres with normal origin-mode triggers';
  end if;
end;
$$;

create function pg_temp.relic_binding_reproduction_fingerprints()
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_table record;
  v_fingerprint jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  for v_table in
    select namespace.nspname, relation.relname
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'ironclad_private')
      and relation.relkind in ('r', 'p')
    order by namespace.nspname, relation.relname
  loop
    execute pg_catalog.format(
      'select jsonb_build_object(''rows'', count(*), ''md5'', md5(coalesce(string_agg(to_jsonb(row_data)::text, E''\n'' order by to_jsonb(row_data)::text), ''''))) from %I.%I row_data',
      v_table.nspname,
      v_table.relname
    ) into v_fingerprint;

    v_result := v_result || jsonb_build_object(
      v_table.nspname || '.' || v_table.relname,
      v_fingerprint
    );
  end loop;

  return v_result;
end;
$$;

create temporary table relic_binding_reproduction_result (
  result jsonb not null
);

do $$
declare
  v_player_id uuid := gen_random_uuid();
  v_nonce text := replace(gen_random_uuid()::text, '-', '');
  v_clerk_user_id text;
  v_steam_id64 text;
  v_provider_profile_id constant text := '42';
  v_before jsonb;
  v_after jsonb;
  v_claimed_at timestamptz;
  v_saved record;
  v_reproduced boolean := false;
  v_rolled_back boolean := false;
  v_remaining_players bigint;
begin
  v_clerk_user_id := 'phase2-relic-repro-' || v_nonce;
  v_steam_id64 := '7656119'
    || lpad((floor(random() * 10000000000))::bigint::text, 10, '0');

  if exists (
    select 1
    from public.players
    where id = v_player_id
      or clerk_user_id = v_clerk_user_id
      or steam_id64 = v_steam_id64
  ) then
    raise exception 'Synthetic Relic reproduction identifiers unexpectedly collide';
  end if;

  v_before := pg_temp.relic_binding_reproduction_fingerprints();

  -- A PL/pgSQL exception block is a subtransaction. The deliberate final
  -- sentinel rolls back EVERY fixture write before the safety assertions below.
  begin
    insert into public.players (
      id,
      clerk_user_id,
      display_name,
      in_game_name,
      discord_username,
      steam_username,
      steam_id64,
      country,
      region,
      timezone,
      avatar_url,
      public_profile_enabled,
      discord_public_enabled
    ) values (
      v_player_id,
      v_clerk_user_id,
      'Phase 2 Synthetic Relic Reproduction',
      'Phase 2 Synthetic Relic Reproduction',
      null,
      'Synthetic Steam Fixture',
      v_steam_id64,
      'AU',
      'OCE',
      'Australia/Sydney',
      'avatars/phase2-relic-reproduction/avatar.png',
      false,
      false
    );

    if not exists (
      select 1
      from public.players
      where id = v_player_id
        and steam_id64 = v_steam_id64
        and coh3_profile_id is null
        and account_closed_at is null
    ) then
      raise exception 'Synthetic Steam-connected legacy-null player setup failed';
    end if;

    select claimed_at into strict v_claimed_at
    from public.claim_relic_elo_verification_attempt(
      v_player_id,
      v_clerk_user_id,
      v_steam_id64
    );

    select * into strict v_saved
    from public.save_relic_profile_elo_snapshot(
      v_player_id,
      v_clerk_user_id,
      v_steam_id64,
      v_claimed_at,
      1200,
      'US Forces',
      'Challenge',
      'relic-highest-1v1-v2'
    );

    if v_saved.current_elo is distinct from 1200
      or v_saved.relic_verified_elo is distinct from 1200::bigint
      or v_saved.relic_verified_faction is distinct from 'US Forces'
      or v_saved.relic_verified_division is distinct from 'Challenge'
      or v_saved.relic_elo_calculation_version is distinct from 'relic-highest-1v1-v2'
      or v_saved.relic_elo_verified_at is null then
      raise exception 'Original ELO verification save did not succeed';
    end if;

    if not exists (
      select 1
      from public.players
      where id = v_player_id
        and steam_id64 = v_steam_id64
        and current_elo = 1200
        and relic_verified_elo = 1200
        and relic_verified_faction = 'US Forces'
        and relic_verified_division = 'Challenge'
        and relic_elo_calculation_version = 'relic-highest-1v1-v2'
        and relic_elo_verified_at = v_saved.relic_elo_verified_at
        and relic_elo_last_attempt_at = v_claimed_at
        and coh3_profile_id is null
    ) then
      raise exception 'Expected current defect not reproduced: successful ELO save must leave Relic identity missing';
    end if;

    if v_provider_profile_id !~ '^[1-9][0-9]*$' then
      raise exception 'Independent provider fixture identity is invalid';
    end if;

    v_reproduced := true;
    raise exception 'phase2_relic_reproduction_rollback'
      using errcode = 'P2R00';
  exception when sqlstate 'P2R00' then
    if sqlerrm <> 'phase2_relic_reproduction_rollback'
      or not v_reproduced then
      raise;
    end if;
    v_rolled_back := true;
  end;

  select count(*) into v_remaining_players
  from public.players
  where id = v_player_id
    or clerk_user_id = v_clerk_user_id;

  v_after := pg_temp.relic_binding_reproduction_fingerprints();

  if not v_rolled_back
    or v_remaining_players <> 0
    or v_after is distinct from v_before then
    raise exception 'Relic reproduction safety failed: fixture or existing table data changed';
  end if;

  insert into relic_binding_reproduction_result(result)
  values (jsonb_build_object(
    'status', 'reproduced',
    'originalClaimAndSaveRpcs', true,
    'originModeTriggers', true,
    'eloSaveSucceeded', true,
    'canonicalRelicBindingPersisted', false,
    'expectedProviderFixtureIdAvailableToTest', true,
    'realProviderHttpOrSteamOpenIdExercised', false,
    'fixtureSubtransactionRolledBack', v_rolled_back,
    'remainingFixturePlayers', v_remaining_players,
    'existingTableDataUnchanged', v_after = v_before,
    'comparedTables', (select count(*) from jsonb_object_keys(v_before)),
    'registrationTransactionExercised', false,
    'outerTransactionRollbackRequired', true
  ));
end;
$$;

select result from relic_binding_reproduction_result;

rollback;
