begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- No schedule and no public control setter. A separate database-operator
-- decision is required before any write in the retention executor can run.
create table ironclad_private.caster_privacy_control (
  singleton boolean primary key default true check (singleton),
  irreversible_enabled boolean not null default false
);
insert into ironclad_private.caster_privacy_control (singleton) values (true);

create table ironclad_private.caster_privacy_holds (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('application', 'invitation')),
  target_id uuid not null,
  case_reference text not null check (case_reference ~ '^[A-Za-z0-9_-]{6,80}$'),
  purpose text not null check (purpose in ('appeal','dispute','legal_requirement','security')),
  created_at timestamptz not null default clock_timestamp(),
  review_at timestamptz not null,
  released_at timestamptz,
  check (review_at > created_at and (released_at is null or released_at >= created_at))
);
create index caster_privacy_open_holds on ironclad_private.caster_privacy_holds(target_kind,target_id)
  where released_at is null;

create table ironclad_private.caster_privacy_receipts (
  category text not null,
  record_key text not null,
  eligible_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp(),
  primary key (category,record_key,eligible_at)
);

create table ironclad_private.caster_privacy_media_retirements (
  media_id uuid primary key,
  application_id uuid not null,
  unreferenced_since timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  check (claimed_at is null or claimed_at >= unreferenced_since),
  check (completed_at is null or (claimed_at is not null and completed_at >= claimed_at))
);
create index caster_privacy_pending_media on ironclad_private.caster_privacy_media_retirements(application_id)
  where completed_at is null;

create table ironclad_private.caster_privacy_retired_slugs (
  digest bytea primary key check (octet_length(digest) = 32)
);

alter table ironclad_private.caster_privacy_control enable row level security;
alter table ironclad_private.caster_privacy_holds enable row level security;
alter table ironclad_private.caster_privacy_receipts enable row level security;
alter table ironclad_private.caster_privacy_media_retirements enable row level security;
alter table ironclad_private.caster_privacy_retired_slugs enable row level security;
revoke all on ironclad_private.caster_privacy_control,ironclad_private.caster_privacy_holds,
  ironclad_private.caster_privacy_receipts,ironclad_private.caster_privacy_media_retirements,
  ironclad_private.caster_privacy_retired_slugs from public,anon,authenticated,service_role;

create function ironclad_private.caster_privacy_enabled()
returns boolean language sql stable set search_path = pg_catalog as $$
  select coalesce((select irreversible_enabled from ironclad_private.caster_privacy_control where singleton),false);
$$;

create function ironclad_private.caster_privacy_lock_control()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  return null;
end;
$$;
create trigger caster_privacy_lock_control before insert or update or delete or truncate on ironclad_private.caster_privacy_control
for each statement execute function ironclad_private.caster_privacy_lock_control();

create function ironclad_private.caster_privacy_closed_at(p_actor text)
returns timestamptz language sql stable set search_path = pg_catalog as $$
  select least((select closed_at from ironclad_private.patch2_closed_accounts
      where subject_digest = sha256(convert_to(p_actor,'UTF8'))),
    (select min(account_closed_at) from public.players where clerk_user_id = p_actor));
$$;

create function ironclad_private.caster_privacy_held(p_application uuid,p_invitation uuid default null)
returns boolean language sql stable set search_path = pg_catalog as $$
  select exists(select from ironclad_private.caster_privacy_holds h where h.released_at is null and
    ((h.target_kind = 'application' and h.target_id = p_application) or
    (h.target_kind = 'invitation' and h.target_id = p_invitation)));
$$;

-- This command is operator-only and can be used while disposal is disabled.
-- The review date requires re-evaluation; it does not silently release a hold.
-- Once a Storage claim commits, deletion may already have reached the provider.
create function ironclad_private.caster_privacy_place_hold(
  p_kind text,p_id uuid,p_case text,p_purpose text,p_review_at timestamptz
) returns uuid language plpgsql set search_path = pg_catalog as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  if p_kind = 'application' then
    perform from ironclad_private.caster_applications where id = p_id for update;
    if not found or exists (select from ironclad_private.caster_privacy_media_retirements r
      where r.application_id = p_id and r.claimed_at is not null and r.completed_at is null) then
      raise exception 'Caster application unavailable for hold' using errcode = '55000';
    end if;
  elsif p_kind = 'invitation' then
    perform from ironclad_private.caster_phase1_invitations where id = p_id for update;
    if not found or exists (
      select from ironclad_private.caster_applications a
      join ironclad_private.caster_privacy_media_retirements r on r.application_id = a.id
      where a.invitation_id = p_id and r.claimed_at is not null and r.completed_at is null
    ) then
      raise exception 'Caster invitation unavailable for hold' using errcode = '55000';
    end if;
  else
    raise exception 'Invalid caster hold scope' using errcode = '22023';
  end if;
  insert into ironclad_private.caster_privacy_holds (target_kind,target_id,case_reference,purpose,review_at)
  values(p_kind,p_id,p_case,p_purpose,p_review_at) returning id into v_id;
  return v_id;
end;
$$;

create function ironclad_private.caster_privacy_release_hold(p_id uuid)
returns boolean language plpgsql set search_path = pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  update ironclad_private.caster_privacy_holds set released_at = clock_timestamp()
    where id = p_id and released_at is null;
  return found;
end;
$$;

create function ironclad_private.caster_privacy_draft_references(p_draft jsonb,p_media uuid)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(p_draft->>'avatar' = p_media::text or p_draft->>'banner' = p_media::text or
    p_draft->'gallery' @> jsonb_build_array(p_media::text),false);
$$;

create function ironclad_private.caster_privacy_media_referenced(p_application uuid,p_media uuid)
returns boolean language sql stable set search_path = pg_catalog as $$
  select exists(select from ironclad_private.caster_applications a where a.id = p_application
    and ironclad_private.caster_privacy_draft_references(a.draft,p_media))
    or exists(select from ironclad_private.caster_profiles p where p.application_id = p_application
    and ironclad_private.caster_privacy_draft_references(p.draft,p_media))
    or exists(select from ironclad_private.caster_application_revisions r where r.application_id = p_application
    and ironclad_private.caster_privacy_draft_references(r.draft,p_media))
    or exists(select from ironclad_private.caster_profile_revisions r where r.application_id = p_application
    and (r.avatar = p_media or r.banner = p_media or p_media = any(r.gallery)));
$$;

create function ironclad_private.caster_privacy_track_media(p_application uuid)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  -- Returning a reference cancels only an unclaimed timer. This is recomputed
  -- in the same application transaction as legitimate saved/public revisions.
  delete from ironclad_private.caster_privacy_media_retirements r
  where r.application_id = p_application and r.claimed_at is null
    and ironclad_private.caster_privacy_media_referenced(p_application,r.media_id);
  insert into ironclad_private.caster_privacy_media_retirements(media_id,application_id,unreferenced_since)
  select m.id,p_application,clock_timestamp()
  from ironclad_private.caster_application_media m where m.application_id = p_application
    and not ironclad_private.caster_privacy_media_referenced(m.application_id,m.id)
  on conflict (media_id) do nothing;
end;
$$;

create function ironclad_private.caster_privacy_track_media_trigger()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_app uuid;
begin
  if tg_table_name = 'caster_applications' then v_app := new.id;
  elsif tg_op = 'DELETE' then v_app := old.application_id;
  else v_app := new.application_id;
  end if;
  perform ironclad_private.caster_privacy_track_media(v_app);
  return null;
end;
$$;

create trigger caster_privacy_track_upload after insert on ironclad_private.caster_application_media
for each row execute function ironclad_private.caster_privacy_track_media_trigger();
create trigger caster_privacy_track_application after update of draft on ironclad_private.caster_applications
for each row when (old.draft is distinct from new.draft) execute function ironclad_private.caster_privacy_track_media_trigger();
create trigger caster_privacy_track_profile after insert or update of draft on ironclad_private.caster_profiles
for each row execute function ironclad_private.caster_privacy_track_media_trigger();
create trigger caster_privacy_track_app_revision after insert or delete or update of draft on ironclad_private.caster_application_revisions
for each row execute function ironclad_private.caster_privacy_track_media_trigger();
create trigger caster_privacy_track_public_revision after insert or delete or update of avatar,banner,gallery on ironclad_private.caster_profile_revisions
for each row execute function ironclad_private.caster_privacy_track_media_trigger();

-- Migration time is the conservative first observed unreferenced date for
-- older uploads. Existing assets and every existing reference remain intact.
insert into ironclad_private.caster_privacy_media_retirements(media_id, application_id, unreferenced_since)
select m.id,m.application_id,clock_timestamp() from ironclad_private.caster_application_media m
where not ironclad_private.caster_privacy_media_referenced(m.application_id,m.id);

create function ironclad_private.caster_privacy_protect_retired_slug()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.slug is not null and exists (select from ironclad_private.caster_privacy_retired_slugs s
    where s.digest = sha256(convert_to(new.slug,'UTF8'))) then
    new.slug := trim(trailing '-' from left(new.slug,45)) || '-' || left(replace(gen_random_uuid()::text,'-',''),16);
  end if;
  return new;
end;
$$;
create trigger caster_privacy_protect_retired_slug before insert or update of slug on ironclad_private.caster_profiles
for each row execute function ironclad_private.caster_privacy_protect_retired_slug();

create function public.caster_privacy_media_claim(p_actor text,p_media_ids uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_now timestamptz := clock_timestamp(); v_assets jsonb;
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor);
  if not ironclad_private.caster_privacy_enabled() then return jsonb_build_object('status','disabled'); end if;
  if coalesce(cardinality(p_media_ids),0) not between 1 and 30 or array_position(p_media_ids,null) is not null
    or cardinality(p_media_ids) <> (select count(distinct id) from unnest(p_media_ids) id) then
    return jsonb_build_object('status','invalid');
  end if;
  -- Closure, holds, saves, uploads and publication serialize ahead of the
  -- claim. Failed state prevents later saves and late upload completion from
  -- attaching an asset while removal in Storage is in flight.
  for v_id in select a.id from ironclad_private.caster_applications a where exists (
    select from ironclad_private.caster_privacy_media_retirements q where q.application_id = a.id and q.media_id = any(p_media_ids)
  ) order by a.id for update loop null; end loop;

  if exists (
    select from unnest(p_media_ids) requested(id)
    left join ironclad_private.caster_privacy_media_retirements q on q.media_id = requested.id
    left join ironclad_private.caster_applications a on a.id = q.application_id
    left join ironclad_private.caster_application_media m on m.id = requested.id and m.application_id = q.application_id
    where q.media_id is null or (q.completed_at is null and (a.id is null or m.id is null
      or q.unreferenced_since + interval '30 days' > v_now or ironclad_private.caster_privacy_held(a.id,a.invitation_id)
      or ironclad_private.caster_privacy_media_referenced(a.id,requested.id)))
  ) then return jsonb_build_object('status','blocked'); end if;

  update ironclad_private.caster_privacy_media_retirements set claimed_at = v_now
    where media_id = any(p_media_ids) and claimed_at is null and completed_at is null;
  update ironclad_private.caster_application_media set state = 'failed'
    where id = any(p_media_ids) and state <> 'failed';
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'path',m.object_path) order by m.id),'[]'::jsonb) into v_assets
  from ironclad_private.caster_application_media m join ironclad_private.caster_privacy_media_retirements q on q.media_id = m.id
  where m.id = any(p_media_ids) and q.claimed_at is not null and q.completed_at is null;
  return jsonb_build_object('status','ok','assets',v_assets);
end;
$$;

create function public.caster_privacy_media_finish(p_actor text,p_media_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_claim ironclad_private.caster_privacy_media_retirements%rowtype;
declare v_media ironclad_private.caster_application_media%rowtype;
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor);
  if not ironclad_private.caster_privacy_enabled() then return jsonb_build_object('status','disabled'); end if;
  if p_media_id is null then return jsonb_build_object('status','invalid'); end if;
  select * into v_claim from ironclad_private.caster_privacy_media_retirements where media_id = p_media_id;
  if not found or v_claim.claimed_at is null then return jsonb_build_object('status','blocked'); end if;
  if v_claim.completed_at is not null then return jsonb_build_object('status','ok'); end if;
  perform from ironclad_private.caster_applications where id = v_claim.application_id for update;
  select * into v_media from ironclad_private.caster_application_media where id = p_media_id;
  if not found or v_media.application_id <> v_claim.application_id or v_media.state <> 'failed'
    or ironclad_private.caster_privacy_media_referenced(v_claim.application_id,p_media_id) then
    return jsonb_build_object('status','blocked');
  end if;
  if exists(select from storage.objects where bucket_id = 'caster-application-media' and name = v_media.object_path) then
    return jsonb_build_object('status','storage_present');
  end if;
  delete from ironclad_private.caster_application_media where id = p_media_id;
  update ironclad_private.caster_privacy_media_retirements set completed_at = clock_timestamp() where media_id = p_media_id;
  return jsonb_build_object('status','ok');
end;
$$;

-- Only public competition context and day survive in the former entry. A
-- synthetic scope/day key never reuses an assignment or profile identifier.
create function public.caster_privacy_public_verified_tournaments(p_tournament_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if coalesce(cardinality(p_tournament_ids),0) not between 1 and 100 then return '[]'::jsonb; end if;
  return public.caster_media_public_verified_tournaments(p_tournament_ids) || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',md5(concat_ws('|','former-caster',scope,tournament_id,division_id,match_id,to_char(covered_day,'YYYYMMDD')))::uuid,
      'version',1,'scope',scope,'status','completed','former_caster',true,'caster',null,
      'tournament_id',tournament_id,'tournament_title',tournament_title,'tournament_slug',tournament_slug,
      'tournament_available',true,'target_available',true,'game',game,'division_id',division_id,
      'division_name',division_name,'match_id',match_id,'match_label',match_label,
      'covered_at',covered_day at time zone 'UTC','verified_at',verified_day at time zone 'UTC'
    ) order by tournament_id,covered_day desc,division_id,match_id),'[]'::jsonb) from (
      select c.tournament_id,c.division_id,c.match_id,c.scope,max(c.tournament_title) as tournament_title,
        max(c.tournament_slug) as tournament_slug,max(c.game) as game,max(c.division_name) as division_name,
        max(c.match_label) as match_label,date_trunc('day',c.covered_at at time zone 'UTC') as covered_day,
        min(date_trunc('day',c.verified_at at time zone 'UTC')) as verified_day
      from ironclad_private.caster_phase4_current c
      join ironclad_private.caster_applications a on a.id = c.application_id
      where c.tournament_id = any(p_tournament_ids) and c.status = 'completed' and c.verified_at is not null
        and c.target_available and c.scope_public and c.tournament_status not in ('cancelled','voided')
        and (ironclad_private.caster_privacy_closed_at(a.owner_clerk_user_id) is not null or exists (
          select from ironclad_private.caster_privacy_receipts r where r.category = 'closed_application' and r.record_key = a.id::text
        ))
      group by c.tournament_id,c.division_id,c.match_id,c.scope,date_trunc('day',c.covered_at at time zone 'UTC')
    ) former
  );
end;
$$;

create view ironclad_private.caster_privacy_candidates with (security_invoker = true) as
with applications as (
  select a.id,a.invitation_id,a.status,a.updated_at,m.status as membership,
    ironclad_private.caster_privacy_closed_at(a.owner_clerk_user_id) as closed_at,
    greatest(m.granted_at,(select max(e.created_at) from ironclad_private.caster_profile_moderation_events e
      where e.application_id = a.id and e.action = 'suspend')) as inactive_since
  from ironclad_private.caster_applications a
  left join ironclad_private.caster_memberships m on m.application_id = a.id
), candidates(category,record_key,application_id,invitation_id,eligible_at) as (
  select case when a.closed_at is not null then 'closed_application' else 'application' end,a.id::text,a.id,a.invitation_id,
    case when a.closed_at is not null then a.closed_at + interval '30 days'
      when a.status = 'rejected' then a.updated_at + interval '90 days'
      when a.status in ('draft','changes_requested') then a.updated_at + interval '120 days'
      when a.membership in ('inactive','suspended') then a.inactive_since + interval '90 days' end
  from applications a where not exists(select from ironclad_private.caster_privacy_receipts r
    where r.category = 'closed_application' and r.record_key = a.id::text)
  union all
  select 'invitation',i.id::text,a.id,i.id,case when i.claimed_at is null then coalesce(i.revoked_at,i.expires_at) + interval '90 days'
    when a.status in ('approved','rejected') then greatest(i.claimed_at,a.updated_at) + interval '90 days'
    when a.closed_at is not null then a.closed_at + interval '30 days' end
    from ironclad_private.caster_phase1_invitations i left join applications a on a.invitation_id = i.id
  union all
  select 'application_revision',r.id::text,a.id,a.invitation_id,
    (select min(later.submitted_at) from ironclad_private.caster_application_revisions later
      where later.application_id = r.application_id and later.version > r.version) + interval '90 days'
    from ironclad_private.caster_application_revisions r join ironclad_private.caster_applications a on a.id = r.application_id
    where a.submitted_revision_id is distinct from r.id and r.draft <> '{}'::jsonb
  union all
  select 'profile_revision',r.id::text,a.id,a.invitation_id,
    (select min(later.published_at) from ironclad_private.caster_profile_revisions later
      where later.application_id = r.application_id and later.version > r.version) + interval '90 days'
    from ironclad_private.caster_profile_revisions r join ironclad_private.caster_profiles p on p.application_id = r.application_id
    join applications a on a.id = r.application_id where p.publication_id is distinct from r.id
  union all
  select 'application_audit',e.id::text,a.id,a.invitation_id,e.created_at + interval '12 months'
    from ironclad_private.caster_application_events e join applications a on a.id = e.application_id
  union all
  select 'invitation_audit',e.id::text,a.id,e.invitation_id,e.created_at + interval '12 months'
    from ironclad_private.caster_phase1_invitation_events e left join applications a on a.invitation_id = e.invitation_id
  union all
  select 'profile_audit',e.id::text,a.id,a.invitation_id,e.created_at + interval '12 months'
    from ironclad_private.caster_profile_moderation_events e join applications a on a.id = e.application_id
  union all
  select 'coverage_audit',e.id::text,a.id,a.invitation_id,e.created_at + interval '12 months'
    from ironclad_private.caster_assignment_events e join ironclad_private.caster_assignments c on c.id = e.assignment_id
    join applications a on a.id = c.application_id
  union all
  select 'video_audit',e.id::text,a.id,a.invitation_id,e.created_at + interval '12 months'
    from ironclad_private.caster_media_events e join ironclad_private.caster_media_links l on l.id = e.link_id
    join applications a on a.id = l.application_id
  union all
  select 'video',l.id::text,a.id,a.invitation_id,l.updated_at + interval '90 days'
    from ironclad_private.caster_media_links l join applications a on a.id = l.application_id
    where l.media_id is not null and (not l.published or l.moderation_status <> 'visible')
  union all
  select 'media',q.media_id::text,a.id,a.invitation_id,q.unreferenced_since + interval '30 days'
    from ironclad_private.caster_privacy_media_retirements q join applications a on a.id = q.application_id
    where q.completed_at is null and not ironclad_private.caster_privacy_media_referenced(a.id,q.media_id)
)
select c.*,ironclad_private.caster_privacy_held(c.application_id,c.invitation_id) as held from candidates c
where c.eligible_at is not null and not exists (select from ironclad_private.caster_privacy_receipts r
  where r.category = c.category and r.record_key = c.record_key and r.eligible_at = c.eligible_at);

create function ironclad_private.caster_privacy_plan(p_as_of timestamptz,p_limit integer default 100)
returns table(category text,record_key text,eligible_at timestamptz,held boolean)
language sql stable set search_path = pg_catalog as $$
  select q.category,q.record_key,q.eligible_at,q.held from ironclad_private.caster_privacy_candidates q
  where q.eligible_at <= p_as_of
  order by q.held,q.eligible_at,q.category,q.record_key
  limit greatest(1,least(coalesce(p_limit,100),1000));
$$;

-- Retain only facts with a fixed schema. Older snapshots can otherwise contain
-- names, subject IDs, video URLs or free-form operator notes.
create function ironclad_private.caster_privacy_coverage_snapshot(p_snapshot jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_object_agg(k,v) from jsonb_each(p_snapshot) o(k,v) where k = any(array[
    'status','scope','version','tournament_id','division_id','match_id','covered_at','verified_at','target_available'
  ]);
$$;

create function ironclad_private.caster_privacy_erase_video(p_link uuid)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  -- The native Tournament Media route owns all rows without this marker.
  delete from public.tournament_media m using ironclad_private.caster_media_links l
    where l.id = p_link and l.media_id = m.id and m.caster_managed;
  if exists (select from ironclad_private.caster_media_links where id = p_link and media_id is not null) then
    raise exception 'Caster media cleanup received a nonmanaged row' using errcode = '23514';
  end if;
  update ironclad_private.caster_media_links set published = false,moderation_status = 'removed',
    url_digest = sha256(convert_to('retired-video:' || id::text,'UTF8')) where id = p_link;
  update ironclad_private.caster_media_events set snapshot = jsonb_build_object('retained',true),reason = null
    where link_id = p_link;
end;
$$;

create function ironclad_private.caster_privacy_erase_application(p_application uuid,p_closed boolean)
returns void language plpgsql set search_path = pg_catalog as $$
declare v_app ironclad_private.caster_applications%rowtype; v_link uuid; v_closed_at timestamptz;
begin
  select * into strict v_app from ironclad_private.caster_applications where id = p_application for update;
  if p_closed then
    v_closed_at := ironclad_private.caster_privacy_closed_at(v_app.owner_clerk_user_id);
    if v_closed_at is null then raise exception 'Caster closure evidence unavailable' using errcode = '55000'; end if;
  end if;
  update ironclad_private.caster_applications set draft = '{}',draft_version = draft_version + 1,feedback = null,
    owner_clerk_user_id = case when p_closed then 'retired:' || id::text else owner_clerk_user_id end
    where id = p_application;
  update ironclad_private.caster_application_revisions set draft = '{}'
    where application_id = p_application and draft <> '{}'::jsonb;
  update ironclad_private.caster_application_events set feedback = null,
    actor = case when p_closed and actor = v_app.owner_clerk_user_id then 'redacted' else actor end where application_id = p_application;
  update ironclad_private.caster_profile_moderation_events set publication_id = null where application_id = p_application;
  insert into ironclad_private.caster_privacy_retired_slugs(digest)
    select sha256(convert_to(p.slug,'UTF8')) from ironclad_private.caster_profiles p where p.application_id = p_application and p.slug is not null
    on conflict do nothing;
  update ironclad_private.caster_profiles set draft = '{}',version = version + 1,show_country = false,slug = null,publication_id = null
    where application_id = p_application;
  delete from ironclad_private.caster_profile_revisions where application_id = p_application;

  if not p_closed then return; end if;
  -- Closure ended legitimate access immediately, even though the immutable
  -- references were held in escrow until this authorised erasure.
  update ironclad_private.caster_privacy_media_retirements set unreferenced_since = least(unreferenced_since,v_closed_at)
    where application_id = p_application and claimed_at is null;
  update ironclad_private.caster_memberships set status = 'inactive',
    granted_by = case when granted_by = v_app.owner_clerk_user_id then 'redacted' else granted_by end where application_id = p_application;
  update ironclad_private.caster_phase1_invitations set reference = null,
    claimed_by = case when claimed_at is not null then 'redacted' end,
    created_by = case when created_by = v_app.owner_clerk_user_id then 'redacted' else created_by end where id = v_app.invitation_id;
  update ironclad_private.caster_phase1_invitation_events set actor = 'redacted'
    where invitation_id = v_app.invitation_id and actor = v_app.owner_clerk_user_id;
  update ironclad_private.caster_profile_moderation_events set actor = 'redacted'
    where application_id = p_application and actor = v_app.owner_clerk_user_id;
  delete from public.notifications where recipient_clerk_user_id = v_app.owner_clerk_user_id
    and type = 'caster.application_updated';

  update ironclad_private.caster_assignments set broadcast_url = null,recording_url = null,media_id = null,own_match_reason = null,
    verified_by = case when verified_by = v_app.owner_clerk_user_id then 'redacted' else verified_by end
    where application_id = p_application;
  update ironclad_private.caster_assignment_events e set previous = ironclad_private.caster_privacy_coverage_snapshot(e.previous),
    current = coalesce(ironclad_private.caster_privacy_coverage_snapshot(e.current),'{}'::jsonb),reason = null,
    actor = case when e.actor = v_app.owner_clerk_user_id then 'redacted' else e.actor end
    from ironclad_private.caster_assignments c where c.application_id = p_application and c.id = e.assignment_id;
  for v_link in select id from ironclad_private.caster_media_links where application_id = p_application loop
    perform ironclad_private.caster_privacy_erase_video(v_link);
    update ironclad_private.caster_media_events set actor = 'redacted' where link_id = v_link and actor = v_app.owner_clerk_user_id;
  end loop;
end;
$$;

-- Owner-only deliberate execution. One exact, previously inspected decision
-- is rechecked at the database clock under the same authority lock as live
-- caster mutations. Callers cannot advance the clock or override a hold.
create function ironclad_private.caster_privacy_apply(p_category text,p_key text,p_eligible_at timestamptz)
returns text language plpgsql set search_path = pg_catalog as $$
declare v_candidate ironclad_private.caster_privacy_candidates%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  if not ironclad_private.caster_privacy_enabled() then return 'disabled'; end if;
  if p_category = 'media' then return 'storage_workflow_required'; end if;
  select * into v_candidate from ironclad_private.caster_privacy_candidates
    where category = p_category and record_key = p_key and eligible_at = p_eligible_at and eligible_at <= clock_timestamp();
  if not found then
    if exists(select from ironclad_private.caster_privacy_receipts
      where category = p_category and record_key = p_key and eligible_at = p_eligible_at) then return 'already_completed'; end if;
    return 'blocked';
  end if;
  if v_candidate.held then return 'held'; end if;

  case p_category
    when 'closed_application','application' then perform ironclad_private.caster_privacy_erase_application(v_candidate.application_id,p_category = 'closed_application');
    when 'invitation' then
      update ironclad_private.caster_phase1_invitations set reference = null,
        token_digest = sha256(convert_to(gen_random_uuid()::text,'UTF8')),
        created_by = 'redacted',claimed_by = case when claimed_at is not null then 'redacted' end where id = p_key::uuid;
      delete from ironclad_private.caster_phase1_continuations where invitation_id = p_key::uuid;
    when 'application_revision' then
      update ironclad_private.caster_application_revisions set draft = '{}' where id = p_key::uuid;
    when 'profile_revision' then
      update ironclad_private.caster_profile_moderation_events set publication_id = null where publication_id = p_key::uuid;
      delete from ironclad_private.caster_profile_revisions where id = p_key::uuid;
    when 'application_audit' then
      update ironclad_private.caster_application_events set actor = 'redacted',feedback = null where id = p_key::bigint;
    when 'invitation_audit' then update ironclad_private.caster_phase1_invitation_events set actor = 'redacted' where id = p_key::bigint;
    when 'profile_audit' then
      update ironclad_private.caster_profile_moderation_events set actor = 'redacted',reason = 'Redacted after retention period' where id = p_key::bigint;
    when 'coverage_audit' then
      update ironclad_private.caster_assignment_events set actor = 'redacted',reason = null,
        previous = ironclad_private.caster_privacy_coverage_snapshot(previous),
        current = coalesce(ironclad_private.caster_privacy_coverage_snapshot(current),'{}'::jsonb) where id = p_key::bigint;
    when 'video_audit' then
      update ironclad_private.caster_media_events set actor = 'redacted',reason = null,snapshot = jsonb_build_object('retained',true) where id = p_key::bigint;
    when 'video' then perform ironclad_private.caster_privacy_erase_video(p_key::uuid);
    else return 'invalid';
  end case;
  insert into ironclad_private.caster_privacy_receipts(category,record_key,eligible_at) values(p_category,p_key,p_eligible_at);
  return 'ok';
end;
$$;

revoke all on ironclad_private.caster_privacy_candidates from public,anon,authenticated,service_role;
revoke all on function ironclad_private.caster_privacy_enabled(),ironclad_private.caster_privacy_held(uuid,uuid),
  ironclad_private.caster_privacy_lock_control(),ironclad_private.caster_privacy_closed_at(text),
  ironclad_private.caster_privacy_place_hold(text,uuid,text,text,timestamptz),ironclad_private.caster_privacy_release_hold(uuid),
  ironclad_private.caster_privacy_draft_references(jsonb,uuid),ironclad_private.caster_privacy_media_referenced(uuid,uuid),
  ironclad_private.caster_privacy_track_media(uuid),ironclad_private.caster_privacy_track_media_trigger(),
  ironclad_private.caster_privacy_protect_retired_slug(),ironclad_private.caster_privacy_plan(timestamptz,integer),
  ironclad_private.caster_privacy_coverage_snapshot(jsonb),ironclad_private.caster_privacy_erase_video(uuid),
  ironclad_private.caster_privacy_erase_application(uuid,boolean),ironclad_private.caster_privacy_apply(text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.caster_privacy_media_claim(text,uuid[]),public.caster_privacy_media_finish(text,uuid),
  public.caster_privacy_public_verified_tournaments(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.caster_privacy_media_claim(text,uuid[]),public.caster_privacy_media_finish(text,uuid),
  public.caster_privacy_public_verified_tournaments(uuid[]) to service_role;

notify pgrst, 'reload schema';
-- Preserve the previously reviewed cron registrations and their owner-only
-- entry points. Routine Ready disposal remains off independently of a
-- deliberate Caster erasure approval. User withdrawal and closure retain
-- their existing protections and are not routed through this switch.
alter table ironclad_private.caster_privacy_control
  add column ready_scheduled_cleanup_enabled boolean not null default false;
alter function ironclad_private.maintain_ready_usage() rename to maintain_ready_usage_approved;
alter function ironclad_private.maintain_ready_topic_suggestions() rename to maintain_ready_topic_suggestions_approved;

create function ironclad_private.maintain_ready_usage()
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if exists(select from ironclad_private.caster_privacy_control where singleton and ready_scheduled_cleanup_enabled) then
    perform ironclad_private.maintain_ready_usage_approved();
  end if;
end;
$$;

create function ironclad_private.maintain_ready_topic_suggestions()
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if exists(select from ironclad_private.caster_privacy_control where singleton and ready_scheduled_cleanup_enabled) then
    perform ironclad_private.maintain_ready_topic_suggestions_approved();
  end if;
end;
$$;

revoke all on function ironclad_private.maintain_ready_usage(),ironclad_private.maintain_ready_topic_suggestions(),
  ironclad_private.maintain_ready_usage_approved(),ironclad_private.maintain_ready_topic_suggestions_approved()
  from public,anon,authenticated,service_role;

commit;
