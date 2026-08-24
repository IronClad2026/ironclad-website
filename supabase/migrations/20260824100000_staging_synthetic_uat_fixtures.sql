begin;

-- Staging synthetic UAT players are post-provider fixtures. They deliberately
-- carry no Steam OpenID, Steam ownership, or live Relic facts. The same schema
-- is deployed everywhere, but every mutating/read RPC below also requires the
-- Staging project ref, service_role, and a Staging-only Vault secret.

alter table public.registrations
  add column registration_provenance text,
  add column fixture_contract_version text;

alter table public.registrations
  add constraint registrations_fixture_provenance_check
  check (
    (
      registration_provenance is null
      and fixture_contract_version is null
    )
    or (
      registration_provenance = 'staging_synthetic_uat'
      and fixture_contract_version = 'staging-synthetic-v1'
    )
  );

comment on column public.registrations.registration_provenance is
  'Private operational marker. staging_synthetic_uat identifies a post-provider fixture registration and never a provider-verified result.';
comment on column public.registrations.fixture_contract_version is
  'Private operational version for a synthetic fixture registration. Excluded from authenticated column grants.';

create index registrations_staging_synthetic_uat_idx
  on public.registrations(tournament_id, tournament_bracket_id, profile_id)
  where registration_provenance = 'staging_synthetic_uat';

create table ironclad_private.staging_synthetic_uat_players (
  player_id uuid primary key
    references public.players(id) on delete cascade,
  approved_alias text not null unique,
  synthetic_elo integer not null
    check (synthetic_elo between 0 and 5000),
  synthetic_division text not null
    check (synthetic_division in ('Academy', 'Challenge', 'Main / Pro')),
  provenance text not null default 'staging_synthetic_uat'
    check (provenance = 'staging_synthetic_uat'),
  contract_version text not null default 'staging-synthetic-v1'
    check (contract_version = 'staging-synthetic-v1'),
  clerk_environment text not null default 'development'
    check (clerk_environment = 'development'),
  clerk_test_user_verified boolean not null
    check (clerk_test_user_verified),
  clerk_test_user_verified_at timestamptz not null,
  steam_openid_verified boolean not null default false
    check (not steam_openid_verified),
  steam_ownership_verified boolean not null default false
    check (not steam_ownership_verified),
  relic_live_lookup_verified boolean not null default false
    check (not relic_live_lookup_verified),
  linked_steam_legal_confirmation boolean not null default false
    check (not linked_steam_legal_confirmation),
  created_at timestamptz not null default clock_timestamp(),
  check (
    approved_alias ~ '^Test(Academy|Challenge|Main)([1-9]|10)$'
  )
);

create table ironclad_private.staging_synthetic_uat_enrolments (
  registration_id uuid primary key
    references public.registrations(id) on delete cascade,
  player_id uuid not null
    references ironclad_private.staging_synthetic_uat_players(player_id)
    on delete cascade,
  tournament_id uuid not null
    references public.tournaments(id) on delete cascade,
  tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  synthetic_elo integer not null
    check (synthetic_elo between 0 and 5000),
  synthetic_division text not null
    check (synthetic_division in ('Academy', 'Challenge', 'Main / Pro')),
  provenance text not null default 'staging_synthetic_uat'
    check (provenance = 'staging_synthetic_uat'),
  contract_version text not null default 'staging-synthetic-v1'
    check (contract_version = 'staging-synthetic-v1'),
  steam_openid_verified boolean not null default false
    check (not steam_openid_verified),
  steam_ownership_verified boolean not null default false
    check (not steam_ownership_verified),
  relic_live_lookup_verified boolean not null default false
    check (not relic_live_lookup_verified),
  linked_steam_legal_confirmation boolean not null default false
    check (not linked_steam_legal_confirmation),
  created_at timestamptz not null default clock_timestamp(),
  unique (player_id, tournament_id)
);

comment on table ironclad_private.staging_synthetic_uat_players is
  'Non-exposed, immutable provenance for approved Clerk Development post-provider UAT fixtures. Real provider fields remain null on public.players.';
comment on table ironclad_private.staging_synthetic_uat_enrolments is
  'Non-exposed synthetic enrolment evidence. All provider and linked-Steam legal facts are explicitly false.';

alter table ironclad_private.staging_synthetic_uat_players
  enable row level security;
alter table ironclad_private.staging_synthetic_uat_players
  force row level security;
alter table ironclad_private.staging_synthetic_uat_enrolments
  enable row level security;
alter table ironclad_private.staging_synthetic_uat_enrolments
  force row level security;

revoke all on table ironclad_private.staging_synthetic_uat_players
  from public, anon, authenticated, service_role;
revoke all on table ironclad_private.staging_synthetic_uat_enrolments
  from public, anon, authenticated, service_role;

create function ironclad_private.staging_synthetic_uat_alias_definition(
  p_alias text
)
returns table (
  approved_alias text,
  synthetic_elo integer,
  synthetic_division text
)
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select candidate.approved_alias, candidate.synthetic_elo,
    candidate.synthetic_division
  from (
    values
      ('TestAcademy1', 700, 'Academy'),
      ('TestAcademy2', 750, 'Academy'),
      ('TestAcademy3', 800, 'Academy'),
      ('TestAcademy4', 850, 'Academy'),
      ('TestAcademy5', 900, 'Academy'),
      ('TestAcademy6', 950, 'Academy'),
      ('TestAcademy7', 1000, 'Academy'),
      ('TestAcademy8', 1050, 'Academy'),
      ('TestAcademy9', 1075, 'Academy'),
      ('TestAcademy10', 1099, 'Academy'),
      ('TestChallenge1', 1100, 'Challenge'),
      ('TestChallenge2', 1150, 'Challenge'),
      ('TestChallenge3', 1200, 'Challenge'),
      ('TestChallenge4', 1225, 'Challenge'),
      ('TestChallenge5', 1250, 'Challenge'),
      ('TestChallenge6', 1275, 'Challenge'),
      ('TestChallenge7', 1300, 'Challenge'),
      ('TestChallenge8', 1350, 'Challenge'),
      ('TestChallenge9', 1375, 'Challenge'),
      ('TestChallenge10', 1399, 'Challenge'),
      ('TestMain1', 1400, 'Main / Pro'),
      ('TestMain2', 1450, 'Main / Pro'),
      ('TestMain3', 1500, 'Main / Pro'),
      ('TestMain4', 1550, 'Main / Pro'),
      ('TestMain5', 1600, 'Main / Pro'),
      ('TestMain6', 1700, 'Main / Pro'),
      ('TestMain7', 1800, 'Main / Pro'),
      ('TestMain8', 1900, 'Main / Pro'),
      ('TestMain9', 2000, 'Main / Pro'),
      ('TestMain10', 2200, 'Main / Pro')
  ) as candidate(approved_alias, synthetic_elo, synthetic_division)
  where candidate.approved_alias = p_alias;
$$;

alter function ironclad_private.staging_synthetic_uat_alias_definition(text)
  owner to postgres;
revoke all on function
  ironclad_private.staging_synthetic_uat_alias_definition(text)
  from public, anon, authenticated, service_role;

create function ironclad_private.assert_staging_synthetic_uat_access(
  p_fixture_secret text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or coalesce(auth.jwt() ->> 'ref', '') <> 'zzbnneprhjicmajpjkdg' then
    raise exception 'Synthetic fixture contract is unavailable'
      using errcode = '42501';
  end if;

  begin
    select nullif(btrim(secret.decrypted_secret), '')
    into v_fixture_secret
    from vault.decrypted_secrets as secret
    where secret.name = 'ironclad_staging_synthetic_uat_fixture_secret'
    limit 1;
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      v_fixture_secret := null;
  end;

  if v_fixture_secret is null
    or char_length(v_fixture_secret) < 32
    or p_fixture_secret is null
    or char_length(p_fixture_secret) < 32
    or p_fixture_secret is distinct from v_fixture_secret then
    raise exception 'Synthetic fixture contract is unavailable'
      using errcode = '42501';
  end if;
end;
$$;

alter function ironclad_private.assert_staging_synthetic_uat_access(text)
  owner to postgres;
revoke all on function
  ironclad_private.assert_staging_synthetic_uat_access(text)
  from public, anon, authenticated, service_role;

create function ironclad_private.guard_staging_synthetic_uat_player_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_expected record;
  v_provisioning boolean :=
    coalesce(
      current_setting('ironclad.staging_synthetic_uat_provisioning', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role';
  v_account_closure boolean :=
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if tg_op = 'DELETE' then
    if v_account_closure then
      return old;
    end if;

    raise exception 'Synthetic fixture identity provenance is immutable'
      using errcode = '55000';
  end if;

  if not v_provisioning then
    raise exception 'Synthetic fixture identity provenance is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Synthetic fixture identity provenance is immutable'
      using errcode = '55000';
  end if;

  select definition.*
  into v_expected
  from ironclad_private.staging_synthetic_uat_alias_definition(
    new.approved_alias
  ) as definition;

  if not found
    or new.synthetic_elo is distinct from v_expected.synthetic_elo
    or new.synthetic_division is distinct from v_expected.synthetic_division
    or new.provenance is distinct from 'staging_synthetic_uat'
    or new.contract_version is distinct from 'staging-synthetic-v1'
    or new.clerk_environment is distinct from 'development'
    or new.clerk_test_user_verified is distinct from true
    or new.clerk_test_user_verified_at is null
    or new.steam_openid_verified is distinct from false
    or new.steam_ownership_verified is distinct from false
    or new.relic_live_lookup_verified is distinct from false
    or new.linked_steam_legal_confirmation is distinct from false then
    raise exception 'Synthetic fixture identity provenance is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function
  ironclad_private.guard_staging_synthetic_uat_player_record()
  owner to postgres;
revoke all on function
  ironclad_private.guard_staging_synthetic_uat_player_record()
  from public, anon, authenticated, service_role;

create trigger staging_synthetic_uat_players_guard_record
before insert or update or delete
on ironclad_private.staging_synthetic_uat_players
for each row execute function
  ironclad_private.guard_staging_synthetic_uat_player_record();

create function ironclad_private.guard_staging_synthetic_uat_enrolment_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_enrolling boolean :=
    coalesce(
      current_setting('ironclad.staging_synthetic_uat_enrolling', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role';
  v_cleanup boolean :=
    coalesce(
      current_setting('ironclad.staging_synthetic_uat_cleanup', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role';
  v_trusted_maintenance boolean :=
    coalesce(current_setting('ironclad.tournament_deletion', true), '') = 'on'
    or (
      coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
      and (
        session_user = 'postgres'
        or coalesce(auth.role(), '') = 'service_role'
      )
    );
begin
  if tg_op = 'DELETE' then
    if v_cleanup or v_trusted_maintenance then
      return old;
    end if;

    raise exception 'Synthetic fixture enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' or not v_enrolling then
    raise exception 'Synthetic fixture enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if new.provenance is distinct from 'staging_synthetic_uat'
    or new.contract_version is distinct from 'staging-synthetic-v1'
    or new.steam_openid_verified is distinct from false
    or new.steam_ownership_verified is distinct from false
    or new.relic_live_lookup_verified is distinct from false
    or new.linked_steam_legal_confirmation is distinct from false
    or not exists (
      select 1
      from ironclad_private.staging_synthetic_uat_players as fixture
      where fixture.player_id = new.player_id
        and fixture.synthetic_elo = new.synthetic_elo
        and fixture.synthetic_division = new.synthetic_division
        and fixture.provenance = new.provenance
        and fixture.contract_version = new.contract_version
    ) then
    raise exception 'Synthetic fixture enrolment evidence is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function
  ironclad_private.guard_staging_synthetic_uat_enrolment_record()
  owner to postgres;
revoke all on function
  ironclad_private.guard_staging_synthetic_uat_enrolment_record()
  from public, anon, authenticated, service_role;

create trigger staging_synthetic_uat_enrolments_guard_record
before insert or update or delete
on ironclad_private.staging_synthetic_uat_enrolments
for each row execute function
  ironclad_private.guard_staging_synthetic_uat_enrolment_record();

-- Fixture profiles remain private and keep every real provider field null.
-- This trigger also prevents the real Steam callback from attaching a fixture
-- to a live provider identity later.
create function public.guard_staging_synthetic_uat_player()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_account_closure boolean :=
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.player_id = old.id;

  if not found or v_account_closure then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.clerk_user_id is distinct from old.clerk_user_id
    or new.account_closed_at is not null
    or new.display_name is distinct from v_fixture.approved_alias
    or new.in_game_name is distinct from v_fixture.approved_alias
    or nullif(btrim(new.avatar_url), '') is null
    or nullif(btrim(new.country), '') is null
    or nullif(btrim(new.region), '') is null
    or nullif(btrim(new.timezone), '') is null
    or new.public_profile_enabled is distinct from false
    or new.discord_public_enabled is distinct from false
    or new.discord_username is not null
    or new.steam_id64 is not null
    or new.steam_username is not null
    or new.coh3_profile_id is not null
    or new.coh3_player_card_url is not null
    or new.current_elo is not null
    or new.relic_verified_elo is not null
    or new.relic_verified_faction is not null
    or new.relic_verified_division is not null
    or new.relic_elo_calculation_version is not null
    or new.relic_elo_verified_at is not null
    or new.relic_elo_last_attempt_at is not null then
    raise exception 'Synthetic fixture player facts are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

alter function public.guard_staging_synthetic_uat_player()
  owner to postgres;
revoke all on function public.guard_staging_synthetic_uat_player()
  from public, anon, authenticated, service_role;

create trigger players_guard_staging_synthetic_uat
before insert or update on public.players
for each row execute function public.guard_staging_synthetic_uat_player();

-- A fixture identity is auditable contract evidence even before it has
-- official competition history. Account closure must therefore pseudonymize
-- its Player row instead of deleting that row and cascading away the private
-- evidence while a marked registration survives with profile_id set null.
-- Every pre-existing normal-history predicate remains byte-for-byte intact.
create or replace function public.player_has_authoritative_competition_history(
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
    )
    or exists (
      select 1
      from ironclad_private.staging_synthetic_uat_players as fixture
      where fixture.player_id = p_player_id
        and fixture.provenance = 'staging_synthetic_uat'
        and fixture.contract_version = 'staging-synthetic-v1'
    );
$$;

alter function public.player_has_authoritative_competition_history(uuid)
  owner to postgres;
revoke all on function
  public.player_has_authoritative_competition_history(uuid)
  from public, anon, authenticated, service_role;

-- Preserve the normal completion predicate exactly. A marked fixture may use
-- the same human profile fields with null provider identity only while its
-- private provenance exists and every provider fact remains null.
create or replace function public.protect_player_steam_id64()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_is_fixture boolean := false;
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

  if nullif(btrim(new.discord_username), '') is null then
    new.discord_username = null;
    new.discord_public_enabled = false;
  end if;

  select exists (
    select 1
    from ironclad_private.staging_synthetic_uat_players as fixture
    where fixture.player_id = new.id
      and fixture.provenance = 'staging_synthetic_uat'
      and fixture.contract_version = 'staging-synthetic-v1'
      and fixture.steam_openid_verified is false
      and fixture.steam_ownership_verified is false
      and fixture.relic_live_lookup_verified is false
      and fixture.linked_steam_legal_confirmation is false
      and new.steam_id64 is null
      and new.steam_username is null
      and new.coh3_profile_id is null
      and new.coh3_player_card_url is null
      and new.current_elo is null
      and new.relic_verified_elo is null
      and new.relic_verified_faction is null
      and new.relic_verified_division is null
      and new.relic_elo_calculation_version is null
      and new.relic_elo_verified_at is null
      and new.relic_elo_last_attempt_at is null
  ) into v_is_fixture;

  new.profile_completed = (
    nullif(btrim(new.avatar_url), '') is not null
    and (
      nullif(btrim(new.display_name), '') is not null
      or nullif(btrim(new.in_game_name), '') is not null
    )
    and (
      nullif(btrim(new.steam_id64), '') is not null
      or v_is_fixture
    )
    and nullif(btrim(new.country), '') is not null
    and nullif(btrim(new.region), '') is not null
    and nullif(btrim(new.timezone), '') is not null
  );

  return new;
end;
$$;

alter function public.protect_player_steam_id64() owner to postgres;
revoke all on function public.protect_player_steam_id64()
  from public, anon, authenticated;
grant execute on function public.protect_player_steam_id64()
  to service_role;

-- Fixture registration rows can only be introduced by the guarded enrolment
-- RPC. Their provider snapshot stays wholly null for their entire lifetime.
create function public.guard_staging_synthetic_uat_registration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    ) then
    return new;
  end if;

  if tg_op = 'INSERT'
    and new.registration_provenance is distinct from
      'staging_synthetic_uat' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.registration_provenance is null
      and new.registration_provenance is null
      and old.fixture_contract_version is null
      and new.fixture_contract_version is null then
      return new;
    end if;

    if old.registration_provenance is distinct from
        'staging_synthetic_uat'
      or old.fixture_contract_version is distinct from
        'staging-synthetic-v1'
      or new.registration_provenance is distinct from
        old.registration_provenance
      or new.fixture_contract_version is distinct from
        old.fixture_contract_version then
      raise exception 'Synthetic fixture registration provenance is immutable'
        using errcode = '55000';
    end if;
  elsif coalesce(
    current_setting('ironclad.staging_synthetic_uat_enrolling', true),
    ''
  ) <> 'on' or coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Synthetic fixture registration is unavailable'
      using errcode = '42501';
  end if;

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  join public.players as player on player.id = fixture.player_id
  where fixture.player_id = new.profile_id
    and player.clerk_user_id = new.clerk_user_id;

  if not found
    or new.registration_provenance is distinct from
      'staging_synthetic_uat'
    or new.fixture_contract_version is distinct from
      'staging-synthetic-v1'
    or new.submitted_elo is distinct from v_fixture.synthetic_elo
    or new.elo_status is distinct from 'manual_review'
    or new.steam_name is not null
    or new.coh3_player_card_url is not null
    or new.elo_verified_elo is not null
    or new.elo_difference is not null
    or new.elo_highest_faction is not null
    or new.elo_checked_mode is not null
    or new.elo_checked_at is not null
    or new.elo_verification_source is not null
    or new.elo_verification_error is not null
    or new.elo_verification_payload is not null
    or new.elo_verified_player_name is not null
    or new.elo_identity_status is not null
    or new.elo_identity_error is not null
    or new.elo_verified_division is not null
    or new.elo_calculation_version is not null then
    raise exception 'Synthetic fixture registration facts are invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.guard_staging_synthetic_uat_registration()
  owner to postgres;
revoke all on function public.guard_staging_synthetic_uat_registration()
  from public, anon, authenticated, service_role;

create trigger registrations_guard_staging_synthetic_uat
before insert or update on public.registrations
for each row execute function
  public.guard_staging_synthetic_uat_registration();

-- Keep every existing normal Relic and legacy eligibility branch intact. The
-- added first-class fixture branch derives eligibility only from the private,
-- fixed catalogue and never writes provider snapshot columns.
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
  v_fixture_synthetic_elo integer;
  v_fixture_synthetic_division text;
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

  if new.registration_provenance = 'staging_synthetic_uat' then
    select fixture.synthetic_elo, fixture.synthetic_division, bracket.name
    into
      v_fixture_synthetic_elo,
      v_fixture_synthetic_division,
      v_bracket_name
    from ironclad_private.staging_synthetic_uat_players as fixture
    join public.players as player on player.id = fixture.player_id
    join public.tournament_brackets as bracket
      on bracket.id = new.tournament_bracket_id
    where fixture.player_id = new.profile_id
      and player.clerk_user_id = new.clerk_user_id;

    if not found then
      raise exception 'Synthetic fixture registration identity is invalid';
    end if;

    v_expected_division := case v_bracket_name
      when 'Academy' then 'Academy'
      when 'Challenge' then 'Challenge'
      when 'Main' then 'Main / Pro'
      else null
    end;

    if v_expected_division is null
      or v_fixture_synthetic_division is distinct from
        v_expected_division then
      raise exception
        'Synthetic ELO does not match the selected tournament division';
    end if;

    new.submitted_elo := v_fixture_synthetic_elo;
    new.elo_status := 'manual_review';
    new.elo_verified_elo := null;
    new.elo_difference := null;
    new.elo_highest_faction := null;
    new.elo_checked_mode := null;
    new.elo_checked_at := null;
    new.elo_verification_source := null;
    new.elo_verification_error := null;
    new.elo_verification_payload := null;
    new.elo_verified_player_name := null;
    new.elo_identity_status := null;
    new.elo_identity_error := null;
    new.elo_verified_division := null;
    new.elo_calculation_version := null;
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

-- Normal registrations still require the canonical immutable acceptance.
-- Fixture registrations instead require one private evidence row whose Steam,
-- Relic, and linked-Steam statements are all explicitly false. Neither path
-- can satisfy the other, and both at once are rejected.
create or replace function public.require_registration_acceptance_on_commit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_canonical_acceptance boolean;
  v_has_fixture_evidence boolean;
begin
  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = new.id
  ) then
    if exists (
      select 1
      from public.registration_acceptances as acceptance
      where acceptance.registration_id = new.id
    ) or exists (
      select 1
      from ironclad_private.staging_synthetic_uat_enrolments as fixture
      where fixture.registration_id = new.id
    ) then
      raise exception
        'Registration evidence cannot outlive a registration created in the same transaction'
        using errcode = '23514';
    end if;

    return null;
  end if;

  select exists (
    select 1
    from public.registration_acceptances as acceptance
    where acceptance.registration_id = new.id
      and acceptance.clerk_user_id = new.clerk_user_id
      and acceptance.tournament_id = new.tournament_id
      and acceptance.accepted_at >= new.created_at
  ) into v_has_canonical_acceptance;

  select exists (
    select 1
    from ironclad_private.staging_synthetic_uat_enrolments as fixture
    where fixture.registration_id = new.id
      and fixture.player_id = new.profile_id
      and fixture.tournament_id = new.tournament_id
      and fixture.tournament_bracket_id = new.tournament_bracket_id
      and fixture.synthetic_elo = new.submitted_elo
      and fixture.provenance = new.registration_provenance
      and fixture.contract_version = new.fixture_contract_version
      and fixture.steam_openid_verified is false
      and fixture.steam_ownership_verified is false
      and fixture.relic_live_lookup_verified is false
      and fixture.linked_steam_legal_confirmation is false
  ) into v_has_fixture_evidence;

  if v_has_canonical_acceptance = v_has_fixture_evidence then
    raise exception
      'Every new registration requires exactly one atomic evidence contract'
      using errcode = '23514';
  end if;

  if v_has_canonical_acceptance and (
    new.registration_provenance is not null
    or new.fixture_contract_version is not null
  ) then
    raise exception 'Canonical acceptance cannot mark synthetic provenance'
      using errcode = '23514';
  end if;

  if v_has_fixture_evidence and (
    new.registration_provenance is distinct from 'staging_synthetic_uat'
    or new.fixture_contract_version is distinct from
      'staging-synthetic-v1'
    or new.elo_verification_source is not null
  ) then
    raise exception 'Synthetic fixture evidence is invalid'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

alter function public.require_registration_acceptance_on_commit()
  owner to postgres;
revoke all on function public.require_registration_acceptance_on_commit()
  from public, anon, authenticated, service_role;

create or replace function public.protect_registration_history_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if current_setting('ironclad.tournament_deletion', true) = 'on' then
    return old;
  end if;

  if coalesce(
      current_setting('ironclad.staging_synthetic_uat_cleanup', true),
      ''
    ) = 'on'
    and coalesce(auth.role(), '') = 'service_role'
    and old.registration_provenance = 'staging_synthetic_uat'
    and old.fixture_contract_version = 'staging-synthetic-v1'
    and exists (
      select 1
      from ironclad_private.staging_synthetic_uat_enrolments as fixture
      where fixture.registration_id = old.id
        and fixture.player_id = old.profile_id
        and fixture.tournament_id = old.tournament_id
        and fixture.tournament_bracket_id = old.tournament_bracket_id
    ) then
    return old;
  end if;

  if old.tournament_id is not null
    and exists (
      select 1
      from public.tournaments as tournament
      where tournament.id = old.tournament_id
    ) then
    raise exception
      'Tournament registration history cannot be deleted; use review or withdrawal';
  end if;

  return old;
end;
$$;

alter function public.protect_registration_history_delete()
  owner to postgres;
revoke all on function public.protect_registration_history_delete()
  from public, anon, authenticated;
grant execute on function public.protect_registration_history_delete()
  to service_role;

create function public.provision_staging_synthetic_uat_player(
  p_fixture_secret text,
  p_alias text,
  p_clerk_user_id text
)
returns table (
  alias text,
  player_id uuid,
  profile_complete boolean,
  profile_public boolean,
  has_steam_identity boolean,
  has_provider_facts boolean,
  current_elo integer,
  synthetic_elo integer,
  synthetic_division text,
  provenance text,
  contract_version text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_definition record;
  v_player public.players%rowtype;
  v_existing_fixture
    ironclad_private.staging_synthetic_uat_players%rowtype;
  v_created boolean := false;
  v_player_id uuid;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  if p_alias is null or p_alias is distinct from btrim(p_alias)
    or p_clerk_user_id is null
    or p_clerk_user_id !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'Synthetic fixture request is invalid'
      using errcode = '22023';
  end if;

  select definition.*
  into v_definition
  from ironclad_private.staging_synthetic_uat_alias_definition(p_alias)
    as definition;

  if not found then
    raise exception 'Synthetic fixture alias is not permitted'
      using errcode = '22023';
  end if;

  select fixture.*
  into v_existing_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = p_alias
  for update;

  if found then
    select player.*
    into strict v_player
    from public.players as player
    where player.id = v_existing_fixture.player_id
      and player.clerk_user_id = p_clerk_user_id
    for update;

    v_player_id := v_player.id;
  else
    if exists (
      select 1
      from public.players as player
      where player.clerk_user_id = p_clerk_user_id
    ) then
      raise exception 'Synthetic fixture cannot adopt an existing player'
        using errcode = '23505';
    end if;

    v_player_id := gen_random_uuid();
    v_created := true;

    perform set_config(
      'ironclad.staging_synthetic_uat_provisioning',
      'on',
      true
    );

    insert into public.players (
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
      public_profile_enabled,
      discord_public_enabled,
      coh3_profile_id,
      steam_id64,
      relic_verified_elo,
      relic_verified_faction,
      relic_verified_division,
      relic_elo_calculation_version,
      relic_elo_verified_at,
      relic_elo_last_attempt_at
    ) values (
      v_player_id,
      p_clerk_user_id,
      p_alias,
      p_alias,
      null,
      null,
      null,
      'Australia',
      'Oceania',
      'Australia/Sydney (UTC+10:00)',
      null,
      '/players/' || v_player_id::text || '/avatar',
      'Staging synthetic UAT post-provider fixture.',
      false,
      false,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );

    insert into ironclad_private.staging_synthetic_uat_players (
      player_id,
      approved_alias,
      synthetic_elo,
      synthetic_division,
      clerk_test_user_verified,
      clerk_test_user_verified_at
    ) values (
      v_player_id,
      v_definition.approved_alias,
      v_definition.synthetic_elo,
      v_definition.synthetic_division,
      true,
      clock_timestamp()
    );
  end if;

  -- Reassert the immutable fixture shape and recalculate profile_completed now
  -- that the private provenance row exists.
  update public.players as player
  set
    display_name = p_alias,
    in_game_name = p_alias,
    discord_username = null,
    steam_username = null,
    coh3_player_card_url = null,
    country = 'Australia',
    region = 'Oceania',
    timezone = 'Australia/Sydney (UTC+10:00)',
    current_elo = null,
    avatar_url = '/players/' || v_player_id::text || '/avatar',
    public_profile_enabled = false,
    discord_public_enabled = false,
    coh3_profile_id = null,
    steam_id64 = null,
    relic_verified_elo = null,
    relic_verified_faction = null,
    relic_verified_division = null,
    relic_elo_calculation_version = null,
    relic_elo_verified_at = null,
    relic_elo_last_attempt_at = null
  where player.id = v_player_id
  returning player.* into v_player;

  if not v_player.profile_completed then
    raise exception 'Synthetic fixture profile completion failed'
      using errcode = '23514';
  end if;

  return query
  select
    v_existing.approved_alias,
    v_player.id,
    v_player.profile_completed,
    v_player.public_profile_enabled,
    v_player.steam_id64 is not null,
    num_nonnulls(
      v_player.steam_id64,
      v_player.coh3_profile_id,
      v_player.current_elo,
      v_player.relic_verified_elo,
      v_player.relic_verified_faction,
      v_player.relic_verified_division,
      v_player.relic_elo_calculation_version,
      v_player.relic_elo_verified_at,
      v_player.relic_elo_last_attempt_at
    ) > 0,
    v_player.current_elo,
    v_existing.synthetic_elo,
    v_existing.synthetic_division,
    v_existing.provenance,
    v_existing.contract_version,
    v_created
  from ironclad_private.staging_synthetic_uat_players as v_existing
  where v_existing.player_id = v_player.id;
end;
$$;

alter function public.provision_staging_synthetic_uat_player(
  text,
  text,
  text
) owner to postgres;
revoke all on function public.provision_staging_synthetic_uat_player(
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.provision_staging_synthetic_uat_player(
  text,
  text,
  text
) to service_role;

create function public.inspect_staging_synthetic_uat_player(
  p_fixture_secret text,
  p_alias text
)
returns table (
  alias text,
  player_id uuid,
  profile_complete boolean,
  profile_public boolean,
  has_steam_identity boolean,
  has_provider_facts boolean,
  current_elo integer,
  synthetic_elo integer,
  synthetic_division text,
  provenance text,
  contract_version text,
  active_registration_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  if not exists (
    select 1
    from ironclad_private.staging_synthetic_uat_alias_definition(p_alias)
  ) then
    raise exception 'Synthetic fixture alias is not permitted'
      using errcode = '22023';
  end if;

  return query
  select
    fixture.approved_alias,
    player.id,
    player.profile_completed,
    player.public_profile_enabled,
    player.steam_id64 is not null,
    num_nonnulls(
      player.steam_id64,
      player.coh3_profile_id,
      player.current_elo,
      player.relic_verified_elo,
      player.relic_verified_faction,
      player.relic_verified_division,
      player.relic_elo_calculation_version,
      player.relic_elo_verified_at,
      player.relic_elo_last_attempt_at
    ) > 0,
    player.current_elo,
    fixture.synthetic_elo,
    fixture.synthetic_division,
    fixture.provenance,
    fixture.contract_version,
    count(registration.id) filter (
      where registration.registration_status not in ('rejected', 'withdrawn')
    )
  from ironclad_private.staging_synthetic_uat_players as fixture
  join public.players as player on player.id = fixture.player_id
  left join public.registrations as registration
    on registration.profile_id = player.id
    and registration.registration_provenance = 'staging_synthetic_uat'
  where fixture.approved_alias = p_alias
  group by fixture.player_id, player.id;

  if not found then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;
end;
$$;

alter function public.inspect_staging_synthetic_uat_player(text, text)
  owner to postgres;
revoke all on function public.inspect_staging_synthetic_uat_player(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_staging_synthetic_uat_player(text, text)
  to service_role;

create function public.enrol_staging_synthetic_uat_player(
  p_fixture_secret text,
  p_alias text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_waitlist_confirmed boolean
)
returns table (
  alias text,
  player_id uuid,
  registration_id uuid,
  registration_status text,
  queue_position bigint,
  waitlist_confirmation_required boolean,
  synthetic_elo integer,
  synthetic_division text,
  provenance text,
  contract_version text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_player public.players%rowtype;
  v_existing public.registrations%rowtype;
  v_tournament_title text;
  v_tournament_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_bracket_name text;
  v_bracket_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_active_count integer;
  v_offered_count integer;
  v_waiting_count integer;
  v_requires_waitlist boolean;
  v_expected_division text;
  v_checked_at timestamptz;
  v_registration_id uuid;
  v_registration_status text;
  v_queue_position bigint;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = p_alias
  for update;

  if not found then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;

  select player.*
  into v_player
  from public.players as player
  where player.id = v_fixture.player_id
  for update;

  if not found
    or not v_player.profile_completed
    or v_player.public_profile_enabled
    or v_player.steam_id64 is not null
    or v_player.coh3_profile_id is not null
    or v_player.current_elo is not null
    or v_player.relic_verified_elo is not null then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;

  select registration.*
  into v_existing
  from public.registrations as registration
  where registration.clerk_user_id = v_player.clerk_user_id
    and registration.tournament_id = p_tournament_id
  for update;

  if found then
    if v_existing.tournament_bracket_id is distinct from
        p_tournament_bracket_id
      or v_existing.registration_provenance is distinct from
        'staging_synthetic_uat'
      or v_existing.fixture_contract_version is distinct from
        'staging-synthetic-v1'
      or not exists (
        select 1
        from ironclad_private.staging_synthetic_uat_enrolments as enrolment
        where enrolment.registration_id = v_existing.id
          and enrolment.player_id = v_player.id
          and enrolment.tournament_id = p_tournament_id
          and enrolment.tournament_bracket_id = p_tournament_bracket_id
      ) then
      raise exception using
        errcode = '23505',
        message = 'Already registered for this tournament';
    end if;

    select case
      when v_existing.registration_status = 'waitlisted'
        and v_existing.waitlist_offer_status is null then count(*)
      else null
    end
    into v_queue_position
    from public.registrations as candidate
    where candidate.tournament_bracket_id = p_tournament_bracket_id
      and candidate.registration_status = 'waitlisted'
      and candidate.waitlist_offer_status is null
      and (candidate.created_at, candidate.id)
        <= (v_existing.created_at, v_existing.id);

    return query select
      v_fixture.approved_alias,
      v_player.id,
      v_existing.id,
      v_existing.registration_status,
      v_queue_position,
      false,
      v_fixture.synthetic_elo,
      v_fixture.synthetic_division,
      v_fixture.provenance,
      v_fixture.contract_version,
      false;
    return;
  end if;

  select
    tournament.title,
    tournament.status,
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_tournament_title,
    v_tournament_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_bracket_name,
    v_bracket_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
    and tournament.id = p_tournament_id
  for update of bracket;

  if not found then
    raise exception 'Tournament registration is not available';
  end if;

  v_checked_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status is null
    or v_tournament_status not in ('registration_open', 'in_progress')
    or v_bracket_launched_at is not null
    or (
      v_registration_open_at is not null
      and v_checked_at < v_registration_open_at
    )
    or (
      v_registration_close_at is not null
      and v_checked_at > v_registration_close_at
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
    or v_fixture.synthetic_division is distinct from v_expected_division then
    raise exception
      'Synthetic ELO does not match the selected tournament division';
  end if;

  perform public.reconcile_tournament_waitlist(p_tournament_bracket_id);

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where candidate.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status = 'offered'
    )::integer,
    count(*) filter (
      where candidate.registration_status = 'waitlisted'
        and candidate.waitlist_offer_status is null
    )::integer
  into v_active_count, v_offered_count, v_waiting_count
  from public.registrations as candidate
  where candidate.tournament_bracket_id = p_tournament_bracket_id;

  v_requires_waitlist :=
    v_active_count + v_offered_count >= v_required_count
    or v_waiting_count > 0;

  if v_requires_waitlist
    and coalesce(p_waitlist_confirmed, false) is false then
    return query select
      v_fixture.approved_alias,
      v_player.id,
      null::uuid,
      null::text,
      null::bigint,
      true,
      v_fixture.synthetic_elo,
      v_fixture.synthetic_division,
      v_fixture.provenance,
      v_fixture.contract_version,
      false;
    return;
  end if;

  perform set_config(
    'ironclad.waitlist_confirmed',
    case when coalesce(p_waitlist_confirmed, false) then 'on' else 'off' end,
    true
  );
  perform set_config(
    'ironclad.staging_synthetic_uat_enrolling',
    'on',
    true
  );

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
    elo_calculation_version,
    registration_provenance,
    fixture_contract_version
  ) values (
    v_player.id,
    v_player.clerk_user_id,
    v_player.in_game_name,
    null,
    null,
    null,
    v_player.country,
    v_player.region,
    v_player.timezone,
    v_fixture.synthetic_elo,
    v_tournament_title,
    v_bracket_name || ' Bracket',
    case when v_requires_waitlist then 'waitlisted' else 'pending' end,
    'manual_review',
    '',
    p_tournament_id,
    p_tournament_bracket_id,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'staging_synthetic_uat',
    'staging-synthetic-v1'
  )
  returning inserted.id, inserted.registration_status
  into v_registration_id, v_registration_status;

  insert into ironclad_private.staging_synthetic_uat_enrolments (
    registration_id,
    player_id,
    tournament_id,
    tournament_bracket_id,
    synthetic_elo,
    synthetic_division
  ) values (
    v_registration_id,
    v_player.id,
    p_tournament_id,
    p_tournament_bracket_id,
    v_fixture.synthetic_elo,
    v_fixture.synthetic_division
  );

  if v_registration_status = 'waitlisted' then
    select count(*)
    into v_queue_position
    from public.registrations as candidate
    join public.registrations as inserted
      on inserted.id = v_registration_id
    where candidate.tournament_bracket_id = p_tournament_bracket_id
      and candidate.registration_status = 'waitlisted'
      and candidate.waitlist_offer_status is null
      and (candidate.created_at, candidate.id)
        <= (inserted.created_at, inserted.id);
  end if;

  return query select
    v_fixture.approved_alias,
    v_player.id,
    v_registration_id,
    v_registration_status,
    v_queue_position,
    false,
    v_fixture.synthetic_elo,
    v_fixture.synthetic_division,
    v_fixture.provenance,
    v_fixture.contract_version,
    true;
end;
$$;

alter function public.enrol_staging_synthetic_uat_player(
  text,
  text,
  uuid,
  uuid,
  boolean
) owner to postgres;
revoke all on function public.enrol_staging_synthetic_uat_player(
  text,
  text,
  uuid,
  uuid,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.enrol_staging_synthetic_uat_player(
  text,
  text,
  uuid,
  uuid,
  boolean
) to service_role;

create function public.cleanup_staging_synthetic_uat_enrolment(
  p_fixture_secret text,
  p_alias text,
  p_tournament_id uuid
)
returns table (
  alias text,
  player_id uuid,
  registration_id uuid,
  deleted boolean,
  promoted_registration_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_registration public.registrations%rowtype;
  v_bracket_launched_at timestamptz;
  v_tournament_status text;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = p_alias
  for update;

  if not found then
    raise exception 'Synthetic fixture player is unavailable'
      using errcode = 'P0002';
  end if;

  select registration.*
  into v_registration
  from ironclad_private.staging_synthetic_uat_enrolments as enrolment
  join public.registrations as registration
    on registration.id = enrolment.registration_id
  where enrolment.player_id = v_fixture.player_id
    and enrolment.tournament_id = p_tournament_id
  for update of enrolment, registration;

  if not found then
    return query select
      v_fixture.approved_alias,
      v_fixture.player_id,
      null::uuid,
      false,
      null::uuid;
    return;
  end if;

  select bracket.launched_at, tournament.status
  into v_bracket_launched_at, v_tournament_status
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = v_registration.tournament_bracket_id
    and tournament.id = v_registration.tournament_id
  for update of bracket;

  if not found
    or v_bracket_launched_at is not null
    or v_tournament_status is null
    or v_tournament_status not in (
      'upcoming',
      'registration_open',
      'in_progress'
    )
    or exists (
      select 1
      from public.tournament_matches as match
      where match.player_one_registration_id = v_registration.id
        or match.player_two_registration_id = v_registration.id
        or match.winner_registration_id = v_registration.id
    )
    or exists (
      select 1
      from public.tournament_standings as standing
      where standing.registration_id = v_registration.id
    ) then
    raise exception 'Synthetic fixture enrolment has competition history'
      using errcode = '55000';
  end if;

  perform set_config(
    'ironclad.staging_synthetic_uat_cleanup',
    'on',
    true
  );

  delete from public.registrations as registration
  where registration.id = v_registration.id;

  perform public.reset_unlaunched_tournament_bracket_draft(
    v_registration.tournament_bracket_id
  );
  perform public.reconcile_tournament_waitlist(
    v_registration.tournament_bracket_id
  );

  return query select
    v_fixture.approved_alias,
    v_fixture.player_id,
    v_registration.id,
    true,
    null::uuid;
end;
$$;

alter function public.cleanup_staging_synthetic_uat_enrolment(
  text,
  text,
  uuid
) owner to postgres;
revoke all on function public.cleanup_staging_synthetic_uat_enrolment(
  text,
  text,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cleanup_staging_synthetic_uat_enrolment(
  text,
  text,
  uuid
) to service_role;

comment on function public.provision_staging_synthetic_uat_player(
  text,
  text,
  text
) is
  'Service-role-only, Staging-ref-and-Vault-secret-gated provisioning of an approved Clerk Development post-provider fixture. Returns no Clerk identity or credential.';
comment on function public.inspect_staging_synthetic_uat_player(text, text) is
  'Redacted inspection of one approved Staging fixture. Service-role, exact project, and Vault secret are required.';
comment on function public.enrol_staging_synthetic_uat_player(
  text,
  text,
  uuid,
  uuid,
  boolean
) is
  'Creates one capacity-safe Staging fixture registration with private synthetic evidence and no provider or linked-Steam legal claim.';
comment on function public.cleanup_staging_synthetic_uat_enrolment(
  text,
  text,
  uuid
) is
  'Deletes only an unlaunched, history-free synthetic fixture enrolment and preserves the reusable player.';

commit;
