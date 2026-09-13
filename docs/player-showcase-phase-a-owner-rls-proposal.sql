-- Proposed forward migration; NOT APPLIED.
-- Kept outside supabase/migrations until the additional Staging change is approved.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $owner_rpc_prerequisites$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres' and rolbypassrls)
    or (select encode(sha256(convert_to(pg_get_functiondef(
      'public.get_my_player_showcase()'::regprocedure), 'UTF8')), 'hex'))
      is distinct from '9f44de7895c1e80f7464a0bd1f709e10c03750805018c9cfc975f792cea6932a'
    or (select encode(sha256(convert_to(pg_get_functiondef(
      'ironclad_private.player_showcase_owner_state(uuid)'::regprocedure), 'UTF8')), 'hex'))
      is distinct from 'c7f99cd94e6168379aee7f797fe9ced2f52f952369d5da12dfc5a7d2dce3381a' then
    raise exception 'Showcase owner RPC prerequisites changed; review before applying';
  end if;
  if has_column_privilege('authenticated', 'public.players', 'account_closed_at', 'SELECT')
    or has_function_privilege('anon', 'public.get_my_player_showcase()', 'EXECUTE')
    or not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'public.player_showcases'::regclass) then
    raise exception 'Showcase privacy prerequisites changed';
  end if;
end;
$owner_rpc_prerequisites$;

-- The authenticated-only RPC derives the active player from the caller JWT.
-- Its verified postgres SECURITY DEFINER owner bypasses the inner table RLS.
-- The uncorrelated subquery resolves this owner once for the outer policy.
alter policy "Players can read their own Showcase"
on public.player_showcases
to authenticated
using (
  player_id = (select (public.get_my_player_showcase() ->> 'player_id')::uuid)
);

commit;

