begin;

create table ironclad_private.badge_reconciliation_targets (
  target_id uuid primary key default pg_catalog.gen_random_uuid(),
  player_id uuid not null unique
    references public.players(id) on delete cascade,
  reason text not null check (
    reason in (
      'profile_write',
      'steam_identity',
      'relic_snapshot',
      'match_finalization',
      'match_authority',
      'tournament_completion',
      'leaderboard_recalculation',
      'season_finalization',
      'evaluation_failure',
      'manual_recovery'
    )
  ),
  source_type text check (
    source_type is null
    or source_type in ('profile', 'match', 'tournament', 'season', 'system')
  ),
  source_id text check (
    source_id is null
    or (
      char_length(source_id) between 1 and 160
      and source_id !~ '[[:cntrl:]]'
    )
  ),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed')),
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  available_at timestamptz not null default pg_catalog.clock_timestamp(),
  claimed_at timestamptz,
  claim_token uuid,
  attempt_count integer not null default 0
    check (attempt_count between 0 and 1000000),
  last_error_code text check (
    last_error_code is null
    or last_error_code ~ '^[A-Z0-9][A-Z0-9_:-]{0,79}$'
  ),
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (status = 'claimed' and claimed_at is not null and claim_token is not null)
    or (status <> 'claimed' and claimed_at is null and claim_token is null)
  ),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index badge_reconciliation_targets_pending_idx
  on ironclad_private.badge_reconciliation_targets(
    status,
    available_at,
    requested_at,
    target_id
  );

alter table ironclad_private.badge_reconciliation_targets enable row level security;
alter table ironclad_private.badge_reconciliation_targets force row level security;
revoke all on table ironclad_private.badge_reconciliation_targets
  from public, anon, authenticated, service_role;

create function ironclad_private.enqueue_badge_reconciliation_target(
  p_player_id uuid,
  p_reason text,
  p_source_type text default null,
  p_source_id text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_player_id is null
    or p_reason not in (
      'profile_write',
      'steam_identity',
      'relic_snapshot',
      'match_finalization',
      'match_authority',
      'tournament_completion',
      'leaderboard_recalculation',
      'season_finalization',
      'evaluation_failure',
      'manual_recovery'
    )
    or (
      p_source_type is not null
      and p_source_type not in (
        'profile',
        'match',
        'tournament',
        'season',
        'system'
      )
    )
    or (
      p_source_id is not null
      and (
        char_length(p_source_id) not between 1 and 160
        or p_source_id ~ '[[:cntrl:]]'
      )
    ) then
    raise exception 'Badge reconciliation target is invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.id = p_player_id
      and player.account_closed_at is null
  ) then
    return;
  end if;

  insert into ironclad_private.badge_reconciliation_targets (
    player_id,
    reason,
    source_type,
    source_id
  )
  values (
    p_player_id,
    p_reason,
    p_source_type,
    p_source_id
  )
  on conflict (player_id) do update
  set
    reason = excluded.reason,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    status = 'pending',
    requested_at = pg_catalog.clock_timestamp(),
    available_at = pg_catalog.clock_timestamp(),
    claimed_at = null,
    claim_token = null,
    last_error_code = null,
    completed_at = null,
    updated_at = pg_catalog.clock_timestamp();
end;
$$;

alter function ironclad_private.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) owner to postgres;
revoke all on function ironclad_private.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

create function public.enqueue_badge_reconciliation_target(
  p_player_id uuid,
  p_reason text,
  p_source_type text default null,
  p_source_id text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform ironclad_private.enqueue_badge_reconciliation_target(
    p_player_id,
    p_reason,
    p_source_type,
    p_source_id
  );
end;
$$;

alter function public.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) owner to postgres;
revoke all on function public.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_badge_reconciliation_target(
  uuid,
  text,
  text,
  text
) to service_role;

create function public.claim_badge_reconciliation_targets(
  p_limit integer
)
returns table (
  target_id uuid,
  player_id uuid,
  claim_token uuid,
  reason text,
  source_type text,
  source_id text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Badge reconciliation claim limit must be between 1 and 50'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select target.target_id
    from ironclad_private.badge_reconciliation_targets as target
    join public.players as player on player.id = target.player_id
    where player.account_closed_at is null
      and (
        (
          target.status = 'pending'
          and target.available_at <= pg_catalog.clock_timestamp()
        )
        or (
          target.status = 'claimed'
          and target.claimed_at < pg_catalog.clock_timestamp() - interval '15 minutes'
        )
      )
    order by target.available_at, target.requested_at, target.target_id
    for update of target skip locked
    limit p_limit
  ),
  claimed as (
    update ironclad_private.badge_reconciliation_targets as target
    set
      status = 'claimed',
      claimed_at = pg_catalog.clock_timestamp(),
      claim_token = pg_catalog.gen_random_uuid(),
      attempt_count = target.attempt_count + 1,
      completed_at = null,
      updated_at = pg_catalog.clock_timestamp()
    from candidates
    where target.target_id = candidates.target_id
    returning target.*
  )
  select
    claimed.target_id,
    claimed.player_id,
    claimed.claim_token,
    claimed.reason,
    claimed.source_type,
    claimed.source_id,
    claimed.attempt_count
  from claimed
  order by claimed.requested_at, claimed.target_id;
end;
$$;

alter function public.claim_badge_reconciliation_targets(integer)
  owner to postgres;
revoke all on function public.claim_badge_reconciliation_targets(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_badge_reconciliation_targets(integer)
  to service_role;

create function public.complete_badge_reconciliation_target(
  p_target_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_updated integer;
  v_error_code text;
begin
  if p_target_id is null or p_claim_token is null or p_succeeded is null then
    raise exception 'Badge reconciliation completion is invalid'
      using errcode = '22023';
  end if;

  v_error_code := case
    when p_succeeded then null
    when coalesce(p_error_code, '') ~ '^[A-Z0-9][A-Z0-9_:-]{0,79}$'
      then p_error_code
    else 'UNKNOWN'
  end;

  if p_succeeded then
    update ironclad_private.badge_reconciliation_targets as target
    set
      status = 'completed',
      claimed_at = null,
      claim_token = null,
      last_error_code = null,
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where target.target_id = p_target_id
      and target.claim_token = p_claim_token
      and target.status = 'claimed';
  else
    update ironclad_private.badge_reconciliation_targets as target
    set
      status = 'pending',
      available_at = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(
          secs => least(
            1800,
            greatest(30, (power(2, least(target.attempt_count, 10)) * 15)::integer)
          )
        ),
      claimed_at = null,
      claim_token = null,
      last_error_code = v_error_code,
      completed_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where target.target_id = p_target_id
      and target.claim_token = p_claim_token
      and target.status = 'claimed';
  end if;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

alter function public.complete_badge_reconciliation_target(
  uuid,
  uuid,
  boolean,
  text
) owner to postgres;
revoke all on function public.complete_badge_reconciliation_target(
  uuid,
  uuid,
  boolean,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_badge_reconciliation_target(
  uuid,
  uuid,
  boolean,
  text
) to service_role;

create function public.queue_badge_reconciliation_from_participant_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
begin
  select registration.profile_id
  into v_player_id
  from public.registrations as registration
  where registration.id = new.registration_id;

  if v_player_id is not null then
    perform ironclad_private.enqueue_badge_reconciliation_target(
      v_player_id,
      'match_authority',
      'match',
      new.match_id::text
    );
  end if;

  return new;
exception
  when others then
    raise warning 'Badge participant reconciliation enqueue failed [%]', sqlstate;
    return new;
end;
$$;

alter function public.queue_badge_reconciliation_from_participant_authority()
  owner to postgres;
revoke all on function
  public.queue_badge_reconciliation_from_participant_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists match_participant_authority_queue_badge_reconciliation
  on public.match_participant_outcome_authority;
create trigger match_participant_authority_queue_badge_reconciliation
after insert on public.match_participant_outcome_authority
for each row
execute function public.queue_badge_reconciliation_from_participant_authority();

create function public.queue_badge_reconciliation_from_leaderboard_player()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reason text;
  v_source_type text;
  v_source_id text;
begin
  if tg_table_name = 'leaderboard_point_events' then
    v_reason := 'leaderboard_recalculation';
    v_source_type := 'tournament';
    v_source_id := new.tournament_id::text;
  else
    v_reason := 'season_finalization';
    v_source_type := 'season';
    v_source_id := new.season_id::text;
  end if;

  perform ironclad_private.enqueue_badge_reconciliation_target(
    new.player_id,
    v_reason,
    v_source_type,
    v_source_id
  );

  return new;
exception
  when others then
    raise warning 'Badge leaderboard reconciliation enqueue failed [%]', sqlstate;
    return new;
end;
$$;

alter function public.queue_badge_reconciliation_from_leaderboard_player()
  owner to postgres;
revoke all on function public.queue_badge_reconciliation_from_leaderboard_player()
  from public, anon, authenticated, service_role;

drop trigger if exists leaderboard_point_events_queue_badge_reconciliation
  on public.leaderboard_point_events;
create trigger leaderboard_point_events_queue_badge_reconciliation
after insert or update on public.leaderboard_point_events
for each row
execute function public.queue_badge_reconciliation_from_leaderboard_player();

drop trigger if exists leaderboard_season_stats_queue_badge_reconciliation
  on public.leaderboard_player_season_stats;
create trigger leaderboard_season_stats_queue_badge_reconciliation
after insert or update on public.leaderboard_player_season_stats
for each row
execute function public.queue_badge_reconciliation_from_leaderboard_player();

drop trigger if exists leaderboard_champions_queue_badge_reconciliation
  on public.leaderboard_season_champions;
create trigger leaderboard_champions_queue_badge_reconciliation
after insert or update on public.leaderboard_season_champions
for each row
execute function public.queue_badge_reconciliation_from_leaderboard_player();

create function public.queue_badge_reconciliation_from_tournament_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
begin
  if old.status is not distinct from new.status or new.status <> 'completed' then
    return new;
  end if;

  for v_player_id in
    select distinct registration.profile_id
    from public.registrations as registration
    where registration.tournament_id = new.id
      and registration.profile_id is not null
      and registration.registration_status = 'approved'
  loop
    perform ironclad_private.enqueue_badge_reconciliation_target(
      v_player_id,
      'tournament_completion',
      'tournament',
      new.id::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning 'Badge tournament reconciliation enqueue failed [%]', sqlstate;
    return new;
end;
$$;

alter function public.queue_badge_reconciliation_from_tournament_completion()
  owner to postgres;
revoke all on function
  public.queue_badge_reconciliation_from_tournament_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_queue_badge_reconciliation
  on public.tournaments;
create trigger tournaments_queue_badge_reconciliation
after update of status on public.tournaments
for each row
execute function public.queue_badge_reconciliation_from_tournament_completion();

comment on table ironclad_private.badge_reconciliation_targets is
  'Private, one-row-per-player Badge evaluation backstop for DB-owned outcomes. It is bounded, retryable, and not a general job queue.';

comment on function public.claim_badge_reconciliation_targets(integer) is
  'Service-role-only bounded claim of at most 50 Badge reconciliation targets with a 15-minute lease.';

commit;
