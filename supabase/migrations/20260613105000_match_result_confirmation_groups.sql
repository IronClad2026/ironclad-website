begin;

create table if not exists public.match_result_report_groups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.tournament_matches(id) on delete cascade,
  tournament_id uuid not null
    references public.tournaments(id) on delete cascade,
  submitted_by_clerk_user_id text not null,
  submitted_by_registration_id uuid not null
    references public.registrations(id),
  opponent_registration_id uuid not null
    references public.registrations(id),
  winner_registration_id uuid not null
    references public.registrations(id),
  player_one_score integer not null check (player_one_score >= 0),
  player_two_score integer not null check (player_two_score >= 0),
  replay_storage_path text,
  status text not null default 'pending_confirmation',
  confirmation_deadline_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_by_registration_id uuid
    references public.registrations(id),
  disputed_at timestamptz,
  disputed_by_registration_id uuid
    references public.registrations(id),
  dispute_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  finalized_at timestamptz,
  finalized_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_result_report_groups_status_check
    check (
      status in (
        'pending_confirmation',
        'confirmed',
        'auto_approved',
        'disputed',
        'under_review',
        'approved',
        'rejected',
        'reset'
      )
    ),
  constraint match_result_report_groups_finalized_source_check
    check (
      finalized_source is null
      or finalized_source in (
        'opponent_confirmation',
        'cron_auto_approval',
        'admin_approval',
        'admin_override',
        'reset'
      )
    ),
  constraint match_result_report_groups_distinct_players_check
    check (submitted_by_registration_id <> opponent_registration_id),
  constraint match_result_report_groups_non_tied_score_check
    check (player_one_score <> player_two_score)
);

alter table public.match_result_submissions
  add column if not exists report_group_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_result_submissions_report_group_id_fkey'
  ) then
    alter table public.match_result_submissions
      add constraint match_result_submissions_report_group_id_fkey
      foreign key (report_group_id)
      references public.match_result_report_groups(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists match_result_report_groups_match_idx
  on public.match_result_report_groups(match_id);
create index if not exists match_result_report_groups_tournament_idx
  on public.match_result_report_groups(tournament_id);
create index if not exists match_result_report_groups_status_idx
  on public.match_result_report_groups(status);
create index if not exists match_result_report_groups_deadline_idx
  on public.match_result_report_groups(confirmation_deadline_at);
create index if not exists match_result_report_groups_opponent_idx
  on public.match_result_report_groups(opponent_registration_id);
create index if not exists match_result_report_groups_submitter_idx
  on public.match_result_report_groups(submitted_by_registration_id);

create unique index if not exists
  match_result_report_groups_one_active_per_match
  on public.match_result_report_groups(match_id)
  where status in (
    'pending_confirmation',
    'disputed',
    'under_review'
  );

create index if not exists match_result_submissions_report_group_idx
  on public.match_result_submissions(report_group_id);

drop trigger if exists match_result_report_groups_set_updated_at
  on public.match_result_report_groups;
create trigger match_result_report_groups_set_updated_at
before update on public.match_result_report_groups
for each row execute function public.ironclad_set_updated_at();

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
  player_two_score
on public.match_result_report_groups
for each row
execute function public.validate_match_result_report_group();

alter table public.match_result_report_groups enable row level security;

drop policy if exists "Participants can read match result report groups"
  on public.match_result_report_groups;
create policy "Participants can read match result report groups"
on public.match_result_report_groups
for select
to authenticated
using (
  submitted_by_clerk_user_id =
    coalesce(auth.jwt()->>'sub', auth.jwt()->>'user_id')
  or exists (
    select 1
    from public.registrations as registration
    where registration.id in (
      match_result_report_groups.submitted_by_registration_id,
      match_result_report_groups.opponent_registration_id
    )
      and registration.clerk_user_id =
        coalesce(auth.jwt()->>'sub', auth.jwt()->>'user_id')
  )
);

grant select on public.match_result_report_groups to authenticated;
grant all on public.match_result_report_groups to service_role;

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
    finalized_source = p_finalized_source
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

create or replace function public.confirm_match_result_report_group(
  p_report_group_id uuid,
  p_confirmed_by_clerk_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_confirmer_registration_id uuid;
begin
  if p_confirmed_by_clerk_user_id is null
    or btrim(p_confirmed_by_clerk_user_id) = '' then
    raise exception 'Confirming player is required';
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
  into v_confirmer_registration_id
  from public.registrations as registration
  where registration.id = v_group.opponent_registration_id
    and registration.clerk_user_id = p_confirmed_by_clerk_user_id;

  if v_confirmer_registration_id is null then
    raise exception 'Only the opponent can confirm this result';
  end if;

  perform public.finalize_match_result_report_group(
    p_report_group_id,
    'confirmed',
    'opponent_confirmation',
    p_confirmed_by_clerk_user_id,
    null
  );

  update public.match_result_report_groups
  set
    confirmed_at = now(),
    confirmed_by_registration_id = v_confirmer_registration_id
  where id = p_report_group_id;
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

  v_has_override :=
    p_player_one_score is not null
    or p_player_two_score is not null
    or p_winner_registration_id is not null;

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

create or replace function public.auto_approve_expired_match_result_groups(
  batch_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_approved_count integer := 0;
  v_batch_limit integer;
begin
  v_batch_limit := greatest(1, least(coalesce(batch_limit, 50), 500));

  for v_group_id in
    select report_group.id
    from public.match_result_report_groups as report_group
    join public.tournament_matches as match
      on match.id = report_group.match_id
    where report_group.status = 'pending_confirmation'
      and report_group.confirmation_deadline_at <= now()
      and report_group.finalized_at is null
      and match.status <> 'completed'
      and match.official_result_submission_id is null
    order by report_group.confirmation_deadline_at, report_group.created_at
    limit v_batch_limit
    for update of report_group skip locked
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
    exception when others then
      update public.match_result_report_groups
      set
        status = 'under_review',
        reviewed_by = 'system:cron',
        reviewed_at = now(),
        review_notes =
          'Automatic approval failed and requires administrator review: '
          || left(sqlerrm, 1000)
      where id = v_group_id
        and status = 'pending_confirmation'
        and finalized_at is null;
    end;
  end loop;

  return v_approved_count;
end;
$$;

revoke all on function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
  text
) from public;
grant execute on function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
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

revoke all on function public.confirm_match_result_report_group(
  uuid,
  text
) from public;
grant execute on function public.confirm_match_result_report_group(
  uuid,
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

revoke all on function public.auto_approve_expired_match_result_groups(integer)
  from public;
grant execute on function public.auto_approve_expired_match_result_groups(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception when others then
    raise notice
      'pg_cron extension was not enabled automatically: %',
      sqlerrm;
  end;

  if to_regnamespace('cron') is null then
    raise notice
      'pg_cron cron schema is unavailable. Enable pg_cron in Supabase and schedule: select public.auto_approve_expired_match_result_groups(50);';
    return;
  end if;

  for v_job_id in
    execute
      'select jobid from cron.job where jobname = $1'
    using 'ironclad-auto-approve-match-result-groups'
  loop
    execute 'select cron.unschedule($1)' using v_job_id;
  end loop;

  execute
    'select cron.schedule($1, $2, $3)'
  using
    'ironclad-auto-approve-match-result-groups',
    '* * * * *',
    'select public.auto_approve_expired_match_result_groups(50);';
exception when others then
  raise notice
    'pg_cron auto-approval job was not scheduled automatically: %',
    sqlerrm;
end;
$$;

commit;
