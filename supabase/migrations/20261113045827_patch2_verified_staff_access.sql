begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- A current Clerk role, or a newly created Player, cannot establish staff
-- authority on its own. Only a database operator can record a verified grant.
create table ironclad_private.patch2_staff_authorizations (
  subject_digest bytea primary key check (octet_length(subject_digest) = 32),
  verified_at timestamptz not null default now(),
  verification_reference text not null check (
    char_length(verification_reference) between 1 and 200
    and verification_reference = btrim(verification_reference)
  ),
  revoked_at timestamptz check (revoked_at >= verified_at)
);
alter table ironclad_private.patch2_staff_authorizations enable row level security;
alter table ironclad_private.patch2_staff_authorizations owner to postgres;
revoke all on ironclad_private.patch2_staff_authorizations from public, anon, authenticated, service_role;
comment on table ironclad_private.patch2_staff_authorizations is
  'Operator-verified Patch 2 staff grants. A durable account-closure marker always overrides a grant.';

-- This owner-only guard keeps grants/revocation serialized with closure and
-- all actor-aware Patch 2 reads/writes, even for existing service callers.
create function ironclad_private.lock_patch2_staff_authorizations()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0));
  return null;
end;
$$;
alter function ironclad_private.lock_patch2_staff_authorizations() owner to postgres;
revoke all on function ironclad_private.lock_patch2_staff_authorizations() from public, anon, authenticated, service_role;
create trigger patch2_staff_authorizations_lock
before insert or update or delete or truncate on ironclad_private.patch2_staff_authorizations
for each statement execute function ironclad_private.lock_patch2_staff_authorizations();

create or replace function public.get_patch2_admin_account_state(p_clerk_user_id text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare v_state text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  v_state := ironclad_private.patch2_account_state(p_clerk_user_id);
  if v_state is distinct from 'active-player' and v_state is distinct from 'no-player' then
    return 'denied';
  end if;
  if not exists (
    select from ironclad_private.patch2_staff_authorizations
    where subject_digest = sha256(convert_to(p_clerk_user_id, 'UTF8')) and revoked_at is null
  ) then
    return 'denied';
  end if;
  return case v_state
    when 'active-player' then 'verified-active-player'
    when 'no-player' then 'verified-staff'
    else 'denied'
  end;
end;
$$;

-- Existing guarded inbox, legacy notification and registration RPCs all use
-- this helper. Its allowed states remain explicitly enumerated.
create or replace function ironclad_private.require_patch2_open_account(p_sub text)
returns void language plpgsql set search_path = pg_catalog as $$
declare v_state text;
begin
  v_state := public.get_patch2_admin_account_state(p_sub);
  if v_state is distinct from 'verified-active-player' and v_state is distinct from 'verified-staff' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
end;
$$;

-- Private conversation staff actions retain the active Player requirement.
-- Ordinary requester actions stay independent of the staff grant table.
create or replace function public.call_patch2_private_assistance(
  p_operation text, p_arguments jsonb, p_actor_clerk_user_id text, p_actor_is_admin boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_sub text := btrim(p_actor_clerk_user_id);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  if p_actor_is_admin then
    if public.get_patch2_admin_account_state(v_sub) is distinct from 'verified-active-player' then
      raise exception 'Account access is unavailable' using errcode = '42501';
    end if;
  elsif ironclad_private.patch2_account_state(v_sub) is distinct from 'active-player' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  return ironclad_private.call_patch2_private_assistance(
    p_operation, p_arguments, p_actor_clerk_user_id, p_actor_is_admin
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
