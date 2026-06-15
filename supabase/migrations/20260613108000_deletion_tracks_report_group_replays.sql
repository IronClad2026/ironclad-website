begin;

create or replace function public.get_tournament_deletion_preview(
  p_tournament_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with target_brackets as (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  ),
  target_generated as (
    select id
    from public.generated_brackets
    where tournament_bracket_id in (select id from target_brackets)
  ),
  target_matches as (
    select id
    from public.tournament_matches
    where generated_bracket_id in (select id from target_generated)
  ),
  target_submissions as (
    select replay_storage_path, screenshot_storage_path
    from public.match_result_submissions
    where match_id in (select id from target_matches)
  ),
  target_report_groups as (
    select replay_storage_path
    from public.match_result_report_groups
    where tournament_id = p_tournament_id
      or match_id in (select id from target_matches)
  ),
  storage_paths as (
    select replay_storage_path as path from target_submissions
    union
    select screenshot_storage_path as path from target_submissions
    union
    select replay_storage_path as path from target_report_groups
    union
    select banner_image_url
    from public.tournaments
    where id = p_tournament_id
      and banner_image_url like
        '%/storage/v1/object/public/tournament-banners/%'
  )
  select jsonb_build_object(
    'registrations', (
      select count(*)
      from public.registrations
      where tournament_id = p_tournament_id
        or tournament_bracket_id in (select id from target_brackets)
    ),
    'brackets', (select count(*) from target_brackets),
    'generated_brackets', (select count(*) from target_generated),
    'rounds', (
      select count(*)
      from public.bracket_rounds
      where generated_bracket_id in (select id from target_generated)
    ),
    'matches', (select count(*) from target_matches),
    'standings', (
      select count(*)
      from public.tournament_standings
      where generated_bracket_id in (select id from target_generated)
    ),
    'result_submissions', (select count(*) from target_submissions),
    'storage_files', (
      select count(*)
      from storage_paths
      where path is not null
    )
  );
$$;

create or replace function public.delete_tournament_data(
  p_tournament_id uuid,
  p_deleted_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_title text;
  v_banner_image_url text;
  v_banner_path text;
  v_banner_paths text[] := array[]::text[];
  v_counts jsonb;
  v_proof_paths text[];
  v_job_id uuid;
  v_banner_marker constant text :=
    '/storage/v1/object/public/tournament-banners/';
begin
  if p_deleted_by is null or btrim(p_deleted_by) = '' then
    raise exception 'Deleting administrator is required';
  end if;

  select title, banner_image_url
  into v_tournament_title, v_banner_image_url
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if position(v_banner_marker in coalesce(v_banner_image_url, '')) > 0 then
    v_banner_path := split_part(
      split_part(v_banner_image_url, v_banner_marker, 2),
      '?',
      1
    );
    if v_banner_path <> '' then
      v_banner_paths := array[v_banner_path];
    end if;
  end if;

  v_counts := public.get_tournament_deletion_preview(p_tournament_id);

  select coalesce(array_agg(distinct proof.path), array[]::text[])
  into v_proof_paths
  from (
    select submission.replay_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.replay_storage_path is not null
    union all
    select submission.screenshot_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.screenshot_storage_path is not null
    union all
    select report_group.replay_storage_path as path
    from public.match_result_report_groups as report_group
    where report_group.tournament_id = p_tournament_id
      and report_group.replay_storage_path is not null
  ) as proof;

  insert into public.tournament_deletion_jobs (
    tournament_id,
    tournament_title,
    requested_by,
    proof_paths,
    banner_paths,
    deleted_counts
  )
  values (
    p_tournament_id,
    v_tournament_title,
    p_deleted_by,
    v_proof_paths,
    v_banner_paths,
    v_counts
  )
  returning id into v_job_id;

  perform set_config('ironclad.tournament_deletion', 'on', true);

  delete from public.match_result_submissions
  where match_id in (
    select match.id
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
  );

  delete from public.generated_brackets
  where tournament_bracket_id in (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  );

  delete from public.registrations
  where tournament_id = p_tournament_id
    or tournament_bracket_id in (
      select id
      from public.tournament_brackets
      where tournament_id = p_tournament_id
    );

  delete from public.tournament_brackets
  where tournament_id = p_tournament_id;

  delete from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament deletion did not remove the tournament';
  end if;

  return jsonb_build_object(
    'job_id', v_job_id,
    'tournament_title', v_tournament_title,
    'proof_paths', to_jsonb(v_proof_paths),
    'banner_paths', to_jsonb(v_banner_paths),
    'deleted_counts', v_counts
  );
end;
$$;

revoke all on function public.get_tournament_deletion_preview(uuid)
  from public;
grant execute on function public.get_tournament_deletion_preview(uuid)
  to service_role;

revoke all on function public.delete_tournament_data(uuid, text)
  from public;
grant execute on function public.delete_tournament_data(uuid, text)
  to service_role;

commit;
