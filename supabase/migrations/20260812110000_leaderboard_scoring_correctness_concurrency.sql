begin;

-- Database-owned lifecycle work (including pg_cron) has no request JWT. Keep
-- the existing request checks and permit only a direct postgres session to
-- enter the already service-role-only leaderboard write boundary.
create or replace function public.leaderboard_require_write_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user = 'postgres' then
    return;
  end if;

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

alter function public.leaderboard_require_write_access()
  owner to postgres;
revoke all on function public.leaderboard_require_write_access()
  from public, anon, authenticated;
grant execute on function public.leaderboard_require_write_access()
  to service_role;

-- A played match requires two competitors and a scored official result. Match
-- outcome rows represent bracket progression only, while an accepted no-show
-- report remains administrative even though it stores a synthetic score.
create or replace function public.is_tournament_match_played_for_leaderboard(
  p_match_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select
      match.status = 'completed'
      and match.outcome_type is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and match.player_one_score is not null
      and match.player_two_score is not null
      and match.winner_registration_id is not null
      and not exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = match.id
          and report_group.result_type = 'no_show'
          and report_group.finalized_at is not null
          and report_group.status in (
            'confirmed',
            'auto_approved',
            'approved'
          )
          and report_group.no_show_status in (
            'confirmed',
            'auto_confirmed',
            'approved'
          )
      )
    from public.tournament_matches as match
    where match.id = p_match_id
  ), false);
$$;

alter function public.is_tournament_match_played_for_leaderboard(uuid)
  owner to postgres;
revoke all on function
  public.is_tournament_match_played_for_leaderboard(uuid)
  from public, anon, authenticated, service_role;

-- Serialize the global cache without replacing its proven aggregation core.
do $$
begin
  if pg_catalog.to_regprocedure(
    'public.recalculate_leaderboard_all_time_without_concurrency_lock(text)'
  ) is null then
    alter function public.recalculate_leaderboard_all_time(text)
      rename to recalculate_leaderboard_all_time_without_concurrency_lock;
  end if;
end;
$$;

alter function
  public.recalculate_leaderboard_all_time_without_concurrency_lock(text)
  owner to postgres;
alter function
  public.recalculate_leaderboard_all_time_without_concurrency_lock(text)
  set search_path = pg_catalog;
revoke all on function
  public.recalculate_leaderboard_all_time_without_concurrency_lock(text)
  from public, anon, authenticated, service_role;

create or replace function public.recalculate_leaderboard_all_time(
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  return public.recalculate_leaderboard_all_time_without_concurrency_lock(
    p_triggered_by_clerk_user_id
  );
end;
$$;

alter function public.recalculate_leaderboard_all_time(text)
  owner to postgres;
revoke all on function public.recalculate_leaderboard_all_time(text)
  from public, anon, authenticated;
grant execute on function public.recalculate_leaderboard_all_time(text)
  to service_role;

-- Preserve the deployed Academy-aware season core. Correct its played-match
-- projection, compute true competitive ranks after that correction, and lock
-- the season before any snapshot/rebuild work starts.
create or replace function public.recalculate_leaderboard_for_season(
  p_season_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
      and event.bracket_type in ('academy', 'main', 'challenge')
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
$$;

alter function public.recalculate_leaderboard_for_season(uuid, text)
  owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season(uuid, text)
  from public, anon, authenticated;
grant execute on function public.recalculate_leaderboard_for_season(uuid, text)
  to service_role;

-- Preserve the deployed tournament event rebuild and progression awards. Lock
-- the tournament before the hidden core snapshots/deletes/reinserts. The
-- participation cleanup deliberately differs from played-match statistics:
-- an accepted no-show's legitimate opponent keeps participation, while the
-- existing event trigger suppresses only the defaulting player.
create or replace function public.recalculate_leaderboard_for_tournament(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_run_status text;
  v_season_id uuid;
  v_deleted_participation_count integer;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
begin
  perform public.leaderboard_require_write_access();
  -- Tournament rebuilds flow into season and all-time caches. Acquire the
  -- shared root first; nested season/all-time calls reacquire it safely within
  -- the same transaction before taking their narrower locks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:tournament:'
        || coalesce(p_tournament_id::text, 'null'),
      0
    )
  );

  -- `automatic_bye` remains progression (`round_passed`) and can produce the
  -- Final `tournament_win`; `deadline_double_forfeit` and `empty_feeder`
  -- provide no winner. Played-match filtering is delegated to the season
  -- calculation after canonical point-event generation.
  perform count(*)
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where bracket.tournament_id = p_tournament_id
    and match.outcome_type in (
      'automatic_bye',
      'deadline_double_forfeit',
      'empty_feeder'
    );

  v_run_id :=
    public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
      p_tournament_id,
      p_triggered_by_clerk_user_id
    );

  select run.status, run.season_id
  into v_run_status, v_season_id
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  with result_match_counts as (
    select
      generated.tournament_bracket_id,
      participant.registration_id,
      count(distinct match.id)::integer as result_match_count
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
      and bracket.tournament_id = p_tournament_id
    join public.tournament_matches as match
      on match.generated_bracket_id = generated.id
      and match.status = 'completed'
      and match.outcome_type is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and match.player_one_score is not null
      and match.player_two_score is not null
      and match.winner_registration_id is not null
    join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
      on participant.registration_id is not null
    group by
      generated.tournament_bracket_id,
      participant.registration_id
  ),
  ranked_participation as (
    select
      event.id,
      row_number() over (
        partition by
          event.registration_id,
          event.tournament_bracket_id
        order by event.created_at, event.id
      ) as participation_number,
      coalesce(result_count.result_match_count, 0) as result_match_count
    from public.leaderboard_point_events as event
    left join result_match_counts as result_count
      on result_count.tournament_bracket_id = event.tournament_bracket_id
      and result_count.registration_id = event.registration_id
    where event.tournament_id = p_tournament_id
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
  )
  delete from public.leaderboard_point_events as event
  using ranked_participation as ranked
  where event.id = ranked.id
    and ranked.participation_number > ranked.result_match_count;

  get diagnostics v_deleted_participation_count = row_count;

  if v_deleted_participation_count > 0 and v_season_id is not null then
    v_season_run_id := public.recalculate_leaderboard_for_season(
      v_season_id,
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_season_run_status, v_season_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'Outcome-aware participation recalculation failed: %s',
          coalesce(
            nullif(v_season_run_notes, ''),
            v_season_run_status,
            'unknown'
          )
        )
      where id = v_run_id;
    end if;
  end if;

  return v_run_id;
end;
$$;

alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  to service_role;

-- Tournament lifecycle can first reach completed before the enclosing result
-- workflow finalizes no-show metadata or refreshes round-robin state. Defer the
-- one shared scoring boundary until the outer transaction is otherwise done.
-- A correction reset keeps the last completed publication intact; corrected
-- re-completion crosses this same boundary and replaces it deterministically.
create or replace function
  public.recalculate_leaderboard_on_tournament_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_run_id uuid;
  v_run_status text;
  v_error_state text;
begin
  -- Leaderboard caches are a derived projection. Preserve the authoritative
  -- result transaction if projection repair fails, while leaving either the
  -- recalculation function's failed run or a best-effort sanitized fallback
  -- run for the existing manual administrator recovery path.
  begin
    select tournament.status
    into v_status
    from public.tournaments as tournament
    where tournament.id = new.id;

    if v_status = 'completed' then
      v_run_id := public.recalculate_leaderboard_for_tournament(new.id, null);

      select run.status
      into v_run_status
      from public.leaderboard_recalculation_runs as run
      where run.id = v_run_id;

      if v_run_status is distinct from 'completed' then
        return null;
      end if;
    end if;
  exception
    when query_canceled or assert_failure or others then
      get stacked diagnostics v_error_state = returned_sqlstate;

      begin
        insert into public.leaderboard_recalculation_runs (
          tournament_id,
          scope,
          status,
          finished_at,
          notes
        )
        values (
          new.id,
          'tournament',
          'failed',
          now(),
          format(
            'Automatic tournament leaderboard recalculation failed: SQLSTATE %s',
            coalesce(v_error_state, 'unknown')
          )
        );
      exception
        when query_canceled or assert_failure or others then
          raise warning using message = format(
            'Automatic leaderboard failure audit could not be persisted: SQLSTATE %s',
            coalesce(v_error_state, 'unknown')
          );
      end;
  end;

  return null;
end;
$$;

alter function public.recalculate_leaderboard_on_tournament_completion()
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_on_tournament_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_recalculate_leaderboard_on_completion
  on public.tournaments;
create constraint trigger tournaments_recalculate_leaderboard_on_completion
after update of status on public.tournaments
deferrable initially deferred
for each row
when (
  old.status is distinct from 'completed'
  and new.status = 'completed'
)
execute function public.recalculate_leaderboard_on_tournament_completion();

commit;
