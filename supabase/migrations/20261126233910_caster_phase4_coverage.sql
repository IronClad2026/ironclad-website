begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

create function ironclad_private.caster_phase4_valid_url(p_url text, p_recording boolean)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_url is null or (
    p_url ~ '^https://(www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}|www[.]twitch[.]tv/videos/[0-9]{1,24}|clips[.]twitch[.]tv/[A-Za-z0-9_-]{1,120})$'
    or (not p_recording and
      p_url ~ '^https://(www[.]youtube[.]com/@[A-Za-z0-9_.-]{1,100}(/live)?|www[.]youtube[.]com/channel/UC[A-Za-z0-9_-]{22}(/live)?|www[.]twitch[.]tv/[A-Za-z0-9_]{1,25})$')
  );
$$;

create table ironclad_private.caster_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references ironclad_private.caster_memberships(application_id),
  -- Original IDs and labels are intentionally independent of the live FKs.
  -- A deleted target can disappear from the live surface without rewriting history.
  tournament_id uuid not null,
  division_id uuid,
  match_id uuid,
  live_tournament_id uuid references public.tournaments(id) on delete set null,
  live_division_id uuid references public.tournament_brackets(id) on delete set null,
  live_match_id uuid references public.tournament_matches(id) on delete set null,
  media_id uuid references public.tournament_media(id) on delete set null,
  tournament_title text not null,
  division_name text,
  match_label text,
  game text not null default 'Company of Heroes 3',
  scope text generated always as (
    case when match_id is not null then 'match' when division_id is not null then 'division' else 'tournament' end
  ) stored,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'unfulfilled')),
  version integer not null default 1 check (version > 0),
  scheduled_at timestamptz,
  covered_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  scope_was_public boolean not null default false,
  broadcast_url text check (ironclad_private.caster_phase4_valid_url(broadcast_url, false)),
  recording_url text check (ironclad_private.caster_phase4_valid_url(recording_url, true)),
  own_match_reason text check (char_length(own_match_reason) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (live_tournament_id is null or live_tournament_id = tournament_id),
  check (live_division_id is null or (division_id is not null and live_division_id = division_id)),
  check (live_match_id is null or (match_id is not null and live_match_id = match_id)),
  check ((division_id is null) = (division_name is null)),
  check ((match_id is null) = (match_label is null)),
  check (match_id is null or division_id is not null),
  check (own_match_reason is null or match_id is not null),
  check (not scope_was_public or (division_id is not null and status = 'completed')),
  check (
    (status = 'completed' and covered_at is not null and verified_at is not null and verified_by is not null
      and covered_at <= updated_at)
    or (status <> 'completed' and covered_at is null and verified_at is null and verified_by is null)
  )
);

create unique index caster_assignments_active_scope on ironclad_private.caster_assignments
  (application_id, tournament_id, division_id, match_id) nulls not distinct
  where status in ('scheduled', 'completed');
create index caster_assignments_tournament_updated
  on ironclad_private.caster_assignments(tournament_id, updated_at desc, id desc);
create index caster_assignments_application_updated
  on ironclad_private.caster_assignments(application_id, updated_at desc, id desc);
create index caster_assignments_live_tournament on ironclad_private.caster_assignments(live_tournament_id);
create index caster_assignments_live_division on ironclad_private.caster_assignments(live_division_id)
  where live_division_id is not null;
create index caster_assignments_live_match on ironclad_private.caster_assignments(live_match_id)
  where live_match_id is not null;
create index caster_assignments_media on ironclad_private.caster_assignments(media_id)
  where media_id is not null;

create table ironclad_private.caster_assignment_events (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references ironclad_private.caster_assignments(id),
  version integer not null check (version > 0),
  action text not null check (action in ('create', 'update', 'cancel', 'unfulfilled', 'complete', 'correct')),
  actor text not null,
  reason text check (char_length(reason) between 1 and 2000),
  previous jsonb,
  current jsonb not null,
  created_at timestamptz not null,
  unique (assignment_id, version)
);

alter table ironclad_private.caster_assignments enable row level security;
alter table ironclad_private.caster_assignment_events enable row level security;
revoke all on ironclad_private.caster_assignments, ironclad_private.caster_assignment_events
  from public, anon, authenticated, service_role;
revoke all on sequence ironclad_private.caster_assignment_events_id_seq
  from public, anon, authenticated, service_role;

-- Lock canonical parents before matches and media on mutating paths. This
-- keeps FK deletion and assignment writes from taking the locks in reverse.
create function ironclad_private.caster_phase4_target(p_tournament_id uuid, p_division_id uuid, p_match_id uuid)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare
  v_tournament public.tournaments%rowtype;
  v_division public.tournament_brackets%rowtype;
  v_match_label text;
begin
  if p_tournament_id is null or (p_match_id is not null and p_division_id is null) then return null; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for share;
  if not found then return null; end if;
  if p_division_id is not null then
    select * into v_division from public.tournament_brackets
    where id = p_division_id and tournament_id = p_tournament_id for share;
    if not found then return null; end if;
  end if;
  if p_match_id is not null then
    select r.name || ' · ' || m.match_number::text into v_match_label
    from public.generated_brackets g
    join public.bracket_rounds r on r.generated_bracket_id = g.id
    join public.tournament_matches m on m.generated_bracket_id = g.id and m.round_id = r.id
    where g.tournament_bracket_id = p_division_id and m.id = p_match_id
    for share of g, r, m;
    if not found then return null; end if;
  end if;
  return jsonb_build_object('tournament_title',v_tournament.title, 'tournament_status',v_tournament.status,
    'division_name',v_division.name, 'match_label',v_match_label, 'division_public',v_division.launched_at is not null);
end;
$$;

create function ironclad_private.caster_phase4_conflict(
  p_owner text, p_tournament_id uuid, p_division_id uuid, p_match_id uuid
) returns text language sql stable set search_path = pg_catalog as $$
  select case
    when p_match_id is not null and exists(
      select from public.tournament_matches m join public.registrations r
        on r.id in (m.player_one_registration_id, m.player_two_registration_id)
      where m.id = p_match_id and r.clerk_user_id = p_owner
    ) then 'own_match'
    when p_division_id is not null and exists(
      select from public.registrations r where r.clerk_user_id = p_owner and r.tournament_id = p_tournament_id
        and r.tournament_bracket_id = p_division_id and r.registration_status not in ('withdrawn', 'rejected')
    ) then 'division'
    when p_division_id is null and exists(
      select from public.registrations r where r.clerk_user_id = p_owner and r.tournament_id = p_tournament_id
        and r.registration_status not in ('withdrawn', 'rejected')
    ) then 'tournament'
    else 'none' end;
$$;

-- Existing canonical tournament media is projected only while the publication
-- and ancestry still match. No replay/proof storage object is read here.
create function ironclad_private.caster_phase4_media_matches(
  p_media public.tournament_media, p_tournament_id uuid, p_match_id uuid
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(p_media.published and p_media.tournament_id = p_tournament_id
    and p_media.match_id is not distinct from p_match_id
    and (p_match_id is not null or p_media.media_type <> 'match_cast')
    and ironclad_private.caster_phase4_valid_url(p_media.url, true), false);
$$;

create view ironclad_private.caster_phase4_current with (security_invoker = true) as
select a.*,
  t.slug as tournament_slug, t.status as tournament_status,
  t.id is not null as tournament_available,
  (t.id is not null and (a.division_id is null or d.id is not null)
    and (a.match_id is null or m.id is not null)) as target_available,
  (a.division_id is null or (d.launched_at is not null and (a.match_id is null or m.id is not null))) as scope_public,
  media.id as visible_media_id, media.url as media_url, media.title as media_title
from ironclad_private.caster_assignments a
left join public.tournaments t on t.id = a.live_tournament_id
left join public.tournament_brackets d on d.id = a.live_division_id and d.tournament_id = t.id
left join public.generated_brackets g on g.tournament_bracket_id = d.id and a.match_id is not null
left join public.tournament_matches m on m.id = a.live_match_id and m.generated_bracket_id = g.id
  and exists (select from public.bracket_rounds r where r.id = m.round_id and r.generated_bracket_id = g.id)
left join public.tournament_media media on media.id = a.media_id and
  ironclad_private.caster_phase4_media_matches(media, t.id, a.match_id)
  and (a.match_id is null or (m.id is not null and d.launched_at is not null));
revoke all on ironclad_private.caster_phase4_current from public, anon, authenticated, service_role;

create function ironclad_private.caster_phase4_row(p_row ironclad_private.caster_phase4_current, p_admin boolean)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id', p_row.id, 'version', p_row.version, 'scope', p_row.scope, 'status', p_row.status,
    'tournament_id', p_row.tournament_id, 'tournament_title', p_row.tournament_title,
    'tournament_slug', p_row.tournament_slug, 'tournament_available', p_row.tournament_available, 'game', p_row.game,
    'division_id', p_row.division_id, 'division_name', p_row.division_name,
    'match_id', p_row.match_id, 'match_label', p_row.match_label,
    'scheduled_at', p_row.scheduled_at, 'covered_at', p_row.covered_at, 'verified_at', p_row.verified_at,
    'broadcast_url', p_row.broadcast_url, 'recording_url', p_row.recording_url,
    'media_id', case when p_admin then p_row.media_id else p_row.visible_media_id end,
    'media_url', p_row.media_url, 'media_title', p_row.media_title, 'target_available', p_row.target_available
  ) || case when p_admin then (
    select jsonb_build_object(
      'application_id', a.id, 'caster_display_name', data.item->>'display_name', 'verified_by', p_row.verified_by,
      'conflict', ironclad_private.caster_phase4_conflict(a.owner_clerk_user_id,
        p_row.tournament_id, p_row.division_id, case when p_row.target_available then p_row.match_id end),
      'own_match_reason', p_row.own_match_reason
    )
    from ironclad_private.caster_applications a join ironclad_private.caster_memberships m on m.application_id = a.id
    left join ironclad_private.caster_profiles p on p.application_id = a.id
    cross join lateral (select ironclad_private.caster_phase3_admin_data(a, m.status, p) as item) data
    where a.id = p_row.application_id
  ) else '{}'::jsonb end;
$$;

create function public.caster_phase4_admin_conflict(
  p_actor text, p_application_id uuid, p_tournament_id uuid, p_division_id uuid, p_match_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_owner text;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  select a.owner_clerk_user_id into v_owner
  from ironclad_private.caster_applications a join ironclad_private.caster_memberships m on m.application_id = a.id
  where a.id = p_application_id and a.status = 'approved' and m.status = 'active' for share of m;
  if not found or not ironclad_private.caster_phase1_open_account(v_owner) then
    return jsonb_build_object('status','not_found');
  end if;
  if ironclad_private.caster_phase4_target(p_tournament_id,p_division_id,p_match_id) is null then
    return jsonb_build_object('status','target_unavailable');
  end if;
  return jsonb_build_object('status','ok', 'conflict',
    ironclad_private.caster_phase4_conflict(v_owner,p_tournament_id,p_division_id,p_match_id));
end;
$$;

create function public.caster_phase4_admin_list(p_actor text,p_tournament_id uuid,p_application_id uuid,p_offset integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_offset integer := coalesce(p_offset,0);
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if v_offset not between 0 and 100000 then return jsonb_build_object('status','invalid'); end if;
  with picked as materialized (
    select id from ironclad_private.caster_assignments
    where (p_tournament_id is null or tournament_id = p_tournament_id)
      and (p_application_id is null or application_id = p_application_id)
    order by updated_at desc,id desc limit 26 offset v_offset
  )
  select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(a,true) order by a.updated_at desc,a.id desc),'[]'::jsonb)
  into v_rows from picked join ironclad_private.caster_phase4_current a on a.id = picked.id;
  return jsonb_build_object('status','ok',
    'assignments', case when jsonb_array_length(v_rows) = 26 then v_rows - 25 else v_rows end,
    'has_more', jsonb_array_length(v_rows) = 26);
end;
$$;

create function public.caster_phase4_admin_save(
  p_actor text, p_assignment_id uuid, p_expected_version integer, p_application_id uuid,
  p_tournament_id uuid, p_division_id uuid, p_match_id uuid, p_action text,
  p_scheduled_at timestamptz, p_covered_at timestamptz, p_broadcast_url text,
  p_recording_url text, p_media_id uuid, p_acknowledged boolean, p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_previous ironclad_private.caster_assignments%rowtype;
  v_assignment ironclad_private.caster_assignments%rowtype;
  v_projection ironclad_private.caster_phase4_current%rowtype;
  v_media public.tournament_media%rowtype;
  v_application_id uuid := p_application_id;
  v_tournament_id uuid := p_tournament_id;
  v_division_id uuid := p_division_id;
  v_match_id uuid := p_match_id;
  v_owner text;
  v_membership_status text;
  v_reason text := nullif(btrim(p_reason), '');
  v_own_match_reason text;
  v_target jsonb;
  v_constraint text;
  v_now timestamptz;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if p_action is null or p_action not in ('create','update','cancel','unfulfilled','complete','correct')
    or char_length(v_reason) > 2000
    or (p_action in ('cancel','unfulfilled','correct') and v_reason is null)
    or (p_action in ('complete','correct') and (p_covered_at is null or not isfinite(p_covered_at)
      or p_covered_at > clock_timestamp()))
    or (p_scheduled_at is not null and not isfinite(p_scheduled_at))
    or not ironclad_private.caster_phase4_valid_url(p_broadcast_url,false)
    or not ironclad_private.caster_phase4_valid_url(p_recording_url,true)
  then return jsonb_build_object('status','invalid'); end if;

  if p_action = 'create' then
    if p_assignment_id is not null or p_expected_version is not null or p_application_id is null
      or p_tournament_id is null or (p_match_id is not null and p_division_id is null)
    then return jsonb_build_object('status','invalid'); end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      return jsonb_build_object('status','invalid');
    end if;
    -- The scope is immutable, so it is safe to discover the lock targets
    -- before taking the assignment lock and comparing the expected version.
    select * into v_previous from ironclad_private.caster_assignments where id = p_assignment_id;
    if not found then return jsonb_build_object('status','not_found'); end if;
    if (p_application_id is not null and p_application_id is distinct from v_previous.application_id)
      or (p_tournament_id is not null and p_tournament_id is distinct from v_previous.tournament_id)
      or (p_division_id is not null and p_division_id is distinct from v_previous.division_id)
      or (p_match_id is not null and p_match_id is distinct from v_previous.match_id)
    then return jsonb_build_object('status','invalid'); end if;
    v_application_id := v_previous.application_id;
    v_tournament_id := v_previous.tournament_id;
    v_division_id := v_previous.division_id;
    v_match_id := v_previous.match_id;
  end if;

  select a.owner_clerk_user_id,m.status into v_owner,v_membership_status
  from ironclad_private.caster_applications a join ironclad_private.caster_memberships m on m.application_id = a.id
  where a.id = v_application_id and a.status = 'approved' for share of m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_owner = p_actor then return jsonb_build_object('status','locked'); end if;
  if p_action in ('create','update','complete','correct')
    and not ironclad_private.caster_phase1_open_account(v_owner)
  then return jsonb_build_object('status','closed'); end if;
  if p_action in ('create','update','complete') and v_membership_status <> 'active' then
    return jsonb_build_object('status','locked');
  end if;
  if p_action in ('create','update','complete','correct') then
    v_target := ironclad_private.caster_phase4_target(v_tournament_id,v_division_id,v_match_id);
    if p_action <> 'correct' and (v_target is null or v_target->>'tournament_status' in ('cancelled','voided')) then
      return jsonb_build_object('status','target_unavailable');
    end if;
    if p_media_id is not null then
      select * into v_media from public.tournament_media where id = p_media_id for share;
      if not found or v_target is null
        or not ironclad_private.caster_phase4_media_matches(v_media,v_tournament_id,v_match_id)
      then return jsonb_build_object('status','invalid'); end if;
    end if;
  end if;

  if p_action <> 'create' then
    select * into v_previous from ironclad_private.caster_assignments where id = p_assignment_id for update;
    if v_previous.version is distinct from p_expected_version then return jsonb_build_object('status','conflict'); end if;
    if (p_action in ('update','complete') and v_previous.status <> 'scheduled')
      or (p_action = 'correct' and v_previous.status <> 'completed')
      or (p_action in ('cancel','unfulfilled') and v_previous.status not in ('scheduled','completed'))
    then return jsonb_build_object('status','locked'); end if;
    if p_action in ('update','complete') and (v_previous.live_tournament_id is null
      or (v_division_id is not null and v_previous.live_division_id is null)
      or (v_match_id is not null and v_previous.live_match_id is null))
    then return jsonb_build_object('status','target_unavailable'); end if;
  end if;

  v_own_match_reason := v_previous.own_match_reason;
  if p_action in ('create','update','complete') and v_match_id is not null
    and ironclad_private.caster_phase4_conflict(v_owner,v_tournament_id,v_division_id,v_match_id) = 'own_match'
    and v_own_match_reason is null
  then
    if p_acknowledged is not true or v_reason is null then
      return jsonb_build_object('status','own_match_ack_required');
    end if;
    v_own_match_reason := v_reason;
  end if;

  v_now := clock_timestamp();
  if p_action = 'create' then
    begin
      insert into ironclad_private.caster_assignments (
        application_id,tournament_id,division_id,match_id,live_tournament_id,live_division_id,live_match_id,
        tournament_title,division_name,match_label,scheduled_at,broadcast_url,recording_url,media_id,
        own_match_reason,created_at,updated_at
      ) values (
        v_application_id,v_tournament_id,v_division_id,v_match_id,v_tournament_id,v_division_id,v_match_id,
        v_target->>'tournament_title',v_target->>'division_name',v_target->>'match_label',p_scheduled_at,
        p_broadcast_url,p_recording_url,p_media_id,v_own_match_reason,v_now,v_now
      ) returning * into v_assignment;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'caster_assignments_active_scope' then raise; end if;
      return jsonb_build_object('status','duplicate');
    end;
  elsif p_action in ('cancel','unfulfilled') then
    update ironclad_private.caster_assignments set
      status = case when p_action = 'cancel' then 'cancelled' else 'unfulfilled' end,
      covered_at = null, verified_at = null, verified_by = null, scope_was_public = false,
      version = version + 1, updated_at = v_now
    where id = p_assignment_id returning * into v_assignment;
  else
    update ironclad_private.caster_assignments set
      status = case when p_action = 'complete' then 'completed' else status end,
      scheduled_at = case when p_action = 'update' then p_scheduled_at else scheduled_at end,
      covered_at = case when p_action in ('complete','correct') then p_covered_at else covered_at end,
      verified_at = case when p_action = 'complete' then v_now else verified_at end,
      verified_by = case when p_action = 'complete' then p_actor else verified_by end,
      scope_was_public = case when p_action = 'complete' and v_division_id is not null
        then (v_target->>'division_public')::boolean else scope_was_public end,
      broadcast_url = p_broadcast_url, recording_url = p_recording_url, media_id = p_media_id,
      own_match_reason = v_own_match_reason, version = version + 1, updated_at = v_now
    where id = p_assignment_id returning * into v_assignment;
  end if;

  insert into ironclad_private.caster_assignment_events
    (assignment_id,version,action,actor,reason,previous,current,created_at)
  values (
    v_assignment.id,v_assignment.version,p_action,p_actor,v_reason,
    case when p_action <> 'create' then to_jsonb(v_previous) end,to_jsonb(v_assignment),v_now
  );
  select * into v_projection from ironclad_private.caster_phase4_current where id = v_assignment.id;
  return jsonb_build_object('status','ok','assignment',ironclad_private.caster_phase4_row(v_projection,true));
end;
$$;

create function public.caster_phase4_admin_assign(
  p_actor text, p_application_ids uuid[], p_tournament_id uuid, p_division_id uuid, p_match_id uuid,
  p_scheduled_at timestamptz, p_broadcast_url text, p_recording_url text, p_media_id uuid,
  p_acknowledged boolean, p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_application_id uuid;
  v_result jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if p_application_ids is null or cardinality(p_application_ids) not between 1 and 10
    or (select count(distinct id) from unnest(p_application_ids) as id) <> cardinality(p_application_ids)
  then return jsonb_build_object('status','invalid'); end if;
  begin
    for v_application_id in select id from unnest(p_application_ids) as id order by id loop
      v_result := public.caster_phase4_admin_save(
        p_actor,null,null,v_application_id,p_tournament_id,p_division_id,p_match_id,'create',p_scheduled_at,
        null,p_broadcast_url,p_recording_url,p_media_id,p_acknowledged,p_reason);
      if v_result->>'status' <> 'ok' then
        raise exception 'Caster assignment batch did not complete' using errcode = 'P4401';
      end if;
      v_rows := v_rows || jsonb_build_array(v_result->'assignment');
    end loop;
  exception when sqlstate 'P4401' then
    return v_result || jsonb_build_object('application_id',v_application_id);
  end;
  return jsonb_build_object('status','ok','assignments',v_rows);
end;
$$;

create function public.caster_phase4_owner(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_actor_state(p_actor);
  v_application_id uuid;
  v_rows jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  select a.id into v_application_id from ironclad_private.caster_applications a
  join ironclad_private.caster_memberships m on m.application_id = a.id
  where a.owner_clerk_user_id = p_actor and a.status = 'approved' and m.status = 'active' for share of m;
  if not found then return jsonb_build_object('status','not_found'); end if;

  with picked as materialized (
    select id from ironclad_private.caster_assignments where application_id = v_application_id
    order by (status = 'scheduled') desc, updated_at desc, id desc limit 200
  )
  select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(a,false)
    order by (a.status = 'scheduled') desc, a.updated_at desc,a.id desc),'[]'::jsonb)
  into v_rows from picked join ironclad_private.caster_phase4_current a on a.id = picked.id;
  return jsonb_build_object('status','ok','assignments',v_rows);
end;
$$;

create function public.caster_phase4_public_schedules(p_tournament_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_tournament_ids is null or cardinality(p_tournament_ids) not between 1 and 100 then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(a,false) || jsonb_build_object(
      'caster',jsonb_build_object('slug',c.slug,'publication_id',c.id,'display_name',c.display_name,'avatar',c.avatar)
    ) order by a.tournament_id,a.scheduled_at nulls last,a.id),'[]'::jsonb)
    from ironclad_private.caster_phase4_current a
    join ironclad_private.caster_phase3_current_public c on c.application_id = a.application_id
    where a.tournament_id = any(p_tournament_ids) and a.target_available
      and a.tournament_status not in ('cancelled','voided')
      and (a.status = 'completed' or (a.status = 'scheduled' and a.tournament_status <> 'completed'))
      and a.scope_public
  );
end;
$$;

create function public.caster_phase4_public_history(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return (
    with covered as materialized (
      select a.id, a.tournament_id, a.division_id, a.scope, a.covered_at,
        (a.covered_at at time zone 'UTC')::date as coverage_day
      from ironclad_private.caster_phase4_current a
      join ironclad_private.caster_phase3_current_public c on c.application_id = a.application_id
      where c.slug = p_slug and a.status = 'completed'
        and (a.scope_public or (not a.target_available and a.scope_was_public))
    ), picked as (
      select e.id, e.covered_at from covered e
      where e.scope = 'match' or not exists (
        select from covered child where child.tournament_id = e.tournament_id and child.coverage_day = e.coverage_day
          and ((e.scope = 'tournament' and child.scope <> 'tournament')
            or (e.scope = 'division' and child.scope = 'match' and child.division_id = e.division_id))
      )
      order by e.covered_at desc,e.id desc limit 200
    )
    select coalesce(jsonb_agg(ironclad_private.caster_phase4_row(a,false) order by e.covered_at desc,e.id desc),'[]'::jsonb)
    from picked e join ironclad_private.caster_phase4_current a on a.id = e.id
  );
end;
$$;

create function public.caster_phase4_admin_history(p_actor text,p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_status text := ironclad_private.caster_phase2_staff_state(p_actor);
  v_events jsonb;
begin
  if v_status <> 'accepted' then return jsonb_build_object('status',v_status); end if;
  if not exists(select from ironclad_private.caster_assignments where id = p_assignment_id) then
    return jsonb_build_object('status','not_found');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'actor', actor, 'reason', reason,
    'created_at', created_at, 'previous', previous, 'current', current) order by version desc),'[]'::jsonb)
  into v_events from (select * from ironclad_private.caster_assignment_events where assignment_id = p_assignment_id
    order by version desc limit 100) e;
  return jsonb_build_object('status','ok','events',v_events);
end;
$$;

revoke all on function ironclad_private.caster_phase4_valid_url(text,boolean),
  ironclad_private.caster_phase4_target(uuid,uuid,uuid), ironclad_private.caster_phase4_conflict(text,uuid,uuid,uuid),
  ironclad_private.caster_phase4_media_matches(public.tournament_media,uuid,uuid),
  ironclad_private.caster_phase4_row(ironclad_private.caster_phase4_current,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.caster_phase4_admin_conflict(text,uuid,uuid,uuid,uuid),
  public.caster_phase4_admin_list(text,uuid,uuid,integer), public.caster_phase4_admin_history(text,uuid),
  public.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_admin_assign(text,uuid[],uuid,uuid,uuid,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_owner(text), public.caster_phase4_public_schedules(uuid[]), public.caster_phase4_public_history(text)
  from public, anon, authenticated, service_role;
grant execute on function public.caster_phase4_admin_conflict(text,uuid,uuid,uuid,uuid),
  public.caster_phase4_admin_list(text,uuid,uuid,integer), public.caster_phase4_admin_history(text,uuid),
  public.caster_phase4_admin_save(text,uuid,integer,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_admin_assign(text,uuid[],uuid,uuid,uuid,timestamptz,text,text,uuid,boolean,text),
  public.caster_phase4_owner(text), public.caster_phase4_public_schedules(uuid[]), public.caster_phase4_public_history(text)
  to service_role;

notify pgrst, 'reload schema';
commit;
