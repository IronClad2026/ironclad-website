begin;

-- One immutable audit row is the terminal authority for an unlaunched
-- Division that did not reach its minimum roster. Public state is exposed by
-- a narrow projection below; actor identity and optional detail remain
-- service-role-only audit data.
create table public.tournament_division_not_held_closures (
  tournament_bracket_id uuid primary key
    references public.tournament_brackets(id) on delete restrict,
  reason_code text not null
    check (reason_code = 'minimum_roster_not_reached'),
  detail text
    check (
      detail is null
      or (
        detail = pg_catalog.btrim(detail)
        and detail <> ''
        and pg_catalog.char_length(detail) <= 500
      )
    ),
  closed_at timestamptz not null,
  closed_by_clerk_user_id text not null
    check (
      closed_by_clerk_user_id = pg_catalog.btrim(closed_by_clerk_user_id)
      and closed_by_clerk_user_id <> ''
      and pg_catalog.char_length(closed_by_clerk_user_id) <= 256
    ),
  active_registration_count integer not null
    check (active_registration_count between 0 and 7),
  waitlist_registration_count integer not null
    check (waitlist_registration_count >= 0)
);

alter table public.tournament_division_not_held_closures
  enable row level security;
alter table public.tournament_division_not_held_closures
  force row level security;
alter table public.tournament_division_not_held_closures owner to postgres;

revoke all on table public.tournament_division_not_held_closures
  from public, anon, authenticated, service_role;
grant select on table public.tournament_division_not_held_closures
  to service_role;

create function public.protect_tournament_division_not_held_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'A Not Held Division closure audit is immutable'
    using errcode = '55000';
end;
$$;

alter function public.protect_tournament_division_not_held_audit()
  owner to postgres;
revoke all on function public.protect_tournament_division_not_held_audit()
  from public, anon, authenticated, service_role;

create trigger tournament_division_not_held_closures_immutable
before update or delete
on public.tournament_division_not_held_closures
for each row
execute function public.protect_tournament_division_not_held_audit();

create function public.get_tournament_division_not_held_states()
returns table (
  tournament_bracket_id uuid,
  tournament_id uuid,
  not_held_at timestamptz,
  reason_code text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    closure.tournament_bracket_id,
    bracket.tournament_id,
    closure.closed_at,
    closure.reason_code
  from public.tournament_division_not_held_closures as closure
  join public.tournament_brackets as bracket
    on bracket.id = closure.tournament_bracket_id;
$$;

alter function public.get_tournament_division_not_held_states()
  owner to postgres;
revoke all on function public.get_tournament_division_not_held_states()
  from public;
grant execute on function public.get_tournament_division_not_held_states()
  to anon, authenticated, service_role;

-- Extend the established private-draft safety predicate so every current
-- generation/reset authority treats Not Held as terminal.
create or replace function public.is_tournament_bracket_regeneration_safe(
  p_tournament_bracket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select tournament.status not in ('cancelled', 'voided')
        and bracket.launched_at is null
        and not exists (
          select 1
          from public.tournament_division_not_held_closures as closure
          where closure.tournament_bracket_id = bracket.id
        )
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          where generated.tournament_bracket_id = bracket.id
            and (
              match.status <> 'scheduled'
              or match.player_one_score is not null
              or match.player_two_score is not null
              or match.winner_registration_id is not null
              or match.official_result_submission_id is not null
              or match.official_result_decided_by is not null
              or match.official_result_decided_at is not null
              or match.outcome_type is not null
            )
        )
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          join public.match_result_submissions as submission
            on submission.match_id = match.id
          where generated.tournament_bracket_id = bracket.id
        )
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          join public.match_result_report_groups as report_group
            on report_group.match_id = match.id
          where generated.tournament_bracket_id = bracket.id
        )
      from public.tournament_brackets as bracket
      join public.tournaments as tournament
        on tournament.id = bracket.tournament_id
      where bracket.id = p_tournament_bracket_id
    ),
    false
  );
$$;

alter function public.is_tournament_bracket_regeneration_safe(uuid)
  owner to postgres;
revoke all on function public.is_tournament_bracket_regeneration_safe(uuid)
  from public, anon, authenticated;
grant execute on function public.is_tournament_bracket_regeneration_safe(uuid)
  to service_role;

-- Registration rows become immutable history after closure. Account closure
-- retains its existing trusted pseudonymisation exception.
create function public.guard_not_held_registration_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
  v_bracket_id uuid;
  v_account_closure boolean :=
    (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
    and coalesce(
      pg_catalog.current_setting('ironclad.account_closure', true),
      ''
    ) = 'on';
begin
  if v_account_closure then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_bracket_id := old.tournament_bracket_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_bracket_id := new.tournament_bracket_id;
  end if;

  for v_bracket_id in
    select distinct candidate.bracket_id
    from pg_catalog.unnest(
      array[v_old_bracket_id, v_new_bracket_id]
    ) as candidate(bracket_id)
    where candidate.bracket_id is not null
    order by candidate.bracket_id
  loop
    perform bracket.id
    from public.tournament_brackets as bracket
    where bracket.id = v_bracket_id
    for update;

    if exists (
      select 1
      from public.tournament_division_not_held_closures as closure
      where closure.tournament_bracket_id = v_bracket_id
    ) then
      raise exception 'Registrations are immutable after a Division is Not Held'
        using errcode = '55000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_not_held_registration_mutation()
  owner to postgres;
revoke all on function public.guard_not_held_registration_mutation()
  from public, anon, authenticated, service_role;

create trigger registrations_guard_not_held
before insert or update or delete on public.registrations
for each row
execute function public.guard_not_held_registration_mutation();

-- The closed Division row remains the historical anchor. No later launch,
-- configuration mutation, or ordinary hard deletion can rewrite it.
create function public.guard_not_held_division_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1
    from public.tournament_division_not_held_closures as closure
    where closure.tournament_bracket_id = old.id
  ) then
    raise exception 'A Not Held Division cannot be deleted'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.tournament_division_not_held_closures as closure
    where closure.tournament_bracket_id = old.id
  ) and (
    pg_catalog.to_jsonb(new) - 'updated_at'
  ) is distinct from (
    pg_catalog.to_jsonb(old) - 'updated_at'
  ) then
    raise exception 'A Not Held Division is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_not_held_division_mutation()
  owner to postgres;
revoke all on function public.guard_not_held_division_mutation()
  from public, anon, authenticated, service_role;

create trigger tournament_brackets_guard_not_held
before update or delete on public.tournament_brackets
for each row
execute function public.guard_not_held_division_mutation();

-- Child structure and map-pool writers lock the Division row, giving closure
-- one serial authority boundary against generation and publication.
create function public.guard_not_held_division_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
  v_bracket_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_bracket_id := old.tournament_bracket_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_bracket_id := new.tournament_bracket_id;
  end if;

  for v_bracket_id in
    select distinct candidate.bracket_id
    from pg_catalog.unnest(
      array[v_old_bracket_id, v_new_bracket_id]
    ) as candidate(bracket_id)
    where candidate.bracket_id is not null
    order by candidate.bracket_id
  loop
    perform bracket.id
    from public.tournament_brackets as bracket
    where bracket.id = v_bracket_id
    for update;

    if exists (
      select 1
      from public.tournament_division_not_held_closures as closure
      where closure.tournament_bracket_id = v_bracket_id
    ) then
      raise exception 'Competition structure is immutable after a Division is Not Held'
        using errcode = '55000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_not_held_division_child_mutation()
  owner to postgres;
revoke all on function public.guard_not_held_division_child_mutation()
  from public, anon, authenticated, service_role;

create trigger generated_brackets_guard_not_held
before insert or update or delete on public.generated_brackets
for each row
execute function public.guard_not_held_division_child_mutation();

create trigger tournament_map_pool_entries_guard_not_held
before insert or update or delete
on public.tournament_bracket_map_pool_entries
for each row
execute function public.guard_not_held_division_child_mutation();

create trigger tournament_map_pool_corrections_guard_not_held
before insert or update or delete
on public.tournament_bracket_map_pool_corrections
for each row
execute function public.guard_not_held_division_child_mutation();

-- Keep the existing waitlist authority, adding only the new terminal no-op.
create or replace function public.reconcile_tournament_waitlist(
  p_tournament_bracket_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where bracket.id = p_tournament_bracket_id
      and (
        tournament.status in ('cancelled', 'voided')
        or exists (
          select 1
          from public.tournament_division_not_held_closures as closure
          where closure.tournament_bracket_id = bracket.id
        )
      )
  ) then
    return 0;
  end if;

  return public.reconcile_tournament_waitlist_without_terminal_guard(
    p_tournament_bracket_id
  );
end;
$$;

alter function public.reconcile_tournament_waitlist(uuid)
  owner to postgres;
revoke all on function public.reconcile_tournament_waitlist(uuid)
  from public, anon, authenticated, service_role;

-- Preserve the existing status derivation, but do not let the event-wide
-- registration flag reopen when every configured Division is launched or Not
-- Held.
create or replace function public.sync_tournament_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_open_unlaunched boolean;
begin
  select exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = new.id
      and bracket.launched_at is null
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = bracket.id
      )
  )
  into v_has_open_unlaunched;

  if new.status = 'registration_open' then
    new.registration_enabled := v_has_open_unlaunched;
  elsif new.status = 'in_progress' and tg_op = 'UPDATE' then
    if v_has_open_unlaunched then
      new.registration_enabled := old.registration_enabled;
    else
      new.registration_enabled := false;
    end if;
  else
    new.registration_enabled := false;
  end if;

  return new;
end;
$$;

alter function public.sync_tournament_registration_enabled()
  owner to postgres;
revoke all on function public.sync_tournament_registration_enabled()
  from public, anon, authenticated;
grant execute on function public.sync_tournament_registration_enabled()
  to service_role;

create or replace function public.protect_tournament_lifecycle_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_launched boolean;
  v_has_unlaunched boolean;
  v_has_open_unlaunched boolean;
  v_explicit_transition boolean;
  v_terminal_transition boolean :=
    coalesce(
      pg_catalog.current_setting(
        'ironclad.tournament_terminal_transition',
        true
      ),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  select
    coalesce(bool_or(bracket.launched_at is not null), false),
    coalesce(bool_or(bracket.launched_at is null), false),
    coalesce(bool_or(
      bracket.launched_at is null
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = bracket.id
      )
    ), false)
  into v_has_launched, v_has_unlaunched, v_has_open_unlaunched
  from public.tournament_brackets as bracket
  where bracket.tournament_id = old.id;

  v_explicit_transition := coalesce(
    pg_catalog.current_setting('ironclad.explicit_division_launch', true),
    ''
  ) = 'on';

  if new.status = 'in_progress'
    and old.status is distinct from 'in_progress'
    and not v_explicit_transition then
    raise exception
      'Use Launch Division to move a tournament into progress';
  end if;

  if v_has_launched
    and new.status in ('upcoming', 'registration_open') then
    raise exception 'A tournament with a launched division cannot be reopened';
  end if;

  -- Parent-event completion is intentionally unchanged until the approved
  -- accounting cutover. A Not Held Division must not create completion facts.
  if new.status = 'completed' and v_has_unlaunched then
    raise exception
      'A tournament cannot complete while a configured division is unlaunched';
  end if;

  if new.registration_enabled is true
    and not v_has_open_unlaunched then
    raise exception
      'Registration cannot reopen after every division is resolved';
  end if;

  if v_has_launched
    and v_has_open_unlaunched
    and not v_explicit_transition
    and not v_terminal_transition
    and new.registration_enabled is distinct from
      old.registration_enabled then
    raise exception
      'Global registration availability must remain unchanged while sibling divisions are unlaunched';
  end if;

  return new;
end;
$$;

alter function public.protect_tournament_lifecycle_boundary()
  owner to postgres;
revoke all on function public.protect_tournament_lifecycle_boundary()
  from public, anon, authenticated;
grant execute on function public.protect_tournament_lifecycle_boundary()
  to service_role;

-- Closing the last unresolved Division and launching the last remaining open
-- sibling share one derived event-summary update. Neither path creates a new
-- lifecycle writer.
create function public.refresh_tournament_registration_after_division_resolution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
begin
  if tg_table_name = 'tournament_brackets' then
    if old.launched_at is not null or new.launched_at is null then
      return new;
    end if;
    v_tournament_id := new.tournament_id;
  else
    select bracket.tournament_id
    into v_tournament_id
    from public.tournament_brackets as bracket
    where bracket.id = new.tournament_bracket_id;
  end if;

  if not exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = v_tournament_id
      and bracket.launched_at is null
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = bracket.id
      )
  ) then
    update public.tournaments as tournament
    set registration_enabled = false
    where tournament.id = v_tournament_id
      and tournament.registration_enabled is true;
  end if;

  return new;
end;
$$;

alter function public.refresh_tournament_registration_after_division_resolution()
  owner to postgres;
revoke all on function public.refresh_tournament_registration_after_division_resolution()
  from public, anon, authenticated, service_role;

create trigger tournament_brackets_refresh_registration_after_launch
after update of launched_at on public.tournament_brackets
for each row
when (old.launched_at is distinct from new.launched_at)
execute function public.refresh_tournament_registration_after_division_resolution();

create trigger tournament_division_not_held_refresh_registration
after insert on public.tournament_division_not_held_closures
for each row
execute function public.refresh_tournament_registration_after_division_resolution();

create function public.close_tournament_division_without_launch(
  p_tournament_bracket_id uuid,
  p_reason_code text,
  p_detail text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
        v_bracket_name,
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
        'bracketName', v_bracket_name,
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
      v_bracket_name = 'Main'
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
      v_bracket_name,
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
      'bracketName', v_bracket_name,
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
$$;

alter function public.close_tournament_division_without_launch(
  uuid, text, text, text
) owner to postgres;
revoke all on function public.close_tournament_division_without_launch(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.close_tournament_division_without_launch(
  uuid, text, text, text
) to service_role;

-- Keep the existing event save RPC and ranked-cycle advisory lock as the
-- single authority. The only new resolution fact is the immutable Not Held
-- row above.
create or replace function public.save_tournament(
  p_tournament_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_banner_image_url text,
  p_registration_open_at timestamptz,
  p_registration_close_at timestamptz,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_status text,
  p_format text,
  p_prize_pool text,
  p_rules_url text,
  p_battlefy_url text,
  p_registration_enabled boolean,
  p_grand_final_at timestamptz,
  p_rule_format text,
  p_result_confirmation_window_minutes integer,
  p_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
  v_bracket_name text;
  v_conflicting_tournament_title text;
  v_protected_bracket_name text;
  v_rule_format text;
  v_confirmation_window integer;
begin
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
      or requested.value ->> 'name' not in ('Academy', 'Challenge', 'Main')
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

  for v_bracket_name in
    select requested.value ->> 'name'
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    order by requested.value ->> 'name'
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:ranked-division-cycle:' || v_bracket_name,
        0
      )
    );

    select tournament.title
    into v_conflicting_tournament_title
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where bracket.name = v_bracket_name
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
      result_confirmation_window_minutes
    )
    values (
      p_title, p_slug, p_description, p_banner_image_url,
      p_registration_open_at, p_registration_close_at,
      p_start_date, p_end_date, p_status, p_format,
      coalesce(p_prize_pool, ''), nullif(p_rules_url, ''),
      nullif(p_battlefy_url, ''), p_registration_enabled, null,
      v_rule_format, v_confirmation_window
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

  return v_tournament_id;
end;
$$;

alter function public.save_tournament(
  uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text,
  boolean, timestamptz, text, integer, jsonb
) owner to postgres;
revoke all on function public.save_tournament(
  uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text,
  boolean, timestamptz, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.save_tournament(
  uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text,
  boolean, timestamptz, text, integer, jsonb
) to service_role;

comment on table public.tournament_division_not_held_closures is
  'Immutable one-row-per-Division Not Held authority. Public state is projected separately; actor and optional detail remain protected audit data.';
comment on function public.close_tournament_division_without_launch(
  uuid, text, text, text
) is
  'Single service-role-only authority for irreversible, evidence-free, below-readiness Not Held closure. Preserves registrations and creates no competition or accounting facts.';
comment on function public.get_tournament_division_not_held_states() is
  'Public-safe Not Held state projection. Excludes administrator identity, optional detail, and registration snapshots.';
comment on function public.save_tournament(
  uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text,
  boolean, timestamptz, text, integer, jsonb
) is
  'Single event save authority. Preserves legacy Grand Final metadata, forces new events to unscheduled finals, serializes canonical ranked-division cycles, and treats immutable Not Held closure as resolved.';

commit;
