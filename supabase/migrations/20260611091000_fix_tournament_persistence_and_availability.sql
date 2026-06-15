begin;

alter table public.tournaments
  add column if not exists registration_enabled boolean
    not null default true;

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
begin
  if p_registration_open_at is null
    or p_registration_close_at is null
    or p_start_date is null then
    raise exception 'Registration and tournament start dates are required';
  end if;

  if p_registration_open_at >= p_registration_close_at then
    raise exception 'Registration open date must be before close date';
  end if;

  if p_registration_close_at > p_start_date then
    raise exception 'Registration must close before the tournament starts';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'Tournament end date must be after the start date';
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

  if p_brackets is null
    or jsonb_typeof(p_brackets) <> 'array'
    or jsonb_array_length(p_brackets) = 0 then
    raise exception 'At least one bracket is required';
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
      where registration.registration_status <> 'rejected'
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
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_start_date timestamptz;
  v_max_players integer;
  v_registered_players bigint;
begin
  if new.tournament_id is null or new.tournament_bracket_id is null then
    return new;
  end if;

  select
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    tournament.start_date,
    bracket.max_players
  into
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_start_date,
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

  if not v_registration_enabled
    or v_registration_open_at is null
    or v_registration_close_at is null
    or v_start_date is null
    or now() < v_registration_open_at
    or now() > v_registration_close_at
    or now() >= v_start_date then
    raise exception 'Tournament registration is not available';
  end if;

  select count(*)
  into v_registered_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and registration_status <> 'rejected'
    and (tg_op = 'INSERT' or id <> new.id);

  if v_registered_players >= v_max_players then
    raise exception 'Tournament bracket is full';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_enforce_tournament_availability
  on public.registrations;
create trigger registrations_enforce_tournament_availability
before insert or update of tournament_id, tournament_bracket_id
on public.registrations
for each row
execute function public.enforce_tournament_registration_availability();

commit;
