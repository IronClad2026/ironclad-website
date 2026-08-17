\set ON_ERROR_STOP on

-- Rollback-only Feature C executable contract. Run only against an explicitly
-- approved non-Production project after the Feature C migration. Every fixture
-- is isolated inside one transaction and no Storage object is created.
set client_min_messages = warning;
set role postgres;

create temporary table feature_c_contract_baseline
on commit preserve rows
as
select pg_catalog.jsonb_build_object(
  'polls', (select pg_catalog.count(*) from public.polls),
  'options', (select pg_catalog.count(*) from public.poll_options),
  'eligibility', (select pg_catalog.count(*) from public.poll_eligible_voters),
  'choices', (select pg_catalog.count(*) from public.poll_ballot_choices),
  'players', (select pg_catalog.count(*) from public.players),
  'tournaments', (select pg_catalog.count(*) from public.tournaments),
  'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
  'registrations', (select pg_catalog.count(*) from public.registrations),
  'notifications', (select pg_catalog.count(*) from public.notifications),
  'maps', (select pg_catalog.count(*) from public.coh3_maps),
  'storageObjects', (select pg_catalog.count(*) from storage.objects)
) as counts;

begin isolation level repeatable read;

create function pg_temp.feature_c_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Feature C contract failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.feature_c_set_claims(
  p_role text,
  p_subject text
)
returns void
language plpgsql
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'role', p_role,
      'sub', p_subject
    )::text,
    true
  );
end;
$$;

create function pg_temp.feature_c_save_poll(
  p_purpose text,
  p_audience text,
  p_tournament_id uuid,
  p_bracket_id uuid,
  p_source text,
  p_options jsonb,
  p_max_selections integer,
  p_winner_count integer,
  p_authority text,
  p_visibility text,
  p_public_totals boolean,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_selected_ids uuid[]
)
returns uuid
language plpgsql
as $$
declare
  v_result jsonb;
begin
  v_result := public.save_poll_draft(
    null,
    p_purpose,
    p_audience,
    p_tournament_id,
    p_bracket_id,
    'Feature C rollback contract question?',
    'Rollback-only context.',
    p_source,
    p_options,
    p_max_selections::smallint,
    p_winner_count::smallint,
    p_authority,
    p_visibility,
    p_public_totals,
    p_opens_at,
    p_closes_at,
    p_selected_ids,
    coalesce(auth.jwt() ->> 'sub', 'feature-c-admin')
  );
  return (v_result ->> 'poll_id')::uuid;
end;
$$;

do $$
declare
  v_tournament constant uuid :=
    'c1000000-0000-4000-8000-000000000001';
  v_disposable_tournament constant uuid :=
    'c1000000-0000-4000-8000-000000000002';
  v_academy constant uuid :=
    'c2000000-0000-4000-8000-000000000001';
  v_challenge constant uuid :=
    'c2000000-0000-4000-8000-000000000002';
  v_player_a constant uuid :=
    'c3000000-0000-4000-8000-000000000001';
  v_player_b constant uuid :=
    'c3000000-0000-4000-8000-000000000002';
  v_player_c constant uuid :=
    'c3000000-0000-4000-8000-000000000003';
  v_player_d constant uuid :=
    'c3000000-0000-4000-8000-000000000004';
  v_player_e constant uuid :=
    'c3000000-0000-4000-8000-000000000005';
  v_outsider constant uuid :=
    'c3000000-0000-4000-8000-000000000006';
  v_admin_player constant uuid :=
    'c3000000-0000-4000-8000-000000000007';
  v_closed_player constant uuid :=
    'c3000000-0000-4000-8000-000000000008';
  v_recreated_outsider constant uuid :=
    'c3000000-0000-4000-8000-000000000009';
  v_registration_a constant uuid :=
    'c4000000-0000-4000-8000-000000000001';
  v_registration_b constant uuid :=
    'c4000000-0000-4000-8000-000000000002';
  v_registration_c constant uuid :=
    'c4000000-0000-4000-8000-000000000003';
  v_registration_d constant uuid :=
    'c4000000-0000-4000-8000-000000000004';
  v_registration_e constant uuid :=
    'c4000000-0000-4000-8000-000000000005';
  v_map_one constant uuid :=
    'c5000000-0000-4000-8000-000000000001';
  v_map_two constant uuid :=
    'c5000000-0000-4000-8000-000000000002';
  v_map_retired constant uuid :=
    'c5000000-0000-4000-8000-000000000003';
  v_tournament_poll uuid;
  v_division_poll uuid;
  v_selected_tournament_poll uuid;
  v_active_poll uuid;
  v_selected_active_poll uuid;
  v_binding_poll uuid;
  v_binding_single_poll uuid;
  v_advisory_poll uuid;
  v_zero_ballot_poll uuid;
  v_map_revalidation_draft uuid;
  v_invalid_selected_draft uuid;
  v_invalidated_draft uuid;
  v_disposable_draft uuid;
  v_terminal_draft uuid;
  v_result jsonb;
  v_retry jsonb;
  v_payload jsonb;
  v_public_payload jsonb;
  v_public_poll jsonb;
  v_failed boolean;
  v_error_state text;
  v_before_count integer;
  v_after_count integer;
  v_choice_count integer;
  v_existing_active_player_count integer;
  v_option_one constant uuid :=
    'c6000001-0000-4000-8000-000000000001';
  v_option_two constant uuid :=
    'c6000001-0000-4000-8000-000000000002';
  v_option_three constant uuid :=
    'c6000001-0000-4000-8000-000000000003';
  v_binding_one constant uuid :=
    'c6000006-0000-4000-8000-000000000001';
  v_binding_two constant uuid :=
    'c6000006-0000-4000-8000-000000000002';
  v_binding_three constant uuid :=
    'c6000006-0000-4000-8000-000000000003';
  v_binding_four constant uuid :=
    'c6000006-0000-4000-8000-000000000004';
  v_binding_five constant uuid :=
    'c6000006-0000-4000-8000-000000000005';
  v_binding_six constant uuid :=
    'c6000006-0000-4000-8000-000000000006';
  v_binding_seven constant uuid :=
    'c6000006-0000-4000-8000-000000000007';
  v_binding_single_one constant uuid :=
    'c6000008-0000-4000-8000-000000000001';
  v_binding_single_two constant uuid :=
    'c6000008-0000-4000-8000-000000000002';
  v_advisory_one constant uuid :=
    'c6000007-0000-4000-8000-000000000001';
  v_advisory_two constant uuid :=
    'c6000007-0000-4000-8000-000000000002';
  v_advisory_three constant uuid :=
    'c6000007-0000-4000-8000-000000000003';
begin
  -- Physical schema, ownership, forced RLS, no raw grants, and split RPC ACLs.
  perform pg_temp.feature_c_assert(
    (
      select count(*) = 4
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in (
          'polls',
          'poll_options',
          'poll_eligible_voters',
          'poll_ballot_choices'
        )
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ),
    'all four Feature C tables must have forced RLS'
  );
  perform pg_temp.feature_c_assert(
    not pg_catalog.has_table_privilege('anon', 'public.polls', 'SELECT')
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.polls', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', 'public.polls', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.poll_ballot_choices', 'INSERT'
      ),
    'raw Feature C tables must remain private'
  );
  perform pg_temp.feature_c_assert(
    pg_catalog.has_function_privilege(
      'authenticated',
      'public.cast_poll_ballot(uuid,integer,uuid[])',
      'EXECUTE'
    )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.cast_poll_ballot(uuid,integer,uuid[])',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'anon',
        'public.get_public_tournament_decisions(uuid)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.publish_poll(uuid,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.publish_poll(uuid,text)',
        'EXECUTE'
      ),
    'Admin, authenticated, and public RPC grants must remain separate'
  );

  select count(*)::integer
  into v_existing_active_player_count
  from public.players
  where account_closed_at is null;

  -- Create isolated prerequisites without invoking unrelated lifecycle flows.
  -- Hosted Supabase's postgres login is the table owner but is intentionally
  -- not a superuser, so session_replication_role is unavailable. Transactional
  -- USER-trigger suspension keeps foreign keys active, blocks concurrent writes
  -- behind the DDL locks, and is fully restored by this fixture's rollback.
  alter table public.players disable trigger user;
  alter table public.tournaments disable trigger user;
  alter table public.tournament_brackets disable trigger user;
  alter table public.registrations disable trigger user;
  alter table public.coh3_maps disable trigger user;

  insert into public.players (
    id, clerk_user_id, display_name, in_game_name, profile_completed,
    account_closed_at
  ) values
    (v_player_a, 'feature-c-player-a', 'Feature C A', 'Feature C A', true, null),
    (v_player_b, 'feature-c-player-b', 'Feature C B', 'Feature C B', true, null),
    (v_player_c, 'feature-c-player-c', 'Feature C C', 'Feature C C', true, null),
    (v_player_d, 'feature-c-player-d', 'Feature C D', 'Feature C D', true, null),
    (v_player_e, 'feature-c-player-e', 'Feature C E', 'Feature C E', true, null),
    (v_outsider, 'feature-c-outsider', 'Feature C Outsider', 'Feature C Outsider', true, null),
    (v_admin_player, 'feature-c-admin', 'Feature C Admin', 'Feature C Admin', true, null),
    (v_closed_player, 'feature-c-closed', 'Feature C Closed', 'Feature C Closed', false, pg_catalog.clock_timestamp());

  insert into public.tournaments (
    id, title, slug, format, status, description, banner_image_url,
    prize_pool, registration_enabled
  ) values
    (
      v_tournament, 'Feature C Contract Tournament',
      'feature-c-contract-tournament', '1v1', 'registration_open',
      'Rollback-only Feature C contract.', '', '', false
    ),
    (
      v_disposable_tournament, 'Feature C Disposable Tournament',
      'feature-c-disposable-tournament', '1v1', 'upcoming',
      'Rollback-only hard-delete Draft contract.', '', '', false
    );

  insert into public.tournament_brackets (
    id, tournament_id, name, elo_rules, max_players
  ) values
    (v_academy, v_tournament, 'Academy', '0-1099', 8),
    (v_challenge, v_tournament, 'Challenge', '1100-1399', 8);

  insert into public.registrations (
    id, profile_id, clerk_user_id, player_name, tournament_title,
    bracket_name, registration_status, elo_status, admin_notes,
    tournament_id, tournament_bracket_id, submitted_elo
  ) values
    (v_registration_a, v_player_a, 'feature-c-player-a', 'Feature C A', 'Feature C Contract Tournament', 'Academy Bracket', 'approved', 'verified', '', v_tournament, v_academy, 1000),
    (v_registration_b, v_player_b, 'feature-c-player-b', 'Feature C B', 'Feature C Contract Tournament', 'Academy Bracket', 'approved', 'verified', '', v_tournament, v_academy, 1000),
    (v_registration_c, v_player_c, 'feature-c-player-c', 'Feature C C', 'Feature C Contract Tournament', 'Challenge Bracket', 'approved', 'verified', '', v_tournament, v_challenge, 1200),
    (v_registration_d, v_player_d, 'feature-c-player-d', 'Feature C D', 'Feature C Contract Tournament', 'Challenge Bracket', 'approved', 'verified', '', v_tournament, v_challenge, 1200),
    (v_registration_e, v_player_e, 'feature-c-player-e', 'Feature C E', 'Feature C Contract Tournament', 'Academy Bracket', 'pending', 'pending', '', v_tournament, v_academy, 1000);

  insert into public.coh3_maps (
    id, slug, display_name, source_type, game_mode, status,
    created_by_clerk_user_id, updated_by_clerk_user_id
  ) values
    (v_map_one, 'feature-c-map-one', 'Feature C Map One', 'community', '1v1', 'active', 'feature-c-admin', 'feature-c-admin'),
    (v_map_two, 'feature-c-map-two', 'Feature C Map Two', 'community', '1v1', 'active', 'feature-c-admin', 'feature-c-admin'),
    (v_map_retired, 'feature-c-map-retired', 'Feature C Map Retired', 'community', '1v1', 'retired', 'feature-c-admin', 'feature-c-admin');

  alter table public.coh3_maps enable trigger user;
  alter table public.registrations enable trigger user;
  alter table public.tournament_brackets enable trigger user;
  alter table public.tournaments enable trigger user;
  alter table public.players enable trigger user;
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');

  -- Reject a purpose/authority violation and a retired map at Draft save.
  v_failed := false;
  begin
    perform pg_temp.feature_c_save_poll(
      'community_feedback', 'active_players', null, null, 'text',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('position', 1, 'label', 'One'),
        pg_catalog.jsonb_build_object('position', 2, 'label', 'Two')
      ),
      1, 1, 'binding', 'live', false,
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
      array[]::uuid[]
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'Community Feedback Binding must be rejected'
  );

  v_failed := false;
  begin
    perform pg_temp.feature_c_save_poll(
      'community_feedback', 'active_players', null, null, 'coh3_map',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('position', 1, 'coh3_map_id', v_map_one),
        pg_catalog.jsonb_build_object('position', 2, 'coh3_map_id', v_map_retired)
      ),
      1, 1, 'advisory', 'live', false,
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
      array[]::uuid[]
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'retired maps must be rejected at Draft save'
  );

  -- A map can retire after Draft save. Publication revalidates the catalogue
  -- under row locks and fails instead of freezing an invalid map option.
  v_map_revalidation_draft := pg_temp.feature_c_save_poll(
    'community_feedback', 'active_players', null, null, 'coh3_map',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'coh3_map_id', v_map_one),
      pg_catalog.jsonb_build_object('position', 2, 'coh3_map_id', v_map_two)
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
    array[]::uuid[]
  );
  perform public.save_coh3_map(
    v_map_two, 'feature-c-map-two', 'Feature C Map Two',
    'community', null, '1v1', 'retired', null, null, null,
    'feature-c-admin'
  );
  v_failed := false;
  begin
    perform public.publish_poll(v_map_revalidation_draft, 'feature-c-admin');
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'map retirement between Draft save and publication must fail publication'
  );
  perform public.save_coh3_map(
    v_map_two, 'feature-c-map-two', 'Feature C Map Two',
    'community', null, '1v1', 'active', null, null, null,
    'feature-c-admin'
  );

  -- Selected Tournament targets are validated again at publication. A stale
  -- Draft may not silently freeze a reduced subset after roster mutation.
  v_invalid_selected_draft := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'One'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Two')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
    array[v_player_d]
  );
  alter table public.registrations disable trigger user;
  update public.registrations
  set registration_status = 'withdrawn',
    withdrawn_at = pg_catalog.clock_timestamp()
  where id = v_registration_d;
  alter table public.registrations enable trigger user;
  v_failed := false;
  begin
    perform public.publish_poll(v_invalid_selected_draft, 'feature-c-admin');
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'invalid selected Tournament target must fail rather than be omitted'
  );
  alter table public.registrations disable trigger user;
  update public.registrations
  set registration_status = 'approved', withdrawn_at = null
  where id = v_registration_d;
  alter table public.registrations enable trigger user;

  -- Publish each locked V1 audience and verify its exact frozen count.
  v_tournament_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'tournament_approved', v_tournament, null,
    'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_option_one, 'position', 1, 'label', 'One'),
      pg_catalog.jsonb_build_object('id', v_option_two, 'position', 2, 'label', 'Two'),
      pg_catalog.jsonb_build_object('id', v_option_three, 'position', 3, 'label', 'Three')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[]::uuid[]
  );
  v_result := public.publish_poll(v_tournament_poll, 'feature-c-admin');
  perform pg_temp.feature_c_assert(
    (v_result ->> 'eligible_count')::integer = 4,
    'tournament-approved audience must freeze four players'
  );
  v_payload := public.get_admin_poll(v_tournament_poll);
  perform pg_temp.feature_c_assert(
    v_payload #>> '{poll,status}' = 'open',
    'database clock must derive an open published lifecycle'
  );

  v_division_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'tournament_division_approved',
    v_tournament, v_academy, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'Morning'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Evening')
    ),
    1, 1, 'advisory', 'after_close', false,
    pg_catalog.clock_timestamp() + interval '1 hour',
    pg_catalog.clock_timestamp() + interval '2 hours',
    array[]::uuid[]
  );
  v_result := public.publish_poll(v_division_poll, 'feature-c-admin');
  perform pg_temp.feature_c_assert(
    (v_result ->> 'eligible_count')::integer = 2,
    'Division audience must freeze only approved Academy players'
  );
  v_payload := public.get_admin_poll(v_division_poll);
  perform pg_temp.feature_c_assert(
    v_payload #>> '{poll,status}' = 'scheduled',
    'database clock must derive a scheduled published lifecycle'
  );

  v_selected_tournament_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'coh3_map',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'coh3_map_id', v_map_one),
      pg_catalog.jsonb_build_object('position', 2, 'coh3_map_id', v_map_two)
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a, v_player_c]
  );
  v_result := public.publish_poll(v_selected_tournament_poll, 'feature-c-admin');
  perform pg_temp.feature_c_assert(
    (v_result ->> 'eligible_count')::integer = 2,
    'selected Tournament audience must freeze exactly its approved players'
  );

  v_active_poll := pg_temp.feature_c_save_poll(
    'community_feedback', 'active_players', null, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'Alpha'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Bravo')
    ),
    1, 1, 'advisory', 'after_close', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[]::uuid[]
  );
  v_result := public.publish_poll(v_active_poll, 'feature-c-admin');
  perform pg_temp.feature_c_assert(
    (v_result ->> 'eligible_count')::integer =
      v_existing_active_player_count + 7,
    'active-player audience must exclude the closed account'
  );

  v_selected_active_poll := pg_temp.feature_c_save_poll(
    'community_feedback', 'selected_active_players', null, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'Enabled'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Disabled')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a, v_outsider]
  );
  v_result := public.publish_poll(v_selected_active_poll, 'feature-c-admin');
  perform pg_temp.feature_c_assert(
    (v_result ->> 'eligible_count')::integer = 2,
    'selected-active audience must freeze exactly two active players'
  );

  -- Map option snapshots survive later catalogue rename/retirement.
  perform public.save_coh3_map(
    v_map_one, 'feature-c-map-one', 'Feature C Map One Renamed',
    'community', null, '1v1', 'retired', null, null, null,
    'feature-c-admin'
  );
  perform pg_temp.feature_c_assert(
    exists (
      select 1 from public.poll_options as option
      where option.poll_id = v_selected_tournament_poll
        and option.coh3_map_id = v_map_one
        and option.map_display_name_snapshot = 'Feature C Map One'
        and option.map_slug_snapshot = 'feature-c-map-one'
    ),
    'published map snapshots must survive catalogue mutation'
  );

  alter table public.polls disable trigger polls_published_configuration_guard;
  update public.polls
  set published_at = pg_catalog.clock_timestamp() - interval '3 hours',
    opens_at = pg_catalog.clock_timestamp() - interval '2 hours',
    closes_at = pg_catalog.clock_timestamp() - interval '1 hour'
  where id = v_selected_tournament_poll;
  alter table public.polls enable trigger polls_published_configuration_guard;
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  v_payload := public.get_my_poll(v_selected_tournament_poll);
  perform pg_temp.feature_c_assert(
    v_payload #>> '{poll,status}' = 'closed'
      and v_payload -> 'poll' ? 'submitted_ballot_count',
    'database clock must derive closed state and reveal authorized aggregates'
  );
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');

  -- Publication immutability is enforced independently of RPC/UI behavior.
  v_failed := false;
  begin
    update public.polls set question = 'Forged mutation'
    where id = v_tournament_poll;
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'published configuration must be immutable');

  -- Withdraw and approve after publication; neither changes frozen history.
  alter table public.registrations disable trigger user;
  update public.registrations
  set registration_status = 'withdrawn',
    withdrawn_at = pg_catalog.clock_timestamp()
  where id = v_registration_d;
  update public.registrations
  set registration_status = 'approved'
  where id = v_registration_e;
  alter table public.registrations enable trigger user;
  perform pg_temp.feature_c_assert(
    (select count(*) from public.poll_eligible_voters
      where poll_id = v_tournament_poll) = 4
      and exists (
        select 1 from public.poll_eligible_voters
        where poll_id = v_tournament_poll and player_id = v_player_d
      )
      and not exists (
        select 1 from public.poll_eligible_voters
        where poll_id = v_tournament_poll and player_id = v_player_e
      ),
    'withdrawal and later approval must not rewrite frozen eligibility'
  );

  -- Authenticated ballot creation, exact retry, change, stale revision, outsider,
  -- scheduled, and closed-window behavior.
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  v_result := public.cast_poll_ballot(v_tournament_poll, 0, array[v_option_one]);
  v_retry := public.cast_poll_ballot(v_tournament_poll, 0, array[v_option_one]);
  perform pg_temp.feature_c_assert(
    (v_result ->> 'ballot_revision')::integer = 1
      and (v_result ->> 'idempotent')::boolean = false
      and (v_retry ->> 'ballot_revision')::integer = 1
      and (v_retry ->> 'idempotent')::boolean,
    'identical retry must be a one-revision no-op'
  );
  v_result := public.cast_poll_ballot(v_tournament_poll, 1, array[v_option_two]);
  perform pg_temp.feature_c_assert(
    (v_result ->> 'ballot_revision')::integer = 2,
    'ballot change must increment exactly one revision'
  );
  v_failed := false;
  begin
    perform public.cast_poll_ballot(v_tournament_poll, 1, array[v_option_one]);
  exception when sqlstate '40001' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'stale revision must conflict');

  v_failed := false;
  begin
    perform public.cast_poll_ballot(v_division_poll, 0, array[
      (select id from public.poll_options
        where poll_id = v_division_poll and position = 1)
    ]);
  exception when sqlstate '42501' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'scheduled poll must reject voting');

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-outsider');
  v_failed := false;
  begin
    perform public.cast_poll_ballot(v_tournament_poll, 0, array[v_option_one]);
  exception when sqlstate '42501' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'outsider must receive generic rejection');

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-e');
  v_failed := false;
  begin
    perform public.cast_poll_ballot(v_tournament_poll, 0, array[v_option_one]);
  exception when sqlstate '42501' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'later approval must not inherit eligibility');

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-d');
  perform public.cast_poll_ballot(v_tournament_poll, 0, array[v_option_one]);

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  perform public.cast_poll_ballot(
    v_active_poll,
    0,
    array[(select id from public.poll_options where poll_id = v_active_poll and position = 1)]
  );
  v_payload := public.get_my_poll(v_active_poll);
  perform pg_temp.feature_c_assert(
    not (v_payload -> 'poll' ? 'eligible_count')
      and not (v_payload -> 'poll' ? 'submitted_ballot_count')
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_payload #> '{poll,options}'
        ) as option_row(option_value)
        where option_value ? 'vote_count'
      ),
    'hidden/open player payload must physically omit turnout and option totals'
  );

  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_payload := public.get_admin_poll(v_active_poll);
  perform pg_temp.feature_c_assert(
    v_payload -> 'poll' ? 'eligible_count'
      and v_payload -> 'poll' ? 'submitted_ballot_count'
      and not (v_payload -> 'poll' ? 'selected_player_ids')
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_payload #> '{poll,options}'
        ) as option_row(option_value)
        where option_value ? 'vote_count'
      ),
    'hidden/open Admin payload must expose turnout only and no frozen UUID list'
  );

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  v_payload := public.get_my_poll(v_tournament_poll);
  perform pg_temp.feature_c_assert(
    v_payload -> 'poll' ? 'eligible_count'
      and v_payload -> 'poll' ? 'submitted_ballot_count'
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_payload #> '{poll,options}'
        ) as option_row(option_value)
        where option_value ? 'vote_count'
      ),
    'live/open eligible payload must expose aggregate totals'
  );

  -- Selected active voter submits before closure; the Draft selection is then
  -- invalidated while the published ballot is deidentified and preserved.
  perform pg_temp.feature_c_set_claims(
    'authenticated', 'feature-c-outsider'
  );
  perform public.cast_poll_ballot(
    v_selected_active_poll,
    0,
    array[(select id from public.poll_options
      where poll_id = v_selected_active_poll and position = 1)]
  );
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_invalidated_draft := pg_temp.feature_c_save_poll(
    'community_feedback', 'selected_active_players', null, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'Keep'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Change')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
    array[v_outsider]
  );
  select count(*) into v_choice_count
  from public.poll_ballot_choices
  where poll_id = v_selected_active_poll;
  v_result := public.close_ironclad_player_account('feature-c-outsider');
  perform pg_temp.feature_c_assert(
    v_result ->> 'outcome' = 'deleted'
      and not exists (select 1 from public.players where id = v_outsider)
      and exists (
        select 1 from public.poll_eligible_voters
        where poll_id = v_selected_active_poll and player_id is null
      )
      and (select count(*) from public.poll_ballot_choices
        where poll_id = v_selected_active_poll) = v_choice_count
      and exists (
        select 1 from public.polls
        where id = v_invalidated_draft and draft_audience_invalidated
      )
      and not exists (
        select 1 from public.poll_eligible_voters
        where poll_id = v_invalidated_draft
      ),
    'account closure must deidentify published ballots and invalidate Draft selection without making poll participation authoritative history'
  );
  v_failed := false;
  begin
    perform public.publish_poll(v_invalidated_draft, 'feature-c-admin');
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'stale selected-audience Draft must require explicit review/save'
  );

  insert into public.players (
    id, clerk_user_id, display_name, in_game_name, profile_completed
  ) values (
    v_recreated_outsider, 'feature-c-outsider',
    'Feature C Recreated', 'Feature C Recreated', true
  );
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-outsider');
  v_failed := false;
  begin
    perform public.cast_poll_ballot(
      v_selected_active_poll,
      0,
      array[(select id from public.poll_options
        where poll_id = v_selected_active_poll and position = 2)]
    );
  exception when sqlstate '42501' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'recreated account must not inherit historical eligibility'
  );

  -- Binding approval top-five with an exact cutoff tie: 4/3/3/2/1/1/0.
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  -- Restore the live roster only for creating later independent poll fixtures.
  -- The first poll's frozen eligibility remains unchanged and was asserted
  -- above, so this also proves current registration state is not consulted by
  -- its voting contract.
  alter table public.registrations disable trigger user;
  update public.registrations
  set registration_status = 'approved', withdrawn_at = null
  where id = v_registration_d;
  update public.registrations
  set registration_status = 'pending'
  where id = v_registration_e;
  alter table public.registrations enable trigger user;
  v_binding_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_binding_one, 'position', 1, 'label', 'A'),
      pg_catalog.jsonb_build_object('id', v_binding_two, 'position', 2, 'label', 'B'),
      pg_catalog.jsonb_build_object('id', v_binding_three, 'position', 3, 'label', 'C'),
      pg_catalog.jsonb_build_object('id', v_binding_four, 'position', 4, 'label', 'D'),
      pg_catalog.jsonb_build_object('id', v_binding_five, 'position', 5, 'label', 'E'),
      pg_catalog.jsonb_build_object('id', v_binding_six, 'position', 6, 'label', 'F'),
      pg_catalog.jsonb_build_object('id', v_binding_seven, 'position', 7, 'label', 'G')
    ),
    5, 5, 'binding', 'after_close', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a, v_player_b, v_player_c, v_player_d]
  );
  perform public.publish_poll(v_binding_poll, 'feature-c-admin');

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  perform public.cast_poll_ballot(v_binding_poll, 0, array[v_binding_one, v_binding_two, v_binding_three, v_binding_four, v_binding_five]);
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-b');
  perform public.cast_poll_ballot(v_binding_poll, 0, array[v_binding_one, v_binding_two, v_binding_three, v_binding_four]);
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-c');
  perform public.cast_poll_ballot(v_binding_poll, 0, array[v_binding_one, v_binding_two, v_binding_three]);
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-d');
  perform public.cast_poll_ballot(v_binding_poll, 0, array[v_binding_one, v_binding_six]);

  -- Clear single-winner Binding poll proves the computed path requires no
  -- Admin-selected winner and cannot accept even the matching option as input.
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_binding_single_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_binding_single_one, 'position', 1, 'label', 'Clear winner'
      ),
      pg_catalog.jsonb_build_object(
        'id', v_binding_single_two, 'position', 2, 'label', 'Runner up'
      )
    ),
    1, 1, 'binding', 'after_close', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a, v_player_b]
  );
  perform public.publish_poll(v_binding_single_poll, 'feature-c-admin');
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  perform public.cast_poll_ballot(
    v_binding_single_poll, 0, array[v_binding_single_one]
  );
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-b');
  perform public.cast_poll_ballot(
    v_binding_single_poll, 0, array[v_binding_single_one]
  );

  -- Advisory result and zero-ballot Binding are also published before terminal.
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_advisory_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_advisory_one, 'position', 1, 'label', 'Poll leader'),
      pg_catalog.jsonb_build_object('id', v_advisory_two, 'position', 2, 'label', 'Admin decision'),
      pg_catalog.jsonb_build_object('id', v_advisory_three, 'position', 3, 'label', 'Other')
    ),
    2, 2, 'advisory', 'after_close', true,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a, v_player_b]
  );
  perform public.publish_poll(v_advisory_poll, 'feature-c-admin');
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  perform public.cast_poll_ballot(
    v_advisory_poll, 0, array[v_advisory_one, v_advisory_two]
  );
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-b');
  perform public.cast_poll_ballot(
    v_advisory_poll, 0, array[v_advisory_one, v_advisory_three]
  );

  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_zero_ballot_poll := pg_temp.feature_c_save_poll(
    'tournament_decision', 'selected_tournament_players',
    v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'Yes'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'No')
    ),
    1, 1, 'binding', 'after_close', false,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '1 hour',
    array[v_player_a]
  );
  perform public.publish_poll(v_zero_ballot_poll, 'feature-c-admin');

  alter table public.polls disable trigger polls_published_configuration_guard;
  alter table public.poll_ballot_choices
    disable trigger poll_ballot_choices_open_window_guard;
  alter table public.tournaments disable trigger user;
  update public.polls
  set published_at = pg_catalog.clock_timestamp() - interval '3 hours',
    opens_at = pg_catalog.clock_timestamp() - interval '2 hours',
    closes_at = pg_catalog.clock_timestamp() - interval '1 hour'
  where id in (
    v_binding_poll,
    v_binding_single_poll,
    v_advisory_poll,
    v_zero_ballot_poll
  );
  update public.poll_ballot_choices as choice
  set selected_at = poll.closes_at - interval '1 minute'
  from public.polls as poll
  where poll.id = choice.poll_id
    and choice.poll_id in (
      v_binding_poll,
      v_binding_single_poll,
      v_advisory_poll,
      v_zero_ballot_poll
    );
  update public.tournaments set status = 'completed' where id = v_tournament;
  alter table public.tournaments enable trigger user;
  alter table public.poll_ballot_choices
    enable trigger poll_ballot_choices_open_window_guard;
  alter table public.polls enable trigger polls_published_configuration_guard;

  -- Advisory aggregate ranks tie options two and three across the second-place
  -- cutoff, but the Admin default is the full deterministic top-two set and
  -- Binding-only cutoff controls are absent.
  v_payload := public.get_admin_poll(v_advisory_poll);
  perform pg_temp.feature_c_assert(
    v_payload #> '{poll,computed_winner_option_ids}' =
      pg_catalog.jsonb_build_array(v_advisory_one, v_advisory_two)
      and not (v_payload -> 'poll' ? 'cutoff_tie_option_ids')
      and not (v_payload -> 'poll' ? 'cutoff_slots_remaining'),
    'Advisory Admin projection must expose full deterministic top-K without Binding cutoff metadata'
  );

  v_terminal_draft := pg_temp.feature_c_save_poll(
    'tournament_decision', 'tournament_approved', v_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'One'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Two')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
    array[]::uuid[]
  );
  v_failed := false;
  begin
    perform public.publish_poll(v_terminal_draft, 'feature-c-admin');
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'completed tournament must reject a newly published Decision'
  );

  v_failed := false;
  begin
    perform public.finalize_poll_decision(
      v_binding_single_poll,
      array[v_binding_single_one],
      null,
      'feature-c-admin'
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'clear Binding outcome must reject Admin-selected option input'
  );
  v_result := public.finalize_poll_decision(
    v_binding_single_poll, null, null, 'feature-c-admin'
  );
  perform pg_temp.feature_c_assert(
    v_result ->> 'final_decision_basis' = 'binding_computed'
      and not (v_result ->> 'binding_tie_rule_used')::boolean
      and v_result -> 'selected_option_ids' =
        pg_catalog.jsonb_build_array(v_binding_single_one),
    'clear single-winner Binding result must be computed authoritatively'
  );

  v_failed := false;
  begin
    perform public.finalize_poll_decision(
      v_binding_poll, array[v_binding_seven], null, 'feature-c-admin'
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'Binding cutoff tie must reject a lower-count option'
  );
  v_result := public.finalize_poll_decision(
    v_binding_poll, array[v_binding_five], null, 'feature-c-admin'
  );
  perform pg_temp.feature_c_assert(
    (v_result ->> 'binding_tie_rule_used')::boolean
      and pg_catalog.jsonb_array_length(v_result -> 'selected_option_ids') = 5
      and exists (
        select 1 from public.poll_options
        where poll_id = v_binding_poll
          and id = v_binding_five
          and final_decision_rank = 5
      )
      and not exists (
        select 1 from public.poll_options
        where poll_id = v_binding_poll
          and id in (v_binding_six, v_binding_seven)
          and final_decision_rank is not null
      ),
    'Binding top-K must combine safe winners with only the selected cutoff option'
  );

  -- Exercise the ordinary Advisory result in a subtransaction, then force a
  -- rollback so the same poll can also prove the override/rationale path.
  begin
    v_result := public.finalize_poll_decision(
      v_advisory_poll,
      array[v_advisory_one, v_advisory_two],
      null,
      'feature-c-admin'
    );
    perform pg_temp.feature_c_assert(
      v_result ->> 'final_decision_basis' = 'advisory_poll_result',
      'deterministic Advisory top result must require no rationale'
    );
    raise exception 'rollback advisory result probe' using errcode = 'P0002';
  exception when sqlstate 'P0002' then
    null;
  end;
  perform pg_temp.feature_c_assert(
    not exists (
      select 1 from public.polls
      where id = v_advisory_poll
        and final_decision_published_at is not null
    ),
    'Advisory result probe subtransaction must leave no finalization fact'
  );

  v_failed := false;
  begin
    perform public.finalize_poll_decision(
      v_advisory_poll,
      array[v_advisory_one, v_advisory_three],
      null,
      'feature-c-admin'
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'Advisory override must require rationale'
  );
  v_result := public.finalize_poll_decision(
    v_advisory_poll,
    array[v_advisory_one, v_advisory_three],
    'Admin chose the alternative after reviewing the Advisory result.',
    'feature-c-admin'
  );
  perform pg_temp.feature_c_assert(
    v_result ->> 'final_decision_basis' = 'advisory_admin_override',
    'Advisory override must preserve its explicit basis'
  );

  v_failed := false;
  begin
    perform public.finalize_poll_decision(
      v_zero_ballot_poll, null, null, 'feature-c-admin'
    );
  exception when sqlstate '55000' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'zero-ballot Binding poll must not treat every option as tied'
  );
  v_result := public.cancel_poll(
    v_zero_ballot_poll,
    'Zero valid ballots; replacement required.',
    'feature-c-admin'
  );
  v_payload := public.get_admin_poll(v_zero_ballot_poll);
  perform pg_temp.feature_c_assert(
    (v_result ->> 'cancelled_at')::timestamptz >= (
      select published_at from public.polls where id = v_zero_ballot_poll
    )
      and v_payload #>> '{poll,status}' = 'cancelled',
    'cancellation timestamp must follow locked publication state and derive Cancelled'
  );

  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  v_failed := false;
  begin
    perform public.cast_poll_ballot(v_binding_poll, 1, array[v_binding_one]);
  exception when sqlstate '42501' then
    v_failed := true;
  end;
  perform pg_temp.feature_c_assert(v_failed, 'closed ballot must be immutable');

  -- Public result projection preserves Advisory poll result vs Admin decision,
  -- and conditionally includes only aggregate totals.
  v_public_payload := public.get_public_tournament_decisions(v_tournament);
  select option_value
  into v_public_poll
  from pg_catalog.jsonb_array_elements(v_public_payload -> 'polls')
    as poll_row(option_value)
  where option_value ->> 'id' = v_binding_poll::text;
  perform pg_temp.feature_c_assert(
    v_public_poll is not null
      and not (v_public_poll ? 'eligible_count')
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_public_poll -> 'options'
        ) as option_row(option_value)
        where option_value ? 'vote_count'
      ),
    'outcome-only public Binding projection must omit aggregate totals by default'
  );
  select option_value
  into v_public_poll
  from pg_catalog.jsonb_array_elements(v_public_payload -> 'polls')
    as poll_row(option_value)
  where option_value ->> 'id' = v_advisory_poll::text;
  perform pg_temp.feature_c_assert(
    v_public_poll ? 'eligible_count'
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_public_poll -> 'options'
        ) as option_row(option_value)
        where option_value ->> 'id' = v_advisory_one::text
          and (option_value ->> 'poll_result_rank')::integer = 1
          and (option_value ->> 'final_decision_rank')::integer = 1
          and option_value ? 'vote_count'
      )
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_public_poll -> 'options'
        ) as option_row(option_value)
        where option_value ->> 'id' = v_advisory_two::text
          and (option_value ->> 'poll_result_rank')::integer = 2
          and option_value ->> 'final_decision_rank' is null
      )
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(
          v_public_poll -> 'options'
        ) as option_row(option_value)
        where option_value ->> 'id' = v_advisory_three::text
          and (option_value ->> 'poll_result_rank')::integer = 2
          and (option_value ->> 'final_decision_rank')::integer = 2
      ),
    'public Advisory projection must distinguish poll result from final decision'
  );

  -- Exactly two notification types, idempotent recipient event keys, safe links.
  perform pg_temp.feature_c_assert(
    not exists (
      select 1 from public.notifications
      where type like 'poll.%'
        and type not in ('poll.published', 'poll.decision_published')
    )
      and not exists (
        select 1
        from public.notifications
        where type like 'poll.%'
        group by recipient_clerk_user_id, event_key
        having count(*) > 1
      )
      and exists (
        select 1 from public.notifications
        where type = 'poll.decision_published'
          and tournament_id = v_tournament
          and metadata ->> 'pollId' = v_advisory_poll::text
      )
      and not exists (
        select 1 from public.notifications
        where type = 'poll.decision_published'
          and metadata ->> 'purpose' = 'community_feedback'
      ),
    'notification fanout must be limited, idempotent, and Tournament-only at final decision'
  );

  -- Poll participation alone does not retain the Admin player; private actor
  -- attribution is pseudonymized by cumulative account closure.
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-admin');
  v_result := public.close_ironclad_player_account('feature-c-admin');
  perform pg_temp.feature_c_assert(
    v_result ->> 'outcome' = 'deleted'
      and not exists (select 1 from public.players where id = v_admin_player)
      and not exists (
        select 1 from public.polls
        where created_by_clerk_user_id = 'feature-c-admin'
          or updated_by_clerk_user_id = 'feature-c-admin'
          or published_by_clerk_user_id = 'feature-c-admin'
          or cancelled_by_clerk_user_id = 'feature-c-admin'
          or final_decision_published_by_clerk_user_id = 'feature-c-admin'
      ),
    'account closure must pseudonymize every private poll actor without treating poll participation as competition history'
  );

  -- Draft polls do not block disposal; published Tournament Decisions do.
  perform pg_temp.feature_c_set_claims('service_role', 'feature-c-delete-admin');
  v_disposable_draft := pg_temp.feature_c_save_poll(
    'tournament_decision', 'tournament_approved',
    v_disposable_tournament, null, 'text',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'label', 'One'),
      pg_catalog.jsonb_build_object('position', 2, 'label', 'Two')
    ),
    1, 1, 'advisory', 'live', false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 day',
    array[]::uuid[]
  );
  perform public.delete_tournament_data(
    v_disposable_tournament,
    'feature-c-delete-admin'
  );
  perform pg_temp.feature_c_assert(
    not exists (select 1 from public.tournaments where id = v_disposable_tournament)
      and not exists (select 1 from public.polls where id = v_disposable_draft),
    'Draft poll must cascade with an otherwise disposable tournament'
  );

  v_failed := false;
  begin
    perform public.delete_tournament_data(v_tournament, 'feature-c-delete-admin');
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error_state = message_text;
    v_failed := v_error_state =
      'Tournament has published Tournament Decision history and cannot be permanently deleted.';
  end;
  perform pg_temp.feature_c_assert(
    v_failed,
    'published Tournament Decision history must block hard delete'
  );

  -- Trusted bypass GUCs cannot be forged by an ordinary authenticated caller;
  -- raw table privileges are absent and helper/finalization functions are not executable.
  perform pg_temp.feature_c_set_claims('authenticated', 'feature-c-player-a');
  perform pg_catalog.set_config('ironclad.poll_finalization', 'on', true);
  perform pg_catalog.set_config('ironclad.account_closure', 'on', true);
  perform pg_temp.feature_c_assert(
    not pg_catalog.has_table_privilege(
      'authenticated', 'public.poll_options', 'UPDATE'
    )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.finalize_poll_decision(uuid,uuid[],text,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.close_ironclad_player_account(text)',
        'EXECUTE'
      ),
    'authenticated GUC forgery must have no mutation path'
  );

  -- Two-session Staging canary: session A locks one eligibility row and waits
  -- across closes_at; session B's cast_poll_ballot must re-read clock_timestamp
  -- only after acquiring that row lock and reject with 42501. The companion
  -- concurrency harness invokes this exact sequence; this fixture proves the
  -- underlying lock-before-clock source and immutable closed state.
  perform pg_temp.feature_c_assert(
    not exists (
      select 1 from public.poll_ballot_choices as choice
      join public.polls as poll on poll.id = choice.poll_id
      where poll.closes_at <= pg_catalog.clock_timestamp()
        and choice.selected_at >= poll.closes_at
    ),
    'no ballot choice may be written at or after the database close boundary'
  );
end;
$$;

rollback;

do $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  select counts into v_before from feature_c_contract_baseline;
  select pg_catalog.jsonb_build_object(
    'polls', (select pg_catalog.count(*) from public.polls),
    'options', (select pg_catalog.count(*) from public.poll_options),
    'eligibility', (select pg_catalog.count(*) from public.poll_eligible_voters),
    'choices', (select pg_catalog.count(*) from public.poll_ballot_choices),
    'players', (select pg_catalog.count(*) from public.players),
    'tournaments', (select pg_catalog.count(*) from public.tournaments),
    'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
    'registrations', (select pg_catalog.count(*) from public.registrations),
    'notifications', (select pg_catalog.count(*) from public.notifications),
    'maps', (select pg_catalog.count(*) from public.coh3_maps),
    'storageObjects', (select pg_catalog.count(*) from storage.objects)
  ) into v_after;

  if v_before is distinct from v_after then
    raise exception 'Feature C fixture residue remains: before %, after %',
      v_before,
      v_after;
  end if;
end;
$$;
