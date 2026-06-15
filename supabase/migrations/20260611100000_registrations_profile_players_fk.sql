begin;

-- The application stores public.players.id in registrations.profile_id.
-- Preserve legacy registrations by remapping through the shared Clerk user ID.
update public.registrations as registration
set profile_id = player.id
from public.players as player
where registration.clerk_user_id = player.clerk_user_id
  and registration.profile_id is distinct from player.id;

-- Keep historical registrations whose legacy profile no longer has a player
-- record, but clear the obsolete reference so the corrected FK can be added.
update public.registrations as registration
set profile_id = null
where registration.profile_id is not null
  and not exists (
    select 1
    from public.players as player
    where player.id = registration.profile_id
  );

alter table public.registrations
  drop constraint if exists registrations_profile_id_fkey;

alter table public.registrations
  add constraint registrations_profile_id_fkey
  foreign key (profile_id)
  references public.players(id)
  on delete set null
  not valid;

alter table public.registrations
  validate constraint registrations_profile_id_fkey;

create index if not exists registrations_profile_id_idx
  on public.registrations(profile_id);

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
  new.admin_notes = '';
  new.created_at = now();
  new.updated_at = now();

  return new;
end;
$$;

drop trigger if exists registrations_canonicalize_identity
  on public.registrations;
create trigger registrations_canonicalize_identity
before insert on public.registrations
for each row
execute function public.canonicalize_registration_identity();

commit;
