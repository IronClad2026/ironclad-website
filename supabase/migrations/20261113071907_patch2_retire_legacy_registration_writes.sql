begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Old application builds used the service role for unscoped review and
-- direct deletion. The scoped SECURITY DEFINER functions can still call the
-- original review authority as its owner, preserving all registration rules.
revoke execute on function public.review_tournament_registration(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke delete on table public.registrations
  from public, anon, authenticated, service_role;

-- Refuse cutover if a role still inherits either privilege.
do $$
begin
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as api_role(name)
    where has_function_privilege(api_role.name, 'public.review_tournament_registration(uuid,text,text)', 'EXECUTE')
       or has_table_privilege(api_role.name, 'public.registrations', 'DELETE')
  ) then
    raise exception 'Legacy registration write privileges remain';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
