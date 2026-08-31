-- Rollback-only behavioral proof for the forward Badge authority repairs.
-- Fixture construction uses replica mode only to avoid unrelated registration,
-- legal-acceptance, and lifecycle workflows. Origin mode is restored before
-- every authoritative transition and every production summary function call.

begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.badge_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Badge forward-repair behavior failed: %', p_message;
  end if;
end;
$$;

-- Deterministic fixture rows are fully referentially coherent. Replica mode
-- suppresses workflow triggers only while those rows are assembled.
select pg_catalog.set_config('session_replication_role', 'replica', true);

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  profile_completed
)
select
  ('ba000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'badge-forward-behavior-player-' || number,
  'Badge Forward Player ' || number,
  'BadgeForward' || number,
  true
from pg_catalog.generate_series(1, 11) as number;

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
    'ba100000-0000-4000-8000-000000000001',
    'Badge Reliable Behavior',
    'badge-forward-reliable-behavior',
    '1v1',
    'in_progress',
    'Rollback-only Badge Reliable Competitor behavior.',
    '',
    '',
    false,
    null
  ),
  (
    'ba100000-0000-4000-8000-000000000002',
    'Badge Left Bye Behavior',
    'badge-forward-left-bye-behavior',
    '1v1',
    'in_progress',
    'Rollback-only left-slot automatic bye behavior.',
    '',
    '',
    false,
    null
  ),
  (
    'ba100000-0000-4000-8000-000000000003',
    'Badge Right Bye Behavior',
    'badge-forward-right-bye-behavior',
    '1v1',
    'in_progress',
    'Rollback-only right-slot automatic bye behavior.',
    '',
    '',
    false,
    null
  ),
  (
    'ba100000-0000-4000-8000-000000000004',
    'Badge Cancel Behavior',
    'badge-forward-cancel-behavior',
    '1v1',
    'in_progress',
    'Rollback-only tournament cancellation behavior.',
    '',
    '',
    false,
    null
  ),
  (
    'ba100000-0000-4000-8000-000000000005',
    'Badge Reset Void Behavior',
    'badge-forward-reset-void-behavior',
    '1v1',
    'in_progress',
    'Rollback-only reset then tournament void behavior.',
    '',
    '',
    false,
    null
  ),
  (
    'ba100000-0000-4000-8000-000000000006',
    'Badge All Bye Champion Behavior',
    'badge-forward-all-bye-champion-behavior',
    '1v1',
    'completed',
    'Rollback-only all-bye champion behavior.',
    '',
    '',
    false,
    '2199-01-06 00:00:00+00'
  ),
  (
    'ba100000-0000-4000-8000-000000000007',
    'Badge Played Champion Behavior',
    'badge-forward-played-champion-behavior',
    '1v1',
    'completed',
    'Rollback-only played flawless champion behavior.',
    '',
    '',
    false,
    '2199-01-07 00:00:00+00'
  );

insert into public.tournament_brackets (
  id,
  tournament_id,
  name,
  elo_rules,
  max_players,
  launched_at
)
select
  ('ba200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('ba100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'Academy',
  '0-5000',
  8,
  '2199-01-01 00:00:00+00'::timestamptz
from pg_catalog.generate_series(1, 7) as number;

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
  tournament_bracket_id
)
values
  (
    'ba300000-0000-4000-8000-000000000001',
    'ba000000-0000-4000-8000-000000000001',
    'badge-forward-behavior-player-1',
    'Reliable Neutral',
    'Badge Reliable Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001'
  ),
  (
    'ba300000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000002',
    'badge-forward-behavior-player-2',
    'Reliable Player No Show',
    'Badge Reliable Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001'
  ),
  (
    'ba300000-0000-4000-8000-000000000003',
    'ba000000-0000-4000-8000-000000000003',
    'badge-forward-behavior-player-3',
    'Reliable Double No Show',
    'Badge Reliable Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001'
  ),
  (
    'ba300000-0000-4000-8000-000000000004',
    'ba000000-0000-4000-8000-000000000004',
    'badge-forward-behavior-player-4',
    'Reliable Corrected',
    'Badge Reliable Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001'
  ),
  (
    'ba300000-0000-4000-8000-000000000005',
    'ba000000-0000-4000-8000-000000000005',
    'badge-forward-behavior-player-5',
    'Reliable Positive',
    'Badge Reliable Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001'
  ),
  (
    'ba300000-0000-4000-8000-000000000006',
    'ba000000-0000-4000-8000-000000000006',
    'badge-forward-behavior-player-6',
    'Left Bye Player',
    'Badge Left Bye Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000002',
    'ba200000-0000-4000-8000-000000000002'
  ),
  (
    'ba300000-0000-4000-8000-000000000007',
    'ba000000-0000-4000-8000-000000000007',
    'badge-forward-behavior-player-7',
    'Right Bye Player',
    'Badge Right Bye Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000003',
    'ba200000-0000-4000-8000-000000000003'
  ),
  (
    'ba300000-0000-4000-8000-000000000008',
    'ba000000-0000-4000-8000-000000000008',
    'badge-forward-behavior-player-8',
    'Cancelled Tournament Player',
    'Badge Cancel Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000004',
    'ba200000-0000-4000-8000-000000000004'
  ),
  (
    'ba300000-0000-4000-8000-000000000009',
    'ba000000-0000-4000-8000-000000000009',
    'badge-forward-behavior-player-9',
    'Reset Void Player',
    'Badge Reset Void Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000005',
    'ba200000-0000-4000-8000-000000000005'
  ),
  (
    'ba300000-0000-4000-8000-000000000010',
    'ba000000-0000-4000-8000-000000000010',
    'badge-forward-behavior-player-10',
    'All Bye Champion',
    'Badge All Bye Champion Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000006',
    'ba200000-0000-4000-8000-000000000006'
  ),
  (
    'ba300000-0000-4000-8000-000000000011',
    'ba000000-0000-4000-8000-000000000011',
    'badge-forward-behavior-player-11',
    'Played Champion',
    'Badge Played Champion Behavior',
    'Academy',
    'approved',
    'verified',
    '',
    'ba100000-0000-4000-8000-000000000007',
    'ba200000-0000-4000-8000-000000000007'
  );

insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by,
  competition_locked_at
)
values
  (
    'ba400000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000002',
    'single_elimination',
    2,
    2,
    'badge-forward-behavior',
    '2199-01-01 00:00:00+00'
  ),
  (
    'ba400000-0000-4000-8000-000000000002',
    'ba200000-0000-4000-8000-000000000003',
    'single_elimination',
    2,
    2,
    'badge-forward-behavior',
    '2199-01-01 00:00:00+00'
  );

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
)
values
  (
    'ba500000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    1,
    'Left Bye Final'
  ),
  (
    'ba500000-0000-4000-8000-000000000002',
    'ba400000-0000-4000-8000-000000000002',
    1,
    'Right Bye Final'
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
  status
)
values
  (
    'ba600000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    'ba500000-0000-4000-8000-000000000001',
    1,
    'ba300000-0000-4000-8000-000000000006',
    null,
    1,
    2,
    'scheduled'
  ),
  (
    'ba600000-0000-4000-8000-000000000002',
    'ba400000-0000-4000-8000-000000000002',
    'ba500000-0000-4000-8000-000000000002',
    1,
    null,
    'ba300000-0000-4000-8000-000000000007',
    1,
    2,
    'scheduled'
  );

-- Finalize -> reset fixture: revision 2 is already invalidated. A subsequent
-- tournament void must inspect this true latest row and must not collide by
-- trying to append another revision 2.
insert into public.match_game_result_authority (
  id,
  match_id,
  tournament_id,
  game_number,
  winner_registration_id,
  loser_registration_id,
  revision,
  supersedes_id,
  authority_state,
  series_best_of,
  finalized_game_count,
  game_authority_complete,
  finalized_at,
  source_type,
  source_id,
  source_metadata
)
values
  (
    'ba800000-0000-4000-8000-000000000001',
    'ba600000-0000-4000-8000-000000000005',
    'ba100000-0000-4000-8000-000000000005',
    1,
    'ba300000-0000-4000-8000-000000000009',
    null,
    1,
    null,
    'active',
    3,
    2,
    true,
    '2199-01-05 10:00:00+00',
    'match_finalization',
    'ba600000-0000-4000-8000-000000000005',
    '{"fixture":"finalized"}'
  ),
  (
    'ba800000-0000-4000-8000-000000000002',
    'ba600000-0000-4000-8000-000000000005',
    'ba100000-0000-4000-8000-000000000005',
    1,
    null,
    null,
    2,
    'ba800000-0000-4000-8000-000000000001',
    'invalidated',
    3,
    2,
    false,
    '2199-01-05 10:01:00+00',
    'match_reset',
    'ba600000-0000-4000-8000-000000000005',
    '{"fixture":"reset"}'
  );

-- Active cancellation evidence exercises participant, game, path, and path
-- summary invalidation through the real tournament terminal triggers.
insert into public.match_participant_outcome_authority (
  id,
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type,
  source_id,
  source_metadata
)
values (
  'ba810000-0000-4000-8000-000000000001',
  'ba600000-0000-4000-8000-000000000004',
  'ba100000-0000-4000-8000-000000000004',
  'ba300000-0000-4000-8000-000000000008',
  'played',
  1,
  '2199-01-04 10:00:00+00',
  'historical_migration',
  null,
  '{"fixture":"cancel-active"}'
);

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
  'ba820000-0000-4000-8000-000000000001',
  'ba600000-0000-4000-8000-000000000004',
  'ba100000-0000-4000-8000-000000000004',
  1,
  'ba300000-0000-4000-8000-000000000008',
  1,
  'active',
  3,
  1,
  true,
  '2199-01-04 10:00:00+00',
  'historical_migration',
  '{"fixture":"cancel-active"}'
);

insert into public.tournament_championship_path_authority (
  id,
  tournament_id,
  registration_id,
  path_index,
  round_number,
  expected_path_segment_count,
  source_match_id,
  outcome_kind,
  authority_state,
  revision,
  finalized_at,
  source_type,
  source_metadata
)
values (
  'ba830000-0000-4000-8000-000000000001',
  'ba100000-0000-4000-8000-000000000004',
  'ba300000-0000-4000-8000-000000000008',
  1,
  1,
  1,
  'ba600000-0000-4000-8000-000000000004',
  'played',
  'active',
  1,
  '2199-01-04 10:00:00+00',
  'historical_migration',
  '{"fixture":"cancel-active"}'
);

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
  'ba840000-0000-4000-8000-000000000001',
  'ba100000-0000-4000-8000-000000000004',
  'ba300000-0000-4000-8000-000000000008',
  1,
  1,
  'complete',
  1,
  '2199-01-04 10:00:00+00',
  'historical_migration',
  '{"fixture":"cancel-complete"}'
);

-- Reliable Competitor: automatic bye and unknown remain neutral.
insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba610000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000001',
    'played',
    1,
    '2199-02-01 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba610000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000001',
    'automatic_bye',
    1,
    '2199-02-02 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba610000-0000-4000-8000-000000000003',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000001',
    'opponent_no_show',
    1,
    '2199-02-03 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba610000-0000-4000-8000-000000000004',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000001',
    'unknown',
    1,
    '2199-02-04 00:00:00+00',
    'historical_migration'
  );

-- Nine successful appearances followed by a no-show reset and one success.
insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
select
  pg_catalog.gen_random_uuid(),
  'ba100000-0000-4000-8000-000000000001',
  'ba300000-0000-4000-8000-000000000002',
  'played',
  1,
  '2199-03-01 00:00:00+00'::timestamptz + number * interval '1 day',
  'historical_migration'
from pg_catalog.generate_series(1, 9) as number;

insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba620000-0000-4000-8000-000000000010',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000002',
    'player_no_show',
    1,
    '2199-03-11 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba620000-0000-4000-8000-000000000011',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000002',
    'played',
    1,
    '2199-03-12 00:00:00+00',
    'historical_migration'
  );

-- The double-no-show case must reset identically.
insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
select
  pg_catalog.gen_random_uuid(),
  'ba100000-0000-4000-8000-000000000001',
  'ba300000-0000-4000-8000-000000000003',
  'played',
  1,
  '2199-04-01 00:00:00+00'::timestamptz + number * interval '1 day',
  'historical_migration'
from pg_catalog.generate_series(1, 9) as number;

insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba630000-0000-4000-8000-000000000010',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000003',
    'double_no_show',
    1,
    '2199-04-11 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba630000-0000-4000-8000-000000000011',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000003',
    'played',
    1,
    '2199-04-12 00:00:00+00',
    'historical_migration'
  );

-- Latest revision governs: a tenth played row corrected to player_no_show must
-- not qualify or remain in the reliable run.
insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
select
  pg_catalog.gen_random_uuid(),
  'ba100000-0000-4000-8000-000000000001',
  'ba300000-0000-4000-8000-000000000004',
  'played',
  1,
  '2199-05-01 00:00:00+00'::timestamptz + number * interval '1 day',
  'historical_migration'
from pg_catalog.generate_series(1, 9) as number;

insert into public.match_participant_outcome_authority (
  id,
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  supersedes_id,
  finalized_at,
  source_type
)
values
  (
    'ba850000-0000-4000-8000-000000000001',
    'ba640000-0000-4000-8000-000000000010',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000004',
    'played',
    1,
    null,
    '2199-05-11 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba850000-0000-4000-8000-000000000002',
    'ba640000-0000-4000-8000-000000000010',
    'ba100000-0000-4000-8000-000000000001',
    'ba300000-0000-4000-8000-000000000004',
    'player_no_show',
    2,
    'ba850000-0000-4000-8000-000000000001',
    '2199-05-11 00:01:00+00',
    'historical_migration'
  );

-- Nine played appearances plus an opponent no-show is the positive tenth.
insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
select
  pg_catalog.gen_random_uuid(),
  'ba100000-0000-4000-8000-000000000001',
  'ba300000-0000-4000-8000-000000000005',
  'played',
  1,
  '2199-06-01 00:00:00+00'::timestamptz + number * interval '1 day',
  'historical_migration'
from pg_catalog.generate_series(1, 9) as number;

insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
values (
  'ba650000-0000-4000-8000-000000000010',
  'ba100000-0000-4000-8000-000000000001',
  'ba300000-0000-4000-8000-000000000005',
  'opponent_no_show',
  1,
  '2199-06-11 00:00:00+00',
  'historical_migration'
);

insert into public.leaderboard_seasons (
  id,
  name,
  year,
  season_number,
  start_date,
  end_date,
  is_active,
  finalized_at
)
values (
  'ba700000-0000-4000-8000-000000000001',
  'Badge Forward Behavior Season',
  2199,
  1,
  '2199-01-01',
  '2199-12-31',
  false,
  '2200-01-01 00:00:00+00'
);

insert into public.leaderboard_point_events (
  season_id,
  tournament_id,
  tournament_bracket_id,
  registration_id,
  player_id,
  bracket_type,
  points,
  event_type,
  source
)
values
  (
    'ba700000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000006',
    'ba200000-0000-4000-8000-000000000006',
    'ba300000-0000-4000-8000-000000000010',
    'ba000000-0000-4000-8000-000000000010',
    'academy',
    20,
    'tournament_win',
    'system'
  ),
  (
    'ba700000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000007',
    'ba200000-0000-4000-8000-000000000007',
    'ba300000-0000-4000-8000-000000000011',
    'ba000000-0000-4000-8000-000000000011',
    'academy',
    20,
    'tournament_win',
    'system'
  );

insert into public.tournament_championship_path_summary_authority (
  tournament_id,
  registration_id,
  expected_path_segment_count,
  observed_path_segment_count,
  completeness_state,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba100000-0000-4000-8000-000000000006',
    'ba300000-0000-4000-8000-000000000010',
    1,
    1,
    'complete',
    1,
    '2199-01-06 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba100000-0000-4000-8000-000000000007',
    'ba300000-0000-4000-8000-000000000011',
    1,
    1,
    'complete',
    1,
    '2199-01-07 00:00:00+00',
    'historical_migration'
  );

insert into public.tournament_championship_path_authority (
  tournament_id,
  registration_id,
  path_index,
  round_number,
  expected_path_segment_count,
  source_match_id,
  outcome_kind,
  authority_state,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba100000-0000-4000-8000-000000000006',
    'ba300000-0000-4000-8000-000000000010',
    1,
    1,
    1,
    'ba660000-0000-4000-8000-000000000001',
    'automatic_bye',
    'active',
    1,
    '2199-01-06 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba100000-0000-4000-8000-000000000007',
    'ba300000-0000-4000-8000-000000000011',
    1,
    1,
    1,
    'ba660000-0000-4000-8000-000000000002',
    'played',
    'active',
    1,
    '2199-01-07 00:00:00+00',
    'historical_migration'
  );

insert into public.match_participant_outcome_authority (
  match_id,
  tournament_id,
  registration_id,
  outcome_kind,
  revision,
  finalized_at,
  source_type
)
values
  (
    'ba660000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000006',
    'ba300000-0000-4000-8000-000000000010',
    'automatic_bye',
    1,
    '2199-01-06 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba660000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000007',
    'ba300000-0000-4000-8000-000000000011',
    'played',
    1,
    '2199-01-07 00:00:00+00',
    'historical_migration'
  );

insert into public.match_game_result_authority (
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
  source_type
)
values
  (
    'ba660000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000007',
    1,
    'ba300000-0000-4000-8000-000000000011',
    1,
    'active',
    3,
    2,
    true,
    '2199-01-07 00:00:00+00',
    'historical_migration'
  ),
  (
    'ba660000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000007',
    2,
    'ba300000-0000-4000-8000-000000000011',
    1,
    'active',
    3,
    2,
    true,
    '2199-01-07 00:00:00+00',
    'historical_migration'
  );

select pg_catalog.set_config('session_replication_role', 'origin', true);

-- Verify the replica-built fixture did not rely on broken references.
select pg_temp.badge_assert(
  not exists (
    select 1
    from public.registrations as registration
    left join public.players as player on player.id = registration.profile_id
    left join public.tournaments as tournament
      on tournament.id = registration.tournament_id
    left join public.tournament_brackets as bracket
      on bracket.id = registration.tournament_bracket_id
    where registration.id::text like 'ba3%'
      and (
        player.id is null
        or tournament.id is null
        or bracket.id is null
        or bracket.tournament_id <> tournament.id
      )
  ),
  'fixture registration references must be coherent'
);

-- Keep actual match authority triggers enabled while isolating them from the
-- unrelated lifecycle completion and championship-path recorders.
alter table public.tournament_matches
  disable trigger tournament_matches_complete_tournament;
alter table public.tournament_matches
  disable trigger tournament_matches_record_championship_path_authority;

update public.tournament_matches
set
  status = 'completed',
  winner_registration_id = 'ba300000-0000-4000-8000-000000000006',
  outcome_type = 'automatic_bye'
where id = 'ba600000-0000-4000-8000-000000000001';

update public.tournament_matches
set
  status = 'completed',
  winner_registration_id = 'ba300000-0000-4000-8000-000000000007',
  outcome_type = 'automatic_bye'
where id = 'ba600000-0000-4000-8000-000000000002';

select pg_temp.badge_assert(
  (
    select count(*) = 1
      and bool_and(outcome_kind = 'automatic_bye')
      and bool_and(
        registration_id =
          'ba300000-0000-4000-8000-000000000006'::uuid
      )
      and min(revision) = 1
    from public.match_participant_outcome_authority
    where match_id = 'ba600000-0000-4000-8000-000000000001'
  ),
  'left-slot automatic bye must produce exactly one winner authority row'
);

select pg_temp.badge_assert(
  (
    select count(*) = 1
      and bool_and(outcome_kind = 'automatic_bye')
      and bool_and(
        registration_id =
          'ba300000-0000-4000-8000-000000000007'::uuid
      )
      and min(revision) = 1
    from public.match_participant_outcome_authority
    where match_id = 'ba600000-0000-4000-8000-000000000002'
  ),
  'right-slot automatic bye must produce exactly one winner authority row'
);

select pg_catalog.set_config(
  'ironclad.tournament_terminal_transition',
  'on',
  true
);

-- This UPDATE itself proves the repaired void trigger no longer collides with
-- the existing reset revision.
update public.tournaments
set
  status = 'voided',
  terminal_at = '2199-07-01 00:00:00+00',
  terminal_reason = 'Rollback-only reset then void proof',
  terminated_by_clerk_user_id = 'badge-forward-behavior-admin'
where id = 'ba100000-0000-4000-8000-000000000005';

select pg_temp.badge_assert(
  (
    select count(*) = 2 and max(revision) = 2
    from public.match_game_result_authority
    where match_id = 'ba600000-0000-4000-8000-000000000005'
      and game_number = 1
  ),
  'void after reset must keep the true latest invalidated revision without collision'
);

select pg_temp.badge_assert(
  (
    select status = 'voided'
      and terminal_at = '2199-07-01 00:00:00+00'::timestamptz
    from public.tournaments
    where id = 'ba100000-0000-4000-8000-000000000005'
  ),
  'reset tournament must reach the authoritative void terminal state'
);

update public.tournaments
set
  status = 'cancelled',
  terminal_at = '2199-07-02 00:00:00+00',
  terminal_reason = 'Rollback-only cancellation proof',
  terminated_by_clerk_user_id = 'badge-forward-behavior-admin'
where id = 'ba100000-0000-4000-8000-000000000004';

select pg_temp.badge_assert(
  (
    select outcome_kind = 'cancelled'
      and revision = 2
      and source_type = 'tournament_void'
    from public.match_participant_outcome_authority
    where match_id = 'ba600000-0000-4000-8000-000000000004'
    order by revision desc, id desc
    limit 1
  ),
  'cancellation must append participant authority revision 2'
);

select pg_temp.badge_assert(
  (
    select authority_state = 'invalidated'
      and revision = 2
      and source_type = 'tournament_void'
    from public.match_game_result_authority
    where match_id = 'ba600000-0000-4000-8000-000000000004'
      and game_number = 1
    order by revision desc, id desc
    limit 1
  ),
  'cancellation must invalidate active game authority at revision 2'
);

select pg_temp.badge_assert(
  (
    select outcome_kind = 'cancelled'
      and revision = 2
      and source_type = 'tournament_void'
    from public.tournament_championship_path_authority
    where tournament_id = 'ba100000-0000-4000-8000-000000000004'
      and registration_id = 'ba300000-0000-4000-8000-000000000008'
      and path_index = 1
    order by revision desc, id desc
    limit 1
  ),
  'cancellation must append the terminal championship path revision'
);

select pg_temp.badge_assert(
  (
    select completeness_state = 'invalidated'
      and revision >= 2
      and source_type = 'tournament_void'
    from public.tournament_championship_path_summary_authority
    where tournament_id = 'ba100000-0000-4000-8000-000000000004'
      and registration_id = 'ba300000-0000-4000-8000-000000000008'
    order by revision desc, id desc
    limit 1
  ),
  'cancellation must invalidate the championship path summary'
);

do $$
declare
  v_summary record;
begin
  select * into v_summary
  from public.get_player_badge_reliable_competitor_summary(
    'ba000000-0000-4000-8000-000000000001'
  );
  perform pg_temp.badge_assert(
    v_summary.best_run = 2 and v_summary.tenth_match_id is null,
    'automatic bye and unknown must remain neutral while opponent no-show advances'
  );

  select * into v_summary
  from public.get_player_badge_reliable_competitor_summary(
    'ba000000-0000-4000-8000-000000000002'
  );
  perform pg_temp.badge_assert(
    v_summary.best_run = 9 and v_summary.tenth_match_id is null,
    'player no-show must reset before the following played appearance'
  );

  select * into v_summary
  from public.get_player_badge_reliable_competitor_summary(
    'ba000000-0000-4000-8000-000000000003'
  );
  perform pg_temp.badge_assert(
    v_summary.best_run = 9 and v_summary.tenth_match_id is null,
    'double no-show must reset before the following played appearance'
  );

  select * into v_summary
  from public.get_player_badge_reliable_competitor_summary(
    'ba000000-0000-4000-8000-000000000004'
  );
  perform pg_temp.badge_assert(
    v_summary.best_run = 9 and v_summary.tenth_match_id is null,
    'the latest corrected participant revision must govern reliability'
  );

  select * into v_summary
  from public.get_player_badge_reliable_competitor_summary(
    'ba000000-0000-4000-8000-000000000005'
  );
  perform pg_temp.badge_assert(
    v_summary.best_run = 10
      and v_summary.tenth_match_id =
        'ba650000-0000-4000-8000-000000000010'::uuid
      and v_summary.tenth_at = '2199-06-11 00:00:00+00'::timestamptz,
    'ten reliable appearances including opponent no-show must qualify once'
  );
end;
$$;

select pg_temp.badge_assert(
  (
    select count(*) = 1
      and min(played_segment_count) = 0
      and min(automatic_bye_count) = 1
    from public.get_player_badge_flawless_campaign_summary_pre_played_requirement(
      'ba000000-0000-4000-8000-000000000010'
    )
  ),
  'legacy evidence fixture must otherwise qualify the all-bye champion'
);

select pg_temp.badge_assert(
  not exists (
    select 1
    from public.get_player_badge_flawless_campaign_summary(
      'ba000000-0000-4000-8000-000000000010'
    )
  ),
  'Flawless Campaign must reject a champion with zero played series'
);

select pg_temp.badge_assert(
  (
    select count(*) = 1
      and min(played_segment_count) = 1
      and min(verified_game_count) = 2
      and min(automatic_bye_count) = 0
    from public.get_player_badge_flawless_campaign_summary(
      'ba000000-0000-4000-8000-000000000011'
    )
  ),
  'Flawless Campaign must retain a champion with one genuinely played clean series'
);

rollback;

select pg_catalog.jsonb_build_object(
  'contract', 'badge-authority-forward-repairs-behavior',
  'reset_then_void', 'pass',
  'cancel_path', 'pass',
  'automatic_bye_left', 'pass',
  'automatic_bye_right', 'pass',
  'reliable_competitor', 'pass',
  'flawless_played_requirement', 'pass',
  'fixture_transaction', 'rolled_back',
  'database_rows_mutated', false
)::text;
