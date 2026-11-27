begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Match the existing room actor boundary for every private-assistance call.
-- A still-valid admin JWT must lose access after normal account closure deletes
-- its Player or pseudonymizes the Clerk identity, as well as when closed_at is
-- present. Admins need no match participation or provider-verification facts.
-- Keep the boolean argument for compatibility with the applied RPC callers;
-- false no longer permits an identity without an active Player.
create or replace function ironclad_private.private_assistance_actor(p_require_player boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_sub text:=nullif(btrim(auth.jwt()->>'sub'),''); v_player uuid;
begin
  if auth.role() is distinct from 'authenticated' or v_sub is null then
    raise exception 'Assistance unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure',0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:'||v_sub,0));
  select id into v_player from public.players where clerk_user_id=v_sub and account_closed_at is null;
  if v_player is null then
    raise exception 'Active assistance account required' using errcode='42501'; end if;
  return v_player;
end $$;
alter function ironclad_private.private_assistance_actor(boolean) owner to postgres;
revoke all on function ironclad_private.private_assistance_actor(boolean) from public,anon,authenticated,service_role;

commit;
