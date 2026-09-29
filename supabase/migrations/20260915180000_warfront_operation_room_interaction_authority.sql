begin;

-- M7 adds operational interaction state to the accepted Operation Room.  The
-- Operation itself remains the immutable room identity; this migration creates
-- no mutable room entity and does not change competitive authority.

create table ironclad_private.warfront_operation_room_admin_actors (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  clerk_user_id text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  pseudonymized_at timestamptz,
  constraint warfront_operation_room_admin_actors_identity_check check (
    (clerk_user_id is not null and pseudonymized_at is null)
    or (clerk_user_id is null and pseudonymized_at is not null)
  ),
  constraint warfront_operation_room_admin_actors_clerk_user_id_check check (
    clerk_user_id is null
    or (
      pg_catalog.nullif(pg_catalog.btrim(clerk_user_id), '') is not null
      and pg_catalog.char_length(clerk_user_id) <= 256
      and clerk_user_id !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_operation_room_admin_actors_pseudonymized_time_check check (
    pseudonymized_at is null or pseudonymized_at >= created_at
  )
);

create unique index warfront_operation_room_admin_actors_active_clerk_key
  on ironclad_private.warfront_operation_room_admin_actors(clerk_user_id)
  where clerk_user_id is not null;

-- Forward-extend M6 without altering it.  A durable opaque actor is required
-- for an ADMIN row; M6 participant idempotency remains unchanged.
alter table public.warfront_operation_chat_messages
  add column admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict;

alter table public.warfront_operation_chat_messages
  drop constraint warfront_operation_chat_messages_sender_check;

alter table public.warfront_operation_chat_messages
  add constraint warfront_operation_chat_messages_sender_check check (
    (sender_kind = 'player'
      and sender_player_id is not null
      and admin_actor_id is null)
    or (sender_kind = 'admin'
      and sender_player_id is null
      and admin_actor_id is not null)
  );

create unique index warfront_operation_chat_messages_admin_idempotency_key
  on public.warfront_operation_chat_messages(
    operation_id,
    admin_actor_id,
    client_message_id
  )
  where sender_kind = 'admin';

create index warfront_operation_chat_messages_admin_reference_idx
  on public.warfront_operation_chat_messages(
    admin_actor_id,
    operation_id,
    sequence
  )
  where admin_actor_id is not null;

create table public.warfront_operation_room_reads (
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  player_id uuid not null
    references public.players(id) on delete restrict,
  last_read_sequence bigint not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (operation_id, player_id),
  constraint warfront_operation_room_reads_sequence_check check (
    last_read_sequence between 0 and 9007199254740991
  )
);

create index warfront_operation_room_reads_player_operation_idx
  on public.warfront_operation_room_reads(player_id, operation_id);

create table public.warfront_operation_room_assistance (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  status text not null,
  requested_by_player_id uuid not null
    references public.players(id) on delete restrict,
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  resolved_by_admin_actor_id uuid
    references ironclad_private.warfront_operation_room_admin_actors(id)
    on delete restrict,
  notification_id uuid references public.notifications(id) on delete set null,
  constraint warfront_operation_room_assistance_status_check check (
    status in ('requested', 'resolved')
  ),
  constraint warfront_operation_room_assistance_resolution_check check (
    (status = 'requested'
      and resolved_at is null
      and resolved_by_admin_actor_id is null)
    or (status = 'resolved'
      and resolved_at is not null
      and resolved_at >= requested_at
      and resolved_by_admin_actor_id is not null)
  )
);

create index warfront_operation_room_assistance_requested_idx
  on public.warfront_operation_room_assistance(requested_at, operation_id)
  where status = 'requested';

create index warfront_operation_room_assistance_requester_idx
  on public.warfront_operation_room_assistance(requested_by_player_id, operation_id);

create index warfront_operation_room_assistance_resolver_idx
  on public.warfront_operation_room_assistance(resolved_by_admin_actor_id, operation_id)
  where resolved_by_admin_actor_id is not null;

create index warfront_operation_room_assistance_notification_idx
  on public.warfront_operation_room_assistance(notification_id)
  where notification_id is not null;

create table public.warfront_operation_room_notification_episodes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  recipient_player_id uuid not null
    references public.players(id) on delete restrict,
  first_sequence bigint not null,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  constraint warfront_operation_room_notification_episodes_sequence_check check (
    first_sequence between 1 and 9007199254740991
  ),
  constraint warfront_operation_room_notification_episodes_resolution_check check (
    resolved_at is null or resolved_at >= created_at
  )
);

create unique index warfront_operation_room_notification_episodes_open_key
  on public.warfront_operation_room_notification_episodes(
    operation_id,
    recipient_player_id
  )
  where resolved_at is null;

create index warfront_operation_room_notification_episodes_recipient_idx
  on public.warfront_operation_room_notification_episodes(
    recipient_player_id,
    operation_id
  )
  where resolved_at is null;

create index warfront_operation_room_notification_episodes_notification_idx
  on public.warfront_operation_room_notification_episodes(notification_id)
  where notification_id is not null;

-- This lock is deliberately per Operation/recipient.  It serializes only the
-- cursor/episode decision that would otherwise lose an episode when a mark-read
-- and a new message cross, while compatible Operation SHARE sends remain free.
create function ironclad_private.lock_warfront_operation_room_notification(
  p_operation_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:warfront-operation-room-notification:' ||
        p_operation_id::text || ':' || p_player_id::text,
      0
    )
  );
end;
$$;

create function ironclad_private.lock_warfront_operation_room_assistance(
  p_operation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:warfront-operation-room-assistance:' || p_operation_id::text,
      0
    )
  );
end;
$$;

create function ironclad_private.resolve_open_warfront_operation_room_player(
  p_actor_clerk_user_id text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_player_id uuid;
begin
  if v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'WARFRONT_ACTOR_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  return v_player_id;
end;
$$;

create function ironclad_private.resolve_warfront_operation_room_admin_actor(
  p_admin_clerk_user_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id),
    ''
  );
  v_admin_actor_id uuid;
begin
  if v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  insert into ironclad_private.warfront_operation_room_admin_actors as actor (
    clerk_user_id
  )
  values (v_admin_clerk_user_id)
  on conflict (clerk_user_id) where clerk_user_id is not null do nothing
  returning actor.id into v_admin_actor_id;

  if v_admin_actor_id is null then
    select actor.id
    into v_admin_actor_id
    from ironclad_private.warfront_operation_room_admin_actors as actor
    where actor.clerk_user_id = v_admin_clerk_user_id;
  end if;

  if v_admin_actor_id is null then
    raise exception 'WARFRONT_OPERATION_ROOM_ADMIN_ACTOR_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  return v_admin_actor_id;
end;
$$;

-- The exact accepted bundle and exact immutable roster distinguish an
-- Operation Room from OPEN, EXPIRED, and pre-accept CANCELLED Operations.
-- This helper intentionally takes no row/advisory locks so read cores remain
-- observational; mutation callers acquire Operation FOR SHARE first.
create function ironclad_private.require_warfront_operation_room(
  p_operation public.warfront_operations
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_required_roster_size integer;
  v_roster_count integer;
  v_challenger_roster_count integer;
  v_opponent_roster_count integer;
  v_distinct_roster_count integer;
begin
  if p_operation.id is null
    or p_operation.opponent_company_id is null
    or p_operation.accepted_by_player_id is null
    or p_operation.opponent_roster_elo_snapshot is null
    or p_operation.accepted_at is null
    or p_operation.roster_locked_at is null
    or p_operation.status not in (
      'accepted', 'in_progress', 'pending_result', 'completed', 'cancelled'
    )
    or (p_operation.status = 'cancelled' and p_operation.accepted_at is null) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  v_required_roster_size := case p_operation.format
    when '2v2' then 2
    when '3v3' then 3
    when '4v4' then 4
    else null
  end;

  if v_required_roster_size is null then
    raise exception 'WARFRONT_OPERATION_CHAT_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where entry.side = 'challenger')::integer,
    pg_catalog.count(*) filter (where entry.side = 'opponent')::integer,
    pg_catalog.count(distinct entry.player_id)::integer
  into
    v_roster_count,
    v_challenger_roster_count,
    v_opponent_roster_count,
    v_distinct_roster_count
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = p_operation.id;

  if v_roster_count <> v_required_roster_size * 2
    or v_challenger_roster_count <> v_required_roster_size
    or v_opponent_roster_count <> v_required_roster_size
    or v_distinct_roster_count <> v_roster_count then
    raise exception 'WARFRONT_OPERATION_CHAT_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;
end;
$$;

create function ironclad_private.require_warfront_operation_room_participant(
  p_operation_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if p_player_id is null or not exists (
    select 1
    from public.warfront_operation_roster_entries as entry
    where entry.operation_id = p_operation_id
      and entry.player_id = p_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;
end;
$$;

create function ironclad_private.finish_warfront_operation_room_notification(
  p_notification_id uuid,
  p_hide boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_notification_id is null then
    return;
  end if;

  -- Match the effective Match Room episode-resolution behavior.  Processing
  -- claims are left to the worker, which rechecks read/hidden state.
  update public.notifications
  set
    read_at = coalesce(read_at, pg_catalog.clock_timestamp()),
    in_app_hidden_at = case
      when p_hide then coalesce(in_app_hidden_at, pg_catalog.clock_timestamp())
      else in_app_hidden_at
    end,
    push_delivery_status = case
      when push_delivery_status in ('pending', 'retryable_failure') then 'skipped'
      else push_delivery_status
    end,
    push_next_attempt_at = case
      when push_delivery_status in ('pending', 'retryable_failure') then null
      else push_next_attempt_at
    end,
    push_completed_at = case
      when push_delivery_status in ('pending', 'retryable_failure')
        then pg_catalog.clock_timestamp()
      else push_completed_at
    end,
    push_last_error_code = case
      when push_delivery_status in ('pending', 'retryable_failure')
        then 'NO_LONGER_UNREAD'
      else push_last_error_code
    end
  where id = p_notification_id;
end;
$$;

-- The trigger is invoked only after a committed-message candidate has been
-- inserted by an owner-only send core.  It never takes an Operation lock.
create function ironclad_private.notify_warfront_operation_chat_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_recipient record;
  v_first_sequence bigint;
  v_episode_id uuid;
  v_notification_id uuid;
begin
  for v_recipient in
    select entry.player_id, player.clerk_user_id
    from public.warfront_operation_roster_entries as entry
    join public.players as player
      on player.id = entry.player_id
     and player.account_closed_at is null
    where entry.operation_id = new.operation_id
    order by entry.player_id
  loop
    if new.sender_kind = 'player'
      and new.sender_player_id = v_recipient.player_id then
      continue;
    end if;

    perform ironclad_private.lock_warfront_operation_room_notification(
      new.operation_id,
      v_recipient.player_id
    );

    -- A concurrent mark-read and this trigger share the same narrow lock.
    -- An ADMIN row qualifies even when its admin has a Player profile.
    select pg_catalog.min(message.sequence)
    into v_first_sequence
    from public.warfront_operation_chat_messages as message
    left join public.warfront_operation_room_reads as read_cursor
      on read_cursor.operation_id = new.operation_id
     and read_cursor.player_id = v_recipient.player_id
    where message.operation_id = new.operation_id
      and message.sequence > coalesce(read_cursor.last_read_sequence, 0)
      and (
        message.sender_kind = 'admin'
        or message.sender_player_id is distinct from v_recipient.player_id
      );

    if v_first_sequence is null then
      continue;
    end if;

    insert into public.warfront_operation_room_notification_episodes as episode (
      operation_id,
      recipient_player_id,
      first_sequence
    )
    values (
      new.operation_id,
      v_recipient.player_id,
      v_first_sequence
    )
    on conflict (operation_id, recipient_player_id) where resolved_at is null
      do nothing
    returning episode.id into v_episode_id;

    if v_episode_id is null then
      continue;
    end if;

    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      event_key,
      metadata
    )
    values (
      v_recipient.clerk_user_id,
      'player',
      'warfront.operation_room_message_received',
      'New Operation Room activity',
      'You have new messages in an Operation Room.',
      'warfront-operation-room:' || new.operation_id ||
        ':recipient:' || v_recipient.player_id || ':episode:' || v_episode_id,
      pg_catalog.jsonb_build_object(
        'source', 'warfront_operation_room',
        'operationId', new.operation_id,
        'episodeId', v_episode_id
      )
    )
    returning id into v_notification_id;

    update public.warfront_operation_room_notification_episodes
    set notification_id = v_notification_id
    where id = v_episode_id;
  end loop;

  return new;
end;
$$;

create trigger warfront_operation_chat_messages_notify_episode
after insert on public.warfront_operation_chat_messages
for each row execute function ironclad_private.notify_warfront_operation_chat_message();

-- ADMIN historical reads deliberately have a separate authority from locked
-- roster participant reads.  They are lock-free and never create a read row.
create function public.get_warfront_operation_chat_admin(
  p_operation_id uuid,
  p_admin_clerk_user_id text,
  p_after_sequence bigint,
  p_before_sequence bigint,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_operation public.warfront_operations%rowtype;
  v_page_limit integer := coalesce(p_limit, 50);
  v_messages jsonb;
  v_count integer;
  v_first_sequence bigint;
  v_last_sequence bigint;
  v_has_more boolean;
begin
  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or (p_after_sequence is not null and p_after_sequence < 0)
    or (p_before_sequence is not null and p_before_sequence < 1)
    or (p_after_sequence is not null and p_before_sequence is not null)
    or v_page_limit not between 1 and 50 then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  if p_after_sequence is not null then
    with candidate as (
      select message.*
      from public.warfront_operation_chat_messages as message
      where message.operation_id = v_operation.id
        and message.sequence > p_after_sequence
      order by message.sequence
      limit v_page_limit + 1
    ), page as (
      select * from candidate order by sequence limit v_page_limit
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          ironclad_private.warfront_operation_chat_message_projection(
            page::public.warfront_operation_chat_messages
          ) order by page.sequence
        ), '[]'::jsonb
      ),
      pg_catalog.count(*)::integer,
      pg_catalog.min(page.sequence),
      pg_catalog.max(page.sequence),
      (select pg_catalog.count(*) > v_page_limit from candidate)
    into v_messages, v_count, v_first_sequence, v_last_sequence, v_has_more
    from page;
  else
    with candidate as (
      select message.*
      from public.warfront_operation_chat_messages as message
      where message.operation_id = v_operation.id
        and (p_before_sequence is null or message.sequence < p_before_sequence)
      order by message.sequence desc
      limit v_page_limit + 1
    ), page as (
      select * from candidate order by sequence desc limit v_page_limit
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          ironclad_private.warfront_operation_chat_message_projection(
            page::public.warfront_operation_chat_messages
          ) order by page.sequence
        ), '[]'::jsonb
      ),
      pg_catalog.count(*)::integer,
      pg_catalog.min(page.sequence),
      pg_catalog.max(page.sequence),
      (select pg_catalog.count(*) > v_page_limit from candidate)
    into v_messages, v_count, v_first_sequence, v_last_sequence, v_has_more
    from page;
  end if;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'viewerKind', 'admin',
    'messages', v_messages,
    'page', pg_catalog.jsonb_build_object(
      'afterSequence', p_after_sequence,
      'beforeSequence', p_before_sequence,
      'limit', v_page_limit,
      'hasMore', coalesce(v_has_more, false),
      'nextAfterSequence', case
        when p_after_sequence is not null and v_count > 0 then v_last_sequence
        else null
      end,
      'nextBeforeSequence', case
        when p_after_sequence is null and v_count > 0 then v_first_sequence
        else null
      end
    )
  );
end;
$$;

create function public.get_warfront_operation_chat_admin_api(
  p_operation_id uuid,
  p_admin_clerk_user_id text,
  p_after_sequence bigint default null,
  p_before_sequence bigint default null,
  p_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_page_limit integer := coalesce(p_limit, 50);
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or (p_after_sequence is not null and p_after_sequence < 0)
    or (p_before_sequence is not null and p_before_sequence < 1)
    or (p_after_sequence is not null and p_before_sequence is not null)
    or v_page_limit not between 1 and 50 then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  return public.get_warfront_operation_chat_admin(
    p_operation_id,
    v_admin_clerk_user_id,
    p_after_sequence,
    p_before_sequence,
    v_page_limit
  );
end;
$$;

create function public.send_warfront_operation_chat_admin_message(
  p_operation_id uuid,
  p_admin_clerk_user_id text,
  p_client_message_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_blank_chars constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_existing_message public.warfront_operation_chat_messages%rowtype;
  v_message public.warfront_operation_chat_messages%rowtype;
  v_sequence bigint;
  v_created_at timestamptz;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or p_client_message_id is null
    or p_body is null
    or pg_catalog.char_length(p_body) not between 1 and 1000
    or pg_catalog.btrim(p_body, v_blank_chars) = '' then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id :=
    ironclad_private.resolve_warfront_operation_room_admin_actor(
      v_admin_clerk_user_id
    );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for share;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  -- Same-admin retries serialize only on their receipt key.  Receipt lookup
  -- intentionally precedes lifecycle writability so terminal exact retries
  -- return their original immutable ADMIN message without a new sequence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_operation_id::text || ':' || v_admin_actor_id::text || ':' ||
        p_client_message_id::text,
      0
    )
  );

  select message.*
  into v_existing_message
  from public.warfront_operation_chat_messages as message
  where message.operation_id = v_operation.id
    and message.sender_kind = 'admin'
    and message.admin_actor_id = v_admin_actor_id
    and message.client_message_id = p_client_message_id;

  if found then
    if v_existing_message.body is distinct from p_body then
      raise exception 'WARFRONT_OPERATION_CHAT_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'message', ironclad_private.warfront_operation_chat_message_projection(
        v_existing_message
      ),
      'duplicate', true
    );
  end if;

  if v_operation.status not in ('accepted', 'in_progress', 'pending_result') then
    raise exception 'WARFRONT_OPERATION_CHAT_READ_ONLY'
      using errcode = '55000';
  end if;

  insert into ironclad_private.warfront_operation_chat_sequences as allocator (
    operation_id, last_sequence
  )
  values (v_operation.id, 1)
  on conflict (operation_id) do update
  set last_sequence = allocator.last_sequence + 1
  where allocator.last_sequence < 9007199254740991
  returning last_sequence into v_sequence;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_SEQUENCE_EXHAUSTED'
      using errcode = '54000';
  end if;

  v_created_at := pg_catalog.clock_timestamp();

  insert into public.warfront_operation_chat_messages (
    operation_id,
    sequence,
    sender_kind,
    sender_player_id,
    admin_actor_id,
    client_message_id,
    body,
    created_at
  )
  values (
    v_operation.id,
    v_sequence,
    'admin',
    null,
    v_admin_actor_id,
    p_client_message_id,
    p_body,
    v_created_at
  )
  returning * into v_message;

  return pg_catalog.jsonb_build_object(
    'message', ironclad_private.warfront_operation_chat_message_projection(v_message),
    'duplicate', false
  );
end;
$$;

create function public.send_warfront_operation_chat_admin_message_api(
  p_operation_id uuid,
  p_admin_clerk_user_id text,
  p_client_message_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_blank_chars constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or p_client_message_id is null
    or p_body is null
    or pg_catalog.char_length(p_body) not between 1 and 1000
    or pg_catalog.btrim(p_body, v_blank_chars) = '' then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.send_warfront_operation_chat_admin_message(
    p_operation_id,
    v_admin_clerk_user_id,
    p_client_message_id,
    p_body
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.mark_warfront_operation_room_read(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_through_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_committed_sequence bigint;
  v_last_read_sequence bigint;
  v_episode record;
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
    or p_through_sequence is null
    or p_through_sequence not between 0 and 9007199254740991 then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  v_actor_player_id :=
    ironclad_private.resolve_open_warfront_operation_room_player(
      v_actor_clerk_user_id
    );
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(
    v_actor_clerk_user_id
  );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for share;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);
  perform ironclad_private.require_warfront_operation_room_participant(
    v_operation.id,
    v_actor_player_id
  );

  select allocator.last_sequence
  into v_committed_sequence
  from ironclad_private.warfront_operation_chat_sequences as allocator
  where allocator.operation_id = v_operation.id;

  v_committed_sequence := coalesce(v_committed_sequence, 0);
  if p_through_sequence > v_committed_sequence then
    raise exception 'WARFRONT_OPERATION_ROOM_READ_CURSOR_AHEAD'
      using errcode = '22023';
  end if;

  insert into public.warfront_operation_room_reads as read_cursor (
    operation_id,
    player_id,
    last_read_sequence,
    updated_at
  )
  values (
    v_operation.id,
    v_actor_player_id,
    p_through_sequence,
    pg_catalog.clock_timestamp()
  )
  on conflict (operation_id, player_id) do update
  set
    last_read_sequence = pg_catalog.greatest(
      read_cursor.last_read_sequence,
      excluded.last_read_sequence
    ),
    updated_at = pg_catalog.clock_timestamp()
  returning last_read_sequence into v_last_read_sequence;

  perform ironclad_private.lock_warfront_operation_room_notification(
    v_operation.id,
    v_actor_player_id
  );

  -- A cursor can resolve an episode only when no qualifying unread message
  -- remains.  Allocator position alone is insufficient because own PLAYER
  -- messages are deliberately excluded while every ADMIN message qualifies.
  for v_episode in
    update public.warfront_operation_room_notification_episodes as episode
    set resolved_at = pg_catalog.clock_timestamp()
    where episode.operation_id = v_operation.id
      and episode.recipient_player_id = v_actor_player_id
      and episode.resolved_at is null
      and not exists (
        select 1
        from public.warfront_operation_chat_messages as message
        where message.operation_id = v_operation.id
          and message.sequence > v_last_read_sequence
          and (
            message.sender_kind = 'admin'
            or message.sender_player_id is distinct from v_actor_player_id
          )
      )
    returning episode.notification_id
  loop
    perform ironclad_private.finish_warfront_operation_room_notification(
      v_episode.notification_id
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'lastReadSequence', v_last_read_sequence
  );
end;
$$;

create function public.mark_warfront_operation_room_read_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_through_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
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
    or p_through_sequence is null
    or p_through_sequence not between 0 and 9007199254740991 then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.mark_warfront_operation_room_read(
    p_operation_id,
    v_actor_clerk_user_id,
    p_through_sequence
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.get_warfront_operation_room_unread_summary(
  p_operation_ids uuid[],
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
  );
  v_actor_player_id uuid;
  v_summary jsonb;
begin
  if p_operation_ids is null
    or coalesce(pg_catalog.array_ndims(p_operation_ids), 0) <> 1
    or pg_catalog.cardinality(p_operation_ids) not between 1 and 128
    or pg_catalog.array_position(p_operation_ids, null::uuid) is not null
    or (
      select pg_catalog.count(distinct operation_id)
      from pg_catalog.unnest(p_operation_ids) as supplied(operation_id)
    ) <> pg_catalog.cardinality(p_operation_ids)
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  v_actor_player_id :=
    ironclad_private.resolve_open_warfront_operation_room_player(
      v_actor_clerk_user_id
    );

  with requested as (
    select supplied.operation_id
    from pg_catalog.unnest(p_operation_ids) as supplied(operation_id)
  ), eligible as (
    select
      operation.id as operation_id,
      viewer_entry.side as viewer_side,
      coalesce(read_cursor.last_read_sequence, 0) as last_read_sequence
    from requested
    join public.warfront_operations as operation
      on operation.id = requested.operation_id
    join public.warfront_operation_roster_entries as viewer_entry
      on viewer_entry.operation_id = operation.id
     and viewer_entry.player_id = v_actor_player_id
    left join public.warfront_operation_room_reads as read_cursor
      on read_cursor.operation_id = operation.id
     and read_cursor.player_id = v_actor_player_id
    where operation.opponent_company_id is not null
      and operation.accepted_by_player_id is not null
      and operation.opponent_roster_elo_snapshot is not null
      and operation.accepted_at is not null
      and operation.roster_locked_at is not null
      and operation.status in (
        'accepted', 'in_progress', 'pending_result', 'completed', 'cancelled'
      )
      and not (operation.status = 'cancelled' and operation.accepted_at is null)
      and (
        select pg_catalog.count(*)
        from public.warfront_operation_roster_entries as entry
        where entry.operation_id = operation.id
      ) = (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end) * 2
      and (
        select pg_catalog.count(*)
        from public.warfront_operation_roster_entries as entry
        where entry.operation_id = operation.id
          and entry.side = 'challenger'
      ) = (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (
        select pg_catalog.count(*)
        from public.warfront_operation_roster_entries as entry
        where entry.operation_id = operation.id
          and entry.side = 'opponent'
      ) = (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (
        select pg_catalog.count(distinct entry.player_id)
        from public.warfront_operation_roster_entries as entry
        where entry.operation_id = operation.id
      ) = (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end) * 2
  ), calculated as (
    select
      eligible.operation_id,
      pg_catalog.count(message.id) as unread_count,
      coalesce(pg_catalog.bool_or(message.sender_kind = 'admin'), false) as has_admin,
      coalesce(pg_catalog.bool_or(
        message.sender_kind = 'player'
        and author_entry.side is distinct from eligible.viewer_side
      ), false) as has_opponent
    from eligible
    left join public.warfront_operation_chat_messages as message
      on message.operation_id = eligible.operation_id
     and message.sequence > eligible.last_read_sequence
     and (
       message.sender_kind = 'admin'
       or message.sender_player_id is distinct from v_actor_player_id
     )
    left join public.warfront_operation_roster_entries as author_entry
      on author_entry.operation_id = eligible.operation_id
     and author_entry.player_id = message.sender_player_id
    group by eligible.operation_id
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'operationId', calculated.operation_id,
        'unreadCount', calculated.unread_count,
        -- Deterministic precedence: ADMIN, then opponent, then generic.
        -- `generic` is also the stable empty-unread source sentinel.
        'unreadSource', case
          when calculated.has_admin then 'admin'
          when calculated.has_opponent then 'opponent'
          else 'generic'
        end
      ) order by calculated.operation_id
    ),
    '[]'::jsonb
  )
  into v_summary
  from calculated;

  return pg_catalog.jsonb_build_object('operations', v_summary);
end;
$$;

create function public.get_warfront_operation_room_unread_summary_api(
  p_operation_ids uuid[],
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
  );
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_ids is null
    or coalesce(pg_catalog.array_ndims(p_operation_ids), 0) <> 1
    or pg_catalog.cardinality(p_operation_ids) not between 1 and 128
    or pg_catalog.array_position(p_operation_ids, null::uuid) is not null
    or (
      select pg_catalog.count(distinct operation_id)
      from pg_catalog.unnest(p_operation_ids) as supplied(operation_id)
    ) <> pg_catalog.cardinality(p_operation_ids)
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  return public.get_warfront_operation_room_unread_summary(
    p_operation_ids,
    v_actor_clerk_user_id
  );
end;
$$;

create function ironclad_private.warfront_operation_room_assistance_projection(
  p_operation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'operationId', p_operation_id,
    'status', coalesce(assistance.status, 'none'),
    'requestedAt', assistance.requested_at,
    'resolvedAt', assistance.resolved_at
  )
  from (select 1) as singleton
  left join public.warfront_operation_room_assistance as assistance
    on assistance.operation_id = p_operation_id;
$$;

create function ironclad_private.warfront_operation_room_assistance_admin_projection(
  p_operation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'operationId', p_operation_id,
    'status', coalesce(assistance.status, 'none'),
    'requestedByPlayerId', assistance.requested_by_player_id,
    'requestedAt', assistance.requested_at,
    'resolvedAt', assistance.resolved_at,
    'resolvedByAdminActorId', assistance.resolved_by_admin_actor_id
  )
  from (select 1) as singleton
  left join public.warfront_operation_room_assistance as assistance
    on assistance.operation_id = p_operation_id;
$$;

create function public.get_warfront_operation_room_assistance(
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
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
begin
  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  v_actor_player_id :=
    ironclad_private.resolve_open_warfront_operation_room_player(
      v_actor_clerk_user_id
    );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);
  perform ironclad_private.require_warfront_operation_room_participant(
    v_operation.id,
    v_actor_player_id
  );

  return ironclad_private.warfront_operation_room_assistance_projection(
    v_operation.id
  );
end;
$$;

create function public.get_warfront_operation_room_assistance_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
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
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  return public.get_warfront_operation_room_assistance(
    p_operation_id,
    v_actor_clerk_user_id
  );
end;
$$;

create function public.request_warfront_operation_room_assistance(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_notification_id uuid;
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
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_actor_player_id :=
    ironclad_private.resolve_open_warfront_operation_room_player(
      v_actor_clerk_user_id
    );
  perform ironclad_private.require_current_account_legal_acceptance_for_actor(
    v_actor_clerk_user_id
  );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for share;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);
  perform ironclad_private.require_warfront_operation_room_participant(
    v_operation.id,
    v_actor_player_id
  );

  if v_operation.status not in ('accepted', 'in_progress', 'pending_result') then
    raise exception 'WARFRONT_OPERATION_ROOM_ASSISTANCE_READ_ONLY'
      using errcode = '55000';
  end if;

  perform ironclad_private.lock_warfront_operation_room_assistance(
    v_operation.id
  );

  if exists (
    select 1
    from public.warfront_operation_room_assistance as assistance
    where assistance.operation_id = v_operation.id
  ) then
    raise exception 'WARFRONT_OPERATION_ROOM_ASSISTANCE_ALREADY_EXISTS'
      using errcode = '55000';
  end if;

  insert into public.notifications (
    recipient_role,
    type,
    title,
    message,
    event_key,
    metadata
  )
  values (
    'admin',
    'warfront.operation_room_assistance_requested',
    'Operation Room assistance requested',
    'An Operation Room requires administrator assistance.',
    'warfront-operation-room:' || v_operation.id || ':assistance:requested',
    pg_catalog.jsonb_build_object(
      'source', 'warfront_operation_room_assistance',
      'operationId', v_operation.id
    )
  )
  returning id into v_notification_id;

  insert into public.warfront_operation_room_assistance (
    operation_id,
    status,
    requested_by_player_id,
    requested_at,
    notification_id
  )
  values (
    v_operation.id,
    'requested',
    v_actor_player_id,
    pg_catalog.clock_timestamp(),
    v_notification_id
  );

  return ironclad_private.warfront_operation_room_assistance_projection(
    v_operation.id
  );
end;
$$;

create function public.request_warfront_operation_room_assistance_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_actor_clerk_user_id), ''
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
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.request_warfront_operation_room_assistance(
    p_operation_id,
    v_actor_clerk_user_id
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.get_warfront_operation_room_assistance_admin(
  p_operation_id uuid,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_operation public.warfront_operations%rowtype;
begin
  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  return ironclad_private.warfront_operation_room_assistance_admin_projection(
    v_operation.id
  );
end;
$$;

create function public.get_warfront_operation_room_assistance_admin_api(
  p_operation_id uuid,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_operation_room_assistance_admin(
    p_operation_id,
    v_admin_clerk_user_id
  );
end;
$$;

create function public.resolve_warfront_operation_room_assistance(
  p_operation_id uuid,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_admin_actor_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_assistance public.warfront_operation_room_assistance%rowtype;
  v_recipient record;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  v_admin_actor_id :=
    ironclad_private.resolve_warfront_operation_room_admin_actor(
      v_admin_clerk_user_id
    );

  select operation.*
  into v_operation
  from public.warfront_operations as operation
  where operation.id = p_operation_id
  for share;

  if not found then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  perform ironclad_private.require_warfront_operation_room(v_operation);

  select assistance.*
  into v_assistance
  from public.warfront_operation_room_assistance as assistance
  where assistance.operation_id = v_operation.id
  for update;

  if not found then
    raise exception 'WARFRONT_OPERATION_ROOM_ASSISTANCE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if v_assistance.status <> 'requested' then
    raise exception 'WARFRONT_OPERATION_ROOM_ASSISTANCE_ALREADY_RESOLVED'
      using errcode = '55000';
  end if;

  update public.warfront_operation_room_assistance
  set
    status = 'resolved',
    resolved_at = pg_catalog.clock_timestamp(),
    resolved_by_admin_actor_id = v_admin_actor_id
  where operation_id = v_operation.id;

  perform ironclad_private.finish_warfront_operation_room_notification(
    v_assistance.notification_id,
    true
  );

  -- Assistance resolution is a separate generic operational event, not an
  -- unread-chat episode.  It reaches every still-open locked-roster account.
  for v_recipient in
    select entry.player_id, player.clerk_user_id
    from public.warfront_operation_roster_entries as entry
    join public.players as player
      on player.id = entry.player_id
     and player.account_closed_at is null
    where entry.operation_id = v_operation.id
    order by entry.player_id
  loop
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      event_key,
      metadata
    )
    values (
      v_recipient.clerk_user_id,
      'player',
      'warfront.operation_room_assistance_resolved',
      'Operation Room assistance resolved',
      'Assistance for an Operation Room has been resolved.',
      'warfront-operation-room:' || v_operation.id ||
        ':assistance:resolved:recipient:' || v_recipient.player_id,
      pg_catalog.jsonb_build_object(
        'source', 'warfront_operation_room_assistance',
        'operationId', v_operation.id
      )
    );
  end loop;

  return ironclad_private.warfront_operation_room_assistance_admin_projection(
    v_operation.id
  );
end;
$$;

create function public.resolve_warfront_operation_room_assistance_api(
  p_operation_id uuid,
  p_admin_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if p_operation_id is null
    or v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.resolve_warfront_operation_room_assistance(
    p_operation_id,
    v_admin_clerk_user_id
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

create function public.list_warfront_operation_room_assistance_requests(
  p_admin_clerk_user_id text,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
  v_requests jsonb;
  v_count bigint;
begin
  if v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or p_limit is null
    or p_limit not between 1 and 200 then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  with requested as materialized (
    select assistance.*
    from public.warfront_operation_room_assistance as assistance
    where assistance.status = 'requested'
  ), limited as (
    select * from requested order by requested_at, operation_id limit p_limit
  )
  select
    (select pg_catalog.count(*) from requested),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'operationId', limited.operation_id,
          'requestedByPlayerId', limited.requested_by_player_id,
          'requestedAt', limited.requested_at
        ) order by limited.requested_at, limited.operation_id
      ), '[]'::jsonb
    )
  into v_count, v_requests
  from limited;

  return pg_catalog.jsonb_build_object(
    'requests', v_requests,
    'totalCount', v_count
  );
end;
$$;

create function public.list_warfront_operation_room_assistance_requests_api(
  p_admin_clerk_user_id text,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_clerk_user_id text := pg_catalog.nullif(
    pg_catalog.btrim(p_admin_clerk_user_id), ''
  );
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED'
      using errcode = '42501';
  end if;

  if v_admin_clerk_user_id is null
    or pg_catalog.char_length(v_admin_clerk_user_id) > 256
    or v_admin_clerk_user_id ~ '[[:cntrl:]]'
    or p_limit is null
    or p_limit not between 1 and 200 then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.list_warfront_operation_room_assistance_requests(
    v_admin_clerk_user_id,
    p_limit
  );
end;
$$;

-- M7 foreign keys are all durable references.  The roster relationship alone
-- normally retains these Players, but these explicit clauses keep closure
-- correct even if future room artifacts are introduced independently.
create or replace function ironclad_private.player_requires_warfront_identity_retention(
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    exists (
      select 1 from public.warfront_company_members as member
      where member.player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operations as operation
      where operation.created_by_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operations as operation
      where operation.accepted_by_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_roster_entries as entry
      where entry.player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_roster_entries as entry
      where entry.selected_by_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_dice_rolls as roll
      where roll.rolled_by_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_chat_messages as message
      where message.sender_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_room_reads as read_cursor
      where read_cursor.player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_room_assistance as assistance
      where assistance.requested_by_player_id = p_player_id
    )
    or exists (
      select 1 from public.warfront_operation_room_notification_episodes as episode
      where episode.recipient_player_id = p_player_id
    );
$$;

-- New storage is private even in public schema.  Existing chat-message RLS
-- remains in force; no browser or raw service-table authority is introduced.
alter table ironclad_private.warfront_operation_room_admin_actors owner to postgres;
alter table ironclad_private.warfront_operation_room_admin_actors enable row level security;
alter table ironclad_private.warfront_operation_room_admin_actors force row level security;
revoke all on table ironclad_private.warfront_operation_room_admin_actors
  from public, anon, authenticated, service_role;

alter table public.warfront_operation_room_reads owner to postgres;
alter table public.warfront_operation_room_reads enable row level security;
alter table public.warfront_operation_room_reads force row level security;
revoke all on table public.warfront_operation_room_reads
  from public, anon, authenticated, service_role;

alter table public.warfront_operation_room_assistance owner to postgres;
alter table public.warfront_operation_room_assistance enable row level security;
alter table public.warfront_operation_room_assistance force row level security;
revoke all on table public.warfront_operation_room_assistance
  from public, anon, authenticated, service_role;

alter table public.warfront_operation_room_notification_episodes owner to postgres;
alter table public.warfront_operation_room_notification_episodes enable row level security;
alter table public.warfront_operation_room_notification_episodes force row level security;
revoke all on table public.warfront_operation_room_notification_episodes
  from public, anon, authenticated, service_role;

alter function ironclad_private.lock_warfront_operation_room_notification(uuid, uuid)
  owner to postgres;
alter function ironclad_private.lock_warfront_operation_room_assistance(uuid)
  owner to postgres;
alter function ironclad_private.resolve_open_warfront_operation_room_player(text)
  owner to postgres;
alter function ironclad_private.resolve_warfront_operation_room_admin_actor(text)
  owner to postgres;
alter function ironclad_private.require_warfront_operation_room(public.warfront_operations)
  owner to postgres;
alter function ironclad_private.require_warfront_operation_room_participant(uuid, uuid)
  owner to postgres;
alter function ironclad_private.finish_warfront_operation_room_notification(uuid, boolean)
  owner to postgres;
alter function ironclad_private.notify_warfront_operation_chat_message()
  owner to postgres;
alter function ironclad_private.warfront_operation_room_assistance_projection(uuid)
  owner to postgres;
alter function ironclad_private.warfront_operation_room_assistance_admin_projection(uuid)
  owner to postgres;
revoke all on function
  ironclad_private.lock_warfront_operation_room_notification(uuid, uuid),
  ironclad_private.lock_warfront_operation_room_assistance(uuid),
  ironclad_private.resolve_open_warfront_operation_room_player(text),
  ironclad_private.resolve_warfront_operation_room_admin_actor(text),
  ironclad_private.require_warfront_operation_room(public.warfront_operations),
  ironclad_private.require_warfront_operation_room_participant(uuid, uuid),
  ironclad_private.finish_warfront_operation_room_notification(uuid, boolean),
  ironclad_private.notify_warfront_operation_chat_message(),
  ironclad_private.warfront_operation_room_assistance_projection(uuid),
  ironclad_private.warfront_operation_room_assistance_admin_projection(uuid)
from public, anon, authenticated, service_role;

alter function public.get_warfront_operation_chat_admin(uuid, text, bigint, bigint, integer)
  owner to postgres;
alter function public.send_warfront_operation_chat_admin_message(uuid, text, uuid, text)
  owner to postgres;
alter function public.mark_warfront_operation_room_read(uuid, text, bigint)
  owner to postgres;
alter function public.get_warfront_operation_room_unread_summary(uuid[], text)
  owner to postgres;
alter function public.get_warfront_operation_room_assistance(uuid, text)
  owner to postgres;
alter function public.request_warfront_operation_room_assistance(uuid, text)
  owner to postgres;
alter function public.get_warfront_operation_room_assistance_admin(uuid, text)
  owner to postgres;
alter function public.resolve_warfront_operation_room_assistance(uuid, text)
  owner to postgres;
alter function public.list_warfront_operation_room_assistance_requests(text, integer)
  owner to postgres;
revoke all on function
  public.get_warfront_operation_chat_admin(uuid, text, bigint, bigint, integer),
  public.send_warfront_operation_chat_admin_message(uuid, text, uuid, text),
  public.mark_warfront_operation_room_read(uuid, text, bigint),
  public.get_warfront_operation_room_unread_summary(uuid[], text),
  public.get_warfront_operation_room_assistance(uuid, text),
  public.request_warfront_operation_room_assistance(uuid, text),
  public.get_warfront_operation_room_assistance_admin(uuid, text),
  public.resolve_warfront_operation_room_assistance(uuid, text),
  public.list_warfront_operation_room_assistance_requests(text, integer)
from public, anon, authenticated, service_role;

alter function public.get_warfront_operation_chat_admin_api(uuid, text, bigint, bigint, integer)
  owner to postgres;
alter function public.send_warfront_operation_chat_admin_message_api(uuid, text, uuid, text)
  owner to postgres;
alter function public.mark_warfront_operation_room_read_api(uuid, text, bigint)
  owner to postgres;
alter function public.get_warfront_operation_room_unread_summary_api(uuid[], text)
  owner to postgres;
alter function public.get_warfront_operation_room_assistance_api(uuid, text)
  owner to postgres;
alter function public.request_warfront_operation_room_assistance_api(uuid, text)
  owner to postgres;
alter function public.get_warfront_operation_room_assistance_admin_api(uuid, text)
  owner to postgres;
alter function public.resolve_warfront_operation_room_assistance_api(uuid, text)
  owner to postgres;
alter function public.list_warfront_operation_room_assistance_requests_api(text, integer)
  owner to postgres;
revoke all on function
  public.get_warfront_operation_chat_admin_api(uuid, text, bigint, bigint, integer),
  public.send_warfront_operation_chat_admin_message_api(uuid, text, uuid, text),
  public.mark_warfront_operation_room_read_api(uuid, text, bigint),
  public.get_warfront_operation_room_unread_summary_api(uuid[], text),
  public.get_warfront_operation_room_assistance_api(uuid, text),
  public.request_warfront_operation_room_assistance_api(uuid, text),
  public.get_warfront_operation_room_assistance_admin_api(uuid, text),
  public.resolve_warfront_operation_room_assistance_api(uuid, text),
  public.list_warfront_operation_room_assistance_requests_api(text, integer)
from public, anon, authenticated, service_role;
grant execute on function
  public.get_warfront_operation_chat_admin_api(uuid, text, bigint, bigint, integer),
  public.send_warfront_operation_chat_admin_message_api(uuid, text, uuid, text),
  public.mark_warfront_operation_room_read_api(uuid, text, bigint),
  public.get_warfront_operation_room_unread_summary_api(uuid[], text),
  public.get_warfront_operation_room_assistance_api(uuid, text),
  public.request_warfront_operation_room_assistance_api(uuid, text),
  public.get_warfront_operation_room_assistance_admin_api(uuid, text),
  public.resolve_warfront_operation_room_assistance_api(uuid, text),
  public.list_warfront_operation_room_assistance_requests_api(text, integer)
to service_role;

alter function ironclad_private.player_requires_warfront_identity_retention(uuid)
  owner to postgres;
revoke all on function ironclad_private.player_requires_warfront_identity_retention(uuid)
  from public, anon, authenticated, service_role;

comment on table ironclad_private.warfront_operation_room_admin_actors is
  'Private durable opaque ADMIN actor attribution for Operation Room support. Direct Clerk identity is unique only while active and is nulled by account closure.';
comment on table public.warfront_operation_room_reads is
  'Private per-locked-roster-Player Operation Room cursor state. Own participant messages are excluded from unread calculations.';
comment on table public.warfront_operation_room_assistance is
  'Private one-per-Operation requested/resolved support state. It has no competitive authority and no free-text resolution note.';
comment on table public.warfront_operation_room_notification_episodes is
  'Private per-recipient coalesced Operation Room unread episodes. Generic linked notifications contain no message body, sender name, or Clerk identifier in metadata.';
comment on function public.send_warfront_operation_chat_admin_message(uuid, text, uuid, text) is
  'Owner-only ADMIN chat append core. The service-role caller is the trusted server boundary after Clerk admin verification; no database JWT or caller-supplied role flag is trusted.';
comment on function public.get_warfront_operation_room_unread_summary(uuid[], text) is
  'Owner-only bounded participant unread summary. It derives unread from qualifying messages after the cursor, never allocator position, and applies ADMIN > OPPONENT > GENERIC source precedence.';
commit;
