begin;

drop trigger if exists registrations_refresh_generated_bracket_insert_delete
  on public.registrations;
drop trigger if exists registrations_refresh_generated_bracket_update
  on public.registrations;

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
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
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
      p_grand_final_at,
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
      grand_final_at = p_grand_final_at,
      rule_format = v_rule_format,
      result_confirmation_window_minutes = v_confirmation_window
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

create or replace function public.enforce_tournament_registration_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_max_players integer;
  v_approved_players bigint;
  v_waitlisted_players bigint;
  v_active_cohort_players bigint;
  v_active_cohort_limit constant integer := 8;
  v_older_waitlisted_exists boolean;
  v_requires_open_check boolean;
  v_enters_active_cohort boolean := false;
  v_new_roster_locked boolean := false;
  v_old_roster_locked boolean := false;
  v_pre_lock_waitlist_promotion boolean := false;
  v_pre_lock_admin_roster_management boolean := false;
  v_public_registration_available boolean := false;
  v_registration_has_opened boolean := false;
  v_is_service_role boolean;
begin
  if tg_op = 'UPDATE'
    and old.tournament_id is not distinct from new.tournament_id
    and old.tournament_bracket_id is not distinct from
      new.tournament_bracket_id
    and old.registration_status is not distinct from
      new.registration_status then
    return new;
  end if;

  v_is_service_role := coalesce(auth.role(), '') = 'service_role';

  if tg_op = 'UPDATE'
    and old.registration_status in (
      'pending',
      'manual_review',
      'waitlisted',
      'approved'
    )
    and old.tournament_id is not null
    and old.tournament_bracket_id is not null then
    v_old_roster_locked :=
      public.is_tournament_bracket_roster_locked(old.tournament_bracket_id);

    if (
      new.registration_status is distinct from old.registration_status
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
    )
      and v_old_roster_locked then
      raise exception
        'Tournament bracket roster is locked after bracket generation';
    end if;
  end if;

  if new.tournament_id is null or new.tournament_bracket_id is null then
    return new;
  end if;

  select
    tournament.status,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.max_players
  into
    v_status,
    v_registration_open_at,
    v_registration_close_at,
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

  if tg_op = 'INSERT' and v_is_service_role then
    new.created_at := clock_timestamp();
  end if;

  v_registration_has_opened :=
    v_status = 'registration_open'
    and (
      v_registration_open_at is null
      or now() >= v_registration_open_at
    );

  v_public_registration_available :=
    v_registration_has_opened
    and (
      v_registration_close_at is null
      or now() <= v_registration_close_at
    );

  v_new_roster_locked :=
    public.is_tournament_bracket_roster_locked(new.tournament_bracket_id);

  if new.registration_status in (
    'pending',
    'manual_review',
    'waitlisted',
    'approved'
  )
    and v_new_roster_locked then
    if tg_op = 'INSERT'
      or old.registration_status is distinct from new.registration_status
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id then
      raise exception
        'Tournament bracket roster is locked after bracket generation';
    end if;
  end if;

  if new.registration_status = 'rejected' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_pre_lock_admin_roster_management :=
      v_is_service_role
      and v_new_roster_locked is false
      and v_status not in ('upcoming', 'in_progress', 'completed', 'closed')
      and v_registration_has_opened
      and v_public_registration_available is false
      and new.registration_status in (
        'pending',
        'manual_review',
        'waitlisted',
        'approved'
      );
  end if;

  if tg_op = 'UPDATE' then
    v_pre_lock_waitlist_promotion :=
      old.registration_status = 'waitlisted'
      and new.registration_status = 'approved'
      and old.tournament_id is not distinct from new.tournament_id
      and old.tournament_bracket_id is not distinct from
        new.tournament_bracket_id
      and v_new_roster_locked is false
      and v_registration_has_opened;

    v_pre_lock_admin_roster_management :=
      v_is_service_role
      and v_new_roster_locked is false
      and v_old_roster_locked is false
      and v_registration_has_opened
      and v_public_registration_available is false
      and (
        old.tournament_id is distinct from new.tournament_id
        or old.tournament_bracket_id is distinct from
          new.tournament_bracket_id
        or old.registration_status is distinct from
          new.registration_status
      )
      and (
        old.registration_status in (
          'pending',
          'manual_review',
          'waitlisted',
          'approved'
        )
        or new.registration_status in (
          'pending',
          'manual_review',
          'waitlisted',
          'approved'
        )
      );
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
    and v_pre_lock_waitlist_promotion is false
    and v_pre_lock_admin_roster_management is false
    and v_public_registration_available is false then
    raise exception 'Tournament registration is not available';
  end if;

  select
    count(*) filter (where registration_status = 'approved'),
    count(*) filter (where registration_status = 'waitlisted'),
    count(*) filter (
      where registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    )
  into
    v_approved_players,
    v_waitlisted_players,
    v_active_cohort_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and id <> new.id;

  if tg_op = 'INSERT' then
    v_enters_active_cohort :=
      new.registration_status in (
        'pending',
        'manual_review',
        'approved'
      );
  else
    v_enters_active_cohort :=
      new.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
      and (
        old.registration_status not in (
          'pending',
          'manual_review',
          'approved'
        )
        or old.tournament_id is distinct from new.tournament_id
        or old.tournament_bracket_id is distinct from
          new.tournament_bracket_id
      );
  end if;

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

  if tg_op = 'INSERT'
    and v_is_service_role
    and new.registration_status = 'approved'
    and v_waitlisted_players > 0 then
    raise exception
      'Cannot approve a manual registration insert while waitlisted registrations exist for the same bracket; promote the oldest waitlisted registration instead';
  end if;

  if v_enters_active_cohort
    and new.registration_status in ('manual_review', 'approved')
    and v_older_waitlisted_exists then
    raise exception
      'Cannot promote this registration before older waitlisted registrations for the same bracket';
  end if;

  if v_enters_active_cohort
    and new.registration_status in ('manual_review', 'approved')
    and v_active_cohort_players >= v_active_cohort_limit then
    raise exception
      'Tournament bracket is full: active registration cohort capacity is %, with % active registrations',
      v_active_cohort_limit,
      v_active_cohort_players;
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
        new.registration_status = 'pending'
        and v_active_cohort_players >= v_active_cohort_limit
      )
      or (
        tg_op = 'INSERT'
        and v_waitlisted_players > 0
      )
      or (
        tg_op = 'UPDATE'
        and new.registration_status = 'pending'
        and v_older_waitlisted_exists
      ) then
      new.registration_status := 'waitlisted';
    elsif tg_op = 'INSERT' then
      new.registration_status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

alter function public.enforce_tournament_registration_availability()
  owner to postgres;

revoke execute
  on function public.enforce_tournament_registration_availability()
  from public, anon, authenticated;
grant execute
  on function public.enforce_tournament_registration_availability()
  to service_role;

comment on function public.enforce_tournament_registration_availability()
  is 'Serializes per-bracket registration intake into an eight-player active review cohort followed by a deterministic FIFO waitlist.';

commit;
