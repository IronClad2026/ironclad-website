begin;

alter table public.generated_brackets
  add column if not exists slot_count integer;

update public.generated_brackets
set slot_count = participant_count
where slot_count is null;

alter table public.generated_brackets
  alter column slot_count set not null;

alter table public.tournament_matches
  add column if not exists player_one_slot integer,
  add column if not exists player_two_slot integer;

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
  v_max_players integer;
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

  select max_players
  into v_max_players
  from public.tournament_brackets
  where id = p_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament bracket not found';
  end if;

  if v_max_players < 2 then
    raise exception 'Tournament bracket capacity must be at least two';
  end if;

  v_format := case
    when v_max_players in (8, 16, 32)
      then 'single_elimination'
    else 'round_robin'
  end;

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;

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
    v_max_players,
    v_max_players,
    p_generated_by
  )
  returning id into v_generated_bracket_id;

  if v_format = 'single_elimination' then
    v_round_count := log(2, v_max_players)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_max_players / power(2, v_round_number)::integer;
      v_round_name := case
        when v_match_count = 1 then 'Final'
        when v_match_count = 2 then 'Semifinals'
        when v_match_count = 4 then 'Quarterfinals'
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
    for v_first_slot in 1..(v_max_players - 1) loop
      for v_second_slot in (v_first_slot + 1)..v_max_players loop
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
