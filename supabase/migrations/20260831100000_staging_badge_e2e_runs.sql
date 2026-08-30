begin;

create table ironclad_private.staging_badge_e2e_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_marker text not null unique
    check (run_marker ~ '^badge-e2e-[A-Za-z0-9-]{1,80}$'),
  mode text not null check (mode in ('main', 'badge20-bye')),
  status text not null default 'active'
    check (status in ('active', 'completed', 'failed', 'expired')),
  max_players integer not null check (max_players between 1 and 256),
  allocated_players integer not null default 0
    check (allocated_players between 0 and max_players),
  persistent_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (
    (mode = 'main' and max_players = 256)
    or (mode = 'badge20-bye' and max_players = 32)
  ),
  check (completed_at is null or status in ('completed', 'failed', 'expired'))
);

create table ironclad_private.staging_badge_e2e_players (
  run_id uuid not null references ironclad_private.staging_badge_e2e_runs(run_id)
    on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  semantic_role text not null,
  allocation_index integer not null check (allocation_index between 1 and 256),
  synthetic_elo integer not null check (synthetic_elo between 0 and 5000),
  synthetic_division text not null
    check (synthetic_division in ('Academy', 'Challenge', 'Main / Pro')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, semantic_role),
  unique (run_id, allocation_index),
  unique (run_id, player_id),
  check (semantic_role ~ '^[a-z0-9][a-z0-9-]{0,95}$')
);

alter table ironclad_private.staging_badge_e2e_runs enable row level security;
alter table ironclad_private.staging_badge_e2e_runs force row level security;
alter table ironclad_private.staging_badge_e2e_players enable row level security;
alter table ironclad_private.staging_badge_e2e_players force row level security;
revoke all on table ironclad_private.staging_badge_e2e_runs from public, anon, authenticated, service_role;
revoke all on table ironclad_private.staging_badge_e2e_players from public, anon, authenticated, service_role;

create index staging_badge_e2e_players_player_idx
  on ironclad_private.staging_badge_e2e_players(player_id);

-- Extend the existing allow-list with a run-scoped, bounded Badge namespace.
alter table ironclad_private.staging_synthetic_uat_players
  drop constraint if exists staging_synthetic_uat_players_approved_alias_check;
alter table ironclad_private.staging_synthetic_uat_players
  add constraint staging_synthetic_uat_players_approved_alias_check
  check (
    approved_alias ~ '^Test(Academy|Challenge|Main)([1-9]|10)$'
    or approved_alias ~ '^BadgeE2E-[A-Za-z0-9-]{1,80}-(Academy|Challenge|Main)([1-9][0-9]{0,2})$'
  );

create or replace function ironclad_private.staging_synthetic_uat_alias_definition(
  p_alias text
)
returns table(approved_alias text, synthetic_elo integer, synthetic_division text)
language sql immutable security definer set search_path = pg_catalog
as $$
  select candidate.approved_alias, candidate.synthetic_elo, candidate.synthetic_division
  from (
    values
      ('TestAcademy1',700,'Academy'),('TestAcademy2',750,'Academy'),('TestAcademy3',800,'Academy'),
      ('TestAcademy4',850,'Academy'),('TestAcademy5',900,'Academy'),('TestAcademy6',950,'Academy'),
      ('TestAcademy7',1000,'Academy'),('TestAcademy8',1050,'Academy'),('TestAcademy9',1075,'Academy'),
      ('TestAcademy10',1099,'Academy'),('TestChallenge1',1100,'Challenge'),('TestChallenge2',1150,'Challenge'),
      ('TestChallenge3',1200,'Challenge'),('TestChallenge4',1225,'Challenge'),('TestChallenge5',1250,'Challenge'),
      ('TestChallenge6',1275,'Challenge'),('TestChallenge7',1300,'Challenge'),('TestChallenge8',1350,'Challenge'),
      ('TestChallenge9',1375,'Challenge'),('TestChallenge10',1399,'Challenge'),('TestMain1',1400,'Main / Pro'),
      ('TestMain2',1450,'Main / Pro'),('TestMain3',1500,'Main / Pro'),('TestMain4',1550,'Main / Pro'),
      ('TestMain5',1600,'Main / Pro'),('TestMain6',1700,'Main / Pro'),('TestMain7',1800,'Main / Pro'),
      ('TestMain8',1900,'Main / Pro'),('TestMain9',2000,'Main / Pro'),('TestMain10',2200,'Main / Pro')
  ) as candidate(approved_alias, synthetic_elo, synthetic_division)
  where candidate.approved_alias = p_alias
  union all
  select p_alias,
    case r.groups[2] when 'Academy' then 700 + least(r.groups[3]::integer - 1, 399)
      when 'Challenge' then 1100 + least(r.groups[3]::integer - 1, 399)
      else 1400 + least(r.groups[3]::integer - 1, 3600) end,
    case r.groups[2] when 'Main' then 'Main / Pro' else r.groups[2] end
  from regexp_match(p_alias, '^BadgeE2E-[A-Za-z0-9-]{1,80}-(Academy|Challenge|Main)([1-9][0-9]{0,2})$') as r(groups)
  where r.groups is not null;
$$;
alter function ironclad_private.staging_synthetic_uat_alias_definition(text) owner to postgres;
revoke all on function ironclad_private.staging_synthetic_uat_alias_definition(text)
  from public, anon, authenticated, service_role;

create function public.begin_staging_badge_e2e_run(
  p_fixture_secret text,
  p_run_marker text,
  p_mode text
)
returns table(run_id uuid, run_marker text, mode text, max_players integer, allocated_players integer, status text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_run ironclad_private.staging_badge_e2e_runs%rowtype;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(p_fixture_secret);
  if p_run_marker is null or p_run_marker !~ '^badge-e2e-[A-Za-z0-9-]{1,80}$'
    or p_mode not in ('main', 'badge20-bye') then
    raise exception 'Badge E2E run request is invalid' using errcode = '22023';
  end if;
  insert into ironclad_private.staging_badge_e2e_runs(run_marker, mode, max_players, persistent_until)
  values (p_run_marker, p_mode, case when p_mode = 'main' then 256 else 32 end,
    case when p_mode = 'badge20-bye' then clock_timestamp() + interval '8 days' end)
  on conflict (run_marker) do update
    set run_marker = excluded.run_marker
  returning * into v_run;
  return query select v_run.run_id, v_run.run_marker, v_run.mode,
    v_run.max_players, v_run.allocated_players, v_run.status;
end;
$$;
alter function public.begin_staging_badge_e2e_run(text, text, text) owner to postgres;
revoke all on function public.begin_staging_badge_e2e_run(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.begin_staging_badge_e2e_run(text, text, text) to service_role;

create function public.provision_staging_badge_e2e_player(
  p_fixture_secret text,
  p_run_marker text,
  p_semantic_role text,
  p_division text
)
returns table(run_id uuid, player_id uuid, semantic_role text, allocation_index integer,
  synthetic_elo integer, synthetic_division text, created boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_run ironclad_private.staging_badge_e2e_runs%rowtype;
  v_existing ironclad_private.staging_badge_e2e_players%rowtype;
  v_alias text; v_clerk text; v_index integer; v_elo integer; v_division text;
  v_player record; v_result record;
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(p_fixture_secret);
  if p_semantic_role is null or p_semantic_role !~ '^[a-z0-9][a-z0-9-]{0,95}$'
    or p_division not in ('Academy', 'Challenge', 'Main') then
    raise exception 'Badge E2E fixture request is invalid' using errcode = '22023';
  end if;
  select * into v_run from ironclad_private.staging_badge_e2e_runs
    where run_marker = p_run_marker for update;
  if not found or v_run.status <> 'active' then
    raise exception 'Badge E2E run is unavailable' using errcode = 'P0002';
  end if;
  select * into v_existing from ironclad_private.staging_badge_e2e_players
    where run_id = v_run.run_id and semantic_role = p_semantic_role;
  if found then
    return query select v_existing.run_id, v_existing.player_id, v_existing.semantic_role,
      v_existing.allocation_index, v_existing.synthetic_elo, v_existing.synthetic_division, false;
    return;
  end if;
  if v_run.mode = 'badge20-bye' and v_run.allocated_players >= 32
    or v_run.mode = 'main' and v_run.allocated_players >= 256 then
    raise exception 'Badge E2E player capacity exceeded' using errcode = '22023';
  end if;
  v_index := v_run.allocated_players + 1;
  v_division := case p_division when 'Main' then 'Main / Pro' else p_division end;
  v_elo := case p_division when 'Academy' then 700 + least(v_index - 1, 399)
    when 'Challenge' then 1100 + least(v_index - 1, 399)
    else 1400 + least(v_index - 1, 3600) end;
  v_alias := 'BadgeE2E-' || p_run_marker || '-' || p_division || v_index::text;
  v_clerk := 'user_' || encode(digest(v_run.run_marker || ':' || p_semantic_role, 'sha256'), 'hex');
  select * into v_result from public.provision_staging_synthetic_uat_player(
    p_fixture_secret, v_alias, v_clerk);
  update ironclad_private.staging_badge_e2e_runs
    set allocated_players = allocated_players + 1 where run_id = v_run.run_id;
  insert into ironclad_private.staging_badge_e2e_players
    (run_id, player_id, semantic_role, allocation_index, synthetic_elo, synthetic_division)
  values (v_run.run_id, v_result.player_id, p_semantic_role, v_index, v_elo, v_division);
  return query select v_run.run_id, v_result.player_id, p_semantic_role, v_index, v_elo, v_division, true;
end;
$$;
alter function public.provision_staging_badge_e2e_player(text, text, text, text) owner to postgres;
revoke all on function public.provision_staging_badge_e2e_player(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.provision_staging_badge_e2e_player(text, text, text, text) to service_role;

create function public.inspect_staging_badge_e2e_run(p_fixture_secret text, p_run_marker text)
returns table(run_id uuid, run_marker text, mode text, status text, max_players integer,
  allocated_players integer, remaining_capacity integer, created_at timestamptz, persistent_until timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform ironclad_private.assert_staging_synthetic_uat_access(p_fixture_secret);
  return query select run.run_id, run.run_marker, run.mode, run.status, run.max_players,
    run.allocated_players, run.max_players - run.allocated_players, run.created_at, run.persistent_until
  from ironclad_private.staging_badge_e2e_runs run where run.run_marker = p_run_marker;
end;
$$;
alter function public.inspect_staging_badge_e2e_run(text, text) owner to postgres;
revoke all on function public.inspect_staging_badge_e2e_run(text, text) from public, anon, authenticated, service_role;
grant execute on function public.inspect_staging_badge_e2e_run(text, text) to service_role;

commit;
