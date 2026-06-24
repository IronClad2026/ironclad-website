-- Improve leaderboard recalculation diagnostics without changing scoring.
--
-- Previous parent functions raised after dependent run failure. Because those
-- calls happened inside PL/pgSQL exception blocks, the dependent season/all-time
-- run rows could be rolled back before admins could inspect the real SQL error.
-- This migration records detailed SQL errors, preserves child run rows, and
-- restores prior cached/event state when dependent recalculation fails.

create or replace function public.recalculate_leaderboard_all_time(
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_error_message text;
  v_error_state text;
  v_error_context text;
begin
  perform public.leaderboard_require_write_access();

  insert into public.leaderboard_recalculation_runs (
    scope,
    status,
    triggered_by_clerk_user_id
  )
  values (
    'all_time',
    'pending',
    nullif(btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_run_id;

  begin
    delete from public.leaderboard_player_all_time_stats
    where true;

    insert into public.leaderboard_player_all_time_stats (
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
      best_season_rank,
      last_active_season_id
    )
    with latest_season as (
      select distinct on (season_stats.player_id, season_stats.bracket_type)
        season_stats.player_id,
        season_stats.bracket_type,
        season_stats.season_id
      from public.leaderboard_player_season_stats as season_stats
      join public.leaderboard_seasons as season
        on season.id = season_stats.season_id
      order by
        season_stats.player_id,
        season_stats.bracket_type,
        season.end_date desc,
        season.start_date desc,
        season_stats.updated_at desc
    )
    select
      season_stats.player_id,
      season_stats.bracket_type,
      coalesce(sum(season_stats.total_points), 0)::integer,
      coalesce(sum(season_stats.tournaments_played), 0)::integer,
      coalesce(sum(season_stats.rounds_passed), 0)::integer,
      coalesce(sum(season_stats.tournament_wins), 0)::integer,
      coalesce(sum(season_stats.matches_played), 0)::integer,
      coalesce(sum(season_stats.matches_won), 0)::integer,
      coalesce(sum(season_stats.matches_lost), 0)::integer,
      case
        when coalesce(sum(season_stats.matches_played), 0) = 0 then 0
        else round(
          (
            sum(season_stats.matches_won)::numeric /
            nullif(sum(season_stats.matches_played), 0)
          ) * 100,
          2
        )
      end,
      min(season_stats.current_rank) filter (
        where season_stats.current_rank is not null
      ),
      latest_season.season_id
    from public.leaderboard_player_season_stats as season_stats
    left join latest_season
      on latest_season.player_id = season_stats.player_id
      and latest_season.bracket_type = season_stats.bracket_type
    group by
      season_stats.player_id,
      season_stats.bracket_type,
      latest_season.season_id;

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
          'All-time leaderboard recalculation failed: SQLSTATE %s: %s%s',
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
$$;

create or replace function public.recalculate_leaderboard_for_season(
  p_season_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        and event.bracket_type in ('main', 'challenge')
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
      union all
      select
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.tournament_id,
        event.points,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.bracket_type in ('main', 'challenge')
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
        and event.bracket_type in ('main', 'challenge')
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
$$;

create or replace function public.recalculate_leaderboard_for_tournament(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_tournament public.tournaments%rowtype;
  v_effective_date date;
  v_season_id uuid;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
  v_affected_old_season_ids uuid[] := array[]::uuid[];
  v_affected_old_season_id uuid;
  v_notes text;
  v_error_message text;
  v_error_state text;
  v_error_context text;
begin
  perform public.leaderboard_require_write_access();

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
    nullif(btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_run_id;

  begin
    select tournament.*
    into v_tournament
    from public.tournaments as tournament
    where tournament.id = p_tournament_id;

    if not found then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = 'Tournament not found'
      where id = v_run_id;

      return v_run_id;
    end if;

    if v_tournament.status <> 'completed' then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = 'Tournament is not completed; leaderboard points were not changed'
      where id = v_run_id;

      return v_run_id;
    end if;

    v_effective_date := coalesce(
      v_tournament.grand_final_at,
      v_tournament.created_at,
      v_tournament.updated_at,
      now()
    )::date;
    v_season_id := public.get_or_create_leaderboard_season(v_effective_date);

    update public.leaderboard_recalculation_runs
    set season_id = v_season_id
    where id = v_run_id;

    select coalesce(array_agg(distinct event.season_id), array[]::uuid[])
    into v_affected_old_season_ids
    from public.leaderboard_point_events as event
    where event.tournament_id = p_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type <> 'admin_adjustment';

    drop table if exists pg_temp.leaderboard_existing_tournament_events;
    create temporary table leaderboard_existing_tournament_events
    on commit drop
    as
    select *
    from public.leaderboard_point_events as event
    where event.tournament_id = p_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type <> 'admin_adjustment';

    drop table if exists pg_temp.leaderboard_existing_affected_season_stats;
    create temporary table leaderboard_existing_affected_season_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats as season_stats
    where season_stats.season_id = v_season_id
      or season_stats.season_id = any(v_affected_old_season_ids);

    drop table if exists pg_temp.leaderboard_existing_all_time_stats;
    create temporary table leaderboard_existing_all_time_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_all_time_stats;

    delete from public.leaderboard_point_events
    where tournament_id = p_tournament_id
      and source in ('system', 'recalculation')
      and event_type <> 'admin_adjustment';

    drop table if exists pg_temp.leaderboard_recalc_brackets;
    create temporary table leaderboard_recalc_brackets
    on commit drop
    as
    select
      bracket.id as tournament_bracket_id,
      bracket.name as bracket_name,
      case
        when bracket.name = 'Main' then 'main'
        when bracket.name = 'Challenge' then 'challenge'
        else null
      end as bracket_type,
      generated.id as generated_bracket_id,
      generated.format,
      case when bracket.name = 'Main' then 10 else 10 end
        as participation_points,
      case when bracket.name = 'Main' then 5 else 2 end
        as round_passed_points,
      case when bracket.name = 'Main' then 5 else 3 end
        as tournament_win_points
    from public.tournament_brackets as bracket
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.tournament_id = p_tournament_id
      and bracket.name in ('Main', 'Challenge');

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
    select distinct
      v_season_id,
      p_tournament_id,
      bracket.tournament_bracket_id,
      registration.id,
      registration.profile_id,
      bracket.bracket_type,
      bracket.participation_points,
      'participation',
      'Participation points for completed match participation',
      'recalculation',
      nullif(btrim(p_triggered_by_clerk_user_id), '')
    from leaderboard_recalc_brackets as bracket
    join public.tournament_matches as match
      on match.generated_bracket_id = bracket.generated_bracket_id
      and match.status = 'completed'
    join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
      on participant.registration_id is not null
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
    where bracket.bracket_type in ('main', 'challenge');

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
    with final_rounds as (
      select
        bracket.generated_bracket_id,
        max(round.round_number) as final_round_number
      from leaderboard_recalc_brackets as bracket
      join public.bracket_rounds as round
        on round.generated_bracket_id = bracket.generated_bracket_id
      where bracket.format = 'single_elimination'
      group by bracket.generated_bracket_id
    )
    select
      v_season_id,
      p_tournament_id,
      bracket.tournament_bracket_id,
      registration.id,
      registration.profile_id,
      bracket.bracket_type,
      bracket.round_passed_points,
      'round_passed',
      'Round passed points for non-final single-elimination match win',
      'recalculation',
      nullif(btrim(p_triggered_by_clerk_user_id), '')
    from leaderboard_recalc_brackets as bracket
    join final_rounds
      on final_rounds.generated_bracket_id = bracket.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = bracket.generated_bracket_id
      and round.round_number < final_rounds.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
    where bracket.bracket_type in ('main', 'challenge');

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
    with final_rounds as (
      select
        bracket.generated_bracket_id,
        max(round.round_number) as final_round_number
      from leaderboard_recalc_brackets as bracket
      join public.bracket_rounds as round
        on round.generated_bracket_id = bracket.generated_bracket_id
      where bracket.format = 'single_elimination'
      group by bracket.generated_bracket_id
    )
    select
      v_season_id,
      p_tournament_id,
      bracket.tournament_bracket_id,
      registration.id,
      registration.profile_id,
      bracket.bracket_type,
      bracket.tournament_win_points,
      'tournament_win',
      'Tournament winner bonus for final single-elimination match win',
      'recalculation',
      nullif(btrim(p_triggered_by_clerk_user_id), '')
    from leaderboard_recalc_brackets as bracket
    join final_rounds
      on final_rounds.generated_bracket_id = bracket.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = bracket.generated_bracket_id
      and round.round_number = final_rounds.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
    where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'single_elimination';

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
    with rank_one as (
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
      where standing.rank = 1
      group by standing.generated_bracket_id
    )
    select
      v_season_id,
      p_tournament_id,
      bracket.tournament_bracket_id,
      registration.id,
      registration.profile_id,
      bracket.bracket_type,
      bracket.tournament_win_points,
      'tournament_win',
      'Tournament winner bonus for completed round-robin rank 1',
      'recalculation',
      nullif(btrim(p_triggered_by_clerk_user_id), '')
    from leaderboard_recalc_brackets as bracket
    join rank_one
      on rank_one.generated_bracket_id = bracket.generated_bracket_id
      and rank_one.rank_one_count = 1
    join public.registrations as registration
      on registration.id = rank_one.winner_registration_id
      and registration.profile_id is not null
    where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'round_robin';

    select string_agg(
      bracket.bracket_name || ' bracket winner could not be determined safely',
      '; '
    )
    into v_notes
    from leaderboard_recalc_brackets as bracket
    where not exists (
      select 1
      from public.leaderboard_point_events as event
      where event.season_id = v_season_id
        and event.tournament_id = p_tournament_id
        and event.tournament_bracket_id = bracket.tournament_bracket_id
        and event.event_type = 'tournament_win'
        and event.source = 'recalculation'
    );

    v_season_run_id := public.recalculate_leaderboard_for_season(
      v_season_id,
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_season_run_status, v_season_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      delete from public.leaderboard_point_events
      where tournament_id = p_tournament_id
        and source in ('system', 'recalculation')
        and event_type <> 'admin_adjustment';

      insert into public.leaderboard_point_events (
        id,
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
        created_by_clerk_user_id,
        created_at
      )
      select
        id,
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
        created_by_clerk_user_id,
        created_at
      from leaderboard_existing_tournament_events;

      delete from public.leaderboard_player_season_stats
      where season_id = v_season_id
        or season_id = any(v_affected_old_season_ids);

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
      from leaderboard_existing_affected_season_stats;

      delete from public.leaderboard_player_all_time_stats
      where true;

      insert into public.leaderboard_player_all_time_stats (
        id,
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
        best_season_rank,
        last_active_season_id,
        updated_at
      )
      select
        id,
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
        best_season_rank,
        last_active_season_id,
        updated_at
      from leaderboard_existing_all_time_stats;

      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'Season leaderboard recalculation failed: %s',
          coalesce(
            nullif(v_season_run_notes, ''),
            'status ' || coalesce(v_season_run_status, 'unknown')
          )
        )
      where id = v_run_id;

      return v_run_id;
    end if;

    foreach v_affected_old_season_id in array v_affected_old_season_ids
    loop
      continue when v_affected_old_season_id = v_season_id;

      v_season_run_id := public.recalculate_leaderboard_for_season(
        v_affected_old_season_id,
        p_triggered_by_clerk_user_id
      );

      select run.status, run.notes
      into v_season_run_status, v_season_run_notes
      from public.leaderboard_recalculation_runs as run
      where run.id = v_season_run_id;

      if v_season_run_status is distinct from 'completed' then
        delete from public.leaderboard_point_events
        where tournament_id = p_tournament_id
          and source in ('system', 'recalculation')
          and event_type <> 'admin_adjustment';

        insert into public.leaderboard_point_events (
          id,
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
          created_by_clerk_user_id,
          created_at
        )
        select
          id,
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
          created_by_clerk_user_id,
          created_at
        from leaderboard_existing_tournament_events;

        delete from public.leaderboard_player_season_stats
        where season_id = v_season_id
          or season_id = any(v_affected_old_season_ids);

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
        from leaderboard_existing_affected_season_stats;

        delete from public.leaderboard_player_all_time_stats
        where true;

        insert into public.leaderboard_player_all_time_stats (
          id,
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
          best_season_rank,
          last_active_season_id,
          updated_at
        )
        select
          id,
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
          best_season_rank,
          last_active_season_id,
          updated_at
        from leaderboard_existing_all_time_stats;

        update public.leaderboard_recalculation_runs
        set
          status = 'failed',
          finished_at = now(),
          notes = format(
            'Affected leaderboard season recalculation failed: %s',
            coalesce(
              nullif(v_season_run_notes, ''),
              'status ' || coalesce(v_season_run_status, 'unknown')
            )
          )
        where id = v_run_id;

        return v_run_id;
      end if;
    end loop;

    update public.leaderboard_recalculation_runs
    set
      status = 'completed',
      finished_at = now(),
      notes = v_notes
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
          'Tournament leaderboard recalculation failed: SQLSTATE %s: %s%s',
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
$$;
