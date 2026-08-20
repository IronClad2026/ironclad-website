begin;

create function public.get_player_badge_match_threshold_summary(
  p_player_id uuid
)
returns table (
  played_match_count integer,
  win_count integer,
  first_played_match_id uuid,
  first_played_at timestamptz,
  tenth_played_match_id uuid,
  tenth_played_at timestamptz,
  first_win_match_id uuid,
  first_win_at timestamptz,
  fifth_win_match_id uuid,
  fifth_win_at timestamptz,
  tenth_win_match_id uuid,
  tenth_win_at timestamptz,
  twenty_fifth_win_match_id uuid,
  twenty_fifth_win_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with player_registrations as (
    select registration.id
    from public.registrations as registration
    where registration.profile_id = p_player_id
  ),
  played_matches as (
    select
      tournament_match.id,
      coalesce(
        tournament_match.official_result_decided_at,
        tournament_match.updated_at
      ) as completed_at,
      exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id =
          tournament_match.winner_registration_id
      ) as won
    from public.tournament_matches as tournament_match
    join public.generated_brackets as generated
      on generated.id = tournament_match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where public.is_tournament_match_played_for_leaderboard(
        tournament_match.id
      )
      and tournament.status not in ('cancelled', 'voided')
      and exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id =
          tournament_match.player_one_registration_id
          or player_registration.id =
            tournament_match.player_two_registration_id
      )
  ),
  ranked_played_matches as (
    select
      played_match.id,
      played_match.completed_at,
      row_number() over (
        order by played_match.completed_at, played_match.id
      ) as played_number
    from played_matches as played_match
  ),
  ranked_wins as (
    select
      played_match.id,
      played_match.completed_at,
      row_number() over (
        order by played_match.completed_at, played_match.id
      ) as win_number
    from played_matches as played_match
    where played_match.won
  )
  select
    coalesce(
      (select count(*)::integer from ranked_played_matches),
      0
    ) as played_match_count,
    coalesce(
      (select count(*)::integer from ranked_wins),
      0
    ) as win_count,
    (
      select ranked.id
      from ranked_played_matches as ranked
      where ranked.played_number = 1
    ) as first_played_match_id,
    (
      select ranked.completed_at
      from ranked_played_matches as ranked
      where ranked.played_number = 1
    ) as first_played_at,
    (
      select ranked.id
      from ranked_played_matches as ranked
      where ranked.played_number = 10
    ) as tenth_played_match_id,
    (
      select ranked.completed_at
      from ranked_played_matches as ranked
      where ranked.played_number = 10
    ) as tenth_played_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 1
    ) as first_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 1
    ) as first_win_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 5
    ) as fifth_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 5
    ) as fifth_win_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 10
    ) as tenth_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 10
    ) as tenth_win_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 25
    ) as twenty_fifth_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 25
    ) as twenty_fifth_win_at;
$$;

alter function public.get_player_badge_match_threshold_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_match_threshold_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_match_threshold_summary(uuid)
  to service_role;

create function public.get_player_badge_tournament_for_match(
  p_match_id uuid
)
returns table (
  tournament_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select tournament.id as tournament_id
  from public.tournament_matches as tournament_match
  join public.generated_brackets as generated
    on generated.id = tournament_match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where tournament_match.id = p_match_id
    and tournament.status = 'completed'
    and tournament.first_completed_at is not null;
$$;

alter function public.get_player_badge_tournament_for_match(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_for_match(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_for_match(uuid)
  to service_role;

create function public.get_player_badge_tournament_participants(
  p_tournament_id uuid
)
returns table (
  player_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select distinct event.player_id
  from public.leaderboard_point_events as event
  join public.tournaments as tournament
    on tournament.id = event.tournament_id
  where event.tournament_id = p_tournament_id
    and tournament.status = 'completed'
    and tournament.first_completed_at is not null
    and event.event_type = 'participation'
    and event.source in ('system', 'recalculation')
    and event.registration_id is not null
    and event.tournament_bracket_id is not null
    and not exists (
      select 1
      from public.leaderboard_point_events as withheld
      where withheld.tournament_id = event.tournament_id
        and withheld.registration_id = event.registration_id
        and withheld.player_id = event.player_id
        and withheld.event_type = 'participation_withheld'
        and withheld.source = event.source
    );
$$;

alter function public.get_player_badge_tournament_participants(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_participants(uuid)
  to service_role;

create function public.get_player_badge_tournament_summary(
  p_player_id uuid
)
returns table (
  completed_tournament_count integer,
  first_completed_tournament_id uuid,
  first_completed_at timestamptz,
  third_completed_tournament_id uuid,
  third_completed_at timestamptz,
  tenth_completed_tournament_id uuid,
  tenth_completed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with qualifying_tournaments as (
    select
      event.tournament_id,
      min(tournament.first_completed_at) as completed_at
    from public.leaderboard_point_events as event
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    where event.player_id = p_player_id
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.tournament_id is not null
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
    group by event.tournament_id
  ),
  ranked_tournaments as (
    select
      qualifying.tournament_id,
      qualifying.completed_at,
      row_number() over (
        order by qualifying.completed_at, qualifying.tournament_id
      ) as tournament_number
    from qualifying_tournaments as qualifying
  )
  select
    coalesce(
      (select count(*)::integer from ranked_tournaments),
      0
    ) as completed_tournament_count,
    (
      select ranked.tournament_id
      from ranked_tournaments as ranked
      where ranked.tournament_number = 1
    ) as first_completed_tournament_id,
    (
      select ranked.completed_at
      from ranked_tournaments as ranked
      where ranked.tournament_number = 1
    ) as first_completed_at,
    (
      select ranked.tournament_id
      from ranked_tournaments as ranked
      where ranked.tournament_number = 3
    ) as third_completed_tournament_id,
    (
      select ranked.completed_at
      from ranked_tournaments as ranked
      where ranked.tournament_number = 3
    ) as third_completed_at,
    (
      select ranked.tournament_id
      from ranked_tournaments as ranked
      where ranked.tournament_number = 10
    ) as tenth_completed_tournament_id,
    (
      select ranked.completed_at
      from ranked_tournaments as ranked
      where ranked.tournament_number = 10
    ) as tenth_completed_at;
$$;

alter function public.get_player_badge_tournament_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_summary(uuid)
  to service_role;

comment on function public.get_player_badge_match_threshold_summary(uuid) is
  'Service-role-only helper summarizing played-match and win thresholds for badge evaluators using the existing leaderboard played-match predicate.';
comment on function public.get_player_badge_tournament_for_match(uuid) is
  'Service-role-only helper resolving a match to its completed tournament for badge tournament-count evaluation.';
comment on function public.get_player_badge_tournament_participants(uuid) is
  'Service-role-only helper exposing players with authoritative participation events in one completed tournament.';
comment on function public.get_player_badge_tournament_summary(uuid) is
  'Service-role-only helper counting distinct completed tournament participation events for badge evaluators.';

commit;
