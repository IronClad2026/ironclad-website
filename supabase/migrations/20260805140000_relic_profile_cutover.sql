begin;

create or replace function public.save_relic_profile_elo_snapshot(
  p_player_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text,
  p_claimed_at timestamptz,
  p_relic_elo integer,
  p_relic_faction text,
  p_relic_division text,
  p_relic_calculation_version text
)
returns table (
  current_elo integer,
  relic_verified_elo bigint,
  relic_verified_faction text,
  relic_verified_division text,
  relic_elo_calculation_version text,
  relic_elo_verified_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_calculation_version text;
  v_expected_division text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  v_calculation_version := nullif(btrim(p_relic_calculation_version), '');

  if p_relic_elo is null
    or p_relic_elo < 0
    or p_relic_elo > 5000 then
    raise exception 'Profile verification data is invalid';
  end if;

  if p_relic_faction is null
    or p_relic_faction not in (
      'US Forces',
      'British Forces',
      'Deutsches Afrikakorps',
      'Wehrmacht'
    )
    or p_relic_division is null
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro')
    or v_calculation_version is null then
    raise exception 'Profile verification data is invalid';
  end if;

  v_expected_division := case
    when p_relic_elo < 1100 then 'Academy'
    when p_relic_elo < 1400 then 'Challenge'
    else 'Main / Pro'
  end;

  if p_relic_division is distinct from v_expected_division then
    raise exception 'Profile verification data is invalid';
  end if;

  v_verified_at := clock_timestamp();

  return query
  update public.players as player
  set
    current_elo = p_relic_elo,
    relic_verified_elo = p_relic_elo,
    relic_verified_faction = p_relic_faction,
    relic_verified_division = p_relic_division,
    relic_elo_calculation_version = v_calculation_version,
    relic_elo_verified_at = v_verified_at
  where player.id = p_player_id
    and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null
    and player.steam_id64 = p_steam_id64
    and p_claimed_at is not null
    and player.relic_elo_last_attempt_at = p_claimed_at
  returning
    player.current_elo,
    player.relic_verified_elo,
    player.relic_verified_faction,
    player.relic_verified_division,
    player.relic_elo_calculation_version,
    player.relic_elo_verified_at;
end;
$$;

alter function public.save_relic_profile_elo_snapshot(
  uuid,
  text,
  text,
  timestamptz,
  integer,
  text,
  text,
  text
) owner to postgres;

revoke all on function public.save_relic_profile_elo_snapshot(
  uuid,
  text,
  text,
  timestamptz,
  integer,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.save_relic_profile_elo_snapshot(
  uuid,
  text,
  text,
  timestamptz,
  integer,
  text,
  text,
  text
) to service_role;

comment on function public.save_relic_profile_elo_snapshot(
  uuid,
  text,
  text,
  timestamptz,
  integer,
  text,
  text,
  text
) is
  'Service-role-only atomic save of a successful profile Relic ELO result.';

create or replace function public.submit_verified_player_registration(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_relic_elo bigint,
  p_relic_faction text,
  p_relic_division text,
  p_relic_calculation_version text
)
returns table (
  id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  submitted_elo bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player public.players%rowtype;
  v_tournament_title text;
  v_tournament_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_bracket_name text;
  v_expected_division text;
  v_calculation_version text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  v_calculation_version := nullif(btrim(p_relic_calculation_version), '');

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
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro')
    or v_calculation_version is null then
    raise exception 'Registration verification data is invalid';
  end if;

  v_expected_division := case
    when p_relic_elo < 1100 then 'Academy'
    when p_relic_elo < 1400 then 'Challenge'
    else 'Main / Pro'
  end;

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
    from public.registrations as registration
    where registration.clerk_user_id = v_player.clerk_user_id
      and registration.tournament_id = p_tournament_id
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
    bracket.name
  into
    v_tournament_title,
    v_tournament_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_bracket_name
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and tournament.id = p_tournament_id
  for update of tournament, bracket;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  v_verified_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status is distinct from 'registration_open'
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

  v_expected_division := case v_bracket_name
    when 'Academy' then 'Academy'
    when 'Challenge' then 'Challenge'
    when 'Main' then 'Main / Pro'
    else null
  end;

  if v_expected_division is null
    or p_relic_division is distinct from v_expected_division then
    raise exception
      'Verified ELO does not match the selected tournament division';
  end if;

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
    elo_calculation_version
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
    'pending',
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
    v_calculation_version
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

  return next;
end;
$$;

alter function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) owner to postgres;

revoke all on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) to service_role;

comment on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) is
  'Service-role-only atomic Relic registration, profile ELO update, and immutable tournament ELO snapshot creation.';

update public.players as player
set current_elo = player.relic_verified_elo::integer
where player.relic_verified_elo between 0 and 5000
  and player.relic_verified_faction in (
    'US Forces',
    'British Forces',
    'Deutsches Afrikakorps',
    'Wehrmacht'
  )
  and player.relic_verified_division = case
    when player.relic_verified_elo < 1100 then 'Academy'
    when player.relic_verified_elo < 1400 then 'Challenge'
    else 'Main / Pro'
  end
  and nullif(btrim(player.relic_elo_calculation_version), '') is not null
  and player.relic_elo_verified_at is not null
  and nullif(btrim(player.steam_id64), '') is not null
  and player.current_elo::bigint is distinct from player.relic_verified_elo;

with completion as (
  select
    player.id,
    (
      nullif(btrim(player.avatar_url), '') is not null
      and (
        nullif(btrim(player.display_name), '') is not null
        or nullif(btrim(player.in_game_name), '') is not null
      )
      and nullif(btrim(player.discord_username), '') is not null
      and nullif(btrim(player.steam_username), '') is not null
      and nullif(btrim(player.country), '') is not null
      and nullif(btrim(player.region), '') is not null
      and nullif(btrim(player.timezone), '') is not null
    ) as profile_completed
  from public.players as player
)
update public.players as player
set profile_completed = completion.profile_completed
from completion
where player.id = completion.id
  and player.profile_completed is distinct from completion.profile_completed;

create or replace function public.protect_player_relic_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user = 'postgres'
    and coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if num_nonnulls(
      new.current_elo,
      new.relic_verified_elo,
      new.relic_verified_faction,
      new.relic_verified_division,
      new.relic_elo_calculation_version,
      new.relic_elo_verified_at,
      new.relic_elo_last_attempt_at
    ) > 0 then
      raise exception using
        errcode = '42501',
        message = 'Relic verification fields are server-controlled';
    end if;

    return new;
  end if;

  if new.current_elo is distinct from old.current_elo
    or new.relic_verified_elo is distinct from old.relic_verified_elo
    or new.relic_verified_faction is distinct from old.relic_verified_faction
    or new.relic_verified_division is distinct from old.relic_verified_division
    or new.relic_elo_calculation_version
      is distinct from old.relic_elo_calculation_version
    or new.relic_elo_verified_at is distinct from old.relic_elo_verified_at
    or new.relic_elo_last_attempt_at
      is distinct from old.relic_elo_last_attempt_at then
    raise exception using
      errcode = '42501',
      message = 'Relic verification fields are server-controlled';
  end if;

  return new;
end;
$$;

alter function public.protect_player_relic_verification()
  owner to postgres;
revoke all on function public.protect_player_relic_verification()
  from public, anon, authenticated, service_role;

drop trigger if exists players_protect_relic_verification
  on public.players;
create trigger players_protect_relic_verification
before insert or update
on public.players
for each row execute function public.protect_player_relic_verification();

commit;
