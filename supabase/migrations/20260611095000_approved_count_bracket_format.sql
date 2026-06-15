begin;

create or replace function public.generate_tournament_bracket(
  p_tournament_bracket_id uuid,
  p_generated_by text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved_count integer;
  v_format text;
  v_generated_bracket_id uuid;
  v_round_id uuid;
  v_round_count integer;
  v_round_number integer;
  v_match_count integer;
  v_match_number integer;
  v_round_name text;
  v_first_slot integer;
  v_second_slot integer;
begin
  if p_generated_by is null or btrim(p_generated_by) = '' then
    raise exception 'Generating administrator is required';
  end if;

  perform 1
  from public.tournament_brackets
  where id = p_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament bracket not found';
  end if;

  select count(*)::integer
  into v_approved_count
  from public.registrations
  where tournament_bracket_id = p_tournament_bracket_id
    and registration_status = 'approved';

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;

  if v_approved_count < 2 then
    return null;
  end if;

  v_format := case
    when (v_approved_count & (v_approved_count - 1)) = 0
      then 'single_elimination'
    else 'round_robin'
  end;

  insert into public.generated_brackets (
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by
  )
  values (
    p_tournament_bracket_id,
    v_format,
    v_approved_count,
    v_approved_count,
    p_generated_by
  )
  returning id into v_generated_bracket_id;

  if v_format = 'single_elimination' then
    v_round_count := log(2, v_approved_count)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_approved_count / power(2, v_round_number)::integer;
      v_round_name := case
        when v_match_count = 1 then 'Grand Final'
        when v_match_count = 2 then 'Semi Finals'
        when v_match_count = 4 then 'Quarter Finals'
        else 'Round of ' || (v_match_count * 2)::text
      end;

      insert into public.bracket_rounds (
        generated_bracket_id,
        round_number,
        name
      )
      values (
        v_generated_bracket_id,
        v_round_number,
        v_round_name
      )
      returning id into v_round_id;

      for v_match_number in 1..v_match_count loop
        v_first_slot := ((v_match_number - 1) * 2) + 1;
        v_second_slot := v_first_slot + 1;

        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          case when v_round_number = 1 then v_first_slot else null end,
          case when v_round_number = 1 then v_second_slot else null end,
          null,
          null
        );
      end loop;
    end loop;
  else
    insert into public.bracket_rounds (
      generated_bracket_id,
      round_number,
      name
    )
    values (v_generated_bracket_id, 1, 'Round Robin')
    returning id into v_round_id;

    v_match_number := 0;
    for v_first_slot in 1..(v_approved_count - 1) loop
      for v_second_slot in (v_first_slot + 1)..v_approved_count loop
        v_match_number := v_match_number + 1;
        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          v_first_slot,
          v_second_slot,
          null,
          null
        );
      end loop;
    end loop;
  end if;

  return v_generated_bracket_id;
end;
$$;

revoke all on function public.generate_tournament_bracket(uuid, text)
  from public;
grant execute on function public.generate_tournament_bracket(uuid, text)
  to service_role;

create or replace function public.refresh_generated_bracket_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    if old.registration_status = 'approved' then
      v_old_bracket_id := old.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.registration_status = 'approved' then
      v_new_bracket_id := new.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.registration_status is not distinct from new.registration_status
      and old.tournament_bracket_id is not distinct from new.tournament_bracket_id then
      return new;
    end if;
  end if;

  if v_old_bracket_id is not null then
    perform public.generate_tournament_bracket(
      v_old_bracket_id,
      'system:approval-change'
    );
  end if;

  if v_new_bracket_id is not null
    and v_new_bracket_id is distinct from v_old_bracket_id then
    perform public.generate_tournament_bracket(
      v_new_bracket_id,
      'system:approval-change'
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_refresh_generated_bracket
  on public.registrations;
drop trigger if exists registrations_refresh_generated_bracket_insert_delete
  on public.registrations;
create trigger registrations_refresh_generated_bracket_insert_delete
after insert or delete
on public.registrations
for each row
execute function public.refresh_generated_bracket_on_approval();

drop trigger if exists registrations_refresh_generated_bracket_update
  on public.registrations;
create trigger registrations_refresh_generated_bracket_update
after update of registration_status, tournament_bracket_id
on public.registrations
for each row
execute function public.refresh_generated_bracket_on_approval();

do $$
declare
  v_bracket record;
begin
  for v_bracket in
    select id
    from public.tournament_brackets
  loop
    perform public.generate_tournament_bracket(
      v_bracket.id,
      'system:migration'
    );
  end loop;
end;
$$;

commit;
