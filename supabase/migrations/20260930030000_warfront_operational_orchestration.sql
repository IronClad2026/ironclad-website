begin;

-- M14 operational orchestration is liveness-only.  Every competitive fact
-- remains owned by M3/M5/M9/M10; delayed or duplicated reconciliation cannot
-- make an otherwise-invalid transition legal.

create index if not exists warfront_operations_expiry_reconcile_idx
  on public.warfront_operations(expires_at, id)
  where status = 'open';

create index if not exists warfront_operation_results_due_reconcile_idx
  on public.warfront_operation_results(confirmation_deadline, operation_id);

create index if not exists warfront_operations_completed_settlement_reconcile_idx
  on public.warfront_operations(completed_at, id)
  where status = 'completed';

create table ironclad_private.warfront_operation_noncompetitive_recoveries (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  recovery_kind text not null,
  reason_code text not null,
  recovered_by_admin_actor_id uuid not null
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  recovered_at timestamptz not null,
  retention_case_id uuid not null,
  retention_hold_id uuid not null,
  constraint warfront_operation_noncompetitive_recoveries_kind_check
    check (recovery_kind = 'accepted_abandoned'),
  constraint warfront_operation_noncompetitive_recoveries_reason_check
    check (reason_code in (
      'no_start', 'unresponsive', 'technical_failure',
      'administrative_safety_stop'
    )),
  constraint warfront_operation_noncompetitive_recoveries_case_key
    unique (retention_case_id),
  constraint warfront_operation_noncompetitive_recoveries_hold_key
    unique (retention_hold_id),
  constraint warfront_operation_noncompetitive_recoveries_case_fkey
    foreign key (operation_id, retention_case_id)
    references ironclad_private.warfront_operation_room_retention_cases(
      operation_id, id
    ) on delete restrict,
  constraint warfront_operation_noncompetitive_recoveries_hold_fkey
    foreign key (operation_id, retention_hold_id)
    references ironclad_private.warfront_operation_room_retention_holds(
      operation_id, id
    ) on delete restrict,
  constraint warfront_operation_noncompetitive_recoveries_hold_case_fkey
    foreign key (operation_id, retention_case_id, retention_hold_id)
    references ironclad_private.warfront_operation_room_retention_holds(
      operation_id, case_id, id
    ) on delete restrict
);

create function ironclad_private.protect_warfront_operation_noncompetitive_recovery_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'WARFRONT_OPERATION_NONCOMPETITIVE_RECOVERY_IMMUTABLE'
    using errcode = '55000';
end;
$$;

create trigger warfront_operation_noncompetitive_recoveries_immutable
before update or delete on ironclad_private.warfront_operation_noncompetitive_recoveries
for each row execute function ironclad_private.protect_warfront_operation_noncompetitive_recovery_history();

create function ironclad_private.expire_warfront_open_operations_batch(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz;
  v_operation_id uuid;
  v_expired integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'WARFRONT_OPERATION_RECONCILIATION_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_now := pg_catalog.clock_timestamp();

  for v_operation_id in
    select operation.id
    from public.warfront_operations as operation
    where operation.status = 'open'
      and operation.expires_at <= v_now
    order by operation.expires_at asc, operation.id asc
    for update skip locked
    limit p_limit
  loop
    update public.warfront_operations as operation
    set status = 'expired', updated_at = v_now
    where operation.id = v_operation_id
      and operation.status = 'open'
      and operation.expires_at <= v_now;

    if found then
      v_expired := v_expired + 1;
    end if;
  end loop;

  return v_expired;
end;
$$;

create function ironclad_private.reconcile_due_warfront_operation_results_batch(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz;
  v_operation_id uuid;
  v_finalized boolean;
  v_finalized_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'WARFRONT_OPERATION_RECONCILIATION_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_now := pg_catalog.clock_timestamp();

  for v_operation_id in
    select operation.id
    from public.warfront_operations as operation
    join public.warfront_operation_results as result
      on result.operation_id = operation.id
    where operation.status = 'pending_result'
      and result.confirmation_deadline <= v_now
      and not exists (
        select 1
        from public.warfront_operation_result_finalizations as finalization
        where finalization.operation_id = operation.id
      )
      and not exists (
        select 1
        from public.warfront_operation_result_disputes as dispute
        where dispute.operation_id = operation.id
      )
    order by result.confirmation_deadline asc, operation.id asc
    for update of operation skip locked
    limit p_limit
  loop
    v_finalized := ironclad_private.reconcile_warfront_operation_result_if_due_locked(
      v_operation_id,
      v_now
    );

    if v_finalized then
      v_finalized_count := v_finalized_count + 1;
    end if;
  end loop;

  return v_finalized_count;
end;
$$;

create function ironclad_private.reconcile_warfront_operation_settlements_batch(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation_id uuid;
  v_settled_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'WARFRONT_OPERATION_RECONCILIATION_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  for v_operation_id in
    select operation.id
    from public.warfront_operations as operation
    join public.warfront_operation_result_finalizations as finalization
      on finalization.operation_id = operation.id
    left join public.warfront_operation_point_settlements as settlement
      on settlement.operation_id = operation.id
    where operation.status = 'completed'
      and settlement.operation_id is null
    order by operation.completed_at asc, operation.id asc
    for update of operation skip locked
    limit p_limit
  loop
    -- M10 owns receipt/ledger validation, point math, and exactly-once writes.
    perform public.settle_warfront_operation_points(v_operation_id);
    v_settled_count := v_settled_count + 1;
  end loop;

  return v_settled_count;
end;
$$;

create function ironclad_private.insert_warfront_in_app_notification(
  p_recipient_clerk_user_id text,
  p_type text,
  p_title text,
  p_message text,
  p_event_key text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.nullif(pg_catalog.btrim(p_recipient_clerk_user_id), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_type), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_title), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_message), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_event_key), '') is null
    or p_metadata is null then
    raise exception 'WARFRONT_NOTIFICATION_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key,
    metadata
  ) values (
    p_recipient_clerk_user_id,
    'player',
    p_type,
    p_title,
    p_message,
    p_event_key,
    p_metadata
  ) on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null do nothing;
end;
$$;

create function ironclad_private.notify_warfront_company_invitation_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_recipient_clerk_user_id text;
  v_company record;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select player.clerk_user_id
  into v_recipient_clerk_user_id
  from public.players as player
  where player.id = new.recipient_player_id
    and player.account_closed_at is null;

  if not found or v_recipient_clerk_user_id is null then
    return new;
  end if;

  select company.id, company.name, company.tag
  into v_company
  from public.warfront_companies as company
  where company.id = new.company_id;

  if not found then
    raise exception 'WARFRONT_INVITATION_NOTIFICATION_COMPANY_INCONSISTENT'
      using errcode = '55000';
  end if;

  perform ironclad_private.insert_warfront_in_app_notification(
    v_recipient_clerk_user_id,
    'warfront.company_invitation_received',
    'Company invitation received',
    'You have been invited to join a WARFRONT Company.',
    'warfront-company-invitation:' || new.id || ':recipient:' || new.recipient_player_id,
    pg_catalog.jsonb_build_object(
      'source', 'warfront_company_invitation',
      'invitationId', new.id,
      'companyId', v_company.id,
      'companyName', v_company.name,
      'companyTag', v_company.tag
    )
  );

  return new;
end;
$$;

create trigger warfront_company_invitations_notify_created
after insert on public.warfront_company_invitations
for each row execute function ironclad_private.notify_warfront_company_invitation_created();

create function ironclad_private.notify_warfront_operation_accepted()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_recipient record;
begin
  if old.status is distinct from 'open' or new.status <> 'accepted' then
    return new;
  end if;

  for v_recipient in
    select entry.player_id, player.clerk_user_id
    from public.warfront_operation_roster_entries as entry
    join public.players as player
      on player.id = entry.player_id
     and player.account_closed_at is null
    where entry.operation_id = new.id
      and entry.player_id is distinct from new.accepted_by_player_id
    order by entry.player_id
  loop
    perform ironclad_private.insert_warfront_in_app_notification(
      v_recipient.clerk_user_id,
      'warfront.operation_accepted',
      'Ranked Operation accepted',
      'A WARFRONT Ranked Operation has been accepted.',
      'warfront-operation-accepted:' || new.id || ':recipient:' || v_recipient.player_id,
      pg_catalog.jsonb_build_object(
        'source', 'warfront_operation',
        'operationId', new.id,
        'challengerCompanyId', new.challenger_company_id,
        'opponentCompanyId', new.opponent_company_id,
        'format', new.format,
        'seriesBestOf', new.series_best_of
      )
    );
  end loop;

  return new;
end;
$$;

create trigger warfront_operations_notify_accepted
after update of status on public.warfront_operations
for each row execute function ironclad_private.notify_warfront_operation_accepted();

create function ironclad_private.notify_warfront_operation_result_submitted()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_submitter_side text;
  v_recipient record;
begin
  select entry.side
  into v_submitter_side
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = new.operation_id
    and entry.player_id = new.submitted_by_player_id;

  if not found or v_submitter_side is null then
    raise exception 'WARFRONT_RESULT_NOTIFICATION_ROSTER_INCONSISTENT'
      using errcode = '55000';
  end if;

  for v_recipient in
    select entry.player_id, player.clerk_user_id
    from public.warfront_operation_roster_entries as entry
    join public.players as player
      on player.id = entry.player_id
     and player.account_closed_at is null
    where entry.operation_id = new.operation_id
      and entry.side is distinct from v_submitter_side
    order by entry.player_id
  loop
    perform ironclad_private.insert_warfront_in_app_notification(
      v_recipient.clerk_user_id,
      'warfront.operation_result_submitted',
      'Operation result awaiting confirmation',
      'An opposing Company submitted a WARFRONT Operation result.',
      'warfront-operation-result-submitted:' || new.operation_id || ':recipient:' || v_recipient.player_id,
      pg_catalog.jsonb_build_object(
        'source', 'warfront_operation_result',
        'operationId', new.operation_id,
        'confirmationDeadline', new.confirmation_deadline
      )
    );
  end loop;

  return new;
end;
$$;

create trigger warfront_operation_results_notify_submitted
after insert on public.warfront_operation_results
for each row execute function ironclad_private.notify_warfront_operation_result_submitted();

create function ironclad_private.notify_warfront_operation_result_finalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_recipient record;
begin
  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = new.operation_id;

  if not found then
    raise exception 'WARFRONT_FINALIZATION_NOTIFICATION_OPERATION_INCONSISTENT'
      using errcode = '55000';
  end if;

  for v_recipient in
    select entry.player_id, player.clerk_user_id
    from public.warfront_operation_roster_entries as entry
    join public.players as player
      on player.id = entry.player_id
     and player.account_closed_at is null
    where entry.operation_id = new.operation_id
    order by entry.player_id
  loop
    perform ironclad_private.insert_warfront_in_app_notification(
      v_recipient.clerk_user_id,
      'warfront.operation_result_finalized',
      'WARFRONT Operation finalized',
      'A WARFRONT Operation result is final.',
      'warfront-operation-result-finalized:' || new.operation_id || ':recipient:' || v_recipient.player_id,
      pg_catalog.jsonb_build_object(
        'source', 'warfront_operation_finalization',
        'operationId', new.operation_id,
        'winnerSide', new.final_winner_side,
        'finalizationMode', new.finalization_mode,
        'challengerCompanyId', v_operation.challenger_company_id,
        'opponentCompanyId', v_operation.opponent_company_id
      )
    );
  end loop;

  return new;
end;
$$;

create trigger warfront_operation_result_finalizations_notify
after insert on public.warfront_operation_result_finalizations
for each row execute function ironclad_private.notify_warfront_operation_result_finalized();

create function public.expire_warfront_open_operations(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_expired integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  v_expired := ironclad_private.expire_warfront_open_operations_batch(p_limit);
  return pg_catalog.jsonb_build_object('expiredCount', v_expired);
end;
$$;

create function public.expire_warfront_open_operations_api(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  return public.expire_warfront_open_operations(p_limit);
exception when serialization_failure then
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.reconcile_due_warfront_operation_results(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_finalized integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  v_finalized := ironclad_private.reconcile_due_warfront_operation_results_batch(p_limit);
  return pg_catalog.jsonb_build_object('autoFinalizedCount', v_finalized);
end;
$$;

create function public.reconcile_due_warfront_operation_results_api(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  return public.reconcile_due_warfront_operation_results(p_limit);
exception when serialization_failure then
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.reconcile_warfront_operation_settlements(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_settled integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  v_settled := ironclad_private.reconcile_warfront_operation_settlements_batch(p_limit);
  return pg_catalog.jsonb_build_object('settledCount', v_settled);
end;
$$;

create function public.reconcile_warfront_operation_settlements_api(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  return public.reconcile_warfront_operation_settlements(p_limit);
exception when serialization_failure then
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.recover_warfront_accepted_abandoned_operation(
  p_operation_id uuid,
  p_reason_code text,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reason_code text := pg_catalog.nullif(pg_catalog.btrim(p_reason_code), '');
  v_admin_clerk_user_id text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_existing ironclad_private.warfront_operation_noncompetitive_recoveries%rowtype;
  v_recovery_id uuid := pg_catalog.gen_random_uuid();
  v_case_id uuid;
  v_hold_id uuid;
  v_now timestamptz;
  v_affected integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  if p_operation_id is null
    or v_reason_code is null
    or v_reason_code not in (
      'no_start', 'unresponsive', 'technical_failure',
      'administrative_safety_stop'
    )
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_RECOVERY_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(
    v_admin_clerk_user_id
  );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_RECOVERY_UNAVAILABLE' using errcode = '42501';
  end if;

  select recovery.*
  into v_existing
  from ironclad_private.warfront_operation_noncompetitive_recoveries as recovery
  where recovery.operation_id = v_operation.id
  for update;

  if found then
    if v_existing.reason_code <> v_reason_code
      or v_existing.recovered_by_admin_actor_id <> v_admin_actor_id
      or v_operation.status <> 'cancelled'
      or v_operation.cancelled_at is null then
      raise exception 'WARFRONT_OPERATION_RECOVERY_IDEMPOTENCY_CONFLICT'
        using errcode = '55000';
    end if;

    return pg_catalog.jsonb_build_object(
      'operationId', v_operation.id,
      'status', v_operation.status,
      'recoveryKind', v_existing.recovery_kind,
      'reasonCode', v_existing.reason_code,
      'recoveredAt', v_existing.recovered_at,
      'duplicate', true
    );
  end if;

  if v_operation.status not in ('accepted', 'in_progress', 'pending_result')
    or v_operation.completed_at is not null
    or v_operation.cancelled_at is not null then
    raise exception 'WARFRONT_OPERATION_RECOVERY_NOT_ACTIONABLE'
      using errcode = '55000';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  perform 1
  from public.warfront_operation_results as result
  where result.operation_id = v_operation.id
  for update;

  if exists (
    select 1
    from public.warfront_operation_result_finalizations as finalization
    where finalization.operation_id = v_operation.id
  ) or exists (
    select 1
    from public.warfront_operation_point_settlements as settlement
    where settlement.operation_id = v_operation.id
  ) then
    raise exception 'WARFRONT_OPERATION_RECOVERY_COMPETITIVE_FACT_EXISTS'
      using errcode = '55000';
  end if;

  perform 1
  from public.warfront_operation_result_disputes as dispute
  where dispute.operation_id = v_operation.id
  for update;

  if found then
    raise exception 'WARFRONT_OPERATION_RECOVERY_DISPUTED'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from ironclad_private.warfront_operation_room_content_purges as purge
    where purge.operation_id = v_operation.id
  ) then
    raise exception 'WARFRONT_OPERATION_ROOM_EVIDENCE_UNAVAILABLE'
      using errcode = '55000';
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into ironclad_private.warfront_operation_room_retention_cases (
    operation_id,
    case_reference,
    case_kind,
    opened_at,
    opened_by_admin_actor_id,
    opened_origin,
    updated_at
  ) values (
    v_operation.id,
    v_recovery_id,
    'competition_integrity',
    v_now,
    v_admin_actor_id,
    'admin',
    v_now
  ) returning id into v_case_id;

  insert into ironclad_private.warfront_operation_room_retention_holds (
    operation_id,
    case_id,
    reason,
    created_at,
    created_by_admin_actor_id,
    created_origin
  ) values (
    v_operation.id,
    v_case_id,
    'competition_integrity',
    v_now,
    v_admin_actor_id,
    'admin'
  ) returning id into v_hold_id;

  insert into ironclad_private.warfront_operation_room_privacy_audit (
    operation_id, action, admin_actor_id, case_id, hold_id, occurred_at
  ) values (
    v_operation.id, 'case_opened', v_admin_actor_id, v_case_id, null, v_now
  ), (
    v_operation.id, 'hold_created', v_admin_actor_id, v_case_id, v_hold_id, v_now
  );

  insert into ironclad_private.warfront_operation_noncompetitive_recoveries (
    operation_id,
    recovery_kind,
    reason_code,
    recovered_by_admin_actor_id,
    recovered_at,
    retention_case_id,
    retention_hold_id
  ) values (
    v_operation.id,
    'accepted_abandoned',
    v_reason_code,
    v_admin_actor_id,
    v_now,
    v_case_id,
    v_hold_id
  );

  update public.warfront_operations as operation
  set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  where operation.id = v_operation.id
    and operation.status in ('accepted', 'in_progress', 'pending_result')
    and operation.completed_at is null
    and operation.cancelled_at is null;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'WARFRONT_OPERATION_RECOVERY_CONFLICT' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', 'cancelled',
    'recoveryKind', 'accepted_abandoned',
    'reasonCode', v_reason_code,
    'recoveredAt', v_now,
    'duplicate', false
  );
end;
$$;

create function public.recover_warfront_accepted_abandoned_operation_api(
  p_operation_id uuid,
  p_reason_code text,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;

  return public.recover_warfront_accepted_abandoned_operation(
    p_operation_id,
    p_reason_code,
    p_admin_clerk_user_id
  );
exception when serialization_failure then
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter table ironclad_private.warfront_operation_noncompetitive_recoveries owner to postgres;
alter table ironclad_private.warfront_operation_noncompetitive_recoveries enable row level security;
alter table ironclad_private.warfront_operation_noncompetitive_recoveries force row level security;
revoke all on table ironclad_private.warfront_operation_noncompetitive_recoveries
  from public, anon, authenticated, service_role;

alter function ironclad_private.protect_warfront_operation_noncompetitive_recovery_history() owner to postgres;
alter function ironclad_private.expire_warfront_open_operations_batch(integer) owner to postgres;
alter function ironclad_private.reconcile_due_warfront_operation_results_batch(integer) owner to postgres;
alter function ironclad_private.reconcile_warfront_operation_settlements_batch(integer) owner to postgres;
alter function ironclad_private.insert_warfront_in_app_notification(text,text,text,text,text,jsonb) owner to postgres;
alter function ironclad_private.notify_warfront_company_invitation_created() owner to postgres;
alter function ironclad_private.notify_warfront_operation_accepted() owner to postgres;
alter function ironclad_private.notify_warfront_operation_result_submitted() owner to postgres;
alter function ironclad_private.notify_warfront_operation_result_finalized() owner to postgres;

revoke all on function
  ironclad_private.protect_warfront_operation_noncompetitive_recovery_history(),
  ironclad_private.expire_warfront_open_operations_batch(integer),
  ironclad_private.reconcile_due_warfront_operation_results_batch(integer),
  ironclad_private.reconcile_warfront_operation_settlements_batch(integer),
  ironclad_private.insert_warfront_in_app_notification(text,text,text,text,text,jsonb),
  ironclad_private.notify_warfront_company_invitation_created(),
  ironclad_private.notify_warfront_operation_accepted(),
  ironclad_private.notify_warfront_operation_result_submitted(),
  ironclad_private.notify_warfront_operation_result_finalized()
from public, anon, authenticated, service_role;

alter function public.expire_warfront_open_operations(integer) owner to postgres;
alter function public.expire_warfront_open_operations_api(integer) owner to postgres;
alter function public.reconcile_due_warfront_operation_results(integer) owner to postgres;
alter function public.reconcile_due_warfront_operation_results_api(integer) owner to postgres;
alter function public.reconcile_warfront_operation_settlements(integer) owner to postgres;
alter function public.reconcile_warfront_operation_settlements_api(integer) owner to postgres;
alter function public.recover_warfront_accepted_abandoned_operation(uuid,text,text) owner to postgres;
alter function public.recover_warfront_accepted_abandoned_operation_api(uuid,text,text) owner to postgres;

revoke all on function
  public.expire_warfront_open_operations(integer),
  public.expire_warfront_open_operations_api(integer),
  public.reconcile_due_warfront_operation_results(integer),
  public.reconcile_due_warfront_operation_results_api(integer),
  public.reconcile_warfront_operation_settlements(integer),
  public.reconcile_warfront_operation_settlements_api(integer),
  public.recover_warfront_accepted_abandoned_operation(uuid,text,text),
  public.recover_warfront_accepted_abandoned_operation_api(uuid,text,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.expire_warfront_open_operations_api(integer),
  public.reconcile_due_warfront_operation_results_api(integer),
  public.reconcile_warfront_operation_settlements_api(integer),
  public.recover_warfront_accepted_abandoned_operation_api(uuid,text,text)
to service_role;

comment on table ironclad_private.warfront_operation_noncompetitive_recoveries is
  'Private immutable M14 evidence for a manual admin noncompetitive accepted-abandoned recovery. It is not a forfeit, result, settlement, or Combat Record fact.';
comment on function public.expire_warfront_open_operations(integer) is
  'Trusted M14 liveness authority that materializes only already-logically-expired OPEN Operations. M3/M12 remain independently correct when it is delayed or unavailable.';
comment on function public.reconcile_due_warfront_operation_results(integer) is
  'Trusted M14 liveness authority that delegates due pending-result reconciliation to M9s canonical locked helper.';
comment on function public.reconcile_warfront_operation_settlements(integer) is
  'Trusted M14 liveness authority that delegates completed finalization settlement to M10s exactly-once authority.';
comment on function public.recover_warfront_accepted_abandoned_operation(uuid,text,text) is
  'Trusted server recovery boundary. The caller must independently enforce Clerk admin authorization; this function records the established M7 admin actor and can create no competitive fact.';

do $$
declare
  v_job_id bigint;
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception when others then
    raise notice 'pg_cron extension was not enabled automatically: %', sqlerrm;
  end;

  if to_regnamespace('cron') is null then
    raise notice 'pg_cron cron schema is unavailable. Schedule the M14 reconciliation APIs from a trusted server.';
    return;
  end if;

  foreach v_job_id in array coalesce(array(
    select jobid from cron.job where jobname in (
      'ironclad-warfront-open-expiry',
      'ironclad-warfront-result-reconciliation',
      'ironclad-warfront-settlement-reconciliation'
    )
  ), array[]::bigint[]) loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'ironclad-warfront-open-expiry',
    '* * * * *',
    'select public.expire_warfront_open_operations(100);'
  );
  perform cron.schedule(
    'ironclad-warfront-result-reconciliation',
    '* * * * *',
    'select public.reconcile_due_warfront_operation_results(100);'
  );
  perform cron.schedule(
    'ironclad-warfront-settlement-reconciliation',
    '* * * * *',
    'select public.reconcile_warfront_operation_settlements(100);'
  );
exception when others then
  raise notice 'pg_cron M14 jobs were not scheduled automatically: %', sqlerrm;
end;
$$;

commit;
