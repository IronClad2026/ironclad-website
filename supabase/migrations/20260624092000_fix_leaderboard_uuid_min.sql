-- Fix round-robin winner selection in leaderboard tournament recalculation.
-- PostgreSQL does not support min(uuid); use a deterministic ordered subquery
-- while preserving the existing "exactly one rank 1" safety check.

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
