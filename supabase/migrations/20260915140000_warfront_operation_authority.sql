begin;

-- WARFRONT mutation authorities share this lock order:
--   1. the target Operation, when one already exists;
--   2. every involved player row, ordered by player UUID;
--   3. every involved Company row, ordered by Company UUID;
--   4. active membership rows, ordered by (company_id, player_id, id);
--   5. dependent mutations.
--
-- Issue has no existing Operation to lock. Its challenger Company row is the
-- serialization point for the one-logically-open-challenge invariant, but is
-- still acquired only after the complete sorted player set. Accept locks the
-- target Operation first and follows the same remaining order. Future
-- WARFRONT membership, Company archival and account-closure integrations must
-- use this order whenever they acquire the same rows.

create function public.issue_warfront_operation(
  p_actor_clerk_user_id text,
  p_format text,
  p_series_best_of smallint,
  p_challenger_player_ids uuid[],
  p_region text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_format text := pg_catalog.lower(
    coalesce(pg_catalog.btrim(p_format), '')
  );
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_required_roster_size integer;
  v_distinct_roster_size integer;
  v_actor_player_id uuid;
  v_challenger_company_id uuid;
  v_challenger_company_status text;
  v_locked_player_count integer;
  v_active_membership_count integer;
  v_eligible_player_count integer;
  v_authority_at timestamptz;
  v_challenger_average numeric(8, 4);
  v_operation public.warfront_operations%rowtype;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation issue requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT Operation issue input is invalid'
      using errcode = '22023';
  end if;

  v_required_roster_size := case v_format
    when '2v2' then 2
    when '3v3' then 3
    when '4v4' then 4
    else null
  end;

  if v_required_roster_size is null
    or p_series_best_of is null
    or p_series_best_of not in (3, 5)
    or p_challenger_player_ids is null
    or coalesce(pg_catalog.array_ndims(p_challenger_player_ids), 0) <> 1
    or pg_catalog.cardinality(p_challenger_player_ids) <>
      v_required_roster_size
    or pg_catalog.array_position(
      p_challenger_player_ids,
      null::uuid
    ) is not null then
    raise exception 'WARFRONT Operation issue input is invalid'
      using errcode = '22023';
  end if;

  select pg_catalog.count(distinct roster.player_id)::integer
  into v_distinct_roster_size
  from pg_catalog.unnest(p_challenger_player_ids) as roster(player_id);

  if v_distinct_roster_size <> v_required_roster_size then
    raise exception 'WARFRONT challenger roster contains duplicate players'
      using errcode = '22023';
  end if;

  if v_region is not null
    and (
      pg_catalog.char_length(v_region) > 80
      or v_region ~ '[[:cntrl:]]'
    ) then
    raise exception 'WARFRONT Operation region is invalid'
      using errcode = '22023';
  end if;

  if v_notes is not null
    and (
      pg_catalog.char_length(v_notes) > 1000
      or pg_catalog.replace(
        pg_catalog.replace(v_notes, pg_catalog.chr(10), ''),
        pg_catalog.chr(13),
        ''
      ) ~ '[[:cntrl:]]'
    ) then
    raise exception 'WARFRONT Operation notes are invalid'
      using errcode = '22023';
  end if;

  -- These two reads are lookup hints only. Every fact is revalidated after
  -- the common deterministic lock sequence below.
  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id;

  if not found then
    raise exception 'WARFRONT actor is unavailable'
      using errcode = 'P0002';
  end if;

  if not (v_actor_player_id = any(p_challenger_player_ids)) then
    raise exception 'WARFRONT issuing actor must belong to the challenger roster'
      using errcode = '42501';
  end if;

  select member.company_id
  into v_challenger_company_id
  from public.warfront_company_members as member
  where member.player_id = v_actor_player_id
    and member.left_at is null
  order by member.company_id, member.player_id, member.id
  limit 1;

  if not found then
    raise exception 'WARFRONT Company membership is unavailable'
      using errcode = '42501';
  end if;

  -- Lock the complete player set in UUID order. Never take an actor-only lock
  -- before this query: two actors included in each other's rosters could then
  -- deadlock while trying to complete their player sets.
  perform player.id
  from public.players as player
  where player.id = any(p_challenger_player_ids)
  order by player.id
  for update;

  select pg_catalog.count(*)::integer
  into v_locked_player_count
  from public.players as player
  where player.id = any(p_challenger_player_ids);

  if v_locked_player_count <> v_required_roster_size then
    raise exception 'WARFRONT challenger roster is unavailable'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.players as actor
    where actor.id = v_actor_player_id
      and actor.clerk_user_id = v_actor_clerk_user_id
      and actor.account_closed_at is null
  ) then
    raise exception 'WARFRONT actor is not eligible'
      using errcode = '42501';
  end if;

  -- This row is the serialization point for concurrent Issue requests from
  -- the same Company. It remains after the sorted player locks so Issue and
  -- Accept use one compatible order.
  select company.status
  into v_challenger_company_status
  from public.warfront_companies as company
  where company.id = v_challenger_company_id
  for update;

  if not found then
    raise exception 'WARFRONT Company is unavailable'
      using errcode = 'P0002';
  end if;

  perform member.id
  from public.warfront_company_members as member
  where member.company_id = v_challenger_company_id
    and member.player_id = any(p_challenger_player_ids)
    and member.left_at is null
  order by member.company_id, member.player_id, member.id
  for update;

  select pg_catalog.count(*)::integer
  into v_active_membership_count
  from public.warfront_company_members as member
  where member.company_id = v_challenger_company_id
    and member.player_id = any(p_challenger_player_ids)
    and member.left_at is null;

  -- Capture the sole authority timestamp only after all potentially blocking
  -- eligibility and serialization locks have been acquired.
  v_authority_at := pg_catalog.clock_timestamp();

  if v_challenger_company_status <> 'active' then
    raise exception 'WARFRONT Company is not active'
      using errcode = '55000';
  end if;

  if v_active_membership_count <> v_required_roster_size then
    raise exception 'WARFRONT challenger roster membership is not eligible'
      using errcode = '55000';
  end if;

  select
    pg_catalog.count(*)::integer,
    (
      pg_catalog.sum(player.current_elo::numeric)
      / v_required_roster_size::numeric
    )::numeric(8, 4)
  into v_eligible_player_count, v_challenger_average
  from public.players as player
  where player.id = any(p_challenger_player_ids)
    and player.account_closed_at is null
    and player.current_elo is not null
    and player.relic_verified_elo is not null
    and player.current_elo::bigint = player.relic_verified_elo
    and player.relic_elo_verified_at is not null
    and player.relic_elo_verified_at >=
      v_authority_at - interval '7 days'
    and player.relic_elo_verified_at <= v_authority_at;

  if v_eligible_player_count <> v_required_roster_size
    or v_challenger_average is null then
    raise exception 'WARFRONT challenger roster ELO is not eligible'
      using errcode = '55000';
  end if;

  -- The Company lock serializes every compliant Issue authority. Expired rows
  -- that remain physically OPEN are intentionally ignored and not mutated.
  if exists (
    select 1
    from public.warfront_operations as operation
    where operation.challenger_company_id = v_challenger_company_id
      and operation.status = 'open'
      and operation.expires_at > v_authority_at
  ) then
    raise exception 'WARFRONT Company already has an open Ranked Operation'
      using errcode = '55000';
  end if;

  insert into public.warfront_operations (
    challenger_company_id,
    format,
    series_best_of,
    region,
    notes,
    status,
    opened_at,
    expires_at,
    created_by_player_id,
    challenger_roster_elo_snapshot,
    created_at,
    updated_at
  ) values (
    v_challenger_company_id,
    v_format,
    p_series_best_of,
    v_region,
    v_notes,
    'open',
    v_authority_at,
    v_authority_at + interval '1 hour',
    v_actor_player_id,
    v_challenger_average,
    v_authority_at,
    v_authority_at
  )
  returning * into v_operation;

  insert into public.warfront_operation_roster_entries (
    operation_id,
    side,
    player_id,
    elo_snapshot,
    selected_at,
    selected_by_player_id
  )
  select
    v_operation.id,
    'challenger',
    player.id,
    player.current_elo,
    v_authority_at,
    v_actor_player_id
  from public.players as player
  where player.id = any(p_challenger_player_ids)
  order by player.id;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'challengerCompanyId', v_operation.challenger_company_id,
    'format', v_operation.format,
    'seriesBestOf', v_operation.series_best_of,
    'challengerRosterEloSnapshot',
      v_operation.challenger_roster_elo_snapshot,
    'openedAt', v_operation.opened_at,
    'expiresAt', v_operation.expires_at
  );
end;
$$;

alter function public.issue_warfront_operation(
  text, text, smallint, uuid[], text, text
) owner to postgres;
revoke all on function public.issue_warfront_operation(
  text, text, smallint, uuid[], text, text
) from public, anon, authenticated, service_role;

create function public.accept_warfront_operation(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_opponent_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_required_roster_size integer;
  v_distinct_roster_size integer;
  v_challenger_player_ids uuid[];
  v_challenger_roster_count integer;
  v_opponent_company_id uuid;
  v_all_player_ids uuid[];
  v_locked_player_count integer;
  v_locked_company_count integer;
  v_challenger_company_status text;
  v_opponent_company_status text;
  v_challenger_account_count integer;
  v_challenger_membership_count integer;
  v_opponent_membership_count integer;
  v_opponent_eligible_count integer;
  v_opponent_average numeric(8, 4);
  v_authority_at timestamptz;
  v_affected integer;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation acceptance requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]'
    or p_opponent_player_ids is null
    or coalesce(pg_catalog.array_ndims(p_opponent_player_ids), 0) <> 1 then
    raise exception 'WARFRONT Operation acceptance input is invalid'
      using errcode = '22023';
  end if;

  -- Lookup hint only; identity and account state are revalidated under the
  -- complete sorted player lock below.
  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id;

  if not found then
    raise exception 'WARFRONT actor is unavailable'
      using errcode = 'P0002';
  end if;

  -- The Operation row is the acceptance serialization point. Only one caller
  -- can progress beyond this lock with an OPEN, unaccepted row.
  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT Ranked Operation is unavailable'
      using errcode = 'P0002';
  end if;

  if v_operation.opponent_company_id is not null
    or v_operation.status = 'accepted' then
    raise exception using
      errcode = '40001',
      message = 'WARFRONT acceptance conflict: the Operation was already accepted';
  end if;

  if v_operation.status <> 'open' then
    raise exception 'WARFRONT Ranked Operation is not open'
      using errcode = '55000';
  end if;

  v_required_roster_size := case v_operation.format
    when '2v2' then 2
    when '3v3' then 3
    when '4v4' then 4
    else null
  end;

  if v_required_roster_size is null then
    raise exception 'WARFRONT Ranked Operation format is invalid'
      using errcode = '55000';
  end if;

  if pg_catalog.cardinality(p_opponent_player_ids) <>
      v_required_roster_size
    or pg_catalog.array_position(
      p_opponent_player_ids,
      null::uuid
    ) is not null then
    raise exception 'WARFRONT opponent roster is invalid'
      using errcode = '22023';
  end if;

  select pg_catalog.count(distinct roster.player_id)::integer
  into v_distinct_roster_size
  from pg_catalog.unnest(p_opponent_player_ids) as roster(player_id);

  if v_distinct_roster_size <> v_required_roster_size then
    raise exception 'WARFRONT opponent roster contains duplicate players'
      using errcode = '22023';
  end if;

  if not (v_actor_player_id = any(p_opponent_player_ids)) then
    raise exception 'WARFRONT accepting actor must belong to the opponent roster'
      using errcode = '42501';
  end if;

  select
    pg_catalog.array_agg(entry.player_id order by entry.player_id),
    pg_catalog.count(*)::integer
  into v_challenger_player_ids, v_challenger_roster_count
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = v_operation.id
    and entry.side = 'challenger';

  if v_challenger_roster_count <> v_required_roster_size
    or v_challenger_player_ids is null then
    raise exception 'WARFRONT challenger roster is not authoritative'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.warfront_operation_roster_entries as entry
    where entry.operation_id = v_operation.id
      and entry.side = 'opponent'
  ) then
    raise exception 'WARFRONT Ranked Operation state is inconsistent'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_opponent_player_ids) as opponent(player_id)
    where opponent.player_id = any(v_challenger_player_ids)
  ) then
    raise exception 'WARFRONT players cannot represent both Operation sides'
      using errcode = '55000';
  end if;

  -- Lookup hint only. The membership is locked and revalidated later.
  select member.company_id
  into v_opponent_company_id
  from public.warfront_company_members as member
  where member.player_id = v_actor_player_id
    and member.left_at is null
  order by member.company_id, member.player_id, member.id
  limit 1;

  if not found then
    raise exception 'WARFRONT Company membership is unavailable'
      using errcode = '42501';
  end if;

  if v_opponent_company_id = v_operation.challenger_company_id then
    raise exception 'A WARFRONT Company cannot accept its own Operation'
      using errcode = '42501';
  end if;

  select pg_catalog.array_agg(players.player_id order by players.player_id)
  into v_all_player_ids
  from (
    select distinct roster.player_id
    from pg_catalog.unnest(
      v_challenger_player_ids || p_opponent_player_ids
    ) as roster(player_id)
  ) as players;

  perform player.id
  from public.players as player
  where player.id = any(v_all_player_ids)
  order by player.id
  for update;

  select pg_catalog.count(*)::integer
  into v_locked_player_count
  from public.players as player
  where player.id = any(v_all_player_ids);

  if v_locked_player_count <> v_required_roster_size * 2 then
    raise exception 'WARFRONT Operation roster is unavailable'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.players as actor
    where actor.id = v_actor_player_id
      and actor.clerk_user_id = v_actor_clerk_user_id
      and actor.account_closed_at is null
  ) then
    raise exception 'WARFRONT actor is not eligible'
      using errcode = '42501';
  end if;

  -- Lock both Companies in UUID order. The challenger lock synchronizes with
  -- new Issue checks, while the opponent lock serializes archival/membership
  -- authorities that adopt the documented WARFRONT order.
  perform company.id
  from public.warfront_companies as company
  where company.id = any(array[
    v_operation.challenger_company_id,
    v_opponent_company_id
  ]::uuid[])
  order by company.id
  for update;

  select pg_catalog.count(*)::integer
  into v_locked_company_count
  from public.warfront_companies as company
  where company.id = any(array[
    v_operation.challenger_company_id,
    v_opponent_company_id
  ]::uuid[]);

  if v_locked_company_count <> 2 then
    raise exception 'WARFRONT Company is unavailable'
      using errcode = 'P0002';
  end if;

  select company.status
  into v_challenger_company_status
  from public.warfront_companies as company
  where company.id = v_operation.challenger_company_id;

  select company.status
  into v_opponent_company_status
  from public.warfront_companies as company
  where company.id = v_opponent_company_id;

  perform member.id
  from public.warfront_company_members as member
  where member.left_at is null
    and (
      (
        member.company_id = v_operation.challenger_company_id
        and member.player_id = any(v_challenger_player_ids)
      )
      or (
        member.company_id = v_opponent_company_id
        and member.player_id = any(p_opponent_player_ids)
      )
    )
  order by member.company_id, member.player_id, member.id
  for update;

  select pg_catalog.count(*)::integer
  into v_challenger_membership_count
  from public.warfront_company_members as member
  where member.company_id = v_operation.challenger_company_id
    and member.player_id = any(v_challenger_player_ids)
    and member.left_at is null;

  select pg_catalog.count(*)::integer
  into v_opponent_membership_count
  from public.warfront_company_members as member
  where member.company_id = v_opponent_company_id
    and member.player_id = any(p_opponent_player_ids)
    and member.left_at is null;

  -- The one acceptance timestamp is sampled only after the Operation, player,
  -- Company and active-membership locks have all been acquired.
  v_authority_at := pg_catalog.clock_timestamp();

  if v_operation.status <> 'open'
    or v_operation.opponent_company_id is not null then
    raise exception using
      errcode = '40001',
      message = 'WARFRONT acceptance conflict: the Operation state changed';
  end if;

  if v_operation.expires_at <= v_authority_at then
    raise exception 'WARFRONT Ranked Operation has expired'
      using errcode = '55000';
  end if;

  if v_challenger_company_status <> 'active' then
    raise exception 'WARFRONT challenger Company is not active'
      using errcode = '55000';
  end if;

  if v_opponent_company_status <> 'active' then
    raise exception 'WARFRONT opponent Company is not active'
      using errcode = '55000';
  end if;

  -- Challenger revalidation intentionally checks only durable participation:
  -- account state and active membership. Its individual ELO snapshots and
  -- stored Company average remain frozen and are never recalculated here.
  select pg_catalog.count(*)::integer
  into v_challenger_account_count
  from public.players as player
  where player.id = any(v_challenger_player_ids)
    and player.account_closed_at is null;

  if v_challenger_account_count <> v_required_roster_size
    or v_challenger_membership_count <> v_required_roster_size then
    raise exception 'WARFRONT challenger roster is no longer eligible'
      using errcode = '55000';
  end if;

  if v_opponent_membership_count <> v_required_roster_size then
    raise exception 'WARFRONT opponent roster membership is not eligible'
      using errcode = '55000';
  end if;

  select
    pg_catalog.count(*)::integer,
    (
      pg_catalog.sum(player.current_elo::numeric)
      / v_required_roster_size::numeric
    )::numeric(8, 4)
  into v_opponent_eligible_count, v_opponent_average
  from public.players as player
  where player.id = any(p_opponent_player_ids)
    and player.account_closed_at is null
    and player.current_elo is not null
    and player.relic_verified_elo is not null
    and player.current_elo::bigint = player.relic_verified_elo
    and player.relic_elo_verified_at is not null
    and player.relic_elo_verified_at >=
      v_authority_at - interval '7 days'
    and player.relic_elo_verified_at <= v_authority_at;

  if v_opponent_eligible_count <> v_required_roster_size
    or v_opponent_average is null then
    raise exception 'WARFRONT opponent roster ELO is not eligible'
      using errcode = '55000';
  end if;

  if pg_catalog.abs(
    v_opponent_average - v_operation.challenger_roster_elo_snapshot
  ) > 200::numeric then
    raise exception 'WARFRONT opponent roster is outside the ELO range'
      using errcode = '55000';
  end if;

  insert into public.warfront_operation_roster_entries (
    operation_id,
    side,
    player_id,
    elo_snapshot,
    selected_at,
    selected_by_player_id
  )
  select
    v_operation.id,
    'opponent',
    player.id,
    player.current_elo,
    v_authority_at,
    v_actor_player_id
  from public.players as player
  where player.id = any(p_opponent_player_ids)
  order by player.id;

  update public.warfront_operations as operation
  set
    opponent_company_id = v_opponent_company_id,
    accepted_by_player_id = v_actor_player_id,
    opponent_roster_elo_snapshot = v_opponent_average,
    accepted_at = v_authority_at,
    roster_locked_at = v_authority_at,
    status = 'accepted',
    updated_at = v_authority_at
  where operation.id = v_operation.id
    and operation.status = 'open'
    and operation.opponent_company_id is null
    and operation.expires_at > v_authority_at
  returning operation.* into v_operation;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using
      errcode = '40001',
      message = 'WARFRONT acceptance conflict: the authoritative transition failed';
  end if;

  -- warfront_operations_set_updated_at uses the repository-wide updated-at
  -- trigger. accepted_at and roster_locked_at remain the exact shared event
  -- timestamp even if that trigger replaces the explicit updated_at value.
  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'challengerCompanyId', v_operation.challenger_company_id,
    'opponentCompanyId', v_operation.opponent_company_id,
    'format', v_operation.format,
    'seriesBestOf', v_operation.series_best_of,
    'challengerRosterEloSnapshot',
      v_operation.challenger_roster_elo_snapshot,
    'opponentRosterEloSnapshot', v_operation.opponent_roster_elo_snapshot,
    'acceptedAt', v_operation.accepted_at,
    'rosterLockedAt', v_operation.roster_locked_at
  );
end;
$$;

alter function public.accept_warfront_operation(uuid, text, uuid[])
  owner to postgres;
revoke all on function public.accept_warfront_operation(uuid, text, uuid[])
  from public, anon, authenticated, service_role;

create function public.issue_warfront_operation_api(
  p_actor_clerk_user_id text,
  p_format text,
  p_series_best_of smallint,
  p_challenger_player_ids uuid[],
  p_region text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation issue requires the trusted server boundary'
      using errcode = '42501';
  end if;

  return public.issue_warfront_operation(
    p_actor_clerk_user_id,
    p_format,
    p_series_best_of,
    p_challenger_player_ids,
    p_region,
    p_notes
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) owner to postgres;
revoke all on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) from public, anon, authenticated, service_role;
grant execute on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) to service_role;

create function public.accept_warfront_operation_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_opponent_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation acceptance requires the trusted server boundary'
      using errcode = '42501';
  end if;

  return public.accept_warfront_operation(
    p_operation_id,
    p_actor_clerk_user_id,
    p_opponent_player_ids
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.accept_warfront_operation_api(uuid, text, uuid[])
  owner to postgres;
revoke all on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) to service_role;

comment on function public.issue_warfront_operation(
  text, text, smallint, uuid[], text, text
) is
  'Internal atomic WARFRONT Ranked Operation issue authority. Not directly executable by API roles.';
comment on function public.accept_warfront_operation(uuid, text, uuid[]) is
  'Internal atomic WARFRONT Ranked Operation acceptance authority. Revalidates both Companies and durable challenger participation without recalculating challenger ELO.';
comment on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) is
  'Service-role WARFRONT issue RPC boundary with explicit Clerk actor identity and PT409 conflict transport.';
comment on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) is
  'Service-role WARFRONT acceptance RPC boundary with explicit Clerk actor identity and PT409 conflict transport.';

commit;
