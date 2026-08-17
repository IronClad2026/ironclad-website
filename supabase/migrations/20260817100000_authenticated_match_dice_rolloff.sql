begin;

-- Feature B stores one immutable, server-generated roll per participant,
-- activation, Game roll-off, and tie round. It is deliberately independent
-- from official results, replay proof, bracket progression, and scoring.
create table public.match_dice_rolls (
  match_id uuid not null
    references public.tournament_matches(id) on delete cascade,
  activation_version integer not null
    check (activation_version > 0),
  game_number smallint not null
    check (game_number in (1, 3, 5)),
  tie_round integer not null
    check (tie_round >= 1),
  participant_registration_id uuid not null
    references public.registrations(id) on delete restrict,
  die_1 smallint not null
    check (die_1 between 1 and 6),
  die_2 smallint not null
    check (die_2 between 1 and 6),
  rolled_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id
  )
);

alter table public.match_dice_rolls owner to postgres;
alter table public.match_dice_rolls enable row level security;
alter table public.match_dice_rolls force row level security;
revoke all on table public.match_dice_rolls
  from public, anon, authenticated, service_role;

comment on table public.match_dice_rolls is
  'Private immutable 2d6 facts for authenticated single-elimination Match roll-offs. Not an official Game or Series result.';

create function public.get_match_dice_rolloff(
  p_match_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
  v_tournament_status text;
  v_launched_at timestamptz;
  v_player_one_label text;
  v_player_two_label text;
  v_clerk_user_id text := nullif(
    pg_catalog.btrim(auth.jwt() ->> 'sub'),
    ''
  );
  v_viewer_registration_id uuid;
  v_viewer_slot text;
  v_viewer_role text;
  v_is_admin boolean;
  v_read_only_reason text;
  v_is_actionable boolean;
  v_activations jsonb := '[]'::jsonb;
  v_games jsonb;
  v_rounds jsonb;
  v_activation record;
  v_game_number smallint;
  v_latest_tie_round integer;
  v_current_tie_round integer;
  v_latest_roll_count integer;
  v_latest_total_one integer;
  v_latest_total_two integer;
  v_game_state text;
  v_winner_slot text;
  v_can_roll boolean;
begin
  if p_match_id is null or v_clerk_user_id is null then
    raise exception 'Authentication and Match are required'
      using errcode = '28000';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id;

  if not found then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  select
    generated.format,
    bracket.launched_at,
    tournament.status,
    player_one.player_name,
    player_two.player_name
  into
    v_format,
    v_launched_at,
    v_tournament_status,
    v_player_one_label,
    v_player_two_label
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  left join public.registrations as player_one
    on player_one.id = v_match.player_one_registration_id
  left join public.registrations as player_two
    on player_two.id = v_match.player_two_registration_id
  where generated.id = v_match.generated_bracket_id;

  if not found then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  select
    registration.id,
    case
      when registration.id = v_match.player_one_registration_id
        then 'player_one'
      when registration.id = v_match.player_two_registration_id
        then 'player_two'
      else null
    end
  into v_viewer_registration_id, v_viewer_slot
  from public.registrations as registration
  where registration.clerk_user_id = v_clerk_user_id
    and registration.id in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
  order by registration.id
  limit 1;

  v_is_admin := coalesce(public.is_admin_jwt(), false);

  if v_viewer_registration_id is null and not v_is_admin then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  v_viewer_role := case
    when v_viewer_registration_id is not null then 'participant'
    else 'admin'
  end;

  if v_match.series_best_of not in (3, 5) then
    raise exception 'This Series format is not supported for Dice Roll-Off'
      using errcode = '55000';
  end if;

  v_read_only_reason := case
    when v_format is distinct from 'single_elimination'
      then 'unsupported_format'
    when v_launched_at is null
      then 'division_not_launched'
    when v_tournament_status is distinct from 'in_progress'
      then 'tournament_not_in_progress'
    when v_match.status is distinct from 'in_progress'
      then 'match_not_in_progress'
    when v_match.player_one_registration_id is null
      or v_match.player_two_registration_id is null
      or v_match.player_one_registration_id =
        v_match.player_two_registration_id
      then 'participants_unavailable'
    when v_match.activation_version < 1
      then 'activation_unavailable'
    when v_match.official_result_submission_id is not null
      or v_match.winner_registration_id is not null
      or v_match.outcome_type is not null
      then 'official_outcome'
    when v_match.hold_started_at is not null
      and v_match.hold_released_at is null
      then 'admin_hold'
    when v_match.deadline_at is null
      or pg_catalog.statement_timestamp() >= v_match.deadline_at
      then 'deadline_elapsed'
    else null
  end;
  v_is_actionable := v_read_only_reason is null;

  if v_format = 'single_elimination' then
    -- Lawful single-elimination reset preserves the two Match participants.
    -- Current participant authorization therefore applies to every retained
    -- activation for this Match, including an activation where only the
    -- opponent rolled before reset. This preserves transparent authorized
    -- history without adding a second activation-membership table.
    for v_activation in
      select distinct activation.activation_version
      from (
        select v_match.activation_version as activation_version
        where v_match.activation_version > 0
        union all
        select roll.activation_version
        from public.match_dice_rolls as roll
        where roll.match_id = p_match_id
      ) as activation
      order by activation.activation_version desc
    loop
      v_games := '[]'::jsonb;

      for v_game_number in
        select game.game_number
        from (
          values (1::smallint), (3::smallint), (5::smallint)
        ) as game(game_number)
        where game.game_number <> 5 or v_match.series_best_of = 5
        order by game.game_number
      loop
        select pg_catalog.max(roll.tie_round)
        into v_latest_tie_round
        from public.match_dice_rolls as roll
        where roll.match_id = p_match_id
          and roll.activation_version = v_activation.activation_version
          and roll.game_number = v_game_number;

        v_latest_roll_count := 0;
        v_latest_total_one := null;
        v_latest_total_two := null;
        v_winner_slot := null;

        if v_latest_tie_round is null then
          v_current_tie_round := 1;
          v_game_state := 'open';
        else
          select
            pg_catalog.count(*)::integer,
            pg_catalog.max(roll.die_1 + roll.die_2) filter (
              where roll.participant_registration_id =
                v_match.player_one_registration_id
            ),
            pg_catalog.max(roll.die_1 + roll.die_2) filter (
              where roll.participant_registration_id =
                v_match.player_two_registration_id
            )
          into
            v_latest_roll_count,
            v_latest_total_one,
            v_latest_total_two
          from public.match_dice_rolls as roll
          where roll.match_id = p_match_id
            and roll.activation_version = v_activation.activation_version
            and roll.game_number = v_game_number
            and roll.tie_round = v_latest_tie_round;

          if v_latest_roll_count = 1 then
            v_current_tie_round := v_latest_tie_round;
            v_game_state := 'waiting';
          elsif v_latest_roll_count = 2
            and v_latest_total_one is not null
            and v_latest_total_two is not null
            and v_latest_total_one = v_latest_total_two then
            v_current_tie_round := v_latest_tie_round + 1;
            v_game_state := 'tied';
          elsif v_latest_roll_count = 2
            and v_latest_total_one is not null
            and v_latest_total_two is not null then
            v_current_tie_round := v_latest_tie_round;
            v_game_state := 'complete';
            v_winner_slot := case
              when v_latest_total_one > v_latest_total_two
                then 'player_one'
              else 'player_two'
            end;
          else
            v_current_tie_round := v_latest_tie_round;
            v_game_state := 'waiting';
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
                'participantSlot', case
                  when roll.participant_registration_id =
                    v_match.player_one_registration_id
                    then 'player_one'
                  when roll.participant_registration_id =
                    v_match.player_two_registration_id
                    then 'player_two'
                  else null
                end,
                'participantLabel', coalesce(
                  nullif(
                    pg_catalog.btrim(registration.player_name),
                    ''
                  ),
                  case
                    when roll.participant_registration_id =
                      v_match.player_one_registration_id
                      then 'Player 1'
                    when roll.participant_registration_id =
                      v_match.player_two_registration_id
                      then 'Player 2'
                    else 'Former competitor'
                  end
                ),
                'die1', roll.die_1,
                'die2', roll.die_2,
                'total', roll.die_1 + roll.die_2,
                'rolledAt', roll.rolled_at
              )
              order by case
                when roll.participant_registration_id =
                  v_match.player_one_registration_id then 1
                when roll.participant_registration_id =
                  v_match.player_two_registration_id then 2
                else 3
              end
            ) as rolls
          from public.match_dice_rolls as roll
          left join public.registrations as registration
            on registration.id = roll.participant_registration_id
          where roll.match_id = p_match_id
            and roll.activation_version = v_activation.activation_version
            and roll.game_number = v_game_number
          group by roll.tie_round
        ) as round_history;

        v_can_roll :=
          v_activation.activation_version = v_match.activation_version
          and v_is_actionable
          and v_viewer_registration_id is not null
          and v_game_state <> 'complete'
          and not exists (
            select 1
            from public.match_dice_rolls as existing_roll
            where existing_roll.match_id = p_match_id
              and existing_roll.activation_version =
                v_activation.activation_version
              and existing_roll.game_number = v_game_number
              and existing_roll.tie_round = v_current_tie_round
              and existing_roll.participant_registration_id =
                v_viewer_registration_id
          );

        v_games := v_games || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'gameNumber', v_game_number,
            'currentTieRound', v_current_tie_round,
            'state', v_game_state,
            'canRoll', v_can_roll,
            'winnerSlot', v_winner_slot,
            'rounds', v_rounds
          )
        );
      end loop;

      v_activations := v_activations || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'activationVersion', v_activation.activation_version,
          'isCurrent',
            v_activation.activation_version = v_match.activation_version,
          'games', v_games
        )
      );
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'matchId', p_match_id,
    'currentActivationVersion', v_match.activation_version,
    'seriesBestOf', v_match.series_best_of,
    'viewerRole', v_viewer_role,
    'viewerSlot', v_viewer_slot,
    'isActionable', v_is_actionable,
    'readOnlyReason', v_read_only_reason,
    'participants', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'slot', 'player_one',
        'label', coalesce(
          nullif(pg_catalog.btrim(v_player_one_label), ''),
          'Player 1'
        )
      ),
      pg_catalog.jsonb_build_object(
        'slot', 'player_two',
        'label', coalesce(
          nullif(pg_catalog.btrim(v_player_two_label), ''),
          'Player 2'
        )
      )
    ),
    'activations', v_activations
  );
end;
$$;

alter function public.get_match_dice_rolloff(uuid) owner to postgres;
revoke all on function public.get_match_dice_rolloff(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_match_dice_rolloff(uuid)
  to authenticated;

create function public.roll_match_dice(
  p_match_id uuid,
  p_expected_activation_version integer,
  p_game_number smallint,
  p_expected_tie_round integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
  v_tournament_id uuid;
  v_tournament_status text;
  v_launched_at timestamptz;
  v_clerk_user_id text := nullif(
    pg_catalog.btrim(auth.jwt() ->> 'sub'),
    ''
  );
  v_registration_id uuid;
  v_participant_slot text;
  v_existing_roll public.match_dice_rolls%rowtype;
  v_stored_roll public.match_dice_rolls%rowtype;
  v_latest_tie_round integer;
  v_latest_roll_count integer;
  v_latest_total_one integer;
  v_latest_total_two integer;
  v_required_tie_round integer;
  v_random_byte integer;
  v_die_1 smallint;
  v_die_2 smallint;
  v_created boolean := false;
begin
  if v_clerk_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '28000';
  end if;

  if p_match_id is null
    or p_expected_activation_version is null
    or p_expected_activation_version < 1
    or p_game_number is null
    or p_game_number not in (1, 3, 5)
    or p_expected_tie_round is null
    or p_expected_tie_round < 1 then
    raise exception 'Invalid dice roll request'
      using errcode = '22023';
  end if;

  -- Match mutation paths in the established result/reset architecture lock
  -- this concrete Match first. The tournament SHARE lock below then makes
  -- cancellation/completion status changes linear with this insert.
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  select
    generated.format,
    bracket.tournament_id,
    bracket.launched_at
  into v_format, v_tournament_id, v_launched_at
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = v_match.generated_bracket_id;

  if not found then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  select tournament.status
  into v_tournament_status
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for share;

  if not found then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  -- Resolve the exact current participant before returning any Match-state
  -- detail. An unrelated authenticated caller receives only the same generic
  -- refusal as an unknown Match; Admin metadata never grants write authority.
  select
    registration.id,
    case
      when registration.id = v_match.player_one_registration_id
        then 'player_one'
      else 'player_two'
    end
  into v_registration_id, v_participant_slot
  from public.registrations as registration
  where registration.clerk_user_id = v_clerk_user_id
    and registration.id in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
  order by registration.id
  limit 1;

  if v_registration_id is null then
    raise exception 'Dice roll-off is unavailable'
      using errcode = '42501';
  end if;

  if v_format is distinct from 'single_elimination' then
    raise exception 'Dice Roll-Off supports single-elimination Matches only'
      using errcode = '55000';
  end if;

  if v_launched_at is null
    or v_tournament_status is distinct from 'in_progress'
    or v_match.status is distinct from 'in_progress'
    or v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null
    or v_match.player_one_registration_id =
      v_match.player_two_registration_id
    or v_match.activation_version < 1
    or v_match.official_result_submission_id is not null
    or v_match.winner_registration_id is not null
    or v_match.outcome_type is not null
    or (
      v_match.hold_started_at is not null
      and v_match.hold_released_at is null
    ) then
    raise exception 'Dice roll-off is not currently actionable'
      using errcode = '55000';
  end if;

  if v_match.deadline_at is null
    or pg_catalog.clock_timestamp() >= v_match.deadline_at then
    raise exception 'The Match deadline has elapsed'
      using errcode = '55000';
  end if;

  if v_match.activation_version <>
    p_expected_activation_version then
    raise exception 'The Match activation changed; refresh and try again'
      using errcode = '40001';
  end if;

  if v_match.series_best_of not in (3, 5) then
    raise exception 'This Series format is not supported for Dice Roll-Off'
      using errcode = '55000';
  end if;

  if p_game_number = 5 and v_match.series_best_of <> 5 then
    raise exception 'Game 5 Dice Roll-Off is available only for BO5 Matches'
      using errcode = '22023';
  end if;

  -- An exact retry is idempotent even if the opponent's tied roll has since
  -- opened the next round. Activation freshness was checked above, so a stale
  -- pre-reset tab cannot read or write through this mutation RPC.
  select roll.*
  into v_existing_roll
  from public.match_dice_rolls as roll
  where roll.match_id = p_match_id
    and roll.activation_version = p_expected_activation_version
    and roll.game_number = p_game_number
    and roll.tie_round = p_expected_tie_round
    and roll.participant_registration_id = v_registration_id;

  if found then
    return pg_catalog.jsonb_build_object(
      'snapshot', public.get_match_dice_rolloff(p_match_id),
      'roll', pg_catalog.jsonb_build_object(
        'activationVersion', v_existing_roll.activation_version,
        'gameNumber', v_existing_roll.game_number,
        'tieRound', v_existing_roll.tie_round,
        'participantSlot', v_participant_slot,
        'die1', v_existing_roll.die_1,
        'die2', v_existing_roll.die_2,
        'total', v_existing_roll.die_1 + v_existing_roll.die_2,
        'rolledAt', v_existing_roll.rolled_at,
        'created', false
      )
    );
  end if;

  select pg_catalog.max(roll.tie_round)
  into v_latest_tie_round
  from public.match_dice_rolls as roll
  where roll.match_id = p_match_id
    and roll.activation_version = p_expected_activation_version
    and roll.game_number = p_game_number;

  if v_latest_tie_round is null then
    v_required_tie_round := 1;
  else
    select
      pg_catalog.count(*)::integer,
      pg_catalog.max(roll.die_1 + roll.die_2) filter (
        where roll.participant_registration_id =
          v_match.player_one_registration_id
      ),
      pg_catalog.max(roll.die_1 + roll.die_2) filter (
        where roll.participant_registration_id =
          v_match.player_two_registration_id
      )
    into
      v_latest_roll_count,
      v_latest_total_one,
      v_latest_total_two
    from public.match_dice_rolls as roll
    where roll.match_id = p_match_id
      and roll.activation_version = p_expected_activation_version
      and roll.game_number = p_game_number
      and roll.tie_round = v_latest_tie_round;

    if v_latest_roll_count = 1 then
      v_required_tie_round := v_latest_tie_round;
    elsif v_latest_roll_count = 2
      and v_latest_total_one is not null
      and v_latest_total_two is not null
      and v_latest_total_one = v_latest_total_two then
      v_required_tie_round := v_latest_tie_round + 1;
    elsif v_latest_roll_count = 2
      and v_latest_total_one is not null
      and v_latest_total_two is not null then
      raise exception 'This Game Dice Roll-Off is already complete'
        using errcode = '55000';
    else
      raise exception 'Dice Roll-Off history is inconsistent'
        using errcode = '55000';
    end if;
  end if;

  if v_required_tie_round <> p_expected_tie_round then
    raise exception 'The tie round changed; refresh and try again'
      using errcode = '40001';
  end if;

  -- Staging preflight positively resolves pgcrypto's secure-byte function as
  -- extensions.gen_random_bytes(integer). Reject the four high byte values so
  -- every accepted d6 face owns exactly 42 of the 252 accepted byte values.
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

  insert into public.match_dice_rolls (
    match_id,
    activation_version,
    game_number,
    tie_round,
    participant_registration_id,
    die_1,
    die_2
  )
  values (
    p_match_id,
    p_expected_activation_version,
    p_game_number,
    p_expected_tie_round,
    v_registration_id,
    v_die_1,
    v_die_2
  )
  on conflict do nothing
  returning * into v_stored_roll;

  v_created := found;

  if not v_created then
    select roll.*
    into v_stored_roll
    from public.match_dice_rolls as roll
    where roll.match_id = p_match_id
      and roll.activation_version = p_expected_activation_version
      and roll.game_number = p_game_number
      and roll.tie_round = p_expected_tie_round
      and roll.participant_registration_id = v_registration_id;

    if not found then
      raise exception 'Dice roll could not be stored'
        using errcode = '40001';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'snapshot', public.get_match_dice_rolloff(p_match_id),
    'roll', pg_catalog.jsonb_build_object(
      'activationVersion', v_stored_roll.activation_version,
      'gameNumber', v_stored_roll.game_number,
      'tieRound', v_stored_roll.tie_round,
      'participantSlot', v_participant_slot,
      'die1', v_stored_roll.die_1,
      'die2', v_stored_roll.die_2,
      'total', v_stored_roll.die_1 + v_stored_roll.die_2,
      'rolledAt', v_stored_roll.rolled_at,
      'created', v_created
    )
  );
end;
$$;

alter function public.roll_match_dice(uuid, integer, smallint, integer)
  owner to postgres;
revoke all on function
  public.roll_match_dice(uuid, integer, smallint, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.roll_match_dice(uuid, integer, smallint, integer)
  to authenticated;

comment on function public.get_match_dice_rolloff(uuid) is
  'Authenticated slot-based read projection for participant or Admin Match Dice Roll-Off history.';
comment on function
  public.roll_match_dice(uuid, integer, smallint, integer) is
  'Participant-only idempotent secure 2d6 roll for one current single-elimination Match activation, Game, and tie round.';

commit;
