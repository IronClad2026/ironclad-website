-- Prepared locally for Patch 2.0 Phase 1. No data backfill or domain-rule rewrite.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function public.review_tournament_registration_scoped(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_registration_status text,
  p_admin_notes text default null
)
returns table (
  registration_id uuid, tournament_id uuid,
  tournament_bracket_id uuid, registration_status text
)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_bracket_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_tournament_id is null or p_registration_id is null then
    raise exception 'Tournament context is required' using errcode = '22023';
  end if;
  select r.tournament_bracket_id into v_bracket_id
  from public.registrations r
  where r.id = p_registration_id and r.tournament_id = p_tournament_id;
  -- Match the existing authority's bracket-before-registration lock order.
  perform b.id from public.tournament_brackets b
  where b.id = v_bracket_id and b.tournament_id = p_tournament_id for update;
  if not found then
    raise exception 'Registration is not in the selected tournament' using errcode = '22023';
  end if;
  perform r.id from public.registrations r
  where r.id = p_registration_id and r.tournament_id = p_tournament_id
    and r.tournament_bracket_id = v_bracket_id for update;
  if not found then
    raise exception 'Registration is not in the selected tournament' using errcode = '22023';
  end if;
  return query select * from public.review_tournament_registration(
    p_registration_id, p_registration_status, p_admin_notes
  );
end;
$$;

create or replace function public.approve_tournament_registrations_scoped(
  p_tournament_id uuid, p_registration_ids uuid[]
)
returns table (registration_id uuid, error_message text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_registration record;
  v_expected integer := cardinality(p_registration_ids);
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_tournament_id is null or v_expected is null or v_expected not between 1 and 100
    or array_position(p_registration_ids, null) is not null
    or (select count(distinct id) from unnest(p_registration_ids) id) <> v_expected then
    raise exception 'Select between 1 and 100 distinct registrations in a tournament' using errcode = '22023';
  end if;
  select count(*) into v_count
  from public.registrations r join public.tournament_brackets b
    on b.id = r.tournament_bracket_id and b.tournament_id = r.tournament_id
  where r.id = any(p_registration_ids) and r.tournament_id = p_tournament_id;
  if v_count <> v_expected then
    raise exception 'Every selected registration must belong to the selected tournament' using errcode = '22023';
  end if;
  -- Lock all relevant brackets in a stable order before locking registrations.
  perform b.id from public.tournament_brackets b
  where b.tournament_id = p_tournament_id and b.id in (
    select r.tournament_bracket_id from public.registrations r
    where r.id = any(p_registration_ids) and r.tournament_id = p_tournament_id
  ) order by b.id for update;
  perform r.id from public.registrations r
  where r.id = any(p_registration_ids) order by r.id for update;
  -- Repeat complete validation under locks, outside per-row error handling.
  select count(*) into v_count
  from public.registrations r join public.tournament_brackets b
    on b.id = r.tournament_bracket_id and b.tournament_id = r.tournament_id
  where r.id = any(p_registration_ids) and r.tournament_id = p_tournament_id;
  if v_count <> v_expected then
    raise exception 'The tournament selection changed; select again' using errcode = '22023';
  end if;
  for v_registration in
    select r.id, r.registration_status from public.registrations r
    where r.id = any(p_registration_ids) and r.tournament_id = p_tournament_id
    order by r.created_at, r.id
  loop
    registration_id := v_registration.id;
    error_message := null;
    if v_registration.registration_status = 'approved' then
      error_message := 'registration is already approved';
    elsif v_registration.registration_status = 'waitlisted' then
      error_message := 'the player must accept a FIFO spot offer before administrator approval';
    elsif v_registration.registration_status = 'withdrawn' then
      error_message := 'withdrawal is final for this tournament';
    elsif v_registration.registration_status = 'rejected' then
      error_message := 'rejected registrations require individual administrator review';
    elsif v_registration.registration_status not in ('pending', 'manual_review') then
      error_message := 'registration is not eligible for bulk approval';
    else
      begin
        perform * from public.review_tournament_registration_scoped(
          p_tournament_id, v_registration.id, 'approved', null
        );
      exception when others then
        error_message := sqlerrm;
      end;
    end if;
    return next;
  end loop;
end;
$$;

alter function public.review_tournament_registration_scoped(uuid, uuid, text, text) owner to postgres;
alter function public.approve_tournament_registrations_scoped(uuid, uuid[]) owner to postgres;
revoke all on function public.review_tournament_registration_scoped(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_tournament_registrations_scoped(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.review_tournament_registration_scoped(uuid, uuid, text, text) to service_role;
grant execute on function public.approve_tournament_registrations_scoped(uuid, uuid[]) to service_role;
commit;
