-- Normal synthetic registration records in-app consent and separate synthetic
-- provenance without claiming Steam or Relic provider authority. Validate both
-- at commit, preserving the evidence-only contract of the guarded fixture CLI.
begin;

create or replace function public.require_registration_acceptance_on_commit()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog
as $function$
declare
  v_has_canonical_acceptance boolean;
  v_has_fixture_evidence boolean;
  v_model text;
  v_expected_contract text;
begin
  if not exists (
    select 1 from public.registrations as registration
    where registration.id = new.id
  ) then
    if exists (
      select 1 from public.registration_acceptances as acceptance
      where acceptance.registration_id = new.id
    ) or exists (
      select 1 from ironclad_private.staging_synthetic_uat_enrolments as fixture
      where fixture.registration_id = new.id
    ) then
      raise exception
        'Registration evidence cannot outlive a registration created in the same transaction'
        using errcode = '23514';
    end if;
    return null;
  end if;

  select exists (
    select 1 from public.registration_acceptances as acceptance
    where acceptance.registration_id = new.id
      and acceptance.clerk_user_id = new.clerk_user_id
      and acceptance.tournament_id = new.tournament_id
      and acceptance.accepted_at >= new.created_at
  ) into v_has_canonical_acceptance;

  select exists (
    select 1 from ironclad_private.staging_synthetic_uat_enrolments as fixture
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

  if new.registration_provenance is null
    and new.fixture_contract_version is null then
    if not v_has_canonical_acceptance or v_has_fixture_evidence then
      raise exception 'Canonical registration requires atomic legal acceptance'
        using errcode = '23514';
    end if;
    return null;
  end if;

  select tournament.division_model_version into v_model
  from public.tournaments as tournament where tournament.id = new.tournament_id;
  v_expected_contract := case v_model
    when 'legacy_three_v1' then 'staging-synthetic-v1'
    when 'four_division_v1' then 'staging-synthetic-v2'
  end;
  if new.registration_provenance is distinct from 'staging_synthetic_uat'
    or v_expected_contract is null
    or new.fixture_contract_version is distinct from v_expected_contract
    or not v_has_fixture_evidence then
    raise exception 'Synthetic fixture evidence is invalid'
      using errcode = '23514';
  end if;

  -- Registration guards separately validate the exact prepared rating.
  if new.elo_verification_source = 'relic' then
    if not v_has_canonical_acceptance
      or new.elo_calculation_version is distinct from v_expected_contract
      or exists (
        select 1 from public.registration_acceptances as acceptance
        where acceptance.registration_id = new.id
          and acceptance.linked_steam_account_confirmed is distinct from false
      ) then
      raise exception 'Synthetic verified registration requires atomic consent and provenance'
        using errcode = '23514';
    end if;
  elsif new.elo_verification_source is null then
    -- CLI enrolment records synthetic participation, never user consent.
    if v_has_canonical_acceptance then
      raise exception 'Synthetic fixture CLI cannot assert canonical acceptance'
        using errcode = '23514';
    end if;
  else
    raise exception 'Synthetic fixture verification source is invalid'
      using errcode = '23514';
  end if;
  return null;
end;
$function$;
alter function public.require_registration_acceptance_on_commit() owner to postgres;
revoke all on function public.require_registration_acceptance_on_commit()
  from public, anon, authenticated, service_role;

commit;
