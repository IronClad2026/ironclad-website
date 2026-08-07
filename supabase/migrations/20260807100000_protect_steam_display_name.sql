begin;

create or replace function public.protect_player_steam_id64()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.steam_id64 = null;
      new.steam_username = null;
    else
      new.steam_id64 = old.steam_id64;
      new.steam_username = old.steam_username;
    end if;
  end if;

  -- Profile fields and the verified Steam identity have different trusted
  -- writers, so derive readiness from the locked NEW row on every write.
  new.profile_completed = (
    nullif(btrim(new.avatar_url), '') is not null
    and (
      nullif(btrim(new.display_name), '') is not null
      or nullif(btrim(new.in_game_name), '') is not null
    )
    and nullif(btrim(new.discord_username), '') is not null
    and nullif(btrim(new.steam_id64), '') is not null
    and nullif(btrim(new.country), '') is not null
    and nullif(btrim(new.region), '') is not null
    and nullif(btrim(new.timezone), '') is not null
  );

  return new;
end;
$$;

revoke execute on function public.protect_player_steam_id64()
  from public, anon, authenticated;
grant execute on function public.protect_player_steam_id64()
  to service_role;

grant update (steam_username) on table public.players
  to service_role;

comment on column public.players.steam_username is
  'Public Steam display name synchronized by trusted server-side Steam flows.';

-- Preserve existing display names while aligning stored completion with the
-- verified Steam identity used by current registration and Relic flows.
with completion as (
  select
    player.id,
    (
      nullif(btrim(player.avatar_url), '') is not null
      and (
        nullif(btrim(player.display_name), '') is not null
        or nullif(btrim(player.in_game_name), '') is not null
      )
      and nullif(btrim(player.discord_username), '') is not null
      and nullif(btrim(player.steam_id64), '') is not null
      and nullif(btrim(player.country), '') is not null
      and nullif(btrim(player.region), '') is not null
      and nullif(btrim(player.timezone), '') is not null
    ) as profile_completed
  from public.players as player
)
update public.players as player
set profile_completed = completion.profile_completed
from completion
where player.id = completion.id
  and player.profile_completed is distinct from completion.profile_completed;

commit;
