begin;

alter table public.tournaments
  add column if not exists grand_final_at timestamptz,
  add column if not exists rule_format text not null default 'format_a',
  add column if not exists result_confirmation_window_minutes integer
    not null default 30;

update public.tournaments
set
  grand_final_at = coalesce(grand_final_at, end_date),
  rule_format = coalesce(nullif(rule_format, ''), 'format_a'),
  result_confirmation_window_minutes =
    coalesce(result_confirmation_window_minutes, 30);

alter table public.tournaments
  alter column rule_format set default 'format_a',
  alter column rule_format set not null,
  alter column result_confirmation_window_minutes set default 30,
  alter column result_confirmation_window_minutes set not null;

alter table public.tournaments
  drop constraint if exists tournaments_open_registration_dates,
  drop constraint if exists tournaments_rule_format_check,
  drop constraint if exists tournaments_result_confirmation_window_check;

alter table public.tournaments
  add constraint tournaments_rule_format_check
  check (rule_format in ('format_a', 'format_b')),
  add constraint tournaments_result_confirmation_window_check
  check (
    result_confirmation_window_minutes in (
      1,
      5,
      15,
      30,
      60,
      120,
      360,
      720,
      1440
    )
  );

alter table public.registrations
  drop constraint if exists registrations_registration_status_check;

alter table public.registrations
  add constraint registrations_registration_status_check
  check (
    registration_status in (
      'pending',
      'manual_review',
      'approved',
      'rejected',
      'waitlisted'
    )
  );

drop function if exists public.save_tournament(
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
);

create function public.save_tournament(
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
      registration_close_at = coalesce(
        p_registration_close_at,
        registration_close_at
      ),
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
  timestamptz,
  text,
  integer,
  jsonb
) to service_role;

create or replace function public.get_tournament_bracket_capacity()
returns table (
  bracket_id uuid,
  tournament_id uuid,
  registered_players bigint,
  max_players integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bracket.id as bracket_id,
    bracket.tournament_id,
    count(registration.id) filter (
      where registration.registration_status = 'approved'
    ) as registered_players,
    bracket.max_players
  from public.tournament_brackets as bracket
  left join public.registrations as registration
    on registration.tournament_bracket_id = bracket.id
  group by bracket.id, bracket.tournament_id, bracket.max_players;
$$;

revoke all on function public.get_tournament_bracket_capacity() from public;
grant execute on function public.get_tournament_bracket_capacity()
  to anon, authenticated, service_role;

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
  v_requires_open_check boolean;
begin
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

  select count(*)
  into v_approved_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and registration_status = 'approved'
    and (tg_op = 'INSERT' or id <> new.id);

  if new.registration_status = 'approved'
    and v_approved_players >= v_max_players then
    raise exception
      'Tournament bracket is full: capacity is %, with % approved registrations',
      v_max_players,
      v_approved_players;
  end if;

  if new.registration_status in ('pending', 'waitlisted') then
    if v_approved_players >= v_max_players then
      new.registration_status = 'waitlisted';
    elsif tg_op = 'INSERT' then
      new.registration_status = 'pending';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_enforce_tournament_availability
  on public.registrations;
create trigger registrations_enforce_tournament_availability
before insert or update of
  tournament_id,
  tournament_bracket_id,
  registration_status
on public.registrations
for each row
execute function public.enforce_tournament_registration_availability();

create or replace function public.preserve_tournament_bracket_roster_invariants()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_approved_count integer;
  v_ineligible_player text;
  v_ineligible_elo integer;
begin
  if new.elo_rules is distinct from old.elo_rules then
    select
      coalesce(nullif(btrim(registration.player_name), ''), registration.id::text),
      coalesce(player.current_elo, registration.submitted_elo)::integer
    into v_ineligible_player, v_ineligible_elo
    from public.registrations as registration
    left join public.players as player
      on player.clerk_user_id = registration.clerk_user_id
    where registration.tournament_bracket_id = old.id
      and registration.registration_status <> 'rejected'
      and public.is_elo_eligible(
        coalesce(player.current_elo, registration.submitted_elo)::integer,
        new.elo_rules
      ) is distinct from true
    order by
      case
        when registration.registration_status = 'approved' then 0
        else 1
      end,
      registration.created_at,
      registration.id
    limit 1;

    if v_ineligible_player is not null then
      raise exception
        'Cannot change ELO rules for the % Bracket to "%": existing non-rejected player % (ELO %) would become ineligible. Reject or move affected registrations through an explicit roster workflow before changing the rule.',
        old.name,
        new.elo_rules,
        v_ineligible_player,
        coalesce(v_ineligible_elo::text, 'unavailable');
    end if;
  end if;

  if new.max_players is distinct from old.max_players then
    select count(*)::integer
    into v_approved_count
    from public.registrations as registration
    where registration.tournament_bracket_id = old.id
      and registration.registration_status = 'approved';

    if new.max_players < v_approved_count then
      raise exception
        'Cannot reduce the % Bracket capacity to % because it currently has % approved registrations. Capacity must be at least the approved roster count.',
        old.name,
        new.max_players,
        v_approved_count;
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists "Players can submit registrations"
  on public.registrations;
create policy "Players can submit registrations"
on public.registrations
for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and registration_status in ('pending', 'waitlisted')
  and exists (
    select 1
    from public.players as player
    where player.id = registrations.profile_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
      and player.profile_completed
      and player.in_game_name = registrations.player_name
      and player.discord_username
        is not distinct from registrations.discord_username
      and player.steam_username
        is not distinct from registrations.steam_name
      and player.coh3_player_card_url
        is not distinct from registrations.coh3_player_card_url
      and player.country is not distinct from registrations.country
      and player.region is not distinct from registrations.region
      and player.timezone is not distinct from registrations.timezone
      and player.current_elo
        is not distinct from registrations.submitted_elo
  )
);

commit;
