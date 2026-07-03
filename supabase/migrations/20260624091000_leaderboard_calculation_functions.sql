begin;

create or replace function public.leaderboard_require_write_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;

  if coalesce(auth.role(), '') = 'authenticated'
    and public.is_admin_jwt() then
    return;
  end if;

  raise exception 'Leaderboard administrator permission is required'
    using errcode = '42501';
end;
$$;

create or replace function public.get_or_create_leaderboard_season(
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_year integer;
  v_season_number integer;
  v_start_date date;
  v_end_date date;
  v_name text;
  v_season_id uuid;
begin
  perform public.leaderboard_require_write_access();

  v_year := extract(year from v_date)::integer;
  v_season_number := case when v_date <= make_date(v_year, 6, 30) then 1 else 2 end;
  v_start_date := case
    when v_season_number = 1 then make_date(v_year, 1, 1)
    else make_date(v_year, 7, 1)
  end;
  v_end_date := case
    when v_season_number = 1 then make_date(v_year, 6, 30)
    else make_date(v_year, 12, 31)
  end;
  v_name := v_year::text || ' Season ' || v_season_number::text;

  insert into public.leaderboard_seasons (
    name,
    year,
    season_number,
    start_date,
    end_date,
    is_active
  )
  values (
    v_name,
    v_year,
    v_season_number,
    v_start_date,
    v_end_date,
    false
  )
  on conflict (year, season_number)
  do update set
    name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date
  returning id into v_season_id;

  if current_date between v_start_date and v_end_date then
    update public.leaderboard_seasons
    set is_active = false
    where is_active
      and id <> v_season_id;

    update public.leaderboard_seasons
    set is_active = true
    where id = v_season_id
      and is_active = false;
  end if;

  return v_season_id;
end;
$$;

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
    delete from public.leaderboard_player_all_time_stats;

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
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = sqlerrm
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
          order by sort_at desc, tournament_id
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
            player.id
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

    select run.status
    into v_all_time_run_status
    from public.leaderboard_recalculation_runs as run
    where run.id = v_all_time_run_id;

    if v_all_time_run_status is distinct from 'completed' then
      raise exception 'All-time leaderboard recalculation failed';
    end if;

    update public.leaderboard_recalculation_runs
    set
      status = 'completed',
      finished_at = now()
    where id = v_run_id;
  exception
    when others then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = sqlerrm
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
  v_affected_old_season_ids uuid[] := array[]::uuid[];
  v_affected_old_season_id uuid;
  v_notes text;
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
        min(standing.registration_id) as winner_registration_id
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

    select run.status
    into v_season_run_status
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      raise exception 'Season leaderboard recalculation failed';
    end if;

    foreach v_affected_old_season_id in array v_affected_old_season_ids
    loop
      continue when v_affected_old_season_id = v_season_id;

      v_season_run_id := public.recalculate_leaderboard_for_season(
        v_affected_old_season_id,
        p_triggered_by_clerk_user_id
      );

      select run.status
      into v_season_run_status
      from public.leaderboard_recalculation_runs as run
      where run.id = v_season_run_id;

      if v_season_run_status is distinct from 'completed' then
        raise exception 'Affected leaderboard season recalculation failed';
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
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = sqlerrm
      where id = v_run_id;
  end;

  return v_run_id;
end;
$$;

create or replace function public.add_leaderboard_admin_adjustment(
  p_season_id uuid,
  p_player_id uuid,
  p_bracket_type text,
  p_points integer,
  p_description text default null,
  p_tournament_id uuid default null,
  p_tournament_bracket_id uuid default null,
  p_registration_id uuid default null,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_season_run_id uuid;
  v_season_run_status text;
begin
  perform public.leaderboard_require_write_access();

  if not exists (
    select 1
    from public.leaderboard_seasons
    where id = p_season_id
  ) then
    raise exception 'Leaderboard season not found';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id
  ) then
    raise exception 'Player not found';
  end if;

  if p_bracket_type not in ('main', 'challenge', 'overall') then
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
    nullif(btrim(p_description), ''),
    'admin',
    nullif(btrim(p_triggered_by_clerk_user_id), '')
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
$$;

revoke all on function public.leaderboard_require_write_access()
  from public;
revoke all on function public.get_or_create_leaderboard_season(date)
  from public;
revoke all on function public.recalculate_leaderboard_for_tournament(uuid, text)
  from public;
revoke all on function public.recalculate_leaderboard_for_season(uuid, text)
  from public;
revoke all on function public.recalculate_leaderboard_all_time(text)
  from public;
revoke all on function public.add_leaderboard_admin_adjustment(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  uuid,
  uuid,
  text
) from public;

grant execute on function public.leaderboard_require_write_access()
  to authenticated, service_role;
grant execute on function public.get_or_create_leaderboard_season(date)
  to authenticated, service_role;
grant execute on function public.recalculate_leaderboard_for_tournament(uuid, text)
  to authenticated, service_role;
grant execute on function public.recalculate_leaderboard_for_season(uuid, text)
  to authenticated, service_role;
grant execute on function public.recalculate_leaderboard_all_time(text)
  to authenticated, service_role;
grant execute on function public.add_leaderboard_admin_adjustment(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  uuid,
  uuid,
  text
) to authenticated, service_role;

comment on function public.recalculate_leaderboard_for_tournament(uuid, text) is
  'Rebuilds system/recalculation leaderboard point events for one completed tournament, preserving admin adjustments. Single-elimination final wins receive tournament_win only; round-robin round_passed points are intentionally not awarded in Phase 3.';
comment on function public.recalculate_leaderboard_for_season(uuid, text) is
  'Rebuilds cached season standings from leaderboard_point_events and recalculates all-time stats.';
comment on function public.add_leaderboard_admin_adjustment(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  uuid,
  uuid,
  text
) is
  'Adds a manual admin leaderboard point adjustment and rebuilds the affected season/all-time caches.';

commit;
