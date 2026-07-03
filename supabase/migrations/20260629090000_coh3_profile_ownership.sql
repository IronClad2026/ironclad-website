begin;

alter table public.players
  add column if not exists coh3_profile_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_coh3_profile_id_format_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_coh3_profile_id_format_check
      check (
        coh3_profile_id is null
        or coh3_profile_id ~ '^[0-9]+$'
      );
  end if;
end;
$$;

create unique index if not exists players_coh3_profile_id_unique_idx
  on public.players(coh3_profile_id)
  where coh3_profile_id is not null;

create or replace function public.extract_coh3stats_profile_id(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_trimmed text;
  v_matches text[];
begin
  v_trimmed = nullif(btrim(p_value), '');

  if v_trimmed is null then
    return null;
  end if;

  if v_trimmed ~ '^[0-9]+$' then
    return v_trimmed;
  end if;

  v_matches = regexp_match(
    v_trimmed,
    '^https?://(www\.)?coh3stats\.com/players/([0-9]+)(/.*)?$',
    'i'
  );

  if v_matches is null then
    return null;
  end if;

  return v_matches[2];
end;
$$;

create or replace function public.protect_player_coh3_profile_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_profile_id text;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.coh3_profile_id = null;
    return new;
  end if;

  if old.coh3_profile_id is not null then
    v_requested_profile_id =
      public.extract_coh3stats_profile_id(new.coh3_player_card_url);

    if v_requested_profile_id is distinct from old.coh3_profile_id then
      new.coh3_player_card_url = old.coh3_player_card_url;
    end if;
  end if;

  new.coh3_profile_id = old.coh3_profile_id;
  return new;
end;
$$;

drop trigger if exists players_protect_coh3_profile_id
  on public.players;
create trigger players_protect_coh3_profile_id
before insert or update
on public.players
for each row execute function public.protect_player_coh3_profile_id();

create or replace function public.find_coh3_profile_owner(
  p_profile_id text,
  p_exclude_player_id uuid default null
)
returns table (
  id uuid,
  clerk_user_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select player.id, player.clerk_user_id
  from public.players as player
  where p_profile_id ~ '^[0-9]+$'
    and player.coh3_profile_id = p_profile_id
    and (
      p_exclude_player_id is null
      or player.id <> p_exclude_player_id
    )
  order by player.updated_at desc
  limit 1;
$$;

revoke all on function public.find_coh3_profile_owner(text, uuid)
  from public, anon, authenticated;
grant execute on function public.find_coh3_profile_owner(text, uuid)
  to service_role;

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  uuid,
  text
);

create or replace function public.submit_verified_player_registration(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_player_name text,
  p_submitted_elo integer,
  p_coh3_player_card_url text,
  p_coh3_profile_id text,
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

  if p_coh3_profile_id is null or p_coh3_profile_id !~ '^[0-9]+$' then
    raise exception 'Please enter a valid coh3stats profile URL.';
  end if;

  if exists (
    select 1
    from public.players as other_player
    where other_player.id <> p_profile_id
      and other_player.coh3_profile_id = p_coh3_profile_id
  ) then
    raise exception
      'This coh3stats profile is already linked to another IronClad account.';
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
   and player.coh3_profile_id = p_coh3_profile_id
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
  text,
  uuid,
  uuid,
  text
) to service_role;

comment on column public.players.coh3_profile_id is
  'Server-authoritative COH3 Stats numeric profile ID linked after successful ELO verification.';

commit;
