begin;

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

    update public.tournament_matches
    set player_one_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_one_slot = v_slot_number;

    update public.tournament_matches
    set player_two_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_two_slot = v_slot_number;
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
