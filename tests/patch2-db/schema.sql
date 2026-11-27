-- Minimal local harness only. The actual review authority is loaded from its
-- committed migration. No capacity, ELO, FIFO, notification, or Supabase RLS
-- trigger is simulated here.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

create table public.tournament_brackets (
  id uuid primary key,
  tournament_id uuid not null,
  launched_at timestamptz
);
create table public.registrations (
  id uuid primary key,
  tournament_id uuid,
  tournament_bracket_id uuid,
  clerk_user_id text not null,
  registration_status text not null check (registration_status in (
    'pending', 'manual_review', 'approved', 'rejected', 'waitlisted', 'withdrawn'
  )),
  waitlist_offer_status text,
  waitlist_offer_resolved_at timestamptz,
  admin_notes text not null default '',
  created_at timestamptz not null
);

-- Instrumentation records actual successful UPDATE order, not domain behavior.
create table public.patch2_update_observations (
  sequence_number bigint generated always as identity,
  registration_id uuid not null,
  status text not null
);
create function public.patch2_observe_registration_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  insert into public.patch2_update_observations(registration_id, status)
  values (new.id, new.registration_status);
  return new;
end;
$$;
create trigger patch2_observe_update after update on public.registrations
for each row execute function public.patch2_observe_registration_update();
