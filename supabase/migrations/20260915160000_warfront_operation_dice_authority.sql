begin;

-- The owner-only read core is observational: every relation read uses one
-- STABLE statement snapshot, and it takes no row or advisory lock. The
-- service-role wrapper below acquires the canonical shared account-closure
-- barrier before invoking this core so an account cannot close across the
-- active-actor authorization check.
create function public.get_warfront_operation_dice_rolloff(
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
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_viewer_side text;
  v_expected_roster_size integer;
  v_challenger_roster_size integer;
  v_opponent_roster_size integer;
  v_is_actionable boolean;
  v_read_only_reason text;
  v_games jsonb := '[]'::jsonb;
  v_game_number smallint;
  v_game_available boolean;
  v_game_state text;
  v_current_tie_round integer;
  v_latest_tie_round integer;
  v_first_tie_round integer;
  v_tie_round_count integer;
  v_latest_roll_count integer;
  v_latest_challenger_total integer;
  v_latest_opponent_total integer;
  v_winner_side text;
  v_can_roll boolean;
  v_rounds jsonb;
  v_game_one_resolved boolean := false;
  v_game_three_resolved boolean := false;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_DICE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'WARFRONT_ACTOR_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_DICE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  select entry.side
  into v_viewer_side
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = p_operation_id
    and entry.player_id = v_actor_player_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_DICE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if v_operation.opponent_company_id is null
    or v_operation.accepted_by_player_id is null
    or v_operation.opponent_roster_elo_snapshot is null
    or v_operation.accepted_at is null
    or v_operation.roster_locked_at is null
    or v_operation.status not in (
      'accepted',
      'in_progress',
      'pending_result',
      'completed',
      'cancelled'
    ) then
    raise exception 'WARFRONT_OPERATION_ROOM_UNAVAILABLE'
      using errcode = '55000';
  end if;

  if v_operation.series_best_of not in (3, 5)
    or v_operation.format not in ('2v2', '3v3', '4v4') then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  v_expected_roster_size := case v_operation.format
    when '2v2' then 2
    when '3v3' then 3
    when '4v4' then 4
  end;

  select
    pg_catalog.count(*) filter (
      where entry.side = 'challenger'
    )::integer,
    pg_catalog.count(*) filter (
      where entry.side = 'opponent'
    )::integer
  into v_challenger_roster_size, v_opponent_roster_size
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = p_operation_id;

  if v_challenger_roster_size <> v_expected_roster_size
    or v_opponent_roster_size <> v_expected_roster_size then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  -- Every retained roller must belong to the immutable locked roster on the
  -- same Company side. No current Company membership or role is consulted.
  if exists (
    select 1
    from public.warfront_operation_dice_rolls as roll
    where roll.operation_id = p_operation_id
      and not exists (
        select 1
        from public.warfront_operation_roster_entries as entry
        where entry.operation_id = roll.operation_id
          and entry.player_id = roll.rolled_by_player_id
          and entry.side = roll.side
      )
  ) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if v_operation.series_best_of = 3
    and exists (
      select 1
      from public.warfront_operation_dice_rolls as roll
      where roll.operation_id = p_operation_id
        and roll.game_number = 5
    ) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if (
      v_operation.started_at is null
      and exists (
        select 1
        from public.warfront_operation_dice_rolls as roll
        where roll.operation_id = p_operation_id
      )
    )
    or (
      v_operation.started_at is not null
      and not exists (
        select 1
        from public.warfront_operation_dice_rolls as roll
        where roll.operation_id = p_operation_id
          and roll.game_number = 1
          and roll.rolled_at = v_operation.started_at
      )
    ) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  v_is_actionable := v_operation.status in ('accepted', 'in_progress');
  v_read_only_reason := case
    when v_is_actionable then null
    else v_operation.status
  end;

  for v_game_number in
    select game.game_number
    from (
      values (1::smallint), (3::smallint), (5::smallint)
    ) as game(game_number)
    where game.game_number <> 5 or v_operation.series_best_of = 5
    order by game.game_number
  loop
    v_game_available := case v_game_number
      when 1 then true
      when 3 then v_game_one_resolved
      when 5 then v_game_three_resolved
      else false
    end;
    v_game_state := 'locked';
    v_current_tie_round := null;
    v_latest_tie_round := null;
    v_first_tie_round := null;
    v_tie_round_count := 0;
    v_latest_roll_count := 0;
    v_latest_challenger_total := null;
    v_latest_opponent_total := null;
    v_winner_side := null;
    v_rounds := '[]'::jsonb;

    select
      pg_catalog.min(roll.tie_round),
      pg_catalog.max(roll.tie_round),
      pg_catalog.count(distinct roll.tie_round)::integer
    into
      v_first_tie_round,
      v_latest_tie_round,
      v_tie_round_count
    from public.warfront_operation_dice_rolls as roll
    where roll.operation_id = p_operation_id
      and roll.game_number = v_game_number;

    if not v_game_available and v_latest_tie_round is not null then
      raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
        using errcode = '55000';
    end if;

    if v_game_available then
      if v_latest_tie_round is null then
        v_game_state := 'open';
        v_current_tie_round := 1;
      else
        if v_first_tie_round <> 1
          or v_tie_round_count <> v_latest_tie_round then
          raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
            using errcode = '55000';
        end if;

        if exists (
          select 1
          from (
            select
              roll.tie_round,
              pg_catalog.count(*)::integer as roll_count,
              pg_catalog.max(roll.die_1 + roll.die_2) filter (
                where roll.side = 'challenger'
              ) as challenger_total,
              pg_catalog.max(roll.die_1 + roll.die_2) filter (
                where roll.side = 'opponent'
              ) as opponent_total
            from public.warfront_operation_dice_rolls as roll
            where roll.operation_id = p_operation_id
              and roll.game_number = v_game_number
              and roll.tie_round < v_latest_tie_round
            group by roll.tie_round
          ) as prior_round
          where prior_round.roll_count <> 2
            or prior_round.challenger_total is null
            or prior_round.opponent_total is null
            or prior_round.challenger_total is distinct from
              prior_round.opponent_total
        ) then
          raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
            using errcode = '55000';
        end if;

        select
          pg_catalog.count(*)::integer,
          pg_catalog.max(roll.die_1 + roll.die_2) filter (
            where roll.side = 'challenger'
          ),
          pg_catalog.max(roll.die_1 + roll.die_2) filter (
            where roll.side = 'opponent'
          )
        into
          v_latest_roll_count,
          v_latest_challenger_total,
          v_latest_opponent_total
        from public.warfront_operation_dice_rolls as roll
        where roll.operation_id = p_operation_id
          and roll.game_number = v_game_number
          and roll.tie_round = v_latest_tie_round;

        if v_latest_roll_count = 1
          and pg_catalog.num_nonnulls(
            v_latest_challenger_total,
            v_latest_opponent_total
          ) = 1 then
          v_game_state := 'waiting';
          v_current_tie_round := v_latest_tie_round;
        elsif v_latest_roll_count = 2
          and v_latest_challenger_total is not null
          and v_latest_opponent_total is not null
          and v_latest_challenger_total = v_latest_opponent_total then
          v_game_state := 'tied';
          v_current_tie_round := v_latest_tie_round + 1;
        elsif v_latest_roll_count = 2
          and v_latest_challenger_total is not null
          and v_latest_opponent_total is not null then
          v_game_state := 'complete';
          v_current_tie_round := v_latest_tie_round;
          v_winner_side := case
            when v_latest_challenger_total > v_latest_opponent_total
              then 'challenger'
            else 'opponent'
          end;
        else
          raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
            using errcode = '55000';
        end if;
      end if;

      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'tieRound', round_history.tie_round,
            'rolls', round_history.rolls
          )
          order by round_history.tie_round
        ),
        '[]'::jsonb
      )
      into v_rounds
      from (
        select
          roll.tie_round,
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'side', roll.side,
              'rolledByPlayerId', roll.rolled_by_player_id,
              'die1', roll.die_1,
              'die2', roll.die_2,
              'total', roll.die_1 + roll.die_2,
              'rolledAt', roll.rolled_at
            )
            order by case roll.side
              when 'challenger' then 1
              else 2
            end
          ) as rolls
        from public.warfront_operation_dice_rolls as roll
        where roll.operation_id = p_operation_id
          and roll.game_number = v_game_number
        group by roll.tie_round
      ) as round_history;
    end if;

    v_can_roll :=
      v_is_actionable
      and v_game_available
      and v_game_state <> 'complete'
      and not exists (
        select 1
        from public.warfront_operation_dice_rolls as roll
        where roll.operation_id = p_operation_id
          and roll.game_number = v_game_number
          and roll.tie_round = v_current_tie_round
          and roll.side = v_viewer_side
      );

    v_games := v_games || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'gameNumber', v_game_number,
        'available', v_game_available,
        'currentTieRound', v_current_tie_round,
        'state', v_game_state,
        'canRoll', v_can_roll,
        'winnerSide', v_winner_side,
        'rounds', v_rounds
      )
    );

    if v_game_number = 1 then
      v_game_one_resolved := v_game_state = 'complete';
    elsif v_game_number = 3 then
      v_game_three_resolved := v_game_state = 'complete';
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'seriesBestOf', v_operation.series_best_of,
    'startedAt', v_operation.started_at,
    'viewerPlayerId', v_actor_player_id,
    'viewerSide', v_viewer_side,
    'isActionable', v_is_actionable,
    'readOnlyReason', v_read_only_reason,
    'games', v_games
  );
end;
$$;

alter function public.get_warfront_operation_dice_rolloff(uuid, text)
  owner to postgres;
revoke all on function
  public.get_warfront_operation_dice_rolloff(uuid, text)
  from public, anon, authenticated, service_role;

comment on function
  public.get_warfront_operation_dice_rolloff(uuid, text) is
  'Owner-only, lock-free STABLE WARFRONT dice snapshot. It authorizes an explicit open Clerk actor through the immutable locked roster, never uses current Company membership or an Admin bypass, and permits accepted or retained post-acceptance history without requiring current legal acceptance. Execute API reads through the service-role wrapper so account closure is linearized by the canonical shared barrier.';

-- This is the only WARFRONT dice mutation authority. It deliberately takes
-- the canonical shared closure barrier before legal-document and Operation
-- locks. The locked Operation row serializes progression, idempotency and the
-- sole accepted-to-in_progress transition; no Company or membership row is
-- read or locked.
create function public.roll_warfront_operation_dice(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_game_number smallint,
  p_expected_tie_round integer
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
  v_actor_side text;
  v_existing_roll public.warfront_operation_dice_rolls%rowtype;
  v_stored_roll public.warfront_operation_dice_rolls%rowtype;
  v_snapshot jsonb;
  v_game jsonb;
  v_required_tie_round integer;
  v_random_byte integer;
  v_die_1 smallint;
  v_die_2 smallint;
  v_authority_at timestamptz;
  v_created boolean := false;
  v_transitioned boolean := false;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]'
    or p_game_number is null
    or p_game_number not in (1, 3, 5)
    or p_expected_tie_round is null
    or p_expected_tie_round < 1 then
    raise exception 'WARFRONT_OPERATION_DICE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'WARFRONT_ACTOR_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  perform
    ironclad_private.require_current_account_legal_acceptance_for_actor(
      v_actor_clerk_user_id
    );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_DICE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if v_operation.opponent_company_id is null
    or v_operation.accepted_by_player_id is null
    or v_operation.opponent_roster_elo_snapshot is null
    or v_operation.accepted_at is null
    or v_operation.roster_locked_at is null then
    raise exception 'WARFRONT_OPERATION_ROOM_UNAVAILABLE'
      using errcode = '55000';
  end if;

  if v_operation.status not in ('accepted', 'in_progress') then
    raise exception 'WARFRONT_OPERATION_DICE_NOT_ACTIONABLE'
      using errcode = '55000';
  end if;

  if v_operation.series_best_of not in (3, 5) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if p_game_number = 5 and v_operation.series_best_of <> 5 then
    raise exception 'WARFRONT_OPERATION_DICE_GAME_INVALID'
      using errcode = '22023';
  end if;

  select entry.side
  into v_actor_side
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = p_operation_id
    and entry.player_id = v_actor_player_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_DICE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  -- A Game 1 fact and an accepted lifecycle cannot coexist through this
  -- authority. Never use an idempotent call to repair such history.
  if v_operation.status = 'accepted'
    and exists (
      select 1
      from public.warfront_operation_dice_rolls as roll
      where roll.operation_id = p_operation_id
        and roll.game_number = 1
    ) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if v_operation.status = 'in_progress'
    and not exists (
      select 1
      from public.warfront_operation_dice_rolls as roll
      where roll.operation_id = p_operation_id
        and roll.game_number = 1
    ) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  -- The lock-free core is safe here because this transaction already holds
  -- the Operation row lock and the shared account-closure barrier.
  v_snapshot := public.get_warfront_operation_dice_rolloff(
    p_operation_id,
    v_actor_clerk_user_id
  );

  -- Company-side idempotency is keyed by side, not the teammate who happened
  -- to create the fact. A retry returns the original roller and dice.
  select roll.*
  into v_existing_roll
  from public.warfront_operation_dice_rolls as roll
  where roll.operation_id = p_operation_id
    and roll.game_number = p_game_number
    and roll.tie_round = p_expected_tie_round
    and roll.side = v_actor_side;

  if found then
    return pg_catalog.jsonb_build_object(
      'snapshot', v_snapshot,
      'roll', pg_catalog.jsonb_build_object(
        'operationId', v_existing_roll.operation_id,
        'gameNumber', v_existing_roll.game_number,
        'tieRound', v_existing_roll.tie_round,
        'side', v_existing_roll.side,
        'rolledByPlayerId', v_existing_roll.rolled_by_player_id,
        'die1', v_existing_roll.die_1,
        'die2', v_existing_roll.die_2,
        'total', v_existing_roll.die_1 + v_existing_roll.die_2,
        'rolledAt', v_existing_roll.rolled_at,
        'created', false
      ),
      'operationTransitionedToInProgress', false
    );
  end if;

  select game.value
  into v_game
  from pg_catalog.jsonb_array_elements(v_snapshot -> 'games')
    as game(value)
  where (game.value ->> 'gameNumber')::smallint = p_game_number;

  if not found then
    raise exception 'WARFRONT_OPERATION_DICE_GAME_INVALID'
      using errcode = '22023';
  end if;

  if not coalesce((v_game ->> 'available')::boolean, false)
    or v_game ->> 'state' = 'locked' then
    raise exception 'WARFRONT_OPERATION_DICE_GAME_NOT_AVAILABLE'
      using errcode = '55000';
  end if;

  if v_game ->> 'state' = 'complete' then
    raise exception 'WARFRONT_OPERATION_DICE_GAME_COMPLETE'
      using errcode = '55000';
  end if;

  v_required_tie_round := (v_game ->> 'currentTieRound')::integer;

  if v_required_tie_round is distinct from p_expected_tie_round then
    raise exception 'WARFRONT_OPERATION_DICE_STALE'
      using errcode = '40001';
  end if;

  if not coalesce((v_game ->> 'canRoll')::boolean, false) then
    raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  -- Each accepted byte range has 252 values: exactly 42 values per d6 face.
  -- The four high byte values are rejected independently for each die.
  loop
    v_random_byte := pg_catalog.get_byte(
      extensions.gen_random_bytes(1),
      0
    );
    exit when v_random_byte < 252;
  end loop;
  v_die_1 := (pg_catalog.mod(v_random_byte, 6) + 1)::smallint;

  loop
    v_random_byte := pg_catalog.get_byte(
      extensions.gen_random_bytes(1),
      0
    );
    exit when v_random_byte < 252;
  end loop;
  v_die_2 := (pg_catalog.mod(v_random_byte, 6) + 1)::smallint;

  v_authority_at := pg_catalog.clock_timestamp();

  insert into public.warfront_operation_dice_rolls (
    operation_id,
    side,
    game_number,
    tie_round,
    rolled_by_player_id,
    die_1,
    die_2,
    rolled_at
  )
  values (
    p_operation_id,
    v_actor_side,
    p_game_number,
    p_expected_tie_round,
    v_actor_player_id,
    v_die_1,
    v_die_2,
    v_authority_at
  )
  on conflict (operation_id, game_number, tie_round, side) do nothing
  returning * into v_stored_roll;

  v_created := found;

  if not v_created then
    select roll.*
    into v_stored_roll
    from public.warfront_operation_dice_rolls as roll
    where roll.operation_id = p_operation_id
      and roll.game_number = p_game_number
      and roll.tie_round = p_expected_tie_round
      and roll.side = v_actor_side;

    if not found then
      raise exception 'WARFRONT_OPERATION_DICE_STALE'
        using errcode = '40001';
    end if;

    if v_operation.status = 'accepted' then
      raise exception 'WARFRONT_OPERATION_DICE_HISTORY_INCONSISTENT'
        using errcode = '55000';
    end if;
  end if;

  if v_created
    and p_game_number = 1
    and v_operation.status = 'accepted' then
    update public.warfront_operations as operation
    set
      status = 'in_progress',
      started_at = v_stored_roll.rolled_at
    where operation.id = p_operation_id
      and operation.status = 'accepted'
      and operation.started_at is null
    returning operation.* into v_operation;

    if not found then
      raise exception 'WARFRONT_OPERATION_DICE_STALE'
        using errcode = '40001';
    end if;

    v_transitioned := true;
  end if;

  v_snapshot := public.get_warfront_operation_dice_rolloff(
    p_operation_id,
    v_actor_clerk_user_id
  );

  return pg_catalog.jsonb_build_object(
    'snapshot', v_snapshot,
    'roll', pg_catalog.jsonb_build_object(
      'operationId', v_stored_roll.operation_id,
      'gameNumber', v_stored_roll.game_number,
      'tieRound', v_stored_roll.tie_round,
      'side', v_stored_roll.side,
      'rolledByPlayerId', v_stored_roll.rolled_by_player_id,
      'die1', v_stored_roll.die_1,
      'die2', v_stored_roll.die_2,
      'total', v_stored_roll.die_1 + v_stored_roll.die_2,
      'rolledAt', v_stored_roll.rolled_at,
      'created', v_created
    ),
    'operationTransitionedToInProgress', v_transitioned
  );
end;
$$;

alter function public.roll_warfront_operation_dice(
  uuid, text, smallint, integer
) owner to postgres;
revoke all on function public.roll_warfront_operation_dice(
  uuid, text, smallint, integer
) from public, anon, authenticated, service_role;

comment on function public.roll_warfront_operation_dice(
  uuid, text, smallint, integer
) is
  'Owner-only authoritative WARFRONT Company-side 2d6 roll. It acquires the canonical shared account-closure barrier, requires an open explicit actor and current legal pair, serializes on the Operation row, authorizes only the immutable locked roster, preserves same-side idempotency, and lets only a newly inserted Game 1 roll transition accepted to in_progress with started_at equal to rolled_at. Future WARFRONT write authorities must acquire the same shared barrier before domain row locks.';

-- The API read boundary holds the shared closure barrier for the entire RPC.
-- If closure wins first, the subsequent STABLE core statement sees the closed
-- account; if this read wins first, closure waits until the read completes.
-- No Operation, Player, Company, membership or dice row is locked.
create function public.get_warfront_operation_dice_rolloff_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
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
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_DICE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  return public.get_warfront_operation_dice_rolloff(
    p_operation_id,
    v_actor_clerk_user_id
  );
end;
$$;

alter function public.get_warfront_operation_dice_rolloff_api(uuid, text)
  owner to postgres;
revoke all on function
  public.get_warfront_operation_dice_rolloff_api(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_warfront_operation_dice_rolloff_api(uuid, text)
  to service_role;

comment on function
  public.get_warfront_operation_dice_rolloff_api(uuid, text) is
  'Service-role-only observational WARFRONT dice read boundary. It validates the explicit actor and acquires the canonical shared account-closure barrier before the lock-free STABLE core statement, making active-account authorization linearizable without taking domain row locks or blocking dice and lifecycle writers.';

create function public.roll_warfront_operation_dice_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_game_number smallint,
  p_expected_tie_round integer
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
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]'
    or p_game_number is null
    or p_game_number not in (1, 3, 5)
    or p_expected_tie_round is null
    or p_expected_tie_round < 1 then
    raise exception 'WARFRONT_OPERATION_DICE_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.roll_warfront_operation_dice(
    p_operation_id,
    v_actor_clerk_user_id,
    p_game_number,
    p_expected_tie_round
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.roll_warfront_operation_dice_api(
  uuid, text, smallint, integer
) owner to postgres;
revoke all on function public.roll_warfront_operation_dice_api(
  uuid, text, smallint, integer
) from public, anon, authenticated, service_role;
grant execute on function public.roll_warfront_operation_dice_api(
  uuid, text, smallint, integer
) to service_role;

comment on function public.roll_warfront_operation_dice_api(
  uuid, text, smallint, integer
) is
  'Service-role-only WARFRONT dice mutation boundary. It accepts only an explicit trusted Clerk actor, delegates all domain authorization and locking to the owner-only core, and translates serialization_failure SQLSTATE 40001 to PT409 for transport.';

commit;
