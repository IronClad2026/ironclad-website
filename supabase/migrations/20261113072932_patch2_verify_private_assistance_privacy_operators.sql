begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Keep the original retention and privacy rules behind a verified operator
-- check. Take the existing exclusive lock before checking authority so the
-- room helpers never have to upgrade a shared lock while closure is waiting.
create function ironclad_private.require_patch2_privacy_operator(p_actor text)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Patch 2 server required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0));
  if public.get_patch2_admin_account_state(p_actor) is distinct from 'verified-active-player' then
    raise exception 'Verified active privacy operator required' using errcode = '42501';
  end if;
end;
$$;
alter function ironclad_private.require_patch2_privacy_operator(text) owner to postgres;
revoke all on function ironclad_private.require_patch2_privacy_operator(text)
  from public, anon, authenticated, service_role;

alter function public.locate_private_assistance_subject(uuid, integer, text) set schema ironclad_private;
alter function public.export_private_assistance_subject(uuid, uuid, bigint, integer, text) set schema ironclad_private;
alter function public.redact_private_assistance_messages(uuid, uuid, uuid[], text) set schema ironclad_private;
alter function public.purge_match_room_retention(uuid[], text) set schema ironclad_private;
revoke all on function ironclad_private.locate_private_assistance_subject(uuid, integer, text),
  ironclad_private.export_private_assistance_subject(uuid, uuid, bigint, integer, text),
  ironclad_private.redact_private_assistance_messages(uuid, uuid, uuid[], text),
  ironclad_private.purge_match_room_retention(uuid[], text)
  from public, anon, authenticated, service_role;

create function public.locate_private_assistance_subject(
  p_player_id uuid, p_limit integer, p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
set lock_timeout = '2s' set statement_timeout = '60s' as $$
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor_clerk_user_id);
  return ironclad_private.locate_private_assistance_subject(p_player_id, p_limit, p_actor_clerk_user_id);
end;
$$;

create function public.export_private_assistance_subject(
  p_player_id uuid, p_request_id uuid, p_after_sequence bigint, p_limit integer, p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
set lock_timeout = '2s' set statement_timeout = '60s' as $$
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor_clerk_user_id);
  return ironclad_private.export_private_assistance_subject(
    p_player_id, p_request_id, p_after_sequence, p_limit, p_actor_clerk_user_id
  );
end;
$$;

create function public.redact_private_assistance_messages(
  p_player_id uuid, p_request_id uuid, p_message_ids uuid[], p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
set lock_timeout = '2s' set statement_timeout = '60s' as $$
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor_clerk_user_id);
  return ironclad_private.redact_private_assistance_messages(
    p_player_id, p_request_id, p_message_ids, p_actor_clerk_user_id
  );
end;
$$;

create function public.purge_match_room_retention(p_room_ids uuid[], p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
set lock_timeout = '2s' set statement_timeout = '60s' as $$
begin
  perform ironclad_private.require_patch2_privacy_operator(p_actor_clerk_user_id);
  return ironclad_private.purge_match_room_retention(p_room_ids, p_actor_clerk_user_id);
end;
$$;

alter function public.locate_private_assistance_subject(uuid, integer, text) owner to postgres;
alter function public.export_private_assistance_subject(uuid, uuid, bigint, integer, text) owner to postgres;
alter function public.redact_private_assistance_messages(uuid, uuid, uuid[], text) owner to postgres;
alter function public.purge_match_room_retention(uuid[], text) owner to postgres;
revoke all on function public.locate_private_assistance_subject(uuid, integer, text),
  public.export_private_assistance_subject(uuid, uuid, bigint, integer, text),
  public.redact_private_assistance_messages(uuid, uuid, uuid[], text),
  public.purge_match_room_retention(uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.locate_private_assistance_subject(uuid, integer, text),
  public.export_private_assistance_subject(uuid, uuid, bigint, integer, text),
  public.redact_private_assistance_messages(uuid, uuid, uuid[], text),
  public.purge_match_room_retention(uuid[], text)
  to service_role;

notify pgrst, 'reload schema';
commit;
