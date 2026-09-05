begin;

-- Keep the established save RPC as the only event/bracket writer. Canonical
-- division advisory locks serialize concurrent event creation so the normal
-- ranked lifecycle cannot open two unresolved cycles for the same division.
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
  p_grand_final_at timestamptz,
  p_rule_format text,
  p_result_confirmation_window_minutes integer,
  p_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
  v_bracket_name text;
  v_conflicting_tournament_title text;
  v_protected_bracket_name text;
  v_rule_format text;
  v_confirmation_window integer;
begin
  v_rule_format := coalesce(nullif(p_rule_format, ''), 'format_a');
  v_confirmation_window :=
    coalesce(p_result_confirmation_window_minutes, 30);

  if v_rule_format not in ('format_a', 'format_b') then
    raise exception 'Invalid tournament rule format';
  end if;

  if v_confirmation_window not in (
    1,
    5,
    15,
    30,
    60,
    120,
    360,
    720,
    1440
  ) then
    raise exception 'Invalid result confirmation window';
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
    or pg_catalog.jsonb_typeof(p_brackets) <> 'array'
    or pg_catalog.jsonb_array_length(p_brackets) = 0 then
    raise exception 'At least one bracket is required';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    where pg_catalog.jsonb_typeof(requested.value) <> 'object'
      or requested.value ->> 'name' not in ('Academy', 'Challenge', 'Main')
  )
    or (
      select count(*)
      from pg_catalog.jsonb_array_elements(p_brackets)
    ) <> (
      select count(distinct requested.value ->> 'name')
      from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    ) then
    raise exception 'Tournament divisions must be unique canonical divisions';
  end if;

  if p_tournament_id is not null then
    select tournament.id
    into v_tournament_id
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for update;

    if not found then
      raise exception 'Tournament not found';
    end if;
  end if;

  for v_bracket_name in
    select requested.value ->> 'name'
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    order by requested.value ->> 'name'
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:ranked-division-cycle:' || v_bracket_name,
        0
      )
    );

    select tournament.title
    into v_conflicting_tournament_title
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where bracket.name = v_bracket_name
      and (
        p_tournament_id is null
        or tournament.id <> p_tournament_id
      )
      and coalesce(tournament.status, '') not in (
        'completed',
        'cancelled',
        'voided'
      )
      and (
        bracket.launched_at is null
        or not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
            and public.is_generated_bracket_complete(generated.id)
              is distinct from true
        )
      )
    order by tournament.created_at, tournament.id
    limit 1;

    if v_conflicting_tournament_title is not null then
      raise exception
        'The % Division already has an unresolved ranked cycle in event %. Resolve that Division before enabling another.',
        v_bracket_name,
        v_conflicting_tournament_title
        using errcode = '55000';
    end if;
  end loop;

  if p_tournament_id is not null then
    select bracket.name
    into v_protected_bracket_name
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.name not in (
        select requested.value ->> 'name'
        from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
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
      registration_enabled,
      grand_final_at,
      rule_format,
      result_confirmation_window_minutes
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
      coalesce(p_prize_pool, ''),
      nullif(p_rules_url, ''),
      nullif(p_battlefy_url, ''),
      p_registration_enabled,
      null,
      v_rule_format,
      v_confirmation_window
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
      start_date = coalesce(p_start_date, start_date),
      end_date = coalesce(p_end_date, end_date),
      status = p_status,
      format = p_format,
      prize_pool = coalesce(p_prize_pool, ''),
      rules_url = nullif(p_rules_url, ''),
      battlefy_url = nullif(p_battlefy_url, ''),
      registration_enabled = p_registration_enabled,
      rule_format = v_rule_format,
      result_confirmation_window_minutes = v_confirmation_window
    where id = p_tournament_id
    returning id into v_tournament_id;
  end if;

  for v_bracket in
    select requested.value
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
  loop
    insert into public.tournament_brackets (
      tournament_id,
      name,
      elo_rules,
      max_players
    )
    values (
      v_tournament_id,
      v_bracket ->> 'name',
      v_bracket ->> 'elo_rules',
      (v_bracket ->> 'max_players')::integer
    )
    on conflict (tournament_id, name)
    do update set
      elo_rules = excluded.elo_rules,
      max_players = excluded.max_players;
  end loop;

  delete from public.tournament_brackets
  where tournament_id = v_tournament_id
    and name not in (
      select requested.value ->> 'name'
      from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    );

  return v_tournament_id;
end;
$$;

alter function public.save_tournament(
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
  timestamptz,
  text,
  integer,
  jsonb
) owner to postgres;

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
  timestamptz,
  text,
  integer,
  jsonb
) from public, anon, authenticated;

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
  timestamptz,
  text,
  integer,
  jsonb
) to service_role;

comment on function public.save_tournament(
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
  timestamptz,
  text,
  integer,
  jsonb
) is
  'Single event save authority. Preserves legacy Grand Final metadata, forces new events to unscheduled finals, and serializes canonical ranked-division cycles.';

commit;
