begin;

-- Migration 20260831133000 extended synthetic registration eligibility for
-- TestAcademy1's tightly scoped cross-division acceptance path. Its lookup of
-- persisted cross-division evidence reused the base fixture variables, so a
-- normal synthetic registration with no progression row replaced valid base
-- ELO/division facts with null. Keep the two sources separate and only
-- override the base fixture facts when cross-division evidence is present or
-- the guarded cross-division enrolment is currently being created.
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
  v_progression_synthetic_elo integer;
  v_progression_synthetic_division text;
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
    into v_progression_synthetic_elo, v_progression_synthetic_division
    from ironclad_private.staging_badge_cross_division_enrolments
      as progression
    where progression.registration_id = new.id;

    if found then
      v_fixture_synthetic_elo := v_progression_synthetic_elo;
      v_fixture_synthetic_division := v_progression_synthetic_division;
    elsif coalesce(
      current_setting(
        'ironclad.staging_badge_cross_division_enrolling',
        true
      ),
      ''
    ) = 'on' and v_fixture_alias = 'TestAcademy1' then
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

commit;
