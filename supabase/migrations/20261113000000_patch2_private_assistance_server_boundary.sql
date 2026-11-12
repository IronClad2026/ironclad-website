begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Private assistance must use the website's current Clerk authority. A browser
-- JWT minted before demotion cannot call these entry points directly.
create function public.call_patch2_private_assistance(
  p_operation text,
  p_arguments jsonb,
  p_actor_clerk_user_id text,
  p_actor_is_admin boolean
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_claim text := current_setting('request.jwt.claim', true);
  v_role text := current_setting('request.jwt.claim.role', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
  v_verified_claims text;
  v_keys text[];
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted assistance server required' using errcode = '42501';
  end if;
  if v_actor is null or length(v_actor) > 255 or p_actor_is_admin is null
    or jsonb_typeof(p_arguments) is distinct from 'object' then
    raise exception 'Invalid assistance operation input' using errcode = '22023';
  end if;

  v_keys := case p_operation
    when 'get_private_assistance_context' then array['p_room_id']
    when 'open_private_assistance' then array['p_room_id','p_client_message_id','p_body']
    when 'reply_private_assistance' then array['p_request_id','p_client_message_id','p_body','p_tournament_id']
    when 'read_private_assistance' then array['p_request_id','p_after_sequence','p_limit','p_tournament_id']
    when 'list_admin_private_assistance' then array['p_tournament_id','p_status','p_page','p_selected_id']
    when 'set_private_assistance_status' then array['p_tournament_id','p_request_id','p_status','p_expected_version']
    when 'list_legacy_room_assistance' then array['p_tournament_id','p_page','p_include_resolved']
    when 'get_match_room_assistance' then array['p_room_id']
    when 'resolve_match_room_assistance' then array['p_room_id','p_expected_request_version']
  end;
  if v_keys is null or not (p_arguments ?& v_keys) or p_arguments - v_keys <> '{}'::jsonb then
    raise exception 'Unknown assistance operation or arguments' using errcode = '22023';
  end if;
  if p_operation in (
    'list_admin_private_assistance','set_private_assistance_status',
    'list_legacy_room_assistance','resolve_match_room_assistance'
  )
    and not p_actor_is_admin then
    raise exception 'Admin required' using errcode = '42501';
  end if;

  -- The server supplies the actor and freshly verified staff authority. Keep
  -- the existing SQL ownership, active Player, legal, locking and retention
  -- checks in the called functions. Restore claims after a successful call.
  -- A failed SQL statement rolls back the transaction-local settings.
  v_verified_claims := jsonb_build_object(
    'sub', v_actor, 'role', 'authenticated',
    'metadata', jsonb_build_object('role', case when p_actor_is_admin then 'admin' else 'player' end)
  )::text;
  perform set_config('request.jwt.claims', v_verified_claims, true);
  perform set_config('request.jwt.claim', v_verified_claims, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_actor, true);

  case p_operation
    when 'get_private_assistance_context' then
      v_result := public.get_private_assistance_context((p_arguments->>'p_room_id')::uuid);
    when 'open_private_assistance' then
      v_result := public.open_private_assistance(
        (p_arguments->>'p_room_id')::uuid, (p_arguments->>'p_client_message_id')::uuid, p_arguments->>'p_body');
    when 'reply_private_assistance' then
      v_result := public.reply_private_assistance(
        (p_arguments->>'p_request_id')::uuid, (p_arguments->>'p_client_message_id')::uuid,
        p_arguments->>'p_body', (p_arguments->>'p_tournament_id')::uuid);
    when 'read_private_assistance' then
      v_result := public.read_private_assistance(
        (p_arguments->>'p_request_id')::uuid, (p_arguments->>'p_after_sequence')::bigint,
        (p_arguments->>'p_limit')::integer, (p_arguments->>'p_tournament_id')::uuid);
    when 'list_admin_private_assistance' then
      v_result := public.list_admin_private_assistance(
        (p_arguments->>'p_tournament_id')::uuid, p_arguments->>'p_status',
        (p_arguments->>'p_page')::integer, (p_arguments->>'p_selected_id')::uuid);
    when 'set_private_assistance_status' then
      v_result := public.set_private_assistance_status(
        (p_arguments->>'p_tournament_id')::uuid, (p_arguments->>'p_request_id')::uuid,
        p_arguments->>'p_status', (p_arguments->>'p_expected_version')::bigint);
    when 'list_legacy_room_assistance' then
      v_result := public.list_legacy_room_assistance(
        (p_arguments->>'p_tournament_id')::uuid, (p_arguments->>'p_page')::integer,
        (p_arguments->>'p_include_resolved')::boolean);
    when 'get_match_room_assistance' then
      v_result := public.get_match_room_assistance((p_arguments->>'p_room_id')::uuid);
    when 'resolve_match_room_assistance' then
      v_result := public.resolve_match_room_assistance(
        (p_arguments->>'p_room_id')::uuid, (p_arguments->>'p_expected_request_version')::bigint);
  end case;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim', coalesce(v_claim, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return v_result;
end
$$;

alter function public.call_patch2_private_assistance(text,jsonb,text,boolean) owner to postgres;
revoke all on function public.call_patch2_private_assistance(text,jsonb,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.call_patch2_private_assistance(text,jsonb,text,boolean) to service_role;

revoke all on function public.get_private_assistance_context(uuid),
  public.open_private_assistance(uuid,uuid,text),public.reply_private_assistance(uuid,uuid,text,uuid),
  public.read_private_assistance(uuid,bigint,integer,uuid),public.list_admin_private_assistance(uuid,text,integer,uuid),
  public.set_private_assistance_status(uuid,uuid,text,bigint),public.list_legacy_room_assistance(uuid,integer,boolean),
  public.get_match_room_assistance(uuid),public.resolve_match_room_assistance(uuid,bigint)
  from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
commit;
