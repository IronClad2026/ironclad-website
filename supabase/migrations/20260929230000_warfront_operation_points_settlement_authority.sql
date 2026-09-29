begin;

-- M10 is the immutable system settlement layer between M9 finalization and
-- future rankings/Combat Record projections. Every current Operation is Ranked.
create table public.warfront_operation_point_settlements (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  settled_at timestamptz not null,
  constraint warfront_operation_point_settlements_finalization_fkey
    foreign key (operation_id)
    references public.warfront_operation_result_finalizations(operation_id)
    on delete restrict
);

create table public.warfront_company_point_ledger_entries (
  operation_id uuid not null
    references public.warfront_operation_point_settlements(operation_id)
    on delete restrict,
  side text not null,
  company_id uuid not null
    references public.warfront_companies(id) on delete restrict,
  outcome text not null,
  points_delta smallint not null,
  constraint warfront_company_point_ledger_entries_pkey primary key (
    operation_id,
    side
  ),
  constraint warfront_company_point_ledger_entries_operation_company_key unique (
    operation_id,
    company_id
  ),
  constraint warfront_company_point_ledger_entries_side_check check (
    side in ('challenger', 'opponent')
  ),
  constraint warfront_company_point_ledger_entries_outcome_check check (
    outcome in ('win', 'loss')
  ),
  constraint warfront_company_point_ledger_entries_outcome_points_check check (
    (outcome = 'win' and points_delta = 10)
    or (outcome = 'loss' and points_delta = 0)
  )
);

create index warfront_company_point_ledger_entries_company_operation_idx
  on public.warfront_company_point_ledger_entries(company_id, operation_id);

-- This projection is also the receipt-integrity verifier. It never accepts a
-- settlement whose durable accounting shape differs from M9's final outcome.
create function ironclad_private.warfront_operation_point_settlement_projection(
  p_operation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_settlement public.warfront_operation_point_settlements%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
  v_challenger public.warfront_company_point_ledger_entries%rowtype;
  v_opponent public.warfront_company_point_ledger_entries%rowtype;
  v_ledger_count integer;
  v_winner_side text;
begin
  if p_operation_id is null then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;
  select settlement.* into v_settlement
  from public.warfront_operation_point_settlements as settlement
  where settlement.operation_id = p_operation_id;
  select finalization.* into v_finalization
  from public.warfront_operation_result_finalizations as finalization
  where finalization.operation_id = p_operation_id;

  if v_operation.id is null
    or v_settlement.operation_id is null
    or v_finalization.operation_id is null
    or v_operation.status <> 'completed'
    or v_operation.challenger_company_id is null
    or v_operation.opponent_company_id is null
    or v_operation.challenger_company_id = v_operation.opponent_company_id then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  begin
    v_winner_side := ironclad_private.warfront_operation_result_winner(
      v_operation.series_best_of,
      v_finalization.final_challenger_wins,
      v_finalization.final_opponent_wins
    );
  exception when sqlstate '22023' then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end;

  if v_winner_side <> v_finalization.final_winner_side then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)::integer into v_ledger_count
  from public.warfront_company_point_ledger_entries as entry
  where entry.operation_id = p_operation_id;
  select entry.* into v_challenger
  from public.warfront_company_point_ledger_entries as entry
  where entry.operation_id = p_operation_id
    and entry.side = 'challenger';
  select entry.* into v_opponent
  from public.warfront_company_point_ledger_entries as entry
  where entry.operation_id = p_operation_id
    and entry.side = 'opponent';

  if v_ledger_count <> 2
    or v_challenger.operation_id is null
    or v_opponent.operation_id is null
    or v_challenger.company_id <> v_operation.challenger_company_id
    or v_opponent.company_id <> v_operation.opponent_company_id
    or (v_winner_side = 'challenger' and (
      v_challenger.outcome <> 'win' or v_challenger.points_delta <> 10
      or v_opponent.outcome <> 'loss' or v_opponent.points_delta <> 0
    ))
    or (v_winner_side = 'opponent' and (
      v_challenger.outcome <> 'loss' or v_challenger.points_delta <> 0
      or v_opponent.outcome <> 'win' or v_opponent.points_delta <> 10
    )) then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_LEDGER_INCONSISTENT'
      using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'settledAt', v_settlement.settled_at,
    'challenger', pg_catalog.jsonb_build_object(
      'companyId', v_challenger.company_id,
      'outcome', v_challenger.outcome,
      'pointsDelta', v_challenger.points_delta
    ),
    'opponent', pg_catalog.jsonb_build_object(
      'companyId', v_opponent.company_id,
      'outcome', v_opponent.outcome,
      'pointsDelta', v_opponent.points_delta
    )
  );
end;
$$;

create function ironclad_private.protect_warfront_operation_point_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'WARFRONT_OPERATION_POINT_HISTORY_IMMUTABLE'
    using errcode = '55000';
end;
$$;

create trigger warfront_operation_point_settlements_immutable
before update or delete on public.warfront_operation_point_settlements
for each row execute function ironclad_private.protect_warfront_operation_point_history();

create trigger warfront_company_point_ledger_entries_immutable
before update or delete on public.warfront_company_point_ledger_entries
for each row execute function ironclad_private.protect_warfront_operation_point_history();

create function public.settle_warfront_operation_points(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
  v_settlement public.warfront_operation_point_settlements%rowtype;
  v_authority_at timestamptz;
  v_winner_side text;
  v_ledger_rows integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  select settlement.* into v_settlement
  from public.warfront_operation_point_settlements as settlement
  where settlement.operation_id = v_operation.id
  for update;

  if found then
    return ironclad_private.warfront_operation_point_settlement_projection(
      v_operation.id
    ) || pg_catalog.jsonb_build_object('duplicate', true);
  end if;

  v_authority_at := pg_catalog.clock_timestamp();
  perform ironclad_private.reconcile_warfront_operation_result_if_due_locked(
    v_operation.id,
    v_authority_at
  );

  select operation.* into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if v_operation.status <> 'completed' then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_NOT_FINALIZABLE'
      using errcode = '55000';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  if v_operation.challenger_company_id is null
    or v_operation.opponent_company_id is null
    or v_operation.challenger_company_id = v_operation.opponent_company_id then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  select finalization.* into v_finalization
  from public.warfront_operation_result_finalizations as finalization
  where finalization.operation_id = v_operation.id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_FINALIZATION_UNAVAILABLE'
      using errcode = '55000';
  end if;

  begin
    v_winner_side := ironclad_private.warfront_operation_result_winner(
      v_operation.series_best_of,
      v_finalization.final_challenger_wins,
      v_finalization.final_opponent_wins
    );
  exception when sqlstate '22023' then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end;

  if v_winner_side <> v_finalization.final_winner_side then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_STATE_INCONSISTENT'
      using errcode = '55000';
  end if;

  insert into public.warfront_operation_point_settlements(
    operation_id,
    settled_at
  ) values (
    v_operation.id,
    v_authority_at
  );

  insert into public.warfront_company_point_ledger_entries(
    operation_id,
    side,
    company_id,
    outcome,
    points_delta
  ) values (
    v_operation.id,
    'challenger',
    v_operation.challenger_company_id,
    case when v_winner_side = 'challenger' then 'win' else 'loss' end,
    case when v_winner_side = 'challenger' then 10 else 0 end
  ), (
    v_operation.id,
    'opponent',
    v_operation.opponent_company_id,
    case when v_winner_side = 'opponent' then 'win' else 'loss' end,
    case when v_winner_side = 'opponent' then 10 else 0 end
  );

  get diagnostics v_ledger_rows = row_count;
  if v_ledger_rows <> 2 then
    raise exception 'WARFRONT_OPERATION_SETTLEMENT_LEDGER_WRITE_INCONSISTENT'
      using errcode = '55000';
  end if;

  return ironclad_private.warfront_operation_point_settlement_projection(
    v_operation.id
  ) || pg_catalog.jsonb_build_object('duplicate', false);
end;
$$;

create function public.settle_warfront_operation_points_api(
  p_operation_id uuid
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

  return public.settle_warfront_operation_points(p_operation_id);
exception when serialization_failure then
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter table public.warfront_operation_point_settlements owner to postgres;
alter table public.warfront_operation_point_settlements enable row level security;
alter table public.warfront_operation_point_settlements force row level security;
revoke all on table public.warfront_operation_point_settlements
  from public, anon, authenticated, service_role;

alter table public.warfront_company_point_ledger_entries owner to postgres;
alter table public.warfront_company_point_ledger_entries enable row level security;
alter table public.warfront_company_point_ledger_entries force row level security;
revoke all on table public.warfront_company_point_ledger_entries
  from public, anon, authenticated, service_role;

alter function ironclad_private.warfront_operation_point_settlement_projection(uuid)
  owner to postgres;
alter function ironclad_private.protect_warfront_operation_point_history()
  owner to postgres;
revoke all on function
  ironclad_private.warfront_operation_point_settlement_projection(uuid),
  ironclad_private.protect_warfront_operation_point_history()
  from public, anon, authenticated, service_role;

alter function public.settle_warfront_operation_points(uuid)
  owner to postgres;
revoke all on function public.settle_warfront_operation_points(uuid)
  from public, anon, authenticated, service_role;

alter function public.settle_warfront_operation_points_api(uuid)
  owner to postgres;
revoke all on function public.settle_warfront_operation_points_api(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_warfront_operation_points_api(uuid)
  to service_role;

comment on table public.warfront_operation_point_settlements is
  'Private immutable one-row-per-Operation WARFRONT V1 points-settlement receipts. A receipt exists only for an immutable M9 finalization.';
comment on table public.warfront_company_point_ledger_entries is
  'Private immutable two-sided WARFRONT V1 accounting ledger. Every settled Operation records a win/+10 and loss/+0 Company fact for future ranking and Combat Record projections.';
comment on function public.settle_warfront_operation_points(uuid) is
  'Owner-only system settlement authority. It locks the Operation, reuses M9 due-result reconciliation, validates immutable finalization and accepted roster history, then atomically writes exactly one receipt and two immutable Company ledger entries.';
comment on function public.settle_warfront_operation_points_api(uuid) is
  'Service-role-only WARFRONT system settlement boundary. It accepts no Player, Clerk, legal, Company-membership, ELO, or browser authority.';

commit;
