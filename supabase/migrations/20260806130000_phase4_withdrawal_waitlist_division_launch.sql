begin;

-- Phase 4 uses one per-division launch timestamp as the publication,
-- registration-closure, withdrawal-cutoff, and roster-lock boundary.
alter table public.tournament_brackets
  add column if not exists launched_at timestamptz;

alter table public.registrations
  add column if not exists withdrawn_at timestamptz,
  add column if not exists waitlist_offer_status text,
  add column if not exists waitlist_offer_created_at timestamptz,
  add column if not exists waitlist_offer_expires_at timestamptz,
  add column if not exists waitlist_offer_resolved_at timestamptz;

alter table public.registrations
  drop constraint if exists registrations_registration_status_check;

alter table public.registrations
  add constraint registrations_registration_status_check
  check (
    registration_status in (
      'pending',
      'manual_review',
      'approved',
      'rejected',
      'waitlisted',
      'withdrawn'
    )
  );

alter table public.registrations
  drop constraint if exists registrations_waitlist_offer_status_check,
  drop constraint if exists registrations_withdrawn_state_check,
  drop constraint if exists registrations_waitlist_offer_state_check;

alter table public.registrations
  add constraint registrations_waitlist_offer_status_check
  check (
    waitlist_offer_status is null
    or waitlist_offer_status in (
      'offered',
      'accepted',
      'declined',
      'expired',
      'cancelled'
    )
  ),
  add constraint registrations_withdrawn_state_check
  check (
    (registration_status = 'withdrawn') = (withdrawn_at is not null)
  ),
  add constraint registrations_waitlist_offer_state_check
  check (
    (
      waitlist_offer_status is null
      and waitlist_offer_created_at is null
      and waitlist_offer_expires_at is null
      and waitlist_offer_resolved_at is null
    )
    or (
      waitlist_offer_status = 'offered'
      and registration_status = 'waitlisted'
      and waitlist_offer_created_at is not null
      and waitlist_offer_expires_at =
        waitlist_offer_created_at + interval '24 hours'
      and waitlist_offer_resolved_at is null
    )
    or (
      waitlist_offer_status in (
        'accepted',
        'declined',
        'expired',
        'cancelled'
      )
      and waitlist_offer_created_at is not null
      and waitlist_offer_expires_at =
        waitlist_offer_created_at + interval '24 hours'
      and waitlist_offer_resolved_at is not null
      and (
        (
          waitlist_offer_status = 'accepted'
          and registration_status in (
            'pending',
            'manual_review',
            'approved',
            'rejected',
            'withdrawn'
          )
        )
        or (
          waitlist_offer_status in ('declined', 'expired')
          and registration_status = 'waitlisted'
        )
        or (
          waitlist_offer_status = 'cancelled'
          and registration_status in (
            'waitlisted',
            'withdrawn',
            'rejected'
          )
        )
      )
    )
  );

create index if not exists registrations_waitlist_offer_fifo_idx
  on public.registrations(tournament_bracket_id, created_at, id)
  where registration_status = 'waitlisted'
    and waitlist_offer_status is null;

create index if not exists registrations_waitlist_offer_expiry_idx
  on public.registrations(waitlist_offer_expires_at, created_at, id)
  where registration_status = 'waitlisted'
    and waitlist_offer_status = 'offered';

create index if not exists tournament_brackets_launched_at_idx
  on public.tournament_brackets(tournament_id, launched_at);

-- Preserve already-active historical competition. An unlaunched registration
-- draft remains null and therefore private/editable.
update public.tournament_brackets as bracket
set launched_at = coalesce(
  generated.competition_locked_at,
  generated.updated_at,
  generated.generated_at,
  now()
)
from
  public.tournaments as tournament,
  public.generated_brackets as generated
where tournament.id = bracket.tournament_id
  and generated.tournament_bracket_id = bracket.id
  and bracket.launched_at is null
  and (
    tournament.status in ('in_progress', 'completed', 'closed')
    or exists (
      select 1
      from public.tournament_matches as match
      where match.generated_bracket_id = generated.id
        and (
          match.status <> 'scheduled'
          or match.player_one_score is not null
          or match.player_two_score is not null
          or match.winner_registration_id is not null
          or match.official_result_submission_id is not null
        )
    )
    or exists (
      select 1
      from public.match_result_submissions as submission
      join public.tournament_matches as match
        on match.id = submission.match_id
      where match.generated_bracket_id = generated.id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      join public.tournament_matches as match
        on match.id = report_group.match_id
      where match.generated_bracket_id = generated.id
    )
  )
  and public.is_generated_bracket_populated(generated.id) is true;

comment on column public.tournament_brackets.launched_at is
  'Authoritative per-division actual launch, publication, registration-closure, withdrawal-cutoff, and roster-lock boundary.';

comment on column public.registrations.withdrawn_at is
  'Owner withdrawal time. Withdrawal is final and preserves the immutable registration snapshot.';

comment on column public.registrations.waitlist_offer_status is
  'Nullable terminal/history state for a FIFO vacancy offer. Null means the registration has never been offered a spot.';

-- Players may read only their own new lifecycle fields under the existing
-- own-registration RLS policy; administrator notes remain excluded.
grant select (
  withdrawn_at,
  waitlist_offer_status,
  waitlist_offer_created_at,
  waitlist_offer_expires_at,
  waitlist_offer_resolved_at
) on table public.registrations to authenticated;

-- Security-definer owner workflows retain the authenticated JWT, so allow an
-- owner function running as postgres to create its transactionally coupled
-- offer notification. Direct browser writes remain privilege/RLS denied.
create or replace function public.protect_notification_client_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user = 'postgres' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      raise exception
        'Notifications can only be created by protected server workflows';
    end if;

    if tg_op = 'DELETE' then
      raise exception 'Notifications cannot be deleted by clients';
    end if;

    if tg_op = 'UPDATE' then
      if old.id is distinct from new.id
        or old.recipient_clerk_user_id is distinct from
          new.recipient_clerk_user_id
        or old.recipient_role is distinct from new.recipient_role
        or old.type is distinct from new.type
        or old.title is distinct from new.title
        or old.message is distinct from new.message
        or old.actor_clerk_user_id is distinct from
          new.actor_clerk_user_id
        or old.actor_display_name is distinct from new.actor_display_name
        or old.tournament_id is distinct from new.tournament_id
        or old.tournament_title is distinct from new.tournament_title
        or old.registration_id is distinct from new.registration_id
        or old.match_id is distinct from new.match_id
        or old.report_group_id is distinct from new.report_group_id
        or old.metadata is distinct from new.metadata
        or old.created_at is distinct from new.created_at then
        raise exception
          'Only notification read state can be updated by clients';
      end if;

      if old.read_at is not null and new.read_at is null then
        raise exception
          'Notifications cannot be marked unread by clients';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.protect_notification_client_mutation()
  owner to postgres;
revoke all on function public.protect_notification_client_mutation()
  from public, anon, authenticated;
grant execute on function public.protect_notification_client_mutation()
  to service_role;

create or replace function public.is_tournament_bracket_roster_locked(
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
      select bracket.launched_at is not null
      from public.tournament_brackets as bracket
      where bracket.id = p_tournament_bracket_id
    ),
    false
  );
$$;

alter function public.is_tournament_bracket_roster_locked(uuid)
  owner to postgres;
revoke all on function public.is_tournament_bracket_roster_locked(uuid)
  from public, anon, authenticated;
grant execute on function public.is_tournament_bracket_roster_locked(uuid)
  to service_role;

-- Draft participant assignments are not competition activity. Genuine result
-- activity remains regeneration-unsafe, and launched divisions are immutable.
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
      select bracket.launched_at is null
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

create or replace function public.reconcile_tournament_waitlist(
  p_tournament_bracket_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_tournament_title text;
  v_bracket_name text;
  v_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_active_count integer;
  v_offered_count integer;
  v_vacancies integer;
  v_registration record;
  v_offer_created_at timestamptz;
  v_offer_expires_at timestamptz;
  v_issued integer := 0;
begin
  select
    bracket.tournament_id,
    tournament.title,
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_tournament_id,
    v_tournament_title,
    v_bracket_name,
    v_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = p_tournament_bracket_id
  for update of bracket;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  if v_launched_at is not null then
    return 0;
  end if;

  -- Phase 3 capped the active review cohort at eight even when a legacy
  -- bracket retained a larger display capacity. Smaller historical brackets
  -- continue to honor their configured size.
  v_required_count := least(v_max_players, 8);

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
    )::integer
  into v_active_count, v_offered_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  v_vacancies := greatest(
    v_required_count - v_active_count - v_offered_count,
    0
  );

  if v_vacancies = 0 then
    return 0;
  end if;

  for v_registration in
    select
      registration.id,
      registration.clerk_user_id
    from public.registrations as registration
    where registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'waitlisted'
      and registration.waitlist_offer_status is null
    order by registration.created_at, registration.id
    limit v_vacancies
    for update of registration
  loop
    v_offer_created_at := clock_timestamp();
    v_offer_expires_at := v_offer_created_at + interval '24 hours';

    update public.registrations
    set
      waitlist_offer_status = 'offered',
      waitlist_offer_created_at = v_offer_created_at,
      waitlist_offer_expires_at = v_offer_expires_at,
      waitlist_offer_resolved_at = null
    where id = v_registration.id
      and registration_status = 'waitlisted'
      and waitlist_offer_status is null;

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
        metadata
      )
      values (
        v_registration.clerk_user_id,
        'player',
        'registration.waitlist_offer',
        'A tournament place is available',
        format(
          'A place is available in the %s division of %s. Accept or decline before %s.',
          v_bracket_name,
          v_tournament_title,
          to_char(
            v_offer_expires_at at time zone 'UTC',
            'YYYY-MM-DD HH24:MI "UTC"'
          )
        ),
        v_tournament_id,
        v_tournament_title,
        v_registration.id,
        jsonb_build_object(
          'registrationId', v_registration.id,
          'tournamentId', v_tournament_id,
          'bracketId', p_tournament_bracket_id,
          'bracketName', v_bracket_name,
          'offerExpiresAt', v_offer_expires_at
        )
      );

      v_issued := v_issued + 1;
    end if;
  end loop;

  return v_issued;
end;
$$;

alter function public.reconcile_tournament_waitlist(uuid)
  owner to postgres;
revoke all on function public.reconcile_tournament_waitlist(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.reset_unlaunched_tournament_bracket_draft(
  p_tournament_bracket_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_launched_at timestamptz;
  v_deleted_count integer;
begin
  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
  for update;

  if not found then
    return false;
  end if;

  if v_launched_at is not null then
    raise exception 'Launched division brackets cannot be reset';
  end if;

  if not public.is_tournament_bracket_regeneration_safe(
    p_tournament_bracket_id
  ) then
    raise exception
      'Private bracket reset blocked because result activity exists';
  end if;

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;
  get diagnostics v_deleted_count = row_count;

  return v_deleted_count > 0;
end;
$$;

alter function public.reset_unlaunched_tournament_bracket_draft(uuid)
  owner to postgres;
revoke all on function
  public.reset_unlaunched_tournament_bracket_draft(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.enforce_tournament_registration_availability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_registration_enabled boolean;
  v_registration_open_at timestamptz;
  v_registration_close_at timestamptz;
  v_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_active_count integer;
  v_offered_count integer;
  v_eligible_waiting_count integer;
  v_enters_active boolean := false;
  v_public_registration_available boolean;
  v_waitlist_confirmed boolean;
begin
  if tg_op = 'UPDATE'
    and old.tournament_id is not distinct from new.tournament_id
    and old.tournament_bracket_id is not distinct from
      new.tournament_bracket_id
    and old.registration_status is not distinct from
      new.registration_status
    and old.withdrawn_at is not distinct from new.withdrawn_at
    and old.waitlist_offer_status is not distinct from
      new.waitlist_offer_status
    and old.waitlist_offer_created_at is not distinct from
      new.waitlist_offer_created_at
    and old.waitlist_offer_expires_at is not distinct from
      new.waitlist_offer_expires_at
    and old.waitlist_offer_resolved_at is not distinct from
      new.waitlist_offer_resolved_at then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.registration_status = 'withdrawn' then
    raise exception 'A withdrawn registration is final';
  end if;

  if tg_op = 'UPDATE'
    and old.waitlist_offer_status is not null
    and (
      old.waitlist_offer_created_at is distinct from
        new.waitlist_offer_created_at
      or old.waitlist_offer_expires_at is distinct from
        new.waitlist_offer_expires_at
    ) then
    raise exception 'Waitlist offer deadlines are immutable once created';
  end if;

  if tg_op = 'UPDATE'
    and old.waitlist_offer_status in (
      'accepted',
      'declined',
      'expired',
      'cancelled'
    )
    and row(
      old.waitlist_offer_status,
      old.waitlist_offer_created_at,
      old.waitlist_offer_expires_at,
      old.waitlist_offer_resolved_at
    ) is distinct from row(
      new.waitlist_offer_status,
      new.waitlist_offer_created_at,
      new.waitlist_offer_expires_at,
      new.waitlist_offer_resolved_at
    ) then
    raise exception 'A resolved waitlist offer is final';
  end if;

  if new.tournament_id is null or new.tournament_bracket_id is null then
    if new.registration_status = 'withdrawn'
      and new.withdrawn_at is null then
      raise exception 'Withdrawal time is required';
    end if;
    return new;
  end if;

  select
    tournament.status,
    tournament.registration_enabled,
    tournament.registration_open_at,
    tournament.registration_close_at,
    bracket.launched_at,
    bracket.max_players
  into
    v_status,
    v_registration_enabled,
    v_registration_open_at,
    v_registration_close_at,
    v_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = new.tournament_bracket_id
    and tournament.id = new.tournament_id
  for update of bracket;

  if not found then
    raise exception 'Selected tournament division does not exist';
  end if;

  if tg_op = 'UPDATE'
    and old.tournament_bracket_id is not null
    and old.tournament_bracket_id is distinct from
      new.tournament_bracket_id
    and public.is_tournament_bracket_roster_locked(
      old.tournament_bracket_id
    ) then
    raise exception 'The original tournament division has launched';
  end if;

  if v_launched_at is not null
    and (
      tg_op = 'INSERT'
      or old.registration_status is distinct from new.registration_status
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
      or old.withdrawn_at is distinct from new.withdrawn_at
      or old.waitlist_offer_status is distinct from
        new.waitlist_offer_status
      or old.waitlist_offer_created_at is distinct from
        new.waitlist_offer_created_at
      or old.waitlist_offer_expires_at is distinct from
        new.waitlist_offer_expires_at
      or old.waitlist_offer_resolved_at is distinct from
        new.waitlist_offer_resolved_at
    )
    and not (
      coalesce(
        current_setting('ironclad.explicit_division_launch', true),
        ''
      ) = 'on'
      and tg_op = 'UPDATE'
      and old.registration_status = 'waitlisted'
      and new.registration_status = 'waitlisted'
      and old.waitlist_offer_status = 'offered'
      and new.waitlist_offer_status = 'cancelled'
      and new.waitlist_offer_created_at is not distinct from
        old.waitlist_offer_created_at
      and new.waitlist_offer_expires_at is not distinct from
        old.waitlist_offer_expires_at
      and new.waitlist_offer_resolved_at is not null
    ) then
    raise exception
      'Registration changes are blocked because this division has launched';
  end if;

  if tg_op = 'INSERT' and coalesce(auth.role(), '') = 'service_role' then
    new.created_at := clock_timestamp();
  end if;

  v_required_count := least(v_max_players, 8);
  v_public_registration_available :=
    v_registration_enabled is true
    and v_status in ('registration_open', 'in_progress')
    and v_launched_at is null
    and (
      v_registration_open_at is null
      or now() >= v_registration_open_at
    )
    and (
      v_registration_close_at is null
      or now() <= v_registration_close_at
    );

  if tg_op = 'INSERT' and not v_public_registration_available then
    raise exception 'Tournament registration is not available';
  end if;

  if tg_op = 'UPDATE'
    and (
      old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
    ) then
    raise exception
      'Registrations cannot be moved between tournament divisions';
  end if;

  if tg_op = 'UPDATE'
    and old.registration_status = 'waitlisted'
    and new.registration_status in (
      'pending',
      'manual_review',
      'approved'
    )
    and not (
      old.waitlist_offer_status = 'offered'
      and new.waitlist_offer_status = 'accepted'
      and new.registration_status = 'pending'
      and new.waitlist_offer_created_at is not distinct from
        old.waitlist_offer_created_at
      and new.waitlist_offer_expires_at is not distinct from
        old.waitlist_offer_expires_at
      and new.waitlist_offer_resolved_at is not null
    ) then
    raise exception
      'A waitlisted player must accept an active offer before review';
  end if;

  if tg_op = 'UPDATE'
    and old.waitlist_offer_status = 'offered'
    and new.waitlist_offer_status = 'accepted'
    and clock_timestamp() >= old.waitlist_offer_expires_at then
    raise exception 'The waitlist offer has expired';
  end if;

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
  into v_active_count, v_offered_count, v_eligible_waiting_count
  from public.registrations as registration
  where registration.tournament_bracket_id = new.tournament_bracket_id
    and registration.id <> new.id;

  if tg_op = 'INSERT' then
    v_enters_active := new.registration_status in (
      'pending',
      'manual_review',
      'approved'
    );
  else
    v_enters_active :=
      new.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
      and old.registration_status not in (
        'pending',
        'manual_review',
        'approved'
      );
  end if;

  if v_enters_active
    and v_active_count + v_offered_count >= v_required_count then
    raise exception
      'Tournament division active cohort capacity is %',
      v_required_count;
  end if;

  if v_enters_active
    and not (
      tg_op = 'UPDATE'
      and old.waitlist_offer_status = 'offered'
      and new.waitlist_offer_status = 'accepted'
    )
    and v_eligible_waiting_count > 0 then
    raise exception
      'Older eligible waitlisted registrations must be offered first';
  end if;

  if new.waitlist_offer_status = 'offered'
    and old.waitlist_offer_status is distinct from 'offered'
    and v_active_count + v_offered_count >= v_required_count then
    raise exception
      'Tournament division has no vacancy for another offer';
  end if;

  if tg_op = 'INSERT' and new.registration_status = 'pending' then
    if v_active_count + v_offered_count >= v_required_count
      or v_eligible_waiting_count > 0 then
      v_waitlist_confirmed :=
        coalesce(
          current_setting('ironclad.waitlist_confirmed', true),
          ''
        ) = 'on';

      if not v_waitlist_confirmed then
        raise exception using
          errcode = 'P0001',
          message = 'WAITLIST_CONFIRMATION_REQUIRED';
      end if;

      new.registration_status := 'waitlisted';
    end if;
  elsif tg_op = 'INSERT'
    and new.registration_status = 'waitlisted'
    and coalesce(
      current_setting('ironclad.waitlist_confirmed', true),
      ''
    ) <> 'on' then
    raise exception using
      errcode = 'P0001',
      message = 'WAITLIST_CONFIRMATION_REQUIRED';
  end if;

  return new;
end;
$$;

alter function public.enforce_tournament_registration_availability()
  owner to postgres;
revoke all on function public.enforce_tournament_registration_availability()
  from public, anon, authenticated;
grant execute on function public.enforce_tournament_registration_availability()
  to service_role;

drop trigger if exists registrations_enforce_tournament_availability
  on public.registrations;
create trigger registrations_enforce_tournament_availability
before insert or update of
  registration_status,
  tournament_id,
  tournament_bracket_id,
  withdrawn_at,
  waitlist_offer_status,
  waitlist_offer_created_at,
  waitlist_offer_expires_at,
  waitlist_offer_resolved_at
on public.registrations
for each row
execute function public.enforce_tournament_registration_availability();

create or replace function public.refresh_phase4_registration_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
begin
  if current_setting('ironclad.tournament_deletion', true) = 'on' then
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.tournament_bracket_id is not null
      and new.registration_status = 'waitlisted'
      and new.waitlist_offer_status is null then
      perform public.reconcile_tournament_waitlist(
        new.tournament_bracket_id
      );
    end if;
    return new;
  end if;

  v_old_bracket_id := old.tournament_bracket_id;
  v_new_bracket_id := new.tournament_bracket_id;

  if old.registration_status = 'approved'
    and (
      new.registration_status <> 'approved'
      or v_old_bracket_id is distinct from v_new_bracket_id
    )
    and v_old_bracket_id is not null then
    perform public.reset_unlaunched_tournament_bracket_draft(
      v_old_bracket_id
    );
  end if;

  if new.registration_status = 'approved'
    and (
      old.registration_status <> 'approved'
      or v_old_bracket_id is distinct from v_new_bracket_id
    )
    and v_new_bracket_id is not null then
    perform public.reset_unlaunched_tournament_bracket_draft(
      v_new_bracket_id
    );
  end if;

  if v_old_bracket_id is not null
    and (
      (
        old.registration_status in (
          'pending',
          'manual_review',
          'approved'
        )
        and new.registration_status not in (
          'pending',
          'manual_review',
          'approved'
        )
      )
      or (
        old.registration_status = 'waitlisted'
        and old.waitlist_offer_status = 'offered'
        and not (
          new.registration_status = 'pending'
          and new.waitlist_offer_status = 'accepted'
        )
      )
    ) then
    perform public.reconcile_tournament_waitlist(v_old_bracket_id);
  elsif v_new_bracket_id is not null
    and tg_op = 'UPDATE'
    and old.waitlist_offer_status is null
    and new.waitlist_offer_status is null
    and new.registration_status = 'waitlisted' then
    perform public.reconcile_tournament_waitlist(v_new_bracket_id);
  end if;

  return new;
end;
$$;

alter function public.refresh_phase4_registration_state()
  owner to postgres;
revoke all on function public.refresh_phase4_registration_state()
  from public, anon, authenticated;
grant execute on function public.refresh_phase4_registration_state()
  to service_role;

drop trigger if exists registrations_refresh_phase4_state
  on public.registrations;
create trigger registrations_refresh_phase4_state
after insert or update of
  registration_status,
  tournament_id,
  tournament_bracket_id,
  waitlist_offer_status
on public.registrations
for each row
execute function public.refresh_phase4_registration_state();

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

drop trigger if exists registrations_protect_history_delete
  on public.registrations;
create trigger registrations_protect_history_delete
before delete on public.registrations
for each row
execute function public.protect_registration_history_delete();

-- The legacy status-source trigger still runs whenever tournament.status is
-- written. During a staggered division launch, preserve the current global
-- registration setting until the final configured division is launched.
create or replace function public.sync_tournament_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_unlaunched boolean;
begin
  if new.status = 'registration_open' then
    new.registration_enabled := true;
  elsif new.status = 'in_progress' and tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.tournament_brackets as bracket
      where bracket.tournament_id = new.id
        and bracket.launched_at is null
    )
    into v_has_unlaunched;

    if v_has_unlaunched then
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
  v_explicit_transition boolean;
begin
  select
    coalesce(bool_or(bracket.launched_at is not null), false),
    coalesce(bool_or(bracket.launched_at is null), false)
  into v_has_launched, v_has_unlaunched
  from public.tournament_brackets as bracket
  where bracket.tournament_id = old.id;

  v_explicit_transition := coalesce(
    current_setting('ironclad.explicit_division_launch', true),
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

  if new.status = 'completed' and v_has_unlaunched then
    raise exception
      'A tournament cannot complete while a configured division is unlaunched';
  end if;

  if new.registration_enabled is true
    and v_has_launched
    and not v_has_unlaunched then
    raise exception
      'Registration cannot reopen after every division has launched';
  end if;

  if v_has_launched
    and v_has_unlaunched
    and not v_explicit_transition
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

drop trigger if exists tournaments_protect_phase4_lifecycle
  on public.tournaments;
create trigger tournaments_protect_phase4_lifecycle
before update of status, registration_enabled
on public.tournaments
for each row
execute function public.protect_tournament_lifecycle_boundary();

create or replace function public.protect_division_launch_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE'
    and (
      current_setting('ironclad.tournament_deletion', true) = 'on'
      or not exists (
        select 1
        from public.tournaments as tournament
        where tournament.id = old.tournament_id
      )
    ) then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.launched_at is not null then
      raise exception
        'A tournament division can only launch through Launch Division';
    end if;

    if exists (
      select 1
      from public.tournament_brackets as launched_bracket
      where launched_bracket.tournament_id = new.tournament_id
        and launched_bracket.launched_at is not null
    )
      and not exists (
        select 1
        from public.tournament_brackets as existing_bracket
        where existing_bracket.tournament_id = new.tournament_id
          and existing_bracket.name = new.name
      ) then
      raise exception
        'Configured tournament divisions cannot be added after launch begins';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.launched_at is not null
      or exists (
        select 1
        from public.tournament_brackets as launched_bracket
        where launched_bracket.tournament_id = old.tournament_id
          and launched_bracket.launched_at is not null
      ) then
      raise exception
        'Configured tournament divisions cannot be removed after launch begins';
    end if;
    return old;
  end if;

  if old.launched_at is not null
    and (
      new.tournament_id is distinct from old.tournament_id
      or new.name is distinct from old.name
      or new.elo_rules is distinct from old.elo_rules
      or new.max_players is distinct from old.max_players
    ) then
    raise exception
      'A launched tournament division configuration is immutable';
  end if;

  if old.launched_at is not null
    and new.launched_at is distinct from old.launched_at then
    raise exception 'Division launch time is immutable';
  end if;

  if old.launched_at is null
    and new.launched_at is not null
    and coalesce(
      current_setting('ironclad.explicit_division_launch', true),
      ''
    ) <> 'on' then
    raise exception 'Use Launch Division to launch a tournament division';
  end if;

  return new;
end;
$$;

alter function public.protect_division_launch_boundary()
  owner to postgres;
revoke all on function public.protect_division_launch_boundary()
  from public, anon, authenticated;
grant execute on function public.protect_division_launch_boundary()
  to service_role;

drop trigger if exists tournament_brackets_protect_launch_boundary
  on public.tournament_brackets;
create trigger tournament_brackets_protect_launch_boundary
before insert or update or delete on public.tournament_brackets
for each row
execute function public.protect_division_launch_boundary();

-- Assignment updates are allowed while a draft is private. Result activity
-- remains impossible until the selected division has launched.
create or replace function public.lock_generated_bracket_on_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where generated.id = new.generated_bracket_id
      and bracket.launched_at is not null
  )
    and (
      new.player_one_registration_id is not null
      or new.player_two_registration_id is not null
      or new.status <> 'scheduled'
      or new.player_one_score is not null
      or new.player_two_score is not null
      or new.winner_registration_id is not null
      or new.official_result_submission_id is not null
      or new.official_result_decided_by is not null
      or new.official_result_decided_at is not null
    ) then
    update public.generated_brackets
    set competition_locked_at = coalesce(competition_locked_at, now())
    where id = new.generated_bracket_id;
  end if;

  return new;
end;
$$;

alter function public.lock_generated_bracket_on_activity()
  owner to postgres;
revoke all on function public.lock_generated_bracket_on_activity()
  from public, anon, authenticated;
grant execute on function public.lock_generated_bracket_on_activity()
  to service_role;

create or replace function public.require_launched_match_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_generated_bracket_id uuid;
  v_match_id uuid;
begin
  if tg_table_name = 'tournament_matches' then
    if tg_op = 'INSERT'
      and new.status = 'scheduled'
      and new.player_one_score is null
      and new.player_two_score is null
      and new.winner_registration_id is null
      and new.official_result_submission_id is null
      and new.official_result_decided_by is null
      and new.official_result_decided_at is null then
      return new;
    end if;

    if tg_op = 'UPDATE'
      and old.status is not distinct from new.status
      and old.player_one_score is not distinct from new.player_one_score
      and old.player_two_score is not distinct from new.player_two_score
      and old.winner_registration_id is not distinct from
        new.winner_registration_id
      and old.official_result_submission_id is not distinct from
        new.official_result_submission_id
      and old.official_result_decided_by is not distinct from
        new.official_result_decided_by
      and old.official_result_decided_at is not distinct from
        new.official_result_decided_at then
      return new;
    end if;

    v_generated_bracket_id := coalesce(
      new.generated_bracket_id,
      old.generated_bracket_id
    );
  else
    v_match_id := case
      when tg_op = 'DELETE' then old.match_id
      else new.match_id
    end;

    select match.generated_bracket_id
    into v_generated_bracket_id
    from public.tournament_matches as match
    where match.id = v_match_id;
  end if;

  if not exists (
    select 1
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where generated.id = v_generated_bracket_id
      and bracket.launched_at is not null
  ) then
    raise exception
      'Match activity is blocked until this division launches';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.require_launched_match_activity()
  owner to postgres;
revoke all on function public.require_launched_match_activity()
  from public, anon, authenticated;
grant execute on function public.require_launched_match_activity()
  to service_role;

drop trigger if exists tournament_matches_require_launched_activity
  on public.tournament_matches;
create trigger tournament_matches_require_launched_activity
before insert or update of
  status,
  player_one_score,
  player_two_score,
  winner_registration_id,
  official_result_submission_id,
  official_result_decided_by,
  official_result_decided_at
on public.tournament_matches
for each row
execute function public.require_launched_match_activity();

drop trigger if exists match_result_submissions_require_launched
  on public.match_result_submissions;
create trigger match_result_submissions_require_launched
before insert or update or delete on public.match_result_submissions
for each row
execute function public.require_launched_match_activity();

drop trigger if exists match_result_report_groups_require_launched
  on public.match_result_report_groups;
create trigger match_result_report_groups_require_launched
before insert or update or delete on public.match_result_report_groups
for each row
execute function public.require_launched_match_activity();

-- Draft graph tables are server-only. Launched data remains available through
-- the existing reviewed server projection. The narrow proof-scope read also
-- requires the parent division to have launched.
drop policy if exists "Public can read bracket rounds"
  on public.bracket_rounds;
drop policy if exists "Public can read tournament standings"
  on public.tournament_standings;

revoke all privileges on table
  public.bracket_rounds,
  public.tournament_standings
from public, anon, authenticated;

grant all privileges on table
  public.bracket_rounds,
  public.tournament_standings
to service_role;

create or replace function
  ironclad_private.match_division_is_launched(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where match.id = p_match_id
      and bracket.launched_at is not null
  );
$$;

alter function ironclad_private.match_division_is_launched(uuid)
  owner to postgres;
revoke all on function
  ironclad_private.match_division_is_launched(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  ironclad_private.match_division_is_launched(uuid)
to authenticated, service_role;

comment on function
  ironclad_private.match_division_is_launched(uuid) is
  'Private RLS helper that resolves launch state without granting browser roles access to draft bracket tables.';

drop policy if exists "Authorized viewers can resolve match proof scope"
  on public.tournament_matches;

create policy "Authorized viewers can resolve match proof scope"
on public.tournament_matches
for select
to authenticated
using (
  ironclad_private.match_division_is_launched(tournament_matches.id)
  and (
    public.is_admin_jwt()
    or exists (
      select 1
      from public.registrations as registration
      where registration.clerk_user_id = (auth.jwt() ->> 'sub')
        and registration.id in (
          tournament_matches.player_one_registration_id,
          tournament_matches.player_two_registration_id
        )
    )
  )
);

drop function if exists public.get_tournament_bracket_capacity();

create function public.get_tournament_bracket_capacity()
returns table (
  bracket_id uuid,
  tournament_id uuid,
  registered_players bigint,
  active_cohort_players bigint,
  offered_reservations bigint,
  waitlisted_players bigint,
  max_players integer,
  launched_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    bracket.id,
    bracket.tournament_id,
    count(registration.id) filter (
      where registration.registration_status = 'approved'
    ),
    count(registration.id) filter (
      where registration.registration_status in (
        'pending',
        'manual_review',
        'approved'
      )
    ) + count(registration.id) filter (
      where registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
    ),
    count(registration.id) filter (
      where registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
    ),
    count(registration.id) filter (
      where registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status is null
    ),
    least(bracket.max_players, 8),
    bracket.launched_at
  from public.tournament_brackets as bracket
  left join public.registrations as registration
    on registration.tournament_bracket_id = bracket.id
  group by
    bracket.id,
    bracket.tournament_id,
    bracket.max_players,
    bracket.launched_at;
$$;

alter function public.get_tournament_bracket_capacity()
  owner to postgres;
revoke all on function public.get_tournament_bracket_capacity()
  from public, anon, authenticated;
grant execute on function public.get_tournament_bracket_capacity()
  to service_role;

create or replace function public.get_tournament_bracket_readiness(
  p_tournament_bracket_id uuid
)
returns table (
  approved_count integer,
  required_count integer,
  is_ready boolean,
  launched_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    count(registration.id) filter (
      where registration.registration_status = 'approved'
    )::integer,
    least(bracket.max_players, 8),
    count(registration.id) filter (
      where registration.registration_status = 'approved'
    ) = least(bracket.max_players, 8)
      and count(registration.id) filter (
        where registration.registration_status in (
          'pending',
          'manual_review'
        )
          or (
            registration.registration_status = 'waitlisted'
            and registration.waitlist_offer_status = 'offered'
          )
      ) = 0,
    bracket.launched_at
  from public.tournament_brackets as bracket
  left join public.registrations as registration
    on registration.tournament_bracket_id = bracket.id
  where bracket.id = p_tournament_bracket_id
  group by bracket.id, bracket.max_players, bracket.launched_at;
$$;

alter function public.get_tournament_bracket_readiness(uuid)
  owner to postgres;
revoke all on function public.get_tournament_bracket_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.get_tournament_bracket_readiness(uuid)
  to service_role;

-- Remove the old overload so service-role callers cannot bypass the explicit
-- waitlist acknowledgement during a capacity race.
drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  text,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text
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
  boolean
) is
  'Service-role-only atomic Relic registration with explicit waitlist acknowledgement and a no-insert capacity-race result.';

create or replace function public.withdraw_tournament_registration(
  p_registration_id uuid
)
returns table (
  registration_id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  withdrawn_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text;
  v_tournament_bracket_id uuid;
  v_registration public.registrations%rowtype;
  v_launched_at timestamptz;
  v_withdrawn_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'Not authorized';
  end if;

  v_clerk_user_id := nullif(auth.jwt() ->> 'sub', '');
  if v_clerk_user_id is null then
    raise exception 'Not authorized';
  end if;

  select registration.tournament_bracket_id
  into v_tournament_bracket_id
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id;

  if not found or v_tournament_bracket_id is null then
    raise exception 'Registration not found';
  end if;

  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = v_tournament_bracket_id
  for update;

  select registration.*
  into v_registration
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id
    and registration.tournament_bracket_id = v_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Registration not found';
  end if;

  if v_launched_at is not null then
    raise exception 'Withdrawal is blocked because this division has launched';
  end if;

  if v_registration.registration_status not in (
    'pending',
    'manual_review',
    'approved',
    'waitlisted'
  ) then
    raise exception 'This registration cannot be withdrawn';
  end if;

  if v_registration.registration_status = 'waitlisted'
    and v_registration.waitlist_offer_status not in ('offered')
    and v_registration.waitlist_offer_status is not null then
    raise exception 'This waitlist registration is already resolved';
  end if;

  v_withdrawn_at := clock_timestamp();

  update public.registrations
  set
    registration_status = 'withdrawn',
    withdrawn_at = v_withdrawn_at,
    waitlist_offer_status = case
      when waitlist_offer_status = 'offered' then 'cancelled'
      else waitlist_offer_status
    end,
    waitlist_offer_resolved_at = case
      when waitlist_offer_status = 'offered' then v_withdrawn_at
      else waitlist_offer_resolved_at
    end
  where id = p_registration_id;

  registration_id := v_registration.id;
  tournament_id := v_registration.tournament_id;
  tournament_bracket_id := v_registration.tournament_bracket_id;
  registration_status := 'withdrawn';
  withdrawn_at := v_withdrawn_at;
  return next;
end;
$$;

alter function public.withdraw_tournament_registration(uuid)
  owner to postgres;
revoke all on function public.withdraw_tournament_registration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_tournament_registration(uuid)
  to authenticated;

create or replace function public.respond_to_waitlist_offer(
  p_registration_id uuid,
  p_response text
)
returns table (
  registration_id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  waitlist_offer_status text,
  waitlist_offer_resolved_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text;
  v_tournament_bracket_id uuid;
  v_registration public.registrations%rowtype;
  v_launched_at timestamptz;
  v_resolved_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'Not authorized';
  end if;

  v_clerk_user_id := nullif(auth.jwt() ->> 'sub', '');
  if v_clerk_user_id is null then
    raise exception 'Not authorized';
  end if;

  if p_response not in ('accept', 'decline') then
    raise exception 'Waitlist response must be accept or decline';
  end if;

  select registration.tournament_bracket_id
  into v_tournament_bracket_id
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id;

  if not found or v_tournament_bracket_id is null then
    raise exception 'Waitlist offer not found';
  end if;

  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = v_tournament_bracket_id
  for update;

  select registration.*
  into v_registration
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.clerk_user_id = v_clerk_user_id
    and registration.tournament_bracket_id = v_tournament_bracket_id
  for update;

  if not found
    or v_registration.registration_status <> 'waitlisted'
    or v_registration.waitlist_offer_status <> 'offered' then
    raise exception 'This waitlist offer is no longer available';
  end if;

  if v_launched_at is not null then
    raise exception 'This waitlist offer closed when the division launched';
  end if;

  v_resolved_at := clock_timestamp();

  if v_resolved_at >= v_registration.waitlist_offer_expires_at then
    raise exception 'This waitlist offer has expired';
  end if;

  if p_response = 'accept' then
    update public.registrations
    set
      registration_status = 'pending',
      waitlist_offer_status = 'accepted',
      waitlist_offer_resolved_at = v_resolved_at
    where id = p_registration_id;

    registration_status := 'pending';
    waitlist_offer_status := 'accepted';
  else
    update public.registrations
    set
      waitlist_offer_status = 'declined',
      waitlist_offer_resolved_at = v_resolved_at
    where id = p_registration_id;

    registration_status := 'waitlisted';
    waitlist_offer_status := 'declined';
  end if;

  registration_id := v_registration.id;
  tournament_id := v_registration.tournament_id;
  tournament_bracket_id := v_registration.tournament_bracket_id;
  waitlist_offer_resolved_at := v_resolved_at;
  return next;
end;
$$;

alter function public.respond_to_waitlist_offer(uuid, text)
  owner to postgres;
revoke all on function public.respond_to_waitlist_offer(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.respond_to_waitlist_offer(uuid, text)
  to authenticated;

create or replace function public.review_tournament_registration(
  p_registration_id uuid,
  p_registration_status text,
  p_admin_notes text default null
)
returns table (
  registration_id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_bracket_id uuid;
  v_registration public.registrations%rowtype;
  v_launched_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_registration_status not in (
    'pending',
    'manual_review',
    'approved',
    'rejected',
    'waitlisted',
    'withdrawn'
  ) then
    raise exception 'Invalid registration review status';
  end if;

  if p_admin_notes is not null and length(p_admin_notes) > 1000 then
    raise exception 'Administrator notes cannot exceed 1000 characters';
  end if;

  select registration.tournament_bracket_id
  into v_tournament_bracket_id
  from public.registrations as registration
  where registration.id = p_registration_id;

  if not found or v_tournament_bracket_id is null then
    raise exception 'Registration not found';
  end if;

  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = v_tournament_bracket_id
  for update;

  select registration.*
  into v_registration
  from public.registrations as registration
  where registration.id = p_registration_id
    and registration.tournament_bracket_id = v_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Registration not found';
  end if;

  if p_registration_status = 'withdrawn'
    and v_registration.registration_status <> 'withdrawn' then
    raise exception 'Only the player can withdraw a registration';
  end if;

  if p_registration_status = 'waitlisted'
    and v_registration.registration_status <> 'waitlisted' then
    raise exception 'Administrator review cannot move a player to waitlist';
  end if;

  if v_registration.registration_status = 'waitlisted'
    and p_registration_status not in ('waitlisted', 'rejected') then
    raise exception
      'Waitlisted players must accept an offer before administrator review';
  end if;

  if v_registration.registration_status = 'waitlisted'
    and v_registration.waitlist_offer_status in (
      'declined',
      'expired',
      'cancelled'
    )
    and p_registration_status <> 'waitlisted' then
    raise exception 'A resolved waitlist registration is final';
  end if;

  if v_registration.registration_status = 'withdrawn'
    and p_registration_status <> 'withdrawn' then
    raise exception 'A withdrawn registration is final';
  end if;

  if v_launched_at is not null
    and p_registration_status is distinct from
      v_registration.registration_status then
    raise exception
      'Roster review is blocked because this division has launched';
  end if;

  update public.registrations as registration
  set
    registration_status = p_registration_status,
    waitlist_offer_status = case
      when registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
        and p_registration_status = 'rejected'
        then 'cancelled'
      else registration.waitlist_offer_status
    end,
    waitlist_offer_resolved_at = case
      when registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
        and p_registration_status = 'rejected'
        then clock_timestamp()
      else registration.waitlist_offer_resolved_at
    end,
    admin_notes = case
      when p_admin_notes is null then registration.admin_notes
      else p_admin_notes
    end
  where registration.id = p_registration_id;

  registration_id := v_registration.id;
  tournament_id := v_registration.tournament_id;
  tournament_bracket_id := v_registration.tournament_bracket_id;
  registration_status := p_registration_status;
  return next;
end;
$$;

alter function public.review_tournament_registration(uuid, text, text)
  owner to postgres;
revoke all on function
  public.review_tournament_registration(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.review_tournament_registration(uuid, text, text)
  to service_role;

create or replace function public.process_expired_waitlist_offers(
  p_batch_size integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registration record;
  v_processed integer := 0;
  v_batch_size integer;
begin
  v_batch_size := greatest(1, least(coalesce(p_batch_size, 100), 500));

  for v_registration in
    select
      registration.id,
      registration.tournament_bracket_id
    from public.registrations as registration
    join public.tournament_brackets as bracket
      on bracket.id = registration.tournament_bracket_id
    where registration.registration_status = 'waitlisted'
      and registration.waitlist_offer_status = 'offered'
      and registration.waitlist_offer_expires_at <= now()
      and bracket.launched_at is null
    order by
      registration.waitlist_offer_expires_at,
      registration.created_at,
      registration.id
    limit v_batch_size
    for update of bracket skip locked
  loop
    update public.registrations
    set
      waitlist_offer_status = 'expired',
      waitlist_offer_resolved_at = clock_timestamp()
    where id = v_registration.id
      and registration_status = 'waitlisted'
      and waitlist_offer_status = 'offered'
      and waitlist_offer_expires_at <= now();

    if found then
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

alter function public.process_expired_waitlist_offers(integer)
  owner to postgres;
revoke all on function public.process_expired_waitlist_offers(integer)
  from public, anon, authenticated;
grant execute on function public.process_expired_waitlist_offers(integer)
  to service_role;

create or replace function public.generate_tournament_bracket(
  p_tournament_bracket_id uuid,
  p_generated_by text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_approved_count integer;
  v_unresolved_count integer;
  v_max_players integer;
  v_required_count integer;
  v_launched_at timestamptz;
  v_format text;
  v_generated_bracket_id uuid;
  v_round_id uuid;
  v_round_count integer;
  v_round_number integer;
  v_match_count integer;
  v_match_number integer;
  v_round_name text;
  v_first_slot integer;
  v_second_slot integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_generated_by is null or btrim(p_generated_by) = '' then
    raise exception 'Generating administrator is required';
  end if;

  select bracket.max_players, bracket.launched_at
  into v_max_players, v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  if v_launched_at is not null then
    raise exception 'A launched division bracket cannot be regenerated';
  end if;

  if not public.is_tournament_bracket_regeneration_safe(
    p_tournament_bracket_id
  ) then
    raise exception
      'Bracket regeneration blocked because result activity exists';
  end if;

  v_required_count := least(v_max_players, 8);
  if v_required_count < 2 then
    raise exception 'Tournament division requires at least two players';
  end if;

  select
    count(*) filter (
      where registration.registration_status = 'approved'
    )::integer,
    count(*) filter (
      where registration.registration_status in (
        'pending',
        'manual_review'
      )
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer
  into v_approved_count, v_unresolved_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  if v_approved_count <> v_required_count or v_unresolved_count <> 0 then
    raise exception
      'Private bracket generation requires exactly % approved players and no unresolved vacancy',
      v_required_count;
  end if;

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;

  v_format := case
    when (v_required_count & (v_required_count - 1)) = 0
      then 'single_elimination'
    else 'round_robin'
  end;

  insert into public.generated_brackets (
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by,
    competition_locked_at
  )
  values (
    p_tournament_bracket_id,
    v_format,
    v_required_count,
    v_required_count,
    p_generated_by,
    null
  )
  returning id into v_generated_bracket_id;

  if v_format = 'single_elimination' then
    v_round_count := log(2, v_required_count)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_required_count / power(2, v_round_number)::integer;
      v_round_name := case
        when v_match_count = 1 then 'Grand Final'
        when v_match_count = 2 then 'Semi Finals'
        when v_match_count = 4 then 'Quarter Finals'
        else 'Round of ' || (v_match_count * 2)::text
      end;

      insert into public.bracket_rounds (
        generated_bracket_id,
        round_number,
        name
      )
      values (
        v_generated_bracket_id,
        v_round_number,
        v_round_name
      )
      returning id into v_round_id;

      for v_match_number in 1..v_match_count loop
        v_first_slot := ((v_match_number - 1) * 2) + 1;
        v_second_slot := v_first_slot + 1;

        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          case when v_round_number = 1 then v_first_slot else null end,
          case when v_round_number = 1 then v_second_slot else null end,
          null,
          null
        );
      end loop;
    end loop;
  else
    insert into public.bracket_rounds (
      generated_bracket_id,
      round_number,
      name
    )
    values (v_generated_bracket_id, 1, 'Round Robin')
    returning id into v_round_id;

    v_match_number := 0;
    for v_first_slot in 1..(v_required_count - 1) loop
      for v_second_slot in (v_first_slot + 1)..v_required_count loop
        v_match_number := v_match_number + 1;
        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          v_first_slot,
          v_second_slot,
          null,
          null
        );
      end loop;
    end loop;
  end if;

  return v_generated_bracket_id;
end;
$$;

alter function public.generate_tournament_bracket(uuid, text)
  owner to postgres;
revoke all on function public.generate_tournament_bracket(uuid, text)
  from public, anon, authenticated;
grant execute on function public.generate_tournament_bracket(uuid, text)
  to service_role;

-- Repair remains available only as an internal postgres-owned helper. The
-- launch-aware save function below is its sole Phase 4 call path and checks the
-- locked division's launched_at boundary before repair can mutate graph rows.
alter function public.repair_generated_bracket_matches(uuid, text)
  owner to postgres;
revoke all on function public.repair_generated_bracket_matches(uuid, text)
  from public, anon, authenticated, service_role;

-- Launched roster changes advance only through protected result progression.
-- The former direct participant editor would bypass the immutable seeded
-- roster, so keep that legacy helper internal to the database owner.
alter function public.admin_update_match_participants(
  uuid,
  uuid,
  uuid,
  text
) owner to postgres;
revoke all on function public.admin_update_match_participants(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

create or replace function public.save_bracket_assignments(
  p_generated_bracket_id uuid,
  p_assignments jsonb,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_bracket_id uuid;
  v_tournament_id uuid;
  v_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_approved_count integer;
  v_unresolved_count integer;
  v_format text;
  v_slot_count integer;
  v_participant_count integer;
  v_assignment jsonb;
  v_slot_number integer;
  v_registration_id uuid;
  v_assigned_registration_ids uuid[] := array[]::uuid[];
  v_updated_rows integer;
  v_second_updated_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_updated_by is null or btrim(p_updated_by) = '' then
    raise exception 'Updating administrator is required';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Bracket assignments must be a JSON array';
  end if;

  select generated.tournament_bracket_id
  into v_tournament_bracket_id
  from public.generated_brackets as generated
  where generated.id = p_generated_bracket_id;

  if not found then
    raise exception 'Generated bracket not found';
  end if;

  select
    bracket.tournament_id,
    bracket.launched_at,
    bracket.max_players
  into
    v_tournament_id,
    v_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  where bracket.id = v_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  if v_launched_at is not null then
    raise exception 'Bracket assignments cannot change after division launch';
  end if;

  select
    generated.format,
    generated.slot_count,
    generated.participant_count
  into v_format, v_slot_count, v_participant_count
  from public.generated_brackets as generated
  where generated.id = p_generated_bracket_id
    and generated.tournament_bracket_id = v_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Generated bracket not found';
  end if;

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where registration.registration_status = 'approved'
    )::integer,
    count(*) filter (
      where registration.registration_status in (
        'pending',
        'manual_review'
      )
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer
  into v_approved_count, v_unresolved_count
  from public.registrations as registration
  where registration.tournament_bracket_id = v_tournament_bracket_id;

  if v_approved_count <> v_required_count
    or v_unresolved_count <> 0
    or v_slot_count <> v_required_count
    or v_participant_count <> v_required_count then
    raise exception
      'Private bracket assignments require exactly % approved players and a matching draft',
      v_required_count;
  end if;

  perform public.repair_generated_bracket_matches(
    p_generated_bracket_id,
    p_updated_by
  );

  if jsonb_array_length(p_assignments) <> v_slot_count then
    raise exception 'Every bracket slot must be included';
  end if;

  if (
    select count(*)
    from (
      select (assignment->>'slot_number')::integer as slot_number
      from jsonb_array_elements(p_assignments) as assignment
    ) as slots
  ) <> (
    select count(distinct slot_number)
    from (
      select (assignment->>'slot_number')::integer as slot_number
      from jsonb_array_elements(p_assignments) as assignment
    ) as slots
  ) then
    raise exception 'Each bracket slot may appear only once';
  end if;

  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    v_slot_number := nullif(v_assignment->>'slot_number', '')::integer;
    v_registration_id :=
      nullif(v_assignment->>'registration_id', '')::uuid;

    if v_slot_number is null
      or v_slot_number < 1
      or v_slot_number > v_slot_count then
      raise exception 'Invalid bracket slot number';
    end if;

    if v_registration_id is not null then
      if v_registration_id = any(v_assigned_registration_ids) then
        raise exception 'A participant can only occupy one bracket slot';
      end if;

      if not exists (
        select 1
        from public.registrations as registration
        where registration.id = v_registration_id
          and registration.tournament_id = v_tournament_id
          and registration.tournament_bracket_id =
            v_tournament_bracket_id
          and registration.registration_status = 'approved'
      ) then
        raise exception
          'Only approved participants from this division can be assigned';
      end if;

      v_assigned_registration_ids := array_append(
        v_assigned_registration_ids,
        v_registration_id
      );
    end if;
  end loop;

  update public.tournament_matches
  set
    player_one_registration_id = case
      when player_one_slot is not null then null
      else player_one_registration_id
    end,
    player_two_registration_id = case
      when player_two_slot is not null then null
      else player_two_registration_id
    end
  where generated_bracket_id = p_generated_bracket_id;

  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    v_slot_number := (v_assignment->>'slot_number')::integer;
    v_registration_id :=
      nullif(v_assignment->>'registration_id', '')::uuid;
    v_updated_rows := 0;

    update public.tournament_matches
    set player_one_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_one_slot = v_slot_number;
    get diagnostics v_updated_rows = row_count;

    update public.tournament_matches
    set player_two_registration_id = v_registration_id
    where generated_bracket_id = p_generated_bracket_id
      and player_two_slot = v_slot_number;
    get diagnostics v_second_updated_rows = row_count;
    v_updated_rows := v_updated_rows + v_second_updated_rows;

    if v_updated_rows = 0 then
      raise exception 'Bracket slot % has no match record', v_slot_number;
    end if;
  end loop;

  if v_format = 'round_robin' then
    delete from public.tournament_standings
    where generated_bracket_id = p_generated_bracket_id;

    insert into public.tournament_standings (
      generated_bracket_id,
      registration_id
    )
    select
      p_generated_bracket_id,
      registration_id
    from unnest(v_assigned_registration_ids) as registration_id;
  end if;
end;
$$;

alter function public.save_bracket_assignments(uuid, jsonb, text)
  owner to postgres;
revoke all on function public.save_bracket_assignments(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_bracket_assignments(uuid, jsonb, text)
  to service_role;

create or replace function public.launch_tournament_division(
  p_tournament_bracket_id uuid,
  p_actor_clerk_user_id text
)
returns table (
  tournament_id uuid,
  tournament_bracket_id uuid,
  launched_at timestamptz,
  already_launched boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_tournament_title text;
  v_bracket_name text;
  v_existing_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_approved_count integer;
  v_unresolved_count integer;
  v_generated_bracket_id uuid;
  v_slot_count integer;
  v_participant_count integer;
  v_assigned_count integer;
  v_launch_at timestamptz;
  v_waitlisted record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_actor_clerk_user_id is null
    or btrim(p_actor_clerk_user_id) = '' then
    raise exception 'Launching administrator is required';
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  select tournament.title
  into v_tournament_title
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for no key update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  select
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_bracket_name,
    v_existing_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
    and bracket.tournament_id = v_tournament_id
  for update;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  if v_existing_launched_at is not null then
    tournament_id := v_tournament_id;
    tournament_bracket_id := p_tournament_bracket_id;
    launched_at := v_existing_launched_at;
    already_launched := true;
    return next;
    return;
  end if;

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where registration.registration_status = 'approved'
    )::integer,
    count(*) filter (
      where registration.registration_status in (
        'pending',
        'manual_review'
      )
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer
  into v_approved_count, v_unresolved_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  if v_approved_count <> v_required_count or v_unresolved_count <> 0 then
    raise exception
      'Division launch requires exactly % approved players and no unresolved vacancy',
      v_required_count;
  end if;

  select
    generated.id,
    generated.slot_count,
    generated.participant_count
  into
    v_generated_bracket_id,
    v_slot_count,
    v_participant_count
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id
  for update;

  if not found
    or v_slot_count <> v_required_count
    or v_participant_count <> v_required_count
    or public.is_generated_bracket_populated(v_generated_bracket_id)
      is distinct from true then
    raise exception
      'Division launch requires a complete private bracket with % populated seeds',
      v_required_count;
  end if;

  select count(distinct assigned.registration_id)::integer
  into v_assigned_count
  from (
    select match.player_one_registration_id as registration_id
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and match.player_one_slot is not null
      and match.player_one_registration_id is not null
    union
    select match.player_two_registration_id
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and match.player_two_slot is not null
      and match.player_two_registration_id is not null
  ) as assigned;

  if v_assigned_count <> v_required_count
    or exists (
      (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id =
          p_tournament_bracket_id
          and registration.registration_status = 'approved'
      )
      except
      (
        select match.player_one_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_one_slot is not null
          and match.player_one_registration_id is not null
        union
        select match.player_two_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_two_slot is not null
          and match.player_two_registration_id is not null
      )
    )
    or exists (
      (
        select match.player_one_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_one_slot is not null
          and match.player_one_registration_id is not null
        union
        select match.player_two_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_two_slot is not null
          and match.player_two_registration_id is not null
      )
      except
      (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id =
          p_tournament_bracket_id
          and registration.registration_status = 'approved'
      )
    ) then
    raise exception
      'Bracket assignments must exactly match the approved division roster';
  end if;

  if exists (
    select 1
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and (
        match.status <> 'scheduled'
        or match.player_one_score is not null
        or match.player_two_score is not null
        or match.winner_registration_id is not null
        or match.official_result_submission_id is not null
        or match.official_result_decided_by is not null
        or match.official_result_decided_at is not null
      )
  )
    or exists (
      select 1
      from public.match_result_submissions as submission
      join public.tournament_matches as match
        on match.id = submission.match_id
      where match.generated_bracket_id = v_generated_bracket_id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      join public.tournament_matches as match
        on match.id = report_group.match_id
      where match.generated_bracket_id = v_generated_bracket_id
    ) then
    raise exception 'Pre-launch result activity blocks division launch';
  end if;

  v_launch_at := clock_timestamp();
  perform set_config(
    'ironclad.explicit_division_launch',
    'on',
    true
  );

  update public.tournament_brackets as bracket
  set launched_at = v_launch_at
  where bracket.id = p_tournament_bracket_id
    and bracket.launched_at is null;

  update public.generated_brackets
  set competition_locked_at = coalesce(
    competition_locked_at,
    v_launch_at
  )
  where id = v_generated_bracket_id;

  for v_waitlisted in
    select
      registration.id,
      registration.clerk_user_id,
      registration.waitlist_offer_status
    from public.registrations as registration
    where registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'waitlisted'
      and (
        registration.waitlist_offer_status is null
        or registration.waitlist_offer_status = 'offered'
      )
    order by registration.created_at, registration.id
    for update
  loop
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      tournament_id,
      tournament_title,
      registration_id,
      metadata
    )
    values (
      v_waitlisted.clerk_user_id,
      'player',
      'registration.waitlist_closed',
      'Tournament waitlist closed',
      'This tournament division has now started, and no place became available. Thank you for joining the waitlist. We hope to see you in the next IronClad tournament.',
      v_tournament_id,
      v_tournament_title,
      v_waitlisted.id,
      jsonb_build_object(
        'registrationId', v_waitlisted.id,
        'tournamentId', v_tournament_id,
        'bracketId', p_tournament_bracket_id,
        'bracketName', v_bracket_name,
        'launchedAt', v_launch_at
      )
    );

    if v_waitlisted.waitlist_offer_status = 'offered' then
      update public.registrations
      set
        waitlist_offer_status = 'cancelled',
        waitlist_offer_resolved_at = v_launch_at
      where id = v_waitlisted.id
        and registration_status = 'waitlisted'
        and waitlist_offer_status = 'offered';
    end if;
  end loop;

  update public.tournaments
  set
    status = 'in_progress',
    registration_enabled = case
      when exists (
        select 1
        from public.tournament_brackets as other_bracket
        where other_bracket.tournament_id = v_tournament_id
          and other_bracket.launched_at is null
      ) then registration_enabled
      else false
    end
  where id = v_tournament_id;

  tournament_id := v_tournament_id;
  tournament_bracket_id := p_tournament_bracket_id;
  launched_at := v_launch_at;
  already_launched := false;
  return next;
end;
$$;

alter function public.launch_tournament_division(uuid, text)
  owner to postgres;
revoke all on function public.launch_tournament_division(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.launch_tournament_division(uuid, text)
  to service_role;

create or replace function public.recompute_tournament_lifecycle_status(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_status text;
  v_bracket_count integer;
begin
  select tournament.status
  into v_current_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  if not found then
    return;
  end if;

  select count(*)::integer
  into v_bracket_count
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id;

  if v_bracket_count = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is null
  ) then
    if v_current_status = 'completed' then
      perform set_config(
        'ironclad.explicit_division_launch',
        'on',
        true
      );
      update public.tournaments
      set status = 'in_progress'
      where id = p_tournament_id;
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    left join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.tournament_id = p_tournament_id
      and (
        generated.id is null
        or public.is_generated_bracket_complete(generated.id)
          is distinct from true
      )
  ) then
    if v_current_status = 'completed' then
      perform set_config(
        'ironclad.explicit_division_launch',
        'on',
        true
      );
      update public.tournaments
      set status = 'in_progress'
      where id = p_tournament_id;
    end if;
    return;
  end if;

  update public.tournaments
  set
    status = 'completed',
    registration_enabled = false
  where id = p_tournament_id
    and status <> 'completed';
end;
$$;

alter function public.recompute_tournament_lifecycle_status(uuid)
  owner to postgres;
revoke all on function public.recompute_tournament_lifecycle_status(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_tournament_lifecycle_status(uuid)
  to service_role;

create or replace function public.preserve_tournament_bracket_roster_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
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
          registration.elo_verified_division = case old.name
            when 'Academy' then 'Academy'
            when 'Challenge' then 'Challenge'
            when 'Main' then 'Main / Pro'
            else null
          end
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
$$;

alter function public.preserve_tournament_bracket_roster_invariants()
  owner to postgres;
revoke all on function
  public.preserve_tournament_bracket_roster_invariants()
  from public, anon, authenticated;
grant execute on function
  public.preserve_tournament_bracket_roster_invariants()
  to service_role;

-- Reconcile any pre-existing unlaunched vacancies once when this migration is
-- applied. The bracket lock and null-to-offered transition make it idempotent.
do $$
declare
  v_bracket_id uuid;
begin
  for v_bracket_id in
    select bracket.id
    from public.tournament_brackets as bracket
    where bracket.launched_at is null
    order by bracket.id
  loop
    perform public.reconcile_tournament_waitlist(v_bracket_id);
  end loop;
end;
$$;

-- Reuse the repository's existing pg_cron deployment pattern. Acceptance
-- independently rejects at/after the deadline even if scheduling is absent.
do $$
declare
  v_job_id bigint;
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception when others then
    raise notice
      'pg_cron extension was not enabled automatically: %',
      sqlerrm;
  end;

  if to_regnamespace('cron') is null then
    raise notice
      'pg_cron is unavailable. Configure scheduled waitlist-offer expiry before deployment.';
    return;
  end if;

  for v_job_id in
    execute
      'select jobid from cron.job where jobname = $1'
    using 'ironclad-process-expired-waitlist-offers'
  loop
    execute 'select cron.unschedule($1)' using v_job_id;
  end loop;

  execute
    'select cron.schedule($1, $2, $3)'
  using
    'ironclad-process-expired-waitlist-offers',
    '* * * * *',
    'select public.process_expired_waitlist_offers(100);';
exception when others then
  raise notice
    'pg_cron waitlist-offer expiry job was not scheduled automatically: %',
    sqlerrm;
end;
$$;

commit;
