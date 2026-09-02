-- Rollback-only behavioral proof for the narrowly extended Void authority.
-- All fixture rows are synthetic. Replica mode is used only while assembling
-- or removing fixture evidence; every public.void_tournament invocation runs
-- with ordinary origin-trigger behavior.

begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.unlaunched_void_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Unlaunched Void behavior failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_unlaunched_void_refusal(
  p_tournament_id uuid,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_rejected boolean := false;
  v_message text;
begin
  perform pg_catalog.set_config(
    'session_replication_role',
    'origin',
    true
  );

  begin
    perform public.void_tournament(
      p_tournament_id,
      'Rollback-only evidence refusal: ' || p_label,
      'test:unlaunched-void-authority'
    );
  exception when sqlstate '55000' then
    get stacked diagnostics v_message = message_text;
    perform pg_temp.unlaunched_void_assert(
      v_message =
        'Unlaunched tournament Void requires zero competitive, scoring, season, or Badge evidence',
      p_label || ' returned the wrong refusal: ' || coalesce(v_message, '<null>')
    );
    v_rejected := true;
  end;

  perform pg_catalog.set_config(
    'session_replication_role',
    'replica',
    true
  );

  perform pg_temp.unlaunched_void_assert(
    v_rejected,
    p_label || ' was not rejected'
  );
  perform pg_temp.unlaunched_void_assert(
    exists (
      select 1
      from public.tournaments as tournament
      where tournament.id = p_tournament_id
        and tournament.status is distinct from 'voided'
        and tournament.terminal_at is null
        and tournament.terminal_reason is null
        and tournament.terminated_by_clerk_user_id is null
    ),
    p_label || ' changed tournament terminal state'
  );
end;
$$;

-- Deterministic, referentially coherent fixture assembly.
select pg_catalog.set_config('session_replication_role', 'replica', true);

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  profile_completed
)
select
  ('e1000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-player-' || number,
  'Unlaunched Void Player ' || number,
  'UnlaunchedVoid' || number,
  true
from pg_catalog.generate_series(1, 8) as number;

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
values
  (
    'e1100000-0000-4000-8000-000000000001',
    'Unlaunched Void Evidence Target',
    'unlaunched-void-evidence-target',
    '1v1',
    'registration_open',
    'Rollback-only evidence rejection target.',
    '',
    '',
    true,
    null
  ),
  (
    'e1100000-0000-4000-8000-000000000002',
    'Unlaunched Void Allowed Target',
    'unlaunched-void-allowed-target',
    '1v1',
    'registration_open',
    'Rollback-only allowed unlaunched Void target.',
    '',
    '',
    true,
    null
  ),
  (
    'e1100000-0000-4000-8000-000000000003',
    'Launched Void Regression Target',
    'launched-void-regression-target',
    '1v1',
    'in_progress',
    'Rollback-only launched Void regression target.',
    '',
    '',
    false,
    null
  ),
  (
    'e1100000-0000-4000-8000-000000000004',
    'Unlaunched Void Missing Division',
    'unlaunched-void-missing-division',
    '1v1',
    'registration_open',
    'Rollback-only missing-division target.',
    '',
    '',
    true,
    null
  ),
  (
    'e1100000-0000-4000-8000-000000000005',
    'Unlaunched Void Preservation Control',
    'unlaunched-void-preservation-control',
    '1v1',
    'upcoming',
    'Unrelated rows must remain byte-for-byte stable.',
    '',
    '',
    false,
    null
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
    'e1200000-0000-4000-8000-000000000001',
    'e1100000-0000-4000-8000-000000000001',
    'Academy',
    '0-1099',
    8,
    null
  ),
  (
    'e1200000-0000-4000-8000-000000000002',
    'e1100000-0000-4000-8000-000000000002',
    'Academy',
    '0-1099',
    8,
    null
  ),
  (
    'e1200000-0000-4000-8000-000000000003',
    'e1100000-0000-4000-8000-000000000003',
    'Academy',
    '0-1099',
    8,
    '2298-01-03 00:00:00+00'
  );

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
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
    'e1300000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'unlaunched-void-player-1',
    'Evidence Player One',
    'Unlaunched Void Evidence Target',
    'Academy',
    'pending',
    'pending',
    '',
    'e1100000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001',
    '2298-01-01 00:00:01+00',
    null,
    null,
    null,
    null
  ),
  (
    'e1300000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'unlaunched-void-player-2',
    'Evidence Player Two',
    'Unlaunched Void Evidence Target',
    'Academy',
    'pending',
    'pending',
    '',
    'e1100000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001',
    '2298-01-01 00:00:02+00',
    null,
    null,
    null,
    null
  ),
  (
    'e1300000-0000-4000-8000-000000000003',
    'e1000000-0000-4000-8000-000000000003',
    'unlaunched-void-player-3',
    'Allowed Pending Player',
    'Unlaunched Void Allowed Target',
    'Academy',
    'pending',
    'pending',
    '',
    'e1100000-0000-4000-8000-000000000002',
    'e1200000-0000-4000-8000-000000000002',
    '2298-01-02 00:00:01+00',
    null,
    null,
    null,
    null
  ),
  (
    'e1300000-0000-4000-8000-000000000004',
    'e1000000-0000-4000-8000-000000000004',
    'unlaunched-void-player-4',
    'Allowed Offered Player',
    'Unlaunched Void Allowed Target',
    'Academy',
    'waitlisted',
    'pending',
    '',
    'e1100000-0000-4000-8000-000000000002',
    'e1200000-0000-4000-8000-000000000002',
    '2298-01-02 00:00:02+00',
    'offered',
    '2298-01-02 01:00:00+00',
    '2298-01-03 01:00:00+00',
    null
  ),
  (
    'e1300000-0000-4000-8000-000000000005',
    'e1000000-0000-4000-8000-000000000005',
    'unlaunched-void-player-5',
    'Launched History Player',
    'Launched Void Regression Target',
    'Academy',
    'approved',
    'pending',
    '',
    'e1100000-0000-4000-8000-000000000003',
    'e1200000-0000-4000-8000-000000000003',
    '2298-01-03 00:00:01+00',
    null,
    null,
    null,
    null
  ),
  -- This synthetic legacy-shape row proves point linkage through a target
  -- bracket even when registration.tournament_id itself is null.
  (
    'e1300000-0000-4000-8000-000000000006',
    'e1000000-0000-4000-8000-000000000006',
    'unlaunched-void-player-6',
    'Bracket Linked Evidence Player',
    'Unlaunched Void Evidence Target',
    'Academy',
    'pending',
    'pending',
    '',
    null,
    'e1200000-0000-4000-8000-000000000001',
    '2298-01-01 00:00:03+00',
    null,
    null,
    null,
    null
  );

insert into public.leaderboard_seasons (
  id,
  name,
  year,
  season_number,
  start_date,
  end_date,
  is_active
)
values (
  'e1400000-0000-4000-8000-000000000001',
  'Unlaunched Void Rollback Season',
  2298,
  1,
  '2298-01-01',
  '2298-12-31',
  false
);

insert into public.leaderboard_tournament_season_memberships (
  tournament_id,
  season_id,
  qualifying_event_number
)
values (
  'e1100000-0000-4000-8000-000000000005',
  'e1400000-0000-4000-8000-000000000001',
  null
);

insert into public.leaderboard_point_events (
  id,
  season_id,
  tournament_id,
  player_id,
  bracket_type,
  points,
  event_type,
  description,
  source
)
values (
  'e1530000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000005',
  'e1000000-0000-4000-8000-000000000008',
  'academy',
  7,
  'participation',
  'Unrelated preservation control.',
  'admin'
);

insert into public.leaderboard_player_season_stats (
  id,
  season_id,
  player_id,
  bracket_type,
  total_points,
  tournaments_played
)
values (
  'e1540000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000008',
  'academy',
  7,
  1
);

insert into public.leaderboard_recalculation_runs (
  id,
  season_id,
  scope,
  status,
  finished_at,
  notes
)
values (
  'e1550000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'season',
  'completed',
  clock_timestamp(),
  'Unrelated preservation control.'
);

insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_metadata,
  unlocked_at
)
values (
  'e1500000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000008',
  'unlaunched-void-preservation-control',
  'backfill',
  '{"evaluationMode":"backfill","fixture":"unlaunched-void"}',
  '2298-01-01 00:00:00+00'
);

insert into public.player_badge_reveals (
  id,
  player_badge_award_id,
  player_id,
  revealed_at
)
values (
  'e1510000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000008',
  '2298-01-02 00:00:00+00'
);

-- Basic unlaunched-state gates.
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000004',
  'missing tournament division'
);

update public.tournaments
set status = null
where id = 'e1100000-0000-4000-8000-000000000001';
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'malformed null tournament status'
);
update public.tournaments
set status = 'registration_open'
where id = 'e1100000-0000-4000-8000-000000000001';

update public.tournaments
set status = 'in_progress'
where id = 'e1100000-0000-4000-8000-000000000001';
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'unlaunched in-progress state'
);
update public.tournaments
set status = 'registration_open'
where id = 'e1100000-0000-4000-8000-000000000001';

update public.tournaments
set first_completed_at = '2298-01-04 00:00:00+00'
where id = 'e1100000-0000-4000-8000-000000000001';
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'first-completion timestamp'
);
update public.tournaments
set first_completed_at = null
where id = 'e1100000-0000-4000-8000-000000000001';

-- A generated structure is independently sufficient evidence.
insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by
)
values (
  'e1600000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001',
  'single_elimination',
  2,
  2,
  'test:unlaunched-void-authority'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'generated bracket'
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
)
values (
  'e1610000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000001',
  1,
  'Synthetic Final'
);

insert into public.tournament_matches (
  id,
  generated_bracket_id,
  round_id,
  match_number,
  player_one_registration_id,
  player_two_registration_id,
  player_one_slot,
  player_two_slot,
  series_best_of,
  status
)
values (
  'e1620000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000001',
  'e1610000-0000-4000-8000-000000000001',
  1,
  'e1300000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000002',
  1,
  2,
  3,
  'scheduled'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'tournament match'
);

-- Report, submission, replay, dice, and match-scoped Badge rows require the
-- generated-bracket/match parent by foreign key. Each layered case therefore
-- proves the strongest executable invariant (Void remains refused and every
-- row remains present); the migration static contract separately pins each
-- exact child predicate.
insert into public.match_result_report_groups (
  id,
  match_id,
  tournament_id,
  submitted_by_clerk_user_id,
  submitted_by_registration_id,
  opponent_registration_id,
  winner_registration_id,
  player_one_score,
  player_two_score,
  status,
  confirmation_deadline_at
)
values (
  'e1630000-0000-4000-8000-000000000001',
  'e1620000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'unlaunched-void-player-1',
  'e1300000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000002',
  'e1300000-0000-4000-8000-000000000001',
  2,
  0,
  'pending_confirmation',
  '2298-01-05 00:00:00+00'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'match report group'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_result_report_groups
    where id = 'e1630000-0000-4000-8000-000000000001'
  ),
  'report-group rejection removed evidence'
);
delete from public.match_result_report_groups
where id = 'e1630000-0000-4000-8000-000000000001';

insert into public.match_result_submissions (
  id,
  match_id,
  submitted_by_clerk_user_id,
  submitted_by_registration_id,
  submission_number,
  claimed_winner_registration_id,
  player_one_score,
  player_two_score,
  replay_storage_path,
  status,
  game_number
)
values (
  'e1640000-0000-4000-8000-000000000001',
  'e1620000-0000-4000-8000-000000000001',
  'unlaunched-void-player-1',
  'e1300000-0000-4000-8000-000000000001',
  1,
  'e1300000-0000-4000-8000-000000000001',
  1,
  0,
  'rollback-only/unlaunched-void/game-1.rec',
  'pending',
  1
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'match result submission'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_result_submissions
    where id = 'e1640000-0000-4000-8000-000000000001'
  ),
  'submission rejection removed evidence'
);
delete from public.match_result_submissions
where id = 'e1640000-0000-4000-8000-000000000001';

insert into public.match_replay_upload_attempts (
  id,
  match_id,
  submitting_registration_id,
  winner_registration_id,
  player_one_score,
  player_two_score,
  required_replay_count,
  replay_storage_paths,
  declared_replay_sizes,
  game_winner_registration_ids,
  status,
  capability_issued_at,
  capability_not_before_reuse_at
)
values (
  'e1650000-0000-4000-8000-000000000001',
  'e1620000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  1,
  0,
  1,
  array[
    'e1620000-0000-4000-8000-000000000001/e1650000-0000-4000-8000-000000000001/game-1-e1660000-0000-4000-8000-000000000001.rec',
    'e1620000-0000-4000-8000-000000000001/e1650000-0000-4000-8000-000000000001/game-2-e1660000-0000-4000-8000-000000000002.rec',
    'e1620000-0000-4000-8000-000000000001/e1650000-0000-4000-8000-000000000001/game-3-e1660000-0000-4000-8000-000000000003.rec',
    'e1620000-0000-4000-8000-000000000001/e1650000-0000-4000-8000-000000000001/game-4-e1660000-0000-4000-8000-000000000004.rec',
    'e1620000-0000-4000-8000-000000000001/e1650000-0000-4000-8000-000000000001/game-5-e1660000-0000-4000-8000-000000000005.rec'
  ],
  array[1],
  array['e1300000-0000-4000-8000-000000000001'::uuid],
  'prepared',
  '2298-01-04 00:00:00+00',
  '2298-01-04 00:01:00+00'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'replay upload attempt'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_replay_upload_attempts
    where id = 'e1650000-0000-4000-8000-000000000001'
  ),
  'replay-attempt rejection removed evidence'
);
delete from public.match_replay_upload_attempts
where id = 'e1650000-0000-4000-8000-000000000001';

insert into public.match_dice_rolls (
  match_id,
  activation_version,
  game_number,
  tie_round,
  participant_registration_id,
  die_1,
  die_2
)
values (
  'e1620000-0000-4000-8000-000000000001',
  1,
  1,
  1,
  'e1300000-0000-4000-8000-000000000001',
  6,
  5
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'match dice roll'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_dice_rolls
    where match_id = 'e1620000-0000-4000-8000-000000000001'
  ),
  'dice-roll rejection removed evidence'
);
delete from public.match_dice_rolls
where match_id = 'e1620000-0000-4000-8000-000000000001';

insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_id,
  source_metadata
)
values (
  'e1670000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'unlaunched-void-match-source',
  'match',
  'e1620000-0000-4000-8000-000000000001',
  '{"evaluationMode":"live"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'match-scoped Badge source'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.player_badge_awards
    where id = 'e1670000-0000-4000-8000-000000000001'
  ),
  'match-scoped Badge rejection removed the award'
);
delete from public.player_badge_awards
where id = 'e1670000-0000-4000-8000-000000000001';

do $$
declare
  v_key text;
begin
  foreach v_key in array array['matchId', 'match_id'] loop
    insert into public.player_badge_awards (
      id,
      player_id,
      badge_slug,
      source_type,
      source_metadata
    )
    values (
      'e1670000-0000-4000-8000-000000000002',
      'e1000000-0000-4000-8000-000000000001',
      'unlaunched-void-match-metadata',
      'admin_correction',
      pg_catalog.jsonb_build_object(
        'evaluationMode',
        'live',
        v_key,
        'e1620000-0000-4000-8000-000000000001'
      )
    );

    perform pg_temp.expect_unlaunched_void_refusal(
      'e1100000-0000-4000-8000-000000000001',
      'Badge match metadata key ' || v_key
    );

    perform pg_temp.unlaunched_void_assert(
      exists (
        select 1 from public.player_badge_awards
        where id = 'e1670000-0000-4000-8000-000000000002'
      ),
      'Badge match metadata rejection removed the award for ' || v_key
    );

    delete from public.player_badge_awards
    where id = 'e1670000-0000-4000-8000-000000000002';
  end loop;
end;
$$;

insert into ironclad_private.badge_reconciliation_targets (
  target_id,
  player_id,
  reason,
  source_type,
  source_id
)
values (
  'e1680000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'match_authority',
  'match',
  'e1620000-0000-4000-8000-000000000001'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'match-scoped Badge reconciliation target'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from ironclad_private.badge_reconciliation_targets
    where target_id = 'e1680000-0000-4000-8000-000000000001'
  ),
  'match-scoped reconciliation rejection removed the target'
);
delete from ironclad_private.badge_reconciliation_targets
where target_id = 'e1680000-0000-4000-8000-000000000001';

delete from public.tournament_matches
where id = 'e1620000-0000-4000-8000-000000000001';
delete from public.bracket_rounds
where id = 'e1610000-0000-4000-8000-000000000001';
delete from public.generated_brackets
where id = 'e1600000-0000-4000-8000-000000000001';

-- Durable authority rows do not require a live generated match and must each
-- independently block the unlaunched transition.
insert into public.match_participant_outcome_authority (
  id,
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type,
  source_metadata
)
values (
  'e1700000-0000-4000-8000-000000000001',
  'e1710000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  'played',
  1,
  '2298-01-04 00:00:00+00',
  'historical_migration',
  '{"fixture":"unlaunched-void"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'participant outcome authority'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_participant_outcome_authority
    where id = 'e1700000-0000-4000-8000-000000000001'
  ),
  'participant-authority rejection removed evidence'
);
delete from public.match_participant_outcome_authority
where id = 'e1700000-0000-4000-8000-000000000001';

insert into public.match_game_result_authority (
  id,
  match_id,
  tournament_id,
  game_number,
  winner_registration_id,
  revision,
  authority_state,
  series_best_of,
  finalized_game_count,
  game_authority_complete,
  finalized_at,
  source_type,
  source_metadata
)
values (
  'e1720000-0000-4000-8000-000000000001',
  'e1730000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  1,
  'e1300000-0000-4000-8000-000000000001',
  1,
  'active',
  3,
  1,
  true,
  '2298-01-04 00:00:00+00',
  'historical_migration',
  '{"fixture":"unlaunched-void"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'game result authority'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.match_game_result_authority
    where id = 'e1720000-0000-4000-8000-000000000001'
  ),
  'game-authority rejection removed evidence'
);
delete from public.match_game_result_authority
where id = 'e1720000-0000-4000-8000-000000000001';

insert into public.tournament_championship_path_authority (
  id,
  tournament_id,
  registration_id,
  path_index,
  round_number,
  expected_path_segment_count,
  outcome_kind,
  authority_state,
  revision,
  finalized_at,
  source_type,
  source_metadata
)
values (
  'e1740000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  1,
  1,
  1,
  'played',
  'active',
  1,
  '2298-01-04 00:00:00+00',
  'historical_migration',
  '{"fixture":"unlaunched-void"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'championship path authority'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.tournament_championship_path_authority
    where id = 'e1740000-0000-4000-8000-000000000001'
  ),
  'championship-path rejection removed evidence'
);
delete from public.tournament_championship_path_authority
where id = 'e1740000-0000-4000-8000-000000000001';

insert into public.tournament_championship_path_summary_authority (
  id,
  tournament_id,
  registration_id,
  expected_path_segment_count,
  observed_path_segment_count,
  completeness_state,
  revision,
  finalized_at,
  source_type,
  source_metadata
)
values (
  'e1750000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  1,
  1,
  'complete',
  1,
  '2298-01-04 00:00:00+00',
  'historical_migration',
  '{"fixture":"unlaunched-void"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'championship path summary authority'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.tournament_championship_path_summary_authority
    where id = 'e1750000-0000-4000-8000-000000000001'
  ),
  'championship-summary rejection removed evidence'
);
delete from public.tournament_championship_path_summary_authority
where id = 'e1750000-0000-4000-8000-000000000001';

-- Season membership and every supported point-link shape are independent
-- blockers. The third point row resolves through a registration whose direct
-- tournament_id is null, pinning the bracket-linked legacy shape.
insert into public.leaderboard_tournament_season_memberships (
  tournament_id,
  season_id,
  qualifying_event_number
)
values (
  'e1100000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  null
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'tournament season membership'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_tournament_season_memberships
    where tournament_id = 'e1100000-0000-4000-8000-000000000001'
  ),
  'membership rejection removed evidence'
);
delete from public.leaderboard_tournament_season_memberships
where tournament_id = 'e1100000-0000-4000-8000-000000000001';

insert into public.leaderboard_point_events (
  id,
  season_id,
  tournament_id,
  player_id,
  bracket_type,
  points,
  event_type,
  source
)
values (
  'e1760000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'academy',
  1,
  'participation',
  'admin'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'direct tournament point event'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_point_events
    where id = 'e1760000-0000-4000-8000-000000000001'
  ),
  'direct-point rejection removed evidence'
);
delete from public.leaderboard_point_events
where id = 'e1760000-0000-4000-8000-000000000001';

insert into public.leaderboard_point_events (
  id,
  season_id,
  tournament_bracket_id,
  player_id,
  bracket_type,
  points,
  event_type,
  source
)
values (
  'e1760000-0000-4000-8000-000000000002',
  'e1400000-0000-4000-8000-000000000001',
  'e1200000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'academy',
  1,
  'participation',
  'admin'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'division-linked point event'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_point_events
    where id = 'e1760000-0000-4000-8000-000000000002'
  ),
  'division-point rejection removed evidence'
);
delete from public.leaderboard_point_events
where id = 'e1760000-0000-4000-8000-000000000002';

insert into public.leaderboard_point_events (
  id,
  season_id,
  registration_id,
  player_id,
  bracket_type,
  points,
  event_type,
  source
)
values (
  'e1760000-0000-4000-8000-000000000003',
  'e1400000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000006',
  'academy',
  1,
  'participation',
  'admin'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'registration-linked point event through target division'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_point_events
    where id = 'e1760000-0000-4000-8000-000000000003'
  ),
  'registration-point rejection removed evidence'
);
delete from public.leaderboard_point_events
where id = 'e1760000-0000-4000-8000-000000000003';

insert into public.leaderboard_recalculation_runs (
  id,
  tournament_id,
  scope,
  status,
  notes
)
values (
  'e1770000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001',
  'tournament',
  'pending',
  'Rollback-only evidence blocker.'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'leaderboard recalculation run'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_recalculation_runs
    where id = 'e1770000-0000-4000-8000-000000000001'
  ),
  'recalculation-run rejection removed evidence'
);
delete from public.leaderboard_recalculation_runs
where id = 'e1770000-0000-4000-8000-000000000001';

insert into public.leaderboard_player_season_stats (
  id,
  season_id,
  player_id,
  bracket_type,
  last_tournament_id
)
values (
  'e1780000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'academy',
  'e1100000-0000-4000-8000-000000000001'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'player season-stat tournament pointer'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_player_season_stats
    where id = 'e1780000-0000-4000-8000-000000000001'
  ),
  'season-stat rejection removed evidence'
);
delete from public.leaderboard_player_season_stats
where id = 'e1780000-0000-4000-8000-000000000001';

update public.leaderboard_seasons
set
  finalized_at = '2298-01-04 00:00:00+00',
  under_review_at = '2298-01-04 00:01:00+00',
  under_review_reason = 'Rollback-only evidence blocker.',
  under_review_by_clerk_user_id = 'test:unlaunched-void-authority',
  under_review_tournament_id = 'e1100000-0000-4000-8000-000000000001'
where id = 'e1400000-0000-4000-8000-000000000001';
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'season under-review tournament pointer'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.leaderboard_seasons
    where id = 'e1400000-0000-4000-8000-000000000001'
      and under_review_tournament_id =
        'e1100000-0000-4000-8000-000000000001'
  ),
  'under-review rejection removed season evidence'
);
update public.leaderboard_seasons
set
  finalized_at = null,
  under_review_at = null,
  under_review_reason = null,
  under_review_by_clerk_user_id = null,
  under_review_tournament_id = null
where id = 'e1400000-0000-4000-8000-000000000001';

-- Badge evidence: direct source, six canonical tournament metadata keys, a
-- nested legacy metadata reference, and a queued tournament reconciliation.
insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_id,
  source_metadata
)
values (
  'e1790000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'unlaunched-void-tournament-source',
  'tournament',
  'e1100000-0000-4000-8000-000000000001',
  '{"evaluationMode":"live"}'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'direct tournament Badge source'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.player_badge_awards
    where id = 'e1790000-0000-4000-8000-000000000001'
  ),
  'direct Badge rejection removed the award'
);
delete from public.player_badge_awards
where id = 'e1790000-0000-4000-8000-000000000001';

do $$
declare
  v_key text;
begin
  foreach v_key in array array[
    'tournamentId',
    'tournament_id',
    'originalTournamentId',
    'original_tournament_id',
    'thresholdTournamentId',
    'threshold_tournament_id'
  ] loop
    insert into public.player_badge_awards (
      id,
      player_id,
      badge_slug,
      source_type,
      source_metadata
    )
    values (
      'e1790000-0000-4000-8000-000000000002',
      'e1000000-0000-4000-8000-000000000001',
      'unlaunched-void-tournament-metadata',
      'admin_correction',
      pg_catalog.jsonb_build_object(
        'evaluationMode',
        'live',
        v_key,
        'e1100000-0000-4000-8000-000000000001'
      )
    );

    perform pg_temp.expect_unlaunched_void_refusal(
      'e1100000-0000-4000-8000-000000000001',
      'Badge tournament metadata key ' || v_key
    );

    perform pg_temp.unlaunched_void_assert(
      exists (
        select 1 from public.player_badge_awards
        where id = 'e1790000-0000-4000-8000-000000000002'
      ),
      'Badge metadata rejection removed the award for ' || v_key
    );

    delete from public.player_badge_awards
    where id = 'e1790000-0000-4000-8000-000000000002';
  end loop;
end;
$$;

insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_metadata
)
values (
  'e1790000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000001',
  'unlaunched-void-nested-metadata',
  'admin_correction',
  pg_catalog.jsonb_build_object(
    'evaluationMode',
    'live',
    'legacy',
    pg_catalog.jsonb_build_object(
      'tournament',
      'e1100000-0000-4000-8000-000000000001'
    )
  )
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'nested legacy Badge tournament metadata'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.player_badge_awards
    where id = 'e1790000-0000-4000-8000-000000000003'
  ),
  'nested Badge rejection removed the award'
);
delete from public.player_badge_awards
where id = 'e1790000-0000-4000-8000-000000000003';

insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_metadata
)
values (
  'e1790000-0000-4000-8000-000000000004',
  'e1000000-0000-4000-8000-000000000001',
  'unlaunched-void-uppercase-metadata',
  'admin_correction',
  pg_catalog.jsonb_build_object(
    'evaluationMode',
    'live',
    'legacyTournamentReference',
    'E1100000-0000-4000-8000-000000000001'
  )
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'uppercase legacy Badge tournament metadata'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from public.player_badge_awards
    where id = 'e1790000-0000-4000-8000-000000000004'
  ),
  'uppercase Badge metadata rejection removed the award'
);
delete from public.player_badge_awards
where id = 'e1790000-0000-4000-8000-000000000004';

insert into ironclad_private.badge_reconciliation_targets (
  target_id,
  player_id,
  reason,
  source_type,
  source_id
)
values (
  'e17a0000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'tournament_completion',
  'tournament',
  'e1100000-0000-4000-8000-000000000001'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'tournament Badge reconciliation target'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from ironclad_private.badge_reconciliation_targets
    where target_id = 'e17a0000-0000-4000-8000-000000000001'
  ),
  'tournament reconciliation rejection removed the target'
);
delete from ironclad_private.badge_reconciliation_targets
where target_id = 'e17a0000-0000-4000-8000-000000000001';

insert into ironclad_private.badge_reconciliation_targets (
  target_id,
  player_id,
  reason,
  source_type,
  source_id
)
values (
  'e17a0000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000001',
  'tournament_completion',
  'tournament',
  'E1100000-0000-4000-8000-000000000001'
);
select pg_temp.expect_unlaunched_void_refusal(
  'e1100000-0000-4000-8000-000000000001',
  'uppercase tournament Badge reconciliation source'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1 from ironclad_private.badge_reconciliation_targets
    where target_id = 'e17a0000-0000-4000-8000-000000000002'
  ),
  'uppercase reconciliation rejection removed the target'
);
delete from ironclad_private.badge_reconciliation_targets
where target_id = 'e17a0000-0000-4000-8000-000000000002';

-- Snapshot every protected persistence surface plus the exact synthetic
-- control rows before either successful Void. Counts catch inserted/deleted
-- rows; JSON snapshots catch silent metadata or ownership rewrites.
create temporary table unlaunched_void_protected_before
on commit drop
as
select
  (select count(*) from public.player_badge_awards) as badge_award_count,
  (select count(*) from public.player_badge_reveals) as badge_reveal_count,
  (select count(*) from public.notifications) as notification_count,
  (select count(*) from public.leaderboard_point_events) as point_event_count,
  (
    select count(*)
    from public.leaderboard_tournament_season_memberships
  ) as membership_count,
  (select count(*) from public.leaderboard_seasons) as season_count,
  (
    select count(*)
    from public.leaderboard_player_season_stats
  ) as season_stat_count,
  (
    select count(*)
    from public.leaderboard_recalculation_runs
  ) as recalculation_count,
  (
    select to_jsonb(award)
    from public.player_badge_awards as award
    where award.id = 'e1500000-0000-4000-8000-000000000001'
  ) as badge_award_row,
  (
    select to_jsonb(reveal)
    from public.player_badge_reveals as reveal
    where reveal.id = 'e1510000-0000-4000-8000-000000000001'
  ) as badge_reveal_row,
  (
    select to_jsonb(event)
    from public.leaderboard_point_events as event
    where event.id = 'e1530000-0000-4000-8000-000000000001'
  ) as point_event_row,
  (
    select to_jsonb(membership)
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id =
      'e1100000-0000-4000-8000-000000000005'
  ) as membership_row,
  (
    select to_jsonb(season)
    from public.leaderboard_seasons as season
    where season.id = 'e1400000-0000-4000-8000-000000000001'
  ) as season_row,
  (
    select to_jsonb(stats)
    from public.leaderboard_player_season_stats as stats
    where stats.id = 'e1540000-0000-4000-8000-000000000001'
  ) as season_stat_row,
  (
    select to_jsonb(run)
    from public.leaderboard_recalculation_runs as run
    where run.id = 'e1550000-0000-4000-8000-000000000001'
  ) as recalculation_row;

create function pg_temp.assert_unlaunched_void_protected_state(
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_before record;
begin
  select * into strict v_before
  from pg_temp.unlaunched_void_protected_before;

  perform pg_temp.unlaunched_void_assert(
    v_before.badge_award_count =
      (select count(*) from public.player_badge_awards),
    p_label || ' changed Badge award count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.badge_reveal_count =
      (select count(*) from public.player_badge_reveals),
    p_label || ' changed Reveal acknowledgement count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.notification_count =
      (select count(*) from public.notifications),
    p_label || ' changed notification count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.point_event_count =
      (select count(*) from public.leaderboard_point_events),
    p_label || ' changed point-event count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.membership_count = (
      select count(*)
      from public.leaderboard_tournament_season_memberships
    ),
    p_label || ' changed season-membership count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.season_count =
      (select count(*) from public.leaderboard_seasons),
    p_label || ' changed season count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.season_stat_count = (
      select count(*)
      from public.leaderboard_player_season_stats
    ),
    p_label || ' changed season-stat count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.recalculation_count = (
      select count(*)
      from public.leaderboard_recalculation_runs
    ),
    p_label || ' changed recalculation-run count'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.badge_award_row = (
      select to_jsonb(award)
      from public.player_badge_awards as award
      where award.id = 'e1500000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control Badge award'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.badge_reveal_row = (
      select to_jsonb(reveal)
      from public.player_badge_reveals as reveal
      where reveal.id = 'e1510000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control Reveal acknowledgement'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.point_event_row = (
      select to_jsonb(event)
      from public.leaderboard_point_events as event
      where event.id = 'e1530000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control point event'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.membership_row = (
      select to_jsonb(membership)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.tournament_id =
        'e1100000-0000-4000-8000-000000000005'
    ),
    p_label || ' rewrote the control season membership'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.season_row = (
      select to_jsonb(season)
      from public.leaderboard_seasons as season
      where season.id = 'e1400000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control season'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.season_stat_row = (
      select to_jsonb(stats)
      from public.leaderboard_player_season_stats as stats
      where stats.id = 'e1540000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control season stats'
  );
  perform pg_temp.unlaunched_void_assert(
    v_before.recalculation_row = (
      select to_jsonb(run)
      from public.leaderboard_recalculation_runs as run
      where run.id = 'e1550000-0000-4000-8000-000000000001'
    ),
    p_label || ' rewrote the control recalculation run'
  );
end;
$$;

create temporary table allowed_registration_before
on commit drop
as
select registration.id, to_jsonb(registration) as row_data
from public.registrations as registration
where registration.tournament_id =
  'e1100000-0000-4000-8000-000000000002';

-- The newly allowed path: registrations remain historical rows. Only an
-- actively offered waitlist row receives its terminal offer resolution.
select pg_catalog.set_config('session_replication_role', 'origin', true);
select pg_temp.unlaunched_void_assert(
  public.void_tournament(
    'e1100000-0000-4000-8000-000000000002',
    'Rollback-only obsolete test event',
    'test:unlaunched-void-authority'
  ) ->> 'outcome' = 'voided',
  'eligible unlaunched tournament did not Void'
);

select pg_temp.unlaunched_void_assert(
  exists (
    select 1
    from public.tournaments as tournament
    where tournament.id = 'e1100000-0000-4000-8000-000000000002'
      and tournament.status = 'voided'
      and tournament.registration_enabled is false
      and tournament.terminal_at is not null
      and tournament.terminal_reason = 'Rollback-only obsolete test event'
      and tournament.terminated_by_clerk_user_id =
        'test:unlaunched-void-authority'
      and tournament.first_completed_at is null
  ),
  'eligible unlaunched tournament terminal audit is incomplete'
);
select pg_temp.unlaunched_void_assert(
  (
    select count(*)
    from public.registrations as registration
    where registration.tournament_id =
      'e1100000-0000-4000-8000-000000000002'
  ) = 2,
  'eligible unlaunched Void deleted a registration'
);
select pg_temp.unlaunched_void_assert(
  (
    select to_jsonb(registration)
    from public.registrations as registration
    where registration.id = 'e1300000-0000-4000-8000-000000000003'
  ) = (
    select snapshot.row_data
    from pg_temp.allowed_registration_before as snapshot
    where snapshot.id = 'e1300000-0000-4000-8000-000000000003'
  ),
  'pending registration changed during eligible unlaunched Void'
);
select pg_temp.unlaunched_void_assert(
  (
    select
      to_jsonb(registration)
        - 'updated_at'
        - 'waitlist_offer_status'
        - 'waitlist_offer_resolved_at'
    from public.registrations as registration
    where registration.id = 'e1300000-0000-4000-8000-000000000004'
  ) = (
    select
      snapshot.row_data
        - 'updated_at'
        - 'waitlist_offer_status'
        - 'waitlist_offer_resolved_at'
    from pg_temp.allowed_registration_before as snapshot
    where snapshot.id = 'e1300000-0000-4000-8000-000000000004'
  ),
  'offered registration changed outside the two allowed resolution fields'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1
    from public.registrations as registration
    where registration.id = 'e1300000-0000-4000-8000-000000000004'
      and registration.registration_status = 'waitlisted'
      and registration.waitlist_offer_status = 'cancelled'
      and registration.waitlist_offer_created_at =
        '2298-01-02 01:00:00+00'
      and registration.waitlist_offer_expires_at =
        '2298-01-03 01:00:00+00'
      and registration.waitlist_offer_resolved_at is not null
      and registration.tournament_id =
        'e1100000-0000-4000-8000-000000000002'
      and registration.tournament_bracket_id =
        'e1200000-0000-4000-8000-000000000002'
  ),
  'offered waitlist registration was not safely resolved in place'
);
select pg_temp.assert_unlaunched_void_protected_state(
  'eligible unlaunched Void'
);

create temporary table allowed_offer_after_first_void
on commit drop
as
select
  registration.waitlist_offer_status,
  registration.waitlist_offer_resolved_at,
  registration.updated_at
from public.registrations as registration
where registration.id = 'e1300000-0000-4000-8000-000000000004';

select pg_temp.unlaunched_void_assert(
  public.void_tournament(
    'e1100000-0000-4000-8000-000000000002',
    'Rollback-only repeated Void',
    'test:unlaunched-void-authority'
  ) ->> 'outcome' = 'already_voided',
  'repeated eligible unlaunched Void was not idempotent'
);
select pg_temp.unlaunched_void_assert(
  (
    select pg_catalog.jsonb_build_object(
      'waitlist_offer_status',
      registration.waitlist_offer_status,
      'waitlist_offer_resolved_at',
      registration.waitlist_offer_resolved_at,
      'updated_at',
      registration.updated_at
    )
    from public.registrations as registration
    where registration.id = 'e1300000-0000-4000-8000-000000000004'
  ) = (
    select to_jsonb(snapshot)
    from pg_temp.allowed_offer_after_first_void as snapshot
  ),
  'repeated eligible unlaunched Void rewrote offer resolution'
);
select pg_temp.assert_unlaunched_void_protected_state(
  'repeated eligible unlaunched Void'
);

-- Existing launched behavior remains available and does not reinterpret
-- registration, Badge, Reveal, notification, point, or season history.
create temporary table launched_registration_before
on commit drop
as
select to_jsonb(registration) as row_data
from public.registrations as registration
where registration.id = 'e1300000-0000-4000-8000-000000000005';

select pg_temp.unlaunched_void_assert(
  public.void_tournament(
    'e1100000-0000-4000-8000-000000000003',
    'Rollback-only launched regression',
    'test:unlaunched-void-authority'
  ) ->> 'outcome' = 'voided',
  'launched tournament no longer follows the existing Void path'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1
    from public.tournaments as tournament
    where tournament.id = 'e1100000-0000-4000-8000-000000000003'
      and tournament.status = 'voided'
      and tournament.terminal_at is not null
      and tournament.terminal_reason = 'Rollback-only launched regression'
      and tournament.terminated_by_clerk_user_id =
        'test:unlaunched-void-authority'
  ),
  'launched Void did not preserve terminal audit semantics'
);
select pg_temp.unlaunched_void_assert(
  exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.id = 'e1200000-0000-4000-8000-000000000003'
      and bracket.launched_at = '2298-01-03 00:00:00+00'
  ),
  'launched Void rewrote division launch evidence'
);
select pg_temp.unlaunched_void_assert(
  (
    select to_jsonb(registration)
    from public.registrations as registration
    where registration.id = 'e1300000-0000-4000-8000-000000000005'
  ) = (
    select snapshot.row_data
    from pg_temp.launched_registration_before as snapshot
  ),
  'launched Void rewrote registration history'
);
select pg_temp.assert_unlaunched_void_protected_state('launched Void');

select pg_temp.unlaunched_void_assert(
  public.void_tournament(
    'e1100000-0000-4000-8000-000000000003',
    'Rollback-only repeated launched Void',
    'test:unlaunched-void-authority'
  ) ->> 'outcome' = 'already_voided',
  'repeated launched Void was not idempotent'
);
select pg_temp.assert_unlaunched_void_protected_state(
  'repeated launched Void'
);

-- No fixture, terminal transition, award, notification, Reveal, point, or
-- season mutation survives this proof.
rollback;
