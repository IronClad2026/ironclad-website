begin;

-- Communication-only metadata. The additive default does not rewrite any
-- scores, results, deadlines, holds, pairings, or tournament business facts.
alter table public.tournament_matches
  add column communication_generation bigint not null default 1
  check (communication_generation between 1 and 9007199254740991);

-- Competition UUIDs below are provenance, deliberately not cascading FKs.
-- Account closure and safe draft deletion retain their existing semantics.
create table public.match_rooms (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  room_revision bigint not null check (room_revision between 1 and 9007199254740991),
  communication_generation bigint not null,
  activation_version_snapshot integer not null check (activation_version_snapshot >= 0),
  player_one_registration_id uuid not null,
  player_two_registration_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  closure_reason text,
  last_sequence bigint not null default 0 check (last_sequence between 0 and 9007199254740991),
  constraint match_rooms_distinct_members check (player_one_registration_id <> player_two_registration_id),
  constraint match_rooms_revision_generation check (room_revision = communication_generation),
  constraint match_rooms_closure check (
    (closed_at is null and closure_reason is null) or
    (closed_at is not null and closure_reason in ('lifecycle_changed', 'match_completed', 'tournament_closed', 'match_unavailable'))
  ),
  unique (match_id, communication_generation)
);
create unique index match_rooms_one_open on public.match_rooms(match_id) where closed_at is null;
create index match_rooms_member_one on public.match_rooms(player_one_registration_id, created_at desc);
create index match_rooms_member_two on public.match_rooms(player_two_registration_id, created_at desc);

create table public.match_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.match_rooms(id) on delete restrict,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  sender_kind text not null check (sender_kind in ('player', 'admin')),
  sender_registration_id uuid,
  actor_clerk_user_id text,
  client_message_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  constraint match_messages_sender check (
    (sender_kind = 'player' and sender_registration_id is not null) or
    (sender_kind = 'admin' and sender_registration_id is null)
  ),
  unique (room_id, sequence),
  unique (room_id, actor_clerk_user_id, client_message_id)
);
create index match_messages_sender_rate on public.match_messages(room_id, actor_clerk_user_id, created_at desc);
create index match_messages_actor_cleanup on public.match_messages(actor_clerk_user_id) where actor_clerk_user_id is not null;

create table public.match_room_reads (
  room_id uuid not null references public.match_rooms(id) on delete restrict,
  viewer_clerk_user_id text not null,
  last_read_sequence bigint not null default 0 check (last_read_sequence between 0 and 9007199254740991),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (room_id, viewer_clerk_user_id)
);
create index match_room_reads_viewer on public.match_room_reads(viewer_clerk_user_id);

alter table public.match_rooms enable row level security;
alter table public.match_rooms force row level security;
alter table public.match_messages enable row level security;
alter table public.match_messages force row level security;
alter table public.match_room_reads enable row level security;
alter table public.match_room_reads force row level security;
revoke all on public.match_rooms, public.match_messages, public.match_room_reads from public, anon, authenticated, service_role;
-- No RLS policies or browser table grants: only the explicit RPC projections.

create function ironclad_private.protect_match_room_record()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if row(new.id, new.match_id, new.room_revision, new.communication_generation,
    new.activation_version_snapshot, new.player_one_registration_id,
    new.player_two_registration_id, new.created_at)
    is distinct from row(old.id, old.match_id, old.room_revision, old.communication_generation,
    old.activation_version_snapshot, old.player_one_registration_id,
    old.player_two_registration_id, old.created_at)
    or new.last_sequence < old.last_sequence
    or (old.closed_at is not null and row(new.closed_at, new.closure_reason)
      is distinct from row(old.closed_at, old.closure_reason)) then
    raise exception 'Match Room identity and history are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger match_rooms_protect_record before update on public.match_rooms
for each row execute function ironclad_private.protect_match_room_record();

create function ironclad_private.protect_match_message_record()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  -- The only update is removal of direct actor attribution by account closure.
  if row(new.id, new.room_id, new.sequence, new.sender_kind, new.sender_registration_id,
    new.client_message_id, new.body, new.created_at)
    is distinct from row(old.id, old.room_id, old.sequence, old.sender_kind, old.sender_registration_id,
    old.client_message_id, old.body, old.created_at)
    or new.actor_clerk_user_id is not null
    or coalesce(current_setting('ironclad.match_room_account_closure', true), '') <> 'on' then
    raise exception 'Match Room messages are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger match_messages_protect_record before update on public.match_messages
for each row execute function ironclad_private.protect_match_message_record();

-- The trigger records participant transitions even when no room is visited
-- between A/B -> A/C -> A/B. A failure aborts the pairing transaction.
create function ironclad_private.advance_match_communication_generation()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if row(new.player_one_registration_id, new.player_two_registration_id)
    is distinct from row(old.player_one_registration_id, old.player_two_registration_id) then
    new.communication_generation := old.communication_generation + 1;
  elsif new.communication_generation is distinct from old.communication_generation
    and new.communication_generation <> old.communication_generation + 1 then
    raise exception 'Invalid Match communication generation' using errcode = '22023';
  end if;
  if new.communication_generation is distinct from old.communication_generation then
    update public.match_rooms
    set closed_at = clock_timestamp(), closure_reason = 'lifecycle_changed'
    where match_id = old.id and closed_at is null;
  end if;
  return new;
end;
$$;
create trigger tournament_matches_communication_generation
before update of player_one_registration_id, player_two_registration_id, communication_generation
on public.tournament_matches for each row
execute function ironclad_private.advance_match_communication_generation();

-- Keep the existing competitive reset body intact. Only an actual Match reset
-- calls this wrapper; result/report reset and ordinary status transitions do not.
alter function public.admin_reset_tournament_match(uuid, text)
  rename to admin_reset_tournament_match_without_communication_generation;
revoke all on function public.admin_reset_tournament_match_without_communication_generation(uuid, text)
  from public, anon, authenticated, service_role;
create function public.admin_reset_tournament_match(p_match_id uuid, p_reset_by text)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform 1 from public.tournament_matches where id = p_match_id for update;
  perform public.admin_reset_tournament_match_without_communication_generation(p_match_id, p_reset_by);
  update public.tournament_matches
  set communication_generation = communication_generation + 1
  where id = p_match_id;
end;
$$;
alter function public.admin_reset_tournament_match(uuid, text) owner to postgres;
revoke all on function public.admin_reset_tournament_match(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_reset_tournament_match(uuid, text) to service_role;

create function ironclad_private.match_room_actor()
returns text language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := nullif(btrim(auth.jwt() ->> 'sub'), '');
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_sub is null then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  -- Shares the public closure wrapper's lock, before match/room locks. This
  -- prevents a send/read from racing attribution cleanup and Clerk deletion.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:' || v_sub, 0));
  if not exists (select 1 from public.players where clerk_user_id = v_sub and account_closed_at is null) then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  return v_sub;
end;
$$;

-- Reads the current competition authority without changing it. Lock ordering
-- matches the authenticated dice command: Match, then tournament SHARE.
create function ironclad_private.match_room_context(p_match_id uuid)
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
  from public.tournaments where id = v_tournament_id for share;
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

create function ironclad_private.match_room_access(p_room_id uuid, p_sub text)
returns public.match_rooms language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype; v_context jsonb; v_reason text;
begin
  select * into v_room from public.match_rooms where id = p_room_id;
  if not found or (coalesce(auth.jwt() -> 'metadata' ->> 'role', '') <> 'admin'
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

create function ironclad_private.match_room_projection(p_room public.match_rooms, p_sub text)
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
    'writable', p_room.closed_at is null, 'lastSequence', p_room.last_sequence,
    'lastReadSequence', coalesce((select last_read_sequence from public.match_room_reads
      where room_id = p_room.id and viewer_clerk_user_id = p_sub), 0)
  );
$$;
create function ironclad_private.match_message_projection(p_message public.match_messages)
returns jsonb language sql immutable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object('id', p_message.id, 'roomId', p_message.room_id,
    'sequence', p_message.sequence, 'senderKind', p_message.sender_kind,
    'senderRegistrationId', p_message.sender_registration_id,
    'body', p_message.body, 'createdAt', p_message.created_at);
$$;

create function public.resolve_match_room(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_sub text := ironclad_private.match_room_actor(); v_context jsonb; v_room public.match_rooms%rowtype;
begin
  if p_match_id is null then raise exception 'Invalid Match Room request' using errcode = '22023'; end if;
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
    if not (v_context ->> 'eligible')::boolean or not (v_context ->> 'writable')::boolean then
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

create function public.get_match_room_history(p_room_id uuid, p_after_sequence bigint default 0, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype;
  v_messages jsonb; v_last bigint;
begin
  if p_room_id is null or p_after_sequence is null or p_after_sequence < 0
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid Match Room history request' using errcode = '22023';
  end if;
  v_room := ironclad_private.match_room_access(p_room_id, v_sub);
  if p_after_sequence > v_room.last_sequence then
    raise exception 'History cursor is ahead of the room' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(ironclad_private.match_message_projection(m::public.match_messages) order by m.sequence), '[]'::jsonb),
    coalesce(max(m.sequence), p_after_sequence) into v_messages, v_last
  from (select * from public.match_messages where room_id = p_room_id and sequence > p_after_sequence
    order by sequence limit p_limit) m;
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, v_sub),
    'messages', v_messages, 'hasMore', v_last < v_room.last_sequence, 'nextAfterSequence', v_last);
end;
$$;

create function ironclad_private.send_match_room_message(p_match_id uuid, p_expected_room_id uuid,
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
create function public.send_match_room_message(p_match_id uuid, p_expected_room_id uuid, p_client_message_id uuid, p_body text)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select ironclad_private.send_match_room_message(p_match_id, p_expected_room_id, p_client_message_id, p_body, false); $$;
create function public.send_admin_match_room_message(p_match_id uuid, p_expected_room_id uuid, p_client_message_id uuid, p_body text)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select ironclad_private.send_match_room_message(p_match_id, p_expected_room_id, p_client_message_id, p_body, true); $$;

create function public.mark_match_room_read(p_room_id uuid, p_through_sequence bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype; v_last bigint;
begin
  if p_room_id is null or p_through_sequence is null or p_through_sequence < 0 then
    raise exception 'Invalid Match Room read cursor' using errcode = '22023';
  end if;
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
  return jsonb_build_object('roomId', p_room_id, 'lastReadSequence', v_last);
end;
$$;

-- Serialize closure against every room operation by this identity. Preserve
-- the established closure chain, then erase direct communication attribution.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_match_rooms;
revoke all on function public.close_ironclad_player_account_without_match_rooms(text)
  from public, anon, authenticated, service_role;
create function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := nullif(btrim(p_clerk_user_id), ''); v_result jsonb;
  v_previous text := current_setting('ironclad.match_room_account_closure', true);
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary' using errcode = '42501';
  end if;
  if v_sub is null then raise exception 'Authenticated account identity is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:' || v_sub, 0));
  v_result := public.close_ironclad_player_account_without_match_rooms(v_sub);
  delete from public.match_room_reads where viewer_clerk_user_id = v_sub;
  perform set_config('ironclad.match_room_account_closure', 'on', true);
  update public.match_messages set actor_clerk_user_id = null where actor_clerk_user_id = v_sub;
  perform set_config('ironclad.match_room_account_closure', coalesce(v_previous, ''), true);
  return v_result;
end;
$$;
alter function public.close_ironclad_player_account(text) owner to postgres;
revoke all on function public.close_ironclad_player_account(text) from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text) to service_role;

-- Helpers are owner-only, including lifecycle and privacy hooks.
alter function ironclad_private.protect_match_room_record() owner to postgres;
alter function ironclad_private.protect_match_message_record() owner to postgres;
alter function ironclad_private.advance_match_communication_generation() owner to postgres;
alter function ironclad_private.match_room_actor() owner to postgres;
alter function ironclad_private.match_room_context(uuid) owner to postgres;
alter function ironclad_private.match_room_access(uuid, text) owner to postgres;
alter function ironclad_private.match_room_projection(public.match_rooms, text) owner to postgres;
alter function ironclad_private.match_message_projection(public.match_messages) owner to postgres;
alter function ironclad_private.send_match_room_message(uuid, uuid, uuid, text, boolean) owner to postgres;
revoke all on function ironclad_private.protect_match_room_record(),
  ironclad_private.protect_match_message_record(), ironclad_private.advance_match_communication_generation(),
  ironclad_private.match_room_actor(), ironclad_private.match_room_context(uuid),
  ironclad_private.match_room_access(uuid, text), ironclad_private.match_room_projection(public.match_rooms, text),
  ironclad_private.match_message_projection(public.match_messages),
  ironclad_private.send_match_room_message(uuid, uuid, uuid, text, boolean)
from public, anon, authenticated, service_role;
alter function public.resolve_match_room(uuid) owner to postgres;
alter function public.get_match_room_history(uuid, bigint, integer) owner to postgres;
alter function public.send_match_room_message(uuid, uuid, uuid, text) owner to postgres;
alter function public.send_admin_match_room_message(uuid, uuid, uuid, text) owner to postgres;
alter function public.mark_match_room_read(uuid, bigint) owner to postgres;
revoke all on function public.resolve_match_room(uuid), public.get_match_room_history(uuid, bigint, integer),
  public.send_match_room_message(uuid, uuid, uuid, text), public.send_admin_match_room_message(uuid, uuid, uuid, text),
  public.mark_match_room_read(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.resolve_match_room(uuid), public.get_match_room_history(uuid, bigint, integer),
  public.send_match_room_message(uuid, uuid, uuid, text), public.send_admin_match_room_message(uuid, uuid, uuid, text),
  public.mark_match_room_read(uuid, bigint) to authenticated;

comment on column public.tournament_matches.communication_generation is
  'Private communication provenance only; advances atomically on participant changes and actual Match resets. Not a competition or result version.';
comment on table public.match_rooms is
  'RPC-only immutable historical membership. Competition UUIDs are provenance without cascading foreign keys. Current authority is checked on every operation.';
comment on table public.match_messages is
  'Private plain text. Never select into public projections, analytics, notification payloads or logs. Account closure removes direct Clerk attribution; body retention requires explicit reviewed maintenance.';
comment on table public.match_room_reads is
  'Private actor-scoped monotonic read cursor, not public read receipts. Removed on account closure.';

commit;