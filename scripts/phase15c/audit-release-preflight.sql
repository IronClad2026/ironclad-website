select
  (select count(*)::integer from public.legal_documents)
    as legal_document_count,
  (select count(*)::integer from public.registration_acceptances)
    as registration_acceptance_count,
  (select count(*)::integer from public.registrations)
    as registration_count,
  (
    select count(*)::integer
    from public.tournaments
    where registration_enabled is true
      and status in ('registration_open', 'in_progress')
  ) as active_registration_tournaments,
  (
    select count(*)::integer
    from public.registrations
    where registration_status in (
      'pending',
      'manual_review',
      'approved',
      'waitlisted'
    )
  ) as active_registration_cohort,
  (
    select coalesce(
      jsonb_object_agg(counts.table_name, counts.row_count),
      '{}'::jsonb
    )
    from (
      select 'bracket_rounds' as table_name, count(*)::bigint as row_count
      from public.bracket_rounds
      union all
      select 'coh3_maps', count(*)::bigint from public.coh3_maps
      union all
      select 'generated_brackets', count(*)::bigint
      from public.generated_brackets
      union all
      select 'leaderboard_player_all_time_stats', count(*)::bigint
      from public.leaderboard_player_all_time_stats
      union all
      select 'leaderboard_player_season_stats', count(*)::bigint
      from public.leaderboard_player_season_stats
      union all
      select 'leaderboard_point_events', count(*)::bigint
      from public.leaderboard_point_events
      union all
      select 'leaderboard_recalculation_runs', count(*)::bigint
      from public.leaderboard_recalculation_runs
      union all
      select 'leaderboard_season_champions', count(*)::bigint
      from public.leaderboard_season_champions
      union all
      select 'leaderboard_seasons', count(*)::bigint
      from public.leaderboard_seasons
      union all
      select 'leaderboard_tournament_season_memberships', count(*)::bigint
      from public.leaderboard_tournament_season_memberships
      union all
      select 'match_dice_rolls', count(*)::bigint
      from public.match_dice_rolls
      union all
      select 'match_replay_upload_attempts', count(*)::bigint
      from public.match_replay_upload_attempts
      union all
      select 'match_result_report_groups', count(*)::bigint
      from public.match_result_report_groups
      union all
      select 'match_result_submissions', count(*)::bigint
      from public.match_result_submissions
      union all
      select 'notifications', count(*)::bigint from public.notifications
      union all
      select 'platform_settings', count(*)::bigint
      from public.platform_settings
      union all
      select 'player_notification_dismissals', count(*)::bigint
      from public.player_notification_dismissals
      union all
      select 'player_report_group_notification_dismissals', count(*)::bigint
      from public.player_report_group_notification_dismissals
      union all
      select 'players', count(*)::bigint from public.players
      union all
      select 'poll_ballot_choices', count(*)::bigint
      from public.poll_ballot_choices
      union all
      select 'poll_eligible_voters', count(*)::bigint
      from public.poll_eligible_voters
      union all
      select 'poll_options', count(*)::bigint from public.poll_options
      union all
      select 'polls', count(*)::bigint from public.polls
      union all
      select 'profiles', count(*)::bigint from public.profiles
      union all
      select 'registration_acceptances', count(*)::bigint
      from public.registration_acceptances
      union all
      select 'registrations', count(*)::bigint from public.registrations
      union all
      select 'tournament_bracket_map_pool_corrections', count(*)::bigint
      from public.tournament_bracket_map_pool_corrections
      union all
      select 'tournament_bracket_map_pool_entries', count(*)::bigint
      from public.tournament_bracket_map_pool_entries
      union all
      select 'tournament_brackets', count(*)::bigint
      from public.tournament_brackets
      union all
      select 'tournament_deletion_jobs', count(*)::bigint
      from public.tournament_deletion_jobs
      union all
      select 'tournament_matches', count(*)::bigint
      from public.tournament_matches
      union all
      select 'tournament_standings', count(*)::bigint
      from public.tournament_standings
      union all
      select 'tournaments', count(*)::bigint from public.tournaments
    ) as counts
  ) as protected_public_counts,
  jsonb_build_object(
    'total', (select count(*)::bigint from storage.objects),
    'by_bucket', (
      select coalesce(
        jsonb_object_agg(bucket_counts.bucket_id, bucket_counts.row_count),
        '{}'::jsonb
      )
      from (
        select object.bucket_id, count(*)::bigint as row_count
        from storage.objects as object
        group by object.bucket_id
      ) as bucket_counts
    )
  ) as storage_counts;
