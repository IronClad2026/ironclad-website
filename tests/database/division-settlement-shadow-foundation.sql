-- Rollback-only behavioral proof for the Division settlement shadow.
begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '3min';

create function pg_temp.shadow_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Division settlement shadow failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.create_completed_round_robin_division(
  p_tournament_id uuid,
  p_division_name text,
  p_suffix text
)
returns uuid
language plpgsql
as $$
declare
  v_bracket_id uuid := gen_random_uuid();
  v_generated_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_player_one_id uuid := gen_random_uuid();
  v_player_two_id uuid := gen_random_uuid();
  v_registration_one_id uuid := gen_random_uuid();
  v_registration_two_id uuid := gen_random_uuid();
begin
  insert into public.players (
    id,
    clerk_user_id,
    display_name,
    in_game_name,
    current_elo,
    profile_completed
  )
  values
    (
      v_player_one_id,
      'shadow-player-one-' || p_suffix,
      'Shadow Player One ' || p_suffix,
      'ShadowOne' || p_suffix,
      case p_division_name when 'Main' then 1500 else 1000 end,
      true
    ),
    (
      v_player_two_id,
      'shadow-player-two-' || p_suffix,
      'Shadow Player Two ' || p_suffix,
      'ShadowTwo' || p_suffix,
      case p_division_name when 'Main' then 1500 else 1000 end,
      true
    );

  insert into public.tournament_brackets (
    id,
    tournament_id,
    name,
    elo_rules,
    max_players,
    launched_at
  )
  values (
    v_bracket_id,
    p_tournament_id,
    p_division_name,
    'Rollback-only shadow fixture',
    8,
    '2099-03-01T00:00:00Z'
  );

  insert into public.registrations (
    id,
    profile_id,
    clerk_user_id,
    player_name,
    submitted_elo,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    tournament_id,
    tournament_bracket_id
  )
  values
    (
      v_registration_one_id,
      v_player_one_id,
      'shadow-player-one-' || p_suffix,
      'ShadowOne' || p_suffix,
      case p_division_name when 'Main' then 1500 else 1000 end,
      'Division shadow fixture',
      p_division_name || ' Bracket',
      'approved',
      'verified',
      p_tournament_id,
      v_bracket_id
    ),
    (
      v_registration_two_id,
      v_player_two_id,
      'shadow-player-two-' || p_suffix,
      'ShadowTwo' || p_suffix,
      case p_division_name when 'Main' then 1500 else 1000 end,
      'Division shadow fixture',
      p_division_name || ' Bracket',
      'approved',
      'verified',
      p_tournament_id,
      v_bracket_id
    );

  insert into public.generated_brackets (
    id,
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by
  )
  values (
    v_generated_id,
    v_bracket_id,
    'round_robin',
    2,
    2,
    'shadow-fixture'
  );

  insert into public.bracket_rounds (
    id,
    generated_bracket_id,
    round_number,
    name
  )
  values (v_round_id, v_generated_id, 1, 'Round Robin');

  insert into public.tournament_matches (
    generated_bracket_id,
    round_id,
    match_number,
    player_one_registration_id,
    player_two_registration_id,
    player_one_score,
    player_two_score,
    winner_registration_id,
    status
  )
  values (
    v_generated_id,
    v_round_id,
    1,
    v_registration_one_id,
    v_registration_two_id,
    2,
    0,
    v_registration_one_id,
    'completed'
  );

  insert into public.tournament_standings (
    generated_bracket_id,
    registration_id,
    wins,
    losses,
    points,
    rank
  )
  values
    (v_generated_id, v_registration_one_id, 1, 0, 3, 1),
    (v_generated_id, v_registration_two_id, 0, 1, 0, 2);

  return v_bracket_id;
end;
$$;

create function pg_temp.create_completed_outcome_division(
  p_tournament_id uuid,
  p_division_name text,
  p_suffix text,
  p_outcome_type text
)
returns uuid
language plpgsql
as $$
declare
  v_bracket_id uuid := gen_random_uuid();
  v_generated_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_player_one_id uuid := gen_random_uuid();
  v_player_two_id uuid := gen_random_uuid();
  v_registration_one_id uuid := gen_random_uuid();
  v_registration_two_id uuid := gen_random_uuid();
begin
  if p_outcome_type not in ('automatic_bye', 'deadline_double_forfeit') then
    raise exception 'Unsupported shadow outcome fixture: %', p_outcome_type;
  end if;

  insert into public.players (
    id,
    clerk_user_id,
    display_name,
    in_game_name,
    current_elo,
    profile_completed
  )
  values
    (
      v_player_one_id,
      'shadow-outcome-one-' || p_suffix,
      'Shadow Outcome One ' || p_suffix,
      'ShadowOutcomeOne' || p_suffix,
      1000,
      true
    ),
    (
      v_player_two_id,
      'shadow-outcome-two-' || p_suffix,
      'Shadow Outcome Two ' || p_suffix,
      'ShadowOutcomeTwo' || p_suffix,
      1000,
      true
    );

  insert into public.tournament_brackets (
    id,
    tournament_id,
    name,
    elo_rules,
    max_players,
    launched_at
  )
  values (
    v_bracket_id,
    p_tournament_id,
    p_division_name,
    'Rollback-only shadow outcome fixture',
    8,
    '2099-03-05T00:00:00Z'
  );

  insert into public.registrations (
    id,
    profile_id,
    clerk_user_id,
    player_name,
    submitted_elo,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    tournament_id,
    tournament_bracket_id
  )
  values (
    v_registration_one_id,
    v_player_one_id,
    'shadow-outcome-one-' || p_suffix,
    'ShadowOutcomeOne' || p_suffix,
    1000,
    'Division shadow outcome fixture',
    p_division_name || ' Bracket',
    'approved',
    'verified',
    p_tournament_id,
    v_bracket_id
  );

  if p_outcome_type = 'deadline_double_forfeit' then
    insert into public.registrations (
      id,
      profile_id,
      clerk_user_id,
      player_name,
      submitted_elo,
      tournament_title,
      bracket_name,
      registration_status,
      elo_status,
      tournament_id,
      tournament_bracket_id
    )
    values (
      v_registration_two_id,
      v_player_two_id,
      'shadow-outcome-two-' || p_suffix,
      'ShadowOutcomeTwo' || p_suffix,
      1000,
      'Division shadow outcome fixture',
      p_division_name || ' Bracket',
      'approved',
      'verified',
      p_tournament_id,
      v_bracket_id
    );
  end if;

  insert into public.generated_brackets (
    id,
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by
  )
  values (
    v_generated_id,
    v_bracket_id,
    'single_elimination',
    2,
    2,
    'shadow-fixture'
  );

  insert into public.bracket_rounds (
    id,
    generated_bracket_id,
    round_number,
    name
  )
  values (v_round_id, v_generated_id, 1, 'Final');

  insert into public.tournament_matches (
    generated_bracket_id,
    round_id,
    match_number,
    player_one_registration_id,
    player_two_registration_id,
    winner_registration_id,
    status,
    activation_version,
    activated_at,
    deadline_at,
    outcome_type,
    deadline_ruled_at
  )
  values (
    v_generated_id,
    v_round_id,
    1,
    v_registration_one_id,
    case
      when p_outcome_type = 'deadline_double_forfeit'
        then v_registration_two_id
      else null
    end,
    case
      when p_outcome_type = 'automatic_bye'
        then v_registration_one_id
      else null
    end,
    'completed',
    case when p_outcome_type = 'deadline_double_forfeit' then 1 else 0 end,
    case
      when p_outcome_type = 'deadline_double_forfeit'
        then '2099-03-05T00:00:00Z'::timestamptz
      else null
    end,
    case
      when p_outcome_type = 'deadline_double_forfeit'
        then '2099-03-06T00:00:00Z'::timestamptz
      else null
    end,
    p_outcome_type,
    case
      when p_outcome_type = 'deadline_double_forfeit'
        then '2099-03-07T00:00:00Z'::timestamptz
      else null
    end
  );

  return v_bracket_id;
end;
$$;

create temporary table shadow_fixture_divisions (
  tournament_id uuid not null,
  tournament_bracket_id uuid primary key,
  division_name text not null
);

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_division_name text;
  v_bracket_id uuid;
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled,
    first_completed_at
  )
  values (
    v_tournament_id,
    'Completed Division shadow fixture',
    'completed-division-shadow-fixture',
    '1v1',
    'completed',
    'Rollback-only completed Event for Division shadow parity.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false,
    '2099-03-02T00:00:00Z'
  );

  foreach v_division_name in array array['Academy', 'Challenge', 'Main']
  loop
    v_bracket_id := pg_temp.create_completed_round_robin_division(
      v_tournament_id,
      v_division_name,
      lower(v_division_name) || '-complete'
    );
    insert into shadow_fixture_divisions
    values (v_tournament_id, v_bracket_id, v_division_name);
  end loop;
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_tournament_id uuid;
  v_division record;
  v_run_id uuid;
  v_run_status text;
begin
  select tournament_id
  into v_tournament_id
  from shadow_fixture_divisions
  limit 1;

  for v_division in
    select tournament_bracket_id
    from shadow_fixture_divisions
    order by tournament_bracket_id
  loop
    perform public.settle_leaderboard_division(
      v_division.tournament_bracket_id,
      null
    );
  end loop;

  v_run_id := public.recalculate_leaderboard_for_tournament(
    v_tournament_id,
    null
  );

  select status
  into v_run_status
  from public.leaderboard_recalculation_runs
  where id = v_run_id;

  perform pg_temp.shadow_assert(
    v_run_status = 'completed',
    'the existing authoritative Event scorer did not complete'
  );
end;
$$;

create temporary table completed_shadow_results as
select
  fixture.division_name,
  public.get_leaderboard_division_shadow(
    fixture.tournament_bracket_id
  ) as result
from shadow_fixture_divisions as fixture;

select pg_temp.shadow_assert(
  count(*) = 3
    and bool_and((result #>> '{comparison,eligible}')::boolean)
    and bool_and((result #>> '{comparison,pointEventsMatch}')::boolean),
  'a fully resolved Event did not achieve exact per-Division point parity'
)
from completed_shadow_results;

select pg_temp.shadow_assert(
  sum((result #>> '{comparison,shadowEventCount}')::integer) =
    sum((result #>> '{comparison,authoritativeEventCount}')::integer)
    and sum((result #>> '{comparison,shadowPoints}')::integer) =
      sum((result #>> '{comparison,authoritativePoints}')::integer),
  'combined Division shadow output did not equal the Event-level ledger'
)
from completed_shadow_results;

select pg_temp.shadow_assert(
  (select (result #>> '{comparison,shadowPoints}')::integer
   from completed_shadow_results where division_name = 'Academy') = 23
    and
  (select (result #>> '{comparison,shadowPoints}')::integer
   from completed_shadow_results where division_name = 'Challenge') = 23
    and
  (select (result #>> '{comparison,shadowPoints}')::integer
   from completed_shadow_results where division_name = 'Main') = 25,
  'the fixed Division scoring values changed'
);

select pg_temp.shadow_assert(
  bool_and(jsonb_array_length(result -> 'badgeEvaluationTargets') = 2),
  'approved completed-Division Badge evaluation targets were not projected'
)
from completed_shadow_results;

create temporary table cutover_retry_baseline as
select
  (
    select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
      order by event.id), ''))
    from public.leaderboard_point_events as event
  ) as point_event_hash,
  (
    select md5(coalesce(string_agg(to_jsonb(settlement)::text, E'\n'
      order by settlement.tournament_bracket_id), ''))
    from public.leaderboard_division_settlements as settlement
  ) as settlement_hash,
  (
    select md5(coalesce(string_agg(to_jsonb(target)::text, E'\n'
      order by target.player_id), ''))
    from ironclad_private.badge_reconciliation_targets as target
  ) as reconciliation_hash,
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (
    select count(*)
    from public.notifications as notification
    where notification.type = 'badge.unlocked'
  ) as badge_notifications;

do $$
declare
  v_division record;
  v_result jsonb;
  v_run_id uuid;
begin
  -- Second and third executions must be true no-ops. The Event entry point is
  -- retained only as a coordinator over the same Division writer.
  for v_division in
    select tournament_bracket_id
    from shadow_fixture_divisions
    order by tournament_bracket_id
  loop
    v_result := public.settle_leaderboard_division(
      v_division.tournament_bracket_id,
      null
    );
    perform pg_temp.shadow_assert(
      not (v_result ->> 'settlementCreated')::boolean
        and not (v_result ->> 'pointEventsChanged')::boolean
        and not (v_result ->> 'lateEntryBonusesChanged')::boolean,
      'the second Division settlement was not an idempotent no-op'
    );
  end loop;

  select tournament_id
  into v_division
  from shadow_fixture_divisions
  limit 1;

  v_run_id := public.recalculate_leaderboard_for_tournament(
    v_division.tournament_id,
    null
  );
  perform pg_temp.shadow_assert(
    (select status = 'completed'
     from public.leaderboard_recalculation_runs
     where id = v_run_id),
    'the Event repair coordinator did not complete idempotently'
  );

  for v_division in
    select tournament_bracket_id
    from shadow_fixture_divisions
    order by tournament_bracket_id
  loop
    v_result := public.settle_leaderboard_division(
      v_division.tournament_bracket_id,
      null
    );
    perform pg_temp.shadow_assert(
      not (v_result ->> 'settlementCreated')::boolean
        and not (v_result ->> 'pointEventsChanged')::boolean
        and not (v_result ->> 'lateEntryBonusesChanged')::boolean,
      'the third Division settlement was not an idempotent no-op'
    );
  end loop;
end;
$$;

select pg_temp.shadow_assert(
  baseline.point_event_hash = (
    select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
      order by event.id), ''))
    from public.leaderboard_point_events as event
  )
    and baseline.settlement_hash = (
      select md5(coalesce(string_agg(to_jsonb(settlement)::text, E'\n'
        order by settlement.tournament_bracket_id), ''))
      from public.leaderboard_division_settlements as settlement
    )
    and baseline.reconciliation_hash = (
      select md5(coalesce(string_agg(to_jsonb(target)::text, E'\n'
        order by target.player_id), ''))
      from ironclad_private.badge_reconciliation_targets as target
    )
    and baseline.badge_awards = (select count(*) from public.player_badge_awards)
    and baseline.badge_reveals = (select count(*) from public.player_badge_reveals)
    and baseline.badge_notifications = (
      select count(*)
      from public.notifications as notification
      where notification.type = 'badge.unlocked'
    ),
  'settlement retry changed point IDs, receipts, Badge targets, awards, notifications, or Reveals'
)
from cutover_retry_baseline as baseline;

select pg_temp.shadow_assert(
  (select count(*) from public.leaderboard_division_settlements) = 3
    and (
      select count(distinct participant.player_id)
      from shadow_fixture_divisions as fixture
      cross join lateral
        public.get_player_badge_tournament_authority_participants(
          fixture.tournament_id
        ) as participant
      where fixture.division_name = 'Academy'
    ) = 6
    and (select count(*) from public.player_badge_awards) = 0
    and (select count(*) from public.player_badge_reveals) = 0
    and not exists (
      select 1
      from public.notifications as notification
      where notification.type = 'badge.unlocked'
    ),
  'completed-Division Badge evidence or preservation semantics changed'
);

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_bracket_id uuid;
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled,
    first_completed_at
  )
  values (
    v_tournament_id,
    'Late-entry Division shadow fixture',
    'late-entry-division-shadow-fixture',
    '1v1',
    'completed',
    'Rollback-only Career catch-up parity fixture.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false,
    '2099-03-04T00:00:00Z'
  );

  v_bracket_id := pg_temp.create_completed_round_robin_division(
    v_tournament_id,
    'Academy',
    'academy-late-entry'
  );

  insert into shadow_fixture_divisions
  values (v_tournament_id, v_bracket_id, 'Academy Late Entry');
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_tournament_id uuid;
  v_bracket_id uuid;
  v_run_id uuid;
  v_result jsonb;
begin
  select tournament_id, tournament_bracket_id
  into v_tournament_id, v_bracket_id
  from shadow_fixture_divisions
  where division_name = 'Academy Late Entry';

  v_run_id := public.recalculate_leaderboard_for_tournament(
    v_tournament_id,
    null
  );
  perform pg_temp.shadow_assert(
    (select status = 'completed'
     from public.leaderboard_recalculation_runs
     where id = v_run_id),
    'the authoritative late-entry fixture calculation did not complete'
  );

  v_result := public.get_leaderboard_division_shadow(v_bracket_id);
  perform pg_temp.shadow_assert(
    (v_result #>> '{comparison,shadowPoints}')::integer = 33
      and (v_result #>> '{comparison,authoritativePoints}')::integer = 33
      and (v_result #>> '{comparison,shadowEventCount}')::integer =
        (v_result #>> '{comparison,authoritativeEventCount}')::integer
      and jsonb_path_exists(
        v_result,
        '$.pointEvents[*] ? (@.eventType == "missing_tournament_bonus" && @.points == 5)'
      ),
    'the one-time Academy late-entry projection did not match the existing authority'
  );
end;
$$;

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_bracket_id uuid;
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled,
    first_completed_at
  )
  values (
    v_tournament_id,
    'Administrative outcome Division shadow fixture',
    'administrative-outcome-division-shadow-fixture',
    '1v1',
    'completed',
    'Rollback-only bye and no-show parity fixture.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false,
    '2099-03-08T00:00:00Z'
  );

  v_bracket_id := pg_temp.create_completed_outcome_division(
    v_tournament_id,
    'Academy',
    'academy-bye',
    'automatic_bye'
  );
  insert into shadow_fixture_divisions
  values (v_tournament_id, v_bracket_id, 'Academy Automatic Bye');

  v_bracket_id := pg_temp.create_completed_outcome_division(
    v_tournament_id,
    'Challenge',
    'challenge-double-forfeit',
    'deadline_double_forfeit'
  );
  insert into shadow_fixture_divisions
  values (v_tournament_id, v_bracket_id, 'Challenge Double Forfeit');
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_tournament_id uuid;
  v_run_id uuid;
  v_bye_result jsonb;
  v_double_forfeit_result jsonb;
begin
  select tournament_id
  into v_tournament_id
  from shadow_fixture_divisions
  where division_name = 'Academy Automatic Bye';

  v_run_id := public.recalculate_leaderboard_for_tournament(
    v_tournament_id,
    null
  );
  perform pg_temp.shadow_assert(
    (select status = 'completed'
     from public.leaderboard_recalculation_runs
     where id = v_run_id),
    'the authoritative administrative-outcome calculation did not complete'
  );

  select public.get_leaderboard_division_shadow(tournament_bracket_id)
  into v_bye_result
  from shadow_fixture_divisions
  where division_name = 'Academy Automatic Bye';

  select public.get_leaderboard_division_shadow(tournament_bracket_id)
  into v_double_forfeit_result
  from shadow_fixture_divisions
  where division_name = 'Challenge Double Forfeit';

  perform pg_temp.shadow_assert(
    (v_bye_result #>> '{comparison,shadowPoints}')::integer = 13
      and (v_bye_result #>> '{comparison,authoritativePoints}')::integer = 13
      and (v_bye_result #>> '{comparison,shadowEventCount}')::integer = 2
      and (v_bye_result #>> '{comparison,authoritativeEventCount}')::integer = 2
      and (v_bye_result #>> '{playerEffects,0,realMatches}')::integer = 0
      and not jsonb_path_exists(
        v_bye_result,
        '$.pointEvents[*] ? (@.eventType == "participation")'
      )
      and jsonb_path_exists(
        v_bye_result,
        '$.pointEvents[*] ? (@.eventType == "tournament_win" && @.points == 3)'
      ),
    'automatic-bye progression/win semantics changed'
  );
  perform pg_temp.shadow_assert(
    (v_double_forfeit_result #>> '{comparison,shadowPoints}')::integer = 0
      and (v_double_forfeit_result #>> '{comparison,authoritativePoints}')::integer = 0
      and (v_double_forfeit_result #>> '{comparison,shadowEventCount}')::integer = 2
      and (v_double_forfeit_result #>> '{comparison,authoritativeEventCount}')::integer = 2
      and jsonb_path_query_array(
        v_double_forfeit_result,
        '$.pointEvents[*].eventType'
      ) = '["participation_withheld", "participation_withheld"]'::jsonb,
    'confirmed no-show participation withholding changed'
  );
end;
$$;

create temporary table shadow_zero_write_baseline as
select
  (select count(*) from public.leaderboard_point_events) as point_events,
  (select count(*) from public.leaderboard_player_season_stats) as season_stats,
  (select count(*) from public.leaderboard_player_all_time_stats) as all_time_stats,
  (select count(*) from public.leaderboard_tournament_season_memberships)
    as memberships,
  (select count(*) from public.leaderboard_seasons) as seasons,
  (select count(*) from public.leaderboard_recalculation_runs) as runs,
  (select count(*) from public.leaderboard_division_settlements)
    as settlements,
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from ironclad_private.badge_reconciliation_targets)
    as badge_reconciliation_targets;

do $$
declare
  v_bracket_id uuid;
  v_first jsonb;
  v_second jsonb;
begin
  select tournament_bracket_id
  into v_bracket_id
  from shadow_fixture_divisions
  where division_name = 'Main';

  v_first := public.get_leaderboard_division_shadow(v_bracket_id);
  v_second := public.get_leaderboard_division_shadow(v_bracket_id);

  perform pg_temp.shadow_assert(
    v_first ->> 'calculationChecksum' = v_second ->> 'calculationChecksum',
    'repeated shadow execution produced a different checksum'
  );
end;
$$;

select pg_temp.shadow_assert(
  baseline.point_events = (select count(*) from public.leaderboard_point_events)
    and baseline.season_stats =
      (select count(*) from public.leaderboard_player_season_stats)
    and baseline.all_time_stats =
      (select count(*) from public.leaderboard_player_all_time_stats)
    and baseline.memberships =
      (select count(*) from public.leaderboard_tournament_season_memberships)
    and baseline.seasons = (select count(*) from public.leaderboard_seasons)
    and baseline.runs =
      (select count(*) from public.leaderboard_recalculation_runs)
    and baseline.settlements =
      (select count(*) from public.leaderboard_division_settlements)
    and baseline.badge_awards =
      (select count(*) from public.player_badge_awards)
    and baseline.badge_reveals =
      (select count(*) from public.player_badge_reveals)
    and baseline.notifications = (select count(*) from public.notifications)
    and baseline.badge_reconciliation_targets =
      (select count(*) from ironclad_private.badge_reconciliation_targets),
  'shadow execution wrote points, seasons, settlements, Badges, notifications, or Reveals'
)
from shadow_zero_write_baseline as baseline;

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_bracket_id uuid;
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled
  )
  values (
    v_tournament_id,
    'Mixed-state Division shadow fixture',
    'mixed-state-division-shadow-fixture',
    '1v1',
    'in_progress',
    'Rollback-only mixed-state Event for Division shadow calculation.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false
  );

  v_bracket_id := pg_temp.create_completed_round_robin_division(
    v_tournament_id,
    'Main',
    'main-mixed'
  );

  insert into shadow_fixture_divisions
  values (v_tournament_id, v_bracket_id, 'Main Mixed');
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_bracket_id uuid;
  v_result jsonb;
  v_before_points bigint;
  v_before_memberships bigint;
  v_before_settlements bigint;
  v_before_awards bigint;
  v_before_reveals bigint;
  v_before_notifications bigint;
  v_before_reconciliation bigint;
begin
  select tournament_bracket_id
  into v_bracket_id
  from shadow_fixture_divisions
  where division_name = 'Main Mixed';

  select
    (select count(*) from public.leaderboard_point_events),
    (select count(*) from public.leaderboard_tournament_season_memberships),
    (select count(*) from public.leaderboard_division_settlements),
    (select count(*) from public.player_badge_awards),
    (select count(*) from public.player_badge_reveals),
    (select count(*) from public.notifications),
    (select count(*) from ironclad_private.badge_reconciliation_targets)
  into
    v_before_points,
    v_before_memberships,
    v_before_settlements,
    v_before_awards,
    v_before_reveals,
    v_before_notifications,
    v_before_reconciliation;

  v_result := public.get_leaderboard_division_shadow(v_bracket_id);

  perform pg_temp.shadow_assert(
    (v_result #>> '{comparison,eligible}')::boolean is false
      and v_result #>> '{comparison,pointEventsMatch}' is null
      and (v_result #>> '{comparison,shadowPoints}')::integer = 25
      and (v_result #>> '{mainSeasonEffect,qualifyingCompetitionDelta}')::integer = 1
      and (v_result #>> '{mainSeasonEffect,requiresSeasonAssignment}')::boolean
      and jsonb_array_length(v_result -> 'badgeEvaluationTargets') = 2,
    'a completed Main Division inside an unresolved Event was not projected independently'
  );

  perform pg_temp.shadow_assert(
    v_before_points = (select count(*) from public.leaderboard_point_events)
      and v_before_memberships =
        (select count(*) from public.leaderboard_tournament_season_memberships)
      and v_before_settlements =
        (select count(*) from public.leaderboard_division_settlements)
      and v_before_awards = (select count(*) from public.player_badge_awards)
      and v_before_reveals = (select count(*) from public.player_badge_reveals)
      and v_before_notifications = (select count(*) from public.notifications)
      and v_before_reconciliation =
        (select count(*) from ironclad_private.badge_reconciliation_targets),
    'mixed-state shadow execution persisted an accounting or Badge effect'
  );
end;
$$;

set local session_replication_role = replica;
update public.tournament_brackets
set launched_at = null
where id = (
  select tournament_bracket_id
  from shadow_fixture_divisions
  where division_name = 'Main Mixed'
);
set local session_replication_role = origin;

do $$
declare
  v_bracket_id uuid;
  v_rejected boolean := false;
begin
  select tournament_bracket_id
  into v_bracket_id
  from shadow_fixture_divisions
  where division_name = 'Main Mixed';

  begin
    perform public.get_leaderboard_division_shadow(v_bracket_id);
  exception when sqlstate '55000' then
    v_rejected := true;
  end;

  perform pg_temp.shadow_assert(
    v_rejected,
    'an unlaunched Division was accepted by the shadow authority'
  );
end;
$$;

do $$
declare
  v_bracket_id uuid;
  v_season_id uuid;
  v_duplicate_rejected boolean := false;
begin
  select fixture.tournament_bracket_id, membership.season_id
  into v_bracket_id, v_season_id
  from shadow_fixture_divisions as fixture
  join public.leaderboard_tournament_season_memberships as membership
    on membership.tournament_id = fixture.tournament_id
  where fixture.division_name = 'Main';

  begin
    insert into public.leaderboard_division_settlements (
      tournament_bracket_id,
      season_id,
      settlement_version,
      calculation_checksum
    )
    values (v_bracket_id, v_season_id, 1, repeat('a', 32));
  exception when unique_violation then
    v_duplicate_rejected := true;
  end;

  perform pg_temp.shadow_assert(
    v_duplicate_rejected,
    'the database did not enforce one settlement receipt per Division'
  );
end;
$$;

create temporary table cutover_mixed_divisions (
  tournament_id uuid not null,
  tournament_bracket_id uuid primary key,
  division_name text not null
);

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_academy_id uuid;
  v_challenge_id uuid := gen_random_uuid();
  v_main_id uuid := gen_random_uuid();
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled
  )
  values (
    v_tournament_id,
    'PR7 mixed-state settlement fixture',
    'pr7-mixed-state-settlement-fixture',
    '1v1',
    'in_progress',
    'Rollback-only independent Division settlement fixture.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false
  );

  v_academy_id := pg_temp.create_completed_round_robin_division(
    v_tournament_id,
    'Academy',
    'academy-pr7-mixed'
  );

  insert into public.tournament_brackets (
    id,
    tournament_id,
    name,
    elo_rules,
    max_players,
    launched_at
  )
  values
    (
      v_challenge_id,
      v_tournament_id,
      'Challenge',
      'Rollback-only incomplete sibling',
      8,
      '2099-03-06T00:00:00Z'
    ),
    (
      v_main_id,
      v_tournament_id,
      'Main',
      'Rollback-only filling sibling',
      8,
      null
    );

  insert into cutover_mixed_divisions
  values
    (v_tournament_id, v_academy_id, 'Academy'),
    (v_tournament_id, v_challenge_id, 'Challenge'),
    (v_tournament_id, v_main_id, 'Main');
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_tournament_id uuid;
  v_academy_id uuid;
  v_challenge_id uuid;
  v_main_id uuid;
  v_player_id uuid;
  v_result jsonb;
  v_run_id uuid;
  v_rejected boolean;
  v_point_hash text;
  v_point_hash_after text;
begin
  select tournament_id into v_tournament_id
  from cutover_mixed_divisions
  limit 1;
  select tournament_bracket_id into v_academy_id
  from cutover_mixed_divisions where division_name = 'Academy';
  select tournament_bracket_id into v_challenge_id
  from cutover_mixed_divisions where division_name = 'Challenge';
  select tournament_bracket_id into v_main_id
  from cutover_mixed_divisions where division_name = 'Main';

  v_result := public.settle_leaderboard_division(v_academy_id, null);
  perform pg_temp.shadow_assert(
    (v_result ->> 'settlementCreated')::boolean
      and (v_result ->> 'pointEventsChanged')::boolean,
    'the completed Academy Division did not settle independently'
  );

  perform pg_temp.shadow_assert(
    (select status = 'in_progress'
     from public.tournaments where id = v_tournament_id)
      and (
        select count(*)
        from public.leaderboard_division_settlements as settlement
        join cutover_mixed_divisions as fixture
          on fixture.tournament_bracket_id = settlement.tournament_bracket_id
      ) = 1
      and exists (
        select 1
        from public.leaderboard_division_settlements
        where tournament_bracket_id = v_academy_id
      )
      and not exists (
        select 1
        from public.leaderboard_division_settlements
        where tournament_bracket_id in (v_challenge_id, v_main_id)
      )
      and not exists (
        select 1
        from public.leaderboard_tournament_season_memberships
        where tournament_id = v_tournament_id
      ),
    'a sibling or Main-season fact changed during Academy settlement'
  );

  v_rejected := false;
  begin
    perform public.settle_leaderboard_division(v_challenge_id, null);
  exception when sqlstate '55000' then
    v_rejected := true;
  end;
  perform pg_temp.shadow_assert(
    v_rejected,
    'an incomplete Challenge sibling was settled prematurely'
  );

  v_rejected := false;
  begin
    perform public.settle_leaderboard_division(v_main_id, null);
  exception when sqlstate '55000' then
    v_rejected := true;
  end;
  perform pg_temp.shadow_assert(
    v_rejected,
    'an unlaunched Main sibling was settled prematurely'
  );

  perform pg_temp.shadow_assert(
    (
      select count(*)
      from public.get_player_badge_tournament_authority_participants(
        v_tournament_id
      )
    ) = 2,
    'the Badge authority did not scope the mixed Event to Academy recipients'
  );

  select participant.player_id
  into v_player_id
  from public.get_player_badge_tournament_authority_participants(
    v_tournament_id
  ) as participant
  order by participant.player_id
  limit 1;

  perform pg_temp.shadow_assert(
    (
      select summary.completed_tournament_count = 1
      from public.get_player_badge_tournament_summary(v_player_id) as summary
    ),
    'the existing Badge summary did not accept completed Academy evidence'
  );

  select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
    order by event.id), ''))
  into v_point_hash
  from public.leaderboard_point_events as event
  where event.tournament_id = v_tournament_id;

  set local session_replication_role = replica;
  update public.tournaments
  set status = 'completed', first_completed_at = '2099-03-07T00:00:00Z'
  where id = v_tournament_id;
  set local session_replication_role = origin;

  v_run_id := public.recalculate_leaderboard_for_tournament(
    v_tournament_id,
    null
  );
  perform pg_temp.shadow_assert(
    (select status = 'completed'
     from public.leaderboard_recalculation_runs where id = v_run_id),
    'the later Event coordinator did not complete'
  );

  select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
    order by event.id), ''))
  into v_point_hash_after
  from public.leaderboard_point_events as event
  where event.tournament_id = v_tournament_id;

  perform pg_temp.shadow_assert(
    v_point_hash_after = v_point_hash
      and (
        select count(*)
        from public.leaderboard_division_settlements as settlement
        join cutover_mixed_divisions as fixture
          on fixture.tournament_bracket_id = settlement.tournament_bracket_id
      ) = 1,
    'the later Event coordinator duplicated Academy accounting'
  );
end;
$$;

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_bracket_id uuid := gen_random_uuid();
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled
  ) values (
    v_tournament_id,
    'PR7 Not Held exclusion fixture',
    'pr7-not-held-exclusion-fixture',
    '1v1',
    'upcoming',
    'Rollback-only Not Held exclusion fixture.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false
  );

  insert into public.tournament_brackets (
    id, tournament_id, name, elo_rules, max_players, launched_at
  ) values (
    v_bracket_id,
    v_tournament_id,
    'Academy',
    'Rollback-only Not Held Division',
    8,
    null
  );

  insert into public.tournament_division_not_held_closures (
    tournament_bracket_id,
    reason_code,
    detail,
    closed_at,
    closed_by_clerk_user_id,
    active_registration_count,
    waitlist_registration_count
  ) values (
    v_bracket_id,
    'minimum_roster_not_reached',
    null,
    clock_timestamp(),
    'pr7-rollback-fixture',
    0,
    0
  );

  insert into cutover_mixed_divisions
  values (v_tournament_id, v_bracket_id, 'Not Held');
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_tournament_id uuid;
  v_bracket_id uuid;
  v_before_points bigint;
  v_before_settlements bigint;
  v_before_targets bigint;
  v_rejected boolean := false;
begin
  select tournament_id, tournament_bracket_id
  into v_tournament_id, v_bracket_id
  from cutover_mixed_divisions
  where division_name = 'Not Held';

  select count(*) into v_before_points
  from public.leaderboard_point_events;
  select count(*) into v_before_settlements
  from public.leaderboard_division_settlements;
  select count(*) into v_before_targets
  from ironclad_private.badge_reconciliation_targets;

  begin
    perform public.settle_leaderboard_division(v_bracket_id, null);
  exception when sqlstate '55000' then
    v_rejected := true;
  end;

  perform pg_temp.shadow_assert(
    v_rejected
      and v_before_points = (select count(*) from public.leaderboard_point_events)
      and v_before_settlements =
        (select count(*) from public.leaderboard_division_settlements)
      and v_before_targets =
        (select count(*) from ironclad_private.badge_reconciliation_targets)
      and not exists (
        select 1
        from public.leaderboard_point_events
        where tournament_id = v_tournament_id
      )
      and not exists (
        select 1
        from public.player_badge_awards as award
        where award.source_metadata ->> 'tournamentId' = v_tournament_id::text
      ),
    'Not Held created accounting or Badge progress'
  );
end;
$$;

create temporary table cutover_main_cycle (
  event_number integer primary key,
  tournament_id uuid not null,
  tournament_bracket_id uuid not null unique
);

set local session_replication_role = replica;

do $$
declare
  v_event_number integer;
  v_tournament_id uuid;
  v_bracket_id uuid;
begin
  for v_event_number in 2..6
  loop
    v_tournament_id := gen_random_uuid();
    insert into public.tournaments (
      id,
      title,
      slug,
      format,
      status,
      description,
      banner_image_url,
      prize_pool,
      registration_enabled,
      first_completed_at
    ) values (
      v_tournament_id,
      format('PR7 Main event %s fixture', v_event_number),
      format('pr7-main-event-%s-fixture', v_event_number),
      '1v1',
      'completed',
      'Rollback-only six-Main season fixture.',
      '/images/tournaments/shadow-fixture.jpg',
      '',
      false,
      make_timestamptz(2099, 4, v_event_number, 0, 0, 0, 'UTC')
    );

    v_bracket_id := pg_temp.create_completed_round_robin_division(
      v_tournament_id,
      'Main',
      format('main-cycle-%s', v_event_number)
    );

    insert into cutover_main_cycle
    values (v_event_number, v_tournament_id, v_bracket_id);
  end loop;
end;
$$;

set local session_replication_role = origin;

do $$
declare
  v_season_id uuid;
  v_event record;
  v_result jsonb;
  v_sixth_points bigint;
begin
  select settlement.season_id
  into v_season_id
  from shadow_fixture_divisions as fixture
  join public.leaderboard_division_settlements as settlement
    on settlement.tournament_bracket_id = fixture.tournament_bracket_id
  where fixture.division_name = 'Main';

  perform pg_temp.shadow_assert(
    (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_season_id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) = 1,
    'Academy or Challenge settlement consumed a Main season slot'
  );

  for v_event in
    select *
    from cutover_main_cycle
    where event_number < 6
    order by event_number
  loop
    v_result := public.settle_leaderboard_division(
      v_event.tournament_bracket_id,
      null
    );
    perform pg_temp.shadow_assert(
      not (v_result ->> 'seasonFinalized')::boolean,
      'a Main season finalized before the sixth completed Main Division'
    );
  end loop;

  perform pg_temp.shadow_assert(
    (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_season_id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) = 5
      and (select finalized_at is null
           from public.leaderboard_seasons where id = v_season_id),
    'the five-event Main season boundary changed'
  );

  select * into v_event
  from cutover_main_cycle
  where event_number = 6;

  v_result := public.settle_leaderboard_division(
    v_event.tournament_bracket_id,
    null
  );

  select coalesce(sum(event.points), 0)
  into v_sixth_points
  from public.leaderboard_point_events as event
  where event.tournament_id = v_event.tournament_id
    and event.tournament_bracket_id = v_event.tournament_bracket_id
    and event.source in ('system', 'recalculation');

  perform pg_temp.shadow_assert(
    (v_result ->> 'seasonFinalized')::boolean
      and v_sixth_points = 25
      and exists (
        select 1
        from public.leaderboard_division_settlements as settlement
        where settlement.tournament_bracket_id = v_event.tournament_bracket_id
          and settlement.season_id = v_season_id
      )
      and (
        select count(*)
        from public.leaderboard_tournament_season_memberships as membership
        where membership.season_id = v_season_id
          and membership.qualifying_event_number is not null
          and membership.scored_at is not null
          and membership.voided_at is null
      ) = 6
      and (select finalized_at is not null and not is_active
           from public.leaderboard_seasons where id = v_season_id),
    'the sixth Main Division did not score before season finalization'
  );

  perform pg_temp.shadow_assert(
    not exists (
      select 1
      from public.leaderboard_player_season_stats as stats
      left join public.leaderboard_season_champions as champion
        on champion.season_id = stats.season_id
        and champion.player_id = stats.player_id
        and champion.bracket_type = stats.bracket_type
        and champion.final_rank = stats.current_rank
        and champion.final_points = stats.total_points
      where stats.season_id = v_season_id
        and stats.bracket_type = 'main'
        and stats.current_rank between 1 and 3
        and champion.player_id is null
    )
      and not exists (
        select 1
        from public.leaderboard_season_champions as champion
        where champion.season_id = v_season_id
          and champion.bracket_type = 'main'
          and champion.final_rank not between 1 and 3
      )
      and exists (
        select 1
        from public.leaderboard_seasons as successor
        where successor.id <> v_season_id
          and successor.is_active
          and successor.finalized_at is null
      ),
    'the finalized Main podium or active successor season is incomplete'
  );

  perform pg_temp.shadow_assert(
    (select count(*) from public.player_badge_awards) = 0
      and (select count(*) from public.player_badge_reveals) = 0
      and not exists (
        select 1 from public.notifications where type = 'badge.unlocked'
      ),
    'Main season finalization directly mutated Badge awards, notifications, or Reveals'
  );
end;
$$;

create temporary table cutover_badge_retry_fixture (
  tournament_id uuid primary key,
  tournament_bracket_id uuid not null unique
);

set local session_replication_role = replica;

do $$
declare
  v_tournament_id uuid := gen_random_uuid();
  v_bracket_id uuid;
begin
  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    prize_pool,
    registration_enabled
  ) values (
    v_tournament_id,
    'PR7 Badge handoff retry fixture',
    'pr7-badge-handoff-retry-fixture',
    '1v1',
    'in_progress',
    'Rollback-only Badge handoff failure fixture.',
    '/images/tournaments/shadow-fixture.jpg',
    '',
    false
  );

  v_bracket_id := pg_temp.create_completed_round_robin_division(
    v_tournament_id,
    'Academy',
    'academy-pr7-badge-retry'
  );

  insert into cutover_badge_retry_fixture
  values (v_tournament_id, v_bracket_id);
end;
$$;

set local session_replication_role = origin;

alter function ironclad_private.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) rename to enqueue_badge_reconciliation_target_pr7_test_original;

create function ironclad_private.enqueue_badge_reconciliation_target(
  p_player_id uuid,
  p_reason text,
  p_source_type text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.current_setting(
    'ironclad.pr7_badge_enqueue_failure',
    true
  ) = 'on' and p_reason = 'tournament_completion' then
    raise exception 'Rollback-only Badge handoff failure'
      using errcode = '40001';
  end if;

  perform ironclad_private.enqueue_badge_reconciliation_target_pr7_test_original(
    p_player_id,
    p_reason,
    p_source_type,
    p_source_id
  );
end;
$$;

do $$
declare
  v_tournament_id uuid;
  v_bracket_id uuid;
  v_result jsonb;
  v_failed boolean := false;
  v_point_hash text;
  v_target_hash text;
begin
  select tournament_id, tournament_bracket_id
  into v_tournament_id, v_bracket_id
  from cutover_badge_retry_fixture;

  perform pg_catalog.set_config(
    'ironclad.pr7_badge_enqueue_failure',
    'on',
    true
  );

  begin
    perform public.settle_leaderboard_division(v_bracket_id, null);
  exception when sqlstate '40001' then
    v_failed := true;
  end;

  perform pg_temp.shadow_assert(
    v_failed
      and not exists (
        select 1 from public.leaderboard_division_settlements
        where tournament_bracket_id = v_bracket_id
      )
      and not exists (
        select 1 from public.leaderboard_point_events
        where tournament_id = v_tournament_id
      )
      and not exists (
        select 1
        from ironclad_private.badge_reconciliation_targets as target
        where target.source_type = 'tournament'
          and target.source_id = v_tournament_id::text
      ),
    'a failed Badge handoff was silently committed as a successful settlement'
  );

  perform pg_catalog.set_config(
    'ironclad.pr7_badge_enqueue_failure',
    'off',
    true
  );

  v_result := public.settle_leaderboard_division(v_bracket_id, null);
  perform pg_temp.shadow_assert(
    (v_result ->> 'settlementCreated')::boolean
      and (v_result ->> 'pointEventsChanged')::boolean
      and (
        select count(*)
        from ironclad_private.badge_reconciliation_targets as target
        where target.source_type = 'tournament'
          and target.source_id = v_tournament_id::text
      ) = 2,
    'the successful Badge handoff retry did not complete normally'
  );

  select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
    order by event.id), ''))
  into v_point_hash
  from public.leaderboard_point_events as event
  where event.tournament_id = v_tournament_id;

  select md5(coalesce(string_agg(to_jsonb(target)::text, E'\n'
    order by target.player_id), ''))
  into v_target_hash
  from ironclad_private.badge_reconciliation_targets as target
  where target.source_type = 'tournament'
    and target.source_id = v_tournament_id::text;

  v_result := public.settle_leaderboard_division(v_bracket_id, null);
  perform pg_temp.shadow_assert(
    not (v_result ->> 'settlementCreated')::boolean
      and not (v_result ->> 'pointEventsChanged')::boolean
      and not (v_result ->> 'lateEntryBonusesChanged')::boolean
      and v_point_hash = (
        select md5(coalesce(string_agg(to_jsonb(event)::text, E'\n'
          order by event.id), ''))
        from public.leaderboard_point_events as event
        where event.tournament_id = v_tournament_id
      )
      and v_target_hash = (
        select md5(coalesce(string_agg(to_jsonb(target)::text, E'\n'
          order by target.player_id), ''))
        from ironclad_private.badge_reconciliation_targets as target
        where target.source_type = 'tournament'
          and target.source_id = v_tournament_id::text
      )
      and (select count(*) from public.player_badge_awards) = 0
      and (select count(*) from public.player_badge_reveals) = 0
      and not exists (
        select 1 from public.notifications where type = 'badge.unlocked'
      ),
    'the post-retry no-op changed Badge or accounting state'
  );
end;
$$;

drop function ironclad_private.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
);

alter function
  ironclad_private.enqueue_badge_reconciliation_target_pr7_test_original(
    uuid,
    text,
    text,
    text
  ) rename to enqueue_badge_reconciliation_target;

select pg_temp.shadow_assert(
  has_function_privilege(
    'service_role',
    'public.get_leaderboard_division_shadow(uuid)',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'ironclad_private.calculate_leaderboard_division_point_events(uuid)',
      'execute'
    )
    and not has_table_privilege(
      'service_role',
      'public.leaderboard_division_settlements',
      'select'
    )
    and not has_table_privilege(
      'authenticated',
      'public.leaderboard_division_settlements',
      'insert'
    ),
  'the service-role shadow boundary or private receipt grant changed'
);

rollback;
