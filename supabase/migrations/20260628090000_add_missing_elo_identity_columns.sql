begin;

alter table public.registrations
  add column if not exists elo_verified_player_name text,
  add column if not exists elo_identity_status text,
  add column if not exists elo_identity_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_elo_identity_status_check'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_elo_identity_status_check
      check (
        elo_identity_status is null
        or elo_identity_status in (
          'not_checked',
          'matched',
          'mismatch',
          'unavailable'
        )
      );
  end if;
end;
$$;

create or replace function public.canonicalize_registration_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_tournament_title text;
  v_bracket_name text;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.id = new.profile_id
    and player.clerk_user_id = (auth.jwt() ->> 'sub')
    and player.profile_completed;

  if not found then
    raise exception
      'Registration profile must belong to the authenticated user and be complete';
  end if;

  select tournament.title, bracket.name
  into v_tournament_title, v_bracket_name
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = new.tournament_bracket_id
    and tournament.id = new.tournament_id;

  if not found then
    raise exception 'Selected tournament bracket does not exist';
  end if;

  new.clerk_user_id = v_player.clerk_user_id;
  new.player_name = v_player.in_game_name;
  new.discord_username = v_player.discord_username;
  new.steam_name = v_player.steam_username;
  new.coh3_player_card_url = v_player.coh3_player_card_url;
  new.country = v_player.country;
  new.region = v_player.region;
  new.timezone = v_player.timezone;
  new.submitted_elo = v_player.current_elo;
  new.tournament_title = v_tournament_title;
  new.bracket_name = v_bracket_name || ' Bracket';
  new.elo_status = 'pending';
  new.elo_verified_elo = null;
  new.elo_difference = null;
  new.elo_highest_faction = null;
  new.elo_checked_mode = null;
  new.elo_checked_at = null;
  new.elo_verification_source = null;
  new.elo_verification_error = null;
  new.elo_verification_payload = null;
  new.elo_verified_player_name = null;
  new.elo_identity_status = null;
  new.elo_identity_error = null;
  new.admin_notes = '';
  new.created_at = now();
  new.updated_at = now();

  return new;
end;
$$;

create or replace function public.submit_verified_player_registration(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_player_name text,
  p_submitted_elo integer,
  p_coh3_player_card_url text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_registration_status text
)
returns table (
  id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  submitted_elo integer,
  coh3_player_card_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_registration_status not in ('pending', 'waitlisted') then
    raise exception 'Invalid public registration status';
  end if;

  with database_time as (
    select clock_timestamp() as checked_at
  )
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
    elo_identity_error
  )
  select
    player.id,
    player.clerk_user_id,
    player.in_game_name,
    player.discord_username,
    player.steam_username,
    player.coh3_player_card_url,
    player.country,
    player.region,
    player.timezone,
    player.current_elo,
    tournament.title,
    bracket.name || ' Bracket',
    p_registration_status,
    'pending',
    '',
    tournament.id,
    bracket.id,
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
    null
  from database_time
  join public.players as player
    on player.id = p_profile_id
   and player.clerk_user_id = p_clerk_user_id
   and player.profile_completed
   and player.in_game_name = p_player_name
   and player.current_elo = p_submitted_elo
   and player.coh3_player_card_url = p_coh3_player_card_url
  join public.tournament_brackets as bracket
    on bracket.id = p_tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
   and tournament.id = p_tournament_id
  where tournament.status = 'registration_open'
    and (
      tournament.registration_open_at is null
      or database_time.checked_at >= tournament.registration_open_at
    )
    and (
      tournament.registration_close_at is null
      or database_time.checked_at <= tournament.registration_close_at
    )
  returning
    inserted.id,
    inserted.tournament_id,
    inserted.tournament_bracket_id,
    inserted.registration_status,
    inserted.submitted_elo,
    inserted.coh3_player_card_url
  into
    id,
    tournament_id,
    tournament_bracket_id,
    registration_status,
    submitted_elo,
    coh3_player_card_url;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  return next;
end;
$$;

revoke all on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  uuid,
  text
) to service_role;

drop policy if exists "Players can submit registrations"
  on public.registrations;
create policy "Players can submit registrations"
on public.registrations
for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and not public.is_elo_verification_enabled()
  and registration_status in ('pending', 'waitlisted')
  and elo_status = 'pending'
  and elo_verified_elo is null
  and elo_difference is null
  and elo_highest_faction is null
  and elo_checked_mode is null
  and elo_checked_at is null
  and elo_verification_source is null
  and elo_verification_error is null
  and elo_verification_payload is null
  and elo_verified_player_name is null
  and elo_identity_status is null
  and elo_identity_error is null
  and exists (
    select 1
    from public.players as player
    where player.id = registrations.profile_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
      and player.profile_completed
      and player.in_game_name = registrations.player_name
      and player.discord_username
        is not distinct from registrations.discord_username
      and player.steam_username
        is not distinct from registrations.steam_name
      and player.coh3_player_card_url
        is not distinct from registrations.coh3_player_card_url
      and player.country is not distinct from registrations.country
      and player.region is not distinct from registrations.region
      and player.timezone is not distinct from registrations.timezone
      and player.current_elo
        is not distinct from registrations.submitted_elo
  )
);

comment on column public.registrations.elo_verified_player_name is
  'COH3 Stats player name found on the matched profile leaderboard row.';
comment on column public.registrations.elo_identity_status is
  'Registration-time IGN identity comparison result: not_checked, matched, mismatch, or unavailable.';
comment on column public.registrations.elo_identity_error is
  'Friendly failure reason when registration-time IGN identity verification could not complete.';

commit;
