begin;

-- Keep the legacy registration_enabled column synchronized for compatibility,
-- but make tournaments.status the authoritative admin-controlled value.
update public.tournaments
set registration_enabled = (status = 'registration_open');

create or replace function public.sync_tournament_registration_enabled()
returns trigger
language plpgsql
as $$
begin
  new.registration_enabled = (new.status = 'registration_open');
  return new;
end;
$$;

drop trigger if exists tournaments_sync_registration_enabled
  on public.tournaments;
create trigger tournaments_sync_registration_enabled
before insert or update of status
on public.tournaments
for each row
execute function public.sync_tournament_registration_enabled();

create or replace function public.enforce_tournament_registration_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_registration_close_at timestamptz;
  v_start_date timestamptz;
  v_max_players integer;
  v_registered_players bigint;
begin
  if new.tournament_id is null or new.tournament_bracket_id is null then
    return new;
  end if;

  select
    tournament.status,
    tournament.registration_close_at,
    tournament.start_date,
    bracket.max_players
  into
    v_status,
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

  if v_status <> 'registration_open'
    or v_registration_close_at is null
    or v_start_date is null
    or now() > v_registration_close_at
    or now() >= v_start_date then
    raise exception 'Tournament registration is not available';
  end if;

  select count(*)
  into v_registered_players
  from public.registrations
  where tournament_bracket_id = new.tournament_bracket_id
    and registration_status <> 'rejected'
    and (tg_op = 'INSERT' or id <> new.id);

  if v_registered_players >= v_max_players then
    raise exception 'Tournament bracket is full';
  end if;

  return new;
end;
$$;

commit;
