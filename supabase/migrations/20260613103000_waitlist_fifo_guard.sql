begin;

drop function if exists public.get_tournament_bracket_capacity();

create function public.get_tournament_bracket_capacity()
returns table (
  bracket_id uuid,
  tournament_id uuid,
  registered_players bigint,
  waitlisted_players bigint,
  max_players integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bracket.id as bracket_id,
    bracket.tournament_id,
    count(registration.id) filter (
      where registration.registration_status = 'approved'
    ) as registered_players,
    count(registration.id) filter (
      where registration.registration_status = 'waitlisted'
    ) as waitlisted_players,
    bracket.max_players
  from public.tournament_brackets as bracket
  left join public.registrations as registration
    on registration.tournament_bracket_id = bracket.id
  group by bracket.id, bracket.tournament_id, bracket.max_players;
$$;

revoke all on function public.get_tournament_bracket_capacity() from public;
grant execute on function public.get_tournament_bracket_capacity()
  to anon, authenticated, service_role;

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
begin
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
      );
  end if;

  if v_requires_open_check
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
