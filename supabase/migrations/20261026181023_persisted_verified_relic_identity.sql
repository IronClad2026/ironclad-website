-- Phase 2: only trusted Steam -> Relic verification may establish this binding.
-- No backfill, registration snapshot change, or competition-data rewrite.
begin;

alter table public.players
  add constraint players_coh3_profile_id_canonical_positive_check
  check (coh3_profile_id is null or coh3_profile_id ~ '^[1-9][0-9]*$');

comment on column public.players.coh3_profile_id is
  'Canonical positive decimal Relic member.profile_id, verified against the player Steam identity by trusted server verification. Nullable for legacy/unverified players. Not an external visibility permission. Cleared by existing account closure.';

-- Internal transaction context; no client or public RPC can establish it.
create function ironclad_private.has_verified_relic_binding_context(
  p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_relic_profile_id text
) returns boolean
language sql stable
set search_path = pg_catalog
as $$
  select coalesce(current_setting('ironclad.verified_relic_binding_context', true), '')
    = jsonb_build_array(p_player_id::text, p_clerk_user_id, p_steam_id64, p_relic_profile_id)::text;
$$;
revoke all on function ironclad_private.has_verified_relic_binding_context(uuid,text,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.protect_player_coh3_profile_id()
returns trigger language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_requested_profile_id text;
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role') then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    if (tg_op = 'INSERT' and new.coh3_profile_id is not null)
      or (tg_op = 'UPDATE' and new.coh3_profile_id is distinct from old.coh3_profile_id) then
      if (tg_op = 'UPDATE' and old.coh3_profile_id is not null)
        or new.account_closed_at is not null
        or new.coh3_profile_id is null
        or not ironclad_private.has_verified_relic_binding_context(
          new.id, new.clerk_user_id, new.steam_id64, new.coh3_profile_id
        ) then
        raise exception using errcode = 'P0001', message = 'RELIC_IDENTITY_CONFLICT';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.coh3_profile_id = null;
    return new;
  end if;
  if old.coh3_profile_id is not null then
    v_requested_profile_id := public.extract_coh3stats_profile_id(new.coh3_player_card_url);
    if v_requested_profile_id is distinct from old.coh3_profile_id then
      new.coh3_player_card_url = old.coh3_player_card_url;
    end if;
  end if;
  new.coh3_profile_id = old.coh3_profile_id;
  return new;
end;
$$;

-- Remains SECURITY INVOKER. Existing client protections and closure stay intact.
create or replace function public.protect_player_relic_verification()
returns trigger language plpgsql
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role') then
    return new;
  end if;

  if current_user = 'postgres' and coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'UPDATE' and old.coh3_profile_id is not null and (
      new.current_elo is distinct from old.current_elo
      or new.relic_verified_elo is distinct from old.relic_verified_elo
      or new.relic_verified_faction is distinct from old.relic_verified_faction
      or new.relic_verified_division is distinct from old.relic_verified_division
      or new.relic_elo_calculation_version is distinct from old.relic_elo_calculation_version
      or new.relic_elo_verified_at is distinct from old.relic_elo_verified_at
    ) and not ironclad_private.has_verified_relic_binding_context(
      new.id, new.clerk_user_id, new.steam_id64, old.coh3_profile_id
    ) then
      raise exception using errcode = 'P0001', message = 'RELIC_IDENTITY_CONFLICT';
    end if;
    -- Cooldown-only claims, aliases, privacy, and Steam refresh are unchanged.
    return new;
  end if;

  if tg_op = 'INSERT' then
    if num_nonnulls(new.current_elo, new.relic_verified_elo,
      new.relic_verified_faction, new.relic_verified_division,
      new.relic_elo_calculation_version, new.relic_elo_verified_at,
      new.relic_elo_last_attempt_at) > 0 then
      raise exception using errcode = '42501',
        message = 'Relic verification fields are server-controlled';
    end if;
    return new;
  end if;
  if new.current_elo is distinct from old.current_elo
    or new.relic_verified_elo is distinct from old.relic_verified_elo
    or new.relic_verified_faction is distinct from old.relic_verified_faction
    or new.relic_verified_division is distinct from old.relic_verified_division
    or new.relic_elo_calculation_version is distinct from old.relic_elo_calculation_version
    or new.relic_elo_verified_at is distinct from old.relic_elo_verified_at
    or new.relic_elo_last_attempt_at is distinct from old.relic_elo_last_attempt_at then
    raise exception using errcode = '42501',
      message = 'Relic verification fields are server-controlled';
  end if;
  return new;
end;
$$;

-- Called only inside the two trusted wrappers, after authenticating the server.
create function ironclad_private.lock_verified_relic_identity(
  p_player_id uuid, p_clerk_user_id text, p_steam_id64 text, p_relic_profile_id text
) returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_binding text;
begin
  select player.coh3_profile_id into v_binding
  from public.players player
  where player.id = p_player_id and player.clerk_user_id = p_clerk_user_id
    and p_steam_id64 is not null and player.steam_id64 = p_steam_id64
    and player.account_closed_at is null
  for update;
  if not found then return false; end if;

  if p_relic_profile_id is null or p_relic_profile_id !~ '^[1-9][0-9]*$' then
    raise exception using errcode = '22023', message = 'RELIC_IDENTITY_INVALID';
  end if;
  if (v_binding is not null and v_binding <> p_relic_profile_id)
    or exists (select 1 from public.players player
      where player.coh3_profile_id = p_relic_profile_id and player.id <> p_player_id) then
    raise exception using errcode = 'P0001', message = 'RELIC_IDENTITY_CONFLICT';
  end if;
  return true;
end;
$$;
revoke all on function ironclad_private.lock_verified_relic_identity(uuid,text,text,text)
  from public, anon, authenticated, service_role;

create function public.save_relic_profile_elo_snapshot_with_identity(
  p_player_id uuid, p_clerk_user_id text, p_steam_id64 text,
  p_claimed_at timestamptz, p_relic_elo integer, p_relic_faction text,
  p_relic_division text, p_relic_calculation_version text, p_relic_profile_id text
) returns table(current_elo integer, relic_verified_elo bigint,
  relic_verified_faction text, relic_verified_division text,
  relic_elo_calculation_version text, relic_elo_verified_at timestamptz,
  coh3_profile_id text)
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_saved record;
  v_previous_context text := coalesce(current_setting('ironclad.verified_relic_binding_context', true), '');
  v_constraint text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not ironclad_private.lock_verified_relic_identity(
    p_player_id, p_clerk_user_id, p_steam_id64, p_relic_profile_id
  ) then return; end if;
  -- Preserve zero-row stale claim behaviour; do not bind without an ELO save.
  if not exists (select 1 from public.players player where player.id = p_player_id
    and p_claimed_at is not null and player.relic_elo_last_attempt_at = p_claimed_at) then
    return;
  end if;
  perform set_config('ironclad.verified_relic_binding_context',
    jsonb_build_array(p_player_id::text,p_clerk_user_id,p_steam_id64,p_relic_profile_id)::text, true);
  select * into v_saved from public.save_relic_profile_elo_snapshot(
    p_player_id,p_clerk_user_id,p_steam_id64,p_claimed_at,p_relic_elo,
    p_relic_faction,p_relic_division,p_relic_calculation_version);
  if found then
    update public.players player set coh3_profile_id = p_relic_profile_id
    where player.id = p_player_id and player.coh3_profile_id is null;
    return query select v_saved.current_elo, v_saved.relic_verified_elo,
      v_saved.relic_verified_faction, v_saved.relic_verified_division,
      v_saved.relic_elo_calculation_version, v_saved.relic_elo_verified_at,
      p_relic_profile_id;
  end if;
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
  if v_constraint = 'players_coh3_profile_id_unique_idx' then
    raise exception using errcode = 'P0001', message = 'RELIC_IDENTITY_CONFLICT';
  end if;
  raise;
when others then
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
  raise;
end;
$$;
revoke all on function public.save_relic_profile_elo_snapshot_with_identity(uuid,text,text,timestamptz,integer,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.save_relic_profile_elo_snapshot_with_identity(uuid,text,text,timestamptz,integer,text,text,text,text)
  to service_role;

create function public.submit_verified_player_registration_with_identity(
  p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text,
  p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint,
  p_relic_faction text, p_relic_division text, p_relic_calculation_version text,
  p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid,
  p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean,
  p_terms_accepted boolean, p_privacy_acknowledged boolean,
  p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean,
  p_waitlist_confirmed boolean, p_relic_profile_id text
) returns table(id uuid,tournament_id uuid,tournament_bracket_id uuid,
  registration_status text,submitted_elo bigint,waitlist_confirmation_required boolean)
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_registration record;
  v_previous_context text := coalesce(current_setting('ironclad.verified_relic_binding_context', true), '');
  v_constraint text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not ironclad_private.lock_verified_relic_identity(
    p_profile_id,p_clerk_user_id,p_steam_id64,p_relic_profile_id
  ) then raise exception 'Registration identity is unavailable'; end if;
  perform set_config('ironclad.verified_relic_binding_context',
    jsonb_build_array(p_profile_id::text,p_clerk_user_id,p_steam_id64,p_relic_profile_id)::text, true);
  select * into strict v_registration from public.submit_verified_player_registration(
    p_profile_id,p_clerk_user_id,p_steam_id64,p_tournament_id,p_tournament_bracket_id,
    p_relic_elo,p_relic_faction,p_relic_division,p_relic_calculation_version,
    p_rulebook_document_id,p_ppa_document_id,p_terms_document_id,p_privacy_document_id,
    p_rulebook_accepted,p_ppa_accepted,p_terms_accepted,p_privacy_acknowledged,
    p_age_18_confirmed,p_account_and_steam_ownership_confirmed,p_waitlist_confirmed);
  -- Capacity-confirmation prompts are not submissions and must not bind.
  if v_registration.id is not null then
    update public.players player set coh3_profile_id = p_relic_profile_id
    where player.id = p_profile_id and player.coh3_profile_id is null;
  end if;
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
  return query select v_registration.id, v_registration.tournament_id,
    v_registration.tournament_bracket_id, v_registration.registration_status,
    v_registration.submitted_elo, v_registration.waitlist_confirmation_required;
exception when unique_violation then
  -- The whole block rolls back, including registration, consents and ELO save.
  get stacked diagnostics v_constraint = constraint_name;
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
  if v_constraint = 'players_coh3_profile_id_unique_idx' then
    raise exception using errcode = 'P0001', message = 'RELIC_IDENTITY_CONFLICT';
  end if;
  raise;
when others then
  perform set_config('ironclad.verified_relic_binding_context', v_previous_context, true);
  raise;
end;
$$;
revoke all on function public.submit_verified_player_registration_with_identity(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)
  from public, anon, authenticated;
grant execute on function public.submit_verified_player_registration_with_identity(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)
  to service_role;

commit;
