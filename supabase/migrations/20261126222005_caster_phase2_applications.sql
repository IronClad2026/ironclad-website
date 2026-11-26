begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

alter table ironclad_private.caster_applications
  alter column invitation_id drop not null,
  drop constraint caster_applications_status_check,
  add column draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object'),
  add column draft_version integer not null default 0 check (draft_version >= 0),
  add column submitted_revision_id uuid,
  add column feedback text check (feedback is null or char_length(feedback) between 1 and 2000),
  add column updated_at timestamptz not null default now(),
  add constraint caster_applications_status_check
    check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected')),
  add constraint caster_applications_revision_status_check check (
    (status <> 'draft' or submitted_revision_id is null)
    and (status not in ('submitted', 'changes_requested', 'rejected') or submitted_revision_id is not null)
    and (invitation_id is not null or (status = 'approved' and submitted_revision_id is null))
  );
create index caster_applications_review_queue on ironclad_private.caster_applications (status, updated_at desc, id desc);

create table ironclad_private.caster_application_revisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references ironclad_private.caster_applications(id),
  version integer not null check (version > 0),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  submitted_at timestamptz not null,
  unique (application_id, id),
  unique (application_id, version)
);
alter table ironclad_private.caster_applications add constraint caster_application_current_revision
  foreign key (id, submitted_revision_id) references ironclad_private.caster_application_revisions(application_id, id);

create table ironclad_private.caster_memberships (
  application_id uuid primary key references ironclad_private.caster_applications(id),
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  granted_by text not null,
  granted_at timestamptz not null
);

create table ironclad_private.caster_application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references ironclad_private.caster_applications(id),
  revision_id uuid,
  decision text not null check (decision in ('submitted', 'approve', 'reject', 'request_changes', 'reopen', 'grant')),
  actor text not null,
  feedback text check (feedback is null or char_length(feedback) between 1 and 2000),
  created_at timestamptz not null,
  foreign key (application_id, revision_id) references ironclad_private.caster_application_revisions(application_id, id),
  check ((decision = 'grant') = (revision_id is null)),
  unique (application_id, revision_id, decision)
);
create index caster_application_events_history on ironclad_private.caster_application_events(application_id, id desc);

create table ironclad_private.caster_application_media (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references ironclad_private.caster_applications(id),
  kind text not null check (kind in ('avatar', 'banner', 'gallery')),
  object_path text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  size integer not null check (size > 0 and size <= case when kind = 'avatar' then 2097152 else 3145728 end),
  state text not null default 'reserved' check (state in ('reserved', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  check (object_path = application_id::text || '/' || id::text || '.webp')
);
create index caster_application_media_quota on ironclad_private.caster_application_media(application_id);

alter table ironclad_private.caster_application_revisions enable row level security;
alter table ironclad_private.caster_memberships enable row level security;
alter table ironclad_private.caster_application_events enable row level security;
alter table ironclad_private.caster_application_media enable row level security;
revoke all on ironclad_private.caster_application_revisions, ironclad_private.caster_memberships,
  ironclad_private.caster_application_events, ironclad_private.caster_application_media
  from public, anon, authenticated, service_role;

-- Retain any conflicting settings for investigation rather than changing an
-- existing bucket. Direct browser object policies do not grant this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caster-application-media', 'caster-application-media', false, 3145728, array['image/webp'])
on conflict (id) do nothing;
do $bucket$
begin
  if not exists (
    select from storage.buckets where id = 'caster-application-media' and name = id
      and public is false and file_size_limit = 3145728 and allowed_mime_types = array['image/webp']
  ) then
    raise exception 'Caster application media bucket configuration is invalid' using errcode = '23514';
  end if;
end;
$bucket$;

create function ironclad_private.caster_phase2_actor_state(p_actor text)
returns text language plpgsql set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then return 'closed'; end if;
  return ironclad_private.caster_phase1_legal_state(p_actor);
end;
$$;

create function ironclad_private.caster_phase2_editable(p_application ironclad_private.caster_applications)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_application.status in ('draft', 'changes_requested')
    or (p_application.status = 'approved' and p_application.invitation_id is null);
$$;

create function ironclad_private.caster_phase2_application(
  p_application ironclad_private.caster_applications, p_staff boolean default false
) returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id', p_application.id, 'status', p_application.status,
    'draft', case when p_staff then coalesce(r.draft, '{}'::jsonb) else p_application.draft end,
    'draft_version', p_application.draft_version, 'submitted_revision_id', p_application.submitted_revision_id,
    'revision', case when r.id is not null then
      jsonb_build_object('id', r.id, 'version', r.version, 'draft', r.draft, 'submitted_at', r.submitted_at) end,
    'feedback', p_application.feedback, 'membership_active', coalesce(m.status = 'active', false)
  ) || case when p_staff then jsonb_build_object(
    'owner_clerk_user_id', p_application.owner_clerk_user_id, 'invitation_id', p_application.invitation_id,
    'created_at', p_application.created_at, 'updated_at', p_application.updated_at
  ) else '{}'::jsonb end
  from (values (1)) as input(n)
  left join ironclad_private.caster_application_revisions r on r.id = p_application.submitted_revision_id
  left join ironclad_private.caster_memberships m on m.application_id = p_application.id;
$$;

-- The application server validates canonical identifiers, editor documents
-- and links. Bound their shapes and require each media reference to belong
-- to the application at its storage boundary as well.
create function ironclad_private.caster_phase2_valid_draft(p_application_id uuid, p_draft jsonb)
returns boolean language plpgsql stable set search_path = pg_catalog as $$
declare
  v_key text;
  v_value jsonb;
  v_keys constant text[] := array['displayName','country','languages','avatar','banner',
    'gallery','bio','discord','links','videos','games','experience'];
begin
  if jsonb_typeof(p_draft) is distinct from 'object' or octet_length(p_draft::text) > 98304
    or not (p_draft ?& v_keys) or p_draft - v_keys <> '{}'::jsonb then
    return false;
  end if;

  if jsonb_typeof(p_draft->'displayName') <> 'string' or char_length(p_draft->>'displayName') > 80
    or jsonb_typeof(p_draft->'country') <> 'string' or p_draft->>'country' !~ '^([A-Z]{2})?$'
    or jsonb_typeof(p_draft->'discord') <> 'string' or char_length(p_draft->>'discord') > 100
    or jsonb_typeof(p_draft->'experience') <> 'string' or char_length(p_draft->>'experience') > 1000 then
    return false;
  end if;

  foreach v_key in array array['languages','games','gallery','links','videos'] loop
    if jsonb_typeof(p_draft->v_key) <> 'array' then return false; end if;
    if jsonb_array_length(p_draft->v_key) >
      (case v_key when 'languages' then 8 when 'games' then 10 when 'videos' then 3 else 6 end) then
      return false;
    end if;
  end loop;
  for v_value in select value from jsonb_array_elements((p_draft->'languages') || (p_draft->'games')) loop
    if jsonb_typeof(v_value) <> 'string' or char_length(btrim(v_value #>> '{}')) not between 1 and 50 then
      return false;
    end if;
  end loop;
  for v_value in select value from jsonb_array_elements(p_draft->'links') loop
    if jsonb_typeof(v_value) <> 'object' then return false; end if;
    if not (v_value ?& array['label','url']) or (v_value - array['label','url']) <> '{}'::jsonb
      or jsonb_typeof(v_value->'label') <> 'string' or char_length(btrim(v_value->>'label')) not between 1 and 60
      or jsonb_typeof(v_value->'url') <> 'string' or char_length(v_value->>'url') > 2048
      or v_value->>'url' !~ '^https://[^[:space:]]+$' or v_value->>'url' ~ '^https://[^/]*@'
      or strpos(v_value->>'url', chr(92)) > 0 then
      return false;
    end if;
  end loop;
  for v_value in select value from jsonb_array_elements(p_draft->'videos') loop
    if jsonb_typeof(v_value) <> 'string' or char_length(v_value #>> '{}') > 2048
      or (v_value #>> '{}') !~ '^https://(www[.]youtube[.]com|www[.]twitch[.]tv|clips[.]twitch[.]tv)/[^[:space:]]+$'
      or strpos(v_value #>> '{}', chr(92)) > 0 then
      return false;
    end if;
  end loop;

  v_value := p_draft->'bio';
  if v_value <> 'null'::jsonb and (
    jsonb_typeof(v_value) is distinct from 'object'
    or v_value->'version' is distinct from '1'::jsonb
    or v_value#>>'{doc,type}' is distinct from 'doc'
    or jsonb_typeof(v_value#>'{doc,content}') is distinct from 'array'
  ) then
    return false;
  end if;
  foreach v_key in array array['avatar','banner'] loop
    if p_draft->v_key <> 'null'::jsonb and not exists (
      select from ironclad_private.caster_application_media m where m.id::text = p_draft->>v_key
        and m.application_id = p_application_id and m.kind = v_key and m.state = 'ready'
    ) then
      return false;
    end if;
  end loop;
  for v_value in select value from jsonb_array_elements(p_draft->'gallery') loop
    if jsonb_typeof(v_value) <> 'string' or not exists (
      select from ironclad_private.caster_application_media m where m.id::text = (v_value #>> '{}')
        and m.application_id = p_application_id and m.kind = 'gallery' and m.state = 'ready'
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function ironclad_private.caster_phase2_notify(p_recipient text, p_event_id bigint, p_status text)
returns void language sql set search_path = pg_catalog as $$
  insert into public.notifications (recipient_clerk_user_id, type, title, message, event_key, metadata)
  values (p_recipient, 'caster.application_updated', 'Caster application updated',
    'Open Caster Studio to see the latest update to your application.', 'caster-application:' || p_event_id,
    jsonb_build_object('status', p_status))
  on conflict (recipient_clerk_user_id, event_key) where event_key is not null do nothing;
$$;

create function public.caster_phase2_get(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application));
end;
$$;

create function public.caster_phase2_save(p_actor text, p_expected_version integer, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not ironclad_private.caster_phase2_editable(v_application) then return jsonb_build_object('status', 'locked'); end if;
  if v_application.draft_version is distinct from p_expected_version then return jsonb_build_object('status', 'conflict'); end if;
  if not ironclad_private.caster_phase2_valid_draft(v_application.id, p_draft) then
    return jsonb_build_object('status', 'invalid');
  end if;
  update ironclad_private.caster_applications
  set draft = p_draft, draft_version = draft_version + 1, updated_at = clock_timestamp()
  where id = v_application.id returning * into v_application;
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application));
end;
$$;

create function public.caster_phase2_submit(p_actor text, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_revision uuid;
  v_now timestamptz;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_application.status not in ('draft', 'changes_requested') then return jsonb_build_object('status', 'locked'); end if;
  if v_application.draft_version is distinct from p_expected_version then return jsonb_build_object('status', 'conflict'); end if;
  if not ironclad_private.caster_phase2_valid_draft(v_application.id, v_application.draft) then
    return jsonb_build_object('status', 'incomplete');
  end if;
  if nullif(btrim(v_application.draft->>'displayName'), '') is null
    or nullif(v_application.draft->>'country', '') is null
    or jsonb_array_length(v_application.draft->'languages') = 0 or v_application.draft->>'avatar' is null
    or not exists (
      select from jsonb_path_query(v_application.draft->'bio', '$.doc.** ? (@.type == "text").text') as node
      where nullif(btrim(node #>> '{}'), '') is not null
    ) then
    return jsonb_build_object('status', 'incomplete');
  end if;
  v_now := clock_timestamp();
  insert into ironclad_private.caster_application_revisions (application_id, version, draft, submitted_at)
  values (v_application.id, v_application.draft_version + 1, v_application.draft, v_now)
  returning id into v_revision;
  update ironclad_private.caster_applications set status = 'submitted', feedback = null,
    draft_version = draft_version + 1, submitted_revision_id = v_revision, updated_at = v_now
    where id = v_application.id returning * into v_application;
  insert into ironclad_private.caster_application_events (application_id, revision_id, decision, actor, created_at)
  values (v_application.id, v_revision, 'submitted', p_actor, v_now);
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application));
end;
$$;

create function ironclad_private.caster_phase2_staff_state(p_actor text)
returns text language plpgsql set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_staff(p_actor);
  return ironclad_private.caster_phase1_legal_state(p_actor);
end;
$$;

create function public.caster_phase2_admin_list(p_actor text, p_status text, p_query text, p_offset integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_query text := nullif(lower(btrim(p_query)), '');
  v_offset integer := coalesce(p_offset, 0);
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if (p_status is not null and p_status not in ('all','draft','submitted','changes_requested','approved','rejected'))
    or char_length(v_query) > 100 or v_offset not between 0 and 10000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(jsonb_agg(item order by updated_at desc, id desc), '[]'::jsonb)
  into v_rows from (
    select a.updated_at, a.id, jsonb_build_object(
      'id', a.id, 'status', a.status, 'owner_clerk_user_id', a.owner_clerk_user_id,
      'display_name', r.draft->>'displayName', 'invitation_id', a.invitation_id,
      'created_at', a.created_at, 'updated_at', a.updated_at,
      'submitted_revision_id', a.submitted_revision_id, 'submitted_at', r.submitted_at,
      'membership_active', coalesce(m.status = 'active', false)
    ) as item
    from ironclad_private.caster_applications a
    left join ironclad_private.caster_application_revisions r on r.id = a.submitted_revision_id
    left join ironclad_private.caster_memberships m on m.application_id = a.id
    where (p_status is null or p_status = 'all' or a.status = p_status)
      and (v_query is null or strpos(lower(a.owner_clerk_user_id), v_query) > 0
        or strpos(lower(r.draft->>'displayName'), v_query) > 0)
      and ironclad_private.patch2_account_state(a.owner_clerk_user_id) in ('active-player', 'no-player')
    order by a.updated_at desc, a.id desc limit 26 offset v_offset
  ) entries;
  return jsonb_build_object('status', 'ok',
    'applications', case when jsonb_array_length(v_rows) = 26 then v_rows - 25 else v_rows end,
    'has_more', jsonb_array_length(v_rows) = 26);
end;
$$;

create function public.caster_phase2_admin_detail(p_actor text, p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_invitation ironclad_private.caster_phase1_invitations%rowtype;
  v_history jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  select * into v_application from ironclad_private.caster_applications where id = p_application_id;
  if not found or not ironclad_private.caster_phase1_open_account(v_application.owner_clerk_user_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_invitation from ironclad_private.caster_phase1_invitations where id = v_application.invitation_id;
  select coalesce(jsonb_agg(item order by id desc), '[]'::jsonb) into v_history
  from (
    select id, jsonb_build_object(
      'id', id, 'revision_id', revision_id, 'decision', decision, 'actor', actor,
      'feedback', feedback, 'created_at', created_at
    ) as item
    from ironclad_private.caster_application_events where application_id = v_application.id
    order by id desc limit 100
  ) events;
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application, true),
    'history', v_history, 'invitation', case when v_invitation.id is not null
      then ironclad_private.caster_phase1_admin_invitation(v_invitation, clock_timestamp()) end);
end;
$$;

create function public.caster_phase2_review(
  p_actor text, p_application_id uuid, p_expected_revision uuid, p_decision text, p_feedback text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_feedback text := nullif(btrim(p_feedback), '');
  v_next text;
  v_now timestamptz;
  v_event_id bigint;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  v_next := case p_decision
    when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'request_changes' then 'changes_requested' when 'reopen' then 'changes_requested' end;
  if v_next is null or p_expected_revision is null or char_length(v_feedback) > 2000
    or (p_decision in ('reject', 'request_changes') and v_feedback is null) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_application from ironclad_private.caster_applications where id = p_application_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_application.owner_clerk_user_id = p_actor then return jsonb_build_object('status', 'self_review'); end if;
  if not ironclad_private.caster_phase1_open_account(v_application.owner_clerk_user_id) then
    return jsonb_build_object('status', 'closed');
  end if;
  if v_application.submitted_revision_id is distinct from p_expected_revision
    or (p_decision = 'reopen' and v_application.status <> 'rejected')
    or (p_decision <> 'reopen' and v_application.status <> 'submitted') then
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_decision = 'approve' then
    v_status := ironclad_private.caster_phase1_legal_state(v_application.owner_clerk_user_id);
    if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  end if;

  v_now := clock_timestamp();
  update ironclad_private.caster_applications set status = v_next, feedback = v_feedback, updated_at = v_now
  where id = v_application.id returning * into v_application;
  if p_decision = 'approve' then
    insert into ironclad_private.caster_memberships (application_id, granted_by, granted_at)
    values (v_application.id, p_actor, v_now);
  end if;
  insert into ironclad_private.caster_application_events (application_id, revision_id, decision, actor, feedback, created_at)
  values (v_application.id, p_expected_revision, p_decision, p_actor, v_feedback, v_now)
  returning id into v_event_id;
  perform ironclad_private.caster_phase2_notify(v_application.owner_clerk_user_id, v_event_id, v_next);
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application, true));
end;
$$;

create function public.caster_phase2_grant(p_actor text, p_target text, p_feedback text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_application ironclad_private.caster_applications%rowtype;
  v_feedback text := nullif(btrim(p_feedback), '');
  v_now timestamptz;
  v_event_id bigint;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  if p_actor = p_target then return jsonb_build_object('status', 'self_review'); end if;
  if v_feedback is null or char_length(v_feedback) > 2000 then return jsonb_build_object('status', 'invalid'); end if;
  if not ironclad_private.caster_phase1_open_account(p_target) then return jsonb_build_object('status', 'closed'); end if;
  v_status := ironclad_private.caster_phase1_legal_state(p_target);
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  -- Direct approval and invitation claim must never create two applications.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:caster-claim:' || p_target, 0));
  if exists (select from ironclad_private.caster_applications where owner_clerk_user_id = p_target) then
    return jsonb_build_object('status', 'conflict');
  end if;
  v_now := clock_timestamp();
  insert into ironclad_private.caster_applications (owner_clerk_user_id, status, created_at, updated_at)
  values (p_target, 'approved', v_now, v_now) returning * into v_application;
  insert into ironclad_private.caster_memberships (application_id, granted_by, granted_at)
  values (v_application.id, p_actor, v_now);
  insert into ironclad_private.caster_application_events (application_id, decision, actor, feedback, created_at)
  values (v_application.id, 'grant', p_actor, v_feedback, v_now) returning id into v_event_id;
  perform ironclad_private.caster_phase2_notify(p_target, v_event_id, 'approved');
  return jsonb_build_object('status', 'ok', 'application', ironclad_private.caster_phase2_application(v_application, true));
end;
$$;

create function ironclad_private.caster_phase2_media(p_media ironclad_private.caster_application_media)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('id', p_media.id, 'kind', p_media.kind, 'object_path', p_media.object_path,
    'content_type', p_media.content_type, 'size', p_media.size, 'state', p_media.state);
$$;

create function public.caster_phase2_reserve_media(p_actor text, p_kind text, p_size integer, p_content_type text)
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

  -- This row also serializes profile writes and submission. Concurrent
  -- reservations include each other without an application-side quota race.
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not ironclad_private.caster_phase2_editable(v_application) then return jsonb_build_object('status', 'locked'); end if;
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

create function public.caster_phase2_finish_media(p_actor text, p_media_id uuid, p_ready boolean)
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
  select * into v_media from ironclad_private.caster_application_media
  where id = p_media_id and application_id = v_application.id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_media.state = v_next then
    return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
  end if;
  if v_media.state <> 'reserved' then return jsonb_build_object('status', 'conflict'); end if;
  if p_ready and not ironclad_private.caster_phase2_editable(v_application) then
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

create function public.caster_phase2_get_media(p_actor text, p_media_id uuid, p_staff boolean)
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
      or not exists (
        select from ironclad_private.caster_application_revisions r where r.application_id = v_application.id
          and (r.draft->>'avatar' = v_media.id::text or r.draft->>'banner' = v_media.id::text
            or r.draft->'gallery' @> jsonb_build_array(v_media.id::text))
      ) then
      return jsonb_build_object('status', 'not_found');
    end if;
  elsif v_application.owner_clerk_user_id is distinct from p_actor then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'media', ironclad_private.caster_phase2_media(v_media));
end;
$$;

revoke all on function ironclad_private.caster_phase2_actor_state(text),
  ironclad_private.caster_phase2_editable(ironclad_private.caster_applications),
  ironclad_private.caster_phase2_application(ironclad_private.caster_applications, boolean),
  ironclad_private.caster_phase2_valid_draft(uuid, jsonb),
  ironclad_private.caster_phase2_notify(text, bigint, text), ironclad_private.caster_phase2_staff_state(text),
  ironclad_private.caster_phase2_media(ironclad_private.caster_application_media)
  from public, anon, authenticated, service_role;
revoke all on function public.caster_phase2_get(text), public.caster_phase2_save(text, integer, jsonb),
  public.caster_phase2_submit(text, integer), public.caster_phase2_admin_list(text, text, text, integer),
  public.caster_phase2_admin_detail(text, uuid), public.caster_phase2_review(text, uuid, uuid, text, text),
  public.caster_phase2_grant(text, text, text), public.caster_phase2_reserve_media(text, text, integer, text),
  public.caster_phase2_finish_media(text, uuid, boolean), public.caster_phase2_get_media(text, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.caster_phase2_get(text), public.caster_phase2_save(text, integer, jsonb),
  public.caster_phase2_submit(text, integer), public.caster_phase2_admin_list(text, text, text, integer),
  public.caster_phase2_admin_detail(text, uuid), public.caster_phase2_review(text, uuid, uuid, text, text),
  public.caster_phase2_grant(text, text, text), public.caster_phase2_reserve_media(text, text, integer, text),
  public.caster_phase2_finish_media(text, uuid, boolean), public.caster_phase2_get_media(text, uuid, boolean)
  to service_role;

notify pgrst, 'reload schema';
commit;
