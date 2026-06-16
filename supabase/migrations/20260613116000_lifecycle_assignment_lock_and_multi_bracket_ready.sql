begin;

create or replace function public.is_generated_bracket_populated(
  p_generated_bracket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    bool_and(slot_assignment.registration_id is not null),
    false
  )
  from (
    select distinct
      slot.slot_number,
      coalesce(
        player_one.registration_id,
        player_two.registration_id
      ) as registration_id
    from public.generated_brackets as generated
    cross join lateral generate_series(
      1,
      generated.slot_count
    ) as slot(slot_number)
    left join lateral (
      select match.player_one_registration_id as registration_id
      from public.tournament_matches as match
      where match.generated_bracket_id = generated.id
        and match.player_one_slot = slot.slot_number
        and match.player_one_registration_id is not null
      limit 1
    ) as player_one on true
    left join lateral (
      select match.player_two_registration_id as registration_id
      from public.tournament_matches as match
      where match.generated_bracket_id = generated.id
        and match.player_two_slot = slot.slot_number
        and match.player_two_registration_id is not null
      limit 1
    ) as player_two on true
    where generated.id = p_generated_bracket_id
  ) as slot_assignment;
$$;

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
  v_generated_count integer;
begin
  select count(*)::integer
  into v_generated_count
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where bracket.tournament_id = p_tournament_id;

  if v_generated_count = 0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and public.is_generated_bracket_populated(generated.id) is distinct
        from true
  );
end;
$$;

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
  v_tournament_status text;
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
    tournament.status,
    generated.format,
    generated.slot_count
  into
    v_tournament_bracket_id,
    v_tournament_id,
    v_tournament_start_date,
    v_tournament_status,
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

  if v_tournament_status in ('in_progress', 'completed') then
    raise exception
      'Bracket assignments cannot change after the tournament is in progress or completed';
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

  if public.are_tournament_generated_brackets_populated(v_tournament_id) then
    update public.tournaments
    set
      status = 'in_progress',
      registration_enabled = false
    where id = v_tournament_id
      and status = 'registration_open';
  end if;
end;
$$;

revoke all on function public.is_generated_bracket_populated(uuid)
  from public;
grant execute on function public.is_generated_bracket_populated(uuid)
  to service_role;

revoke all on function public.are_tournament_generated_brackets_populated(uuid)
  from public;
grant execute on function public.are_tournament_generated_brackets_populated(uuid)
  to service_role;

revoke all on function public.save_bracket_assignments(uuid, jsonb, text)
  from public;
grant execute on function public.save_bracket_assignments(uuid, jsonb, text)
  to service_role;

commit;
