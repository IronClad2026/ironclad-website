begin;

alter table public.tournaments
  drop constraint if exists tournaments_open_registration_dates;
alter table public.tournaments
  add constraint tournaments_open_registration_dates
  check (
    status <> 'registration_open'
    or (
      registration_close_at is not null
      and start_date is not null
    )
  ) not valid;

create or replace function public.save_tournament(
  p_tournament_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_banner_image_url text,
  p_registration_open_at timestamptz,
  p_registration_close_at timestamptz,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_status text,
  p_format text,
  p_prize_pool text,
  p_rules_url text,
  p_battlefy_url text,
  p_registration_enabled boolean,
  p_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
  v_protected_bracket_name text;
begin
  if p_status = 'registration_open'
    and p_registration_close_at is null
    and p_start_date is null then
    raise exception
      'Registration closing date and tournament start date are required when registration is open';
  end if;

  if p_status = 'registration_open'
    and p_registration_close_at is null then
    raise exception
      'Registration closing date is required when registration is open';
  end if;

  if p_status = 'registration_open'
    and p_start_date is null then
    raise exception
      'Tournament start date is required when registration is open';
  end if;

  if p_registration_open_at is not null
    and p_registration_close_at is not null
    and p_registration_open_at >= p_registration_close_at then
    raise exception 'Registration open date must be before close date';
  end if;

  if p_registration_close_at is not null
    and p_start_date is not null
    and p_registration_close_at > p_start_date then
    raise exception 'Registration must close before the tournament starts';
  end if;

  if p_end_date is not null
    and p_start_date is not null
    and p_end_date < p_start_date then
    raise exception 'Tournament end date must be after the start date';
  end if;

  if p_brackets is null
    or jsonb_typeof(p_brackets) <> 'array'
    or jsonb_array_length(p_brackets) = 0 then
    raise exception 'At least one bracket is required';
  end if;

  if p_tournament_id is not null then
    select bracket.name
    into v_protected_bracket_name
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.name not in (
        select value->>'name'
        from jsonb_array_elements(p_brackets)
      )
      and (
        exists (
          select 1
          from public.registrations as registration
          where registration.tournament_bracket_id = bracket.id
            and registration.registration_status = 'approved'
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
      )
    order by bracket.name
    limit 1;

    if v_protected_bracket_name is not null then
      raise exception
        'Cannot remove the % bracket during a normal tournament edit because it has approved registrations or generated competition data. Existing assignments, rounds, matches, submissions, standings, and results were preserved. Use an explicit destructive reset or tournament deletion workflow.',
        v_protected_bracket_name;
    end if;
  end if;

  if p_tournament_id is null then
    insert into public.tournaments (
      title,
      slug,
      description,
      banner_image_url,
      registration_open_at,
      registration_close_at,
      start_date,
      end_date,
      status,
      format,
      prize_pool,
      rules_url,
      battlefy_url,
      registration_enabled
    )
    values (
      p_title,
      p_slug,
      p_description,
      p_banner_image_url,
      p_registration_open_at,
      p_registration_close_at,
      p_start_date,
      p_end_date,
      p_status,
      p_format,
      p_prize_pool,
      nullif(p_rules_url, ''),
      nullif(p_battlefy_url, ''),
      p_registration_enabled
    )
    returning id into v_tournament_id;
  else
    update public.tournaments
    set
      title = p_title,
      slug = p_slug,
      description = p_description,
      banner_image_url = p_banner_image_url,
      registration_open_at = p_registration_open_at,
      registration_close_at = p_registration_close_at,
      start_date = p_start_date,
      end_date = p_end_date,
      status = p_status,
      format = p_format,
      prize_pool = p_prize_pool,
      rules_url = nullif(p_rules_url, ''),
      battlefy_url = nullif(p_battlefy_url, ''),
      registration_enabled = p_registration_enabled
    where id = p_tournament_id
    returning id into v_tournament_id;

    if v_tournament_id is null then
      raise exception 'Tournament not found';
    end if;
  end if;

  for v_bracket in
    select value from jsonb_array_elements(p_brackets)
  loop
    insert into public.tournament_brackets (
      tournament_id,
      name,
      elo_rules,
      max_players
    )
    values (
      v_tournament_id,
      v_bracket->>'name',
      v_bracket->>'elo_rules',
      (v_bracket->>'max_players')::integer
    )
    on conflict (tournament_id, name)
    do update set
      elo_rules = excluded.elo_rules,
      max_players = excluded.max_players;
  end loop;

  delete from public.tournament_brackets
  where tournament_id = v_tournament_id
    and name not in (
      select value->>'name'
      from jsonb_array_elements(p_brackets)
    );

  return v_tournament_id;
end;
$$;

revoke all on function public.save_tournament(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb
) from public;

grant execute on function public.save_tournament(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb
) to service_role;

commit;
