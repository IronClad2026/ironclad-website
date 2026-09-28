begin;

-- Operational communication only. Competition rows and rules are unchanged.
create table public.match_room_notification_episodes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.match_rooms(id) on delete restrict,
  recipient_registration_id uuid not null,
  first_sequence bigint not null check (first_sequence between 1 and 9007199254740991),
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  check (resolved_at is null or resolved_at >= created_at)
);
create unique index match_room_notification_episodes_open
  on public.match_room_notification_episodes(room_id, recipient_registration_id)
  where resolved_at is null;
create index match_room_notification_episodes_recipient
  on public.match_room_notification_episodes(recipient_registration_id) where resolved_at is null;
create index match_room_notification_episodes_notification
  on public.match_room_notification_episodes(notification_id) where notification_id is not null;

create table public.match_room_assistance (
  room_id uuid primary key references public.match_rooms(id) on delete restrict,
  status text not null check (status in ('requested', 'resolved')),
  request_version bigint not null check (request_version between 1 and 9007199254740991),
  requested_by_registration_id uuid,
  requested_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by_clerk_user_id text,
  notification_id uuid references public.notifications(id) on delete set null,
  check ((status = 'requested' and resolved_at is null and resolved_by_clerk_user_id is null)
    or (status = 'resolved' and resolved_at is not null and resolved_at >= requested_at))
);
create index match_room_assistance_requested on public.match_room_assistance(requested_at, room_id)
  where status = 'requested';
create index match_room_assistance_notification on public.match_room_assistance(notification_id)
  where notification_id is not null;
create index match_room_assistance_resolver on public.match_room_assistance(resolved_by_clerk_user_id)
  where resolved_by_clerk_user_id is not null;
alter table public.match_room_notification_episodes enable row level security;
alter table public.match_room_notification_episodes force row level security;
alter table public.match_room_assistance enable row level security;
alter table public.match_room_assistance force row level security;
revoke all on public.match_room_notification_episodes, public.match_room_assistance
  from public, anon, authenticated, service_role;

-- All communication operations take the shared lock BEFORE actor/match locks.
-- Rare account closure takes the exclusive lock first, preventing recipient
-- notification races without opposite-sender actor-lock deadlocks.
create or replace function ironclad_private.match_room_actor()
returns text language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := nullif(btrim(auth.jwt() ->> 'sub'), '');
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_sub is null then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:' || v_sub, 0));
  if not exists (select 1 from public.players where clerk_user_id = v_sub and account_closed_at is null) then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  return v_sub;
end;
$$;

create function ironclad_private.notify_match_room_message()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_room public.match_rooms%rowtype; v_recipient record;
  v_episode_id uuid; v_notification_id uuid; v_tournament_id uuid; v_tournament_title text;
begin
  -- The send RPC already holds Match then Room locks; the insert is never
  -- reached on an idempotent retry. No network push delivery happens here.
  select * into strict v_room from public.match_rooms where id = new.room_id for update;
  select r.tournament_id, t.title into v_tournament_id, v_tournament_title
  from public.registrations r join public.tournaments t on t.id = r.tournament_id
  where r.id = v_room.player_one_registration_id;
  for v_recipient in
    select r.id, r.clerk_user_id from public.registrations r
    join public.players p on p.id = r.profile_id and p.clerk_user_id = r.clerk_user_id
    where r.id in (v_room.player_one_registration_id, v_room.player_two_registration_id)
      and p.account_closed_at is null
      and r.clerk_user_id is distinct from new.actor_clerk_user_id
    order by r.id
  loop
    -- A cursor may only resolve an episode by catching up to room.last_sequence.
    -- Bell read/dismiss state is deliberately absent from this decision.
    if not exists (select 1 from public.match_room_notification_episodes
      where room_id = new.room_id and recipient_registration_id = v_recipient.id and resolved_at is null) then
      v_episode_id := gen_random_uuid();
      insert into public.match_room_notification_episodes(id, room_id, recipient_registration_id, first_sequence)
      values(v_episode_id, new.room_id, v_recipient.id, new.sequence);
      insert into public.notifications (
        recipient_clerk_user_id, recipient_role, type, title, message,
        tournament_id, tournament_title, registration_id, match_id, event_key, metadata
      ) values (
        v_recipient.clerk_user_id, 'player', 'match.message_received',
        'New Match Room message', 'You have new messages in your Match Room.',
        v_tournament_id, v_tournament_title, v_recipient.id, v_room.match_id,
        'match-room:' || v_room.id || ':recipient:' || v_recipient.id || ':episode:' || v_episode_id,
        jsonb_build_object('roomId', v_room.id, 'roomRevision', v_room.room_revision, 'episodeId', v_episode_id)
      ) returning id into v_notification_id;
      update public.match_room_notification_episodes set notification_id = v_notification_id where id = v_episode_id;
    end if;
  end loop;
  return new;
end;
$$;
create trigger match_messages_notify_episode after insert on public.match_messages
for each row execute function ironclad_private.notify_match_room_message();

create function ironclad_private.finish_match_room_notification(p_notification_id uuid, p_hide boolean default false)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
begin
  update public.notifications set
    read_at = coalesce(read_at, clock_timestamp()),
    in_app_hidden_at = case when p_hide then coalesce(in_app_hidden_at, clock_timestamp()) else in_app_hidden_at end,
    push_delivery_status = case when push_delivery_status in ('pending','retryable_failure') then 'skipped' else push_delivery_status end,
    push_next_attempt_at = case when push_delivery_status in ('pending','retryable_failure') then null else push_next_attempt_at end,
    push_completed_at = case when push_delivery_status in ('pending','retryable_failure') then clock_timestamp() else push_completed_at end,
    push_last_error_code = case when push_delivery_status in ('pending','retryable_failure') then 'NO_LONGER_UNREAD' else push_last_error_code end
  where id = p_notification_id;
  -- An active processing claim is preserved. The existing worker rechecks
  -- read/hidden state and completes the claim normally, avoiding a cron failure.
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

create function public.get_match_room_earlier_history(p_room_id uuid, p_before_sequence bigint, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype;
  v_messages jsonb; v_first bigint; v_more boolean;
begin
  if p_room_id is null or p_before_sequence is null or p_before_sequence not between 1 and 9007199254740991
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid Match Room history request' using errcode = '22023';
  end if;
  v_room := ironclad_private.match_room_access(p_room_id, v_sub);
  if p_before_sequence > v_room.last_sequence + 1 then
    raise exception 'History cursor is ahead of the room' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(ironclad_private.match_message_projection(m::public.match_messages) order by m.sequence), '[]'::jsonb),
    coalesce(min(m.sequence), p_before_sequence) into v_messages, v_first
  from (select * from public.match_messages where room_id = p_room_id and sequence < p_before_sequence
    order by sequence desc limit p_limit) m;
  select exists(select 1 from public.match_messages where room_id = p_room_id and sequence < v_first) into v_more;
  return jsonb_build_object('room', ironclad_private.match_room_projection(v_room, v_sub),
    'messages', v_messages, 'hasMore', v_more, 'nextBeforeSequence', v_first);
end;
$$;

create function ironclad_private.match_room_assistance_projection(p_room_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'roomId', p_room_id, 'status', coalesce(a.status, 'none'),
    'requestVersion', coalesce(a.request_version, 0),
    'requestedAt', a.requested_at, 'resolvedAt', a.resolved_at,
    'canResolve', coalesce(a.status = 'requested', false) and coalesce(auth.jwt() -> 'metadata' ->> 'role', '') = 'admin'
  ) from (select 1) singleton left join public.match_room_assistance a on a.room_id = p_room_id;
$$;

create function public.get_match_room_assistance(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor();
begin
  if p_room_id is null then raise exception 'Invalid assistance request' using errcode = '22023'; end if;
  perform ironclad_private.match_room_access(p_room_id, v_sub);
  return ironclad_private.match_room_assistance_projection(p_room_id);
end;
$$;

create function public.request_match_room_assistance(p_room_id uuid, p_expected_request_version bigint default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_room public.match_rooms%rowtype;
  v_state public.match_room_assistance%rowtype; v_registration_id uuid; v_version bigint;
  v_tournament_id uuid; v_title text; v_notification_id uuid;
begin
  if p_room_id is null or p_expected_request_version is null or p_expected_request_version not between 0 and 9007199254740991 then
    raise exception 'Invalid assistance request' using errcode = '22023';
  end if;
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

create function public.resolve_match_room_assistance(p_room_id uuid, p_expected_request_version bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_state public.match_room_assistance%rowtype; v_notice record;
begin
  if coalesce(auth.jwt() -> 'metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  if p_room_id is null or p_expected_request_version is null or p_expected_request_version not between 1 and 9007199254740991 then
    raise exception 'Invalid assistance request' using errcode = '22023';
  end if;
  perform ironclad_private.match_room_access(p_room_id, v_sub);
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into v_state from public.match_room_assistance where room_id = p_room_id for update;
  if not found or v_state.request_version <> p_expected_request_version then
    raise exception 'Assistance request changed' using errcode = '40001';
  end if;
  if v_state.status = 'requested' then
    update public.match_room_assistance set status = 'resolved', resolved_at = clock_timestamp(),
      resolved_by_clerk_user_id = v_sub where room_id = p_room_id;
    -- Phase 2 allowed one notice per requester. Resolve all exact-room notices,
    -- including duplicates retained as historical evidence by the backfill.
    for v_notice in select id from public.notifications
      where type = 'match.admin_assistance_requested' and metadata ->> 'roomId' = p_room_id::text
        and match_id = (select match_id from public.match_rooms where id = p_room_id)
    loop
      perform ironclad_private.finish_match_room_notification(v_notice.id, true);
    end loop;
  end if;
  return ironclad_private.match_room_assistance_projection(p_room_id);
end;
$$;

create function public.list_match_room_assistance_requests(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_requests jsonb; v_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'Invalid assistance list limit' using errcode = '22023';
  end if;
  -- Count and page share one statement snapshot, including under concurrent
  -- resolution/reopening; an overflow remains explicit in totalCount.
  with requested as materialized (
    select * from public.match_room_assistance where status = 'requested'
  ), limited as (
    select * from requested order by requested_at, room_id limit p_limit
  ), projected as (
    select a.room_id, a.requested_at, jsonb_build_object(
      'roomId', a.room_id, 'matchId', r.match_id, 'tournamentId', reg.tournament_id,
      'tournamentTitle', coalesce(t.title, reg.tournament_title, 'Tournament'),
      'status', a.status, 'requestVersion', a.request_version, 'requestedAt', a.requested_at
    ) row_data
    from limited a join public.match_rooms r on r.id = a.room_id
    left join public.registrations reg on reg.id = r.player_one_registration_id
    left join public.tournaments t on t.id = reg.tournament_id
  )
  select (select count(*) from requested),
    coalesce((select jsonb_agg(row_data order by requested_at, room_id) from projected), '[]'::jsonb)
  into v_count, v_requests;
  return jsonb_build_object('requests', v_requests, 'totalCount', v_count);
end;
$$;

-- Preserve Phase 2 requests, including dismissed bell entries. One operational
-- state per immutable room, independent of the old per-requester event count.
insert into public.match_room_assistance(room_id, status, request_version, requested_by_registration_id, requested_at, notification_id)
select distinct on (r.id) r.id, 'requested', 1, n.registration_id, n.created_at, n.id
from public.notifications n join public.match_rooms r on r.id::text = n.metadata ->> 'roomId' and r.match_id = n.match_id
where n.type = 'match.admin_assistance_requested' and n.recipient_role = 'admin'
  and n.registration_id in (r.player_one_registration_id, r.player_two_registration_id)
order by r.id, n.created_at desc, n.id desc;

-- Reuse the existing account closure chain; only operational privacy state is
-- added. The global lock must be acquired before existing actor/row locks.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_room_episodes;
revoke all on function public.close_ironclad_player_account_without_room_episodes(text)
  from public, anon, authenticated, service_role;
create function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := nullif(btrim(p_clerk_user_id), ''); v_result jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary' using errcode = '42501';
  end if;
  if v_sub is null then raise exception 'Authenticated account identity is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0));
  update public.match_room_notification_episodes e set resolved_at = clock_timestamp()
  where e.resolved_at is null and exists (
    select 1 from public.registrations r where r.id = e.recipient_registration_id and r.clerk_user_id = v_sub
  );
  update public.match_room_assistance set resolved_by_clerk_user_id = null where resolved_by_clerk_user_id = v_sub;
  v_result := public.close_ironclad_player_account_without_room_episodes(v_sub);
  return v_result;
end;
$$;

create or replace function public.initialize_web_push_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_eligible boolean := false;
  v_now timestamptz;
begin
  -- Historical rows and ordinary in-site-only notifications remain null.
  -- Only this trigger can enroll a newly inserted canonical notification.
  new.push_delivery_status := null;
  new.push_attempt_count := null;
  new.push_next_attempt_at := null;
  new.push_claim_token := null;
  new.push_claim_expires_at := null;
  new.push_enqueued_at := null;
  new.push_completed_at := null;
  new.push_last_error_code := null;

  if nullif(btrim(new.event_key), '') is null then
    return new;
  end if;

  if new.recipient_role = 'admin'
    and new.recipient_clerk_user_id is null
    and new.type in (
      'match.dispute_opened',
      'match.no_show_disputed',
      'match.admin_assistance_requested'
    ) then
    v_eligible := true;
  elsif new.recipient_role = 'player'
    and nullif(btrim(new.recipient_clerk_user_id), '') is not null
    and (
      new.type in (
        'registration.approved',
        'registration.rejected',
        'registration.waitlist_offer',
        'registration.waitlist_closed',
        'tournament.cancelled',
        'tournament.voided',
        'match.ready',
        'match.message_received',
        'match.automatic_advance',
        'match.deadline_updated',
        'match.deadline_reminder',
        'match.deadline_ruling',
        'match.confirmation_required',
        'match.no_show_reported',
        'match.no_show_confirmed',
        'match.no_show_disputed',
        'match.no_show_approved',
        'match.no_show_rejected',
        'match.no_show_review_required',
        'match.result_approved',
        'match.result_review_required',
        'poll.decision_published'
      )
      or (
        new.type = 'poll.published'
        and new.metadata ->> 'purpose' = 'tournament_decision'
      )
    ) then
    v_eligible := true;
  end if;

  if not v_eligible then
    return new;
  end if;

  v_now := clock_timestamp();
  new.push_delivery_status := 'pending';
  new.push_attempt_count := 0;
  new.push_next_attempt_at := v_now;
  new.push_enqueued_at := v_now;
  return new;
end;
$$;

alter function public.initialize_web_push_state()
  owner to postgres;
revoke all on function public.initialize_web_push_state()
  from public, anon, authenticated, service_role;


create or replace function public.claim_web_push_notifications(
  p_limit integer default 10
)
returns table (
  notification_id uuid,
  recipient_clerk_user_id text,
  recipient_role text,
  notification_type text,
  event_key text,
  tournament_id uuid,
  registration_id uuid,
  match_id uuid,
  report_group_id uuid,
  metadata jsonb,
  push_enqueued_at timestamptz,
  push_attempt_count integer,
  push_claim_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_limit integer;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 10), 10));
  v_now := clock_timestamp();

  -- Read/hidden notifications are terminal for external delivery. This update
  -- also closes work that became stale while waiting for a due slot.
  with stale as materialized (
    select notification.id
    from public.notifications as notification
    where notification.push_delivery_status in (
        'pending',
        'retryable_failure'
      )
      and (
        notification.read_at is not null
        or notification.in_app_hidden_at is not null
      )
    order by case when notification.type = 'match.message_received' then 1 else 0 end,
      notification.push_next_attempt_at, notification.id
    limit v_limit
    for update of notification skip locked
  )
  update public.notifications as notification
  set
    push_delivery_status = 'skipped',
    push_next_attempt_at = null,
    push_completed_at = v_now,
    push_last_error_code = 'NO_LONGER_UNREAD'
  from stale
  where notification.id = stale.id;

  with expired as materialized (
    select notification.id
    from public.notifications as notification
    where notification.push_delivery_status = 'processing'
      and notification.push_claim_expires_at <= v_now
    order by notification.push_claim_expires_at, notification.id
    limit v_limit
    for update of notification skip locked
  )
  update public.notifications as notification
  set
    push_delivery_status = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null then 'skipped'
      when notification.push_attempt_count >= 5 then 'permanent_failure'
      else 'retryable_failure'
    end,
    push_next_attempt_at = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        or notification.push_attempt_count >= 5 then null
      else v_now
    end,
    push_claim_token = null,
    push_claim_expires_at = null,
    push_completed_at = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        or notification.push_attempt_count >= 5 then v_now
      else null
    end,
    push_last_error_code = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        then 'NO_LONGER_UNREAD'
      when notification.push_attempt_count >= 5
        then 'LEASE_EXPIRED_FINAL_ATTEMPT'
      else 'LEASE_EXPIRED'
    end
  from expired
  where notification.id = expired.id;

  return query
  with due as materialized (
    select notification.id, notification.push_next_attempt_at
    from public.notifications as notification
    where notification.push_delivery_status in (
        'pending',
        'retryable_failure'
      )
      and notification.push_next_attempt_at <= v_now
      and notification.push_attempt_count < 5
      and notification.read_at is null
      and notification.in_app_hidden_at is null
    order by case when notification.type = 'match.message_received' then 1 else 0 end,
      notification.push_next_attempt_at, notification.id
    limit v_limit
    for update of notification skip locked
  ),
  claimed as (
    update public.notifications as notification
    set
      push_delivery_status = 'processing',
      push_attempt_count = notification.push_attempt_count + 1,
      push_next_attempt_at = null,
      push_claim_token = gen_random_uuid(),
      push_claim_expires_at = v_now + interval '10 minutes',
      push_completed_at = null,
      push_last_error_code = null
    from due
    where notification.id = due.id
    returning
      notification.id,
      notification.recipient_clerk_user_id,
      notification.recipient_role,
      notification.type,
      notification.event_key,
      notification.tournament_id,
      notification.registration_id,
      notification.match_id,
      notification.report_group_id,
      notification.metadata,
      notification.push_enqueued_at,
      notification.push_attempt_count,
      notification.push_claim_token,
      due.push_next_attempt_at as claimed_due_at
  )
  select
    claimed.id,
    claimed.recipient_clerk_user_id,
    claimed.recipient_role,
    claimed.type,
    claimed.event_key,
    claimed.tournament_id,
    claimed.registration_id,
    claimed.match_id,
    claimed.report_group_id,
    claimed.metadata,
    claimed.push_enqueued_at,
    claimed.push_attempt_count,
    claimed.push_claim_token
  from claimed
  order by case when claimed.type = 'match.message_received' then 1 else 0 end,
    claimed.claimed_due_at, claimed.id;
end;
$$;

alter function public.claim_web_push_notifications(integer)
  owner to postgres;
revoke all on function public.claim_web_push_notifications(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_web_push_notifications(integer)
  to service_role;


create index notifications_web_push_priority_due_idx
  on public.notifications((case when type = 'match.message_received' then 1 else 0 end), push_next_attempt_at, id)
  where push_delivery_status in ('pending', 'retryable_failure');

alter function ironclad_private.match_room_actor() owner to postgres;
alter function ironclad_private.notify_match_room_message() owner to postgres;
alter function ironclad_private.finish_match_room_notification(uuid, boolean) owner to postgres;
alter function ironclad_private.match_room_assistance_projection(uuid) owner to postgres;
revoke all on function ironclad_private.match_room_actor(), ironclad_private.notify_match_room_message(),
  ironclad_private.finish_match_room_notification(uuid, boolean), ironclad_private.match_room_assistance_projection(uuid)
  from public, anon, authenticated, service_role;

alter function public.mark_match_room_read(uuid, bigint) owner to postgres;
alter function public.get_match_room_earlier_history(uuid, bigint, integer) owner to postgres;
alter function public.get_match_room_assistance(uuid) owner to postgres;
alter function public.request_match_room_assistance(uuid, bigint) owner to postgres;
alter function public.resolve_match_room_assistance(uuid, bigint) owner to postgres;
revoke all on function public.mark_match_room_read(uuid, bigint), public.get_match_room_earlier_history(uuid, bigint, integer),
  public.get_match_room_assistance(uuid), public.request_match_room_assistance(uuid, bigint),
  public.resolve_match_room_assistance(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.mark_match_room_read(uuid, bigint), public.get_match_room_earlier_history(uuid, bigint, integer),
  public.get_match_room_assistance(uuid), public.request_match_room_assistance(uuid, bigint),
  public.resolve_match_room_assistance(uuid, bigint) to authenticated;

alter function public.list_match_room_assistance_requests(integer) owner to postgres;
alter function public.close_ironclad_player_account(text) owner to postgres;
revoke all on function public.list_match_room_assistance_requests(integer), public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_match_room_assistance_requests(integer), public.close_ironclad_player_account(text)
  to service_role;

comment on table public.match_room_notification_episodes is
  'Private per-recipient immutable-room unread episodes. Only room read-cursor catchup resolves them; notification read/dismiss does not. No message body or Clerk attribution is stored here.';
comment on table public.match_room_assistance is
  'Operational room-specific requested/resolved state. Explicit admin resolution only; no competitive or room-closure effects. Notifications retain request-version evidence. Resolver Clerk attribution is removed on account closure.';

commit;
