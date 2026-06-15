begin;

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

drop policy if exists "Players can submit registrations"
  on public.registrations;
create policy "Players can submit registrations"
on public.registrations
for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and registration_status = 'pending'
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

commit;
