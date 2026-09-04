-- Rollback-only behavioral proof for the Not Held Division authority.
begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '3min';
set local request.jwt.claims = '{"role":"service_role","sub":"test:not-held-division"}';

create function pg_temp.not_held_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Not Held Division closure failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_not_held_rejection(
  p_tournament_bracket_id uuid,
  p_message_fragment text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.close_tournament_division_without_launch(
      p_tournament_bracket_id,
      'minimum_roster_not_reached',
      null,
      'test:not-held-division'
    );
    raise exception 'Expected Not Held rejection for %', p_tournament_bracket_id;
  exception
    when sqlstate '55000' then
      if position(lower(p_message_fragment) in lower(sqlerrm)) = 0 then
        raise exception
          'Unexpected Not Held rejection for %: %',
          p_tournament_bracket_id,
          sqlerrm;
      end if;
  end;
end;
$$;

create temporary table not_held_baseline as
select
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (select count(*) from public.leaderboard_point_events) as point_events,
  (
    select count(*)
    from public.leaderboard_tournament_season_memberships
  ) as season_memberships,
  (
    select count(*)
    from public.leaderboard_division_settlements
  ) as division_settlements;

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  current_elo,
  profile_completed
)
select
  ('f1000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'not-held-player-' || number,
  'Not Held Player ' || number,
  'NotHeld' || number,
  900,
  true
from generate_series(1, 14) as number;

insert into public.tournaments (
  id,
  title,
  slug,
  description,
  banner_image_url,
  format,
  status,
  registration_enabled,
  prize_pool
)
values
  (
    'f1100000-0000-4000-8000-000000000001',
    'Not Held allowed fixture',
    'not-held-allowed-fixture',
    'Rollback-only Not Held behavior.',
    '/fixture.jpg',
    '1v1',
    'registration_open',
    false,
    ''
  ),
  (
    'f1100000-0000-4000-8000-000000000002',
    'Not Held ready rejection fixture',
    'not-held-ready-rejection-fixture',
    'Rollback-only Not Held readiness guard.',
    '/fixture.jpg',
    '1v1',
    'registration_open',
    false,
    ''
  ),
  (
    'f1100000-0000-4000-8000-000000000003',
    'Not Held launched rejection fixture',
    'not-held-launched-rejection-fixture',
    'Rollback-only Not Held launch guard.',
    '/fixture.jpg',
    '1v1',
    'in_progress',
    false,
    ''
  ),
  (
    'f1100000-0000-4000-8000-000000000004',
    'Not Held evidence rejection fixture',
    'not-held-evidence-rejection-fixture',
    'Rollback-only Not Held evidence guard.',
    '/fixture.jpg',
    '1v1',
    'registration_open',
    false,
    ''
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
    'f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000001',
    'Academy',
    '0-1099',
    8,
    null
  ),
  (
    'f1200000-0000-4000-8000-000000000002',
    'f1100000-0000-4000-8000-000000000002',
    'Academy',
    '0-1099',
    8,
    null
  ),
  (
    'f1200000-0000-4000-8000-000000000003',
    'f1100000-0000-4000-8000-000000000003',
    'Academy',
    '0-1099',
    8,
    null
  ),
  (
    'f1200000-0000-4000-8000-000000000004',
    'f1100000-0000-4000-8000-000000000004',
    'Academy',
    '0-1099',
    8,
    null
  );

set local ironclad.explicit_division_launch = 'on';
update public.tournament_brackets
set launched_at = '2099-09-03 00:00:00+00'
where id = 'f1200000-0000-4000-8000-000000000003';
set local ironclad.explicit_division_launch = '';

update public.tournaments
set registration_enabled = true
where id in (
  'f1100000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000002',
  'f1100000-0000-4000-8000-000000000004'
);

set local ironclad.waitlist_confirmed = 'on';

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
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at,
  waitlist_offer_status,
  waitlist_offer_created_at,
  waitlist_offer_expires_at,
  waitlist_offer_resolved_at
)
values
  (
    'f1300000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'not-held-player-1',
    'NotHeld1',
    900,
    'Not Held allowed fixture',
    'Academy',
    'pending',
    'pending',
    '',
    'f1100000-0000-4000-8000-000000000001',
    'f1200000-0000-4000-8000-000000000001',
    '2099-09-03 00:00:01+00',
    null,
    null,
    null,
    null
  ),
  (
    'f1300000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    'not-held-player-2',
    'NotHeld2',
    900,
    'Not Held allowed fixture',
    'Academy',
    'manual_review',
    'pending',
    '',
    'f1100000-0000-4000-8000-000000000001',
    'f1200000-0000-4000-8000-000000000001',
    '2099-09-03 00:00:02+00',
    null,
    null,
    null,
    null
  ),
  (
    'f1300000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000003',
    'not-held-player-3',
    'NotHeld3',
    900,
    'Not Held allowed fixture',
    'Academy',
    'waitlisted',
    'pending',
    '',
    'f1100000-0000-4000-8000-000000000001',
    'f1200000-0000-4000-8000-000000000001',
    '2099-09-03 00:00:03+00',
    'offered',
    '2099-09-03 01:00:00+00',
    '2099-09-04 01:00:00+00',
    null
  );

set local ironclad.waitlist_confirmed = '';

-- A private, evidence-free draft is removable through the existing reset
-- authority and is not treated as a completed competition.
insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by
)
values (
  'f1400000-0000-4000-8000-000000000001',
  'f1200000-0000-4000-8000-000000000001',
  'single_elimination',
  3,
  8,
  'test:not-held-division'
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
)
values (
  'f1500000-0000-4000-8000-000000000001',
  'f1400000-0000-4000-8000-000000000001',
  1,
  'Rollback-only private round'
);

insert into public.tournament_matches (
  id,
  generated_bracket_id,
  round_id,
  match_number,
  status
)
values (
  'f1600000-0000-4000-8000-000000000001',
  'f1400000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  1,
  'scheduled'
);

create temporary table allowed_registration_snapshot as
select id, profile_id, clerk_user_id, tournament_id, tournament_bracket_id
from public.registrations
where tournament_bracket_id =
  'f1200000-0000-4000-8000-000000000001';

create temporary table allowed_result as
select public.close_tournament_division_without_launch(
  'f1200000-0000-4000-8000-000000000001',
  'minimum_roster_not_reached',
  'Rollback-only operational detail',
  'test:not-held-division'
) as value;

select pg_temp.not_held_assert(
  (select value ->> 'reasonCode' from allowed_result) =
    'minimum_roster_not_reached',
  'the allowed closure did not return its fixed reason'
);
select pg_temp.not_held_assert(
  (select (value ->> 'activeRegistrationCount')::integer from allowed_result) = 3,
  'the active roster snapshot did not include the offered reservation'
);
select pg_temp.not_held_assert(
  (select (value ->> 'waitlistRegistrationCount')::integer from allowed_result) = 1,
  'the waitlist snapshot was incorrect'
);
select pg_temp.not_held_assert(
  (select (value ->> 'alreadyNotHeld')::boolean from allowed_result) is false,
  'the first closure was reported as an idempotent repeat'
);

select pg_temp.not_held_assert(
  (
    select count(*) = 1
    from public.tournament_division_not_held_closures
    where tournament_bracket_id =
      'f1200000-0000-4000-8000-000000000001'
      and reason_code = 'minimum_roster_not_reached'
      and active_registration_count = 3
      and waitlist_registration_count = 1
      and closed_by_clerk_user_id = 'test:not-held-division'
  ),
  'the immutable closure audit was not stored exactly once'
);
select pg_temp.not_held_assert(
  (
    select count(*) = 3
    from public.registrations as registration
    join allowed_registration_snapshot as baseline
      on baseline.id = registration.id
     and baseline.profile_id is not distinct from registration.profile_id
     and baseline.clerk_user_id = registration.clerk_user_id
     and baseline.tournament_id is not distinct from registration.tournament_id
     and baseline.tournament_bracket_id is not distinct from
       registration.tournament_bracket_id
    where registration.tournament_bracket_id =
      'f1200000-0000-4000-8000-000000000001'
  ),
  'registration IDs, ownership, or Division relationships changed'
);
select pg_temp.not_held_assert(
  (
    select waitlist_offer_status = 'cancelled'
      and waitlist_offer_resolved_at is not null
    from public.registrations
    where id = 'f1300000-0000-4000-8000-000000000003'
  ),
  'the actionable waitlist offer was not terminalized'
);
select pg_temp.not_held_assert(
  not exists (
    select 1
    from public.generated_brackets
    where tournament_bracket_id =
      'f1200000-0000-4000-8000-000000000001'
  ),
  'the proven-safe private draft was not reset'
);
select pg_temp.not_held_assert(
  (
    select status = 'registration_open'
      and registration_enabled is false
      and first_completed_at is null
      and terminal_at is null
    from public.tournaments
    where id = 'f1100000-0000-4000-8000-000000000001'
  ),
  'closure fabricated an event terminal/completion fact or left registration open'
);
select pg_temp.not_held_assert(
  (
    select launched_at is null
    from public.tournament_brackets
    where id = 'f1200000-0000-4000-8000-000000000001'
  ),
  'closure fabricated a launch timestamp'
);
select pg_temp.not_held_assert(
  (
    select count(*) = 3
    from public.notifications
    where tournament_id = 'f1100000-0000-4000-8000-000000000001'
      and type = 'tournament.division_not_held'
  ),
  'closure did not create one lifecycle notification per preserved registration'
);
select pg_temp.not_held_assert(
  not exists (
    select 1
    from public.notifications
    where tournament_id = 'f1100000-0000-4000-8000-000000000001'
      and type = 'badge.unlocked'
  ),
  'closure created a Badge notification'
);

create temporary table repeat_result as
select public.close_tournament_division_without_launch(
  'f1200000-0000-4000-8000-000000000001',
  'minimum_roster_not_reached',
  'A repeated detail must not rewrite the audit',
  'test:not-held-division-repeat'
) as value;

select pg_temp.not_held_assert(
  (select (value ->> 'alreadyNotHeld')::boolean from repeat_result),
  'repeat closure was not idempotent'
);
select pg_temp.not_held_assert(
  (
    select count(*) = 3
      and count(distinct event_key) = 3
    from public.notifications
    where tournament_id = 'f1100000-0000-4000-8000-000000000001'
      and type = 'tournament.division_not_held'
  ),
  'repeat closure duplicated a lifecycle notification'
);
select pg_temp.not_held_assert(
  (
    select detail = 'Rollback-only operational detail'
      and closed_by_clerk_user_id = 'test:not-held-division'
    from public.tournament_division_not_held_closures
    where tournament_bracket_id =
      'f1200000-0000-4000-8000-000000000001'
  ),
  'repeat closure rewrote immutable audit data'
);

do $$
begin
  begin
    update public.tournament_division_not_held_closures
    set detail = 'forbidden rewrite'
    where tournament_bracket_id =
      'f1200000-0000-4000-8000-000000000001';
    raise exception 'Expected immutable Not Held audit update rejection';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.tournament_brackets
    set launched_at = clock_timestamp()
    where id = 'f1200000-0000-4000-8000-000000000001';
    raise exception 'Expected Not Held launch mutation rejection';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.registrations
    set player_name = 'Forbidden history rewrite'
    where id = 'f1300000-0000-4000-8000-000000000001';
    raise exception 'Expected Not Held registration mutation rejection';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    perform public.generate_tournament_bracket(
      'f1200000-0000-4000-8000-000000000001',
      'test:not-held-division'
    );
    raise exception 'Expected Not Held generation rejection';
  exception
    when others then
      if position('not held' in lower(sqlerrm)) = 0
        and position('regeneration blocked' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;
end;
$$;

-- Eight active roster reservations are too late for the minimum-roster reason.
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
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at
)
select
  ('f1300000-0000-4000-8000-' || lpad((number + 3)::text, 12, '0'))::uuid,
  ('f1000000-0000-4000-8000-' || lpad((number + 3)::text, 12, '0'))::uuid,
  'not-held-player-' || (number + 3),
  'NotHeld' || (number + 3),
  900,
  'Not Held ready rejection fixture',
  'Academy',
  'pending',
  'pending',
  '',
  'f1100000-0000-4000-8000-000000000002',
  'f1200000-0000-4000-8000-000000000002',
  '2099-09-03 00:01:00+00'::timestamptz + number * interval '1 second'
from generate_series(1, 8) as number;

select pg_temp.expect_not_held_rejection(
  'f1200000-0000-4000-8000-000000000002',
  'ready division'
);
select pg_temp.expect_not_held_rejection(
  'f1200000-0000-4000-8000-000000000003',
  'launched division'
);

-- A result-bearing private bracket is not a removable draft.
insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by
)
values (
  'f1400000-0000-4000-8000-000000000004',
  'f1200000-0000-4000-8000-000000000004',
  'single_elimination',
  2,
  8,
  'test:not-held-division'
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
)
values (
  'f1500000-0000-4000-8000-000000000004',
  'f1400000-0000-4000-8000-000000000004',
  1,
  'Rollback-only evidence round'
);

set local session_replication_role = replica;

insert into public.tournament_matches (
  id,
  generated_bracket_id,
  round_id,
  match_number,
  player_one_score,
  player_two_score,
  status
)
values (
  'f1600000-0000-4000-8000-000000000004',
  'f1400000-0000-4000-8000-000000000004',
  'f1500000-0000-4000-8000-000000000004',
  1,
  1,
  0,
  'scheduled'
);

set local session_replication_role = origin;

select pg_temp.expect_not_held_rejection(
  'f1200000-0000-4000-8000-000000000004',
  'competitive evidence'
);

select pg_temp.not_held_assert(
  (
    select row(
      (select count(*) from public.player_badge_awards),
      (select count(*) from public.player_badge_reveals),
      (select count(*) from public.leaderboard_point_events),
      (
        select count(*)
        from public.leaderboard_tournament_season_memberships
      ),
      (
        select count(*)
        from public.leaderboard_division_settlements
      )
    ) = row(
      baseline.badge_awards,
      baseline.badge_reveals,
      baseline.point_events,
      baseline.season_memberships,
      baseline.division_settlements
    )
    from not_held_baseline as baseline
  ),
  'closure changed Badge, Reveal, point, season, or settlement totals'
);

select pg_temp.not_held_assert(
  has_function_privilege(
    'service_role',
    'public.close_tournament_division_without_launch(uuid,text,text,text)',
    'EXECUTE'
  ),
  'service_role cannot execute the closure authority'
);
select pg_temp.not_held_assert(
  not has_function_privilege(
    'authenticated',
    'public.close_tournament_division_without_launch(uuid,text,text,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.close_tournament_division_without_launch(uuid,text,text,text)',
    'EXECUTE'
  ),
  'public roles can execute the closure authority'
);
select pg_temp.not_held_assert(
  pg_get_function_result(
    'public.get_tournament_division_not_held_states()'::regprocedure
  ) not ilike '%closed_by_clerk_user_id%'
    and pg_get_function_result(
      'public.get_tournament_division_not_held_states()'::regprocedure
    ) not ilike '%detail%'
    and pg_get_function_result(
      'public.get_tournament_division_not_held_states()'::regprocedure
    ) not ilike '%registration_count%',
  'public state projection exposed private audit fields'
);

select jsonb_build_object(
  'status', 'not_held_division_closure_passed',
  'allowed_active_count', 3,
  'allowed_waitlist_count', 1,
  'registrations_preserved', true,
  'notifications_deduplicated', true,
  'private_draft_removed', true,
  'ready_rejected', true,
  'launched_rejected', true,
  'result_evidence_rejected', true,
  'badge_rewards_preserved', true,
  'rollback_only', true
);

rollback;
