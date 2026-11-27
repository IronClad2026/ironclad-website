begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table ironclad_private.caster_phase1_invitations (
  id uuid primary key default gen_random_uuid(),
  token_digest bytea not null unique check (octet_length(token_digest) = 32),
  reference text check (reference is null or char_length(reference) between 1 and 120),
  created_by text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz check (revoked_at >= created_at),
  claimed_at timestamptz check (claimed_at >= created_at and claimed_at < expires_at),
  claimed_by text,
  replaces uuid unique references ironclad_private.caster_phase1_invitations(id),
  check ((claimed_at is null) = (claimed_by is null)),
  check (claimed_at is null or revoked_at is null),
  check (replaces is distinct from id)
);
create index caster_phase1_invitations_created on ironclad_private.caster_phase1_invitations (created_at desc, id desc);

create table ironclad_private.caster_applications (
  id uuid primary key default gen_random_uuid(),
  owner_clerk_user_id text not null unique,
  invitation_id uuid not null unique references ironclad_private.caster_phase1_invitations(id),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null
);

create table ironclad_private.caster_phase1_invitation_events (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references ironclad_private.caster_phase1_invitations(id),
  event_type text not null check (event_type in ('issued', 'replaced', 'revoked', 'claimed')),
  actor text not null,
  created_at timestamptz not null
);
create index caster_phase1_events_invitation on ironclad_private.caster_phase1_invitation_events (invitation_id, id desc);

create table ironclad_private.caster_phase1_request_limits (
  action text not null,
  subject_digest bytea not null check (octet_length(subject_digest) = 32),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (action, subject_digest, window_start)
);
create index caster_phase1_limits_window on ironclad_private.caster_phase1_request_limits (window_start);

alter table ironclad_private.caster_phase1_invitations enable row level security;
alter table ironclad_private.caster_applications enable row level security;
alter table ironclad_private.caster_phase1_invitation_events enable row level security;
alter table ironclad_private.caster_phase1_request_limits enable row level security;
revoke all on ironclad_private.caster_phase1_invitations, ironclad_private.caster_applications,
  ironclad_private.caster_phase1_invitation_events, ironclad_private.caster_phase1_request_limits
  from public, anon, authenticated, service_role;

create function ironclad_private.caster_phase1_require_server()
returns void language plpgsql stable set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted caster server required' using errcode = '42501';
  end if;
end;
$$;

-- Use the same lock as Patch 2 closure. Staff grant/revoke already takes its
-- exclusive form, so an actor's staff check also holds until commit.
create function ironclad_private.caster_phase1_open_account(p_actor text)
returns boolean language plpgsql set search_path = pg_catalog as $$
begin
  if p_actor is null or p_actor !~ '^user_[a-zA-Z0-9_]{1,244}$' then
    return false;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  return coalesce(ironclad_private.patch2_account_state(p_actor) in ('active-player', 'no-player'), false);
end;
$$;

create function ironclad_private.caster_phase1_require_staff(p_actor text)
returns void language plpgsql set search_path = pg_catalog as $$
declare v_state text;
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then
    raise exception 'Caster staff access required' using errcode = '42501';
  end if;
  v_state := public.get_patch2_admin_account_state(p_actor);
  if v_state is null or v_state not in ('verified-staff', 'verified-active-player') then
    raise exception 'Caster staff access required' using errcode = '42501';
  end if;
end;
$$;

-- Keep the canonical acceptance writer's effective-document predicates and
-- lock order. This protects claim when the current version changes after
-- the server has checked its legal gate but before the database commits.
create function ironclad_private.caster_phase1_legal_state(p_actor text)
returns text language plpgsql set search_path = pg_catalog as $$
declare
  v_now timestamptz := clock_timestamp();
  v_doc public.legal_documents%rowtype;
  v_terms uuid;
  v_privacy uuid;
  v_count integer := 0;
begin
  for v_doc in
    select * from public.legal_documents
    where document_kind in ('privacy', 'terms') and status = 'effective'
      and published_at is not null and published_at <= v_now
      and effective_at is not null and effective_at <= v_now and sha256 is not null
    order by document_kind for share
  loop
    v_count := v_count + 1;
    if v_doc.document_kind = 'terms' then v_terms := v_doc.id;
    else v_privacy := v_doc.id;
    end if;
  end loop;
  if v_count <> 2 or v_terms is null or v_privacy is null then return 'legal_unavailable'; end if;
  if not exists (
    select from public.account_legal_acceptances
    where clerk_user_id = p_actor and terms_document_id = v_terms and privacy_document_id = v_privacy
      and terms_accepted is true and privacy_acknowledged is true
  ) then return 'legal_required'; end if;
  return 'accepted';
end;
$$;

create function ironclad_private.caster_phase1_rate_ok(
  p_action text, p_digest bytea, p_window interval, p_limit integer
) returns boolean language plpgsql set search_path = pg_catalog as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allowed boolean;
begin
  insert into ironclad_private.caster_phase1_request_limits as limits (action, subject_digest, window_start, attempts)
  values (p_action, p_digest, date_bin(p_window, v_now, '2000-01-01T00:00:00Z'::timestamptz), 1)
  on conflict (action, subject_digest, window_start) do update set attempts = limits.attempts + 1
  where limits.attempts < p_limit
  returning true into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

create function ironclad_private.caster_phase1_invitation_status(
  p_invitation ironclad_private.caster_phase1_invitations, p_now timestamptz
) returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when p_invitation.id is null then 'invalid'
    when p_invitation.claimed_at is not null then 'claimed'
    when p_invitation.revoked_at is not null then 'revoked'
    when p_invitation.expires_at <= p_now then 'expired'
    else 'valid'
  end;
$$;

create function ironclad_private.caster_phase1_admin_invitation(
  p_invitation ironclad_private.caster_phase1_invitations, p_now timestamptz
) returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id', p_invitation.id, 'reference', p_invitation.reference, 'created_at', p_invitation.created_at,
    'expires_at', p_invitation.expires_at, 'revoked_at', p_invitation.revoked_at,
    'claimed_at', p_invitation.claimed_at, 'claimed_by', p_invitation.claimed_by,
    'created_by', p_invitation.created_by, 'replaces', p_invitation.replaces,
    'status', ironclad_private.caster_phase1_invitation_status(p_invitation, p_now)
  );
$$;

create function ironclad_private.caster_phase1_application_summary(p_application ironclad_private.caster_applications)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select case when p_application.id is not null then jsonb_build_object(
    'id', p_application.id, 'status', p_application.status, 'created_at', p_application.created_at
  ) end;
$$;

create function public.caster_phase1_account_open(p_actor text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  return ironclad_private.caster_phase1_open_account(p_actor);
end;
$$;

create function public.caster_phase1_accept_legal(p_actor text, p_terms_document_id uuid, p_privacy_document_id uuid)
returns table (acceptance_id uuid, accepted_at timestamptz, terms_document_id uuid, privacy_document_id uuid)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then
    raise exception 'Caster account is unavailable' using errcode = '42501';
  end if;
  return query select * from public.accept_current_account_legal_documents(
    p_actor, p_terms_document_id, p_privacy_document_id, true, true
  );
end;
$$;

create function public.caster_phase1_issue(
  p_actor text, p_token_digest text, p_reference text, p_replaces uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz;
  v_digest bytea;
  v_reference text := nullif(btrim(p_reference), '');
  v_prior ironclad_private.caster_phase1_invitations%rowtype;
  v_new ironclad_private.caster_phase1_invitations%rowtype;
begin
  perform ironclad_private.caster_phase1_require_staff(p_actor);
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$'
    or char_length(v_reference) > 120 or v_reference ~ '[[:cntrl:]]'
    or v_reference ~ '[a-zA-Z0-9_-]{43}' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not ironclad_private.caster_phase1_rate_ok('issue', sha256(convert_to(p_actor, 'UTF8')), interval '1 hour', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if p_replaces is not null then
    select * into v_prior from ironclad_private.caster_phase1_invitations where id = p_replaces for update;
    if not found then return jsonb_build_object('status', 'invalid'); end if;
    if v_prior.claimed_at is not null then return jsonb_build_object('status', 'claimed'); end if;
  end if;
  v_now := clock_timestamp();
  v_digest := decode(p_token_digest, 'hex');
  insert into ironclad_private.caster_phase1_invitations (token_digest, reference, created_by, created_at, expires_at, replaces)
  values (v_digest, coalesce(v_reference, v_prior.reference), p_actor, v_now, v_now + interval '168 hours', p_replaces)
  on conflict do nothing returning * into v_new;
  if v_new.id is null then return jsonb_build_object('status', 'conflict'); end if;
  if p_replaces is not null and v_prior.revoked_at is null and v_prior.expires_at > v_now then
    update ironclad_private.caster_phase1_invitations set revoked_at = v_now where id = p_replaces;
    insert into ironclad_private.caster_phase1_invitation_events (invitation_id, event_type, actor, created_at)
    values (p_replaces, 'revoked', p_actor, v_now);
  end if;
  insert into ironclad_private.caster_phase1_invitation_events (invitation_id, event_type, actor, created_at)
  values (v_new.id, case when p_replaces is null then 'issued' else 'replaced' end, p_actor, v_now);
  return jsonb_build_object('status', 'issued', 'invitation', ironclad_private.caster_phase1_admin_invitation(v_new, v_now));
end;
$$;

create function public.caster_phase1_revoke(p_actor text, p_invitation uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz;
  v_row ironclad_private.caster_phase1_invitations%rowtype;
  v_status text;
begin
  perform ironclad_private.caster_phase1_require_staff(p_actor);
  select * into v_row from ironclad_private.caster_phase1_invitations where id = p_invitation for update;
  v_now := clock_timestamp();
  v_status := ironclad_private.caster_phase1_invitation_status(v_row, v_now);
  if v_status <> 'valid' then return jsonb_build_object('status', v_status); end if;
  update ironclad_private.caster_phase1_invitations set revoked_at = v_now where id = p_invitation;
  insert into ironclad_private.caster_phase1_invitation_events (invitation_id, event_type, actor, created_at)
  values (p_invitation, 'revoked', p_actor, v_now);
  return jsonb_build_object('status', 'revoked');
end;
$$;

create function public.caster_phase1_admin_snapshot(p_actor text, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz := clock_timestamp();
  v_offset integer := greatest(0, least(100000, p_offset));
begin
  perform ironclad_private.caster_phase1_require_staff(p_actor);
  return jsonb_build_object(
    'invitations', coalesce((select jsonb_agg(
      ironclad_private.caster_phase1_admin_invitation(invitation_page, v_now) order by created_at desc, id desc
    ) from (select * from ironclad_private.caster_phase1_invitations order by created_at desc, id desc limit 100 offset v_offset) invitation_page), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(event_page) order by id desc)
      from (select id, invitation_id, event_type, actor, created_at from ironclad_private.caster_phase1_invitation_events order by id desc limit 100 offset v_offset) event_page), '[]'::jsonb),
    'has_more_invitations', exists (select from ironclad_private.caster_phase1_invitations limit 1 offset v_offset + 100),
    'has_more_events', exists (select from ironclad_private.caster_phase1_invitation_events limit 1 offset v_offset + 100)
  );
end;
$$;

create function public.caster_phase1_prepare(p_token_digest text, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_row ironclad_private.caster_phase1_invitations%rowtype;
  v_status text;
  v_source bytea;
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$'
    or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_source := decode(p_rate_key, 'hex');
  -- Bound new source rows and avoid one hot programme-wide rate row. A single
  -- source can only spend its shard budget, in addition to its own threshold.
  if not ironclad_private.caster_phase1_rate_ok('prepare-shard', sha256(convert_to(
    (get_byte(v_source, 0) % 16)::text, 'UTF8'
  )), interval '10 minutes', 100)
    or not ironclad_private.caster_phase1_rate_ok('prepare-source', v_source, interval '10 minutes', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if pg_try_advisory_xact_lock(hashtextextended('ironclad:caster-rate-cleanup', 0)) then
    with expired as (
      select ctid from ironclad_private.caster_phase1_request_limits
      where window_start < clock_timestamp() - interval '2 hours'
      order by window_start limit 128 for update skip locked
    )
    delete from ironclad_private.caster_phase1_request_limits as limits
    using expired where limits.ctid = expired.ctid;
  end if;
  select * into v_row from ironclad_private.caster_phase1_invitations where token_digest = decode(p_token_digest, 'hex');
  v_status := ironclad_private.caster_phase1_invitation_status(v_row, clock_timestamp());
  if v_status = 'valid' then return jsonb_build_object('status', v_status, 'expires_at', v_row.expires_at); end if;
  return jsonb_build_object('status', v_status);
end;
$$;

create function public.caster_phase1_claim(p_actor text, p_token_digest text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz;
  v_status text;
  v_row ironclad_private.caster_phase1_invitations%rowtype;
  v_application ironclad_private.caster_applications%rowtype;
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then return jsonb_build_object('status', 'closed'); end if;
  v_status := ironclad_private.caster_phase1_legal_state(p_actor);
  if v_status <> 'accepted' then return jsonb_build_object('status', v_status); end if;
  -- Lock the account before the invitation. Two different invitations can
  -- target one account concurrently without consuming a second invitation.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:caster-claim:' || p_actor, 0));
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor;
  if found then return jsonb_build_object('status', 'already_owned',
    'application', ironclad_private.caster_phase1_application_summary(v_application)); end if;
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status', 'invalid'); end if;
  if not ironclad_private.caster_phase1_rate_ok('claim', sha256(convert_to(p_actor, 'UTF8')), interval '10 minutes', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into v_row from ironclad_private.caster_phase1_invitations
  where token_digest = decode(p_token_digest, 'hex') for update;
  v_now := clock_timestamp();
  v_status := ironclad_private.caster_phase1_invitation_status(v_row, v_now);
  if v_status <> 'valid' then
    return jsonb_build_object('status', case when v_status = 'claimed' then 'unavailable' else v_status end);
  end if;
  update ironclad_private.caster_phase1_invitations set claimed_at = v_now, claimed_by = p_actor where id = v_row.id;
  insert into ironclad_private.caster_applications (owner_clerk_user_id, invitation_id, created_at)
  values (p_actor, v_row.id, v_now) returning * into v_application;
  insert into ironclad_private.caster_phase1_invitation_events (invitation_id, event_type, actor, created_at)
  values (v_row.id, 'claimed', p_actor, v_now);
  return jsonb_build_object('status', 'claimed', 'application', ironclad_private.caster_phase1_application_summary(v_application));
end;
$$;

create function public.caster_phase1_get_application(p_actor text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_application ironclad_private.caster_applications%rowtype;
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then return jsonb_build_object('status', 'closed', 'application', null); end if;
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor;
  return jsonb_build_object('status', 'open', 'application', ironclad_private.caster_phase1_application_summary(v_application));
end;
$$;

revoke all on function ironclad_private.caster_phase1_require_server(), ironclad_private.caster_phase1_open_account(text),
  ironclad_private.caster_phase1_require_staff(text), ironclad_private.caster_phase1_legal_state(text),
  ironclad_private.caster_phase1_rate_ok(text, bytea, interval, integer),
  ironclad_private.caster_phase1_invitation_status(ironclad_private.caster_phase1_invitations, timestamptz),
  ironclad_private.caster_phase1_admin_invitation(ironclad_private.caster_phase1_invitations, timestamptz),
  ironclad_private.caster_phase1_application_summary(ironclad_private.caster_applications)
  from public, anon, authenticated, service_role;

revoke all on function public.caster_phase1_account_open(text), public.caster_phase1_accept_legal(text, uuid, uuid),
  public.caster_phase1_issue(text, text, text, uuid), public.caster_phase1_revoke(text, uuid),
  public.caster_phase1_admin_snapshot(text, integer), public.caster_phase1_prepare(text, text),
  public.caster_phase1_claim(text, text), public.caster_phase1_get_application(text)
  from public, anon, authenticated, service_role;
grant execute on function public.caster_phase1_account_open(text), public.caster_phase1_accept_legal(text, uuid, uuid),
  public.caster_phase1_issue(text, text, text, uuid), public.caster_phase1_revoke(text, uuid),
  public.caster_phase1_admin_snapshot(text, integer), public.caster_phase1_prepare(text, text),
  public.caster_phase1_claim(text, text), public.caster_phase1_get_application(text) to service_role;

commit;
