begin;

alter table public.match_result_submissions
  add column if not exists submission_number integer,
  add column if not exists submitted_by_registration_id uuid
    references public.registrations(id) on delete restrict;

with numbered as (
  select
    id,
    row_number() over (
      partition by match_id
      order by created_at, id
    )::integer as submission_number
  from public.match_result_submissions
)
update public.match_result_submissions as submission
set submission_number = numbered.submission_number
from numbered
where numbered.id = submission.id
  and submission.submission_number is null;

update public.match_result_submissions as submission
set submitted_by_registration_id = registration.id
from public.registrations as registration
where submission.submitted_by_registration_id is null
  and registration.clerk_user_id = submission.submitted_by_clerk_user_id
  and registration.id in (
    select match.player_one_registration_id
    from public.tournament_matches as match
    where match.id = submission.match_id
    union
    select match.player_two_registration_id
    from public.tournament_matches as match
    where match.id = submission.match_id
  );

alter table public.match_result_submissions
  alter column submission_number set not null;

create unique index if not exists
  match_result_submissions_match_number_idx
  on public.match_result_submissions(match_id, submission_number);

create index if not exists
  match_result_submissions_reporter_registration_idx
  on public.match_result_submissions(submitted_by_registration_id);

drop function if exists public.submit_match_result_claim(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text,
  text
);

create or replace function public.submit_match_result_claim(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_path text,
  p_screenshot_storage_path text,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_name text;
  v_wins_required integer;
  v_reporter_registration_id uuid;
  v_submission_number integer;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
  end if;

  if p_replay_storage_path is null
    and p_screenshot_storage_path is null then
    raise exception 'At least one proof file is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found or v_match.status = 'completed' then
    raise exception 'This match is not accepting result submissions';
  end if;

  select round.name
  into v_round_name
  from public.bracket_rounds as round
  where round.id = v_match.round_id;

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

  v_wins_required := case
    when lower(v_round_name) in ('grand final', 'final') then 3
    else 2
  end;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score = p_player_two_score
    or p_player_one_score < 0
    or p_player_two_score < 0
    or greatest(p_player_one_score, p_player_two_score) <> v_wins_required
    or least(p_player_one_score, p_player_two_score) >= v_wins_required
    or (
      p_winner_registration_id = v_match.player_one_registration_id
      and p_player_one_score <= p_player_two_score
    )
    or (
      p_winner_registration_id = v_match.player_two_registration_id
      and p_player_two_score <= p_player_one_score
    ) then
    raise exception 'Score does not satisfy the match format';
  end if;

  select coalesce(max(submission.submission_number), 0) + 1
  into v_submission_number
  from public.match_result_submissions as submission
  where submission.match_id = p_match_id;

  insert into public.match_result_submissions (
    submission_number,
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
    p_match_id,
    p_submitted_by_clerk_user_id,
    v_reporter_registration_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_replay_storage_path,
    p_screenshot_storage_path,
    nullif(btrim(p_notes), ''),
    'pending'
  );

  update public.tournament_matches
  set status = 'pending_review'
  where id = p_match_id;

  return v_submission_number;
end;
$$;

revoke all on function public.submit_match_result_claim(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text,
  text
) from public;
grant execute on function public.submit_match_result_claim(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text,
  text
) to service_role;

create or replace function public.review_match_result_submission(
  p_submission_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.match_result_submissions%rowtype;
  v_remaining_pending integer;
  v_matching_submission_ids uuid[];
begin
  if p_reviewed_by is null or btrim(p_reviewed_by) = '' then
    raise exception 'Reviewing administrator is required';
  end if;

  if p_decision not in (
    'approved',
    'rejected',
    'resubmission_requested'
  ) then
    raise exception 'Invalid result review decision';
  end if;

  if p_decision in ('rejected', 'resubmission_requested')
    and nullif(btrim(p_review_notes), '') is null then
    raise exception
      'An administrator message is required for rejection or resubmission';
  end if;

  select submission.*
  into v_submission
  from public.match_result_submissions as submission
  where submission.id = p_submission_id
  for update;

  if not found or v_submission.status <> 'pending' then
    raise exception 'Pending result submission not found';
  end if;

  if p_decision = 'approved' then
    select array_agg(submission.id order by submission.submission_number)
    into v_matching_submission_ids
    from public.match_result_submissions as submission
    where submission.match_id = v_submission.match_id
      and submission.claimed_winner_registration_id =
        v_submission.claimed_winner_registration_id
      and submission.status = 'pending';

    perform public.apply_official_match_result(
      v_submission.match_id,
      v_submission.player_one_score,
      v_submission.player_two_score,
      v_submission.claimed_winner_registration_id,
      p_reviewed_by
    );

    update public.match_result_submissions
    set
      status = 'approved',
      reviewed_by = p_reviewed_by,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_at = now()
    where id = any(v_matching_submission_ids);

    update public.tournament_matches
    set
      official_result_submission_id = p_submission_id,
      official_result_decided_by = p_reviewed_by,
      official_result_decided_at = now()
    where id = v_submission.match_id;
    return;
  end if;

  update public.match_result_submissions
  set
    status = p_decision,
    reviewed_by = p_reviewed_by,
    review_notes = nullif(btrim(p_review_notes), ''),
    reviewed_at = now()
  where match_id = v_submission.match_id
    and claimed_winner_registration_id =
      v_submission.claimed_winner_registration_id
    and status = 'pending';

  select count(*)
  into v_remaining_pending
  from public.match_result_submissions
  where match_id = v_submission.match_id
    and status = 'pending';

  update public.tournament_matches
  set status = case
    when v_remaining_pending > 0 then 'pending_review'
    else 'scheduled'
  end
  where id = v_submission.match_id
    and status = 'pending_review';
end;
$$;

revoke all on function public.review_match_result_submission(
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.review_match_result_submission(
  uuid,
  text,
  text,
  text
) to service_role;

commit;
