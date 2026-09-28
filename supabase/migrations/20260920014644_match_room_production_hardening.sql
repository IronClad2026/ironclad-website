begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Explicitly opt in only after release approval. Existing settings are preserved.
insert into public.platform_settings(key, value)
values ('match_room', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create function public.get_match_room_enabled()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce((select value -> 'enabled' = 'true'::jsonb
    from public.platform_settings where key = 'match_room'), false);
$$;

-- The server action repeats Clerk-admin authorization before entering this
-- service-only boundary. The row UPDATE also serializes direct trusted setting
-- changes with the FOR SHARE mutation gate below; no application cache is authority.
create function public.set_match_room_enabled(p_enabled boolean, p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Match Room setting requires the trusted server boundary' using errcode = '42501';
  end if;
  if p_enabled is null or v_actor is null or char_length(v_actor) > 256 then
    raise exception 'Invalid Match Room setting' using errcode = '22023';
  end if;
  insert into public.platform_settings(key, value, updated_by_clerk_user_id)
  values ('match_room', jsonb_build_object('enabled', p_enabled), v_actor)
  on conflict(key) do update set value = excluded.value,
    updated_by_clerk_user_id = excluded.updated_by_clerk_user_id;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

create function ironclad_private.match_room_writes_enabled()
returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare v_enabled boolean;
begin
  -- Held through transaction end: disable cannot complete ahead of an admitted
  -- write. A missing/malformed row is disabled and cannot admit any new state.
  select value -> 'enabled' = 'true'::jsonb into v_enabled
  from public.platform_settings where key = 'match_room' for share;
  return coalesce(v_enabled, false);
end;
$$;

create function ironclad_private.require_match_room_enabled()
returns void language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not ironclad_private.match_room_writes_enabled() then
    raise exception 'MATCH_ROOM_DISABLED' using errcode = 'P0001';
  end if;
end;
$$;

-- Keep Match -> Tournament -> Room, used by every communication access path.
-- Not Held takes Tournament -> Match, while an official-result transaction can
-- hold Match before its deferred settlement takes Tournament UPDATE. Reversing
-- this routine therefore merely exchanges one wait cycle for another. Never
-- wait for the upstream Tournament lock: 55P03 aborts the complete room RPC,
-- leaves competition untouched, and permits retry with the same message key.


create or replace function ironclad_private.match_room_context(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_bracket_id uuid;
  v_format text;
  v_launched_at timestamptz;
  v_status text;
  v_terminal_at timestamptz;
  v_eligible boolean;
  v_reason text;
  v_closed_at timestamptz;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then return null; end if;
  select b.tournament_id, b.id, g.format, b.launched_at
  into v_tournament_id, v_bracket_id, v_format, v_launched_at
  from public.generated_brackets g join public.tournament_brackets b on b.id = g.tournament_bracket_id
  where g.id = v_match.generated_bracket_id;
  select status, terminal_at into v_status, v_terminal_at
  from public.tournaments where id = v_tournament_id for share nowait;
  v_eligible := v_launched_at is not null
    and v_match.player_one_registration_id is not null
    and v_match.player_two_registration_id is not null
    and v_match.player_one_registration_id <> v_match.player_two_registration_id
    and ((v_format = 'single_elimination' and v_match.activation_version > 0) or v_format = 'round_robin')
    and not exists (select 1 from public.tournament_division_not_held_closures where tournament_bracket_id = v_bracket_id)
    and (select count(*) = 2 from public.registrations r
      where r.id in (v_match.player_one_registration_id, v_match.player_two_registration_id)
        and r.tournament_id = v_tournament_id and r.tournament_bracket_id = v_bracket_id);
  if not coalesce(v_eligible, false) or v_match.outcome_type in ('automatic_bye', 'empty_feeder') then
    v_reason := 'match_unavailable';
  elsif v_status in ('completed', 'cancelled', 'voided') then
    v_reason := 'tournament_closed';
  elsif v_match.status = 'completed' then
    v_reason := 'match_completed';
  elsif v_status is distinct from 'in_progress'
    or v_match.status not in ('scheduled', 'in_progress', 'pending_review')
    or v_match.outcome_type is not null then
    v_reason := 'match_unavailable';
  end if;
  if v_reason is not null then
    v_closed_at := coalesce(v_terminal_at, v_match.official_result_decided_at,
      v_match.deadline_ruled_at, v_match.updated_at, clock_timestamp());
  end if;
  return jsonb_build_object(
    'generation', v_match.communication_generation, 'activation', v_match.activation_version,
    'playerOne', v_match.player_one_registration_id, 'playerTwo', v_match.player_two_registration_id,
    'eligible', coalesce(v_eligible, false), 'writable', v_reason is null,
    'closureReason', v_reason, 'closedAt', v_closed_at
  );
end;
$$;

create or replace function ironclad_private.match_room_projection(p_room public.match_rooms, p_sub text)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_room.id, 'matchId', p_room.match_id, 'roomRevision', p_room.room_revision,
    'communicationGeneration', p_room.communication_generation,
    'activationVersionSnapshot', p_room.activation_version_snapshot,
    'playerOneRegistrationId', p_room.player_one_registration_id,
    'playerTwoRegistrationId', p_room.player_two_registration_id,
    'viewerRegistrationId', (select r.id from public.registrations r
      where r.id in (p_room.player_one_registration_id, p_room.player_two_registration_id)
        and r.clerk_user_id = p_sub order by r.id limit 1),
    'createdAt', p_room.created_at, 'closedAt', p_room.closed_at, 'closureReason', p_room.closure_reason,
    'writable', p_room.closed_at is null and public.get_match_room_enabled(), 'lastSequence', p_room.last_sequence,
    'lastReadSequence', coalesce((select last_read_sequence from public.match_room_reads
      where room_id = p_room.id and viewer_clerk_user_id = p_sub), 0)
  );
$$;

create or replace function public.resolve_match_room(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_sub text := ironclad_private.match_room_actor(); v_context jsonb; v_room public.match_rooms%rowtype; v_enabled boolean;
begin
  if p_match_id is null then raise exception 'Invalid Match Room request' using errcode = '22023'; end if;
  v_enabled := ironclad_private.match_room_writes_enabled();
  v_context := ironclad_private.match_room_context(p_match_id);
  if v_context is null or (coalesce(auth.jwt() -> 'metadata' ->> 'role', '') <> 'admin'
    and not exists (select 1 from public.registrations r
      where r.id in ((v_context ->> 'playerOne')::uuid, (v_context ->> 'playerTwo')::uuid)
        and r.clerk_user_id = v_sub)) then
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
  v_room := ironclad_private.match_room_access(v_room.id, v_sub);
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, v_sub));
end;
$$;

create or replace function ironclad_private.send_match_room_message(p_match_id uuid, p_expected_room_id uuid,
  p_client_message_id uuid, p_body text, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype;
  v_message public.match_messages%rowtype; v_registration_id uuid; v_now timestamptz;
  v_blank_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_match_id is null or p_expected_room_id is null or p_client_message_id is null
    or p_body is null or char_length(p_body) not between 1 and 1000
    or btrim(p_body, v_blank_chars) = '' then
    raise exception 'Invalid Match Room message' using errcode = '22023';
  end if;
  if p_admin and coalesce(auth.jwt() -> 'metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  perform ironclad_private.require_match_room_enabled();
  v_room := ironclad_private.match_room_access(p_expected_room_id, v_sub);
  if v_room.match_id <> p_match_id then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  if not p_admin then
    select r.id into v_registration_id from public.registrations r
    where r.id in (v_room.player_one_registration_id, v_room.player_two_registration_id)
      and r.clerk_user_id = v_sub order by r.id limit 1;
    if v_registration_id is null then raise exception 'Match Room unavailable' using errcode = '42501'; end if;
  end if;
  -- Stale commands never receive historical content through the write endpoint.
  if not exists (select 1 from public.tournament_matches m where m.id = p_match_id
    and m.communication_generation = v_room.communication_generation
    and m.player_one_registration_id = v_room.player_one_registration_id
    and m.player_two_registration_id = v_room.player_two_registration_id) then
    raise exception 'The Match Room changed; refresh and try again' using errcode = '40001';
  end if;
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into v_message from public.match_messages
  where room_id = v_room.id and actor_clerk_user_id = v_sub and client_message_id = p_client_message_id;
  if found then
    if v_message.body <> p_body or v_message.sender_kind <> (case when p_admin then 'admin' else 'player' end) then
      raise exception 'The message key has already been used' using errcode = '23505';
    end if;
    return jsonb_build_object('message', ironclad_private.match_message_projection(v_message), 'duplicate', true);
  end if;
  if v_room.closed_at is not null then
    raise exception 'Match Room is read-only' using errcode = '55000';
  end if;
  v_now := clock_timestamp();
  if (select count(*) from public.match_messages where room_id = v_room.id
    and actor_clerk_user_id = v_sub and created_at > v_now - interval '1 minute') >= 15 then
    raise exception 'MATCH_ROOM_RATE_LIMITED' using errcode = 'P0001';
  end if;
  update public.match_rooms set last_sequence = last_sequence + 1
  where id = v_room.id returning * into v_room;
  insert into public.match_messages(room_id, sequence, sender_kind, sender_registration_id,
    actor_clerk_user_id, client_message_id, body, created_at)
  values(v_room.id, v_room.last_sequence, case when p_admin then 'admin' else 'player' end,
    v_registration_id, v_sub, p_client_message_id, p_body, v_now) returning * into v_message;
  return jsonb_build_object('message', ironclad_private.match_message_projection(v_message), 'duplicate', false);
end;
$$;

create or replace function public.request_match_room_assistance(p_room_id uuid, p_expected_request_version bigint default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype;
  v_state public.match_room_assistance%rowtype; v_registration_id uuid; v_version bigint;
  v_tournament_id uuid; v_title text; v_notification_id uuid;
begin
  if p_room_id is null or p_expected_request_version is null or p_expected_request_version not between 0 and 9007199254740991 then
    raise exception 'Invalid assistance request' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  v_room := ironclad_private.match_room_access(p_room_id, v_sub);
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into v_state from public.match_room_assistance where room_id = p_room_id for update;
  if v_state.status = 'requested' then
    return ironclad_private.match_room_assistance_projection(p_room_id);
  end if;
  if p_expected_request_version <> coalesce(v_state.request_version, 0) then
    raise exception 'Assistance request changed' using errcode = '40001';
  end if;
  v_version := coalesce(v_state.request_version, 0) + 1;
  select id into v_registration_id from public.registrations
  where id in (v_room.player_one_registration_id, v_room.player_two_registration_id) and clerk_user_id = v_sub;
  select r.tournament_id, t.title into v_tournament_id, v_title
  from public.registrations r join public.tournaments t on t.id = r.tournament_id
  where r.id = v_room.player_one_registration_id;
  insert into public.notifications(recipient_role, type, title, message,
    tournament_id, tournament_title, match_id, event_key, metadata)
  values('admin', 'match.admin_assistance_requested', 'Match Admin Assistance Requested',
    'A Match Room requires administrator assistance.', v_tournament_id, v_title, v_room.match_id,
    'match-room:' || p_room_id || ':assistance:' || v_version,
    jsonb_build_object('source', 'match_room_assistance', 'roomId', p_room_id, 'roomRevision', v_room.room_revision, 'requestVersion', v_version))
  returning id into v_notification_id;
  insert into public.match_room_assistance(room_id, status, request_version, requested_by_registration_id, notification_id)
  values(p_room_id, 'requested', v_version, v_registration_id, v_notification_id)
  on conflict(room_id) do update set status = 'requested', request_version = excluded.request_version,
    requested_by_registration_id = excluded.requested_by_registration_id,
    requested_at = clock_timestamp(), resolved_at = null, resolved_by_clerk_user_id = null,
    notification_id = excluded.notification_id;
  return ironclad_private.match_room_assistance_projection(p_room_id);
end;
$$;

create or replace function public.mark_match_room_read(p_room_id uuid, p_through_sequence bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype; v_last bigint; v_episode record;
begin
  if p_room_id is null or p_through_sequence is null or p_through_sequence < 0 then
    raise exception 'Invalid Match Room read cursor' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  v_room := ironclad_private.match_room_access(p_room_id, v_sub);
  if p_through_sequence > v_room.last_sequence then
    raise exception 'Read cursor is ahead of the room' using errcode = '22023';
  end if;
  insert into public.match_room_reads(room_id, viewer_clerk_user_id, last_read_sequence)
  values(p_room_id, v_sub, p_through_sequence)
  on conflict (room_id, viewer_clerk_user_id) do update
    set last_read_sequence = greatest(match_room_reads.last_read_sequence, excluded.last_read_sequence),
      updated_at = clock_timestamp()
  returning last_read_sequence into v_last;
  if v_last >= v_room.last_sequence then
    for v_episode in
      update public.match_room_notification_episodes e set resolved_at = clock_timestamp()
      where e.room_id = p_room_id and e.resolved_at is null and exists (
        select 1 from public.registrations r where r.id = e.recipient_registration_id and r.clerk_user_id = v_sub
      ) returning notification_id
    loop
      perform ironclad_private.finish_match_room_notification(v_episode.notification_id);
    end loop;
  end if;
  return jsonb_build_object('roomId', p_room_id, 'lastReadSequence', v_last);
end;
$$;

-- Existing historical reads, authorized assistance resolution, account closure,
-- reset/generation markers and the push worker deliberately remain available.
-- No competitive function body, trigger, result or lifecycle rule is replaced.
alter function public.get_match_room_enabled() owner to postgres;
alter function public.set_match_room_enabled(boolean, text) owner to postgres;
alter function ironclad_private.match_room_writes_enabled() owner to postgres;
alter function ironclad_private.require_match_room_enabled() owner to postgres;
revoke all on function public.get_match_room_enabled(), public.set_match_room_enabled(boolean, text),
  ironclad_private.match_room_writes_enabled(), ironclad_private.require_match_room_enabled()
  from public, anon, authenticated, service_role;
grant execute on function public.get_match_room_enabled() to authenticated, service_role;
grant execute on function public.set_match_room_enabled(boolean, text) to service_role;

-- CREATE OR REPLACE above preserves the existing owner and restricted ACLs.
notify pgrst, 'reload schema';
commit;
