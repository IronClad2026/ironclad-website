begin;

alter table public.match_result_report_groups
  add column if not exists result_type text not null default 'normal',
  add column if not exists no_show_reported_by_registration_id uuid
    references public.registrations(id) on delete set null,
  add column if not exists no_show_registration_id uuid
    references public.registrations(id) on delete set null,
  add column if not exists no_show_status text,
  add column if not exists no_show_note text,
  add column if not exists no_show_resolved_at timestamptz,
  add column if not exists no_show_resolved_by text;

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_result_type_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_result_type_check
  check (result_type in ('normal', 'no_show'));

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_no_show_status_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_no_show_status_check
  check (
    no_show_status is null
    or no_show_status in (
      'pending',
      'confirmed',
      'disputed',
      'approved',
      'rejected',
      'auto_confirmed'
    )
  );

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_no_show_note_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_no_show_note_check
  check (no_show_note is null or length(no_show_note) <= 2000);

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_no_show_integrity_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_no_show_integrity_check
  check (
    (
      result_type = 'normal'
      and no_show_reported_by_registration_id is null
      and no_show_registration_id is null
      and no_show_status is null
      and no_show_note is null
      and no_show_resolved_at is null
      and no_show_resolved_by is null
    )
    or (
      result_type = 'no_show'
      and no_show_reported_by_registration_id is not null
      and no_show_registration_id is not null
      and no_show_status is not null
    )
  );

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_replay_proof_mode_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_replay_proof_mode_check
  check (
    replay_proof_mode in (
      'single_series_replay',
      'per_game_replay',
      'no_show_report'
    )
  );

create index if not exists match_result_report_groups_result_type_idx
  on public.match_result_report_groups(result_type);

create index if not exists match_result_report_groups_no_show_registration_idx
  on public.match_result_report_groups(no_show_registration_id)
  where result_type = 'no_show';

create or replace function public.validate_match_result_report_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_submitter_clerk_user_id text;
  v_wins_required integer;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = new.match_id;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = v_match.generated_bracket_id;

  if v_tournament_id is null or new.tournament_id <> v_tournament_id then
    raise exception 'Report group tournament does not match the match bracket';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  if new.submitted_by_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Submitting registration is not a participant in this match';
  end if;

  if new.opponent_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Opponent registration is not a participant in this match';
  end if;

  if new.winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  if new.result_type = 'no_show' then
    if new.no_show_reported_by_registration_id is distinct from
      new.submitted_by_registration_id then
      raise exception 'No-show reporter must match the submitting registration';
    end if;

    if new.no_show_registration_id is distinct from
      new.opponent_registration_id then
      raise exception 'No-show registration must be the opposing participant';
    end if;

    if new.no_show_registration_id = new.submitted_by_registration_id then
      raise exception 'A player cannot report themselves as a no-show';
    end if;

    if new.winner_registration_id is distinct from
      new.submitted_by_registration_id then
      raise exception 'No-show reporter must be the reported winner';
    end if;

    if new.no_show_status is null then
      raise exception 'No-show status is required';
    end if;
  else
    if new.no_show_reported_by_registration_id is not null
      or new.no_show_registration_id is not null
      or new.no_show_status is not null
      or new.no_show_note is not null
      or new.no_show_resolved_at is not null
      or new.no_show_resolved_by is not null then
      raise exception 'No-show fields are only valid for no-show reports';
    end if;
  end if;

  v_wins_required := (v_match.series_best_of / 2) + 1;

  if new.winner_registration_id = v_match.player_one_registration_id then
    if new.player_one_score <> v_wins_required
      or new.player_two_score >= v_wins_required then
      raise exception 'Report group score does not satisfy the match format';
    end if;
  else
    if new.player_two_score <> v_wins_required
      or new.player_one_score >= v_wins_required then
      raise exception 'Report group score does not satisfy the match format';
    end if;
  end if;

  select registration.clerk_user_id
  into v_submitter_clerk_user_id
  from public.registrations as registration
  where registration.id = new.submitted_by_registration_id;

  if v_submitter_clerk_user_id is distinct from
    new.submitted_by_clerk_user_id then
    raise exception
      'Submitting registration does not match the submitting account';
  end if;

  return new;
end;
$$;

drop trigger if exists match_result_report_groups_validate
  on public.match_result_report_groups;
create trigger match_result_report_groups_validate
before insert or update of
  match_id,
  tournament_id,
  submitted_by_registration_id,
  opponent_registration_id,
  winner_registration_id,
  player_one_score,
  player_two_score,
  result_type,
  no_show_reported_by_registration_id,
  no_show_registration_id,
  no_show_status,
  no_show_note,
  no_show_resolved_at,
  no_show_resolved_by
on public.match_result_report_groups
for each row
execute function public.validate_match_result_report_group();

create or replace function public.assert_report_group_replay_count(
  p_report_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_required_replay_count integer;
  v_replay_count integer;
  v_distinct_path_count integer;
  v_hash_count integer;
  v_distinct_hash_count integer;
begin
  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  if v_group.result_type = 'no_show'
    or v_group.replay_proof_mode = 'no_show_report' then
    return;
  end if;

  v_required_replay_count := v_group.player_one_score + v_group.player_two_score;

  select
    (count(*) filter (
      where submission.replay_storage_path is not null
    ))::integer,
    (count(distinct submission.replay_storage_path) filter (
      where submission.replay_storage_path is not null
    ))::integer,
    (count(submission.replay_content_hash) filter (
      where submission.replay_storage_path is not null
    ))::integer,
    (count(distinct submission.replay_content_hash) filter (
      where submission.replay_storage_path is not null
        and submission.replay_content_hash is not null
    ))::integer
  into
    v_replay_count,
    v_distinct_path_count,
    v_hash_count,
    v_distinct_hash_count
  from public.match_result_submissions as submission
  where submission.report_group_id = p_report_group_id;

  if v_replay_count = 0 and v_group.replay_storage_path is not null then
    v_replay_count := 1;
    v_distinct_path_count := 1;
    v_hash_count := 0;
    v_distinct_hash_count := 0;
  end if;

  if v_group.replay_proof_mode = 'single_series_replay' then
    if v_replay_count < 1 then
      raise exception 'At least one replay file is required';
    end if;

    if v_distinct_path_count <> v_replay_count then
      raise exception 'Duplicate replay storage paths cannot be finalized';
    end if;

    if v_hash_count > 0 and v_distinct_hash_count <> v_hash_count then
      raise exception 'Duplicate replay payloads cannot be finalized';
    end if;

    return;
  end if;

  if v_replay_count <> v_required_replay_count then
    raise exception
      'This final score requires exactly % replay file%',
      v_required_replay_count,
      case when v_required_replay_count = 1 then '' else 's' end;
  end if;

  if v_distinct_path_count <> v_replay_count then
    raise exception 'Duplicate replay storage paths cannot be finalized';
  end if;

  if v_hash_count <> v_replay_count then
    raise exception 'Replay hash audit data is incomplete';
  end if;

  if v_distinct_hash_count <> v_hash_count then
    raise exception 'Duplicate replay payloads cannot be finalized';
  end if;
end;
$$;

create or replace function public.submit_match_no_show_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_no_show_registration_id uuid,
  p_notes text default null
)
returns jsonb
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
  v_wins_required integer;
  v_player_one_score integer;
  v_player_two_score integer;
  v_deadline timestamptz;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
  end if;

  if p_no_show_registration_id is null then
    raise exception 'Missing player is required';
  end if;

  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'No-show notes must be 2000 characters or fewer';
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

  if p_no_show_registration_id <> v_opponent_registration_id then
    raise exception 'Only the opposing player can be reported as a no-show';
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

  v_wins_required := (v_match.series_best_of / 2) + 1;
  v_player_one_score := case
    when v_reporter_registration_id = v_match.player_one_registration_id
      then v_wins_required
    else 0
  end;
  v_player_two_score := case
    when v_reporter_registration_id = v_match.player_two_registration_id
      then v_wins_required
    else 0
  end;
  v_deadline := now() + make_interval(
    mins => coalesce(v_confirmation_window_minutes, 30)
  );

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
    replay_proof_mode,
    status,
    confirmation_deadline_at,
    result_type,
    no_show_reported_by_registration_id,
    no_show_registration_id,
    no_show_status,
    no_show_note
  )
  values (
    p_match_id,
    v_tournament_id,
    p_submitted_by_clerk_user_id,
    v_reporter_registration_id,
    v_opponent_registration_id,
    v_reporter_registration_id,
    v_player_one_score,
    v_player_two_score,
    null,
    'no_show_report',
    'pending_confirmation',
    v_deadline,
    'no_show',
    v_reporter_registration_id,
    p_no_show_registration_id,
    'pending',
    nullif(btrim(p_notes), '')
  )
  returning id into v_group_id;

  update public.tournament_matches
  set status = 'pending_review'
  where id = p_match_id
    and status in ('scheduled', 'in_progress');

  return jsonb_build_object(
    'report_group_id', v_group_id,
    'reporter_registration_id', v_reporter_registration_id,
    'no_show_registration_id', p_no_show_registration_id,
    'no_show_status', 'pending',
    'confirmation_deadline_at', v_deadline
  );
end;
$$;

create or replace function public.finalize_match_result_report_group(
  p_report_group_id uuid,
  p_final_status text,
  p_finalized_source text,
  p_actor_clerk_user_id text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_match public.tournament_matches%rowtype;
  v_official_submission_id uuid;
begin
  if p_actor_clerk_user_id is null
    or btrim(p_actor_clerk_user_id) = '' then
    raise exception 'Finalizing actor is required';
  end if;

  if p_final_status not in ('confirmed', 'auto_approved', 'approved') then
    raise exception 'Invalid final report group status';
  end if;

  if p_finalized_source not in (
    'opponent_confirmation',
    'cron_auto_approval',
    'admin_approval',
    'admin_override'
  ) then
    raise exception 'Invalid report group finalization source';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
  for update;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  if v_group.finalized_at is not null then
    return;
  end if;

  if v_group.status in ('rejected', 'reset') then
    raise exception 'This report group can no longer be finalized';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_group.match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null then
    raise exception 'This match already has an official result';
  end if;

  perform public.assert_report_group_replay_count(p_report_group_id);

  perform public.apply_official_match_result(
    v_group.match_id,
    v_group.player_one_score,
    v_group.player_two_score,
    v_group.winner_registration_id,
    p_actor_clerk_user_id
  );

  update public.match_result_report_groups
  set
    status = p_final_status,
    reviewed_by = case
      when p_finalized_source in ('admin_approval', 'admin_override')
        then p_actor_clerk_user_id
      else reviewed_by
    end,
    reviewed_at = case
      when p_finalized_source in ('admin_approval', 'admin_override')
        then now()
      else reviewed_at
    end,
    review_notes = coalesce(nullif(btrim(p_review_notes), ''), review_notes),
    finalized_at = now(),
    finalized_source = p_finalized_source,
    no_show_status = case
      when result_type = 'no_show' and p_final_status = 'confirmed'
        then 'confirmed'
      when result_type = 'no_show' and p_final_status = 'auto_approved'
        then 'auto_confirmed'
      when result_type = 'no_show' and p_final_status = 'approved'
        then 'approved'
      else no_show_status
    end,
    no_show_resolved_at = case
      when result_type = 'no_show' then now()
      else no_show_resolved_at
    end,
    no_show_resolved_by = case
      when result_type = 'no_show' then p_actor_clerk_user_id
      else no_show_resolved_by
    end
  where id = p_report_group_id;

  update public.match_result_submissions
  set
    status = 'approved',
    reviewed_by = p_actor_clerk_user_id,
    review_notes = coalesce(
      nullif(btrim(p_review_notes), ''),
      review_notes
    ),
    reviewed_at = now()
  where report_group_id = p_report_group_id;

  select submission.id
  into v_official_submission_id
  from public.match_result_submissions as submission
  where submission.report_group_id = p_report_group_id
  order by submission.game_number, submission.created_at, submission.id
  limit 1;

  update public.tournament_matches
  set
    official_result_submission_id = v_official_submission_id,
    official_result_decided_by = p_actor_clerk_user_id,
    official_result_decided_at = now()
  where id = v_group.match_id;
end;
$$;

create or replace function public.dispute_match_result_report_group(
  p_report_group_id uuid,
  p_disputed_by_clerk_user_id text,
  p_dispute_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_disputer_registration_id uuid;
begin
  if p_disputed_by_clerk_user_id is null
    or btrim(p_disputed_by_clerk_user_id) = '' then
    raise exception 'Disputing player is required';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
  for update;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  if v_group.status <> 'pending_confirmation'
    or v_group.finalized_at is not null then
    raise exception 'This report group is not awaiting confirmation';
  end if;

  if now() >= v_group.confirmation_deadline_at then
    raise exception 'The confirmation window has expired';
  end if;

  select registration.id
  into v_disputer_registration_id
  from public.registrations as registration
  where registration.id = v_group.opponent_registration_id
    and registration.clerk_user_id = p_disputed_by_clerk_user_id;

  if v_disputer_registration_id is null then
    raise exception 'Only the opponent can dispute this result';
  end if;

  update public.match_result_report_groups
  set
    status = 'disputed',
    no_show_status = case
      when result_type = 'no_show' then 'disputed'
      else no_show_status
    end,
    disputed_at = now(),
    disputed_by_registration_id = v_disputer_registration_id,
    dispute_notes = nullif(btrim(p_dispute_notes), ''),
    reviewed_by = null,
    reviewed_at = null
  where id = p_report_group_id;
end;
$$;

create or replace function public.admin_finalize_match_result_report_group(
  p_report_group_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null,
  p_player_one_score integer default null,
  p_player_two_score integer default null,
  p_winner_registration_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_match public.tournament_matches%rowtype;
  v_has_override boolean;
begin
  if p_reviewed_by is null or btrim(p_reviewed_by) = '' then
    raise exception 'Reviewing administrator is required';
  end if;

  if p_decision not in (
    'approved',
    'rejected',
    'under_review',
    'reset'
  ) then
    raise exception 'Invalid report group review decision';
  end if;

  if p_decision = 'rejected'
    and nullif(btrim(p_review_notes), '') is null then
    raise exception 'An administrator message is required for rejection';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
  for update;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  v_has_override :=
    p_player_one_score is not null
    or p_player_two_score is not null
    or p_winner_registration_id is not null;

  if v_group.result_type = 'no_show'
    and v_has_override then
    raise exception
      'No-show reports cannot be score-overridden. Reject the no-show first, then use the normal result workflow.';
  end if;

  if p_decision = 'under_review' then
    update public.match_result_report_groups
    set
      status = 'under_review',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), '')
    where id = p_report_group_id
      and finalized_at is null;
    return;
  end if;

  if p_decision = 'rejected' then
    update public.match_result_report_groups
    set
      status = 'rejected',
      no_show_status = case
        when result_type = 'no_show' then 'rejected'
        else no_show_status
      end,
      no_show_resolved_at = case
        when result_type = 'no_show' then now()
        else no_show_resolved_at
      end,
      no_show_resolved_by = case
        when result_type = 'no_show' then p_reviewed_by
        else no_show_resolved_by
      end,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), ''),
      finalized_at = now(),
      finalized_source = 'admin_approval'
    where id = p_report_group_id
      and finalized_at is null;

    update public.match_result_submissions
    set
      status = 'rejected',
      reviewed_by = p_reviewed_by,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_at = now()
    where report_group_id = p_report_group_id;

    update public.tournament_matches
    set status = 'scheduled'
    where id = v_group.match_id
      and status = 'pending_review'
      and not exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = v_group.match_id
          and submission.status = 'pending'
      );
    return;
  end if;

  if p_decision = 'reset' then
    select match.*
    into v_match
    from public.tournament_matches as match
    where match.id = v_group.match_id
    for update;

    if v_match.status = 'completed'
      or v_match.official_result_submission_id is not null
      or v_match.winner_registration_id is not null then
      raise exception
        'Completed match reset requires the explicit downstream-safe match reset workflow';
    end if;

    update public.match_result_report_groups
    set
      status = 'reset',
      no_show_status = case
        when result_type = 'no_show' then 'rejected'
        else no_show_status
      end,
      no_show_resolved_at = case
        when result_type = 'no_show' then now()
        else no_show_resolved_at
      end,
      no_show_resolved_by = case
        when result_type = 'no_show' then p_reviewed_by
        else no_show_resolved_by
      end,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), ''),
      finalized_at = now(),
      finalized_source = 'reset'
    where id = p_report_group_id
      and finalized_at is null;

    update public.match_result_submissions
    set
      status = 'rejected',
      reviewed_by = p_reviewed_by,
      review_notes = coalesce(
        nullif(btrim(p_review_notes), ''),
        'Result report group was reset by an administrator.'
      ),
      reviewed_at = now()
    where report_group_id = p_report_group_id;

    update public.tournament_matches
    set status = 'scheduled'
    where id = v_group.match_id
      and status = 'pending_review';
    return;
  end if;

  update public.match_result_report_groups
  set
    player_one_score = coalesce(p_player_one_score, player_one_score),
    player_two_score = coalesce(p_player_two_score, player_two_score),
    winner_registration_id =
      coalesce(p_winner_registration_id, winner_registration_id)
  where id = p_report_group_id;

  perform public.finalize_match_result_report_group(
    p_report_group_id,
    'approved',
    case when v_has_override then 'admin_override' else 'admin_approval' end,
    p_reviewed_by,
    p_review_notes
  );
end;
$$;

create or replace function public.is_registration_confirmed_no_show_for_leaderboard(
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_registration_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_result_report_groups as report_group
    join public.tournament_matches as match
      on match.id = report_group.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    where report_group.result_type = 'no_show'
      and report_group.no_show_registration_id = p_registration_id
      and report_group.tournament_id = p_tournament_id
      and generated.tournament_bracket_id = p_tournament_bracket_id
      and report_group.finalized_at is not null
      and report_group.status in (
        'confirmed',
        'auto_approved',
        'approved'
      )
      and (
        report_group.no_show_status in (
          'confirmed',
          'auto_confirmed',
          'approved'
        )
      )
  );
$$;

create or replace function public.suppress_no_show_participation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'participation'
    and new.tournament_id is not null
    and new.tournament_bracket_id is not null
    and new.registration_id is not null
    and public.is_registration_confirmed_no_show_for_leaderboard(
      new.tournament_id,
      new.tournament_bracket_id,
      new.registration_id
    ) then
    insert into public.leaderboard_point_events (
      season_id,
      tournament_id,
      tournament_bracket_id,
      registration_id,
      player_id,
      bracket_type,
      points,
      event_type,
      description,
      source,
      created_by_clerk_user_id
    )
    select
      new.season_id,
      new.tournament_id,
      null,
      new.registration_id,
      new.player_id,
      new.bracket_type,
      0,
      'participation_withheld',
      'Participation points withheld due to confirmed no-show',
      new.source,
      new.created_by_clerk_user_id
    where not exists (
      select 1
      from public.leaderboard_point_events as existing_event
      where existing_event.season_id = new.season_id
        and existing_event.tournament_id = new.tournament_id
        and existing_event.registration_id = new.registration_id
        and existing_event.player_id = new.player_id
        and existing_event.bracket_type = new.bracket_type
        and existing_event.event_type = 'participation_withheld'
        and existing_event.source = new.source
    );

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists leaderboard_point_events_no_show_participation
  on public.leaderboard_point_events;
create trigger leaderboard_point_events_no_show_participation
before insert on public.leaderboard_point_events
for each row
execute function public.suppress_no_show_participation_event();

create or replace function public.recalculate_leaderboard_for_season(
  p_season_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_all_time_run_id uuid;
  v_all_time_run_status text;
  v_all_time_run_notes text;
  v_error_message text;
  v_error_state text;
  v_error_context text;
begin
  perform public.leaderboard_require_write_access();

  insert into public.leaderboard_recalculation_runs (
    season_id,
    scope,
    status,
    triggered_by_clerk_user_id
  )
  values (
    p_season_id,
    'season',
    'pending',
    nullif(btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_run_id;

  begin
    if not exists (
      select 1
      from public.leaderboard_seasons
      where id = p_season_id
    ) then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = 'Leaderboard season not found'
      where id = v_run_id;

      return v_run_id;
    end if;

    drop table if exists pg_temp.leaderboard_existing_season_stats;
    create temporary table leaderboard_existing_season_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    drop table if exists pg_temp.leaderboard_previous_ranks;
    create temporary table leaderboard_previous_ranks
    on commit drop
    as
    select
      player_id,
      bracket_type,
      current_rank
    from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    delete from public.leaderboard_player_season_stats
    where season_id = p_season_id;

    drop table if exists pg_temp.leaderboard_event_stats;
    create temporary table leaderboard_event_stats
    on commit drop
    as
    with event_scope as (
      select
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.points,
        event.event_type,
        event.tournament_id,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
      union all
      select
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.points,
        event.event_type,
        event.tournament_id,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('main', 'challenge')
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      coalesce(sum(points), 0)::integer as total_points,
      count(distinct tournament_id) filter (
        where event_type = 'participation'
          and tournament_id is not null
      )::integer as tournaments_played,
      count(*) filter (
        where event_type = 'round_passed'
      )::integer as rounds_passed,
      count(*) filter (
        where event_type = 'tournament_win'
      )::integer as tournament_wins
    from event_scope
    group by player_id, stat_bracket_type;

    drop table if exists pg_temp.leaderboard_last_tournament_points;
    create temporary table leaderboard_last_tournament_points
    on commit drop
    as
    with event_scope as (
      select
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.tournament_id,
        event.points,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
      union all
      select
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.tournament_id,
        event.points,
        event.created_at
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('main', 'challenge')
    ),
    tournament_points as (
      select
        event_scope.player_id,
        event_scope.stat_bracket_type,
        event_scope.tournament_id,
        coalesce(sum(event_scope.points), 0)::integer as points,
        max(
          coalesce(
            tournament.grand_final_at,
            tournament.created_at,
            tournament.updated_at,
            event_scope.created_at
          )
        ) as sort_at
      from event_scope
      left join public.tournaments as tournament
        on tournament.id = event_scope.tournament_id
      where event_scope.tournament_id is not null
      group by
        event_scope.player_id,
        event_scope.stat_bracket_type,
        event_scope.tournament_id
    ),
    ranked as (
      select
        tournament_points.*,
        row_number() over (
          partition by player_id, stat_bracket_type
          order by sort_at desc, tournament_id::text
        ) as row_number
      from tournament_points
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      tournament_id,
      points
    from ranked
    where row_number = 1;

    drop table if exists pg_temp.leaderboard_match_stats;
    create temporary table leaderboard_match_stats
    on commit drop
    as
    with event_registrations as (
      select distinct
        event.player_id,
        event.bracket_type as stat_bracket_type,
        event.registration_id,
        event.tournament_bracket_id
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.registration_id is not null
        and event.tournament_bracket_id is not null
      union
      select distinct
        event.player_id,
        'overall'::text as stat_bracket_type,
        event.registration_id,
        event.tournament_bracket_id
      from public.leaderboard_point_events as event
      where event.season_id = p_season_id
        and event.event_type <> 'participation_withheld'
        and event.bracket_type in ('main', 'challenge')
        and event.registration_id is not null
        and event.tournament_bracket_id is not null
    ),
    matched as (
      select distinct
        event_registrations.player_id,
        event_registrations.stat_bracket_type,
        match.id as match_id,
        match.winner_registration_id,
        event_registrations.registration_id
      from event_registrations
      join public.generated_brackets as generated
        on generated.tournament_bracket_id =
          event_registrations.tournament_bracket_id
      join public.tournament_matches as match
        on match.generated_bracket_id = generated.id
        and match.status = 'completed'
        and (
          match.player_one_registration_id =
            event_registrations.registration_id
          or match.player_two_registration_id =
            event_registrations.registration_id
        )
    )
    select
      player_id,
      stat_bracket_type as bracket_type,
      count(distinct match_id)::integer as matches_played,
      count(distinct match_id) filter (
        where winner_registration_id = registration_id
      )::integer as matches_won
    from matched
    group by player_id, stat_bracket_type;

    insert into public.leaderboard_player_season_stats (
      season_id,
      player_id,
      bracket_type,
      total_points,
      tournaments_played,
      rounds_passed,
      tournament_wins,
      matches_played,
      matches_won,
      matches_lost,
      win_rate,
      last_tournament_id,
      last_tournament_points,
      current_rank,
      previous_rank,
      rank_movement
    )
    with combined as (
      select
        coalesce(event_stats.player_id, match_stats.player_id) as player_id,
        coalesce(event_stats.bracket_type, match_stats.bracket_type)
          as bracket_type,
        coalesce(event_stats.total_points, 0)::integer as total_points,
        coalesce(event_stats.tournaments_played, 0)::integer
          as tournaments_played,
        coalesce(event_stats.rounds_passed, 0)::integer as rounds_passed,
        coalesce(event_stats.tournament_wins, 0)::integer as tournament_wins,
        coalesce(match_stats.matches_played, 0)::integer as matches_played,
        coalesce(match_stats.matches_won, 0)::integer as matches_won
      from leaderboard_event_stats as event_stats
      full join leaderboard_match_stats as match_stats
        on match_stats.player_id = event_stats.player_id
        and match_stats.bracket_type = event_stats.bracket_type
    ),
    ranked as (
      select
        combined.*,
        greatest(combined.matches_played - combined.matches_won, 0)::integer
          as matches_lost,
        case
          when combined.matches_played = 0 then 0::numeric
          else round(
            (combined.matches_won::numeric / combined.matches_played) * 100,
            2
          )
        end as win_rate,
        row_number() over (
          partition by combined.bracket_type
          order by
            combined.total_points desc,
            combined.tournament_wins desc,
            combined.rounds_passed desc,
            case
              when combined.matches_played = 0 then 0::numeric
              else round(
                (combined.matches_won::numeric / combined.matches_played) * 100,
                2
              )
            end desc,
            coalesce(player.in_game_name, player.display_name, player.id::text),
            player.id::text
        )::integer as current_rank
      from combined
      join public.players as player
        on player.id = combined.player_id
    )
    select
      p_season_id,
      ranked.player_id,
      ranked.bracket_type,
      ranked.total_points,
      ranked.tournaments_played,
      ranked.rounds_passed,
      ranked.tournament_wins,
      ranked.matches_played,
      ranked.matches_won,
      ranked.matches_lost,
      ranked.win_rate,
      last_points.tournament_id,
      coalesce(last_points.points, 0),
      ranked.current_rank,
      previous.current_rank,
      case
        when previous.current_rank is null then 0
        else previous.current_rank - ranked.current_rank
      end
    from ranked
    left join leaderboard_previous_ranks as previous
      on previous.player_id = ranked.player_id
      and previous.bracket_type = ranked.bracket_type
    left join leaderboard_last_tournament_points as last_points
      on last_points.player_id = ranked.player_id
      and last_points.bracket_type = ranked.bracket_type;

    v_all_time_run_id := public.recalculate_leaderboard_all_time(
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_all_time_run_status, v_all_time_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_all_time_run_id;

    if v_all_time_run_status is distinct from 'completed' then
      delete from public.leaderboard_player_season_stats
      where season_id = p_season_id;

      insert into public.leaderboard_player_season_stats (
        id,
        season_id,
        player_id,
        bracket_type,
        total_points,
        tournaments_played,
        rounds_passed,
        tournament_wins,
        matches_played,
        matches_won,
        matches_lost,
        win_rate,
        last_tournament_id,
        last_tournament_points,
        current_rank,
        previous_rank,
        rank_movement,
        updated_at
      )
      select
        id,
        season_id,
        player_id,
        bracket_type,
        total_points,
        tournaments_played,
        rounds_passed,
        tournament_wins,
        matches_played,
        matches_won,
        matches_lost,
        win_rate,
        last_tournament_id,
        last_tournament_points,
        current_rank,
        previous_rank,
        rank_movement,
        updated_at
      from leaderboard_existing_season_stats;

      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'All-time leaderboard recalculation failed: %s',
          coalesce(
            nullif(v_all_time_run_notes, ''),
            'status ' || coalesce(v_all_time_run_status, 'unknown')
          )
        )
      where id = v_run_id;

      return v_run_id;
    end if;

    update public.leaderboard_recalculation_runs
    set
      status = 'completed',
      finished_at = now()
    where id = v_run_id;
  exception
    when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_state = returned_sqlstate,
        v_error_context = pg_exception_context;

      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'Season leaderboard recalculation failed: SQLSTATE %s: %s%s',
          v_error_state,
          v_error_message,
          case
            when nullif(v_error_context, '') is null then ''
            else E'\n' || v_error_context
          end
        )
      where id = v_run_id;
  end;

  return v_run_id;
end;
$$;

revoke all on function public.validate_match_result_report_group()
  from public;
grant execute on function public.validate_match_result_report_group()
  to service_role;

revoke all on function public.assert_report_group_replay_count(uuid)
  from public;
grant execute on function public.assert_report_group_replay_count(uuid)
  to service_role;

revoke all on function public.submit_match_no_show_report(
  uuid,
  text,
  uuid,
  text
) from public;
grant execute on function public.submit_match_no_show_report(
  uuid,
  text,
  uuid,
  text
) to service_role;

revoke all on function public.finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  text
) from public;
grant execute on function public.finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  text
) to service_role;

revoke all on function public.dispute_match_result_report_group(
  uuid,
  text,
  text
) from public;
grant execute on function public.dispute_match_result_report_group(
  uuid,
  text,
  text
) to service_role;

revoke all on function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) from public;
grant execute on function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) to service_role;

revoke all on function public.is_registration_confirmed_no_show_for_leaderboard(
  uuid,
  uuid,
  uuid
) from public;
grant execute on function public.is_registration_confirmed_no_show_for_leaderboard(
  uuid,
  uuid,
  uuid
) to service_role;

revoke all on function public.suppress_no_show_participation_event()
  from public;
grant execute on function public.suppress_no_show_participation_event()
  to service_role;

commit;
