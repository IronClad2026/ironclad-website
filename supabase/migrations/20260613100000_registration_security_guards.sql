begin;

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

create or replace function public.enforce_registration_elo_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_elo integer;
  v_bracket_name text;
  v_elo_rules text;
  v_is_eligible boolean;
begin
  if new.registration_status = 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.registration_status is distinct from new.registration_status
    and new.registration_status <> 'approved' then
    return new;
  end if;

  if new.tournament_bracket_id is null or new.clerk_user_id is null then
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

  new.submitted_elo = v_current_elo;
  return new;
end;
$$;

commit;
