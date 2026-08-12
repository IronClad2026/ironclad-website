begin;

-- Season dates remain display metadata. Main/Pro membership is authoritative
-- through the factual tournament membership rows introduced below.
alter table public.leaderboard_seasons
  drop constraint if exists leaderboard_seasons_season_number_check,
  drop constraint if exists leaderboard_seasons_calendar_window_check;

alter table public.leaderboard_seasons
  add column if not exists finalized_at timestamptz,
  add constraint leaderboard_seasons_season_number_positive_check
    check (season_number > 0),
  add constraint leaderboard_seasons_finalized_inactive_check
    check (finalized_at is null or not is_active);

-- This timestamp is the immutable chronology for completed-event membership
-- and Career entry anchors. It is set once and survives result corrections.
alter table public.tournaments
  add column if not exists first_completed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.tournaments as tournament
    where tournament.status = 'completed'
      and tournament.first_completed_at is null
  ) then
    raise exception 'Existing completed tournaments require an approved first-completion inventory before PR 3';
  end if;
end;
$$;

create function public.preserve_tournament_first_completed_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      new.first_completed_at := clock_timestamp();
    else
      new.first_completed_at := null;
    end if;
    return new;
  end if;

  if old.first_completed_at is not null
    and new.first_completed_at is distinct from old.first_completed_at then
    raise exception 'Tournament first completion is immutable'
      using errcode = '55000';
  end if;

  if old.first_completed_at is null
    and new.status = 'completed'
    and old.status is distinct from 'completed' then
    new.first_completed_at := clock_timestamp();
  elsif old.first_completed_at is null
    and new.first_completed_at is not null then
    raise exception 'Tournament first completion can only be set by completion'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

alter function public.preserve_tournament_first_completed_at()
  owner to postgres;
revoke all on function public.preserve_tournament_first_completed_at()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_preserve_first_completed_at
  on public.tournaments;
create trigger tournaments_preserve_first_completed_at
before insert or update of status, first_completed_at on public.tournaments
for each row execute function public.preserve_tournament_first_completed_at();

create table public.leaderboard_tournament_season_memberships (
  tournament_id uuid primary key
    references public.tournaments(id) on delete restrict,
  season_id uuid not null
    references public.leaderboard_seasons(id) on delete restrict,
  qualifying_event_number smallint,
  assigned_at timestamptz not null default clock_timestamp(),
  scored_at timestamptz,
  constraint leaderboard_tournament_season_memberships_event_number_check
    check (
      qualifying_event_number is null
      or qualifying_event_number between 1 and 6
    ),
  constraint leaderboard_tournament_season_memberships_season_event_unique
    unique (season_id, qualifying_event_number)
);

create index leaderboard_tournament_season_memberships_season_idx
  on public.leaderboard_tournament_season_memberships(
    season_id,
    assigned_at,
    tournament_id
  );

alter table public.leaderboard_tournament_season_memberships
  enable row level security;
revoke all on public.leaderboard_tournament_season_memberships
  from public, anon, authenticated, service_role;

alter table public.leaderboard_point_events
  add constraint leaderboard_point_events_late_entry_bonus_check
  check (
    event_type <> 'missing_tournament_bonus'
    or (
      bracket_type in ('academy', 'challenge')
      and points between 5 and 25
      and mod(points, 5) = 0
      and source in ('system', 'recalculation')
      and tournament_id is not null
      and tournament_bracket_id is not null
      and registration_id is not null
    )
  );

create unique index leaderboard_point_events_one_late_entry_bonus_idx
  on public.leaderboard_point_events(player_id, bracket_type)
  where event_type = 'missing_tournament_bonus'
    and source in ('system', 'recalculation');

create function public.guard_finalized_main_admin_adjustment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (
    tg_op <> 'INSERT'
    and old.source = 'admin'
    and old.bracket_type = 'main'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = old.season_id
        and season.finalized_at is not null
    )
  ) or (
    tg_op <> 'DELETE'
    and new.source = 'admin'
    and new.bracket_type = 'main'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = new.season_id
        and season.finalized_at is not null
    )
  ) then
    raise exception 'Finalized Main/Pro standings cannot be adjusted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.guard_finalized_main_admin_adjustment()
  owner to postgres;
revoke all on function public.guard_finalized_main_admin_adjustment()
  from public, anon, authenticated, service_role;

drop trigger if exists leaderboard_point_events_guard_finalized_main_adjustment
  on public.leaderboard_point_events;
create trigger leaderboard_point_events_guard_finalized_main_adjustment
before insert or update or delete
on public.leaderboard_point_events
for each row execute function public.guard_finalized_main_admin_adjustment();

-- Serialize the supported administrator adjustment path with tournament
-- completion/finalization on the same PR 2 root lock. This makes the
-- finalized-season refusal linearizable at the event-six boundary.
create or replace function public.add_leaderboard_admin_adjustment(
  p_season_id uuid,
  p_player_id uuid,
  p_bracket_type text,
  p_points integer,
  p_description text default null,
  p_tournament_id uuid default null,
  p_tournament_bracket_id uuid default null,
  p_registration_id uuid default null,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_season_run_id uuid;
  v_season_run_status text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  if not exists (
    select 1
    from public.leaderboard_seasons as season
    where season.id = p_season_id
  ) then
    raise exception 'Leaderboard season not found';
  end if;

  if not exists (
    select 1
    from public.players as player
    where player.id = p_player_id
  ) then
    raise exception 'Player not found';
  end if;

  if p_bracket_type not in ('main', 'challenge', 'overall') then
    raise exception 'Invalid leaderboard bracket type';
  end if;

  insert into public.leaderboard_point_events (
    season_id,
    tournament_id,
    tournament_bracket_id,
    registration_id,
    player_id,
    bracket_type,
    points,
    event_type,
    description,
    source,
    created_by_clerk_user_id
  )
  values (
    p_season_id,
    p_tournament_id,
    p_tournament_bracket_id,
    p_registration_id,
    p_player_id,
    p_bracket_type,
    p_points,
    'admin_adjustment',
    nullif(pg_catalog.btrim(p_description), ''),
    'admin',
    nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
  )
  returning id into v_event_id;

  v_season_run_id := public.recalculate_leaderboard_for_season(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_season_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_season_run_id;

  if v_season_run_status is distinct from 'completed' then
    raise exception 'Season leaderboard recalculation failed';
  end if;

  return v_event_id;
end;
$$;

alter function public.add_leaderboard_admin_adjustment(
  uuid, uuid, text, integer, text, uuid, uuid, uuid, text
) owner to postgres;
revoke all on function public.add_leaderboard_admin_adjustment(
  uuid, uuid, text, integer, text, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.add_leaderboard_admin_adjustment(
  uuid, uuid, text, integer, text, uuid, uuid, uuid, text
) to service_role;

-- These are database-derived scoring containers, caches, and final records.
-- Product administration already mutates them only through the service-role
-- recalculation RPCs. Keep public/authenticated reads, but remove the inherited
-- direct authenticated DML path that could otherwise reopen or edit a frozen
-- Main/Pro season outside those authoritative functions.
revoke insert, update, delete
  on public.leaderboard_seasons,
     public.leaderboard_point_events,
     public.leaderboard_player_season_stats,
     public.leaderboard_season_champions
  from authenticated;

-- Keep the public signature used by the existing administrator recovery
-- action. The date supplies display metadata only; it no longer chooses a
-- calendar half-year. Tournament recalculation supplies a durable membership
-- context so the deployed scoring core keeps using its existing signature.
create or replace function public.get_or_create_leaderboard_season(
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_context_tournament_text text;
  v_context_tournament_id uuid;
  v_date date := coalesce(p_date, current_date);
  v_year integer;
  v_season_number integer;
  v_season_id uuid;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  v_context_tournament_text := nullif(
    pg_catalog.btrim(
      pg_catalog.current_setting(
        'ironclad.leaderboard_tournament_id',
        true
      )
    ),
    ''
  );

  if v_context_tournament_text is not null then
    begin
      v_context_tournament_id := v_context_tournament_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid internal leaderboard tournament context'
          using errcode = '22023';
    end;

    select membership.season_id
    into v_season_id
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = v_context_tournament_id;

    if v_season_id is not null then
      return v_season_id;
    end if;

    raise exception 'Leaderboard tournament membership was not assigned'
      using errcode = '55000';
  end if;

  select season.id
  into v_season_id
  from public.leaderboard_seasons as season
  where season.is_active
    and season.finalized_at is null
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = season.id
        and membership.qualifying_event_number is not null
    ) < 6
  order by season.created_at, season.id
  limit 1;

  if v_season_id is not null then
    return v_season_id;
  end if;

  v_year := extract(year from v_date)::integer;

  select coalesce(max(season.season_number), 0) + 1
  into v_season_number
  from public.leaderboard_seasons as season
  where season.year = v_year;

  insert into public.leaderboard_seasons (
    name,
    year,
    season_number,
    start_date,
    end_date,
    is_active
  )
  values (
    v_year::text || ' Main/Pro Season ' || v_season_number::text,
    v_year,
    v_season_number,
    v_date,
    v_date,
    true
  )
  returning id into v_season_id;

  return v_season_id;
end;
$$;

alter function public.get_or_create_leaderboard_season(date)
  owner to postgres;
revoke all on function public.get_or_create_leaderboard_season(date)
  from public, anon, authenticated;
grant execute on function public.get_or_create_leaderboard_season(date)
  to service_role;

-- This helper is reachable only from the service-role tournament wrapper. It
-- runs after the PR 2 all-time lock has been acquired, so concurrent sixth and
-- seventh completions cannot allocate the same slot or a seventh slot.
create function public.assign_leaderboard_tournament_season(
  p_tournament_id uuid
)
returns table (
  season_id uuid,
  qualifying_event_number smallint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_effective_date date;
  v_existing public.leaderboard_tournament_season_memberships%rowtype;
  v_season_id uuid;
  v_event_number smallint;
  v_has_launched_main boolean;
begin
  select
    tournament.status,
    coalesce(
      tournament.first_completed_at::date,
      tournament.grand_final_at::date,
      tournament.end_date::date,
      tournament.start_date::date,
      tournament.created_at::date,
      current_date
    )
  into v_status, v_effective_date
  from public.tournaments as tournament
  where tournament.id = p_tournament_id;

  if not found then
    raise exception 'Tournament not found';
  end if;

  select membership.*
  into v_existing
  from public.leaderboard_tournament_season_memberships as membership
  where membership.tournament_id = p_tournament_id;

  if found then
    return query
    select v_existing.season_id, v_existing.qualifying_event_number;
    return;
  end if;

  if v_status <> 'completed' then
    raise exception 'Tournament must be completed before leaderboard assignment';
  end if;

  if not exists (
    select 1
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
      and tournament.first_completed_at is not null
  ) then
    raise exception 'Tournament first completion was not recorded';
  end if;

  select exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.name = 'Main'
      and bracket.launched_at is not null
  )
  into v_has_launched_main;

  if v_has_launched_main then
    select season.id
    into v_season_id
    from public.leaderboard_seasons as season
    where season.is_active
      and season.finalized_at is null
      and (
        select count(*)
        from public.leaderboard_tournament_season_memberships as membership
        where membership.season_id = season.id
          and membership.qualifying_event_number is not null
      ) < 6
    order by season.created_at, season.id
    limit 1;

    if v_season_id is null then
      v_season_id := public.get_or_create_leaderboard_season(v_effective_date);
    end if;

    select (count(*) + 1)::smallint
    into v_event_number
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = v_season_id
      and membership.qualifying_event_number is not null;

    if v_event_number > 6 then
      raise exception 'Main/Pro leaderboard season already contains six events';
    end if;
  else
    -- Career-only scoring stays attached to the latest factual season and
    -- does not pre-create the next Main/Pro season after event six.
    select season.id
    into v_season_id
    from public.leaderboard_seasons as season
    order by season.created_at desc, season.id desc
    limit 1;

    if v_season_id is null then
      v_season_id := public.get_or_create_leaderboard_season(v_effective_date);
    end if;
  end if;

  insert into public.leaderboard_tournament_season_memberships (
    tournament_id,
    season_id,
    qualifying_event_number
  )
  values (
    p_tournament_id,
    v_season_id,
    v_event_number
  );

  update public.leaderboard_seasons
  set
    start_date = least(start_date, v_effective_date),
    end_date = greatest(end_date, v_effective_date),
    is_active = case
      when v_event_number = 6 then false
      else is_active
    end
  where id = v_season_id;

  return query select v_season_id, v_event_number;
end;
$$;

alter function public.assign_leaderboard_tournament_season(uuid)
  owner to postgres;
revoke all on function public.assign_leaderboard_tournament_season(uuid)
  from public, anon, authenticated, service_role;

create function public.is_valid_late_entry_participation(
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_registration_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    exists (
      select 1
      from public.generated_brackets as generated
      join public.tournament_matches as match
        on match.generated_bracket_id = generated.id
      where generated.tournament_bracket_id = p_tournament_bracket_id
        and (
          match.player_one_registration_id = p_registration_id
          or match.player_two_registration_id = p_registration_id
        )
        and public.is_tournament_match_played_for_leaderboard(match.id)
    )
    and not public.is_registration_confirmed_no_show_for_leaderboard(
      p_tournament_id,
      p_tournament_bracket_id,
      p_registration_id
    );
$$;

alter function public.is_valid_late_entry_participation(uuid, uuid, uuid)
  owner to postgres;
revoke all on function
  public.is_valid_late_entry_participation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.award_leaderboard_late_entry_bonuses(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_inserted_count integer;
begin
  if not exists (
    select 1
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = p_tournament_id
  ) then
    raise exception 'Leaderboard tournament membership was not assigned';
  end if;

  drop table if exists pg_temp.leaderboard_late_entry_affected_seasons;
  create temporary table leaderboard_late_entry_affected_seasons (
    season_id uuid primary key
  ) on commit drop;

  drop table if exists pg_temp.leaderboard_existing_late_entry_bonuses;
  create temporary table leaderboard_existing_late_entry_bonuses
  on commit drop
  as
  select
    bonus.season_id,
    bonus.tournament_id,
    bonus.tournament_bracket_id,
    bonus.registration_id,
    bonus.player_id,
    bonus.bracket_type,
    bonus.points
  from public.leaderboard_point_events as bonus
  where bonus.event_type = 'missing_tournament_bonus'
    and bonus.source in ('system', 'recalculation')
    and bonus.bracket_type in ('academy', 'challenge');

  -- Corrections can move the deterministic first valid award tournament.
  -- Rebuild only this one logical bonus class across durable Career history.
  delete from public.leaderboard_point_events as bonus
  where bonus.event_type = 'missing_tournament_bonus'
    and bonus.source in ('system', 'recalculation')
    and bonus.bracket_type in ('academy', 'challenge');

  with current_membership as (
    select
      membership.season_id,
      membership.tournament_id,
      tournament.first_completed_at
    from public.leaderboard_tournament_season_memberships as membership
    join public.tournaments as tournament
      on tournament.id = membership.tournament_id
      and tournament.first_completed_at is not null
  ),
  current_candidates as (
    select distinct
      registration.profile_id as player_id,
      registration.id as registration_id,
      bracket.id as tournament_bracket_id,
      case
        when bracket.name = 'Academy' then 'academy'
        when bracket.name = 'Challenge' then 'challenge'
      end as bracket_type,
      bracket.name as bracket_name,
      membership.season_id,
      membership.first_completed_at,
      membership.tournament_id
    from current_membership as membership
    join public.tournament_brackets as bracket
      on bracket.tournament_id = membership.tournament_id
      and bracket.name in ('Academy', 'Challenge')
      and bracket.launched_at is not null
    join public.registrations as registration
      on registration.tournament_bracket_id = bracket.id
      and registration.tournament_id = membership.tournament_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
    where public.is_valid_late_entry_participation(
      membership.tournament_id,
      bracket.id,
      registration.id
    )
  ),
  anchored_candidates as (
    select
      candidate.*,
      anchor.first_completed_at as anchor_first_completed_at,
      anchor.tournament_id as anchor_tournament_id,
      (
        select count(distinct prior_membership.tournament_id)::integer
        from public.leaderboard_tournament_season_memberships
          as prior_membership
        join public.tournament_brackets as prior_bracket
          on prior_bracket.tournament_id = prior_membership.tournament_id
          and prior_bracket.name = candidate.bracket_name
          and prior_bracket.launched_at is not null
        join public.tournaments as prior_tournament
          on prior_tournament.id = prior_membership.tournament_id
          and prior_tournament.first_completed_at is not null
        where (
          prior_tournament.first_completed_at,
          prior_membership.tournament_id
        ) < (anchor.first_completed_at, anchor.tournament_id)
      ) as missed_event_count
    from current_candidates as candidate
    join lateral (
      select
        anchor_tournament.first_completed_at,
        anchor_membership.tournament_id
      from public.leaderboard_tournament_season_memberships
        as anchor_membership
      join public.tournament_brackets as anchor_bracket
        on anchor_bracket.tournament_id = anchor_membership.tournament_id
        and anchor_bracket.name = candidate.bracket_name
        and anchor_bracket.launched_at is not null
      join public.registrations as anchor_registration
        on anchor_registration.tournament_bracket_id = anchor_bracket.id
        and anchor_registration.tournament_id =
          anchor_membership.tournament_id
        and anchor_registration.registration_status = 'approved'
        and anchor_registration.profile_id = candidate.player_id
      join public.tournaments as anchor_tournament
        on anchor_tournament.id = anchor_membership.tournament_id
        and anchor_tournament.first_completed_at is not null
      order by
        anchor_tournament.first_completed_at,
        anchor_membership.tournament_id
      limit 1
    ) as anchor on true
  ),
  awardable as (
    select candidate.*
    from anchored_candidates as candidate
    where candidate.missed_event_count > 0
      and not exists (
        select 1
        from public.leaderboard_tournament_season_memberships
          as earlier_membership
        join public.tournament_brackets as earlier_bracket
          on earlier_bracket.tournament_id = earlier_membership.tournament_id
          and earlier_bracket.name = candidate.bracket_name
          and earlier_bracket.launched_at is not null
        join public.registrations as earlier_registration
          on earlier_registration.tournament_bracket_id = earlier_bracket.id
          and earlier_registration.tournament_id =
            earlier_membership.tournament_id
          and earlier_registration.registration_status = 'approved'
          and earlier_registration.profile_id = candidate.player_id
        join public.tournaments as earlier_tournament
          on earlier_tournament.id = earlier_membership.tournament_id
          and earlier_tournament.first_completed_at is not null
        where (
          earlier_tournament.first_completed_at,
          earlier_membership.tournament_id
        ) >= (
          candidate.anchor_first_completed_at,
          candidate.anchor_tournament_id
        )
          and (
            earlier_tournament.first_completed_at,
            earlier_membership.tournament_id
          ) < (candidate.first_completed_at, candidate.tournament_id)
          and public.is_valid_late_entry_participation(
            earlier_membership.tournament_id,
            earlier_bracket.id,
            earlier_registration.id
          )
      )
  )
  insert into public.leaderboard_point_events (
    season_id,
    tournament_id,
    tournament_bracket_id,
    registration_id,
    player_id,
    bracket_type,
    points,
    event_type,
    description,
    source,
    created_by_clerk_user_id
  )
  select
    candidate.season_id,
    candidate.tournament_id,
    candidate.tournament_bracket_id,
    candidate.registration_id,
    candidate.player_id,
    candidate.bracket_type,
    least(candidate.missed_event_count, 5) * 5,
    'missing_tournament_bonus',
    'One-time Career late-entry catch-up',
    'recalculation',
    nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
  from awardable as candidate
  on conflict (player_id, bracket_type)
  where event_type = 'missing_tournament_bonus'
    and source in ('system', 'recalculation')
  do nothing;

  get diagnostics v_inserted_count = row_count;

  insert into pg_temp.leaderboard_late_entry_affected_seasons (season_id)
  select distinct changed.season_id
  from (
    select existing.season_id
    from pg_temp.leaderboard_existing_late_entry_bonuses as existing
    where not exists (
      select 1
      from public.leaderboard_point_events as current_bonus
      where current_bonus.event_type = 'missing_tournament_bonus'
        and current_bonus.source in ('system', 'recalculation')
        and current_bonus.season_id = existing.season_id
        and current_bonus.tournament_id = existing.tournament_id
        and current_bonus.tournament_bracket_id =
          existing.tournament_bracket_id
        and current_bonus.registration_id = existing.registration_id
        and current_bonus.player_id = existing.player_id
        and current_bonus.bracket_type = existing.bracket_type
        and current_bonus.points = existing.points
    )
    union
    select current_bonus.season_id
    from public.leaderboard_point_events as current_bonus
    where current_bonus.event_type = 'missing_tournament_bonus'
      and current_bonus.source in ('system', 'recalculation')
      and not exists (
        select 1
        from pg_temp.leaderboard_existing_late_entry_bonuses as existing
        where existing.season_id = current_bonus.season_id
          and existing.tournament_id = current_bonus.tournament_id
          and existing.tournament_bracket_id =
            current_bonus.tournament_bracket_id
          and existing.registration_id = current_bonus.registration_id
          and existing.player_id = current_bonus.player_id
          and existing.bracket_type = current_bonus.bracket_type
          and existing.points = current_bonus.points
      )
  ) as changed
  on conflict (season_id) do nothing;

  return v_inserted_count;
end;
$$;

alter function public.award_leaderboard_late_entry_bonuses(uuid, text)
  owner to postgres;
revoke all on function
  public.award_leaderboard_late_entry_bonuses(uuid, text)
  from public, anon, authenticated, service_role;

-- Keep the PR 2 season calculation intact behind one narrow freeze wrapper.
-- The wrapper still rebuilds Academy/Challenge Career facts in a finalized
-- season, then restores the exact immutable Main/Pro final rows.
alter function public.recalculate_leaderboard_for_season(uuid, text)
  rename to recalculate_leaderboard_for_season_pr2_core;

alter function public.recalculate_leaderboard_for_season_pr2_core(uuid, text)
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_for_season_pr2_core(uuid, text)
  from public, anon, authenticated, service_role;

create function public.recalculate_leaderboard_for_season(
  p_season_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_finalized_at timestamptz;
  v_run_id uuid;
  v_run_status text;
  v_all_time_run_id uuid;
  v_all_time_status text;
  v_all_time_notes text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:season:' || coalesce(p_season_id::text, 'null'),
      0
    )
  );

  select season.finalized_at
  into v_finalized_at
  from public.leaderboard_seasons as season
  where season.id = p_season_id;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  if v_finalized_at is not null then
    drop table if exists pg_temp.leaderboard_finalized_main_stats;
    create temporary table leaderboard_finalized_main_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats as season_stats
    where season_stats.season_id = p_season_id
      and season_stats.bracket_type = 'main';
  end if;

  v_run_id := public.recalculate_leaderboard_for_season_pr2_core(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_finalized_at is null then
    return v_run_id;
  end if;

  delete from public.leaderboard_player_season_stats
  where season_id = p_season_id
    and bracket_type = 'main';

  insert into public.leaderboard_player_season_stats (
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  )
  select
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  from pg_temp.leaderboard_finalized_main_stats;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  v_all_time_run_id := public.recalculate_leaderboard_all_time(
    p_triggered_by_clerk_user_id
  );

  select run.status, run.notes
  into v_all_time_status, v_all_time_notes
  from public.leaderboard_recalculation_runs as run
  where run.id = v_all_time_run_id;

  if v_all_time_status is distinct from 'completed' then
    update public.leaderboard_recalculation_runs
    set
      status = 'failed',
      finished_at = now(),
      notes = format(
        'Finalized Main/Pro restoration all-time recalculation failed: %s',
        coalesce(
          nullif(v_all_time_notes, ''),
          v_all_time_status,
          'unknown'
        )
      )
    where id = v_run_id;
  end if;

  return v_run_id;
end;
$$;

alter function public.recalculate_leaderboard_for_season(uuid, text)
  owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season(uuid, text)
  from public, anon, authenticated;
grant execute on function public.recalculate_leaderboard_for_season(uuid, text)
  to service_role;

create function public.finalize_leaderboard_main_season_if_ready(
  p_season_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_finalized_at timestamptz;
  v_event_count integer;
begin
  select season.finalized_at
  into v_finalized_at
  from public.leaderboard_seasons as season
  where season.id = p_season_id;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  if v_finalized_at is not null then
    return true;
  end if;

  select count(*)
  into v_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = p_season_id
    and membership.qualifying_event_number is not null;

  if v_event_count <> 6 then
    return false;
  end if;

  if exists (
    select 1
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = p_season_id
      and membership.qualifying_event_number is not null
      and membership.scored_at is null
  ) then
    return false;
  end if;

  insert into public.leaderboard_season_champions (
    season_id,
    player_id,
    bracket_type,
    final_rank,
    final_points
  )
  select
    p_season_id,
    season_stats.player_id,
    'main',
    season_stats.current_rank,
    season_stats.total_points
  from public.leaderboard_player_season_stats as season_stats
  where season_stats.season_id = p_season_id
    and season_stats.bracket_type = 'main'
    and season_stats.current_rank = 1
  on conflict (season_id, player_id, bracket_type) do nothing;

  update public.leaderboard_seasons
  set
    finalized_at = clock_timestamp(),
    is_active = false
  where id = p_season_id
    and finalized_at is null;

  return true;
end;
$$;

alter function public.finalize_leaderboard_main_season_if_ready(uuid)
  owner to postgres;
revoke all on function public.finalize_leaderboard_main_season_if_ready(uuid)
  from public, anon, authenticated, service_role;

-- Extend only the public PR 2 tournament wrapper. Its hidden scoring core,
-- point values, outcome handling, and rollback behavior remain unchanged.
create or replace function public.recalculate_leaderboard_for_tournament(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_run_status text;
  v_season_id uuid;
  v_event_number smallint;
  v_previous_tournament_context text;
  v_deleted_participation_count integer;
  v_affected_season record;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
  v_error_state text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:tournament:'
        || coalesce(p_tournament_id::text, 'null'),
      0
    )
  );

  v_previous_tournament_context := pg_catalog.current_setting(
    'ironclad.leaderboard_tournament_id',
    true
  );
  perform pg_catalog.set_config(
    'ironclad.leaderboard_tournament_id',
    '',
    true
  );

  select assigned.season_id, assigned.qualifying_event_number
  into v_season_id, v_event_number
  from public.assign_leaderboard_tournament_season(p_tournament_id)
    as assigned;

  if v_event_number is not null then
    update public.leaderboard_tournament_season_memberships
    set scored_at = null
    where tournament_id = p_tournament_id;
  end if;

  begin
    perform pg_catalog.set_config(
      'ironclad.leaderboard_tournament_id',
      p_tournament_id::text,
      true
    );

    -- Preserve PR 2 administrative-progression interpretation while the
    -- hidden core produces the existing participation/progression awards.
    perform count(*)
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and match.outcome_type in (
        'automatic_bye',
        'deadline_double_forfeit',
        'empty_feeder'
      );

    v_run_id :=
      public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
        p_tournament_id,
        p_triggered_by_clerk_user_id
      );

    perform pg_catalog.set_config(
      'ironclad.leaderboard_tournament_id',
      coalesce(v_previous_tournament_context, ''),
      true
    );

    select run.status
    into v_run_status
    from public.leaderboard_recalculation_runs as run
    where run.id = v_run_id;

    if v_run_status is distinct from 'completed' then
      return v_run_id;
    end if;

    with result_match_counts as (
      select
        generated.tournament_bracket_id,
        participant.registration_id,
        count(distinct match.id)::integer as result_match_count
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
        and bracket.tournament_id = p_tournament_id
      join public.tournament_matches as match
        on match.generated_bracket_id = generated.id
        and match.status = 'completed'
        and match.outcome_type is null
        and match.player_one_registration_id is not null
        and match.player_two_registration_id is not null
        and match.player_one_score is not null
        and match.player_two_score is not null
        and match.winner_registration_id is not null
      join lateral (
        values
          (match.player_one_registration_id),
          (match.player_two_registration_id)
      ) as participant(registration_id)
        on participant.registration_id is not null
      group by
        generated.tournament_bracket_id,
        participant.registration_id
    ),
    ranked_participation as (
      select
        event.id,
        row_number() over (
          partition by
            event.registration_id,
            event.tournament_bracket_id
          order by event.created_at, event.id
        ) as participation_number,
        coalesce(result_count.result_match_count, 0) as result_match_count
      from public.leaderboard_point_events as event
      left join result_match_counts as result_count
        on result_count.tournament_bracket_id = event.tournament_bracket_id
        and result_count.registration_id = event.registration_id
      where event.tournament_id = p_tournament_id
        and event.event_type = 'participation'
        and event.source in ('system', 'recalculation')
        and event.registration_id is not null
        and event.tournament_bracket_id is not null
    )
    delete from public.leaderboard_point_events as event
    using ranked_participation as ranked
    where event.id = ranked.id
      and ranked.participation_number > ranked.result_match_count;

    get diagnostics v_deleted_participation_count = row_count;

    perform public.award_leaderboard_late_entry_bonuses(
      p_tournament_id,
      p_triggered_by_clerk_user_id
    );

    if v_deleted_participation_count > 0 then
      insert into pg_temp.leaderboard_late_entry_affected_seasons (season_id)
      values (v_season_id)
      on conflict (season_id) do nothing;
    end if;

    for v_affected_season in
      select affected.season_id
      from pg_temp.leaderboard_late_entry_affected_seasons as affected
      order by affected.season_id
    loop
      v_season_run_id := public.recalculate_leaderboard_for_season(
        v_affected_season.season_id,
        p_triggered_by_clerk_user_id
      );

      select run.status, run.notes
      into v_season_run_status, v_season_run_notes
      from public.leaderboard_recalculation_runs as run
      where run.id = v_season_run_id;

      if v_season_run_status is distinct from 'completed' then
        raise exception 'Career bonus/participation recalculation failed: %',
          coalesce(
            nullif(v_season_run_notes, ''),
            v_season_run_status,
            'unknown'
          );
      end if;
    end loop;

    if v_event_number is not null then
      update public.leaderboard_tournament_season_memberships
      set scored_at = clock_timestamp()
      where tournament_id = p_tournament_id;

      perform public.finalize_leaderboard_main_season_if_ready(v_season_id);
    end if;

    return v_run_id;
  exception
    when query_canceled or assert_failure or others then
      get stacked diagnostics v_error_state = returned_sqlstate;

      perform pg_catalog.set_config(
        'ironclad.leaderboard_tournament_id',
        coalesce(v_previous_tournament_context, ''),
        true
      );

      insert into public.leaderboard_recalculation_runs (
        tournament_id,
        season_id,
        scope,
        status,
        finished_at,
        triggered_by_clerk_user_id,
        notes
      )
      values (
        p_tournament_id,
        v_season_id,
        'tournament',
        'failed',
        now(),
        nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), ''),
        format(
          'Tournament leaderboard recalculation failed after season assignment: SQLSTATE %s',
          coalesce(v_error_state, 'unknown')
        )
      )
      returning id into v_run_id;

      return v_run_id;
  end;
end;
$$;

alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  to service_role;

comment on table public.leaderboard_tournament_season_memberships is
  'Private durable scoring membership. Main/Pro qualifying event numbers are limited to one through six; null event numbers retain Career-only tournament season linkage.';
comment on column public.leaderboard_seasons.finalized_at is
  'Set only after all six Main/Pro memberships have successfully produced final standings. Finalized Main rows are preserved by the public season recalculation wrapper.';
comment on table public.leaderboard_seasons is
  'IronClad leaderboard scoring containers. Main/Pro membership is event-count based; date and year fields are display metadata only.';
comment on column public.tournaments.first_completed_at is
  'Immutable timestamp of the tournament first reaching completed; used only for deterministic event and Career-entry chronology.';
comment on index public.leaderboard_point_events_one_late_entry_bonus_idx is
  'Enforces at most one system/recalculation Career late-entry bonus per player and lower division.';

commit;
