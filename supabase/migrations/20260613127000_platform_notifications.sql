create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_clerk_user_id text,
  recipient_role text,
  type text not null,
  title text not null,
  message text not null,
  actor_clerk_user_id text,
  actor_display_name text,
  tournament_id uuid references public.tournaments(id) on delete set null,
  tournament_title text,
  registration_id uuid references public.registrations(id) on delete set null,
  match_id uuid references public.tournament_matches(id) on delete set null,
  report_group_id uuid references public.match_result_report_groups(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_role_check
    check (recipient_role is null or recipient_role in ('player', 'admin')),
  constraint notifications_has_recipient_check
    check (recipient_clerk_user_id is not null or recipient_role is not null)
);

create index if not exists notifications_recipient_clerk_idx
  on public.notifications(recipient_clerk_user_id, created_at desc);

create index if not exists notifications_recipient_role_idx
  on public.notifications(recipient_role, created_at desc);

create index if not exists notifications_read_at_idx
  on public.notifications(read_at);

create index if not exists notifications_created_at_idx
  on public.notifications(created_at desc);

create index if not exists notifications_type_idx
  on public.notifications(type);

create index if not exists notifications_tournament_idx
  on public.notifications(tournament_id);

create index if not exists notifications_registration_idx
  on public.notifications(registration_id);

create index if not exists notifications_match_idx
  on public.notifications(match_id);

create index if not exists notifications_report_group_idx
  on public.notifications(report_group_id);

create or replace function public.is_admin_jwt()
returns boolean
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'metadata' ->> 'role',
    auth.jwt() -> 'public_metadata' ->> 'role',
    auth.jwt() -> 'private_metadata' ->> 'role',
    auth.jwt() ->> 'role'
  ) = 'admin';
$$;

create or replace function public.protect_notification_client_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      raise exception 'Notifications can only be created by protected server workflows';
    end if;

    if tg_op = 'DELETE' then
      raise exception 'Notifications cannot be deleted by clients';
    end if;

    if tg_op = 'UPDATE' then
      if old.id is distinct from new.id
        or old.recipient_clerk_user_id is distinct from new.recipient_clerk_user_id
        or old.recipient_role is distinct from new.recipient_role
        or old.type is distinct from new.type
        or old.title is distinct from new.title
        or old.message is distinct from new.message
        or old.actor_clerk_user_id is distinct from new.actor_clerk_user_id
        or old.actor_display_name is distinct from new.actor_display_name
        or old.tournament_id is distinct from new.tournament_id
        or old.tournament_title is distinct from new.tournament_title
        or old.registration_id is distinct from new.registration_id
        or old.match_id is distinct from new.match_id
        or old.report_group_id is distinct from new.report_group_id
        or old.metadata is distinct from new.metadata
        or old.created_at is distinct from new.created_at
      then
        raise exception 'Only notification read state can be updated by clients';
      end if;

      if old.read_at is not null and new.read_at is null then
        raise exception 'Notifications cannot be marked unread by clients';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_client_mutation_guard
  on public.notifications;
create trigger notifications_client_mutation_guard
before insert or update or delete on public.notifications
for each row execute function public.protect_notification_client_mutation();

alter table public.notifications enable row level security;

drop policy if exists "Players can read own notifications"
  on public.notifications;
create policy "Players can read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_clerk_user_id =
    coalesce(auth.jwt() ->> 'sub', auth.jwt() ->> 'user_id')
);

drop policy if exists "Players can mark own notifications read"
  on public.notifications;
create policy "Players can mark own notifications read"
on public.notifications
for update
to authenticated
using (
  recipient_clerk_user_id =
    coalesce(auth.jwt() ->> 'sub', auth.jwt() ->> 'user_id')
)
with check (
  recipient_clerk_user_id =
    coalesce(auth.jwt() ->> 'sub', auth.jwt() ->> 'user_id')
);

drop policy if exists "Admins can read admin notifications"
  on public.notifications;
create policy "Admins can read admin notifications"
on public.notifications
for select
to authenticated
using (
  recipient_role = 'admin'
  and public.is_admin_jwt()
);

drop policy if exists "Admins can mark admin notifications read"
  on public.notifications;
create policy "Admins can mark admin notifications read"
on public.notifications
for update
to authenticated
using (
  recipient_role = 'admin'
  and public.is_admin_jwt()
)
with check (
  recipient_role = 'admin'
  and public.is_admin_jwt()
);

revoke all on public.notifications from anon;
grant select, update(read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
grant execute on function public.is_admin_jwt() to authenticated;
