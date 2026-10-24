begin;

-- The legacy plain-text body and all legacy RPC projections remain unchanged.
-- No backfill: existing announcements keep body_document = NULL.
alter table public.announcements
  add column body_document jsonb;

alter table public.announcements
  add constraint announcements_body_document_check check (
    body_document is null
    or coalesce(
      pg_catalog.jsonb_typeof(body_document) = 'object'
      and body_document -> 'version' = '1'::jsonb
      and body_document - array['version', 'doc']::text[] = '{}'::jsonb
      and pg_catalog.jsonb_typeof(body_document -> 'doc') = 'object'
      and body_document -> 'doc' ->> 'type' = 'doc'
      and (body_document -> 'doc') - array['type', 'content']::text[] = '{}'::jsonb
      and pg_catalog.jsonb_typeof(body_document -> 'doc' -> 'content') = 'array'
      and pg_catalog.octet_length(body_document::text) <= 131072,
      false
    )
  );

comment on column public.announcements.body_document is
  'Optional version-1 rich document: {version:1,doc:{type:"doc",content:[]}}. The trusted server validates the complete node/mark/URL schema and derives body before atomic publication; readers must fall back to escaped body if unsupported. Existing plain-text announcements remain unchanged.';

-- Use a separate projection because older application parsers reject any
-- unexpected feed field. Applying this migration cannot change their contract.
create function public.list_active_announcements_with_tournament_v2()
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
          'body_document', announcement.body_document,
          'media_kind', announcement.media_kind,
          'media_path', announcement.media_path,
          'media_mime_type', announcement.media_mime_type,
          'media_description', announcement.media_description,
          'published_at', announcement.published_at,
          'linked_tournament_slug', tournament.slug
        )
        order by announcement.published_at desc, announcement.id desc
      ),
      '[]'::jsonb
    )
  )
  from public.announcements as announcement
  left join public.tournaments as tournament
    on tournament.id = announcement.linked_tournament_id
  where announcement.withdrawn_at is null;
$$;

alter function public.list_active_announcements_with_tournament_v2()
  owner to postgres;
revoke all on function public.list_active_announcements_with_tournament_v2()
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_announcements_with_tournament_v2()
  to service_role;

-- Preserve the existing publication boundary, account advisory lock, media
-- constraints and Tournament validation. Function calls and attachment share
-- one transaction: any rich-document constraint error rolls back the new row.
-- No direct INSERT or UPDATE privileges are granted to service_role.
create function public.publish_official_announcement_v2(
  p_title text,
  p_body text,
  p_body_document jsonb,
  p_media_kind text,
  p_media_path text,
  p_media_mime_type text,
  p_media_description text,
  p_actor_clerk_user_id text,
  p_linked_tournament_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_publication jsonb;
  v_announcement_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Announcement publication is unavailable'
      using errcode = '42501';
  end if;

  if p_body_document is null then
    raise exception 'Rich announcement content is required'
      using errcode = '22023';
  end if;

  if p_linked_tournament_id is null then
    v_publication := public.publish_official_announcement(
      p_title,
      p_body,
      p_media_kind,
      p_media_path,
      p_media_mime_type,
      p_media_description,
      p_actor_clerk_user_id
    );
  else
    v_publication := public.publish_official_announcement_with_tournament(
      p_title,
      p_body,
      p_media_kind,
      p_media_path,
      p_media_mime_type,
      p_media_description,
      p_actor_clerk_user_id,
      p_linked_tournament_id
    );
  end if;

  v_announcement_id := nullif(v_publication ->> 'id', '')::uuid;
  if v_announcement_id is null then
    raise exception 'Announcement publication is unavailable'
      using errcode = 'P0001';
  end if;

  update public.announcements as announcement
  set body_document = p_body_document
  where announcement.id = v_announcement_id
    and announcement.body_document is null;

  if not found then
    raise exception 'Announcement publication is unavailable'
      using errcode = 'P0001';
  end if;

  return v_publication;
end;
$$;

alter function public.publish_official_announcement_v2(
  text, text, jsonb, text, text, text, text, text, uuid
) owner to postgres;
revoke all on function public.publish_official_announcement_v2(
  text, text, jsonb, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.publish_official_announcement_v2(
  text, text, jsonb, text, text, text, text, text, uuid
) to service_role;

commit;
