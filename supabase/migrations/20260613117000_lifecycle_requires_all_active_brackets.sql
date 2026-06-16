begin;

create or replace function public.are_tournament_generated_brackets_populated(
  p_tournament_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active_bracket_count integer;
begin
  select count(*)::integer
  into v_active_bracket_count
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id
    and exists (
      select 1
      from public.registrations as registration
      where registration.tournament_bracket_id = bracket.id
        and registration.registration_status = 'approved'
    );

  if v_active_bracket_count = 0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and exists (
        select 1
        from public.registrations as registration
        where registration.tournament_bracket_id = bracket.id
          and registration.registration_status = 'approved'
      )
      and not exists (
        select 1
        from public.generated_brackets as generated
        where generated.tournament_bracket_id = bracket.id
          and public.is_generated_bracket_populated(generated.id) is true
      )
  );
end;
$$;

revoke all on function public.are_tournament_generated_brackets_populated(uuid)
  from public;
grant execute on function public.are_tournament_generated_brackets_populated(uuid)
  to service_role;

commit;
