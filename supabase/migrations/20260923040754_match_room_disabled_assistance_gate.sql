begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- OFF admits no user communication mutations, including admin resolution.
-- Identity/lifecycle invalidation and account-closure privacy cleanup remain
-- available to the existing trusted competition and privacy authorities.
create or replace function public.resolve_match_room_assistance(p_room_id uuid, p_expected_request_version bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := ironclad_private.match_room_actor(); v_state public.match_room_assistance%rowtype; v_notice record;
begin
  if coalesce(auth.jwt() -> 'metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Match Room unavailable' using errcode = '42501';
  end if;
  if p_room_id is null or p_expected_request_version is null or p_expected_request_version not between 1 and 9007199254740991 then
    raise exception 'Invalid assistance request' using errcode = '22023';
  end if;
  perform ironclad_private.require_match_room_enabled();
  perform ironclad_private.match_room_access(p_room_id, v_sub);
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into v_state from public.match_room_assistance where room_id = p_room_id for update;
  if not found or v_state.request_version <> p_expected_request_version then
    raise exception 'Assistance request changed' using errcode = '40001';
  end if;
  if v_state.status = 'requested' then
    update public.match_room_assistance set status = 'resolved', resolved_at = clock_timestamp(),
      resolved_by_clerk_user_id = v_sub where room_id = p_room_id;
    for v_notice in select id from public.notifications
      where type = 'match.admin_assistance_requested' and metadata ->> 'roomId' = p_room_id::text
        and match_id = (select match_id from public.match_rooms where id = p_room_id)
    loop
      perform ironclad_private.finish_match_room_notification(v_notice.id, true);
    end loop;
  end if;
  return ironclad_private.match_room_assistance_projection(p_room_id);
end;
$$;
revoke all on function public.resolve_match_room_assistance(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.resolve_match_room_assistance(uuid, bigint) to authenticated;

-- This stable projection reflects the committed switch without acquiring a
-- mutation lock. The resolving RPC above independently takes the shared gate.
create or replace function ironclad_private.match_room_assistance_projection(p_room_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'roomId', p_room_id, 'status', coalesce(a.status, 'none'),
    'requestVersion', coalesce(a.request_version, 0),
    'requestedAt', a.requested_at, 'resolvedAt', a.resolved_at,
    'canResolve', public.get_match_room_enabled()
      and coalesce(a.status = 'requested', false)
      and coalesce(auth.jwt() -> 'metadata' ->> 'role', '') = 'admin'
  ) from (select 1) singleton left join public.match_room_assistance a on a.room_id = p_room_id;
$$;
revoke all on function ironclad_private.match_room_assistance_projection(uuid) from public, anon, authenticated, service_role;

commit;
