\set ON_ERROR_STOP on

-- Rollback-only Feature B executable database contract. Run only against a disposable
-- database or an explicitly approved non-Production project after the
-- Feature B migration has been applied. No credentials are embedded here.
set client_min_messages = warning;
set role postgres;

create temporary table feature_b_contract_baseline
on commit preserve rows
as
select pg_catalog.jsonb_build_object(
  'dice', (select pg_catalog.count(*) from public.match_dice_rolls),
  'tournaments', (select pg_catalog.count(*) from public.tournaments),
  'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
  'registrations', (select pg_catalog.count(*) from public.registrations),
  'generated', (select pg_catalog.count(*) from public.generated_brackets),
  'rounds', (select pg_catalog.count(*) from public.bracket_rounds),
  'matches', (select pg_catalog.count(*) from public.tournament_matches),
  'submissions', (
    select pg_catalog.count(*) from public.match_result_submissions
  ),
  'reportGroups', (
    select pg_catalog.count(*) from public.match_result_report_groups
  ),
  'standings', (
    select pg_catalog.count(*) from public.tournament_standings
  ),
  'leaderboardEvents', (
    select pg_catalog.count(*) from public.leaderboard_point_events
  ),
  'notifications', (select pg_catalog.count(*) from public.notifications),
  'mapPoolEntries', (
    select pg_catalog.count(*)
    from public.tournament_bracket_map_pool_entries
  ),
  'storageObjects', (select pg_catalog.count(*) from storage.objects)
) as counts;

begin isolation level repeatable read;

create function pg_temp.feature_b_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Feature B contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_tournament constant uuid :=
    'b0000000-0000-4000-8000-000000000001';
  v_se_bracket constant uuid :=
    'b1000000-0000-4000-8000-000000000001';
  v_rr_bracket constant uuid :=
    'b1000000-0000-4000-8000-000000000002';
  v_player_a constant uuid :=
    'b2000000-0000-4000-8000-000000000001';
  v_player_b constant uuid :=
    'b2000000-0000-4000-8000-000000000002';
  v_player_c constant uuid :=
    'b2000000-0000-4000-8000-000000000003';
  v_player_d constant uuid :=
    'b2000000-0000-4000-8000-000000000004';
  v_outsider constant uuid :=
    'b2000000-0000-4000-8000-000000000005';
  v_se_generated constant uuid :=
    'b3000000-0000-4000-8000-000000000001';
  v_rr_generated constant uuid :=
    'b3000000-0000-4000-8000-000000000002';
  v_se_round constant uuid :=
    'b4000000-0000-4000-8000-000000000001';
  v_rr_round constant uuid :=
    'b4000000-0000-4000-8000-000000000002';
  v_bo3_match constant uuid :=
    'b5000000-0000-4000-8000-000000000001';
  v_bo5_match constant uuid :=
    'b5000000-0000-4000-8000-000000000002';
  v_rr_match constant uuid :=
    'b5000000-0000-4000-8000-000000000003';
  v_unknown_match constant uuid :=
    'b5000000-0000-4000-8000-000000000099';
  v_result jsonb;
  v_retry jsonb;
  v_snapshot jsonb;
  v_before jsonb;
  v_after jsonb;
  v_failed boolean;
  v_player_a_total integer;
  v_player_b_die_1 smallint;
  v_player_b_die_2 smallint;
  v_generated_total integer;
  v_counter_die_1 smallint;
  v_counter_die_2 smallint;
  v_forged_read_state text;
  v_forged_read_message text;
  v_unknown_read_state text;
  v_unknown_read_message text;
  v_forged_roll_state text;
  v_forged_roll_message text;
  v_unknown_roll_state text;
  v_unknown_roll_message text;
  v_tie_round_state text;
begin
  -- Physical schema, ownership, RLS, and grants.
  perform pg_temp.feature_b_assert(
    pg_catalog.to_regclass('public.match_dice_rolls') is not null,
    'the one Feature B table must exist'
  );
  perform pg_temp.feature_b_assert(
    (
      select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'match_dice_rolls'
    ),
    'the Dice table must have forced RLS'
  );
  perform pg_temp.feature_b_assert(
    not pg_catalog.has_table_privilege(
        'anon', 'public.match_dice_rolls', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.match_dice_rolls', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', 'public.match_dice_rolls', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.match_dice_rolls', 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.match_dice_rolls', 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.match_dice_rolls', 'DELETE'
      ),
    'browser and service roles must have no raw Dice-table path'
  );
  perform pg_temp.feature_b_assert(
    pg_catalog.has_function_privilege(
      'authenticated',
      'public.get_match_dice_rolloff(uuid)',
      'EXECUTE'
    )
      and pg_catalog.has_function_privilege(
        'authenticated',
        'public.roll_match_dice(uuid,integer,smallint,integer)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.get_match_dice_rolloff(uuid)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.roll_match_dice(uuid,integer,smallint,integer)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'service_role',
        'public.roll_match_dice(uuid,integer,smallint,integer)',
        'EXECUTE'
      ),
    'only authenticated JWT callers may execute the two RPCs'
  );
  perform pg_temp.feature_b_assert(
    (
      select pg_catalog.count(*) = 0
      from pg_catalog.pg_policy as policy
      join pg_catalog.pg_class as relation
        on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'match_dice_rolls'
    ),
    'the raw Dice table must have no permissive policies'
  );

  -- Build deterministic launched fixtures without exercising unrelated
  -- roster/map-pool generation workflows. Replica mode suppresses ordinary
  -- triggers, including foreign-key enforcement triggers; declarative CHECK
  -- and NOT NULL constraints remain active. Origin mode is restored before
  -- assertions, and the disabled fixture foreign keys are checked explicitly.
  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );

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
    v_tournament,
    'Feature B Contract Tournament',
    'feature-b-contract-tournament',
    '1v1',
    'in_progress',
    'Rollback-only authenticated Dice Roll-Off contract.',
    '',
    '',
    false
  );

  insert into public.tournament_brackets (
    id,
    tournament_id,
    name,
    elo_rules,
    max_players,
    launched_at
  ) values
    (
      v_se_bracket,
      v_tournament,
      'Academy',
      '0-1099',
      8,
      pg_catalog.clock_timestamp()
    ),
    (
      v_rr_bracket,
      v_tournament,
      'Challenge',
      '1100-1399',
      8,
      pg_catalog.clock_timestamp()
    );

  insert into public.registrations (
    id,
    clerk_user_id,
    player_name,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    admin_notes,
    tournament_id,
    tournament_bracket_id,
    submitted_elo,
    elo_verified_elo,
    elo_highest_faction,
    elo_checked_mode,
    elo_checked_at,
    elo_verification_source,
    elo_verified_division,
    elo_calculation_version
  ) values
    (
      v_player_a,
      'feature-b-player-a',
      'Feature B Player A',
      'Feature B Contract Tournament',
      'Academy Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_se_bracket,
      1000,
      1000,
      'US Forces',
      '1v1',
      pg_catalog.clock_timestamp(),
      'relic',
      'Academy',
      'feature-b-contract'
    ),
    (
      v_player_b,
      'feature-b-player-b',
      'Feature B Player B',
      'Feature B Contract Tournament',
      'Academy Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_se_bracket,
      1000,
      1000,
      'Wehrmacht',
      '1v1',
      pg_catalog.clock_timestamp(),
      'relic',
      'Academy',
      'feature-b-contract'
    ),
    (
      v_player_c,
      'feature-b-player-c',
      'Feature B Player C',
      'Feature B Contract Tournament',
      'Challenge Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_rr_bracket,
      1200,
      1200,
      'Deutsches Afrikakorps',
      '1v1',
      pg_catalog.clock_timestamp(),
      'relic',
      'Challenge',
      'feature-b-contract'
    ),
    (
      v_player_d,
      'feature-b-player-d',
      'Feature B Player D',
      'Feature B Contract Tournament',
      'Challenge Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_rr_bracket,
      1200,
      1200,
      'British Forces',
      '1v1',
      pg_catalog.clock_timestamp(),
      'relic',
      'Challenge',
      'feature-b-contract'
    ),
    (
      v_outsider,
      'feature-b-outsider',
      'Feature B Outsider',
      'Feature B Contract Tournament',
      'Academy Bracket',
      'approved',
      'verified',
      '',
      v_tournament,
      v_se_bracket,
      1000,
      1000,
      'US Forces',
      '1v1',
      pg_catalog.clock_timestamp(),
      'relic',
      'Academy',
      'feature-b-contract'
    );

  insert into public.generated_brackets (
    id,
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by,
    competition_locked_at
  ) values
    (
      v_se_generated,
      v_se_bracket,
      'single_elimination',
      8,
      8,
      'feature-b-contract-admin',
      pg_catalog.clock_timestamp()
    ),
    (
      v_rr_generated,
      v_rr_bracket,
      'round_robin',
      8,
      8,
      'feature-b-contract-admin',
      pg_catalog.clock_timestamp()
    );

  insert into public.bracket_rounds (
    id,
    generated_bracket_id,
    round_number,
    name
  ) values
    (v_se_round, v_se_generated, 1, 'Feature B Round'),
    (v_rr_round, v_rr_generated, 1, 'Feature B Round Robin');

  insert into public.tournament_matches (
    id,
    generated_bracket_id,
    round_id,
    match_number,
    player_one_registration_id,
    player_two_registration_id,
    status,
    series_best_of,
    activation_version,
    activated_at,
    deadline_at
  ) values
    (
      v_bo3_match,
      v_se_generated,
      v_se_round,
      1,
      v_player_a,
      v_player_b,
      'in_progress',
      3,
      1,
      pg_catalog.clock_timestamp() - interval '1 hour',
      pg_catalog.clock_timestamp() + interval '7 days'
    ),
    (
      v_bo5_match,
      v_se_generated,
      v_se_round,
      2,
      v_player_a,
      v_player_b,
      'in_progress',
      5,
      1,
      pg_catalog.clock_timestamp() - interval '1 hour',
      pg_catalog.clock_timestamp() + interval '7 days'
    ),
    (
      v_rr_match,
      v_rr_generated,
      v_rr_round,
      1,
      v_player_c,
      v_player_d,
      'scheduled',
      3,
      0,
      null,
      null
    );

  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );

  perform pg_temp.feature_b_assert(
    not exists (
      select 1
      from public.tournament_brackets as bracket
      left join public.tournaments as tournament
        on tournament.id = bracket.tournament_id
      where bracket.id in (v_se_bracket, v_rr_bracket)
        and tournament.id is null
    )
      and not exists (
        select 1
        from public.registrations as registration
        left join public.tournaments as tournament
          on tournament.id = registration.tournament_id
        left join public.tournament_brackets as bracket
          on bracket.id = registration.tournament_bracket_id
        where registration.id in (
          v_player_a,
          v_player_b,
          v_player_c,
          v_player_d,
          v_outsider
        )
          and (
            tournament.id is null
            or bracket.id is null
            or bracket.tournament_id <> registration.tournament_id
          )
      )
      and not exists (
        select 1
        from public.generated_brackets as generated
        left join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where generated.id in (v_se_generated, v_rr_generated)
          and bracket.id is null
      )
      and not exists (
        select 1
        from public.bracket_rounds as round
        left join public.generated_brackets as generated
          on generated.id = round.generated_bracket_id
        where round.id in (v_se_round, v_rr_round)
          and generated.id is null
      )
      and not exists (
        select 1
        from public.tournament_matches as match
        left join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        left join public.bracket_rounds as round
          on round.id = match.round_id
        left join public.registrations as player_one
          on player_one.id = match.player_one_registration_id
        left join public.registrations as player_two
          on player_two.id = match.player_two_registration_id
        where match.id in (v_bo3_match, v_bo5_match, v_rr_match)
          and (
            generated.id is null
            or round.id is null
            or round.generated_bracket_id <> match.generated_bracket_id
            or player_one.id is null
            or player_two.id is null
          )
      ),
    'rollback fixtures must satisfy every temporarily disabled foreign key'
  );

  select pg_catalog.jsonb_build_object(
    'submissions', (
      select pg_catalog.count(*)
      from public.match_result_submissions
      where match_id in (v_bo3_match, v_bo5_match, v_rr_match)
    ),
    'reportGroups', (
      select pg_catalog.count(*)
      from public.match_result_report_groups
      where match_id in (v_bo3_match, v_bo5_match, v_rr_match)
    ),
    'standings', (
      select pg_catalog.count(*)
      from public.tournament_standings
      where generated_bracket_id in (v_se_generated, v_rr_generated)
    ),
    'leaderboardEvents', (
      select pg_catalog.count(*)
      from public.leaderboard_point_events
      where tournament_id = v_tournament
    ),
    'notifications', (
      select pg_catalog.count(*)
      from public.notifications
      where tournament_id = v_tournament
    ),
    'mapPoolEntries', (
      select pg_catalog.count(*)
      from public.tournament_bracket_map_pool_entries
      where tournament_bracket_id in (v_se_bracket, v_rr_bracket)
    )
  ) into v_before;

  -- Every otherwise-current Match actionability gate is enforced by the two
  -- RPCs before any roll fact can be created.
  perform pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a"}',
    true
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_brackets
  set launched_at = null
  where id = v_se_bracket;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'division_not_launched'
      and v_failed
      and not exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo5_match
      ),
    'an unlaunched division must be read-only and reject rolls'
  );
  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_brackets
  set launched_at = pg_catalog.clock_timestamp()
  where id = v_se_bracket;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set player_two_registration_id = null
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'participants_unavailable'
      and v_failed,
    'a Match with a missing participant must be read-only and reject rolls'
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set player_two_registration_id = v_player_a
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'participants_unavailable'
      and v_failed,
    'a Match with identical participants must be read-only and reject rolls'
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set
    player_two_registration_id = v_player_b,
    winner_registration_id = v_player_a
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'official_outcome'
      and v_failed,
    'an official outcome must make Dice history read-only and reject rolls'
  );
  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set winner_registration_id = null
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );

  -- Game 3 can be rolled first; a sequential duplicate-client retry returns
  -- the exact immutable row. This single-session rollback canary makes no
  -- simultaneous-device claim; lock races require a separate multi-session
  -- harness.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a"}',
    true
  );
  v_result := public.roll_match_dice(v_bo3_match, 1, 3::smallint, 1);
  perform pg_temp.feature_b_assert(
    (v_result #>> '{roll,created}')::boolean
      and v_result #>> '{roll,participantSlot}' = 'player_one'
      and (v_result #>> '{roll,die1}')::integer between 1 and 6
      and (v_result #>> '{roll,die2}')::integer between 1 and 6,
    'Player A must receive one server-generated Game 3 roll'
  );
  v_retry := public.roll_match_dice(v_bo3_match, 1, 3::smallint, 1);
  perform pg_temp.feature_b_assert(
    not (v_retry #>> '{roll,created}')::boolean
      and (v_retry -> 'roll') - 'created' =
        (v_result -> 'roll') - 'created'
      and (
        select pg_catalog.count(*) = 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
          and game_number = 3
          and tie_round = 1
          and participant_registration_id = v_player_a
      )
      and not exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and game_number = 1
      ),
    'sequential duplicate-client retry must preserve one Game 3 row without Game 1'
  );

  -- Player B sees Player A immediately, then receives only their own roll.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-b"}',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo3_match);
  perform pg_temp.feature_b_assert(
    v_snapshot ->> 'viewerSlot' = 'player_two'
      and pg_catalog.jsonb_path_exists(
        v_snapshot,
        '$.activations[*].games[*].rounds[*].rolls[*] ? (@.participantSlot == "player_one")'
      )
      and pg_catalog.strpos(v_snapshot::text, v_player_a::text) = 0
      and pg_catalog.strpos(v_snapshot::text, v_player_b::text) = 0,
    'Player B must see Player A slot facts with no registration UUIDs'
  );
  perform public.roll_match_dice(v_bo3_match, 1, 3::smallint, 1);
  perform pg_temp.feature_b_assert(
    (
      select pg_catalog.count(*) = 2
      from public.match_dice_rolls
      where match_id = v_bo3_match
        and activation_version = 1
        and game_number = 3
        and tie_round = 1
    ),
    'both Match participants must receive exactly one Game 3 roll'
  );

  -- BO3 rejects Game 5. BO5 permits each Game roll-off independently and in
  -- advance, so complete Game 5, then Game 3, then Game 1 without fabricating
  -- any official Game or Series result.
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 5::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    v_failed,
    'BO3 must reject Game 5'
  );
  v_result := public.roll_match_dice(v_bo5_match, 1, 5::smallint, 1);
  perform pg_temp.feature_b_assert(
    (v_result #>> '{roll,created}')::boolean
      and exists (
      select 1
      from public.match_dice_rolls
      where match_id = v_bo5_match
        and game_number = 5
        and participant_registration_id = v_player_b
    )
      and not exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo5_match
          and game_number = 1
      ),
    'BO5 Game 5 must be independent and available in advance'
  );
  v_generated_total := (v_result #>> '{roll,total}')::integer;
  if v_generated_total = 2 then
    v_counter_die_1 := 1;
    v_counter_die_2 := 2;
  else
    v_counter_die_1 := 1;
    v_counter_die_2 := 1;
  end if;
  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  ) values (
    v_bo5_match,
    1,
    5,
    1,
    v_player_a,
    v_counter_die_1,
    v_counter_die_2
  );

  v_result := public.roll_match_dice(v_bo5_match, 1, 3::smallint, 1);
  v_generated_total := (v_result #>> '{roll,total}')::integer;
  if v_generated_total = 2 then
    v_counter_die_1 := 1;
    v_counter_die_2 := 2;
  else
    v_counter_die_1 := 1;
    v_counter_die_2 := 1;
  end if;
  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  ) values (
    v_bo5_match,
    1,
    3,
    1,
    v_player_a,
    v_counter_die_1,
    v_counter_die_2
  );

  -- Admin metadata does not remove a real participant's slot authority. The
  -- same JWT is treated as a participant because its subject owns Player A.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a","metadata":{"role":"admin"}}',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  v_result := public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  perform pg_temp.feature_b_assert(
    v_snapshot ->> 'viewerRole' = 'participant'
      and v_snapshot ->> 'viewerSlot' = 'player_one'
      and (v_result #>> '{roll,created}')::boolean
      and v_result #>> '{roll,participantSlot}' = 'player_one'
      and v_result #>> '{snapshot,viewerRole}' = 'participant',
    'an Admin who independently owns a participant slot may roll that slot'
  );
  v_generated_total := (v_result #>> '{roll,total}')::integer;
  if v_generated_total = 2 then
    v_counter_die_1 := 1;
    v_counter_die_2 := 2;
  else
    v_counter_die_1 := 1;
    v_counter_die_2 := 1;
  end if;
  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  ) values (
    v_bo5_match,
    1,
    1,
    1,
    v_player_b,
    v_counter_die_1,
    v_counter_die_2
  );

  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  perform pg_temp.feature_b_assert(
    (
      select pg_catalog.count(*) = 3
      from pg_catalog.jsonb_array_elements(
        v_snapshot -> 'activations'
      ) as activation(value)
      cross join lateral pg_catalog.jsonb_array_elements(
        activation.value -> 'games'
      ) as game(value)
      where activation.value ->> 'activationVersion' = '1'
        and game.value ->> 'gameNumber' in ('1', '3', '5')
        and game.value ->> 'state' = 'complete'
    )
      and (
        select pg_catalog.count(*) = 6
          and pg_catalog.count(distinct game_number) = 3
        from public.match_dice_rolls
        where match_id = v_bo5_match
          and activation_version = 1
          and game_number in (1, 3, 5)
          and tie_round = 1
      )
      and not exists (
        select 1
        from public.tournament_matches
        where id = v_bo5_match
          and (
            player_one_score is not null
            or player_two_score is not null
            or winner_registration_id is not null
            or official_result_submission_id is not null
            or outcome_type is not null
          )
      ),
    'completed BO5 Game 1, 3, and 5 roll-offs must remain independent'
  );

  -- A caller forging access to a known Match receives the same generic error
  -- as an unknown Match for both RPCs. Admin may inspect but role alone cannot
  -- roll.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-outsider"}',
    true
  );
  v_forged_read_state := null;
  v_forged_read_message := null;
  begin
    perform public.get_match_dice_rolloff(v_bo3_match);
  exception when others then
    get stacked diagnostics
      v_forged_read_state = returned_sqlstate,
      v_forged_read_message = message_text;
  end;
  v_unknown_read_state := null;
  v_unknown_read_message := null;
  begin
    perform public.get_match_dice_rolloff(v_unknown_match);
  exception when others then
    get stacked diagnostics
      v_unknown_read_state = returned_sqlstate,
      v_unknown_read_message = message_text;
  end;
  perform pg_temp.feature_b_assert(
    v_forged_read_state = '42501'
      and v_forged_read_state = v_unknown_read_state
      and v_forged_read_message = v_unknown_read_message,
    'forged and unknown Match reads must be indistinguishable'
  );

  v_forged_roll_state := null;
  v_forged_roll_message := null;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 1::smallint, 1);
  exception when others then
    get stacked diagnostics
      v_forged_roll_state = returned_sqlstate,
      v_forged_roll_message = message_text;
  end;
  v_unknown_roll_state := null;
  v_unknown_roll_message := null;
  begin
    perform public.roll_match_dice(v_unknown_match, 1, 1::smallint, 1);
  exception when others then
    get stacked diagnostics
      v_unknown_roll_state = returned_sqlstate,
      v_unknown_roll_message = message_text;
  end;
  perform pg_temp.feature_b_assert(
    v_forged_roll_state = '42501'
      and v_forged_roll_state = v_unknown_roll_state
      and v_forged_roll_message = v_unknown_roll_message,
    'forged and unknown Match rolls must be indistinguishable'
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-admin","metadata":{"role":"admin"}}',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo3_match);
  perform pg_temp.feature_b_assert(
    v_snapshot ->> 'viewerRole' = 'admin'
      and v_snapshot -> 'viewerSlot' = 'null'::jsonb,
    'Admin must receive the sanitized read-only projection'
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    v_failed,
    'Admin role alone must never grant roll authority'
  );

  -- Round-robin is visible only as unsupported/read-only and rejects writes.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-c"}',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_rr_match);
  perform pg_temp.feature_b_assert(
    not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'unsupported_format'
      and v_snapshot ->> 'currentActivationVersion' = '0'
      and v_snapshot -> 'activations' = '[]'::jsonb,
    'round-robin must not expose an actionable Dice workspace'
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_rr_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(v_failed, 'round-robin write must fail');

  -- A deterministic completed tie opens exactly round 2. The second round is
  -- made decisively unequal without repeatedly sampling random rolls.
  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  ) values
    (v_bo3_match, 1, 1, 1, v_player_a, 3, 3),
    (v_bo3_match, 1, 1, 1, v_player_b, 2, 4);

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a"}',
    true
  );
  v_retry := public.roll_match_dice(v_bo3_match, 1, 1::smallint, 1);
  perform pg_temp.feature_b_assert(
    not (v_retry #>> '{roll,created}')::boolean
      and v_retry #>> '{roll,tieRound}' = '1'
      and v_retry #>> '{roll,die1}' = '3'
      and v_retry #>> '{roll,die2}' = '3'
      and pg_catalog.jsonb_path_exists(
        v_retry -> 'snapshot',
        '$.activations[*].games[*] ? (@.gameNumber == 1 && @.currentTieRound == 2 && @.state == "tied")'
      ),
    'an exact old-round retry after a tie must return the immutable roll'
  );

  v_tie_round_state := null;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 1::smallint, 3);
  exception when others then
    get stacked diagnostics v_tie_round_state = returned_sqlstate;
  end;
  perform pg_temp.feature_b_assert(
    v_tie_round_state = '40001'
      and not exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
          and game_number = 1
          and tie_round = 3
      ),
    'a mismatched expected tie round after a tie must fail as stale'
  );

  v_result := public.roll_match_dice(v_bo3_match, 1, 1::smallint, 2);
  v_player_a_total := (v_result #>> '{roll,total}')::integer;
  if v_player_a_total = 2 then
    v_player_b_die_1 := 1;
    v_player_b_die_2 := 2;
  else
    v_player_b_die_1 := 1;
    v_player_b_die_2 := 1;
  end if;
  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  ) values (
    v_bo3_match,
    1,
    1,
    2,
    v_player_b,
    v_player_b_die_1,
    v_player_b_die_2
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 1::smallint, 3);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    v_failed
      and (
        select pg_catalog.count(*) = 2
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
          and game_number = 1
          and tie_round = 1
      )
      and (
        select pg_catalog.count(*) = 2
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
          and game_number = 1
          and tie_round = 2
      )
      and not exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
          and game_number = 1
          and tie_round = 3
      ),
    'only a completed tie may open one next round; decisive round must close'
  );

  -- Before invoking any established reset/notification workflow, prove that
  -- Dice facts alone did not mutate results/replays, standings, leaderboard,
  -- notifications, or Feature A map-pool contracts.
  select pg_catalog.jsonb_build_object(
    'submissions', (
      select pg_catalog.count(*)
      from public.match_result_submissions
      where match_id in (v_bo3_match, v_bo5_match, v_rr_match)
    ),
    'reportGroups', (
      select pg_catalog.count(*)
      from public.match_result_report_groups
      where match_id in (v_bo3_match, v_bo5_match, v_rr_match)
    ),
    'standings', (
      select pg_catalog.count(*)
      from public.tournament_standings
      where generated_bracket_id in (v_se_generated, v_rr_generated)
    ),
    'leaderboardEvents', (
      select pg_catalog.count(*)
      from public.leaderboard_point_events
      where tournament_id = v_tournament
    ),
    'notifications', (
      select pg_catalog.count(*)
      from public.notifications
      where tournament_id = v_tournament
    ),
    'mapPoolEntries', (
      select pg_catalog.count(*)
      from public.tournament_bracket_map_pool_entries
      where tournament_bracket_id in (v_se_bracket, v_rr_bracket)
    )
  ) into v_after;
  perform pg_temp.feature_b_assert(
    v_after = v_before
      and not exists (
        select 1
        from public.tournament_matches
        where id in (v_bo3_match, v_bo5_match, v_rr_match)
          and (
            player_one_score is not null
            or player_two_score is not null
            or winner_registration_id is not null
            or official_result_submission_id is not null
            or outcome_type is not null
          )
      ),
    'Dice must not mutate established competition systems'
  );

  -- The legitimate existing full-Match reset preserves old rows, increments
  -- activation_version, and makes stale requests fail before idempotent read.
  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set status = 'completed'
  where id = v_bo3_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  perform public.admin_reset_tournament_match(
    v_bo3_match,
    'feature-b-contract-admin'
  );
  perform pg_temp.feature_b_assert(
    (
      select status = 'in_progress'
        and activation_version = 2
        and player_one_registration_id = v_player_a
        and player_two_registration_id = v_player_b
      from public.tournament_matches
      where id = v_bo3_match
    ),
    'the lawful reset must preserve participants and open activation 2'
  );

  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo3_match, 1, 3::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    v_failed,
    'a stale pre-reset activation must fail even for an old natural key'
  );
  perform public.roll_match_dice(v_bo3_match, 2, 1::smallint, 1);
  v_snapshot := public.get_match_dice_rolloff(v_bo3_match);
  perform pg_temp.feature_b_assert(
    pg_catalog.jsonb_array_length(v_snapshot -> 'activations') = 2
      and exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 1
      )
      and exists (
        select 1
        from public.match_dice_rolls
        where match_id = v_bo3_match
          and activation_version = 2
      ),
    'fresh activation space must coexist with immutable prior history'
  );

  -- Hold, deadline, Match completion, and every tournament terminal state
  -- reject new rolls while preserving authorized read history.
  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set
    hold_started_at = pg_catalog.clock_timestamp(),
    hold_released_at = null,
    hold_reason = 'Feature B rollback contract hold',
    held_by_clerk_user_id = 'feature-b-admin'
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a"}',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(v_failed, 'active hold must reject rolls');

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set
    hold_released_at = pg_catalog.clock_timestamp(),
    activated_at = pg_catalog.clock_timestamp() - interval '2 days',
    deadline_at = pg_catalog.clock_timestamp() - interval '1 day'
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(v_failed, 'elapsed deadline must reject rolls');

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set
    status = 'completed',
    activated_at = pg_catalog.clock_timestamp(),
    deadline_at = pg_catalog.clock_timestamp() + interval '7 days'
  where id = v_bo5_match;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  perform pg_temp.feature_b_assert(
    v_failed
      and not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'match_not_in_progress',
    'completed Match history must be read-only'
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournament_matches
  set status = 'in_progress'
  where id = v_bo5_match;
  update public.tournaments set status = 'completed' where id = v_tournament;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(
    v_failed,
    'completed tournament must reject rolls'
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-admin","metadata":{"role":"admin"}}',
    true
  );
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  perform pg_temp.feature_b_assert(
    v_snapshot ->> 'viewerRole' = 'admin'
      and v_snapshot -> 'viewerSlot' = 'null'::jsonb
      and not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'tournament_not_in_progress'
      and pg_catalog.jsonb_path_exists(
        v_snapshot,
        '$.activations[*].games[*].rounds[*].rolls[*]'
      )
      and pg_catalog.strpos(v_snapshot::text, v_player_a::text) = 0
      and pg_catalog.strpos(v_snapshot::text, v_player_b::text) = 0,
    'Admin must retain sanitized read access after tournament completion'
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"feature-b-player-a"}',
    true
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournaments
  set
    status = 'cancelled',
    terminal_at = pg_catalog.clock_timestamp(),
    terminal_reason = 'Feature B rollback contract terminal state',
    terminated_by_clerk_user_id = 'feature-b-admin'
  where id = v_tournament;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_b_assert(v_failed, 'cancelled tournament must reject rolls');

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );
  update public.tournaments set status = 'voided' where id = v_tournament;
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
  v_failed := false;
  begin
    perform public.roll_match_dice(v_bo5_match, 1, 1::smallint, 1);
  exception when others then
    v_failed := true;
  end;
  v_snapshot := public.get_match_dice_rolloff(v_bo5_match);
  perform pg_temp.feature_b_assert(
    v_failed
      and not (v_snapshot ->> 'isActionable')::boolean
      and v_snapshot ->> 'readOnlyReason' = 'tournament_not_in_progress',
    'voided tournament must reject rolls but retain authorized history'
  );

  -- The reset and terminal canaries also leave official competition columns
  -- untouched; their standard Match Ready notifications are intentionally not
  -- attributed to Dice and are removed by the outer rollback.
  perform pg_temp.feature_b_assert(
    not exists (
      select 1
      from public.tournament_matches
      where id in (v_bo3_match, v_bo5_match, v_rr_match)
        and (
          player_one_score is not null
          or player_two_score is not null
          or winner_registration_id is not null
          or official_result_submission_id is not null
          or outcome_type is not null
        )
    ),
    'reset/terminal canaries must not fabricate an official result'
  );

  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );
end;
$$;

rollback;

do $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  select counts into v_before from feature_b_contract_baseline;
  select pg_catalog.jsonb_build_object(
    'dice', (select pg_catalog.count(*) from public.match_dice_rolls),
    'tournaments', (select pg_catalog.count(*) from public.tournaments),
    'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
    'registrations', (select pg_catalog.count(*) from public.registrations),
    'generated', (select pg_catalog.count(*) from public.generated_brackets),
    'rounds', (select pg_catalog.count(*) from public.bracket_rounds),
    'matches', (select pg_catalog.count(*) from public.tournament_matches),
    'submissions', (
      select pg_catalog.count(*) from public.match_result_submissions
    ),
    'reportGroups', (
      select pg_catalog.count(*) from public.match_result_report_groups
    ),
    'standings', (
      select pg_catalog.count(*) from public.tournament_standings
    ),
    'leaderboardEvents', (
      select pg_catalog.count(*) from public.leaderboard_point_events
    ),
    'notifications', (select pg_catalog.count(*) from public.notifications),
    'mapPoolEntries', (
      select pg_catalog.count(*)
      from public.tournament_bracket_map_pool_entries
    ),
    'storageObjects', (select pg_catalog.count(*) from storage.objects)
  ) into v_after;

  if v_after is distinct from v_before then
    raise exception 'Feature B contract cleanup failed: fixture residue remains';
  end if;

  if exists (
    select 1
    from public.tournaments
    where id = 'b0000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1
    from public.registrations
    where id between
      'b2000000-0000-4000-8000-000000000001'::uuid
      and 'b2000000-0000-4000-8000-000000000005'::uuid
  ) or exists (
    select 1
    from public.match_dice_rolls
    where match_id between
      'b5000000-0000-4000-8000-000000000001'::uuid
      and 'b5000000-0000-4000-8000-000000000003'::uuid
  ) then
    raise exception 'Feature B contract cleanup failed: marker residue remains';
  end if;
end;
$$;

reset role;
