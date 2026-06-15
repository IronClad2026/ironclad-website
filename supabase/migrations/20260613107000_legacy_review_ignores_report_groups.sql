begin;

create or replace function public.review_match_series_result(
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
  v_match public.tournament_matches%rowtype;
  v_player_one_wins integer;
  v_player_two_wins integer;
  v_wins_required integer;
  v_series_winner uuid;
  v_pending_ids uuid[];
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
    and submission.status = 'pending'
    and submission.report_group_id is null
  for update;

  if not found then
    raise exception 'Pending ungrouped game report not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_submission.match_id
  for update;

  if exists (
    select 1
    from public.match_result_report_groups as report_group
    where report_group.match_id = v_submission.match_id
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
      and report_group.finalized_at is null
  ) then
    raise exception
      'This match has an active confirmation report group. Use the report-group review workflow.';
  end if;

  select array_agg(submission.id)
  into v_pending_ids
  from public.match_result_submissions as submission
  where submission.match_id = v_submission.match_id
    and submission.status = 'pending'
    and submission.report_group_id is null;

  if p_decision <> 'approved' then
    update public.match_result_submissions
    set
      status = p_decision,
      reviewed_by = p_reviewed_by,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_at = now()
    where id = any(v_pending_ids);

    update public.tournament_matches
    set status = 'scheduled'
    where id = v_submission.match_id
      and status = 'pending_review'
      and not exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = v_submission.match_id
          and report_group.status in (
            'pending_confirmation',
            'disputed',
            'under_review'
          )
          and report_group.finalized_at is null
      );
    return;
  end if;

  if exists (
    select 1
    from public.match_result_submissions as report
    where report.match_id = v_submission.match_id
      and report.status = 'pending'
      and report.report_group_id is null
    group by report.game_number
    having count(distinct report.claimed_winner_registration_id) > 1
  ) then
    raise exception 'Conflicting player reports must be resolved before approval';
  end if;

  with resolved_games as (
    select
      report.game_number,
      min(report.claimed_winner_registration_id::text)::uuid as winner_id
    from public.match_result_submissions as report
    where report.match_id = v_submission.match_id
      and report.status = 'pending'
      and report.report_group_id is null
    group by report.game_number
  )
  select
    count(*) filter (
      where winner_id = v_match.player_one_registration_id
    )::integer,
    count(*) filter (
      where winner_id = v_match.player_two_registration_id
    )::integer
  into v_player_one_wins, v_player_two_wins
  from resolved_games;

  v_wins_required := (v_match.series_best_of / 2) + 1;

  if greatest(v_player_one_wins, v_player_two_wins) <> v_wins_required
    or least(v_player_one_wins, v_player_two_wins) >= v_wins_required then
    raise exception
      'The reported games do not yet form a complete series result';
  end if;

  v_series_winner := case
    when v_player_one_wins > v_player_two_wins
      then v_match.player_one_registration_id
    else v_match.player_two_registration_id
  end;

  perform public.apply_official_match_result(
    v_match.id,
    v_player_one_wins,
    v_player_two_wins,
    v_series_winner,
    p_reviewed_by
  );

  update public.match_result_submissions
  set
    status = 'approved',
    reviewed_by = p_reviewed_by,
    review_notes = nullif(btrim(p_review_notes), ''),
    reviewed_at = now()
  where id = any(v_pending_ids);

  update public.tournament_matches
  set
    official_result_submission_id = p_submission_id,
    official_result_decided_by = p_reviewed_by,
    official_result_decided_at = now()
  where id = v_match.id;
end;
$$;

commit;
