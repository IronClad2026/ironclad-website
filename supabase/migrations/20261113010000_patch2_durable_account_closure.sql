begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Keep only a one-way subject digest after closure, independently of Players.
create table ironclad_private.patch2_closed_accounts (
  subject_digest bytea primary key check (octet_length(subject_digest) = 32),
  closed_at timestamptz not null default now()
);
alter table ironclad_private.patch2_closed_accounts enable row level security;
revoke all on ironclad_private.patch2_closed_accounts from public, anon, authenticated, service_role;

create function ironclad_private.patch2_account_state(p_sub text)
returns text language plpgsql stable set search_path = pg_catalog as $$
begin
  if p_sub is null or btrim(p_sub) = '' or exists (
    select from ironclad_private.patch2_closed_accounts
    where subject_digest = sha256(convert_to(p_sub, 'UTF8'))
  ) then
    return 'denied';
  end if;
  if exists (select from public.players where clerk_user_id = p_sub and account_closed_at is not null) then
    return 'denied';
  end if;
  if exists (select from public.players where clerk_user_id = p_sub) then
    return 'active-player';
  end if;
  return 'no-player';
end;
$$;
revoke all on function ironclad_private.patch2_account_state(text) from public, anon, authenticated, service_role;

create function public.get_patch2_admin_account_state(p_clerk_user_id text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  return ironclad_private.patch2_account_state(p_clerk_user_id);
end;
$$;
revoke all on function public.get_patch2_admin_account_state(text) from public, anon, authenticated;
grant execute on function public.get_patch2_admin_account_state(text) to service_role;

create function ironclad_private.require_patch2_open_account(p_sub text)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if public.get_patch2_admin_account_state(p_sub) = 'denied' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
end;
$$;
revoke all on function ironclad_private.require_patch2_open_account(text) from public, anon, authenticated, service_role;

create function ironclad_private.reject_closed_player_identity()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_lock bigint := hashtextextended('ironclad:patch2-player-identity:' || new.clerk_user_id, 0);
begin
  if tg_op = 'UPDATE' then
    if new.clerk_user_id is not distinct from old.clerk_user_id then
      return new;
    end if;
    -- An UPDATE has already locked its row. Fail safely if closure owns
    -- the identity lock instead of waiting while holding the row.
    if not pg_try_advisory_xact_lock(v_lock) then
      raise exception 'Account identity is being updated; please retry' using errcode = '40001';
    end if;
  else
    perform pg_advisory_xact_lock(v_lock);
  end if;
  if exists (
    select from ironclad_private.patch2_closed_accounts
    where subject_digest = sha256(convert_to(new.clerk_user_id, 'UTF8'))
  ) then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function ironclad_private.reject_closed_player_identity() from public, anon, authenticated, service_role;
create trigger players_reject_closed_identity
before insert or update of clerk_user_id on public.players
for each row execute function ironclad_private.reject_closed_player_identity();

create or replace function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_sub text := nullif(btrim(p_clerk_user_id), '');
  v_result jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_sub is null then
    raise exception 'Missing Clerk subject' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:patch2-player-identity:' || v_sub, 0));
  update public.assistance_messages set actor_clerk_user_id = null where actor_clerk_user_id = v_sub;
  v_result := public.close_ironclad_player_account_without_private_assistance(v_sub);
  if (v_result->>'outcome') is null or (v_result->>'outcome') not in ('deleted', 'pseudonymized', 'not_found') then
    raise exception 'Unexpected database closure outcome' using errcode = 'P0001';
  end if;
  insert into ironclad_private.patch2_closed_accounts (subject_digest)
  values (sha256(convert_to(v_sub, 'UTF8'))) on conflict do nothing;
  return v_result;
end;
$$;

-- Older server actions lack an authenticated actor argument. Fail closed at
-- the database boundary once this migration is applied.
revoke execute on function public.review_tournament_registration_scoped(uuid, uuid, text, text),
  public.approve_tournament_registrations_scoped(uuid, uuid[]),
  public.read_admin_notification_inbox(text, uuid, integer, boolean, uuid),
  public.mutate_admin_notification_inbox(text, uuid, text, uuid[]),
  public.read_legacy_assistance_queue(uuid, integer, boolean) from service_role;

create function public.review_tournament_registration_scoped_as_admin(
  p_tournament_id uuid, p_registration_id uuid, p_registration_status text, p_admin_notes text,
  p_actor_clerk_user_id text
)
returns table (registration_id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_actor_clerk_user_id);
  return query select * from public.review_tournament_registration_scoped(
    p_tournament_id, p_registration_id, p_registration_status, p_admin_notes
  );
end;
$$;

create function public.approve_tournament_registrations_scoped_as_admin(
  p_tournament_id uuid, p_registration_ids uuid[], p_actor_clerk_user_id text
)
returns table (registration_id uuid, error_message text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_actor_clerk_user_id);
  return query select * from public.approve_tournament_registrations_scoped(p_tournament_id, p_registration_ids);
end;
$$;

create function public.read_admin_notification_inbox_as_admin(
  p_scope text, p_tournament_id uuid, p_page integer, p_unread_only boolean, p_selected_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_actor_clerk_user_id);
  return public.read_admin_notification_inbox(p_scope, p_tournament_id, p_page, p_unread_only, p_selected_id);
end;
$$;

create function public.mutate_admin_notification_inbox_as_admin(
  p_scope text, p_tournament_id uuid, p_action text, p_ids uuid[], p_actor_clerk_user_id text
)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_actor_clerk_user_id);
  return public.mutate_admin_notification_inbox(p_scope, p_tournament_id, p_action, p_ids);
end;
$$;

create function public.read_legacy_assistance_queue_as_admin(
  p_tournament_id uuid, p_page integer, p_include_resolved boolean, p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_actor_clerk_user_id);
  return public.read_legacy_assistance_queue(p_tournament_id, p_page, p_include_resolved);
end;
$$;

alter function public.set_legacy_assistance_status(uuid, uuid, text, bigint, text) set schema ironclad_private;
revoke all on function ironclad_private.set_legacy_assistance_status(uuid, uuid, text, bigint, text) from public, anon, authenticated, service_role;

create function public.set_legacy_assistance_status(
  p_id uuid, p_tournament_id uuid, p_status text, p_expected_version bigint, p_admin_clerk_id text
)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(p_admin_clerk_id);
  return ironclad_private.set_legacy_assistance_status(
    p_id, p_tournament_id, p_status, p_expected_version, p_admin_clerk_id
  );
end;
$$;

alter function public.call_patch2_private_assistance(text, jsonb, text, boolean) set schema ironclad_private;
revoke all on function ironclad_private.call_patch2_private_assistance(text, jsonb, text, boolean) from public, anon, authenticated, service_role;

create function public.call_patch2_private_assistance(
  p_operation text, p_arguments jsonb, p_actor_clerk_user_id text, p_actor_is_admin boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.require_patch2_open_account(btrim(p_actor_clerk_user_id));
  return ironclad_private.call_patch2_private_assistance(
    p_operation, p_arguments, p_actor_clerk_user_id, p_actor_is_admin
  );
end;
$$;

revoke all on function public.review_tournament_registration_scoped_as_admin(uuid, uuid, text, text, text),
  public.approve_tournament_registrations_scoped_as_admin(uuid, uuid[], text),
  public.read_admin_notification_inbox_as_admin(text, uuid, integer, boolean, uuid, text),
  public.mutate_admin_notification_inbox_as_admin(text, uuid, text, uuid[], text),
  public.read_legacy_assistance_queue_as_admin(uuid, integer, boolean, text),
  public.set_legacy_assistance_status(uuid, uuid, text, bigint, text),
  public.call_patch2_private_assistance(text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.review_tournament_registration_scoped_as_admin(uuid, uuid, text, text, text),
  public.approve_tournament_registrations_scoped_as_admin(uuid, uuid[], text),
  public.read_admin_notification_inbox_as_admin(text, uuid, integer, boolean, uuid, text),
  public.mutate_admin_notification_inbox_as_admin(text, uuid, text, uuid[], text),
  public.read_legacy_assistance_queue_as_admin(uuid, integer, boolean, text),
  public.set_legacy_assistance_status(uuid, uuid, text, bigint, text),
  public.call_patch2_private_assistance(text, jsonb, text, boolean) to service_role;

alter table ironclad_private.patch2_closed_accounts owner to postgres;
alter function ironclad_private.patch2_account_state(text) owner to postgres;
alter function ironclad_private.require_patch2_open_account(text) owner to postgres;
alter function ironclad_private.reject_closed_player_identity() owner to postgres;
alter function public.get_patch2_admin_account_state(text) owner to postgres;
alter function public.review_tournament_registration_scoped_as_admin(uuid, uuid, text, text, text) owner to postgres;
alter function public.approve_tournament_registrations_scoped_as_admin(uuid, uuid[], text) owner to postgres;
alter function public.read_admin_notification_inbox_as_admin(text, uuid, integer, boolean, uuid, text) owner to postgres;
alter function public.mutate_admin_notification_inbox_as_admin(text, uuid, text, uuid[], text) owner to postgres;
alter function public.read_legacy_assistance_queue_as_admin(uuid, integer, boolean, text) owner to postgres;
alter function public.set_legacy_assistance_status(uuid, uuid, text, bigint, text) owner to postgres;
alter function public.call_patch2_private_assistance(text, jsonb, text, boolean) owner to postgres;

notify pgrst, 'reload schema';
commit;
