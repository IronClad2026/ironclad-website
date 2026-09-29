begin;

-- Immutable competition metadata distinguishes historical Main/Pro from future Main.
alter table public.tournaments add column division_model_version text not null default 'legacy_three_v1'
  constraint tournaments_division_model_version_check check (division_model_version in ('legacy_three_v1', 'four_division_v1'));
alter table public.tournaments alter column division_model_version set default 'four_division_v1';
alter table public.leaderboard_seasons add column official_bracket_type text not null default 'main'
  constraint leaderboard_seasons_official_bracket_type_check check (official_bracket_type in ('main','pro'));
alter table public.leaderboard_seasons alter column official_bracket_type set default 'pro';
alter table public.tournament_brackets drop constraint tournament_brackets_name_check;
alter table public.tournament_brackets add constraint tournament_brackets_name_check check (name in ('Academy','Challenge','Main','Pro'));
alter table public.players drop constraint players_relic_verified_division_check;
alter table public.players add constraint players_relic_verified_division_check check (relic_verified_division is null or relic_verified_division in ('Academy','Challenge','Main / Pro','Main','Pro'));
alter table public.registrations drop constraint registrations_elo_verified_division_check;
alter table public.registrations add constraint registrations_elo_verified_division_check check (elo_verified_division is null or elo_verified_division in ('Academy','Challenge','Main / Pro','Main','Pro'));

create function ironclad_private.division_accounting_type(p_model text, p_name text)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_model is null or p_model not in ('legacy_three_v1','four_division_v1') then raise exception 'Unknown tournament division model' using errcode='22023'; end if;
  if p_name='Academy' then return 'academy'; end if;
  if p_name='Challenge' then return 'challenge'; end if;
  if p_name='Main' then return case when p_model='legacy_three_v1' then 'main' else 'main_progression' end; end if;
  if p_name='Pro' and p_model='four_division_v1' then return 'pro'; end if;
  raise exception 'Division is invalid for the tournament model' using errcode='22023';
end; $$;
revoke all on function ironclad_private.division_accounting_type(text,text) from public,anon,authenticated,service_role;
create function ironclad_private.division_verified_label(p_model text,p_name text)
returns text language sql immutable set search_path=pg_catalog as $$
 select case ironclad_private.division_accounting_type(p_model,p_name)
 when 'main' then 'Main / Pro' when 'main_progression' then 'Main' when 'pro' then 'Pro' when 'academy' then 'Academy' when 'challenge' then 'Challenge' end;
$$;
revoke all on function ironclad_private.division_verified_label(text,text) from public,anon,authenticated,service_role;
create function ironclad_private.division_for_elo(p_model text,p_elo bigint)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_model is null or p_model not in ('legacy_three_v1','four_division_v1') or p_elo is null or p_elo<0 or p_elo>9007199254740991 then raise exception 'Invalid ELO classification' using errcode='22023'; end if;
  return case when p_elo<1100 then 'Academy' when p_elo<1400 then 'Challenge' when p_model='legacy_three_v1' then 'Main / Pro' when p_elo<1700 then 'Main' else 'Pro' end;
end; $$;
revoke all on function ironclad_private.division_for_elo(text,bigint) from public,anon,authenticated,service_role;
create function ironclad_private.elo_calculation_model(p_version text)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_version in ('relic-highest-1v1-v1','phase4-staging-fixture-v1','staging-synthetic-academy-v1','staging-synthetic-v1') then return 'legacy_three_v1'; end if;
  if p_version in ('relic-highest-1v1-v2','staging-synthetic-v2') then return 'four_division_v1'; end if;
  raise exception 'Unknown ELO calculation version' using errcode='22023';
end; $$;
revoke all on function ironclad_private.elo_calculation_model(text) from public,anon,authenticated,service_role;
create function ironclad_private.bracket_accounting_type(p_bracket_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select ironclad_private.division_accounting_type(t.division_model_version,b.name) from public.tournament_brackets b join public.tournaments t on t.id=b.tournament_id where b.id=p_bracket_id;
$$;
revoke all on function ironclad_private.bracket_accounting_type(uuid) from public,anon,authenticated,service_role;
create function ironclad_private.guard_competition_model_immutability()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if tg_table_name='tournaments' then if new.division_model_version is distinct from old.division_model_version then raise exception 'Tournament division model is immutable' using errcode='55000'; end if; end if;
  if tg_table_name='leaderboard_seasons' then if new.official_bracket_type is distinct from old.official_bracket_type then raise exception 'Official season authority is immutable' using errcode='55000'; end if; end if;
  return new;
end; $$;
revoke all on function ironclad_private.guard_competition_model_immutability() from public,anon,authenticated,service_role;
create trigger tournaments_immutable_division_model before update of division_model_version on public.tournaments for each row execute function ironclad_private.guard_competition_model_immutability();
create trigger leaderboard_seasons_immutable_official_authority before update of official_bracket_type on public.leaderboard_seasons for each row execute function ironclad_private.guard_competition_model_immutability();

-- Snapshot interpretation is versioned; historical V1 contracts remain valid.
alter table public.registrations drop constraint registrations_relic_snapshot_complete_check;
alter table public.registrations add constraint registrations_relic_snapshot_complete_check check (
 elo_verification_source is distinct from 'relic' or (
 elo_status='verified' and submitted_elo is not null and submitted_elo=elo_verified_elo and elo_verified_elo is not null
 and elo_highest_faction in ('US Forces','British Forces','Deutsches Afrikakorps','Wehrmacht')
 and elo_checked_mode='1v1' and elo_checked_at is not null
 and elo_calculation_version is not null
 and elo_verified_division=ironclad_private.division_for_elo(ironclad_private.elo_calculation_model(elo_calculation_version),elo_verified_elo)
 and elo_difference is null and elo_verification_error is null and elo_verification_payload is null
 and elo_verified_player_name is null and elo_identity_status is null and elo_identity_error is null));

-- Pure check helpers are callable by the trusted write role only.
grant execute on function ironclad_private.division_accounting_type(text,text), ironclad_private.division_verified_label(text,text), ironclad_private.division_for_elo(text,bigint), ironclad_private.elo_calculation_model(text) to service_role;

drop function public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb);

CREATE OR REPLACE FUNCTION public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb, p_division_model_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
  v_bracket_name text;
  v_cycle_key text;
  v_conflicting_tournament_title text;
  v_protected_bracket_name text;
  v_rule_format text;
  v_confirmation_window integer;
  v_model text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_tournament_id is null then
    v_model := p_division_model_version;
    if v_model is distinct from 'four_division_v1' and not (
      v_model='legacy_three_v1' and coalesce(auth.jwt()->>'ref','')='zzbnneprhjicmajpjkdg'
      and coalesce(current_setting('ironclad.staging_legacy_transition',true),'')='on'
    ) then raise exception 'New tournaments require the four-division model' using errcode='22023'; end if;
  else
    select division_model_version into v_model from public.tournaments where id=p_tournament_id for update;
    if not found then raise exception 'Tournament not found'; end if;
    if (p_division_model_version is not null and p_division_model_version is distinct from v_model)
      or (v_model='four_division_v1' and p_division_model_version is null) then
      raise exception 'Tournament model is immutable; reload the editor before saving' using errcode='22023';
    end if;
  end if;
  v_rule_format := coalesce(nullif(p_rule_format, ''), 'format_a');
  v_confirmation_window :=
    coalesce(p_result_confirmation_window_minutes, 30);

  if v_rule_format not in ('format_a', 'format_b') then
    raise exception 'Invalid tournament rule format';
  end if;

  if v_confirmation_window not in (
    1, 5, 15, 30, 60, 120, 360, 720, 1440
  ) then
    raise exception 'Invalid result confirmation window';
  end if;

  if p_registration_open_at is not null
    and p_registration_close_at is not null
    and p_registration_open_at >= p_registration_close_at then
    raise exception 'Registration open date must be before close date';
  end if;

  if p_registration_close_at is not null
    and p_start_date is not null
    and p_registration_close_at > p_start_date then
    raise exception 'Registration must close before the tournament starts';
  end if;

  if p_end_date is not null
    and p_start_date is not null
    and p_end_date < p_start_date then
    raise exception 'Tournament end date must be after the start date';
  end if;

  if p_brackets is null
    or pg_catalog.jsonb_typeof(p_brackets) <> 'array'
    or pg_catalog.jsonb_array_length(p_brackets) = 0 then
    raise exception 'At least one bracket is required';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    where pg_catalog.jsonb_typeof(requested.value) <> 'object'
      or requested.value ->> 'name' is null
      or requested.value ->> 'name' not in ('Academy', 'Challenge', 'Main', 'Pro')
      or (v_model='legacy_three_v1' and requested.value ->> 'name'='Pro')
  ) or (
    select count(*)
    from pg_catalog.jsonb_array_elements(p_brackets)
  ) <> (
    select count(distinct requested.value ->> 'name')
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
  ) then
    raise exception 'Tournament divisions must be unique canonical divisions';
  end if;

  if p_tournament_id is not null then
    select tournament.id
    into v_tournament_id
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for update;

    if not found then
      raise exception 'Tournament not found';
    end if;
  end if;

  -- Lock every occupied rating band in one global order. The historical
  -- top tier overlaps both future upper divisions; those future divisions
  -- remain independent of one another.
  for v_cycle_key in
    select distinct cycle.key
    from pg_catalog.jsonb_array_elements(p_brackets) requested(value)
    cross join lateral unnest(ironclad_private.division_cycle_keys(v_model,requested.value->>'name')) cycle(key)
    order by cycle.key
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:ranked-division-cycle:'||v_cycle_key,0));
  end loop;
  for v_bracket_name in
    select requested.value ->> 'name'
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    order by requested.value ->> 'name'
  loop
    select tournament.title
    into v_conflicting_tournament_title
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where ironclad_private.division_cycle_keys(tournament.division_model_version,bracket.name)
      && ironclad_private.division_cycle_keys(v_model,v_bracket_name)
      and (
        p_tournament_id is null
        or tournament.id <> p_tournament_id
      )
      and coalesce(tournament.status, '') not in (
        'completed', 'cancelled', 'voided'
      )
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = bracket.id
      )
      and (
        bracket.launched_at is null
        or not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
            and public.is_generated_bracket_complete(generated.id)
              is distinct from true
        )
      )
    order by tournament.created_at, tournament.id
    limit 1;

    if v_conflicting_tournament_title is not null then
      raise exception
        'The % Division already has an unresolved ranked cycle in event %. Resolve that Division before enabling another.',
        v_bracket_name,
        v_conflicting_tournament_title
        using errcode = '55000';
    end if;
  end loop;

  if p_tournament_id is not null then
    select bracket.name
    into v_protected_bracket_name
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.name not in (
        select requested.value ->> 'name'
        from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
      )
      and (
        exists (
          select 1
          from public.tournament_division_not_held_closures as closure
          where closure.tournament_bracket_id = bracket.id
        )
        or exists (
          select 1
          from public.registrations as registration
          where registration.tournament_bracket_id = bracket.id
            and registration.registration_status = 'approved'
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
      )
    order by bracket.name
    limit 1;

    if v_protected_bracket_name is not null then
      raise exception
        'Cannot remove the % bracket during a normal tournament edit because it has protected registration or competition history.',
        v_protected_bracket_name;
    end if;
  end if;

  if p_tournament_id is null then
    insert into public.tournaments (
      title, slug, description, banner_image_url,
      registration_open_at, registration_close_at,
      start_date, end_date, status, format, prize_pool,
      rules_url, battlefy_url, registration_enabled,
      grand_final_at, rule_format,
      result_confirmation_window_minutes, division_model_version
    )
    values (
      p_title, p_slug, p_description, p_banner_image_url,
      p_registration_open_at, p_registration_close_at,
      p_start_date, p_end_date, p_status, p_format,
      coalesce(p_prize_pool, ''), nullif(p_rules_url, ''),
      nullif(p_battlefy_url, ''), p_registration_enabled, null,
      v_rule_format, v_confirmation_window, v_model
    )
    returning id into v_tournament_id;
  else
    update public.tournaments
    set
      title = p_title,
      slug = p_slug,
      description = p_description,
      banner_image_url = p_banner_image_url,
      registration_open_at = p_registration_open_at,
      registration_close_at = p_registration_close_at,
      start_date = coalesce(p_start_date, start_date),
      end_date = coalesce(p_end_date, end_date),
      status = p_status,
      format = p_format,
      prize_pool = coalesce(p_prize_pool, ''),
      rules_url = nullif(p_rules_url, ''),
      battlefy_url = nullif(p_battlefy_url, ''),
      registration_enabled = p_registration_enabled,
      rule_format = v_rule_format,
      result_confirmation_window_minutes = v_confirmation_window
    where id = p_tournament_id
    returning id into v_tournament_id;
  end if;

  for v_bracket in
    select requested.value
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
  loop
    insert into public.tournament_brackets (
      tournament_id, name, elo_rules, max_players
    )
    values (
      v_tournament_id,
      v_bracket ->> 'name',
      v_bracket ->> 'elo_rules',
      (v_bracket ->> 'max_players')::integer
    )
    on conflict (tournament_id, name)
    do update set
      elo_rules = excluded.elo_rules,
      max_players = excluded.max_players;
  end loop;

  delete from public.tournament_brackets
  where tournament_id = v_tournament_id
    and name not in (
      select requested.value ->> 'name'
      from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    );

  -- Re-run the existing lifecycle derivation now that the Division rows exist.
  -- Assigning status to itself deliberately invokes the existing trigger; it
  -- does not introduce another registration-enabled writer.
  update public.tournaments as tournament
  set status = tournament.status
  where tournament.id = v_tournament_id;

  return v_tournament_id;
end;
$function$;

alter function public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb, p_division_model_version text) owner to postgres;
revoke all on function public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb, p_division_model_version text) from public, anon, authenticated, service_role;

grant execute on function public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb, p_division_model_version text) to service_role;

CREATE OR REPLACE FUNCTION public.validate_tournament_bracket_elo_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_model text;
  v_expected text;
begin
  select division_model_version into v_model from public.tournaments where id=new.tournament_id;
  perform ironclad_private.division_accounting_type(v_model,new.name);
  v_expected := case new.name when 'Academy' then '0-1099 ELO' when 'Challenge' then '1100-1399 ELO' when 'Main' then case when v_model='legacy_three_v1' then '1400+ ELO' else '1400-1699 ELO' end when 'Pro' then '1700+ ELO' end;
  if v_model='four_division_v1' and (new.max_players<>8 or
    regexp_replace(new.elo_rules,'[[:space:]]','','g') is distinct from regexp_replace(v_expected,'[[:space:]]','','g')) then
    raise exception 'Future division ELO rules and capacity are fixed' using errcode='23514';
  end if;
  if public.is_elo_eligible(0, new.elo_rules) is null then
    raise exception
      'Invalid ELO rule configuration for the % Bracket: %',
      new.name,
      new.elo_rules;
  end if;

  return new;
end;
$function$;

alter function public.validate_tournament_bracket_elo_rules() owner to postgres;
revoke all on function public.validate_tournament_bracket_elo_rules() from public, anon, authenticated, service_role;

grant execute on function public.validate_tournament_bracket_elo_rules() to service_role;

drop trigger tournament_brackets_validate_elo_rules on public.tournament_brackets;
create trigger tournament_brackets_validate_elo_rules before insert or update of elo_rules,name,tournament_id,max_players on public.tournament_brackets for each row execute function public.validate_tournament_bracket_elo_rules();

CREATE OR REPLACE FUNCTION public.save_relic_profile_elo_snapshot(p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_claimed_at timestamp with time zone, p_relic_elo integer, p_relic_faction text, p_relic_division text, p_relic_calculation_version text)
 RETURNS TABLE(current_elo integer, relic_verified_elo bigint, relic_verified_faction text, relic_verified_division text, relic_elo_calculation_version text, relic_elo_verified_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_calculation_version text;
  v_expected_division text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  v_calculation_version := nullif(btrim(p_relic_calculation_version), '');

  if p_relic_elo is null
    or p_relic_elo < 0
    or p_relic_elo > 5000 then
    raise exception 'Profile verification data is invalid';
  end if;

  if p_relic_faction is null
    or p_relic_faction not in (
      'US Forces',
      'British Forces',
      'Deutsches Afrikakorps',
      'Wehrmacht'
    )
    or p_relic_division is null
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro', 'Main', 'Pro')
    or v_calculation_version not in ('relic-highest-1v1-v1','relic-highest-1v1-v2')
    or v_calculation_version is null then
    raise exception 'Profile verification data is invalid';
  end if;

  v_expected_division := ironclad_private.division_for_elo(ironclad_private.elo_calculation_model(v_calculation_version),p_relic_elo::bigint);

  if p_relic_division is distinct from v_expected_division then
    raise exception 'Profile verification data is invalid';
  end if;

  v_verified_at := clock_timestamp();

  return query
  update public.players as player
  set
    current_elo = p_relic_elo,
    relic_verified_elo = p_relic_elo,
    relic_verified_faction = p_relic_faction,
    relic_verified_division = p_relic_division,
    relic_elo_calculation_version = v_calculation_version,
    relic_elo_verified_at = v_verified_at
  where player.id = p_player_id
    and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null
    and player.steam_id64 = p_steam_id64
    and p_claimed_at is not null
    and player.relic_elo_last_attempt_at = p_claimed_at
  returning
    player.current_elo,
    player.relic_verified_elo,
    player.relic_verified_faction,
    player.relic_verified_division,
    player.relic_elo_calculation_version,
    player.relic_elo_verified_at;
end;
$function$;

alter function public.save_relic_profile_elo_snapshot(p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_claimed_at timestamp with time zone, p_relic_elo integer, p_relic_faction text, p_relic_division text, p_relic_calculation_version text) owner to postgres;
revoke all on function public.save_relic_profile_elo_snapshot(p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_claimed_at timestamp with time zone, p_relic_elo integer, p_relic_faction text, p_relic_division text, p_relic_calculation_version text) from public, anon, authenticated, service_role;

grant execute on function public.save_relic_profile_elo_snapshot(p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_claimed_at timestamp with time zone, p_relic_elo integer, p_relic_faction text, p_relic_division text, p_relic_calculation_version text) to service_role;

CREATE OR REPLACE FUNCTION public.preserve_tournament_bracket_roster_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_approved_count integer;
  v_reserved_count integer;
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
      and registration.registration_status not in ('rejected', 'withdrawn')
      and not (
        registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status in (
          'declined',
          'expired',
          'cancelled'
        )
      )
      and case
        when registration.elo_verification_source = 'relic' then
          registration.elo_verified_division = ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=old.tournament_id),old.name)
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
        'Cannot change ELO rules for the % Bracket to "%": existing active player % (ELO %) would become ineligible.',
        old.name,
        new.elo_rules,
        v_ineligible_player,
        coalesce(v_ineligible_elo::text, 'unavailable');
    end if;
  end if;

  if new.max_players is distinct from old.max_players then
    select
      count(*) filter (
        where registration.registration_status = 'approved'
      )::integer,
      count(*) filter (
        where registration.registration_status in (
          'pending',
          'manual_review',
          'approved'
        )
          or (
            registration.registration_status = 'waitlisted'
            and registration.waitlist_offer_status = 'offered'
          )
      )::integer
    into v_approved_count, v_reserved_count
    from public.registrations as registration
    where registration.tournament_bracket_id = old.id;

    if new.max_players < v_reserved_count then
      raise exception
        'Cannot reduce the % Bracket capacity to % because it currently has % active or offered registrations (% approved).',
        old.name,
        new.max_players,
        v_reserved_count,
        v_approved_count;
    end if;
  end if;

  return new;
end;
$function$;

alter function public.preserve_tournament_bracket_roster_invariants() owner to postgres;
revoke all on function public.preserve_tournament_bracket_roster_invariants() from public, anon, authenticated, service_role;

grant execute on function public.preserve_tournament_bracket_roster_invariants() to service_role;

CREATE OR REPLACE FUNCTION public.close_tournament_division_without_launch(p_tournament_bracket_id uuid, p_reason_code text, p_detail text, p_actor_clerk_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tournament_id uuid;
  v_tournament_title text;
  v_tournament_status text;
  v_tournament_terminal_at timestamptz;
  v_bracket_name text;
  v_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_approved_count integer;
  v_unresolved_count integer;
  v_active_count integer;
  v_waitlist_count integer;
  v_is_ready boolean;
  v_closed_at timestamptz;
  v_reason_code text := pg_catalog.lower(
    coalesce(pg_catalog.btrim(p_reason_code), '')
  );
  v_detail text := nullif(pg_catalog.btrim(p_detail), '');
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_existing public.tournament_division_not_held_closures%rowtype;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not Held closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if p_tournament_bracket_id is null then
    raise exception 'Tournament Division is required'
      using errcode = '22023';
  end if;
  if v_reason_code <> 'minimum_roster_not_reached' then
    raise exception 'Minimum roster requirement not reached is the only supported Not Held reason'
      using errcode = '22023';
  end if;
  if v_detail is not null and pg_catalog.char_length(v_detail) > 500 then
    raise exception 'Not Held detail must be at most 500 characters'
      using errcode = '22023';
  end if;
  if v_actor is null or pg_catalog.char_length(v_actor) > 256 then
    raise exception 'Closing administrator is required'
      using errcode = '22023';
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id;

  if not found then
    raise exception 'Tournament Division not found'
      using errcode = 'P0002';
  end if;

  select tournament.title, tournament.status, tournament.terminal_at
  into v_tournament_title, v_tournament_status, v_tournament_terminal_at
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found'
      using errcode = 'P0002';
  end if;

  select bracket.name, bracket.launched_at, bracket.max_players
  into v_bracket_name, v_launched_at, v_max_players
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
    and bracket.tournament_id = v_tournament_id
  for update;

  if not found then
    raise exception 'Tournament Division not found'
      using errcode = 'P0002';
  end if;

  select closure.*
  into v_existing
  from public.tournament_division_not_held_closures as closure
  where closure.tournament_bracket_id = p_tournament_bracket_id;

  if found then
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      tournament_id,
      tournament_title,
      registration_id,
      event_key,
      metadata
    )
    select
      registration.clerk_user_id,
      'player',
      'tournament.division_not_held',
      'Tournament Division Not Held',
      pg_catalog.format(
        'The %s Division of %s was not held because the minimum roster requirement was not reached. Your registration remains in the event history, but no competition points were awarded.',
        ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_tournament_id),v_bracket_name),
        v_tournament_title
      ),
      v_tournament_id,
      v_tournament_title,
      registration.id,
      pg_catalog.format(
        'division:%s:registration:%s:not-held',
        p_tournament_bracket_id,
        registration.id
      ),
      pg_catalog.jsonb_build_object(
        'registrationId', registration.id,
        'tournamentId', v_tournament_id,
        'bracketId', p_tournament_bracket_id,
        'bracketName', ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_tournament_id),v_bracket_name),
        'reasonCode', v_existing.reason_code,
        'notHeldAt', v_existing.closed_at
      )
    from public.registrations as registration
    where registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status in (
        'pending', 'manual_review', 'approved', 'waitlisted'
      )
    on conflict (recipient_clerk_user_id, event_key)
      where event_key is not null
      do nothing;

    return pg_catalog.jsonb_build_object(
      'tournamentId', v_tournament_id,
      'tournamentBracketId', p_tournament_bracket_id,
      'notHeldAt', v_existing.closed_at,
      'reasonCode', v_existing.reason_code,
      'activeRegistrationCount', v_existing.active_registration_count,
      'waitlistRegistrationCount', v_existing.waitlist_registration_count,
      'alreadyNotHeld', true
    );
  end if;

  if v_tournament_status not in (
    'upcoming', 'registration_open', 'in_progress'
  ) or v_tournament_terminal_at is not null then
    raise exception 'A terminal Tournament cannot mark a Division Not Held'
      using errcode = '55000';
  end if;
  if v_launched_at is not null then
    raise exception 'A launched Division cannot be marked Not Held'
      using errcode = '55000';
  end if;

  perform registration.id
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id
  order by registration.id
  for update;

  select
    count(*) filter (
      where registration.registration_status in (
        'pending', 'manual_review', 'approved'
      )
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer,
    count(*) filter (
      where registration.registration_status = 'waitlisted'
    )::integer,
    count(*) filter (
      where registration.registration_status = 'approved'
    )::integer,
    count(*) filter (
      where registration.registration_status in ('pending', 'manual_review')
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer
  into
    v_active_count,
    v_waitlist_count,
    v_approved_count,
    v_unresolved_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  v_required_count := least(v_max_players, 8);
  v_is_ready :=
    v_approved_count = v_required_count
    and v_unresolved_count = 0;

  if v_is_ready or v_active_count >= v_required_count then
    raise exception 'A ready Division cannot use the minimum-roster Not Held reason'
      using errcode = '55000';
  end if;

  perform generated.id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id
  order by generated.id
  for update;

  perform match.id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  where generated.tournament_bracket_id = p_tournament_bracket_id
  order by match.id
  for update of match;

  if not public.is_tournament_bracket_regeneration_safe(
    p_tournament_bracket_id
  )
    or exists (
      select 1
      from public.match_replay_upload_attempts as replay_attempt
      join public.tournament_matches as match
        on match.id = replay_attempt.match_id
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      where generated.tournament_bracket_id = p_tournament_bracket_id
    )
    or exists (
      select 1
      from public.match_dice_rolls as dice_roll
      join public.tournament_matches as match
        on match.id = dice_roll.match_id
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      where generated.tournament_bracket_id = p_tournament_bracket_id
    )
    or exists (
      select 1
      from public.match_participant_outcome_authority as authority
      where authority.match_id in (
        select match.id
        from public.tournament_matches as match
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        where generated.tournament_bracket_id = p_tournament_bracket_id
      )
    )
    or exists (
      select 1
      from public.match_game_result_authority as authority
      where authority.match_id in (
        select match.id
        from public.tournament_matches as match
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        where generated.tournament_bracket_id = p_tournament_bracket_id
      )
    )
    or exists (
      select 1
      from public.tournament_championship_path_authority as authority
      where authority.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id = p_tournament_bracket_id
      )
    )
    or exists (
      select 1
      from public.tournament_championship_path_summary_authority as summary
      where summary.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id = p_tournament_bracket_id
      )
    )
    or exists (
      select 1
      from public.leaderboard_division_settlements as settlement
      where settlement.tournament_bracket_id = p_tournament_bracket_id
    )
    or exists (
      select 1
      from public.leaderboard_point_events as event
      where event.tournament_bracket_id = p_tournament_bracket_id
        or event.registration_id in (
          select registration.id
          from public.registrations as registration
          where registration.tournament_bracket_id = p_tournament_bracket_id
        )
    )
    or (
      ironclad_private.bracket_accounting_type(p_tournament_bracket_id) in ('main','pro')
      and exists (
        select 1
        from public.leaderboard_tournament_season_memberships as membership
        where membership.tournament_id = v_tournament_id
      )
    )
    or exists (
      select 1
      from public.player_badge_awards as award
      where award.source_id in (
        select match.id
        from public.tournament_matches as match
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        where generated.tournament_bracket_id = p_tournament_bracket_id
      )
        or award.source_metadata ->> 'tournamentBracketId' =
          p_tournament_bracket_id::text
        or award.source_metadata ->> 'tournament_bracket_id' =
          p_tournament_bracket_id::text
        or (
          award.player_id in (
            select registration.profile_id
            from public.registrations as registration
            where registration.tournament_bracket_id =
              p_tournament_bracket_id
              and registration.profile_id is not null
          )
          and (
            award.source_id = v_tournament_id
            or award.source_metadata ->> 'tournamentId' =
              v_tournament_id::text
            or award.source_metadata ->> 'tournament_id' =
              v_tournament_id::text
          )
        )
    ) then
    raise exception 'Competitive evidence prevents this Division from being marked Not Held'
      using errcode = '55000';
  end if;

  -- A generated row here can only be the existing proven-safe private draft.
  -- Reuse its established reset authority rather than creating a second
  -- cleanup path.
  perform public.reset_unlaunched_tournament_bracket_draft(
    p_tournament_bracket_id
  );

  v_closed_at := pg_catalog.clock_timestamp();
  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    'on',
    true
  );

  update public.registrations as registration
  set
    waitlist_offer_status = 'cancelled',
    waitlist_offer_resolved_at = v_closed_at
  where registration.tournament_bracket_id = p_tournament_bracket_id
    and registration.registration_status = 'waitlisted'
    and registration.waitlist_offer_status = 'offered';

  insert into public.tournament_division_not_held_closures (
    tournament_bracket_id,
    reason_code,
    detail,
    closed_at,
    closed_by_clerk_user_id,
    active_registration_count,
    waitlist_registration_count
  )
  values (
    p_tournament_bracket_id,
    v_reason_code,
    v_detail,
    v_closed_at,
    v_actor,
    v_active_count,
    v_waitlist_count
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    tournament_id,
    tournament_title,
    registration_id,
    event_key,
    metadata
  )
  select
    registration.clerk_user_id,
    'player',
    'tournament.division_not_held',
    'Tournament Division Not Held',
    pg_catalog.format(
      'The %s Division of %s was not held because the minimum roster requirement was not reached. Your registration remains in the event history, but no competition points were awarded.',
      ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_tournament_id),v_bracket_name),
      v_tournament_title
    ),
    v_tournament_id,
    v_tournament_title,
    registration.id,
    pg_catalog.format(
      'division:%s:registration:%s:not-held',
      p_tournament_bracket_id,
      registration.id
    ),
    pg_catalog.jsonb_build_object(
      'registrationId', registration.id,
      'tournamentId', v_tournament_id,
      'bracketId', p_tournament_bracket_id,
      'bracketName', ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_tournament_id),v_bracket_name),
      'reasonCode', v_reason_code,
      'notHeldAt', v_closed_at
    )
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id
    and registration.registration_status in (
      'pending', 'manual_review', 'approved', 'waitlisted'
    )
  on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null
    do nothing;

  return pg_catalog.jsonb_build_object(
    'tournamentId', v_tournament_id,
    'tournamentBracketId', p_tournament_bracket_id,
    'notHeldAt', v_closed_at,
    'reasonCode', v_reason_code,
    'activeRegistrationCount', v_active_count,
    'waitlistRegistrationCount', v_waitlist_count,
    'alreadyNotHeld', false
  );
end;
$function$;

alter function public.close_tournament_division_without_launch(p_tournament_bracket_id uuid, p_reason_code text, p_detail text, p_actor_clerk_user_id text) owner to postgres;
revoke all on function public.close_tournament_division_without_launch(p_tournament_bracket_id uuid, p_reason_code text, p_detail text, p_actor_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.close_tournament_division_without_launch(p_tournament_bracket_id uuid, p_reason_code text, p_detail text, p_actor_clerk_user_id text) to service_role;

CREATE OR REPLACE FUNCTION public.create_tournament_division_invitation(p_source_registration_id uuid, p_target_tournament_bracket_id uuid, p_actor_clerk_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_source_registration public.registrations%rowtype;
  v_recipient public.players%rowtype;
  v_source_bracket_name text;
  v_target_tournament_id uuid;
  v_target_tournament_title text;
  v_target_tournament_status text;
  v_target_terminal_at timestamptz;
  v_target_registration_enabled boolean;
  v_target_registration_open_at timestamptz;
  v_target_registration_close_at timestamptz;
  v_target_bracket_name text;
  v_target_launched_at timestamptz;
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_invitation_id uuid;
  v_created_at timestamptz;
  v_already_pending boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Division invitation creation requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if p_source_registration_id is null
    or p_target_tournament_bracket_id is null
    or v_actor is null
    or pg_catalog.char_length(v_actor) > 256 then
    raise exception 'Division invitation input is invalid'
      using errcode = '22023';
  end if;

  select registration.*
  into v_source_registration
  from public.registrations as registration
  where registration.id = p_source_registration_id
  for update;

  if not found
    or v_source_registration.profile_id is null
    or v_source_registration.tournament_bracket_id is null then
    raise exception 'Source registration is unavailable'
      using errcode = '55000';
  end if;

  if v_source_registration.registration_status not in (
    'pending', 'manual_review', 'approved', 'waitlisted'
  ) then
    raise exception 'Source registration is not invitation eligible'
      using errcode = '55000';
  end if;

  select player.*
  into v_recipient
  from public.players as player
  where player.id = v_source_registration.profile_id
  for update;

  if not found
    or v_recipient.account_closed_at is not null
    or v_recipient.clerk_user_id is distinct from
      v_source_registration.clerk_user_id
    or v_recipient.clerk_user_id like 'deleted:%' then
    raise exception 'Invitation recipient is unavailable'
      using errcode = '55000';
  end if;

  select source_bracket.name
  into v_source_bracket_name
  from public.tournament_brackets as source_bracket
  join public.tournament_division_not_held_closures as closure
    on closure.tournament_bracket_id = source_bracket.id
  where source_bracket.id = v_source_registration.tournament_bracket_id
  for update of source_bracket;

  if not found then
    raise exception 'Source registration must belong to a Not Held Division'
      using errcode = '55000';
  end if;

  select
    target_tournament.id,
    target_tournament.title,
    target_tournament.status,
    target_tournament.terminal_at,
    target_tournament.registration_enabled,
    target_tournament.registration_open_at,
    target_tournament.registration_close_at,
    target_bracket.name,
    target_bracket.launched_at
  into
    v_target_tournament_id,
    v_target_tournament_title,
    v_target_tournament_status,
    v_target_terminal_at,
    v_target_registration_enabled,
    v_target_registration_open_at,
    v_target_registration_close_at,
    v_target_bracket_name,
    v_target_launched_at
  from public.tournament_brackets as target_bracket
  join public.tournaments as target_tournament
    on target_tournament.id = target_bracket.tournament_id
  where target_bracket.id = p_target_tournament_bracket_id
  for update of target_tournament, target_bracket;

  if not found then
    raise exception 'Target Division is unavailable'
      using errcode = '55000';
  end if;

  if p_target_tournament_bracket_id =
      v_source_registration.tournament_bracket_id
    or ironclad_private.bracket_accounting_type(p_target_tournament_bracket_id)
      is distinct from ironclad_private.bracket_accounting_type(v_source_registration.tournament_bracket_id) then
    raise exception 'Invitation target must be an explicit matching Division'
      using errcode = '55000';
  end if;

  if v_target_tournament_status not in ('registration_open', 'in_progress')
    or v_target_terminal_at is not null
    or v_target_registration_enabled is distinct from true
    or v_target_launched_at is not null
    or (
      v_target_registration_open_at is not null
      and v_now < v_target_registration_open_at
    )
    or (
      v_target_registration_close_at is not null
      and v_now > v_target_registration_close_at
    )
    or exists (
      select 1
      from public.tournament_division_not_held_closures as closure
      where closure.tournament_bracket_id = p_target_tournament_bracket_id
    ) then
    raise exception 'Target Division is not accepting registration'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.registrations as registration
    where registration.tournament_id = v_target_tournament_id
      and (
        registration.profile_id = v_recipient.id
        or registration.clerk_user_id = v_recipient.clerk_user_id
      )
  ) then
    raise exception 'Player already has a registration in the target event'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.tournament_brackets as competing_bracket
    join public.tournaments as competing_tournament
      on competing_tournament.id = competing_bracket.tournament_id
    where ironclad_private.division_cycle_keys(competing_tournament.division_model_version,competing_bracket.name)
      && ironclad_private.division_cycle_keys((select division_model_version from public.tournaments where id=v_target_tournament_id),v_target_bracket_name)
      and competing_bracket.id <> p_target_tournament_bracket_id
      and competing_tournament.status not in ('completed', 'cancelled', 'voided')
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = competing_bracket.id
      )
      and (
        competing_bracket.launched_at is null
        or not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = competing_bracket.id
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = competing_bracket.id
            and public.is_generated_bracket_complete(generated.id)
              is distinct from true
        )
      )
  ) then
    raise exception 'The matching Division has another unresolved ranked cycle'
      using errcode = '55000';
  end if;

  insert into public.tournament_division_invitations as invitation (
    source_registration_id,
    source_tournament_bracket_id,
    target_tournament_bracket_id,
    recipient_player_id,
    created_by_clerk_user_id
  )
  values (
    v_source_registration.id,
    v_source_registration.tournament_bracket_id,
    p_target_tournament_bracket_id,
    v_recipient.id,
    v_actor
  )
  on conflict (recipient_player_id, target_tournament_bracket_id)
    where status = 'pending'
    do nothing
  returning invitation.id, invitation.created_at
  into v_invitation_id, v_created_at;

  if not found then
    select invitation.id, invitation.created_at
    into v_invitation_id, v_created_at
    from public.tournament_division_invitations as invitation
    where invitation.recipient_player_id = v_recipient.id
      and invitation.target_tournament_bracket_id =
        p_target_tournament_bracket_id
      and invitation.status = 'pending'
    for update;
    v_already_pending := true;
  end if;

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    actor_clerk_user_id,
    tournament_id,
    tournament_title,
    registration_id,
    event_key,
    metadata
  )
  values (
    v_recipient.clerk_user_id,
    'player',
    'tournament.division_invitation',
    'Tournament Division Invitation',
    pg_catalog.format(
      'You are invited to register for the %s Division of %s. Accepting opens the normal registration flow, where current eligibility and capacity are checked.',
      ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_target_tournament_id),v_target_bracket_name),
      v_target_tournament_title
    ),
    v_actor,
    v_target_tournament_id,
    v_target_tournament_title,
    v_source_registration.id,
    pg_catalog.format('division-invitation:%s', v_invitation_id),
    pg_catalog.jsonb_build_object(
      'invitationId', v_invitation_id,
      'sourceRegistrationId', v_source_registration.id,
      'sourceBracketId', v_source_registration.tournament_bracket_id,
      'targetBracketId', p_target_tournament_bracket_id,
      'targetTournamentId', v_target_tournament_id,
      'bracketName', ironclad_private.division_verified_label((select division_model_version from public.tournaments where id=v_target_tournament_id),v_target_bracket_name)
    )
  )
  on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null
    do nothing;

  return pg_catalog.jsonb_build_object(
    'invitationId', v_invitation_id,
    'sourceRegistrationId', v_source_registration.id,
    'sourceTournamentBracketId',
      v_source_registration.tournament_bracket_id,
    'targetTournamentId', v_target_tournament_id,
    'targetTournamentBracketId', p_target_tournament_bracket_id,
    'status', 'pending',
    'createdAt', v_created_at,
    'alreadyPending', v_already_pending
  );
end;
$function$;

alter function public.create_tournament_division_invitation(p_source_registration_id uuid, p_target_tournament_bracket_id uuid, p_actor_clerk_user_id text) owner to postgres;
revoke all on function public.create_tournament_division_invitation(p_source_registration_id uuid, p_target_tournament_bracket_id uuid, p_actor_clerk_user_id text) from public, anon, authenticated, service_role;

grant execute on function public.create_tournament_division_invitation(p_source_registration_id uuid, p_target_tournament_bracket_id uuid, p_actor_clerk_user_id text) to service_role;

create function public.create_staging_legacy_transition_tournament(p_fixture_secret text,p_slug text,p_title text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_season_id uuid; v_missing integer; v_pending integer; v_id uuid;
begin
 perform ironclad_private.assert_staging_synthetic_uat_access(p_fixture_secret);
 if coalesce(auth.jwt()->>'ref','') <> 'zzbnneprhjicmajpjkdg' then raise exception 'Staging only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));
 select t.id into v_id from ironclad_private.staging_legacy_transition_events e join public.tournaments t on t.id=e.tournament_id
 where t.slug=p_slug and t.title='[SYNTHETIC] '||p_title and t.division_model_version='legacy_three_v1';
 if v_id is not null then return v_id; end if;
 select id into v_season_id from public.leaderboard_seasons where is_active and finalized_at is null and official_bracket_type='main' for update;
 if v_season_id is null then raise exception 'No unfinished legacy season' using errcode='55000'; end if;
 select 6-count(*) into v_missing from public.leaderboard_tournament_season_memberships where season_id=v_season_id and qualifying_event_number is not null and voided_at is null;
 select count(*) into v_pending from public.tournament_brackets b join public.tournaments t on t.id=b.tournament_id
 where t.division_model_version='legacy_three_v1' and b.name='Main' and t.status not in ('completed','cancelled','voided')
 and not exists(select 1 from public.tournament_division_not_held_closures c where c.tournament_bracket_id=b.id)
 and not exists(select 1 from public.leaderboard_division_settlements s where s.tournament_bracket_id=b.id);
 if v_missing<=v_pending then raise exception 'Existing legacy competition must be resolved first' using errcode='55000'; end if;
 if p_slug is null or p_slug !~ '^staging-synthetic-legacy-transition-[a-z0-9-]+$' or p_title is null or char_length(p_title)>160 then raise exception 'Explicit synthetic event identity required' using errcode='22023'; end if;
 perform set_config('ironclad.staging_legacy_transition','on',true);
 v_id := public.save_tournament(null,'[SYNTHETIC] '||p_title,p_slug,'Permanent Staging synthetic legacy-season transition event','',null,null,null,null,'upcoming','1v1','',null,null,true,null,'format_a',30,
 '[{"name":"Main","elo_rules":"1400+ ELO","max_players":8}]'::jsonb,'legacy_three_v1');
 insert into ironclad_private.staging_legacy_transition_events(tournament_id,season_id) values(v_id,v_season_id);
 perform set_config('ironclad.staging_legacy_transition','off',true);
 return v_id;
end; $$;
revoke all on function public.create_staging_legacy_transition_tournament(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_staging_legacy_transition_tournament(text,text,text) to service_role;

create table ironclad_private.staging_legacy_transition_events(
 tournament_id uuid primary key references public.tournaments(id) on delete cascade,
 season_id uuid not null references public.leaderboard_seasons(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table ironclad_private.staging_legacy_transition_events enable row level security;
alter table ironclad_private.staging_legacy_transition_events force row level security;
revoke all on table ironclad_private.staging_legacy_transition_events from public,anon,authenticated,service_role;
create function ironclad_private.guard_legacy_tournament_creation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.division_model_version='legacy_three_v1' and
 (coalesce(current_setting('ironclad.staging_legacy_transition',true),'')<>'on' or coalesce(auth.role(),'')<>'service_role' or coalesce(auth.jwt()->>'ref','')<>'zzbnneprhjicmajpjkdg') then
   raise exception 'Legacy event creation requires the guarded Staging transition workflow' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function ironclad_private.guard_legacy_tournament_creation() from public,anon,authenticated,service_role;
create trigger tournaments_guard_legacy_creation before insert on public.tournaments for each row execute function ironclad_private.guard_legacy_tournament_creation();
create function ironclad_private.guard_legacy_transition_registration()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if coalesce(current_setting('ironclad.account_closure',true),'')='on' and (session_user='postgres' or coalesce(auth.role(),'')='service_role') then return new; end if;
 if exists(select 1 from ironclad_private.staging_legacy_transition_events where tournament_id=new.tournament_id) and not exists(
 select 1 from ironclad_private.staging_synthetic_uat_players f join public.players p on p.id=f.player_id
 where p.id=new.profile_id and p.clerk_user_id=new.clerk_user_id and f.clerk_environment='development' and f.clerk_test_user_verified
 and not f.steam_openid_verified and not f.steam_ownership_verified and not f.relic_live_lookup_verified and not f.linked_steam_legal_confirmation
 and (new.registration_provenance='staging_synthetic_uat' or new.elo_calculation_version in ('staging-synthetic-v1','staging-synthetic-academy-v1'))
 ) then raise exception 'Legacy transition events accept only verified synthetic fixtures' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function ironclad_private.guard_legacy_transition_registration() from public,anon,authenticated,service_role;
create trigger registrations_guard_legacy_transition before insert or update on public.registrations for each row execute function ironclad_private.guard_legacy_transition_registration();

create function ironclad_private.division_cycle_keys(p_model text,p_name text)
returns text[] language plpgsql immutable security definer set search_path=pg_catalog as $$
begin
 perform ironclad_private.division_accounting_type(p_model,p_name);
 if p_model='legacy_three_v1' and p_name='Main' then return array['Main','Pro']; end if;
 return array[p_name];
end; $$;
revoke all on function ironclad_private.division_cycle_keys(text,text) from public,anon,authenticated,service_role;

-- Immutable model metadata is part of the existing public tournament projection.
grant select(division_model_version) on public.tournaments to anon,authenticated;

commit;
