begin;

alter table public.match_result_submissions
  add column if not exists replay_content_hash text;

alter table public.match_result_submissions
  drop constraint if exists match_result_submissions_replay_content_hash_check;
alter table public.match_result_submissions
  add constraint match_result_submissions_replay_content_hash_check
  check (
    replay_content_hash is null
    or replay_content_hash ~ '^[0-9a-f]{64}$'
  );

create index if not exists
  match_result_submissions_report_group_hash_idx
  on public.match_result_submissions(report_group_id, replay_content_hash)
  where replay_content_hash is not null;

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

  if v_replay_count <> v_required_replay_count then
    raise exception
      'This final score requires exactly % replay file%',
      v_required_replay_count,
      case when v_required_replay_count = 1 then '' else 's' end;
  end if;

  if v_distinct_path_count <> v_replay_count then
    raise exception 'Duplicate replay storage paths cannot be finalized';
  end if;

  if v_hash_count > 0 and v_hash_count <> v_replay_count then
    raise exception 'Replay hash audit data is incomplete';
  end if;

  if v_hash_count > 0 and v_distinct_hash_count <> v_hash_count then
    raise exception 'Duplicate replay payloads cannot be finalized';
  end if;
end;
$$;

create or replace function public.submit_match_series_result_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_paths text[],
  p_replay_content_hashes text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_replay_path_count integer;
  v_hashes text[];
  v_hash_count integer;
  v_distinct_hash_count integer;
begin
  select count(*)
  into v_replay_path_count
  from unnest(coalesce(p_replay_storage_paths, array[]::text[])) as replay(path)
  where replay.path is not null
    and btrim(replay.path) <> '';

  select coalesce(array_agg(hash order by ordinal), array[]::text[])
  into v_hashes
  from (
    select lower(btrim(replay_hash.hash)) as hash, replay_hash.ordinal
    from unnest(coalesce(p_replay_content_hashes, array[]::text[]))
      with ordinality as replay_hash(hash, ordinal)
    where replay_hash.hash is not null
      and btrim(replay_hash.hash) <> ''
  ) as normalized;

  select count(*), count(distinct replay_hash.hash)
  into v_hash_count, v_distinct_hash_count
  from unnest(v_hashes) as replay_hash(hash);

  if v_hash_count <> v_replay_path_count then
    raise exception 'Replay hash count must match replay file count';
  end if;

  if exists (
    select 1
    from unnest(v_hashes) as replay_hash(hash)
    where replay_hash.hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'Replay content hashes must be SHA-256 hex strings';
  end if;

  if v_distinct_hash_count <> v_hash_count then
    raise exception 'Each game requires a unique replay file';
  end if;

  v_result := public.submit_match_series_result_report(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_replay_storage_paths,
    p_notes
  );

  with linked_submission as (
    select
      submission_id::uuid as id,
      ordinal
    from jsonb_array_elements_text(v_result->'submission_ids')
      with ordinality as submission(submission_id, ordinal)
  ),
  replay_hash as (
    select hash, ordinal
    from unnest(v_hashes) with ordinality as replay_hash(hash, ordinal)
  )
  update public.match_result_submissions as submission
  set replay_content_hash = replay_hash.hash
  from linked_submission
  join replay_hash
    on replay_hash.ordinal = linked_submission.ordinal
  where submission.id = linked_submission.id;

  return v_result || jsonb_build_object('replay_hash_count', v_hash_count);
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

revoke all on function public.assert_report_group_replay_count(uuid)
  from public;
grant execute on function public.assert_report_group_replay_count(uuid)
  to service_role;

revoke all on function public.submit_match_series_result_report(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text[],
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
  text[],
  text
) to service_role;

commit;
