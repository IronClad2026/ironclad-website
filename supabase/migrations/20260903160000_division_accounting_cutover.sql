begin;

-- PR 5 established this private receipt as the once-per-Division settlement
-- identity. PR 7 activates it; competitive truth remains in the launched
-- generated bracket and official result authorities.
alter table public.leaderboard_division_settlements
  force row level security;

-- Database-owned triggers execute as their ungranted security-definer owner
-- but retain the request session identity. Let those trusted trigger chains
-- reuse the existing season/projection helpers; direct callers still require
-- postgres, service-role, or the existing authenticated Admin claim.
create or replace function public.leaderboard_require_write_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user = 'postgres' or pg_catalog.pg_trigger_depth() > 0 then
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

-- Keep the existing six-Main season authority. Finalization now snapshots the
-- complete podium and immediately leaves one active successor season. Repeated
-- calls only repair a missing derived snapshot/successor and never move points.
create or replace function public.finalize_leaderboard_main_season_if_ready(
  p_season_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_finalized_at timestamptz;
  v_event_count integer;
  v_next_season_id uuid;
begin
  select season.finalized_at
  into v_finalized_at
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
    'main',
    season_stats.current_rank,
    season_stats.total_points
  from public.leaderboard_player_season_stats as season_stats
  where season_stats.season_id = p_season_id
    and season_stats.bracket_type = 'main'
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
$$;

alter function public.finalize_leaderboard_main_season_if_ready(uuid)
  owner to postgres;
revoke all on function public.finalize_leaderboard_main_season_if_ready(uuid)
  from public, anon, authenticated, service_role;

-- The PR 5 calculator is the one scoring-rule implementation. This function
-- is the single writer which reconciles one completed Division into the
-- existing point ledger and existing season/all-time projections.
create or replace function public.settle_leaderboard_division(
  p_tournament_bracket_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_bracket_name text;
  v_bracket_type text;
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
    case bracket.name
      when 'Academy' then 'academy'
      when 'Challenge' then 'challenge'
      when 'Main' then 'main'
    end,
    bracket.launched_at
  into
    v_tournament_id,
    v_tournament_status,
    v_bracket_name,
    v_bracket_type,
    v_launched_at
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and bracket.name in ('Academy', 'Challenge', 'Main')
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
  elsif v_bracket_type = 'main' then
    select membership.season_id, membership.qualifying_event_number
    into v_season_id, v_event_number
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = v_tournament_id
      and membership.voided_at is null
    for update;

    if v_season_id is null or v_event_number is null then
      select season.id
      into v_season_id
      from public.leaderboard_seasons as season
      where season.is_active
        and season.finalized_at is null
        and (
          select count(*)
          from public.leaderboard_tournament_season_memberships as membership
          where membership.season_id = season.id
            and membership.qualifying_event_number is not null
            and membership.voided_at is null
        ) < 6
      order by season.created_at, season.id
      limit 1;

      if v_season_id is null then
        v_season_id := public.get_or_create_leaderboard_season(
          v_effective_completed_at::date
        );
      end if;

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
    select season.id
    into v_season_id
    from public.leaderboard_seasons as season
    where season.is_active
      and season.finalized_at is null
    order by season.created_at, season.id
    limit 1;

    if v_season_id is null then
      v_season_id := public.get_or_create_leaderboard_season(
        v_effective_completed_at::date
      );
    end if;
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

  if v_bracket_type = 'main' then
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
$$;

alter function public.settle_leaderboard_division(uuid, text)
  owner to postgres;
revoke all on function public.settle_leaderboard_division(uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_leaderboard_division(uuid, text)
  to service_role;

-- The established event recalculation entry point becomes a coordinator over
-- the one Division writer. It never invokes the old event-wide point writer.
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
        and bracket.name in ('Academy', 'Challenge', 'Main')
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
$$;

alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  to service_role;

-- Completion is checked at the end of the official-result transaction so
-- report/submission authority has reached its final state. Failure is audited
-- through the existing recalculation-run repair path and never invents a
-- second queue or compromises the authoritative result commit.
create or replace function public.settle_leaderboard_division_on_match_result()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_tournament_bracket_id uuid;
  v_error_state text;
begin
  select bracket.tournament_id, bracket.id
  into v_tournament_id, v_tournament_bracket_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = new.generated_bracket_id;

  if v_tournament_bracket_id is null
    or public.is_generated_bracket_complete(new.generated_bracket_id)
      is distinct from true then
    return null;
  end if;

  begin
    -- A result transaction already owns the final match row. Never wait behind
    -- a concurrent manual settlement that may itself be waiting for that row;
    -- record the existing repair signal and let the authoritative result
    -- commit. An uncontended trigger re-enters these transaction locks inside
    -- the canonical writer.
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
    ) then
      raise exception 'Division settlement is already in progress'
        using errcode = '55P03';
    end if;
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:leaderboard:division:' || v_tournament_bracket_id::text,
        0
      )
    ) then
      raise exception 'Division settlement is already in progress'
        using errcode = '55P03';
    end if;

    perform public.settle_leaderboard_division(
      v_tournament_bracket_id,
      null
    );
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
          v_tournament_id,
          'tournament',
          'failed',
          clock_timestamp(),
          format(
            'Automatic Division settlement failed: SQLSTATE %s',
            coalesce(v_error_state, 'unknown')
          )
        );
      exception
        when query_canceled or assert_failure or others then
          raise warning using message = format(
            'Automatic Division settlement audit failed: SQLSTATE %s',
            coalesce(v_error_state, 'unknown')
          );
      end;
  end;

  return null;
end;
$$;

alter function public.settle_leaderboard_division_on_match_result()
  owner to postgres;
revoke all on function public.settle_leaderboard_division_on_match_result()
  from public, anon, authenticated, service_role;

drop trigger if exists tournament_matches_settle_completed_division
  on public.tournament_matches;
create constraint trigger tournament_matches_settle_completed_division
after insert or update of status, winner_registration_id
on public.tournament_matches
deferrable initially deferred
for each row
execute function public.settle_leaderboard_division_on_match_result();

comment on function public.settle_leaderboard_division(uuid, text) is
  'Canonical service-role-only Division accounting writer. Reuses the PR 5 calculator, existing point ledger, season/all-time recalculation, and one durable receipt per completed Division.';
comment on function public.recalculate_leaderboard_for_tournament(uuid, text) is
  'Event-scoped repair coordinator which invokes only the canonical Division settlement writer and never creates event-wide point events directly.';

-- Badge impact classification C: only completion evidence moves from the
-- parent Event boundary to the accepted Division settlement receipt. The
-- existing evaluator, immutable award store, uniqueness, notification writer,
-- reconciliation worker, and Reveal acknowledgement remain unchanged.
create or replace function public.get_player_badge_tournament_for_match(
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
  select bracket.tournament_id
  from public.tournament_matches as tournament_match
  join public.generated_brackets as generated
    on generated.id = tournament_match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.leaderboard_division_settlements as settlement
    on settlement.tournament_bracket_id = bracket.id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
    and tournament.status not in ('cancelled', 'voided')
  where tournament_match.id = p_match_id;
$$;

alter function public.get_player_badge_tournament_for_match(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_for_match(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_for_match(uuid)
  to service_role;

create or replace function
  public.get_player_badge_tournament_authority_participants(
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
  join public.leaderboard_division_settlements as settlement
    on settlement.tournament_bracket_id = event.tournament_bracket_id
    and settlement.season_id = event.season_id
  join public.tournaments as tournament
    on tournament.id = event.tournament_id
    and tournament.status not in ('cancelled', 'voided')
  where event.tournament_id = p_tournament_id
    and event.event_type in ('participation', 'tournament_win')
    and event.source in ('system', 'recalculation')
    and event.bracket_type in ('academy', 'challenge', 'main')
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
$$;

alter function
  public.get_player_badge_tournament_authority_participants(uuid)
  owner to postgres;
revoke all on function
  public.get_player_badge_tournament_authority_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_player_badge_tournament_authority_participants(uuid)
  to service_role;

create or replace function public.get_player_badge_tournament_summary(
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
      min(settlement.settled_at) as completed_at
    from public.leaderboard_point_events as event
    join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = event.tournament_bracket_id
      and settlement.season_id = event.season_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.player_id = p_player_id
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
    coalesce((select count(*)::integer from ranked_tournaments), 0),
    (select ranked.tournament_id from ranked_tournaments as ranked
      where ranked.tournament_number = 1),
    (select ranked.completed_at from ranked_tournaments as ranked
      where ranked.tournament_number = 1),
    (select ranked.tournament_id from ranked_tournaments as ranked
      where ranked.tournament_number = 3),
    (select ranked.completed_at from ranked_tournaments as ranked
      where ranked.tournament_number = 3),
    (select ranked.tournament_id from ranked_tournaments as ranked
      where ranked.tournament_number = 10),
    (select ranked.completed_at from ranked_tournaments as ranked
      where ranked.tournament_number = 10);
$$;

alter function public.get_player_badge_tournament_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_summary(uuid)
  to service_role;

create or replace function public.get_player_badge_bracket_progression_summary(
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
      settlement.settled_at,
      case bracket.name
        when 'Academy' then 'academy'
        when 'Challenge' then 'challenge'
        when 'Main' then 'main'
      end as bracket_family
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
        original.bracket_family = 'academy'
          and ordered.bracket_family in ('challenge', 'main')
        or original.bracket_family = 'challenge'
          and ordered.bracket_family = 'main'
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
$$;

alter function public.get_player_badge_bracket_progression_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_bracket_progression_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_bracket_progression_summary(uuid)
  to service_role;

create or replace function public.get_player_badge_tournament_prestige_summary(
  p_player_id uuid
)
returns table (
  played_advance_win_count integer,
  first_advance_match_id uuid,
  first_advance_at timestamptz,
  semifinalist_count integer,
  first_semifinal_tournament_id uuid,
  first_semifinal_at timestamptz,
  finalist_count integer,
  first_finalist_tournament_id uuid,
  first_finalist_at timestamptz,
  academy_championship_count integer,
  first_academy_championship_tournament_id uuid,
  first_academy_championship_at timestamptz,
  challenge_championship_count integer,
  first_challenge_championship_tournament_id uuid,
  first_challenge_championship_at timestamptz,
  main_championship_count integer,
  first_main_championship_tournament_id uuid,
  first_main_championship_at timestamptz,
  championship_count integer,
  second_championship_tournament_id uuid,
  second_championship_at timestamptz,
  triple_crown_bracket_count integer,
  triple_crown_tournament_id uuid,
  triple_crown_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
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
      and event.bracket_type in ('academy', 'challenge', 'main')
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
      and bracket.name in ('Academy', 'Challenge', 'Main')
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
      and bracket.name in ('Academy', 'Challenge', 'Main')
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
    select event.tournament_id, min(event.completed_at) as completed_at
    from valid_championship_events as event
    where event.bracket_type = 'main'
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
      where (select count(*) from division_firsts) = 3);
$$;

alter function public.get_player_badge_tournament_prestige_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_prestige_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_prestige_summary(uuid)
  to service_role;

create or replace function public.get_player_badge_finalized_season_for_tournament(
  p_tournament_id uuid
)
returns table (
  season_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select settlement.season_id
  from public.leaderboard_division_settlements as settlement
  join public.tournament_brackets as bracket
    on bracket.id = settlement.tournament_bracket_id
  join public.leaderboard_seasons as season
    on season.id = settlement.season_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
    and tournament.status not in ('cancelled', 'voided')
  where bracket.tournament_id = p_tournament_id
    and season.finalized_at is not null
    and season.under_review_at is null
  group by settlement.season_id
  order by max(settlement.settled_at) desc, settlement.season_id
  limit 1;
$$;

alter function public.get_player_badge_finalized_season_for_tournament(uuid)
  owner to postgres;
revoke all on function
  public.get_player_badge_finalized_season_for_tournament(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_player_badge_finalized_season_for_tournament(uuid)
  to service_role;

create or replace function public.get_player_badge_season_authority_participants(
  p_season_id uuid
)
returns table (
  player_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with season_scope as (
    select season.id
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
    where season_stats.bracket_type = 'main'
      and season_stats.current_rank <= 3
  ),
  champion_candidates as (
    select champion.player_id
    from public.leaderboard_season_champions as champion
    join season_scope as season
      on season.id = champion.season_id
    where champion.bracket_type = 'main'
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
$$;

alter function public.get_player_badge_season_authority_participants(uuid)
  owner to postgres;
revoke all on function
  public.get_player_badge_season_authority_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_player_badge_season_authority_participants(uuid)
  to service_role;

create or replace function public.get_player_badge_season_summary(
  p_player_id uuid
)
returns table (
  season_campaigner_count integer,
  first_season_campaigner_season_id uuid,
  first_season_campaigner_at timestamptz,
  first_season_campaigner_threshold_tournament_id uuid,
  first_season_campaigner_tournament_count integer,
  podium_finish_count integer,
  first_podium_season_id uuid,
  first_podium_at timestamptz,
  first_podium_rank integer,
  champion_finish_count integer,
  first_champion_season_id uuid,
  first_champion_at timestamptz,
  first_champion_rank integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with finalized_seasons as (
    select season.id, season.finalized_at
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
      and season_stats.bracket_type = 'main'
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
      and champion.bracket_type = 'main'
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
$$;

alter function public.get_player_badge_season_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_season_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_season_summary(uuid)
  to service_role;

create or replace function public.refresh_tournament_championship_path_summary(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_finalized_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
      and event.bracket_type in ('academy', 'challenge', 'main')
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
$$;

alter function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) owner to postgres;
revoke all on function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) to service_role;

create or replace function public.record_tournament_championship_path_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_settled_at timestamptz;
begin
  if new.event_type = 'tournament_win'
    and new.source in ('system', 'recalculation')
    and new.tournament_id is not null
    and new.tournament_bracket_id is not null
    and new.registration_id is not null then
    select settlement.settled_at
    into v_settled_at
    from public.leaderboard_division_settlements as settlement
    where settlement.tournament_bracket_id = new.tournament_bracket_id
      and settlement.season_id = new.season_id;

    if v_settled_at is not null then
      perform public.refresh_tournament_championship_path_summary(
        new.tournament_id,
        new.registration_id,
        'tournament_win',
        new.id,
        v_settled_at
      );
    end if;
  end if;
  return new;
end;
$$;

alter function public.record_tournament_championship_path_completion()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_record_championship_path_completion
  on public.tournaments;

drop trigger if exists tournaments_queue_badge_reconciliation
  on public.tournaments;
drop trigger if exists leaderboard_division_settlements_queue_badges
  on public.leaderboard_division_settlements;
drop function if exists
  public.queue_badge_reconciliation_from_division_settlement();

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
      and event.bracket_type in ('academy', 'challenge', 'main')
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
$$;

alter function public.get_player_badge_flawless_campaign_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_flawless_campaign_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_flawless_campaign_summary(uuid)
  to service_role;

comment on function
  public.get_player_badge_tournament_authority_participants(uuid) is
  'Existing Badge evaluator input scoped to authoritative completed Division settlement evidence; Not Held and unresolved siblings contribute nothing.';
comment on function public.get_player_badge_tournament_summary(uuid) is
  'Existing Badge tournament-count input ordered by authoritative Division settlement while preserving tournament source identity and thresholds.';
comment on function public.get_player_badge_tournament_prestige_summary(uuid) is
  'Existing Badge progression/championship input using settled Division evidence without changing achievement rules.';
comment on function public.get_player_badge_season_summary(uuid) is
  'Existing Badge season input using Division receipts assigned to the finalized season; thresholds and award semantics are unchanged.';
comment on function public.get_player_badge_flawless_campaign_summary(uuid) is
  'Existing Badge 20 authority using settled Division championship, path, participant, and finalized game evidence.';

commit;
