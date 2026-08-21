begin;

create function public.get_player_badge_match_excellence_summary(
  p_player_id uuid
)
returns table (
  best_win_streak integer,
  third_streak_match_id uuid,
  third_streak_at timestamptz,
  fifth_streak_match_id uuid,
  fifth_streak_at timestamptz,
  clean_sweep_count integer,
  first_clean_sweep_match_id uuid,
  first_clean_sweep_at timestamptz,
  upset_win_count integer,
  first_upset_match_id uuid,
  first_upset_at timestamptz,
  first_upset_elo_delta integer,
  third_upset_match_id uuid,
  third_upset_at timestamptz,
  third_upset_elo_delta integer
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
    select distinct
      match.id,
      coalesce(
        match.official_result_decided_at,
        match.updated_at
      ) as completed_at,
      match.official_result_decided_at as streak_completed_at,
      match.series_best_of,
      match.player_one_registration_id,
      match.player_two_registration_id,
      match.player_one_score,
      match.player_two_score,
      match.winner_registration_id,
      exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id = match.winner_registration_id
      ) as won
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where public.is_tournament_match_played_for_leaderboard(match.id)
      and tournament.status not in ('cancelled', 'voided')
      and exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id = match.player_one_registration_id
          or player_registration.id = match.player_two_registration_id
      )
  ),
  ordered_played_matches as (
    select
      played_match.id,
      played_match.streak_completed_at as completed_at,
      played_match.won,
      sum(case when played_match.won then 0 else 1 end) over (
        order by played_match.streak_completed_at, played_match.id
        rows between unbounded preceding and current row
      ) as loss_group
    from played_matches as played_match
    where played_match.streak_completed_at is not null
  ),
  streak_wins as (
    select
      ordered_match.id,
      ordered_match.completed_at,
      count(*) over (
        partition by ordered_match.loss_group
        order by ordered_match.completed_at, ordered_match.id
        rows between unbounded preceding and current row
      )::integer as streak_length
    from ordered_played_matches as ordered_match
    where ordered_match.won
  ),
  ranked_clean_sweeps as (
    select
      played_match.id,
      played_match.completed_at,
      row_number() over (
        order by played_match.completed_at, played_match.id
      ) as clean_sweep_number
    from played_matches as played_match
    where played_match.won
      and played_match.series_best_of in (3, 5)
      and case
        when played_match.winner_registration_id =
          played_match.player_one_registration_id then
            played_match.player_one_score =
              ((played_match.series_best_of + 1) / 2)
            and played_match.player_two_score = 0
        when played_match.winner_registration_id =
          played_match.player_two_registration_id then
            played_match.player_two_score =
              ((played_match.series_best_of + 1) / 2)
            and played_match.player_one_score = 0
        else false
      end
  ),
  upset_wins as (
    select
      played_match.id,
      played_match.completed_at,
      (
        opponent_registration.elo_verified_elo -
        winner_registration.elo_verified_elo
      )::integer as elo_delta
    from played_matches as played_match
    join public.registrations as winner_registration
      on winner_registration.id = played_match.winner_registration_id
      and winner_registration.profile_id = p_player_id
    join public.registrations as opponent_registration
      on opponent_registration.id = case
        when played_match.winner_registration_id =
          played_match.player_one_registration_id then
            played_match.player_two_registration_id
        else played_match.player_one_registration_id
      end
    where played_match.won
      and winner_registration.elo_status = 'verified'
      and opponent_registration.elo_status = 'verified'
      and winner_registration.elo_verification_source = 'relic'
      and opponent_registration.elo_verification_source = 'relic'
      and winner_registration.elo_checked_mode = '1v1'
      and opponent_registration.elo_checked_mode = '1v1'
      and winner_registration.elo_verified_elo is not null
      and opponent_registration.elo_verified_elo is not null
      and winner_registration.elo_calculation_version is not null
      and opponent_registration.elo_calculation_version is not null
      and winner_registration.elo_calculation_version =
        opponent_registration.elo_calculation_version
      and (
        opponent_registration.elo_verified_elo -
        winner_registration.elo_verified_elo
      ) >= 200
  ),
  ranked_upsets as (
    select
      upset.id,
      upset.completed_at,
      upset.elo_delta,
      row_number() over (
        order by upset.completed_at, upset.id
      ) as upset_number
    from upset_wins as upset
  )
  select
    coalesce((select max(streak.streak_length) from streak_wins as streak), 0)
      as best_win_streak,
    (
      select streak.id
      from streak_wins as streak
      where streak.streak_length = 3
      order by streak.completed_at, streak.id
      limit 1
    ) as third_streak_match_id,
    (
      select streak.completed_at
      from streak_wins as streak
      where streak.streak_length = 3
      order by streak.completed_at, streak.id
      limit 1
    ) as third_streak_at,
    (
      select streak.id
      from streak_wins as streak
      where streak.streak_length = 5
      order by streak.completed_at, streak.id
      limit 1
    ) as fifth_streak_match_id,
    (
      select streak.completed_at
      from streak_wins as streak
      where streak.streak_length = 5
      order by streak.completed_at, streak.id
      limit 1
    ) as fifth_streak_at,
    coalesce(
      (select count(*)::integer from ranked_clean_sweeps),
      0
    ) as clean_sweep_count,
    (
      select clean_sweep.id
      from ranked_clean_sweeps as clean_sweep
      where clean_sweep.clean_sweep_number = 1
    ) as first_clean_sweep_match_id,
    (
      select clean_sweep.completed_at
      from ranked_clean_sweeps as clean_sweep
      where clean_sweep.clean_sweep_number = 1
    ) as first_clean_sweep_at,
    coalesce((select count(*)::integer from ranked_upsets), 0)
      as upset_win_count,
    (
      select upset.id
      from ranked_upsets as upset
      where upset.upset_number = 1
    ) as first_upset_match_id,
    (
      select upset.completed_at
      from ranked_upsets as upset
      where upset.upset_number = 1
    ) as first_upset_at,
    (
      select upset.elo_delta
      from ranked_upsets as upset
      where upset.upset_number = 1
    ) as first_upset_elo_delta,
    (
      select upset.id
      from ranked_upsets as upset
      where upset.upset_number = 3
    ) as third_upset_match_id,
    (
      select upset.completed_at
      from ranked_upsets as upset
      where upset.upset_number = 3
    ) as third_upset_at,
    (
      select upset.elo_delta
      from ranked_upsets as upset
      where upset.upset_number = 3
    ) as third_upset_elo_delta;
$$;

alter function public.get_player_badge_match_excellence_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_match_excellence_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_match_excellence_summary(uuid)
  to service_role;

comment on function public.get_player_badge_match_excellence_summary(uuid) is
  'Service-role-only helper summarizing played-match streak, clean sweep, and verified-ELO upset facts for badge evaluators.';

commit;
