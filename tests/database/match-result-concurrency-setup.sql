set client_min_messages = warning;
set role postgres;

do $$
begin
  if exists (
    select 1 from public.tournaments
    where id = 'd0000000-0000-4000-8000-000000000001'
      or slug = 'p1-match-result-concurrency'
  ) or exists (
    select 1 from public.tournament_matches
    where id in (
      'd5000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000002'
    )
  ) or pg_catalog.to_regprocedure(
    'public.p1_test_hold_match_lock(uuid,bigint,integer)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_confirm_match_result(uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_admin_review_match_result(uuid,text,text,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_submit_no_show(uuid,text,uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_admin_official_result(uuid,integer,integer,uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_advisory_lock_is_held(bigint)'
  ) is not null
  then
    raise exception 'P1 match-result concurrency canary already exists';
  end if;
end;
$$;

begin;

alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;

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
  'd0000000-0000-4000-8000-000000000001',
  'P1 Match Result Concurrency',
  'p1-match-result-concurrency',
  '1v1',
  'in_progress',
  'Disposable Staging-only P1 concurrency fixture.',
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
) values (
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'Academy',
  '0-5000',
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
    'd2000000-0000-4000-8000-000000000001',
    'p1-concurrency-player-one',
    'P1 Concurrency Player One',
    'P1 Match Result Concurrency',
    'Academy',
    'approved',
    'verified',
    '',
    'd0000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'US Forces',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-concurrency'
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'p1-concurrency-player-two',
    'P1 Concurrency Player Two',
    'P1 Match Result Concurrency',
    'Academy',
    'approved',
    'verified',
    '',
    'd0000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'Wehrmacht',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-concurrency'
  );

insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by,
  competition_locked_at
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'single_elimination',
  8,
  8,
  'p1-concurrency-admin',
  pg_catalog.clock_timestamp()
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
) values (
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  1,
  'P1 Concurrency Final'
);

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
    'd5000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    1,
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002',
    'in_progress',
    3,
    1,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '7 days'
  ),
  (
    'd5000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    2,
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002',
    'in_progress',
    3,
    1,
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() + interval '7 days'
  );

alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;

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
  replay_storage_path,
  replay_proof_mode,
  status,
  confirmation_deadline_at,
  result_type
) values (
  'd6000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'p1-concurrency-player-one',
  'd2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001',
  2,
  0,
  'p1-concurrency/race-a.rec',
  'single_series_replay',
  'pending_confirmation',
  pg_catalog.clock_timestamp() + interval '24 hours',
  'normal'
);

insert into public.match_result_submissions (
  id,
  submission_number,
  game_number,
  match_id,
  submitted_by_clerk_user_id,
  submitted_by_registration_id,
  claimed_winner_registration_id,
  player_one_score,
  player_two_score,
  replay_storage_path,
  status,
  report_group_id
) values (
  'd7000000-0000-4000-8000-000000000001',
  1,
  1,
  'd5000000-0000-4000-8000-000000000001',
  'p1-concurrency-player-one',
  'd2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  2,
  0,
  'p1-concurrency/race-a.rec',
  'pending',
  'd6000000-0000-4000-8000-000000000001'
);

update public.tournament_matches
set status = 'pending_review'
where id = 'd5000000-0000-4000-8000-000000000001';

-- Test-only service-role RPCs provide deterministic cross-request sentinels.
-- They are created and removed with this disposable Staging fixture.
create function public.p1_test_hold_match_lock(
  p_match_id uuid,
  p_lock_key bigint,
  p_seconds integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_seconds < 1 or p_seconds > 50 then
    raise exception 'Invalid P1 test lock duration';
  end if;

  perform 1
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'P1 test Match not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(p_seconds);
end;
$$;

create function public.p1_test_confirm_match_result(
  p_report_group_id uuid,
  p_confirmed_by text,
  p_lock_key bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform public.confirm_match_result_report_group_api(
    p_report_group_id,
    p_confirmed_by
  );
end;
$$;

create function public.p1_test_admin_review_match_result(
  p_report_group_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text,
  p_lock_key bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform public.admin_finalize_match_result_report_group_api(
    p_report_group_id,
    p_decision,
    p_reviewed_by,
    p_review_notes
  );
end;
$$;

create function public.p1_test_submit_no_show(
  p_match_id uuid,
  p_submitted_by text,
  p_no_show_registration_id uuid,
  p_notes text,
  p_lock_key bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  return public.submit_match_no_show_report(
    p_match_id,
    p_submitted_by,
    p_no_show_registration_id,
    p_notes
  );
end;
$$;

create function public.p1_test_admin_official_result(
  p_match_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_winner_registration_id uuid,
  p_decided_by text,
  p_lock_key bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform public.apply_admin_official_match_result_api(
    p_match_id,
    p_player_one_score,
    p_player_two_score,
    p_winner_registration_id,
    p_decided_by
  );
end;
$$;

create function public.p1_test_advisory_lock_is_held(
  p_lock_key bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.pg_try_advisory_xact_lock(p_lock_key) then
    return false;
  end if;
  return true;
end;
$$;

alter function public.p1_test_hold_match_lock(uuid, bigint, integer)
  owner to postgres;
alter function public.p1_test_confirm_match_result(uuid, text, bigint)
  owner to postgres;
alter function public.p1_test_admin_review_match_result(
  uuid, text, text, text, bigint
) owner to postgres;
alter function public.p1_test_submit_no_show(
  uuid, text, uuid, text, bigint
) owner to postgres;
alter function public.p1_test_admin_official_result(
  uuid, integer, integer, uuid, text, bigint
) owner to postgres;
alter function public.p1_test_advisory_lock_is_held(bigint)
  owner to postgres;

revoke all on function public.p1_test_hold_match_lock(
  uuid, bigint, integer
) from public, anon, authenticated;
revoke all on function public.p1_test_confirm_match_result(
  uuid, text, bigint
) from public, anon, authenticated;
revoke all on function public.p1_test_admin_review_match_result(
  uuid, text, text, text, bigint
) from public, anon, authenticated;
revoke all on function public.p1_test_submit_no_show(
  uuid, text, uuid, text, bigint
) from public, anon, authenticated;
revoke all on function public.p1_test_admin_official_result(
  uuid, integer, integer, uuid, text, bigint
) from public, anon, authenticated;
revoke all on function public.p1_test_advisory_lock_is_held(bigint)
  from public, anon, authenticated;

grant execute on function public.p1_test_hold_match_lock(
  uuid, bigint, integer
) to service_role;
grant execute on function public.p1_test_confirm_match_result(
  uuid, text, bigint
) to service_role;
grant execute on function public.p1_test_admin_review_match_result(
  uuid, text, text, text, bigint
) to service_role;
grant execute on function public.p1_test_submit_no_show(
  uuid, text, uuid, text, bigint
) to service_role;
grant execute on function public.p1_test_admin_official_result(
  uuid, integer, integer, uuid, text, bigint
) to service_role;
grant execute on function public.p1_test_advisory_lock_is_held(bigint)
  to service_role;

commit;

select 'p1_match_result_concurrency_ready';
