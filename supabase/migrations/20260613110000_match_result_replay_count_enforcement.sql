begin;

create or replace function public.submit_match_series_result_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_paths text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_reporter_registration_id uuid;
  v_submission_id uuid;
  v_submission_ids uuid[] := array[]::uuid[];
  v_submission_number integer;
  v_first_submission_number integer;
  v_report_group_id uuid;
  v_confirmation_deadline_at timestamptz;
  v_wins_required integer;
  v_winner_score integer;
  v_loser_score integer;
  v_required_replay_count integer;
  v_replay_paths text[];
  v_replay_count integer;
  v_distinct_replay_count integer;
  v_index integer;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
  end if;

  select coalesce(array_agg(path order by ordinal), array[]::text[])
  into v_replay_paths
  from (
    select btrim(replay.path) as path, replay.ordinal
    from unnest(coalesce(p_replay_storage_paths, array[]::text[]))
      with ordinality as replay(path, ordinal)
    where replay.path is not null
      and btrim(replay.path) <> ''
  ) as normalized;

  select count(*), count(distinct replay.path)
  into v_replay_count, v_distinct_replay_count
  from unnest(v_replay_paths) as replay(path);

  if v_replay_count = 0 then
    raise exception 'Replay proof is required';
  end if;

  if v_replay_count <> v_distinct_replay_count then
    raise exception 'Replay proof paths must be unique';
  end if;

  if exists (
    select 1
    from unnest(v_replay_paths) as replay(path)
    where lower(replay.path) not like '%.rec'
  ) then
    raise exception 'Every replay proof must use a .rec file';
  end if;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score < 0
    or p_player_two_score < 0
    or p_player_one_score = p_player_two_score then
    raise exception 'Enter a valid non-tied final score';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null then
    raise exception 'This match already has an official result';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  select registration.id
  into v_reporter_registration_id
  from public.registrations as registration
  where registration.id in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  )
    and registration.clerk_user_id = p_submitted_by_clerk_user_id;

  if v_reporter_registration_id is null then
    raise exception 'Player is not a participant in this match';
  end if;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  v_wins_required := (v_match.series_best_of / 2) + 1;
  v_winner_score := case
    when p_winner_registration_id = v_match.player_one_registration_id
      then p_player_one_score
    else p_player_two_score
  end;
  v_loser_score := case
    when p_winner_registration_id = v_match.player_one_registration_id
      then p_player_two_score
    else p_player_one_score
  end;

  if v_winner_score <> v_wins_required
    or v_loser_score >= v_wins_required then
    raise exception
      'This BO% series requires the winner to finish on % wins',
      v_match.series_best_of,
      v_wins_required;
  end if;

  v_required_replay_count := p_player_one_score + p_player_two_score;

  if v_replay_count <> v_required_replay_count then
    raise exception
      'This score requires exactly % replay file%',
      v_required_replay_count,
      case when v_required_replay_count = 1 then '' else 's' end;
  end if;

  if exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
      and submission.report_group_id is null
  ) then
    raise exception
      'This match has legacy pending reports awaiting administrator review';
  end if;

  if exists (
    select 1
    from public.match_result_report_groups as report_group
    where report_group.match_id = p_match_id
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
      and report_group.finalized_at is null
  ) then
    raise exception 'This match already has an active result report group';
  end if;

  for v_index in 1..v_required_replay_count loop
    select coalesce(max(submission.submission_number), 0) + 1
    into v_submission_number
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id;

    insert into public.match_result_submissions (
      submission_number,
      game_number,
      match_id,
      submitted_by_clerk_user_id,
      submitted_by_registration_id,
      claimed_winner_registration_id,
      player_one_score,
      player_two_score,
      replay_storage_path,
      screenshot_storage_path,
      notes,
      status
    )
    values (
      v_submission_number,
      v_index,
      p_match_id,
      p_submitted_by_clerk_user_id,
      v_reporter_registration_id,
      p_winner_registration_id,
      p_player_one_score,
      p_player_two_score,
      v_replay_paths[v_index],
      null,
      case when v_index = 1 then nullif(btrim(p_notes), '') else null end,
      'pending'
    )
    returning id into v_submission_id;

    if v_first_submission_number is null then
      v_first_submission_number := v_submission_number;
    end if;

    v_submission_ids := array_append(v_submission_ids, v_submission_id);
  end loop;

  v_report_group_id := public.create_match_result_report_group(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    v_submission_ids,
    v_replay_paths[1]
  );

  select report_group.confirmation_deadline_at
  into v_confirmation_deadline_at
  from public.match_result_report_groups as report_group
  where report_group.id = v_report_group_id;

  return jsonb_build_object(
    'report_group_id', v_report_group_id,
    'submission_ids', to_jsonb(v_submission_ids),
    'submission_number', v_first_submission_number,
    'replay_count', v_replay_count,
    'required_replay_count', v_required_replay_count,
    'confirmation_deadline_at', v_confirmation_deadline_at
  );
end;
$$;

create or replace function public.submit_match_series_result_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_path text,
  p_notes text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.submit_match_series_result_report(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    array[p_replay_storage_path],
    p_notes
  );
$$;

revoke all on function public.submit_match_series_result_report(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text[],
  text
) from public;
grant execute on function public.submit_match_series_result_report(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text[],
  text
) to service_role;

revoke all on function public.submit_match_series_result_report(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text
) from public;
grant execute on function public.submit_match_series_result_report(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text
) to service_role;

commit;
