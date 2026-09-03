begin;

-- TESTACADEMY1-8 are permanent Clerk Development identities for manual public
-- registration UAT. Historical post-provider fixture enrolments retain their
-- original catalogue values; this separate definition is only for fresh,
-- normal public registration through submit_verified_player_registration.
create function ironclad_private.staging_synthetic_academy_registration_definition(
  p_alias text
)
returns table (
  approved_alias text,
  synthetic_steam_id64 text,
  synthetic_steam_username text,
  synthetic_elo integer,
  synthetic_faction text,
  synthetic_division text,
  calculation_version text
)
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select definition.*
  from (
    values
      (
        'TestAcademy1', '18446744073709551001',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy2', '18446744073709551002',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy3', '18446744073709551003',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy4', '18446744073709551004',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy5', '18446744073709551005',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy6', '18446744073709551006',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy7', '18446744073709551007',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      ),
      (
        'TestAcademy8', '18446744073709551008',
        'Staging Academy UAT', 1000, 'US Forces', 'Academy',
        'staging-synthetic-academy-v1'
      )
  ) as definition(
    approved_alias,
    synthetic_steam_id64,
    synthetic_steam_username,
    synthetic_elo,
    synthetic_faction,
    synthetic_division,
    calculation_version
  )
  where definition.approved_alias = p_alias;
$$;

alter function
  ironclad_private.staging_synthetic_academy_registration_definition(text)
  owner to postgres;
revoke all on function
  ironclad_private.staging_synthetic_academy_registration_definition(text)
  from public, anon, authenticated, service_role;

create function ironclad_private.assert_staging_synthetic_academy_runtime()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or coalesce(auth.jwt() ->> 'ref', '') <> 'zzbnneprhjicmajpjkdg' then
    raise exception 'Synthetic Academy rating is unavailable'
      using errcode = '42501';
  end if;
end;
$$;

alter function
  ironclad_private.assert_staging_synthetic_academy_runtime()
  owner to postgres;
revoke all on function
  ironclad_private.assert_staging_synthetic_academy_runtime()
  from public, anon, authenticated, service_role;

-- The application calls this read-only resolver only after its own exact URL
-- guard. This database guard independently proves the signed project ref and
-- then binds all three current identity facts to immutable fixture provenance.
create function public.resolve_staging_synthetic_academy_elo(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text
)
returns table (
  elo integer,
  faction text,
  division text,
  calculation_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform ironclad_private.assert_staging_synthetic_academy_runtime();

  return query
  select
    definition.synthetic_elo,
    definition.synthetic_faction,
    definition.synthetic_division,
    definition.calculation_version
  from ironclad_private.staging_synthetic_uat_players as fixture
  join public.players as player on player.id = fixture.player_id
  join lateral
    ironclad_private.staging_synthetic_academy_registration_definition(
      fixture.approved_alias
    ) as definition on true
  where fixture.player_id = p_profile_id
    and player.id = p_profile_id
    and player.clerk_user_id = p_clerk_user_id
    and player.steam_id64 = p_steam_id64
    and player.steam_id64 = definition.synthetic_steam_id64
    and player.profile_completed
    and player.account_closed_at is null
    and fixture.provenance = 'staging_synthetic_uat'
    and fixture.contract_version = 'staging-synthetic-v1'
    and fixture.clerk_environment = 'development'
    and fixture.clerk_test_user_verified
    and fixture.steam_openid_verified is false
    and fixture.steam_ownership_verified is false
    and fixture.relic_live_lookup_verified is false
    and fixture.linked_steam_legal_confirmation is false;
end;
$$;

alter function public.resolve_staging_synthetic_academy_elo(
  uuid,
  text,
  text
) owner to postgres;
revoke all on function public.resolve_staging_synthetic_academy_elo(
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_staging_synthetic_academy_elo(
  uuid,
  text,
  text
) to service_role;

comment on function public.resolve_staging_synthetic_academy_elo(
  uuid,
  text,
  text
) is
  'Staging-project-only read adapter for exact TESTACADEMY1-8 player, Clerk, and deterministic synthetic Steam identities.';

-- Preserve the original fixture immutability contract while allowing the
-- exact permanent Academy identities to carry one fixed synthetic Steam ID.
-- Before first manual registration their rating fields remain null. The only
-- permitted rated shape is the exact tuple written by the existing canonical
-- submit_verified_player_registration function.
create or replace function public.guard_staging_synthetic_uat_player()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_academy_definition record;
  v_is_permanent_academy boolean := false;
  v_is_unrated_shape boolean;
  v_is_rated_shape boolean;
  v_account_closure boolean :=
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.player_id = old.id;

  if not found or v_account_closure then
    return new;
  end if;

  select definition.*
  into v_academy_definition
  from ironclad_private.staging_synthetic_academy_registration_definition(
    v_fixture.approved_alias
  ) as definition;
  v_is_permanent_academy := found;

  if new.id is distinct from old.id
    or new.clerk_user_id is distinct from old.clerk_user_id
    or new.account_closed_at is not null
    or new.display_name is distinct from v_fixture.approved_alias
    or new.in_game_name is distinct from v_fixture.approved_alias
    or nullif(btrim(new.avatar_url), '') is null
    or nullif(btrim(new.country), '') is null
    or nullif(btrim(new.region), '') is null
    or nullif(btrim(new.timezone), '') is null
    or new.public_profile_enabled is distinct from false
    or new.discord_public_enabled is distinct from false
    or new.discord_username is not null
    or new.coh3_profile_id is not null
    or new.coh3_player_card_url is not null then
    raise exception 'Synthetic fixture player facts are immutable'
      using errcode = '55000';
  end if;

  if not v_is_permanent_academy then
    if new.steam_id64 is not null
      or new.steam_username is not null
      or new.current_elo is not null
      or new.relic_verified_elo is not null
      or new.relic_verified_faction is not null
      or new.relic_verified_division is not null
      or new.relic_elo_calculation_version is not null
      or new.relic_elo_verified_at is not null
      or new.relic_elo_last_attempt_at is not null then
      raise exception 'Synthetic fixture player facts are immutable'
        using errcode = '55000';
    end if;

    return new;
  end if;

  -- The sole transition from the legacy null identity to the fixed synthetic
  -- Steam identity requires a signed Staging service-role request.
  if old.steam_id64 is null
    and new.steam_id64 is not null then
    perform ironclad_private.assert_staging_synthetic_academy_runtime();
  end if;

  if row(
    old.current_elo,
    old.relic_verified_elo,
    old.relic_verified_faction,
    old.relic_verified_division,
    old.relic_elo_calculation_version,
    old.relic_elo_verified_at,
    old.relic_elo_last_attempt_at
  ) is distinct from row(
    new.current_elo,
    new.relic_verified_elo,
    new.relic_verified_faction,
    new.relic_verified_division,
    new.relic_elo_calculation_version,
    new.relic_elo_verified_at,
    new.relic_elo_last_attempt_at
  ) then
    perform ironclad_private.assert_staging_synthetic_academy_runtime();
  end if;

  if old.steam_id64 is not null
    and old.steam_id64 is distinct from
      v_academy_definition.synthetic_steam_id64 then
    raise exception 'Synthetic Academy Steam identity is invalid'
      using errcode = '23514';
  end if;

  if new.steam_id64 is null then
    if old.steam_id64 is not null
      or new.steam_username is not null then
      raise exception 'Synthetic Academy Steam identity is immutable'
        using errcode = '55000';
    end if;
  elsif new.steam_id64 is distinct from
      v_academy_definition.synthetic_steam_id64
    or new.steam_username is distinct from
      v_academy_definition.synthetic_steam_username then
    raise exception 'Synthetic Academy Steam identity is invalid'
      using errcode = '23514';
  end if;

  v_is_unrated_shape :=
    new.current_elo is null
    and new.relic_verified_elo is null
    and new.relic_verified_faction is null
    and new.relic_verified_division is null
    and new.relic_elo_calculation_version is null
    and new.relic_elo_verified_at is null
    and new.relic_elo_last_attempt_at is null;

  v_is_rated_shape :=
    new.steam_id64 is not distinct from
      v_academy_definition.synthetic_steam_id64
    and new.current_elo is not distinct from
      v_academy_definition.synthetic_elo
    and new.relic_verified_elo is not distinct from
      v_academy_definition.synthetic_elo
    and new.relic_verified_faction is not distinct from
      v_academy_definition.synthetic_faction
    and new.relic_verified_division is not distinct from
      v_academy_definition.synthetic_division
    and new.relic_elo_calculation_version is not distinct from
      v_academy_definition.calculation_version
    and new.relic_elo_verified_at is not null
    and new.relic_elo_last_attempt_at is null;

  if not v_is_unrated_shape and not v_is_rated_shape then
    raise exception 'Synthetic Academy rating facts are invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.guard_staging_synthetic_uat_player()
  owner to postgres;
revoke all on function public.guard_staging_synthetic_uat_player()
  from public, anon, authenticated, service_role;

commit;
