begin;

alter table public.players
  add column if not exists public_profile_enabled boolean not null default false;

alter table public.players
  add column if not exists discord_public_enabled boolean not null default false;

comment on column public.players.public_profile_enabled is
  'Controls whether this player appears in the public IronClad player directory.';

comment on column public.players.discord_public_enabled is
  'Opt-in flag for exposing discord_username on public player profiles.';

drop view if exists public.public_player_profiles;

create view public.public_player_profiles
with (security_barrier = true)
as
select
  player.id,
  player.display_name,
  player.in_game_name as player_name,
  player.country,
  player.region,
  player.current_elo,
  player.public_profile_enabled,
  player.discord_public_enabled,
  case
    when player.discord_public_enabled then player.discord_username
    else null
  end as discord_username,
  -- TODO: expose avatars only after storage paths are migrated to
  -- player-id based paths or proxied without leaking Clerk user IDs.
  null::text as avatar_url,
  player.created_at
from public.players as player
where player.public_profile_enabled = true;

comment on view public.public_player_profiles is
  'Public-safe player profile projection. Does not expose Clerk IDs, private profile fields, registration notes, or raw avatar URLs.';

comment on column public.public_player_profiles.avatar_url is
  'Intentionally null until player avatar storage no longer exposes Clerk user IDs in object paths.';

revoke all on public.public_player_profiles from public;
grant select on public.public_player_profiles to anon, authenticated;

commit;
