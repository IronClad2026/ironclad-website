begin;

create table ironclad_private.staging_badge_cross_division_enrolments (
  registration_id uuid primary key
    references public.registrations(id) on delete cascade,
  player_id uuid not null
    references ironclad_private.staging_synthetic_uat_players(player_id)
    on delete cascade,
  tournament_id uuid not null
    references public.tournaments(id) on delete cascade,
  tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  synthetic_elo integer not null,
  synthetic_division text not null,
  scenario_key text not null default 'badge-05-28-cross-division'
    check (scenario_key = 'badge-05-28-cross-division'),
  contract_version text not null default 'staging-badge-cross-division-v1'
    check (contract_version = 'staging-badge-cross-division-v1'),
  steam_openid_verified boolean not null default false
    check (not steam_openid_verified),
  steam_ownership_verified boolean not null default false
    check (not steam_ownership_verified),
  relic_live_lookup_verified boolean not null default false
    check (not relic_live_lookup_verified),
  linked_steam_legal_confirmation boolean not null default false
    check (not linked_steam_legal_confirmation),
  created_at timestamptz not null default clock_timestamp(),
  unique (player_id, synthetic_division),
  check (
    (synthetic_division = 'Challenge' and synthetic_elo = 1100)
    or (synthetic_division = 'Main / Pro' and synthetic_elo = 1400)
  )
);

comment on table
  ironclad_private.staging_badge_cross_division_enrolments is
  'Private, exact TestAcademy1 acceptance provenance for one synthetic Challenge snapshot and one synthetic Main snapshot. It never represents provider verification.';

alter table ironclad_private.staging_badge_cross_division_enrolments
  enable row level security;
alter table ironclad_private.staging_badge_cross_division_enrolments
  force row level security;

revoke all on table
  ironclad_private.staging_badge_cross_division_enrolments
  from public, anon, authenticated, service_role;

create function ironclad_private.staging_badge_cross_division_definition(
  p_bracket_name text
)
returns table (
  synthetic_elo integer,
  synthetic_division text
)
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select definition.synthetic_elo, definition.synthetic_division
  from (
    values
      ('Challenge'::text, 1100, 'Challenge'::text),
      ('Main'::text, 1400, 'Main / Pro'::text)
  ) as definition(bracket_name, synthetic_elo, synthetic_division)
  where definition.bracket_name = p_bracket_name;
$$;

alter function
  ironclad_private.staging_badge_cross_division_definition(text)
  owner to postgres;
revoke all on function
  ironclad_private.staging_badge_cross_division_definition(text)
  from public, anon, authenticated, service_role;

create function
  ironclad_private.guard_staging_badge_cross_division_enrolment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_enrolling boolean :=
    coalesce(
      current_setting(
        'ironclad.staging_badge_cross_division_enrolling',
        true
      ),
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

    raise exception 'Badge acceptance enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' or not v_enrolling then
    raise exception 'Badge acceptance enrolment evidence is immutable'
      using errcode = '55000';
  end if;

  if new.scenario_key is distinct from 'badge-05-28-cross-division'
    or new.contract_version is distinct from
      'staging-badge-cross-division-v1'
    or new.steam_openid_verified is distinct from false
    or new.steam_ownership_verified is distinct from false
    or new.relic_live_lookup_verified is distinct from false
    or new.linked_steam_legal_confirmation is distinct from false
    or not exists (
      select 1
      from ironclad_private.staging_synthetic_uat_players as fixture
      join public.players as player on player.id = fixture.player_id
      join public.registrations as registration
        on registration.id = new.registration_id
      join public.tournament_brackets as bracket
        on bracket.id = new.tournament_bracket_id
      join ironclad_private.staging_badge_cross_division_definition(
        bracket.name
      ) as definition
        on definition.synthetic_elo = new.synthetic_elo
        and definition.synthetic_division = new.synthetic_division
      where fixture.player_id = new.player_id
        and fixture.approved_alias = 'TestAcademy1'
        and fixture.synthetic_elo = 700
        and fixture.synthetic_division = 'Academy'
        and player.clerk_user_id = registration.clerk_user_id
        and registration.profile_id = new.player_id
        and registration.tournament_id = new.tournament_id
        and registration.tournament_bracket_id =
          new.tournament_bracket_id
        and bracket.tournament_id = new.tournament_id
        and registration.submitted_elo = new.synthetic_elo
        and registration.elo_status = 'manual_review'
        and registration.registration_provenance =
          'staging_synthetic_uat'
        and registration.fixture_contract_version =
          'staging-synthetic-v1'
        and registration.steam_name is null
        and registration.coh3_player_card_url is null
        and registration.elo_verified_elo is null
        and registration.elo_verification_source is null
        and registration.elo_verified_division is null
        and registration.elo_calculation_version is null
    ) then
    raise exception 'Badge acceptance enrolment evidence is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function
  ironclad_private.guard_staging_badge_cross_division_enrolment()
  owner to postgres;
revoke all on function
  ironclad_private.guard_staging_badge_cross_division_enrolment()
  from public, anon, authenticated, service_role;

create trigger staging_badge_cross_division_enrolments_guard_record
before insert or update or delete
on ironclad_private.staging_badge_cross_division_enrolments
for each row execute function
  ironclad_private.guard_staging_badge_cross_division_enrolment();

create or replace function
  ironclad_private.guard_staging_synthetic_uat_enrolment_record()
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
    or not (
      exists (
        select 1
        from ironclad_private.staging_synthetic_uat_players as fixture
        where fixture.player_id = new.player_id
          and fixture.synthetic_elo = new.synthetic_elo
          and fixture.synthetic_division = new.synthetic_division
          and fixture.provenance = new.provenance
          and fixture.contract_version = new.contract_version
      )
      or exists (
        select 1
        from ironclad_private.staging_badge_cross_division_enrolments
          as progression
        where progression.registration_id = new.registration_id
          and progression.player_id = new.player_id
          and progression.tournament_id = new.tournament_id
          and progression.tournament_bracket_id =
            new.tournament_bracket_id
          and progression.synthetic_elo = new.synthetic_elo
          and progression.synthetic_division = new.synthetic_division
          and progression.steam_openid_verified is false
          and progression.steam_ownership_verified is false
          and progression.relic_live_lookup_verified is false
          and progression.linked_steam_legal_confirmation is false
      )
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

create or replace function public.guard_staging_synthetic_uat_registration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fixture ironclad_private.staging_synthetic_uat_players%rowtype;
  v_expected_elo integer;
  v_expected_division text;
  v_bracket_name text;
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

  if not found then
    raise exception 'Synthetic fixture registration facts are invalid'
      using errcode = '23514';
  end if;

  select bracket.name
  into v_bracket_name
  from public.tournament_brackets as bracket
  where bracket.id = new.tournament_bracket_id;

  if not found then
    raise exception 'Synthetic fixture registration facts are invalid'
      using errcode = '23514';
  end if;

  select progression.synthetic_elo, progression.synthetic_division
  into v_expected_elo, v_expected_division
  from ironclad_private.staging_badge_cross_division_enrolments
    as progression
  where progression.registration_id = new.id;

  if not found
    and coalesce(
      current_setting(
        'ironclad.staging_badge_cross_division_enrolling',
        true
      ),
      ''
    ) = 'on'
    and v_fixture.approved_alias = 'TestAcademy1' then
    select definition.synthetic_elo, definition.synthetic_division
    into v_expected_elo, v_expected_division
    from ironclad_private.staging_badge_cross_division_definition(
      v_bracket_name
    ) as definition;
  end if;

  if v_expected_elo is null then
    v_expected_elo := v_fixture.synthetic_elo;
    v_expected_division := v_fixture.synthetic_division;
  end if;

  if new.registration_provenance is distinct from
      'staging_synthetic_uat'
    or new.fixture_contract_version is distinct from
      'staging-synthetic-v1'
    or new.submitted_elo is distinct from v_expected_elo
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
  v_fixture_alias text;
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
    select
      fixture.approved_alias,
      fixture.synthetic_elo,
      fixture.synthetic_division,
      bracket.name
    into
      v_fixture_alias,
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

    select progression.synthetic_elo, progression.synthetic_division
    into v_fixture_synthetic_elo, v_fixture_synthetic_division
    from ironclad_private.staging_badge_cross_division_enrolments
      as progression
    where progression.registration_id = new.id;

    if not found
      and coalesce(
        current_setting(
          'ironclad.staging_badge_cross_division_enrolling',
          true
        ),
        ''
      ) = 'on'
      and v_fixture_alias = 'TestAcademy1' then
      select definition.synthetic_elo, definition.synthetic_division
      into v_fixture_synthetic_elo, v_fixture_synthetic_division
      from ironclad_private.staging_badge_cross_division_definition(
        v_bracket_name
      ) as definition;
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

create function public.enrol_staging_badge_cross_division_acceptance(
  p_fixture_secret text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid
)
returns table (
  player_id uuid,
  registration_id uuid,
  registration_status text,
  synthetic_elo integer,
  synthetic_division text,
  scenario_key text,
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
  v_active_count integer;
  v_offered_count integer;
  v_waiting_count integer;
  v_synthetic_elo integer;
  v_synthetic_division text;
  v_registration_id uuid;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(
    p_fixture_secret
  );

  select fixture.*
  into v_fixture
  from ironclad_private.staging_synthetic_uat_players as fixture
  where fixture.approved_alias = 'TestAcademy1'
    and fixture.synthetic_elo = 700
    and fixture.synthetic_division = 'Academy'
  for update;

  if not found then
    raise exception 'Badge acceptance fixture is unavailable'
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
    raise exception 'Badge acceptance fixture is unavailable'
      using errcode = 'P0002';
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
    raise exception 'Badge acceptance tournament is unavailable';
  end if;

  select definition.synthetic_elo, definition.synthetic_division
  into v_synthetic_elo, v_synthetic_division
  from ironclad_private.staging_badge_cross_division_definition(
    v_bracket_name
  ) as definition;

  if not found then
    raise exception 'Badge acceptance bracket is not permitted'
      using errcode = '22023';
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
      or not exists (
        select 1
        from ironclad_private.staging_badge_cross_division_enrolments
          as progression
        where progression.registration_id = v_existing.id
          and progression.player_id = v_player.id
          and progression.synthetic_elo = v_synthetic_elo
          and progression.synthetic_division = v_synthetic_division
      ) then
      raise exception 'Already registered for this tournament'
        using errcode = '23505';
    end if;

    return query select
      v_player.id,
      v_existing.id,
      v_existing.registration_status,
      v_synthetic_elo,
      v_synthetic_division,
      'badge-05-28-cross-division'::text,
      false;
    return;
  end if;

  if v_registration_enabled is distinct from true
    or v_tournament_status is null
    or v_tournament_status not in ('registration_open', 'in_progress')
    or v_bracket_launched_at is not null
    or (
      v_registration_open_at is not null
      and clock_timestamp() < v_registration_open_at
    )
    or (
      v_registration_close_at is not null
      and clock_timestamp() > v_registration_close_at
    ) then
    raise exception 'Badge acceptance tournament is unavailable';
  end if;

  if exists (
    select 1
    from ironclad_private.staging_badge_cross_division_enrolments
      as progression
    where progression.player_id = v_player.id
      and progression.synthetic_division = v_synthetic_division
  ) then
    raise exception 'Badge acceptance division slot is already used'
      using errcode = '23505';
  end if;

  perform public.reconcile_tournament_waitlist(p_tournament_bracket_id);

  select
    count(*) filter (
      where registration.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    )::integer,
    count(*) filter (
      where registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
    )::integer,
    count(*) filter (
      where registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status is null
    )::integer
  into v_active_count, v_offered_count, v_waiting_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  if v_active_count + v_offered_count >= least(v_max_players, 8)
    or v_waiting_count > 0 then
    raise exception 'Badge acceptance bracket has no clean active slot'
      using errcode = '55000';
  end if;

  perform set_config('ironclad.waitlist_confirmed', 'off', true);
  perform set_config('ironclad.staging_synthetic_uat_enrolling', 'on', true);
  perform set_config(
    'ironclad.staging_badge_cross_division_enrolling',
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
    v_synthetic_elo,
    v_tournament_title,
    v_bracket_name || ' Bracket',
    'pending',
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
  ) returning inserted.id into v_registration_id;

  insert into ironclad_private.staging_badge_cross_division_enrolments (
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
    v_synthetic_elo,
    v_synthetic_division
  );

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
    v_synthetic_elo,
    v_synthetic_division
  );

  return query select
    v_player.id,
    v_registration_id,
    'pending'::text,
    v_synthetic_elo,
    v_synthetic_division,
    'badge-05-28-cross-division'::text,
    true;
end;
$$;

alter function public.enrol_staging_badge_cross_division_acceptance(
  text, uuid, uuid
) owner to postgres;
revoke all on function
  public.enrol_staging_badge_cross_division_acceptance(text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.enrol_staging_badge_cross_division_acceptance(text, uuid, uuid)
  to service_role;

comment on function
  public.enrol_staging_badge_cross_division_acceptance(text, uuid, uuid) is
  'Exact Staging-only Badge 5/28 enrollment for TestAcademy1: one synthetic manual-review Challenge snapshot and one Main snapshot, with no provider or authority claims.';

commit;
