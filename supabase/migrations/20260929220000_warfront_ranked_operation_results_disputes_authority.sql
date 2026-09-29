begin;

-- M9 owns only the immutable Ranked Operation result lifecycle. It does not
-- award WARFRONT Points, alter rankings, or change Combat Record facts.

-- M8 normally attributes formal cases and holds to an ADMIN actor. A result
-- dispute is different: its Player attribution lives solely on the immutable
-- M9 dispute, while these M8 rows are system-generated evidence protection.
alter table ironclad_private.warfront_operation_room_retention_cases
  alter column opened_by_admin_actor_id drop not null;
alter table ironclad_private.warfront_operation_room_retention_cases
  add column opened_origin text not null default 'admin';
alter table ironclad_private.warfront_operation_room_retention_cases
  add constraint warfront_operation_room_retention_cases_opened_origin_check
  check (
    (opened_origin = 'admin' and opened_by_admin_actor_id is not null)
    or (opened_origin = 'system' and opened_by_admin_actor_id is null)
  );

alter table ironclad_private.warfront_operation_room_retention_holds
  alter column created_by_admin_actor_id drop not null;
alter table ironclad_private.warfront_operation_room_retention_holds
  add column created_origin text not null default 'admin';
alter table ironclad_private.warfront_operation_room_retention_holds
  add constraint warfront_operation_room_retention_holds_created_origin_check
  check (
    (created_origin = 'admin' and created_by_admin_actor_id is not null)
    or (created_origin = 'system' and created_by_admin_actor_id is null)
  );
alter table ironclad_private.warfront_operation_room_retention_holds
  add constraint warfront_operation_room_retention_holds_operation_id_id_key
  unique (operation_id, id);
alter table ironclad_private.warfront_operation_room_retention_holds
  add constraint warfront_operation_room_retention_holds_operation_case_id_id_key
  unique (operation_id, case_id, id);

create table public.warfront_operation_results (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  submitted_challenger_wins smallint not null,
  submitted_opponent_wins smallint not null,
  submitted_winner_side text not null,
  submitted_by_player_id uuid not null
    references public.players(id) on delete restrict,
  client_submission_id uuid not null,
  submitted_at timestamptz not null,
  confirmation_deadline timestamptz not null,
  constraint warfront_operation_results_score_range_check check (
    submitted_challenger_wins between 0 and 3
    and submitted_opponent_wins between 0 and 3
    and submitted_challenger_wins <> submitted_opponent_wins
  ),
  constraint warfront_operation_results_winner_check check (
    (submitted_winner_side = 'challenger'
      and submitted_challenger_wins > submitted_opponent_wins)
    or (submitted_winner_side = 'opponent'
      and submitted_opponent_wins > submitted_challenger_wins)
  ),
  constraint warfront_operation_results_deadline_check check (
    confirmation_deadline = submitted_at + interval '15 minutes'
  )
);

create index warfront_operation_results_submitter_idx
  on public.warfront_operation_results(submitted_by_player_id, operation_id);

create table public.warfront_operation_result_confirmations (
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  side text not null,
  confirmed_by_player_id uuid not null
    references public.players(id) on delete restrict,
  confirmed_at timestamptz not null,
  constraint warfront_operation_result_confirmations_pkey primary key (
    operation_id,
    side
  ),
  constraint warfront_operation_result_confirmations_side_check check (
    side in ('challenger', 'opponent')
  ),
  constraint warfront_operation_result_confirmations_player_key unique (
    operation_id,
    confirmed_by_player_id
  )
);

create index warfront_operation_result_confirmations_player_idx
  on public.warfront_operation_result_confirmations(
    confirmed_by_player_id,
    operation_id
  );

create table public.warfront_operation_result_disputes (
  id uuid primary key,
  operation_id uuid not null unique
    references public.warfront_operations(id) on delete restrict,
  disputed_by_player_id uuid not null
    references public.players(id) on delete restrict,
  disputing_side text not null,
  disputed_at timestamptz not null,
  retention_case_id uuid not null unique,
  retention_hold_id uuid not null unique,
  constraint warfront_operation_result_disputes_side_check check (
    disputing_side in ('challenger', 'opponent')
  ),
  constraint warfront_operation_result_disputes_case_operation_fkey
    foreign key (operation_id, retention_case_id)
    references ironclad_private.warfront_operation_room_retention_cases(
      operation_id,
      id
    ) on delete restrict,
  constraint warfront_operation_result_disputes_hold_operation_fkey
    foreign key (operation_id, retention_hold_id)
    references ironclad_private.warfront_operation_room_retention_holds(
      operation_id,
      id
    ) on delete restrict,
  constraint warfront_operation_result_disputes_hold_case_operation_fkey
    foreign key (operation_id, retention_case_id, retention_hold_id)
    references ironclad_private.warfront_operation_room_retention_holds(
      operation_id,
      case_id,
      id
    ) on delete restrict
);

create index warfront_operation_result_disputes_player_idx
  on public.warfront_operation_result_disputes(
    disputed_by_player_id,
    operation_id
  );

create table public.warfront_operation_result_finalizations (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  final_challenger_wins smallint not null,
  final_opponent_wins smallint not null,
  final_winner_side text not null,
  finalization_mode text not null,
  finalized_at timestamptz not null,
  finalized_by_admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  constraint warfront_operation_result_finalizations_score_range_check check (
    final_challenger_wins between 0 and 3
    and final_opponent_wins between 0 and 3
    and final_challenger_wins <> final_opponent_wins
  ),
  constraint warfront_operation_result_finalizations_winner_check check (
    (final_winner_side = 'challenger'
      and final_challenger_wins > final_opponent_wins)
    or (final_winner_side = 'opponent'
      and final_opponent_wins > final_challenger_wins)
  ),
  constraint warfront_operation_result_finalizations_mode_check check (
    finalization_mode in (
      'both_teams_confirmed',
      'auto_confirmed',
      'admin_resolution'
    )
  ),
  constraint warfront_operation_result_finalizations_admin_check check (
    (finalization_mode = 'admin_resolution'
      and finalized_by_admin_actor_id is not null)
    or (finalization_mode in ('both_teams_confirmed', 'auto_confirmed')
      and finalized_by_admin_actor_id is null)
  )
);

create index warfront_operation_result_finalizations_finalized_idx
  on public.warfront_operation_result_finalizations(finalized_at, operation_id);

-- Exact BO validation is authority-specific because series_best_of belongs to
-- the immutable Operation rather than being duplicated in result storage.
create function ironclad_private.warfront_operation_result_winner(
  p_series_best_of smallint,
  p_challenger_wins smallint,
  p_opponent_wins smallint
)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if p_series_best_of = 3
    and (p_challenger_wins, p_opponent_wins) in (
      (2::smallint, 0::smallint),
      (2::smallint, 1::smallint),
      (0::smallint, 2::smallint),
      (1::smallint, 2::smallint)
    ) then
    return case when p_challenger_wins = 2 then 'challenger' else 'opponent' end;
  end if;

  if p_series_best_of = 5
    and (p_challenger_wins, p_opponent_wins) in (
      (3::smallint, 0::smallint),
      (3::smallint, 1::smallint),
      (3::smallint, 2::smallint),
      (0::smallint, 3::smallint),
      (1::smallint, 3::smallint),
      (2::smallint, 3::smallint)
    ) then
    return case when p_challenger_wins = 3 then 'challenger' else 'opponent' end;
  end if;

  raise exception 'WARFRONT_OPERATION_RESULT_SCORE_INVALID'
    using errcode = '22023';
end;
$$;

-- The parent Operation is already FOR UPDATE in every M9 caller. This helper
-- reuses that serialization point and creates the sole final result row.
create function ironclad_private.finalize_warfront_operation_result_locked(
  p_operation_id uuid,
  p_finalization_mode text,
  p_challenger_wins smallint,
  p_opponent_wins smallint,
  p_finalized_at timestamptz,
  p_admin_actor_id uuid default null
)
returns public.warfront_operation_result_finalizations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
  v_winner_side text;
begin
  if p_operation_id is null
    or p_finalization_mode not in (
      'both_teams_confirmed', 'auto_confirmed', 'admin_resolution'
    )
    or p_finalized_at is null
    or ((p_finalization_mode = 'admin_resolution') is distinct from
        (p_admin_actor_id is not null)) then
    raise exception 'WARFRONT_OPERATION_RESULT_FINALIZATION_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  select finalization.* into v_finalization
  from public.warfront_operation_result_finalizations as finalization
  where finalization.operation_id = v_operation.id
  for update;

  if found then
    return v_finalization;
  end if;

  if v_operation.status <> 'pending_result' then
    raise exception 'WARFRONT_OPERATION_RESULT_NOT_FINALIZABLE'
      using errcode = '55000';
  end if;

  v_winner_side := ironclad_private.warfront_operation_result_winner(
    v_operation.series_best_of,
    p_challenger_wins,
    p_opponent_wins
  );

  insert into public.warfront_operation_result_finalizations (
    operation_id,
    final_challenger_wins,
    final_opponent_wins,
    final_winner_side,
    finalization_mode,
    finalized_at,
    finalized_by_admin_actor_id
  ) values (
    v_operation.id,
    p_challenger_wins,
    p_opponent_wins,
    v_winner_side,
    p_finalization_mode,
    p_finalized_at,
    p_admin_actor_id
  ) returning * into v_finalization;

  update public.warfront_operations as operation
  set status = 'completed', completed_at = p_finalized_at
  where operation.id = v_operation.id
    and operation.status = 'pending_result'
    and operation.completed_at is null
    and operation.cancelled_at is null;

  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_FINALIZATION_CONFLICT'
      using errcode = '40001';
  end if;

  return v_finalization;
end;
$$;

create function ironclad_private.reconcile_warfront_operation_result_if_due_locked(
  p_operation_id uuid,
  p_checked_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_result public.warfront_operation_results%rowtype;
begin
  if p_operation_id is null or p_checked_at is null then
    raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found or v_operation.status <> 'pending_result' then
    return false;
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  if exists (
    select 1 from public.warfront_operation_result_finalizations as finalization
    where finalization.operation_id = v_operation.id
  ) or exists (
    select 1 from public.warfront_operation_result_disputes as dispute
    where dispute.operation_id = v_operation.id
  ) then
    return false;
  end if;

  select result.* into v_result
  from public.warfront_operation_results as result
  where result.operation_id = v_operation.id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  if v_result.confirmation_deadline > p_checked_at then
    return false;
  end if;

  perform ironclad_private.finalize_warfront_operation_result_locked(
    v_operation.id,
    'auto_confirmed',
    v_result.submitted_challenger_wins,
    v_result.submitted_opponent_wins,
    p_checked_at,
    null
  );

  return true;
end;
$$;

-- Only M9 dispute authority invokes this helper. The system-origin evidence
-- rows carry no Player or Clerk attribution; the M9 dispute is canonical.
create function ironclad_private.create_warfront_operation_result_dispute_evidence_locked(
  p_operation_id uuid,
  p_dispute_id uuid,
  p_created_at timestamptz
)
returns table (retention_case_id uuid, retention_hold_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_case_id uuid;
  v_hold_id uuid;
begin
  if p_operation_id is null or p_dispute_id is null or p_created_at is null then
    raise exception 'WARFRONT_OPERATION_RESULT_EVIDENCE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from ironclad_private.warfront_operation_room_content_purges as purge
    where purge.operation_id = p_operation_id
  ) then
    raise exception 'WARFRONT_OPERATION_ROOM_EVIDENCE_UNAVAILABLE'
      using errcode = '55000';
  end if;

  insert into ironclad_private.warfront_operation_room_retention_cases (
    operation_id,
    case_reference,
    case_kind,
    opened_at,
    opened_by_admin_actor_id,
    opened_origin,
    updated_at
  ) values (
    p_operation_id,
    p_dispute_id,
    'dispute',
    p_created_at,
    null,
    'system',
    p_created_at
  ) returning id into v_case_id;

  insert into ironclad_private.warfront_operation_room_retention_holds (
    operation_id,
    case_id,
    reason,
    created_at,
    created_by_admin_actor_id,
    created_origin
  ) values (
    p_operation_id,
    v_case_id,
    'competition_integrity',
    p_created_at,
    null,
    'system'
  ) returning id into v_hold_id;

  insert into ironclad_private.warfront_operation_room_privacy_audit (
    operation_id, action, case_id, hold_id, occurred_at
  ) values (
    p_operation_id, 'case_opened', v_case_id, null, p_created_at
  ), (
    p_operation_id, 'hold_created', v_case_id, v_hold_id, p_created_at
  );

  return query select v_case_id, v_hold_id;
end;
$$;

create function ironclad_private.resolve_warfront_operation_result_dispute_evidence_locked(
  p_operation_id uuid,
  p_dispute_id uuid,
  p_retention_case_id uuid,
  p_retention_hold_id uuid,
  p_admin_actor_id uuid,
  p_resolved_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_case ironclad_private.warfront_operation_room_retention_cases%rowtype;
  v_hold ironclad_private.warfront_operation_room_retention_holds%rowtype;
begin
  if pg_catalog.num_nonnulls(
    p_operation_id, p_dispute_id, p_retention_case_id,
    p_retention_hold_id, p_admin_actor_id, p_resolved_at
  ) <> 6 then
    raise exception 'WARFRONT_OPERATION_RESULT_EVIDENCE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select retention_case.* into v_case
  from ironclad_private.warfront_operation_room_retention_cases as retention_case
  where retention_case.id = p_retention_case_id
    and retention_case.operation_id = p_operation_id
  for update;

  select hold.* into v_hold
  from ironclad_private.warfront_operation_room_retention_holds as hold
  where hold.id = p_retention_hold_id
    and hold.operation_id = p_operation_id
  for update;

  if v_case.id is null
    or v_hold.id is null
    or v_case.case_reference <> p_dispute_id
    or v_case.case_kind <> 'dispute'
    or v_case.opened_origin <> 'system'
    or v_hold.case_id <> v_case.id
    or v_hold.reason <> 'competition_integrity'
    or v_hold.created_origin <> 'system'
    or v_case.closed_at is not null
    or v_hold.released_at is not null then
    raise exception 'WARFRONT_OPERATION_RESULT_EVIDENCE_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  update ironclad_private.warfront_operation_room_retention_holds
  set released_at = p_resolved_at,
      released_by_admin_actor_id = p_admin_actor_id
  where id = v_hold.id;

  update ironclad_private.warfront_operation_room_retention_cases
  set closed_at = p_resolved_at,
      closed_by_admin_actor_id = p_admin_actor_id,
      updated_at = p_resolved_at
  where id = v_case.id;

  insert into ironclad_private.warfront_operation_room_privacy_audit (
    operation_id, action, admin_actor_id, case_id, hold_id, occurred_at
  ) values (
    p_operation_id, 'hold_released', p_admin_actor_id,
    v_case.id, v_hold.id, p_resolved_at
  ), (
    p_operation_id, 'case_closed', p_admin_actor_id,
    v_case.id, null, p_resolved_at
  );
end;
$$;

create function ironclad_private.warfront_operation_result_projection(
  p_operation_id uuid,
  p_viewer_side text default null,
  p_include_admin_actions boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_result public.warfront_operation_results%rowtype;
  v_dispute public.warfront_operation_result_disputes%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
  v_challenger_confirmed boolean;
  v_opponent_confirmed boolean;
  v_due boolean := false;
begin
  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;
  select result.* into v_result
  from public.warfront_operation_results as result
  where result.operation_id = p_operation_id;
  select dispute.* into v_dispute
  from public.warfront_operation_result_disputes as dispute
  where dispute.operation_id = p_operation_id;
  select finalization.* into v_finalization
  from public.warfront_operation_result_finalizations as finalization
  where finalization.operation_id = p_operation_id;
  select exists (
    select 1 from public.warfront_operation_result_confirmations as confirmation
    where confirmation.operation_id = p_operation_id and confirmation.side = 'challenger'
  ) into v_challenger_confirmed;
  select exists (
    select 1 from public.warfront_operation_result_confirmations as confirmation
    where confirmation.operation_id = p_operation_id and confirmation.side = 'opponent'
  ) into v_opponent_confirmed;

  v_due := v_operation.status = 'pending_result'
    and v_result.operation_id is not null
    and v_finalization.operation_id is null
    and v_dispute.operation_id is null
    and v_result.confirmation_deadline <= pg_catalog.now();

  return pg_catalog.jsonb_build_object(
    'operationId', p_operation_id,
    'operationStatus', v_operation.status,
    'seriesBestOf', v_operation.series_best_of,
    'submittedResult', case when v_result.operation_id is null then null else
      pg_catalog.jsonb_build_object(
        'challengerWins', v_result.submitted_challenger_wins,
        'opponentWins', v_result.submitted_opponent_wins,
        'winnerSide', v_result.submitted_winner_side
      ) end,
    'submittedAt', v_result.submitted_at,
    'confirmationDeadline', v_result.confirmation_deadline,
    'challengerConfirmed', v_challenger_confirmed,
    'opponentConfirmed', v_opponent_confirmed,
    'disputed', v_dispute.operation_id is not null,
    'disputingSide', v_dispute.disputing_side,
    'finalResult', case when v_finalization.operation_id is null then null else
      pg_catalog.jsonb_build_object(
        'challengerWins', v_finalization.final_challenger_wins,
        'opponentWins', v_finalization.final_opponent_wins,
        'winnerSide', v_finalization.final_winner_side
      ) end,
    'finalizationMode', v_finalization.finalization_mode,
    'finalizedAt', v_finalization.finalized_at,
    'logicalAutoFinalizationDue', v_due,
    'viewerSide', p_viewer_side,
    'canConfirm', p_viewer_side is not null
      and v_operation.status = 'pending_result'
      and v_result.operation_id is not null
      and v_finalization.operation_id is null
      and v_dispute.operation_id is null
      and v_result.confirmation_deadline > pg_catalog.now()
      and not exists (
        select 1 from public.warfront_operation_result_confirmations as confirmation
        where confirmation.operation_id = p_operation_id
          and confirmation.side = p_viewer_side
      ),
    'canDispute', p_viewer_side is not null
      and v_operation.status = 'pending_result'
      and v_result.operation_id is not null
      and v_finalization.operation_id is null
      and v_dispute.operation_id is null
      and v_result.confirmation_deadline > pg_catalog.now(),
    'canAdminResolve', p_include_admin_actions
      and v_operation.status = 'pending_result'
      and v_dispute.operation_id is not null
      and v_finalization.operation_id is null
  );
end;
$$;

create function ironclad_private.protect_warfront_operation_result_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'WARFRONT_OPERATION_RESULT_HISTORY_IMMUTABLE'
    using errcode = '55000';
end;
$$;

create trigger warfront_operation_results_immutable
before update or delete on public.warfront_operation_results
for each row execute function ironclad_private.protect_warfront_operation_result_history();
create trigger warfront_operation_result_confirmations_immutable
before update or delete on public.warfront_operation_result_confirmations
for each row execute function ironclad_private.protect_warfront_operation_result_history();
create trigger warfront_operation_result_disputes_immutable
before update or delete on public.warfront_operation_result_disputes
for each row execute function ironclad_private.protect_warfront_operation_result_history();
create trigger warfront_operation_result_finalizations_immutable
before update or delete on public.warfront_operation_result_finalizations
for each row execute function ironclad_private.protect_warfront_operation_result_history();

create function public.submit_warfront_operation_result(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_client_submission_id uuid,
  p_challenger_wins smallint,
  p_opponent_wins smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_side text;
  v_operation public.warfront_operations%rowtype;
  v_existing public.warfront_operation_results%rowtype;
  v_winner_side text;
  v_submitted_at timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  if p_operation_id is null or v_actor is null
    or pg_catalog.char_length(v_actor) > 256 or v_actor ~ '[[:cntrl:]]'
    or p_client_submission_id is null or p_challenger_wins is null
    or p_opponent_wins is null then
    raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id for update;
  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode = '42501';
  end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select entry.side into v_side from public.warfront_operation_roster_entries as entry
  where entry.operation_id = v_operation.id and entry.player_id = v_player_id;
  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode = '42501';
  end if;

  v_winner_side := ironclad_private.warfront_operation_result_winner(
    v_operation.series_best_of, p_challenger_wins, p_opponent_wins
  );
  select result.* into v_existing from public.warfront_operation_results as result
  where result.operation_id = v_operation.id for update;
  if found then
    if v_existing.submitted_by_player_id = v_player_id
      and v_existing.client_submission_id = p_client_submission_id then
      if v_existing.submitted_challenger_wins <> p_challenger_wins
        or v_existing.submitted_opponent_wins <> p_opponent_wins then
        raise exception 'WARFRONT_OPERATION_RESULT_IDEMPOTENCY_CONFLICT'
          using errcode = '23505';
      end if;
      return pg_catalog.jsonb_build_object(
        'result', ironclad_private.warfront_operation_result_projection(v_operation.id, v_side, false),
        'duplicate', true
      );
    end if;
    raise exception 'WARFRONT_OPERATION_RESULT_ALREADY_SUBMITTED'
      using errcode = '55000';
  end if;

  if v_operation.status <> 'in_progress' then
    raise exception 'WARFRONT_OPERATION_RESULT_SUBMISSION_NOT_ACTIONABLE'
      using errcode = '55000';
  end if;

  v_submitted_at := pg_catalog.clock_timestamp();
  insert into public.warfront_operation_results(
    operation_id, submitted_challenger_wins, submitted_opponent_wins,
    submitted_winner_side, submitted_by_player_id, client_submission_id,
    submitted_at, confirmation_deadline
  ) values (
    v_operation.id, p_challenger_wins, p_opponent_wins, v_winner_side,
    v_player_id, p_client_submission_id, v_submitted_at,
    v_submitted_at + interval '15 minutes'
  );
  update public.warfront_operations as operation
  set status = 'pending_result'
  where operation.id = v_operation.id and operation.status = 'in_progress';
  if not found then
    raise exception 'WARFRONT_OPERATION_RESULT_SUBMISSION_CONFLICT'
      using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'result', ironclad_private.warfront_operation_result_projection(v_operation.id, v_side, false),
    'duplicate', false
  );
end;
$$;

create function public.confirm_warfront_operation_result(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_side text;
  v_operation public.warfront_operations%rowtype;
  v_result public.warfront_operation_results%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
  v_now timestamptz;
  v_created boolean := false;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select entry.side into v_side from public.warfront_operation_roster_entries as entry where entry.operation_id=v_operation.id and entry.player_id=v_player_id;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  select result.* into v_result from public.warfront_operation_results as result where result.operation_id=v_operation.id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  v_now := pg_catalog.clock_timestamp();
  perform ironclad_private.reconcile_warfront_operation_result_if_due_locked(v_operation.id, v_now);
  select finalization.* into v_finalization from public.warfront_operation_result_finalizations as finalization where finalization.operation_id=v_operation.id;
  if found then return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false),'alreadyFinalized',true); end if;
  if exists(select 1 from public.warfront_operation_result_disputes as dispute where dispute.operation_id=v_operation.id) then raise exception 'WARFRONT_OPERATION_RESULT_DISPUTED' using errcode='55000'; end if;
  if v_operation.status <> 'pending_result' then raise exception 'WARFRONT_OPERATION_RESULT_CONFIRMATION_NOT_ACTIONABLE' using errcode='55000'; end if;
  if exists(select 1 from public.warfront_operation_result_confirmations as confirmation where confirmation.operation_id=v_operation.id and confirmation.side=v_side) then
    return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false),'alreadyConfirmed',true);
  end if;
  insert into public.warfront_operation_result_confirmations(operation_id,side,confirmed_by_player_id,confirmed_at)
  values(v_operation.id,v_side,v_player_id,v_now);
  v_created := true;
  if (select count(*) from public.warfront_operation_result_confirmations as confirmation where confirmation.operation_id=v_operation.id) = 2 then
    perform ironclad_private.finalize_warfront_operation_result_locked(v_operation.id,'both_teams_confirmed',v_result.submitted_challenger_wins,v_result.submitted_opponent_wins,v_now,null);
  end if;
  return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false),'confirmed',v_created);
end;
$$;

create function public.dispute_warfront_operation_result(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_side text;
  v_operation public.warfront_operations%rowtype;
  v_result public.warfront_operation_results%rowtype;
  v_dispute_id uuid := pg_catalog.gen_random_uuid();
  v_case_id uuid;
  v_hold_id uuid;
  v_now timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select entry.side into v_side from public.warfront_operation_roster_entries as entry where entry.operation_id=v_operation.id and entry.player_id=v_player_id;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  select result.* into v_result from public.warfront_operation_results as result where result.operation_id=v_operation.id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  v_now := pg_catalog.clock_timestamp();
  perform ironclad_private.reconcile_warfront_operation_result_if_due_locked(v_operation.id,v_now);
  if exists(select 1 from public.warfront_operation_result_finalizations as finalization where finalization.operation_id=v_operation.id) then
    return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false),'alreadyFinalized',true);
  end if;
  if exists(select 1 from public.warfront_operation_result_disputes as dispute where dispute.operation_id=v_operation.id) then raise exception 'WARFRONT_OPERATION_RESULT_ALREADY_DISPUTED' using errcode='55000'; end if;
  if v_operation.status <> 'pending_result' then raise exception 'WARFRONT_OPERATION_RESULT_DISPUTE_NOT_ACTIONABLE' using errcode='55000'; end if;
  select evidence.retention_case_id,evidence.retention_hold_id into v_case_id,v_hold_id
  from ironclad_private.create_warfront_operation_result_dispute_evidence_locked(v_operation.id,v_dispute_id,v_now) as evidence;
  insert into public.warfront_operation_result_disputes(id,operation_id,disputed_by_player_id,disputing_side,disputed_at,retention_case_id,retention_hold_id)
  values(v_dispute_id,v_operation.id,v_player_id,v_side,v_now,v_case_id,v_hold_id);
  return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false),'disputed',true);
end;
$$;

create function public.reconcile_warfront_operation_result_if_due(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_materialized boolean;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  v_materialized := ironclad_private.reconcile_warfront_operation_result_if_due_locked(v_operation.id,v_now);
  return pg_catalog.jsonb_build_object(
    'result',ironclad_private.warfront_operation_result_projection(v_operation.id,null,false),
    'autoFinalized',v_materialized
  );
end;
$$;

create function public.resolve_warfront_operation_result_dispute(
  p_operation_id uuid,
  p_admin_clerk_user_id text,
  p_challenger_wins smallint,
  p_opponent_wins smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_result public.warfront_operation_results%rowtype;
  v_dispute public.warfront_operation_result_disputes%rowtype;
  v_now timestamptz;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' or p_challenger_wins is null or p_opponent_wins is null then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id := ironclad_private.resolve_warfront_operation_room_admin_actor(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id for update;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  if v_operation.status <> 'pending_result' then raise exception 'WARFRONT_OPERATION_RESULT_RESOLUTION_NOT_ACTIONABLE' using errcode='55000'; end if;
  select result.* into v_result from public.warfront_operation_results as result where result.operation_id=v_operation.id for update;
  select dispute.* into v_dispute from public.warfront_operation_result_disputes as dispute where dispute.operation_id=v_operation.id for update;
  if v_result.operation_id is null or v_dispute.operation_id is null then raise exception 'WARFRONT_OPERATION_RESULT_DISPUTE_UNAVAILABLE' using errcode='55000'; end if;
  if exists(select 1 from public.warfront_operation_result_finalizations as finalization where finalization.operation_id=v_operation.id) then raise exception 'WARFRONT_OPERATION_RESULT_ALREADY_FINALIZED' using errcode='55000'; end if;
  perform ironclad_private.warfront_operation_result_winner(v_operation.series_best_of,p_challenger_wins,p_opponent_wins);
  v_now := pg_catalog.clock_timestamp();
  perform ironclad_private.resolve_warfront_operation_result_dispute_evidence_locked(v_operation.id,v_dispute.id,v_dispute.retention_case_id,v_dispute.retention_hold_id,v_admin_actor_id,v_now);
  perform ironclad_private.finalize_warfront_operation_result_locked(v_operation.id,'admin_resolution',p_challenger_wins,p_opponent_wins,v_now,v_admin_actor_id);
  return pg_catalog.jsonb_build_object('result',ironclad_private.warfront_operation_result_projection(v_operation.id,null,true),'resolved',true);
end;
$$;

create function public.get_warfront_operation_result(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_side text;
  v_operation public.warfront_operations%rowtype;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  select entry.side into v_side from public.warfront_operation_roster_entries as entry where entry.operation_id=v_operation.id and entry.player_id=v_player_id;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  return ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false);
end;
$$;

create function public.get_warfront_operation_result_admin(
  p_operation_id uuid,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_admin_clerk_user_id), '');
  v_operation public.warfront_operations%rowtype;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor ~ '[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_RESULT_INPUT_INVALID' using errcode='22023'; end if;
  select operation.* into v_operation from public.warfront_operations as operation where operation.id=p_operation_id;
  if not found then raise exception 'WARFRONT_OPERATION_RESULT_UNAVAILABLE' using errcode='42501'; end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  return ironclad_private.warfront_operation_result_projection(v_operation.id,null,true);
end;
$$;

create function public.submit_warfront_operation_result_api(uuid,text,uuid,smallint,smallint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.submit_warfront_operation_result($1,$2,$3,$4,$5);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.confirm_warfront_operation_result_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.confirm_warfront_operation_result($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.dispute_warfront_operation_result_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.dispute_warfront_operation_result($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.reconcile_warfront_operation_result_if_due_api(uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.reconcile_warfront_operation_result_if_due($1);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.resolve_warfront_operation_result_dispute_api(uuid,text,smallint,smallint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.resolve_warfront_operation_result_dispute($1,$2,$3,$4);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create function public.get_warfront_operation_result_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_operation_result($1,$2);
end;
$$;

create function public.get_warfront_operation_result_admin_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_operation_result_admin($1,$2);
end;
$$;

-- Preserve every effective M7 retention condition and add only immutable M9
-- competitive Player references. M8 system-origin evidence has no Player FK.
create or replace function ironclad_private.player_requires_warfront_identity_retention(
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    exists (select 1 from public.warfront_company_members as member where member.player_id=p_player_id)
    or exists (select 1 from public.warfront_operations as operation where operation.created_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operations as operation where operation.accepted_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_roster_entries as entry where entry.player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_roster_entries as entry where entry.selected_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_dice_rolls as roll where roll.rolled_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_chat_messages as message where message.sender_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_room_reads as read_cursor where read_cursor.player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_room_assistance as assistance where assistance.requested_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_room_notification_episodes as episode where episode.recipient_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_results as result where result.submitted_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_result_confirmations as confirmation where confirmation.confirmed_by_player_id=p_player_id)
    or exists (select 1 from public.warfront_operation_result_disputes as dispute where dispute.disputed_by_player_id=p_player_id);
$$;

alter table public.warfront_operation_results owner to postgres;
alter table public.warfront_operation_results enable row level security;
alter table public.warfront_operation_results force row level security;
revoke all on table public.warfront_operation_results from public, anon, authenticated, service_role;
alter table public.warfront_operation_result_confirmations owner to postgres;
alter table public.warfront_operation_result_confirmations enable row level security;
alter table public.warfront_operation_result_confirmations force row level security;
revoke all on table public.warfront_operation_result_confirmations from public, anon, authenticated, service_role;
alter table public.warfront_operation_result_disputes owner to postgres;
alter table public.warfront_operation_result_disputes enable row level security;
alter table public.warfront_operation_result_disputes force row level security;
revoke all on table public.warfront_operation_result_disputes from public, anon, authenticated, service_role;
alter table public.warfront_operation_result_finalizations owner to postgres;
alter table public.warfront_operation_result_finalizations enable row level security;
alter table public.warfront_operation_result_finalizations force row level security;
revoke all on table public.warfront_operation_result_finalizations from public, anon, authenticated, service_role;

alter function ironclad_private.warfront_operation_result_winner(smallint,smallint,smallint) owner to postgres;
alter function ironclad_private.finalize_warfront_operation_result_locked(uuid,text,smallint,smallint,timestamptz,uuid) owner to postgres;
alter function ironclad_private.reconcile_warfront_operation_result_if_due_locked(uuid,timestamptz) owner to postgres;
alter function ironclad_private.create_warfront_operation_result_dispute_evidence_locked(uuid,uuid,timestamptz) owner to postgres;
alter function ironclad_private.resolve_warfront_operation_result_dispute_evidence_locked(uuid,uuid,uuid,uuid,uuid,timestamptz) owner to postgres;
alter function ironclad_private.warfront_operation_result_projection(uuid,text,boolean) owner to postgres;
alter function ironclad_private.protect_warfront_operation_result_history() owner to postgres;
revoke all on function ironclad_private.warfront_operation_result_winner(smallint,smallint,smallint),ironclad_private.finalize_warfront_operation_result_locked(uuid,text,smallint,smallint,timestamptz,uuid),ironclad_private.reconcile_warfront_operation_result_if_due_locked(uuid,timestamptz),ironclad_private.create_warfront_operation_result_dispute_evidence_locked(uuid,uuid,timestamptz),ironclad_private.resolve_warfront_operation_result_dispute_evidence_locked(uuid,uuid,uuid,uuid,uuid,timestamptz),ironclad_private.warfront_operation_result_projection(uuid,text,boolean),ironclad_private.protect_warfront_operation_result_history() from public, anon, authenticated, service_role;

alter function public.submit_warfront_operation_result(uuid,text,uuid,smallint,smallint) owner to postgres;
alter function public.confirm_warfront_operation_result(uuid,text) owner to postgres;
alter function public.dispute_warfront_operation_result(uuid,text) owner to postgres;
alter function public.reconcile_warfront_operation_result_if_due(uuid) owner to postgres;
alter function public.resolve_warfront_operation_result_dispute(uuid,text,smallint,smallint) owner to postgres;
alter function public.get_warfront_operation_result(uuid,text) owner to postgres;
alter function public.get_warfront_operation_result_admin(uuid,text) owner to postgres;
revoke all on function public.submit_warfront_operation_result(uuid,text,uuid,smallint,smallint),public.confirm_warfront_operation_result(uuid,text),public.dispute_warfront_operation_result(uuid,text),public.reconcile_warfront_operation_result_if_due(uuid),public.resolve_warfront_operation_result_dispute(uuid,text,smallint,smallint),public.get_warfront_operation_result(uuid,text),public.get_warfront_operation_result_admin(uuid,text) from public, anon, authenticated, service_role;

alter function public.submit_warfront_operation_result_api(uuid,text,uuid,smallint,smallint) owner to postgres;
alter function public.confirm_warfront_operation_result_api(uuid,text) owner to postgres;
alter function public.dispute_warfront_operation_result_api(uuid,text) owner to postgres;
alter function public.reconcile_warfront_operation_result_if_due_api(uuid) owner to postgres;
alter function public.resolve_warfront_operation_result_dispute_api(uuid,text,smallint,smallint) owner to postgres;
alter function public.get_warfront_operation_result_api(uuid,text) owner to postgres;
alter function public.get_warfront_operation_result_admin_api(uuid,text) owner to postgres;
revoke all on function public.submit_warfront_operation_result_api(uuid,text,uuid,smallint,smallint),public.confirm_warfront_operation_result_api(uuid,text),public.dispute_warfront_operation_result_api(uuid,text),public.reconcile_warfront_operation_result_if_due_api(uuid),public.resolve_warfront_operation_result_dispute_api(uuid,text,smallint,smallint),public.get_warfront_operation_result_api(uuid,text),public.get_warfront_operation_result_admin_api(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.submit_warfront_operation_result_api(uuid,text,uuid,smallint,smallint),public.confirm_warfront_operation_result_api(uuid,text),public.dispute_warfront_operation_result_api(uuid,text),public.reconcile_warfront_operation_result_if_due_api(uuid),public.resolve_warfront_operation_result_dispute_api(uuid,text,smallint,smallint),public.get_warfront_operation_result_api(uuid,text),public.get_warfront_operation_result_admin_api(uuid,text) to service_role;

alter function ironclad_private.player_requires_warfront_identity_retention(uuid) owner to postgres;
revoke all on function ironclad_private.player_requires_warfront_identity_retention(uuid) from public, anon, authenticated, service_role;

comment on table public.warfront_operation_results is
  'Private immutable submitted Ranked Operation series proposals. The winner side is derived by M9 authority from the immutable Operation best-of format and supplied score.';
comment on table public.warfront_operation_result_confirmations is
  'Private immutable one-effective-confirmation-per-locked-Operation-side facts.';
comment on table public.warfront_operation_result_disputes is
  'Private immutable competitive disputes. Player attribution remains here; linked M8 case/hold rows are system-generated evidence protection.';
comment on table public.warfront_operation_result_finalizations is
  'Private immutable authoritative final Ranked Operation outcomes for future M10 settlement consumption.';
comment on column ironclad_private.warfront_operation_room_retention_cases.opened_origin is
  'admin denotes normal M8 operator authority; system denotes narrowly scoped system-generated M9 dispute evidence protection.';
comment on column ironclad_private.warfront_operation_room_retention_holds.created_origin is
  'admin denotes normal M8 operator authority; system denotes narrowly scoped system-generated M9 dispute evidence protection.';

commit;
