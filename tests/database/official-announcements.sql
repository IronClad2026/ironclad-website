\set ON_ERROR_STOP on

-- Rollback-only PR 4 Official Announcements database contract. Run only
-- against the explicitly approved Staging project after the PR 4 migration.
-- Every fixture mutation is isolated in this transaction; no Storage object
-- is created and the final baseline check proves that no row persists.
set client_min_messages = warning;
set role postgres;
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"pr4-announcement-database-contract"}';
set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';

create temporary table pr4_announcement_contract_baseline
on commit preserve rows
as
select
  (select pg_catalog.count(*) from public.announcements)
    as announcement_count,
  (select pg_catalog.count(*) from public.announcement_read_states)
    as read_state_count,
  (select pg_catalog.count(*) from public.push_subscriptions)
    as push_subscription_count;

create function pg_temp.pr4_announcement_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'PR 4 Announcements contract failed: %', p_message;
  end if;
end;
$$;

begin isolation level repeatable read;

do $$
declare
  v_run_id uuid := pg_catalog.gen_random_uuid();
  v_actor text := 'pr4-contract-admin-' || v_run_id::text;
  v_close_actor text := 'pr4-contract-closing-' || v_run_id::text;
  v_reader_a text := 'pr4-contract-reader-a-' || v_run_id::text;
  v_reader_b text := 'pr4-contract-reader-b-' || v_run_id::text;
  v_push_endpoint text :=
    'https://fcm.googleapis.com/fcm/send/pr4-' || v_run_id::text;
  v_first uuid;
  v_second uuid;
  v_third uuid;
  v_close_announcement uuid;
  v_first_published_at timestamptz;
  v_second_published_at timestamptz;
  v_feed jsonb;
  v_item jsonb;
  v_state jsonb;
  v_result jsonb;
  v_close_result jsonb;
  v_bucket storage.buckets%rowtype;
  v_allowed_mime_types text[];
begin
  perform pg_temp.pr4_announcement_assert(
    current_user = 'postgres',
    'the executable contract must SET ROLE postgres'
  );
  perform pg_temp.pr4_announcement_assert(
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:official-announcement-database-contract',
        0
      )
    ),
    'another PR 4 database contract holds the canary lock'
  );
  perform pg_temp.pr4_announcement_assert(
    not exists (
      select 1
      from public.announcements as announcement
      where announcement.published_by_clerk_user_id in (v_actor, v_close_actor)
        or announcement.withdrawn_by_clerk_user_id in (v_actor, v_close_actor)
    )
      and not exists (
        select 1
        from public.announcement_read_states as read_state
        where read_state.clerk_user_id in (
          v_reader_a,
          v_reader_b,
          v_close_actor
        )
      )
      and not exists (
        select 1
        from public.push_subscriptions as subscription
        where subscription.owner_clerk_user_id = v_close_actor
          or subscription.endpoint = v_push_endpoint
      )
      and not exists (
        select 1
        from public.players as player
        where player.clerk_user_id in (v_actor, v_close_actor)
      )
      and not exists (
        select 1
        from public.profiles as profile
        where profile.clerk_user_id in (v_actor, v_close_actor)
      ),
    'a randomized rollback fixture identity unexpectedly collides'
  );

  -- Real schema, RLS, ACL, RPC, and Storage-bucket contract.
  perform pg_temp.pr4_announcement_assert(
    pg_catalog.to_regclass('public.announcements') is not null
      and pg_catalog.to_regclass('public.announcement_read_states') is not null,
    'announcement tables are absent'
  );
  perform pg_temp.pr4_announcement_assert(
    (
      select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_catalog.pg_class as relation
      where relation.oid = 'public.announcements'::pg_catalog.regclass
    )
      and (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid =
          'public.announcement_read_states'::pg_catalog.regclass
      ),
    'RLS must be enabled and forced on both tables'
  );
  perform pg_temp.pr4_announcement_assert(
    not exists (
      select 1
      from pg_catalog.unnest(
        array['anon', 'authenticated']::text[]
      ) as browser_role(role_name)
      cross join pg_catalog.unnest(
        array[
          'public.announcements',
          'public.announcement_read_states'
        ]::text[]
      ) as protected_table(table_name)
      cross join pg_catalog.unnest(
        array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
      ) as table_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        browser_role.role_name,
        protected_table.table_name,
        table_privilege.privilege_name
      )
    ),
    'browser roles received announcement table access'
  );
  perform pg_temp.pr4_announcement_assert(
    pg_catalog.has_table_privilege(
      'service_role',
      'public.announcements',
      'SELECT'
    )
      and not exists (
        select 1
        from pg_catalog.unnest(
          array['INSERT', 'UPDATE', 'DELETE']::text[]
        ) as table_privilege(privilege_name)
        where pg_catalog.has_table_privilege(
          'service_role',
          'public.announcements',
          table_privilege.privilege_name
        )
      )
      and not exists (
        select 1
        from pg_catalog.unnest(
          array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
        ) as table_privilege(privilege_name)
        where pg_catalog.has_table_privilege(
          'service_role',
          'public.announcement_read_states',
          table_privilege.privilege_name
        )
      ),
    'service role table ACL is broader than the exact server read boundary'
  );
  perform pg_temp.pr4_announcement_assert(
    not exists (
      select 1
      from pg_catalog.unnest(
        array['anon', 'authenticated']::text[]
      ) as browser_role(role_name)
      cross join pg_catalog.unnest(array[
        'public.list_active_announcements()',
        'public.get_latest_active_announcement()',
        'public.get_announcement_navigation_state(text)',
        'public.mark_announcement_seen(text,uuid)',
        'public.publish_official_announcement(text,text,text,text,text,text,text)',
        'public.withdraw_official_announcement(uuid,text)'
      ]::text[]) as trusted_function(signature)
      where pg_catalog.has_function_privilege(
        browser_role.role_name,
        trusted_function.signature,
        'EXECUTE'
      )
    )
      and not exists (
        select 1
        from pg_catalog.unnest(array[
          'public.list_active_announcements()',
          'public.get_latest_active_announcement()',
          'public.get_announcement_navigation_state(text)',
          'public.mark_announcement_seen(text,uuid)',
          'public.publish_official_announcement(text,text,text,text,text,text,text)',
          'public.withdraw_official_announcement(uuid,text)'
        ]::text[]) as trusted_function(signature)
        where not pg_catalog.has_function_privilege(
          'service_role',
          trusted_function.signature,
          'EXECUTE'
        )
      ),
    'announcement RPC grants are not service-role-only'
  );

  select bucket.*
  into strict v_bucket
  from storage.buckets as bucket
  where bucket.id = 'announcement-media';

  select pg_catalog.array_agg(mime_type order by mime_type)
  into v_allowed_mime_types
  from pg_catalog.unnest(v_bucket.allowed_mime_types) as mime_type;

  perform pg_temp.pr4_announcement_assert(
    v_bucket.name = 'announcement-media'
      and v_bucket.public is true
      and v_bucket.file_size_limit = 52428800
      and v_allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm'
      ]::text[],
    'announcement-media bucket configuration differs from the launch contract'
  );
  perform pg_temp.pr4_announcement_assert(
    (
      select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(
          policy.policyname in (
            'Players can upload their avatar',
            'Players can update their avatar',
            'Players can delete their avatar'
          )
            and (
              coalesce(policy.qual, '') || ' ' ||
              coalesce(policy.with_check, '')
            ) like '%player-avatars%'
            and (
              coalesce(policy.qual, '') || ' ' ||
              coalesce(policy.with_check, '')
            ) not like '%announcement-media%'
        )
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
        and policy.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        and policy.roles && array[
          'public',
          'anon',
          'authenticated'
        ]::name[]
    ),
    'a browser mutation policy can overlap announcement-media'
  );

  -- Publication is immediate, database-timestamped, millisecond-aligned, and
  -- projected newest-first without audit identities.
  v_result := public.publish_official_announcement(
    'PR4 rollback first',
    'First rollback-only announcement.',
    null,
    null,
    null,
    null,
    v_actor
  );
  v_first := (v_result ->> 'id')::uuid;
  v_first_published_at := (v_result ->> 'published_at')::timestamptz;
  perform pg_catalog.pg_sleep(0.005);

  v_result := public.publish_official_announcement(
    'PR4 rollback second',
    'Second rollback-only announcement.',
    null,
    null,
    null,
    null,
    v_actor
  );
  v_second := (v_result ->> 'id')::uuid;
  v_second_published_at := (v_result ->> 'published_at')::timestamptz;

  perform pg_temp.pr4_announcement_assert(
    v_second_published_at > v_first_published_at
      and pg_catalog.mod(
        pg_catalog.date_part(
          'microseconds',
          v_first_published_at
        )::bigint,
        1000
      ) = 0
      and pg_catalog.mod(
        pg_catalog.date_part(
          'microseconds',
          v_second_published_at
        )::bigint,
        1000
      ) = 0,
    'publication ordering or millisecond precision is invalid'
  );

  v_feed := public.list_active_announcements();
  select item
  into strict v_item
  from pg_catalog.jsonb_array_elements(
    v_feed -> 'announcements'
  ) as items(item)
  where (item ->> 'id')::uuid = v_second;

  perform pg_temp.pr4_announcement_assert(
    (
      select pg_catalog.array_agg(key order by key)
      from pg_catalog.jsonb_object_keys(v_item) as keys(key)
    ) = array[
      'body',
      'id',
      'media_description',
      'media_kind',
      'media_mime_type',
      'media_path',
      'published_at',
      'title'
    ]::text[]
      and not (v_item ? 'published_by_clerk_user_id')
      and not (v_item ? 'withdrawn_by_clerk_user_id')
      and (v_feed -> 'announcements' -> 0 ->> 'id')::uuid = v_second,
    'public feed projection or newest-first ordering is invalid'
  );

  -- Account A reads independently. A stale later call cannot regress its
  -- durable cursor, while account B remains unread.
  v_state := public.get_announcement_navigation_state(v_reader_a);
  perform pg_temp.pr4_announcement_assert(
    (v_state ->> 'unread')::boolean
      and (v_state -> 'latest' ->> 'id')::uuid = v_second,
    'reader A should initially see the latest announcement as unread'
  );
  v_state := public.get_announcement_navigation_state(v_reader_b);
  perform pg_temp.pr4_announcement_assert(
    (v_state ->> 'unread')::boolean,
    'reader B should independently see the latest announcement as unread'
  );

  perform public.mark_announcement_seen(v_reader_a, v_second);
  perform public.mark_announcement_seen(v_reader_a, v_first);
  perform pg_temp.pr4_announcement_assert(
    (
      select read_state.last_seen_announcement_id = v_second
      from public.announcement_read_states as read_state
      where read_state.clerk_user_id = v_reader_a
    )
      and not (
        public.get_announcement_navigation_state(v_reader_a) ->> 'unread'
      )::boolean
      and (
        public.get_announcement_navigation_state(v_reader_b) ->> 'unread'
      )::boolean,
    'per-user state is not isolated and monotonic'
  );

  -- A genuinely newer publication reactivates unread. Withdrawing it keeps
  -- its audit row and makes unread fall back to the latest remaining active
  -- item, which reader A has already seen.
  perform pg_catalog.pg_sleep(0.005);
  v_result := public.publish_official_announcement(
    'PR4 rollback third',
    'Third rollback-only announcement.',
    null,
    null,
    null,
    null,
    v_actor
  );
  v_third := (v_result ->> 'id')::uuid;
  perform pg_temp.pr4_announcement_assert(
    (
      public.get_announcement_navigation_state(v_reader_a) ->> 'unread'
    )::boolean,
    'a newer publication did not reactivate reader A unread state'
  );

  v_result := public.withdraw_official_announcement(v_third, v_actor);
  perform pg_temp.pr4_announcement_assert(
    (v_result ->> 'withdrawn')::boolean
      and exists (
        select 1
        from public.announcements as announcement
        where announcement.id = v_third
          and announcement.withdrawn_at is not null
      )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          public.list_active_announcements() -> 'announcements'
        ) as items(item)
        where (item ->> 'id')::uuid = v_third
      )
      and (
        public.get_announcement_navigation_state(v_reader_a)
          -> 'latest' ->> 'id'
      )::uuid = v_second
      and not (
        public.get_announcement_navigation_state(v_reader_a) ->> 'unread'
      )::boolean
      and (
        public.get_announcement_navigation_state(v_reader_b) ->> 'unread'
      )::boolean,
    'withdrawal did not preserve the row or recalculate active unread state'
  );

  -- The PR 4 closure wrapper clears private attribution and read state while
  -- preserving the immutable announcement, then chains through the existing
  -- Web Push cleanup wrapper and original business closure.
  v_result := public.publish_official_announcement(
    'PR4 rollback closure',
    'Rollback-only account-closure announcement.',
    null,
    null,
    null,
    null,
    v_close_actor
  );
  v_close_announcement := (v_result ->> 'id')::uuid;
  perform public.mark_announcement_seen(v_close_actor, v_close_announcement);
  perform public.withdraw_official_announcement(
    v_close_announcement,
    v_close_actor
  );
  perform public.upsert_web_push_subscription(
    v_close_actor,
    v_push_endpoint,
    pg_catalog.repeat('A', 87),
    pg_catalog.repeat('B', 22),
    null
  );

  v_close_result := public.close_ironclad_player_account(v_close_actor);
  perform pg_temp.pr4_announcement_assert(
    (v_close_result ->> 'outcome') in ('deleted', 'not_found')
      and not exists (
        select 1
        from public.announcement_read_states as read_state
        where read_state.clerk_user_id = v_close_actor
      )
      and not exists (
        select 1
        from public.push_subscriptions as subscription
        where subscription.owner_clerk_user_id = v_close_actor
      )
      and exists (
        select 1
        from public.announcements as announcement
        where announcement.id = v_close_announcement
          and announcement.withdrawn_at is not null
          and announcement.published_by_clerk_user_id is null
          and announcement.withdrawn_by_clerk_user_id is null
      ),
    'account closure did not preserve content and clear private account state'
  );
end;
$$;

select pg_catalog.jsonb_build_object(
  'contract', 'official-announcements',
  'status', 'pass',
  'rollback_only', true
);

rollback;

do $$
declare
  v_baseline pr4_announcement_contract_baseline%rowtype;
begin
  select * into strict v_baseline
  from pr4_announcement_contract_baseline;

  perform pg_temp.pr4_announcement_assert(
    (select pg_catalog.count(*) from public.announcements) =
      v_baseline.announcement_count
      and (select pg_catalog.count(*) from public.announcement_read_states) =
        v_baseline.read_state_count
      and (select pg_catalog.count(*) from public.push_subscriptions) =
        v_baseline.push_subscription_count
      and not exists (
        select 1
        from public.announcements as announcement
        where announcement.published_by_clerk_user_id like 'pr4-contract-%'
          or announcement.withdrawn_by_clerk_user_id like 'pr4-contract-%'
      )
      and not exists (
        select 1
        from public.announcement_read_states as read_state
        where read_state.clerk_user_id like 'pr4-contract-%'
      )
      and not exists (
        select 1
        from public.push_subscriptions as subscription
        where subscription.owner_clerk_user_id like 'pr4-contract-%'
      ),
    'rollback did not restore the exact protected-row baseline'
  );
end;
$$;
