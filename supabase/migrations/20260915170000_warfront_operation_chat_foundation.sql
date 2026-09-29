begin;

-- M6 deliberately creates no mutable "room" row. An accepted Operation and
-- its immutable locked roster are the room authority; this table is only the
-- participant-authored append-only history.
create table public.warfront_operation_chat_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  sequence bigint not null,
  sender_kind text not null default 'player',
  sender_player_id uuid
    references public.players(id) on delete restrict,
  client_message_id uuid not null,
  body text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint warfront_operation_chat_messages_sequence_check check (
    sequence between 1 and 9007199254740991
  ),
  constraint warfront_operation_chat_messages_sender_kind_check check (
    sender_kind in ('player', 'admin')
  ),
  constraint warfront_operation_chat_messages_sender_check check (
    (sender_kind = 'player' and sender_player_id is not null)
    or (sender_kind = 'admin' and sender_player_id is null)
  ),
  constraint warfront_operation_chat_messages_body_length_check check (
    pg_catalog.char_length(body) between 1 and 1000
    and pg_catalog.btrim(
      body,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    ) <> ''
  ),
  constraint warfront_operation_chat_messages_operation_sequence_key unique (
    operation_id,
    sequence
  ),
  constraint warfront_operation_chat_messages_idempotency_key unique (
    operation_id,
    sender_player_id,
    client_message_id
  )
);

-- This allocation state is private implementation detail, not an Operation
-- Room. The upsert in the send core atomically initializes and advances it.
create table ironclad_private.warfront_operation_chat_sequences (
  operation_id uuid primary key
    references public.warfront_operations(id) on delete restrict,
  last_sequence bigint not null default 0,
  constraint warfront_operation_chat_sequences_last_sequence_check check (
    last_sequence between 0 and 9007199254740991
  )
);

create index warfront_operation_chat_messages_sender_reference_idx
  on public.warfront_operation_chat_messages(
    sender_player_id,
    operation_id,
    sequence
  )
  where sender_player_id is not null;

-- Participant history is immutable in M6. M7 may forward-replace this guard
-- for an explicitly reviewed redaction/purge authority; ordinary update and
-- delete paths must never gain that capability.
create function ironclad_private.protect_warfront_operation_chat_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'WARFRONT_OPERATION_CHAT_MESSAGES_IMMUTABLE'
    using errcode = '55000';
end;
$$;

alter function ironclad_private.protect_warfront_operation_chat_message()
  owner to postgres;
revoke all on function ironclad_private.protect_warfront_operation_chat_message()
  from public, anon, authenticated, service_role;

create trigger warfront_operation_chat_messages_immutable
before update or delete on public.warfront_operation_chat_messages
for each row execute function ironclad_private.protect_warfront_operation_chat_message();

-- This projection has no Clerk identity, present-day Company state, or role
-- metadata. senderKind remains structurally useful for the future M7 admin
-- extension, while M6 only ever writes player rows.
create function ironclad_private.warfront_operation_chat_message_projection(
  p_message public.warfront_operation_chat_messages
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_message.id,
    'operationId', p_message.operation_id,
    'sequence', p_message.sequence,
    'senderKind', p_message.sender_kind,
    'senderPlayerId', p_message.sender_player_id,
    'body', p_message.body,
    'createdAt', p_message.created_at
  );
$$;

alter function ironclad_private.warfront_operation_chat_message_projection(
  public.warfront_operation_chat_messages
) owner to postgres;
revoke all on function ironclad_private.warfront_operation_chat_message_projection(
  public.warfront_operation_chat_messages
) from public, anon, authenticated, service_role;

-- This owner-only core is observational: it has no row or advisory locks.
-- The API wrapper takes the canonical shared account-closure barrier before
-- invoking it, so active-account authorization is linearized without making
-- history reads contend with Operation writers.
create function public.get_warfront_operation_chat(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
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
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_required_roster_size integer;
  v_roster_count integer;
  v_challenger_roster_count integer;
  v_opponent_roster_count integer;
  v_distinct_roster_count integer;
  v_page_limit integer := coalesce(p_limit, 50);
  v_messages jsonb;
  v_count integer;
  v_first_sequence bigint;
  v_last_sequence bigint;
  v_has_more boolean;
begin
  if p_operation_id is null
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]'
    or (p_after_sequence is not null and p_after_sequence < 0)
    or (p_before_sequence is not null and p_before_sequence < 1)
    or (p_after_sequence is not null and p_before_sequence is not null)
    or v_page_limit not between 1 and 50 then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
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
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  -- The complete acceptance bundle distinguishes a historical accepted room
  -- from OPEN, EXPIRED, and pre-accept CANCELLED Operations.
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
    )
    or (v_operation.status = 'cancelled'
      and v_operation.accepted_at is null) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  v_required_roster_size := case v_operation.format
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
    pg_catalog.count(*) filter (
      where entry.side = 'challenger'
    )::integer,
    pg_catalog.count(*) filter (
      where entry.side = 'opponent'
    )::integer,
    pg_catalog.count(distinct entry.player_id)::integer
  into
    v_roster_count,
    v_challenger_roster_count,
    v_opponent_roster_count,
    v_distinct_roster_count
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = v_operation.id;

  if v_roster_count <> v_required_roster_size * 2
    or v_challenger_roster_count <> v_required_roster_size
    or v_opponent_roster_count <> v_required_roster_size
    or v_distinct_roster_count <> v_roster_count then
    raise exception 'WARFRONT_OPERATION_CHAT_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.warfront_operation_roster_entries as entry
    where entry.operation_id = v_operation.id
      and entry.player_id = v_actor_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if p_after_sequence is not null then
    with candidate as (
      select message.*
      from public.warfront_operation_chat_messages as message
      where message.operation_id = v_operation.id
        and message.sequence > p_after_sequence
      order by message.sequence
      limit v_page_limit + 1
    ), page as (
      select *
      from candidate
      order by sequence
      limit v_page_limit
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          ironclad_private.warfront_operation_chat_message_projection(
            page::public.warfront_operation_chat_messages
          ) order by page.sequence
        ),
        '[]'::jsonb
      ),
      pg_catalog.count(*)::integer,
      pg_catalog.min(page.sequence),
      pg_catalog.max(page.sequence),
      (select pg_catalog.count(*) > v_page_limit from candidate)
    into
      v_messages,
      v_count,
      v_first_sequence,
      v_last_sequence,
      v_has_more
    from page;
  else
    -- A missing cursor and a before cursor both walk back from a boundary,
    -- then return the selected window in ascending authoritative order.
    with candidate as (
      select message.*
      from public.warfront_operation_chat_messages as message
      where message.operation_id = v_operation.id
        and (p_before_sequence is null or message.sequence < p_before_sequence)
      order by message.sequence desc
      limit v_page_limit + 1
    ), page as (
      select *
      from candidate
      order by sequence desc
      limit v_page_limit
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          ironclad_private.warfront_operation_chat_message_projection(
            page::public.warfront_operation_chat_messages
          ) order by page.sequence
        ),
        '[]'::jsonb
      ),
      pg_catalog.count(*)::integer,
      pg_catalog.min(page.sequence),
      pg_catalog.max(page.sequence),
      (select pg_catalog.count(*) > v_page_limit from candidate)
    into
      v_messages,
      v_count,
      v_first_sequence,
      v_last_sequence,
      v_has_more
    from page;
  end if;

  return pg_catalog.jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'viewerPlayerId', v_actor_player_id,
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

alter function public.get_warfront_operation_chat(
  uuid, text, bigint, bigint, integer
) owner to postgres;
revoke all on function public.get_warfront_operation_chat(
  uuid, text, bigint, bigint, integer
) from public, anon, authenticated, service_role;

-- The only M6 participant send authority. The shared closure lock comes
-- before every domain lock. The SHARE lock blocks a terminal lifecycle writer
-- from passing a genuinely new message, yet compatible participant sends can
-- proceed until the allocator serializes their committed sequence assignment.
create function public.send_warfront_operation_chat_message(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_client_message_id uuid,
  p_body text
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
  v_blank_chars constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_actor_player_id uuid;
  v_operation public.warfront_operations%rowtype;
  v_required_roster_size integer;
  v_roster_count integer;
  v_challenger_roster_count integer;
  v_opponent_roster_count integer;
  v_distinct_roster_count integer;
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
    or v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]'
    or p_client_message_id is null
    or p_body is null
    or pg_catalog.char_length(p_body) not between 1 and 1000
    or pg_catalog.btrim(p_body, v_blank_chars) = '' then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
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
    )
    or (v_operation.status = 'cancelled'
      and v_operation.accepted_at is null) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  v_required_roster_size := case v_operation.format
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
    pg_catalog.count(*) filter (
      where entry.side = 'challenger'
    )::integer,
    pg_catalog.count(*) filter (
      where entry.side = 'opponent'
    )::integer,
    pg_catalog.count(distinct entry.player_id)::integer
  into
    v_roster_count,
    v_challenger_roster_count,
    v_opponent_roster_count,
    v_distinct_roster_count
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = v_operation.id;

  if v_roster_count <> v_required_roster_size * 2
    or v_challenger_roster_count <> v_required_roster_size
    or v_opponent_roster_count <> v_required_roster_size
    or v_distinct_roster_count <> v_roster_count then
    raise exception 'WARFRONT_OPERATION_CHAT_HISTORY_INCONSISTENT'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.warfront_operation_roster_entries as entry
    where entry.operation_id = v_operation.id
      and entry.player_id = v_actor_player_id
  ) then
    raise exception 'WARFRONT_OPERATION_CHAT_UNAVAILABLE'
      using errcode = '42501';
  end if;

  -- Same-key requests take a narrow per-receipt transaction lock. This is
  -- not an Operation-wide serialization point: unrelated sends still only
  -- contend on the allocator. Rechecking under it makes simultaneous retries
  -- deterministic without allocating a sequence for the losing retry.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_operation_id::text || ':' || v_actor_player_id::text || ':'
        || p_client_message_id::text,
      0
    )
  );

  select message.*
  into v_existing_message
  from public.warfront_operation_chat_messages as message
  where message.operation_id = v_operation.id
    and message.sender_player_id = v_actor_player_id
    and message.client_message_id = p_client_message_id;

  if found then
    if v_existing_message.body is distinct from p_body then
      raise exception 'WARFRONT_OPERATION_CHAT_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'message',
      ironclad_private.warfront_operation_chat_message_projection(
        v_existing_message
      ),
      'duplicate', true
    );
  end if;

  -- Deliberately after receipt lookup: a completed or post-accept-cancelled
  -- room remains read-only for new content but may return an exact receipt.
  if v_operation.status not in (
    'accepted',
    'in_progress',
    'pending_result'
  ) then
    raise exception 'WARFRONT_OPERATION_CHAT_READ_ONLY'
      using errcode = '55000';
  end if;

  -- INSERT .. ON CONFLICT DO UPDATE is the per-Operation serialization point.
  -- It is safe for concurrent first sends: one inserts sequence 1 and every
  -- waiter atomically advances the committed allocator row. No MAX(sequence)
  -- calculation or separate lock-after-initialize race exists.
  insert into ironclad_private.warfront_operation_chat_sequences as allocator (
    operation_id,
    last_sequence
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
    client_message_id,
    body,
    created_at
  )
  values (
    v_operation.id,
    v_sequence,
    'player',
    v_actor_player_id,
    p_client_message_id,
    p_body,
    v_created_at
  )
  returning * into v_message;

  return pg_catalog.jsonb_build_object(
    'message',
    ironclad_private.warfront_operation_chat_message_projection(v_message),
    'duplicate', false
  );
end;
$$;

alter function public.send_warfront_operation_chat_message(
  uuid, text, uuid, text
) owner to postgres;
revoke all on function public.send_warfront_operation_chat_message(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;

-- This wrapper is the only read entrypoint for the service role. It validates
-- scalar input before acquiring the barrier, then delegates to the lock-free
-- STABLE core while retaining that shared transaction lock.
create function public.get_warfront_operation_chat_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
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
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_page_limit integer := coalesce(p_limit, 50);
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
    or (p_after_sequence is not null and p_after_sequence < 0)
    or (p_before_sequence is not null and p_before_sequence < 1)
    or (p_after_sequence is not null and p_before_sequence is not null)
    or v_page_limit not between 1 and 50 then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  return public.get_warfront_operation_chat(
    p_operation_id,
    v_actor_clerk_user_id,
    p_after_sequence,
    p_before_sequence,
    v_page_limit
  );
end;
$$;

alter function public.get_warfront_operation_chat_api(
  uuid, text, bigint, bigint, integer
) owner to postgres;
revoke all on function public.get_warfront_operation_chat_api(
  uuid, text, bigint, bigint, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_warfront_operation_chat_api(
  uuid, text, bigint, bigint, integer
) to service_role;

-- The API mutation boundary has no caller-controlled authority switches. The
-- core repeats all business authorization so direct owner invocation cannot
-- bypass the same trusted input contract.
create function public.send_warfront_operation_chat_message_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_client_message_id uuid,
  p_body text
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
  v_blank_chars constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
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
    or p_client_message_id is null
    or p_body is null
    or pg_catalog.char_length(p_body) not between 1 and 1000
    or pg_catalog.btrim(p_body, v_blank_chars) = '' then
    raise exception 'WARFRONT_OPERATION_CHAT_INPUT_INVALID'
      using errcode = '22023';
  end if;

  return public.send_warfront_operation_chat_message(
    p_operation_id,
    v_actor_clerk_user_id,
    p_client_message_id,
    p_body
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.send_warfront_operation_chat_message_api(
  uuid, text, uuid, text
) owner to postgres;
revoke all on function public.send_warfront_operation_chat_message_api(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.send_warfront_operation_chat_message_api(
  uuid, text, uuid, text
) to service_role;

-- Forward-replace the latest M5 retention predicate only. Chat authorship is
-- durable Player identity retention for pseudonymized history; it is not and
-- does not become Combat Record qualification.
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
      select 1
      from public.warfront_company_members as member
      where member.player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operations as operation
      where operation.created_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operations as operation
      where operation.accepted_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_roster_entries as entry
      where entry.player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_roster_entries as entry
      where entry.selected_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_dice_rolls as roll
      where roll.rolled_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_chat_messages as message
      where message.sender_player_id = p_player_id
    );
$$;

alter function ironclad_private.player_requires_warfront_identity_retention(
  uuid
) owner to postgres;
revoke all on function ironclad_private.player_requires_warfront_identity_retention(
  uuid
) from public, anon, authenticated, service_role;

comment on function ironclad_private.player_requires_warfront_identity_retention(
  uuid
) is
  'Owner-only WARFRONT durable-reference predicate used by account closure. Participant Operation Chat authorship retains Player identity for pseudonymized history; it is not Combat Record qualification.';

alter table public.warfront_operation_chat_messages owner to postgres;
alter table public.warfront_operation_chat_messages enable row level security;
alter table public.warfront_operation_chat_messages force row level security;
revoke all on table public.warfront_operation_chat_messages
  from public, anon, authenticated, service_role;

alter table ironclad_private.warfront_operation_chat_sequences owner to postgres;
alter table ironclad_private.warfront_operation_chat_sequences enable row level security;
alter table ironclad_private.warfront_operation_chat_sequences force row level security;
revoke all on table ironclad_private.warfront_operation_chat_sequences
  from public, anon, authenticated, service_role;

comment on table public.warfront_operation_chat_messages is
  'Private M6 append-only participant Operation Chat history. Access is only through service-role RPC wrappers; no Clerk IDs or display-name snapshots are retained.';
comment on table ironclad_private.warfront_operation_chat_sequences is
  'Private per-Operation append allocator for committed M6 chat sequence cursors; this is not an Operation Room.';
comment on function public.get_warfront_operation_chat(
  uuid, text, bigint, bigint, integer
) is
  'Owner-only lock-free STABLE participant Operation Chat history core. It authorizes explicit open actors through the complete immutable locked roster and admitted accepted-operation lifecycle, never current Company state or legal acceptance.';
comment on function public.get_warfront_operation_chat_api(
  uuid, text, bigint, bigint, integer
) is
  'Service-role-only Operation Chat read boundary. It validates scalar input and holds the canonical shared account-closure barrier for the entire lock-free core invocation.';
comment on function public.send_warfront_operation_chat_message(
  uuid, text, uuid, text
) is
  'Owner-only participant Operation Chat append authority. It requires trusted explicit actor, open account, current legal acceptance, complete accepted Operation room, and locked-roster membership; exact same-author receipts return even after completed or post-accept cancelled history becomes read-only.';
comment on function public.send_warfront_operation_chat_message_api(
  uuid, text, uuid, text
) is
  'Service-role-only participant Operation Chat mutation boundary with explicit actor and PT409 serialization transport. No admin authority exists in M6.';

commit;
