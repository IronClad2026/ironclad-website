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
  v_registration_close_at timestamptz;
  v_start_date timestamptz;
  v_max_players integer;
  v_registered_players bigint;
  v_registration_moved boolean;
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
    tournament.registration_close_at,
    tournament.start_date,
    bracket.max_players
  into
    v_status,
    v_registration_open_at,
    v_registration_close_at,
    v_start_date,
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
    v_registration_moved := true;
  else
    v_registration_moved :=
      old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from
        new.tournament_bracket_id
      or (
        old.registration_status = 'rejected'
        and new.registration_status <> 'rejected'
      );
  end if;

  if v_registration_moved
    and (
      v_status <> 'registration_open'
      or (
        v_registration_open_at is not null
        and now() < v_registration_open_at
      )
      or v_registration_close_at is null
      or v_start_date is null
      or now() > v_registration_close_at
      or now() >= v_start_date
    ) then
    raise exception 'Tournament registration is not available';
  end if;

  select count(*)
  into v_registered_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and registration_status <> 'rejected'
    and (tg_op = 'INSERT' or id <> new.id);

  if v_registered_players >= v_max_players then
    raise exception
      'Tournament bracket is full: capacity is %, with % other active registrations',
      v_max_players,
      v_registered_players;
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_enforce_tournament_availability
  on public.registrations;
create trigger registrations_enforce_tournament_availability
before insert or update of
  tournament_id,
  tournament_bracket_id,
  registration_status
on public.registrations
for each row
execute function public.enforce_tournament_registration_availability();

commit;
