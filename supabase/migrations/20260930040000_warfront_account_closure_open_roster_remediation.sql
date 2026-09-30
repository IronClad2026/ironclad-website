begin;

-- M15 closes the M4/M7-to-M12 integration gap. Account closure remains the
-- canonical exclusive-barrier path; only a still-logically-open challenger
-- Operation whose roster contains the closing Player is cancelled.

alter table ironclad_private.warfront_operation_cancellations
  drop constraint warfront_operation_cancellations_kind_check;
alter table ironclad_private.warfront_operation_cancellations
  add constraint warfront_operation_cancellations_kind_check check (
    cancellation_kind in (
      'challenger_cancel',
      'roster_member_left',
      'roster_member_removed',
      'roster_member_account_closed'
    )
  );

alter table ironclad_private.warfront_operation_cancellations
  drop constraint warfront_operation_cancellations_attribution_check;
alter table ironclad_private.warfront_operation_cancellations
  add constraint warfront_operation_cancellations_attribution_check check (
    (
      cancellation_kind in (
        'challenger_cancel',
        'roster_member_left',
        'roster_member_account_closed'
      )
      and cancelled_by_player_id = affected_player_id
    )
    or (
      cancellation_kind = 'roster_member_removed'
      and cancelled_by_player_id <> affected_player_id
    )
  );

create or replace function ironclad_private.cancel_warfront_open_operation_locked(
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
  if p_operation_id is null
    or p_actor_player_id is null
    or p_affected_player_id is null
    or p_cancelled_at is null
    or p_cancellation_kind is null
    or p_cancellation_kind not in (
      'challenger_cancel',
      'roster_member_left',
      'roster_member_removed',
      'roster_member_account_closed'
    ) then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_INPUT_INVALID'
      using errcode = '22023';
  end if;

  if (
    p_cancellation_kind in (
      'challenger_cancel',
      'roster_member_left',
      'roster_member_account_closed'
    )
    and p_actor_player_id <> p_affected_player_id
  ) or (
    p_cancellation_kind = 'roster_member_removed'
    and p_actor_player_id = p_affected_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_ATTRIBUTION_INVALID'
      using errcode = '22023';
  end if;

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN'
      using errcode = '55000';
  end if;

  if v_operation.status <> 'open'
    or v_operation.opponent_company_id is not null then
    raise exception 'WARFRONT_OPERATION_NOT_LOGICALLY_OPEN'
      using errcode = '55000';
  end if;

  if v_operation.expires_at <= p_cancelled_at then
    raise exception 'WARFRONT_OPERATION_ALREADY_EXPIRED'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.warfront_operation_roster_entries as entry
    where entry.operation_id = v_operation.id
      and entry.side = 'challenger'
      and entry.player_id = p_affected_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  update public.warfront_operations as operation
  set
    status = 'cancelled',
    cancelled_at = p_cancelled_at,
    updated_at = p_cancelled_at
  where operation.id = v_operation.id
    and operation.status = 'open'
    and operation.opponent_company_id is null
    and operation.expires_at > p_cancelled_at
  returning operation.* into v_operation;

  if not found then
    raise exception 'WARFRONT_OPERATION_CANCELLATION_CONFLICT'
      using errcode = '40001';
  end if;

  insert into ironclad_private.warfront_operation_cancellations (
    operation_id,
    cancellation_kind,
    cancelled_by_player_id,
    affected_player_id,
    cancelled_at
  ) values (
    v_operation.id,
    p_cancellation_kind,
    p_actor_player_id,
    p_affected_player_id,
    p_cancelled_at
  );

  return v_operation;
end;
$$;

-- M7's public closure wrapper remains the canonical final entry point. It
-- delegates here after its existing admin-attribution and Room-read cleanup.
create or replace function public.close_ironclad_player_account_without_warfront_m7(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_clerk_user_id),
    ''
  );
  v_player_id uuid;
  v_player_found boolean := false;
  v_retain_player boolean := false;
  v_closure_at timestamptz;
  v_operation_id uuid;
  v_result jsonb;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  -- This exclusive barrier precedes every WARFRONT domain lock. All M3/M12/M14
  -- competitors take its shared counterpart, so closure observes a coherent
  -- post-race state before it locks and conditionally cancels OPEN Operations.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:match-room-account-closure',
      0
    )
  );

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  v_player_found := found;

  if v_player_found then
    -- Preserve M4's established deterministic closure order.
    perform company.id
    from public.warfront_companies as company
    where company.id in (
      select member.company_id
      from public.warfront_company_members as member
      where member.player_id = v_player_id
        and member.left_at is null
    )
    order by company.id
    for update;

    perform member.id
    from public.warfront_company_members as member
    where member.player_id = v_player_id
      and member.left_at is null
    order by member.company_id, member.player_id, member.id
    for update;

    perform invitation.id
    from public.warfront_company_invitations as invitation
    where invitation.status = 'pending'
      and (
        invitation.recipient_player_id = v_player_id
        or invitation.invited_by_player_id = v_player_id
      )
    order by invitation.company_id, invitation.id
    for update;

    -- Preserve the existing intentional Commander refusal before any M15
    -- cancellation evidence is created. The surrounding transaction rolls back
    -- all earlier M7 work if this exception is raised.
    if exists (
      select 1
      from public.warfront_company_members as member
      join public.warfront_companies as company
        on company.id = member.company_id
      where member.player_id = v_player_id
        and member.left_at is null
        and member.role = 'commander'
        and company.status = 'active'
    ) then
      raise exception 'WARFRONT_COMMANDER_TRANSFER_OR_ARCHIVE_REQUIRED'
        using errcode = '55000';
    end if;

    v_retain_player := public.player_has_authoritative_competition_history(
      v_player_id
    );
    v_closure_at := pg_catalog.clock_timestamp();

    -- Legacy/corrupt state can contain more than one candidate despite the
    -- logical-open invariant. Lock every candidate in deterministic order;
    -- the loop and membership update are one transaction, so it cannot leave a
    -- partially invalidated set behind.
    for v_operation_id in
      select operation.id
      from public.warfront_operations as operation
      join public.warfront_operation_roster_entries as entry
        on entry.operation_id = operation.id
       and entry.side = 'challenger'
       and entry.player_id = v_player_id
      join public.warfront_company_members as member
        on member.company_id = operation.challenger_company_id
       and member.player_id = v_player_id
       and member.left_at is null
      where operation.status = 'open'
        and operation.opponent_company_id is null
        and operation.expires_at > v_closure_at
      order by operation.expires_at asc, operation.id asc
      for update of operation
    loop
      perform ironclad_private.cancel_warfront_open_operation_locked(
        v_operation_id,
        v_player_id,
        v_player_id,
        'roster_member_account_closed',
        v_closure_at
      );
    end loop;

    update public.warfront_company_members as member
    set left_at = v_closure_at
    where member.player_id = v_player_id
      and member.left_at is null;

    if v_retain_player then
      update public.warfront_company_invitations as invitation
      set
        status = 'invalidated',
        invalidated_at = v_closure_at,
        invalidation_reason = 'account_closed'
      where invitation.status = 'pending'
        and (
          invitation.recipient_player_id = v_player_id
          or invitation.invited_by_player_id = v_player_id
        );
    end if;
  end if;

  v_result := public.close_ironclad_player_account_without_warfront_cleanup(
    v_clerk_user_id
  );

  return v_result;
end;
$$;

alter function ironclad_private.cancel_warfront_open_operation_locked(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) owner to postgres;
alter function public.close_ironclad_player_account_without_warfront_m7(text)
  owner to postgres;

revoke all on function ironclad_private.cancel_warfront_open_operation_locked(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.close_ironclad_player_account_without_warfront_m7(
  text
) from public, anon, authenticated, service_role;

comment on function ironclad_private.cancel_warfront_open_operation_locked(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) is
  'Owner-only M12/M15 logical-open cancellation authority. Account-closure attribution is distinct from manual challenger cancellation and remains noncompetitive.';
comment on function public.close_ironclad_player_account_without_warfront_m7(text) is
  'Owner-only M4 closure implementation reached by the M7 final wrapper. Before closing a non-Commander membership it cancels every still-logically-open challenger Operation containing the closing Player, using one closure timestamp and immutable M12/M15 evidence.';

commit;
