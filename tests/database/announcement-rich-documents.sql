-- Rollback-only announcement rich-document contract. Run only in a disposable
-- local replay or the positively verified and explicitly approved Staging DB.
-- No external provider or Storage mutation; every synthetic row is rolled back.
set client_min_messages = warning;
set role postgres;

create temporary table announcement_rich_baseline on commit preserve rows as
select
  (select count(*) from public.announcements) as announcement_count,
  (select md5(coalesce(string_agg(to_jsonb(a)::text, '' order by a.id), ''))
   from public.announcements a) as announcement_digest,
  (select count(*) from public.announcement_read_states) as read_state_count,
  (select count(*) from public.notifications) as notification_count,
  (select count(*) from public.push_subscriptions) as push_subscription_count;

create function pg_temp.announcement_rich_assert(p_ok boolean, p_name text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'Announcement rich-document contract failed: %', p_name;
  end if;
end;
$$;

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local request.jwt.claims = '{"role":"service_role","sub":"announcement-rich-contract"}';

create temporary table announcement_rich_results(name text primary key);
create temporary table announcement_rich_state(name text primary key, value jsonb);
do $$ begin
  execute format('grant usage on schema %I to anon, authenticated, service_role',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end $$;
grant select, insert on announcement_rich_results to anon, authenticated, service_role;
grant select on announcement_rich_state to anon, authenticated, service_role;

create function pg_temp.announcement_rich_check(p_ok boolean, p_name text)
returns void language plpgsql as $$
begin
  perform pg_temp.announcement_rich_assert(p_ok, p_name);
  insert into announcement_rich_results values (p_name);
end;
$$;

create function pg_temp.announcement_rich_error(p_sql text, p_state text, p_name text)
returns void language plpgsql as $$
declare v_rejected boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'Announcement rich-document contract failed: %: expected %, got %',
        p_name, p_state, sqlstate;
    end if;
    v_rejected := true;
  end;
  perform pg_temp.announcement_rich_check(v_rejected, p_name);
end;
$$;

do $$
declare v_signature text; v_role text;
begin
  perform pg_temp.announcement_rich_check(exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.announcements'::regclass
      and attname = 'body_document' and atttypid = 'jsonb'::regtype
      and not attnotnull and not attisdropped
  ), 'nullable JSONB rich-document column');
  perform pg_temp.announcement_rich_check((
    select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
    where oid = 'public.announcements'::regclass
  ), 'announcement RLS stays enabled and forced');
  foreach v_signature in array array[
    'public.list_active_announcements_with_tournament_v2()',
    'public.publish_official_announcement_v2(text,text,jsonb,text,text,text,text,text,uuid)'
  ] loop
    perform pg_temp.announcement_rich_check(
      has_function_privilege('service_role', v_signature, 'EXECUTE'),
      'service role can execute ' || v_signature
    );
    foreach v_role in array array['anon', 'authenticated'] loop
      perform pg_temp.announcement_rich_check(
        not has_function_privilege(v_role, v_signature, 'EXECUTE'),
        v_role || ' cannot execute ' || v_signature
      );
    end loop;
    perform pg_temp.announcement_rich_check(exists (
      select 1 from pg_catalog.pg_proc
      where oid = v_signature::regprocedure
        and prosecdef and proconfig = array['search_path=pg_catalog']
        and proowner = 'postgres'::regrole
    ), 'safe owner and search path ' || v_signature);
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    perform pg_temp.announcement_rich_check(
      not has_table_privilege(v_role, 'public.announcements', 'INSERT')
      and not has_table_privilege(v_role, 'public.announcements', 'UPDATE')
      and not has_table_privilege(v_role, 'public.announcements', 'DELETE'),
      v_role || ' receives no direct announcement mutations'
    );
  end loop;
end;
$$;

do $$
declare
  v_run uuid := gen_random_uuid();
  v_actor text := 'announcement-rich-' || v_run::text;
  v_tournament uuid;
  v_slug text := 'announcement-rich-' || v_run::text;
  v_body text := E'見出し — IRONCLAD 🛡️\n\n\n\n\n\nFirst paragraph\nSecond line\n\n• Bullet';
  v_document jsonb := '{"version":1,"doc":{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"見出し — IRONCLAD 🛡️"}]},{"type":"paragraph"},{"type":"paragraph"},{"type":"paragraph","content":[{"type":"text","text":"First paragraph","marks":[{"type":"bold"},{"type":"italic"},{"type":"underline"}]},{"type":"hardBreak"},{"type":"text","text":"Second line"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Bullet","marks":[{"type":"link","attrs":{"href":"https://ironclad.example/%E5%A4%A7%E4%BC%9A?q=1&mode=2"}}]}]}]}]}]}}'::jsonb;
  v_legacy jsonb;
  v_legacy_linked jsonb;
  v_rich jsonb;
  v_linked jsonb;
  v_media jsonb;
  v_feed jsonb;
  v_before bigint;
  v_invalid jsonb;
  v_latest uuid;
begin
  perform pg_temp.announcement_rich_check(pg_try_advisory_xact_lock(
    hashtextextended('ironclad:announcement-rich-database-contract', 0)
  ), 'rich-document contract lock');

  -- Isolated synthetic Tournament: never modifies or reuses a real event.
  insert into public.tournaments (
    title, slug, format, status, description, banner_image_url, prize_pool,
    division_model_version
  ) values (
    'Rollback-only announcement rich-document fixture', v_slug, '1v1',
    'upcoming', 'Synthetic rollback fixture', '', '', 'four_division_v1'
  ) returning id into v_tournament;

  v_legacy := public.publish_official_announcement(
    'Legacy general ' || v_run, E'Legacy <script> is literal\n\nSpacing remains.',
    null, null, null, null, v_actor
  );
  v_legacy_linked := public.publish_official_announcement_with_tournament(
    'Legacy linked ' || v_run, 'Legacy linked plain text.',
    null, null, null, null, v_actor, v_tournament
  );
  v_rich := public.publish_official_announcement_v2(
    'Rich general ' || v_run, v_body, v_document,
    null, null, null, null, v_actor
  );
  v_linked := public.publish_official_announcement_v2(
    'Rich linked ' || v_run, v_body, v_document,
    null, null, null, null, v_actor, v_tournament
  );
  v_media := public.publish_official_announcement_v2(
    'Rich media ' || v_run, v_body, v_document,
    'image', 'media/' || v_run || '.png', 'image/png', 'Synthetic media description',
    v_actor, v_tournament
  );

  perform pg_temp.announcement_rich_check((
    select count(*) = 2 from public.announcements
    where id in ((v_legacy ->> 'id')::uuid, (v_legacy_linked ->> 'id')::uuid)
      and body_document is null
  ), 'old publishers still create untouched plain-text records');
  perform pg_temp.announcement_rich_check((
    select count(*) = 3 from public.announcements
    where id in ((v_rich ->> 'id')::uuid, (v_linked ->> 'id')::uuid, (v_media ->> 'id')::uuid)
      and body = v_body and body_document = v_document
      and published_by_clerk_user_id = v_actor
  ), 'Unicode repeated blank lines hard breaks and rich marks persist atomically');
  perform pg_temp.announcement_rich_check((
    select linked_tournament_id = v_tournament
      and media_kind = 'image' and media_mime_type = 'image/png'
      and media_description = 'Synthetic media description'
    from public.announcements where id = (v_media ->> 'id')::uuid
  ), 'rich publication preserves media and Tournament association');

  v_feed := public.list_active_announcements();
  perform pg_temp.announcement_rich_check(not exists (
    select 1 from jsonb_array_elements(v_feed -> 'announcements') item
    where item ? 'body_document' or item ? 'linked_tournament_slug'
  ), 'old general feed exact projection is unchanged');
  v_feed := public.list_active_announcements_with_tournament();
  perform pg_temp.announcement_rich_check(not exists (
    select 1 from jsonb_array_elements(v_feed -> 'announcements') item
    where item ? 'body_document'
  ), 'old linked feed exact projection is unchanged');
  perform pg_temp.announcement_rich_check(exists (
    select 1 from jsonb_array_elements(v_feed -> 'announcements') item
    where item ->> 'id' = v_linked ->> 'id' and item ->> 'body' = v_body
      and item ->> 'linked_tournament_slug' = v_slug
  ), 'old readers receive rich plain-text fallback and Tournament link');

  v_feed := public.list_active_announcements_with_tournament_v2();
  perform pg_temp.announcement_rich_check(exists (
    select 1 from jsonb_array_elements(v_feed -> 'announcements') item
    where item ->> 'id' = v_rich ->> 'id'
      and item -> 'body_document' = v_document and item ->> 'body' = v_body
      and (select count(*) from jsonb_object_keys(item)) = 10
      and not (item ?| array['published_by_clerk_user_id', 'withdrawn_by_clerk_user_id', 'linked_tournament_id'])
  ), 'v2 feed safely projects rich content with no private audit fields');
  perform pg_temp.announcement_rich_check(exists (
    select 1 from jsonb_array_elements(v_feed -> 'announcements') item
    where item ->> 'id' = v_legacy ->> 'id' and item -> 'body_document' = 'null'::jsonb
  ), 'v2 feed retains legacy null-document records');

  select count(*) into v_before from public.announcements;
  for v_invalid in select value from jsonb_array_elements('[null,{},[],{"version":2,"doc":{"type":"doc","content":[]}},{"version":"1","doc":{"type":"doc","content":[]}},{"version":1,"doc":{"type":"doc"}},{"version":1,"doc":{"type":"doc","content":null}},{"version":1,"doc":{"type":"paragraph","content":[]}},{"version":1,"doc":{"type":"doc","content":[]},"unexpected":true}]'::jsonb)
  loop
    perform pg_temp.announcement_rich_error(format(
      'select public.publish_official_announcement_v2(%L,%L,%L::jsonb,null,null,null,null,%L)',
      'Invalid rich document', 'Must roll back', v_invalid::text, v_actor
    ), '23514', 'reject malformed envelope ' || v_invalid::text);
  end loop;
  perform pg_temp.announcement_rich_error(format(
    'select public.publish_official_announcement_v2(%L,%L,null,null,null,null,null,%L)',
    'Missing rich document', 'Must roll back', v_actor
  ), '22023', 'reject SQL NULL document on rich publisher');
  perform pg_temp.announcement_rich_error(format(
    'select public.publish_official_announcement_v2(%L,%L,%L::jsonb,null,null,null,null,%L)',
    'Oversize rich document', 'Must roll back',
    jsonb_build_object('version', 1, 'doc', jsonb_build_object('type', 'doc', 'content',
      jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content',
        jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat('a', 131073)))))))::text,
    v_actor
  ), '23514', 'reject oversized JSONB document');
  perform pg_temp.announcement_rich_error(format(
    'select public.publish_official_announcement_v2(%L,%L,%L::jsonb,null,null,null,null,%L)',
    'Oversize fallback', repeat('x', 10001), v_document::text, v_actor
  ), '23514', 'retain legacy ten thousand character body limit');
  perform pg_temp.announcement_rich_error(format(
    'select public.publish_official_announcement_v2(%L,%L,%L::jsonb,null,null,null,null,%L,%L::uuid)',
    'Missing tournament', 'Must roll back', v_document::text, v_actor, gen_random_uuid()
  ), '23503', 'reject missing Tournament atomically');
  perform pg_temp.announcement_rich_error(format(
    'select public.publish_official_announcement_v2(%L,%L,%L::jsonb,%L,%L,%L,%L,%L)',
    'Invalid media', 'Must roll back', v_document::text,
    'image', 'unsafe/path.png', 'image/png', 'Invalid path', v_actor
  ), '23514', 'retain canonical media path constraints');
  perform pg_temp.announcement_rich_check((select count(*) from public.announcements) = v_before,
    'all failed rich publications roll back the original insert');

  v_latest := (public.get_latest_active_announcement() -> 'latest' ->> 'id')::uuid;
  perform pg_temp.announcement_rich_check(
    (public.get_announcement_navigation_state(v_actor) ->> 'unread')::boolean,
    'rich publications retain unread navigation behavior');
  perform public.mark_announcement_seen(v_actor, v_latest);
  perform pg_temp.announcement_rich_check(
    not (public.get_announcement_navigation_state(v_actor) ->> 'unread')::boolean,
    'existing mark-seen RPC handles rich announcements');
  perform pg_temp.announcement_rich_check(
    (public.withdraw_official_announcement((v_linked ->> 'id')::uuid, v_actor) ->> 'withdrawn')::boolean,
    'existing withdrawal RPC handles rich announcements');
  perform pg_temp.announcement_rich_check(not exists (
    select 1 from jsonb_array_elements(
      public.list_active_announcements_with_tournament_v2() -> 'announcements'
    ) item where item ->> 'id' = v_linked ->> 'id'
  ), 'withdrawn rich announcement leaves public feed');
  perform pg_temp.announcement_rich_check((
    select body_document = v_document and linked_tournament_id = v_tournament
      and withdrawn_at is not null from public.announcements
    where id = (v_linked ->> 'id')::uuid
  ), 'withdrawal preserves rich document and historical association');
  perform pg_temp.announcement_rich_check(
    (select count(*) from public.notifications) = (select notification_count from announcement_rich_baseline)
    and (select count(*) from public.push_subscriptions) = (select push_subscription_count from announcement_rich_baseline),
    'publication emits no ordinary notification or push side effects');
  insert into announcement_rich_state values ('document', v_document);
  insert into announcement_rich_state values ('body', to_jsonb(v_body));
end;
$$;

set local role anon;
select pg_temp.announcement_rich_error(
  'select public.list_active_announcements_with_tournament_v2()', '42501',
  'anonymous cannot invoke v2 feed directly');
select pg_temp.announcement_rich_error(
  'select public.publish_official_announcement_v2(''Forbidden'',''Forbidden'',''{}''::jsonb,null,null,null,null,''forbidden'')',
  '42501', 'anonymous cannot invoke v2 publisher');
reset role;
set local role authenticated;
select pg_temp.announcement_rich_error(
  'select public.publish_official_announcement_v2(''Forbidden'',''Forbidden'',''{}''::jsonb,null,null,null,null,''forbidden'')',
  '42501', 'authenticated cannot invoke v2 publisher');
reset role;
set local role service_role;
select pg_temp.announcement_rich_check(
  public.publish_official_announcement_v2(
    'Actual service-role rich publisher',
    (select value #>> '{}' from announcement_rich_state where name = 'body'),
    (select value from announcement_rich_state where name = 'document'),
    null, null, null, null, 'announcement-rich-actual-service-role'
  ) ->> 'id' is not null,
  'actual service-role v2 publication succeeds');
select pg_temp.announcement_rich_check(
  jsonb_typeof(public.list_active_announcements_with_tournament_v2() -> 'announcements') = 'array',
  'actual service-role v2 read succeeds');
select pg_temp.announcement_rich_error(
  'update public.announcements set body_document = null', '42501',
  'service role still cannot update announcement records directly');
reset role;

select jsonb_build_object('suite', 'announcement-rich-documents', 'status', 'PASS', 'passed', count(*))
from announcement_rich_results;
rollback;

select pg_temp.announcement_rich_assert(
  (select count(*) from public.announcements) = baseline.announcement_count
  and (select md5(coalesce(string_agg(to_jsonb(a)::text, '' order by a.id), ''))
       from public.announcements a) = baseline.announcement_digest
  and (select count(*) from public.announcement_read_states) = baseline.read_state_count
  and (select count(*) from public.notifications) = baseline.notification_count
  and (select count(*) from public.push_subscriptions) = baseline.push_subscription_count,
  'rollback restores every pre-existing announcement and read/notification counts'
) from announcement_rich_baseline baseline;
