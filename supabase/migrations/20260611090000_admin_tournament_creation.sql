begin;

create extension if not exists pgcrypto;

-- The live project already has this table with start_date/end_date.
-- Keep those verified column names and create the same shape on new projects.
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  format text not null,
  status text default 'upcoming',
  battlefy_url text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz default now()
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
-- Add every newer tournament-management field before any index, constraint,
-- trigger, policy, or function references it.
alter table public.tournaments
  add column if not exists description text,
  add column if not exists banner_image_url text,
  add column if not exists registration_open_at timestamptz,
  add column if not exists registration_close_at timestamptz,
  add column if not exists prize_pool text,
  add column if not exists rules_url text,
  add column if not exists updated_at timestamptz default now();

-- Preserve existing rows while supplying display-safe values for fields that
-- did not exist in the legacy schema. Dates remain nullable because the live
-- legacy row has no start_date/end_date and no accurate dates can be inferred.
update public.tournaments
set
  description = coalesce(description, title),
  banner_image_url = coalesce(
    banner_image_url,
    '/images/tournaments/1v1-operation-skyfall.jpeg'
  ),
  prize_pool = coalesce(prize_pool, 'To be announced'),
  status = coalesce(status, 'upcoming'),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.tournaments
  alter column status set default 'upcoming',
  alter column description set not null,
  alter column banner_image_url set not null,
  alter column prize_pool set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists tournaments_slug_unique_idx
  on public.tournaments(slug);

create index if not exists tournaments_status_start_date_idx
  on public.tournaments(status, start_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_slug_format'
  ) then
    alter table public.tournaments
      add constraint tournaments_slug_format
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_status_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_status_check
      check (
        status in (
          'upcoming',
          'registration_open',
          'in_progress',
          'completed'
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_format_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_format_check
      check (format in ('1v1', '2v2', '4v4')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_registration_dates'
  ) then
    alter table public.tournaments
      add constraint tournaments_registration_dates
      check (
        registration_open_at is null
        or registration_close_at is null
        or registration_open_at < registration_close_at
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_start_after_registration'
  ) then
    alter table public.tournaments
      add constraint tournaments_start_after_registration
      check (
        registration_close_at is null
        or start_date is null
        or registration_close_at <= start_date
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_end_after_start'
  ) then
    alter table public.tournaments
      add constraint tournaments_end_after_start
      check (
        end_date is null
        or start_date is null
        or end_date >= start_date
      ) not valid;
  end if;
end;
$$;

create table if not exists public.tournament_brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null
    references public.tournaments(id) on delete cascade,
  name text not null check (name in ('Main', 'Challenge')),
  elo_rules text not null,
  max_players integer not null check (max_players between 1 and 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create index if not exists tournament_brackets_tournament_id_idx
  on public.tournament_brackets(tournament_id);

alter table public.registrations
  add column if not exists tournament_id uuid
    references public.tournaments(id) on delete set null,
  add column if not exists tournament_bracket_id uuid
    references public.tournament_brackets(id) on delete set null;

create unique index if not exists registrations_user_tournament_unique
  on public.registrations(clerk_user_id, tournament_id)
  where tournament_id is not null
    and clerk_user_id not like 'deleted:%';

create or replace function public.ironclad_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists tournament_brackets_set_updated_at
  on public.tournament_brackets;
create trigger tournament_brackets_set_updated_at
before update on public.tournament_brackets
for each row execute function public.ironclad_set_updated_at();

alter table public.tournaments enable row level security;
alter table public.tournament_brackets enable row level security;

drop policy if exists "Public can read tournaments" on public.tournaments;
create policy "Public can read tournaments"
on public.tournaments
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read tournament brackets"
  on public.tournament_brackets;
create policy "Public can read tournament brackets"
on public.tournament_brackets
for select
to anon, authenticated
using (true);

grant select on public.tournaments to anon, authenticated;
grant select on public.tournament_brackets to anon, authenticated;

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
      battlefy_url
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
      nullif(p_battlefy_url, '')
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
      battlefy_url = nullif(p_battlefy_url, '')
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
  jsonb
) to service_role;

commit;
