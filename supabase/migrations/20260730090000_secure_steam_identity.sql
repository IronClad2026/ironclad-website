begin;

alter table public.players
  add column if not exists steam_id64 text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_steam_id64_format_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_steam_id64_format_check
      check (
        steam_id64 is null
        or case
          when steam_id64 ~ '^(0|[1-9][0-9]{0,19})$' then
            steam_id64::numeric <= 18446744073709551615::numeric
          else false
        end
      );
  end if;
end;
$$;

create unique index if not exists players_steam_id64_unique_idx
  on public.players(steam_id64)
  where steam_id64 is not null;

create or replace function public.protect_player_steam_id64()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.steam_id64 = null;
    return new;
  end if;

  new.steam_id64 = old.steam_id64;
  return new;
end;
$$;

drop trigger if exists players_protect_steam_id64
  on public.players;
create trigger players_protect_steam_id64
before insert or update
on public.players
for each row execute function public.protect_player_steam_id64();

revoke execute on function public.protect_player_steam_id64()
  from public, anon, authenticated;
grant execute on function public.protect_player_steam_id64()
  to service_role;

-- RLS scopes rows, not columns. Preserve authenticated reads of every
-- pre-existing player field while keeping the verified Steam identity out of
-- direct browser Supabase responses.
revoke select on table public.players
  from public, anon, authenticated;
grant select (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  discord_username,
  steam_username,
  coh3_player_card_url,
  country,
  region,
  timezone,
  current_elo,
  avatar_url,
  bio,
  profile_completed,
  created_at,
  updated_at,
  public_profile_enabled,
  discord_public_enabled,
  coh3_profile_id
) on table public.players
  to authenticated;
grant select on table public.players
  to service_role;

drop policy if exists "Players can delete their player profile"
  on public.players;
revoke delete on table public.players
  from public, anon, authenticated;

grant update (steam_id64) on table public.players
  to service_role;
grant delete on table public.players
  to service_role;

comment on column public.players.steam_id64 is
  'Server-authoritative SteamID64 stored only after successful Steam OpenID verification.';

commit;
