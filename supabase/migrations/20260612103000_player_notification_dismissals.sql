begin;

create table if not exists public.player_notification_dismissals (
  clerk_user_id text not null,
  submission_id uuid not null
    references public.match_result_submissions(id) on delete cascade,
  dismissed_status text not null
    check (
      dismissed_status in (
        'pending',
        'approved',
        'rejected',
        'resubmission_requested'
      )
    ),
  dismissed_at timestamptz not null default now(),
  primary key (clerk_user_id, submission_id, dismissed_status)
);

create index if not exists
  player_notification_dismissals_user_idx
  on public.player_notification_dismissals(
    clerk_user_id,
    dismissed_at desc
  );

alter table public.player_notification_dismissals enable row level security;
revoke all on table public.player_notification_dismissals from public;
revoke all on table public.player_notification_dismissals
  from anon, authenticated;
grant all on table public.player_notification_dismissals to service_role;

commit;
