begin;

create function public.get_player_badge_comeback_commander_summary(
  p_player_id uuid
)
returns table (
  match_id uuid,
  game1_winner_registration_id uuid,
  series_winner_registration_id uuid,
  series_best_of integer,
  finalized_game_count integer,
  finalized_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with
  player_registrations as (
    select registration.id
    from public.registrations as registration
    where registration.profile_id = p_player_id
  ),
  latest_participant_authority as (
    select distinct on (authority.match_id, authority.registration_id)
      authority.match_id,
      authority.registration_id,
      authority.outcome_kind,
      authority.finalized_at
    from public.match_participant_outcome_authority as authority
    join player_registrations as player_registration
      on player_registration.id = authority.registration_id
    order by
      authority.match_id,
      authority.registration_id,
      authority.revision desc,
      authority.id desc
  ),
  latest_active_games as (
    select distinct on (authority.match_id, authority.game_number)
      authority.match_id,
      authority.game_number,
      authority.winner_registration_id,
      authority.series_best_of,
      authority.finalized_game_count,
      authority.game_authority_complete,
      authority.authority_state,
      authority.revision,
      authority.id
    from public.match_game_result_authority as authority
    order by
      authority.match_id,
      authority.game_number,
      authority.revision desc,
      authority.id desc
  ),
  complete_game_series as (
    select
      game.match_id,
      min(game.series_best_of)::integer as series_best_of,
      min(game.finalized_game_count)::integer as finalized_game_count,
      count(*)::integer as archived_game_count,
      min(game.game_number)::integer as first_game_number,
      max(game.game_number)::integer as last_game_number,
      bool_and(game.game_authority_complete) as game_authority_complete,
      min(game.finalized_game_count) = max(game.finalized_game_count)
        as consistent_finalized_game_count,
      min(game.series_best_of) = max(game.series_best_of)
        as consistent_series_format,
      max(game.authority_state) filter (where game.game_number = 1)
        as game1_authority_state,
      (
        array_agg(
          game.winner_registration_id
          order by game.revision desc, game.id desc
        ) filter (where game.game_number = 1)
      )[1] as game1_winner_registration_id
    from latest_active_games as game
    where game.authority_state = 'active'
    group by game.match_id
  )
  select
    tournament_match.id as match_id,
    series.game1_winner_registration_id,
    tournament_match.winner_registration_id as series_winner_registration_id,
    series.series_best_of,
    series.finalized_game_count,
    tournament_match.official_result_decided_at as finalized_at
  from latest_participant_authority as participant
  join player_registrations as player_registration
    on player_registration.id = participant.registration_id
  join public.tournament_matches as tournament_match
    on tournament_match.id = participant.match_id
  join public.generated_brackets as generated
    on generated.id = tournament_match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  join complete_game_series as series
    on series.match_id = tournament_match.id
  where participant.outcome_kind = 'played'
    and tournament.status not in ('cancelled', 'voided')
    and tournament_match.official_result_decided_at is not null
    and tournament_match.winner_registration_id = player_registration.id
    and tournament_match.outcome_type is null
    and public.is_tournament_match_played_for_leaderboard(
      tournament_match.id
    )
    and series.game_authority_complete
    and series.consistent_finalized_game_count
    and series.consistent_series_format
    and series.archived_game_count = series.finalized_game_count
    and series.first_game_number = 1
    and series.last_game_number = series.finalized_game_count
    and series.finalized_game_count > 0
    and series.game1_authority_state = 'active'
    and series.game1_winner_registration_id is not null
    and series.game1_winner_registration_id <> player_registration.id
  order by tournament_match.official_result_decided_at, tournament_match.id;
$$;

alter function public.get_player_badge_comeback_commander_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_comeback_commander_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_comeback_commander_summary(uuid)
  to service_role;

comment on function public.get_player_badge_comeback_commander_summary(uuid) is
  'Service-role-only summary of complete active durable game authority where the player lost Game 1 and won the finalized official series.';

commit;
