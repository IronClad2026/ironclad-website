begin;

create table if not exists public.tournament_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  tournament_title text not null,
  requested_by text not null,
  proof_paths text[] not null default array[]::text[],
  deleted_counts jsonb not null default '{}'::jsonb,
  status text not null default 'database_deleted'
    check (status in ('database_deleted', 'storage_failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_deletion_jobs_status_idx
  on public.tournament_deletion_jobs(status, created_at);

drop trigger if exists tournament_deletion_jobs_set_updated_at
  on public.tournament_deletion_jobs;
create trigger tournament_deletion_jobs_set_updated_at
before update on public.tournament_deletion_jobs
for each row execute function public.ironclad_set_updated_at();

alter table public.tournament_deletion_jobs enable row level security;
revoke all on table public.tournament_deletion_jobs from public;
revoke all on table public.tournament_deletion_jobs from anon, authenticated;
grant all on table public.tournament_deletion_jobs to service_role;

create or replace function public.refresh_generated_bracket_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
begin
  if current_setting('ironclad.tournament_deletion', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    if old.registration_status = 'approved' then
      v_old_bracket_id := old.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.registration_status = 'approved' then
      v_new_bracket_id := new.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.registration_status is not distinct from new.registration_status
      and old.tournament_bracket_id is not distinct from new.tournament_bracket_id then
      return new;
    end if;
  end if;

  if v_old_bracket_id is not null then
    perform public.generate_tournament_bracket(
      v_old_bracket_id,
      'system:approval-change'
    );
  end if;

  if v_new_bracket_id is not null
    and v_new_bracket_id is distinct from v_old_bracket_id then
    perform public.generate_tournament_bracket(
      v_new_bracket_id,
      'system:approval-change'
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

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
      select count(distinct path)
      from (
        select replay_storage_path as path from target_submissions
        union all
        select screenshot_storage_path as path from target_submissions
      ) as proofs
      where path is not null
    )
  );
$$;

revoke all on function public.get_tournament_deletion_preview(uuid)
  from public;
grant execute on function public.get_tournament_deletion_preview(uuid)
  to service_role;

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
  v_counts jsonb;
  v_proof_paths text[];
  v_job_id uuid;
begin
  if p_deleted_by is null or btrim(p_deleted_by) = '' then
    raise exception 'Deleting administrator is required';
  end if;

  select title
  into v_tournament_title
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
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
  ) as proof;

  insert into public.tournament_deletion_jobs (
    tournament_id,
    tournament_title,
    requested_by,
    proof_paths,
    deleted_counts
  )
  values (
    p_tournament_id,
    v_tournament_title,
    p_deleted_by,
    v_proof_paths,
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
    'deleted_counts', v_counts
  );
end;
$$;

revoke all on function public.delete_tournament_data(uuid, text)
  from public;
grant execute on function public.delete_tournament_data(uuid, text)
  to service_role;

commit;
