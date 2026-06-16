begin;

alter table public.match_result_report_groups
  add column if not exists replay_proof_mode text not null
    default 'single_series_replay';

alter table public.match_result_report_groups
  drop constraint if exists match_result_report_groups_replay_proof_mode_check;
alter table public.match_result_report_groups
  add constraint match_result_report_groups_replay_proof_mode_check
  check (
    replay_proof_mode in (
      'single_series_replay',
      'per_game_replay'
    )
  );

create or replace function public.mark_report_group_per_game_replay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.report_group_id is not null
    and new.replay_content_hash is not null then
    update public.match_result_report_groups
    set replay_proof_mode = 'per_game_replay'
    where id = new.report_group_id
      and replay_proof_mode <> 'per_game_replay';
  end if;

  return new;
end;
$$;

drop trigger if exists match_result_submissions_mark_per_game_replay
  on public.match_result_submissions;
create trigger match_result_submissions_mark_per_game_replay
after insert or update of report_group_id, replay_content_hash
on public.match_result_submissions
for each row
execute function public.mark_report_group_per_game_replay();

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

revoke all on function public.mark_report_group_per_game_replay()
  from public;
grant execute on function public.mark_report_group_per_game_replay()
  to service_role;

revoke all on function public.assert_report_group_replay_count(uuid)
  from public;
grant execute on function public.assert_report_group_replay_count(uuid)
  to service_role;

commit;
