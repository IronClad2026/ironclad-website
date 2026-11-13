begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- The notice and its receipts are independent of effective legal documents
-- and prior acceptance records. Only a pseudonymous digest is needed to
-- recognize the same Clerk subject after account closure.
create table ironclad_private.public_gaming_profile_acknowledgements (
  subject_digest bytea not null check (octet_length(subject_digest) = 32),
  notice_version text not null check (notice_version ~ '^[a-z0-9-]{1,80}$'),
  acknowledged_at timestamptz not null default clock_timestamp(),
  primary key (subject_digest, notice_version)
);
alter table ironclad_private.public_gaming_profile_acknowledgements enable row level security;
alter table ironclad_private.public_gaming_profile_acknowledgements owner to postgres;
revoke all on ironclad_private.public_gaming_profile_acknowledgements from public, anon, authenticated, service_role;

insert into public.platform_settings(key, value)
values ('public_gaming_profile_notice', '{"enabled":false,"version":"public-gaming-profile-v1"}'::jsonb);

create function ironclad_private.public_gaming_profile_notice_version()
returns text
language plpgsql stable set search_path = pg_catalog as $$
declare
  v_setting jsonb;
begin
  select value into v_setting from public.platform_settings where key = 'public_gaming_profile_notice';
  if v_setting->'enabled' = 'false'::jsonb then
    return null;
  end if;
  if v_setting->'enabled' is distinct from 'true'::jsonb
     or coalesce(v_setting->>'version', '') !~ '^[a-z0-9-]{1,80}$' then
    raise exception 'PROFILE_NOTICE_UNAVAILABLE' using errcode = '55000';
  end if;
  return v_setting->>'version';
end;
$$;

create function ironclad_private.public_gaming_profile_notice_satisfied(p_subject text, p_version text)
returns boolean
language sql stable set search_path = pg_catalog as $$
  select coalesce(p_subject is not null and exists (
    select from ironclad_private.public_gaming_profile_acknowledgements
    where subject_digest = sha256(convert_to(p_subject, 'UTF8'))
      and notice_version = p_version
  ), false);
$$;

create function public.get_public_gaming_profile_notice_state(p_subject text)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_version text;
begin
  if auth.role() is distinct from 'service_role' or coalesce(p_subject, '') !~ '^user_[a-zA-Z0-9_]{1,120}$' then
    raise exception 'Trusted server identity required' using errcode = '42501';
  end if;
  v_version := ironclad_private.public_gaming_profile_notice_version();
  return jsonb_build_object(
    'version', v_version,
    'satisfied', v_version is null or ironclad_private.public_gaming_profile_notice_satisfied(p_subject, v_version)
  );
end;
$$;

create function public.acknowledge_public_gaming_profile_notice(p_subject text, p_expected_version text)
returns timestamptz
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_version text;
  v_digest bytea;
  v_acknowledged_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' or coalesce(p_subject, '') !~ '^user_[a-zA-Z0-9_]{1,120}$' then
    raise exception 'Trusted server identity required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  if ironclad_private.patch2_account_state(p_subject) = 'denied' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  -- The policy version cannot change between validation and receipt creation.
  perform 1 from public.platform_settings where key = 'public_gaming_profile_notice' for share;
  v_version := ironclad_private.public_gaming_profile_notice_version();
  if v_version is null or p_expected_version is distinct from v_version then
    raise exception 'PROFILE_NOTICE_VERSION_CHANGED' using errcode = '22023';
  end if;

  v_digest := sha256(convert_to(p_subject, 'UTF8'));
  insert into ironclad_private.public_gaming_profile_acknowledgements (subject_digest, notice_version)
    values (v_digest, v_version) on conflict do nothing;
  select acknowledged_at into strict v_acknowledged_at
    from ironclad_private.public_gaming_profile_acknowledgements
    where subject_digest = v_digest and notice_version = v_version;
  return v_acknowledged_at;
end;
$$;

-- Raw member REST/GraphQL uses the same evidence as the website. Public
-- requests and service-role workers retain their existing authority.
create function public.require_public_gaming_profile_notice_for_api()
returns void
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_version text;
begin
  if auth.role() is distinct from 'authenticated' then
    return;
  end if;
  v_version := ironclad_private.public_gaming_profile_notice_version();
  if v_version is not null and not ironclad_private.public_gaming_profile_notice_satisfied(auth.jwt()->>'sub', v_version) then
    raise exception 'PROFILE_NOTICE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- PostgREST's hook does not cover Storage or Realtime. These policies
-- intersect existing authenticated member permissions without granting any.
create function ironclad_private.current_public_gaming_profile_notice_satisfied()
returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(notice.version is null or ironclad_private.public_gaming_profile_notice_satisfied(auth.jwt()->>'sub', notice.version), false)
  from (select ironclad_private.public_gaming_profile_notice_version() as version) notice;
$$;

alter function ironclad_private.public_gaming_profile_notice_version() owner to postgres;
alter function ironclad_private.public_gaming_profile_notice_satisfied(text, text) owner to postgres;
alter function public.get_public_gaming_profile_notice_state(text) owner to postgres;
alter function public.acknowledge_public_gaming_profile_notice(text, text) owner to postgres;
alter function public.require_public_gaming_profile_notice_for_api() owner to postgres;
alter function ironclad_private.current_public_gaming_profile_notice_satisfied() owner to postgres;
revoke all on function
  ironclad_private.public_gaming_profile_notice_version(),
  ironclad_private.public_gaming_profile_notice_satisfied(text, text),
  public.get_public_gaming_profile_notice_state(text),
  public.acknowledge_public_gaming_profile_notice(text, text),
  public.require_public_gaming_profile_notice_for_api(),
  ironclad_private.current_public_gaming_profile_notice_satisfied()
from public, anon, authenticated, service_role;
grant execute on function public.get_public_gaming_profile_notice_state(text),
  public.acknowledge_public_gaming_profile_notice(text, text) to service_role;
grant execute on function public.require_public_gaming_profile_notice_for_api() to anon, authenticated, service_role;
grant execute on function ironclad_private.current_public_gaming_profile_notice_satisfied() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_db_role_setting settings
    cross join lateral unnest(settings.setconfig) as config(setting)
    where settings.setrole in (0, (select oid from pg_roles where rolname = 'authenticator'))
      and settings.setdatabase in (0, (select oid from pg_database where datname = current_database()))
      and config.setting like 'pgrst.db_pre_request=%'
  ) then
    raise exception 'Existing PostgREST pre-request hook requires explicit integration';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'public.require_public_gaming_profile_notice_for_api';

create policy public_gaming_profile_notice_private_avatar_guard
on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'player-avatars' or (select ironclad_private.current_public_gaming_profile_notice_satisfied()))
with check (bucket_id <> 'player-avatars' or (select ironclad_private.current_public_gaming_profile_notice_satisfied()));

create policy public_gaming_profile_notice_match_room_guard
on realtime.messages as restrictive for select to authenticated
using (
  (topic not like 'match-room:%' and coalesce((select realtime.topic()), '') not like 'match-room:%')
  or (select ironclad_private.current_public_gaming_profile_notice_satisfied())
);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
