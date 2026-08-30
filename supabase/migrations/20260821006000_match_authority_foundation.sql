begin;

-- These tables deliberately do not reference tournament_matches. Generated
-- brackets may be replaced and their match rows may be cascaded away. The
-- match UUID remains stable provenance when the source row still exists.
create table public.match_participant_outcome_authority (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  tournament_id uuid not null
    references public.tournaments(id) on delete restrict,
  registration_id uuid not null
    references public.registrations(id) on delete restrict,
  outcome_kind text not null,
  revision integer not null,
  supersedes_id uuid
    references public.match_participant_outcome_authority(id)
    on delete restrict,
  finalized_at timestamptz not null,
  source_type text not null,
  source_id uuid,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint match_participant_outcome_authority_kind_check
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
  constraint match_participant_outcome_authority_revision_check
    check (revision >= 1),
  constraint match_participant_outcome_authority_source_type_check
    check (
      source_type in (
        'match_finalization',
        'no_show_finalization',
        'derived_outcome',
        'match_reset',
        'tournament_void',
        'historical_migration'
      )
    ),
  constraint match_participant_outcome_authority_metadata_check
    check (jsonb_typeof(source_metadata) = 'object'),
  constraint match_participant_outcome_authority_revision_key
    unique (match_id, registration_id, revision)
);

create index match_participant_outcome_authority_history_idx
  on public.match_participant_outcome_authority(
    tournament_id,
    registration_id,
    finalized_at,
    match_id
  );

create index match_participant_outcome_authority_latest_idx
  on public.match_participant_outcome_authority(
    match_id,
    registration_id,
    revision desc,
    id desc
  );

create table public.match_game_result_authority (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  tournament_id uuid not null
    references public.tournaments(id) on delete restrict,
  game_number integer not null,
  winner_registration_id uuid,
  loser_registration_id uuid,
  revision integer not null,
  supersedes_id uuid
    references public.match_game_result_authority(id)
    on delete restrict,
  authority_state text not null default 'active',
  series_best_of integer not null,
  finalized_game_count integer not null,
  game_authority_complete boolean not null default false,
  finalized_at timestamptz not null,
  source_type text not null,
  source_id uuid,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint match_game_result_authority_game_number_check
    check (game_number >= 1 and game_number <= 15),
  constraint match_game_result_authority_series_format_check
    check (
      series_best_of >= 1
      and series_best_of <= 15
      and (series_best_of % 2) = 1
    ),
  constraint match_game_result_authority_game_count_check
    check (finalized_game_count >= 0 and finalized_game_count <= series_best_of),
  constraint match_game_result_authority_complete_check
    check (not game_authority_complete or finalized_game_count > 0),
  constraint match_game_result_authority_state_check
    check (authority_state in ('active', 'invalidated')),
  constraint match_game_result_authority_active_winner_check
    check (
      authority_state = 'invalidated'
      or winner_registration_id is not null
    ),
  constraint match_game_result_authority_distinct_players_check
    check (
      loser_registration_id is null
      or winner_registration_id is distinct from loser_registration_id
    ),
  constraint match_game_result_authority_source_type_check
    check (
      source_type in (
        'match_finalization',
        'match_reset',
        'tournament_void',
        'historical_migration'
      )
    ),
  constraint match_game_result_authority_metadata_check
    check (jsonb_typeof(source_metadata) = 'object'),
  constraint match_game_result_authority_revision_key
    unique (match_id, game_number, revision)
);

create index match_game_result_authority_latest_idx
  on public.match_game_result_authority(
    match_id,
    game_number,
    revision desc,
    id desc
  );

create index match_game_result_authority_tournament_player_idx
  on public.match_game_result_authority(
    tournament_id,
    winner_registration_id,
    finalized_at
  )
  where authority_state = 'active';

alter table public.match_participant_outcome_authority enable row level security;
alter table public.match_participant_outcome_authority force row level security;
alter table public.match_game_result_authority enable row level security;
alter table public.match_game_result_authority force row level security;

revoke all on table public.match_participant_outcome_authority
  from public, anon, authenticated, service_role;
revoke all on table public.match_game_result_authority
  from public, anon, authenticated, service_role;

grant select on table public.match_participant_outcome_authority to authenticated;
grant select on table public.match_game_result_authority to authenticated;
grant all privileges on table public.match_participant_outcome_authority to service_role;
grant all privileges on table public.match_game_result_authority to service_role;

create policy "Players can read their own participant outcome authority"
on public.match_participant_outcome_authority
for select
to authenticated
using (
  exists (
    select 1
    from public.registrations as registration
    where registration.id = match_participant_outcome_authority.registration_id
      and registration.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create policy "Players can read their own game authority"
on public.match_game_result_authority
for select
to authenticated
using (
  exists (
    select 1
    from public.registrations as registration
    where registration.id in (
      match_game_result_authority.winner_registration_id,
      match_game_result_authority.loser_registration_id
    )
      and registration.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create or replace function public.append_match_participant_outcome_authority(
  p_match_id uuid,
  p_tournament_id uuid,
  p_registration_id uuid,
  p_outcome_kind text,
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
  v_previous public.match_participant_outcome_authority%rowtype;
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_match_id::text || ':participant:' || p_registration_id::text,
      0
    )
  );

  select authority.*
  into v_previous
  from public.match_participant_outcome_authority as authority
  where authority.match_id = p_match_id
    and authority.registration_id = p_registration_id
  order by authority.revision desc, authority.id desc
  limit 1;

  if v_previous.id is not null
    and v_previous.tournament_id = p_tournament_id
    and v_previous.outcome_kind = p_outcome_kind
    and v_previous.source_type = p_source_type
    and v_previous.source_id is not distinct from p_source_id
    and (
      v_previous.finalized_at = p_finalized_at
      or v_previous.source_id is not null
    ) then
    return v_previous.id;
  end if;

  insert into public.match_participant_outcome_authority (
    match_id,
    tournament_id,
    registration_id,
    outcome_kind,
    revision,
    supersedes_id,
    finalized_at,
    source_type,
    source_id,
    source_metadata
  )
  values (
    p_match_id,
    p_tournament_id,
    p_registration_id,
    p_outcome_kind,
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

alter function public.append_match_participant_outcome_authority(
  uuid, uuid, uuid, text, timestamptz, text, uuid, jsonb
) owner to postgres;
revoke all on function public.append_match_participant_outcome_authority(
  uuid, uuid, uuid, text, timestamptz, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.append_match_game_result_authority(
  p_match_id uuid,
  p_tournament_id uuid,
  p_game_number integer,
  p_winner_registration_id uuid,
  p_loser_registration_id uuid,
  p_series_best_of integer,
  p_finalized_game_count integer,
  p_game_authority_complete boolean,
  p_revision_source text,
  p_finalized_at timestamptz,
  p_source_id uuid,
  p_source_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous public.match_game_result_authority%rowtype;
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_match_id::text || ':game:' || p_game_number::text,
      0
    )
  );

  if not exists (
    select 1
    from public.tournament_matches as match
    where match.id = p_match_id
      and p_winner_registration_id in (
        match.player_one_registration_id,
        match.player_two_registration_id
      )
  ) then
    raise exception 'Finalized game winner must be a match participant';
  end if;

  if p_loser_registration_id is not null
    and not exists (
      select 1
      from public.tournament_matches as match
      where match.id = p_match_id
        and p_loser_registration_id in (
          match.player_one_registration_id,
          match.player_two_registration_id
        )
    ) then
    raise exception 'Finalized game loser must be a match participant';
  end if;

  select authority.*
  into v_previous
  from public.match_game_result_authority as authority
  where authority.match_id = p_match_id
    and authority.game_number = p_game_number
  order by authority.revision desc, authority.id desc
  limit 1;

  if v_previous.id is not null
    and v_previous.tournament_id = p_tournament_id
    and v_previous.authority_state = 'active'
    and v_previous.winner_registration_id = p_winner_registration_id
    and v_previous.loser_registration_id is not distinct from
      p_loser_registration_id
    and v_previous.series_best_of = p_series_best_of
    and v_previous.finalized_game_count = p_finalized_game_count
    and v_previous.game_authority_complete =
      coalesce(p_game_authority_complete, false)
    and v_previous.source_type = p_revision_source
    and v_previous.source_id is not distinct from p_source_id
    and (
      v_previous.finalized_at = p_finalized_at
      or v_previous.source_id is not null
    ) then
    return v_previous.id;
  end if;

  insert into public.match_game_result_authority (
    match_id,
    tournament_id,
    game_number,
    winner_registration_id,
    loser_registration_id,
    series_best_of,
    finalized_game_count,
    game_authority_complete,
    revision,
    supersedes_id,
    authority_state,
    finalized_at,
    source_type,
    source_id,
    source_metadata
  )
  values (
    p_match_id,
    p_tournament_id,
    p_game_number,
    p_winner_registration_id,
    p_loser_registration_id,
    p_series_best_of,
    p_finalized_game_count,
    coalesce(p_game_authority_complete, false),
    coalesce(v_previous.revision, 0) + 1,
    v_previous.id,
    'active',
    p_finalized_at,
    p_revision_source,
    p_source_id,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter function public.append_match_game_result_authority(
  uuid, uuid, integer, uuid, uuid, integer, integer, boolean, text,
  timestamptz, uuid, jsonb
) owner to postgres;
revoke all on function public.append_match_game_result_authority(
  uuid, uuid, integer, uuid, uuid, integer, integer, boolean, text,
  timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.get_match_participant_outcome_authority(
  p_match_id uuid
)
returns table (
  match_id uuid,
  tournament_id uuid,
  registration_id uuid,
  outcome_kind text,
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
  select distinct on (authority.registration_id)
    authority.match_id,
    authority.tournament_id,
    authority.registration_id,
    authority.outcome_kind,
    authority.revision,
    authority.finalized_at,
    authority.source_type,
    authority.source_id,
    authority.source_metadata
  from public.match_participant_outcome_authority as authority
  where authority.match_id = p_match_id
  order by authority.registration_id, authority.revision desc, authority.id desc;
$$;

create or replace function public.get_match_game_result_authority(
  p_match_id uuid
)
returns table (
  match_id uuid,
  tournament_id uuid,
  game_number integer,
  winner_registration_id uuid,
    loser_registration_id uuid,
    revision integer,
    authority_state text,
    series_best_of integer,
    finalized_game_count integer,
    game_authority_complete boolean,
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
  select distinct on (authority.game_number)
    authority.match_id,
    authority.tournament_id,
    authority.game_number,
    authority.winner_registration_id,
    authority.loser_registration_id,
    authority.revision,
    authority.authority_state,
    authority.series_best_of,
    authority.finalized_game_count,
    authority.game_authority_complete,
    authority.finalized_at,
    authority.source_type,
    authority.source_id,
    authority.source_metadata
  from (
    select distinct on (authority.game_number)
      authority.*
    from public.match_game_result_authority as authority
    where authority.match_id = p_match_id
    order by authority.game_number, authority.revision desc, authority.id desc
  ) as authority
  where authority.authority_state = 'active'
  order by authority.game_number;
$$;

do $$
begin
  alter function public.get_match_participant_outcome_authority(uuid)
    owner to postgres;
  alter function public.get_match_game_result_authority(uuid)
    owner to postgres;
end;
$$;

revoke all on function public.get_match_participant_outcome_authority(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_match_game_result_authority(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.record_tournament_match_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_source_type text;
  v_source_id uuid;
  v_finalized_at timestamptz;
  v_outcome_kind text;
  v_no_show_registration_id uuid;
  v_no_show_source_id uuid;
  v_report_group_source_id uuid;
  v_distinct_game_count integer := 0;
  v_min_game_number integer;
  v_max_game_number integer;
  v_conflicting_game_claims boolean := false;
  v_game_authority_complete boolean := false;
  v_proven_played boolean := false;
  v_participant_id uuid;
  v_submission record;
begin
  select bracket.tournament_id
  into v_tournament_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = new.generated_bracket_id;

  if v_tournament_id is null then
    return new;
  end if;

  if new.outcome_type = 'empty_feeder' then
    return new;
  end if;

  if new.outcome_type = 'automatic_bye'
    and new.player_one_registration_id is not null then
    perform public.append_match_participant_outcome_authority(
      new.id,
      v_tournament_id,
      new.player_one_registration_id,
      'automatic_bye',
      coalesce(new.deadline_ruled_at, clock_timestamp()),
      'derived_outcome',
      new.id,
      jsonb_build_object('outcome_type', 'automatic_bye')
    );
    return new;
  end if;

  if new.outcome_type = 'deadline_double_forfeit'
    and new.player_one_registration_id is not null
    and new.player_two_registration_id is not null then
    foreach v_participant_id in array ARRAY[
      new.player_one_registration_id,
      new.player_two_registration_id
    ] loop
      perform public.append_match_participant_outcome_authority(
        new.id,
        v_tournament_id,
        v_participant_id,
        'double_no_show',
        coalesce(new.deadline_ruled_at, clock_timestamp()),
        'derived_outcome',
        new.id,
        jsonb_build_object('outcome_type', 'deadline_double_forfeit')
      );
    end loop;
    return new;
  end if;

  if new.official_result_decided_at is null
    or new.winner_registration_id is null
    or new.outcome_type is not null then
    if (
      old.official_result_decided_at is not null
      and new.official_result_decided_at is null
    ) or (
      old.outcome_type is not null
      and new.outcome_type is null
    ) then
      foreach v_participant_id in array ARRAY[
        old.player_one_registration_id,
        old.player_two_registration_id
      ] loop
        if v_participant_id is not null then
          perform public.append_match_participant_outcome_authority(
            new.id,
            v_tournament_id,
            v_participant_id,
            'unknown',
            clock_timestamp(),
            'match_reset',
            new.id,
            jsonb_build_object('invalidates_previous', true)
          );
        end if;
      end loop;

      insert into public.match_game_result_authority (
        match_id,
        tournament_id,
        game_number,
        series_best_of,
        finalized_game_count,
        game_authority_complete,
        revision,
        supersedes_id,
        authority_state,
        finalized_at,
        source_type,
        source_id,
        source_metadata
      )
      select
        authority.match_id,
        authority.tournament_id,
        authority.game_number,
        authority.series_best_of,
        authority.finalized_game_count,
        authority.game_authority_complete,
        authority.revision + 1,
        authority.id,
        'invalidated',
        clock_timestamp(),
        'match_reset',
        new.id,
        jsonb_build_object('invalidates_previous', true)
      from (
        select distinct on (game.game_number)
          game.*
        from public.match_game_result_authority as game
        where game.match_id = new.id
        order by game.game_number, game.revision desc, game.id desc
      ) as authority
      where authority.authority_state = 'active';
    end if;
    return new;
  end if;

  v_source_type := 'match_finalization';
  v_source_id := coalesce(new.official_result_submission_id, new.id);
  v_finalized_at := new.official_result_decided_at;
  v_outcome_kind := 'unknown';

  select report_group.id,
    count(distinct submission.game_number)::integer,
    min(submission.game_number),
    max(submission.game_number)
  into v_report_group_source_id,
    v_distinct_game_count,
    v_min_game_number,
    v_max_game_number
  from public.match_result_report_groups as report_group
  left join public.match_result_submissions as submission
    on submission.report_group_id = report_group.id
    and submission.status = 'approved'
    and submission.game_number is not null
  where report_group.match_id = new.id
    and report_group.result_type = 'normal'
    and report_group.finalized_at is not null
    and report_group.status in ('confirmed', 'auto_approved', 'approved')
  group by report_group.id, report_group.finalized_at
  order by report_group.finalized_at desc, report_group.id desc
  limit 1;

  v_game_authority_complete :=
    v_report_group_source_id is not null
    and v_distinct_game_count =
      (new.player_one_score + new.player_two_score)
    and v_distinct_game_count > 0
    and v_min_game_number = 1
    and v_max_game_number = v_distinct_game_count;

  select exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = new.id
      and submission.report_group_id = v_report_group_source_id
      and submission.status = 'approved'
      and submission.game_number is not null
    group by submission.game_number
    having count(distinct submission.claimed_winner_registration_id) > 1
  )
  into v_conflicting_game_claims;

  v_game_authority_complete :=
    v_game_authority_complete and not v_conflicting_game_claims;

  v_proven_played := v_game_authority_complete;
  if v_proven_played then
    v_outcome_kind := 'played';
    v_source_id := v_report_group_source_id;
  end if;

  select report_group.no_show_registration_id, report_group.id
  into v_no_show_registration_id, v_no_show_source_id
  from public.match_result_report_groups as report_group
  where report_group.match_id = new.id
    and report_group.result_type = 'no_show'
    and report_group.finalized_at is not null
    and report_group.status in ('confirmed', 'auto_approved', 'approved')
    and report_group.no_show_status in ('confirmed', 'auto_confirmed', 'approved')
  order by report_group.finalized_at desc, report_group.id desc
  limit 1;

  if v_no_show_registration_id is not null then
    v_source_type := 'no_show_finalization';
    v_source_id := v_no_show_source_id;
    v_outcome_kind := 'unknown';
    v_proven_played := false;
  end if;

  foreach v_participant_id in array ARRAY[
    new.player_one_registration_id,
    new.player_two_registration_id
  ] loop
    if v_participant_id is not null then
      if v_no_show_registration_id is not null
        and v_participant_id = v_no_show_registration_id then
        v_outcome_kind := 'player_no_show';
      elsif v_no_show_registration_id is not null then
        v_outcome_kind := 'opponent_no_show';
      elsif v_proven_played then
        v_outcome_kind := 'played';
      else
        v_outcome_kind := 'unknown';
      end if;

      perform public.append_match_participant_outcome_authority(
        new.id,
        v_tournament_id,
        v_participant_id,
        v_outcome_kind,
        v_finalized_at,
        v_source_type,
        v_source_id,
        jsonb_build_object('winner_registration_id', new.winner_registration_id)
      );
    end if;
  end loop;

  if v_no_show_registration_id is null and v_proven_played then
    for v_submission in
      select distinct on (submission.game_number)
        submission.*
      from public.match_result_submissions as submission
      where submission.match_id = new.id
        and submission.report_group_id = v_report_group_source_id
        and submission.status = 'approved'
        and submission.game_number is not null
      order by submission.game_number, submission.id
    loop
      perform public.append_match_game_result_authority(
        new.id,
        v_tournament_id,
        v_submission.game_number,
        v_submission.claimed_winner_registration_id,
        case
          when v_submission.claimed_winner_registration_id =
            new.player_one_registration_id then new.player_two_registration_id
          else new.player_one_registration_id
        end,
        new.series_best_of,
        v_distinct_game_count,
        v_game_authority_complete,
        'match_finalization',
        v_finalized_at,
        v_submission.id,
        jsonb_build_object('submission_status', v_submission.status)
      );
    end loop;
  end if;

  return new;
end;
$$;

alter function public.record_tournament_match_authority() owner to postgres;
revoke all on function public.record_tournament_match_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists tournament_matches_record_authority
  on public.tournament_matches;
create trigger tournament_matches_record_authority
after update of
  official_result_decided_at,
  official_result_submission_id,
  winner_registration_id,
  outcome_type,
  status
on public.tournament_matches
for each row
execute function public.record_tournament_match_authority();

create or replace function public.record_tournament_void_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_participant record;
  v_game record;
  v_finalized_at timestamptz := coalesce(new.voided_at, clock_timestamp());
  v_kind text := case when new.status = 'voided' then 'voided' else 'cancelled' end;
begin
  if old.status is not distinct from new.status
    or new.status not in ('cancelled', 'voided') then
    return new;
  end if;

  for v_participant in
    select distinct on (authority.match_id, authority.registration_id)
      authority.*
    from public.match_participant_outcome_authority as authority
    where authority.tournament_id = new.id
    order by authority.match_id, authority.registration_id,
      authority.revision desc, authority.id desc
  loop
    if v_participant.outcome_kind not in ('cancelled', 'voided', 'unknown') then
      perform public.append_match_participant_outcome_authority(
        v_participant.match_id,
        new.id,
        v_participant.registration_id,
        v_kind,
        v_finalized_at,
        'tournament_void',
        new.id,
        jsonb_build_object('tournament_status', new.status)
      );
    end if;
  end loop;

  for v_game in
    select distinct on (authority.match_id, authority.game_number)
      authority.*
    from public.match_game_result_authority as authority
    where authority.tournament_id = new.id
      and authority.authority_state = 'active'
    order by authority.match_id, authority.game_number,
      authority.revision desc, authority.id desc
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_game.match_id::text || ':game:' || v_game.game_number::text,
        0
      )
    );

    insert into public.match_game_result_authority (
      match_id,
      tournament_id,
      game_number,
      series_best_of,
      finalized_game_count,
      game_authority_complete,
      revision,
      supersedes_id,
      authority_state,
      finalized_at,
      source_type,
      source_id,
      source_metadata
    )
    values (
      v_game.match_id,
      new.id,
      v_game.game_number,
      v_game.series_best_of,
      v_game.finalized_game_count,
      false,
      v_game.revision + 1,
      v_game.id,
      'invalidated',
      v_finalized_at,
      'tournament_void',
      new.id,
      jsonb_build_object('tournament_status', new.status)
    );
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_void_authority() owner to postgres;
revoke all on function public.record_tournament_void_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_record_authority_void
  on public.tournaments;
create trigger tournaments_record_authority_void
after update of status
on public.tournaments
for each row
execute function public.record_tournament_void_authority();

revoke all on function public.get_match_participant_outcome_authority(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_match_game_result_authority(uuid)
  from public, anon, authenticated, service_role;

comment on table public.match_participant_outcome_authority is
  'Append-only participant terminal outcomes. Latest revision is authoritative; match_id is provenance-only so bracket regeneration cannot cascade-delete history.';
comment on table public.match_game_result_authority is
  'Append-only finalized individual-game outcomes. Submitted claims are copied only after official series finalization.';

commit;
