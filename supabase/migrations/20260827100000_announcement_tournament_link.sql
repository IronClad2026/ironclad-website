begin;

alter table public.announcements
  add column linked_tournament_id uuid;

alter table public.announcements
  add constraint announcements_linked_tournament_fk
  foreign key (linked_tournament_id)
  references public.tournaments(id)
  on delete set null;

comment on column public.announcements.linked_tournament_id is
  'Optional reference for the public View Tournament CTA. Hard-deleting the Tournament removes only the CTA and preserves the official announcement.';

create index announcements_linked_tournament_id_idx
  on public.announcements(linked_tournament_id)
  where linked_tournament_id is not null;

-- Keep the PR 4 feed function unchanged so migration 118 can be applied before
-- the PR 6 application deploy without changing the live feed projection.
create function public.list_active_announcements_with_tournament()
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

alter function public.list_active_announcements_with_tournament()
  owner to postgres;
revoke all on function public.list_active_announcements_with_tournament()
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_announcements_with_tournament()
  to service_role;

-- Preserve the original PR 4 publication function for general announcements.
-- The linked wrapper calls it inside the same transaction, then attaches the
-- validated Tournament reference. A failed FK update rolls back publication.
create function public.publish_official_announcement_with_tournament(
  p_title text,
  p_body text,
  p_media_kind text,
  p_media_path text,
  p_media_mime_type text,
  p_media_description text,
  p_actor_clerk_user_id text,
  p_linked_tournament_id uuid
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

  if p_linked_tournament_id is null then
    raise exception 'Select an existing Tournament'
      using errcode = '22023';
  end if;

  perform 1
  from public.tournaments as tournament
  where tournament.id = p_linked_tournament_id;

  if not found then
    raise exception 'Select an existing Tournament'
      using errcode = '23503';
  end if;

  v_publication := public.publish_official_announcement(
    p_title,
    p_body,
    p_media_kind,
    p_media_path,
    p_media_mime_type,
    p_media_description,
    p_actor_clerk_user_id
  );
  v_announcement_id := nullif(v_publication ->> 'id', '')::uuid;

  if v_announcement_id is null then
    raise exception 'Announcement publication is unavailable'
      using errcode = 'P0001';
  end if;

  update public.announcements as announcement
  set linked_tournament_id = p_linked_tournament_id
  where announcement.id = v_announcement_id;

  if not found then
    raise exception 'Announcement publication is unavailable'
      using errcode = 'P0001';
  end if;

  return v_publication;
end;
$$;

alter function public.publish_official_announcement_with_tournament(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) owner to postgres;
revoke all on function public.publish_official_announcement_with_tournament(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.publish_official_announcement_with_tournament(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) to service_role;

commit;
