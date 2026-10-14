-- Production forward reconciliation from verified base 0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1.
-- Approved feature semantics inspected at 17979c40c7e9bee154dbc9c9a98bcbb9b36152cb.
-- Versioned accounting/badge authority; never rewrite legacy ledger families or fabricate/finalize a partial season.
-- No application rows, fixture identities, legal authority or provider settings are imported.
-- Transactional migration: replay only through a version/checksum-aware migration runner.

begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

alter table public.leaderboard_point_events drop constraint leaderboard_point_events_bracket_type_check;
alter table public.leaderboard_point_events add constraint leaderboard_point_events_bracket_type_check check(bracket_type in ('academy','challenge','main','main_progression','pro','overall'));

alter table public.leaderboard_player_season_stats drop constraint leaderboard_player_season_stats_bracket_type_check;
alter table public.leaderboard_player_season_stats add constraint leaderboard_player_season_stats_bracket_type_check check(bracket_type in ('academy','challenge','main','main_progression','pro','overall'));

alter table public.leaderboard_player_all_time_stats drop constraint leaderboard_player_all_time_stats_bracket_type_check;
alter table public.leaderboard_player_all_time_stats add constraint leaderboard_player_all_time_stats_bracket_type_check check(bracket_type in ('academy','challenge','main','main_progression','pro','overall'));

alter table public.leaderboard_season_champions drop constraint leaderboard_season_champions_bracket_type_check;
alter table public.leaderboard_season_champions add constraint leaderboard_season_champions_bracket_type_check check(bracket_type in ('academy','challenge','main','main_progression','pro','overall'));

CREATE OR REPLACE FUNCTION ironclad_private.calculate_leaderboard_division_point_events(p_tournament_bracket_id uuid)
 RETURNS TABLE(point_event_tournament_bracket_id uuid, registration_id uuid, player_id uuid, bracket_type text, points integer, event_type text, description text, source_match_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with target as (
    select
      tournament.id as tournament_id,
      bracket.id as tournament_bracket_id,
      bracket.name as bracket_name,
      ironclad_private.division_accounting_type(tournament.division_model_version,bracket.name) as bracket_type,
      generated.id as generated_bracket_id,
      generated.format,
      case when bracket.name in ('Main','Pro') then 5 else 2 end
        as round_passed_points,
      case when bracket.name in ('Main','Pro') then 5 else 3 end
        as tournament_win_points
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.id = p_tournament_bracket_id
      and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
  ),
  completed_participants as (
    select distinct
      target.tournament_id,
      target.tournament_bracket_id,
      target.bracket_type,
      participant.registration_id,
      registration.profile_id as player_id
    from target
    join public.tournament_matches as match
      on match.generated_bracket_id = target.generated_bracket_id
      and match.status = 'completed'
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
  ),
  result_participants as (
    select distinct
      target.tournament_id,
      target.tournament_bracket_id,
      target.bracket_type,
      participant.registration_id,
      registration.profile_id as player_id
    from target
    join public.tournament_matches as match
      on match.generated_bracket_id = target.generated_bracket_id
      and match.status = 'completed'
      and match.outcome_type is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and match.player_one_score is not null
      and match.player_two_score is not null
      and match.winner_registration_id is not null
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
  ),
  participation_events as (
    select
      participant.tournament_bracket_id
        as point_event_tournament_bracket_id,
      participant.registration_id,
      participant.player_id,
      participant.bracket_type,
      10 as points,
      'participation'::text as event_type,
      'Participation points for completed match participation'::text
        as description,
      null::uuid as source_match_id
    from result_participants as participant
    where not public.is_registration_confirmed_no_show_for_leaderboard(
      participant.tournament_id,
      participant.tournament_bracket_id,
      participant.registration_id
    )
  ),
  withheld_events as (
    select
      null::uuid as point_event_tournament_bracket_id,
      participant.registration_id,
      participant.player_id,
      participant.bracket_type,
      0 as points,
      'participation_withheld'::text as event_type,
      'Participation points withheld due to confirmed no-show'::text
        as description,
      null::uuid as source_match_id
    from completed_participants as participant
    where public.is_registration_confirmed_no_show_for_leaderboard(
      participant.tournament_id,
      participant.tournament_bracket_id,
      participant.registration_id
    )
  ),
  single_elimination_final_rounds as (
    select
      target.generated_bracket_id,
      max(round.round_number) as final_round_number
    from target
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
    where target.format = 'single_elimination'
    group by target.generated_bracket_id
  ),
  progression_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.round_passed_points as points,
      'round_passed'::text as event_type,
      'Round passed points for non-final single-elimination match win'::text
        as description,
      match.id as source_match_id
    from target
    join single_elimination_final_rounds as final_round
      on final_round.generated_bracket_id = target.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
      and round.round_number < final_round.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
  ),
  single_elimination_win_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.tournament_win_points as points,
      'tournament_win'::text as event_type,
      'Tournament winner bonus for final single-elimination match win'::text
        as description,
      match.id as source_match_id
    from target
    join single_elimination_final_rounds as final_round
      on final_round.generated_bracket_id = target.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
      and round.round_number = final_round.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
  ),
  round_robin_rank_one as (
    select
      standing.generated_bracket_id,
      count(*)::integer as rank_one_count,
      (
        select selected.registration_id
        from public.tournament_standings as selected
        where selected.generated_bracket_id = standing.generated_bracket_id
          and selected.rank = 1
        order by selected.registration_id::text
        limit 1
      ) as winner_registration_id
    from public.tournament_standings as standing
    join target
      on target.generated_bracket_id = standing.generated_bracket_id
      and target.format = 'round_robin'
    where standing.rank = 1
    group by standing.generated_bracket_id
  ),
  round_robin_win_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.tournament_win_points as points,
      'tournament_win'::text as event_type,
      'Tournament winner bonus for completed round-robin rank 1'::text
        as description,
      null::uuid as source_match_id
    from target
    join round_robin_rank_one as rank_one
      on rank_one.generated_bracket_id = target.generated_bracket_id
      and rank_one.rank_one_count = 1
    join public.registrations as registration
      on registration.id = rank_one.winner_registration_id
      and registration.profile_id is not null
  ),
  lower_division_history as (
    select
      bracket.id as tournament_bracket_id,
      tournament.id as tournament_id,
      bracket.name as bracket_name,
      case bracket.name
        when 'Academy' then 'academy'
        when 'Challenge' then 'challenge'
      end as bracket_type,
      coalesce(
        settlement.settled_at,
        tournament.first_completed_at,
        (
          select max(match.updated_at)
          from public.tournament_matches as match
          where match.generated_bracket_id = generated.id
        ),
        bracket.launched_at
      ) as completed_at
    from target
    join public.tournament_brackets as bracket
      on bracket.name = target.bracket_name
      and bracket.name in ('Academy', 'Challenge')
      and bracket.launched_at is not null
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
      and public.is_generated_bracket_complete(generated.id)
    left join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = bracket.id
    left join public.leaderboard_tournament_season_memberships as membership
      on membership.tournament_id = tournament.id
      and membership.voided_at is null
    where bracket.id = target.tournament_bracket_id
      or settlement.tournament_bracket_id is not null
      or (
        tournament.status = 'completed'
        and tournament.first_completed_at is not null
        and membership.tournament_id is not null
      )
  ),
  valid_lower_division_candidates as (
    select
      history.*,
      registration.id as registration_id,
      registration.profile_id as player_id
    from lower_division_history as history
    join public.registrations as registration
      on registration.tournament_id = history.tournament_id
      and registration.tournament_bracket_id = history.tournament_bracket_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
    where public.is_valid_late_entry_participation(
      history.tournament_id,
      history.tournament_bracket_id,
      registration.id
    )
  ),
  anchored_lower_division_candidates as (
    select
      candidate.*,
      anchor.completed_at as anchor_completed_at,
      anchor.tournament_id as anchor_tournament_id,
      anchor.tournament_bracket_id as anchor_tournament_bracket_id,
      (
        select count(distinct prior.tournament_id)::integer
        from lower_division_history as prior
        where prior.bracket_name = candidate.bracket_name
          and (
            prior.completed_at,
            prior.tournament_id,
            prior.tournament_bracket_id
          ) < (
            anchor.completed_at,
            anchor.tournament_id,
            anchor.tournament_bracket_id
          )
      ) as missed_event_count
    from valid_lower_division_candidates as candidate
    join lateral (
      select
        anchor_history.completed_at,
        anchor_history.tournament_id,
        anchor_history.tournament_bracket_id
      from lower_division_history as anchor_history
      join public.registrations as anchor_registration
        on anchor_registration.tournament_id = anchor_history.tournament_id
        and anchor_registration.tournament_bracket_id =
          anchor_history.tournament_bracket_id
        and anchor_registration.registration_status = 'approved'
        and anchor_registration.profile_id = candidate.player_id
      where anchor_history.bracket_name = candidate.bracket_name
      order by
        anchor_history.completed_at,
        anchor_history.tournament_id,
        anchor_history.tournament_bracket_id
      limit 1
    ) as anchor on true
  ),
  awardable_late_entry_candidates as (
    select candidate.*
    from anchored_lower_division_candidates as candidate
    where candidate.missed_event_count > 0
      and not exists (
        select 1
        from lower_division_history as earlier_history
        join public.registrations as earlier_registration
          on earlier_registration.tournament_id =
            earlier_history.tournament_id
          and earlier_registration.tournament_bracket_id =
            earlier_history.tournament_bracket_id
          and earlier_registration.registration_status = 'approved'
          and earlier_registration.profile_id = candidate.player_id
        where earlier_history.bracket_name = candidate.bracket_name
          and (
            earlier_history.completed_at,
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id
          ) >= (
            candidate.anchor_completed_at,
            candidate.anchor_tournament_id,
            candidate.anchor_tournament_bracket_id
          )
          and (
            earlier_history.completed_at,
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id
          ) < (
            candidate.completed_at,
            candidate.tournament_id,
            candidate.tournament_bracket_id
          )
          and public.is_valid_late_entry_participation(
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id,
            earlier_registration.id
          )
      )
  ),
  late_entry_bonus_events as (
    select
      candidate.tournament_bracket_id
        as point_event_tournament_bracket_id,
      candidate.registration_id,
      candidate.player_id,
      candidate.bracket_type,
      least(candidate.missed_event_count, 5) * 5 as points,
      'missing_tournament_bonus'::text as event_type,
      'One-time Career late-entry catch-up'::text as description,
      null::uuid as source_match_id
    from awardable_late_entry_candidates as candidate
    where candidate.tournament_bracket_id = p_tournament_bracket_id
  )
  select * from participation_events
  union all
  select * from withheld_events
  union all
  select * from progression_events
  union all
  select * from single_elimination_win_events
  union all
  select * from round_robin_win_events
  union all
  select * from late_entry_bonus_events;
$function$;

alter function ironclad_private.calculate_leaderboard_division_point_events(p_tournament_bracket_id uuid) owner to postgres;
revoke all on function ironclad_private.calculate_leaderboard_division_point_events(p_tournament_bracket_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_leaderboard_division_shadow(p_tournament_bracket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_bracket_name text;
  v_bracket_type text;
  v_launched_at timestamptz;
  v_generated_bracket_id uuid;
  v_generated_count integer;
  v_result jsonb;
begin
  if p_tournament_bracket_id is null then
    raise exception 'Tournament Division is required';
  end if;

  select
    tournament.id,
    tournament.status,
    bracket.name,
    ironclad_private.division_accounting_type(tournament.division_model_version,bracket.name),
    bracket.launched_at,
    count(generated.id)::integer,
    min(generated.id::text)::uuid
  into
    v_tournament_id,
    v_tournament_status,
    v_bracket_name,
    v_bracket_type,
    v_launched_at,
    v_generated_count,
    v_generated_bracket_id
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  left join public.generated_brackets as generated
    on generated.tournament_bracket_id = bracket.id
  where bracket.id = p_tournament_bracket_id
    and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
  group by
    tournament.id,
    tournament.status,
    bracket.name,
    bracket.launched_at;

  if not found then
    raise exception 'Tournament Division not found';
  end if;
  if v_tournament_status in ('cancelled', 'voided') then
    raise exception 'A terminal Event Division cannot be shadow settled'
      using errcode = '55000';
  end if;
  if v_launched_at is null then
    raise exception 'Tournament Division must be launched before shadow settlement'
      using errcode = '55000';
  end if;
  if v_generated_count <> 1 or v_generated_bracket_id is null then
    raise exception 'Tournament Division requires exactly one generated bracket'
      using errcode = '55000';
  end if;
  if public.is_generated_bracket_complete(v_generated_bracket_id)
    is distinct from true then
    raise exception 'Tournament Division must be complete before shadow settlement'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_report_groups as report_group
      on report_group.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and report_group.finalized_at is null
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
  ) or exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_submissions as submission
      on submission.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and submission.status = 'pending'
  ) then
    raise exception 'Tournament Division has unresolved result authority'
      using errcode = '55000';
  end if;

  with shadow_events as materialized (
    select *
    from ironclad_private.calculate_leaderboard_division_point_events(
      p_tournament_bracket_id
    )
  ),
  approved_targets as (
    select distinct
      registration.id as registration_id,
      registration.profile_id as player_id
    from public.registrations as registration
    where registration.tournament_id = v_tournament_id
      and registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
  ),
  real_matches as (
    select distinct
      participant.registration_id,
      registration.profile_id as player_id,
      match.id as match_id,
      match.winner_registration_id
    from public.tournament_matches as match
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
    where match.generated_bracket_id = v_generated_bracket_id
      and public.is_tournament_match_played_for_leaderboard(match.id)
  ),
  player_scope as (
    select event.registration_id, event.player_id from shadow_events as event
    union
    select target.registration_id, target.player_id from approved_targets as target
    union
    select match.registration_id, match.player_id from real_matches as match
  ),
  event_effects as (
    select
      event.registration_id,
      event.player_id,
      coalesce(sum(event.points), 0)::integer as points,
      count(*) filter (
        where event.event_type = 'participation'
      )::integer as competitions_played,
      count(*) filter (
        where event.event_type = 'round_passed'
      )::integer as rounds_passed,
      count(*) filter (
        where event.event_type = 'tournament_win'
      )::integer as division_wins,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'eventType', event.event_type,
            'points', event.points,
            'description', event.description,
            'pointEventTournamentBracketId',
              event.point_event_tournament_bracket_id,
            'sourceMatchId', event.source_match_id
          )
          order by
            event.event_type,
            event.source_match_id,
            event.points,
            event.registration_id
        ) filter (where event.event_type is not null),
        '[]'::jsonb
      ) as point_events
    from shadow_events as event
    group by event.registration_id, event.player_id
  ),
  real_match_effects as (
    select
      real_match.registration_id,
      real_match.player_id,
      count(distinct real_match.match_id)::integer as real_matches,
      count(distinct real_match.match_id) filter (
        where real_match.winner_registration_id = real_match.registration_id
      )::integer as real_match_wins
    from real_matches as real_match
    group by real_match.registration_id, real_match.player_id
  ),
  player_effects as (
    select
      player.registration_id,
      player.player_id,
      coalesce(event.points, 0)::integer as points,
      coalesce(event.competitions_played, 0)::integer as competitions_played,
      coalesce(event.rounds_passed, 0)::integer as rounds_passed,
      coalesce(event.division_wins, 0)::integer as division_wins,
      coalesce(real_match.real_matches, 0)::integer as real_matches,
      coalesce(real_match.real_match_wins, 0)::integer as real_match_wins,
      coalesce(event.point_events, '[]'::jsonb) as point_events,
      target.player_id is not null as badge_evaluation_target
    from player_scope as player
    left join event_effects as event
      on event.registration_id = player.registration_id
      and event.player_id = player.player_id
    left join real_match_effects as real_match
      on real_match.registration_id = player.registration_id
      and real_match.player_id = player.player_id
    left join approved_targets as target
      on target.registration_id = player.registration_id
      and target.player_id = player.player_id
  ),
  shadow_event_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from shadow_events as event
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  authoritative_event_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from public.leaderboard_point_events as event
    left join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    where event.tournament_id = v_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type <> 'admin_adjustment'
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) = p_tournament_bracket_id
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  parity_difference as (
    select 1
    from shadow_event_counts as shadow
    full join authoritative_event_counts as authoritative
      on authoritative.registration_id = shadow.registration_id
      and authoritative.player_id = shadow.player_id
      and authoritative.bracket_type = shadow.bracket_type
      and authoritative.points = shadow.points
      and authoritative.event_type = shadow.event_type
    where shadow.event_count is distinct from authoritative.event_count
    limit 1
  ),
  calculation as (
    select md5(
      coalesce(
        string_agg(
          concat_ws(
            '|',
            event.registration_id::text,
            event.player_id::text,
            event.bracket_type,
            event.event_type,
            event.points::text,
            coalesce(event.source_match_id::text, '')
          ),
          E'\n'
          order by
            event.registration_id,
            event.player_id,
            event.event_type,
            event.source_match_id,
            event.points
        ),
        ''
      )
    ) as checksum,
    count(*)::integer as event_count,
    coalesce(sum(event.points), 0)::integer as points
    from shadow_events as event
  ),
  authoritative_totals as (
    select
      coalesce(sum(event_count), 0)::integer as event_count,
      coalesce(sum(points * event_count), 0)::integer as points
    from authoritative_event_counts
  ),
  membership as (
    select
      current_membership.season_id,
      current_membership.qualifying_event_number,
      current_membership.voided_at
    from public.leaderboard_tournament_season_memberships
      as current_membership
    where current_membership.tournament_id = v_tournament_id
  )
  select jsonb_build_object(
    'calculationVersion', 1,
    'calculationChecksum', calculation.checksum,
    'tournamentId', v_tournament_id,
    'tournamentBracketId', p_tournament_bracket_id,
    'generatedBracketId', v_generated_bracket_id,
    'division', v_bracket_name,
    'bracketType', v_bracket_type,
    'pointEvents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'registrationId', event.registration_id,
            'playerId', event.player_id,
            'bracketType', event.bracket_type,
            'points', event.points,
            'eventType', event.event_type,
            'description', event.description,
            'pointEventTournamentBracketId',
              event.point_event_tournament_bracket_id,
            'sourceMatchId', event.source_match_id
          )
          order by
            event.registration_id,
            event.event_type,
            event.source_match_id,
            event.points
        )
        from shadow_events as event
      ),
      '[]'::jsonb
    ),
    'playerEffects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'registrationId', effect.registration_id,
            'playerId', effect.player_id,
            'points', effect.points,
            'competitionsPlayed', effect.competitions_played,
            'roundsPassed', effect.rounds_passed,
            'divisionWins', effect.division_wins,
            'realMatches', effect.real_matches,
            'realMatchWins', effect.real_match_wins,
            'allTimeEffect', jsonb_build_object(
              'points', effect.points,
              'competitionsPlayed', effect.competitions_played,
              'roundsPassed', effect.rounds_passed,
              'divisionWins', effect.division_wins,
              'realMatches', effect.real_matches,
              'realMatchWins', effect.real_match_wins
            ),
            'mainSeasonEffect', jsonb_build_object(
              'points', case
                when v_bracket_type in ('main','pro') then effect.points
                else 0
              end,
              'competitionsPlayed', case
                when v_bracket_type in ('main','pro')
                  then effect.competitions_played
                else 0
              end
            ),
            'badgeEvaluationTarget', effect.badge_evaluation_target,
            'pointEvents', effect.point_events
          )
          order by effect.registration_id, effect.player_id
        )
        from player_effects as effect
      ),
      '[]'::jsonb
    ),
    'badgeEvaluationTargets', coalesce(
      (
        select jsonb_agg(target.player_id order by target.player_id)
        from approved_targets as target
      ),
      '[]'::jsonb
    ),
    'mainSeasonEffect', jsonb_build_object(
      'qualifyingCompetitionDelta', case
        when v_bracket_type in ('main','pro') then 1
        else 0
      end,
      'existingSeasonId', membership.season_id,
      'existingQualifyingEventNumber',
        membership.qualifying_event_number,
      'requiresSeasonAssignment', membership.season_id is null
    ),
    'comparison', jsonb_build_object(
      'eligible',
        v_tournament_status = 'completed'
        and membership.season_id is not null
        and membership.voided_at is null,
      'pointEventsMatch', case
        when v_tournament_status = 'completed'
          and membership.season_id is not null
          and membership.voided_at is null
          then not exists (select 1 from parity_difference)
        else null
      end,
      'shadowEventCount', calculation.event_count,
      'authoritativeEventCount', authoritative_totals.event_count,
      'shadowPoints', calculation.points,
      'authoritativePoints', authoritative_totals.points
    )
  )
  into v_result
  from calculation
  cross join authoritative_totals
  left join membership on true;

  return v_result;
end;
$function$;

alter function public.get_leaderboard_division_shadow(p_tournament_bracket_id uuid) owner to postgres;
revoke all on function public.get_leaderboard_division_shadow(p_tournament_bracket_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_leaderboard_division_shadow(p_tournament_bracket_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_leaderboard_season(p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_context_tournament_text text;
  v_context_tournament_id uuid;
  v_date date := coalesce(p_date, current_date);
  v_year integer;
  v_season_number integer;
  v_season_id uuid;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  v_context_tournament_text := nullif(
    pg_catalog.btrim(
      pg_catalog.current_setting(
        'ironclad.leaderboard_tournament_id',
        true
      )
    ),
    ''
  );

  if v_context_tournament_text is not null then
    begin
      v_context_tournament_id := v_context_tournament_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid internal leaderboard tournament context'
          using errcode = '22023';
    end;

    select membership.season_id
    into v_season_id
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = v_context_tournament_id
      and membership.voided_at is null;

    if v_season_id is not null then
      return v_season_id;
    end if;

    raise exception 'Valid leaderboard tournament membership was not assigned'
      using errcode = '55000';
  end if;

  select season.id
  into v_season_id
  from public.leaderboard_seasons as season
  where season.finalized_at is null
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = season.id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) < 6
  order by season.created_at, season.id
  limit 1;

  if v_season_id is not null then
    return v_season_id;
  end if;

  v_year := extract(year from v_date)::integer;

  select coalesce(max(season.season_number), 0) + 1
  into v_season_number
  from public.leaderboard_seasons as season
  where season.year = v_year;

  insert into public.leaderboard_seasons (
    name,
    year,
    season_number,
    start_date,
    end_date,
    is_active,official_bracket_type
  )
  values (
    v_year::text || ' Pro Season ' || v_season_number::text,
    v_year,
    v_season_number,
    v_date,
    v_date,
    true,'pro'
  )
  returning id into v_season_id;

  return v_season_id;
end;
$function$;

alter function public.get_or_create_leaderboard_season(p_date date) owner to postgres;
revoke all on function public.get_or_create_leaderboard_season(p_date date) from public, anon, authenticated, service_role;

grant execute on function public.get_or_create_leaderboard_season(p_date date) to service_role;

create function ironclad_private.resolve_competition_leaderboard_season(p_model text,p_date date,p_official boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid; v_authority text:=case when p_model='legacy_three_v1' then 'main' when p_model='four_division_v1' then 'pro' end;
begin
 perform public.leaderboard_require_write_access();
 perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));
 if v_authority is null then raise exception 'Unknown competition model'; end if;
 select id into v_id from public.leaderboard_seasons where official_bracket_type=v_authority and finalized_at is null and is_active order by created_at,id limit 1 for update;
 if v_id is null and not p_official and p_model='legacy_three_v1' then
   select id into v_id from public.leaderboard_seasons where official_bracket_type='main' order by created_at desc,id desc limit 1;
 end if;
 if v_id is null then
   v_id:=public.get_or_create_leaderboard_season(p_date);
   if not exists(select 1 from public.leaderboard_seasons where id=v_id and official_bracket_type=v_authority and finalized_at is null) then
     raise exception 'Official season authority transition is not complete' using errcode='55000';
   end if;
 end if;
 return v_id;
end; $$;
revoke all on function ironclad_private.resolve_competition_leaderboard_season(text,date,boolean) from public,anon,authenticated,service_role;
create function ironclad_private.guard_leaderboard_membership_authority()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.qualifying_event_number is not null and new.voided_at is null and not exists(
   select 1 from public.tournaments t join public.leaderboard_seasons s on s.id=new.season_id
   where t.id=new.tournament_id and s.official_bracket_type=case when t.division_model_version='legacy_three_v1' then 'main' else 'pro' end
 ) then raise exception 'Qualifying event and season authority do not match' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function ironclad_private.guard_leaderboard_membership_authority() from public,anon,authenticated,service_role;
create trigger leaderboard_membership_authority before insert or update of season_id,tournament_id,qualifying_event_number,voided_at on public.leaderboard_tournament_season_memberships for each row execute function ironclad_private.guard_leaderboard_membership_authority();

CREATE OR REPLACE FUNCTION public.settle_leaderboard_division(p_tournament_bracket_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_bracket_name text;
  v_bracket_type text;
  v_model text;
  v_launched_at timestamptz;
  v_generated_bracket_id uuid;
  v_generated_count integer;
  v_effective_completed_at timestamptz;
  v_calculation_checksum text;
  v_existing_settlement public.leaderboard_division_settlements%rowtype;
  v_existing_event_season_count integer;
  v_existing_event_season_id uuid;
  v_season_id uuid;
  v_event_number smallint;
  v_events_match boolean;
  v_events_changed boolean := false;
  v_bonus_match boolean;
  v_bonus_changed boolean := false;
  v_receipt_created boolean := false;
  v_receipt_changed boolean := false;
  v_run_id uuid;
  v_run_status text;
  v_run_notes text;
  v_affected_season record;
  v_badge_player_id uuid;
  v_finalized boolean := false;
begin
  -- Direct calls stay behind the existing service-role write gate. The
  -- deferred match trigger is itself ungranted and security-definer-owned, so
  -- it may enter the same writer after an ordinary player's authoritative
  -- result transaction completes.
  if pg_catalog.pg_trigger_depth() = 0 then
    perform public.leaderboard_require_write_access();
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:division:'
        || coalesce(p_tournament_bracket_id::text, 'null'),
      0
    )
  );

  if p_tournament_bracket_id is null then
    raise exception 'Tournament Division is required';
  end if;

  select
    tournament.id,
    tournament.status,
    bracket.name,
    ironclad_private.division_accounting_type(tournament.division_model_version,bracket.name),
    bracket.launched_at,tournament.division_model_version
  into
    v_tournament_id,
    v_tournament_status,
    v_bracket_name,
    v_bracket_type,
    v_launched_at,v_model
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
  for update of tournament, bracket;

  if not found then
    raise exception 'Tournament Division not found';
  end if;
  if v_tournament_status in ('cancelled', 'voided') then
    raise exception 'A terminal Event Division cannot be settled'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.tournament_division_not_held_closures as closure
    where closure.tournament_bracket_id = p_tournament_bracket_id
  ) then
    raise exception 'A Not Held Division cannot be settled as competition'
      using errcode = '55000';
  end if;
  if v_launched_at is null then
    raise exception 'Tournament Division must be launched before settlement'
      using errcode = '55000';
  end if;

  select
    count(generated.id)::integer,
    min(generated.id::text)::uuid
  into v_generated_count, v_generated_bracket_id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id;

  if v_generated_count <> 1 or v_generated_bracket_id is null then
    raise exception 'Tournament Division requires exactly one generated bracket'
      using errcode = '55000';
  end if;

  perform 1
  from public.generated_brackets as generated
  where generated.id = v_generated_bracket_id
  for update;

  perform 1
  from public.tournament_matches as match
  where match.generated_bracket_id = v_generated_bracket_id
  order by match.id
  for update;

  if public.is_generated_bracket_complete(v_generated_bracket_id)
    is distinct from true then
    raise exception 'Tournament Division must be complete before settlement'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_report_groups as report_group
      on report_group.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and report_group.finalized_at is null
      and report_group.status in (
        'pending_confirmation', 'disputed', 'under_review'
      )
  ) or exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_submissions as submission
      on submission.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and submission.status = 'pending'
  ) then
    raise exception 'Tournament Division has unresolved result authority'
      using errcode = '55000';
  end if;

  select coalesce(
    tournament.first_completed_at,
    (
      select max(match.updated_at)
      from public.tournament_matches as match
      where match.generated_bracket_id = v_generated_bracket_id
    ),
    v_launched_at,
    clock_timestamp()
  )
  into v_effective_completed_at
  from public.tournaments as tournament
  where tournament.id = v_tournament_id;

  drop table if exists pg_temp.leaderboard_expected_division_events;
  create temporary table leaderboard_expected_division_events
  on commit drop
  as
  select *
  from ironclad_private.calculate_leaderboard_division_point_events(
    p_tournament_bracket_id
  );

  select md5(
    coalesce(
      string_agg(
        concat_ws(
          '|',
          event.registration_id::text,
          event.player_id::text,
          event.bracket_type,
          event.event_type,
          event.points::text,
          coalesce(event.source_match_id::text, '')
        ),
        E'\n'
        order by
          event.registration_id,
          event.player_id,
          event.event_type,
          event.source_match_id,
          event.points
      ),
      ''
    )
  )
  into v_calculation_checksum
  from pg_temp.leaderboard_expected_division_events as event;

  select settlement.*
  into v_existing_settlement
  from public.leaderboard_division_settlements as settlement
  where settlement.tournament_bracket_id = p_tournament_bracket_id
  for update;

  select
    count(distinct event.season_id)::integer,
    min(event.season_id::text)::uuid
  into v_existing_event_season_count, v_existing_event_season_id
  from public.leaderboard_point_events as event
  left join public.registrations as registration
    on registration.id = event.registration_id
    and registration.profile_id = event.player_id
  where event.tournament_id = v_tournament_id
    and event.source in ('system', 'recalculation')
    and event.event_type <> 'admin_adjustment'
    and coalesce(
      event.tournament_bracket_id,
      registration.tournament_bracket_id
    ) = p_tournament_bracket_id;

  if v_existing_event_season_count > 1 then
    raise exception 'Division point events span multiple leaderboard seasons'
      using errcode = '55000';
  end if;

  if v_existing_settlement.tournament_bracket_id is not null then
    v_season_id := v_existing_settlement.season_id;
    if v_existing_event_season_id is not null
      and v_existing_event_season_id <> v_season_id then
      raise exception 'Division settlement season conflicts with point history'
        using errcode = '55000';
    end if;
  elsif v_existing_event_season_id is not null then
    -- Exact historical event-level scoring is adopted in place. Point IDs and
    -- original source metadata remain untouched.
    v_season_id := v_existing_event_season_id;
  elsif v_bracket_type in ('main','pro') then
    select membership.season_id, membership.qualifying_event_number
    into v_season_id, v_event_number
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = v_tournament_id
      and membership.voided_at is null
    for update;

    if v_season_id is null or v_event_number is null then
      v_season_id:=ironclad_private.resolve_competition_leaderboard_season(v_model,v_effective_completed_at::date,true);

      select slot.event_number::smallint
      into v_event_number
      from generate_series(1, 6) as slot(event_number)
      where not exists (
        select 1
        from public.leaderboard_tournament_season_memberships as membership
        where membership.season_id = v_season_id
          and membership.qualifying_event_number = slot.event_number
          and membership.voided_at is null
      )
      order by slot.event_number
      limit 1;

      if v_event_number is null then
        raise exception 'Main/Pro leaderboard season already contains six valid events'
          using errcode = '55000';
      end if;

      insert into public.leaderboard_tournament_season_memberships (
        tournament_id,
        season_id,
        qualifying_event_number
      )
      values (v_tournament_id, v_season_id, v_event_number)
      on conflict (tournament_id) do update
      set
        season_id = excluded.season_id,
        qualifying_event_number = excluded.qualifying_event_number,
        assigned_at = clock_timestamp(),
        scored_at = null
      where public.leaderboard_tournament_season_memberships.voided_at is null
        and public.leaderboard_tournament_season_memberships.qualifying_event_number
          is null;
    end if;
  else
    v_season_id:=ironclad_private.resolve_competition_leaderboard_season(v_model,v_effective_completed_at::date,false);
  end if;

  if v_season_id is null then
    raise exception 'Division leaderboard season could not be resolved'
      using errcode = '55000';
  end if;

  with expected_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from pg_temp.leaderboard_expected_division_events as event
    where event.event_type <> 'missing_tournament_bonus'
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  current_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from public.leaderboard_point_events as event
    left join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    where event.tournament_id = v_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type not in (
        'admin_adjustment', 'missing_tournament_bonus'
      )
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) = p_tournament_bracket_id
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  difference as (
    select 1
    from expected_counts as expected
    full join current_counts as current
      on current.registration_id = expected.registration_id
      and current.player_id = expected.player_id
      and current.bracket_type = expected.bracket_type
      and current.points = expected.points
      and current.event_type = expected.event_type
    where current.event_count is distinct from expected.event_count
    limit 1
  )
  select not exists (select 1 from difference)
  into v_events_match;

  insert into public.leaderboard_division_settlements (
    tournament_bracket_id,
    season_id,
    settlement_version,
    calculation_checksum,
    settled_at,
    last_reconciled_at
  )
  values (
    p_tournament_bracket_id,
    v_season_id,
    1,
    v_calculation_checksum,
    v_effective_completed_at,
    greatest(clock_timestamp(), v_effective_completed_at)
  )
  on conflict (tournament_bracket_id) do update
  set
    calculation_checksum = excluded.calculation_checksum,
    last_reconciled_at = greatest(
      clock_timestamp(),
      public.leaderboard_division_settlements.settled_at
    )
  where public.leaderboard_division_settlements.season_id = excluded.season_id
    and (
      public.leaderboard_division_settlements.calculation_checksum
        is distinct from excluded.calculation_checksum
      or not v_events_match
    );

  v_receipt_created := v_existing_settlement.tournament_bracket_id is null;
  v_receipt_changed := v_receipt_created
    or v_existing_settlement.calculation_checksum
      is distinct from v_calculation_checksum
    or not v_events_match;

  if not v_events_match then
    delete from public.leaderboard_point_events as event
    using public.registrations as registration
    where event.registration_id = registration.id
      and registration.profile_id = event.player_id
      and event.tournament_id = v_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type not in (
        'admin_adjustment', 'missing_tournament_bonus'
      )
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) = p_tournament_bracket_id;

    insert into public.leaderboard_point_events (
      season_id,
      tournament_id,
      tournament_bracket_id,
      registration_id,
      player_id,
      bracket_type,
      points,
      event_type,
      description,
      source,
      created_by_clerk_user_id
    )
    select
      v_season_id,
      v_tournament_id,
      event.point_event_tournament_bracket_id,
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      event.description,
      'recalculation',
      nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
    from pg_temp.leaderboard_expected_division_events as event
    where event.event_type <> 'missing_tournament_bonus';

    v_events_changed := true;
  end if;

  drop table if exists pg_temp.leaderboard_division_affected_seasons;
  create temporary table leaderboard_division_affected_seasons (
    season_id uuid primary key
  ) on commit drop;

  if v_events_changed then
    insert into pg_temp.leaderboard_division_affected_seasons (season_id)
    values (v_season_id)
    on conflict do nothing;
  end if;

  -- The existing catch-up formula is global per lower Division. Reconcile its
  -- one canonical event only when the desired set differs, so ordinary retries
  -- are a true no-op and Admin adjustments remain untouched.
  drop table if exists pg_temp.leaderboard_expected_late_entry_bonuses;
  create temporary table leaderboard_expected_late_entry_bonuses
  on commit drop
  as
  with qualifying_divisions as (
    select
      bracket.id as tournament_bracket_id,
      coalesce(settlement.season_id, membership.season_id) as season_id,
      bracket.tournament_id
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
      and public.is_generated_bracket_complete(generated.id)
    left join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = bracket.id
    left join public.leaderboard_tournament_season_memberships as membership
      on membership.tournament_id = bracket.tournament_id
      and membership.voided_at is null
    where bracket.name in ('Academy', 'Challenge')
      and bracket.launched_at is not null
      and (
        settlement.tournament_bracket_id is not null
        or (
          tournament.status = 'completed'
          and tournament.first_completed_at is not null
          and membership.tournament_id is not null
        )
      )
  )
  select
    division.season_id,
    division.tournament_id,
    event.point_event_tournament_bracket_id as tournament_bracket_id,
    event.registration_id,
    event.player_id,
    event.bracket_type,
    event.points,
    event.description
  from qualifying_divisions as division
  cross join lateral
    ironclad_private.calculate_leaderboard_division_point_events(
      division.tournament_bracket_id
    ) as event
  where event.event_type = 'missing_tournament_bonus'
    and division.season_id is not null;

  with expected_counts as (
    select
      bonus.season_id,
      bonus.tournament_id,
      bonus.tournament_bracket_id,
      bonus.registration_id,
      bonus.player_id,
      bonus.bracket_type,
      bonus.points,
      count(*)::integer as event_count
    from pg_temp.leaderboard_expected_late_entry_bonuses as bonus
    group by
      bonus.season_id,
      bonus.tournament_id,
      bonus.tournament_bracket_id,
      bonus.registration_id,
      bonus.player_id,
      bonus.bracket_type,
      bonus.points
  ),
  current_counts as (
    select
      event.season_id,
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      count(*)::integer as event_count
    from public.leaderboard_point_events as event
    where event.event_type = 'missing_tournament_bonus'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge')
    group by
      event.season_id,
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points
  ),
  difference as (
    select 1
    from expected_counts as expected
    full join current_counts as current
      on current.season_id = expected.season_id
      and current.tournament_id = expected.tournament_id
      and current.tournament_bracket_id = expected.tournament_bracket_id
      and current.registration_id = expected.registration_id
      and current.player_id = expected.player_id
      and current.bracket_type = expected.bracket_type
      and current.points = expected.points
    where current.event_count is distinct from expected.event_count
    limit 1
  )
  select not exists (select 1 from difference)
  into v_bonus_match;

  if not v_bonus_match then
    insert into pg_temp.leaderboard_division_affected_seasons (season_id)
    select distinct event.season_id
    from public.leaderboard_point_events as event
    where event.event_type = 'missing_tournament_bonus'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge')
    on conflict do nothing;

    insert into pg_temp.leaderboard_division_affected_seasons (season_id)
    select distinct bonus.season_id
    from pg_temp.leaderboard_expected_late_entry_bonuses as bonus
    on conflict do nothing;

    delete from public.leaderboard_point_events as event
    where event.event_type = 'missing_tournament_bonus'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge');

    insert into public.leaderboard_point_events (
      season_id,
      tournament_id,
      tournament_bracket_id,
      registration_id,
      player_id,
      bracket_type,
      points,
      event_type,
      description,
      source,
      created_by_clerk_user_id
    )
    select
      bonus.season_id,
      bonus.tournament_id,
      bonus.tournament_bracket_id,
      bonus.registration_id,
      bonus.player_id,
      bonus.bracket_type,
      bonus.points,
      'missing_tournament_bonus',
      bonus.description,
      'recalculation',
      nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
    from pg_temp.leaderboard_expected_late_entry_bonuses as bonus;

    v_bonus_changed := true;
  end if;

  for v_affected_season in
    select affected.season_id
    from pg_temp.leaderboard_division_affected_seasons as affected
    order by affected.season_id
  loop
    v_run_id := public.recalculate_leaderboard_for_season(
      v_affected_season.season_id,
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_run_status, v_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_run_id;

    if v_run_status is distinct from 'completed' then
      raise exception 'Division leaderboard projection failed: %',
        coalesce(nullif(v_run_notes, ''), v_run_status, 'unknown')
        using errcode = '55000';
    end if;
  end loop;

  if v_bracket_type in ('main','pro') then
    update public.leaderboard_tournament_season_memberships
    set scored_at = coalesce(scored_at, clock_timestamp())
    where tournament_id = v_tournament_id
      and season_id = v_season_id
      and qualifying_event_number is not null
      and voided_at is null;

    select public.finalize_leaderboard_main_season_if_ready(v_season_id)
    into v_finalized;
  end if;

  -- Invoke the existing Badge reconciliation authority only after accounting
  -- and projections are internally complete. A failure aborts this settlement
  -- attempt and reaches the existing recalculation-run retry path. A matching
  -- target proves the handoff already occurred, keeping ordinary retries a
  -- true no-op without creating another queue or evaluator.
  for v_badge_player_id in
    select distinct registration.profile_id
    from public.registrations as registration
    where registration.tournament_id = v_tournament_id
      and registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
  loop
    if v_receipt_changed
      or v_events_changed
      or v_bonus_changed
      or not exists (
        select 1
        from ironclad_private.badge_reconciliation_targets as target
        where target.player_id = v_badge_player_id
          and target.reason = 'tournament_completion'
          and target.source_type = 'tournament'
          and target.source_id = v_tournament_id::text
      )
    then
      perform ironclad_private.enqueue_badge_reconciliation_target(
        v_badge_player_id,
        'tournament_completion',
        'tournament',
        v_tournament_id::text
      );
    end if;
  end loop;

  return jsonb_build_object(
    'tournamentId', v_tournament_id,
    'tournamentBracketId', p_tournament_bracket_id,
    'division', v_bracket_name,
    'seasonId', v_season_id,
    'calculationChecksum', v_calculation_checksum,
    'settlementCreated', v_receipt_created,
    'pointEventsChanged', v_events_changed,
    'lateEntryBonusesChanged', v_bonus_changed,
    'seasonFinalized', v_finalized
  );
end;
$function$;

alter function public.settle_leaderboard_division(p_tournament_bracket_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.settle_leaderboard_division(p_tournament_bracket_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.settle_leaderboard_division(p_tournament_bracket_id uuid, p_triggered_by_clerk_user_id text) to service_role;

CREATE OR REPLACE FUNCTION public.assign_leaderboard_tournament_season(p_tournament_id uuid)
 RETURNS TABLE(season_id uuid, qualifying_event_number smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_status text;
  v_model text;
  v_effective_date date;
  v_existing public.leaderboard_tournament_season_memberships%rowtype;
  v_season_id uuid;
  v_event_number smallint;
  v_has_launched_main boolean;
  v_valid_event_count integer;
begin
  select
    tournament.division_model_version,tournament.status,
    coalesce(
      tournament.first_completed_at::date,
      tournament.grand_final_at::date,
      tournament.end_date::date,
      tournament.start_date::date,
      tournament.created_at::date,
      current_date
    )
  into v_model,v_status, v_effective_date
  from public.tournaments as tournament
  where tournament.id = p_tournament_id;

  if not found then
    raise exception 'Tournament not found';
  end if;

  select membership.*
  into v_existing
  from public.leaderboard_tournament_season_memberships as membership
  where membership.tournament_id = p_tournament_id;

  if found then
    if v_existing.voided_at is not null then
      raise exception 'A voided tournament membership cannot be reassigned'
        using errcode = '55000';
    end if;

    return query
    select v_existing.season_id, v_existing.qualifying_event_number;
    return;
  end if;

  if v_status <> 'completed' then
    raise exception 'Tournament must be completed before leaderboard assignment';
  end if;

  if not exists (
    select 1
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
      and tournament.first_completed_at is not null
  ) then
    raise exception 'Tournament first completion was not recorded';
  end if;

  select exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and ironclad_private.bracket_accounting_type(bracket.id) in ('main','pro')
      and bracket.launched_at is not null
  )
  into v_has_launched_main;

  if v_has_launched_main then
    v_season_id:=ironclad_private.resolve_competition_leaderboard_season(v_model,v_effective_date,true);
    select slot.event_number::smallint
    into v_event_number
    from generate_series(1, 6) as slot(event_number)
    where not exists (
      select 1
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_season_id
        and membership.qualifying_event_number = slot.event_number
        and membership.voided_at is null
    )
    order by slot.event_number
    limit 1;

    if v_event_number is null then
      raise exception 'Main/Pro leaderboard season already contains six valid events';
    end if;
  else
    v_season_id:=ironclad_private.resolve_competition_leaderboard_season(v_model,v_effective_date,false);
  end if;

  insert into public.leaderboard_tournament_season_memberships (
    tournament_id,
    season_id,
    qualifying_event_number
  )
  values (
    p_tournament_id,
    v_season_id,
    v_event_number
  );

  select count(*)::integer
  into v_valid_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = v_season_id
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  update public.leaderboard_seasons
  set
    start_date = least(start_date, v_effective_date),
    end_date = greatest(end_date, v_effective_date),
    is_active = case
      when v_has_launched_main and v_valid_event_count = 6 then false
      else is_active
    end
  where id = v_season_id;

  return query select v_season_id, v_event_number;
end;
$function$;

alter function public.assign_leaderboard_tournament_season(p_tournament_id uuid) owner to postgres;
revoke all on function public.assign_leaderboard_tournament_season(p_tournament_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_leaderboard_main_season_if_ready(p_season_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_event_count integer;
  v_next_season_id uuid;
begin
  select season.finalized_at,season.official_bracket_type
  into v_finalized_at,v_authority
  from public.leaderboard_seasons as season
  where season.id = p_season_id
  for update;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  select count(*)::integer
  into v_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = p_season_id
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  if v_event_count <> 6 then
    return false;
  end if;

  if exists (
    select 1
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = p_season_id
      and membership.qualifying_event_number is not null
      and membership.voided_at is null
      and membership.scored_at is null
  ) then
    return false;
  end if;

  insert into public.leaderboard_season_champions (
    season_id,
    player_id,
    bracket_type,
    final_rank,
    final_points
  )
  select
    p_season_id,
    season_stats.player_id,
    v_authority,
    season_stats.current_rank,
    season_stats.total_points
  from public.leaderboard_player_season_stats as season_stats
  where season_stats.season_id = p_season_id
    and season_stats.bracket_type = v_authority
    and season_stats.current_rank between 1 and 3
  on conflict (season_id, player_id, bracket_type) do nothing;

  if v_finalized_at is null then
    update public.leaderboard_seasons
    set
      finalized_at = clock_timestamp(),
      is_active = false
    where id = p_season_id
      and finalized_at is null;
  end if;

  select public.get_or_create_leaderboard_season(current_date)
  into v_next_season_id;

  update public.leaderboard_seasons
  set is_active = true
  where id = v_next_season_id
    and finalized_at is null
    and not is_active;

  return true;
end;
$function$;

alter function public.finalize_leaderboard_main_season_if_ready(p_season_id uuid) owner to postgres;
revoke all on function public.finalize_leaderboard_main_season_if_ready(p_season_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_season(p_season_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_run_id uuid;
  v_run_status text;
  v_all_time_run_id uuid;
  v_all_time_status text;
  v_all_time_notes text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:season:' || coalesce(p_season_id::text, 'null'),
      0
    )
  );

  select season.finalized_at,season.official_bracket_type
  into v_finalized_at,v_authority
  from public.leaderboard_seasons as season
  where season.id = p_season_id;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  if v_finalized_at is not null then
    drop table if exists pg_temp.leaderboard_finalized_main_stats;
    create temporary table leaderboard_finalized_main_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats as season_stats
    where season_stats.season_id = p_season_id
      and season_stats.bracket_type = v_authority;
  end if;

  v_run_id := public.recalculate_leaderboard_for_season_pr2_core(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_finalized_at is null then
    return v_run_id;
  end if;

  delete from public.leaderboard_player_season_stats
  where season_id = p_season_id
    and bracket_type = v_authority;

  insert into public.leaderboard_player_season_stats (
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  )
  select
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  from pg_temp.leaderboard_finalized_main_stats;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  v_all_time_run_id := public.recalculate_leaderboard_all_time(
    p_triggered_by_clerk_user_id
  );

  select run.status, run.notes
  into v_all_time_status, v_all_time_notes
  from public.leaderboard_recalculation_runs as run
  where run.id = v_all_time_run_id;

  if v_all_time_status is distinct from 'completed' then
    update public.leaderboard_recalculation_runs
    set
      status = 'failed',
      finished_at = now(),
      notes = format(
        'Finalized Main/Pro restoration all-time recalculation failed: %s',
        coalesce(
          nullif(v_all_time_notes, ''),
          v_all_time_status,
          'unknown'
        )
      )
    where id = v_run_id;
  end if;

  return v_run_id;
end;
$function$;

alter function public.recalculate_leaderboard_for_season(p_season_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season(p_season_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.recalculate_leaderboard_for_season(p_season_id uuid, p_triggered_by_clerk_user_id text) to service_role;

CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_season_pr2_core(p_season_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_id uuid;
  v_run_status text;
  v_all_time_run_id uuid;
  v_all_time_status text;
  v_all_time_notes text;
begin
  perform public.leaderboard_require_write_access();
  -- Every season rebuild also replaces the shared all-time cache. Take that
  -- real shared scope first so multi-season work cannot deadlock while holding
  -- a narrower season lock and waiting for the all-time lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:season:' || coalesce(p_season_id::text, 'null'),
      0
    )
  );

  v_run_id := public.recalculate_leaderboard_for_season_without_outcome_filtering(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  drop table if exists pg_temp.leaderboard_outcome_aware_match_stats;
  create temporary table leaderboard_outcome_aware_match_stats
  on commit drop
  as
  with event_registrations as (
    select distinct
      event.player_id,
      event.bracket_type as stat_bracket_type,
      event.registration_id,
      coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) as tournament_bracket_id
    from public.leaderboard_point_events as event
    join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    where event.season_id = p_season_id
      and event.registration_id is not null
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) is not null
    union
    select distinct
      event.player_id,
      'overall'::text as stat_bracket_type,
      event.registration_id,
      coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) as tournament_bracket_id
    from public.leaderboard_point_events as event
    join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    where event.season_id = p_season_id
      and event.bracket_type in ('academy', 'main', 'challenge','main_progression','pro')
      and event.registration_id is not null
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) is not null
  ),
  matched as (
    select distinct
      event_registration.player_id,
      event_registration.stat_bracket_type,
      match.id as match_id,
      match.winner_registration_id,
      event_registration.registration_id
    from event_registrations as event_registration
    join public.generated_brackets as generated
      on generated.tournament_bracket_id =
        event_registration.tournament_bracket_id
    join public.tournament_matches as match
      on match.generated_bracket_id = generated.id
      and public.is_tournament_match_played_for_leaderboard(match.id)
      and (
        match.player_one_registration_id =
          event_registration.registration_id
        or match.player_two_registration_id =
          event_registration.registration_id
      )
  )
  select
    player_id,
    stat_bracket_type as bracket_type,
    count(distinct match_id)::integer as matches_played,
    count(distinct match_id) filter (
      where winner_registration_id = registration_id
    )::integer as matches_won
  from matched
  group by player_id, stat_bracket_type;

  -- A registration can have genuine earlier matches and then lose its only
  -- participation event to a later no-show. Retain that zero-point player's
  -- real statistics even when the deployed event aggregation created no row.
  insert into public.leaderboard_player_season_stats (
    season_id,
    player_id,
    bracket_type,
    matches_played,
    matches_won,
    matches_lost,
    win_rate
  )
  select
    p_season_id,
    match_stats.player_id,
    match_stats.bracket_type,
    match_stats.matches_played,
    match_stats.matches_won,
    greatest(match_stats.matches_played - match_stats.matches_won, 0),
    case
      when match_stats.matches_played = 0 then 0::numeric
      else round(
        (match_stats.matches_won::numeric / match_stats.matches_played) * 100,
        2
      )
    end
  from pg_temp.leaderboard_outcome_aware_match_stats as match_stats
  on conflict (season_id, player_id, bracket_type) do nothing;

  update public.leaderboard_player_season_stats as season_stats
  set
    matches_played = coalesce(match_stats.matches_played, 0),
    matches_won = coalesce(match_stats.matches_won, 0),
    matches_lost = greatest(
      coalesce(match_stats.matches_played, 0)
        - coalesce(match_stats.matches_won, 0),
      0
    ),
    win_rate = case
      when coalesce(match_stats.matches_played, 0) = 0 then 0::numeric
      else round(
        (
          coalesce(match_stats.matches_won, 0)::numeric
          / match_stats.matches_played
        ) * 100,
        2
      )
    end,
    updated_at = now()
  from (
    select
      current_stats.player_id,
      current_stats.bracket_type,
      aggregated.matches_played,
      aggregated.matches_won
    from public.leaderboard_player_season_stats as current_stats
    left join pg_temp.leaderboard_outcome_aware_match_stats as aggregated
      on aggregated.player_id = current_stats.player_id
      and aggregated.bracket_type = current_stats.bracket_type
    where current_stats.season_id = p_season_id
  ) as match_stats
  where season_stats.season_id = p_season_id
    and season_stats.player_id = match_stats.player_id
    and season_stats.bracket_type = match_stats.bracket_type;

  -- Official competition rank uses only the five approved competitive keys.
  -- Exact wins/played ratios avoid creating ties solely through display
  -- rounding; names and UUIDs remain outside the rank window.
  with competitive_ranks as (
    select
      season_stats.id,
      rank() over (
        partition by season_stats.bracket_type
        order by
          season_stats.total_points desc,
          season_stats.tournament_wins desc,
          season_stats.rounds_passed desc,
          case
            when season_stats.matches_played = 0 then 0::numeric
            else
              season_stats.matches_won::numeric
              / season_stats.matches_played
          end desc,
          season_stats.matches_won desc
      )::integer as competitive_rank
    from public.leaderboard_player_season_stats as season_stats
    where season_stats.season_id = p_season_id
  ),
  rank_updates as (
    select
      current_stats.id,
      ranked.competitive_rank,
      existing.player_id is not null as existed_before,
      existing.current_rank as prior_current_rank,
      existing.previous_rank as prior_previous_rank,
      existing.rank_movement as prior_rank_movement,
      (
        existing.player_id is not null
        and existing.total_points is not distinct from current_stats.total_points
        and existing.tournaments_played is not distinct from
          current_stats.tournaments_played
        and existing.rounds_passed is not distinct from
          current_stats.rounds_passed
        and existing.tournament_wins is not distinct from
          current_stats.tournament_wins
        and existing.matches_played is not distinct from
          current_stats.matches_played
        and existing.matches_won is not distinct from current_stats.matches_won
        and existing.matches_lost is not distinct from
          current_stats.matches_lost
        and existing.win_rate is not distinct from current_stats.win_rate
        and existing.last_tournament_id is not distinct from
          current_stats.last_tournament_id
        and existing.last_tournament_points is not distinct from
          current_stats.last_tournament_points
        and existing.current_rank is not distinct from ranked.competitive_rank
      ) as unchanged
    from public.leaderboard_player_season_stats as current_stats
    join competitive_ranks as ranked
      on ranked.id = current_stats.id
    left join pg_temp.leaderboard_existing_season_stats as existing
      on existing.player_id = current_stats.player_id
      and existing.bracket_type = current_stats.bracket_type
    where current_stats.season_id = p_season_id
  )
  update public.leaderboard_player_season_stats as season_stats
  set
    current_rank = rank_update.competitive_rank,
    previous_rank = case
      when not rank_update.existed_before then null
      when rank_update.unchanged then rank_update.prior_previous_rank
      else rank_update.prior_current_rank
    end,
    rank_movement = case
      when not rank_update.existed_before then 0
      when rank_update.unchanged then rank_update.prior_rank_movement
      when rank_update.prior_current_rank is null then 0
      else rank_update.prior_current_rank - rank_update.competitive_rank
    end
  from rank_updates as rank_update
  where season_stats.id = rank_update.id;

  v_all_time_run_id := public.recalculate_leaderboard_all_time(
    p_triggered_by_clerk_user_id
  );

  select run.status, run.notes
  into v_all_time_status, v_all_time_notes
  from public.leaderboard_recalculation_runs as run
  where run.id = v_all_time_run_id;

  if v_all_time_status is distinct from 'completed' then
    update public.leaderboard_recalculation_runs
    set
      status = 'failed',
      finished_at = now(),
      notes = format(
        'Outcome-aware all-time leaderboard recalculation failed: %s',
        coalesce(nullif(v_all_time_notes, ''), v_all_time_status, 'unknown')
      )
    where id = v_run_id;
  end if;

  return v_run_id;
end;
$function$;

alter function public.recalculate_leaderboard_for_season_pr2_core(p_season_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season_pr2_core(p_season_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_season_without_outcome_filtering(p_season_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_id uuid;
  v_all_time_run_id uuid;
  v_all_time_run_status text;
  v_all_time_run_notes text;
  v_error_message text;
  v_error_state text;
  v_error_context text;
begin
  perform public.leaderboard_require_write_access();

  insert into public.leaderboard_recalculation_runs (
    season_id,
    scope,
    status,
    triggered_by_clerk_user_id
  )
  values (
    p_season_id,
    'season',
    'pending',
    nullif(btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_run_id;

  begin
    if not exists (
      select 1
      from public.leaderboard_seasons
      where id = p_season_id
    ) then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = 'Leaderboard season not found'
      where id = v_run_id;

      return v_run_id;
    end if;

    drop table if exists pg_temp.leaderboard_existing_season_stats;
    create temporary table leaderboard_existing_season_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    drop table if exists pg_temp.leaderboard_previous_ranks;
    create temporary table leaderboard_previous_ranks
    on commit drop
    as
    select
      player_id,
      bracket_type,
      current_rank
    from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    delete from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    drop table if exists pg_temp.leaderboard_event_stats;
    create temporary table leaderboard_event_stats
    on commit drop
    as
    with event_scope as (
      select
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.points,
        event.event_type,
        event.tournament_id,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
      union all
      select
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.points,
        event.event_type,
        event.tournament_id,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('academy', 'main', 'challenge','main_progression','pro')
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      coalesce(sum(points), 0)::integer as total_points,
      count(distinct tournament_id) filter (
        where event_type = 'participation'
          and tournament_id is not null
      )::integer as tournaments_played,
      count(*) filter (
        where event_type = 'round_passed'
      )::integer as rounds_passed,
      count(*) filter (
        where event_type = 'tournament_win'
      )::integer as tournament_wins
    from event_scope
    group by player_id, stat_bracket_type;

    drop table if exists pg_temp.leaderboard_last_tournament_points;
    create temporary table leaderboard_last_tournament_points
    on commit drop
    as
    with event_scope as (
      select
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.tournament_id,
        event.points,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
      union all
      select
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.tournament_id,
        event.points,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('academy', 'main', 'challenge','main_progression','pro')
    ),
    tournament_points as (
      select
        event_scope.player_id,
        event_scope.stat_bracket_type,
        event_scope.tournament_id,
        coalesce(sum(event_scope.points), 0)::integer as points,
        max(
          coalesce(
            tournament.grand_final_at,
            tournament.created_at,
            tournament.updated_at,
            event_scope.created_at
          )
        ) as sort_at
      from event_scope
      left join public.tournaments as tournament
        on tournament.id = event_scope.tournament_id
      where event_scope.tournament_id is not null
      group by
        event_scope.player_id,
        event_scope.stat_bracket_type,
        event_scope.tournament_id
    ),
    ranked as (
      select
        tournament_points.*,
        row_number() over (
          partition by player_id, stat_bracket_type
          order by sort_at desc, tournament_id::text
        ) as row_number
      from tournament_points
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      tournament_id,
      points
    from ranked
    where row_number = 1;

    drop table if exists pg_temp.leaderboard_match_stats;
    create temporary table leaderboard_match_stats
    on commit drop
    as
    with event_registrations as (
      select distinct
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.registration_id,
        event.tournament_bracket_id
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.registration_id is not null
        and event.tournament_bracket_id is not null
      union
      select distinct
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.registration_id,
        event.tournament_bracket_id
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('academy', 'main', 'challenge','main_progression','pro')
        and event.registration_id is not null
        and event.tournament_bracket_id is not null
    ),
    matched as (
      select distinct
        event_registrations.player_id,
        event_registrations.stat_bracket_type,
        match.id as match_id,
        match.winner_registration_id,
        event_registrations.registration_id
      from event_registrations
      join public.generated_brackets as generated
        on generated.tournament_bracket_id =
          event_registrations.tournament_bracket_id
      join public.tournament_matches as match
        on match.generated_bracket_id = generated.id
        and match.status = 'completed'
        and (
          match.player_one_registration_id =
            event_registrations.registration_id
          or match.player_two_registration_id =
            event_registrations.registration_id
        )
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      count(distinct match_id)::integer as matches_played,
      count(distinct match_id) filter (
        where winner_registration_id = registration_id
      )::integer as matches_won
    from matched
    group by player_id, stat_bracket_type;

    insert into public.leaderboard_player_season_stats (
      season_id,
      player_id,
      bracket_type,
      total_points,
      tournaments_played,
      rounds_passed,
      tournament_wins,
      matches_played,
      matches_won,
      matches_lost,
      win_rate,
      last_tournament_id,
      last_tournament_points,
      current_rank,
      previous_rank,
      rank_movement
    )
    with combined as (
      select
        coalesce(event_stats.player_id, match_stats.player_id) as player_id,
        coalesce(event_stats.bracket_type, match_stats.bracket_type)
          as bracket_type,
        coalesce(event_stats.total_points, 0)::integer as total_points,
        coalesce(event_stats.tournaments_played, 0)::integer
          as tournaments_played,
        coalesce(event_stats.rounds_passed, 0)::integer as rounds_passed,
        coalesce(event_stats.tournament_wins, 0)::integer as tournament_wins,
        coalesce(match_stats.matches_played, 0)::integer as matches_played,
        coalesce(match_stats.matches_won, 0)::integer as matches_won
      from leaderboard_event_stats as event_stats
      full join leaderboard_match_stats as match_stats
        on match_stats.player_id = event_stats.player_id
        and match_stats.bracket_type = event_stats.bracket_type
    ),
    ranked as (
      select
        combined.*,
        greatest(combined.matches_played - combined.matches_won, 0)::integer
          as matches_lost,
        case
          when combined.matches_played = 0 then 0::numeric
          else round(
            (combined.matches_won::numeric / combined.matches_played) * 100,
            2
          )
        end as win_rate,
        row_number() over (
          partition by combined.bracket_type
          order by
            combined.total_points desc,
            combined.tournament_wins desc,
            combined.rounds_passed desc,
            case
              when combined.matches_played = 0 then 0::numeric
              else round(
                (combined.matches_won::numeric / combined.matches_played) * 100,
                2
              )
            end desc,
            coalesce(player.in_game_name, player.display_name, player.id::text),
            player.id::text
        )::integer as current_rank
      from combined
      join public.players as player
        on player.id = combined.player_id
    )
    select
      p_season_id,
      ranked.player_id,
      ranked.bracket_type,
      ranked.total_points,
      ranked.tournaments_played,
      ranked.rounds_passed,
      ranked.tournament_wins,
      ranked.matches_played,
      ranked.matches_won,
      ranked.matches_lost,
      ranked.win_rate,
      last_points.tournament_id,
      coalesce(last_points.points, 0),
      ranked.current_rank,
      previous.current_rank,
      case
        when previous.current_rank is null then 0
        else previous.current_rank - ranked.current_rank
      end
    from ranked
    left join leaderboard_previous_ranks as previous
      on previous.player_id = ranked.player_id
      and previous.bracket_type = ranked.bracket_type
    left join leaderboard_last_tournament_points as last_points
      on last_points.player_id = ranked.player_id
      and last_points.bracket_type = ranked.bracket_type;

    v_all_time_run_id := public.recalculate_leaderboard_all_time(
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_all_time_run_status, v_all_time_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_all_time_run_id;

    if v_all_time_run_status is distinct from 'completed' then
      delete from public.leaderboard_player_season_stats
      where season_id = p_season_id;

      insert into public.leaderboard_player_season_stats (
        id,
        season_id,
        player_id,
        bracket_type,
        total_points,
        tournaments_played,
        rounds_passed,
        tournament_wins,
        matches_played,
        matches_won,
        matches_lost,
        win_rate,
        last_tournament_id,
        last_tournament_points,
        current_rank,
        previous_rank,
        rank_movement,
        updated_at
      )
      select
        id,
        season_id,
        player_id,
        bracket_type,
        total_points,
        tournaments_played,
        rounds_passed,
        tournament_wins,
        matches_played,
        matches_won,
        matches_lost,
        win_rate,
        last_tournament_id,
        last_tournament_points,
        current_rank,
        previous_rank,
        rank_movement,
        updated_at
      from leaderboard_existing_season_stats;

      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'All-time leaderboard recalculation failed: %s',
          coalesce(
            nullif(v_all_time_run_notes, ''),
            'status ' || coalesce(v_all_time_run_status, 'unknown')
          )
        )
      where id = v_run_id;

      return v_run_id;
    end if;

    update public.leaderboard_recalculation_runs
    set
      status = 'completed',
      finished_at = now()
    where id = v_run_id;
  exception
    when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_state = returned_sqlstate,
        v_error_context = pg_exception_context;

      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'Season leaderboard recalculation failed: SQLSTATE %s: %s%s',
          v_error_state,
          v_error_message,
          case
            when nullif(v_error_context, '') is null then ''
            else E'\n' || v_error_context
          end
        )
      where id = v_run_id;
  end;

  return v_run_id;
end;
$function$;

alter function public.recalculate_leaderboard_for_season_without_outcome_filtering(p_season_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season_without_outcome_filtering(p_season_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_tournament(p_tournament_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run_id uuid;
  v_status text;
  v_bracket record;
  v_reconciled integer := 0;
  v_error_state text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  select tournament.status
  into v_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;
  if v_status in ('cancelled', 'voided') then
    raise exception 'A terminal Event cannot be reconciled'
      using errcode = '55000';
  end if;

  insert into public.leaderboard_recalculation_runs (
    tournament_id,
    scope,
    status,
    triggered_by_clerk_user_id
  )
  values (
    p_tournament_id,
    'tournament',
    'pending',
    nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_run_id;

  begin
    for v_bracket in
      select bracket.id
      from public.tournament_brackets as bracket
      join public.generated_brackets as generated
        on generated.tournament_bracket_id = bracket.id
      where bracket.tournament_id = p_tournament_id
        and bracket.launched_at is not null
        and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
        and public.is_generated_bracket_complete(generated.id)
        and not exists (
          select 1
          from public.tournament_division_not_held_closures as closure
          where closure.tournament_bracket_id = bracket.id
        )
      order by bracket.id
    loop
      perform public.settle_leaderboard_division(
        v_bracket.id,
        p_triggered_by_clerk_user_id
      );
      v_reconciled := v_reconciled + 1;
    end loop;

    update public.leaderboard_recalculation_runs
    set
      status = 'completed',
      finished_at = clock_timestamp(),
      notes = format(
        'Reconciled %s completed Division(s) through the canonical Division writer.',
        v_reconciled
      )
    where id = v_run_id;
  exception
    when query_canceled or assert_failure or others then
      get stacked diagnostics v_error_state = returned_sqlstate;
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = clock_timestamp(),
        notes = format(
          'Division coordinator failed: SQLSTATE %s',
          coalesce(v_error_state, 'unknown')
        )
      where id = v_run_id;
  end;

  return v_run_id;
end;
$function$;

alter function public.recalculate_leaderboard_for_tournament(p_tournament_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.recalculate_leaderboard_for_tournament(p_tournament_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.recalculate_leaderboard_for_tournament(p_tournament_id uuid, p_triggered_by_clerk_user_id text) to service_role;

CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(p_tournament_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return public.recalculate_leaderboard_for_tournament(p_tournament_id,p_triggered_by_clerk_user_id);
end;
$function$;

alter function public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(p_tournament_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(p_tournament_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_finalized_main_admin_adjustment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if tg_op = 'UPDATE'
    and coalesce(
      current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
    and new.created_by_clerk_user_id
      is distinct from old.created_by_clerk_user_id
    and new.id is not distinct from old.id
    and new.season_id is not distinct from old.season_id
    and new.tournament_id is not distinct from old.tournament_id
    and new.tournament_bracket_id
      is not distinct from old.tournament_bracket_id
    and new.registration_id is not distinct from old.registration_id
    and new.player_id is not distinct from old.player_id
    and new.bracket_type is not distinct from old.bracket_type
    and new.points is not distinct from old.points
    and new.event_type is not distinct from old.event_type
    and new.description is not distinct from old.description
    and new.source is not distinct from old.source
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if (
    tg_op <> 'INSERT'
    and old.source = 'admin'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = old.season_id and season.official_bracket_type=old.bracket_type
        and season.finalized_at is not null
    )
  ) or (
    tg_op <> 'DELETE'
    and new.source = 'admin'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = new.season_id and season.official_bracket_type=new.bracket_type
        and season.finalized_at is not null
    )
  ) then
    raise exception 'Finalized Main/Pro standings cannot be adjusted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

alter function public.guard_finalized_main_admin_adjustment() owner to postgres;
revoke all on function public.guard_finalized_main_admin_adjustment() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_leaderboard_admin_adjustment_without_terminal_guard(p_season_id uuid, p_player_id uuid, p_bracket_type text, p_points integer, p_description text DEFAULT NULL::text, p_tournament_id uuid DEFAULT NULL::uuid, p_tournament_bracket_id uuid DEFAULT NULL::uuid, p_registration_id uuid DEFAULT NULL::uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_event_id uuid;
  v_season_run_id uuid;
  v_season_run_status text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  if not exists (
    select 1
    from public.leaderboard_seasons as season
    where season.id = p_season_id
  ) then
    raise exception 'Leaderboard season not found';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.id = p_player_id
  ) then
    raise exception 'Player not found';
  end if;

  if p_bracket_type not in ('academy', 'challenge', 'main','main_progression','pro', 'overall') then
    raise exception 'Invalid leaderboard bracket type';
  end if;

  insert into public.leaderboard_point_events (
    season_id,
    tournament_id,
    tournament_bracket_id,
    registration_id,
    player_id,
    bracket_type,
    points,
    event_type,
    description,
    source,
    created_by_clerk_user_id
  )
  values (
    p_season_id,
    p_tournament_id,
    p_tournament_bracket_id,
    p_registration_id,
    p_player_id,
    p_bracket_type,
    p_points,
    'admin_adjustment',
    nullif(pg_catalog.btrim(p_description), ''),
    'admin',
    nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_event_id;

  v_season_run_id := public.recalculate_leaderboard_for_season(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_season_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_season_run_id;

  if v_season_run_status is distinct from 'completed' then
    raise exception 'Season leaderboard recalculation failed';
  end if;

  return v_event_id;
end;
$function$;

alter function public.add_leaderboard_admin_adjustment_without_terminal_guard(p_season_id uuid, p_player_id uuid, p_bracket_type text, p_points integer, p_description text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_registration_id uuid, p_triggered_by_clerk_user_id text) owner to postgres;
revoke all on function public.add_leaderboard_admin_adjustment_without_terminal_guard(p_season_id uuid, p_player_id uuid, p_bracket_type text, p_points integer, p_description text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_registration_id uuid, p_triggered_by_clerk_user_id text) from public, anon, authenticated, service_role;

create or replace view public.leaderboard_current_season with (security_barrier=true,security_invoker=false) as
select id,name,year,season_number,start_date,end_date,is_active,created_at,updated_at,
 (select count(*)::integer from public.leaderboard_tournament_season_memberships membership where membership.season_id=season.id and membership.qualifying_event_number is not null and membership.voided_at is null) as valid_main_event_count,
 finalized_at is not null as is_finalized,under_review_at is not null as is_under_review,
 official_bracket_type,
 (select count(*)::integer from public.leaderboard_tournament_season_memberships membership where membership.season_id=season.id and membership.qualifying_event_number is not null and membership.voided_at is null) as valid_qualifying_event_count
from public.leaderboard_seasons season
order by case when finalized_at is null then 0 else 1 end,case when finalized_at is null then created_at else null::timestamptz end,finalized_at desc nulls last,created_at desc limit 1;

CREATE OR REPLACE FUNCTION public.get_player_badge_tournament_authority_participants(p_tournament_id uuid)
 RETURNS TABLE(player_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select distinct event.player_id
  from public.leaderboard_point_events as event
  join public.leaderboard_division_settlements as settlement
    on settlement.tournament_bracket_id = event.tournament_bracket_id
    and settlement.season_id = event.season_id
  join public.tournaments as tournament
    on tournament.id = event.tournament_id
    and tournament.status not in ('cancelled', 'voided')
  where event.tournament_id = p_tournament_id
    and event.event_type in ('participation', 'tournament_win')
    and event.source in ('system', 'recalculation')
    and event.bracket_type in ('academy', 'challenge', 'main','main_progression','pro')
    and event.registration_id is not null
    and event.tournament_bracket_id is not null
    and not public.is_registration_confirmed_no_show_for_leaderboard(
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id
    )
    and not exists (
      select 1
      from public.leaderboard_point_events as withheld
      where withheld.tournament_id = event.tournament_id
        and withheld.registration_id = event.registration_id
        and withheld.player_id = event.player_id
        and withheld.event_type = 'participation_withheld'
        and withheld.source = event.source
    );
$function$;

alter function public.get_player_badge_tournament_authority_participants(p_tournament_id uuid) owner to postgres;
revoke all on function public.get_player_badge_tournament_authority_participants(p_tournament_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_tournament_authority_participants(p_tournament_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_player_badge_flawless_campaign_summary(p_player_id uuid)
 RETURNS TABLE(tournament_id uuid, registration_id uuid, first_completed_at timestamp with time zone, expected_path_segment_count integer, played_segment_count integer, automatic_bye_count integer, opponent_no_show_count integer, verified_game_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with champions as (
    select
      event.tournament_id,
      event.registration_id,
      min(settlement.settled_at) as first_completed_at
    from public.leaderboard_point_events as event
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = event.tournament_bracket_id
      and settlement.season_id = event.season_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.player_id = p_player_id
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and event.bracket_type in ('academy', 'challenge', 'main','main_progression','pro')
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
      summary.*
    from public.tournament_championship_path_summary_authority as summary
    order by
      summary.tournament_id,
      summary.registration_id,
      summary.revision desc,
      summary.id desc
  ),
  latest_paths as (
    select distinct on (
      path.tournament_id,
      path.registration_id,
      path.path_index
    )
      path.*
    from public.tournament_championship_path_authority as path
    order by
      path.tournament_id,
      path.registration_id,
      path.path_index,
      path.revision desc,
      path.id desc
  ),
  latest_participants as (
    select distinct on (authority.match_id, authority.registration_id)
      authority.*
    from public.match_participant_outcome_authority as authority
    order by
      authority.match_id,
      authority.registration_id,
      authority.revision desc,
      authority.id desc
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
      participant.match_id is not null
        and participant.outcome_kind = path.outcome_kind
        as participant_authority_aligned
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
          'played', 'opponent_no_show', 'automatic_bye'
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
      game.*
    from public.match_game_result_authority as game
    order by
      game.match_id,
      game.game_number,
      game.revision desc,
      game.id desc
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
    coalesce(games.verified_game_count, 0)::integer
  from path_stats as stats
  left join campaign_game_stats as games
    on games.tournament_id = stats.tournament_id
    and games.registration_id = stats.registration_id
  where stats.completeness_state = 'complete'
    and stats.expected_path_segment_count > 0
    and stats.observed_latest_segment_count = stats.expected_path_segment_count
    and stats.observed_path_segment_count = stats.expected_path_segment_count
    and stats.first_path_index = 1
    and stats.last_path_index = stats.expected_path_segment_count
    and stats.expected_length_consistent
    and stats.path_segments_valid
    and stats.played_segment_count > 0
    and coalesce(games.all_played_matches_are_flawless, false)
    and not exists (
      select 1
      from latest_paths as path
      left join public.tournament_matches as source_match
        on source_match.id = path.source_match_id
      where path.tournament_id = stats.tournament_id
        and path.registration_id = stats.registration_id
        and path.authority_state = 'active'
        and path.outcome_kind = 'played'
        and (
          source_match.id is null
          or source_match.status <> 'completed'
          or source_match.player_one_registration_id is null
          or source_match.player_two_registration_id is null
          or source_match.player_one_registration_id =
            source_match.player_two_registration_id
          or source_match.winner_registration_id is distinct from
            stats.registration_id
          or source_match.player_one_score is null
          or source_match.player_two_score is null
          or case
            when stats.registration_id = source_match.player_one_registration_id
              then source_match.player_two_score <> 0
            when stats.registration_id = source_match.player_two_registration_id
              then source_match.player_one_score <> 0
            else true
          end
        )
    )
  order by stats.first_completed_at, stats.tournament_id;
$function$;

alter function public.get_player_badge_flawless_campaign_summary(p_player_id uuid) owner to postgres;
revoke all on function public.get_player_badge_flawless_campaign_summary(p_player_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_flawless_campaign_summary(p_player_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_player_badge_flawless_campaign_summary_pre_played_requireme(p_player_id uuid)
 RETURNS TABLE(tournament_id uuid, registration_id uuid, first_completed_at timestamp with time zone, expected_path_segment_count integer, played_segment_count integer, automatic_bye_count integer, opponent_no_show_count integer, verified_game_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
      and event.bracket_type in ('academy', 'challenge', 'main','main_progression','pro')
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
$function$;

alter function public.get_player_badge_flawless_campaign_summary_pre_played_requireme(p_player_id uuid) owner to postgres;
revoke all on function public.get_player_badge_flawless_campaign_summary_pre_played_requireme(p_player_id uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_tournament_championship_path_summary(p_tournament_id uuid, p_registration_id uuid, p_source_type text, p_source_id uuid, p_finalized_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_expected integer := 0;
  v_observed integer := 0;
  v_state text := 'incomplete';
  v_id uuid;
  v_has_invalid boolean := false;
  v_expected_consistent boolean := false;
  v_is_champion boolean := false;
begin
  if not exists (
    select 1
    from public.registrations as registration
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = registration.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = registration.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where registration.id = p_registration_id
      and registration.tournament_id = p_tournament_id
  ) then
    select public.append_tournament_championship_path_summary_authority(
      p_tournament_id,
      p_registration_id,
      0,
      0,
      'incomplete',
      p_finalized_at,
      p_source_type,
      p_source_id,
      jsonb_build_object(
        'pathAuthorityOnly', true,
        'campaignEvaluationDeferred', true,
        'reason', 'division_not_settled'
      )
    ) into v_id;
    return v_id;
  end if;

  select exists (
    select 1
    from public.leaderboard_point_events as event
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = event.tournament_bracket_id
      and settlement.season_id = event.season_id
    where event.tournament_id = p_tournament_id
      and event.registration_id = p_registration_id
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge', 'main','main_progression','pro')
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  )
  into v_is_champion;

  select
    coalesce(max(authority.expected_path_segment_count), 0),
    count(*)::integer,
    min(authority.expected_path_segment_count) =
      max(authority.expected_path_segment_count),
    bool_or(
      authority.authority_state = 'invalidated'
      or authority.outcome_kind in (
        'player_no_show',
        'double_no_show',
        'admin_default',
        'cancelled',
        'voided',
        'unknown'
      )
    )
  into v_expected, v_observed, v_expected_consistent, v_has_invalid
  from (
    select distinct on (authority.path_index)
      authority.*
    from public.tournament_championship_path_authority as authority
    where authority.tournament_id = p_tournament_id
      and authority.registration_id = p_registration_id
    order by authority.path_index, authority.revision desc, authority.id desc
  ) as authority;

  if v_is_champion
    and v_expected > 0
    and v_expected_consistent
    and v_observed = v_expected
    and not v_has_invalid
    and not exists (
      select 1
      from (
        select distinct on (authority.path_index)
          authority.*
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
      where latest.path_index < 1
        or latest.path_index > v_expected
    )
    and (
      select min(latest.path_index)
      from (
        select distinct on (authority.path_index)
          authority.path_index
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
    ) = 1
    and (
      select max(latest.path_index)
      from (
        select distinct on (authority.path_index)
          authority.path_index
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
    ) = v_expected
  then
    v_state := 'complete';
  end if;

  select public.append_tournament_championship_path_summary_authority(
    p_tournament_id,
    p_registration_id,
    v_expected,
    v_observed,
    v_state,
    p_finalized_at,
    p_source_type,
    p_source_id,
    jsonb_build_object(
      'pathAuthorityOnly', true,
      'campaignEvaluationDeferred', true,
      'divisionSettlement', true
    )
  ) into v_id;

  return v_id;
end;
$function$;

alter function public.refresh_tournament_championship_path_summary(p_tournament_id uuid, p_registration_id uuid, p_source_type text, p_source_id uuid, p_finalized_at timestamp with time zone) owner to postgres;
revoke all on function public.refresh_tournament_championship_path_summary(p_tournament_id uuid, p_registration_id uuid, p_source_type text, p_source_id uuid, p_finalized_at timestamp with time zone) from public, anon, authenticated, service_role;

grant execute on function public.refresh_tournament_championship_path_summary(p_tournament_id uuid, p_registration_id uuid, p_source_type text, p_source_id uuid, p_finalized_at timestamp with time zone) to service_role;

CREATE OR REPLACE FUNCTION public.get_player_badge_bracket_progression_summary(p_player_id uuid)
 RETURNS TABLE(original_bracket text, original_tournament_id uuid, original_completed_at timestamp with time zone, higher_bracket text, higher_tournament_id uuid, higher_completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with qualifying_participation as (
    select distinct
      event.player_id,
      event.tournament_id,
      settlement.settled_at,
      ironclad_private.division_accounting_type(tournament.division_model_version,bracket.name) as bracket_family
    from public.leaderboard_point_events as event
    join public.tournament_brackets as bracket
      on bracket.id = event.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = bracket.id
      and settlement.season_id = event.season_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    join public.registrations as registration
      on registration.id = event.registration_id
      and registration.tournament_id = event.tournament_id
      and registration.tournament_bracket_id = event.tournament_bracket_id
    where event.player_id = p_player_id
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
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
      min(participation.settled_at) as completed_at,
      min(participation.bracket_family) as bracket_family,
      count(distinct participation.bracket_family) as bracket_family_count
    from qualifying_participation as participation
    where participation.bracket_family is not null
    group by participation.tournament_id
  ),
  ordered_tournaments as (
    select
      qualifying.*,
      row_number() over (
        order by qualifying.completed_at, qualifying.tournament_id
      ) as participation_number
    from qualifying_tournaments as qualifying
    where qualifying.bracket_family_count = 1
  ),
  original_tournament as (
    select ordered.*
    from ordered_tournaments as ordered
    where ordered.participation_number = 1
  ),
  threshold_tournament as (
    select ordered.*
    from ordered_tournaments as ordered
    cross join original_tournament as original
    where ordered.participation_number > original.participation_number
      and (
        case ordered.bracket_family when 'academy' then 1 when 'challenge' then 2 when 'main_progression' then 3 when 'main' then 4 when 'pro' then 4 end
        > case original.bracket_family when 'academy' then 1 when 'challenge' then 2 when 'main_progression' then 3 when 'main' then 4 when 'pro' then 4 end
      )
    order by ordered.participation_number
    limit 1
  )
  select
    original.bracket_family,
    original.tournament_id,
    original.completed_at,
    threshold.bracket_family,
    threshold.tournament_id,
    threshold.completed_at
  from original_tournament as original
  left join threshold_tournament as threshold on true;
$function$;

alter function public.get_player_badge_bracket_progression_summary(p_player_id uuid) owner to postgres;
revoke all on function public.get_player_badge_bracket_progression_summary(p_player_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_bracket_progression_summary(p_player_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_player_badge_season_authority_participants(p_season_id uuid)
 RETURNS TABLE(player_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with season_scope as (
    select season.id,season.official_bracket_type
    from public.leaderboard_seasons as season
    where season.id = p_season_id
      and season.finalized_at is not null
      and season.under_review_at is null
  ),
  participation_candidates as (
    select distinct event.player_id
    from public.leaderboard_point_events as event
    join season_scope as season
      on season.id = event.season_id
    join public.leaderboard_division_settlements as settlement
      on settlement.season_id = event.season_id
      and settlement.tournament_bracket_id = event.tournament_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = settlement.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  podium_candidates as (
    select season_stats.player_id
    from public.leaderboard_player_season_stats as season_stats
    join season_scope as season
      on season.id = season_stats.season_id
    where season_stats.bracket_type = season.official_bracket_type
      and season_stats.current_rank <= 3
  ),
  champion_candidates as (
    select champion.player_id
    from public.leaderboard_season_champions as champion
    join season_scope as season
      on season.id = champion.season_id
    where champion.bracket_type = season.official_bracket_type
      and champion.final_rank = 1
  )
  select distinct candidate.player_id
  from (
    select participation.player_id from participation_candidates as participation
    union all
    select podium.player_id from podium_candidates as podium
    union all
    select champion.player_id from champion_candidates as champion
  ) as candidate
  where candidate.player_id is not null;
$function$;

alter function public.get_player_badge_season_authority_participants(p_season_id uuid) owner to postgres;
revoke all on function public.get_player_badge_season_authority_participants(p_season_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_season_authority_participants(p_season_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_player_badge_season_summary(p_player_id uuid)
 RETURNS TABLE(season_campaigner_count integer, first_season_campaigner_season_id uuid, first_season_campaigner_at timestamp with time zone, first_season_campaigner_threshold_tournament_id uuid, first_season_campaigner_tournament_count integer, podium_finish_count integer, first_podium_season_id uuid, first_podium_at timestamp with time zone, first_podium_rank integer, champion_finish_count integer, first_champion_season_id uuid, first_champion_at timestamp with time zone, first_champion_rank integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with finalized_seasons as (
    select season.id, season.finalized_at,season.official_bracket_type
    from public.leaderboard_seasons as season
    where season.finalized_at is not null
      and season.under_review_at is null
  ),
  qualifying_participation as (
    select
      event.season_id,
      event.tournament_id,
      min(settlement.settled_at) as completed_at
    from public.leaderboard_point_events as event
    join finalized_seasons as season
      on season.id = event.season_id
    join public.leaderboard_division_settlements as settlement
      on settlement.season_id = event.season_id
      and settlement.tournament_bracket_id = event.tournament_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = settlement.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.player_id = p_player_id
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
    group by event.season_id, event.tournament_id
  ),
  ranked_participation as (
    select
      participation.*,
      row_number() over (
        partition by participation.season_id
        order by participation.completed_at, participation.tournament_id
      ) as tournament_number,
      count(*) over (
        partition by participation.season_id
      )::integer as season_tournament_count
    from qualifying_participation as participation
  ),
  season_campaigners as (
    select
      ranked.season_id,
      ranked.tournament_id as threshold_tournament_id,
      ranked.completed_at as threshold_completed_at,
      ranked.season_tournament_count
    from ranked_participation as ranked
    where ranked.tournament_number = 4
  ),
  ranked_campaigners as (
    select
      campaigner.*,
      row_number() over (
        order by campaigner.threshold_completed_at, campaigner.season_id
      ) as campaigner_number
    from season_campaigners as campaigner
  ),
  podium_finishes as (
    select
      season_stats.season_id,
      season.finalized_at,
      season_stats.current_rank
    from public.leaderboard_player_season_stats as season_stats
    join finalized_seasons as season
      on season.id = season_stats.season_id
    where season_stats.player_id = p_player_id
      and season_stats.bracket_type = season.official_bracket_type
      and season_stats.current_rank <= 3
  ),
  ranked_podiums as (
    select
      podium.*,
      row_number() over (
        order by podium.finalized_at, podium.season_id
      ) as podium_number
    from podium_finishes as podium
  ),
  champion_finishes as (
    select
      champion.season_id,
      season.finalized_at,
      champion.final_rank
    from public.leaderboard_season_champions as champion
    join finalized_seasons as season
      on season.id = champion.season_id
    where champion.player_id = p_player_id
      and champion.bracket_type = season.official_bracket_type
      and champion.final_rank = 1
  ),
  ranked_champions as (
    select
      champion.*,
      row_number() over (
        order by champion.finalized_at, champion.season_id
      ) as champion_number
    from champion_finishes as champion
  )
  select
    coalesce((select count(*)::integer from ranked_campaigners), 0),
    (select campaigner.season_id from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.threshold_completed_at
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.threshold_tournament_id
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.season_tournament_count
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    coalesce((select count(*)::integer from ranked_podiums), 0),
    (select podium.season_id from ranked_podiums as podium
      where podium.podium_number = 1),
    (select podium.finalized_at from ranked_podiums as podium
      where podium.podium_number = 1),
    (select podium.current_rank from ranked_podiums as podium
      where podium.podium_number = 1),
    coalesce((select count(*)::integer from ranked_champions), 0),
    (select champion.season_id from ranked_champions as champion
      where champion.champion_number = 1),
    (select champion.finalized_at from ranked_champions as champion
      where champion.champion_number = 1),
    (select champion.final_rank from ranked_champions as champion
      where champion.champion_number = 1);
$function$;

alter function public.get_player_badge_season_summary(p_player_id uuid) owner to postgres;
revoke all on function public.get_player_badge_season_summary(p_player_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_season_summary(p_player_id uuid) to service_role;

drop function public.get_player_badge_tournament_prestige_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_player_badge_tournament_prestige_summary(p_player_id uuid)
 RETURNS TABLE(played_advance_win_count integer, first_advance_match_id uuid, first_advance_at timestamp with time zone, semifinalist_count integer, first_semifinal_tournament_id uuid, first_semifinal_at timestamp with time zone, finalist_count integer, first_finalist_tournament_id uuid, first_finalist_at timestamp with time zone, academy_championship_count integer, first_academy_championship_tournament_id uuid, first_academy_championship_at timestamp with time zone, challenge_championship_count integer, first_challenge_championship_tournament_id uuid, first_challenge_championship_at timestamp with time zone, main_championship_count integer, first_main_championship_tournament_id uuid, first_main_championship_at timestamp with time zone, championship_count integer, second_championship_tournament_id uuid, second_championship_at timestamp with time zone, triple_crown_bracket_count integer, triple_crown_tournament_id uuid, triple_crown_at timestamp with time zone, first_main_championship_bracket_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with valid_championship_events as (
    select
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id,
      event.bracket_type,
      settlement.settled_at as completed_at
    from public.leaderboard_point_events as event
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = event.tournament_bracket_id
      and settlement.season_id = event.season_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.player_id = p_player_id
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge', 'main','main_progression','pro')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        event.tournament_id,
        event.tournament_bracket_id,
        event.registration_id
      )
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = p_player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  played_advancement_matches as (
    select
      match.id as match_id,
      coalesce(match.official_result_decided_at, match.updated_at) as advanced_at
    from public.tournament_matches as match
    join public.bracket_rounds as round
      on round.id = match.round_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    join public.registrations as winner
      on winner.id = match.winner_registration_id
      and winner.profile_id = p_player_id
    join public.bracket_rounds as next_round
      on next_round.generated_bracket_id = generated.id
      and next_round.round_number = round.round_number + 1
    join public.tournament_matches as next_match
      on next_match.round_id = next_round.id
      and next_match.match_number = ceil(match.match_number / 2.0)::integer
      and (
        mod(match.match_number, 2) = 1
          and next_match.player_one_registration_id = match.winner_registration_id
        or mod(match.match_number, 2) = 0
          and next_match.player_two_registration_id = match.winner_registration_id
      )
    where tournament.status not in ('cancelled', 'voided')
      and bracket.launched_at is not null
      and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
      and generated.format = 'single_elimination'
      and public.is_tournament_match_played_for_leaderboard(match.id)
  ),
  ranked_advances as (
    select
      advance.*,
      row_number() over (
        order by advance.advanced_at, advance.match_id
      ) as advance_number
    from played_advancement_matches as advance
  ),
  single_elimination_rounds as (
    select
      generated.id as generated_bracket_id,
      bracket.id as tournament_bracket_id,
      bracket.tournament_id,
      settlement.settled_at as completed_at,
      max(round.round_number) as final_round_number
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = bracket.id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    join public.bracket_rounds as round
      on round.generated_bracket_id = generated.id
    where bracket.launched_at is not null
      and bracket.name in ('Academy', 'Challenge', 'Main','Pro')
      and generated.format = 'single_elimination'
    group by
      generated.id,
      bracket.id,
      bracket.tournament_id,
      settlement.settled_at
  ),
  target_round_appearances as (
    select distinct
      round_scope.tournament_id,
      round_scope.completed_at,
      case
        when round.round_number = round_scope.final_round_number - 1
          then 'semifinal'
        when round.round_number = round_scope.final_round_number
          then 'final'
      end as reached_stage
    from single_elimination_rounds as round_scope
    join public.bracket_rounds as round
      on round.generated_bracket_id = round_scope.generated_bracket_id
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id = p_player_id
      and registration.registration_status = 'approved'
    where (
        round.round_number = round_scope.final_round_number
        or round_scope.final_round_number >= 2
          and round.round_number = round_scope.final_round_number - 1
      )
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        round_scope.tournament_id,
        round_scope.tournament_bracket_id,
        registration.id
      )
  ),
  semifinal_tournaments as (
    select appearance.tournament_id, min(appearance.completed_at) as completed_at
    from target_round_appearances as appearance
    where appearance.reached_stage = 'semifinal'
    group by appearance.tournament_id
  ),
  finalist_tournaments as (
    select appearance.tournament_id, min(appearance.completed_at) as completed_at
    from target_round_appearances as appearance
    where appearance.reached_stage = 'final'
    group by appearance.tournament_id
  ),
  ranked_semifinals as (
    select
      semifinal.*,
      row_number() over (
        order by semifinal.completed_at, semifinal.tournament_id
      ) as semifinal_number
    from semifinal_tournaments as semifinal
  ),
  ranked_finals as (
    select
      finalist.*,
      row_number() over (
        order by finalist.completed_at, finalist.tournament_id
      ) as finalist_number
    from finalist_tournaments as finalist
  ),
  championship_tournaments as (
    select event.tournament_id, min(event.completed_at) as completed_at
    from valid_championship_events as event
    group by event.tournament_id
  ),
  ranked_championships as (
    select
      championship.*,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from championship_tournaments as championship
  ),
  academy_championships as (
    select event.tournament_id, min(event.completed_at) as completed_at
    from valid_championship_events as event
    where event.bracket_type = 'academy'
    group by event.tournament_id
  ),
  challenge_championships as (
    select event.tournament_id, min(event.completed_at) as completed_at
    from valid_championship_events as event
    where event.bracket_type = 'challenge'
    group by event.tournament_id
  ),
  main_championships as (
    select event.tournament_id, min(event.completed_at) as completed_at,min(event.bracket_type) as bracket_type
    from valid_championship_events as event
    where event.bracket_type in ('main','main_progression')
    group by event.tournament_id
  ),
  ranked_academy_championships as (
    select
      championship.*,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from academy_championships as championship
  ),
  ranked_challenge_championships as (
    select
      championship.*,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from challenge_championships as championship
  ),
  ranked_main_championships as (
    select
      championship.*,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from main_championships as championship
  ),
  division_firsts as (
    select 'academy'::text as bracket_type,
      championship.tournament_id, championship.completed_at
    from ranked_academy_championships as championship
    where championship.championship_number = 1
    union all
    select 'challenge', championship.tournament_id, championship.completed_at
    from ranked_challenge_championships as championship
    where championship.championship_number = 1
    union all
    select 'main', championship.tournament_id, championship.completed_at
    from ranked_main_championships as championship
    where championship.championship_number = 1
  ),
  triple_crown_source as (
    select firsts.tournament_id, firsts.completed_at
    from division_firsts as firsts
    order by firsts.completed_at desc, firsts.tournament_id desc
    limit 1
  )
  select
    coalesce((select count(*)::integer from ranked_advances), 0),
    (select ranked.match_id from ranked_advances as ranked
      where ranked.advance_number = 1),
    (select ranked.advanced_at from ranked_advances as ranked
      where ranked.advance_number = 1),
    coalesce((select count(*)::integer from ranked_semifinals), 0),
    (select ranked.tournament_id from ranked_semifinals as ranked
      where ranked.semifinal_number = 1),
    (select ranked.completed_at from ranked_semifinals as ranked
      where ranked.semifinal_number = 1),
    coalesce((select count(*)::integer from ranked_finals), 0),
    (select ranked.tournament_id from ranked_finals as ranked
      where ranked.finalist_number = 1),
    (select ranked.completed_at from ranked_finals as ranked
      where ranked.finalist_number = 1),
    coalesce((select count(*)::integer from ranked_academy_championships), 0),
    (select ranked.tournament_id from ranked_academy_championships as ranked
      where ranked.championship_number = 1),
    (select ranked.completed_at from ranked_academy_championships as ranked
      where ranked.championship_number = 1),
    coalesce((select count(*)::integer from ranked_challenge_championships), 0),
    (select ranked.tournament_id from ranked_challenge_championships as ranked
      where ranked.championship_number = 1),
    (select ranked.completed_at from ranked_challenge_championships as ranked
      where ranked.championship_number = 1),
    coalesce((select count(*)::integer from ranked_main_championships), 0),
    (select ranked.tournament_id from ranked_main_championships as ranked
      where ranked.championship_number = 1),
    (select ranked.completed_at from ranked_main_championships as ranked
      where ranked.championship_number = 1),
    coalesce((select count(*)::integer from ranked_championships), 0),
    (select ranked.tournament_id from ranked_championships as ranked
      where ranked.championship_number = 2),
    (select ranked.completed_at from ranked_championships as ranked
      where ranked.championship_number = 2),
    coalesce((select count(*)::integer from division_firsts), 0),
    (select source.tournament_id from triple_crown_source as source
      where (select count(*) from division_firsts) = 3),
    (select source.completed_at from triple_crown_source as source
      where (select count(*) from division_firsts) = 3),
    (select ranked.bracket_type from ranked_main_championships ranked where ranked.championship_number=1);
$function$;

alter function public.get_player_badge_tournament_prestige_summary(p_player_id uuid) owner to postgres;
revoke all on function public.get_player_badge_tournament_prestige_summary(p_player_id uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_tournament_prestige_summary(p_player_id uuid) to service_role;

create function ironclad_private.guard_leaderboard_event_model()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_model text; v_expected text; v_authority text;
begin
 if new.tournament_id is null then return new; end if;
 select division_model_version into v_model from public.tournaments where id=new.tournament_id;
 select official_bracket_type into v_authority from public.leaderboard_seasons where id=new.season_id;
 if v_model is not null and v_authority is distinct from (case when v_model='legacy_three_v1' then 'main' else 'pro' end) then
   raise exception 'Point history and season authority do not match' using errcode='23514';
 end if;
 if new.tournament_bracket_id is not null then
   select ironclad_private.division_accounting_type(v_model,name) into v_expected from public.tournament_brackets where id=new.tournament_bracket_id and tournament_id=new.tournament_id;
   if v_expected is null or (new.bracket_type is distinct from v_expected and not (new.source='admin' and new.bracket_type='overall')) then
     raise exception 'Point accounting type does not match its competition model' using errcode='23514';
   end if;
 end if;
 return new;
end; $$;
revoke all on function ironclad_private.guard_leaderboard_event_model() from public,anon,authenticated,service_role;
create trigger leaderboard_point_events_model_guard before insert or update of tournament_id,tournament_bracket_id,season_id,bracket_type,source on public.leaderboard_point_events for each row execute function ironclad_private.guard_leaderboard_event_model();

commit;
