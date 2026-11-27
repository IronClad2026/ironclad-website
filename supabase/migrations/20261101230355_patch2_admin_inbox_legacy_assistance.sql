begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- One durable request identity for pre-room assistance. Later private assistance
-- can extend this table; this phase creates no conversations or match controls.
create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null default 'legacy_notification'
    check (source_kind = 'legacy_notification'),
  source_notification_id uuid unique references public.notifications(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  version bigint not null default 1 check (version > 0),
  legacy_resolution_unknown boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_by_player_id uuid references public.players(id) on delete set null,
  constraint assistance_requests_resolution_check
    check ((status = 'resolved') = (resolved_at is not null))
);
alter table public.assistance_requests enable row level security;
revoke all on public.assistance_requests from public, anon, authenticated;
grant select, insert, update on public.assistance_requests to service_role;
create index assistance_requests_queue_idx
  on public.assistance_requests(tournament_id, status, created_at, id);
create index notifications_admin_active_scope_idx
  on public.notifications(tournament_id, created_at desc, id desc)
  where recipient_role = 'admin' and in_app_hidden_at is null;

create function public.is_legacy_assistance_notification(
  p_role text, p_type text, p_event_key text, p_metadata jsonb,
  p_match_id uuid, p_registration_id uuid, p_notification_id uuid
) returns boolean language sql stable set search_path = pg_catalog as $$
  select coalesce(p_role = 'admin' and p_type = 'match.admin_assistance_requested'
    and not exists (
      select 1 from public.match_rooms r
      where r.id::text = lower(p_metadata ->> 'roomId') and r.match_id = p_match_id
        and (
          -- The canonical writer inserts its notice before upserting state.
          coalesce(p_event_key, '') ~ ('^match-room:' || r.id::text || ':assistance:[1-9][0-9]*$')
          or (p_registration_id in (r.player_one_registration_id, r.player_two_registration_id)
            and exists(select 1 from public.match_room_assistance a
              where a.room_id = r.id and a.notification_id = p_notification_id))
        )
    ), false);
$$;

create function public.capture_legacy_assistance_request()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if public.is_legacy_assistance_notification(new.recipient_role, new.type, new.event_key, new.metadata, new.match_id, new.registration_id, new.id) then
    insert into public.assistance_requests(source_notification_id, tournament_id,
      created_at, updated_at, legacy_resolution_unknown)
    values(new.id, new.tournament_id, new.created_at, now(), new.in_app_hidden_at is not null)
    on conflict (source_notification_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger notifications_capture_legacy_assistance
  after insert on public.notifications
  for each row execute function public.capture_legacy_assistance_request();

-- Hidden legacy notices do not prove resolution. Preserve their uncertainty and
-- put them in an explicit review queue; never infer missing tournament history.
insert into public.assistance_requests(source_notification_id, tournament_id,
  created_at, updated_at, legacy_resolution_unknown)
select n.id, n.tournament_id, n.created_at, now(), n.in_app_hidden_at is not null
from public.notifications n
where public.is_legacy_assistance_notification(n.recipient_role, n.type, n.event_key, n.metadata, n.match_id, n.registration_id, n.id)
on conflict (source_notification_id) do nothing;

create function public.admin_notification_scope_matches(
  p_actual_tournament uuid, p_metadata jsonb, p_scope text, p_tournament_id uuid
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select case p_scope
    when 'tournament' then p_tournament_id is not null and p_actual_tournament = p_tournament_id
    when 'platform' then p_tournament_id is null and p_actual_tournament is null
      and coalesce(p_metadata ->> 'adminInboxScope', '') = 'platform'
    when 'unassigned' then p_tournament_id is null and p_actual_tournament is null
      and coalesce(p_metadata ->> 'adminInboxScope', '') <> 'platform'
    else false end;
$$;

create function public.read_admin_notification_inbox(
  p_scope text, p_tournament_id uuid, p_page integer default 1,
  p_unread_only boolean default false, p_selected_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('tournament', 'platform', 'unassigned')
    or ((p_scope = 'tournament') <> (p_tournament_id is not null))
    or p_page is null or p_page < 1 or p_unread_only is null then
    raise exception 'Explicit inbox context required' using errcode = '22023';
  end if;
  if p_scope = 'tournament' and not exists(select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Tournament unavailable' using errcode = '22023';
  end if;
  -- One SQL snapshot supplies complete counts, a bounded page and scoped detail.
  with scoped as materialized (
    select n.id, n.recipient_role, n.type, n.title, n.message, n.actor_display_name,
      n.tournament_id, n.tournament_title, n.registration_id, n.match_id,
      n.report_group_id, n.event_key, n.metadata, n.read_at, n.created_at
    from public.notifications n
    where n.recipient_role = 'admin' and n.in_app_hidden_at is null
      and public.admin_notification_scope_matches(n.tournament_id, n.metadata, p_scope, p_tournament_id)
  ), counts as (
    select count(*) total, count(*) filter(where read_at is null) unread,
      count(*) filter(where not p_unread_only or read_at is null) filtered from scoped
  ), paging as (
    select *, greatest(1, ceil(filtered / 25.0)::integer) pages,
      least(p_page, greatest(1, ceil(filtered / 25.0)::integer)) page from counts
  ), page_rows as (
    select s.* from scoped s where not p_unread_only or s.read_at is null
    order by s.created_at desc, s.id desc
    limit 25 offset (select (page::bigint - 1) * 25 from paging)
  ) select jsonb_build_object(
    'totalCount', p.total, 'unreadCount', p.unread, 'filteredCount', p.filtered,
    'page', p.page, 'pageCount', p.pages,
    'notifications', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from page_rows r), '[]'::jsonb),
    'selectedNotification', (select to_jsonb(s) from scoped s where s.id = p_selected_id)
  ) into v_result from paging p;
  return v_result;
end;
$$;

create function public.mutate_admin_notification_inbox(
  p_scope text, p_tournament_id uuid, p_action text, p_ids uuid[] default null
) returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare v_ids uuid[]; v_changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_scope is null or p_scope not in ('tournament', 'platform', 'unassigned')
    or ((p_scope = 'tournament') <> (p_tournament_id is not null))
    or p_action is null or p_action not in ('read', 'read_all', 'dismiss') then
    raise exception 'Explicit inbox context required' using errcode = '22023';
  end if;
  if p_scope = 'tournament' and not exists(select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Tournament unavailable' using errcode = '22023';
  end if;
  if p_action = 'read_all' then
    if p_scope <> 'tournament' or coalesce(cardinality(p_ids), 0) <> 0 then
      raise exception 'Mark all requires a selected tournament and no targets' using errcode = '22023';
    end if;
    update public.notifications n set read_at = coalesce(n.read_at, now())
    where n.recipient_role = 'admin' and n.tournament_id = p_tournament_id
      and n.in_app_hidden_at is null and n.read_at is null;
    get diagnostics v_changed = row_count;
    return v_changed;
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 100
    or array_position(p_ids, null) is not null then
    raise exception 'Select 1 to 100 valid notifications' using errcode = '22023';
  end if;
  select array_agg(distinct id) into v_ids from unnest(p_ids) id;
  -- Lock all targets in a stable order, then validate the entire set BEFORE any
  -- writes. A duplicate/concurrent read or dismissal is safely idempotent.
  perform n.id from public.notifications n where n.id = any(v_ids) order by n.id for update;
  if (select count(*) from public.notifications n where n.id = any(v_ids)
    and n.recipient_role = 'admin'
    and public.admin_notification_scope_matches(n.tournament_id, n.metadata, p_scope, p_tournament_id)) <> cardinality(v_ids) then
    raise exception 'Selection contains unavailable or out-of-scope notifications' using errcode = '22023';
  end if;
  if p_action = 'dismiss' then
    -- Defensive capture also covers legacy rows imported after this migration.
    insert into public.assistance_requests(source_notification_id, tournament_id,
      created_at, updated_at, legacy_resolution_unknown)
    select n.id, n.tournament_id, n.created_at, now(), n.in_app_hidden_at is not null
    from public.notifications n where n.id = any(v_ids)
      and n.recipient_role = 'admin'
      and public.admin_notification_scope_matches(n.tournament_id, n.metadata, p_scope, p_tournament_id)
      and public.is_legacy_assistance_notification(n.recipient_role, n.type, n.event_key, n.metadata, n.match_id, n.registration_id, n.id)
    on conflict (source_notification_id) do nothing;
    update public.notifications n set in_app_hidden_at = coalesce(n.in_app_hidden_at, now())
    where n.id = any(v_ids) and n.recipient_role = 'admin' and n.in_app_hidden_at is null
      and public.admin_notification_scope_matches(n.tournament_id, n.metadata, p_scope, p_tournament_id);
  else
    update public.notifications n set read_at = coalesce(n.read_at, now())
    where n.id = any(v_ids) and n.recipient_role = 'admin' and n.in_app_hidden_at is null and n.read_at is null
      and public.admin_notification_scope_matches(n.tournament_id, n.metadata, p_scope, p_tournament_id);
  end if;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

-- Explicit assistance status changes are separate from every inbox operation.
-- Compare-and-set prevents two admins silently overwriting each other's work.
create function public.read_legacy_assistance_queue(
  p_tournament_id uuid, p_page integer default 1, p_include_resolved boolean default false
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_page is null or p_page < 1 or p_include_resolved is null then
    raise exception 'Invalid assistance page' using errcode = '22023';
  end if;
  with scoped as materialized (
    select a.id, a.tournament_id, a.source_notification_id, a.status, a.version,
      a.legacy_resolution_unknown, a.created_at, a.updated_at,
      n.title, n.message, n.actor_display_name, n.match_id
    from public.assistance_requests a left join public.notifications n on n.id = a.source_notification_id
    where a.tournament_id is not distinct from p_tournament_id
      and (p_include_resolved or a.status <> 'resolved')
  ), paging as (
    select count(*) total, greatest(1, ceil(count(*) / 25.0)::integer) pages,
      least(p_page, greatest(1, ceil(count(*) / 25.0)::integer)) page from scoped
  ), page_rows as (
    select * from scoped order by created_at, id limit 25
      offset (select (page::bigint - 1) * 25 from paging)
  ) select jsonb_build_object('totalCount', p.total, 'page', p.page, 'pageCount', p.pages,
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) from page_rows r), '[]'::jsonb))
  into v_result from paging p;
  return v_result;
end;
$$;

create function public.set_legacy_assistance_status(
  p_id uuid, p_tournament_id uuid, p_status text, p_expected_version bigint, p_admin_clerk_id text
) returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_id is null or p_status is null or p_status not in ('open','in_progress','resolved')
    or p_expected_version is null or p_expected_version < 1
    or nullif(trim(p_admin_clerk_id), '') is null then
    raise exception 'Invalid assistance context' using errcode = '22023';
  end if;
  update public.assistance_requests a set status = p_status, version = version + 1,
    updated_at = now(), updated_by_player_id = (select p.id from public.players p
      where p.clerk_user_id = p_admin_clerk_id and p.account_closed_at is null),
    resolved_at = case when p_status = 'resolved' then now() else null end,
    legacy_resolution_unknown = false
  where a.id = p_id and a.source_kind = 'legacy_notification'
    and a.tournament_id is not distinct from p_tournament_id and a.version = p_expected_version;
  return found;
end;
$$;

-- Preserve the closed raw-notification RLS/privilege boundary established by
-- 20260725090000_match_result_privacy_hardening; do not restore old policies.
-- Old browser clients and old service-role application builds cannot bypass
-- scoped inbox actions. Keep this trigger SECURITY INVOKER: trusted postgres-
-- owned SECURITY DEFINER authorities (including authenticated room resolution,
-- privacy/retention and the new scoped RPC) retain their execution context.
drop policy if exists "Admins can mark admin notifications read" on public.notifications;
create function public.require_scoped_admin_notification_client_update()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if old.recipient_role = 'admin' and current_user <> 'postgres' then
    if auth.role() = 'authenticated' then
      raise exception 'Open the selected tournament inbox to change admin notifications' using errcode = '42501';
    end if;
    if auth.role() = 'service_role' then
      if tg_op = 'DELETE' then
        raise exception 'Use the scoped admin inbox to remove notifications' using errcode = '42501';
      end if;
      if old.read_at is distinct from new.read_at
        or old.in_app_hidden_at is distinct from new.in_app_hidden_at then
        raise exception 'Use the scoped admin inbox to change notification visibility' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger notifications_require_scoped_admin_update
  before update or delete on public.notifications for each row
  execute function public.require_scoped_admin_notification_client_update();

alter function public.is_legacy_assistance_notification(text,text,text,jsonb,uuid,uuid,uuid) owner to postgres;
alter function public.capture_legacy_assistance_request() owner to postgres;
alter function public.admin_notification_scope_matches(uuid,jsonb,text,uuid) owner to postgres;
alter function public.read_admin_notification_inbox(text,uuid,integer,boolean,uuid) owner to postgres;
alter function public.mutate_admin_notification_inbox(text,uuid,text,uuid[]) owner to postgres;
alter function public.set_legacy_assistance_status(uuid,uuid,text,bigint,text) owner to postgres;
alter function public.read_legacy_assistance_queue(uuid,integer,boolean) owner to postgres;
alter function public.require_scoped_admin_notification_client_update() owner to postgres;
revoke all on function public.is_legacy_assistance_notification(text,text,text,jsonb,uuid,uuid,uuid),
  public.capture_legacy_assistance_request(), public.admin_notification_scope_matches(uuid,jsonb,text,uuid),
  public.read_admin_notification_inbox(text,uuid,integer,boolean,uuid),
  public.mutate_admin_notification_inbox(text,uuid,text,uuid[]),
  public.set_legacy_assistance_status(uuid,uuid,text,bigint,text),
  public.read_legacy_assistance_queue(uuid,integer,boolean),
  public.require_scoped_admin_notification_client_update() from public, anon, authenticated;
grant execute on function public.is_legacy_assistance_notification(text,text,text,jsonb,uuid,uuid,uuid),
  public.capture_legacy_assistance_request(), public.admin_notification_scope_matches(uuid,jsonb,text,uuid),
  public.read_admin_notification_inbox(text,uuid,integer,boolean,uuid),
  public.mutate_admin_notification_inbox(text,uuid,text,uuid[]),
  public.set_legacy_assistance_status(uuid,uuid,text,bigint,text),
  public.read_legacy_assistance_queue(uuid,integer,boolean),
  public.require_scoped_admin_notification_client_update() to service_role;
commit;
