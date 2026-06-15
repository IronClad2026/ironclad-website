begin;

create or replace function public.preserve_tournament_bracket_roster_invariants()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_registration_count integer;
  v_ineligible_player text;
  v_ineligible_elo integer;
begin
  if new.elo_rules is distinct from old.elo_rules then
    select
      coalesce(nullif(btrim(registration.player_name), ''), registration.id::text),
      coalesce(player.current_elo, registration.submitted_elo)::integer
    into v_ineligible_player, v_ineligible_elo
    from public.registrations as registration
    left join public.players as player
      on player.clerk_user_id = registration.clerk_user_id
    where registration.tournament_bracket_id = old.id
      and registration.registration_status <> 'rejected'
      and public.is_elo_eligible(
        coalesce(player.current_elo, registration.submitted_elo)::integer,
        new.elo_rules
      ) is distinct from true
    order by
      case
        when registration.registration_status = 'approved' then 0
        else 1
      end,
      registration.created_at,
      registration.id
    limit 1;

    if v_ineligible_player is not null then
      raise exception
        'Cannot change ELO rules for the % Bracket to "%": existing non-rejected player % (ELO %) would become ineligible. Reject or move affected registrations through an explicit roster workflow before changing the rule.',
        old.name,
        new.elo_rules,
        v_ineligible_player,
        coalesce(v_ineligible_elo::text, 'unavailable');
    end if;
  end if;

  if new.max_players is distinct from old.max_players then
    select count(*)::integer
    into v_registration_count
    from public.registrations as registration
    where registration.tournament_bracket_id = old.id
      and registration.registration_status <> 'rejected';

    if new.max_players < v_registration_count then
      raise exception
        'Cannot reduce the % Bracket capacity to % because it currently has % non-rejected registrations. Capacity must be at least the current roster count.',
        old.name,
        new.max_players,
        v_registration_count;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_brackets_preserve_roster_invariants
  on public.tournament_brackets;
create trigger tournament_brackets_preserve_roster_invariants
before update of elo_rules, max_players
on public.tournament_brackets
for each row
execute function public.preserve_tournament_bracket_roster_invariants();

commit;
