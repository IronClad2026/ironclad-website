begin;

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  uuid,
  text
);

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  integer,
  text,
  text,
  uuid,
  uuid,
  text
);

-- PostgreSQL will not change the type of a column referenced by an active
-- row-level security policy. Remove the obsolete direct-insert policy before
-- widening the snapshot columns it validates.
drop policy if exists "Players can submit registrations"
  on public.registrations;

alter table public.registrations
  drop constraint if exists registrations_submitted_elo_check,
  drop constraint if exists registrations_elo_verified_elo_check,
  drop constraint if exists registrations_elo_highest_faction_check,
  drop constraint if exists registrations_elo_verification_source_check,
  drop constraint if exists registrations_elo_verified_division_check,
  drop constraint if exists registrations_elo_calculation_version_check,
  drop constraint if exists registrations_relic_snapshot_complete_check;

alter table public.registrations
  alter column submitted_elo type bigint
    using submitted_elo::bigint,
  alter column elo_verified_elo type bigint
    using elo_verified_elo::bigint,
  add column if not exists elo_verified_division text,
  add column if not exists elo_calculation_version text;

alter table public.registrations
  add constraint registrations_submitted_elo_check
    check (
      submitted_elo is null
      or submitted_elo between 0 and 9007199254740991
    ),
  add constraint registrations_elo_verified_elo_check
    check (
      elo_verified_elo is null
      or elo_verified_elo between 0 and 9007199254740991
    ),
  add constraint registrations_elo_highest_faction_check
    check (
      elo_highest_faction is null
      or elo_highest_faction in (
        'us',
        'british',
        'wehrmacht',
        'dak',
        'US Forces',
        'British Forces',
        'Deutsches Afrikakorps',
        'Wehrmacht'
      )
    ),
  add constraint registrations_elo_verification_source_check
    check (
      elo_verification_source is null
      or elo_verification_source in ('coh3stats', 'relic')
    ),
  add constraint registrations_elo_verified_division_check
    check (
      elo_verified_division is null
      or elo_verified_division in ('Academy', 'Challenge', 'Main / Pro')
    ),
  add constraint registrations_elo_calculation_version_check
    check (
      elo_calculation_version is null
      or char_length(btrim(elo_calculation_version)) > 0
    ),
  add constraint registrations_relic_snapshot_complete_check
    check (
      elo_verification_source is distinct from 'relic'
      or (
        elo_status = 'verified'
        and submitted_elo is not null
        and submitted_elo = elo_verified_elo
        and elo_verified_elo is not null
        and elo_highest_faction in (
          'US Forces',
          'British Forces',
          'Deutsches Afrikakorps',
          'Wehrmacht'
        )
        and elo_checked_mode = '1v1'
        and elo_checked_at is not null
        and elo_verified_division = case
          when elo_verified_elo < 1100 then 'Academy'
          when elo_verified_elo < 1400 then 'Challenge'
          else 'Main / Pro'
        end
        and elo_calculation_version is not null
        and elo_difference is null
        and elo_verification_error is null
        and elo_verification_payload is null
        and elo_verified_player_name is null
        and elo_identity_status is null
        and elo_identity_error is null
      )
    );

create or replace function public.enforce_registration_elo_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_elo integer;
  v_bracket_name text;
  v_elo_rules text;
  v_is_eligible boolean;
  v_expected_division text;
begin
  if new.registration_status = 'rejected' then
    return new;
  end if;

  if new.tournament_bracket_id is null or new.clerk_user_id is null then
    return new;
  end if;

  if new.elo_verification_source = 'relic' then
    select bracket.name
    into v_bracket_name
    from public.tournament_brackets as bracket
    where bracket.id = new.tournament_bracket_id;

    if not found then
      raise exception 'Selected tournament bracket does not exist';
    end if;

    v_expected_division := case v_bracket_name
      when 'Academy' then 'Academy'
      when 'Challenge' then 'Challenge'
      when 'Main' then 'Main / Pro'
      else null
    end;

    if v_expected_division is null
      or new.elo_verified_division is distinct from v_expected_division then
      raise exception
        'Verified ELO does not match the selected tournament division';
    end if;

    if new.submitted_elo is distinct from new.elo_verified_elo then
      raise exception 'Registration verification data is invalid';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.registration_status is distinct from new.registration_status
    and new.registration_status <> 'approved' then
    return new;
  end if;

  select player.current_elo, bracket.name, bracket.elo_rules
  into v_current_elo, v_bracket_name, v_elo_rules
  from public.players as player
  cross join public.tournament_brackets as bracket
  where player.clerk_user_id = new.clerk_user_id
    and bracket.id = new.tournament_bracket_id;

  if not found or v_current_elo is null then
    raise exception 'A completed player profile with current ELO is required';
  end if;

  v_is_eligible := public.is_elo_eligible(v_current_elo, v_elo_rules);

  if v_is_eligible is null then
    raise exception
      'The % Bracket has an invalid ELO rule configuration: %',
      v_bracket_name,
      v_elo_rules;
  end if;

  if not v_is_eligible then
    raise exception
      'Saved ELO % does not satisfy the % Bracket requirement: %',
      v_current_elo,
      v_bracket_name,
      v_elo_rules;
  end if;

  new.submitted_elo := v_current_elo;
  return new;
end;
$$;

create or replace function public.preserve_tournament_bracket_roster_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_approved_count integer;
  v_ineligible_player text;
  v_ineligible_elo bigint;
begin
  if new.elo_rules is distinct from old.elo_rules then
    select
      coalesce(
        nullif(btrim(registration.player_name), ''),
        registration.id::text
      ),
      case
        when registration.elo_verification_source = 'relic' then
          registration.elo_verified_elo
        else coalesce(
          player.current_elo::bigint,
          registration.submitted_elo
        )
      end
    into v_ineligible_player, v_ineligible_elo
    from public.registrations as registration
    left join public.players as player
      on player.clerk_user_id = registration.clerk_user_id
    where registration.tournament_bracket_id = old.id
      and registration.registration_status <> 'rejected'
      and case
        when registration.elo_verification_source = 'relic' then
          registration.elo_verified_division = case old.name
            when 'Academy' then 'Academy'
            when 'Challenge' then 'Challenge'
            when 'Main' then 'Main / Pro'
            else null
          end
        else public.is_elo_eligible(
          coalesce(
            player.current_elo,
            registration.submitted_elo::integer
          ),
          new.elo_rules
        )
      end is distinct from true
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

revoke execute on function public.preserve_tournament_bracket_roster_invariants()
  from public, anon, authenticated;
grant execute on function public.preserve_tournament_bracket_roster_invariants()
  to service_role;

create or replace function public.protect_relic_registration_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.elo_verification_source is distinct from 'relic'
    and new.elo_verification_source is distinct from 'relic' then
    return new;
  end if;

  if row(
    old.tournament_id,
    old.tournament_bracket_id,
    old.submitted_elo,
    old.elo_status,
    old.elo_verified_elo,
    old.elo_difference,
    old.elo_highest_faction,
    old.elo_checked_mode,
    old.elo_checked_at,
    old.elo_verification_source,
    old.elo_verification_error,
    old.elo_verification_payload,
    old.elo_verified_player_name,
    old.elo_identity_status,
    old.elo_identity_error,
    old.elo_verified_division,
    old.elo_calculation_version
  ) is distinct from row(
    new.tournament_id,
    new.tournament_bracket_id,
    new.submitted_elo,
    new.elo_status,
    new.elo_verified_elo,
    new.elo_difference,
    new.elo_highest_faction,
    new.elo_checked_mode,
    new.elo_checked_at,
    new.elo_verification_source,
    new.elo_verification_error,
    new.elo_verification_payload,
    new.elo_verified_player_name,
    new.elo_identity_status,
    new.elo_identity_error,
    new.elo_verified_division,
    new.elo_calculation_version
  ) then
    raise exception 'Relic registration snapshot is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_protect_relic_snapshot
  on public.registrations;
create trigger registrations_protect_relic_snapshot
before update
on public.registrations
for each row execute function public.protect_relic_registration_snapshot();

revoke execute on function public.protect_relic_registration_snapshot()
  from public, anon, authenticated;
grant execute on function public.protect_relic_registration_snapshot()
  to service_role;

revoke insert on table public.registrations
  from public, anon, authenticated, service_role;

create or replace function public.submit_verified_player_registration(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_relic_elo bigint,
  p_relic_faction text,
  p_relic_division text,
  p_relic_calculation_version text
)
returns table (
  id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  submitted_elo bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player public.players%rowtype;
  v_tournament_title text;
  v_tournament_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_bracket_name text;
  v_expected_division text;
  v_calculation_version text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  v_calculation_version := nullif(btrim(p_relic_calculation_version), '');

  if p_relic_elo is null
    or p_relic_elo < 0
    or p_relic_elo > 9007199254740991
    or p_relic_faction is null
    or p_relic_faction not in (
      'US Forces',
      'British Forces',
      'Deutsches Afrikakorps',
      'Wehrmacht'
    )
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro')
    or p_relic_division is distinct from case
      when p_relic_elo < 1100 then 'Academy'
      when p_relic_elo < 1400 then 'Challenge'
      else 'Main / Pro'
    end
    or v_calculation_version is null then
    raise exception 'Registration verification data is invalid';
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.id = p_profile_id
    and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null
    and player.steam_id64 = p_steam_id64
    and player.profile_completed
  for update;

  if not found then
    raise exception 'Registration identity is unavailable';
  end if;

  if exists (
    select 1
    from public.registrations as registration
    where registration.clerk_user_id = v_player.clerk_user_id
      and registration.tournament_id = p_tournament_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Already registered for this tournament';
  end if;

  select
    tournament.title,
    tournament.status,
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.name
  into
    v_tournament_title,
    v_tournament_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_bracket_name
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and tournament.id = p_tournament_id
  for update of tournament, bracket;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  v_verified_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status is distinct from 'registration_open'
    or (
      v_registration_open_at is not null
      and v_verified_at < v_registration_open_at
    )
    or (
      v_registration_close_at is not null
      and v_verified_at > v_registration_close_at
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  v_expected_division := case v_bracket_name
    when 'Academy' then 'Academy'
    when 'Challenge' then 'Challenge'
    when 'Main' then 'Main / Pro'
    else null
  end;

  if v_expected_division is null
    or p_relic_division is distinct from v_expected_division then
    raise exception
      'Verified ELO does not match the selected tournament division';
  end if;

  insert into public.registrations as inserted (
    profile_id,
    clerk_user_id,
    player_name,
    discord_username,
    steam_name,
    coh3_player_card_url,
    country,
    region,
    timezone,
    submitted_elo,
    tournament_title,
    bracket_name,
    registration_status,
    elo_status,
    admin_notes,
    tournament_id,
    tournament_bracket_id,
    elo_verified_elo,
    elo_difference,
    elo_highest_faction,
    elo_checked_mode,
    elo_checked_at,
    elo_verification_source,
    elo_verification_error,
    elo_verification_payload,
    elo_verified_player_name,
    elo_identity_status,
    elo_identity_error,
    elo_verified_division,
    elo_calculation_version
  )
  values (
    v_player.id,
    v_player.clerk_user_id,
    v_player.in_game_name,
    v_player.discord_username,
    v_player.steam_username,
    null,
    v_player.country,
    v_player.region,
    v_player.timezone,
    p_relic_elo,
    v_tournament_title,
    v_bracket_name || ' Bracket',
    'pending',
    'verified',
    '',
    p_tournament_id,
    p_tournament_bracket_id,
    p_relic_elo,
    null,
    p_relic_faction,
    '1v1',
    v_verified_at,
    'relic',
    null,
    null,
    null,
    null,
    null,
    p_relic_division,
    v_calculation_version
  )
  returning
    inserted.id,
    inserted.tournament_id,
    inserted.tournament_bracket_id,
    inserted.registration_status,
    inserted.submitted_elo
  into
    id,
    tournament_id,
    tournament_bracket_id,
    registration_status,
    submitted_elo;

  update public.players as player
  set
    relic_verified_elo = p_relic_elo,
    relic_verified_faction = p_relic_faction,
    relic_verified_division = p_relic_division,
    relic_elo_calculation_version = v_calculation_version,
    relic_elo_verified_at = v_verified_at
  where player.id = v_player.id
    and player.clerk_user_id = v_player.clerk_user_id
    and player.steam_id64 = p_steam_id64;

  if not found then
    raise exception 'Registration identity is unavailable';
  end if;

  return next;
end;
$$;

alter function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) owner to postgres;

revoke all on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) to service_role;

comment on column public.registrations.submitted_elo is
  'Immutable compatibility projection of the registration-time ELO for Relic-verified registrations.';
comment on column public.registrations.elo_verified_elo is
  'Authoritative registration-time ELO. Relic registrations store the highest valid current 1v1 faction ELO.';
comment on column public.registrations.elo_highest_faction is
  'Faction that produced elo_verified_elo. Relic rows use the canonical Relic faction name.';
comment on column public.registrations.elo_checked_at is
  'Database timestamp when the registration-time ELO snapshot was saved.';
comment on column public.registrations.elo_verification_source is
  'Registration-time ELO source: coh3stats for historical rows or relic for Phase 3C registrations.';
comment on column public.registrations.elo_verified_division is
  'Immutable IronClad division calculated from the registration-time verified ELO.';
comment on column public.registrations.elo_calculation_version is
  'Immutable version of the ELO calculation used for the registration snapshot.';

comment on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
) is
  'Service-role-only atomic Relic registration and immutable tournament ELO snapshot creation.';

commit;
