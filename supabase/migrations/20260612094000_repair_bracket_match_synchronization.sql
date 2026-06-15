begin;

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

create or replace function public.save_bracket_assignments(
  p_generated_bracket_id uuid,
  p_assignments jsonb,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_bracket_id uuid;
  v_tournament_id uuid;
  v_tournament_start_date timestamptz;
  v_format text;
  v_slot_count integer;
  v_assignment jsonb;
  v_slot_number integer;
  v_registration_id uuid;
  v_assigned_registration_ids uuid[] := array[]::uuid[];
  v_updated_rows integer;
  v_second_updated_rows integer;
begin
  if p_updated_by is null or btrim(p_updated_by) = '' then
    raise exception 'Updating administrator is required';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Bracket assignments must be a JSON array';
  end if;

  select
    generated.tournament_bracket_id,
    bracket.tournament_id,
    tournament.start_date,
    generated.format,
    generated.slot_count
  into
    v_tournament_bracket_id,
    v_tournament_id,
    v_tournament_start_date,
    v_format,
    v_slot_count
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where generated.id = p_generated_bracket_id
  for update of generated;

  if not found then
    raise exception 'Generated bracket not found';
  end if;

  if v_tournament_start_date is not null
    and now() >= v_tournament_start_date then
    raise exception 'Bracket assignments cannot change after the tournament starts';
  end if;

  perform public.repair_generated_bracket_matches(
    p_generated_bracket_id,
    p_updated_by
  );

  if jsonb_array_length(p_assignments) <> v_slot_count then
    raise exception 'Every bracket slot must be included';
  end if;

  if (
    select count(*)
    from (
      select (assignment->>'slot_number')::integer as slot_number
      from jsonb_array_elements(p_assignments) as assignment
    ) as slots
  ) <> (
    select count(distinct slot_number)
    from (
      select (assignment->>'slot_number')::integer as slot_number
      from jsonb_array_elements(p_assignments) as assignment
    ) as slots
  ) then
    raise exception 'Each bracket slot may appear only once';
  end if;

  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    v_slot_number := nullif(v_assignment->>'slot_number', '')::integer;
    v_registration_id :=
      nullif(v_assignment->>'registration_id', '')::uuid;

    if v_slot_number is null
      or v_slot_number < 1
      or v_slot_number > v_slot_count then
      raise exception 'Invalid bracket slot number';
    end if;

    if v_registration_id is not null then
      if v_registration_id = any(v_assigned_registration_ids) then
        raise exception 'A participant can only occupy one bracket slot';
      end if;

      if not exists (
        select 1
        from public.registrations as registration
        where registration.id = v_registration_id
          and registration.tournament_id = v_tournament_id
          and registration.tournament_bracket_id = v_tournament_bracket_id
          and registration.registration_status = 'approved'
      ) then
        raise exception
          'Only approved participants from this bracket can be assigned';
      end if;

      v_assigned_registration_ids :=
        array_append(v_assigned_registration_ids, v_registration_id);
    end if;
  end loop;

  update public.tournament_matches
  set
    player_one_registration_id = case
      when player_one_slot is not null then null
      else player_one_registration_id
    end,
    player_two_registration_id = case
      when player_two_slot is not null then null
      else player_two_registration_id
    end
  where generated_bracket_id = p_generated_bracket_id;

  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    v_slot_number := (v_assignment->>'slot_number')::integer;
    v_registration_id :=
      nullif(v_assignment->>'registration_id', '')::uuid;
    v_updated_rows := 0;

    update public.tournament_matches
    set player_one_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_one_slot = v_slot_number;
    get diagnostics v_updated_rows = row_count;

    update public.tournament_matches
    set player_two_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_two_slot = v_slot_number;
    get diagnostics v_second_updated_rows = row_count;
    v_updated_rows := v_updated_rows + v_second_updated_rows;

    if v_updated_rows = 0 then
      raise exception 'Bracket slot % has no match record', v_slot_number;
    end if;
  end loop;

  if v_format = 'round_robin' then
    delete from public.tournament_standings
    where generated_bracket_id = p_generated_bracket_id;

    insert into public.tournament_standings (
      generated_bracket_id,
      registration_id
    )
    select
      p_generated_bracket_id,
      registration_id
    from unnest(v_assigned_registration_ids) as registration_id;
  end if;
end;
$$;

revoke all on function public.save_bracket_assignments(uuid, jsonb, text)
  from public;
grant execute on function public.save_bracket_assignments(uuid, jsonb, text)
  to service_role;

commit;
