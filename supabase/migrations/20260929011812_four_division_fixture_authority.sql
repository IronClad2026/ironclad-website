begin;

alter table ironclad_private.staging_synthetic_uat_players drop constraint staging_synthetic_uat_players_approved_alias_check;
alter table ironclad_private.staging_synthetic_uat_players add constraint staging_synthetic_uat_players_approved_alias_check check(approved_alias ~ '^Test((Academy|Challenge)([1-9]|10)|Main([1-9]|1[0-4])|Pro[1-4])$');
alter table ironclad_private.staging_synthetic_uat_players drop constraint staging_synthetic_uat_players_synthetic_division_check;
alter table ironclad_private.staging_synthetic_uat_players add constraint staging_synthetic_uat_players_synthetic_division_check check(synthetic_division in ('Academy','Challenge','Main / Pro','Main','Pro'));
alter table ironclad_private.staging_synthetic_uat_enrolments drop constraint staging_synthetic_uat_enrolments_synthetic_division_check,drop constraint staging_synthetic_uat_enrolments_contract_version_check;
alter table ironclad_private.staging_synthetic_uat_enrolments add constraint staging_synthetic_uat_enrolments_synthetic_division_check check(synthetic_division in ('Academy','Challenge','Main / Pro','Main','Pro')),add constraint staging_synthetic_uat_enrolments_contract_version_check check(contract_version in ('staging-synthetic-v1','staging-synthetic-v2'));
alter table public.registrations drop constraint registrations_fixture_provenance_check;
alter table public.registrations add constraint registrations_fixture_provenance_check check((registration_provenance is null and fixture_contract_version is null) or (registration_provenance='staging_synthetic_uat' and fixture_contract_version in ('staging-synthetic-v1','staging-synthetic-v2')));

CREATE OR REPLACE FUNCTION ironclad_private.staging_synthetic_uat_alias_definition(p_alias text)
 RETURNS TABLE(approved_alias text, synthetic_elo integer, synthetic_division text)
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select candidate.approved_alias, candidate.synthetic_elo,
    candidate.synthetic_division
  from (
    values
      ('TestAcademy1', 700, 'Academy'),
      ('TestAcademy2', 750, 'Academy'),
      ('TestAcademy3', 800, 'Academy'),
      ('TestAcademy4', 850, 'Academy'),
      ('TestAcademy5', 900, 'Academy'),
      ('TestAcademy6', 950, 'Academy'),
      ('TestAcademy7', 1000, 'Academy'),
      ('TestAcademy8', 1050, 'Academy'),
      ('TestAcademy9', 1075, 'Academy'),
      ('TestAcademy10', 1099, 'Academy'),
      ('TestChallenge1', 1100, 'Challenge'),
      ('TestChallenge2', 1150, 'Challenge'),
      ('TestChallenge3', 1200, 'Challenge'),
      ('TestChallenge4', 1225, 'Challenge'),
      ('TestChallenge5', 1250, 'Challenge'),
      ('TestChallenge6', 1275, 'Challenge'),
      ('TestChallenge7', 1300, 'Challenge'),
      ('TestChallenge8', 1350, 'Challenge'),
      ('TestChallenge9', 1375, 'Challenge'),
      ('TestChallenge10', 1399, 'Challenge'),
      ('TestMain1', 1400, 'Main / Pro'),
      ('TestMain2', 1450, 'Main / Pro'),
      ('TestMain3', 1500, 'Main / Pro'),
      ('TestMain4', 1550, 'Main / Pro'),
      ('TestMain5', 1600, 'Main / Pro'),
      ('TestMain6', 1700, 'Main / Pro'),
      ('TestMain7', 1800, 'Main / Pro'),
      ('TestMain8', 1900, 'Main / Pro'),
      ('TestMain9', 2000, 'Main / Pro'),
      ('TestMain10', 2200, 'Main / Pro'),
      ('TestMain11',1625,'Main'),('TestMain12',1650,'Main'),('TestMain13',1675,'Main'),('TestMain14',1699,'Main'),
      ('TestPro1',1701,'Pro'),('TestPro2',1750,'Pro'),('TestPro3',1850,'Pro'),('TestPro4',2100,'Pro')
  ) as candidate(approved_alias, synthetic_elo, synthetic_division)
  where candidate.approved_alias = p_alias;
$function$;

alter function ironclad_private.staging_synthetic_uat_alias_definition(p_alias text) owner to postgres;
revoke all on function ironclad_private.staging_synthetic_uat_alias_definition(p_alias text) from public, anon, authenticated, service_role;

create function ironclad_private.staging_synthetic_registration_definition(p_alias text,p_model text)
returns table(approved_alias text,synthetic_steam_id64 text,synthetic_steam_username text,synthetic_elo integer,synthetic_faction text,synthetic_division text,calculation_version text)
language plpgsql immutable security definer set search_path=pg_catalog as $$
begin
 perform ironclad_private.division_for_elo(p_model,0);
 return query select d.approved_alias,d.synthetic_steam_id64,d.synthetic_steam_username,d.synthetic_elo,d.synthetic_faction,d.synthetic_division,d.calculation_version
 from ironclad_private.staging_synthetic_academy_registration_definition(p_alias) d;
 if found then return; end if;
 return query select d.approved_alias,
 case when p_alias ~ '^TestMain([1-9]|1[0-4])$' then (18446744073709550000::numeric+substring(p_alias from '[0-9]+$')::int)::text
 else (18446744073709550100::numeric+substring(p_alias from '[0-9]+$')::int)::text end,
 'Staging Main Pro UAT'::text,d.synthetic_elo,'US Forces'::text,
 ironclad_private.division_for_elo(p_model,d.synthetic_elo),
 case when p_model='four_division_v1' then 'staging-synthetic-v2' else 'staging-synthetic-v1' end
 from ironclad_private.staging_synthetic_uat_alias_definition(p_alias) d
 where p_alias ~ '^Test(Main([1-9]|1[0-4])|Pro[1-4])$';
end; $$;
revoke all on function ironclad_private.staging_synthetic_registration_definition(text,text) from public,anon,authenticated,service_role;
create function ironclad_private.staging_synthetic_player_prepared(p_player_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.players%rowtype; f ironclad_private.staging_synthetic_uat_players%rowtype; d record;
begin
 select * into p from public.players where id=p_player_id;
 select * into f from ironclad_private.staging_synthetic_uat_players where player_id=p_player_id;
 if not found then return false; end if;
 if p.coh3_profile_id is not null or p.coh3_player_card_url is not null or f.steam_openid_verified or f.steam_ownership_verified or f.relic_live_lookup_verified or f.linked_steam_legal_confirmation then raise exception 'Synthetic provider facts are invalid' using errcode='23514'; end if;
 if num_nonnulls(p.steam_id64,p.steam_username,p.current_elo,p.relic_verified_elo,p.relic_verified_faction,p.relic_verified_division,p.relic_elo_calculation_version,p.relic_elo_verified_at,p.relic_elo_last_attempt_at)=0 then return false; end if;
 select * into d from ironclad_private.staging_synthetic_registration_definition(f.approved_alias,case when p.relic_elo_calculation_version='staging-synthetic-v2' then 'four_division_v1' else 'legacy_three_v1' end);
 if not found or p.steam_id64 is distinct from d.synthetic_steam_id64 or p.steam_username is distinct from d.synthetic_steam_username or p.relic_elo_last_attempt_at is not null then raise exception 'Synthetic identity facts are invalid' using errcode='23514'; end if;
 if num_nonnulls(p.current_elo,p.relic_verified_elo,p.relic_verified_faction,p.relic_verified_division,p.relic_elo_calculation_version,p.relic_elo_verified_at)<>0 and
 (p.current_elo is distinct from d.synthetic_elo or p.relic_verified_elo is distinct from d.synthetic_elo or p.relic_verified_faction is distinct from d.synthetic_faction or p.relic_verified_division is distinct from d.synthetic_division or p.relic_elo_calculation_version is distinct from d.calculation_version or p.relic_elo_verified_at is null) then raise exception 'Synthetic rating facts are invalid' using errcode='23514'; end if;
 return true;
end; $$;
revoke all on function ironclad_private.staging_synthetic_player_prepared(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_staging_synthetic_uat_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  from ironclad_private.staging_synthetic_registration_definition(
    v_fixture.approved_alias,case when new.relic_elo_calculation_version='staging-synthetic-v2' then 'four_division_v1' else 'legacy_three_v1' end
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
$function$;

alter function public.guard_staging_synthetic_uat_player() owner to postgres;
revoke all on function public.guard_staging_synthetic_uat_player() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inspect_staging_synthetic_uat_player(p_fixture_secret text, p_alias text)
 RETURNS TABLE(alias text, player_id uuid, profile_complete boolean, profile_public boolean, has_steam_identity boolean, has_provider_facts boolean, current_elo integer, synthetic_elo integer, synthetic_division text, provenance text, contract_version text, active_registration_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  if not exists (
    select 1
    from ironclad_private.staging_synthetic_uat_alias_definition(p_alias)
  ) then
    raise exception 'Synthetic fixture alias is not permitted'
      using errcode = '22023';
  end if;

  return query
  select
    fixture.approved_alias,
    player.id,
    player.profile_completed,
    player.public_profile_enabled,
    player.steam_id64 is not null and not ironclad_private.staging_synthetic_player_prepared(player.id),
    num_nonnulls(
      player.steam_id64,
      player.coh3_profile_id,
      player.current_elo,
      player.relic_verified_elo,
      player.relic_verified_faction,
      player.relic_verified_division,
      player.relic_elo_calculation_version,
      player.relic_elo_verified_at,
      player.relic_elo_last_attempt_at
    ) > 0 and not ironclad_private.staging_synthetic_player_prepared(player.id),
    player.current_elo,
    fixture.synthetic_elo,
    fixture.synthetic_division,
    fixture.provenance,
    fixture.contract_version,
    count(registration.id) filter (
      where registration.registration_status not in ('rejected', 'withdrawn')
    )
  from ironclad_private.staging_synthetic_uat_players as fixture
  join public.players as player on player.id = fixture.player_id
  left join public.registrations as registration
    on registration.profile_id = player.id
    and registration.registration_provenance = 'staging_synthetic_uat'
  where fixture.approved_alias = p_alias
  group by fixture.player_id, player.id;

  if not found then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;
end;
$function$;

alter function public.inspect_staging_synthetic_uat_player(p_fixture_secret text, p_alias text) owner to postgres;
revoke all on function public.inspect_staging_synthetic_uat_player(p_fixture_secret text, p_alias text) from public, anon, authenticated, service_role;

grant execute on function public.inspect_staging_synthetic_uat_player(p_fixture_secret text, p_alias text) to service_role;

CREATE OR REPLACE FUNCTION public.provision_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_clerk_user_id text)
 RETURNS TABLE(alias text, player_id uuid, profile_complete boolean, profile_public boolean, has_steam_identity boolean, has_provider_facts boolean, current_elo integer, synthetic_elo integer, synthetic_division text, provenance text, contract_version text, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_definition record;
  v_player public.players%rowtype;
  v_existing_fixture
    ironclad_private.staging_synthetic_uat_players%rowtype;
  v_created boolean := false;
  v_player_id uuid;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  if p_alias is null or p_alias is distinct from btrim(p_alias)
    or p_clerk_user_id is null
    or p_clerk_user_id !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'Synthetic fixture request is invalid'
      using errcode = '22023';
  end if;

  select definition.*
  into v_definition
  from ironclad_private.staging_synthetic_uat_alias_definition(p_alias)
    as definition;

  if not found then
    raise exception 'Synthetic fixture alias is not permitted'
      using errcode = '22023';
  end if;

  select fixture.*
  into v_existing_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = p_alias
  for update;

  if found then
    select player.*
    into strict v_player
    from public.players as player
    where player.id = v_existing_fixture.player_id
      and player.clerk_user_id = p_clerk_user_id
    for update;

    v_player_id := v_player.id;
  else
    if exists (
      select 1
      from public.players as player
      where player.clerk_user_id = p_clerk_user_id
    ) then
      raise exception 'Synthetic fixture cannot adopt an existing player'
        using errcode = '23505';
    end if;

    v_player_id := gen_random_uuid();
    v_created := true;

    perform set_config(
      'ironclad.staging_synthetic_uat_provisioning',
      'on',
      true
    );

    insert into public.players (
      id,
      clerk_user_id,
      display_name,
      in_game_name,
      discord_username,
      steam_username,
      coh3_player_card_url,
      country,
      region,
      timezone,
      current_elo,
      avatar_url,
      bio,
      profile_completed,
      public_profile_enabled,
      discord_public_enabled,
      coh3_profile_id,
      steam_id64,
      relic_verified_elo,
      relic_verified_faction,
      relic_verified_division,
      relic_elo_calculation_version,
      relic_elo_verified_at,
      relic_elo_last_attempt_at
    ) values (
      v_player_id,
      p_clerk_user_id,
      p_alias,
      p_alias,
      null,
      null,
      null,
      'Australia',
      'Oceania',
      'Australia/Sydney (UTC+10:00)',
      null,
      '/players/' || v_player_id::text || '/avatar',
      'Staging synthetic UAT post-provider fixture.',
      false,
      false,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );

    insert into ironclad_private.staging_synthetic_uat_players (
      player_id,
      approved_alias,
      synthetic_elo,
      synthetic_division,
      clerk_test_user_verified,
      clerk_test_user_verified_at
    ) values (
      v_player_id,
      v_definition.approved_alias,
      v_definition.synthetic_elo,
      v_definition.synthetic_division,
      true,
      clock_timestamp()
    );
  end if;

  -- Reassert the immutable fixture shape and recalculate profile_completed now
  -- that the private provenance row exists.
  update public.players as player
  set
    display_name = p_alias,
    in_game_name = p_alias,
    discord_username = null,
    steam_username = player.steam_username,
    coh3_player_card_url = null,
    country = 'Australia',
    region = 'Oceania',
    timezone = 'Australia/Sydney (UTC+10:00)',
    current_elo = player.current_elo,
    avatar_url = '/players/' || v_player_id::text || '/avatar',
    public_profile_enabled = false,
    discord_public_enabled = false,
    coh3_profile_id = null,
    steam_id64 = player.steam_id64,
    relic_verified_elo = player.relic_verified_elo,
    relic_verified_faction = player.relic_verified_faction,
    relic_verified_division = player.relic_verified_division,
    relic_elo_calculation_version = player.relic_elo_calculation_version,
    relic_elo_verified_at = player.relic_elo_verified_at,
    relic_elo_last_attempt_at = player.relic_elo_last_attempt_at
  where player.id = v_player_id
  returning player.* into v_player;

  if not v_player.profile_completed then
    raise exception 'Synthetic fixture profile completion failed'
      using errcode = '23514';
  end if;

  return query
  select
    v_existing.approved_alias,
    v_player.id,
    v_player.profile_completed,
    v_player.public_profile_enabled,
    v_player.steam_id64 is not null and not ironclad_private.staging_synthetic_player_prepared(v_player.id),
    num_nonnulls(
      v_player.steam_id64,
      v_player.coh3_profile_id,
      v_player.current_elo,
      v_player.relic_verified_elo,
      v_player.relic_verified_faction,
      v_player.relic_verified_division,
      v_player.relic_elo_calculation_version,
      v_player.relic_elo_verified_at,
      v_player.relic_elo_last_attempt_at
    ) > 0 and not ironclad_private.staging_synthetic_player_prepared(v_player.id),
    v_player.current_elo,
    v_existing.synthetic_elo,
    v_existing.synthetic_division,
    v_existing.provenance,
    v_existing.contract_version,
    v_created
  from ironclad_private.staging_synthetic_uat_players as v_existing
  where v_existing.player_id = v_player.id;
end;
$function$;

alter function public.provision_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_clerk_user_id text) owner to postgres;
revoke all on function public.provision_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.provision_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_clerk_user_id text) to service_role;

create function public.resolve_staging_synthetic_registration_elo(p_profile_id uuid,p_clerk_user_id text,p_steam_id64 text,p_division_model_version text)
returns table(elo integer,faction text,division text,calculation_version text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform ironclad_private.assert_staging_synthetic_academy_runtime();
 perform ironclad_private.division_for_elo(p_division_model_version,0);
 return query select d.synthetic_elo,d.synthetic_faction,d.synthetic_division,d.calculation_version
 from ironclad_private.staging_synthetic_uat_players f join public.players p on p.id=f.player_id
 join lateral ironclad_private.staging_synthetic_registration_definition(f.approved_alias,p_division_model_version) d on true
 where p.id=p_profile_id and p.clerk_user_id=p_clerk_user_id and p.steam_id64=p_steam_id64 and p.steam_id64=d.synthetic_steam_id64
 and p.profile_completed and p.account_closed_at is null and f.provenance='staging_synthetic_uat' and f.contract_version='staging-synthetic-v1'
 and f.clerk_environment='development' and f.clerk_test_user_verified and not f.steam_openid_verified and not f.steam_ownership_verified and not f.relic_live_lookup_verified and not f.linked_steam_legal_confirmation
 and ironclad_private.staging_synthetic_player_prepared(p.id);
end; $$;
revoke all on function public.resolve_staging_synthetic_registration_elo(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_staging_synthetic_registration_elo(uuid,text,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.resolve_staging_synthetic_academy_elo(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text)
 RETURNS TABLE(elo integer, faction text, division text, calculation_version text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

alter function public.resolve_staging_synthetic_academy_elo(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text) owner to postgres;
revoke all on function public.resolve_staging_synthetic_academy_elo(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text) from public, anon, authenticated, service_role;

grant execute on function public.resolve_staging_synthetic_academy_elo(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text) to service_role;

create function ironclad_private.synthetic_registration_expected_elo(p_registration public.registrations)
returns integer language plpgsql stable security definer set search_path=pg_catalog as $$
declare f ironclad_private.staging_synthetic_uat_players%rowtype; v_model text; v_name text; v_elo integer; d record;
begin
 select fixture.* into f from ironclad_private.staging_synthetic_uat_players fixture join public.players p on p.id=fixture.player_id where p.id=p_registration.profile_id and p.clerk_user_id=p_registration.clerk_user_id;
 if not found then raise exception 'Synthetic fixture identity is invalid' using errcode='23514'; end if;
 select t.division_model_version,b.name into v_model,v_name from public.tournament_brackets b join public.tournaments t on t.id=b.tournament_id where b.id=p_registration.tournament_bracket_id and t.id=p_registration.tournament_id;
 if not found then raise exception 'Synthetic fixture competition is invalid' using errcode='23514'; end if;
 if p_registration.elo_verification_source='relic' then
   select * into d from ironclad_private.staging_synthetic_registration_definition(f.approved_alias,v_model);
   if not found or not ironclad_private.staging_synthetic_player_prepared(f.player_id) then raise exception 'Synthetic prepared rating unavailable' using errcode='23514'; end if;
   v_elo:=d.synthetic_elo;
   if p_registration.elo_verified_elo is distinct from d.synthetic_elo or p_registration.elo_highest_faction is distinct from d.synthetic_faction or p_registration.elo_verified_division is distinct from d.synthetic_division or p_registration.elo_calculation_version is distinct from d.calculation_version or p_registration.steam_name is distinct from d.synthetic_steam_username or p_registration.elo_status is distinct from 'verified' or p_registration.elo_checked_mode is distinct from '1v1' or p_registration.elo_checked_at is null then raise exception 'Synthetic rated snapshot is invalid' using errcode='23514'; end if;
 else
   select x.synthetic_elo into v_elo from ironclad_private.staging_badge_cross_division_enrolments x where x.registration_id=p_registration.id;
   if not found and current_setting('ironclad.staging_badge_cross_division_enrolling',true)='on' and f.approved_alias='TestAcademy1' and v_model='legacy_three_v1' then
     select x.synthetic_elo into v_elo from ironclad_private.staging_badge_cross_division_definition(v_name) x;
   end if;
   v_elo:=coalesce(v_elo,f.synthetic_elo);
 end if;
 if ironclad_private.division_for_elo(v_model,v_elo) is distinct from ironclad_private.division_verified_label(v_model,v_name) then raise exception 'Synthetic rating does not match division' using errcode='23514'; end if;
 return v_elo;
end; $$;
revoke all on function ironclad_private.synthetic_registration_expected_elo(public.registrations) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_staging_synthetic_uat_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_expected_elo integer;
  v_expected_division text;
  v_bracket_name text;
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    ) then
    return new;
  end if;

  if tg_op = 'INSERT'
    and new.registration_provenance is distinct from
      'staging_synthetic_uat' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.registration_provenance is null
      and new.registration_provenance is null
      and old.fixture_contract_version is null
      and new.fixture_contract_version is null then
      return new;
    end if;

    if old.registration_provenance is distinct from
        'staging_synthetic_uat'
      or old.fixture_contract_version not in ('staging-synthetic-v1','staging-synthetic-v2')
      or new.registration_provenance is distinct from
        old.registration_provenance
      or new.fixture_contract_version is distinct from old.fixture_contract_version
      or new.profile_id is distinct from old.profile_id or new.tournament_id is distinct from old.tournament_id
      or new.tournament_bracket_id is distinct from old.tournament_bracket_id
      or new.submitted_elo is distinct from old.submitted_elo then
      raise exception 'Synthetic fixture registration provenance is immutable'
        using errcode = '55000';
    end if;
  elsif coalesce(
    current_setting('ironclad.staging_synthetic_uat_enrolling', true),
    ''
  ) <> 'on' or coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Synthetic fixture registration is unavailable'
      using errcode = '42501';
  end if;

  v_expected_elo:=ironclad_private.synthetic_registration_expected_elo(new);
  if new.fixture_contract_version is distinct from (select case when division_model_version='four_division_v1' then 'staging-synthetic-v2' else 'staging-synthetic-v1' end from public.tournaments where id=new.tournament_id)
    or new.submitted_elo is distinct from v_expected_elo
    or new.coh3_player_card_url is not null or new.elo_difference is not null or new.elo_verification_error is not null
    or new.elo_verification_payload is not null or new.elo_verified_player_name is not null or new.elo_identity_status is not null or new.elo_identity_error is not null then
    raise exception 'Synthetic fixture registration facts are invalid' using errcode='23514';
  end if;
  if new.elo_verification_source is distinct from 'relic' and
    (new.elo_status is distinct from 'manual_review' or num_nonnulls(new.steam_name,new.elo_verified_elo,new.elo_highest_faction,new.elo_checked_mode,new.elo_checked_at,new.elo_verification_source,new.elo_verified_division,new.elo_calculation_version)<>0) then
    raise exception 'Synthetic manual snapshot is invalid' using errcode='23514';
  end if;
  return new;
end;
$function$;

alter function public.guard_staging_synthetic_uat_registration() owner to postgres;
revoke all on function public.guard_staging_synthetic_uat_registration() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_registration_elo_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_current_elo integer;
  v_model text;
  v_bracket_name text;
  v_elo_rules text;
  v_is_eligible boolean;
  v_expected_division text;
  v_fixture_alias text;
  v_fixture_synthetic_elo integer;
  v_fixture_synthetic_division text;
  v_progression_synthetic_elo integer;
  v_progression_synthetic_division text;
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    ) then
    return new;
  end if;

  select t.division_model_version into v_model from public.tournaments t where t.id=new.tournament_id;
  if v_model='four_division_v1' and new.registration_provenance is distinct from 'staging_synthetic_uat' and new.elo_verification_source is distinct from 'relic' then
    raise exception 'Future registration requires a versioned verification snapshot' using errcode='23514';
  end if;
  if new.elo_calculation_version in ('staging-synthetic-v1','staging-synthetic-v2','staging-synthetic-academy-v1') then
    perform ironclad_private.synthetic_registration_expected_elo(new);
  end if;
  if new.registration_status = 'rejected' then
    return new;
  end if;

  if new.registration_provenance='staging_synthetic_uat' then
    v_fixture_synthetic_elo:=ironclad_private.synthetic_registration_expected_elo(new);
    if new.submitted_elo is distinct from v_fixture_synthetic_elo then raise exception 'Synthetic rating snapshot is invalid'; end if;
    return new;
  end if;
  if new.tournament_bracket_id is null or new.clerk_user_id is null then
    return new;
  end if;

  if new.elo_verification_source = 'relic' then
    select bracket.name,t.division_model_version
    into v_bracket_name,v_model
    from public.tournament_brackets as bracket join public.tournaments t on t.id=bracket.tournament_id
    where bracket.id = new.tournament_bracket_id;

    if not found then
      raise exception 'Selected tournament bracket does not exist';
    end if;

    v_expected_division := ironclad_private.division_verified_label(v_model,v_bracket_name);
    if new.elo_calculation_version is distinct from 'staging-synthetic-academy-v1' and ironclad_private.elo_calculation_model(new.elo_calculation_version) is distinct from v_model then raise exception 'Registration calculation version does not match competition model'; end if;

    if v_expected_division is null
      or new.elo_verified_division is distinct from v_expected_division then
      raise exception
        'Verified ELO does not match the selected tournament division';
    end if;

    if new.submitted_elo is distinct from new.elo_verified_elo then
      raise exception 'Registration verification data is invalid';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.registration_status is distinct from new.registration_status
    and new.registration_status <> 'approved' then
    return new;
  end if;

  select player.current_elo, bracket.name, bracket.elo_rules
  into v_current_elo, v_bracket_name, v_elo_rules
  from public.players as player
  cross join public.tournament_brackets as bracket
  where player.clerk_user_id = new.clerk_user_id
    and bracket.id = new.tournament_bracket_id;

  if not found or v_current_elo is null then
    raise exception 'A completed player profile with current ELO is required';
  end if;

  v_is_eligible := public.is_elo_eligible(v_current_elo, v_elo_rules);

  if v_is_eligible is null then
    raise exception
      'The % Bracket has an invalid ELO rule configuration: %',
      v_bracket_name,
      v_elo_rules;
  end if;

  if not v_is_eligible then
    raise exception
      'Saved ELO % does not satisfy the % Bracket requirement: %',
      v_current_elo,
      v_bracket_name,
      v_elo_rules;
  end if;

  new.submitted_elo := v_current_elo;
  return new;
end;
$function$;

alter function public.enforce_registration_elo_eligibility() owner to postgres;
revoke all on function public.enforce_registration_elo_eligibility() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION ironclad_private.guard_staging_synthetic_uat_enrolment_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_enrolling boolean :=
    coalesce(
      current_setting('ironclad.staging_synthetic_uat_enrolling', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role';
  v_cleanup boolean :=
    coalesce(
      current_setting('ironclad.staging_synthetic_uat_cleanup', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role';
  v_trusted_maintenance boolean :=
    coalesce(current_setting('ironclad.tournament_deletion', true), '') = 'on'
    or (
      coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
      and (
        session_user = 'postgres'
        or coalesce(auth.role(), '') = 'service_role'
      )
    );
begin
  if tg_op = 'DELETE' then
    if v_cleanup or v_trusted_maintenance then
      return old;
    end if;

    raise exception 'Synthetic fixture enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' or not v_enrolling then
    raise exception 'Synthetic fixture enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if new.provenance is distinct from 'staging_synthetic_uat'
    or new.contract_version not in ('staging-synthetic-v1','staging-synthetic-v2')
    or new.steam_openid_verified is distinct from false
    or new.steam_ownership_verified is distinct from false
    or new.relic_live_lookup_verified is distinct from false
    or new.linked_steam_legal_confirmation is distinct from false
    or not (
      exists (
        select 1
        from public.registrations r join public.tournaments t on t.id=r.tournament_id
        where r.id=new.registration_id and r.profile_id=new.player_id and r.tournament_id=new.tournament_id
          and r.tournament_bracket_id=new.tournament_bracket_id and r.registration_provenance=new.provenance
          and r.fixture_contract_version=new.contract_version
          and r.submitted_elo=new.synthetic_elo
          and ironclad_private.synthetic_registration_expected_elo(r)=new.synthetic_elo
          and ironclad_private.division_for_elo(t.division_model_version,new.synthetic_elo)=new.synthetic_division
      )
      or exists (
        select 1
        from ironclad_private.staging_badge_cross_division_enrolments
          as progression
        where progression.registration_id = new.registration_id
          and progression.player_id = new.player_id
          and progression.tournament_id = new.tournament_id
          and progression.tournament_bracket_id =
            new.tournament_bracket_id
          and progression.synthetic_elo = new.synthetic_elo
          and progression.synthetic_division = new.synthetic_division
          and progression.steam_openid_verified is false
          and progression.steam_ownership_verified is false
          and progression.relic_live_lookup_verified is false
          and progression.linked_steam_legal_confirmation is false
      )
    ) then
    raise exception 'Synthetic fixture enrolment evidence is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

alter function ironclad_private.guard_staging_synthetic_uat_enrolment_record() owner to postgres;
revoke all on function ironclad_private.guard_staging_synthetic_uat_enrolment_record() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enrol_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_waitlist_confirmed boolean)
 RETURNS TABLE(alias text, player_id uuid, registration_id uuid, registration_status text, queue_position bigint, waitlist_confirmation_required boolean, synthetic_elo integer, synthetic_division text, provenance text, contract_version text, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_model text;
  v_contract text;
  v_effective_division text;
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_player public.players%rowtype;
  v_existing public.registrations%rowtype;
  v_tournament_title text;
  v_tournament_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_bracket_name text;
  v_bracket_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_active_count integer;
  v_offered_count integer;
  v_waiting_count integer;
  v_requires_waitlist boolean;
  v_expected_division text;
  v_checked_at timestamptz;
  v_registration_id uuid;
  v_registration_status text;
  v_queue_position bigint;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = p_alias
  for update;

  if not found then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.id = v_fixture.player_id
  for update;

  if not found
    or not v_player.profile_completed
    or v_player.public_profile_enabled
    or v_player.coh3_profile_id is not null then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;

  perform ironclad_private.staging_synthetic_player_prepared(v_player.id);
  select division_model_version into v_model from public.tournaments where id=p_tournament_id;
  v_contract:=case when v_model='four_division_v1' then 'staging-synthetic-v2' else 'staging-synthetic-v1' end;
  v_effective_division:=ironclad_private.division_for_elo(v_model,v_fixture.synthetic_elo);
  select registration.*
  into v_existing
  from public.registrations as registration
  where registration.clerk_user_id = v_player.clerk_user_id
    and registration.tournament_id = p_tournament_id
  for update;

  if found then
    if v_existing.tournament_bracket_id is distinct from
        p_tournament_bracket_id
      or v_existing.registration_provenance is distinct from
        'staging_synthetic_uat'
      or v_existing.fixture_contract_version is distinct from v_contract
      or not exists (
        select 1
        from ironclad_private.staging_synthetic_uat_enrolments as enrolment
        where enrolment.registration_id = v_existing.id
          and enrolment.player_id = v_player.id
          and enrolment.tournament_id = p_tournament_id
          and enrolment.tournament_bracket_id = p_tournament_bracket_id
      ) then
      raise exception using
        errcode = '23505',
        message = 'Already registered for this tournament';
    end if;

    select case
      when v_existing.registration_status = 'waitlisted'
        and v_existing.waitlist_offer_status is null then count(*)
      else null
    end
    into v_queue_position
    from public.registrations as candidate
    where candidate.tournament_bracket_id = p_tournament_bracket_id
      and candidate.registration_status = 'waitlisted'
      and candidate.waitlist_offer_status is null
      and (candidate.created_at, candidate.id)
        <= (v_existing.created_at, v_existing.id);

    return query select
      v_fixture.approved_alias,
      v_player.id,
      v_existing.id,
      v_existing.registration_status,
      v_queue_position,
      false,
      v_fixture.synthetic_elo,
      v_effective_division,
      v_fixture.provenance,
      v_contract,
      false;
    return;
  end if;

  select
    tournament.title,
    tournament.status,
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_tournament_title,
    v_tournament_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_bracket_name,
    v_bracket_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and tournament.id = p_tournament_id
  for update of bracket;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  v_checked_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status is null
    or v_tournament_status not in ('registration_open', 'in_progress')
    or v_bracket_launched_at is not null
    or (
      v_registration_open_at is not null
      and v_checked_at < v_registration_open_at
    )
    or (
      v_registration_close_at is not null
      and v_checked_at > v_registration_close_at
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  v_expected_division := ironclad_private.division_verified_label(v_model,v_bracket_name);

  if v_expected_division is null
    or v_effective_division is distinct from v_expected_division then
    raise exception
      'Synthetic ELO does not match the selected tournament division';
  end if;

  perform public.reconcile_tournament_waitlist(p_tournament_bracket_id);

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where candidate.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status = 'offered'
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status is null
    )::integer
  into v_active_count, v_offered_count, v_waiting_count
  from public.registrations as candidate
  where candidate.tournament_bracket_id = p_tournament_bracket_id;

  v_requires_waitlist :=
    v_active_count + v_offered_count >= v_required_count
    or v_waiting_count > 0;

  if v_requires_waitlist
    and coalesce(p_waitlist_confirmed, false) is false then
    return query select
      v_fixture.approved_alias,
      v_player.id,
      null::uuid,
      null::text,
      null::bigint,
      true,
      v_fixture.synthetic_elo,
      v_effective_division,
      v_fixture.provenance,
      v_contract,
      false;
    return;
  end if;

  perform set_config(
    'ironclad.waitlist_confirmed',
    case when coalesce(p_waitlist_confirmed, false) then 'on' else 'off' end,
    true
  );
  perform set_config(
    'ironclad.staging_synthetic_uat_enrolling',
    'on',
    true
  );

  insert into public.registrations as inserted (
    profile_id,
    clerk_user_id,
    player_name,
    discord_username,
    steam_name,
    coh3_player_card_url,
    country,
    region,
    timezone,
    submitted_elo,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    admin_notes,
    tournament_id,
    tournament_bracket_id,
    elo_verified_elo,
    elo_difference,
    elo_highest_faction,
    elo_checked_mode,
    elo_checked_at,
    elo_verification_source,
    elo_verification_error,
    elo_verification_payload,
    elo_verified_player_name,
    elo_identity_status,
    elo_identity_error,
    elo_verified_division,
    elo_calculation_version,
    registration_provenance,
    fixture_contract_version
  ) values (
    v_player.id,
    v_player.clerk_user_id,
    v_player.in_game_name,
    null,
    null,
    null,
    v_player.country,
    v_player.region,
    v_player.timezone,
    v_fixture.synthetic_elo,
    v_tournament_title,
    v_bracket_name || ' Bracket',
    case when v_requires_waitlist then 'waitlisted' else 'pending' end,
    'manual_review',
    '',
    p_tournament_id,
    p_tournament_bracket_id,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'staging_synthetic_uat',
    v_contract
  )
  returning inserted.id, inserted.registration_status
  into v_registration_id, v_registration_status;

  insert into ironclad_private.staging_synthetic_uat_enrolments (
    registration_id,
    player_id,
    tournament_id,
    tournament_bracket_id,
    synthetic_elo,
    synthetic_division,contract_version
  ) values (
    v_registration_id,
    v_player.id,
    p_tournament_id,
    p_tournament_bracket_id,
    v_fixture.synthetic_elo,
    v_effective_division,v_contract
  );

  if v_registration_status = 'waitlisted' then
    select count(*)
    into v_queue_position
    from public.registrations as candidate
    join public.registrations as inserted
      on inserted.id = v_registration_id
    where candidate.tournament_bracket_id = p_tournament_bracket_id
      and candidate.registration_status = 'waitlisted'
      and candidate.waitlist_offer_status is null
      and (candidate.created_at, candidate.id)
        <= (inserted.created_at, inserted.id);
  end if;

  return query select
    v_fixture.approved_alias,
    v_player.id,
    v_registration_id,
    v_registration_status,
    v_queue_position,
    false,
    v_fixture.synthetic_elo,
    v_effective_division,
    v_fixture.provenance,
    v_contract,
    true;
end;
$function$;

alter function public.enrol_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_waitlist_confirmed boolean) owner to postgres;
revoke all on function public.enrol_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_waitlist_confirmed boolean) from public, anon, authenticated, service_role;

grant execute on function public.enrol_staging_synthetic_uat_player(p_fixture_secret text, p_alias text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_waitlist_confirmed boolean) to service_role;

create function ironclad_private.is_synthetic_registration(p_registration_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.registrations r join ironclad_private.staging_synthetic_uat_players f on f.player_id=r.profile_id where r.id=p_registration_id and (r.registration_provenance='staging_synthetic_uat' or r.elo_calculation_version='staging-synthetic-academy-v1'));
$$;
revoke all on function ironclad_private.is_synthetic_registration(uuid) from public,anon,authenticated,service_role;
grant execute on function ironclad_private.is_synthetic_registration(uuid) to service_role;
alter table public.registration_acceptances drop constraint registration_acceptances_required_controls_check;
alter table public.registration_acceptances add constraint registration_acceptances_required_controls_check check(rulebook_accepted and ppa_accepted and terms_accepted and privacy_acknowledged and age_18_confirmed and own_ironclad_account_confirmed and (linked_steam_account_confirmed or ironclad_private.is_synthetic_registration(registration_id)));

CREATE OR REPLACE FUNCTION public.submit_verified_player_registration(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid, p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean, p_terms_accepted boolean, p_privacy_acknowledged boolean, p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean, p_waitlist_confirmed boolean)
 RETURNS TABLE(id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text, submitted_elo bigint, waitlist_confirmation_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_player public.players%rowtype;
  v_model text;
  v_synthetic record;
  v_is_synthetic boolean := false;
  v_fixture_contract text;
  v_has_fixture_provenance boolean := false;
  v_rulebook_document public.legal_documents%rowtype;
  v_ppa_document public.legal_documents%rowtype;
  v_terms_document public.legal_documents%rowtype;
  v_privacy_document public.legal_documents%rowtype;
  v_consent_checked_at timestamptz;
  v_tournament_title text;
  v_tournament_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_bracket_name text;
  v_bracket_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_active_count integer;
  v_offered_count integer;
  v_waiting_count integer;
  v_requires_waitlist boolean;
  v_expected_division text;
  v_calculation_version text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_rulebook_accepted is distinct from true
    or p_ppa_accepted is distinct from true
    or p_terms_accepted is distinct from true
    or p_privacy_acknowledged is distinct from true
    or p_age_18_confirmed is distinct from true
    or p_account_and_steam_ownership_confirmed is distinct from true then
    raise exception 'Registration consent is invalid'
      using errcode = '22023';
  end if;

  v_consent_checked_at := clock_timestamp();

  select document.*
  into v_rulebook_document
  from public.legal_documents as document
  where document.id = p_rulebook_document_id
    and document.document_kind = 'rulebook'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_ppa_document
  from public.legal_documents as document
  where document.id = p_ppa_document_id
    and document.document_kind = 'ppa'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_terms_document
  from public.legal_documents as document
  where document.id = p_terms_document_id
    and document.document_kind = 'terms'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_privacy_document
  from public.legal_documents as document
  where document.id = p_privacy_document_id
    and document.document_kind = 'privacy'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  v_calculation_version := nullif(
    btrim(p_relic_calculation_version),
    ''
  );

  if p_relic_elo is null
    or p_relic_elo < 0
    or p_relic_elo > 9007199254740991 then
    raise exception 'Registration verification data is invalid';
  end if;

  if p_relic_faction is null
    or p_relic_faction not in (
      'US Forces',
      'British Forces',
      'Deutsches Afrikakorps',
      'Wehrmacht'
    )
    or p_relic_division is null
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro','Main','Pro')
    or v_calculation_version is null then
    raise exception 'Registration verification data is invalid';
  end if;

  select t.division_model_version into v_model from public.tournaments t join public.tournament_brackets b on b.tournament_id=t.id where t.id=p_tournament_id and b.id=p_tournament_bracket_id;
  if v_model is null then raise exception 'Tournament registration is not available'; end if;
  v_expected_division := ironclad_private.division_for_elo(v_model,p_relic_elo);
  if v_calculation_version in ('staging-synthetic-v1','staging-synthetic-v2','staging-synthetic-academy-v1') then
    select * into v_synthetic from public.resolve_staging_synthetic_registration_elo(p_profile_id,p_clerk_user_id,p_steam_id64,v_model);
    if not found or v_synthetic.elo is distinct from p_relic_elo or v_synthetic.faction is distinct from p_relic_faction or v_synthetic.division is distinct from p_relic_division or v_synthetic.calculation_version is distinct from v_calculation_version then raise exception 'Synthetic registration rating is invalid'; end if;
    v_is_synthetic:=true;
    v_has_fixture_provenance:=v_calculation_version<>'staging-synthetic-academy-v1';
    v_fixture_contract:=case when v_model='four_division_v1' then 'staging-synthetic-v2' else 'staging-synthetic-v1' end;
  elsif v_calculation_version is distinct from (case when v_model='four_division_v1' then 'relic-highest-1v1-v2' else 'relic-highest-1v1-v1' end) then
    raise exception 'Registration calculation version does not match competition model';
  end if;

  if p_relic_division is distinct from v_expected_division then
    raise exception 'Registration verification data is invalid';
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.id = p_profile_id
    and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null
    and player.steam_id64 = p_steam_id64
    and player.profile_completed
  for update;

  if not found then
    raise exception 'Registration identity is unavailable';
  end if;

  if exists (
    select 1
    from public.registrations as existing_registration
    where existing_registration.clerk_user_id = v_player.clerk_user_id
      and existing_registration.tournament_id = p_tournament_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Already registered for this tournament';
  end if;

  select
    tournament.title,
    tournament.status,
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_tournament_title,
    v_tournament_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_bracket_name,
    v_bracket_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and tournament.id = p_tournament_id
  for update of bracket;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  v_verified_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status not in ('registration_open', 'in_progress')
    or v_bracket_launched_at is not null
    or (
      v_registration_open_at is not null
      and v_verified_at < v_registration_open_at
    )
    or (
      v_registration_close_at is not null
      and v_verified_at > v_registration_close_at
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  v_expected_division := ironclad_private.division_verified_label(v_model,v_bracket_name);

  if v_expected_division is null
    or p_relic_division is distinct from v_expected_division then
    raise exception
      'Verified ELO does not match the selected tournament division';
  end if;

  perform public.reconcile_tournament_waitlist(
    p_tournament_bracket_id
  );

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where candidate.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status = 'offered'
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status is null
    )::integer
  into v_active_count, v_offered_count, v_waiting_count
  from public.registrations as candidate
  where candidate.tournament_bracket_id = p_tournament_bracket_id;

  v_requires_waitlist :=
    v_active_count + v_offered_count >= v_required_count
    or v_waiting_count > 0;

  if v_requires_waitlist
    and coalesce(p_waitlist_confirmed, false) is false then
    id := null;
    tournament_id := p_tournament_id;
    tournament_bracket_id := p_tournament_bracket_id;
    registration_status := null;
    submitted_elo := p_relic_elo;
    waitlist_confirmation_required := true;
    return next;
    return;
  end if;

  perform set_config(
    'ironclad.waitlist_confirmed',
    case
      when coalesce(p_waitlist_confirmed, false) then 'on'
      else 'off'
    end,
    true
  );

  if v_has_fixture_provenance then perform set_config('ironclad.staging_synthetic_uat_enrolling','on',true); end if;
  insert into public.registrations as inserted (
    profile_id,
    clerk_user_id,
    player_name,
    discord_username,
    steam_name,
    coh3_player_card_url,
    country,
    region,
    timezone,
    submitted_elo,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    admin_notes,
    tournament_id,
    tournament_bracket_id,
    elo_verified_elo,
    elo_difference,
    elo_highest_faction,
    elo_checked_mode,
    elo_checked_at,
    elo_verification_source,
    elo_verification_error,
    elo_verification_payload,
    elo_verified_player_name,
    elo_identity_status,
    elo_identity_error,
    elo_verified_division,
    elo_calculation_version,registration_provenance,fixture_contract_version
  )
  values (
    v_player.id,
    v_player.clerk_user_id,
    v_player.in_game_name,
    v_player.discord_username,
    v_player.steam_username,
    null,
    v_player.country,
    v_player.region,
    v_player.timezone,
    p_relic_elo,
    v_tournament_title,
    v_bracket_name || ' Bracket',
    case when v_requires_waitlist then 'waitlisted' else 'pending' end,
    'verified',
    '',
    p_tournament_id,
    p_tournament_bracket_id,
    p_relic_elo,
    null,
    p_relic_faction,
    '1v1',
    v_verified_at,
    'relic',
    null,
    null,
    null,
    null,
    null,
    p_relic_division,
    v_calculation_version,
    case when v_has_fixture_provenance then 'staging_synthetic_uat' else null end,
    case when v_has_fixture_provenance then v_fixture_contract else null end
  )
  returning
    inserted.id,
    inserted.tournament_id,
    inserted.tournament_bracket_id,
    inserted.registration_status,
    inserted.submitted_elo
  into
    id,
    tournament_id,
    tournament_bracket_id,
    registration_status,
    submitted_elo;

  if v_has_fixture_provenance then
    insert into ironclad_private.staging_synthetic_uat_enrolments(registration_id,player_id,tournament_id,tournament_bracket_id,synthetic_elo,synthetic_division,contract_version)
    values(id,v_player.id,p_tournament_id,p_tournament_bracket_id,p_relic_elo,p_relic_division,v_fixture_contract);
  end if;
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
  )
  values (
    id,
    tournament_id,
    v_player.clerk_user_id,
    v_rulebook_document.id,
    v_rulebook_document.version,
    v_rulebook_document.immutable_url,
    v_rulebook_document.sha256,
    v_ppa_document.id,
    v_ppa_document.version,
    v_ppa_document.immutable_url,
    v_ppa_document.sha256,
    v_terms_document.id,
    v_terms_document.version,
    v_terms_document.immutable_url,
    v_terms_document.sha256,
    v_privacy_document.id,
    v_privacy_document.version,
    v_privacy_document.immutable_url,
    v_privacy_document.sha256,
    p_rulebook_accepted,
    p_ppa_accepted,
    p_terms_accepted,
    p_privacy_acknowledged,
    p_age_18_confirmed,
    p_account_and_steam_ownership_confirmed,
    p_account_and_steam_ownership_confirmed and not v_is_synthetic
  );

  update public.players as player
  set
    current_elo = p_relic_elo,
    relic_verified_elo = p_relic_elo,
    relic_verified_faction = p_relic_faction,
    relic_verified_division = p_relic_division,
    relic_elo_calculation_version = v_calculation_version,
    relic_elo_verified_at = v_verified_at
  where player.id = v_player.id
    and player.clerk_user_id = v_player.clerk_user_id
    and player.steam_id64 = p_steam_id64;

  if not found then
    raise exception 'Registration identity is unavailable';
  end if;

  waitlist_confirmation_required := false;
  return next;
end;
$function$;

alter function public.submit_verified_player_registration(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid, p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean, p_terms_accepted boolean, p_privacy_acknowledged boolean, p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean, p_waitlist_confirmed boolean) owner to postgres;
revoke all on function public.submit_verified_player_registration(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid, p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean, p_terms_accepted boolean, p_privacy_acknowledged boolean, p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean, p_waitlist_confirmed boolean) from public, anon, authenticated, service_role;

grant execute on function public.submit_verified_player_registration(p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid, p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean, p_terms_accepted boolean, p_privacy_acknowledged boolean, p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean, p_waitlist_confirmed boolean) to service_role;

commit;
