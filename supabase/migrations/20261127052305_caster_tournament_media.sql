begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Legacy public readers only select rows with published=true. A caster's
-- publication always goes through the visibility-aware relationship below.
alter table public.tournament_media
  add column caster_managed boolean not null default false,
  add constraint tournament_media_caster_legacy_hidden check (not caster_managed or not published);

create function ironclad_private.caster_media_protect_canonical()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if current_user <> 'postgres' and (
    (tg_op <> 'INSERT' and old.caster_managed) or (tg_op <> 'DELETE' and new.caster_managed)
  ) then
    raise exception 'Caster-managed media requires its authorized workflow' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function ironclad_private.caster_media_protect_canonical() from public, anon, authenticated, service_role;
create trigger caster_media_protect_canonical before insert or update or delete on public.tournament_media
for each row execute function ironclad_private.caster_media_protect_canonical();

create table ironclad_private.caster_media_links (
  id uuid primary key,
  media_id uuid unique references public.tournament_media(id) on delete set null,
  application_id uuid not null references ironclad_private.caster_memberships(application_id),
  -- Snapshot IDs and labels preserve audit meaning after tournament or bracket deletion.
  tournament_id uuid not null,
  division_id uuid,
  match_id uuid,
  tournament_title text not null,
  tournament_slug_snapshot text not null,
  division_name text,
  match_label text,
  url_digest bytea not null check (octet_length(url_digest) = 32),
  published boolean not null default true,
  published_at timestamptz,
  moderation_status text not null default 'visible' check (moderation_status in ('visible','hidden','removed')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint caster_media_links_owner_url_unique unique(application_id,url_digest),
  check (media_id is null or media_id = id),
  check (match_id is null or division_id is not null),
  check ((division_id is null) = (division_name is null)),
  check ((match_id is null) = (match_label is null)),
  check (not published or published_at is not null)
);
create index caster_media_links_owner_updated on ironclad_private.caster_media_links(application_id,updated_at desc,id desc);
create index caster_media_links_public_tournament on ironclad_private.caster_media_links(tournament_id,published_at desc,id desc)
  where published and moderation_status = 'visible';
create index caster_media_links_admin_updated on ironclad_private.caster_media_links(updated_at desc,id desc);

create table ironclad_private.caster_media_events (
  id bigint generated always as identity primary key,
  link_id uuid not null references ironclad_private.caster_media_links(id),
  version integer not null check (version > 0),
  action text not null check (action in ('create','edit','publish','unpublish','hide','remove','correct')),
  actor text not null,
  reason text check (char_length(reason) between 1 and 2000),
  snapshot jsonb not null,
  created_at timestamptz not null,
  unique(link_id,version)
);
alter table ironclad_private.caster_media_links enable row level security;
alter table ironclad_private.caster_media_events enable row level security;
revoke all on ironclad_private.caster_media_links, ironclad_private.caster_media_events,
  ironclad_private.caster_media_events_id_seq from public, anon, authenticated, service_role;

create function ironclad_private.caster_media_target(p_tournament_id uuid,p_division_id uuid,p_match_id uuid)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare v_target jsonb;
begin
  v_target := ironclad_private.caster_phase4_target(p_tournament_id,p_division_id,p_match_id);
  if v_target is null or v_target->>'tournament_status' in ('cancelled','voided')
    or (p_division_id is not null and v_target->>'division_public' is distinct from 'true')
  then return null; end if;
  return v_target || jsonb_build_object('tournament_slug',(
    select slug from public.tournaments where id=p_tournament_id
  ));
end;
$$;

create function ironclad_private.caster_media_owner_application(p_actor text)
returns uuid language plpgsql set search_path = pg_catalog as $$
declare v_application uuid;
begin
  -- Match the Phase 3 moderator's order. Hold the membership stable through writes.
  select id into v_application from ironclad_private.caster_applications
  where owner_clerk_user_id = p_actor and status = 'approved' for share;
  if not found then return null; end if;
  perform 1 from ironclad_private.caster_memberships
  where application_id = v_application and status = 'active' for share;
  if not found then return null; end if;
  return v_application;
end;
$$;

create view ironclad_private.caster_media_current with (security_invoker = true) as
select l.*,
  coalesce(tm.title, historical.value->>'title') as title,
  coalesce(tm.url, historical.value->>'url') as url,
  case when tm.id is not null then tm.description else historical.value->>'description' end as description,
  coalesce(tm.media_type, historical.value->>'media_type') as media_type,
  coalesce(t.slug,l.tournament_slug_snapshot) as tournament_slug,
  (tm.id is not null and t.id is not null and t.status not in ('cancelled','voided')
    and (l.division_id is null or d.launched_at is not null)
    and (l.match_id is null or (m.id is not null and tm.match_id = l.match_id))) as target_available,
  case when l.match_id is not null then 'match' when l.division_id is not null then 'division' else 'tournament' end as scope
from ironclad_private.caster_media_links l
left join public.tournament_media tm on tm.id = l.media_id and tm.caster_managed and tm.tournament_id = l.tournament_id
left join public.tournaments t on t.id = tm.tournament_id
left join public.tournament_brackets d on d.id = l.division_id and d.tournament_id = t.id
left join public.tournament_matches m on m.id = l.match_id and exists (
  select from public.generated_brackets g join public.bracket_rounds r on r.generated_bracket_id = g.id
  where g.tournament_bracket_id = d.id and g.id = m.generated_bracket_id and r.id = m.round_id
)
left join lateral (
  select e.snapshot as value from ironclad_private.caster_media_events e
  where l.media_id is null and e.link_id = l.id order by e.version desc limit 1
) historical on true;
revoke all on ironclad_private.caster_media_current from public, anon, authenticated, service_role;

create function ironclad_private.caster_media_row(p_row ironclad_private.caster_media_current)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id',p_row.id,'version',p_row.version,'title',p_row.title,'url',p_row.url,'description',p_row.description,
    'media_type',p_row.media_type,'tournament_id',p_row.tournament_id,'tournament_title',p_row.tournament_title,
    'tournament_slug',p_row.tournament_slug,'division_id',p_row.division_id,'division_name',p_row.division_name,
    'match_id',p_row.match_id,'match_label',p_row.match_label,'scope',p_row.scope,'published',p_row.published,
    'published_at',p_row.published_at,'moderation_status',p_row.moderation_status,
    'created_at',p_row.created_at,'updated_at',p_row.updated_at,'target_available',p_row.target_available,
    'publicly_visible',p_row.published and p_row.moderation_status='visible' and p_row.target_available and exists (
      select from ironclad_private.caster_phase3_current_public p where p.application_id=p_row.application_id
    )
  );
$$;

create function ironclad_private.caster_media_public_row(p_row ironclad_private.caster_media_current)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id',p_row.id,'title',p_row.title,'url',p_row.url,'description',p_row.description,'media_type',p_row.media_type,
    'tournament_id',p_row.tournament_id,'tournament_title',p_row.tournament_title,'tournament_slug',p_row.tournament_slug,
    'division_id',p_row.division_id,'division_name',p_row.division_name,'match_id',p_row.match_id,
    'match_label',p_row.match_label,'scope',p_row.scope,'published',true,'published_at',p_row.published_at,
    'created_at',p_row.created_at,'updated_at',p_row.updated_at,'caster_managed',true
  );
$$;

create function ironclad_private.caster_media_tournaments()
returns jsonb language sql stable set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'slug',t.slug)
    order by t.created_at desc,t.id desc),'[]'::jsonb)
  from (select id,title,slug,created_at from public.tournaments
    where status not in ('cancelled','voided') order by created_at desc,id desc limit 200) t;
$$;

create function ironclad_private.caster_media_available_contexts(p_tournament_id uuid)
returns jsonb language plpgsql set search_path = pg_catalog as $$
begin
  if ironclad_private.caster_media_target(p_tournament_id,null,null) is null then
    return jsonb_build_object('status','target_unavailable');
  end if;
  return jsonb_build_object('status','ok',
    'divisions',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name,d.id),'[]'::jsonb)
      from public.tournament_brackets d where d.tournament_id = p_tournament_id and d.launched_at is not null),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'division_id',d.id,
      'label',r.name || ' · ' || m.match_number::text) order by d.name,r.round_number,m.match_number,m.id),'[]'::jsonb)
      from public.tournament_brackets d join public.generated_brackets g on g.tournament_bracket_id = d.id
      join public.bracket_rounds r on r.generated_bracket_id = g.id
      join public.tournament_matches m on m.round_id = r.id and m.generated_bracket_id = g.id
      where d.tournament_id = p_tournament_id and d.launched_at is not null));
end;
$$;

create function public.caster_media_owner(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application uuid;
  v_rows jsonb;
  v_published_count bigint;
  v_covered_tournaments jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  v_application := ironclad_private.caster_media_owner_application(p_actor);
  if v_application is null then return jsonb_build_object('status','not_found'); end if;
  select coalesce(jsonb_agg(ironclad_private.caster_media_row(c) order by c.updated_at desc,c.id desc),'[]'::jsonb)
    into v_rows from (select * from ironclad_private.caster_media_current
    where application_id = v_application order by updated_at desc,id desc limit 200) c;
  -- Overview facts are independent of the capped editor list and use the
  -- same live scope and profile visibility requirements as the public reads.
  select count(*),coalesce(jsonb_agg(distinct c.tournament_id order by c.tournament_id),'[]'::jsonb)
    into v_published_count,v_covered_tournaments
  from ironclad_private.caster_media_current c
  join ironclad_private.caster_phase3_current_public p on p.application_id=c.application_id
  where c.application_id=v_application and c.published and c.moderation_status='visible'
    and c.target_available and ironclad_private.caster_phase4_valid_url(c.url,true);
  return jsonb_build_object('status','ok','media',v_rows,'tournaments',ironclad_private.caster_media_tournaments(),
    'published_count',v_published_count,'covered_tournament_ids',v_covered_tournaments);
end;
$$;

create function public.caster_media_contexts(p_actor text,p_tournament_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if ironclad_private.caster_media_owner_application(p_actor) is null then
    return jsonb_build_object('status','not_found');
  end if;
  return ironclad_private.caster_media_available_contexts(p_tournament_id);
end;
$$;

create function public.caster_media_admin_contexts(p_actor text,p_tournament_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  return ironclad_private.caster_media_available_contexts(p_tournament_id);
end;
$$;

create function public.caster_media_save(
  p_actor text,p_media_id uuid,p_expected_version integer,p_tournament_id uuid,p_division_id uuid,p_match_id uuid,
  p_title text,p_url text,p_description text,p_action text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application uuid;
  v_link ironclad_private.caster_media_links%rowtype;
  v_row ironclad_private.caster_media_current%rowtype;
  v_id uuid := coalesce(p_media_id,gen_random_uuid());
  v_title text := nullif(btrim(p_title),'');
  v_description text := nullif(btrim(p_description),'');
  v_target jsonb;
  v_digest bytea;
  v_constraint text;
  v_now timestamptz;
  v_operation text;
  v_profile ironclad_private.caster_profiles%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  v_application := ironclad_private.caster_media_owner_application(p_actor);
  if v_application is null then return jsonb_build_object('status','not_found'); end if;
  if p_action is null or p_action not in ('save','unpublish')
    or (p_media_id is null and (p_action <> 'save' or p_expected_version is not null))
    or (p_media_id is not null and coalesce(p_expected_version,0) < 1)
  then return jsonb_build_object('status','invalid'); end if;

  if p_media_id is not null then
    select * into v_link from ironclad_private.caster_media_links where id = p_media_id and application_id = v_application;
    if not found or v_link.media_id is null then return jsonb_build_object('status','not_found'); end if;
  end if;
  if p_action = 'save' then
    select * into v_profile from ironclad_private.caster_profiles where application_id=v_application for share;
    if v_profile.hidden then return jsonb_build_object('status','moderated'); end if;
    if v_profile.publication_id is null then return jsonb_build_object('status','profile_required'); end if;
    if p_url is null or not ironclad_private.caster_phase4_valid_url(p_url,true)
      or v_title is null or char_length(v_title) > 160 or v_title ~ '[[:cntrl:]]'
      or char_length(v_description) > 500 or replace(replace(v_description,chr(10),''),chr(13),'') ~ '[[:cntrl:]]'
    then return jsonb_build_object('status','invalid'); end if;
    -- Hold both old and new tournament parents before taking a linked row lock.
    perform 1 from public.tournaments where id in (p_tournament_id,v_link.tournament_id) order by id for share;
    v_target := ironclad_private.caster_media_target(p_tournament_id,p_division_id,p_match_id);
    if v_target is null then return jsonb_build_object('status','target_unavailable'); end if;
    v_digest := sha256(convert_to(p_url,'UTF8'));
  end if;

  if p_media_id is not null then
    select * into v_link from ironclad_private.caster_media_links
    where id = p_media_id and application_id = v_application for update;
    if not found or v_link.media_id is null then return jsonb_build_object('status','not_found'); end if;
    if v_link.moderation_status <> 'visible' then return jsonb_build_object('status','moderated'); end if;
    if v_link.version is distinct from p_expected_version then return jsonb_build_object('status','conflict'); end if;
  end if;
  v_now := clock_timestamp();

  begin
    if p_media_id is null then
      -- The canonical table defaults and its update trigger use transaction
      -- time. Publication/audit timestamps remain separately clock-owned.
      insert into public.tournament_media(id,tournament_id,title,url,media_type,description,match_id,published,caster_managed)
      values(v_id,p_tournament_id,v_title,p_url,case when p_match_id is null then 'video' else 'match_cast' end,
        v_description,p_match_id,false,true);
      insert into ironclad_private.caster_media_links(id,media_id,application_id,tournament_id,division_id,match_id,
        tournament_title,tournament_slug_snapshot,division_name,match_label,url_digest,published_at,created_at,updated_at)
      values(v_id,v_id,v_application,p_tournament_id,p_division_id,p_match_id,v_target->>'tournament_title',
        v_target->>'tournament_slug',v_target->>'division_name',v_target->>'match_label',v_digest,v_now,v_now,v_now);
      v_operation := 'create';
    elsif p_action = 'unpublish' then
      if not v_link.published then
        select * into v_row from ironclad_private.caster_media_current where id = v_id;
        return jsonb_build_object('status','ok','media',ironclad_private.caster_media_row(v_row));
      end if;
      update ironclad_private.caster_media_links set published=false,version=version+1,updated_at=v_now where id=v_id;
      v_operation := 'unpublish';
    else
      update public.tournament_media set tournament_id=p_tournament_id,title=v_title,url=p_url,
        media_type=case when p_match_id is null then 'video' else 'match_cast' end,description=v_description,match_id=p_match_id
      where id=v_id and caster_managed;
      update ironclad_private.caster_media_links set tournament_id=p_tournament_id,division_id=p_division_id,match_id=p_match_id,
        tournament_title=v_target->>'tournament_title',tournament_slug_snapshot=v_target->>'tournament_slug',
        division_name=v_target->>'division_name',match_label=v_target->>'match_label',
        url_digest=v_digest,published=true,published_at=case when published then published_at else v_now end,
        version=version+1,updated_at=v_now where id=v_id;
      v_operation := case when v_link.published then 'edit' else 'publish' end;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'caster_media_links_owner_url_unique' then raise; end if;
    return jsonb_build_object('status','duplicate');
  end;

  select * into v_row from ironclad_private.caster_media_current where id = v_id;
  insert into ironclad_private.caster_media_events(link_id,version,action,actor,snapshot,created_at)
  values(v_id,v_row.version,v_operation,p_actor,ironclad_private.caster_media_row(v_row),v_now);
  return jsonb_build_object('status','ok','media',ironclad_private.caster_media_row(v_row));
end;
$$;

create function public.caster_media_admin_list(p_actor text,p_offset integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_offset integer := coalesce(p_offset,0);
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if v_offset not between 0 and 100000 then return jsonb_build_object('status','invalid'); end if;
  with picked as materialized (
    select id from ironclad_private.caster_media_links order by updated_at desc,id desc limit 26 offset v_offset
  )
  select coalesce(jsonb_agg(ironclad_private.caster_media_row(c) || jsonb_build_object(
    'application_id',c.application_id,'caster_display_name',data.item->>'display_name',
    'events',(select coalesce(jsonb_agg(jsonb_build_object('action',event.action,'created_at',event.created_at,
      'actor',event.actor,'reason',event.reason) order by event.version desc),'[]'::jsonb)
      from (select action,created_at,actor,reason,version from ironclad_private.caster_media_events
        where link_id=c.id order by version desc limit 10) event)
  ) order by c.updated_at desc,c.id desc),'[]'::jsonb) into v_rows
  from picked join ironclad_private.caster_media_current c on c.id=picked.id
  join ironclad_private.caster_applications a on a.id=c.application_id
  join ironclad_private.caster_memberships m on m.application_id=a.id
  left join ironclad_private.caster_profiles p on p.application_id = a.id
  cross join lateral (select ironclad_private.caster_phase3_admin_data(a,m.status,p) as item) data;
  return jsonb_build_object('status','ok','media',case when jsonb_array_length(v_rows)=26 then v_rows-25 else v_rows end,
    'tournaments',ironclad_private.caster_media_tournaments(),
    'has_more',jsonb_array_length(v_rows)=26);
end;
$$;

create function public.caster_media_admin_moderate(
  p_actor text,p_media_id uuid,p_expected_version integer,p_action text,p_tournament_id uuid,p_division_id uuid,p_match_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_reason text := nullif(btrim(p_reason),'');
  v_link ironclad_private.caster_media_links%rowtype;
  v_row ironclad_private.caster_media_current%rowtype;
  v_target jsonb;
  v_now timestamptz;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if p_action is null or p_action not in ('hide','remove','correct') or coalesce(p_expected_version,0)<1
    or v_reason is null or char_length(v_reason)>2000 then return jsonb_build_object('status','invalid'); end if;
  select * into v_link from ironclad_private.caster_media_links where id=p_media_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if exists(select from ironclad_private.caster_applications where id=v_link.application_id and owner_clerk_user_id=p_actor) then
    return jsonb_build_object('status','locked');
  end if;
  if p_action='correct' then
    perform 1 from public.tournaments where id in (p_tournament_id,v_link.tournament_id) order by id for share;
    v_target := ironclad_private.caster_media_target(p_tournament_id,p_division_id,p_match_id);
    if v_target is null then return jsonb_build_object('status','target_unavailable'); end if;
  end if;
  select * into v_link from ironclad_private.caster_media_links where id=p_media_id for update;
  if v_link.version is distinct from p_expected_version then return jsonb_build_object('status','conflict'); end if;
  if v_link.moderation_status='removed' or (p_action='hide' and v_link.moderation_status='hidden')
    or (p_action='correct' and v_link.media_id is null) then return jsonb_build_object('status','locked'); end if;
  v_now := clock_timestamp();
  if p_action='correct' then
    update public.tournament_media set tournament_id=p_tournament_id,match_id=p_match_id,
      media_type=case when p_match_id is null then 'video' else 'match_cast' end where id=v_link.media_id and caster_managed;
    update ironclad_private.caster_media_links set tournament_id=p_tournament_id,division_id=p_division_id,match_id=p_match_id,
      tournament_title=v_target->>'tournament_title',tournament_slug_snapshot=v_target->>'tournament_slug',
      division_name=v_target->>'division_name',match_label=v_target->>'match_label',
      version=version+1,updated_at=v_now where id=p_media_id;
  else
    update ironclad_private.caster_media_links set moderation_status=case p_action when 'hide' then 'hidden' else 'removed' end,
      version=version+1,updated_at=v_now where id=p_media_id;
  end if;
  select * into v_row from ironclad_private.caster_media_current where id=p_media_id;
  insert into ironclad_private.caster_media_events(link_id,version,action,actor,reason,snapshot,created_at)
  values(p_media_id,v_row.version,p_action,p_actor,v_reason,ironclad_private.caster_media_row(v_row),v_now);
  return jsonb_build_object('status','ok','media',ironclad_private.caster_media_row(v_row));
end;
$$;

create function public.caster_media_public_tournaments(p_tournament_ids uuid[],p_include_casters boolean default true)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_tournament_ids is null or cardinality(p_tournament_ids) not between 1 and 100 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(rows.item order by rows.visible_at desc,rows.id desc),'[]'::jsonb) from (
    select tm.id,tm.created_at as visible_at,jsonb_build_object(
      'id',tm.id,'tournament_id',tm.tournament_id,'title',tm.title,'url',tm.url,'media_type',tm.media_type,
      'description',tm.description,'match_id',tm.match_id,'published',tm.published,'created_at',tm.created_at,'updated_at',tm.updated_at
    ) as item from public.tournament_media tm
      where tm.tournament_id=any(p_tournament_ids) and tm.published and not tm.caster_managed
    union all
    select c.id,c.published_at,ironclad_private.caster_media_public_row(c) || jsonb_build_object(
      'caster_slug',p.slug,'caster_display_name',p.display_name)
      from ironclad_private.caster_media_current c
      join ironclad_private.caster_phase3_current_public p on p.application_id=c.application_id
      where p_include_casters is true and c.tournament_id=any(p_tournament_ids) and c.published
        and c.moderation_status='visible' and c.target_available and ironclad_private.caster_phase4_valid_url(c.url,true)
  ) rows);
end;
$$;

create function public.caster_media_public_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return (select coalesce(jsonb_agg(ironclad_private.caster_media_public_row(c)
      order by c.published_at desc,c.id desc),'[]'::jsonb) from (
    select c.* from ironclad_private.caster_media_current c
    join ironclad_private.caster_phase3_current_public p on p.application_id=c.application_id
    where p.slug=p_slug and c.published and c.moderation_status='visible' and c.target_available
      and ironclad_private.caster_phase4_valid_url(c.url,true)
    order by c.published_at desc,c.id desc limit 200
  ) c);
end;
$$;

-- Keep the audited legacy correction logic private and expose exactly one
-- historic operation. No public caller can create or confirm old schedules.
alter function public.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text)
  set schema ironclad_private;
revoke all on function ironclad_private.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_admin_assign(text,uuid[],uuid,uuid,uuid,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_admin_conflict(text,uuid,uuid,uuid,uuid), public.caster_phase4_public_schedules(uuid[]),
  public.caster_phase4_owner(text) from public, anon, authenticated, service_role;

create function public.caster_media_owner_verified_history(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application uuid;
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  v_application := ironclad_private.caster_media_owner_application(p_actor);
  if v_application is null then return jsonb_build_object('status','not_found'); end if;
  select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(c,false) order by c.covered_at desc,c.id desc),'[]'::jsonb)
    into v_rows from (select * from ironclad_private.caster_phase4_current
    where application_id=v_application and status='completed' and verified_at is not null
    order by covered_at desc,id desc limit 200) c;
  return jsonb_build_object('status','ok','assignments',v_rows);
end;
$$;

create function public.caster_media_public_verified_tournaments(p_tournament_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_tournament_ids is null or cardinality(p_tournament_ids) not between 1 and 100 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(c,false) || jsonb_build_object(
    'caster',jsonb_build_object('slug',p.slug,'publication_id',p.id,'display_name',p.display_name,'avatar',p.avatar)
  ) order by c.tournament_id,c.covered_at desc,c.id),'[]'::jsonb)
  from ironclad_private.caster_phase4_current c
  join ironclad_private.caster_phase3_current_public p on p.application_id=c.application_id
  where c.tournament_id=any(p_tournament_ids) and c.status='completed' and c.verified_at is not null
    and c.target_available and c.scope_public and c.tournament_status not in ('cancelled','voided'));
end;
$$;

create function public.caster_media_correct_verified_history(
  p_actor text,p_assignment_id uuid,p_expected_version integer,p_covered_at timestamptz,
  p_broadcast_url text,p_recording_url text,p_media_id uuid,p_reason text
) returns jsonb language sql security definer set search_path = pg_catalog as $$
  select ironclad_private.caster_phase4_admin_save(p_actor,p_assignment_id,p_expected_version,null,null,null,null,
    'correct',null,p_covered_at,p_broadcast_url,p_recording_url,p_media_id,false,p_reason);
$$;

revoke all on function ironclad_private.caster_media_target(uuid,uuid,uuid),
  ironclad_private.caster_media_owner_application(text), ironclad_private.caster_media_row(ironclad_private.caster_media_current),
  ironclad_private.caster_media_public_row(ironclad_private.caster_media_current),
  ironclad_private.caster_media_tournaments(),ironclad_private.caster_media_available_contexts(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.caster_media_owner(text), public.caster_media_contexts(text,uuid), public.caster_media_admin_contexts(text,uuid),
  public.caster_media_save(text,uuid,integer,uuid,uuid,uuid,text,text,text,text), public.caster_media_admin_list(text,integer),
  public.caster_media_admin_moderate(text,uuid,integer,text,uuid,uuid,uuid,text), public.caster_media_public_tournaments(uuid[],boolean),
  public.caster_media_public_profile(text), public.caster_media_correct_verified_history(text,uuid,integer,timestamptz,text,text,uuid,text),
  public.caster_media_owner_verified_history(text),public.caster_media_public_verified_tournaments(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.caster_media_owner(text), public.caster_media_contexts(text,uuid), public.caster_media_admin_contexts(text,uuid),
  public.caster_media_save(text,uuid,integer,uuid,uuid,uuid,text,text,text,text), public.caster_media_admin_list(text,integer),
  public.caster_media_admin_moderate(text,uuid,integer,text,uuid,uuid,uuid,text), public.caster_media_public_tournaments(uuid[],boolean),
  public.caster_media_public_profile(text), public.caster_media_correct_verified_history(text,uuid,integer,timestamptz,text,text,uuid,text),
  public.caster_media_owner_verified_history(text),public.caster_media_public_verified_tournaments(uuid[])
  to service_role;

notify pgrst, 'reload schema';
commit;
