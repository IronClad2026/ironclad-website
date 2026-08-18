begin;

create unique index notifications_match_admin_assistance_open_request_idx
  on public.notifications(actor_clerk_user_id, match_id)
  where recipient_role = 'admin'
    and type = 'match.admin_assistance_requested'
    and actor_clerk_user_id is not null
    and match_id is not null
    and in_app_hidden_at is null;

comment on index public.notifications_match_admin_assistance_open_request_idx is
  'Prevents concurrent duplicate open assistance requests while allowing another request after an administrator dismisses the previous notification.';

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_kind text not null,
  version text not null,
  immutable_url text not null,
  status text not null default 'review_draft',
  published_at timestamptz,
  effective_at timestamptz,
  sha256 text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint legal_documents_kind_check
    check (document_kind in ('rulebook', 'ppa', 'terms', 'privacy')),
  constraint legal_documents_version_check
    check (nullif(btrim(version), '') is not null and length(version) <= 120),
  constraint legal_documents_url_check
    check (
      nullif(btrim(immutable_url), '') is not null
      and length(immutable_url) <= 2048
    ),
  constraint legal_documents_status_check
    check (status in ('review_draft', 'effective', 'superseded')),
  constraint legal_documents_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint legal_documents_effective_fields_check
    check (
      status <> 'effective'
      or (
        published_at is not null
        and effective_at is not null
        and sha256 is not null
        and effective_at >= published_at
      )
    ),
  constraint legal_documents_kind_version_key unique (document_kind, version),
  constraint legal_documents_immutable_url_key unique (immutable_url)
);

create unique index legal_documents_one_effective_kind_idx
  on public.legal_documents(document_kind)
  where status = 'effective';

comment on table public.legal_documents is
  'Private authoritative register for versioned Rulebook, PPA, Terms, and Privacy documents. Phase 15A intentionally seeds no rows because the current corpus is Review Draft and not Effective.';
comment on column public.legal_documents.immutable_url is
  'Version-specific presentation URL. This value cannot be changed after insertion.';
comment on column public.legal_documents.sha256 is
  'Lowercase SHA-256 content digest. Required before a document can become Effective.';

create function public.protect_legal_document_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Legal document records are archived, not deleted'
      using errcode = '55000';
  end if;

  if new.id is distinct from old.id
    or new.document_kind is distinct from old.document_kind
    or new.version is distinct from old.version
    or new.immutable_url is distinct from old.immutable_url
    or new.created_at is distinct from old.created_at then
    raise exception 'Versioned legal document identity is immutable'
      using errcode = '55000';
  end if;

  if not (
    (old.status = 'review_draft'
      and new.status in ('review_draft', 'effective', 'superseded'))
    or (old.status = 'effective'
      and new.status in ('effective', 'superseded'))
    or (old.status = 'superseded' and new.status = 'superseded')
  ) then
    raise exception 'Legal document status cannot move backwards'
      using errcode = '55000';
  end if;

  if old.status in ('effective', 'superseded')
    and (
      new.published_at is distinct from old.published_at
      or new.effective_at is distinct from old.effective_at
      or new.sha256 is distinct from old.sha256
    ) then
    raise exception 'Final legal document facts are immutable'
      using errcode = '55000';
  end if;

  new.updated_at = clock_timestamp();
  return new;
end;
$$;

alter function public.protect_legal_document_record() owner to postgres;
revoke all on function public.protect_legal_document_record()
  from public, anon, authenticated, service_role;

create trigger legal_documents_protect_record
before update or delete on public.legal_documents
for each row execute function public.protect_legal_document_record();

alter table public.legal_documents enable row level security;
alter table public.legal_documents force row level security;
revoke all on table public.legal_documents
  from public, anon, authenticated, service_role;
grant select on table public.legal_documents to service_role;

create table public.registration_acceptances (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique,
  tournament_id uuid not null,
  clerk_user_id text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  rulebook_document_id uuid not null
    references public.legal_documents(id) on delete restrict,
  rulebook_version text not null,
  rulebook_url text not null,
  rulebook_sha256 text not null,
  ppa_document_id uuid not null
    references public.legal_documents(id) on delete restrict,
  ppa_version text not null,
  ppa_url text not null,
  ppa_sha256 text not null,
  terms_document_id uuid not null
    references public.legal_documents(id) on delete restrict,
  terms_version text not null,
  terms_url text not null,
  terms_sha256 text not null,
  privacy_document_id uuid not null
    references public.legal_documents(id) on delete restrict,
  privacy_version text not null,
  privacy_url text not null,
  privacy_sha256 text not null,
  rulebook_accepted boolean not null,
  ppa_accepted boolean not null,
  terms_accepted boolean not null,
  privacy_acknowledged boolean not null,
  age_18_confirmed boolean not null,
  own_ironclad_account_confirmed boolean not null,
  linked_steam_account_confirmed boolean not null,
  constraint registration_acceptances_clerk_user_id_check
    check (nullif(btrim(clerk_user_id), '') is not null),
  constraint registration_acceptances_rulebook_hash_check
    check (rulebook_sha256 ~ '^[0-9a-f]{64}$'),
  constraint registration_acceptances_ppa_hash_check
    check (ppa_sha256 ~ '^[0-9a-f]{64}$'),
  constraint registration_acceptances_terms_hash_check
    check (terms_sha256 ~ '^[0-9a-f]{64}$'),
  constraint registration_acceptances_privacy_hash_check
    check (privacy_sha256 ~ '^[0-9a-f]{64}$'),
  constraint registration_acceptances_required_controls_check
    check (
      rulebook_accepted is true
      and ppa_accepted is true
      and terms_accepted is true
      and privacy_acknowledged is true
      and age_18_confirmed is true
      and own_ironclad_account_confirmed is true
      and linked_steam_account_confirmed is true
    )
);

create index registration_acceptances_tournament_id_idx
  on public.registration_acceptances(tournament_id, accepted_at);
create index registration_acceptances_clerk_user_id_idx
  on public.registration_acceptances(clerk_user_id, accepted_at);

comment on table public.registration_acceptances is
  'Private immutable evidence created atomically with a registration. registration_id and tournament_id deliberately have no foreign keys so explicit Tournament hard deletion can retain evidence without CASCADE erasure or RESTRICT breakage.';
comment on column public.registration_acceptances.accepted_at is
  'Database-owned acceptance timestamp; caller-supplied values are overwritten by the insert guard.';

create function public.guard_registration_acceptance_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registration_created_at timestamptz;
  v_registration_clerk_user_id text;
  v_registration_tournament_id uuid;
  v_document public.legal_documents%rowtype;
  v_document_count integer := 0;
begin
  new.accepted_at = clock_timestamp();

  select
    registration.created_at,
    registration.clerk_user_id,
    registration.tournament_id
  into
    v_registration_created_at,
    v_registration_clerk_user_id,
    v_registration_tournament_id
  from public.registrations as registration
  where registration.id = new.registration_id
  for key share;

  if not found
    or v_registration_clerk_user_id is distinct from new.clerk_user_id
    or v_registration_tournament_id is distinct from new.tournament_id
    or v_registration_created_at is null
    or new.accepted_at < v_registration_created_at then
    raise exception 'Registration acceptance identity is invalid'
      using errcode = '23514';
  end if;

  for v_document in
    select document.*
    from public.legal_documents as document
    where document.id in (
      new.rulebook_document_id,
      new.ppa_document_id,
      new.terms_document_id,
      new.privacy_document_id
    )
    order by document.document_kind, document.id
    for key share
  loop
    if v_document.status <> 'effective'
      or v_document.effective_at is null
      or v_document.effective_at > new.accepted_at
      or v_document.sha256 is null then
      raise exception 'Registration document set is unavailable'
        using errcode = '23514';
    end if;

    case v_document.document_kind
      when 'rulebook' then
        if v_document.id is distinct from new.rulebook_document_id
          or v_document.version is distinct from new.rulebook_version
          or v_document.immutable_url is distinct from new.rulebook_url
          or v_document.sha256 is distinct from new.rulebook_sha256 then
          raise exception 'Registration consent is invalid'
            using errcode = '23514';
        end if;
      when 'ppa' then
        if v_document.id is distinct from new.ppa_document_id
          or v_document.version is distinct from new.ppa_version
          or v_document.immutable_url is distinct from new.ppa_url
          or v_document.sha256 is distinct from new.ppa_sha256 then
          raise exception 'Registration consent is invalid'
            using errcode = '23514';
        end if;
      when 'terms' then
        if v_document.id is distinct from new.terms_document_id
          or v_document.version is distinct from new.terms_version
          or v_document.immutable_url is distinct from new.terms_url
          or v_document.sha256 is distinct from new.terms_sha256 then
          raise exception 'Registration consent is invalid'
            using errcode = '23514';
        end if;
      when 'privacy' then
        if v_document.id is distinct from new.privacy_document_id
          or v_document.version is distinct from new.privacy_version
          or v_document.immutable_url is distinct from new.privacy_url
          or v_document.sha256 is distinct from new.privacy_sha256 then
          raise exception 'Registration consent is invalid'
            using errcode = '23514';
        end if;
      else
        raise exception 'Registration document set is unavailable'
          using errcode = '23514';
    end case;

    v_document_count := v_document_count + 1;
  end loop;

  if v_document_count <> 4 then
    raise exception 'Registration document set is unavailable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.guard_registration_acceptance_insert() owner to postgres;
revoke all on function public.guard_registration_acceptance_insert()
  from public, anon, authenticated, service_role;

create trigger registration_acceptances_guard_insert
before insert on public.registration_acceptances
for each row execute function public.guard_registration_acceptance_insert();

create function public.protect_registration_acceptance_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE'
    and session_user = 'postgres'
    and coalesce(
      current_setting('ironclad.legal_evidence_maintenance', true),
      ''
    ) = 'on' then
    return old;
  end if;

  raise exception 'Registration acceptance evidence is immutable'
    using errcode = '55000';
end;
$$;

alter function public.protect_registration_acceptance_record()
  owner to postgres;
revoke all on function public.protect_registration_acceptance_record()
  from public, anon, authenticated, service_role;

create trigger registration_acceptances_protect_record
before update or delete on public.registration_acceptances
for each row execute function public.protect_registration_acceptance_record();

create function public.require_registration_acceptance_on_commit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
    ) then
      raise exception
        'Registration acceptance cannot outlive a registration created in the same transaction'
        using errcode = '23514';
    end if;

    return null;
  end if;

  if not exists (
    select 1
    from public.registration_acceptances as acceptance
    where acceptance.registration_id = new.id
      and acceptance.clerk_user_id = new.clerk_user_id
      and acceptance.tournament_id = new.tournament_id
      and acceptance.accepted_at >= new.created_at
  ) then
    raise exception 'Every new registration requires one atomic acceptance'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

alter function public.require_registration_acceptance_on_commit()
  owner to postgres;
revoke all on function public.require_registration_acceptance_on_commit()
  from public, anon, authenticated, service_role;

create constraint trigger registrations_require_acceptance
after insert on public.registrations
deferrable initially deferred
for each row execute function public.require_registration_acceptance_on_commit();

alter table public.registration_acceptances enable row level security;
alter table public.registration_acceptances force row level security;
revoke all on table public.registration_acceptances
  from public, anon, authenticated, service_role;
grant select on table public.registration_acceptances to service_role;

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

  if nullif(btrim(new.discord_username), '') is null then
    new.discord_username = null;
    new.discord_public_enabled = false;
  end if;

  new.profile_completed = (
    nullif(btrim(new.avatar_url), '') is not null
    and (
      nullif(btrim(new.display_name), '') is not null
      or nullif(btrim(new.in_game_name), '') is not null
    )
    and nullif(btrim(new.steam_id64), '') is not null
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

update public.players as player
set
  discord_username = null,
  discord_public_enabled = false
where nullif(btrim(player.discord_username), '') is null
  and (
    player.discord_username is not null
    or player.discord_public_enabled is distinct from false
  );

update public.players as player
set profile_completed = (
  nullif(btrim(player.avatar_url), '') is not null
  and (
    nullif(btrim(player.display_name), '') is not null
    or nullif(btrim(player.in_game_name), '') is not null
  )
  and nullif(btrim(player.steam_id64), '') is not null
  and nullif(btrim(player.country), '') is not null
  and nullif(btrim(player.region), '') is not null
  and nullif(btrim(player.timezone), '') is not null
)
where player.profile_completed is distinct from (
  nullif(btrim(player.avatar_url), '') is not null
  and (
    nullif(btrim(player.display_name), '') is not null
    or nullif(btrim(player.in_game_name), '') is not null
  )
  and nullif(btrim(player.steam_id64), '') is not null
  and nullif(btrim(player.country), '') is not null
  and nullif(btrim(player.region), '') is not null
  and nullif(btrim(player.timezone), '') is not null
);

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  boolean
);

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);

create function public.submit_verified_player_registration(
  p_profile_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_relic_elo bigint,
  p_relic_faction text,
  p_relic_division text,
  p_relic_calculation_version text,
  p_rulebook_document_id uuid,
  p_ppa_document_id uuid,
  p_terms_document_id uuid,
  p_privacy_document_id uuid,
  p_rulebook_accepted boolean,
  p_ppa_accepted boolean,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean,
  p_age_18_confirmed boolean,
  p_account_and_steam_ownership_confirmed boolean,
  p_waitlist_confirmed boolean
)
returns table (
  id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  submitted_elo bigint,
  waitlist_confirmation_required boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player public.players%rowtype;
  v_rulebook_document public.legal_documents%rowtype;
  v_ppa_document public.legal_documents%rowtype;
  v_terms_document public.legal_documents%rowtype;
  v_privacy_document public.legal_documents%rowtype;
  v_consent_checked_at timestamptz;
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
  v_calculation_version text;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_rulebook_accepted is distinct from true
    or p_ppa_accepted is distinct from true
    or p_terms_accepted is distinct from true
    or p_privacy_acknowledged is distinct from true
    or p_age_18_confirmed is distinct from true
    or p_account_and_steam_ownership_confirmed is distinct from true then
    raise exception 'Registration consent is invalid'
      using errcode = '22023';
  end if;

  v_consent_checked_at := clock_timestamp();

  select document.*
  into v_rulebook_document
  from public.legal_documents as document
  where document.id = p_rulebook_document_id
    and document.document_kind = 'rulebook'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_ppa_document
  from public.legal_documents as document
  where document.id = p_ppa_document_id
    and document.document_kind = 'ppa'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_terms_document
  from public.legal_documents as document
  where document.id = p_terms_document_id
    and document.document_kind = 'terms'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  select document.*
  into v_privacy_document
  from public.legal_documents as document
  where document.id = p_privacy_document_id
    and document.document_kind = 'privacy'
    and document.status = 'effective'
    and document.sha256 is not null
    and document.effective_at <= v_consent_checked_at
  for key share;

  if not found then
    raise exception 'Registration document set is unavailable'
      using errcode = '22023';
  end if;

  v_calculation_version := nullif(
    btrim(p_relic_calculation_version),
    ''
  );

  if p_relic_elo is null
    or p_relic_elo < 0
    or p_relic_elo > 9007199254740991 then
    raise exception 'Registration verification data is invalid';
  end if;

  if p_relic_faction is null
    or p_relic_faction not in (
      'US Forces',
      'British Forces',
      'Deutsches Afrikakorps',
      'Wehrmacht'
    )
    or p_relic_division is null
    or p_relic_division not in ('Academy', 'Challenge', 'Main / Pro')
    or v_calculation_version is null then
    raise exception 'Registration verification data is invalid';
  end if;

  v_expected_division := case
    when p_relic_elo < 1100 then 'Academy'
    when p_relic_elo < 1400 then 'Challenge'
    else 'Main / Pro'
  end;

  if p_relic_division is distinct from v_expected_division then
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
    from public.registrations as existing_registration
    where existing_registration.clerk_user_id = v_player.clerk_user_id
      and existing_registration.tournament_id = p_tournament_id
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

  v_verified_at := clock_timestamp();

  if v_registration_enabled is distinct from true
    or v_tournament_status not in ('registration_open', 'in_progress')
    or v_bracket_launched_at is not null
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

  perform public.reconcile_tournament_waitlist(
    p_tournament_bracket_id
  );

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
    id := null;
    tournament_id := p_tournament_id;
    tournament_bracket_id := p_tournament_bracket_id;
    registration_status := null;
    submitted_elo := p_relic_elo;
    waitlist_confirmation_required := true;
    return next;
    return;
  end if;

  perform set_config(
    'ironclad.waitlist_confirmed',
    case
      when coalesce(p_waitlist_confirmed, false) then 'on'
      else 'off'
    end,
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
    case when v_requires_waitlist then 'waitlisted' else 'pending' end,
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

  insert into public.registration_acceptances (
    registration_id,
    tournament_id,
    clerk_user_id,
    rulebook_document_id,
    rulebook_version,
    rulebook_url,
    rulebook_sha256,
    ppa_document_id,
    ppa_version,
    ppa_url,
    ppa_sha256,
    terms_document_id,
    terms_version,
    terms_url,
    terms_sha256,
    privacy_document_id,
    privacy_version,
    privacy_url,
    privacy_sha256,
    rulebook_accepted,
    ppa_accepted,
    terms_accepted,
    privacy_acknowledged,
    age_18_confirmed,
    own_ironclad_account_confirmed,
    linked_steam_account_confirmed
  )
  values (
    id,
    tournament_id,
    v_player.clerk_user_id,
    v_rulebook_document.id,
    v_rulebook_document.version,
    v_rulebook_document.immutable_url,
    v_rulebook_document.sha256,
    v_ppa_document.id,
    v_ppa_document.version,
    v_ppa_document.immutable_url,
    v_ppa_document.sha256,
    v_terms_document.id,
    v_terms_document.version,
    v_terms_document.immutable_url,
    v_terms_document.sha256,
    v_privacy_document.id,
    v_privacy_document.version,
    v_privacy_document.immutable_url,
    v_privacy_document.sha256,
    p_rulebook_accepted,
    p_ppa_accepted,
    p_terms_accepted,
    p_privacy_acknowledged,
    p_age_18_confirmed,
    p_account_and_steam_ownership_confirmed,
    p_account_and_steam_ownership_confirmed
  );

  update public.players as player
  set
    current_elo = p_relic_elo,
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

  waitlist_confirmation_required := false;
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
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
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
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon, authenticated, service_role;

grant execute on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to service_role;

comment on function public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) is
  'Service-role-only atomic Relic registration and immutable versioned acceptance. Document IDs are untrusted selectors; version, URL, status, and hash are loaded and locked by the database. Preliminary waitlist acknowledgement creates neither row.';

commit;
