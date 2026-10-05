begin;

create or replace function public.get_warfront_operation_room_bootstrap_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_operation_room_bootstrap($1,$2);
end;
$$;

commit;
