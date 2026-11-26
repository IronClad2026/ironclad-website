begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table ironclad_private.caster_profiles (
  application_id uuid primary key references ironclad_private.caster_memberships(application_id),
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object'),
  version integer not null default 0 check (version >= 0),
  show_country boolean not null default false,
  slug text unique check (
    char_length(slug) between 3 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug <> 'invitation'
  ),
  publication_id uuid,
  hidden boolean not null default false,
  moderation_version integer not null default 0 check (moderation_version >= 0),
  updated_at timestamptz not null default now(),
  check ((slug is null) = (publication_id is null))
);

-- This is the public field allowlist at rest. Private application and working
-- drafts never become public snapshots.
create table ironclad_private.caster_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references ironclad_private.caster_profiles(application_id),
  version integer not null check (version >= 0),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar uuid not null references ironclad_private.caster_application_media(id),
  banner uuid references ironclad_private.caster_application_media(id),
  languages jsonb not null check (jsonb_typeof(languages) = 'array' and jsonb_array_length(languages) between 1 and 8),
  games jsonb not null check (jsonb_typeof(games) = 'array' and jsonb_array_length(games) <= 10),
  bio jsonb not null check (jsonb_typeof(bio) = 'object'),
  experience text not null check (char_length(experience) <= 1000),
  links jsonb not null check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6),
  videos jsonb not null check (jsonb_typeof(videos) = 'array' and jsonb_array_length(videos) <= 3),
  gallery uuid[] not null check (cardinality(gallery) <= 6),
  country text check (country ~ '^[A-Z]{2}$'),
  published_at timestamptz not null,
  unique (application_id, id),
  unique (application_id, version)
);
alter table ironclad_private.caster_profiles add constraint caster_profiles_current_revision
  foreign key (application_id, publication_id) references ironclad_private.caster_profile_revisions(application_id, id);

create index caster_profiles_visible_slug on ironclad_private.caster_profiles(slug)
  where hidden = false and publication_id is not null;

create table ironclad_private.caster_profile_moderation_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references ironclad_private.caster_profiles(application_id),
  publication_id uuid,
  version integer not null check (version > 0),
  action text not null check (action in ('hide', 'restore', 'suspend', 'reinstate')),
  reason text not null check (char_length(reason) between 1 and 2000),
  actor text not null,
  created_at timestamptz not null default now(),
  foreign key (application_id, publication_id) references ironclad_private.caster_profile_revisions(application_id, id),
  unique (application_id, version)
);

alter table ironclad_private.caster_profiles enable row level security;
alter table ironclad_private.caster_profile_revisions enable row level security;
alter table ironclad_private.caster_profile_moderation_events enable row level security;
revoke all on ironclad_private.caster_profiles, ironclad_private.caster_profile_revisions,
  ironclad_private.caster_profile_moderation_events from public, anon, authenticated, service_role;

create function ironclad_private.caster_phase3_seed(p_application ironclad_private.caster_applications)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select case when d.value = '{}'::jsonb then d.value
    else jsonb_set(d.value, '{discord}', '""'::jsonb) end
  from (select coalesce(
    (select r.draft from ironclad_private.caster_application_revisions r
      where r.application_id = p_application.id and r.id = p_application.submitted_revision_id),
    p_application.draft, '{}'::jsonb
  ) as value) d;
$$;

create function ironclad_private.caster_phase3_owner_data(
  p_application ironclad_private.caster_applications,
  p_membership_status text,
  p_profile ironclad_private.caster_profiles
) returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'draft', case when p_membership_status = 'active'
      then coalesce(p_profile.draft, ironclad_private.caster_phase3_seed(p_application)) else '{}'::jsonb end,
    'version', coalesce(p_profile.version, 0),
    'show_country', coalesce(p_profile.show_country, false),
    'slug', p_profile.slug,
    'publication_id', p_profile.publication_id,
    'published_version', (select r.version from ironclad_private.caster_profile_revisions r
      where r.application_id = p_profile.application_id and r.id = p_profile.publication_id),
    'hidden', coalesce(p_profile.hidden, false),
    'membership_status', p_membership_status
  );
$$;

create function public.caster_phase3_owner(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_profile ironclad_private.caster_profiles%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications
  where owner_clerk_user_id = p_actor and status = 'approved';
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select m.status into v_status from ironclad_private.caster_memberships m where m.application_id = v_application.id for share;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_profile from ironclad_private.caster_profiles where application_id = v_application.id;
  return jsonb_build_object('status', 'ok',
    'profile', ironclad_private.caster_phase3_owner_data(v_application, v_status, v_profile));
end;
$$;

create function public.caster_phase3_save(p_actor text, p_version integer, p_draft jsonb, p_show_country boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_profile ironclad_private.caster_profiles%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications
  where owner_clerk_user_id = p_actor and status = 'approved' for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select m.status into v_status from ironclad_private.caster_memberships m where m.application_id = v_application.id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_status <> 'active' then return jsonb_build_object('status', 'locked'); end if;
  if p_show_country is null or not ironclad_private.caster_phase2_valid_draft(v_application.id, p_draft) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_profile from ironclad_private.caster_profiles where application_id = v_application.id for update;
  if coalesce(v_profile.version, 0) is distinct from p_version then return jsonb_build_object('status', 'conflict'); end if;
  insert into ironclad_private.caster_profiles (application_id, draft, version, show_country)
  values (v_application.id, jsonb_set(p_draft, '{discord}', '""'::jsonb), 1, p_show_country)
  on conflict (application_id) do update set
    draft = excluded.draft, version = caster_profiles.version + 1, show_country = excluded.show_country,
    updated_at = clock_timestamp()
  returning * into v_profile;
  return jsonb_build_object('status', 'ok',
    'profile', ironclad_private.caster_phase3_owner_data(v_application, v_status, v_profile));
end;
$$;

-- The editor owns full document parsing. Reject unexpected data inside the
-- public rich-text tree here as well, including linked marks and private attrs.
create function ironclad_private.caster_phase3_public_bio(p_bio jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  with recursive nodes(value, depth) as (
    select p_bio->'doc', 0
    union all
    select child, n.depth + 1 from nodes n,
      lateral jsonb_array_elements(
        case when jsonb_typeof(n.value->'content') = 'array' then n.value->'content' else '[]'::jsonb end
      ) child
    where n.depth < 13
  )
  select coalesce(
    jsonb_typeof(p_bio) = 'object' and p_bio - array['version','doc'] = '{}'::jsonb
      and p_bio->'version' = '1'::jsonb and p_bio#>>'{doc,type}' = 'doc'
      and count(*) <= 2048 and bool_and(coalesce(
        depth < 13 and jsonb_typeof(value) = 'object'
          and (not (value ? 'content') or jsonb_typeof(value->'content') = 'array')
          and (not (value ? 'marks') or (
            jsonb_typeof(value->'marks') = 'array' and not exists (
              select from jsonb_array_elements(
                case when jsonb_typeof(value->'marks') = 'array' then value->'marks' else '[]'::jsonb end
              ) mark where mark not in ('{"type":"bold"}'::jsonb, '{"type":"italic"}'::jsonb, '{"type":"underline"}'::jsonb)
            )
          ))
          and case value->>'type'
            when 'doc' then depth = 0 and value - array['type','content'] = '{}'::jsonb
            when 'paragraph' then value - array['type','content'] = '{}'::jsonb
            when 'heading' then value - array['type','attrs','content'] = '{}'::jsonb
              and value->'attrs' in ('{"level":3}'::jsonb, '{"level":4}'::jsonb)
            when 'bulletList' then value - array['type','content'] = '{}'::jsonb
            when 'orderedList' then value - array['type','attrs','content'] = '{}'::jsonb
              and jsonb_typeof(value->'attrs') = 'object' and (value->'attrs') - 'start' = '{}'::jsonb
              and value#>>'{attrs,start}' ~ '^[1-9][0-9]{0,5}$|^1000000$'
              and jsonb_typeof(value#>'{attrs,start}') = 'number'
            when 'listItem' then value - array['type','content'] = '{}'::jsonb
            when 'text' then value - array['type','text','marks'] = '{}'::jsonb and jsonb_typeof(value->'text') = 'string'
            when 'hardBreak' then value - array['type','marks'] = '{}'::jsonb
            else false end, false))
      and sum(char_length(value->>'text')) <= 2000
      and bool_or(value->>'type' = 'text' and nullif(btrim(value->>'text'), '') is not null),
    false)
  from nodes;
$$;

create function public.caster_phase3_publish(p_actor text, p_version integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_profile ironclad_private.caster_profiles%rowtype;
  v_draft jsonb;
  v_revision uuid;
  v_slug text;
  v_now timestamptz;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications
  where owner_clerk_user_id = p_actor and status = 'approved' for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select m.status into v_status from ironclad_private.caster_memberships m where m.application_id = v_application.id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_status <> 'active' then return jsonb_build_object('status', 'locked'); end if;
  select * into v_profile from ironclad_private.caster_profiles where application_id = v_application.id for update;
  if coalesce(v_profile.hidden, false) then return jsonb_build_object('status', 'hidden'); end if;
  if coalesce(v_profile.version, 0) is distinct from p_version then return jsonb_build_object('status', 'conflict'); end if;

  v_draft := coalesce(v_profile.draft, ironclad_private.caster_phase3_seed(v_application));
  if not ironclad_private.caster_phase2_valid_draft(v_application.id, v_draft) then
    return jsonb_build_object('status', 'incomplete');
  end if;
  if nullif(btrim(v_draft->>'displayName'), '') is null or v_draft->>'avatar' is null
    or jsonb_array_length(v_draft->'languages') = 0
    or (coalesce(v_profile.show_country, false) and nullif(v_draft->>'country','') is null)
    or not ironclad_private.caster_phase3_public_bio(v_draft->'bio')
    or exists (
      select from jsonb_array_elements_text(v_draft->'videos') url
      where url !~ '^https://(www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}|www[.]twitch[.]tv/videos/[0-9]{1,24}|clips[.]twitch[.]tv/[A-Za-z0-9_-]{1,120})$'
    ) then
    return jsonb_build_object('status', 'incomplete');
  end if;
  if exists (
    select from ironclad_private.caster_profile_revisions r where r.id = v_profile.publication_id and r.version = p_version
  ) then
    return jsonb_build_object('status', 'ok',
      'profile', ironclad_private.caster_phase3_owner_data(v_application, v_status, v_profile));
  end if;

  if v_profile.application_id is null then
    insert into ironclad_private.caster_profiles (application_id, draft)
    values (v_application.id, v_draft) returning * into v_profile;
  end if;
  v_slug := v_profile.slug;
  if v_slug is null then
    v_slug := trim(both '-' from left(regexp_replace(lower(v_draft->>'displayName'), '[^a-z0-9]+', '-', 'g'), 45));
    if char_length(v_slug) < 3 or v_slug = 'invitation' then v_slug := 'caster'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ironclad:caster-slug:' || v_slug, 0));
    if exists (select from ironclad_private.caster_profiles where slug = v_slug) then
      v_slug := v_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
    end if;
  end if;
  v_now := clock_timestamp();
  insert into ironclad_private.caster_profile_revisions (
    application_id, version, display_name, avatar, banner, languages, games, bio, experience, links, videos,
    gallery, country, published_at
  ) values (
    v_application.id, p_version, btrim(v_draft->>'displayName'), (v_draft->>'avatar')::uuid,
    (v_draft->>'banner')::uuid, v_draft->'languages', v_draft->'games', v_draft->'bio', v_draft->>'experience',
    v_draft->'links', v_draft->'videos',
    array(select value::uuid from jsonb_array_elements_text(v_draft->'gallery')),
    case when v_profile.show_country then v_draft->>'country' end, v_now
  ) returning id into v_revision;
  update ironclad_private.caster_profiles set slug = v_slug, publication_id = v_revision, updated_at = v_now
  where application_id = v_application.id returning * into v_profile;
  return jsonb_build_object('status', 'ok',
    'profile', ironclad_private.caster_phase3_owner_data(v_application, v_status, v_profile));
end;
$$;

create view ironclad_private.caster_phase3_current_public with (security_invoker = true) as
select p.slug, r.*
from ironclad_private.caster_profiles p
join ironclad_private.caster_profile_revisions r on r.application_id = p.application_id and r.id = p.publication_id
join ironclad_private.caster_memberships m on m.application_id = p.application_id
join ironclad_private.caster_applications a on a.id = p.application_id
where not p.hidden and m.status = 'active' and a.status = 'approved'
  and ironclad_private.patch2_account_state(a.owner_clerk_user_id) in ('active-player', 'no-player');
revoke all on ironclad_private.caster_phase3_current_public from public, anon, authenticated, service_role;

create function ironclad_private.caster_phase3_platforms(p_links jsonb, p_videos jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(distinct platform order by platform), '[]'::jsonb) from (
    select case lower(substring(url from '^https://([^/?#]+)'))
      when 'youtube.com' then 'youtube' when 'www.youtube.com' then 'youtube'
      when 'm.youtube.com' then 'youtube' when 'youtu.be' then 'youtube'
      when 'twitch.tv' then 'twitch' when 'www.twitch.tv' then 'twitch' when 'clips.twitch.tv' then 'twitch'
      when 'discord.com' then 'discord' when 'discord.gg' then 'discord'
      when 'instagram.com' then 'instagram' when 'www.instagram.com' then 'instagram'
      when 'tiktok.com' then 'tiktok' when 'www.tiktok.com' then 'tiktok'
      when 'facebook.com' then 'facebook' when 'www.facebook.com' then 'facebook'
      when 'x.com' then 'x' when 'www.x.com' then 'x' when 'twitter.com' then 'x'
      else 'website' end as platform
    from (
      select value->>'url' as url from jsonb_array_elements(p_links)
      union all select value from jsonb_array_elements_text(p_videos)
    ) urls
  ) platforms;
$$;

create function ironclad_private.caster_phase3_public_data(
  p_slug text, p_revision ironclad_private.caster_profile_revisions, p_full boolean
) returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'slug', p_slug, 'publication_id', p_revision.id, 'display_name', p_revision.display_name,
    'avatar', p_revision.avatar, 'languages', p_revision.languages, 'games', p_revision.games,
    'platforms', ironclad_private.caster_phase3_platforms(p_revision.links, p_revision.videos)
  ) || case when p_full then jsonb_build_object(
    'banner', p_revision.banner, 'bio', p_revision.bio, 'experience', p_revision.experience,
    'links', p_revision.links, 'videos', p_revision.videos, 'gallery', p_revision.gallery, 'country', p_revision.country
  ) else '{}'::jsonb end;
$$;

create function public.caster_phase3_directory(p_offset integer, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return (
    select coalesce(jsonb_agg(ironclad_private.caster_phase3_public_data(p.slug, r, false) order by p.slug), '[]'::jsonb)
    from (
      select slug, application_id, id from ironclad_private.caster_phase3_current_public
      order by slug offset least(greatest(coalesce(p_offset, 0), 0), 100000)
      limit least(greatest(coalesce(p_limit, 25), 1), 100)
    ) p join ironclad_private.caster_profile_revisions r on r.application_id = p.application_id and r.id = p.id
  );
end;
$$;

create function public.caster_phase3_public_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return (
    select ironclad_private.caster_phase3_public_data(p.slug, r, true)
    from ironclad_private.caster_phase3_current_public p
    join ironclad_private.caster_profile_revisions r on r.application_id = p.application_id and r.id = p.id
    where p.slug = p_slug
  );
end;
$$;

create function public.caster_phase3_public_media(p_slug text, p_publication_id uuid, p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return (
    select jsonb_build_object('object_path', m.object_path, 'content_type', m.content_type)
    from ironclad_private.caster_phase3_current_public p
    join ironclad_private.caster_application_media m on m.application_id = p.application_id and m.id = p_media_id
    where p.slug = p_slug and p.id = p_publication_id and m.state = 'ready'
      and (p.avatar = m.id or p.banner = m.id or m.id = any(p.gallery))
  );
end;
$$;

create function ironclad_private.caster_phase3_admin_data(
  p_application ironclad_private.caster_applications,
  p_membership_status text,
  p_profile ironclad_private.caster_profiles
) returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'application_id', p_application.id, 'owner_clerk_user_id', p_application.owner_clerk_user_id,
    'display_name', coalesce(
      (select r.display_name from ironclad_private.caster_profile_revisions r where r.id = p_profile.publication_id),
      nullif(p_profile.draft->>'displayName',''),
      nullif(ironclad_private.caster_phase3_seed(p_application)->>'displayName','')
    ),
    'membership_status', p_membership_status, 'hidden', coalesce(p_profile.hidden, false),
    'slug', p_profile.slug, 'publication_id', p_profile.publication_id,
    'moderation_version', coalesce(p_profile.moderation_version, 0),
    'closed', ironclad_private.patch2_account_state(p_application.owner_clerk_user_id) not in ('active-player', 'no-player')
  );
$$;

create function public.caster_phase3_admin_list(p_actor text, p_status text, p_query text, p_offset integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_query text := nullif(lower(btrim(p_query)), '');
  v_offset integer := coalesce(p_offset, 0);
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if (p_status is not null and p_status not in ('all','active','suspended','inactive'))
    or char_length(v_query) > 100 or v_offset not between 0 and 10000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(jsonb_agg(item order by sort_at desc, id desc), '[]'::jsonb)
  into v_rows from (
    select coalesce(p.updated_at, m.granted_at) as sort_at, a.id, ir.item
    from ironclad_private.caster_memberships m
    join ironclad_private.caster_applications a on a.id = m.application_id and a.status = 'approved'
    left join ironclad_private.caster_profiles p on p.application_id = m.application_id
    cross join lateral (select ironclad_private.caster_phase3_admin_data(a, m.status, p) as item) ir
    where (p_status is null or p_status = 'all' or m.status = p_status)
      and (v_query is null or strpos(lower(a.owner_clerk_user_id), v_query) > 0
        or strpos(lower(ir.item->>'display_name'), v_query) > 0 or strpos(p.slug, v_query) > 0)
    order by sort_at desc, a.id desc limit 26 offset v_offset
  ) entries;
  return jsonb_build_object('status', 'ok',
    'casters', case when jsonb_array_length(v_rows) = 26 then v_rows - 25 else v_rows end,
    'has_more', jsonb_array_length(v_rows) = 26);
end;
$$;

create function public.caster_phase3_admin_detail(p_actor text, p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_profile ironclad_private.caster_profiles%rowtype;
  v_revision ironclad_private.caster_profile_revisions%rowtype;
  v_history jsonb;
  v_publications jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications
  where id = p_application_id and status = 'approved';
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select m.status into v_status from ironclad_private.caster_memberships m
  where m.application_id = p_application_id for share;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_profile from ironclad_private.caster_profiles where application_id = p_application_id;
  select * into v_revision from ironclad_private.caster_profile_revisions where id = v_profile.publication_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'action', e.action, 'reason', e.reason, 'actor', e.actor,
    'created_at', e.created_at, 'publication_id', e.publication_id
  ) order by e.version desc), '[]'::jsonb) into v_history
  from (select * from ironclad_private.caster_profile_moderation_events
    where application_id = p_application_id order by version desc limit 100) e;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'version', r.version, 'display_name', r.display_name, 'created_at', r.published_at
  ) order by r.version desc), '[]'::jsonb) into v_publications
  from (select id, version, display_name, published_at from ironclad_private.caster_profile_revisions
    where application_id = p_application_id order by version desc limit 100) r;
  return jsonb_build_object('status', 'ok',
    'caster', ironclad_private.caster_phase3_admin_data(v_application, v_status, v_profile),
    'publication', case when v_revision.id is not null
      then ironclad_private.caster_phase3_public_data(v_profile.slug, v_revision, true) end,
    'history', v_history, 'publications', v_publications);
end;
$$;

create function public.caster_phase3_moderate(
  p_actor text, p_application_id uuid, p_expected_version integer, p_action text, p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_reason text := nullif(btrim(p_reason), '');
  v_application ironclad_private.caster_applications%rowtype;
  v_profile ironclad_private.caster_profiles%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if p_action is null or p_action not in ('hide','restore','suspend','reinstate') or v_reason is null or char_length(v_reason) > 2000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_application from ironclad_private.caster_applications
  where id = p_application_id and status = 'approved' for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_application.owner_clerk_user_id = p_actor then return jsonb_build_object('status', 'locked'); end if;
  if not ironclad_private.caster_phase1_open_account(v_application.owner_clerk_user_id) then
    return jsonb_build_object('status', 'closed');
  end if;
  select m.status into v_status from ironclad_private.caster_memberships m
  where m.application_id = p_application_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_profile from ironclad_private.caster_profiles where application_id = p_application_id for update;
  if coalesce(v_profile.moderation_version, 0) is distinct from p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  if (p_action = 'hide' and coalesce(v_profile.hidden, false))
    or (p_action = 'restore' and not coalesce(v_profile.hidden, false))
    or (p_action = 'suspend' and v_status <> 'active')
    or (p_action = 'reinstate' and v_status = 'active') then
    return jsonb_build_object('status', 'locked');
  end if;
  if v_profile.application_id is null then
    insert into ironclad_private.caster_profiles (application_id, draft)
    values (p_application_id, ironclad_private.caster_phase3_seed(v_application)) returning * into v_profile;
  end if;
  if p_action in ('suspend','reinstate') then
    v_status := case when p_action = 'suspend' then 'suspended' else 'active' end;
    update ironclad_private.caster_memberships set status = v_status where application_id = p_application_id;
  end if;
  update ironclad_private.caster_profiles set
    hidden = case p_action when 'hide' then true when 'restore' then false else hidden end,
    moderation_version = moderation_version + 1, updated_at = clock_timestamp()
  where application_id = p_application_id returning * into v_profile;
  insert into ironclad_private.caster_profile_moderation_events (
    application_id, publication_id, version, action, reason, actor
  ) values (p_application_id, v_profile.publication_id, v_profile.moderation_version, p_action, v_reason, p_actor);
  return jsonb_build_object('status', 'ok',
    'caster', ironclad_private.caster_phase3_admin_data(v_application, v_status, v_profile));
end;
$$;

-- Use the existing application/closure lock order on legacy draft and media
-- paths as well as the new Studio. FOR SHARE blocks concurrent suspension.
create function ironclad_private.caster_phase3_active_membership(p_application_id uuid)
returns boolean language plpgsql set search_path = pg_catalog as $$
declare v_status text;
begin
  select m.status into v_status from ironclad_private.caster_memberships m
  where m.application_id = p_application_id for share;
  return coalesce(v_status = 'active', false);
end;
$$;

create or replace function ironclad_private.caster_phase2_editable(p_application ironclad_private.caster_applications)
returns boolean language sql set search_path = pg_catalog as $$
  select case
    when p_application.status in ('draft', 'changes_requested') then true
    when p_application.status = 'approved' and p_application.invitation_id is null
      then ironclad_private.caster_phase3_active_membership(p_application.id)
    else false
  end;
$$;

create function ironclad_private.caster_phase3_media_editable(p_application ironclad_private.caster_applications)
returns boolean language sql set search_path = pg_catalog as $$
  select case when p_application.status = 'approved'
    then ironclad_private.caster_phase3_active_membership(p_application.id)
    else ironclad_private.caster_phase2_editable(p_application) end;
$$;

create or replace function public.caster_phase2_reserve_media(p_actor text, p_kind text, p_size integer, p_content_type text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_media ironclad_private.caster_application_media%rowtype;
  v_media_id uuid := gen_random_uuid();
  v_reserved bigint;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if p_kind is null or p_kind not in ('avatar', 'banner', 'gallery')
    or p_content_type is distinct from 'image/webp'
    or p_size is null or p_size < 1 or p_size > (case when p_kind = 'avatar' then 2097152 else 3145728 end) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not ironclad_private.caster_phase3_media_editable(v_application) then return jsonb_build_object('status', 'locked'); end if;
  if not ironclad_private.caster_phase1_rate_ok('phase2_media', sha256(convert_to(p_actor, 'UTF8')), interval '1 hour', 24) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select coalesce(sum(m.size), 0) into v_reserved from ironclad_private.caster_application_media m
  where m.application_id = v_application.id and (m.state <> 'failed' or exists (
    select from storage.objects o where o.bucket_id = 'caster-application-media' and o.name = m.object_path
  ));
  if v_reserved + p_size > 33554432 then return jsonb_build_object('status', 'quota_exceeded'); end if;
  insert into ironclad_private.caster_application_media (id, application_id, kind, object_path, size, content_type)
  values (v_media_id, v_application.id, p_kind, v_application.id::text || '/' || v_media_id::text || '.webp',
    p_size, p_content_type) returning * into v_media;
  return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
end;
$$;

create or replace function public.caster_phase2_finish_media(p_actor text, p_media_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_media ironclad_private.caster_application_media%rowtype;
  v_next text := case when p_ready then 'ready' else 'failed' end;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if p_ready is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_application.status = 'approved' and not ironclad_private.caster_phase3_active_membership(v_application.id) then
    return jsonb_build_object('status', 'locked');
  end if;
  select * into v_media from ironclad_private.caster_application_media
  where id = p_media_id and application_id = v_application.id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_media.state = v_next then
    return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
  end if;
  if v_media.state <> 'reserved' then return jsonb_build_object('status', 'conflict'); end if;
  if p_ready and not ironclad_private.caster_phase3_media_editable(v_application) then
    return jsonb_build_object('status', 'locked');
  end if;
  if p_ready and not exists (
    select from storage.objects where bucket_id = 'caster-application-media' and name = v_media.object_path
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update ironclad_private.caster_application_media set state = v_next
  where id = v_media.id returning * into v_media;
  return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
end;
$$;

create or replace function public.caster_phase2_get_media(p_actor text, p_media_id uuid, p_staff boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text;
  v_media ironclad_private.caster_application_media%rowtype;
  v_application ironclad_private.caster_applications%rowtype;
begin
  if p_staff is true then v_status := ironclad_private.caster_phase2_staff_state(p_actor);
  else v_status := ironclad_private.caster_phase2_actor_state(p_actor); end if;
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_media from ironclad_private.caster_application_media where id = p_media_id and state = 'ready';
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_application from ironclad_private.caster_applications where id = v_media.application_id;
  if p_staff is true then
    if not ironclad_private.caster_phase1_open_account(v_application.owner_clerk_user_id)
      or not (
        exists (
          select from ironclad_private.caster_application_revisions r where r.application_id = v_application.id
            and (r.draft->>'avatar' = v_media.id::text or r.draft->>'banner' = v_media.id::text
              or r.draft->'gallery' @> jsonb_build_array(v_media.id::text))
        ) or exists (
          select from ironclad_private.caster_profiles p join ironclad_private.caster_profile_revisions r
            on r.application_id = p.application_id and r.id = p.publication_id
          where p.application_id = v_application.id
            and (r.avatar = v_media.id or r.banner = v_media.id or v_media.id = any(r.gallery))
        )
      ) then return jsonb_build_object('status', 'not_found');
    end if;
  elsif v_application.owner_clerk_user_id is distinct from p_actor
    or (v_application.status = 'approved' and not ironclad_private.caster_phase3_active_membership(v_application.id)) then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
end;
$$;

revoke all on function ironclad_private.caster_phase3_seed(ironclad_private.caster_applications),
  ironclad_private.caster_phase3_owner_data(ironclad_private.caster_applications, text, ironclad_private.caster_profiles),
  ironclad_private.caster_phase3_public_bio(jsonb), ironclad_private.caster_phase3_platforms(jsonb, jsonb),
  ironclad_private.caster_phase3_public_data(text, ironclad_private.caster_profile_revisions, boolean),
  ironclad_private.caster_phase3_admin_data(ironclad_private.caster_applications, text, ironclad_private.caster_profiles),
  ironclad_private.caster_phase3_active_membership(uuid),
  ironclad_private.caster_phase3_media_editable(ironclad_private.caster_applications)
  from public, anon, authenticated, service_role;
revoke all on function public.caster_phase3_owner(text), public.caster_phase3_save(text, integer, jsonb, boolean),
  public.caster_phase3_publish(text, integer), public.caster_phase3_directory(integer, integer),
  public.caster_phase3_public_profile(text), public.caster_phase3_public_media(text, uuid, uuid),
  public.caster_phase3_admin_list(text, text, text, integer), public.caster_phase3_admin_detail(text, uuid),
  public.caster_phase3_moderate(text, uuid, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.caster_phase3_owner(text), public.caster_phase3_save(text, integer, jsonb, boolean),
  public.caster_phase3_publish(text, integer), public.caster_phase3_directory(integer, integer),
  public.caster_phase3_public_profile(text), public.caster_phase3_public_media(text, uuid, uuid),
  public.caster_phase3_admin_list(text, text, text, integer), public.caster_phase3_admin_detail(text, uuid),
  public.caster_phase3_moderate(text, uuid, integer, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
