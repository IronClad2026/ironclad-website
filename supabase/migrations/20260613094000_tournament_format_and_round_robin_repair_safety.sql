begin;

create or replace function public.enforce_supported_tournament_format()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.format <> '1v1' then
    raise exception
      'Only 1v1 tournaments are supported until team rosters and team-based matches are implemented';
  end if;

  return new;
end;
$$;

drop trigger if exists tournaments_enforce_supported_format
  on public.tournaments;
create trigger tournaments_enforce_supported_format
before insert or update on public.tournaments
for each row execute function public.enforce_supported_tournament_format();

create or replace function public.repair_generated_bracket_matches(
  p_generated_bracket_id uuid,
  p_repaired_by text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_slot_count integer;
  v_round_id uuid;
  v_round_count integer;
  v_round_number integer;
  v_match_count integer;
  v_match_number integer;
  v_round_name text;
  v_first_slot integer;
  v_second_slot integer;
  v_first_slot_registration_ids uuid[];
  v_second_slot_registration_ids uuid[];
  v_first_slot_occurrences integer;
  v_second_slot_occurrences integer;
  v_player_one_registration_id uuid;
  v_player_two_registration_id uuid;
  v_has_assignments boolean;
  v_inserted integer;
  v_total_inserted integer := 0;
begin
  if p_repaired_by is null or btrim(p_repaired_by) = '' then
    raise exception 'Repairing administrator is required';
  end if;

  select generated.format, generated.slot_count
  into v_format, v_slot_count
  from public.generated_brackets as generated
  where generated.id = p_generated_bracket_id
  for update;

  if not found then
    raise exception 'Generated bracket not found';
  end if;

  if v_slot_count < 2 then
    raise exception 'Generated bracket must contain at least two slots';
  end if;

  if v_format = 'single_elimination' then
    if (v_slot_count & (v_slot_count - 1)) <> 0 then
      raise exception 'Single-elimination slot count must be a power of two';
    end if;

    v_round_count := log(2, v_slot_count)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_slot_count / power(2, v_round_number)::integer;
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
        p_generated_bracket_id,
        v_round_number,
        v_round_name
      )
      on conflict (generated_bracket_id, round_number)
      do update set name = excluded.name
      returning id into v_round_id;

      for v_match_number in 1..v_match_count loop
        v_first_slot := ((v_match_number - 1) * 2) + 1;
        v_second_slot := v_first_slot + 1;

        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot
        )
        values (
          p_generated_bracket_id,
          v_round_id,
          v_match_number,
          case when v_round_number = 1 then v_first_slot else null end,
          case when v_round_number = 1 then v_second_slot else null end
        )
        on conflict (round_id, match_number) do nothing;

        get diagnostics v_inserted = row_count;
        v_total_inserted := v_total_inserted + v_inserted;
      end loop;
    end loop;
  elsif v_format = 'round_robin' then
    select exists (
      select 1
      from public.tournament_matches as match
      where match.generated_bracket_id = p_generated_bracket_id
        and (
          match.player_one_registration_id is not null
          or match.player_two_registration_id is not null
        )
    )
    into v_has_assignments;

    insert into public.bracket_rounds (
      generated_bracket_id,
      round_number,
      name
    )
    values (p_generated_bracket_id, 1, 'Round Robin')
    on conflict (generated_bracket_id, round_number)
    do update set name = excluded.name
    returning id into v_round_id;

    v_match_number := 0;
    for v_first_slot in 1..(v_slot_count - 1) loop
      for v_second_slot in (v_first_slot + 1)..v_slot_count loop
        v_match_number := v_match_number + 1;

        select coalesce(
          array_agg(slot_assignment.registration_id),
          array[]::uuid[]
        )
        into v_first_slot_registration_ids
        from (
          select match.player_one_registration_id as registration_id
          from public.tournament_matches as match
          where match.generated_bracket_id = p_generated_bracket_id
            and match.player_one_slot = v_first_slot
            and match.player_one_registration_id is not null
          union
          select match.player_two_registration_id
          from public.tournament_matches as match
          where match.generated_bracket_id = p_generated_bracket_id
            and match.player_two_slot = v_first_slot
          and match.player_two_registration_id is not null
        ) as slot_assignment;

        select count(*)
        into v_first_slot_occurrences
        from public.tournament_matches as match
        where match.generated_bracket_id = p_generated_bracket_id
          and (
            match.player_one_slot = v_first_slot
            or match.player_two_slot = v_first_slot
          );

        select coalesce(
          array_agg(slot_assignment.registration_id),
          array[]::uuid[]
        )
        into v_second_slot_registration_ids
        from (
          select match.player_one_registration_id as registration_id
          from public.tournament_matches as match
          where match.generated_bracket_id = p_generated_bracket_id
            and match.player_one_slot = v_second_slot
            and match.player_one_registration_id is not null
          union
          select match.player_two_registration_id
          from public.tournament_matches as match
          where match.generated_bracket_id = p_generated_bracket_id
            and match.player_two_slot = v_second_slot
          and match.player_two_registration_id is not null
        ) as slot_assignment;

        select count(*)
        into v_second_slot_occurrences
        from public.tournament_matches as match
        where match.generated_bracket_id = p_generated_bracket_id
          and (
            match.player_one_slot = v_second_slot
            or match.player_two_slot = v_second_slot
          );

        if cardinality(v_first_slot_registration_ids) > 1 then
          raise exception
            'Cannot repair round-robin bracket because slot % has conflicting participant assignments',
            v_first_slot;
        end if;

        if cardinality(v_second_slot_registration_ids) > 1 then
          raise exception
            'Cannot repair round-robin bracket because slot % has conflicting participant assignments',
            v_second_slot;
        end if;

        v_player_one_registration_id :=
          v_first_slot_registration_ids[1];
        v_player_two_registration_id :=
          v_second_slot_registration_ids[1];

        if v_has_assignments
          and (
            v_first_slot_occurrences = 0
            or v_second_slot_occurrences = 0
          ) then
          raise exception
            'Cannot repair round-robin match % because assignment data for slots % and % could not be recovered',
            v_match_number,
            v_first_slot,
            v_second_slot;
        end if;

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
          p_generated_bracket_id,
          v_round_id,
          v_match_number,
          v_first_slot,
          v_second_slot,
          v_player_one_registration_id,
          v_player_two_registration_id
        )
        on conflict (round_id, match_number) do nothing;

        get diagnostics v_inserted = row_count;
        v_total_inserted := v_total_inserted + v_inserted;
      end loop;
    end loop;
  else
    raise exception 'Unsupported generated bracket format';
  end if;

  return v_total_inserted;
end;
$$;

revoke all on function public.repair_generated_bracket_matches(uuid, text)
  from public;
grant execute on function public.repair_generated_bracket_matches(uuid, text)
  to service_role;

commit;
