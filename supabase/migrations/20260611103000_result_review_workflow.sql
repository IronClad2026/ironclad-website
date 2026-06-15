begin;

update storage.buckets
set file_size_limit = 10485760,
    public = false
where id = 'match-proofs';

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
    perform public.apply_official_match_result(
      v_submission.match_id,
      v_submission.player_one_score,
      v_submission.player_two_score,
      v_submission.claimed_winner_registration_id,
      p_reviewed_by
    );
  else
    update public.match_result_submissions
    set
      status = p_decision,
      reviewed_by = p_reviewed_by,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_at = now()
    where id = p_submission_id;

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

    return;
  end if;

  update public.match_result_submissions
  set
    status = p_decision,
    reviewed_by = p_reviewed_by,
    review_notes = nullif(btrim(p_review_notes), ''),
    reviewed_at = now()
  where id = p_submission_id;
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
