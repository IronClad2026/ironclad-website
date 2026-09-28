-- This migration changes definitions only. No existing business rows are rewritten.
-- The private guard follows the current-effective pair and immutable evidence
-- contract in 20260822160000_account_legal_future_gate_stability.sql.
begin;

create or replace function ironclad_private.require_current_account_legal_acceptance()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(auth.jwt() ->> 'sub', '');
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_document public.legal_documents%rowtype;
  v_document_count integer := 0;
  v_terms public.legal_documents%rowtype;
  v_privacy public.legal_documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  -- Keep the acceptance writer's exact current-document predicates and lock
  -- order. SHARE locks keep successor activation behind this transaction.
  for v_document in
    select document.*
    from public.legal_documents as document
    where document.document_kind in ('privacy', 'terms')
      and document.status = 'effective'
      and document.published_at is not null
      and document.published_at <= v_checked_at
      and document.effective_at is not null
      and document.effective_at <= v_checked_at
      and document.sha256 is not null
    order by document.document_kind
    for share
  loop
    v_document_count := v_document_count + 1;
    if v_document.document_kind = 'terms' then
      v_terms := v_document;
    elsif v_document.document_kind = 'privacy' then
      v_privacy := v_document;
    end if;
  end loop;

  if v_document_count <> 2
    or v_terms.id is null
    or v_privacy.id is null then
    raise exception 'ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.account_legal_acceptances as acceptance
    where acceptance.clerk_user_id = v_clerk_user_id
      and acceptance.terms_document_id = v_terms.id
      and acceptance.privacy_document_id = v_privacy.id
      and acceptance.terms_accepted is true
      and acceptance.privacy_acknowledged is true
  ) then
    raise exception 'ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED'
      using errcode = '42501';
  end if;
end;
$$;

alter function ironclad_private.require_current_account_legal_acceptance()
  owner to postgres;
revoke all on function
  ironclad_private.require_current_account_legal_acceptance()
  from public, anon, authenticated, service_role;

comment on function
  ironclad_private.require_current_account_legal_acceptance() is
  'Owner-only member-mutation guard. Resolves Clerk textual sub, locks the current Effective Terms/Privacy pair using the canonical acceptance writer predicates, and requires exact immutable account evidence. Never creates or changes acceptance facts; never accepts a caller-supplied identity.';

CREATE OR REPLACE FUNCTION public.cast_poll_ballot(p_poll_id uuid, p_expected_revision integer, p_option_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_clerk_user_id text := nullif(auth.jwt() ->> 'sub', '');
  v_player_id uuid;
  v_poll public.polls%rowtype;
  v_eligibility public.poll_eligible_voters%rowtype;
  v_now timestamptz;
  v_requested_count integer;
  v_valid_option_count integer;
  v_requested_options uuid[];
  v_current_options uuid[];
  v_first_voted_at timestamptz;
  v_ballot_updated_at timestamptz;
  v_new_revision integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
    and player.account_closed_at is null
  for share;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for share;

  if not found
    or v_poll.published_at is null
    or v_poll.cancelled_at is not null then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select eligible.*
  into v_eligibility
  from public.poll_eligible_voters as eligible
  where eligible.poll_id = p_poll_id
    and eligible.player_id = v_player_id
  for update;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  perform ironclad_private.require_current_account_legal_acceptance();

  -- Capture the authoritative time only after a concurrent ballot update can
  -- no longer keep this request waiting across the close boundary.
  v_now := pg_catalog.clock_timestamp();
  if v_now < v_poll.opens_at or v_now >= v_poll.closes_at then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  if p_option_ids is null
    or coalesce(cardinality(p_option_ids), 0) = 0
    or array_position(p_option_ids, null) is not null then
    raise exception 'Select at least one valid poll option'
      using errcode = '22023';
  end if;

  select count(distinct option_id)::integer,
    pg_catalog.array_agg(distinct option_id order by option_id)
  into v_requested_count, v_requested_options
  from unnest(p_option_ids) as option_id;

  if v_requested_count <> cardinality(p_option_ids)
    or v_requested_count > v_poll.max_selections then
    raise exception 'Ballot selections are invalid'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_valid_option_count
  from public.poll_options as option
  where option.poll_id = p_poll_id
    and option.id = any(v_requested_options);

  if v_valid_option_count <> v_requested_count then
    raise exception 'Ballot selections are invalid'
      using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(choice.option_id order by choice.option_id),
    array[]::uuid[]
  )
  into v_current_options
  from public.poll_ballot_choices as choice
  where choice.poll_id = p_poll_id
    and choice.eligible_voter_id = v_eligibility.id;

  if v_current_options = v_requested_options then
    return pg_catalog.jsonb_build_object(
      'poll_id', p_poll_id,
      'ballot_revision', v_eligibility.ballot_revision,
      'selected_option_ids', pg_catalog.to_jsonb(v_current_options),
      'first_voted_at', v_eligibility.first_voted_at,
      'ballot_updated_at', v_eligibility.ballot_updated_at,
      'idempotent', true
    );
  end if;

  if p_expected_revision is null
    or p_expected_revision < 0
    or p_expected_revision <> v_eligibility.ballot_revision then
    raise exception 'Ballot revision conflict' using errcode = '40001';
  end if;

  delete from public.poll_ballot_choices
  where poll_id = p_poll_id
    and eligible_voter_id = v_eligibility.id;

  v_ballot_updated_at := pg_catalog.clock_timestamp();
  insert into public.poll_ballot_choices (
    poll_id, eligible_voter_id, option_id, selected_at
  )
  select p_poll_id, v_eligibility.id, option_id, v_ballot_updated_at
  from unnest(v_requested_options) as option_id
  order by option_id;

  update public.poll_eligible_voters
  set first_voted_at = coalesce(first_voted_at, v_ballot_updated_at),
    ballot_updated_at = v_ballot_updated_at,
    ballot_revision = ballot_revision + 1
  where id = v_eligibility.id
    and poll_id = p_poll_id
  returning first_voted_at, ballot_updated_at, ballot_revision
  into v_first_voted_at, v_ballot_updated_at, v_new_revision;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'ballot_revision', v_new_revision,
    'selected_option_ids', pg_catalog.to_jsonb(v_requested_options),
    'first_voted_at', v_first_voted_at,
    'ballot_updated_at', v_ballot_updated_at,
    'idempotent', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.roll_match_dice(p_match_id uuid, p_expected_activation_version integer, p_game_number smallint, p_expected_tie_round integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  perform ironclad_private.require_current_account_legal_acceptance();

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
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_waitlist_offer(p_registration_id uuid, p_response text)
 RETURNS TABLE(registration_id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text, waitlist_offer_status text, waitlist_offer_resolved_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_clerk_user_id text;
  v_tournament_bracket_id uuid;
  v_registration public.registrations%rowtype;
  v_launched_at timestamptz;
  v_resolved_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'Not authorized';
  end if;

  v_clerk_user_id := nullif(auth.jwt() ->> 'sub', '');
  if v_clerk_user_id is null then
    raise exception 'Not authorized';
  end if;

  if p_response is null or p_response not in ('accept', 'decline') then
    raise exception 'Waitlist response must be accept or decline';
  end if;

  select registration.tournament_bracket_id
  into v_tournament_bracket_id
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id;

  if not found or v_tournament_bracket_id is null then
    raise exception 'Waitlist offer not found';
  end if;

  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = v_tournament_bracket_id
  for update;

  select registration.*
  into v_registration
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id
    and registration.tournament_bracket_id = v_tournament_bracket_id
  for update;

  if not found
    or v_registration.registration_status <> 'waitlisted'
    or v_registration.waitlist_offer_status <> 'offered' then
    raise exception 'This waitlist offer is no longer available';
  end if;

  if v_launched_at is not null then
    raise exception 'This waitlist offer closed when the division launched';
  end if;

  if p_response = 'accept' then
    perform ironclad_private.require_current_account_legal_acceptance();
  end if;

  v_resolved_at := clock_timestamp();

  if v_resolved_at >= v_registration.waitlist_offer_expires_at then
    raise exception 'This waitlist offer has expired';
  end if;

  if p_response = 'accept' then
    update public.registrations
    set
      registration_status = 'pending',
      waitlist_offer_status = 'accepted',
      waitlist_offer_resolved_at = v_resolved_at
    where id = p_registration_id;

    registration_status := 'pending';
    waitlist_offer_status := 'accepted';
  else
    update public.registrations
    set
      waitlist_offer_status = 'declined',
      waitlist_offer_resolved_at = v_resolved_at
    where id = p_registration_id;

    registration_status := 'waitlisted';
    waitlist_offer_status := 'declined';
  end if;

  registration_id := v_registration.id;
  tournament_id := v_registration.tournament_id;
  tournament_bracket_id := v_registration.tournament_bracket_id;
  waitlist_offer_resolved_at := v_resolved_at;
  return next;
end;
$function$;

alter function public.cast_poll_ballot(uuid, integer, uuid[]) owner to postgres;
revoke all on function public.cast_poll_ballot(uuid, integer, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.cast_poll_ballot(uuid, integer, uuid[]) to authenticated;

alter function public.roll_match_dice(uuid, integer, smallint, integer) owner to postgres;
revoke all on function public.roll_match_dice(uuid, integer, smallint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.roll_match_dice(uuid, integer, smallint, integer) to authenticated;

alter function public.respond_to_waitlist_offer(uuid, text) owner to postgres;
revoke all on function public.respond_to_waitlist_offer(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.respond_to_waitlist_offer(uuid, text) to authenticated;

commit;
