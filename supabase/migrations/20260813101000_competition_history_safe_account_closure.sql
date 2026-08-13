begin;

alter table public.players
  add column if not exists account_closed_at timestamptz;

comment on column public.players.account_closed_at is
  'Database-owned marker for a closed account whose stable player row is retained solely to preserve official competition history.';

-- Finalized Main standings remain immutable. Account closure may only detach
-- the historical Clerk actor from an otherwise byte-identical admin event.
create or replace function public.guard_finalized_main_admin_adjustment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(
      current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
    and new.created_by_clerk_user_id
      is distinct from old.created_by_clerk_user_id
    and new.id is not distinct from old.id
    and new.season_id is not distinct from old.season_id
    and new.tournament_id is not distinct from old.tournament_id
    and new.tournament_bracket_id
      is not distinct from old.tournament_bracket_id
    and new.registration_id is not distinct from old.registration_id
    and new.player_id is not distinct from old.player_id
    and new.bracket_type is not distinct from old.bracket_type
    and new.points is not distinct from old.points
    and new.event_type is not distinct from old.event_type
    and new.description is not distinct from old.description
    and new.source is not distinct from old.source
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if (
    tg_op <> 'INSERT'
    and old.source = 'admin'
    and old.bracket_type = 'main'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = old.season_id
        and season.finalized_at is not null
    )
  ) or (
    tg_op <> 'DELETE'
    and new.source = 'admin'
    and new.bracket_type = 'main'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = new.season_id
        and season.finalized_at is not null
    )
  ) then
    raise exception 'Finalized Main/Pro standings cannot be adjusted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.guard_finalized_main_admin_adjustment()
  owner to postgres;
revoke all on function public.guard_finalized_main_admin_adjustment()
  from public, anon, authenticated, service_role;

create function public.player_has_authoritative_competition_history(
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with player_registrations as (
    select
      registration.id,
      registration.tournament_id,
      registration.tournament_bracket_id,
      registration.registration_status
    from public.registrations as registration
    where registration.profile_id = p_player_id
  )
  select
    exists (
      select 1
      from public.leaderboard_point_events as event
      where event.player_id = p_player_id
    )
    or exists (
      select 1
      from public.leaderboard_player_season_stats as stat
      where stat.player_id = p_player_id
    )
    or exists (
      select 1
      from public.leaderboard_player_all_time_stats as stat
      where stat.player_id = p_player_id
    )
    or exists (
      select 1
      from public.leaderboard_season_champions as champion
      where champion.player_id = p_player_id
    )
    or exists (
      select 1
      from player_registrations as registration
      join public.tournament_brackets as bracket
        on bracket.id = registration.tournament_bracket_id
       and bracket.tournament_id = registration.tournament_id
      where registration.registration_status = 'approved'
        and bracket.launched_at is not null
    )
    or exists (
      select 1
      from player_registrations as registration
      join public.tournament_matches as match
        on registration.id in (
          match.player_one_registration_id,
          match.player_two_registration_id,
          match.winner_registration_id
        )
    )
    or exists (
      select 1
      from player_registrations as registration
      join public.tournament_standings as standing
        on standing.registration_id = registration.id
    )
    or exists (
      select 1
      from player_registrations as registration
      join public.match_result_submissions as submission
        on registration.id in (
          submission.submitted_by_registration_id,
          submission.claimed_winner_registration_id
        )
    )
    or exists (
      select 1
      from player_registrations as registration
      join public.match_result_report_groups as report
        on registration.id in (
          report.submitted_by_registration_id,
          report.opponent_registration_id,
          report.winner_registration_id,
          report.confirmed_by_registration_id,
          report.disputed_by_registration_id,
          report.no_show_reported_by_registration_id,
          report.no_show_registration_id
        )
    );
$$;

alter function public.player_has_authoritative_competition_history(uuid)
  owner to postgres;
revoke all on function
  public.player_has_authoritative_competition_history(uuid)
  from public, anon, authenticated, service_role;

create function public.guard_player_authoritative_history_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if public.player_has_authoritative_competition_history(old.id) then
    raise exception
      'Official competition history must be pseudonymized, not deleted'
      using errcode = '55000';
  end if;

  return old;
end;
$$;

alter function public.guard_player_authoritative_history_delete()
  owner to postgres;
revoke all on function public.guard_player_authoritative_history_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists players_guard_authoritative_history_delete
  on public.players;
create trigger players_guard_authoritative_history_delete
before delete on public.players
for each row
execute function public.guard_player_authoritative_history_delete();

create function public.guard_player_account_closure_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account_closure boolean :=
    coalesce(
      current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if tg_op = 'INSERT' then
    if new.account_closed_at is not null then
      raise exception 'Account closure state is database-controlled'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.account_closed_at is not null and not v_account_closure then
    raise exception 'Closed historical player identity is immutable'
      using errcode = '55000';
  end if;

  if new.account_closed_at is distinct from old.account_closed_at
    and not v_account_closure then
    raise exception 'Account closure state is database-controlled'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

alter function public.guard_player_account_closure_state()
  owner to postgres;
revoke all on function public.guard_player_account_closure_state()
  from public, anon, authenticated, service_role;

drop trigger if exists players_guard_account_closure_state
  on public.players;
create trigger players_guard_account_closure_state
before insert or update on public.players
for each row execute function public.guard_player_account_closure_state();

create or replace function public.protect_player_coh3_profile_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_requested_profile_id text;
begin
  if (
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
  ) or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.coh3_profile_id = null;
    return new;
  end if;

  if old.coh3_profile_id is not null then
    v_requested_profile_id :=
      public.extract_coh3stats_profile_id(new.coh3_player_card_url);

    if v_requested_profile_id is distinct from old.coh3_profile_id then
      new.coh3_player_card_url = old.coh3_player_card_url;
    end if;
  end if;

  new.coh3_profile_id = old.coh3_profile_id;
  return new;
end;
$$;

alter function public.protect_player_coh3_profile_id()
  owner to postgres;
revoke all on function public.protect_player_coh3_profile_id()
  from public, anon, authenticated;
grant execute on function public.protect_player_coh3_profile_id()
  to service_role;

create or replace function public.protect_player_steam_id64()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
      and session_user = 'postgres'
    ) then
    if tg_op = 'INSERT' then
      new.steam_id64 = null;
      new.steam_username = null;
    else
      new.steam_id64 = old.steam_id64;
      new.steam_username = old.steam_username;
    end if;
  end if;

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

alter function public.protect_player_steam_id64()
  owner to postgres;
revoke all on function public.protect_player_steam_id64()
  from public, anon, authenticated;
grant execute on function public.protect_player_steam_id64()
  to service_role;

create or replace function public.protect_player_relic_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if (
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
  ) or (
    current_user = 'postgres'
    and coalesce(auth.role(), '') = 'service_role'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if num_nonnulls(
      new.current_elo,
      new.relic_verified_elo,
      new.relic_verified_faction,
      new.relic_verified_division,
      new.relic_elo_calculation_version,
      new.relic_elo_verified_at,
      new.relic_elo_last_attempt_at
    ) > 0 then
      raise exception using
        errcode = '42501',
        message = 'Relic verification fields are server-controlled';
    end if;

    return new;
  end if;

  if new.current_elo is distinct from old.current_elo
    or new.relic_verified_elo is distinct from old.relic_verified_elo
    or new.relic_verified_faction is distinct from old.relic_verified_faction
    or new.relic_verified_division is distinct from old.relic_verified_division
    or new.relic_elo_calculation_version
      is distinct from old.relic_elo_calculation_version
    or new.relic_elo_verified_at is distinct from old.relic_elo_verified_at
    or new.relic_elo_last_attempt_at
      is distinct from old.relic_elo_last_attempt_at then
    raise exception using
      errcode = '42501',
      message = 'Relic verification fields are server-controlled';
  end if;

  return new;
end;
$$;

alter function public.protect_player_relic_verification()
  owner to postgres;
revoke all on function public.protect_player_relic_verification()
  from public, anon, authenticated, service_role;

-- Preserve the existing Relic registration checks for normal writes. The
-- account-closure RPC alone may clear private identity-review residue while
-- retaining factual eligibility values such as the submitted/verified ELO.
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
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    ) then
    return new;
  end if;

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

alter function public.enforce_registration_elo_eligibility()
  owner to postgres;
revoke all on function public.enforce_registration_elo_eligibility()
  from public, anon, authenticated, service_role;

create or replace function public.protect_relic_registration_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    ) then
    return new;
  end if;

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

alter function public.protect_relic_registration_snapshot()
  owner to postgres;
revoke all on function public.protect_relic_registration_snapshot()
  from public, anon, authenticated, service_role;

create function public.close_ironclad_player_account(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_closed_identity text;
  v_player public.players%rowtype;
  v_player_found boolean;
  v_has_history boolean;
  v_previous_account_closure text :=
    current_setting('ironclad.account_closure', true);
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  v_player_found := found;
  if v_player_found then
    v_has_history :=
      public.player_has_authoritative_competition_history(v_player.id);
  else
    v_has_history := false;
  end if;

  v_closed_identity :=
    'deleted:' || pg_catalog.gen_random_uuid()::text;

  perform pg_catalog.set_config(
    'ironclad.account_closure',
    'on',
    true
  );

  delete from public.player_notification_dismissals as dismissal
  where dismissal.clerk_user_id = v_clerk_user_id;

  delete from public.player_report_group_notification_dismissals as dismissal
  where dismissal.clerk_user_id = v_clerk_user_id;

  delete from public.notifications as notification
  where notification.recipient_clerk_user_id = v_clerk_user_id
    or notification.actor_clerk_user_id = v_clerk_user_id
    or position(v_clerk_user_id in notification.metadata::text) > 0
    or exists (
      select 1
      from public.registrations as registration
      where (
          registration.profile_id = v_player.id
          or registration.clerk_user_id = v_clerk_user_id
        )
        and notification.registration_id = registration.id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report
      join public.registrations as registration
        on registration.id in (
          report.submitted_by_registration_id,
          report.opponent_registration_id,
          report.winner_registration_id,
          report.confirmed_by_registration_id,
          report.disputed_by_registration_id,
          report.no_show_reported_by_registration_id,
          report.no_show_registration_id
        )
      where (
          registration.profile_id = v_player.id
          or registration.clerk_user_id = v_clerk_user_id
        )
        and notification.report_group_id = report.id
    );

  update public.registrations
  set
    clerk_user_id = v_closed_identity,
    player_name = 'Former Competitor',
    discord_username = null,
    steam_name = null,
    coh3_player_card_url = null,
    country = null,
    region = null,
    timezone = null,
    admin_notes = '',
    elo_verification_error = null,
    elo_verification_payload = null,
    elo_verified_player_name = null,
    elo_identity_status = null,
    elo_identity_error = null
  where profile_id = v_player.id
    or clerk_user_id = v_clerk_user_id;

  update public.match_result_submissions
  set
    submitted_by_clerk_user_id = case
      when submitted_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else submitted_by_clerk_user_id
    end,
    reviewed_by = case
      when reviewed_by = v_clerk_user_id then v_closed_identity
      else reviewed_by
    end
  where submitted_by_clerk_user_id = v_clerk_user_id
    or reviewed_by = v_clerk_user_id;

  update public.match_result_report_groups
  set
    submitted_by_clerk_user_id = case
      when submitted_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else submitted_by_clerk_user_id
    end,
    reviewed_by = case
      when reviewed_by = v_clerk_user_id then v_closed_identity
      else reviewed_by
    end,
    no_show_resolved_by = case
      when no_show_resolved_by = v_clerk_user_id then v_closed_identity
      else no_show_resolved_by
    end
  where submitted_by_clerk_user_id = v_clerk_user_id
    or reviewed_by = v_clerk_user_id
    or no_show_resolved_by = v_clerk_user_id;

  update public.tournament_matches
  set
    official_result_decided_by = case
      when official_result_decided_by = v_clerk_user_id
        then v_closed_identity
      else official_result_decided_by
    end,
    extended_by_clerk_user_id = case
      when extended_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else extended_by_clerk_user_id
    end,
    held_by_clerk_user_id = case
      when held_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else held_by_clerk_user_id
    end
  where official_result_decided_by = v_clerk_user_id
    or extended_by_clerk_user_id = v_clerk_user_id
    or held_by_clerk_user_id = v_clerk_user_id;

  update public.generated_brackets
  set generated_by = v_closed_identity
  where generated_by = v_clerk_user_id;

  update public.leaderboard_point_events
  set created_by_clerk_user_id = v_closed_identity
  where created_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_recalculation_runs
  set triggered_by_clerk_user_id = v_closed_identity
  where triggered_by_clerk_user_id = v_clerk_user_id;

  update public.platform_settings
  set updated_by_clerk_user_id = v_closed_identity
  where updated_by_clerk_user_id = v_clerk_user_id;

  update public.tournament_deletion_jobs
  set requested_by = v_closed_identity
  where requested_by = v_clerk_user_id;

  update public.tournaments
  set terminated_by_clerk_user_id = v_closed_identity
  where terminated_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_tournament_season_memberships
  set voided_by_clerk_user_id = v_closed_identity
  where voided_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_seasons
  set under_review_by_clerk_user_id = v_closed_identity
  where under_review_by_clerk_user_id = v_clerk_user_id;

  delete from public.profiles
  where clerk_user_id = v_clerk_user_id;

  if not v_player_found then
    perform pg_catalog.set_config(
      'ironclad.account_closure',
      coalesce(v_previous_account_closure, ''),
      true
    );

    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;

  if not v_has_history then
    delete from public.players
    where id = v_player.id;

    perform pg_catalog.set_config(
      'ironclad.account_closure',
      coalesce(v_previous_account_closure, ''),
      true
    );

    return pg_catalog.jsonb_build_object('outcome', 'deleted');
  end if;

  update public.players
  set
    clerk_user_id = v_closed_identity,
    display_name = 'Former Competitor',
    in_game_name = 'Former Competitor',
    discord_username = null,
    steam_username = null,
    coh3_player_card_url = null,
    country = null,
    region = null,
    timezone = null,
    current_elo = null,
    avatar_url = null,
    bio = null,
    profile_completed = false,
    public_profile_enabled = false,
    discord_public_enabled = false,
    coh3_profile_id = null,
    steam_id64 = null,
    relic_verified_elo = null,
    relic_verified_faction = null,
    relic_verified_division = null,
    relic_elo_calculation_version = null,
    relic_elo_verified_at = null,
    relic_elo_last_attempt_at = null,
    account_closed_at = clock_timestamp()
  where id = v_player.id;

  perform pg_catalog.set_config(
    'ironclad.account_closure',
    coalesce(v_previous_account_closure, ''),
    true
  );

  return pg_catalog.jsonb_build_object('outcome', 'pseudonymized');
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

create or replace view public.public_player_profiles
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
  null::text as avatar_url,
  player.created_at
from public.players as player
where player.public_profile_enabled = true
  and player.account_closed_at is null;

alter view public.public_player_profiles owner to postgres;
comment on view public.public_player_profiles is
  'Public-safe owner-rights projection for active opted-in profiles. Closed historical competitors are deliberately excluded.';
comment on column public.public_player_profiles.has_avatar is
  'True when an active opted-in public player has an avatar available through the player-id proxy.';
comment on column public.public_player_profiles.avatar_url is
  'Intentionally null because raw player avatar storage paths include Clerk user IDs.';
alter view public.public_player_profiles
  set (security_barrier = true, security_invoker = false);

-- Closed competitors remain in official standings without exposing the stable
-- player UUID as a public profile identifier. These owner-rights views project
-- only the established leaderboard facts and a fixed non-identifying label.
create or replace view public.leaderboard_public_season_standings
with (security_barrier = true)
as
select
  season_stats.season_id,
  season.name as season_name,
  season.year,
  season.season_number,
  season.start_date,
  season.end_date,
  case
    when player.account_closed_at is null then season_stats.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is null then player.display_name
    else 'Former Competitor'
  end as display_name,
  case
    when player.account_closed_at is null then player.in_game_name
    else 'Former Competitor'
  end as in_game_name,
  case
    when player.account_closed_at is null then player.country
    else null
  end as country,
  case
    when player.account_closed_at is null then player.region
    else null
  end as region,
  case
    when player.account_closed_at is null then player.current_elo
    else null
  end as current_elo,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  null::text as avatar_url,
  season_stats.bracket_type,
  season_stats.total_points,
  season_stats.tournaments_played,
  season_stats.rounds_passed,
  season_stats.tournament_wins,
  season_stats.matches_played,
  season_stats.matches_won,
  season_stats.matches_lost,
  season_stats.win_rate,
  case
    when player.account_closed_at is null then season_stats.last_tournament_id
    else null::uuid
  end as last_tournament_id,
  last_tournament.title as last_tournament_title,
  season_stats.last_tournament_points,
  season_stats.current_rank,
  season_stats.previous_rank,
  season_stats.rank_movement,
  season_stats.updated_at,
  row_number() over (
    partition by season_stats.season_id, season_stats.bracket_type
    order by season_stats.player_id
  ) as display_order
from public.leaderboard_player_season_stats as season_stats
join public.leaderboard_seasons as season
  on season.id = season_stats.season_id
join public.players as player
  on player.id = season_stats.player_id
left join public.tournaments as last_tournament
  on last_tournament.id = season_stats.last_tournament_id
where player.public_profile_enabled
  or player.account_closed_at is not null;

create or replace view public.leaderboard_public_all_time_standings
with (security_barrier = true)
as
select
  case
    when player.account_closed_at is null then all_time.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is null then player.display_name
    else 'Former Competitor'
  end as display_name,
  case
    when player.account_closed_at is null then player.in_game_name
    else 'Former Competitor'
  end as in_game_name,
  case
    when player.account_closed_at is null then player.country
    else null
  end as country,
  case
    when player.account_closed_at is null then player.region
    else null
  end as region,
  case
    when player.account_closed_at is null then player.current_elo
    else null
  end as current_elo,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  null::text as avatar_url,
  all_time.bracket_type,
  all_time.total_points,
  all_time.tournaments_played,
  all_time.rounds_passed,
  all_time.tournament_wins,
  all_time.matches_played,
  all_time.matches_won,
  all_time.matches_lost,
  all_time.win_rate,
  all_time.best_season_rank,
  all_time.last_active_season_id,
  season.name as last_active_season_name,
  season.year as last_active_season_year,
  season.season_number as last_active_season_number,
  all_time.updated_at,
  row_number() over (
    partition by all_time.bracket_type
    order by all_time.player_id
  ) as display_order
from public.leaderboard_player_all_time_stats as all_time
join public.players as player
  on player.id = all_time.player_id
left join public.leaderboard_seasons as season
  on season.id = all_time.last_active_season_id
where player.public_profile_enabled
  or player.account_closed_at is not null;

create view public.leaderboard_public_season_champions
with (security_barrier = true)
as
select
  case
    when player.account_closed_at is null then champion.id::text
    else 'former-champion:' || md5(champion.id::text)
  end as id,
  champion.season_id,
  season.name as season_name,
  champion.bracket_type,
  case
    when player.account_closed_at is null then champion.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is null then player.in_game_name
    else 'Former Competitor'
  end as player_name,
  case
    when player.account_closed_at is null then player.country
    else null
  end as country,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  champion.final_rank,
  champion.final_points,
  champion.created_at
from public.leaderboard_season_champions as champion
join public.leaderboard_seasons as season
  on season.id = champion.season_id
join public.players as player
  on player.id = champion.player_id
where player.public_profile_enabled
  or player.account_closed_at is not null;

alter view public.leaderboard_public_season_standings
  owner to postgres;
alter view public.leaderboard_public_all_time_standings
  owner to postgres;
alter view public.leaderboard_public_season_champions
  owner to postgres;
alter view public.leaderboard_current_season
  owner to postgres;

alter view public.leaderboard_current_season
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_season_standings
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_all_time_standings
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_season_champions
  set (security_barrier = true, security_invoker = false);

revoke all privileges on table
  public.public_player_profiles,
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings,
  public.leaderboard_public_season_champions
from public, anon, authenticated, service_role;

grant select on table
  public.public_player_profiles,
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings,
  public.leaderboard_public_season_champions
to anon, authenticated, service_role;

-- Raw derived rows carry stable player IDs and the season table now carries
-- private under-review attribution. Public reads use only the projections.
revoke select (
  id,
  name,
  year,
  season_number,
  start_date,
  end_date,
  is_active,
  created_at,
  updated_at,
  finalized_at,
  under_review_at,
  under_review_tournament_id
) on public.leaderboard_seasons from anon, authenticated;
revoke select on table
  public.leaderboard_seasons,
  public.leaderboard_player_season_stats,
  public.leaderboard_player_all_time_stats,
  public.leaderboard_season_champions
from anon, authenticated;
grant select on table
  public.leaderboard_seasons,
  public.leaderboard_player_season_stats,
  public.leaderboard_player_all_time_stats,
  public.leaderboard_season_champions
to service_role;

commit;
