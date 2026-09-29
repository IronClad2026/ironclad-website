begin;

-- M8 owns only Operation Room communication/support retention. Competitive
-- Operation facts, rosters, dice and future result authority are untouched.

create table ironclad_private.warfront_operation_room_content_purges (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  purged_at timestamptz not null default pg_catalog.clock_timestamp(),
  purge_reason text not null,
  purged_by_admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  messages_deleted integer not null,
  constraint warfront_operation_room_content_purges_reason_check check (
    purge_reason = 'routine_retention'
  ),
  constraint warfront_operation_room_content_purges_messages_deleted_check check (
    messages_deleted >= 0
  )
);

create table ironclad_private.warfront_operation_room_retention_cases (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  case_reference uuid not null,
  case_kind text not null,
  opened_at timestamptz not null default pg_catalog.clock_timestamp(),
  closed_at timestamptz,
  opened_by_admin_actor_id uuid not null
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  closed_by_admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint warfront_operation_room_retention_cases_reference_key unique (
    operation_id,
    case_reference
  ),
  constraint warfront_operation_room_retention_cases_operation_id_id_key unique (
    operation_id,
    id
  ),
  constraint warfront_operation_room_retention_cases_kind_check check (
    case_kind in (
      'support', 'complaint', 'privacy', 'abuse_safety',
      'competition_integrity', 'dispute'
    )
  ),
  constraint warfront_operation_room_retention_cases_close_check check (
    (closed_at is null and closed_by_admin_actor_id is null)
    or (
      closed_at is not null
      and closed_at >= opened_at
      and closed_by_admin_actor_id is not null
    )
  ),
  constraint warfront_operation_room_retention_cases_updated_at_check check (
    updated_at >= opened_at
  )
);

create index warfront_operation_room_retention_cases_operation_idx
  on ironclad_private.warfront_operation_room_retention_cases(
    operation_id,
    closed_at,
    id
  );
create index warfront_operation_room_retention_cases_active_idx
  on ironclad_private.warfront_operation_room_retention_cases(
    operation_id,
    id
  ) where closed_at is null;

create table ironclad_private.warfront_operation_room_retention_holds (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  case_id uuid not null,
  reason text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz,
  released_at timestamptz,
  created_by_admin_actor_id uuid not null
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  released_by_admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  constraint warfront_operation_room_retention_holds_case_operation_fkey
    foreign key (operation_id, case_id)
    references ironclad_private.warfront_operation_room_retention_cases(
      operation_id,
      id
    ) on delete restrict,
  constraint warfront_operation_room_retention_holds_reason_check check (
    reason in (
      'legal', 'security', 'abuse_safety', 'competition_integrity', 'privacy'
    )
  ),
  constraint warfront_operation_room_retention_holds_expiry_check check (
    expires_at is null or expires_at > created_at
  ),
  constraint warfront_operation_room_retention_holds_release_check check (
    (released_at is null and released_by_admin_actor_id is null)
    or (
      released_at is not null
      and released_at >= created_at
      and released_by_admin_actor_id is not null
    )
  )
);

create index warfront_operation_room_retention_holds_operation_idx
  on ironclad_private.warfront_operation_room_retention_holds(
    operation_id,
    released_at,
    expires_at,
    id
  );
create index warfront_operation_room_retention_holds_case_idx
  on ironclad_private.warfront_operation_room_retention_holds(case_id, id);

create table ironclad_private.warfront_operation_room_privacy_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  action text not null,
  admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  case_id uuid
    references ironclad_private.warfront_operation_room_retention_cases(id)
    on delete restrict,
  hold_id uuid
    references ironclad_private.warfront_operation_room_retention_holds(id)
    on delete restrict,
  affected_message_count integer not null default 0,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint warfront_operation_room_privacy_audit_action_check check (
    action in (
      'case_opened', 'case_closed', 'hold_created', 'hold_released',
      'messages_redacted', 'routine_purged'
    )
  ),
  constraint warfront_operation_room_privacy_audit_count_check check (
    affected_message_count >= 0
  )
);

create index warfront_operation_room_privacy_audit_operation_idx
  on ironclad_private.warfront_operation_room_privacy_audit(
    operation_id,
    occurred_at desc,
    id
  );
create index warfront_operation_room_privacy_audit_case_idx
  on ironclad_private.warfront_operation_room_privacy_audit(case_id)
  where case_id is not null;
create index warfront_operation_room_privacy_audit_hold_idx
  on ironclad_private.warfront_operation_room_privacy_audit(hold_id)
  where hold_id is not null;

-- Observational state used by preview and rechecked while the Operation is
-- locked by every destructive core. It never infers a dispute from PENDING_RESULT.
create function ironclad_private.warfront_operation_room_retention_state(
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_required_size integer;
  v_total integer;
  v_challenger integer;
  v_opponent integer;
  v_distinct integer;
  v_terminal_at timestamptz;
  v_purged_at timestamptz;
  v_message_count bigint := 0;
  v_active_case boolean := false;
  v_active_hold boolean := false;
  v_unresolved_assistance boolean := false;
  v_reason text;
begin
  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'operationId', p_operation_id,
      'state', 'blocked',
      'blockedReason', 'operation_unavailable',
      'terminalAt', null,
      'eligibleAt', null,
      'messageCount', 0,
      'hasActiveCase', false,
      'hasActiveHold', false,
      'hasUnresolvedAssistance', false,
      'contentPurgedAt', null
    );
  end if;

  select purge.purged_at into v_purged_at
  from ironclad_private.warfront_operation_room_content_purges as purge
  where purge.operation_id = v_operation.id;
  select pg_catalog.count(*) into v_message_count
  from public.warfront_operation_chat_messages as message
  where message.operation_id = v_operation.id;

  if v_purged_at is not null then
    return pg_catalog.jsonb_build_object(
      'operationId', v_operation.id,
      'state', 'already_purged',
      'blockedReason', null,
      'terminalAt', case
        when v_operation.status = 'completed' then v_operation.completed_at
        when v_operation.status = 'cancelled' then v_operation.cancelled_at
        else null
      end,
      'eligibleAt', null,
      'messageCount', v_message_count,
      'hasActiveCase', false,
      'hasActiveHold', false,
      'hasUnresolvedAssistance', false,
      'contentPurgedAt', v_purged_at
    );
  end if;

  if v_operation.opponent_company_id is null
    or v_operation.accepted_by_player_id is null
    or v_operation.opponent_roster_elo_snapshot is null
    or v_operation.accepted_at is null
    or v_operation.roster_locked_at is null then
    v_reason := 'accepted_room_inconsistent';
  else
    v_required_size := case v_operation.format
      when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else null
    end;
    if v_required_size is null then
      v_reason := 'accepted_room_inconsistent';
    else
      select
        pg_catalog.count(*)::integer,
        pg_catalog.count(*) filter (where entry.side = 'challenger')::integer,
        pg_catalog.count(*) filter (where entry.side = 'opponent')::integer,
        pg_catalog.count(distinct entry.player_id)::integer
      into v_total, v_challenger, v_opponent, v_distinct
      from public.warfront_operation_roster_entries as entry
      where entry.operation_id = v_operation.id;
      if v_total <> v_required_size * 2
        or v_challenger <> v_required_size
        or v_opponent <> v_required_size
        or v_distinct <> v_total then
        v_reason := 'accepted_room_inconsistent';
      end if;
    end if;
  end if;

  if v_reason is null then
    if v_operation.status = 'completed' then
      v_terminal_at := v_operation.completed_at;
    elsif v_operation.status = 'cancelled' and v_operation.accepted_at is not null then
      v_terminal_at := v_operation.cancelled_at;
    else
      v_reason := 'operation_not_terminal';
    end if;
  end if;

  if v_reason is null and v_terminal_at is null then
    v_reason := 'terminal_timestamp_missing';
  elsif v_reason is null and v_terminal_at > pg_catalog.clock_timestamp() then
    v_reason := 'terminal_timestamp_in_future';
  end if;

  select exists (
    select 1 from ironclad_private.warfront_operation_room_retention_cases as retention_case
    where retention_case.operation_id = v_operation.id
      and retention_case.closed_at is null
  ) into v_active_case;
  select exists (
    select 1 from ironclad_private.warfront_operation_room_retention_holds as hold
    where hold.operation_id = v_operation.id
      and hold.released_at is null
      and (hold.expires_at is null or hold.expires_at > pg_catalog.clock_timestamp())
  ) into v_active_hold;
  select exists (
    select 1 from public.warfront_operation_room_assistance as assistance
    where assistance.operation_id = v_operation.id
      and assistance.status = 'requested'
  ) into v_unresolved_assistance;

  if v_reason is null and v_active_case then
    v_reason := 'active_formal_case';
  elsif v_reason is null and v_active_hold then
    v_reason := 'active_room_hold';
  elsif v_reason is null and v_unresolved_assistance then
    v_reason := 'unresolved_assistance';
  elsif v_reason is null
    and v_terminal_at + interval '40 days' > pg_catalog.clock_timestamp() then
    v_reason := 'routine_retention_not_elapsed';
  end if;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'state', case when v_reason is null then 'eligible' else 'blocked' end,
    'blockedReason', v_reason,
    'terminalAt', v_terminal_at,
    'eligibleAt', case when v_terminal_at is null then null else v_terminal_at + interval '40 days' end,
    'messageCount', v_message_count,
    'hasActiveCase', v_active_case,
    'hasActiveHold', v_active_hold,
    'hasUnresolvedAssistance', v_unresolved_assistance,
    'contentPurgedAt', null
  );
end;
$$;

-- Use M7's per-recipient advisory key so deletion cannot lose or prematurely
-- resolve an episode while a participant mark-read is deciding the same state.
create function ironclad_private.reconcile_warfront_operation_room_notification_episodes(
  p_operation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate record;
  v_resolved record;
begin
  for v_candidate in
    select episode.id, episode.recipient_player_id
    from public.warfront_operation_room_notification_episodes as episode
    where episode.operation_id = p_operation_id
      and episode.resolved_at is null
    order by episode.recipient_player_id, episode.id
  loop
    perform ironclad_private.lock_warfront_operation_room_notification(
      p_operation_id,
      v_candidate.recipient_player_id
    );
    for v_resolved in
      update public.warfront_operation_room_notification_episodes as episode
      set resolved_at = pg_catalog.clock_timestamp()
      where episode.id = v_candidate.id
        and episode.resolved_at is null
        and not exists (
          select 1
          from public.warfront_operation_chat_messages as message
          left join public.warfront_operation_room_reads as read_cursor
            on read_cursor.operation_id = message.operation_id
           and read_cursor.player_id = episode.recipient_player_id
          where message.operation_id = p_operation_id
            and message.sequence > coalesce(read_cursor.last_read_sequence, 0)
            and (
              message.sender_kind = 'admin'
              or message.sender_player_id is distinct from episode.recipient_player_id
            )
        )
      returning episode.notification_id
    loop
      perform ironclad_private.finish_warfront_operation_room_notification(
        v_resolved.notification_id,
        true
      );
    end loop;
  end loop;
end;
$$;

-- M6 message history remains immutable except a transaction-local capability
-- used only by M8 owner-only retention/redaction cores. UPDATE is never allowed.
create or replace function ironclad_private.protect_warfront_operation_chat_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE'
    and current_setting(
      'ironclad.warfront_operation_room_retention_delete',
      true
    ) = 'on' then
    return old;
  end if;
  raise exception 'WARFRONT_OPERATION_CHAT_MESSAGES_IMMUTABLE'
    using errcode = '55000';
end;
$$;

create function public.preview_warfront_operation_room_retention(
  p_operation_ids uuid[],
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_rows jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  if p_operation_ids is null
    or coalesce(pg_catalog.array_ndims(p_operation_ids), 0) <> 1
    or pg_catalog.cardinality(p_operation_ids) not between 1 and 100
    or pg_catalog.array_position(p_operation_ids, null::uuid) is not null
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_operation_ids) as ids(id)) <> pg_catalog.cardinality(p_operation_ids)
    or v_actor is null or pg_catalog.char_length(v_actor) > 256 or v_actor ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode = '22023';
  end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  select coalesce(pg_catalog.jsonb_agg(
    ironclad_private.warfront_operation_room_retention_state(ids.id) order by ids.id
  ), '[]'::jsonb) into v_rows
  from pg_catalog.unnest(p_operation_ids) as ids(id);
  return pg_catalog.jsonb_build_object('operations', v_rows);
end;
$$;

create function public.preview_warfront_operation_room_retention_api(
  p_operation_ids uuid[], p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  return public.preview_warfront_operation_room_retention(p_operation_ids, p_admin_clerk_user_id);
end;
$$;

create function public.open_warfront_operation_room_retention_case(
  p_operation_id uuid,
  p_case_reference uuid,
  p_case_kind text,
  p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_case_kind text := pg_catalog.nullif(pg_catalog.btrim(p_case_kind), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_case_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or p_case_reference is null or v_case_kind is null or v_case_kind not in ('support','complaint','privacy','abuse_safety','competition_integrity','dispute')
    or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  if exists(select 1 from ironclad_private.warfront_operation_room_content_purges where operation_id=v_operation.id) then
    raise exception 'WARFRONT_OPERATION_ROOM_EVIDENCE_UNAVAILABLE' using errcode='55000';
  end if;
  if exists (
    select 1
    from ironclad_private.warfront_operation_room_retention_cases as retention_case
    where retention_case.operation_id = v_operation.id
      and retention_case.case_reference = p_case_reference
  ) then
    raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_CASE_ALREADY_EXISTS'
      using errcode = '55000';
  end if;
  insert into ironclad_private.warfront_operation_room_retention_cases(
    operation_id,case_reference,case_kind,opened_by_admin_actor_id
  ) values(v_operation.id,p_case_reference,v_case_kind,v_admin_actor_id)
  returning id into v_case_id;
  insert into ironclad_private.warfront_operation_room_privacy_audit(
    operation_id,action,admin_actor_id,case_id
  ) values(v_operation.id,'case_opened',v_admin_actor_id,v_case_id);
  return pg_catalog.jsonb_build_object('caseId',v_case_id,'operationId',v_operation.id,'caseReference',p_case_reference,'caseKind',v_case_kind);
end;
$$;

create function public.open_warfront_operation_room_retention_case_api(uuid,uuid,text,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.open_warfront_operation_room_retention_case($1,$2,$3,$4);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.close_warfront_operation_room_retention_case(
  p_case_id uuid, p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_case ironclad_private.warfront_operation_room_retention_cases%rowtype;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_case_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select retention_case.* into v_case from ironclad_private.warfront_operation_room_retention_cases as retention_case where retention_case.id=p_case_id;
  if not found then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_CASE_UNAVAILABLE' using errcode='42501'; end if;
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=v_case.operation_id for update;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select retention_case.* into v_case from ironclad_private.warfront_operation_room_retention_cases as retention_case where retention_case.id=p_case_id for update;
  if v_case.closed_at is not null then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_CASE_ALREADY_CLOSED' using errcode='55000'; end if;
  update ironclad_private.warfront_operation_room_retention_cases set closed_at=pg_catalog.clock_timestamp(),closed_by_admin_actor_id=v_admin_actor_id,updated_at=pg_catalog.clock_timestamp() where id=v_case.id;
  insert into ironclad_private.warfront_operation_room_privacy_audit(operation_id,action,admin_actor_id,case_id) values(v_operation.id,'case_closed',v_admin_actor_id,v_case.id);
  return pg_catalog.jsonb_build_object('caseId',v_case.id,'operationId',v_operation.id,'closedAt',pg_catalog.clock_timestamp());
end;
$$;

create function public.close_warfront_operation_room_retention_case_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.close_warfront_operation_room_retention_case($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.create_warfront_operation_room_retention_hold(
  p_operation_id uuid, p_case_id uuid, p_reason text, p_expires_at timestamptz,
  p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_reason text := pg_catalog.nullif(pg_catalog.btrim(p_reason), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_case ironclad_private.warfront_operation_room_retention_cases%rowtype;
  v_hold_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or p_case_id is null or v_reason is null or v_reason not in ('legal','security','abuse_safety','competition_integrity','privacy')
    or (p_expires_at is not null and p_expires_at <= pg_catalog.clock_timestamp())
    or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  if exists(select 1 from ironclad_private.warfront_operation_room_content_purges where operation_id=v_operation.id) then raise exception 'WARFRONT_OPERATION_ROOM_EVIDENCE_UNAVAILABLE' using errcode='55000'; end if;
  select retention_case.* into v_case from ironclad_private.warfront_operation_room_retention_cases as retention_case where retention_case.id=p_case_id for update;
  if not found or v_case.operation_id <> v_operation.id then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_CASE_UNAVAILABLE' using errcode='42501'; end if;
  insert into ironclad_private.warfront_operation_room_retention_holds(operation_id,case_id,reason,expires_at,created_by_admin_actor_id)
  values(v_operation.id,v_case.id,v_reason,p_expires_at,v_admin_actor_id) returning id into v_hold_id;
  insert into ironclad_private.warfront_operation_room_privacy_audit(operation_id,action,admin_actor_id,case_id,hold_id) values(v_operation.id,'hold_created',v_admin_actor_id,v_case.id,v_hold_id);
  return pg_catalog.jsonb_build_object('holdId',v_hold_id,'operationId',v_operation.id,'caseId',v_case.id,'expiresAt',p_expires_at);
end;
$$;

create function public.create_warfront_operation_room_retention_hold_api(uuid,uuid,text,timestamptz,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.create_warfront_operation_room_retention_hold($1,$2,$3,$4,$5);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.release_warfront_operation_room_retention_hold(
  p_hold_id uuid, p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_hold ironclad_private.warfront_operation_room_retention_holds%rowtype;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_hold_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select hold.* into v_hold from ironclad_private.warfront_operation_room_retention_holds as hold where hold.id=p_hold_id;
  if not found then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_HOLD_UNAVAILABLE' using errcode='42501'; end if;
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=v_hold.operation_id for update;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select hold.* into v_hold from ironclad_private.warfront_operation_room_retention_holds as hold where hold.id=p_hold_id for update;
  if v_hold.released_at is not null then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_HOLD_ALREADY_RELEASED' using errcode='55000'; end if;
  update ironclad_private.warfront_operation_room_retention_holds set released_at=pg_catalog.clock_timestamp(),released_by_admin_actor_id=v_admin_actor_id where id=v_hold.id;
  insert into ironclad_private.warfront_operation_room_privacy_audit(operation_id,action,admin_actor_id,case_id,hold_id) values(v_operation.id,'hold_released',v_admin_actor_id,v_hold.case_id,v_hold.id);
  return pg_catalog.jsonb_build_object('holdId',v_hold.id,'operationId',v_operation.id,'releasedAt',pg_catalog.clock_timestamp());
end;
$$;

create function public.release_warfront_operation_room_retention_hold_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.release_warfront_operation_room_retention_hold($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.redact_warfront_operation_room_messages(
  p_operation_id uuid, p_subject_kind text, p_subject_id uuid,
  p_message_ids uuid[], p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_subject_kind text := pg_catalog.nullif(pg_catalog.btrim(p_subject_kind), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_state jsonb;
  v_previous text;
  v_deleted integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or p_subject_id is null or v_subject_kind is null or v_subject_kind not in ('player','admin')
    or p_message_ids is null or coalesce(pg_catalog.array_ndims(p_message_ids),0) <> 1
    or pg_catalog.cardinality(p_message_ids) not between 1 and 1000
    or pg_catalog.array_position(p_message_ids,null::uuid) is not null
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_message_ids) as ids(id)) <> pg_catalog.cardinality(p_message_ids)
    or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  if v_operation.status not in ('completed','cancelled') then raise exception 'WARFRONT_OPERATION_ROOM_REDACTION_READ_ONLY' using errcode='55000'; end if;
  v_state := ironclad_private.warfront_operation_room_retention_state(v_operation.id);
  if v_state->>'state' = 'already_purged' then raise exception 'WARFRONT_OPERATION_ROOM_EVIDENCE_UNAVAILABLE' using errcode='55000'; end if;
  if coalesce((v_state->>'hasActiveCase')::boolean,false) or coalesce((v_state->>'hasActiveHold')::boolean,false) then raise exception 'WARFRONT_OPERATION_ROOM_REDACTION_BLOCKED' using errcode='55000'; end if;
  if (select pg_catalog.count(*) from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and message.id=any(p_message_ids)
      and ((v_subject_kind='player' and message.sender_kind='player' and message.sender_player_id=p_subject_id) or (v_subject_kind='admin' and message.sender_kind='admin' and message.admin_actor_id=p_subject_id))) <> pg_catalog.cardinality(p_message_ids) then
    raise exception 'WARFRONT_OPERATION_ROOM_REDACTION_SCOPE_INVALID' using errcode='42501';
  end if;
  v_previous := current_setting('ironclad.warfront_operation_room_retention_delete',true);
  perform set_config('ironclad.warfront_operation_room_retention_delete','on',true);
  delete from public.warfront_operation_chat_messages where operation_id=v_operation.id and id=any(p_message_ids);
  get diagnostics v_deleted=row_count;
  perform set_config('ironclad.warfront_operation_room_retention_delete',coalesce(v_previous,''),true);
  perform ironclad_private.reconcile_warfront_operation_room_notification_episodes(v_operation.id);
  insert into ironclad_private.warfront_operation_room_privacy_audit(operation_id,action,admin_actor_id,affected_message_count) values(v_operation.id,'messages_redacted',v_admin_actor_id,v_deleted);
  return pg_catalog.jsonb_build_object('operationId',v_operation.id,'messagesRedacted',v_deleted);
exception when others then
  if v_previous is not null then perform set_config('ironclad.warfront_operation_room_retention_delete',v_previous,true); end if;
  raise;
end;
$$;

create function public.redact_warfront_operation_room_messages_api(uuid,text,uuid,uuid[],text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.redact_warfront_operation_room_messages($1,$2,$3,$4,$5);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.purge_warfront_operation_room_retention(
  p_operation_ids uuid[], p_admin_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_admin_actor_id uuid;
  v_operation_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_state jsonb;
  v_previous text;
  v_messages_deleted integer;
  v_assistance public.warfront_operation_room_assistance%rowtype;
  v_notification_id uuid;
  v_results jsonb := '[]'::jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_ids is null or coalesce(pg_catalog.array_ndims(p_operation_ids),0) <> 1
    or pg_catalog.cardinality(p_operation_ids) not between 1 and 25
    or pg_catalog.array_position(p_operation_ids,null::uuid) is not null
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_operation_ids) as ids(id)) <> pg_catalog.cardinality(p_operation_ids)
    or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_RETENTION_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  for v_operation_id in select ids.id from pg_catalog.unnest(p_operation_ids) as ids(id) order by ids.id loop
    select operation.* into v_operation from public.warfront_operations as operation where operation.id=v_operation_id for update;
    if not found then
      v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('operationId',v_operation_id,'state','blocked','blockedReason','operation_unavailable'));
      continue;
    end if;
    v_state := ironclad_private.warfront_operation_room_retention_state(v_operation.id);
    if v_state->>'state' = 'already_purged' then
      v_results := v_results || pg_catalog.jsonb_build_array(v_state);
      continue;
    end if;
    if v_state->>'state' <> 'eligible' then
      v_results := v_results || pg_catalog.jsonb_build_array(v_state);
      continue;
    end if;
    select assistance.* into v_assistance from public.warfront_operation_room_assistance as assistance where assistance.operation_id=v_operation.id for update;
    if found and v_assistance.status <> 'resolved' then
      raise exception 'WARFRONT_OPERATION_ROOM_UNRESOLVED_ASSISTANCE' using errcode='55000';
    end if;
    -- One room is all-or-nothing: any unexpected error aborts the surrounding
    -- call, so a retry never observes a partially purged room.
    v_previous := current_setting('ironclad.warfront_operation_room_retention_delete',true);
    perform set_config('ironclad.warfront_operation_room_retention_delete','on',true);
    delete from public.warfront_operation_chat_messages where operation_id=v_operation.id;
    get diagnostics v_messages_deleted=row_count;
    perform set_config('ironclad.warfront_operation_room_retention_delete',coalesce(v_previous,''),true);
    for v_notification_id in
      select episode.notification_id from public.warfront_operation_room_notification_episodes as episode where episode.operation_id=v_operation.id and episode.notification_id is not null
      union
      select v_assistance.notification_id where v_assistance.notification_id is not null
    loop
      perform ironclad_private.finish_warfront_operation_room_notification(v_notification_id,true);
    end loop;
    delete from public.notifications as notification
    where notification.metadata->>'operationId' = v_operation.id::text
      and notification.metadata->>'source' in ('warfront_operation_room','warfront_operation_room_assistance');
    delete from public.warfront_operation_room_notification_episodes where operation_id=v_operation.id;
    delete from public.warfront_operation_room_reads where operation_id=v_operation.id;
    if v_assistance.operation_id is not null then
      delete from public.warfront_operation_room_assistance
      where operation_id = v_operation.id;
    end if;
    insert into ironclad_private.warfront_operation_room_content_purges(operation_id,purge_reason,purged_by_admin_actor_id,messages_deleted)
    values(v_operation.id,'routine_retention',v_admin_actor_id,v_messages_deleted);
    insert into ironclad_private.warfront_operation_room_privacy_audit(operation_id,action,admin_actor_id,affected_message_count)
    values(v_operation.id,'routine_purged',v_admin_actor_id,v_messages_deleted);
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('operationId',v_operation.id,'state','purged','messagesDeleted',v_messages_deleted));
  end loop;
  return pg_catalog.jsonb_build_object('operations',v_results);
exception when others then
  if v_previous is not null then perform set_config('ironclad.warfront_operation_room_retention_delete',v_previous,true); end if;
  raise;
end;
$$;

create function public.purge_warfront_operation_room_retention_api(uuid[],text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.purge_warfront_operation_room_retention($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

-- Additive content state for participant historical reads. Existing room and
-- locked-roster authorization is preserved before a purged response is emitted.
create or replace function public.get_warfront_operation_chat(
  p_operation_id uuid, p_actor_clerk_user_id text, p_after_sequence bigint,
  p_before_sequence bigint, p_limit integer
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');
  v_player_id uuid; v_operation public.warfront_operations%rowtype;
  v_limit integer := coalesce(p_limit,50); v_purged_at timestamptz;
  v_messages jsonb; v_count integer; v_first bigint; v_last bigint; v_more boolean;
begin
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]'
    or (p_after_sequence is not null and p_after_sequence<0) or (p_before_sequence is not null and p_before_sequence<1)
    or (p_after_sequence is not null and p_before_sequence is not null) or v_limit not between 1 and 50 then raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID' using errcode='22023'; end if;
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  perform ironclad_private.require_warfront_operation_room_participant(v_operation.id,v_player_id);
  select purged_at into v_purged_at from ironclad_private.warfront_operation_room_content_purges where operation_id=v_operation.id;
  if found then return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'viewerPlayerId',v_player_id,'contentState','purged','contentPurgedAt',v_purged_at,'messages','[]'::jsonb,'page',pg_catalog.jsonb_build_object('afterSequence',p_after_sequence,'beforeSequence',p_before_sequence,'limit',v_limit,'hasMore',false,'nextAfterSequence',null,'nextBeforeSequence',null)); end if;
  if p_after_sequence is not null then
    with candidate as (select message.* from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and message.sequence>p_after_sequence order by message.sequence limit v_limit+1), page as (select * from candidate order by sequence limit v_limit)
    select coalesce(pg_catalog.jsonb_agg(ironclad_private.warfront_operation_chat_message_projection(page::public.warfront_operation_chat_messages) order by page.sequence),'[]'::jsonb),pg_catalog.count(*)::integer,pg_catalog.min(page.sequence),pg_catalog.max(page.sequence),(select pg_catalog.count(*)>v_limit from candidate) into v_messages,v_count,v_first,v_last,v_more from page;
  else
    with candidate as (select message.* from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and (p_before_sequence is null or message.sequence<p_before_sequence) order by message.sequence desc limit v_limit+1), page as (select * from candidate order by sequence desc limit v_limit)
    select coalesce(pg_catalog.jsonb_agg(ironclad_private.warfront_operation_chat_message_projection(page::public.warfront_operation_chat_messages) order by page.sequence),'[]'::jsonb),pg_catalog.count(*)::integer,pg_catalog.min(page.sequence),pg_catalog.max(page.sequence),(select pg_catalog.count(*)>v_limit from candidate) into v_messages,v_count,v_first,v_last,v_more from page;
  end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'viewerPlayerId',v_player_id,'contentState','available','contentPurgedAt',null,'messages',v_messages,'page',pg_catalog.jsonb_build_object('afterSequence',p_after_sequence,'beforeSequence',p_before_sequence,'limit',v_limit,'hasMore',coalesce(v_more,false),'nextAfterSequence',case when p_after_sequence is not null and v_count>0 then v_last else null end,'nextBeforeSequence',case when p_after_sequence is null and v_count>0 then v_first else null end));
end;
$$;

create or replace function public.get_warfront_operation_chat_admin(
  p_operation_id uuid, p_admin_clerk_user_id text, p_after_sequence bigint,
  p_before_sequence bigint, p_limit integer
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id),'');
  v_operation public.warfront_operations%rowtype; v_limit integer:=coalesce(p_limit,50);
  v_purged_at timestamptz; v_messages jsonb; v_count integer; v_first bigint; v_last bigint; v_more boolean;
begin
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]'
    or (p_after_sequence is not null and p_after_sequence<0) or (p_before_sequence is not null and p_before_sequence<1)
    or (p_after_sequence is not null and p_before_sequence is not null) or v_limit not between 1 and 50 then raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID' using errcode='22023'; end if;
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select purged_at into v_purged_at from ironclad_private.warfront_operation_room_content_purges where operation_id=v_operation.id;
  if found then return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'viewerKind','admin','contentState','purged','contentPurgedAt',v_purged_at,'messages','[]'::jsonb,'page',pg_catalog.jsonb_build_object('afterSequence',p_after_sequence,'beforeSequence',p_before_sequence,'limit',v_limit,'hasMore',false,'nextAfterSequence',null,'nextBeforeSequence',null)); end if;
  if p_after_sequence is not null then
    with candidate as (select message.* from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and message.sequence>p_after_sequence order by message.sequence limit v_limit+1), page as (select * from candidate order by sequence limit v_limit)
    select coalesce(pg_catalog.jsonb_agg(ironclad_private.warfront_operation_chat_message_projection(page::public.warfront_operation_chat_messages) order by page.sequence),'[]'::jsonb),pg_catalog.count(*)::integer,pg_catalog.min(page.sequence),pg_catalog.max(page.sequence),(select pg_catalog.count(*)>v_limit from candidate) into v_messages,v_count,v_first,v_last,v_more from page;
  else
    with candidate as (select message.* from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and (p_before_sequence is null or message.sequence<p_before_sequence) order by message.sequence desc limit v_limit+1), page as (select * from candidate order by sequence desc limit v_limit)
    select coalesce(pg_catalog.jsonb_agg(ironclad_private.warfront_operation_chat_message_projection(page::public.warfront_operation_chat_messages) order by page.sequence),'[]'::jsonb),pg_catalog.count(*)::integer,pg_catalog.min(page.sequence),pg_catalog.max(page.sequence),(select pg_catalog.count(*)>v_limit from candidate) into v_messages,v_count,v_first,v_last,v_more from page;
  end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'viewerKind','admin','contentState','available','contentPurgedAt',null,'messages',v_messages,'page',pg_catalog.jsonb_build_object('afterSequence',p_after_sequence,'beforeSequence',p_before_sequence,'limit',v_limit,'hasMore',coalesce(v_more,false),'nextAfterSequence',case when p_after_sequence is not null and v_count>0 then v_last else null end,'nextBeforeSequence',case when p_after_sequence is null and v_count>0 then v_first else null end));
end;
$$;

create or replace function public.mark_warfront_operation_room_read(
  p_operation_id uuid, p_actor_clerk_user_id text, p_through_sequence bigint
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),''); v_player_id uuid;
  v_operation public.warfront_operations%rowtype; v_committed bigint; v_last bigint; v_episode record; v_purged_at timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' or p_through_sequence is null or p_through_sequence not between 0 and 9007199254740991 then raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared(); v_player_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor); perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for share;
  if not found then raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation); perform ironclad_private.require_warfront_operation_room_participant(v_operation.id,v_player_id);
  select purged_at into v_purged_at from ironclad_private.warfront_operation_room_content_purges where operation_id=v_operation.id;
  if found then return pg_catalog.jsonb_build_object('operationId',v_operation.id,'lastReadSequence',null,'contentState','purged','contentPurgedAt',v_purged_at); end if;
  select last_sequence into v_committed from ironclad_private.warfront_operation_chat_sequences where operation_id=v_operation.id; v_committed:=coalesce(v_committed,0);
  if p_through_sequence>v_committed then raise exception 'WARFRONT_OPERATION_ROOM_READ_CURSOR_AHEAD' using errcode='22023'; end if;
  insert into public.warfront_operation_room_reads as read_cursor(operation_id,player_id,last_read_sequence,updated_at) values(v_operation.id,v_player_id,p_through_sequence,pg_catalog.clock_timestamp()) on conflict(operation_id,player_id) do update set last_read_sequence=pg_catalog.greatest(read_cursor.last_read_sequence,excluded.last_read_sequence),updated_at=pg_catalog.clock_timestamp() returning last_read_sequence into v_last;
  perform ironclad_private.lock_warfront_operation_room_notification(v_operation.id,v_player_id);
  for v_episode in update public.warfront_operation_room_notification_episodes as episode set resolved_at=pg_catalog.clock_timestamp() where episode.operation_id=v_operation.id and episode.recipient_player_id=v_player_id and episode.resolved_at is null and not exists(select 1 from public.warfront_operation_chat_messages as message where message.operation_id=v_operation.id and message.sequence>v_last and (message.sender_kind='admin' or message.sender_player_id is distinct from v_player_id)) returning episode.notification_id loop perform ironclad_private.finish_warfront_operation_room_notification(v_episode.notification_id); end loop;
  return pg_catalog.jsonb_build_object('operationId',v_operation.id,'lastReadSequence',v_last,'contentState','available','contentPurgedAt',null);
end;
$$;

create or replace function public.get_warfront_operation_room_unread_summary(
  p_operation_ids uuid[], p_actor_clerk_user_id text
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),''); v_player_id uuid; v_summary jsonb;
begin
  if p_operation_ids is null or coalesce(pg_catalog.array_ndims(p_operation_ids),0)<>1 or pg_catalog.cardinality(p_operation_ids) not between 1 and 128 or pg_catalog.array_position(p_operation_ids,null::uuid) is not null or (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_operation_ids) as ids(id))<>pg_catalog.cardinality(p_operation_ids) or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID' using errcode='22023'; end if;
  v_player_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  with requested as (select ids.id operation_id from pg_catalog.unnest(p_operation_ids) as ids(id)), eligible as (
    select operation.id operation_id,viewer.side viewer_side,coalesce(read_cursor.last_read_sequence,0) last_read_sequence
    from requested join public.warfront_operations operation on operation.id=requested.operation_id
    join public.warfront_operation_roster_entries viewer on viewer.operation_id=operation.id and viewer.player_id=v_player_id
    left join public.warfront_operation_room_reads read_cursor on read_cursor.operation_id=operation.id and read_cursor.player_id=v_player_id
    where operation.opponent_company_id is not null and operation.accepted_by_player_id is not null and operation.opponent_roster_elo_snapshot is not null and operation.accepted_at is not null and operation.roster_locked_at is not null and operation.status in ('accepted','in_progress','pending_result','completed','cancelled') and not(operation.status='cancelled' and operation.accepted_at is null)
      and not exists(select 1 from ironclad_private.warfront_operation_room_content_purges purge where purge.operation_id=operation.id)
      and (select count(*) from public.warfront_operation_roster_entries entry where entry.operation_id=operation.id)=(case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)*2
      and (select count(*) from public.warfront_operation_roster_entries entry where entry.operation_id=operation.id and entry.side='challenger')=(case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (select count(*) from public.warfront_operation_roster_entries entry where entry.operation_id=operation.id and entry.side='opponent')=(case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (select count(distinct entry.player_id) from public.warfront_operation_roster_entries entry where entry.operation_id=operation.id)=(case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)*2
  ), calculated as (
    select eligible.operation_id,count(message.id) unread_count,coalesce(bool_or(message.sender_kind='admin'),false) has_admin,coalesce(bool_or(message.sender_kind='player' and author_entry.side is distinct from eligible.viewer_side),false) has_opponent
    from eligible left join public.warfront_operation_chat_messages message on message.operation_id=eligible.operation_id and message.sequence>eligible.last_read_sequence and (message.sender_kind='admin' or message.sender_player_id is distinct from v_player_id)
    left join public.warfront_operation_roster_entries author_entry on author_entry.operation_id=eligible.operation_id and author_entry.player_id=message.sender_player_id group by eligible.operation_id
  ) select coalesce(jsonb_agg(jsonb_build_object('operationId',operation_id,'unreadCount',unread_count,'unreadSource',case when has_admin then 'admin' when has_opponent then 'opponent' else 'generic' end) order by operation_id),'[]'::jsonb) into v_summary from calculated;
  return pg_catalog.jsonb_build_object('operations',v_summary);
end;
$$;

-- New M8 storage is private. Existing M6/M7 raw-table posture remains intact.
alter table ironclad_private.warfront_operation_room_content_purges owner to postgres;
alter table ironclad_private.warfront_operation_room_content_purges enable row level security;
alter table ironclad_private.warfront_operation_room_content_purges force row level security;
revoke all on table ironclad_private.warfront_operation_room_content_purges from public, anon, authenticated, service_role;
alter table ironclad_private.warfront_operation_room_retention_cases owner to postgres;
alter table ironclad_private.warfront_operation_room_retention_cases enable row level security;
alter table ironclad_private.warfront_operation_room_retention_cases force row level security;
revoke all on table ironclad_private.warfront_operation_room_retention_cases from public, anon, authenticated, service_role;
alter table ironclad_private.warfront_operation_room_retention_holds owner to postgres;
alter table ironclad_private.warfront_operation_room_retention_holds enable row level security;
alter table ironclad_private.warfront_operation_room_retention_holds force row level security;
revoke all on table ironclad_private.warfront_operation_room_retention_holds from public, anon, authenticated, service_role;
alter table ironclad_private.warfront_operation_room_privacy_audit owner to postgres;
alter table ironclad_private.warfront_operation_room_privacy_audit enable row level security;
alter table ironclad_private.warfront_operation_room_privacy_audit force row level security;
revoke all on table ironclad_private.warfront_operation_room_privacy_audit from public, anon, authenticated, service_role;

alter function ironclad_private.warfront_operation_room_retention_state(uuid) owner to postgres;
alter function ironclad_private.reconcile_warfront_operation_room_notification_episodes(uuid) owner to postgres;
alter function ironclad_private.protect_warfront_operation_chat_message() owner to postgres;
revoke all on function ironclad_private.warfront_operation_room_retention_state(uuid),ironclad_private.reconcile_warfront_operation_room_notification_episodes(uuid),ironclad_private.protect_warfront_operation_chat_message() from public, anon, authenticated, service_role;

alter function public.preview_warfront_operation_room_retention(uuid[],text) owner to postgres;
alter function public.purge_warfront_operation_room_retention(uuid[],text) owner to postgres;
alter function public.open_warfront_operation_room_retention_case(uuid,uuid,text,text) owner to postgres;
alter function public.close_warfront_operation_room_retention_case(uuid,text) owner to postgres;
alter function public.create_warfront_operation_room_retention_hold(uuid,uuid,text,timestamptz,text) owner to postgres;
alter function public.release_warfront_operation_room_retention_hold(uuid,text) owner to postgres;
alter function public.redact_warfront_operation_room_messages(uuid,text,uuid,uuid[],text) owner to postgres;
alter function public.get_warfront_operation_chat(uuid,text,bigint,bigint,integer) owner to postgres;
alter function public.get_warfront_operation_chat_admin(uuid,text,bigint,bigint,integer) owner to postgres;
alter function public.mark_warfront_operation_room_read(uuid,text,bigint) owner to postgres;
alter function public.get_warfront_operation_room_unread_summary(uuid[],text) owner to postgres;
revoke all on function public.preview_warfront_operation_room_retention(uuid[],text),public.purge_warfront_operation_room_retention(uuid[],text),public.open_warfront_operation_room_retention_case(uuid,uuid,text,text),public.close_warfront_operation_room_retention_case(uuid,text),public.create_warfront_operation_room_retention_hold(uuid,uuid,text,timestamptz,text),public.release_warfront_operation_room_retention_hold(uuid,text),public.redact_warfront_operation_room_messages(uuid,text,uuid,uuid[],text),public.get_warfront_operation_chat(uuid,text,bigint,bigint,integer),public.get_warfront_operation_chat_admin(uuid,text,bigint,bigint,integer),public.mark_warfront_operation_room_read(uuid,text,bigint),public.get_warfront_operation_room_unread_summary(uuid[],text) from public, anon, authenticated, service_role;

alter function public.preview_warfront_operation_room_retention_api(uuid[],text) owner to postgres;
alter function public.purge_warfront_operation_room_retention_api(uuid[],text) owner to postgres;
alter function public.open_warfront_operation_room_retention_case_api(uuid,uuid,text,text) owner to postgres;
alter function public.close_warfront_operation_room_retention_case_api(uuid,text) owner to postgres;
alter function public.create_warfront_operation_room_retention_hold_api(uuid,uuid,text,timestamptz,text) owner to postgres;
alter function public.release_warfront_operation_room_retention_hold_api(uuid,text) owner to postgres;
alter function public.redact_warfront_operation_room_messages_api(uuid,text,uuid,uuid[],text) owner to postgres;
revoke all on function public.preview_warfront_operation_room_retention_api(uuid[],text),public.purge_warfront_operation_room_retention_api(uuid[],text),public.open_warfront_operation_room_retention_case_api(uuid,uuid,text,text),public.close_warfront_operation_room_retention_case_api(uuid,text),public.create_warfront_operation_room_retention_hold_api(uuid,uuid,text,timestamptz,text),public.release_warfront_operation_room_retention_hold_api(uuid,text),public.redact_warfront_operation_room_messages_api(uuid,text,uuid,uuid[],text) from public, anon, authenticated, service_role;
grant execute on function public.preview_warfront_operation_room_retention_api(uuid[],text),public.purge_warfront_operation_room_retention_api(uuid[],text),public.open_warfront_operation_room_retention_case_api(uuid,uuid,text,text),public.close_warfront_operation_room_retention_case_api(uuid,text),public.create_warfront_operation_room_retention_hold_api(uuid,uuid,text,timestamptz,text),public.release_warfront_operation_room_retention_hold_api(uuid,text),public.redact_warfront_operation_room_messages_api(uuid,text,uuid,uuid[],text) to service_role;

comment on table ironclad_private.warfront_operation_room_content_purges is
  'Private Operation Room communication-content tombstone. It never changes competitive Operation facts and distinguishes purged content from rooms that never received messages.';
comment on table ironclad_private.warfront_operation_room_retention_cases is
  'Private explicit formal evidence cases. Active rows block routine communication cleanup; closed rows add no invented retention duration.';
comment on table ironclad_private.warfront_operation_room_retention_holds is
  'Private whole-room evidence holds. Active means unreleased and unexpired by authoritative database time.';
comment on table ironclad_private.warfront_operation_room_privacy_audit is
  'Private structured retention/privacy audit with no message body, Clerk ID, sender name, or free-text prose.';

commit;
