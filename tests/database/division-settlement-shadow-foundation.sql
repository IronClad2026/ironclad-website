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
  v_run_id uuid;
  v_run_status text;
begin
  select tournament_id
  into v_tournament_id
  from shadow_fixture_divisions
  limit 1;

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
    (v_result #>> '{comparison,pointEventsMatch}')::boolean
      and (v_result #>> '{comparison,shadowPoints}')::integer = 33
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
    (v_bye_result #>> '{comparison,pointEventsMatch}')::boolean
      and (v_bye_result #>> '{comparison,shadowPoints}')::integer = 13
      and (v_bye_result #>> '{comparison,shadowEventCount}')::integer = 2
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
    (v_double_forfeit_result #>> '{comparison,pointEventsMatch}')::boolean
      and (v_double_forfeit_result #>> '{comparison,shadowPoints}')::integer = 0
      and (v_double_forfeit_result #>> '{comparison,shadowEventCount}')::integer = 2
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

  insert into public.leaderboard_division_settlements (
    tournament_bracket_id,
    season_id,
    settlement_version,
    calculation_checksum
  )
  values (v_bracket_id, v_season_id, 1, repeat('a', 32));

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
