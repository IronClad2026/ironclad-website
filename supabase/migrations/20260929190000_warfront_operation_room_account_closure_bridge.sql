begin;

-- This bridge is deliberately ordered after the complete Tournament Match Room
-- release package, including retention/privacy. It wraps the then-current
-- Phase Three closure boundary without changing any Tournament migration.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_warfront_m7;
alter function public.close_ironclad_player_account_without_warfront_m7(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account_without_warfront_m7(text)
  from public, anon, authenticated, service_role;

create function public.close_ironclad_player_account(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := pg_catalog.nullif(pg_catalog.btrim(p_clerk_user_id), '');
  v_player_id uuid;
  v_episode record;
  v_result jsonb;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null
    or pg_catalog.char_length(v_clerk_user_id) > 256
    or v_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  -- Preserve the canonical exclusive closure barrier before every M7 row lock.
  -- The wrapped Tournament Phase Three boundary reacquires this transaction-
  -- scoped lock safely before it reaches its established predecessor chain.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:match-room-account-closure', 0)
  );

  -- This is intentionally independent of a Player row: when the established
  -- closure RPC is invoked for an admin-only Clerk identity, direct private
  -- attribution is pseudonymized while its opaque durable actor ID survives.
  update ironclad_private.warfront_operation_room_admin_actors
  set
    clerk_user_id = null,
    pseudonymized_at = coalesce(pseudonymized_at, pg_catalog.clock_timestamp())
  where clerk_user_id = v_clerk_user_id;

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  if found then
    -- Episode rows retain no Clerk identifier. Resolve their linked platform
    -- notices and remove personal cursor state before underlying pseudonymy.
    for v_episode in
      update public.warfront_operation_room_notification_episodes as episode
      set resolved_at = pg_catalog.clock_timestamp()
      where episode.recipient_player_id = v_player_id
        and episode.resolved_at is null
      returning episode.notification_id
    loop
      perform ironclad_private.finish_warfront_operation_room_notification(
        v_episode.notification_id,
        true
      );
    end loop;

    delete from public.warfront_operation_room_reads
    where player_id = v_player_id;
  end if;

  v_result := public.close_ironclad_player_account_without_warfront_m7(
    v_clerk_user_id
  );

  return v_result;
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

comment on function public.close_ironclad_player_account(text) is
  'Latest service-role closure wrapper. It preserves the effective Tournament and WARFRONT closure chain, exclusively holds the canonical barrier, pseudonymizes M7 private ADMIN Clerk attribution, resolves M7 episodes, and removes personal M7 cursors.';

commit;
