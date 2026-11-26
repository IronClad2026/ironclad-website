begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table ironclad_private.caster_phase1_continuations (
  continuation_digest bytea primary key check (octet_length(continuation_digest) = 32),
  invitation_id uuid not null references ironclad_private.caster_phase1_invitations(id),
  created_at timestamptz not null,
  expires_at timestamptz not null check (
    expires_at > created_at and expires_at <= created_at + interval '30 minutes'
  )
);
create index caster_phase1_continuations_expiry
  on ironclad_private.caster_phase1_continuations (expires_at, continuation_digest);
create index caster_phase1_continuations_invitation
  on ironclad_private.caster_phase1_continuations (invitation_id);

create table ironclad_private.caster_phase1_rate_secret (
  singleton boolean primary key check (singleton),
  value bytea not null check (octet_length(value) = 32)
);

alter table ironclad_private.caster_phase1_continuations enable row level security;
alter table ironclad_private.caster_phase1_rate_secret enable row level security;
revoke all on ironclad_private.caster_phase1_continuations, ironclad_private.caster_phase1_rate_secret
  from public, anon, authenticated, service_role;

-- Managed Supabase and the local replay prelude can install pgcrypto in
-- different schemas. Resolve its extension-owned schema during migration.
do $$
declare
  v_crypto_schema text;
begin
  select n.nspname into strict v_crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  execute format(
    'insert into ironclad_private.caster_phase1_rate_secret (singleton, value) values (true, %I.gen_random_bytes(32))',
    v_crypto_schema
  );
  execute format($sql$
    create function ironclad_private.caster_phase1_source_pseudonym(p_digest text)
    returns bytea language sql stable set search_path = pg_catalog as $function$
      select %I.hmac(decode(p_digest, 'hex'), secret.value, 'sha256')
      from ironclad_private.caster_phase1_rate_secret as secret
    $function$
  $sql$, v_crypto_schema);
end;
$$;
revoke all on function ironclad_private.caster_phase1_source_pseudonym(text)
  from public, anon, authenticated, service_role;

create function public.caster_phase1_prepare_continuation(
  p_token_digest text,
  p_continuation_digest text,
  p_source_digest text,
  p_previous_continuation_digest text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_invitation ironclad_private.caster_phase1_invitations%rowtype;
  v_status text;
  v_source bytea;
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$'
    or p_continuation_digest is null or p_continuation_digest !~ '^[a-f0-9]{64}$'
    or p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_previous_continuation_digest !~ '^[a-f0-9]{64}$'
    or p_continuation_digest = p_previous_continuation_digest then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The server passes a one-way source fingerprint over the RPC. Persist only
  -- the independently keyed pseudonym in short-lived rate limiter rows.
  v_source := ironclad_private.caster_phase1_source_pseudonym(p_source_digest);
  if v_source is null
    or not ironclad_private.caster_phase1_rate_ok('prepare-shard', sha256(convert_to(
      (get_byte(v_source, 0) % 16)::text, 'UTF8'
    )), interval '10 minutes', 100)
    or not ironclad_private.caster_phase1_rate_ok('prepare-source', v_source, interval '10 minutes', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  v_now := clock_timestamp();
  if pg_try_advisory_xact_lock(hashtextextended('ironclad:caster-rate-cleanup', 0)) then
    with expired as (
      select ctid from ironclad_private.caster_phase1_request_limits
      where window_start < v_now - interval '2 hours'
      order by window_start limit 128 for update skip locked
    )
    delete from ironclad_private.caster_phase1_request_limits as limits
    using expired where limits.ctid = expired.ctid;

    with expired as (
      select continuation_digest from ironclad_private.caster_phase1_continuations
      where expires_at <= v_now
      order by expires_at, continuation_digest limit 128 for update skip locked
    )
    delete from ironclad_private.caster_phase1_continuations as continuations
    using expired where continuations.continuation_digest = expired.continuation_digest;
  end if;

  -- Match the claim's continuation-before-invitation lock order. Take the
  -- previous row lock before acquiring even a shared lock on the invitation.
  if p_previous_continuation_digest is not null then
    perform 1 from ironclad_private.caster_phase1_continuations
    where continuation_digest = decode(p_previous_continuation_digest, 'hex') for update;
  end if;

  select * into v_invitation from ironclad_private.caster_phase1_invitations
  where token_digest = decode(p_token_digest, 'hex') for key share;
  v_now := clock_timestamp();
  v_status := ironclad_private.caster_phase1_invitation_status(v_invitation, v_now);
  if v_status <> 'valid' then
    return jsonb_build_object('status', v_status);
  end if;

  v_expires_at := least(v_invitation.expires_at, v_now + interval '30 minutes');
  insert into ironclad_private.caster_phase1_continuations (
    continuation_digest, invitation_id, created_at, expires_at
  ) values (decode(p_continuation_digest, 'hex'), v_invitation.id, v_now, v_expires_at)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_previous_continuation_digest is not null then
    delete from ironclad_private.caster_phase1_continuations
    where continuation_digest = decode(p_previous_continuation_digest, 'hex');
  end if;
  return jsonb_build_object('status', 'valid', 'expires_at', v_expires_at);
end;
$$;

create function public.caster_phase1_get_continuation(p_continuation_digest text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_status text;
begin
  perform ironclad_private.caster_phase1_require_server();
  if p_continuation_digest is null or p_continuation_digest !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select c.expires_at, ironclad_private.caster_phase1_invitation_status(i, v_now)
  into v_expires_at, v_status
  from ironclad_private.caster_phase1_continuations c
  join ironclad_private.caster_phase1_invitations i on i.id = c.invitation_id
  where c.continuation_digest = decode(p_continuation_digest, 'hex');
  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if v_expires_at <= v_now then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_status = 'valid' then
    return jsonb_build_object('status', 'valid', 'expires_at', v_expires_at);
  end if;
  return jsonb_build_object('status', case when v_status = 'claimed' then 'unavailable' else v_status end);
end;
$$;

create function public.caster_phase1_claim_continuation(p_actor text, p_continuation_digest text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz;
  v_status text;
  v_invitation ironclad_private.caster_phase1_invitations%rowtype;
  v_continuation ironclad_private.caster_phase1_continuations%rowtype;
  v_application ironclad_private.caster_applications%rowtype;
begin
  perform ironclad_private.caster_phase1_require_server();
  if not ironclad_private.caster_phase1_open_account(p_actor) then
    return jsonb_build_object('status', 'closed');
  end if;
  v_status := ironclad_private.caster_phase1_legal_state(p_actor);
  if v_status <> 'accepted' then
    return jsonb_build_object('status', v_status);
  end if;

  -- Preserve the existing one-application boundary across invitations.
  -- A successful retry can recover the caller's draft without a stale cookie.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:caster-claim:' || p_actor, 0));
  select * into v_application from ironclad_private.caster_applications where owner_clerk_user_id = p_actor;
  if found then
    return jsonb_build_object('status', 'already_owned',
      'application', ironclad_private.caster_phase1_application_summary(v_application));
  end if;
  if p_continuation_digest is null or p_continuation_digest !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not ironclad_private.caster_phase1_rate_ok('claim', sha256(convert_to(p_actor, 'UTF8')), interval '10 minutes', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_continuation from ironclad_private.caster_phase1_continuations
  where continuation_digest = decode(p_continuation_digest, 'hex') for update;
  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;
  -- Both claim and browser replacement lock continuations first. This
  -- update does not change the invitation key checked when preparing.
  select * into v_invitation from ironclad_private.caster_phase1_invitations
  where id = v_continuation.invitation_id for no key update;
  v_now := clock_timestamp();
  if v_continuation.expires_at <= v_now then
    return jsonb_build_object('status', 'expired');
  end if;
  v_status := ironclad_private.caster_phase1_invitation_status(v_invitation, v_now);
  if v_status <> 'valid' then
    return jsonb_build_object('status', case when v_status = 'claimed' then 'unavailable' else v_status end);
  end if;

  update ironclad_private.caster_phase1_invitations set claimed_at = v_now, claimed_by = p_actor
  where id = v_invitation.id;
  insert into ironclad_private.caster_applications (owner_clerk_user_id, invitation_id, created_at)
  values (p_actor, v_invitation.id, v_now) returning * into v_application;
  insert into ironclad_private.caster_phase1_invitation_events (invitation_id, event_type, actor, created_at)
  values (v_invitation.id, 'claimed', p_actor, v_now);
  delete from ironclad_private.caster_phase1_continuations
  where continuation_digest = v_continuation.continuation_digest;
  return jsonb_build_object('status', 'claimed',
    'application', ironclad_private.caster_phase1_application_summary(v_application));
end;
$$;

-- Prevent the previous app from bypassing single-use continuation semantics.
-- Keep both function definitions and the original migration in the lineage.
revoke all on function public.caster_phase1_prepare(text, text), public.caster_phase1_claim(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.caster_phase1_prepare_continuation(text, text, text, text),
  public.caster_phase1_get_continuation(text), public.caster_phase1_claim_continuation(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.caster_phase1_prepare_continuation(text, text, text, text),
  public.caster_phase1_get_continuation(text), public.caster_phase1_claim_continuation(text, text)
  to service_role;

commit;
