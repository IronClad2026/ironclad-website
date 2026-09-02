-- Disposable, local-only setup for cross-session unlaunched Void races.
-- The companion PowerShell harness always invokes cleanup in a finally block.

\set ON_ERROR_STOP on

set client_min_messages = warning;
set role postgres;

do $$
begin
  if current_database() !~ '^ironclad_void_[a-zA-Z0-9_]+$'
    or coalesce(pg_catalog.host(pg_catalog.inet_server_addr()), 'local-socket')
      not in ('127.0.0.1', '::1', 'local-socket') then
    raise exception
      'Unlaunched Void concurrency setup is restricted to a local disposable database';
  end if;

  if exists (
    select 1
    from public.tournaments as tournament
    where tournament.id in (
      'e2100000-0000-4000-8000-000000000001',
      'e2100000-0000-4000-8000-000000000002',
      'e2100000-0000-4000-8000-000000000003',
      'e2100000-0000-4000-8000-000000000004',
      'e2100000-0000-4000-8000-000000000005',
      'e2100000-0000-4000-8000-000000000006'
    )
      or tournament.slug like 'unlaunched-void-concurrency-%'
  )
    or exists (
      select 1
      from public.legal_documents as document
      where document.version like 'NON-PRODUCTION-VOID-CONCURRENCY-%'
    )
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_advisory_lock_is_held(bigint)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_review_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_generate_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_launch_with_pause(uuid,bigint,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_void_with_pause(uuid,bigint,integer)'
    ) is not null then
    raise exception
      'Unlaunched Void concurrency canary already exists; run cleanup first';
  end if;
end;
$$;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_catalog.set_config('session_replication_role', 'replica', true);

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  steam_id64,
  steam_username,
  profile_completed
)
select
  ('e2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-concurrency-player-' || number,
  'Unlaunched Void Concurrency Player ' || number,
  'VoidRace' || number,
  case
    when number = 18 then '76561198000092018'
    else null
  end,
  case
    when number = 18 then 'VoidRaceSteam18'
    else null
  end,
  true
from pg_catalog.generate_series(1, 26) as number;

insert into public.legal_documents (
  id,
  document_kind,
  version,
  immutable_url,
  status,
  published_at,
  effective_at,
  sha256
)
values
  (
    'e2400000-0000-4000-8000-000000000001',
    'rulebook',
    'NON-PRODUCTION-VOID-CONCURRENCY-RULEBOOK',
    'https://example.invalid/unlaunched-void-concurrency/rulebook',
    'effective',
    '2026-01-01 00:00:00+00',
    '2026-01-02 00:00:00+00',
    repeat('1', 64)
  ),
  (
    'e2400000-0000-4000-8000-000000000002',
    'ppa',
    'NON-PRODUCTION-VOID-CONCURRENCY-PPA',
    'https://example.invalid/unlaunched-void-concurrency/ppa',
    'effective',
    '2026-01-01 00:00:00+00',
    '2026-01-02 00:00:00+00',
    repeat('2', 64)
  ),
  (
    'e2400000-0000-4000-8000-000000000003',
    'terms',
    'NON-PRODUCTION-VOID-CONCURRENCY-TERMS',
    'https://example.invalid/unlaunched-void-concurrency/terms',
    'effective',
    '2026-01-01 00:00:00+00',
    '2026-01-02 00:00:00+00',
    repeat('3', 64)
  ),
  (
    'e2400000-0000-4000-8000-000000000004',
    'privacy',
    'NON-PRODUCTION-VOID-CONCURRENCY-PRIVACY',
    'https://example.invalid/unlaunched-void-concurrency/privacy',
    'effective',
    '2026-01-01 00:00:00+00',
    '2026-01-02 00:00:00+00',
    repeat('4', 64)
  );

insert into public.tournaments (
  id,
  title,
  slug,
  format,
  status,
  description,
  banner_image_url,
  prize_pool,
  registration_enabled,
  first_completed_at
)
values
  (
    'e2100000-0000-4000-8000-000000000001',
    'Unlaunched Void Registration Race',
    'unlaunched-void-concurrency-registration',
    '1v1',
    'registration_open',
    'Disposable local registration-versus-Void race.',
    '',
    '',
    true,
    null
  ),
  (
    'e2100000-0000-4000-8000-000000000002',
    'Unlaunched Void Generation Race',
    'unlaunched-void-concurrency-generation',
    '1v1',
    'registration_open',
    'Disposable local generation-versus-Void race.',
    '',
    '',
    true,
    null
  ),
  (
    'e2100000-0000-4000-8000-000000000003',
    'Unlaunched Void Launch Race',
    'unlaunched-void-concurrency-launch',
    '1v1',
    'registration_open',
    'Disposable local launch-versus-Void race.',
    '',
    '',
    true,
    null
  ),
  (
    'e2100000-0000-4000-8000-000000000004',
    'Unlaunched Void Registration Submission Inverse Race',
    'unlaunched-void-concurrency-registration-inverse',
    '1v1',
    'registration_open',
    'Disposable local Void-first registration race.',
    '',
    '',
    true,
    null
  ),
  (
    'e2100000-0000-4000-8000-000000000005',
    'Unlaunched Void Generation Inverse Race',
    'unlaunched-void-concurrency-generation-inverse',
    '1v1',
    'registration_open',
    'Disposable local Void-first generation race.',
    '',
    '',
    true,
    null
  ),
  (
    'e2100000-0000-4000-8000-000000000006',
    'Unlaunched Void Launch Inverse Race',
    'unlaunched-void-concurrency-launch-inverse',
    '1v1',
    'registration_open',
    'Disposable local Void-first launch race.',
    '',
    '',
    true,
    null
  );

insert into public.tournament_brackets (
  id,
  tournament_id,
  name,
  elo_rules,
  max_players,
  launched_at,
  map_pool_published_at
)
values
  (
    'e2200000-0000-4000-8000-000000000001',
    'e2100000-0000-4000-8000-000000000001',
    'Academy',
    '0-1099',
    8,
    null,
    null
  ),
  (
    'e2200000-0000-4000-8000-000000000002',
    'e2100000-0000-4000-8000-000000000002',
    'Academy',
    '0-1099',
    8,
    null,
    null
  ),
  (
    'e2200000-0000-4000-8000-000000000003',
    'e2100000-0000-4000-8000-000000000003',
    'Academy',
    '0-1099',
    8,
    null,
    '2298-02-03 00:00:00+00'
  ),
  (
    'e2200000-0000-4000-8000-000000000004',
    'e2100000-0000-4000-8000-000000000004',
    'Academy',
    '0-1099',
    8,
    null,
    null
  ),
  (
    'e2200000-0000-4000-8000-000000000005',
    'e2100000-0000-4000-8000-000000000005',
    'Academy',
    '0-1099',
    8,
    null,
    null
  ),
  (
    'e2200000-0000-4000-8000-000000000006',
    'e2100000-0000-4000-8000-000000000006',
    'Academy',
    '0-1099',
    8,
    null,
    null
  );

insert into public.tournament_bracket_map_pool_entries (
  tournament_bracket_id,
  coh3_map_id,
  added_at
)
select
  'e2200000-0000-4000-8000-000000000003',
  map.id,
  '2298-02-03 00:00:00+00'
from public.coh3_maps as map
where map.status = 'active'
  and map.game_mode = '1v1'
order by map.id
limit 5;

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at,
  waitlist_offer_status,
  waitlist_offer_created_at,
  waitlist_offer_expires_at,
  waitlist_offer_resolved_at
)
values (
  'e2300000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'unlaunched-void-concurrency-player-1',
  'Registration Race Player',
  'Unlaunched Void Registration Race',
  'Academy',
  'waitlisted',
  'pending',
  '',
  'e2100000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000001',
  '2298-02-01 00:00:00+00',
  'offered',
  '2298-02-01 01:00:00+00',
  '2298-02-02 01:00:00+00',
  null
);

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at
)
select
  ('e2300000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('e2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-concurrency-player-' || number,
  'Generation Race Player ' || number,
  'Unlaunched Void Generation Race',
  'Academy',
  'approved',
  'pending',
  '',
  'e2100000-0000-4000-8000-000000000002',
  'e2200000-0000-4000-8000-000000000002',
  '2298-02-02 00:00:00+00'::timestamptz
    + number * interval '1 second'
from pg_catalog.generate_series(2, 9) as number;

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at
)
select
  ('e2300000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('e2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-concurrency-player-' || number,
  'Launch Race Player ' || number,
  'Unlaunched Void Launch Race',
  'Academy',
  'approved',
  'pending',
  '',
  'e2100000-0000-4000-8000-000000000003',
  'e2200000-0000-4000-8000-000000000003',
  '2298-02-03 00:00:00+00'::timestamptz
    + number * interval '1 second'
from pg_catalog.generate_series(10, 17) as number;

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at
)
select
  ('e2300000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('e2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-concurrency-player-' || number,
  'Generation Inverse Race Player ' || number,
  'Unlaunched Void Generation Inverse Race',
  'Academy',
  'approved',
  'pending',
  '',
  'e2100000-0000-4000-8000-000000000005',
  'e2200000-0000-4000-8000-000000000005',
  '2298-02-05 00:00:00+00'::timestamptz
    + number * interval '1 second'
from pg_catalog.generate_series(19, 26) as number;

insert into public.registrations (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  created_at
)
select
  ('e2500000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  ('e2000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  'unlaunched-void-concurrency-player-' || number,
  'Launch Inverse Race Player ' || number,
  'Unlaunched Void Launch Inverse Race',
  'Academy',
  'approved',
  'pending',
  '',
  'e2100000-0000-4000-8000-000000000006',
  'e2200000-0000-4000-8000-000000000006',
  '2298-02-06 00:00:00+00'::timestamptz
    + number * interval '1 second'
from pg_catalog.generate_series(19, 26) as number;

select pg_catalog.set_config('session_replication_role', 'origin', true);
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"test:unlaunched-void-concurrency"}',
  true
);

-- Prepare the launch contender through the real generation and assignment
-- authorities. The generation contender intentionally remains draft-free.
do $$
declare
  v_generated_bracket_id uuid;
  v_assignments jsonb;
begin
  v_generated_bracket_id := public.generate_tournament_bracket(
    'e2200000-0000-4000-8000-000000000003',
    'test:unlaunched-void-concurrency'
  );

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'slot_number',
      slot_number,
      'registration_id',
      (
        'e2300000-0000-4000-8000-'
          || lpad((slot_number + 9)::text, 12, '0')
      )::uuid
    )
    order by slot_number
  )
  into v_assignments
  from pg_catalog.generate_series(1, 8) as slot_number;

  perform public.save_bracket_assignments(
    v_generated_bracket_id,
    v_assignments,
    'test:unlaunched-void-concurrency'
  );
end;
$$;

create function public.unlaunched_void_test_advisory_lock_is_held(
  p_lock_key bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.pg_try_advisory_lock(p_lock_key) then
    perform pg_catalog.pg_advisory_unlock(p_lock_key);
    return false;
  end if;
  return true;
end;
$$;

create function public.unlaunched_void_test_review_with_pause(
  p_registration_id uuid,
  p_lock_key bigint,
  p_delay_milliseconds integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_bracket_id uuid;
  v_rows integer;
begin
  if p_delay_milliseconds not between 100 and 10000 then
    raise exception 'Invalid concurrency pause';
  end if;

  select registration.tournament_bracket_id
  into strict v_bracket_id
  from public.registrations as registration
  where registration.id = p_registration_id;

  -- Match the supported review authority's bracket-first order.
  perform bracket.id
  from public.tournament_brackets as bracket
  where bracket.id = v_bracket_id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(p_delay_milliseconds::double precision / 1000);

  select count(*)::integer
  into v_rows
  from public.review_tournament_registration(
    p_registration_id,
    'rejected',
    'Rollback-only registration race winner.'
  );

  if v_rows <> 1 then
    raise exception 'Registration review contender returned no row';
  end if;
  return 'reviewed';
end;
$$;

create function public.unlaunched_void_test_generate_with_pause(
  p_tournament_bracket_id uuid,
  p_lock_key bigint,
  p_delay_milliseconds integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_generated_bracket_id uuid;
begin
  if p_delay_milliseconds not between 100 and 10000 then
    raise exception 'Invalid concurrency pause';
  end if;

  -- Match the supported generation authority's bracket-first order.
  perform bracket.id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(p_delay_milliseconds::double precision / 1000);

  v_generated_bracket_id := public.generate_tournament_bracket(
    p_tournament_bracket_id,
    'test:unlaunched-void-concurrency'
  );
  return v_generated_bracket_id;
end;
$$;

create function public.unlaunched_void_test_launch_with_pause(
  p_tournament_bracket_id uuid,
  p_lock_key bigint,
  p_delay_milliseconds integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_rows integer;
begin
  if p_delay_milliseconds not between 100 and 10000 then
    raise exception 'Invalid concurrency pause';
  end if;

  select bracket.tournament_id
  into strict v_tournament_id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id;

  -- Match the supported launch authority's tournament-first order.
  perform tournament.id
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for no key update;

  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(p_delay_milliseconds::double precision / 1000);

  select count(*)::integer
  into v_rows
  from public.launch_tournament_division(
    p_tournament_bracket_id,
    'test:unlaunched-void-concurrency'
  );

  if v_rows <> 1 then
    raise exception 'Division launch contender returned no row';
  end if;
  return 'launched';
end;
$$;

create function public.unlaunched_void_test_void_with_pause(
  p_tournament_id uuid,
  p_lock_key bigint,
  p_delay_milliseconds integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if p_delay_milliseconds not between 100 and 10000 then
    raise exception 'Invalid concurrency pause';
  end if;

  -- Hold the same parent-before-child order used by the supported Void
  -- authority, then invoke that authority in this transaction after the
  -- competing session has begun from a stale open-state snapshot.
  perform tournament.id
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  perform bracket.id
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id
  order by bracket.id
  for update;

  perform registration.id
  from public.registrations as registration
  where registration.tournament_id = p_tournament_id
    and registration.registration_status = 'waitlisted'
    and registration.waitlist_offer_status = 'offered'
  order by registration.id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(p_delay_milliseconds::double precision / 1000);

  v_result := public.void_tournament(
    p_tournament_id,
    'Rollback-only Void-first concurrency winner',
    'test:unlaunched-void-concurrency'
  );

  if v_result ->> 'outcome' <> 'voided' then
    raise exception 'Void-first contender returned an unexpected outcome';
  end if;

  return 'voided';
end;
$$;

alter function public.unlaunched_void_test_advisory_lock_is_held(bigint)
  owner to postgres;
alter function public.unlaunched_void_test_review_with_pause(
  uuid, bigint, integer
) owner to postgres;
alter function public.unlaunched_void_test_generate_with_pause(
  uuid, bigint, integer
) owner to postgres;
alter function public.unlaunched_void_test_launch_with_pause(
  uuid, bigint, integer
) owner to postgres;
alter function public.unlaunched_void_test_void_with_pause(
  uuid, bigint, integer
) owner to postgres;

revoke all on function
  public.unlaunched_void_test_advisory_lock_is_held(bigint)
  from public, anon, authenticated, service_role;
revoke all on function
  public.unlaunched_void_test_review_with_pause(uuid, bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.unlaunched_void_test_generate_with_pause(uuid, bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.unlaunched_void_test_launch_with_pause(uuid, bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.unlaunched_void_test_void_with_pause(uuid, bigint, integer)
  from public, anon, authenticated, service_role;

commit;

do $$
begin
  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = 'e2300000-0000-4000-8000-000000000001'
      and registration.registration_status = 'waitlisted'
      and registration.waitlist_offer_status = 'offered'
  )
    or not exists (
      select 1
      from public.tournament_brackets as bracket
      where bracket.id = 'e2200000-0000-4000-8000-000000000002'
        and bracket.launched_at is null
        and not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
    )
    or not exists (
      select 1
      from public.tournament_brackets as bracket
      join public.generated_brackets as generated
        on generated.tournament_bracket_id = bracket.id
      where bracket.id = 'e2200000-0000-4000-8000-000000000003'
        and bracket.launched_at is null
        and public.is_generated_bracket_populated(generated.id) is true
    )
    or (
      select count(*)
      from public.tournaments as tournament
      join public.tournament_brackets as bracket
        on bracket.tournament_id = tournament.id
      where tournament.id in (
        'e2100000-0000-4000-8000-000000000004',
        'e2100000-0000-4000-8000-000000000005',
        'e2100000-0000-4000-8000-000000000006'
      )
        and tournament.status = 'registration_open'
        and tournament.terminal_at is null
        and bracket.launched_at is null
        and not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
    ) <> 3
    or (
      select count(*)
      from public.registrations as registration
      where registration.tournament_id =
        'e2100000-0000-4000-8000-000000000005'
        and registration.registration_status = 'approved'
    ) <> 8
    or (
      select count(*)
      from public.registrations as registration
      where registration.tournament_id =
        'e2100000-0000-4000-8000-000000000006'
        and registration.registration_status = 'approved'
    ) <> 8
    or not exists (
      select 1
      from public.players as player
      where player.id = 'e2000000-0000-4000-8000-000000000018'
        and player.steam_id64 = '76561198000092018'
        and player.profile_completed
    )
    or (
      select count(*)
      from public.legal_documents as document
      where document.version like 'NON-PRODUCTION-VOID-CONCURRENCY-%'
        and document.status = 'effective'
    ) <> 4
    or pg_catalog.to_regprocedure(
      'public.unlaunched_void_test_void_with_pause(uuid,bigint,integer)'
    ) is null
    then
    raise exception 'Unlaunched Void concurrency setup is incomplete';
  end if;
end;
$$;
