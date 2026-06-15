begin;

drop index if exists
  public.match_result_submissions_one_pending_per_player;

create unique index
  match_result_submissions_one_pending_per_player
  on public.match_result_submissions(
    match_id,
    submitted_by_clerk_user_id
  )
  where status = 'pending';

commit;
