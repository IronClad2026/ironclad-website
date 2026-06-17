begin;

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
  player.avatar_url is not null as has_avatar,
  -- Raw avatar URLs remain hidden because existing storage object paths
  -- include Clerk user IDs. Public pages use /players/[id]/avatar instead.
  null::text as avatar_url,
  player.created_at
from public.players as player
where player.public_profile_enabled = true;

comment on view public.public_player_profiles is
  'Public-safe player profile projection. Does not expose Clerk IDs, private profile fields, registration notes, or raw avatar URLs.';

comment on column public.public_player_profiles.has_avatar is
  'True when a public player profile has an avatar available through the player-id based avatar proxy.';

comment on column public.public_player_profiles.avatar_url is
  'Intentionally null because raw player avatar storage paths include Clerk user IDs.';

revoke all on public.public_player_profiles from public;
grant select on public.public_player_profiles to anon, authenticated;

commit;
