begin;

create function public.get_player_badge_bracket_progression_summary(
  p_player_id uuid
)
returns table (
  original_bracket text,
  original_tournament_id uuid,
  original_completed_at timestamptz,
  higher_bracket text,
  higher_tournament_id uuid,
  higher_completed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with qualifying_participation as (
    select distinct
      event.player_id,
      event.tournament_id,
      tournament.first_completed_at,
      case bracket.name
        when 'Academy' then 'academy'
        when 'Challenge' then 'challenge'
        when 'Main' then 'main'
        else null
      end as bracket_family
    from public.leaderboard_point_events as event
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    join public.tournament_brackets as bracket
      on bracket.id = event.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.registrations as registration
      on registration.id = event.registration_id
      and registration.tournament_id = event.tournament_id
      and registration.tournament_bracket_id = event.tournament_bracket_id
    where event.player_id = p_player_id
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.tournament_id is not null
      and event.tournament_bracket_id is not null
      and event.registration_id is not null
      and tournament.status not in ('cancelled', 'voided')
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and bracket.name in ('Academy', 'Challenge', 'Main')
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        event.tournament_id,
        event.tournament_bracket_id,
        event.registration_id
      )
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.player_id = event.player_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  qualifying_tournaments as (
    select
      participation.tournament_id,
      min(participation.first_completed_at) as first_completed_at,
      min(participation.bracket_family) as bracket_family,
      count(distinct participation.bracket_family) as bracket_family_count
    from qualifying_participation as participation
    where participation.bracket_family is not null
    group by participation.tournament_id
  ),
  ordered_tournaments as (
    select
      qualifying.tournament_id,
      qualifying.first_completed_at,
      qualifying.bracket_family,
      row_number() over (
        order by qualifying.first_completed_at, qualifying.tournament_id
      ) as participation_number
    from qualifying_tournaments as qualifying
    where qualifying.bracket_family_count = 1
  ),
  original_tournament as (
    select
      ordered.bracket_family,
      ordered.tournament_id,
      ordered.first_completed_at,
      ordered.participation_number
    from ordered_tournaments as ordered
    where ordered.participation_number = 1
  ),
  threshold_tournament as (
    select
      ordered.bracket_family,
      ordered.tournament_id,
      ordered.first_completed_at
    from ordered_tournaments as ordered
    cross join original_tournament as original
    where ordered.participation_number > original.participation_number
      and (
        original.bracket_family = 'academy'
        and ordered.bracket_family in ('challenge', 'main')
        or original.bracket_family = 'challenge'
        and ordered.bracket_family = 'main'
      )
    order by ordered.participation_number
    limit 1
  )
  select
    original.bracket_family as original_bracket,
    original.tournament_id as original_tournament_id,
    original.first_completed_at as original_completed_at,
    threshold.bracket_family as higher_bracket,
    threshold.tournament_id as higher_tournament_id,
    threshold.first_completed_at as higher_completed_at
  from original_tournament as original
  left join threshold_tournament as threshold
    on true;
$$;

alter function public.get_player_badge_bracket_progression_summary(uuid)
  owner to postgres;

revoke all on function public.get_player_badge_bracket_progression_summary(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_bracket_progression_summary(uuid)
  to service_role;

comment on function public.get_player_badge_bracket_progression_summary(uuid) is
  'Service-role-only helper for Badge 05 using distinct finalized qualifying participation tournaments ordered by first_completed_at.';

commit;
