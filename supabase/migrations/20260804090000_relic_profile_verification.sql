begin;

alter table public.players
  add column if not exists relic_verified_elo bigint,
  add column if not exists relic_verified_faction text,
  add column if not exists relic_verified_division text,
  add column if not exists relic_elo_calculation_version text,
  add column if not exists relic_elo_verified_at timestamptz,
  add column if not exists relic_elo_last_attempt_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_relic_verified_elo_range_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_relic_verified_elo_range_check
      check (
        relic_verified_elo is null
        or relic_verified_elo between 0 and 9007199254740991
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_relic_verified_faction_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_relic_verified_faction_check
      check (
        relic_verified_faction is null
        or relic_verified_faction in (
          'US Forces',
          'British Forces',
          'Deutsches Afrikakorps',
          'Wehrmacht'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_relic_verified_division_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_relic_verified_division_check
      check (
        relic_verified_division is null
        or relic_verified_division in ('Academy', 'Challenge', 'Main / Pro')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_relic_calculation_version_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_relic_calculation_version_check
      check (
        relic_elo_calculation_version is null
        or char_length(btrim(relic_elo_calculation_version)) > 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_relic_verified_snapshot_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_relic_verified_snapshot_check
      check (
        num_nonnulls(
          relic_verified_elo,
          relic_verified_faction,
          relic_verified_division,
          relic_elo_calculation_version,
          relic_elo_verified_at
        ) in (0, 5)
      );
  end if;
end;
$$;

create or replace function public.protect_player_relic_verification()
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
    new.relic_verified_elo = null;
    new.relic_verified_faction = null;
    new.relic_verified_division = null;
    new.relic_elo_calculation_version = null;
    new.relic_elo_verified_at = null;
    new.relic_elo_last_attempt_at = null;
    return new;
  end if;

  new.relic_verified_elo = old.relic_verified_elo;
  new.relic_verified_faction = old.relic_verified_faction;
  new.relic_verified_division = old.relic_verified_division;
  new.relic_elo_calculation_version = old.relic_elo_calculation_version;
  new.relic_elo_verified_at = old.relic_elo_verified_at;
  new.relic_elo_last_attempt_at = old.relic_elo_last_attempt_at;
  return new;
end;
$$;

drop trigger if exists players_protect_relic_verification
  on public.players;
create trigger players_protect_relic_verification
before insert or update
on public.players
for each row execute function public.protect_player_relic_verification();

revoke execute on function public.protect_player_relic_verification()
  from public, anon, authenticated;
grant execute on function public.protect_player_relic_verification()
  to service_role;

create or replace function public.claim_relic_elo_verification_attempt(
  p_player_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text
)
returns table (
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claimed_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  return query
  update public.players as player
  set relic_elo_last_attempt_at = v_claimed_at
  where player.id = p_player_id
    and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null
    and player.steam_id64 = p_steam_id64
    and (
      player.relic_elo_last_attempt_at is null
      or player.relic_elo_last_attempt_at
        <= v_claimed_at - interval '15 minutes'
    )
  returning player.relic_elo_last_attempt_at;
end;
$$;

alter function public.claim_relic_elo_verification_attempt(uuid, text, text)
  owner to postgres;
revoke all on function public.claim_relic_elo_verification_attempt(
  uuid,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.claim_relic_elo_verification_attempt(
  uuid,
  text,
  text
) to service_role;

-- RLS scopes rows, not columns. Keep the Relic verification snapshot and
-- cooldown state out of direct browser Supabase responses.
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

grant update (
  relic_verified_elo,
  relic_verified_faction,
  relic_verified_division,
  relic_elo_calculation_version,
  relic_elo_verified_at,
  relic_elo_last_attempt_at
) on table public.players
  to service_role;

comment on column public.players.relic_verified_elo is
  'Last successfully verified Relic 1v1 ELO. Kept separate from legacy current_elo.';
comment on column public.players.relic_verified_faction is
  'Faction selected by the successful Relic 1v1 ELO calculation.';
comment on column public.players.relic_verified_division is
  'IronClad division calculated for the successful Relic ELO snapshot.';
comment on column public.players.relic_elo_calculation_version is
  'Version of the Relic ELO normalization used for the successful snapshot.';
comment on column public.players.relic_elo_verified_at is
  'Timestamp when the Relic ELO snapshot was last saved successfully.';
comment on column public.players.relic_elo_last_attempt_at is
  'Server-only timestamp used to enforce the Relic refresh cooldown.';

comment on function public.claim_relic_elo_verification_attempt(
  uuid,
  text,
  text
) is
  'Service-role-only atomic 15-minute cooldown claim for a verified player Steam identity.';

commit;
