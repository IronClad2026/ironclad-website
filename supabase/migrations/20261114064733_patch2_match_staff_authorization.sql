begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Trusted callers pass an explicit actor only after server and database staff checks.
-- These private implementations are owner-only. Public participant wrappers always
-- use the signed subject and never receive staff authority from JWT metadata.

create function ironclad_private.require_match_account_legal_acceptance(p_sub text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_document public.legal_documents%rowtype;
  v_document_count integer := 0;
  v_terms public.legal_documents%rowtype;
  v_privacy public.legal_documents%rowtype;
begin
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
    where acceptance.clerk_user_id = p_sub
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

create or replace function ironclad_private.require_current_account_legal_acceptance()
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_sub text := nullif(auth.jwt() ->> 'sub', '');
begin
  if auth.role() is distinct from 'authenticated' or v_sub is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  perform ironclad_private.require_match_account_legal_acceptance(v_sub);
end;
$$;

create function ironclad_private.lock_open_match_room_actor(p_sub text)
returns text language plpgsql set search_path = pg_catalog as $$
begin
  if p_sub is null then raise exception 'Match Room unavailable' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:' || p_sub, 0));
  if ironclad_private.patch2_account_state(p_sub) is distinct from 'active-player' then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  return p_sub;
end;
$$;

create or replace function ironclad_private.match_room_actor()
returns text language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  return ironclad_private.lock_open_match_room_actor(nullif(btrim(auth.jwt() ->> 'sub'), ''));
end;
$$;

create function ironclad_private.match_room_access(p_room_id uuid, p_sub text, p_staff boolean)
returns public.match_rooms language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype; v_context jsonb; v_reason text;
begin
  select * into v_room from public.match_rooms where id = p_room_id;
  if not found or (p_staff is distinct from true
    and not exists (select 1 from public.registrations r
      where r.id in (v_room.player_one_registration_id, v_room.player_two_registration_id)
        and r.clerk_user_id = p_sub)) then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  v_context := ironclad_private.match_room_context(v_room.match_id);
  select * into v_room from public.match_rooms where id = p_room_id for update;
  if v_room.closed_at is null then
    if v_context is null then v_reason := 'match_unavailable';
    elsif (v_context ->> 'generation')::bigint <> v_room.communication_generation
      or (v_context ->> 'playerOne')::uuid is distinct from v_room.player_one_registration_id
      or (v_context ->> 'playerTwo')::uuid is distinct from v_room.player_two_registration_id then
      v_reason := 'lifecycle_changed';
    elsif not (v_context ->> 'writable')::boolean then
      v_reason := v_context ->> 'closureReason';
    end if;
    if v_reason is not null then
      update public.match_rooms set closed_at = greatest(created_at,
        coalesce((v_context ->> 'closedAt')::timestamptz, clock_timestamp())), closure_reason = v_reason
      where id = p_room_id returning * into v_room;
    end if;
  end if;
  return v_room;
end;
$$;

create or replace function ironclad_private.match_room_access(p_room_id uuid, p_sub text)
returns public.match_rooms language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.match_room_access(p_room_id, p_sub, false);
$$;

create function ironclad_private.resolve_match_room(p_match_id uuid, p_sub text, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_context jsonb; v_room public.match_rooms%rowtype; v_enabled boolean;
begin
  if p_match_id is null then raise exception 'Invalid Match Room request' using errcode = '22023'; end if;
  v_enabled := ironclad_private.match_room_writes_enabled();
  v_context := ironclad_private.match_room_context(p_match_id);
  if v_context is null or (p_staff is distinct from true
    and not exists (select 1 from public.registrations r
      where r.id in ((v_context ->> 'playerOne')::uuid, (v_context ->> 'playerTwo')::uuid)
        and r.clerk_user_id = p_sub)) then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  select * into v_room from public.match_rooms
  where match_id = p_match_id and communication_generation = (v_context ->> 'generation')::bigint;
  if not found then
    if not v_enabled or not (v_context ->> 'eligible')::boolean or not (v_context ->> 'writable')::boolean then
      return jsonb_build_object('room', null);
    end if;
    -- Defensive closure also handles imported legacy communication rows.
    update public.match_rooms set closed_at = clock_timestamp(), closure_reason = 'lifecycle_changed'
    where match_id = p_match_id and closed_at is null;
    insert into public.match_rooms(match_id, room_revision, communication_generation,
      activation_version_snapshot, player_one_registration_id, player_two_registration_id)
    values (p_match_id, (v_context ->> 'generation')::bigint, (v_context ->> 'generation')::bigint,
      (v_context ->> 'activation')::integer, (v_context ->> 'playerOne')::uuid, (v_context ->> 'playerTwo')::uuid)
    returning * into v_room;
  end if;
  v_room := ironclad_private.match_room_access(v_room.id, p_sub, p_staff);
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, p_sub));
end;
$$;

create or replace function public.resolve_match_room(p_match_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.resolve_match_room(p_match_id, ironclad_private.match_room_actor(), false);
$$;

create function ironclad_private.get_match_room_history(p_room_id uuid, p_after_sequence bigint, p_limit integer, p_sub text, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype;
  v_messages jsonb; v_last bigint;
begin
  if p_room_id is null or p_after_sequence is null or p_after_sequence < 0
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid Match Room history request' using errcode = '22023';
  end if;
  v_room := ironclad_private.match_room_access(p_room_id, p_sub, p_staff);
  if p_after_sequence > v_room.last_sequence then
    raise exception 'History cursor is ahead of the room' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(ironclad_private.match_message_projection(m::public.match_messages) order by m.sequence), '[]'::jsonb),
    coalesce(max(m.sequence), p_after_sequence) into v_messages, v_last
  from (select * from public.match_messages where room_id = p_room_id and sequence > p_after_sequence
    order by sequence limit p_limit) m;
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, p_sub),
    'messages', v_messages, 'hasMore', v_last < v_room.last_sequence, 'nextAfterSequence', v_last);
end;
$$;

create or replace function public.get_match_room_history(p_room_id uuid, p_after_sequence bigint default 0, p_limit integer default 50)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.get_match_room_history(p_room_id, p_after_sequence, p_limit, ironclad_private.match_room_actor(), false);
$$;

create function ironclad_private.get_match_room_earlier_history(p_room_id uuid, p_before_sequence bigint, p_limit integer, p_sub text, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype;
  v_messages jsonb; v_first bigint; v_more boolean;
begin
  if p_room_id is null or p_before_sequence is null or p_before_sequence not between 1 and 9007199254740991
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid Match Room history request' using errcode = '22023';
  end if;
  v_room := ironclad_private.match_room_access(p_room_id, p_sub, p_staff);
  if p_before_sequence > v_room.last_sequence + 1 then
    raise exception 'History cursor is ahead of the room' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(ironclad_private.match_message_projection(m::public.match_messages) order by m.sequence), '[]'::jsonb),
    coalesce(min(m.sequence), p_before_sequence) into v_messages, v_first
  from (select * from public.match_messages where room_id = p_room_id and sequence < p_before_sequence
    order by sequence desc limit p_limit) m;
  select exists(select 1 from public.match_messages where room_id = p_room_id and sequence < v_first) into v_more;
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, p_sub),
    'messages', v_messages, 'hasMore', v_more, 'nextBeforeSequence', v_first);
end;
$$;

create or replace function public.get_match_room_earlier_history(p_room_id uuid, p_before_sequence bigint, p_limit integer default 50)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.get_match_room_earlier_history(p_room_id, p_before_sequence, p_limit, ironclad_private.match_room_actor(), false);
$$;

create function ironclad_private.mark_match_room_read(p_room_id uuid, p_through_sequence bigint, p_sub text, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype; v_last bigint; v_episode record;
begin
  if p_room_id is null or p_through_sequence is null or p_through_sequence < 0 then
    raise exception 'Invalid Match Room read cursor' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  v_room := ironclad_private.match_room_access(p_room_id, p_sub, p_staff);
  if p_through_sequence > v_room.last_sequence then
    raise exception 'Read cursor is ahead of the room' using errcode = '22023';
  end if;
  insert into public.match_room_reads(room_id, viewer_clerk_user_id, last_read_sequence)
  values(p_room_id, p_sub, p_through_sequence)
  on conflict (room_id, viewer_clerk_user_id) do update
    set last_read_sequence = greatest(match_room_reads.last_read_sequence, excluded.last_read_sequence),
      updated_at = clock_timestamp()
  returning last_read_sequence into v_last;
  if v_last >= v_room.last_sequence then
    for v_episode in
      update public.match_room_notification_episodes e set resolved_at = clock_timestamp()
      where e.room_id = p_room_id and e.resolved_at is null and exists (
        select 1 from public.registrations r where r.id = e.recipient_registration_id and r.clerk_user_id = p_sub
      ) returning notification_id
    loop
      perform ironclad_private.finish_match_room_notification(v_episode.notification_id);
    end loop;
  end if;
  return jsonb_build_object('roomId', p_room_id, 'lastReadSequence', v_last);
end;
$$;

create or replace function public.mark_match_room_read(p_room_id uuid, p_through_sequence bigint)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.mark_match_room_read(p_room_id, p_through_sequence, ironclad_private.match_room_actor(), false);
$$;

create function ironclad_private.send_match_room_message(p_match_id uuid, p_expected_room_id uuid,
  p_client_message_id uuid, p_body text, p_sub text, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_room public.match_rooms%rowtype;
  v_message public.match_messages%rowtype; v_registration_id uuid; v_now timestamptz;
  v_blank_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_match_id is null or p_expected_room_id is null or p_client_message_id is null
    or p_body is null or char_length(p_body) not between 1 and 1000
    or btrim(p_body, v_blank_chars) = '' then
    raise exception 'Invalid Match Room message' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  v_room := ironclad_private.match_room_access(p_expected_room_id, p_sub, p_staff);
  if v_room.match_id <> p_match_id then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  if p_staff is distinct from true then
    select r.id into v_registration_id from public.registrations r
    where r.id in (v_room.player_one_registration_id, v_room.player_two_registration_id)
      and r.clerk_user_id = p_sub order by r.id limit 1;
    if v_registration_id is null then raise exception 'Match Room unavailable' using errcode = '42501'; end if;
  end if;
  -- Stale commands never receive historical content through the write endpoint.
  if not exists (select 1 from public.tournament_matches m where m.id = p_match_id
    and m.communication_generation = v_room.communication_generation
    and m.player_one_registration_id = v_room.player_one_registration_id
    and m.player_two_registration_id = v_room.player_two_registration_id) then
    raise exception 'The Match Room changed; refresh and try again' using errcode = '40001';
  end if;
  perform ironclad_private.require_match_account_legal_acceptance(p_sub);
  select * into v_message from public.match_messages
  where room_id = v_room.id and actor_clerk_user_id = p_sub and client_message_id = p_client_message_id;
  if found then
    if v_message.body <> p_body or v_message.sender_kind <> (case when p_staff then 'admin' else 'player' end) then
      raise exception 'The message key has already been used' using errcode = '23505';
    end if;
    return jsonb_build_object('message', ironclad_private.match_message_projection(v_message), 'duplicate', true);
  end if;
  if v_room.closed_at is not null then
    raise exception 'Match Room is read-only' using errcode = '55000';
  end if;
  v_now := clock_timestamp();
  if (select count(*) from public.match_messages where room_id = v_room.id
    and actor_clerk_user_id = p_sub and created_at > v_now - interval '1 minute') >= 15 then
    raise exception 'MATCH_ROOM_RATE_LIMITED' using errcode = 'P0001';
  end if;
  update public.match_rooms set last_sequence = last_sequence + 1
  where id = v_room.id returning * into v_room;
  insert into public.match_messages(room_id, sequence, sender_kind, sender_registration_id,
    actor_clerk_user_id, client_message_id, body, created_at)
  values(v_room.id, v_room.last_sequence, case when p_staff then 'admin' else 'player' end,
    v_registration_id, p_sub, p_client_message_id, p_body, v_now) returning * into v_message;
  return jsonb_build_object('message', ironclad_private.match_message_projection(v_message), 'duplicate', false);
end;
$$;

create or replace function ironclad_private.send_match_room_message(p_match_id uuid, p_expected_room_id uuid,
  p_client_message_id uuid, p_body text, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_admin is distinct from false then raise exception 'Match Room unavailable' using errcode = '42501'; end if;
  return ironclad_private.send_match_room_message(p_match_id, p_expected_room_id, p_client_message_id,
    p_body, ironclad_private.match_room_actor(), false);
end;
$$;
revoke all on function public.send_admin_match_room_message(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function ironclad_private.get_match_dice_rolloff(p_match_id uuid, p_sub text, p_staff boolean)
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
  v_viewer_registration_id uuid;
  v_viewer_slot text;
  v_viewer_role text;
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
  if p_match_id is null or p_sub is null then
    raise exception 'Authentication and Match are required'
      using errcode = '28000';
  end if;

  if ironclad_private.patch2_account_state(p_sub) = 'denied' then
    raise exception 'Dice roll-off is unavailable' using errcode = '42501';
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
  where registration.clerk_user_id = p_sub
    and registration.id in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
  order by registration.id
  limit 1;

  if v_viewer_registration_id is null and p_staff is distinct from true then
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

create or replace function public.get_match_dice_rolloff(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Dice roll-off is unavailable' using errcode = '42501';
  end if;
  return ironclad_private.get_match_dice_rolloff(p_match_id, nullif(btrim(auth.jwt() ->> 'sub'), ''), false);
end;
$$;

create function ironclad_private.match_room_assistance_projection(p_room_id uuid, p_staff boolean)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'roomId', p_room_id, 'status', coalesce(a.status, 'none'),
    'requestVersion', coalesce(a.request_version, 0),
    'requestedAt', a.requested_at, 'resolvedAt', a.resolved_at,
    'canResolve', public.get_match_room_enabled()
      and coalesce(a.status = 'requested', false)
      and p_staff
  ) from (select 1) singleton left join public.match_room_assistance a on a.room_id = p_room_id;
$$;

create or replace function ironclad_private.match_room_assistance_projection(p_room_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select ironclad_private.match_room_assistance_projection(p_room_id, false);
$$;

create function ironclad_private.get_match_room_assistance(p_room_id uuid, p_sub text, p_staff boolean)
returns jsonb language plpgsql set search_path = pg_catalog as $$
begin
  if p_room_id is null then raise exception 'Invalid assistance request' using errcode = '22023'; end if;
  perform ironclad_private.match_room_access(p_room_id, p_sub, p_staff);
  return ironclad_private.match_room_assistance_projection(p_room_id, p_staff);
end;
$$;

create function ironclad_private.resolve_match_room_assistance(p_room_id uuid, p_expected_request_version bigint, p_sub text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_state public.match_room_assistance%rowtype; v_notice record;
begin
  if p_room_id is null or p_expected_request_version is null or p_expected_request_version not between 1 and 9007199254740991 then
    raise exception 'Invalid assistance request' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  perform ironclad_private.match_room_access(p_room_id, p_sub, true);
  perform ironclad_private.require_match_account_legal_acceptance(p_sub);
  select * into v_state from public.match_room_assistance where room_id = p_room_id for update;
  if not found or v_state.request_version <> p_expected_request_version then
    raise exception 'Assistance request changed' using errcode = '40001';
  end if;
  if v_state.status = 'requested' then
    update public.match_room_assistance set status = 'resolved', resolved_at = clock_timestamp(),
      resolved_by_clerk_user_id = p_sub where room_id = p_room_id;
    for v_notice in select id from public.notifications
      where type = 'match.admin_assistance_requested' and metadata ->> 'roomId' = p_room_id::text
        and match_id = (select match_id from public.match_rooms where id = p_room_id)
    loop
      perform ironclad_private.finish_match_room_notification(v_notice.id, true);
    end loop;
  end if;
  return ironclad_private.match_room_assistance_projection(p_room_id, true);
end;
$$;

create or replace function public.resolve_match_room_assistance(p_room_id uuid, p_expected_request_version bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  raise exception 'Match Room unavailable' using errcode = '42501';
end;
$$;
revoke all on function public.get_match_room_assistance(uuid), public.resolve_match_room_assistance(uuid, bigint)
  from public, anon, authenticated, service_role;

create or replace function public.set_match_room_enabled(p_enabled boolean, p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Match Room setting requires the trusted server boundary' using errcode = '42501';
  end if;
  if p_enabled is null or v_actor is null or char_length(v_actor) > 256 then
    raise exception 'Invalid Match Room setting' using errcode = '22023';
  end if;
  perform ironclad_private.require_patch2_open_account(v_actor);
  insert into public.platform_settings(key, value, updated_by_clerk_user_id)
  values ('match_room', jsonb_build_object('enabled', p_enabled), v_actor)
  on conflict(key) do update set value = excluded.value,
    updated_by_clerk_user_id = excluded.updated_by_clerk_user_id;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

create function ironclad_private.require_match_profile_notice(p_sub text)
returns void language plpgsql stable set search_path = pg_catalog as $$
declare v_version text := ironclad_private.public_gaming_profile_notice_version();
begin
  if v_version is not null and not ironclad_private.public_gaming_profile_notice_satisfied(p_sub, v_version) then
    raise exception 'PROFILE_NOTICE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- Only the trusted app server can call this RPC, after checking the current
-- Clerk user and session. Independently check the local verified staff grant
-- and durable account state under the same lock used for closure and revocation.
create function public.call_patch2_match_staff(
  p_operation text, p_arguments jsonb, p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_sub text := nullif(btrim(p_actor_clerk_user_id), '');
  v_keys text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  if v_sub is null or length(v_sub) > 255 or jsonb_typeof(p_arguments) is distinct from 'object' then
    raise exception 'Invalid staff operation input' using errcode = '22023';
  end if;
  v_keys := case p_operation
    when 'resolve_match_room' then array['p_match_id']
    when 'get_match_room_history' then array['p_room_id','p_after_sequence','p_limit']
    when 'get_match_room_earlier_history' then array['p_room_id','p_before_sequence','p_limit']
    when 'mark_match_room_read' then array['p_room_id','p_through_sequence']
    when 'send_admin_match_room_message' then array['p_match_id','p_expected_room_id','p_client_message_id','p_body']
    when 'get_match_dice_rolloff' then array['p_match_id']
  end;
  if v_keys is null or not (p_arguments ?& v_keys) or p_arguments - v_keys <> '{}'::jsonb then
    raise exception 'Unknown staff operation or arguments' using errcode = '22023';
  end if;

  if p_operation = 'get_match_dice_rolloff' then
    perform ironclad_private.require_patch2_open_account(v_sub);
  else
    if public.get_patch2_admin_account_state(v_sub) is distinct from 'verified-active-player' then
      raise exception 'Account access is unavailable' using errcode = '42501';
    end if;
    perform ironclad_private.lock_open_match_room_actor(v_sub);
  end if;
  perform ironclad_private.require_match_profile_notice(v_sub);

  case p_operation
    when 'resolve_match_room' then
      return ironclad_private.resolve_match_room((p_arguments->>'p_match_id')::uuid, v_sub, true);
    when 'get_match_room_history' then
      return ironclad_private.get_match_room_history((p_arguments->>'p_room_id')::uuid,
        (p_arguments->>'p_after_sequence')::bigint, (p_arguments->>'p_limit')::integer, v_sub, true);
    when 'get_match_room_earlier_history' then
      return ironclad_private.get_match_room_earlier_history((p_arguments->>'p_room_id')::uuid,
        (p_arguments->>'p_before_sequence')::bigint, (p_arguments->>'p_limit')::integer, v_sub, true);
    when 'mark_match_room_read' then
      return ironclad_private.mark_match_room_read((p_arguments->>'p_room_id')::uuid,
        (p_arguments->>'p_through_sequence')::bigint, v_sub, true);
    when 'send_admin_match_room_message' then
      return ironclad_private.send_match_room_message((p_arguments->>'p_match_id')::uuid,
        (p_arguments->>'p_expected_room_id')::uuid, (p_arguments->>'p_client_message_id')::uuid,
        p_arguments->>'p_body', v_sub, true);
    when 'get_match_dice_rolloff' then
      return ironclad_private.get_match_dice_rolloff((p_arguments->>'p_match_id')::uuid, v_sub, true);
  end case;
end;
$$;
alter function public.call_patch2_match_staff(text, jsonb, text) owner to postgres;
revoke all on function public.call_patch2_match_staff(text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.call_patch2_match_staff(text, jsonb, text) to service_role;

-- Keep the existing private assistance gateway and operation set. Only the
-- two legacy room operations need the explicit authorization used above.
create or replace function public.call_patch2_private_assistance(
  p_operation text, p_arguments jsonb, p_actor_clerk_user_id text, p_actor_is_admin boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_sub text := nullif(btrim(p_actor_clerk_user_id), '');
  v_keys text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  if p_actor_is_admin then
    if public.get_patch2_admin_account_state(v_sub) is distinct from 'verified-active-player' then
      raise exception 'Account access is unavailable' using errcode = '42501';
    end if;
  elsif ironclad_private.patch2_account_state(v_sub) is distinct from 'active-player' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;

  if p_operation not in ('get_match_room_assistance', 'resolve_match_room_assistance') or p_operation is null then
    return ironclad_private.call_patch2_private_assistance(p_operation, p_arguments, p_actor_clerk_user_id, p_actor_is_admin);
  end if;
  v_keys := case p_operation
    when 'get_match_room_assistance' then array['p_room_id']
    else array['p_room_id','p_expected_request_version']
  end;
  if length(v_sub) > 255 or p_actor_is_admin is null or jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& v_keys) or p_arguments - v_keys <> '{}'::jsonb then
    raise exception 'Invalid assistance operation input' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_profile_notice(v_sub);
  perform ironclad_private.lock_open_match_room_actor(v_sub);
  if p_operation = 'get_match_room_assistance' then
    return ironclad_private.get_match_room_assistance((p_arguments->>'p_room_id')::uuid, v_sub, p_actor_is_admin);
  end if;
  if not p_actor_is_admin then raise exception 'Admin required' using errcode = '42501'; end if;
  return ironclad_private.resolve_match_room_assistance((p_arguments->>'p_room_id')::uuid,
    (p_arguments->>'p_expected_request_version')::bigint, v_sub);
end;
$$;

alter function ironclad_private.require_match_account_legal_acceptance(text) owner to postgres;
alter function ironclad_private.lock_open_match_room_actor(text) owner to postgres;
alter function ironclad_private.match_room_access(uuid, text, boolean) owner to postgres;
alter function ironclad_private.resolve_match_room(uuid, text, boolean) owner to postgres;
alter function ironclad_private.get_match_room_history(uuid, bigint, integer, text, boolean) owner to postgres;
alter function ironclad_private.get_match_room_earlier_history(uuid, bigint, integer, text, boolean) owner to postgres;
alter function ironclad_private.mark_match_room_read(uuid, bigint, text, boolean) owner to postgres;
alter function ironclad_private.send_match_room_message(uuid, uuid, uuid, text, text, boolean) owner to postgres;
alter function ironclad_private.get_match_dice_rolloff(uuid, text, boolean) owner to postgres;
alter function ironclad_private.match_room_assistance_projection(uuid, boolean) owner to postgres;
alter function ironclad_private.get_match_room_assistance(uuid, text, boolean) owner to postgres;
alter function ironclad_private.resolve_match_room_assistance(uuid, bigint, text) owner to postgres;
alter function ironclad_private.require_match_profile_notice(text) owner to postgres;
revoke all on function ironclad_private.require_match_account_legal_acceptance(text),
  ironclad_private.lock_open_match_room_actor(text), ironclad_private.match_room_access(uuid, text, boolean),
  ironclad_private.resolve_match_room(uuid, text, boolean),
  ironclad_private.get_match_room_history(uuid, bigint, integer, text, boolean),
  ironclad_private.get_match_room_earlier_history(uuid, bigint, integer, text, boolean),
  ironclad_private.mark_match_room_read(uuid, bigint, text, boolean),
  ironclad_private.send_match_room_message(uuid, uuid, uuid, text, text, boolean),
  ironclad_private.get_match_dice_rolloff(uuid, text, boolean),
  ironclad_private.match_room_assistance_projection(uuid, boolean),
  ironclad_private.get_match_room_assistance(uuid, text, boolean),
  ironclad_private.resolve_match_room_assistance(uuid, bigint, text),
  ironclad_private.require_match_profile_notice(text) from public, anon, authenticated, service_role;

-- Retire shared topics. Realtime caches a joined channel's permissions, so
-- authorize joins and independently choose active participant recipients when
-- emitting. No new signals reach the old shared topic or a closed subject.
create function ironclad_private.match_room_realtime_topic(p_room_id uuid, p_generation bigint, p_subject text)
returns text language sql immutable strict set search_path = pg_catalog
as $$
  select 'match-room:v2:' || p_room_id::text || ':' || p_generation::text || ':' ||
    encode(sha256(convert_to(p_subject, 'UTF8')), 'hex');
$$;
revoke all on function ironclad_private.match_room_realtime_topic(uuid, bigint, text)
  from public, anon, authenticated, service_role;

create or replace function ironclad_private.can_receive_match_room_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(
    auth.jwt() ->> 'role' = 'authenticated'
    and ironclad_private.patch2_account_state(auth.jwt() ->> 'sub') = 'active-player'
    and public.get_match_room_enabled()
    and exists (
      select 1 from public.match_rooms room
      join public.tournament_matches m on m.id = room.match_id
      join public.generated_brackets g on g.id = m.generated_bracket_id
      join public.tournament_brackets b on b.id = g.tournament_bracket_id
      join public.tournaments t on t.id = b.tournament_id
      where room.id = case
          when split_part(p_topic, ':', 3) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
          then split_part(p_topic, ':', 3)::uuid
        end
        and p_topic = ironclad_private.match_room_realtime_topic(room.id, room.communication_generation, auth.jwt() ->> 'sub')
        and room.closed_at is null and room.content_purged_at is null
        and room.communication_generation = m.communication_generation
        and room.player_one_registration_id = m.player_one_registration_id
        and room.player_two_registration_id = m.player_two_registration_id
        and room.player_one_registration_id <> room.player_two_registration_id
        and b.launched_at is not null and t.status = 'in_progress'
        and m.status in ('scheduled', 'in_progress', 'pending_review') and m.outcome_type is null
        and ((g.format = 'single_elimination' and m.activation_version > 0) or g.format = 'round_robin')
        and not exists (select 1 from public.tournament_division_not_held_closures c
          where c.tournament_bracket_id = b.id)
        and (select count(*) = 2 from public.registrations r
          where r.id in (room.player_one_registration_id, room.player_two_registration_id)
            and r.tournament_id = t.id and r.tournament_bracket_id = b.id)
        and exists (select 1 from public.registrations r
          where r.id in (room.player_one_registration_id, room.player_two_registration_id)
            and r.clerk_user_id = auth.jwt() ->> 'sub')
    ), false);
$$;

create or replace function ironclad_private.broadcast_match_room_invalidation(p_room public.match_rooms)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_subject text;
  v_notice_version text;
begin
  -- A fresh recipient snapshot and a shared closure lock are both required.
  -- Lifecycle triggers may already hold a match row lock, so skip this
  -- optional signal rather than wait or use a repeatable-read snapshot.
  if current_setting('transaction_isolation') in ('repeatable read', 'serializable')
    or not pg_try_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0)) then
    return;
  end if;

  -- Existing sockets can also outlive a notice-policy change. Use the same
  -- receipt check as Realtime RLS, with the settings row stable until commit.
  perform 1 from public.platform_settings where key = 'public_gaming_profile_notice' for share nowait;
  v_notice_version := ironclad_private.public_gaming_profile_notice_version();

  for v_subject in
    select distinct r.clerk_user_id from public.registrations r
    where r.id in (p_room.player_one_registration_id, p_room.player_two_registration_id)
      and ironclad_private.patch2_account_state(r.clerk_user_id) = 'active-player'
      and (v_notice_version is null or ironclad_private.public_gaming_profile_notice_satisfied(r.clerk_user_id, v_notice_version))
  loop
    perform realtime.send(
      jsonb_build_object('roomId', p_room.id, 'communicationGeneration', p_room.communication_generation),
      'invalidate', ironclad_private.match_room_realtime_topic(p_room.id, p_room.communication_generation, v_subject), true);
  end loop;
exception when others then
  -- Transport failure must not prevent an authorized write. Polling remains active.
  raise warning 'Match Room invalidation unavailable; polling remains active';
end;
$$;

comment on function ironclad_private.can_receive_match_room_realtime(text) is
  'Participant-only invalidations. Staff without a room registration use guarded polling.';

notify pgrst, 'reload schema';
commit;
