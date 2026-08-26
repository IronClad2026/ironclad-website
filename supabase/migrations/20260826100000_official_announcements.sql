begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  media_kind text,
  media_path text unique,
  media_mime_type text,
  media_description text,
  published_at timestamptz not null default
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
  published_by_clerk_user_id text,
  withdrawn_at timestamptz,
  withdrawn_by_clerk_user_id text,
  constraint announcements_id_published_at_unique unique (id, published_at),
  constraint announcements_title_check check (
    char_length(btrim(title)) >= 1
    and char_length(title) <= 160
  ),
  constraint announcements_body_check check (
    char_length(btrim(body)) >= 1
    and char_length(body) <= 10000
  ),
  constraint announcements_media_check check (
    (
      media_kind is null
      and media_path is null
      and media_mime_type is null
      and media_description is null
    )
    or (
      media_kind = 'image'
      and media_path is not null
      and media_mime_type is not null
      and media_description is not null
      and (
        (
          media_mime_type = 'image/jpeg'
          and media_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
        )
        or (
          media_mime_type = 'image/png'
          and media_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'
        )
        or (
          media_mime_type = 'image/webp'
          and media_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
        )
      )
      and char_length(btrim(media_description)) >= 1
      and char_length(media_description) <= 500
    )
    or (
      media_kind = 'video'
      and media_path is not null
      and media_mime_type is not null
      and media_description is not null
      and (
        (
          media_mime_type = 'video/mp4'
          and media_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
        )
        or (
          media_mime_type = 'video/webm'
          and media_path ~ '^media/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webm$'
        )
      )
      and char_length(btrim(media_description)) >= 1
      and char_length(media_description) <= 500
    )
  ),
  constraint announcements_publisher_identity_check check (
    published_by_clerk_user_id is null
    or (
      published_by_clerk_user_id = btrim(published_by_clerk_user_id)
      and char_length(published_by_clerk_user_id) between 1 and 255
      and published_by_clerk_user_id !~ '[[:cntrl:]]'
    )
  ),
  constraint announcements_withdrawer_identity_check check (
    withdrawn_by_clerk_user_id is null
    or (
      withdrawn_by_clerk_user_id = btrim(withdrawn_by_clerk_user_id)
      and char_length(withdrawn_by_clerk_user_id) between 1 and 255
      and withdrawn_by_clerk_user_id !~ '[[:cntrl:]]'
    )
  ),
  constraint announcements_withdrawal_actor_state_check check (
    withdrawn_at is not null or withdrawn_by_clerk_user_id is null
  ),
  constraint announcements_withdrawal_time_check check (
    withdrawn_at is null or withdrawn_at >= published_at
  )
);

comment on table public.announcements is
  'Immutable launch-era official IronClad announcements. Withdrawal preserves the record while removing it from every public projection.';
comment on column public.announcements.media_path is
  'Canonical path in the public-safe announcement-media bucket. Never contains an Admin or Player identity.';
comment on column public.announcements.published_by_clerk_user_id is
  'Private audit attribution. Cleared transactionally during account closure and never returned publicly.';
comment on column public.announcements.withdrawn_by_clerk_user_id is
  'Private withdrawal attribution. Cleared transactionally during account closure and never returned publicly.';

create index announcements_latest_active_idx
  on public.announcements(published_at desc, id desc)
  where withdrawn_at is null;

create table public.announcement_read_states (
  clerk_user_id text primary key,
  last_seen_announcement_id uuid not null,
  last_seen_published_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint announcement_read_states_cursor_fk foreign key (
    last_seen_announcement_id,
    last_seen_published_at
  ) references public.announcements(id, published_at) on delete restrict,
  constraint announcement_read_states_identity_check check (
    clerk_user_id = btrim(clerk_user_id)
    and char_length(clerk_user_id) between 1 and 255
    and clerk_user_id !~ '[[:cntrl:]]'
  )
);

comment on table public.announcement_read_states is
  'One durable monotonic official-announcement marker per authenticated Clerk account. This is not a notification fanout table.';

alter table public.announcements enable row level security;
alter table public.announcements force row level security;
alter table public.announcement_read_states enable row level security;
alter table public.announcement_read_states force row level security;

revoke all on table public.announcements
  from public, anon, authenticated, service_role;
revoke all on table public.announcement_read_states
  from public, anon, authenticated, service_role;

grant select on table public.announcements to service_role;

create function public.list_active_announcements()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'announcements',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', announcement.id,
          'title', announcement.title,
          'body', announcement.body,
          'media_kind', announcement.media_kind,
          'media_path', announcement.media_path,
          'media_mime_type', announcement.media_mime_type,
          'media_description', announcement.media_description,
          'published_at', announcement.published_at
        )
        order by announcement.published_at desc, announcement.id desc
      ),
      '[]'::jsonb
    )
  )
  from public.announcements as announcement
  where announcement.withdrawn_at is null;
$$;

alter function public.list_active_announcements() owner to postgres;
revoke all on function public.list_active_announcements()
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_announcements()
  to service_role;

create function public.get_latest_active_announcement()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'latest',
    (
      select pg_catalog.jsonb_build_object(
        'id', announcement.id,
        'published_at', announcement.published_at
      )
      from public.announcements as announcement
      where announcement.withdrawn_at is null
      order by announcement.published_at desc, announcement.id desc
      limit 1
    )
  );
$$;

alter function public.get_latest_active_announcement() owner to postgres;
revoke all on function public.get_latest_active_announcement()
  from public, anon, authenticated, service_role;
grant execute on function public.get_latest_active_announcement()
  to service_role;

create function public.get_announcement_navigation_state(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_latest public.announcements%rowtype;
  v_seen public.announcement_read_states%rowtype;
  v_unread boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Announcement state is unavailable'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null then
    raise exception 'Announcement state is unavailable'
      using errcode = '22023';
  end if;

  select announcement.*
  into v_latest
  from public.announcements as announcement
  where announcement.withdrawn_at is null
  order by announcement.published_at desc, announcement.id desc
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'latest', null,
      'unread', false
    );
  end if;

  select read_state.*
  into v_seen
  from public.announcement_read_states as read_state
  where read_state.clerk_user_id = v_clerk_user_id;

  v_unread := not found or (
    v_seen.last_seen_published_at,
    v_seen.last_seen_announcement_id
  ) < (
    v_latest.published_at,
    v_latest.id
  );

  return pg_catalog.jsonb_build_object(
    'latest', pg_catalog.jsonb_build_object(
      'id', v_latest.id,
      'published_at', v_latest.published_at
    ),
    'unread', v_unread
  );
end;
$$;

alter function public.get_announcement_navigation_state(text)
  owner to postgres;
revoke all on function public.get_announcement_navigation_state(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_announcement_navigation_state(text)
  to service_role;

create function public.mark_announcement_seen(
  p_clerk_user_id text,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_announcement public.announcements%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Announcement state is unavailable'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null or p_announcement_id is null then
    raise exception 'Announcement state is unavailable'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:announcement-account:' || v_clerk_user_id,
      0
    )
  );

  select announcement.*
  into v_announcement
  from public.announcements as announcement
  where announcement.id = p_announcement_id
    and announcement.withdrawn_at is null;

  if not found then
    return pg_catalog.jsonb_build_object('marked', false);
  end if;

  insert into public.announcement_read_states as read_state (
    clerk_user_id,
    last_seen_announcement_id,
    last_seen_published_at,
    updated_at
  ) values (
    v_clerk_user_id,
    v_announcement.id,
    v_announcement.published_at,
    clock_timestamp()
  )
  on conflict (clerk_user_id) do update
  set
    last_seen_announcement_id = excluded.last_seen_announcement_id,
    last_seen_published_at = excluded.last_seen_published_at,
    updated_at = excluded.updated_at
  where (
    read_state.last_seen_published_at,
    read_state.last_seen_announcement_id
  ) < (
    excluded.last_seen_published_at,
    excluded.last_seen_announcement_id
  );

  return pg_catalog.jsonb_build_object(
    'marked', true,
    'latest', pg_catalog.jsonb_build_object(
      'id', v_announcement.id,
      'published_at', v_announcement.published_at
    )
  );
end;
$$;

alter function public.mark_announcement_seen(text, uuid) owner to postgres;
revoke all on function public.mark_announcement_seen(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_announcement_seen(text, uuid)
  to service_role;

create function public.publish_official_announcement(
  p_title text,
  p_body text,
  p_media_kind text,
  p_media_path text,
  p_media_mime_type text,
  p_media_description text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(btrim(p_actor_clerk_user_id), '');
  v_announcement public.announcements%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Announcement publication is unavailable'
      using errcode = '42501';
  end if;

  if v_actor_clerk_user_id is null then
    raise exception 'Announcement publication is unavailable'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:announcement-account:' || v_actor_clerk_user_id,
      0
    )
  );

  insert into public.announcements (
    title,
    body,
    media_kind,
    media_path,
    media_mime_type,
    media_description,
    published_by_clerk_user_id
  ) values (
    p_title,
    p_body,
    p_media_kind,
    p_media_path,
    p_media_mime_type,
    p_media_description,
    v_actor_clerk_user_id
  )
  returning * into v_announcement;

  return pg_catalog.jsonb_build_object(
    'id', v_announcement.id,
    'published_at', v_announcement.published_at
  );
end;
$$;

alter function public.publish_official_announcement(
  text,
  text,
  text,
  text,
  text,
  text,
  text
) owner to postgres;
revoke all on function public.publish_official_announcement(
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.publish_official_announcement(
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

create function public.withdraw_official_announcement(
  p_announcement_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(btrim(p_actor_clerk_user_id), '');
  v_announcement public.announcements%rowtype;
  v_withdrawn_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Announcement withdrawal is unavailable'
      using errcode = '42501';
  end if;

  if p_announcement_id is null or v_actor_clerk_user_id is null then
    raise exception 'Announcement withdrawal is unavailable'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:announcement-account:' || v_actor_clerk_user_id,
      0
    )
  );

  select announcement.*
  into v_announcement
  from public.announcements as announcement
  where announcement.id = p_announcement_id
  for update;

  if not found or v_announcement.withdrawn_at is not null then
    return pg_catalog.jsonb_build_object('withdrawn', false);
  end if;

  v_withdrawn_at := clock_timestamp();
  update public.announcements as announcement
  set
    withdrawn_at = v_withdrawn_at,
    withdrawn_by_clerk_user_id = v_actor_clerk_user_id
  where announcement.id = v_announcement.id;

  return pg_catalog.jsonb_build_object(
    'withdrawn', true,
    'withdrawn_at', v_withdrawn_at,
    'media_path', v_announcement.media_path
  );
end;
$$;

alter function public.withdraw_official_announcement(uuid, text)
  owner to postgres;
revoke all on function public.withdraw_official_announcement(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_official_announcement(uuid, text)
  to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'announcement-media',
  'announcement-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do nothing;

do $announcement_bucket$
declare
  v_bucket storage.buckets%rowtype;
  v_allowed_mime_types text[];
begin
  select bucket.*
  into v_bucket
  from storage.buckets as bucket
  where bucket.id = 'announcement-media';

  select pg_catalog.array_agg(mime_type order by mime_type)
  into v_allowed_mime_types
  from pg_catalog.unnest(v_bucket.allowed_mime_types) as mime_type;

  if v_bucket.id is distinct from 'announcement-media'
    or v_bucket.name is distinct from 'announcement-media'
    or v_bucket.public is distinct from true
    or v_bucket.file_size_limit is distinct from 52428800
    or v_allowed_mime_types is distinct from array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm'
    ]::text[] then
    raise exception 'announcement-media bucket configuration is invalid'
      using errcode = '23514';
  end if;
end;
$announcement_bucket$;

-- Uploads use short-lived, one-path signed upload tokens created only after
-- server-side Admin authorization. The bucket is public-safe by definition, so
-- no browser INSERT/UPDATE/DELETE policy and no object SELECT policy is needed.

-- Extend the existing trusted account-closure transaction without copying or
-- weakening the deployed privacy implementation. Official content is kept,
-- while per-user read state is deleted and private Admin attribution is cleared.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_announcement_cleanup;

revoke all on function
  public.close_ironclad_player_account_without_announcement_cleanup(text)
from public, anon, authenticated, service_role;

create function public.close_ironclad_player_account(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:announcement-account:' || v_clerk_user_id,
      0
    )
  );

  delete from public.announcement_read_states as read_state
  where read_state.clerk_user_id = v_clerk_user_id;

  update public.announcements as announcement
  set
    published_by_clerk_user_id = case
      when announcement.published_by_clerk_user_id = v_clerk_user_id
        then null
      else announcement.published_by_clerk_user_id
    end,
    withdrawn_by_clerk_user_id = case
      when announcement.withdrawn_by_clerk_user_id = v_clerk_user_id
        then null
      else announcement.withdrawn_by_clerk_user_id
    end
  where announcement.published_by_clerk_user_id = v_clerk_user_id
    or announcement.withdrawn_by_clerk_user_id = v_clerk_user_id;

  return public.close_ironclad_player_account_without_announcement_cleanup(
    v_clerk_user_id
  );
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

commit;
