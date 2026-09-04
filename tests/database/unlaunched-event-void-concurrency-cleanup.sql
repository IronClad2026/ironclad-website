-- Idempotent cleanup for the local-only unlaunched Void race harness.

\set ON_ERROR_STOP on

set client_min_messages = warning;
set role postgres;

do $$
begin
  if current_database() !~ '^ironclad_void_[a-zA-Z0-9_]+$'
    or coalesce(pg_catalog.host(pg_catalog.inet_server_addr()), 'local-socket')
      not in ('127.0.0.1', '::1', 'local-socket') then
    raise exception
      'Unlaunched Void concurrency cleanup is restricted to a local disposable database';
  end if;
end;
$$;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_catalog.set_config('session_replication_role', 'replica', true);

delete from public.notifications as notification
where notification.tournament_id in (
    'e2100000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000003'
  )
  or notification.registration_id in (
    select registration.id
    from public.registrations as registration
    where registration.clerk_user_id like
      'unlaunched-void-concurrency-player-%'
  )
  or notification.recipient_clerk_user_id like
    'unlaunched-void-concurrency-player-%';

delete from ironclad_private.badge_reconciliation_targets as target
where target.player_id in (
    select player.id
    from public.players as player
    where player.clerk_user_id like
      'unlaunched-void-concurrency-player-%'
  )
  or (
    target.source_type = 'tournament'
    and target.source_id in (
      'e2100000-0000-4000-8000-000000000001',
      'e2100000-0000-4000-8000-000000000002',
      'e2100000-0000-4000-8000-000000000003'
    )
  );

delete from public.player_badge_reveals as reveal
where reveal.player_id in (
  select player.id
  from public.players as player
  where player.clerk_user_id like
    'unlaunched-void-concurrency-player-%'
);

delete from public.player_badge_awards as award
where award.player_id in (
    select player.id
    from public.players as player
    where player.clerk_user_id like
      'unlaunched-void-concurrency-player-%'
  )
  or award.source_id in (
    'e2100000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000003'
  );

delete from public.leaderboard_point_events as event
where event.tournament_id in (
    'e2100000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000003'
  )
  or event.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
  or event.registration_id in (
    select registration.id
    from public.registrations as registration
    where registration.clerk_user_id like
      'unlaunched-void-concurrency-player-%'
  );

delete from public.leaderboard_player_season_stats as stats
where stats.player_id in (
    select player.id
    from public.players as player
    where player.clerk_user_id like
      'unlaunched-void-concurrency-player-%'
  )
  or stats.last_tournament_id in (
    'e2100000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000003'
  );

delete from public.leaderboard_player_all_time_stats as stats
where stats.player_id in (
  select player.id
  from public.players as player
  where player.clerk_user_id like
    'unlaunched-void-concurrency-player-%'
);

delete from public.leaderboard_recalculation_runs as run
where run.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.leaderboard_tournament_season_memberships as membership
where membership.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.tournament_championship_path_summary_authority as summary
where summary.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.tournament_championship_path_authority as authority
where authority.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.match_game_result_authority as authority
where authority.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.match_participant_outcome_authority as authority
where authority.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.match_dice_rolls as dice_roll
where dice_roll.match_id in (
  select match.id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.match_replay_upload_attempts as replay_attempt
where replay_attempt.match_id in (
  select match.id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.match_result_submissions as submission
where submission.match_id in (
  select match.id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.match_result_report_groups as report_group
where report_group.tournament_id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003'
);

delete from public.tournament_standings as standings
where standings.generated_bracket_id in (
  select generated.id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.tournament_matches as match
where match.generated_bracket_id in (
  select generated.id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.bracket_rounds as round
where round.generated_bracket_id in (
  select generated.id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id in (
    'e2200000-0000-4000-8000-000000000001',
    'e2200000-0000-4000-8000-000000000002',
    'e2200000-0000-4000-8000-000000000003'
  )
);

delete from public.generated_brackets as generated
where generated.tournament_bracket_id in (
  'e2200000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000002',
  'e2200000-0000-4000-8000-000000000003'
);

delete from public.tournament_bracket_map_pool_entries as entry
where entry.tournament_bracket_id in (
  'e2200000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000002',
  'e2200000-0000-4000-8000-000000000003',
  'e2200000-0000-4000-8000-000000000004',
  'e2200000-0000-4000-8000-000000000005',
  'e2200000-0000-4000-8000-000000000006'
);

delete from public.registration_acceptances as acceptance
where acceptance.clerk_user_id like
  'unlaunched-void-concurrency-player-%';

delete from public.registrations as registration
where registration.clerk_user_id like
  'unlaunched-void-concurrency-player-%';

delete from public.tournament_brackets as bracket
where bracket.id in (
  'e2200000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000002',
  'e2200000-0000-4000-8000-000000000003'
)
  or bracket.tournament_id in (
    select tournament.id
    from public.tournaments as tournament
    where tournament.slug like 'unlaunched-void-concurrency-%'
  );

delete from public.tournaments as tournament
where tournament.id in (
    'e2100000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000003'
  )
  or tournament.slug like 'unlaunched-void-concurrency-%';

delete from public.players as player
where player.clerk_user_id like
  'unlaunched-void-concurrency-player-%';

delete from public.legal_documents as document
where document.version like 'NON-PRODUCTION-VOID-CONCURRENCY-%';

select pg_catalog.set_config('session_replication_role', 'origin', true);

drop function if exists
  public.unlaunched_void_test_void_with_pause(uuid, bigint, integer);
drop function if exists
  public.unlaunched_void_test_launch_with_pause(uuid, bigint, integer);
drop function if exists
  public.unlaunched_void_test_generate_with_pause(uuid, bigint, integer);
drop function if exists
  public.unlaunched_void_test_review_with_pause(uuid, bigint, integer);
drop function if exists
  public.unlaunched_void_test_advisory_lock_is_held(bigint);

commit;

do $$
begin
  if exists (
    select 1
    from public.tournaments as tournament
    where tournament.id in (
      'e2100000-0000-4000-8000-000000000001',
      'e2100000-0000-4000-8000-000000000002',
      'e2100000-0000-4000-8000-000000000003'
    )
      or tournament.slug like 'unlaunched-void-concurrency-%'
  )
    or exists (
      select 1
      from public.players as player
      where player.clerk_user_id like
        'unlaunched-void-concurrency-player-%'
    )
    or exists (
      select 1
      from public.legal_documents as document
      where document.version like 'NON-PRODUCTION-VOID-CONCURRENCY-%'
    )
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_advisory_lock_is_held(bigint)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_review_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_generate_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_launch_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_void_with_pause(uuid,bigint,integer)'
    ) is not null then
    raise exception 'Unlaunched Void concurrency cleanup is incomplete';
  end if;
end;
$$;
