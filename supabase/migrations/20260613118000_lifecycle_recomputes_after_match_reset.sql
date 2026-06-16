begin;

create or replace function public.recompute_tournament_lifecycle_status(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_generated_count integer;
begin
  select status
  into v_current_status
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    return;
  end if;

  select count(*)::integer
  into v_generated_count
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where bracket.tournament_id = p_tournament_id;

  if v_generated_count = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.registrations as registration
    join public.tournament_brackets as bracket
      on bracket.id = registration.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and registration.registration_status = 'approved'
      and not exists (
        select 1
        from public.generated_brackets as generated
        where generated.tournament_bracket_id = bracket.id
      )
  ) then
    if v_current_status = 'completed'
      and public.are_tournament_generated_brackets_populated(p_tournament_id)
        is true then
      update public.tournaments
      set
        status = 'in_progress',
        registration_enabled = false
      where id = p_tournament_id;
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and public.is_generated_bracket_complete(generated.id) is distinct
        from true
  ) then
    if v_current_status = 'completed'
      and public.are_tournament_generated_brackets_populated(p_tournament_id)
        is true then
      update public.tournaments
      set
        status = 'in_progress',
        registration_enabled = false
      where id = p_tournament_id;
    end if;
    return;
  end if;

  update public.tournaments
  set
    status = 'completed',
    registration_enabled = false
  where id = p_tournament_id
    and status <> 'completed';
end;
$$;

create or replace function public.complete_tournament_if_competition_finished(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_tournament_lifecycle_status(p_tournament_id);
end;
$$;

create or replace function public.complete_tournament_on_match_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'completed'
      or new.winner_registration_id is null then
      return new;
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.winner_registration_id is not distinct from
      new.winner_registration_id then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.status <> 'completed'
    and old.status <> 'completed'
    and new.winner_registration_id is null
    and old.winner_registration_id is null then
    return new;
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = new.generated_bracket_id;

  if v_tournament_id is not null then
    perform public.recompute_tournament_lifecycle_status(v_tournament_id);
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_matches_complete_tournament
  on public.tournament_matches;
create trigger tournament_matches_complete_tournament
after insert or update of status, winner_registration_id
on public.tournament_matches
for each row
execute function public.complete_tournament_on_match_result();

revoke all on function public.recompute_tournament_lifecycle_status(uuid)
  from public;
grant execute on function public.recompute_tournament_lifecycle_status(uuid)
  to service_role;

revoke all on function public.complete_tournament_if_competition_finished(uuid)
  from public;
grant execute on function public.complete_tournament_if_competition_finished(uuid)
  to service_role;

revoke all on function public.complete_tournament_on_match_result()
  from public;
grant execute on function public.complete_tournament_on_match_result()
  to service_role;

commit;
