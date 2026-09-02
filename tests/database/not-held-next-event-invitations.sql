-- Rollback-only behavioral proof for optional Not Held next-event invitations.
begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '3min';
set local request.jwt.claims = '{"role":"service_role","sub":"test:division-invitations"}';

create function pg_temp.invitation_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Division invitation proof failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.add_invitation_target(
  p_tournament_id uuid,
  p_bracket_id uuid,
  p_title text,
  p_slug text,
  p_bracket_name text
)
returns void
language plpgsql
as $$
begin
  insert into public.tournaments (
    id, title, slug, description, banner_image_url, format, status,
    registration_enabled, prize_pool
  )
  values (
    p_tournament_id, p_title, p_slug,
    'Rollback-only Division invitation target.', '/fixture.jpg', '1v1',
    'registration_open', true, ''
  );

  insert into public.tournament_brackets (
    id, tournament_id, name, elo_rules, max_players
  )
  values (
    p_bracket_id,
    p_tournament_id,
    p_bracket_name,
    case p_bracket_name
      when 'Academy' then '0-1099'
      when 'Challenge' then '1100-1399'
      else '1400+'
    end,
    8
  );

  update public.tournaments
  set registration_enabled = true
  where id = p_tournament_id;
end;
$$;

create temporary table invitation_baseline as
select
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (select count(*) from public.notifications where type = 'badge.unlocked')
    as badge_notifications,
  (select count(*) from public.leaderboard_point_events) as point_events,
  (
    select count(*)
    from public.leaderboard_tournament_season_memberships
  ) as season_memberships;

set local session_replication_role = replica;

insert into public.players (
  id, clerk_user_id, display_name, in_game_name, current_elo,
  profile_completed
)
values
  (
    'fa000000-0000-4000-8000-000000000001',
    'division-invitation-player-1',
    'Division Invitation Player 1',
    'InvitationOne',
    900,
    true
  ),
  (
    'fa000000-0000-4000-8000-000000000002',
    'division-invitation-player-2',
    'Division Invitation Player 2',
    'InvitationTwo',
    1200,
    true
  ),
  (
    'fa000000-0000-4000-8000-000000000003',
    'division-invitation-player-3',
    'Division Invitation Player 3',
    'InvitationThree',
    900,
    true
  );

insert into public.tournaments (
  id, title, slug, description, banner_image_url, format, status,
  registration_enabled, prize_pool
)
values (
  'fa100000-0000-4000-8000-000000000001',
  'Division invitation Not Held source',
  'division-invitation-not-held-source',
  'Rollback-only preserved source registrations.',
  '/fixture.jpg',
  '1v1',
  'registration_open',
  false,
  ''
);

insert into public.tournament_brackets (
  id, tournament_id, name, elo_rules, max_players
)
values
  (
    'fa200000-0000-4000-8000-000000000001',
    'fa100000-0000-4000-8000-000000000001',
    'Academy',
    '0-1099',
    8
  ),
  (
    'fa200000-0000-4000-8000-000000000002',
    'fa100000-0000-4000-8000-000000000001',
    'Challenge',
    '1100-1399',
    8
  );

insert into public.tournament_division_not_held_closures (
  tournament_bracket_id,
  reason_code,
  detail,
  closed_at,
  closed_by_clerk_user_id,
  active_registration_count,
  waitlist_registration_count
)
values
  (
    'fa200000-0000-4000-8000-000000000001',
    'minimum_roster_not_reached',
    null,
    clock_timestamp(),
    'test:division-invitations',
    2,
    0
  ),
  (
    'fa200000-0000-4000-8000-000000000002',
    'minimum_roster_not_reached',
    null,
    clock_timestamp(),
    'test:division-invitations',
    1,
    0
  );

insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, submitted_elo,
  tournament_title, bracket_name, registration_status, elo_status,
  admin_notes, tournament_id, tournament_bracket_id
)
values
  (
    'fa300000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    'division-invitation-player-1',
    'InvitationOne',
    900,
    'Division invitation Not Held source',
    'Academy',
    'pending',
    'pending',
    '',
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001'
  ),
  (
    'fa300000-0000-4000-8000-000000000002',
    'fa000000-0000-4000-8000-000000000002',
    'division-invitation-player-2',
    'InvitationTwo',
    1200,
    'Division invitation Not Held source',
    'Challenge',
    'pending',
    'pending',
    '',
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000002'
  ),
  (
    'fa300000-0000-4000-8000-000000000003',
    'fa000000-0000-4000-8000-000000000003',
    'division-invitation-player-3',
    'InvitationThree',
    900,
    'Division invitation Not Held source',
    'Academy',
    'rejected',
    'rejected',
    '',
    'fa100000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001'
  );

set local session_replication_role = origin;

-- Historical eligibility is enough to invite. Current ELO is deliberately
-- different so only the existing registration authority can classify the
-- player when they continue after acceptance.
update public.players
set current_elo = 1200
where id = 'fa000000-0000-4000-8000-000000000001';
select pg_temp.invitation_assert(
  (
    select player.current_elo <> registration.submitted_elo
    from public.players as player
    join public.registrations as registration
      on registration.profile_id = player.id
    where registration.id = 'fa300000-0000-4000-8000-000000000001'
  ),
  'current ELO fixture did not diverge from historical registration evidence'
);

-- Creation, canonical deduplication, acceptance, and zero direct registration.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'Division invitation acceptance target',
  'division-invitation-acceptance-target',
  'Academy'
);

create temporary table first_invitation as
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'test:division-invitations'
) as value;

create temporary table repeated_invitation as
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'test:division-invitations'
) as value;

select pg_temp.invitation_assert(
  (select (value ->> 'alreadyPending')::boolean from first_invitation) is false
    and (select (value ->> 'alreadyPending')::boolean from repeated_invitation),
  'repeat creation was not an idempotent pending result'
);
select pg_temp.invitation_assert(
  (
    select count(*) = 1
      and count(distinct event_key) = 1
    from public.notifications
    where type = 'tournament.division_invitation'
      and tournament_id = 'fa400000-0000-4000-8000-000000000001'
  ),
  'canonical invitation notification was missing or duplicated'
);
select pg_temp.invitation_assert(
  (
    select count(*) = 1
    from public.tournament_division_invitations
    where recipient_player_id = 'fa000000-0000-4000-8000-000000000001'
      and target_tournament_bracket_id =
        'fa500000-0000-4000-8000-000000000001'
      and status = 'pending'
  ),
  'active invitation uniqueness failed'
);

create temporary table accepted_invitation as
select public.respond_to_tournament_division_invitation(
  ((select value ->> 'invitationId' from first_invitation))::uuid,
  'division-invitation-player-1',
  'accept'
) as value;

select pg_temp.invitation_assert(
  (select value ->> 'status' from accepted_invitation) = 'accepted',
  'acceptance was not recorded'
);
select pg_temp.invitation_assert(
  not exists (
    select 1
    from public.registrations
    where tournament_id = 'fa400000-0000-4000-8000-000000000001'
  ),
  'invitation acceptance directly created a registration'
);

select public.void_tournament(
  'fa400000-0000-4000-8000-000000000001',
  'Rollback-only invitation target cleanup',
  'test:division-invitations'
);

-- Decline records a decision without registration.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000002',
  'fa500000-0000-4000-8000-000000000002',
  'Division invitation decline target',
  'division-invitation-decline-target',
  'Academy'
);
create temporary table declined_invitation as
select public.respond_to_tournament_division_invitation(
  (
    public.create_tournament_division_invitation(
      'fa300000-0000-4000-8000-000000000001',
      'fa500000-0000-4000-8000-000000000002',
      'test:division-invitations'
    ) ->> 'invitationId'
  )::uuid,
  'division-invitation-player-1',
  'decline'
) as value;
select pg_temp.invitation_assert(
  (select value ->> 'status' from declined_invitation) = 'declined',
  'decline was not recorded'
);
select public.void_tournament(
  'fa400000-0000-4000-8000-000000000002',
  'Rollback-only invitation target cleanup',
  'test:division-invitations'
);

-- Registration availability closure invalidates immediately.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000003',
  'fa500000-0000-4000-8000-000000000003',
  'Division invitation unavailable target',
  'division-invitation-unavailable-target',
  'Academy'
);
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000003',
  'test:division-invitations'
);
update public.tournaments
set registration_enabled = false
where id = 'fa400000-0000-4000-8000-000000000003';
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'target_registration_unavailable'
    from public.tournament_division_invitations
    where target_tournament_bracket_id =
      'fa500000-0000-4000-8000-000000000003'
  ),
  'registration closure did not invalidate the invitation'
);
select public.void_tournament(
  'fa400000-0000-4000-8000-000000000003',
  'Rollback-only invitation target cleanup',
  'test:division-invitations'
);

-- A target Not Held closure invalidates without creating competition facts.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000004',
  'fa500000-0000-4000-8000-000000000004',
  'Division invitation Not Held target',
  'division-invitation-not-held-target',
  'Academy'
);
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000004',
  'test:division-invitations'
);
select public.close_tournament_division_without_launch(
  'fa500000-0000-4000-8000-000000000004',
  'minimum_roster_not_reached',
  null,
  'test:division-invitations'
);
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'target_division_not_held'
    from public.tournament_division_invitations
    where target_tournament_bracket_id =
      'fa500000-0000-4000-8000-000000000004'
  ),
  'Not Held did not invalidate the target invitation'
);

-- A terminal target event invalidates immediately.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000005',
  'fa500000-0000-4000-8000-000000000005',
  'Division invitation terminal target',
  'division-invitation-terminal-target',
  'Academy'
);
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000005',
  'test:division-invitations'
);
select public.void_tournament(
  'fa400000-0000-4000-8000-000000000005',
  'Rollback-only invitation target cleanup',
  'test:division-invitations'
);
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'target_event_terminal'
    from public.tournament_division_invitations
    where target_tournament_bracket_id =
      'fa500000-0000-4000-8000-000000000005'
  ),
  'event terminalization did not invalidate the invitation'
);

-- Any registration in the target Event invalidates, even in another bracket.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000006',
  'fa500000-0000-4000-8000-000000000006',
  'Division invitation registration target',
  'division-invitation-registration-target',
  'Academy'
);
insert into public.tournament_brackets (
  id, tournament_id, name, elo_rules, max_players
)
values (
  'fa500000-0000-4000-8000-000000000016',
  'fa400000-0000-4000-8000-000000000006',
  'Challenge',
  '1100-1399',
  8
);
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000006',
  'test:division-invitations'
);
set local session_replication_role = replica;
insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, submitted_elo,
  tournament_title, bracket_name, registration_status, elo_status,
  admin_notes, tournament_id, tournament_bracket_id
)
values (
  'fa300000-0000-4000-8000-000000000006',
  'fa000000-0000-4000-8000-000000000001',
  'division-invitation-player-1',
  'InvitationOne',
  900,
  'Division invitation registration target',
  'Challenge',
  'pending',
  'pending',
  '',
  'fa400000-0000-4000-8000-000000000006',
  'fa500000-0000-4000-8000-000000000016'
);
set local session_replication_role = origin;
select public.reconcile_tournament_division_invitations(
  'fa400000-0000-4000-8000-000000000006',
  null,
  'fa000000-0000-4000-8000-000000000001'
);
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'already_registered'
    from public.tournament_division_invitations
    where target_tournament_bracket_id =
      'fa500000-0000-4000-8000-000000000006'
  ),
  'registration in a sibling target bracket did not invalidate'
);
select public.void_tournament(
  'fa400000-0000-4000-8000-000000000006',
  'Rollback-only invitation target cleanup',
  'test:division-invitations'
);

-- Account closure invalidates a retained player invitation.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000007',
  'fa500000-0000-4000-8000-000000000007',
  'Division invitation account-closure target',
  'division-invitation-account-closure-target',
  'Challenge'
);
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000002',
  'fa500000-0000-4000-8000-000000000007',
  'test:division-invitations'
);
set local ironclad.account_closure = 'on';
update public.players
set
  clerk_user_id = 'deleted:division-invitation-player-2',
  account_closed_at = clock_timestamp()
where id = 'fa000000-0000-4000-8000-000000000002';
set local ironclad.account_closure = '';
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'account_closed'
    from public.tournament_division_invitations
    where target_tournament_bracket_id =
      'fa500000-0000-4000-8000-000000000007'
  ),
  'account closure did not invalidate the invitation'
);

-- A launched target invalidates and cannot be accepted afterward.
select pg_temp.add_invitation_target(
  'fa400000-0000-4000-8000-000000000008',
  'fa500000-0000-4000-8000-000000000008',
  'Division invitation launch target',
  'division-invitation-launch-target',
  'Academy'
);
create temporary table launch_invitation as
select public.create_tournament_division_invitation(
  'fa300000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000008',
  'test:division-invitations'
) as value;
set local ironclad.explicit_division_launch = 'on';
update public.tournaments
set status = 'in_progress', registration_enabled = false
where id = 'fa400000-0000-4000-8000-000000000008';
update public.tournament_brackets
set launched_at = clock_timestamp()
where id = 'fa500000-0000-4000-8000-000000000008';
set local ironclad.explicit_division_launch = '';
select pg_temp.invitation_assert(
  (
    select status = 'invalidated'
      and invalidation_reason = 'target_division_launched'
    from public.tournament_division_invitations
    where id = ((select value ->> 'invitationId' from launch_invitation))::uuid
  ),
  'Division launch did not invalidate the invitation'
);
select pg_temp.invitation_assert(
  (
    select value ->> 'status' = 'invalidated'
    from (
      select public.respond_to_tournament_division_invitation(
        ((select value ->> 'invitationId' from launch_invitation))::uuid,
        'division-invitation-player-1',
        'accept'
      ) as value
    ) as response
  ),
  'a launched target invitation remained acceptable'
);

-- Rejected source registrations remain ineligible.
do $$
begin
  begin
    perform public.create_tournament_division_invitation(
      'fa300000-0000-4000-8000-000000000003',
      'fa500000-0000-4000-8000-000000000008',
      'test:division-invitations'
    );
    raise exception 'Expected rejected source registration to be ineligible';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

select pg_temp.invitation_assert(
  (
    select row(
      (select count(*) from public.player_badge_awards),
      (select count(*) from public.player_badge_reveals),
      (select count(*) from public.notifications where type = 'badge.unlocked'),
      (select count(*) from public.leaderboard_point_events),
      (
        select count(*)
        from public.leaderboard_tournament_season_memberships
      )
    ) = row(
      baseline.badge_awards,
      baseline.badge_reveals,
      baseline.badge_notifications,
      baseline.point_events,
      baseline.season_memberships
    )
    from invitation_baseline as baseline
  ),
  'invitations changed Badge, Reveal, point, or season totals'
);

select pg_temp.invitation_assert(
  has_function_privilege(
    'service_role',
    'public.create_tournament_division_invitation(uuid,uuid,text)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.respond_to_tournament_division_invitation(uuid,text,text)',
      'EXECUTE'
    ),
  'service_role cannot execute invitation authorities'
);
select pg_temp.invitation_assert(
  not has_function_privilege(
    'authenticated',
    'public.create_tournament_division_invitation(uuid,uuid,text)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.respond_to_tournament_division_invitation(uuid,text,text)',
      'EXECUTE'
    ),
  'public roles can execute invitation authorities'
);

select pg_temp.invitation_assert(
  (
    select count(*) = 3
    from public.registrations
    where tournament_id = 'fa100000-0000-4000-8000-000000000001'
  ),
  'preserved source registrations changed'
);

select jsonb_build_object(
  'status', 'not_held_next_event_invitations_passed',
  'explicit_target', true,
  'duplicate_active_prevented', true,
  'notification_deduplicated', true,
  'acceptance_does_not_register', true,
  'decline_does_not_register', true,
  'lifecycle_invalidation', true,
  'source_history_preserved', true,
  'badge_rewards_preserved', true,
  'rollback_only', true
);

rollback;
