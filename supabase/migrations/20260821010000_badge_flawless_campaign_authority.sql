begin;

create or replace function public.get_player_badge_flawless_campaign_summary(
  p_player_id uuid
)
returns table (
  tournament_id uuid,
  registration_id uuid,
  first_completed_at timestamptz,
  expected_path_segment_count integer,
  played_segment_count integer,
  automatic_bye_count integer,
  opponent_no_show_count integer,
  verified_game_count integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with
  champions as (
    select
      event.tournament_id,
      event.registration_id,
      min(tournament.first_completed_at) as first_completed_at
    from public.leaderboard_point_events as event
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    where event.player_id = p_player_id
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and event.bracket_type in ('academy', 'challenge', 'main')
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
    group by event.tournament_id, event.registration_id
  ),
  latest_summaries as (
    select distinct on (summary.tournament_id, summary.registration_id)
      summary.tournament_id,
      summary.registration_id,
      summary.expected_path_segment_count,
      summary.observed_path_segment_count,
      summary.completeness_state,
      summary.revision,
      summary.id
    from public.tournament_championship_path_summary_authority as summary
    order by summary.tournament_id, summary.registration_id,
      summary.revision desc, summary.id desc
  ),
  latest_paths as (
    select distinct on (path.tournament_id, path.registration_id, path.path_index)
      path.tournament_id,
      path.registration_id,
      path.path_index,
      path.expected_path_segment_count,
      path.source_match_id,
      path.outcome_kind,
      path.authority_state,
      path.revision,
      path.id
    from public.tournament_championship_path_authority as path
    order by path.tournament_id, path.registration_id, path.path_index,
      path.revision desc, path.id desc
  ),
  latest_participants as (
    select distinct on (authority.match_id, authority.registration_id)
      authority.match_id,
      authority.registration_id,
      authority.outcome_kind,
      authority.revision,
      authority.id
    from public.match_participant_outcome_authority as authority
    order by authority.match_id, authority.registration_id,
      authority.revision desc, authority.id desc
  ),
  aligned_paths as (
    select
      champion.tournament_id,
      champion.registration_id,
      champion.first_completed_at,
      summary.expected_path_segment_count,
      summary.observed_path_segment_count,
      summary.completeness_state,
      path.path_index,
      path.source_match_id,
      path.outcome_kind,
      path.authority_state,
      participant.outcome_kind as participant_outcome_kind,
      (
        participant.match_id is not null
        and participant.outcome_kind = path.outcome_kind
      ) as participant_authority_aligned
    from champions as champion
    join latest_summaries as summary
      on summary.tournament_id = champion.tournament_id
      and summary.registration_id = champion.registration_id
    join latest_paths as path
      on path.tournament_id = champion.tournament_id
      and path.registration_id = champion.registration_id
    left join latest_participants as participant
      on participant.match_id = path.source_match_id
      and participant.registration_id = path.registration_id
  ),
  path_stats as (
    select
      aligned.tournament_id,
      aligned.registration_id,
      min(aligned.first_completed_at) as first_completed_at,
      min(aligned.expected_path_segment_count) as expected_path_segment_count,
      min(aligned.observed_path_segment_count) as observed_path_segment_count,
      min(aligned.completeness_state) as completeness_state,
      count(*)::integer as observed_latest_segment_count,
      min(aligned.path_index) as first_path_index,
      max(aligned.path_index) as last_path_index,
      min(aligned.expected_path_segment_count) =
        max(aligned.expected_path_segment_count) as expected_length_consistent,
      bool_and(
        aligned.authority_state = 'active'
        and aligned.outcome_kind in (
          'played',
          'opponent_no_show',
          'automatic_bye'
        )
        and aligned.participant_authority_aligned
      ) as path_segments_valid,
      count(*) filter (where aligned.outcome_kind = 'played')::integer
        as played_segment_count,
      count(*) filter (where aligned.outcome_kind = 'automatic_bye')::integer
        as automatic_bye_count,
      count(*) filter (where aligned.outcome_kind = 'opponent_no_show')::integer
        as opponent_no_show_count
    from aligned_paths as aligned
    group by aligned.tournament_id, aligned.registration_id
  ),
  latest_active_games as (
    select distinct on (game.match_id, game.game_number)
      game.match_id,
      game.game_number,
      game.winner_registration_id,
      game.series_best_of,
      game.finalized_game_count,
      game.game_authority_complete,
      game.authority_state,
      game.revision,
      game.id
    from public.match_game_result_authority as game
    order by game.match_id, game.game_number,
      game.revision desc, game.id desc
  ),
  played_path_games as (
    select
      aligned.tournament_id,
      aligned.registration_id,
      aligned.source_match_id,
      game.game_number,
      game.winner_registration_id,
      game.series_best_of,
      game.finalized_game_count,
      game.game_authority_complete,
      game.authority_state
    from aligned_paths as aligned
    left join latest_active_games as game
      on game.match_id = aligned.source_match_id
    where aligned.outcome_kind = 'played'
  ),
  game_match_stats as (
    select
      games.tournament_id,
      games.registration_id,
      games.source_match_id,
      count(games.game_number)::integer as verified_game_count,
      min(games.game_number) as first_game_number,
      max(games.game_number) as last_game_number,
      min(games.finalized_game_count) as finalized_game_count,
      max(games.finalized_game_count) as max_finalized_game_count,
      min(games.series_best_of) as series_best_of,
      max(games.series_best_of) as max_series_best_of,
      bool_and(
        games.game_number is not null
        and games.authority_state = 'active'
        and games.game_authority_complete
        and games.winner_registration_id is not null
        and games.winner_registration_id = games.registration_id
      ) as games_are_clean,
      min(games.game_number) = 1
        and max(games.game_number) = max(games.finalized_game_count)
        and count(games.game_number) = max(games.finalized_game_count)
        and min(games.finalized_game_count) = max(games.finalized_game_count)
        and min(games.series_best_of) = max(games.series_best_of)
        and bool_and(games.game_authority_complete)
        as complete_contiguous_game_set
    from played_path_games as games
    group by games.tournament_id, games.registration_id, games.source_match_id
  ),
  campaign_game_stats as (
    select
      stats.tournament_id,
      stats.registration_id,
      coalesce(sum(stats.verified_game_count), 0)::integer
        as verified_game_count,
      bool_and(
        stats.complete_contiguous_game_set
        and stats.games_are_clean
        and stats.series_best_of in (3, 5)
      ) as all_played_matches_are_flawless
    from game_match_stats as stats
    group by stats.tournament_id, stats.registration_id
  )
  select
    stats.tournament_id,
    stats.registration_id,
    stats.first_completed_at,
    stats.expected_path_segment_count,
    stats.played_segment_count,
    stats.automatic_bye_count,
    stats.opponent_no_show_count,
    coalesce(games.verified_game_count, 0)::integer as verified_game_count
  from path_stats as stats
  left join campaign_game_stats as games
    on games.tournament_id = stats.tournament_id
    and games.registration_id = stats.registration_id
  where stats.completeness_state = 'complete'
    and stats.expected_path_segment_count is not null
    and stats.expected_path_segment_count > 0
    and stats.observed_latest_segment_count = stats.expected_path_segment_count
    and stats.observed_path_segment_count = stats.expected_path_segment_count
    and stats.first_path_index = 1
    and stats.last_path_index = stats.expected_path_segment_count
    and stats.expected_length_consistent
    and stats.path_segments_valid
    and coalesce(
      games.all_played_matches_are_flawless,
      stats.played_segment_count = 0
    )
  order by stats.first_completed_at, stats.tournament_id;
$$;

alter function public.get_player_badge_flawless_campaign_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_flawless_campaign_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_flawless_campaign_summary(uuid)
  to service_role;

comment on function public.get_player_badge_flawless_campaign_summary(uuid) is
  'Service-role-only Badge 20 evidence from authoritative champion, path, participant, and finalized game facts.';

commit;
