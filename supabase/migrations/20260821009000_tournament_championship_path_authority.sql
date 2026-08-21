begin;

-- Durable tournament-path evidence is intentionally independent of generated
-- bracket and match foreign keys. Those rows may be replaced during recovery.
create table public.tournament_championship_path_authority (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null
    references public.tournaments(id) on delete restrict,
  registration_id uuid not null
    references public.registrations(id) on delete restrict,
  path_index integer not null,
  round_number integer not null,
  expected_path_segment_count integer not null,
  source_match_id uuid,
  source_generated_bracket_id uuid,
  source_round_id uuid,
  outcome_kind text not null,
  authority_state text not null default 'active',
  revision integer not null,
  supersedes_id uuid
    references public.tournament_championship_path_authority(id)
    on delete restrict,
  finalized_at timestamptz not null,
  source_type text not null,
  source_id uuid,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint tournament_championship_path_index_check
    check (path_index >= 1),
  constraint tournament_championship_path_round_check
    check (round_number >= 1),
  constraint tournament_championship_path_expected_count_check
    check (expected_path_segment_count >= 1),
  constraint tournament_championship_path_outcome_check
    check (
      outcome_kind in (
        'played',
        'opponent_no_show',
        'player_no_show',
        'double_no_show',
        'automatic_bye',
        'admin_default',
        'cancelled',
        'voided',
        'unknown'
      )
    ),
  constraint tournament_championship_path_state_check
    check (authority_state in ('active', 'invalidated')),
  constraint tournament_championship_path_revision_check
    check (revision >= 1),
  constraint tournament_championship_path_source_type_check
    check (
      source_type in (
        'match_authority',
        'bracket_regeneration',
        'tournament_void',
        'path_reset',
        'historical_migration'
      )
    ),
  constraint tournament_championship_path_metadata_check
    check (jsonb_typeof(source_metadata) = 'object'),
  constraint tournament_championship_path_revision_key
    unique (tournament_id, registration_id, path_index, revision)
);

create index tournament_championship_path_latest_idx
  on public.tournament_championship_path_authority(
    tournament_id,
    registration_id,
    path_index,
    revision desc,
    id desc
  );

create index tournament_championship_path_source_match_idx
  on public.tournament_championship_path_authority(
    tournament_id,
    source_match_id
  );

create index tournament_championship_path_history_idx
  on public.tournament_championship_path_authority(
    tournament_id,
    registration_id,
    finalized_at,
    path_index
  );

create table public.tournament_championship_path_summary_authority (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null
    references public.tournaments(id) on delete restrict,
  registration_id uuid not null
    references public.registrations(id) on delete restrict,
  expected_path_segment_count integer not null,
  observed_path_segment_count integer not null,
  completeness_state text not null,
  revision integer not null,
  supersedes_id uuid
    references public.tournament_championship_path_summary_authority(id)
    on delete restrict,
  finalized_at timestamptz not null,
  source_type text not null,
  source_id uuid,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint tournament_championship_path_summary_expected_check
    check (expected_path_segment_count >= 0),
  constraint tournament_championship_path_summary_observed_check
    check (observed_path_segment_count >= 0),
  constraint tournament_championship_path_summary_state_check
    check (completeness_state in ('incomplete', 'complete', 'invalidated')),
  constraint tournament_championship_path_summary_revision_check
    check (revision >= 1),
  constraint tournament_championship_path_summary_source_type_check
    check (
      source_type in (
        'tournament_completion',
        'tournament_win',
        'path_recompute',
        'bracket_regeneration',
        'tournament_void',
        'historical_migration'
      )
    ),
  constraint tournament_championship_path_summary_metadata_check
    check (jsonb_typeof(source_metadata) = 'object'),
  constraint tournament_championship_path_summary_revision_key
    unique (tournament_id, registration_id, revision)
);

create index tournament_championship_path_summary_latest_idx
  on public.tournament_championship_path_summary_authority(
    tournament_id,
    registration_id,
    revision desc,
    id desc
  );

alter table public.tournament_championship_path_authority
  enable row level security;
alter table public.tournament_championship_path_authority
  force row level security;
alter table public.tournament_championship_path_summary_authority
  enable row level security;
alter table public.tournament_championship_path_summary_authority
  force row level security;

revoke all on table public.tournament_championship_path_authority
  from public, anon, authenticated, service_role;
revoke all on table public.tournament_championship_path_summary_authority
  from public, anon, authenticated, service_role;

grant select on table public.tournament_championship_path_authority
  to authenticated;
grant select on table public.tournament_championship_path_summary_authority
  to authenticated;
grant all privileges on table public.tournament_championship_path_authority
  to service_role;
grant all privileges on table public.tournament_championship_path_summary_authority
  to service_role;

create policy "Players can read their own championship path authority"
on public.tournament_championship_path_authority
for select
to authenticated
using (
  exists (
    select 1
    from public.registrations as registration
    where registration.id = tournament_championship_path_authority.registration_id
      and registration.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create policy "Players can read their own championship path summaries"
on public.tournament_championship_path_summary_authority
for select
to authenticated
using (
  exists (
    select 1
    from public.registrations as registration
    where registration.id = tournament_championship_path_summary_authority.registration_id
      and registration.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create or replace function public.append_tournament_championship_path_authority(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_path_index integer,
  p_round_number integer,
  p_expected_path_segment_count integer,
  p_source_match_id uuid,
  p_source_generated_bracket_id uuid,
  p_source_round_id uuid,
  p_outcome_kind text,
  p_authority_state text,
  p_finalized_at timestamptz,
  p_source_type text,
  p_source_id uuid,
  p_source_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous public.tournament_championship_path_authority%rowtype;
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_tournament_id::text || ':path:' || p_registration_id::text || ':' || p_path_index::text,
      0
    )
  );

  select authority.*
  into v_previous
  from public.tournament_championship_path_authority as authority
  where authority.tournament_id = p_tournament_id
    and authority.registration_id = p_registration_id
    and authority.path_index = p_path_index
  order by authority.revision desc, authority.id desc
  limit 1;

  if v_previous.id is not null
    and v_previous.round_number = p_round_number
    and v_previous.expected_path_segment_count = p_expected_path_segment_count
    and v_previous.source_match_id is not distinct from p_source_match_id
    and v_previous.source_generated_bracket_id is not distinct from p_source_generated_bracket_id
    and v_previous.source_round_id is not distinct from p_source_round_id
    and v_previous.outcome_kind = p_outcome_kind
    and v_previous.authority_state = p_authority_state
    and v_previous.source_type = p_source_type
    and v_previous.source_id is not distinct from p_source_id
  then
    return v_previous.id;
  end if;

  insert into public.tournament_championship_path_authority (
    tournament_id,
    registration_id,
    path_index,
    round_number,
    expected_path_segment_count,
    source_match_id,
    source_generated_bracket_id,
    source_round_id,
    outcome_kind,
    authority_state,
    revision,
    supersedes_id,
    finalized_at,
    source_type,
    source_id,
    source_metadata
  )
  values (
    p_tournament_id,
    p_registration_id,
    p_path_index,
    p_round_number,
    p_expected_path_segment_count,
    p_source_match_id,
    p_source_generated_bracket_id,
    p_source_round_id,
    p_outcome_kind,
    p_authority_state,
    coalesce(v_previous.revision, 0) + 1,
    v_previous.id,
    p_finalized_at,
    p_source_type,
    p_source_id,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  -- Recompute while the segment revision lock is still held. The summary
  -- function takes the summary lock after this path lock, which is the
  -- consistent lock order for segment-driven refreshes.
  perform public.refresh_tournament_championship_path_summary(
    p_tournament_id,
    p_registration_id,
    'path_recompute',
    coalesce(p_source_id, p_source_match_id),
    p_finalized_at
  );

  return v_id;
end;
$$;

alter function public.append_tournament_championship_path_authority(
  uuid, uuid, integer, integer, integer, uuid, uuid, uuid, text, text,
  timestamptz, text, uuid, jsonb
) owner to postgres;
revoke all on function public.append_tournament_championship_path_authority(
  uuid, uuid, integer, integer, integer, uuid, uuid, uuid, text, text,
  timestamptz, text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.append_tournament_championship_path_authority(
  uuid, uuid, integer, integer, integer, uuid, uuid, uuid, text, text,
  timestamptz, text, uuid, jsonb
) to service_role;

create or replace function public.append_tournament_championship_path_summary_authority(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_expected_path_segment_count integer,
  p_observed_path_segment_count integer,
  p_completeness_state text,
  p_finalized_at timestamptz,
  p_source_type text,
  p_source_id uuid,
  p_source_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous public.tournament_championship_path_summary_authority%rowtype;
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_tournament_id::text || ':path-summary:' || p_registration_id::text,
      0
    )
  );

  select summary.*
  into v_previous
  from public.tournament_championship_path_summary_authority as summary
  where summary.tournament_id = p_tournament_id
    and summary.registration_id = p_registration_id
  order by summary.revision desc, summary.id desc
  limit 1;

  if v_previous.id is not null
    and v_previous.expected_path_segment_count = p_expected_path_segment_count
    and v_previous.observed_path_segment_count = p_observed_path_segment_count
    and v_previous.completeness_state = p_completeness_state
  then
    return v_previous.id;
  end if;

  insert into public.tournament_championship_path_summary_authority (
    tournament_id,
    registration_id,
    expected_path_segment_count,
    observed_path_segment_count,
    completeness_state,
    revision,
    supersedes_id,
    finalized_at,
    source_type,
    source_id,
    source_metadata
  )
  values (
    p_tournament_id,
    p_registration_id,
    p_expected_path_segment_count,
    p_observed_path_segment_count,
    p_completeness_state,
    coalesce(v_previous.revision, 0) + 1,
    v_previous.id,
    p_finalized_at,
    p_source_type,
    p_source_id,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter function public.append_tournament_championship_path_summary_authority(
  uuid, uuid, integer, integer, text, timestamptz, text, uuid, jsonb
) owner to postgres;
revoke all on function public.append_tournament_championship_path_summary_authority(
  uuid, uuid, integer, integer, text, timestamptz, text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.append_tournament_championship_path_summary_authority(
  uuid, uuid, integer, integer, text, timestamptz, text, uuid, jsonb
) to service_role;

create or replace function public.refresh_tournament_championship_path_summary(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_finalized_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_expected integer := 0;
  v_observed integer := 0;
  v_state text := 'incomplete';
  v_id uuid;
  v_has_invalid boolean := false;
  v_expected_consistent boolean := false;
  v_is_champion boolean := false;
begin
  if not exists (
    select 1
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
  ) then
    select public.append_tournament_championship_path_summary_authority(
      p_tournament_id,
      p_registration_id,
      0,
      0,
      'incomplete',
      p_finalized_at,
      p_source_type,
      p_source_id,
      jsonb_build_object(
        'pathAuthorityOnly', true,
        'campaignEvaluationDeferred', true,
        'reason', 'tournament_not_completed'
      )
    ) into v_id;
    return v_id;
  end if;

  select exists (
    select 1
    from public.leaderboard_point_events as event
    where event.tournament_id = p_tournament_id
      and event.registration_id = p_registration_id
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and event.bracket_type in ('academy', 'challenge', 'main')
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  )
  into v_is_champion;

  select
    coalesce(max(authority.expected_path_segment_count), 0),
    count(*)::integer,
    min(authority.expected_path_segment_count) =
      max(authority.expected_path_segment_count),
    bool_or(
      authority.authority_state = 'invalidated'
      or authority.outcome_kind in (
        'player_no_show',
        'double_no_show',
        'admin_default',
        'cancelled',
        'voided',
        'unknown'
      )
    )
  into v_expected, v_observed, v_expected_consistent, v_has_invalid
  from (
    select distinct on (authority.path_index)
      authority.*
    from public.tournament_championship_path_authority as authority
    where authority.tournament_id = p_tournament_id
      and authority.registration_id = p_registration_id
    order by authority.path_index, authority.revision desc, authority.id desc
  ) as authority;

  if v_is_champion
    and v_expected > 0
    and v_expected_consistent
    and v_observed = v_expected
    and not v_has_invalid
    and not exists (
      select 1
      from (
        select distinct on (authority.path_index)
          authority.*
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
      where latest.path_index < 1
        or latest.path_index > v_expected
    )
    and (
      select min(latest.path_index)
      from (
        select distinct on (authority.path_index)
          authority.path_index
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
    ) = 1
    and (
      select max(latest.path_index)
      from (
        select distinct on (authority.path_index)
          authority.path_index
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
          and authority.registration_id = p_registration_id
        order by authority.path_index, authority.revision desc, authority.id desc
      ) as latest
    ) = v_expected
  then
    v_state := 'complete';
  end if;

  select public.append_tournament_championship_path_summary_authority(
    p_tournament_id,
    p_registration_id,
    v_expected,
    v_observed,
    v_state,
    p_finalized_at,
    p_source_type,
    p_source_id,
    jsonb_build_object(
      'pathAuthorityOnly', true,
      'campaignEvaluationDeferred', true
    )
  ) into v_id;

  return v_id;
end;
$$;

alter function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) owner to postgres;
revoke all on function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.refresh_tournament_championship_path_summary(
  uuid, uuid, text, uuid, timestamptz
) to service_role;

create or replace function public.record_tournament_championship_path_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_round_number integer;
  v_expected_count integer;
  v_slot_count integer;
  v_round_count integer;
  v_min_round integer;
  v_max_round integer;
  v_topology_valid boolean;
  v_outcome record;
  v_registration_id uuid;
begin
  select bracket.tournament_id, round.round_number
  into v_tournament_id, v_round_number
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where round.id = new.round_id
    and generated.format = 'single_elimination'
    and bracket.launched_at is not null
    and bracket.name in ('Academy', 'Challenge', 'Main');

  if v_tournament_id is null or new.outcome_type = 'empty_feeder' then
    return new;
  end if;

  select
    generated.slot_count,
    count(*)::integer,
    min(round.round_number),
    max(round.round_number)
  into v_slot_count, v_round_count, v_min_round, v_max_round
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.generated_bracket_id = new.generated_bracket_id
  group by generated.slot_count;

  v_topology_valid :=
    v_slot_count >= 2
    and v_round_count > 0
    and v_min_round = 1
    and v_max_round = v_round_count
    and v_slot_count = pg_catalog.power(2, v_round_count)::integer;

  -- The supported single-elimination generator uses complete power-of-two
  -- round topology. Unknown or malformed topology remains incomplete.
  if not coalesce(v_topology_valid, false) then
    return new;
  end if;

  v_expected_count := v_round_count;

  foreach v_registration_id in array[
    new.player_one_registration_id,
    new.player_two_registration_id
  ] loop
    if v_registration_id is not null then
      select authority.outcome_kind, authority.finalized_at
      into v_outcome
      from public.match_participant_outcome_authority as authority
      where authority.match_id = new.id
        and authority.registration_id = v_registration_id
      order by authority.revision desc, authority.id desc
      limit 1;

      if v_outcome.outcome_kind is not null then
        perform public.append_tournament_championship_path_authority(
          v_tournament_id,
          v_registration_id,
          v_round_number,
          v_round_number,
          v_expected_count,
          new.id,
          new.generated_bracket_id,
          new.round_id,
          v_outcome.outcome_kind,
          'active',
          v_outcome.finalized_at,
          'match_authority',
          new.id,
          jsonb_build_object(
            'pathAuthorityOnly', true,
            'matchStatus', new.status
          )
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_championship_path_authority()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_authority()
  from public, anon, authenticated, service_role;

create trigger tournament_matches_record_championship_path_authority
after update of
  official_result_decided_at,
  official_result_submission_id,
  winner_registration_id,
  outcome_type,
  status
on public.tournament_matches
for each row
execute function public.record_tournament_championship_path_authority();

create or replace function public.record_tournament_championship_path_regeneration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_path record;
  v_summary record;
begin
  for v_path in
    select distinct on (authority.tournament_id, authority.registration_id, authority.path_index)
      authority.*
    from public.tournament_championship_path_authority as authority
    where authority.source_generated_bracket_id = old.id
      and authority.authority_state = 'active'
    order by authority.tournament_id, authority.registration_id,
      authority.path_index, authority.revision desc, authority.id desc
  loop
    perform public.append_tournament_championship_path_authority(
      v_path.tournament_id,
      v_path.registration_id,
      v_path.path_index,
      v_path.round_number,
      v_path.expected_path_segment_count,
      v_path.source_match_id,
      v_path.source_generated_bracket_id,
      v_path.source_round_id,
      'unknown',
      'invalidated',
      clock_timestamp(),
      'bracket_regeneration',
      old.id,
      jsonb_build_object('invalidatesPath', true)
    );
  end loop;

  for v_summary in
    select distinct on (summary.tournament_id, summary.registration_id)
      summary.*
    from public.tournament_championship_path_summary_authority as summary
    where summary.tournament_id in (
      select distinct authority.tournament_id
      from public.tournament_championship_path_authority as authority
      where authority.source_generated_bracket_id = old.id
    )
    order by summary.tournament_id, summary.registration_id,
      summary.revision desc, summary.id desc
  loop
    perform public.append_tournament_championship_path_summary_authority(
      v_summary.tournament_id,
      v_summary.registration_id,
      v_summary.expected_path_segment_count,
      v_summary.observed_path_segment_count,
      'invalidated',
      clock_timestamp(),
      'bracket_regeneration',
      old.id,
      jsonb_build_object('invalidatesPath', true)
    );
  end loop;

  return old;
end;
$$;

alter function public.record_tournament_championship_path_regeneration()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_regeneration()
  from public, anon, authenticated, service_role;

create trigger generated_brackets_invalidate_championship_path_authority
after delete on public.generated_brackets
for each row
execute function public.record_tournament_championship_path_regeneration();

create or replace function public.record_tournament_championship_path_void()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_path record;
  v_summary record;
  v_kind text := case when new.status = 'voided' then 'voided' else 'cancelled' end;
begin
  if old.status is not distinct from new.status
    or new.status not in ('cancelled', 'voided') then
    return new;
  end if;

  for v_path in
    select distinct on (authority.tournament_id, authority.registration_id, authority.path_index)
      authority.*
    from public.tournament_championship_path_authority as authority
    where authority.tournament_id = new.id
      and authority.authority_state = 'active'
    order by authority.tournament_id, authority.registration_id,
      authority.path_index, authority.revision desc, authority.id desc
  loop
    perform public.append_tournament_championship_path_authority(
      v_path.tournament_id,
      v_path.registration_id,
      v_path.path_index,
      v_path.round_number,
      v_path.expected_path_segment_count,
      v_path.source_match_id,
      v_path.source_generated_bracket_id,
      v_path.source_round_id,
      v_kind,
      'active',
      coalesce(new.voided_at, clock_timestamp()),
      'tournament_void',
      new.id,
      jsonb_build_object('tournamentStatus', new.status)
    );
  end loop;

  for v_summary in
    select distinct on (summary.tournament_id, summary.registration_id)
      summary.*
    from public.tournament_championship_path_summary_authority as summary
    where summary.tournament_id = new.id
    order by summary.tournament_id, summary.registration_id,
      summary.revision desc, summary.id desc
  loop
    perform public.append_tournament_championship_path_summary_authority(
      v_summary.tournament_id,
      v_summary.registration_id,
      v_summary.expected_path_segment_count,
      v_summary.observed_path_segment_count,
      'invalidated',
      coalesce(new.voided_at, clock_timestamp()),
      'tournament_void',
      new.id,
      jsonb_build_object('tournamentStatus', new.status)
    );
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_championship_path_void()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_void()
  from public, anon, authenticated, service_role;

create trigger tournaments_record_championship_path_void
after update of status on public.tournaments
for each row
execute function public.record_tournament_championship_path_void();

create or replace function public.record_tournament_championship_path_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.event_type = 'tournament_win'
    and new.source in ('system', 'recalculation')
    and new.tournament_id is not null
    and new.registration_id is not null then
    perform public.refresh_tournament_championship_path_summary(
      new.tournament_id,
      new.registration_id,
      'tournament_win',
      new.id,
      coalesce(
        (select tournament.first_completed_at
         from public.tournaments as tournament
         where tournament.id = new.tournament_id),
        clock_timestamp()
      )
    );
  end if;
  return new;
end;
$$;

alter function public.record_tournament_championship_path_completion()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_completion()
  from public, anon, authenticated, service_role;

create trigger leaderboard_point_events_record_championship_path_completion
after insert on public.leaderboard_point_events
for each row
execute function public.record_tournament_championship_path_completion();

create or replace function public.record_tournament_championship_path_tournament_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event record;
begin
  if old.status is distinct from new.status
    and new.status = 'completed'
    and new.first_completed_at is not null then
    for v_event in
      select event.id, event.registration_id
      from public.leaderboard_point_events as event
      where event.tournament_id = new.id
        and event.event_type = 'tournament_win'
        and event.source in ('system', 'recalculation')
        and event.registration_id is not null
    loop
      perform public.refresh_tournament_championship_path_summary(
        new.id,
        v_event.registration_id,
        'tournament_completion',
        v_event.id,
        new.first_completed_at
      );
    end loop;
  end if;
  return new;
end;
$$;

alter function public.record_tournament_championship_path_tournament_completion()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_tournament_completion()
  from public, anon, authenticated, service_role;

create trigger tournaments_record_championship_path_completion
after update of status on public.tournaments
for each row
execute function public.record_tournament_championship_path_tournament_completion();

create or replace function public.get_tournament_championship_path_summary(
  p_tournament_id uuid,
  p_registration_id uuid
)
returns table (
  tournament_id uuid,
  registration_id uuid,
  expected_path_segment_count integer,
  observed_path_segment_count integer,
  completeness_state text,
  revision integer,
  finalized_at timestamptz,
  source_type text,
  source_id uuid,
  source_metadata jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    summary.tournament_id,
    summary.registration_id,
    summary.expected_path_segment_count,
    summary.observed_path_segment_count,
    summary.completeness_state,
    summary.revision,
    summary.finalized_at,
    summary.source_type,
    summary.source_id,
    summary.source_metadata
  from public.tournament_championship_path_summary_authority as summary
  where summary.tournament_id = p_tournament_id
    and summary.registration_id = p_registration_id
  order by summary.revision desc, summary.id desc
  limit 1;
$$;

alter function public.get_tournament_championship_path_summary(uuid, uuid)
  owner to postgres;
revoke all on function public.get_tournament_championship_path_summary(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_tournament_championship_path_summary(uuid, uuid)
  to service_role;

create or replace function public.get_tournament_championship_path_segments(
  p_tournament_id uuid,
  p_registration_id uuid
)
returns table (
  tournament_id uuid,
  registration_id uuid,
  path_index integer,
  round_number integer,
  expected_path_segment_count integer,
  source_match_id uuid,
  source_generated_bracket_id uuid,
  source_round_id uuid,
  outcome_kind text,
  authority_state text,
  revision integer,
  finalized_at timestamptz,
  source_type text,
  source_id uuid,
  source_metadata jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    authority.tournament_id,
    authority.registration_id,
    authority.path_index,
    authority.round_number,
    authority.expected_path_segment_count,
    authority.source_match_id,
    authority.source_generated_bracket_id,
    authority.source_round_id,
    authority.outcome_kind,
    authority.authority_state,
    authority.revision,
    authority.finalized_at,
    authority.source_type,
    authority.source_id,
    authority.source_metadata
  from (
    select distinct on (path.path_index)
      path.*
    from public.tournament_championship_path_authority as path
    where path.tournament_id = p_tournament_id
      and path.registration_id = p_registration_id
    order by path.path_index, path.revision desc, path.id desc
  ) as authority
  order by authority.path_index;
$$;

alter function public.get_tournament_championship_path_segments(uuid, uuid)
  owner to postgres;
revoke all on function public.get_tournament_championship_path_segments(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_tournament_championship_path_segments(uuid, uuid)
  to service_role;

commit;
