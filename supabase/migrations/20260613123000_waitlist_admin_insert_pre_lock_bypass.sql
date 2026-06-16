begin;

create or replace function public.enforce_tournament_registration_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_registration_open_at timestamptz;
  v_max_players integer;
  v_approved_players bigint;
  v_waitlisted_players bigint;
  v_older_waitlisted_exists boolean;
  v_requires_open_check boolean;
  v_new_roster_locked boolean := false;
  v_old_roster_locked boolean := false;
  v_pre_lock_waitlist_promotion boolean := false;
  v_pre_lock_admin_roster_management boolean := false;
  v_is_service_role boolean;
begin
  if tg_op = 'UPDATE'
    and old.tournament_id is not distinct from new.tournament_id
    and old.tournament_bracket_id is not distinct from
      new.tournament_bracket_id
    and old.registration_status is not distinct from
      new.registration_status then
    return new;
  end if;

  v_is_service_role := coalesce(auth.role(), '') = 'service_role';

  if tg_op = 'UPDATE'
    and old.registration_status = 'approved'
    and old.tournament_id is not null
    and old.tournament_bracket_id is not null then
    v_old_roster_locked :=
      public.is_tournament_bracket_roster_locked(old.tournament_bracket_id);

    if (
      new.registration_status <> 'approved'
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
    )
      and v_old_roster_locked then
      raise exception
        'Tournament bracket roster is locked after bracket generation';
    end if;
  end if;

  if new.registration_status = 'rejected' then
    return new;
  end if;

  if new.tournament_id is null or new.tournament_bracket_id is null then
    return new;
  end if;

  select
    tournament.status,
    tournament.registration_open_at,
    bracket.max_players
  into
    v_status,
    v_registration_open_at,
    v_max_players
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = new.tournament_bracket_id
    and tournament.id = new.tournament_id
  for update of bracket;

  if not found then
    raise exception 'Selected tournament bracket does not exist';
  end if;

  v_new_roster_locked :=
    public.is_tournament_bracket_roster_locked(new.tournament_bracket_id);

  if new.registration_status in (
    'pending',
    'manual_review',
    'waitlisted',
    'approved'
  )
    and v_new_roster_locked then
    if tg_op = 'INSERT'
      or old.registration_status is distinct from new.registration_status
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id then
      raise exception
        'Tournament bracket roster is locked after bracket generation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_pre_lock_admin_roster_management :=
      v_is_service_role
      and v_new_roster_locked is false
      and new.registration_status in (
        'pending',
        'manual_review',
        'waitlisted',
        'approved'
      );
  end if;

  if tg_op = 'UPDATE' then
    v_pre_lock_waitlist_promotion :=
      old.registration_status = 'waitlisted'
      and new.registration_status = 'approved'
      and old.tournament_id is not distinct from new.tournament_id
      and old.tournament_bracket_id is not distinct from
        new.tournament_bracket_id
      and v_new_roster_locked is false;

    v_pre_lock_admin_roster_management :=
      v_is_service_role
      and v_new_roster_locked is false
      and v_old_roster_locked is false
      and (
        old.tournament_id is distinct from new.tournament_id
        or old.tournament_bracket_id is distinct from
          new.tournament_bracket_id
        or old.registration_status is distinct from
          new.registration_status
      )
      and (
        old.registration_status in (
          'pending',
          'manual_review',
          'waitlisted',
          'approved'
        )
        or new.registration_status in (
          'pending',
          'manual_review',
          'waitlisted',
          'approved'
        )
      );
  end if;

  if tg_op = 'INSERT' then
    v_requires_open_check := true;
  else
    v_requires_open_check :=
      old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
      or (
        old.registration_status = 'rejected'
        and new.registration_status <> 'rejected'
      )
      or (
        old.registration_status is distinct from new.registration_status
        and new.registration_status in (
          'pending',
          'manual_review',
          'approved',
          'waitlisted'
        )
      );
  end if;

  if v_requires_open_check
    and v_pre_lock_waitlist_promotion is false
    and v_pre_lock_admin_roster_management is false
    and (
      v_status <> 'registration_open'
      or (
        v_registration_open_at is not null
        and now() < v_registration_open_at
      )
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  select
    count(*) filter (where registration_status = 'approved'),
    count(*) filter (where registration_status = 'waitlisted')
  into
    v_approved_players,
    v_waitlisted_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and id <> new.id;

  select exists (
    select 1
    from public.registrations as registration
    where registration.tournament_bracket_id = new.tournament_bracket_id
      and registration.registration_status = 'waitlisted'
      and registration.id <> new.id
      and (
        registration.created_at < new.created_at
        or (
          registration.created_at = new.created_at
          and registration.id::text < new.id::text
        )
      )
  )
  into v_older_waitlisted_exists;

  if new.registration_status = 'approved'
    and v_older_waitlisted_exists then
    raise exception
      'Cannot approve this registration before older waitlisted registrations for the same bracket';
  end if;

  if new.registration_status = 'approved'
    and v_approved_players >= v_max_players then
    raise exception
      'Tournament bracket is full: capacity is %, with % approved registrations',
      v_max_players,
      v_approved_players;
  end if;

  if new.registration_status in ('pending', 'waitlisted') then
    if v_approved_players >= v_max_players
      or (
        tg_op = 'INSERT'
        and v_waitlisted_players > 0
      )
      or (
        tg_op = 'UPDATE'
        and new.registration_status = 'pending'
        and v_older_waitlisted_exists
      ) then
      new.registration_status = 'waitlisted';
    elsif tg_op = 'INSERT' then
      new.registration_status = 'pending';
    end if;
  end if;

  return new;
end;
$$;

commit;
