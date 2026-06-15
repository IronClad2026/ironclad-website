begin;

create or replace function public.create_match_result_report_group(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_submission_ids uuid[] default null,
  p_replay_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_reporter_registration_id uuid;
  v_opponent_registration_id uuid;
  v_confirmation_window_minutes integer;
  v_group_id uuid;
  v_existing_group_id uuid;
  v_distinct_submission_count integer;
  v_valid_submission_count integer;
  v_linked_replay_storage_path text;
  v_group_replay_storage_path text;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
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

  select bracket.tournament_id, tournament.result_confirmation_window_minutes
  into v_tournament_id, v_confirmation_window_minutes
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where generated.id = v_match.generated_bracket_id;

  if v_tournament_id is null then
    raise exception 'Tournament could not be resolved for this match';
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

  v_opponent_registration_id := case
    when v_reporter_registration_id = v_match.player_one_registration_id
      then v_match.player_two_registration_id
    else v_match.player_one_registration_id
  end;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  select report_group.id
  into v_existing_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = p_match_id
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_existing_group_id is not null then
    raise exception 'This match already has an active result report group';
  end if;

  if p_submission_ids is not null
    and cardinality(p_submission_ids) > 0 then
    select count(distinct submission_id.id)
    into v_distinct_submission_count
    from unnest(p_submission_ids) as submission_id(id);

    select count(*)
    into v_valid_submission_count
    from public.match_result_submissions as submission
    where submission.id = any(p_submission_ids)
      and submission.match_id = p_match_id
      and submission.submitted_by_registration_id =
        v_reporter_registration_id
      and submission.status = 'pending'
      and submission.report_group_id is null;

    if v_valid_submission_count <> v_distinct_submission_count then
      raise exception
        'One or more game submissions cannot be linked to this report group';
    end if;

    select submission.replay_storage_path
    into v_linked_replay_storage_path
    from public.match_result_submissions as submission
    where submission.id = any(p_submission_ids)
      and submission.replay_storage_path is not null
    order by submission.game_number, submission.created_at, submission.id
    limit 1;
  end if;

  v_group_replay_storage_path := coalesce(
    nullif(btrim(p_replay_storage_path), ''),
    v_linked_replay_storage_path
  );

  if v_group_replay_storage_path is null then
    raise exception 'Replay proof is required for result confirmation';
  end if;

  insert into public.match_result_report_groups (
    match_id,
    tournament_id,
    submitted_by_clerk_user_id,
    submitted_by_registration_id,
    opponent_registration_id,
    winner_registration_id,
    player_one_score,
    player_two_score,
    replay_storage_path,
    status,
    confirmation_deadline_at
  )
  values (
    p_match_id,
    v_tournament_id,
    p_submitted_by_clerk_user_id,
    v_reporter_registration_id,
    v_opponent_registration_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    v_group_replay_storage_path,
    'pending_confirmation',
    now() + make_interval(
      mins => coalesce(v_confirmation_window_minutes, 30)
    )
  )
  returning id into v_group_id;

  if p_submission_ids is not null
    and cardinality(p_submission_ids) > 0 then
    update public.match_result_submissions
    set report_group_id = v_group_id
    where id = any(p_submission_ids);
  end if;

  update public.tournament_matches
  set status = 'pending_review'
  where id = p_match_id
    and status in ('scheduled', 'in_progress');

  return v_group_id;
end;
$$;

commit;
