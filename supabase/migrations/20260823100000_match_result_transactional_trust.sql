begin;

-- IC-AUD-002: every result path that operates on existing result state and
-- competes with another Player or Admin action acquires locks in this order:
--   1. tournament_matches;
--   2. the authoritative active match_result_report_groups row;
--   3. relevant match_result_submissions rows.
-- Reads used only to discover match_id are intentionally unlocked and are
-- revalidated after both authoritative rows are locked.
-- New result creation also locks tournament_matches first; its new submission
-- and group rows do not exist yet and therefore cannot be pre-locked.

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
set search_path = pg_catalog
as $$
declare
  v_match_id uuid;
  v_group public.match_result_report_groups%rowtype;
  v_match public.tournament_matches%rowtype;
  v_format text;
  v_active_group_id uuid;
  v_official_submission_id uuid;
  v_affected integer;
begin
  if p_actor_clerk_user_id is null
    or pg_catalog.btrim(p_actor_clerk_user_id) = '' then
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

  if (p_finalized_source = 'opponent_confirmation'
      and p_final_status <> 'confirmed')
    or (p_finalized_source = 'cron_auto_approval'
      and p_final_status <> 'auto_approved')
    or (p_finalized_source in ('admin_approval', 'admin_override')
      and p_final_status <> 'approved') then
    raise exception 'Final report group status does not match its source';
  end if;

  select report_group.match_id
  into v_match_id
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
    and report_group.match_id = v_match.id
  for update;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the report group changed before finalization';
  end if;

  if v_group.finalized_at is not null
    or v_group.status not in (
      'pending_confirmation',
      'disputed',
      'under_review'
    ) then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this report group is no longer active';
  end if;

  if p_finalized_source in ('opponent_confirmation', 'cron_auto_approval')
    and v_group.status <> 'pending_confirmation' then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this report group is no longer awaiting confirmation';
  end if;

  select report_group.id
  into v_active_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = v_match.id
    and report_group.finalized_at is null
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_active_group_id is distinct from v_group.id then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this is no longer the authoritative active report group';
  end if;

  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = v_match.generated_bracket_id;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null
    or (
      v_format = 'single_elimination'
      and v_match.status not in ('in_progress', 'pending_review')
    ) then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Match no longer permits this finalization';
  end if;

  perform 1
  from public.match_result_submissions as submission
  where submission.match_id = v_match.id
  order by submission.id
  for update;

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
        then pg_catalog.now()
      else reviewed_at
    end,
    review_notes = coalesce(
      nullif(pg_catalog.btrim(p_review_notes), ''),
      review_notes
    ),
    finalized_at = pg_catalog.now(),
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
      when result_type = 'no_show' then pg_catalog.now()
      else no_show_resolved_at
    end,
    no_show_resolved_by = case
      when result_type = 'no_show' then p_actor_clerk_user_id
      else no_show_resolved_by
    end
  where id = p_report_group_id
    and finalized_at is null
    and status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    );

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: finalization did not update the active report group';
  end if;

  update public.match_result_submissions
  set
    status = 'approved',
    reviewed_by = p_actor_clerk_user_id,
    review_notes = coalesce(
      nullif(pg_catalog.btrim(p_review_notes), ''),
      review_notes
    ),
    reviewed_at = pg_catalog.now()
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
    official_result_decided_at = pg_catalog.now()
  where id = v_group.match_id
    and status = 'completed'
    and winner_registration_id = v_group.winner_registration_id
    and player_one_score = v_group.player_one_score
    and player_two_score = v_group.player_two_score;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the official Match result was not applied consistently';
  end if;
end;
$$;

alter function public.finalize_match_result_report_group(
  uuid, text, text, text, text
) owner to postgres;
revoke all on function public.finalize_match_result_report_group(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_match_result_report_group(
  uuid, text, text, text, text
) to service_role;

create or replace function public.confirm_match_result_report_group(
  p_report_group_id uuid,
  p_confirmed_by_clerk_user_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match_id uuid;
  v_match public.tournament_matches%rowtype;
  v_group public.match_result_report_groups%rowtype;
  v_active_group_id uuid;
  v_confirmer_registration_id uuid;
  v_affected integer;
begin
  if p_confirmed_by_clerk_user_id is null
    or pg_catalog.btrim(p_confirmed_by_clerk_user_id) = '' then
    raise exception 'Confirming player is required';
  end if;

  select report_group.match_id
  into v_match_id
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
    and report_group.match_id = v_match.id
  for update;

  if not found
    or v_group.status <> 'pending_confirmation'
    or v_group.finalized_at is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this report group is no longer awaiting confirmation';
  end if;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Match already has an authoritative outcome';
  end if;

  select report_group.id
  into v_active_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = v_match.id
    and report_group.finalized_at is null
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_active_group_id is distinct from v_group.id then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this is no longer the authoritative active report group';
  end if;

  if pg_catalog.now() >= v_group.confirmation_deadline_at then
    raise exception 'The confirmation window has expired';
  end if;

  select registration.id
  into v_confirmer_registration_id
  from public.registrations as registration
  where registration.id = v_group.opponent_registration_id
    and registration.clerk_user_id = p_confirmed_by_clerk_user_id;

  if v_confirmer_registration_id is null then
    raise exception 'Only the opponent can confirm this result';
  end if;

  update public.match_result_report_groups
  set
    confirmed_at = pg_catalog.now(),
    confirmed_by_registration_id = v_confirmer_registration_id
  where id = p_report_group_id
    and status = 'pending_confirmation'
    and finalized_at is null;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: confirmation did not update the active report group';
  end if;

  perform public.finalize_match_result_report_group(
    p_report_group_id,
    'confirmed',
    'opponent_confirmation',
    p_confirmed_by_clerk_user_id,
    null
  );
end;
$$;

alter function public.confirm_match_result_report_group(uuid, text)
  owner to postgres;
revoke all on function public.confirm_match_result_report_group(uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_match_result_report_group(uuid, text)
  to service_role;

create or replace function public.dispute_match_result_report_group(
  p_report_group_id uuid,
  p_disputed_by_clerk_user_id text,
  p_dispute_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match_id uuid;
  v_match public.tournament_matches%rowtype;
  v_group public.match_result_report_groups%rowtype;
  v_active_group_id uuid;
  v_disputer_registration_id uuid;
  v_affected integer;
begin
  if p_disputed_by_clerk_user_id is null
    or pg_catalog.btrim(p_disputed_by_clerk_user_id) = '' then
    raise exception 'Disputing player is required';
  end if;

  select report_group.match_id
  into v_match_id
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
    and report_group.match_id = v_match.id
  for update;

  if not found
    or v_group.status <> 'pending_confirmation'
    or v_group.finalized_at is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this report group is no longer awaiting confirmation';
  end if;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Match already has an authoritative outcome';
  end if;

  select report_group.id
  into v_active_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = v_match.id
    and report_group.finalized_at is null
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_active_group_id is distinct from v_group.id then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this is no longer the authoritative active report group';
  end if;

  if pg_catalog.now() >= v_group.confirmation_deadline_at then
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
    disputed_at = pg_catalog.now(),
    disputed_by_registration_id = v_disputer_registration_id,
    dispute_notes = nullif(pg_catalog.btrim(p_dispute_notes), ''),
    reviewed_by = null,
    reviewed_at = null
  where id = p_report_group_id
    and status = 'pending_confirmation'
    and finalized_at is null;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: dispute did not update the active report group';
  end if;
end;
$$;

alter function public.dispute_match_result_report_group(uuid, text, text)
  owner to postgres;
revoke all on function public.dispute_match_result_report_group(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.dispute_match_result_report_group(uuid, text, text)
  to service_role;

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
set search_path = pg_catalog
as $$
declare
  v_match_id uuid;
  v_group public.match_result_report_groups%rowtype;
  v_match public.tournament_matches%rowtype;
  v_active_group_id uuid;
  v_has_override boolean;
  v_resolved_at timestamptz;
  v_affected integer;
begin
  if p_reviewed_by is null or pg_catalog.btrim(p_reviewed_by) = '' then
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
    and nullif(pg_catalog.btrim(p_review_notes), '') is null then
    raise exception 'An administrator message is required for rejection';
  end if;

  select report_group.match_id
  into v_match_id
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
    and report_group.match_id = v_match.id
  for update;

  if not found
    or v_group.finalized_at is not null
    or v_group.status not in (
      'pending_confirmation',
      'disputed',
      'under_review'
    ) then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Admin review is stale';
  end if;

  select report_group.id
  into v_active_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = v_match.id
    and report_group.finalized_at is null
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_active_group_id is distinct from v_group.id then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: this is no longer the authoritative active report group';
  end if;

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Match already has an authoritative outcome';
  end if;

  v_has_override :=
    p_player_one_score is not null
    or p_player_two_score is not null
    or p_winner_registration_id is not null;

  if v_group.result_type = 'no_show' and v_has_override then
    raise exception
      'No-show reports cannot be score-overridden. Reject the no-show first, then use the normal result workflow.';
  end if;

  if p_decision = 'under_review' then
    update public.match_result_report_groups
    set
      status = 'under_review',
      reviewed_by = p_reviewed_by,
      reviewed_at = pg_catalog.now(),
      review_notes = nullif(pg_catalog.btrim(p_review_notes), '')
    where id = p_report_group_id
      and finalized_at is null
      and status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      );

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using
        errcode = '40001',
        message = 'Match result conflict: the Admin review was not applied';
    end if;
    return;
  end if;

  if p_decision in ('rejected', 'reset') then
    v_resolved_at := pg_catalog.clock_timestamp();

    update public.match_result_report_groups
    set
      status = p_decision,
      no_show_status = case
        when result_type = 'no_show' then 'rejected'
        else no_show_status
      end,
      no_show_resolved_at = case
        when result_type = 'no_show' then pg_catalog.now()
        else no_show_resolved_at
      end,
      no_show_resolved_by = case
        when result_type = 'no_show' then p_reviewed_by
        else no_show_resolved_by
      end,
      reviewed_by = p_reviewed_by,
      reviewed_at = pg_catalog.now(),
      review_notes = coalesce(
        nullif(pg_catalog.btrim(p_review_notes), ''),
        case
          when p_decision = 'reset'
            then 'Result report group was reset by an administrator.'
          else review_notes
        end
      ),
      finalized_at = pg_catalog.now(),
      finalized_source = case
        when p_decision = 'reset' then 'reset'
        else 'admin_approval'
      end
    where id = p_report_group_id
      and finalized_at is null
      and status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      );

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using
        errcode = '40001',
        message = 'Match result conflict: the Admin decision was not applied';
    end if;

    update public.match_result_submissions
    set
      status = 'rejected',
      reviewed_by = p_reviewed_by,
      review_notes = coalesce(
        nullif(pg_catalog.btrim(p_review_notes), ''),
        case
          when p_decision = 'reset'
            then 'Result report group was reset by an administrator.'
          else review_notes
        end
      ),
      reviewed_at = pg_catalog.now()
    where report_group_id = p_report_group_id;

    update public.tournament_matches
    set status = 'scheduled'
    where id = v_group.match_id
      and status = 'pending_review'
      and (
        p_decision = 'reset'
        or not exists (
          select 1
          from public.match_result_submissions as submission
          where submission.match_id = v_group.match_id
            and submission.status = 'pending'
        )
      );

    update public.tournament_matches
    set
      status = 'in_progress',
      deadline_at = deadline_at + greatest(
        interval '0 seconds',
        v_resolved_at - v_group.created_at
      )
    where id = v_group.match_id
      and status = 'scheduled'
      and activation_version > 0
      and deadline_at is not null
      and outcome_type is null;

    if not found then
      perform public.activate_tournament_match_if_ready(v_group.match_id, false);
    end if;
    return;
  end if;

  update public.match_result_report_groups
  set
    player_one_score = coalesce(p_player_one_score, player_one_score),
    player_two_score = coalesce(p_player_two_score, player_two_score),
    winner_registration_id = coalesce(
      p_winner_registration_id,
      winner_registration_id
    )
  where id = p_report_group_id
    and finalized_at is null
    and status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    );

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Admin approval was not applied';
  end if;

  perform public.finalize_match_result_report_group(
    p_report_group_id,
    'approved',
    case when v_has_override then 'admin_override' else 'admin_approval' end,
    p_reviewed_by,
    p_review_notes
  );
end;
$$;

alter function public.admin_finalize_match_result_report_group(
  uuid, text, text, text, integer, integer, uuid
) owner to postgres;
revoke all on function public.admin_finalize_match_result_report_group(
  uuid, text, text, text, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.admin_finalize_match_result_report_group(
  uuid, text, text, text, integer, integer, uuid
) to service_role;

-- The legacy ungrouped review remains reachable for historical submissions.
-- Its private core still asks for Submission then Match, so this public wrapper
-- acquires both locks in the canonical order before entering that reentrant
-- core and preserves the existing deadline-restoration behavior.
create or replace function public.review_match_series_result(
  p_submission_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match_id uuid;
  v_submission public.match_result_submissions%rowtype;
  v_match public.tournament_matches%rowtype;
  v_review_started_at timestamptz;
  v_resolved_at timestamptz;
begin
  select submission.match_id
  into v_match_id
  from public.match_result_submissions as submission
  where submission.id = p_submission_id;

  if not found then
    raise exception 'Match result submission not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select submission.*
  into v_submission
  from public.match_result_submissions as submission
  where submission.id = p_submission_id
    and submission.match_id = v_match.id
  for update;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the legacy submission changed before review';
  end if;

  select pg_catalog.min(submission.created_at)
  into v_review_started_at
  from public.match_result_submissions as submission
  where submission.match_id = v_submission.match_id
    and submission.status = 'pending'
    and submission.report_group_id is null;

  perform public.review_match_series_result_without_deadline_restore(
    p_submission_id,
    p_decision,
    p_reviewed_by,
    p_review_notes
  );

  if p_decision not in ('rejected', 'resubmission_requested') then
    return;
  end if;

  v_resolved_at := pg_catalog.clock_timestamp();

  update public.tournament_matches
  set
    status = 'in_progress',
    deadline_at = deadline_at + greatest(
      interval '0 seconds',
      v_resolved_at - coalesce(v_review_started_at, v_resolved_at)
    )
  where id = v_submission.match_id
    and status = 'scheduled'
    and activation_version > 0
    and deadline_at is not null
    and outcome_type is null;

  if not found then
    perform public.activate_tournament_match_if_ready(
      v_submission.match_id,
      false
    );
  end if;
end;
$$;

alter function public.review_match_series_result(uuid, text, text, text)
  owner to postgres;
revoke all on function public.review_match_series_result(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.review_match_series_result(
  uuid, text, text, text
) to service_role;

create or replace function public.apply_admin_official_match_result(
  p_match_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_winner_registration_id uuid,
  p_decided_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_active_group_id uuid;
  v_affected integer;
begin
  if p_decided_by is null or pg_catalog.btrim(p_decided_by) = '' then
    raise exception 'Deciding administrator is required';
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
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the Match already has an authoritative outcome';
  end if;

  select report_group.id
  into v_active_group_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = v_match.id
    and report_group.finalized_at is null
    and report_group.status in (
      'pending_confirmation',
      'disputed',
      'under_review'
    )
  order by report_group.created_at, report_group.id
  limit 1
  for update;

  if v_active_group_id is not null then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: adjudicate the active report group before entering a direct official result';
  end if;

  perform 1
  from public.match_result_submissions as submission
  where submission.match_id = v_match.id
  order by submission.id
  for update;

  perform public.apply_official_match_result(
    p_match_id,
    p_player_one_score,
    p_player_two_score,
    p_winner_registration_id,
    p_decided_by
  );

  update public.tournament_matches
  set
    official_result_submission_id = null,
    official_result_decided_by = p_decided_by,
    official_result_decided_at = pg_catalog.now()
  where id = p_match_id
    and status = 'completed'
    and winner_registration_id = p_winner_registration_id
    and player_one_score = p_player_one_score
    and player_two_score = p_player_two_score;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'Match result conflict: the direct official result was not applied consistently';
  end if;
end;
$$;

alter function public.apply_admin_official_match_result(
  uuid, integer, integer, uuid, text
) owner to postgres;
revoke all on function public.apply_admin_official_match_result(
  uuid, integer, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_admin_official_match_result(
  uuid, integer, integer, uuid, text
) to service_role;

create or replace function public.auto_approve_expired_match_result_groups(
  batch_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group_id uuid;
  v_match_id uuid;
  v_group public.match_result_report_groups%rowtype;
  v_approved_count integer := 0;
  v_batch_limit integer;
begin
  v_batch_limit := greatest(
    1,
    least(coalesce(batch_limit, 50), 500)
  );

  -- Candidate discovery is intentionally unlocked. Finalization acquires the
  -- Match first and revalidates the report group under the fixed lock order.
  for v_group_id in
    select report_group.id
    from public.match_result_report_groups as report_group
    join public.tournament_matches as match
      on match.id = report_group.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where report_group.status = 'pending_confirmation'
      and report_group.confirmation_deadline_at <= pg_catalog.now()
      and report_group.finalized_at is null
      and match.status <> 'completed'
      and match.official_result_submission_id is null
    order by report_group.confirmation_deadline_at, report_group.created_at
    limit v_batch_limit
  loop
    begin
      perform public.finalize_match_result_report_group(
        v_group_id,
        'auto_approved',
        'cron_auto_approval',
        'system:cron',
        'Automatically approved after the opponent confirmation window expired.'
      );
      v_approved_count := v_approved_count + 1;
    exception
      when serialization_failure then
        -- Another authoritative action won the race. It owns the outcome.
        null;
      when others then
        -- Preserve the prior fail-safe, but acquire Match before report group.
        select report_group.match_id
        into v_match_id
        from public.match_result_report_groups as report_group
        where report_group.id = v_group_id;

        if found then
          perform 1
          from public.tournament_matches as match
          where match.id = v_match_id
          for update;

          select report_group.*
          into v_group
          from public.match_result_report_groups as report_group
          where report_group.id = v_group_id
            and report_group.match_id = v_match_id
          for update;

          if found
            and v_group.status = 'pending_confirmation'
            and v_group.finalized_at is null then
            update public.match_result_report_groups
            set
              status = 'under_review',
              reviewed_by = 'system:cron',
              reviewed_at = pg_catalog.now(),
              review_notes =
                'Automatic approval failed and requires administrator review: '
                || pg_catalog.left(sqlerrm, 1000)
            where id = v_group_id
              and status = 'pending_confirmation'
              and finalized_at is null;
          end if;
        end if;
    end;
  end loop;

  return v_approved_count;
end;
$$;

alter function public.auto_approve_expired_match_result_groups(integer)
  owner to postgres;
revoke all on function public.auto_approve_expired_match_result_groups(integer)
  from public, anon, authenticated;
grant execute on function public.auto_approve_expired_match_result_groups(integer)
  to service_role;

-- IC-AUD-003: the durable notification row is part of the same transaction as
-- its authoritative report-group insert/finalization/dispute. Any notification
-- or queue-enrollment failure aborts the transition instead of returning a
-- false success that cannot be retried.
create or replace function
  public.sync_match_confirmation_required_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_opponent_clerk_user_id text;
  v_opponent_registration_id uuid;
  v_opponent_name text;
  v_submitter_clerk_user_id text;
  v_submitter_registration_id uuid;
  v_submitter_name text;
  v_disputer_name text;
  v_tournament_title text;
  v_match_number integer;
  v_round_name text;
  v_action_event_key text;
  v_dispute_event_key text;
  v_response_event_key text;
begin
  if new.result_type not in ('normal', 'no_show') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_confirmation'
      or new.finalized_at is not null then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from 'pending_confirmation'
      or (
        new.status is not distinct from 'pending_confirmation'
        and new.finalized_at is null
      ) then
      return new;
    end if;
  else
    return new;
  end if;

  select
    opponent.clerk_user_id,
    opponent.id,
    coalesce(
      nullif(pg_catalog.btrim(opponent.player_name), ''),
      'A player'
    ),
    submitter.clerk_user_id,
    submitter.id,
    coalesce(
      nullif(pg_catalog.btrim(submitter.player_name), ''),
      'A player'
    ),
    coalesce(
      nullif(pg_catalog.btrim(disputer.player_name), ''),
      nullif(pg_catalog.btrim(opponent.player_name), ''),
      'A player'
    ),
    tournament.title,
    match.match_number,
    round.name
  into
    v_opponent_clerk_user_id,
    v_opponent_registration_id,
    v_opponent_name,
    v_submitter_clerk_user_id,
    v_submitter_registration_id,
    v_submitter_name,
    v_disputer_name,
    v_tournament_title,
    v_match_number,
    v_round_name
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  join public.bracket_rounds as round
    on round.id = match.round_id
    and round.generated_bracket_id = generated.id
  join public.registrations as submitter
    on submitter.id = new.submitted_by_registration_id
  join public.registrations as opponent
    on opponent.id = new.opponent_registration_id
  left join public.registrations as disputer
    on disputer.id = new.disputed_by_registration_id
  where match.id = new.match_id
    and tournament.id = new.tournament_id
    and submitter.id in (
      match.player_one_registration_id,
      match.player_two_registration_id
    )
    and opponent.id in (
      match.player_one_registration_id,
      match.player_two_registration_id
    )
    and submitter.id <> opponent.id;

  if not found then
    raise exception 'Match workflow notification context is invalid';
  end if;

  v_action_event_key := pg_catalog.format(
    case
      when new.result_type = 'normal'
        then 'match:%s:report-group:%s:confirmation-required'
      else 'match:%s:report-group:%s:no-show-reported'
    end,
    new.match_id,
    new.id
  );

  if tg_op = 'INSERT' then
    if nullif(pg_catalog.btrim(v_opponent_clerk_user_id), '') is null
      or v_opponent_clerk_user_id like 'deleted:%'
      or v_opponent_clerk_user_id = new.submitted_by_clerk_user_id then
      return new;
    end if;

    if new.result_type = 'normal' then
      insert into public.notifications (
        recipient_clerk_user_id,
        recipient_role,
        type,
        title,
        message,
        actor_clerk_user_id,
        actor_display_name,
        tournament_id,
        tournament_title,
        registration_id,
        match_id,
        report_group_id,
        event_key,
        metadata
      ) values (
        v_opponent_clerk_user_id,
        'player',
        'match.confirmation_required',
        'Match result needs confirmation',
        pg_catalog.format(
          'A result was submitted for Match #%s. Confirm or dispute it before the deadline.',
          v_match_number
        ),
        new.submitted_by_clerk_user_id,
        v_submitter_name,
        new.tournament_id,
        v_tournament_title,
        v_opponent_registration_id,
        new.match_id,
        new.id,
        v_action_event_key,
        pg_catalog.jsonb_build_object(
          'deadlineAt', new.confirmation_deadline_at,
          'matchNumber', v_match_number,
          'reportedScore', pg_catalog.format(
            '%s-%s',
            new.player_one_score,
            new.player_two_score
          ),
          'resultType', 'normal',
          'roundName', v_round_name
        )
      )
      on conflict (recipient_clerk_user_id, event_key)
        where event_key is not null
      do nothing;
    else
      insert into public.notifications (
        recipient_clerk_user_id,
        recipient_role,
        type,
        title,
        message,
        actor_clerk_user_id,
        actor_display_name,
        tournament_id,
        tournament_title,
        registration_id,
        match_id,
        report_group_id,
        event_key,
        metadata
      ) values (
        v_opponent_clerk_user_id,
        'player',
        'match.no_show_reported',
        'No-Show Reported',
        pg_catalog.format(
          '%s reported you as a no-show for Match #%s. Confirm or dispute before the deadline.',
          v_submitter_name,
          v_match_number
        ),
        null,
        v_submitter_name,
        new.tournament_id,
        v_tournament_title,
        v_opponent_registration_id,
        new.match_id,
        new.id,
        v_action_event_key,
        pg_catalog.jsonb_build_object(
          'roundName', v_round_name,
          'matchNumber', v_match_number,
          'resultType', 'no_show',
          'noShowRegistrationId', new.no_show_registration_id,
          'noShowPlayerName', v_opponent_name
        )
      )
      on conflict (recipient_clerk_user_id, event_key)
        where event_key is not null
      do nothing;
    end if;

    return new;
  end if;

  update public.notifications as notification
  set read_at = coalesce(
    notification.read_at,
    pg_catalog.clock_timestamp()
  )
  where notification.recipient_clerk_user_id = v_opponent_clerk_user_id
    and notification.match_id = new.match_id
    and notification.report_group_id = new.id
    and notification.event_key = v_action_event_key
    and notification.type = case
      when new.result_type = 'normal' then 'match.confirmation_required'
      else 'match.no_show_reported'
    end;

  if new.status = 'disputed' then
    v_dispute_event_key := pg_catalog.format(
      'match:%s:report-group:%s:dispute-opened',
      new.match_id,
      new.id
    );

    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      actor_clerk_user_id,
      actor_display_name,
      tournament_id,
      tournament_title,
      match_id,
      report_group_id,
      event_key,
      metadata
    ) values (
      null,
      'admin',
      case
        when new.result_type = 'no_show'
          then 'match.no_show_disputed'
        else 'match.dispute_opened'
      end,
      case
        when new.result_type = 'no_show'
          then 'New No-Show Dispute'
        else 'New Match Dispute'
      end,
      pg_catalog.format(
        '%s opened a %s for Match #%s.',
        v_disputer_name,
        case
          when new.result_type = 'no_show' then 'no-show dispute'
          else 'dispute'
        end,
        v_match_number
      ),
      null,
      v_disputer_name,
      new.tournament_id,
      v_tournament_title,
      new.match_id,
      new.id,
      v_dispute_event_key,
      pg_catalog.jsonb_build_object(
        'roundName', v_round_name,
        'matchNumber', v_match_number,
        'reportedScore', pg_catalog.format(
          '%s-%s',
          new.player_one_score,
          new.player_two_score
        ),
        'resultType', new.result_type,
        'noShowRegistrationId', new.no_show_registration_id
      )
    )
    on conflict do nothing;
  end if;

  if new.result_type = 'no_show'
    and (
      new.status = 'disputed'
      or (
        new.status = 'confirmed'
        and new.finalized_source = 'opponent_confirmation'
      )
    )
    and nullif(pg_catalog.btrim(v_submitter_clerk_user_id), '') is not null
    and v_submitter_clerk_user_id not like 'deleted:%' then
    v_response_event_key := pg_catalog.format(
      'match:%s:report-group:%s:response:%s',
      new.match_id,
      new.id,
      case when new.status = 'confirmed' then 'confirmed' else 'disputed' end
    );

    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      actor_clerk_user_id,
      actor_display_name,
      tournament_id,
      tournament_title,
      registration_id,
      match_id,
      report_group_id,
      event_key,
      metadata
    ) values (
      v_submitter_clerk_user_id,
      'player',
      case
        when new.status = 'confirmed'
          then 'match.no_show_confirmed'
        else 'match.no_show_disputed'
      end,
      case
        when new.status = 'confirmed'
          then 'No-Show Confirmed'
        else 'No-Show Disputed'
      end,
      case
        when new.status = 'confirmed' then pg_catalog.format(
          'Your no-show report for Match #%s was confirmed.',
          v_match_number
        )
        else pg_catalog.format(
          'Your no-show report for Match #%s was disputed and now requires administrator review.',
          v_match_number
        )
      end,
      null,
      v_opponent_name,
      new.tournament_id,
      v_tournament_title,
      v_submitter_registration_id,
      new.match_id,
      new.id,
      v_response_event_key,
      pg_catalog.jsonb_build_object(
        'roundName', v_round_name,
        'matchNumber', v_match_number,
        'resultType', 'no_show',
        'noShowRegistrationId', new.no_show_registration_id,
        'decision', case
          when new.status = 'confirmed' then 'confirmed'
          else 'disputed'
        end
      )
    )
    on conflict (recipient_clerk_user_id, event_key)
      where event_key is not null
    do nothing;
  end if;

  return new;
end;
$$;

alter function public.sync_match_confirmation_required_notification()
  owner to postgres;
revoke all on function public.sync_match_confirmation_required_notification()
  from public, anon, authenticated, service_role;

comment on function public.sync_match_confirmation_required_notification() is
  'Creates and resolves canonical result, no-show, and dispute workflow notifications in the authoritative report-group transaction.';

commit;
