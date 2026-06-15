begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'match-proofs',
  'match-proofs',
  false,
  10485760
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760;

alter table public.tournament_matches
  add column if not exists official_result_submission_id uuid,
  add column if not exists official_result_decided_by text,
  add column if not exists official_result_decided_at timestamptz;

alter table public.match_result_submissions
  drop constraint if exists match_result_submissions_match_id_fkey;
alter table public.match_result_submissions
  add constraint match_result_submissions_match_id_fkey
  foreign key (match_id)
  references public.tournament_matches(id)
  on delete restrict;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'tournament_matches_official_result_submission_id_fkey'
  ) then
    alter table public.tournament_matches
      add constraint
        tournament_matches_official_result_submission_id_fkey
      foreign key (official_result_submission_id)
      references public.match_result_submissions(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists tournament_matches_official_submission_idx
  on public.tournament_matches(official_result_submission_id);

create or replace function public.link_approved_submission_to_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
    and old.status is distinct from new.status then
    update public.tournament_matches
    set
      official_result_submission_id = new.id,
      official_result_decided_by = new.reviewed_by,
      official_result_decided_at = coalesce(new.reviewed_at, now())
    where id = new.match_id;
  end if;

  return new;
end;
$$;

drop trigger if exists match_result_submissions_link_official_result
  on public.match_result_submissions;
create trigger match_result_submissions_link_official_result
after update of status
on public.match_result_submissions
for each row
execute function public.link_approved_submission_to_match();

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
set search_path = public
as $$
begin
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
    official_result_decided_at = now()
  where id = p_match_id;
end;
$$;

revoke all on function public.apply_admin_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) from public;
grant execute on function public.apply_admin_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) to service_role;

commit;
