begin;

-- Result and notification rows are now projected only by authenticated
-- server boundaries. Browser roles must not be able to select full rows that
-- contain proof object paths, replay hashes, or Clerk audit identifiers.
alter table public.match_result_submissions enable row level security;
alter table public.match_result_report_groups enable row level security;
alter table public.notifications enable row level security;

revoke all privileges on table
  public.match_result_submissions,
  public.match_result_report_groups,
  public.notifications
from public, anon, authenticated;

revoke update (read_at) on table public.notifications
from public, anon, authenticated;

grant all privileges on table
  public.match_result_submissions,
  public.match_result_report_groups,
  public.notifications
to service_role;

drop policy if exists "Players can read their own match submissions"
  on public.match_result_submissions;

drop policy if exists "Participants can read match result report groups"
  on public.match_result_report_groups;

drop policy if exists "Players can read own notifications"
  on public.notifications;
drop policy if exists "Players can mark own notifications read"
  on public.notifications;
drop policy if exists "Admins can read admin notifications"
  on public.notifications;
drop policy if exists "Admins can mark admin notifications read"
  on public.notifications;

-- The proof route must authorize the requested match before it creates a
-- service-role client. Expose only the already browser-safe match and current
-- participant registration UUIDs through a participant/admin RLS check; every
-- other tournament_matches column remains unavailable to browser roles.
alter table public.tournament_matches enable row level security;

revoke all privileges on table public.tournament_matches
from public, anon, authenticated;

grant select (
  id,
  player_one_registration_id,
  player_two_registration_id
) on table public.tournament_matches
to authenticated;

drop policy if exists "Public can read tournament matches"
  on public.tournament_matches;

drop policy if exists "Authorized viewers can resolve match proof scope"
  on public.tournament_matches;

create policy "Authorized viewers can resolve match proof scope"
on public.tournament_matches
for select
to authenticated
using (
  public.is_admin_jwt()
  or exists (
    select 1
    from public.registrations as registration
    where registration.clerk_user_id = (auth.jwt() ->> 'sub')
      and registration.id in (
        tournament_matches.player_one_registration_id,
        tournament_matches.player_two_registration_id
      )
  )
);

commit;
