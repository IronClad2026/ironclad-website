begin;

create function public.match_replay_attempt_paths_are_valid(
  p_match_id uuid,
  p_attempt_id uuid,
  p_paths text[]
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_index integer;
begin
  if cardinality(p_paths) <> 5
    or array_position(p_paths, null) is not null
    or (
      select count(distinct replay.path)
      from unnest(p_paths) as replay(path)
    ) <> 5 then
    return false;
  end if;

  for v_index in 1..5 loop
    if p_paths[v_index] !~ (
      '^' || p_match_id::text || '/' || p_attempt_id::text
      || '/game-' || v_index::text
      || '-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}'
      || '-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.rec$'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter function public.match_replay_attempt_paths_are_valid(uuid, uuid, text[])
  owner to postgres;
revoke all on function public.match_replay_attempt_paths_are_valid(
  uuid, uuid, text[]
) from public, anon, authenticated, service_role;

create function public.match_replay_attempt_sizes_are_valid(p_sizes integer[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select cardinality(p_sizes) between 1 and 5
    and array_position(p_sizes, null) is null
    and not exists (
      select 1
      from unnest(p_sizes) as replay(size)
      where replay.size < 1 or replay.size > 10485760
    );
$$;

alter function public.match_replay_attempt_sizes_are_valid(integer[])
  owner to postgres;
revoke all on function public.match_replay_attempt_sizes_are_valid(integer[])
  from public, anon, authenticated, service_role;

create table public.match_replay_upload_attempts (
  id uuid primary key,
  match_id uuid not null
    references public.tournament_matches(id) on delete restrict,
  submitting_registration_id uuid not null
    references public.registrations(id) on delete restrict,
  winner_registration_id uuid not null
    references public.registrations(id) on delete restrict,
  player_one_score smallint not null check (player_one_score >= 0),
  player_two_score smallint not null check (player_two_score >= 0),
  required_replay_count smallint not null
    check (required_replay_count between 1 and 5),
  replay_storage_paths text[] not null,
  declared_replay_sizes integer[] not null,
  status text not null
    check (status in (
      'prepared',
      'finalizing',
      'cleaning',
      'cleaned',
      'recycling',
      'committed'
    )),
  capability_issued_at timestamptz not null,
  capability_not_before_reuse_at timestamptz not null,
  capability_issue_count integer not null default 1
    check (capability_issue_count >= 1),
  finalization_claim_id uuid,
  finalization_lease_expires_at timestamptz,
  cleanup_claim_id uuid,
  cleanup_lease_expires_at timestamptz,
  recycle_claim_id uuid,
  recycle_lease_expires_at timestamptz,
  committed_report_group_id uuid
    references public.match_result_report_groups(id) on delete restrict,
  committed_result jsonb,
  committed_at timestamptz,
  cleaned_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (player_one_score <> player_two_score),
  check (player_one_score + player_two_score = required_replay_count),
  check (cardinality(declared_replay_sizes) = required_replay_count),
  check (public.match_replay_attempt_sizes_are_valid(declared_replay_sizes)),
  check (public.match_replay_attempt_paths_are_valid(match_id, id, replay_storage_paths)),
  check (capability_not_before_reuse_at > capability_issued_at),
  check (
    (status = 'finalizing'
      and finalization_claim_id is not null
      and finalization_lease_expires_at is not null)
    or
    (status <> 'finalizing'
      and finalization_claim_id is null
      and finalization_lease_expires_at is null)
  ),
  check (
    (status = 'cleaning'
      and cleanup_claim_id is not null
      and cleanup_lease_expires_at is not null)
    or
    (status <> 'cleaning'
      and cleanup_claim_id is null
      and cleanup_lease_expires_at is null)
  ),
  check (
    (status = 'recycling'
      and recycle_claim_id is not null
      and recycle_lease_expires_at is not null)
    or
    (status <> 'recycling'
      and recycle_claim_id is null
      and recycle_lease_expires_at is null)
  ),
  check (
    (status = 'committed'
      and committed_report_group_id is not null
      and committed_result is not null
      and committed_at is not null)
    or
    (status <> 'committed'
      and committed_report_group_id is null
      and committed_result is null
      and committed_at is null)
  ),
  check (
    (status = 'cleaned' and cleaned_at is not null)
    or
    (status <> 'cleaned' and cleaned_at is null)
  )
);

create unique index match_replay_upload_attempts_one_active_idx
  on public.match_replay_upload_attempts(match_id, submitting_registration_id)
  where status in ('prepared', 'finalizing', 'cleaning', 'recycling');

create index match_replay_upload_attempts_match_owner_idx
  on public.match_replay_upload_attempts(
    match_id,
    submitting_registration_id,
    created_at desc
  );

create unique index match_replay_upload_attempts_committed_group_idx
  on public.match_replay_upload_attempts(committed_report_group_id)
  where committed_report_group_id is not null;

alter table public.match_replay_upload_attempts enable row level security;
alter table public.match_replay_upload_attempts force row level security;
alter table public.match_replay_upload_attempts owner to postgres;

revoke all on table public.match_replay_upload_attempts
  from public, anon, authenticated, service_role;
grant select on table public.match_replay_upload_attempts to service_role;

create function public.claim_match_replay_attempt_finalization(
  p_attempt_id uuid,
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_launched_at timestamptz;
  v_claim_id uuid;
  v_now timestamptz := clock_timestamp();
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

  select bracket.tournament_id, bracket.launched_at
  into v_tournament_id, v_launched_at
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where match.id = v_match.id;

  if not found then
    raise exception 'Tournament bracket not found';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.match_id = p_match_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = v_attempt.submitting_registration_id
      and registration.clerk_user_id = p_submitted_by_clerk_user_id
  ) then
    raise exception 'Player does not own this replay attempt';
  end if;

  if p_winner_registration_id is distinct from v_attempt.winner_registration_id
    or p_player_one_score is distinct from v_attempt.player_one_score
    or p_player_two_score is distinct from v_attempt.player_two_score then
    raise exception 'Final result does not match this replay attempt';
  end if;

  if v_attempt.status = 'committed' then
    return jsonb_build_object(
      'outcome', 'committed',
      'report', v_attempt.committed_result,
      'winner_registration_id', v_attempt.winner_registration_id,
      'player_one_score', v_attempt.player_one_score,
      'player_two_score', v_attempt.player_two_score,
      'required_replay_count', v_attempt.required_replay_count
    );
  end if;

  if v_attempt.status = 'finalizing'
    and v_attempt.finalization_lease_expires_at > v_now then
    raise exception 'Replay finalization is already in progress';
  end if;

  if v_attempt.status not in ('prepared', 'finalizing') then
    raise exception 'Replay attempt is not available for finalization';
  end if;

  if v_launched_at is null then
    raise exception 'This tournament match is not open for replay submission';
  end if;

  perform public.assert_tournament_not_terminal(v_tournament_id);

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null then
    raise exception 'This match already has an official result';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null
    or v_attempt.submitting_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) or v_attempt.winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Replay attempt no longer matches this match';
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
  ) or exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
      and submission.report_group_id is null
  ) then
    raise exception 'This match already has active result activity';
  end if;

  v_claim_id := gen_random_uuid();
  update public.match_replay_upload_attempts as attempt
  set
    status = 'finalizing',
    finalization_claim_id = v_claim_id,
    finalization_lease_expires_at = v_now + interval '10 minutes',
    updated_at = v_now
  where attempt.id = v_attempt.id;

  return jsonb_build_object(
    'outcome', 'claimed',
    'claim_id', v_claim_id,
    'replay_storage_paths',
      to_jsonb(v_attempt.replay_storage_paths[1:v_attempt.required_replay_count]),
    'winner_registration_id', v_attempt.winner_registration_id,
    'player_one_score', v_attempt.player_one_score,
    'player_two_score', v_attempt.player_two_score,
    'required_replay_count', v_attempt.required_replay_count
  );
end;
$$;

create function public.claim_match_replay_attempt_cleanup(
  p_attempt_id uuid,
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_finalization_claim_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_cleanup_claim_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  perform 1
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.match_id = p_match_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = ''
    or not exists (
      select 1
      from public.registrations as registration
      where registration.id = v_attempt.submitting_registration_id
        and registration.clerk_user_id = p_submitted_by_clerk_user_id
    )
  then
    raise exception 'Player does not own this replay attempt';
  end if;

  if v_attempt.status = 'committed' then
    return jsonb_build_object('outcome', 'preserved');
  end if;

  if v_attempt.status = 'cleaned' then
    return jsonb_build_object('outcome', 'cleaned');
  end if;

  if v_attempt.status = 'finalizing' and not (
    p_finalization_claim_id is not null
    and v_attempt.finalization_claim_id = p_finalization_claim_id
  ) and v_attempt.finalization_lease_expires_at > v_now then
    raise exception 'Replay finalization owns this attempt';
  end if;

  if p_finalization_claim_id is not null and (
    v_attempt.status <> 'finalizing'
    or v_attempt.finalization_claim_id <> p_finalization_claim_id
  ) then
    raise exception 'Replay finalization claim no longer owns this attempt';
  end if;

  if v_attempt.status = 'cleaning'
    and v_attempt.cleanup_lease_expires_at > v_now then
    raise exception 'Replay cleanup is already in progress';
  end if;

  if v_attempt.status not in ('prepared', 'finalizing', 'cleaning') then
    raise exception 'Replay attempt is not available for cleanup';
  end if;

  v_cleanup_claim_id := gen_random_uuid();
  update public.match_replay_upload_attempts as attempt
  set
    status = 'cleaning',
    finalization_claim_id = null,
    finalization_lease_expires_at = null,
    cleanup_claim_id = v_cleanup_claim_id,
    cleanup_lease_expires_at = v_now + interval '5 minutes',
    updated_at = v_now
  where attempt.id = v_attempt.id;

  return jsonb_build_object(
    'outcome', 'claimed',
    'cleanup_claim_id', v_cleanup_claim_id,
    'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
  );
end;
$$;

create function public.complete_match_replay_attempt_cleanup(
  p_attempt_id uuid,
  p_cleanup_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if v_attempt.status = 'cleaned' then
    return false;
  end if;

  if v_attempt.status <> 'cleaning'
    or v_attempt.cleanup_claim_id <> p_cleanup_claim_id then
    raise exception 'Replay cleanup claim no longer owns this attempt';
  end if;

  update public.match_replay_upload_attempts as attempt
  set
    status = 'cleaned',
    cleanup_claim_id = null,
    cleanup_lease_expires_at = null,
    cleaned_at = v_now,
    updated_at = v_now
  where attempt.id = v_attempt.id;

  return true;
end;
$$;

create function public.prepare_match_replay_upload_attempt(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_declared_replay_sizes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_launched_at timestamptz;
  v_reporter_registration_id uuid;
  v_required_replay_count integer;
  v_wins_required integer;
  v_winner_score integer;
  v_loser_score integer;
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_attempt_id uuid;
  v_paths text[] := array[]::text[];
  v_cleanup_claim_id uuid;
  v_recycle_claim_id uuid;
  v_noncommitted_count integer;
  v_earliest_reuse_at timestamptz;
  v_index integer;
  v_now timestamptz := clock_timestamp();
  v_retry_after integer;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
  end if;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score < 0
    or p_player_two_score < 0
    or p_player_one_score = p_player_two_score then
    raise exception 'Enter a valid non-tied final score';
  end if;

  v_required_replay_count := p_player_one_score + p_player_two_score;
  if p_declared_replay_sizes is null
    or v_required_replay_count not between 1 and 5
    or cardinality(p_declared_replay_sizes) <> v_required_replay_count
    or not public.match_replay_attempt_sizes_are_valid(p_declared_replay_sizes) then
    raise exception 'Replay upload sizes do not match the final score';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'This tournament match is not open for replay submission';
  end if;

  select bracket.tournament_id, bracket.launched_at
  into v_tournament_id, v_launched_at
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where match.id = v_match.id;

  if not found or v_launched_at is null then
    raise exception 'This tournament match is not open for replay submission';
  end if;

  perform public.assert_tournament_not_terminal(v_tournament_id);

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

  if v_winner_score <> v_wins_required or v_loser_score >= v_wins_required then
    raise exception 'The final score is invalid for this series';
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
  ) or exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
      and submission.report_group_id is null
  ) then
    raise exception 'This match already has active result activity';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.match_id = p_match_id
    and attempt.submitting_registration_id = v_reporter_registration_id
    and attempt.status in ('prepared', 'finalizing', 'cleaning', 'recycling')
  order by attempt.created_at desc
  limit 1
  for update;

  if found then
    if v_attempt.status = 'prepared' then
      v_retry_after := greatest(
        0,
        ceil(extract(epoch from (
          v_attempt.capability_issued_at + interval '60 seconds' - v_now
        )))::integer
      );
      if v_retry_after > 0 then
        raise exception 'A replay upload attempt is already active; retry in % seconds',
          v_retry_after;
      end if;

      v_cleanup_claim_id := gen_random_uuid();
      update public.match_replay_upload_attempts as attempt
      set
        status = 'cleaning',
        cleanup_claim_id = v_cleanup_claim_id,
        cleanup_lease_expires_at = v_now + interval '5 minutes',
        updated_at = v_now
      where attempt.id = v_attempt.id;

      return jsonb_build_object(
        'outcome', 'cleanup_required',
        'attempt_id', v_attempt.id,
        'cleanup_claim_id', v_cleanup_claim_id,
        'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
      );
    end if;

    if v_attempt.status = 'finalizing' then
      if v_attempt.finalization_lease_expires_at > v_now then
        raise exception 'Replay finalization is already in progress';
      end if;

      v_cleanup_claim_id := gen_random_uuid();
      update public.match_replay_upload_attempts as attempt
      set
        status = 'cleaning',
        finalization_claim_id = null,
        finalization_lease_expires_at = null,
        cleanup_claim_id = v_cleanup_claim_id,
        cleanup_lease_expires_at = v_now + interval '5 minutes',
        updated_at = v_now
      where attempt.id = v_attempt.id;

      return jsonb_build_object(
        'outcome', 'cleanup_required',
        'attempt_id', v_attempt.id,
        'cleanup_claim_id', v_cleanup_claim_id,
        'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
      );
    end if;

    if v_attempt.status = 'cleaning' then
      if v_attempt.cleanup_lease_expires_at > v_now then
        raise exception 'Replay cleanup is already in progress';
      end if;

      v_cleanup_claim_id := gen_random_uuid();
      update public.match_replay_upload_attempts as attempt
      set
        cleanup_claim_id = v_cleanup_claim_id,
        cleanup_lease_expires_at = v_now + interval '5 minutes',
        updated_at = v_now
      where attempt.id = v_attempt.id;

      return jsonb_build_object(
        'outcome', 'cleanup_required',
        'attempt_id', v_attempt.id,
        'cleanup_claim_id', v_cleanup_claim_id,
        'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
      );
    end if;

    if v_attempt.recycle_lease_expires_at > v_now then
      raise exception 'Replay attempt recycling is already in progress';
    end if;

    v_recycle_claim_id := gen_random_uuid();
    update public.match_replay_upload_attempts as attempt
    set
      winner_registration_id = p_winner_registration_id,
      player_one_score = p_player_one_score,
      player_two_score = p_player_two_score,
      required_replay_count = v_required_replay_count,
      declared_replay_sizes = p_declared_replay_sizes,
      recycle_claim_id = v_recycle_claim_id,
      recycle_lease_expires_at = v_now + interval '5 minutes',
      updated_at = v_now
    where attempt.id = v_attempt.id;

    return jsonb_build_object(
      'outcome', 'recycle_required',
      'attempt_id', v_attempt.id,
      'recycle_claim_id', v_recycle_claim_id,
      'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
    );
  end if;

  select count(*)
  into v_noncommitted_count
  from public.match_replay_upload_attempts as attempt
  where attempt.match_id = p_match_id
    and attempt.submitting_registration_id = v_reporter_registration_id
    and attempt.status <> 'committed';

  if v_noncommitted_count < 3 then
    v_attempt_id := gen_random_uuid();
    for v_index in 1..5 loop
      v_paths := array_append(
        v_paths,
        format(
          '%s/%s/game-%s-%s.rec',
          p_match_id,
          v_attempt_id,
          v_index,
          gen_random_uuid()
        )
      );
    end loop;

    insert into public.match_replay_upload_attempts (
      id,
      match_id,
      submitting_registration_id,
      winner_registration_id,
      player_one_score,
      player_two_score,
      required_replay_count,
      replay_storage_paths,
      declared_replay_sizes,
      status,
      capability_issued_at,
      capability_not_before_reuse_at
    ) values (
      v_attempt_id,
      p_match_id,
      v_reporter_registration_id,
      p_winner_registration_id,
      p_player_one_score,
      p_player_two_score,
      v_required_replay_count,
      v_paths,
      p_declared_replay_sizes,
      'prepared',
      v_now,
      v_now + interval '2 hours 5 minutes'
    ) returning * into v_attempt;
  else
    select attempt.*
    into v_attempt
    from public.match_replay_upload_attempts as attempt
    where attempt.match_id = p_match_id
      and attempt.submitting_registration_id = v_reporter_registration_id
      and attempt.status = 'cleaned'
      and attempt.capability_not_before_reuse_at <= v_now
    order by attempt.capability_not_before_reuse_at, attempt.created_at
    limit 1
    for update;

    if not found then
      select min(attempt.capability_not_before_reuse_at)
      into v_earliest_reuse_at
      from public.match_replay_upload_attempts as attempt
      where attempt.match_id = p_match_id
        and attempt.submitting_registration_id = v_reporter_registration_id
        and attempt.status = 'cleaned';

      v_retry_after := greatest(
        1,
        ceil(extract(epoch from (v_earliest_reuse_at - v_now)))::integer
      );
      raise exception 'Replay upload retry budget is exhausted; retry in % seconds',
        v_retry_after;
    end if;

    v_recycle_claim_id := gen_random_uuid();
    update public.match_replay_upload_attempts as attempt
    set
      winner_registration_id = p_winner_registration_id,
      player_one_score = p_player_one_score,
      player_two_score = p_player_two_score,
      required_replay_count = v_required_replay_count,
      declared_replay_sizes = p_declared_replay_sizes,
      status = 'recycling',
      recycle_claim_id = v_recycle_claim_id,
      recycle_lease_expires_at = v_now + interval '5 minutes',
      cleaned_at = null,
      updated_at = v_now
    where attempt.id = v_attempt.id;

    return jsonb_build_object(
      'outcome', 'recycle_required',
      'attempt_id', v_attempt.id,
      'recycle_claim_id', v_recycle_claim_id,
      'replay_storage_paths', to_jsonb(v_attempt.replay_storage_paths)
    );
  end if;

  return jsonb_build_object(
    'outcome', 'prepared',
    'attempt_id', v_attempt.id,
    'replay_storage_paths',
      to_jsonb(v_attempt.replay_storage_paths[1:v_required_replay_count]),
    'required_replay_count', v_attempt.required_replay_count,
    'capability_issue_count', v_attempt.capability_issue_count
  );
end;
$$;

create function public.complete_match_replay_attempt_recycling(
  p_attempt_id uuid,
  p_recycle_claim_id uuid,
  p_match_id uuid,
  p_submitted_by_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_launched_at timestamptz;
  v_wins_required integer;
  v_winner_score integer;
  v_loser_score integer;
  v_paths text[] := array[]::text[];
  v_index integer;
  v_now timestamptz := clock_timestamp();
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
    raise exception 'This tournament match is not open for replay submission';
  end if;

  select bracket.tournament_id, bracket.launched_at
  into v_tournament_id, v_launched_at
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where match.id = v_match.id;

  if not found or v_launched_at is null then
    raise exception 'This tournament match is not open for replay submission';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.match_id = p_match_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = v_attempt.submitting_registration_id
      and registration.clerk_user_id = p_submitted_by_clerk_user_id
  ) then
    raise exception 'Player does not own this replay attempt';
  end if;

  if v_attempt.status <> 'recycling'
    or v_attempt.recycle_claim_id <> p_recycle_claim_id
    or v_attempt.recycle_lease_expires_at <= v_now then
    raise exception 'Replay recycling claim no longer owns this attempt';
  end if;

  perform public.assert_tournament_not_terminal(v_tournament_id);

  if v_match.status = 'completed'
    or v_match.official_result_submission_id is not null then
    raise exception 'This match already has an official result';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null
    or v_attempt.submitting_registration_id not in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
    or v_attempt.winner_registration_id not in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    ) then
    raise exception 'Replay attempt no longer matches this match';
  end if;

  v_wins_required := (v_match.series_best_of / 2) + 1;
  v_winner_score := case
    when v_attempt.winner_registration_id = v_match.player_one_registration_id
      then v_attempt.player_one_score
    else v_attempt.player_two_score
  end;
  v_loser_score := case
    when v_attempt.winner_registration_id = v_match.player_one_registration_id
      then v_attempt.player_two_score
    else v_attempt.player_one_score
  end;

  if v_winner_score <> v_wins_required or v_loser_score >= v_wins_required then
    raise exception 'The final score is invalid for this series';
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
  ) or exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
      and submission.report_group_id is null
  ) then
    raise exception 'This match already has active result activity';
  end if;

  for v_index in 1..5 loop
    v_paths := array_append(
      v_paths,
      format(
        '%s/%s/game-%s-%s.rec',
        p_match_id,
        v_attempt.id,
        v_index,
        gen_random_uuid()
      )
    );
  end loop;

  update public.match_replay_upload_attempts as attempt
  set
    replay_storage_paths = v_paths,
    status = 'prepared',
    capability_issued_at = v_now,
    capability_not_before_reuse_at = v_now + interval '2 hours 5 minutes',
    capability_issue_count = attempt.capability_issue_count + 1,
    recycle_claim_id = null,
    recycle_lease_expires_at = null,
    updated_at = v_now
  where attempt.id = v_attempt.id
  returning attempt.* into v_attempt;

  return jsonb_build_object(
    'outcome', 'prepared',
    'attempt_id', v_attempt.id,
    'replay_storage_paths',
      to_jsonb(v_attempt.replay_storage_paths[1:v_attempt.required_replay_count]),
    'required_replay_count', v_attempt.required_replay_count,
    'capability_issue_count', v_attempt.capability_issue_count
  );
end;
$$;

create function public.commit_match_replay_attempt_result(
  p_attempt_id uuid,
  p_finalization_claim_id uuid,
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_replay_content_hashes text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_tournament_id uuid;
  v_result jsonb;
  v_paths text[];
  v_now timestamptz := clock_timestamp();
begin
  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where match.id = p_match_id
  for update of match;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.match_id = p_match_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = v_attempt.submitting_registration_id
      and registration.clerk_user_id = p_submitted_by_clerk_user_id
  ) then
    raise exception 'Player does not own this replay attempt';
  end if;

  if v_attempt.status = 'committed' then
    return v_attempt.committed_result;
  end if;

  if v_attempt.status <> 'finalizing'
    or v_attempt.finalization_claim_id <> p_finalization_claim_id
    or v_attempt.finalization_lease_expires_at <= v_now then
    raise exception 'Replay finalization claim no longer owns this attempt';
  end if;

  perform public.assert_tournament_not_terminal(v_tournament_id);

  if cardinality(p_replay_content_hashes) <> v_attempt.required_replay_count then
    raise exception 'Replay hash count does not match this attempt';
  end if;

  v_paths := v_attempt.replay_storage_paths[1:v_attempt.required_replay_count];
  v_result := public.submit_match_series_result_report(
    p_match_id,
    p_submitted_by_clerk_user_id,
    v_attempt.winner_registration_id,
    v_attempt.player_one_score,
    v_attempt.player_two_score,
    v_paths,
    p_replay_content_hashes,
    p_notes
  );

  update public.match_replay_upload_attempts as attempt
  set
    status = 'committed',
    finalization_claim_id = null,
    finalization_lease_expires_at = null,
    committed_report_group_id = (v_result->>'report_group_id')::uuid,
    committed_result = v_result,
    committed_at = v_now,
    updated_at = v_now
  where attempt.id = v_attempt.id;

  return v_result;
end;
$$;

alter function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) owner to postgres;
alter function public.claim_match_replay_attempt_finalization(
  uuid, uuid, text, uuid, integer, integer
)
  owner to postgres;
alter function public.claim_match_replay_attempt_cleanup(uuid, uuid, text, uuid)
  owner to postgres;
alter function public.complete_match_replay_attempt_cleanup(uuid, uuid)
  owner to postgres;
alter function public.complete_match_replay_attempt_recycling(
  uuid, uuid, uuid, text
) owner to postgres;
alter function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) owner to postgres;

revoke all on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) from public, anon, authenticated;
revoke all on function public.claim_match_replay_attempt_finalization(
  uuid, uuid, text, uuid, integer, integer
) from public, anon, authenticated;
revoke all on function public.claim_match_replay_attempt_cleanup(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.complete_match_replay_attempt_cleanup(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_match_replay_attempt_recycling(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) from public, anon, authenticated;

grant execute on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) to service_role;
grant execute on function public.claim_match_replay_attempt_finalization(
  uuid, uuid, text, uuid, integer, integer
) to service_role;
grant execute on function public.claim_match_replay_attempt_cleanup(
  uuid, uuid, text, uuid
) to service_role;
grant execute on function public.complete_match_replay_attempt_cleanup(uuid, uuid)
  to service_role;
grant execute on function public.complete_match_replay_attempt_recycling(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) to service_role;

revoke execute on function public.submit_match_series_result_report(
  uuid, text, uuid, integer, integer, text[], text[], text
) from service_role;
revoke execute on function public.submit_match_series_result_report(
  uuid, text, uuid, integer, integer, text[], text
) from service_role;
revoke execute on function public.submit_match_series_result_report(
  uuid, text, uuid, integer, integer, text, text
) from service_role;

commit;
