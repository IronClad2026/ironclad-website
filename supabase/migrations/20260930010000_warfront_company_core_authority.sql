begin;

-- M12 adds Company lifecycle authority.  Every Player-originated core takes
-- the canonical shared closure barrier before domain locks.  Operations that
-- may race M3 Accept lock the Operation first, then Players, Companies, and
-- memberships, matching M3's Operation -> Player -> Company direction.

alter table public.warfront_companies
  add column archived_by_player_id uuid
    references public.players(id) on delete restrict;

alter table public.warfront_companies
  drop constraint warfront_companies_archive_state_check;
alter table public.warfront_companies
  add constraint warfront_companies_archive_state_check check (
    (status = 'active' and archived_at is null and archived_by_player_id is null)
    or (status = 'archived' and archived_at is not null)
  );

create table ironclad_private.warfront_company_commander_transfers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  company_id uuid not null references public.warfront_companies(id) on delete restrict,
  outgoing_player_id uuid not null references public.players(id) on delete restrict,
  incoming_player_id uuid not null references public.players(id) on delete restrict,
  transferred_at timestamptz not null,
  constraint warfront_company_commander_transfers_distinct_players_check
    check (outgoing_player_id <> incoming_player_id)
);

create table ironclad_private.warfront_operation_cancellations (
  operation_id uuid primary key references public.warfront_operations(id) on delete restrict,
  cancellation_kind text not null,
  cancelled_by_player_id uuid not null references public.players(id) on delete restrict,
  affected_player_id uuid not null references public.players(id) on delete restrict,
  cancelled_at timestamptz not null,
  constraint warfront_operation_cancellations_kind_check check (
    cancellation_kind in ('challenger_cancel', 'roster_member_left', 'roster_member_removed')
  ),
  constraint warfront_operation_cancellations_attribution_check check (
    (cancellation_kind in ('challenger_cancel', 'roster_member_left')
      and cancelled_by_player_id = affected_player_id)
    or (cancellation_kind = 'roster_member_removed'
      and cancelled_by_player_id <> affected_player_id)
  )
);

create function ironclad_private.protect_warfront_company_core_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'WARFRONT_COMPANY_CORE_HISTORY_IMMUTABLE' using errcode = '55000';
end;
$$;

create trigger warfront_company_commander_transfers_immutable
before update or delete on ironclad_private.warfront_company_commander_transfers
for each row execute function ironclad_private.protect_warfront_company_core_history();

create trigger warfront_operation_cancellations_immutable
  before update or delete on ironclad_private.warfront_operation_cancellations
  for each row execute function ironclad_private.protect_warfront_company_core_history();

-- M1's partial unique index prevents two active Commanders but cannot require
-- one.  Defer this check so creation, transfer, and archive remain atomic.
create function ironclad_private.require_one_commander_for_active_company()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_company_id uuid;
  v_company_status text;
  v_commander_count integer;
begin
  if tg_table_name = 'warfront_companies' and tg_op = 'DELETE' then
    v_company_id := old.id;
  elsif tg_table_name = 'warfront_companies' then
    v_company_id := new.id;
  elsif tg_op = 'DELETE' then
    v_company_id := old.company_id;
  else
    v_company_id := new.company_id;
  end if;

  select company.status into v_company_status
  from public.warfront_companies as company
  where company.id = v_company_id;

  if not found or v_company_status <> 'active' then
    return null;
  end if;

  select pg_catalog.count(*)::integer into v_commander_count
  from public.warfront_company_members as member
  where member.company_id = v_company_id
    and member.left_at is null
    and member.role = 'commander';

  if v_commander_count <> 1 then
    raise exception 'WARFRONT_ACTIVE_COMPANY_COMMANDER_INVARIANT' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger warfront_companies_one_active_commander
after insert or update or delete on public.warfront_companies
deferrable initially deferred
for each row execute function ironclad_private.require_one_commander_for_active_company();

create constraint trigger warfront_company_members_one_commander_for_active_company
after insert or update or delete on public.warfront_company_members
deferrable initially deferred
for each row execute function ironclad_private.require_one_commander_for_active_company();

do $$
begin
  if exists (
    select 1
    from public.warfront_companies as company
    where company.status = 'active'
      and (
        select pg_catalog.count(*)
        from public.warfront_company_members as member
        where member.company_id = company.id
          and member.left_at is null
          and member.role = 'commander'
      ) <> 1
  ) then
    raise exception 'WARFRONT_ACTIVE_COMPANY_COMMANDER_INVARIANT' using errcode = '23514';
  end if;
end;
$$;

create function ironclad_private.require_warfront_company_manager_locked(
  p_company_id uuid,
  p_actor_player_id uuid,
  p_allow_officer boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role text;
begin
  select member.role into v_role
  from public.warfront_company_members as member
  where member.company_id = p_company_id
    and member.player_id = p_actor_player_id
    and member.left_at is null
  for update;

  if not found
    or v_role not in ('commander', 'officer')
    or (not p_allow_officer and v_role <> 'commander') then
    raise exception 'WARFRONT_COMPANY_MANAGEMENT_UNAUTHORIZED' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

-- Caller holds the Operation row.  The same helper is used by explicit
-- challenger cancellation and leave/remove roster invalidation.
create function ironclad_private.cancel_warfront_open_operation_locked(
  p_operation_id uuid,
  p_actor_player_id uuid,
  p_affected_player_id uuid,
  p_cancellation_kind text,
  p_cancelled_at timestamptz
)
returns public.warfront_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
begin
  if p_operation_id is null or p_actor_player_id is null or p_affected_player_id is null
    or p_cancelled_at is null
    or p_cancellation_kind is null
    or p_cancellation_kind not in ('challenger_cancel', 'roster_member_left', 'roster_member_removed') then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_INPUT_INVALID' using errcode = '22023';
  end if;
  if (p_cancellation_kind in ('challenger_cancel', 'roster_member_left')
      and p_actor_player_id <> p_affected_player_id)
    or (p_cancellation_kind = 'roster_member_removed'
      and p_actor_player_id = p_affected_player_id) then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_ATTRIBUTION_INVALID' using errcode = '22023';
  end if;

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN' using errcode = '55000';
  end if;
  if v_operation.status <> 'open' or v_operation.opponent_company_id is not null then
    raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN' using errcode = '55000';
  end if;
  if v_operation.expires_at <= p_cancelled_at then
    raise exception 'WARFRONT_OPERATION_ALREADY_EXPIRED' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.warfront_operation_roster_entries as entry
    where entry.operation_id = v_operation.id
      and entry.side = 'challenger'
      and entry.player_id = p_affected_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_UNAUTHORIZED' using errcode = '42501';
  end if;

  update public.warfront_operations as operation
  set status = 'cancelled', cancelled_at = p_cancelled_at, updated_at = p_cancelled_at
  where operation.id = v_operation.id
    and operation.status = 'open'
    and operation.opponent_company_id is null
    and operation.expires_at > p_cancelled_at
  returning operation.* into v_operation;

  if not found then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_CONFLICT' using errcode = '40001';
  end if;

  insert into ironclad_private.warfront_operation_cancellations(
    operation_id, cancellation_kind, cancelled_by_player_id, affected_player_id, cancelled_at
  ) values (
    v_operation.id, p_cancellation_kind, p_actor_player_id, p_affected_player_id, p_cancelled_at
  );

  return v_operation;
end;
$$;

create function public.create_warfront_company(
  p_actor_clerk_user_id text, p_name text, p_tag text, p_slug text,
  p_description text default null, p_region text default null
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_company public.warfront_companies%rowtype;
  v_now timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';
  end if;
  if v_actor is null or p_name is null or p_tag is null or p_slug is null then
    raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';
  end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  perform player.id from public.players as player where player.id=v_player_id for update;
  if exists (select 1 from public.warfront_company_members as member where member.player_id=v_player_id and member.left_at is null) then
    raise exception 'WARFRONT_PLAYER_ALREADY_IN_COMPANY' using errcode='55000';
  end if;
  v_now := pg_catalog.clock_timestamp();
  insert into public.warfront_companies(name,tag,slug,description,region,status,founded_at,created_at,updated_at)
  values(p_name,p_tag,p_slug,p_description,p_region,'active',v_now,v_now,v_now)
  returning * into v_company;
  insert into public.warfront_company_members(company_id,player_id,role,joined_at,created_at,updated_at)
  values(v_company.id,v_player_id,'commander',v_now,v_now,v_now);
  update public.warfront_company_invitations set status='invalidated',invalidated_at=v_now,invalidation_reason='already_in_company'
  where recipient_player_id=v_player_id and status='pending';
  return pg_catalog.jsonb_build_object('companyId',v_company.id,'role','commander','createdAt',v_now,'duplicate',false);
end;
$$;

create function public.invite_warfront_company_player(p_company_id uuid, p_actor_clerk_user_id text, p_recipient_player_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),''); v_actor_id uuid; v_invitation public.warfront_company_invitations%rowtype; v_now timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_company_id is null or p_recipient_player_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared(); v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor); perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  perform player.id from public.players player where player.id in (v_actor_id,p_recipient_player_id) order by player.id for update;
  if not exists(select 1 from public.players player where player.id=p_recipient_player_id and player.account_closed_at is null) then raise exception 'WARFRONT_INVITATION_RECIPIENT_UNAVAILABLE' using errcode='P0002'; end if;
  perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;
  if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_company_manager_locked(p_company_id,v_actor_id,true);
  if exists(select 1 from public.warfront_company_members member where member.player_id=p_recipient_player_id and member.left_at is null) then raise exception 'WARFRONT_INVITATION_RECIPIENT_ALREADY_IN_COMPANY' using errcode='55000'; end if;
  select invitation.* into v_invitation from public.warfront_company_invitations invitation where invitation.company_id=p_company_id and invitation.recipient_player_id=p_recipient_player_id and invitation.status='pending' for update;
  if found then return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'companyId',p_company_id,'status','pending','duplicate',true); end if;
  v_now:=pg_catalog.clock_timestamp();
  insert into public.warfront_company_invitations(company_id,recipient_player_id,invited_by_player_id,status,created_at) values(p_company_id,p_recipient_player_id,v_actor_id,'pending',v_now) returning * into v_invitation;
  return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'companyId',p_company_id,'status','pending','duplicate',false);
end;
$$;

create function public.accept_warfront_company_invitation(p_invitation_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),''); v_actor_id uuid; v_company_id uuid; v_invitation public.warfront_company_invitations%rowtype; v_now timestamptz;v_affected integer;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_invitation_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared(); v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor); perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  perform player.id from public.players player where player.id=v_actor_id for update;
  select invitation.* into v_invitation from public.warfront_company_invitations invitation where invitation.id=p_invitation_id;
  if not found or v_invitation.recipient_player_id<>v_actor_id then raise exception 'WARFRONT_INVITATION_UNAVAILABLE' using errcode='42501'; end if;
  if v_invitation.status='accepted' then return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'companyId',v_invitation.company_id,'status','accepted','duplicate',true); end if;
  if v_invitation.status<>'pending' then raise exception 'WARFRONT_INVITATION_NOT_ACTIONABLE' using errcode='55000'; end if;
  v_company_id := v_invitation.company_id;
  perform company.id from public.warfront_companies company where company.id=v_company_id and company.status='active' for update;
  if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501'; end if;
  select invitation.* into v_invitation from public.warfront_company_invitations invitation where invitation.id=p_invitation_id for update;
  if not found or v_invitation.recipient_player_id<>v_actor_id then raise exception 'WARFRONT_INVITATION_UNAVAILABLE' using errcode='42501'; end if;
  if v_invitation.status='accepted' then return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'companyId',v_invitation.company_id,'status','accepted','duplicate',true); end if;
  if v_invitation.status<>'pending' then raise exception 'WARFRONT_INVITATION_NOT_ACTIONABLE' using errcode='55000'; end if;
  if exists(select 1 from public.warfront_company_members member where member.player_id=v_actor_id and member.left_at is null) then raise exception 'WARFRONT_PLAYER_ALREADY_IN_COMPANY' using errcode='55000'; end if;
  perform invitation.id from public.warfront_company_invitations invitation where invitation.recipient_player_id=v_actor_id and invitation.status='pending' order by invitation.company_id,invitation.id for update;
  v_now:=pg_catalog.clock_timestamp();
  insert into public.warfront_company_members(company_id,player_id,role,joined_at,created_at,updated_at) values(v_invitation.company_id,v_actor_id,'member',v_now,v_now,v_now);
  update public.warfront_company_invitations set status='accepted',accepted_at=v_now where id=v_invitation.id and status='pending';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_INVITATION_ACCEPTANCE_CONFLICT' using errcode='40001';end if;
  update public.warfront_company_invitations set status='invalidated',invalidated_at=v_now,invalidation_reason='already_in_company' where recipient_player_id=v_actor_id and status='pending';
  return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'companyId',v_invitation.company_id,'status','accepted','duplicate',false);
end;
$$;

create function public.decline_warfront_company_invitation(p_invitation_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),''); v_actor_id uuid; v_invitation public.warfront_company_invitations%rowtype; v_now timestamptz;v_affected integer;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_invitation_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  perform player.id from public.players player where player.id=v_actor_id for update;
  select invitation.* into v_invitation from public.warfront_company_invitations invitation where invitation.id=p_invitation_id for update;
  if not found or v_invitation.recipient_player_id<>v_actor_id then raise exception 'WARFRONT_INVITATION_UNAVAILABLE' using errcode='42501'; end if;
  if v_invitation.status='declined' then return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'status','declined','duplicate',true); end if;
  if v_invitation.status<>'pending' then raise exception 'WARFRONT_INVITATION_NOT_ACTIONABLE' using errcode='55000'; end if;
  v_now:=pg_catalog.clock_timestamp(); update public.warfront_company_invitations set status='declined',declined_at=v_now where id=v_invitation.id and status='pending';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_INVITATION_DECLINE_CONFLICT' using errcode='40001';end if;
  return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'status','declined','duplicate',false);
end;
$$;

create function public.revoke_warfront_company_invitation(p_invitation_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_company_id uuid;v_invitation public.warfront_company_invitations%rowtype;v_now timestamptz;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_invitation_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
 select invitation.company_id into v_company_id from public.warfront_company_invitations invitation where invitation.id=p_invitation_id;
 if not found then raise exception 'WARFRONT_INVITATION_UNAVAILABLE' using errcode='42501';end if;
 perform player.id from public.players player where player.id=v_actor_id for update;
 perform company.id from public.warfront_companies company where company.id=v_company_id and company.status='active' for update;
 if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 perform ironclad_private.require_warfront_company_manager_locked(v_company_id,v_actor_id,true);
 select invitation.* into v_invitation from public.warfront_company_invitations invitation where invitation.id=p_invitation_id for update;
 if not found or v_invitation.company_id<>v_company_id then raise exception 'WARFRONT_INVITATION_UNAVAILABLE' using errcode='42501';end if;
 if v_invitation.status='invalidated' and v_invitation.invalidation_reason='revoked' then return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'status','invalidated','duplicate',true);end if;
 if v_invitation.status<>'pending' then raise exception 'WARFRONT_INVITATION_NOT_ACTIONABLE' using errcode='55000';end if;
 v_now:=pg_catalog.clock_timestamp();update public.warfront_company_invitations set status='invalidated',invalidated_at=v_now,invalidation_reason='revoked' where id=v_invitation.id and status='pending';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_INVITATION_REVOKE_CONFLICT' using errcode='40001';end if;
 return pg_catalog.jsonb_build_object('invitationId',v_invitation.id,'status','invalidated','duplicate',false);
end;
$$;

create function public.leave_warfront_company(p_company_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_role text;v_operation_id uuid;v_now timestamptz;v_cancelled boolean:=false;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
 v_now:=pg_catalog.clock_timestamp();
 select operation.id into v_operation_id from public.warfront_operations operation join public.warfront_operation_roster_entries entry on entry.operation_id=operation.id and entry.side='challenger' and entry.player_id=v_actor_id where operation.challenger_company_id=p_company_id and operation.status='open' and operation.expires_at>v_now order by operation.id for update of operation;
 perform player.id from public.players player where player.id=v_actor_id for update;
 perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;
 if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 if v_operation_id is null then
   select operation.id into v_operation_id from public.warfront_operations operation join public.warfront_operation_roster_entries entry on entry.operation_id=operation.id and entry.side='challenger' and entry.player_id=v_actor_id where operation.challenger_company_id=p_company_id and operation.status='open' and operation.expires_at>v_now order by operation.id for update of operation;
 end if;
 select member.role into v_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=v_actor_id and member.left_at is null for update;
 if not found then raise exception 'WARFRONT_COMPANY_MEMBERSHIP_UNAVAILABLE' using errcode='42501';end if;
 if v_role='commander' then raise exception 'WARFRONT_COMMANDER_TRANSFER_OR_ARCHIVE_REQUIRED' using errcode='55000';end if;
 if v_operation_id is not null then perform ironclad_private.cancel_warfront_open_operation_locked(v_operation_id,v_actor_id,v_actor_id,'roster_member_left',v_now);v_cancelled:=true;end if;
 update public.warfront_company_members set left_at=v_now where company_id=p_company_id and player_id=v_actor_id and left_at is null;get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_COMPANY_MEMBERSHIP_CONFLICT' using errcode='40001';end if;
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'leftAt',v_now,'openOperationCancelled',v_cancelled);
end;
$$;

create function public.remove_warfront_company_member(p_company_id uuid,p_actor_clerk_user_id text,p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_actor_role text;v_target_role text;v_operation_id uuid;v_now timestamptz;v_cancelled boolean:=false;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or p_target_player_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
 if v_actor_id=p_target_player_id then raise exception 'WARFRONT_COMPANY_SELF_REMOVAL_INVALID' using errcode='22023';end if;
 v_now:=pg_catalog.clock_timestamp();
 select operation.id into v_operation_id from public.warfront_operations operation join public.warfront_operation_roster_entries entry on entry.operation_id=operation.id and entry.side='challenger' and entry.player_id=p_target_player_id where operation.challenger_company_id=p_company_id and operation.status='open' and operation.expires_at>v_now order by operation.id for update of operation;
 perform player.id from public.players player where player.id in (v_actor_id,p_target_player_id) order by player.id for update;
 perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 if v_operation_id is null then
   select operation.id into v_operation_id from public.warfront_operations operation join public.warfront_operation_roster_entries entry on entry.operation_id=operation.id and entry.side='challenger' and entry.player_id=p_target_player_id where operation.challenger_company_id=p_company_id and operation.status='open' and operation.expires_at>v_now order by operation.id for update of operation;
 end if;
 perform member.id from public.warfront_company_members member where member.company_id=p_company_id and member.player_id in(v_actor_id,p_target_player_id) and member.left_at is null order by member.player_id for update;
 select member.role into v_actor_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=v_actor_id and member.left_at is null for update;
 select member.role into v_target_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=p_target_player_id and member.left_at is null for update;
 if v_actor_role is null or v_actor_role not in ('commander','officer') or v_target_role is null then raise exception 'WARFRONT_COMPANY_MANAGEMENT_UNAUTHORIZED' using errcode='42501';end if;
 if v_target_role='commander' or (v_actor_role='officer' and v_target_role<>'member') then raise exception 'WARFRONT_COMPANY_MEMBER_REMOVAL_FORBIDDEN' using errcode='42501';end if;
 if v_operation_id is not null then perform ironclad_private.cancel_warfront_open_operation_locked(v_operation_id,v_actor_id,p_target_player_id,'roster_member_removed',v_now);v_cancelled:=true;end if;
 update public.warfront_company_members set left_at=v_now where company_id=p_company_id and player_id=p_target_player_id and left_at is null;get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_COMPANY_MEMBERSHIP_CONFLICT' using errcode='40001';end if;
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'removedAt',v_now,'openOperationCancelled',v_cancelled);
end;
$$;

create function public.promote_warfront_company_member_to_officer(p_company_id uuid,p_actor_clerk_user_id text,p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_target_role text;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or p_target_player_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);perform player.id from public.players player where player.id in(v_actor_id,p_target_player_id) order by player.id for update;perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;perform member.id from public.warfront_company_members member where member.company_id=p_company_id and member.player_id in(v_actor_id,p_target_player_id) and member.left_at is null order by member.player_id for update;perform ironclad_private.require_warfront_company_manager_locked(p_company_id,v_actor_id,false);
 select member.role into v_target_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=p_target_player_id and member.left_at is null for update;
 if v_target_role is null then raise exception 'WARFRONT_COMPANY_MEMBERSHIP_UNAVAILABLE' using errcode='42501';end if;
 if v_target_role='officer' then return pg_catalog.jsonb_build_object('companyId',p_company_id,'role','officer','duplicate',true);end if;
 if v_target_role<>'member' then raise exception 'WARFRONT_COMPANY_ROLE_TRANSITION_INVALID' using errcode='55000';end if;
 update public.warfront_company_members set role='officer' where company_id=p_company_id and player_id=p_target_player_id and left_at is null and role='member';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_COMPANY_ROLE_TRANSITION_CONFLICT' using errcode='40001';end if;
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'role','officer','duplicate',false);
end;
$$;

create function public.demote_warfront_company_officer_to_member(p_company_id uuid,p_actor_clerk_user_id text,p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_target_role text;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or p_target_player_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);perform player.id from public.players player where player.id in(v_actor_id,p_target_player_id) order by player.id for update;perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;perform member.id from public.warfront_company_members member where member.company_id=p_company_id and member.player_id in(v_actor_id,p_target_player_id) and member.left_at is null order by member.player_id for update;perform ironclad_private.require_warfront_company_manager_locked(p_company_id,v_actor_id,false);
 select member.role into v_target_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=p_target_player_id and member.left_at is null for update;
 if v_target_role is null then raise exception 'WARFRONT_COMPANY_MEMBERSHIP_UNAVAILABLE' using errcode='42501';end if;
 if v_target_role='member' then return pg_catalog.jsonb_build_object('companyId',p_company_id,'role','member','duplicate',true);end if;
 if v_target_role<>'officer' then raise exception 'WARFRONT_COMPANY_ROLE_TRANSITION_INVALID' using errcode='55000';end if;
 update public.warfront_company_members set role='member' where company_id=p_company_id and player_id=p_target_player_id and left_at is null and role='officer';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_COMPANY_ROLE_TRANSITION_CONFLICT' using errcode='40001';end if;
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'role','member','duplicate',false);
end;
$$;

create function public.transfer_warfront_company_commander(p_company_id uuid,p_actor_clerk_user_id text,p_target_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_target_role text;v_now timestamptz;v_outgoing_affected integer;v_incoming_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or p_target_player_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);if v_actor_id=p_target_player_id then raise exception 'WARFRONT_COMMANDER_TRANSFER_TARGET_INVALID' using errcode='22023';end if;
 perform player.id from public.players player where player.id in(v_actor_id,p_target_player_id) order by player.id for update;
 if not exists(select 1 from public.players player where player.id=p_target_player_id and player.account_closed_at is null) then raise exception 'WARFRONT_COMMANDER_TRANSFER_TARGET_UNAVAILABLE' using errcode='P0002';end if;
 perform company.id from public.warfront_companies company where company.id=p_company_id and company.status='active' for update;if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 perform member.id from public.warfront_company_members member where member.company_id=p_company_id and member.player_id in(v_actor_id,p_target_player_id) and member.left_at is null order by member.player_id for update;
 perform ironclad_private.require_warfront_company_manager_locked(p_company_id,v_actor_id,false);
 select member.role into v_target_role from public.warfront_company_members member where member.company_id=p_company_id and member.player_id=p_target_player_id and member.left_at is null for update;
 if v_target_role is null or v_target_role not in('member','officer') then raise exception 'WARFRONT_COMMANDER_TRANSFER_TARGET_INVALID' using errcode='55000';end if;
 v_now:=pg_catalog.clock_timestamp();update public.warfront_company_members set role='officer' where company_id=p_company_id and player_id=v_actor_id and left_at is null and role='commander';get diagnostics v_outgoing_affected=row_count;if v_outgoing_affected<>1 then raise exception 'WARFRONT_COMMANDER_TRANSFER_CONFLICT' using errcode='40001';end if;
 update public.warfront_company_members set role='commander' where company_id=p_company_id and player_id=p_target_player_id and left_at is null and role in('member','officer');get diagnostics v_incoming_affected=row_count;if v_incoming_affected<>1 then raise exception 'WARFRONT_COMMANDER_TRANSFER_CONFLICT' using errcode='40001';end if;
 insert into ironclad_private.warfront_company_commander_transfers(company_id,outgoing_player_id,incoming_player_id,transferred_at) values(p_company_id,v_actor_id,p_target_player_id,v_now);
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'transferredAt',v_now,'duplicate',false);
end;
$$;

create function public.archive_warfront_company(p_company_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_company public.warfront_companies%rowtype;v_now timestamptz;v_affected integer;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_company_id is null or v_actor is null then raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
 v_now:=pg_catalog.clock_timestamp();
 -- M3 Accept takes Operation first; archive follows that order for every blocking row.
 perform operation.id from public.warfront_operations operation where (operation.challenger_company_id=p_company_id or operation.opponent_company_id=p_company_id) and (operation.status in('accepted','in_progress','pending_result') or (operation.status='open' and operation.expires_at>v_now)) order by operation.id for update;
 perform player.id from public.players player where player.id=v_actor_id for update;
 select company.* into v_company from public.warfront_companies company where company.id=p_company_id for update;
 if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 if v_company.status='archived' then
   if v_company.archived_by_player_id=v_actor_id then return pg_catalog.jsonb_build_object('companyId',p_company_id,'status','archived','duplicate',true);end if;
   raise exception 'WARFRONT_COMPANY_MANAGEMENT_UNAUTHORIZED' using errcode='42501';
 end if;
 perform ironclad_private.require_warfront_company_manager_locked(p_company_id,v_actor_id,false);
 if exists(select 1 from public.warfront_operations operation where (operation.challenger_company_id=p_company_id or operation.opponent_company_id=p_company_id) and (operation.status in('accepted','in_progress','pending_result') or(operation.status='open' and operation.expires_at>v_now))) then raise exception 'WARFRONT_COMPANY_ACTIVE_OPERATION_BLOCKS_ARCHIVE' using errcode='55000';end if;
 update public.warfront_companies set status='archived',archived_at=v_now,archived_by_player_id=v_actor_id,updated_at=v_now where id=p_company_id and status='active';get diagnostics v_affected=row_count;if v_affected<>1 then raise exception 'WARFRONT_COMPANY_ARCHIVE_CONFLICT' using errcode='40001';end if;
 update public.warfront_company_members set left_at=v_now where company_id=p_company_id and left_at is null;
 update public.warfront_company_invitations set status='invalidated',invalidated_at=v_now,invalidation_reason='company_archived' where company_id=p_company_id and status='pending';
 return pg_catalog.jsonb_build_object('companyId',p_company_id,'status','archived','archivedAt',v_now,'duplicate',false);
end;
$$;

create function public.cancel_warfront_open_operation(p_operation_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_actor_id uuid;v_operation public.warfront_operations%rowtype;v_cancellation ironclad_private.warfront_operation_cancellations%rowtype;v_now timestamptz;
begin
 if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
 if p_operation_id is null or v_actor is null then raise exception 'WARFRONT_OPERATION_CANCELLATION_INPUT_INVALID' using errcode='22023';end if;
 perform ironclad_private.lock_warfront_account_closure_shared();
 select operation.* into v_operation from public.warfront_operations operation where operation.id=p_operation_id for update;
 if not found then raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN' using errcode='55000';end if;
 v_actor_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);perform player.id from public.players player where player.id=v_actor_id for update;
 if v_operation.status='cancelled' then
   select cancellation.* into v_cancellation from ironclad_private.warfront_operation_cancellations cancellation where cancellation.operation_id=v_operation.id;
   if found and v_cancellation.cancellation_kind='challenger_cancel' and v_cancellation.cancelled_by_player_id=v_actor_id and v_cancellation.affected_player_id=v_actor_id and v_cancellation.cancelled_at=v_operation.cancelled_at and v_operation.opponent_company_id is null and v_operation.accepted_by_player_id is null and v_operation.opponent_roster_elo_snapshot is null and v_operation.accepted_at is null and v_operation.roster_locked_at is null and exists(select 1 from public.warfront_operation_roster_entries entry where entry.operation_id=v_operation.id and entry.side='challenger' and entry.player_id=v_actor_id) then
     return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'cancelledAt',v_operation.cancelled_at,'duplicate',true);
   end if;
   raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN' using errcode='55000';
 end if;
 perform company.id from public.warfront_companies company where company.id=v_operation.challenger_company_id and company.status='active' for update;if not found then raise exception 'WARFRONT_COMPANY_UNAVAILABLE' using errcode='42501';end if;
 if not exists(select 1 from public.warfront_company_members member where member.company_id=v_operation.challenger_company_id and member.player_id=v_actor_id and member.left_at is null) then raise exception 'WARFRONT_OPERATION_CANCELLATION_UNAUTHORIZED' using errcode='42501';end if;
 v_now:=pg_catalog.clock_timestamp();v_operation:=ironclad_private.cancel_warfront_open_operation_locked(p_operation_id,v_actor_id,v_actor_id,'challenger_cancel',v_now);
 return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'cancelledAt',v_operation.cancelled_at,'duplicate',false);
end;
$$;

-- Service-role wrappers are the only API surface.  They deliberately accept
-- explicit Clerk identity only after the future Server Action has authenticated it.
create function public.create_warfront_company_api(text,text,text,text,text,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.create_warfront_company($1,$2,$3,$4,$5,$6); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.invite_warfront_company_player_api(uuid,text,uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.invite_warfront_company_player($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.accept_warfront_company_invitation_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.accept_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.decline_warfront_company_invitation_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.decline_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.revoke_warfront_company_invitation_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.revoke_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.leave_warfront_company_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.leave_warfront_company($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.remove_warfront_company_member_api(uuid,text,uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.remove_warfront_company_member($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.promote_warfront_company_member_to_officer_api(uuid,text,uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.promote_warfront_company_member_to_officer($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.demote_warfront_company_officer_to_member_api(uuid,text,uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.demote_warfront_company_officer_to_member($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.transfer_warfront_company_commander_api(uuid,text,uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.transfer_warfront_company_commander($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.archive_warfront_company_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.archive_warfront_company($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;
create function public.cancel_warfront_open_operation_api(uuid,text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.cancel_warfront_open_operation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

alter table ironclad_private.warfront_company_commander_transfers owner to postgres;
alter table ironclad_private.warfront_company_commander_transfers enable row level security;
alter table ironclad_private.warfront_company_commander_transfers force row level security;
alter table ironclad_private.warfront_operation_cancellations owner to postgres;
alter table ironclad_private.warfront_operation_cancellations enable row level security;
alter table ironclad_private.warfront_operation_cancellations force row level security;
alter table public.warfront_companies owner to postgres;
revoke all on table ironclad_private.warfront_company_commander_transfers,ironclad_private.warfront_operation_cancellations from public,anon,authenticated,service_role;

alter function ironclad_private.protect_warfront_company_core_history() owner to postgres;
alter function ironclad_private.require_one_commander_for_active_company() owner to postgres;
alter function ironclad_private.require_warfront_company_manager_locked(uuid,uuid,boolean) owner to postgres;
alter function ironclad_private.cancel_warfront_open_operation_locked(uuid,uuid,uuid,text,timestamptz) owner to postgres;
revoke all on function ironclad_private.protect_warfront_company_core_history(),ironclad_private.require_one_commander_for_active_company(),ironclad_private.require_warfront_company_manager_locked(uuid,uuid,boolean),ironclad_private.cancel_warfront_open_operation_locked(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;

alter function public.create_warfront_company(text,text,text,text,text,text) owner to postgres;
alter function public.invite_warfront_company_player(uuid,text,uuid) owner to postgres;
alter function public.accept_warfront_company_invitation(uuid,text) owner to postgres;
alter function public.decline_warfront_company_invitation(uuid,text) owner to postgres;
alter function public.revoke_warfront_company_invitation(uuid,text) owner to postgres;
alter function public.leave_warfront_company(uuid,text) owner to postgres;
alter function public.remove_warfront_company_member(uuid,text,uuid) owner to postgres;
alter function public.promote_warfront_company_member_to_officer(uuid,text,uuid) owner to postgres;
alter function public.demote_warfront_company_officer_to_member(uuid,text,uuid) owner to postgres;
alter function public.transfer_warfront_company_commander(uuid,text,uuid) owner to postgres;
alter function public.archive_warfront_company(uuid,text) owner to postgres;
alter function public.cancel_warfront_open_operation(uuid,text) owner to postgres;
revoke all on function public.create_warfront_company(text,text,text,text,text,text),public.invite_warfront_company_player(uuid,text,uuid),public.accept_warfront_company_invitation(uuid,text),public.decline_warfront_company_invitation(uuid,text),public.revoke_warfront_company_invitation(uuid,text),public.leave_warfront_company(uuid,text),public.remove_warfront_company_member(uuid,text,uuid),public.promote_warfront_company_member_to_officer(uuid,text,uuid),public.demote_warfront_company_officer_to_member(uuid,text,uuid),public.transfer_warfront_company_commander(uuid,text,uuid),public.archive_warfront_company(uuid,text),public.cancel_warfront_open_operation(uuid,text) from public,anon,authenticated,service_role;

alter function public.create_warfront_company_api(text,text,text,text,text,text) owner to postgres;
alter function public.invite_warfront_company_player_api(uuid,text,uuid) owner to postgres;
alter function public.accept_warfront_company_invitation_api(uuid,text) owner to postgres;
alter function public.decline_warfront_company_invitation_api(uuid,text) owner to postgres;
alter function public.revoke_warfront_company_invitation_api(uuid,text) owner to postgres;
alter function public.leave_warfront_company_api(uuid,text) owner to postgres;
alter function public.remove_warfront_company_member_api(uuid,text,uuid) owner to postgres;
alter function public.promote_warfront_company_member_to_officer_api(uuid,text,uuid) owner to postgres;
alter function public.demote_warfront_company_officer_to_member_api(uuid,text,uuid) owner to postgres;
alter function public.transfer_warfront_company_commander_api(uuid,text,uuid) owner to postgres;
alter function public.archive_warfront_company_api(uuid,text) owner to postgres;
alter function public.cancel_warfront_open_operation_api(uuid,text) owner to postgres;
revoke all on function public.create_warfront_company_api(text,text,text,text,text,text),public.invite_warfront_company_player_api(uuid,text,uuid),public.accept_warfront_company_invitation_api(uuid,text),public.decline_warfront_company_invitation_api(uuid,text),public.revoke_warfront_company_invitation_api(uuid,text),public.leave_warfront_company_api(uuid,text),public.remove_warfront_company_member_api(uuid,text,uuid),public.promote_warfront_company_member_to_officer_api(uuid,text,uuid),public.demote_warfront_company_officer_to_member_api(uuid,text,uuid),public.transfer_warfront_company_commander_api(uuid,text,uuid),public.archive_warfront_company_api(uuid,text),public.cancel_warfront_open_operation_api(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_warfront_company_api(text,text,text,text,text,text),public.invite_warfront_company_player_api(uuid,text,uuid),public.accept_warfront_company_invitation_api(uuid,text),public.decline_warfront_company_invitation_api(uuid,text),public.revoke_warfront_company_invitation_api(uuid,text),public.leave_warfront_company_api(uuid,text),public.remove_warfront_company_member_api(uuid,text,uuid),public.promote_warfront_company_member_to_officer_api(uuid,text,uuid),public.demote_warfront_company_officer_to_member_api(uuid,text,uuid),public.transfer_warfront_company_commander_api(uuid,text,uuid),public.archive_warfront_company_api(uuid,text),public.cancel_warfront_open_operation_api(uuid,text) to service_role;

comment on table ironclad_private.warfront_company_commander_transfers is 'Immutable private Commander handover audit. Role intervals remain in M1 membership storage.';
comment on table ironclad_private.warfront_operation_cancellations is 'Immutable private noncompetitive cancellation attribution for logically open WARFRONT Operations only.';

commit;
