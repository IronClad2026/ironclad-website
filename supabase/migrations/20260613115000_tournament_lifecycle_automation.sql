begin;

create or replace function public.enforce_tournament_registration_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_registration_open_at timestamptz;
  v_max_players integer;
  v_approved_players bigint;
  v_waitlisted_players bigint;
  v_older_waitlisted_exists boolean;
  v_requires_open_check boolean;
begin
  if tg_op = 'UPDATE'
    and old.tournament_id is not distinct from new.tournament_id
    and old.tournament_bracket_id is not distinct from
      new.tournament_bracket_id
    and old.registration_status is not distinct from
      new.registration_status then
    return new;
  end if;

  if new.registration_status = 'rejected' then
    return new;
  end if;

  if new.tournament_id is null or new.tournament_bracket_id is null then
    return new;
  end if;

  select
    tournament.status,
    tournament.registration_open_at,
    bracket.max_players
  into
    v_status,
    v_registration_open_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = new.tournament_bracket_id
    and tournament.id = new.tournament_id
  for update of bracket;

  if not found then
    raise exception 'Selected tournament bracket does not exist';
  end if;

  if tg_op = 'INSERT' then
    v_requires_open_check := true;
  else
    v_requires_open_check :=
      old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
      or (
        old.registration_status = 'rejected'
        and new.registration_status <> 'rejected'
      )
      or (
        old.registration_status is distinct from new.registration_status
        and new.registration_status in (
          'pending',
          'manual_review',
          'approved',
          'waitlisted'
        )
      );
  end if;

  if v_requires_open_check
    and (
      v_status <> 'registration_open'
      or (
        v_registration_open_at is not null
        and now() < v_registration_open_at
      )
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  select
    count(*) filter (where registration_status = 'approved'),
    count(*) filter (where registration_status = 'waitlisted')
  into
    v_approved_players,
    v_waitlisted_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and id <> new.id;

  select exists (
    select 1
    from public.registrations as registration
    where registration.tournament_bracket_id = new.tournament_bracket_id
      and registration.registration_status = 'waitlisted'
      and registration.id <> new.id
      and (
        registration.created_at < new.created_at
        or (
          registration.created_at = new.created_at
          and registration.id::text < new.id::text
        )
      )
  )
  into v_older_waitlisted_exists;

  if new.registration_status = 'approved'
    and v_older_waitlisted_exists then
    raise exception
      'Cannot approve this registration before older waitlisted registrations for the same bracket';
  end if;

  if new.registration_status = 'approved'
    and v_approved_players >= v_max_players then
    raise exception
      'Tournament bracket is full: capacity is %, with % approved registrations',
      v_max_players,
      v_approved_players;
  end if;

  if new.registration_status in ('pending', 'waitlisted') then
    if v_approved_players >= v_max_players
      or (
        tg_op = 'INSERT'
        and v_waitlisted_players > 0
      )
      or (
        tg_op = 'UPDATE'
        and new.registration_status = 'pending'
        and v_older_waitlisted_exists
      ) then
      new.registration_status = 'waitlisted';
    elsif tg_op = 'INSERT' then
      new.registration_status = 'pending';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.is_generated_bracket_complete(
  p_generated_bracket_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_format text;
  v_match_count integer;
  v_incomplete_count integer;
  v_final_completed boolean;
begin
  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = p_generated_bracket_id;

  if not found then
    return false;
  end if;

  if v_format = 'round_robin' then
    select
      count(*)::integer,
      count(*) filter (
        where match.status <> 'completed'
          or match.winner_registration_id is null
      )::integer
    into v_match_count, v_incomplete_count
    from public.tournament_matches as match
    where match.generated_bracket_id = p_generated_bracket_id;

    return v_match_count > 0 and v_incomplete_count = 0;
  end if;

  select
    match.status = 'completed'
      and match.winner_registration_id is not null
  into v_final_completed
  from public.tournament_matches as match
  join public.bracket_rounds as round
    on round.id = match.round_id
  where match.generated_bracket_id = p_generated_bracket_id
  order by round.round_number desc, match.match_number desc
  limit 1;

  return coalesce(v_final_completed, false);
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

create or replace function public.complete_tournament_on_match_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  if new.status <> 'completed'
    or new.winner_registration_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.winner_registration_id is not distinct from
      new.winner_registration_id then
    return new;
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = new.generated_bracket_id;

  if v_tournament_id is not null then
    perform public.complete_tournament_if_competition_finished(
      v_tournament_id
    );
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

  if v_tournament_status = 'completed' then
    raise exception 'Bracket assignments cannot change after the tournament is completed';
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

  if cardinality(v_assigned_registration_ids) = v_slot_count then
    update public.tournaments
    set
      status = 'in_progress',
      registration_enabled = false
    where id = v_tournament_id
      and status = 'registration_open';
  end if;
end;
$$;

revoke all on function public.is_generated_bracket_complete(uuid)
  from public;
grant execute on function public.is_generated_bracket_complete(uuid)
  to service_role;

revoke all on function public.complete_tournament_if_competition_finished(uuid)
  from public;
grant execute on function public.complete_tournament_if_competition_finished(uuid)
  to service_role;

revoke all on function public.complete_tournament_on_match_result()
  from public;
grant execute on function public.complete_tournament_on_match_result()
  to service_role;

revoke all on function public.save_bracket_assignments(uuid, jsonb, text)
  from public;
grant execute on function public.save_bracket_assignments(uuid, jsonb, text)
  to service_role;

commit;
