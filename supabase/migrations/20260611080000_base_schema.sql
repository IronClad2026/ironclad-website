begin;

create extension if not exists pgcrypto;

create or replace function public.ironclad_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Legacy identity table retained because the original registrations schema
-- referenced it before registrations.profile_id was migrated to players.id.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  display_name text not null,
  in_game_name text not null,
  discord_username text,
  steam_username text,
  coh3_player_card_url text,
  country text,
  region text,
  timezone text,
  current_elo integer check (
    current_elo is null or current_elo between 0 and 5000
  ),
  avatar_url text,
  bio text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(display_name) <= 80),
  check (char_length(in_game_name) <= 80),
  check (
    discord_username is null
    or char_length(discord_username) <= 100
  ),
  check (
    steam_username is null
    or char_length(steam_username) <= 100
  ),
  check (bio is null or char_length(bio) <= 1000)
);

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

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid
    references public.profiles(id) on delete set null,
  clerk_user_id text not null,
  player_name text not null,
  discord_username text,
  steam_name text,
  coh3_player_card_url text,
  country text,
  region text,
  timezone text,
  submitted_elo integer check (
    submitted_elo is null or submitted_elo between 0 and 5000
  ),
  tournament_title text not null,
  bracket_name text not null,
  registration_status text not null default 'pending'
    check (
      registration_status in (
        'pending',
        'manual_review',
        'approved',
        'rejected'
      )
    ),
  elo_status text not null default 'pending',
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registrations_clerk_user_id_idx
  on public.registrations(clerk_user_id);
create index if not exists registrations_status_created_at_idx
  on public.registrations(registration_status, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists registrations_set_updated_at on public.registrations;
create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.ironclad_set_updated_at();

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "Players can read their legacy profile"
  on public.profiles;
create policy "Players can read their legacy profile"
on public.profiles
for select
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can manage their legacy profile"
  on public.profiles;
create policy "Players can manage their legacy profile"
on public.profiles
for all
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'))
with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can read their player profile"
  on public.players;
create policy "Players can read their player profile"
on public.players
for select
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can insert their player profile"
  on public.players;
create policy "Players can insert their player profile"
on public.players
for insert
to authenticated
with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can update their player profile"
  on public.players;
create policy "Players can update their player profile"
on public.players
for update
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'))
with check (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can delete their player profile"
  on public.players;
create policy "Players can delete their player profile"
on public.players
for delete
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can read their registrations"
  on public.registrations;
create policy "Players can read their registrations"
on public.registrations
for select
to authenticated
using (clerk_user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Players can submit registrations"
  on public.registrations;
create policy "Players can submit registrations"
on public.registrations
for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and registration_status = 'pending'
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

grant select, insert, update, delete
  on public.profiles, public.players, public.registrations
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'player-avatars',
  'player-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Players can upload their avatar"
  on storage.objects;
create policy "Players can upload their avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

drop policy if exists "Players can read their avatar object"
  on storage.objects;
create policy "Players can read their avatar object"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

drop policy if exists "Players can update their avatar"
  on storage.objects;
create policy "Players can update their avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

drop policy if exists "Players can delete their avatar"
  on storage.objects;
create policy "Players can delete their avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-avatars'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

commit;
