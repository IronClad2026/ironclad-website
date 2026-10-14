-- Production forward reconciliation from verified base 0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1.
-- Approved feature semantics inspected at 17979c40c7e9bee154dbc9c9a98bcbb9b36152cb.
-- Add receive-only private invalidation; preserve existing Production room/privacy/retention APIs and polling fallback.
-- No application rows, fixture identities, legal authority or provider settings are imported.
-- Transactional migration: replay only through a version/checksum-aware migration runner.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Realtime transports an invalidation only. Existing RPCs remain the sole
-- authority for message content, membership, read cursors and all mutations.
-- Never publish match_messages or grant access to its private rows.
create function ironclad_private.can_receive_match_room_realtime(p_topic text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(
    auth.jwt() ->> 'role' = 'authenticated'
    and nullif(btrim(auth.jwt() ->> 'sub'), '') is not null
    and public.get_match_room_enabled()
    and exists (select 1 from public.players p
      where p.clerk_user_id = auth.jwt() ->> 'sub' and p.account_closed_at is null)
    and exists (
      select 1 from public.match_rooms room
      join public.tournament_matches m on m.id = room.match_id
      join public.generated_brackets g on g.id = m.generated_bracket_id
      join public.tournament_brackets b on b.id = g.tournament_bracket_id
      join public.tournaments t on t.id = b.tournament_id
      where p_topic = 'match-room:' || room.id::text || ':' || room.communication_generation::text
        and room.id::text = split_part(p_topic, ':', 2)
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
        and (coalesce(auth.jwt() -> 'metadata' ->> 'role', '') = 'admin'
          or exists (select 1 from public.registrations r
            where r.id in (room.player_one_registration_id, room.player_two_registration_id)
              and r.clerk_user_id = auth.jwt() ->> 'sub'))
    ), false);
$$;
revoke all on function ironclad_private.can_receive_match_room_realtime(text)
  from public, anon, authenticated, service_role;
grant execute on function ironclad_private.can_receive_match_room_realtime(text) to authenticated;

-- Supabase owns this schema. Only supported realtime.messages policies are
-- added; no platform table/function/grant is changed. There is no client-send
-- policy, and the restrictive guards preserve this boundary if another feature
-- later adds a broader permissive policy. A topic claim alone is never proof.
create policy match_room_receive_invalidation on realtime.messages
for select to authenticated using (
  extension = 'broadcast'
  and topic = (select realtime.topic())
  and (select ironclad_private.can_receive_match_room_realtime(realtime.topic()))
);
create policy match_room_receive_guard on realtime.messages as restrictive
for select to authenticated using (
  (topic not like 'match-room:%' and coalesce((select realtime.topic()), '') not like 'match-room:%')
  or (extension = 'broadcast' and topic = (select realtime.topic())
    and (select ironclad_private.can_receive_match_room_realtime(realtime.topic())))
);
create policy match_room_no_client_broadcast on realtime.messages as restrictive
for insert to authenticated with check (
  topic not like 'match-room:%'
  and coalesce((select realtime.topic()), '') not like 'match-room:%'
);

create function ironclad_private.broadcast_match_room_invalidation(p_room public.match_rooms)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
begin
  -- realtime.send writes its platform outbox in THIS transaction. Rollback
  -- removes the event, and Realtime reads it only after commit. It may append
  -- its random transport id; no sender, recipient, body or profile is supplied.
  perform realtime.send(
    jsonb_build_object('roomId', p_room.id, 'communicationGeneration', p_room.communication_generation),
    'invalidate', 'match-room:' || p_room.id::text || ':' || p_room.communication_generation::text, true);
exception when others then
  -- Transport failure must never make the trusted send/lifecycle RPC unusable.
  -- Polling and reconnect catch-up remain authoritative. Do not log row data.
  raise warning 'Match Room invalidation unavailable; polling remains active';
end;
$$;

create function ironclad_private.notify_match_room_realtime()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype;
begin
  select room.* into v_room from public.match_rooms room
  join public.tournament_matches m on m.id = room.match_id
  where room.id = new.room_id and room.communication_generation = m.communication_generation
    and room.player_one_registration_id = m.player_one_registration_id
    and room.player_two_registration_id = m.player_two_registration_id;
  if found then perform ironclad_private.broadcast_match_room_invalidation(v_room); end if;
  return null;
end;
$$;
create trigger match_messages_realtime_invalidation after insert on public.match_messages
for each row execute function ironclad_private.notify_match_room_realtime();
create trigger match_assistance_realtime_invalidation after insert or update of status, request_version
on public.match_room_assistance for each row execute function ironclad_private.notify_match_room_realtime();

create function ironclad_private.notify_match_room_realtime_closure()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  -- A final invalidation of the OLD immutable room causes existing clients to
  -- resynchronize and unsubscribe on reset/reassignment. Never send a new
  -- generation's identity on an old topic, even while Realtime caches auth.
  if old.closed_at is null and new.closed_at is not null then
    perform ironclad_private.broadcast_match_room_invalidation(old);
  end if;
  return null;
end;
$$;
create trigger match_room_realtime_closure after update of closed_at on public.match_rooms
for each row execute function ironclad_private.notify_match_room_realtime_closure();

create function ironclad_private.notify_match_lifecycle_realtime()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype;
begin
  if row(old.status, old.outcome_type) is distinct from row(new.status, new.outcome_type) then
    for v_room in select * from public.match_rooms
      where match_id = new.id and communication_generation = new.communication_generation and closed_at is null
    loop perform ironclad_private.broadcast_match_room_invalidation(v_room); end loop;
  end if;
  return null;
end;
$$;
create trigger match_lifecycle_realtime_invalidation after update of status, outcome_type on public.tournament_matches
for each row execute function ironclad_private.notify_match_lifecycle_realtime();

create function ironclad_private.notify_match_room_switch_realtime()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare v_room public.match_rooms%rowtype;
begin
  if old.key = 'match_room' and old.value is distinct from new.value then
    for v_room in select room.* from public.match_rooms room
      join public.tournament_matches m on m.id = room.match_id
      where room.closed_at is null and room.communication_generation = m.communication_generation
    loop perform ironclad_private.broadcast_match_room_invalidation(v_room); end loop;
  end if;
  return null;
end;
$$;
create trigger match_room_switch_realtime_invalidation after update of value on public.platform_settings
for each row execute function ironclad_private.notify_match_room_switch_realtime();

revoke all on function ironclad_private.broadcast_match_room_invalidation(public.match_rooms),
  ironclad_private.notify_match_room_realtime(), ironclad_private.notify_match_room_realtime_closure(),
  ironclad_private.notify_match_lifecycle_realtime(), ironclad_private.notify_match_room_switch_realtime()
  from public, anon, authenticated, service_role;
comment on function ironclad_private.can_receive_match_room_realtime(text) is
  'P03.1 private receive-only current Match Room authorization; content remains behind existing RPCs.';
commit;
