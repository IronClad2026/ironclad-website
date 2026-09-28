begin;

-- These indexes support durable Player-reference retention checks, account
-- closure cleanup and future FK maintenance without changing FK semantics.
create index warfront_company_members_player_reference_idx
  on public.warfront_company_members(player_id, company_id, id);

create index warfront_company_invitations_recipient_reference_idx
  on public.warfront_company_invitations(recipient_player_id, id);

create index warfront_company_invitations_inviter_reference_idx
  on public.warfront_company_invitations(invited_by_player_id, id);

create index warfront_operations_creator_reference_idx
  on public.warfront_operations(created_by_player_id, id);

create index warfront_operations_acceptor_reference_idx
  on public.warfront_operations(accepted_by_player_id, id);

create index warfront_operation_roster_player_reference_idx
  on public.warfront_operation_roster_entries(player_id, operation_id, id);

create index warfront_operation_roster_selector_reference_idx
  on public.warfront_operation_roster_entries(
    selected_by_player_id,
    operation_id,
    id
  );

create index warfront_operation_dice_roller_reference_idx
  on public.warfront_operation_dice_rolls(
    rolled_by_player_id,
    operation_id,
    game_number,
    tie_round,
    side
  );

-- Invitations are intentionally excluded. They may disappear through their
-- existing Player FK CASCADE when an invitation-only account is deleted.
create function ironclad_private.player_requires_warfront_identity_retention(
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    exists (
      select 1
      from public.warfront_company_members as member
      where member.player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operations as operation
      where operation.created_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operations as operation
      where operation.accepted_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_roster_entries as entry
      where entry.player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_roster_entries as entry
      where entry.selected_by_player_id = p_player_id
    )
    or exists (
      select 1
      from public.warfront_operation_dice_rolls as roll
      where roll.rolled_by_player_id = p_player_id
    );
$$;

alter function
  ironclad_private.player_requires_warfront_identity_retention(uuid)
  owner to postgres;
revoke all on function
  ironclad_private.player_requires_warfront_identity_retention(uuid)
  from public, anon, authenticated, service_role;

comment on function
  ironclad_private.player_requires_warfront_identity_retention(uuid) is
  'Owner-only WARFRONT durable-reference predicate used by account closure. WARFRONT identity retention preserves referenced Player rows; it is not Combat Record qualification.';

-- Preserve the complete latest tournament, leaderboard and synthetic-UAT
-- predicate. WARFRONT adds identity retention only, not Combat Record status.
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
    )
    or ironclad_private.player_requires_warfront_identity_retention(
      p_player_id
    );
$$;

alter function public.player_has_authoritative_competition_history(uuid)
  owner to postgres;
revoke all on function
  public.player_has_authoritative_competition_history(uuid)
  from public, anon, authenticated, service_role;

comment on function public.player_has_authoritative_competition_history(uuid) is
  'Owner-only account-closure retention predicate. It preserves every existing tournament, leaderboard and synthetic-UAT clause and also retains Player identities referenced by durable WARFRONT facts; WARFRONT retention is not Combat Record qualification.';

-- This is the one canonical WARFRONT entry point for the shared side of the
-- repository account-closure barrier. Future WARFRONT write authorities must
-- acquire it before taking any WARFRONT domain row lock.
create function ironclad_private.lock_warfront_account_closure_shared()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'ironclad:match-room-account-closure',
      0
    )
  );
end;
$$;

alter function ironclad_private.lock_warfront_account_closure_shared()
  owner to postgres;
revoke all on function
  ironclad_private.lock_warfront_account_closure_shared()
  from public, anon, authenticated, service_role;

comment on function
  ironclad_private.lock_warfront_account_closure_shared() is
  'Owner-only shared transaction lock using the canonical match-room account-closure advisory key. Every future WARFRONT write authority must call it before acquiring domain row locks.';

-- Trusted SECURITY DEFINER authorities pass the already-authenticated Clerk
-- actor explicitly. This helper neither reads JWT identity nor creates legal
-- acceptance evidence.
create function
  ironclad_private.require_current_account_legal_acceptance_for_actor(
    p_actor_clerk_user_id text
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_document public.legal_documents%rowtype;
  v_document_count integer := 0;
  v_terms public.legal_documents%rowtype;
  v_privacy public.legal_documents%rowtype;
begin
  if v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'Explicit account identity is invalid'
      using errcode = '22023';
  end if;

  -- Preserve the current member helper's effective-document predicates and
  -- SHARE locking semantics. The one-effective-kind index makes this order
  -- deterministic, and the UUID tie-breaker keeps it so under corruption.
  for v_document in
    select document.*
    from public.legal_documents as document
    where document.document_kind in ('privacy', 'terms')
      and document.status = 'effective'
      and document.published_at is not null
      and document.published_at <= v_checked_at
      and document.effective_at is not null
      and document.effective_at <= v_checked_at
      and document.sha256 is not null
    order by document.document_kind, document.id
    for share
  loop
    v_document_count := v_document_count + 1;
    if v_document.document_kind = 'terms' then
      v_terms := v_document;
    elsif v_document.document_kind = 'privacy' then
      v_privacy := v_document;
    end if;
  end loop;

  if v_document_count <> 2
    or v_terms.id is null
    or v_privacy.id is null then
    raise exception 'ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.account_legal_acceptances as acceptance
    where acceptance.clerk_user_id = v_actor_clerk_user_id
      and acceptance.terms_document_id = v_terms.id
      and acceptance.privacy_document_id = v_privacy.id
      and acceptance.terms_accepted is true
      and acceptance.privacy_acknowledged is true
  ) then
    raise exception 'ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED'
      using errcode = '42501';
  end if;
end;
$$;

alter function
  ironclad_private.require_current_account_legal_acceptance_for_actor(text)
  owner to postgres;
revoke all on function
  ironclad_private.require_current_account_legal_acceptance_for_actor(text)
  from public, anon, authenticated, service_role;

comment on function
  ironclad_private.require_current_account_legal_acceptance_for_actor(text) is
  'Owner-only trust-boundary helper for SECURITY DEFINER server authorities. It uses an explicit normalized Clerk actor, deterministically locks and requires the exact immutable current Effective Terms/Privacy acceptance pair, and never reads JWT identity or creates acceptance evidence.';

-- Preserve the complete existing account-closure chain behind the WARFRONT
-- integration. API roles must not execute the renamed implementation.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_warfront_cleanup;
alter function
  public.close_ironclad_player_account_without_warfront_cleanup(text)
  owner to postgres;
revoke all on function
  public.close_ironclad_player_account_without_warfront_cleanup(text)
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
  v_clerk_user_id text := nullif(
    pg_catalog.btrim(p_clerk_user_id),
    ''
  );
  v_player_id uuid;
  v_player_found boolean := false;
  v_retain_player boolean := false;
  v_closure_at timestamptz;
  v_result jsonb;
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

  -- Reuse the repository's canonical account-closure barrier exclusively.
  -- This must precede every WARFRONT row lock below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:match-room-account-closure',
      0
    )
  );

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  v_player_found := found;

  if v_player_found then
    -- Use the established WARFRONT order: Player, Companies, memberships,
    -- then dependent rows. All sets are locked in deterministic key order.
    perform company.id
    from public.warfront_companies as company
    where company.id in (
      select member.company_id
      from public.warfront_company_members as member
      where member.player_id = v_player_id
        and member.left_at is null
    )
    order by company.id
    for update;

    perform member.id
    from public.warfront_company_members as member
    where member.player_id = v_player_id
      and member.left_at is null
    order by member.company_id, member.player_id, member.id
    for update;

    perform invitation.id
    from public.warfront_company_invitations as invitation
    where invitation.status = 'pending'
      and (
        invitation.recipient_player_id = v_player_id
        or invitation.invited_by_player_id = v_player_id
      )
    order by invitation.company_id, invitation.id
    for update;

    -- An active Company must never be left without its active Commander.
    -- Transfer and archive remain explicit future authorities.
    if exists (
      select 1
      from public.warfront_company_members as member
      join public.warfront_companies as company
        on company.id = member.company_id
      where member.player_id = v_player_id
        and member.left_at is null
        and member.role = 'commander'
        and company.status = 'active'
    ) then
      raise exception 'WARFRONT_COMMANDER_TRANSFER_OR_ARCHIVE_REQUIRED'
        using errcode = '55000';
    end if;

    v_retain_player :=
      public.player_has_authoritative_competition_history(v_player_id);
    v_closure_at := pg_catalog.clock_timestamp();

    update public.warfront_company_members as member
    set left_at = v_closure_at
    where member.player_id = v_player_id
      and member.left_at is null;

    -- Pending invitations survive only with a retained Player row. Resolved
    -- invitations are never rewritten. Invitation-only Player deletion keeps
    -- the foundation's legitimate ON DELETE CASCADE behavior.
    if v_retain_player then
      update public.warfront_company_invitations as invitation
      set
        status = 'invalidated',
        invalidated_at = v_closure_at,
        invalidation_reason = 'account_closed'
      where invitation.status = 'pending'
        and (
          invitation.recipient_player_id = v_player_id
          or invitation.invited_by_player_id = v_player_id
        );
    end if;
  end if;

  -- Account closure does not require legal acceptance. It also never changes
  -- a Ranked Operation lifecycle state: OPEN rows and all competitive facts,
  -- snapshots, rosters and dice remain exactly as recorded.
  v_result :=
    public.close_ironclad_player_account_without_warfront_cleanup(
      v_clerk_user_id
    );

  return v_result;
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

comment on function public.close_ironclad_player_account(text) is
  'Service-role account closure boundary. It exclusively reuses the canonical closure barrier, blocks active-Company Commanders until explicit transfer or archive, closes other active memberships, invalidates pending invitations for retained identities, and never mutates Ranked Operation lifecycle or competitive facts.';

comment on function
  public.close_ironclad_player_account_without_warfront_cleanup(text) is
  'Owner-only pre-WARFRONT account-closure chain. Execute only through public.close_ironclad_player_account(text).';

-- Harden only the approved Migration 3 API boundaries. The approved cores
-- remain unchanged and owner-only; no API role may bypass these wrappers.
create or replace function public.issue_warfront_operation_api(
  p_actor_clerk_user_id text,
  p_format text,
  p_series_best_of smallint,
  p_challenger_player_ids uuid[],
  p_region text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_actor_player_id uuid;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation issue requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT Operation issue input is invalid'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'WARFRONT actor is unavailable'
      using errcode = 'P0002';
  end if;

  perform
    ironclad_private.require_current_account_legal_acceptance_for_actor(
      v_actor_clerk_user_id
    );

  return public.issue_warfront_operation(
    v_actor_clerk_user_id,
    p_format,
    p_series_best_of,
    p_challenger_player_ids,
    p_region,
    p_notes
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) owner to postgres;
revoke all on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) from public, anon, authenticated, service_role;
grant execute on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) to service_role;

create or replace function public.accept_warfront_operation_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_opponent_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_clerk_user_id text := nullif(
    pg_catalog.btrim(p_actor_clerk_user_id),
    ''
  );
  v_actor_player_id uuid;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT Operation acceptance requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor_clerk_user_id is null
    or pg_catalog.char_length(v_actor_clerk_user_id) > 256
    or v_actor_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT Operation acceptance input is invalid'
      using errcode = '22023';
  end if;

  perform ironclad_private.lock_warfront_account_closure_shared();

  select player.id
  into v_actor_player_id
  from public.players as player
  where player.clerk_user_id = v_actor_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'WARFRONT actor is unavailable'
      using errcode = 'P0002';
  end if;

  perform
    ironclad_private.require_current_account_legal_acceptance_for_actor(
      v_actor_clerk_user_id
    );

  return public.accept_warfront_operation(
    p_operation_id,
    v_actor_clerk_user_id,
    p_opponent_player_ids
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.accept_warfront_operation_api(uuid, text, uuid[])
  owner to postgres;
revoke all on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) to service_role;

-- Reassert that the approved cores and prior closure implementation remain
-- owner-only after wrapper replacement.
revoke all on function public.issue_warfront_operation(
  text, text, smallint, uuid[], text, text
) from public, anon, authenticated, service_role;
revoke all on function public.accept_warfront_operation(uuid, text, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function
  public.close_ironclad_player_account_without_warfront_cleanup(text)
  from public, anon, authenticated, service_role;

comment on function public.issue_warfront_operation_api(
  text, text, smallint, uuid[], text, text
) is
  'Service-role WARFRONT issue boundary. It validates an explicit active Clerk actor, acquires the canonical shared account-closure barrier before WARFRONT row locks, requires the exact current legal pair, and preserves PT409 serialization-conflict transport.';

comment on function public.accept_warfront_operation_api(
  uuid, text, uuid[]
) is
  'Service-role WARFRONT acceptance boundary. It validates an explicit active Clerk actor, acquires the canonical shared account-closure barrier before WARFRONT row locks, requires the exact current legal pair, and preserves PT409 serialization-conflict transport.';

commit;
