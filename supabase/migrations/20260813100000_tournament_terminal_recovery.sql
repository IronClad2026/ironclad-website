begin;

-- Cancelled and voided are terminal factual states. The metadata is written
-- only through the service-role recovery functions below and is immutable
-- afterwards.
alter table public.tournaments
  drop constraint if exists tournaments_status_check;

alter table public.tournaments
  add column if not exists terminal_at timestamptz,
  add column if not exists terminal_reason text,
  add column if not exists terminated_by_clerk_user_id text,
  add constraint tournaments_status_check
    check (
      status in (
        'upcoming',
        'registration_open',
        'in_progress',
        'completed',
        'cancelled',
        'voided'
      )
    ),
  add constraint tournaments_terminal_metadata_check
    check (
      (
        status in ('cancelled', 'voided')
        and terminal_at is not null
        and nullif(btrim(terminal_reason), '') is not null
        and char_length(terminal_reason) <= 2000
        and nullif(btrim(terminated_by_clerk_user_id), '') is not null
      )
      or (
        status not in ('cancelled', 'voided')
        and terminal_at is null
        and terminal_reason is null
        and terminated_by_clerk_user_id is null
      )
    );

alter table public.leaderboard_tournament_season_memberships
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_clerk_user_id text,
  add column if not exists void_reason text,
  drop constraint if exists
    leaderboard_tournament_season_memberships_season_event_unique,
  add constraint leaderboard_memberships_void_metadata_check
    check (
      (
        voided_at is null
        and voided_by_clerk_user_id is null
        and void_reason is null
      )
      or (
        voided_at is not null
        and nullif(btrim(voided_by_clerk_user_id), '') is not null
        and nullif(btrim(void_reason), '') is not null
        and char_length(void_reason) <= 2000
      )
    );

create unique index
  leaderboard_tournament_season_memberships_valid_event_unique
on public.leaderboard_tournament_season_memberships(
  season_id,
  qualifying_event_number
)
where voided_at is null
  and qualifying_event_number is not null;

alter table public.leaderboard_seasons
  add column if not exists under_review_at timestamptz,
  add column if not exists under_review_reason text,
  add column if not exists under_review_by_clerk_user_id text,
  add column if not exists under_review_tournament_id uuid
    references public.tournaments(id) on delete restrict,
  add constraint leaderboard_seasons_under_review_metadata_check
    check (
      (
        under_review_at is null
        and under_review_reason is null
        and under_review_by_clerk_user_id is null
        and under_review_tournament_id is null
      )
      or (
        finalized_at is not null
        and under_review_at is not null
        and nullif(btrim(under_review_reason), '') is not null
        and char_length(under_review_reason) <= 2000
        and nullif(btrim(under_review_by_clerk_user_id), '') is not null
        and under_review_tournament_id is not null
      )
    );

comment on column public.tournaments.terminal_at is
  'Authoritative timestamp for the cancelled or voided terminal transition.';
comment on column public.leaderboard_tournament_season_memberships.voided_at is
  'Audit marker: the historical assignment remains, but no longer occupies a valid Main/Pro slot or Career event.';
comment on column public.leaderboard_seasons.under_review_at is
  'Factual integrity hold for a finalized Main/Pro season; frozen standings are not rewritten.';

-- Under-review reason and administrator attribution are private operational
-- data. Preserve established public season metadata at this migration
-- boundary; the next migration switches public reads to sanitized views.
revoke select on table public.leaderboard_seasons from anon, authenticated;
grant select (
  id,
  name,
  year,
  season_number,
  start_date,
  end_date,
  is_active,
  created_at,
  updated_at,
  finalized_at,
  under_review_at,
  under_review_tournament_id
) on public.leaderboard_seasons to anon, authenticated;

-- Keep public tournament reads compatible while the terminal reason and
-- administrator identity remain available only to trusted server access.
revoke select on table public.tournaments from anon, authenticated;
grant select (
  id,
  title,
  slug,
  format,
  status,
  battlefy_url,
  start_date,
  end_date,
  created_at,
  description,
  banner_image_url,
  registration_open_at,
  registration_close_at,
  prize_pool,
  rules_url,
  updated_at,
  registration_enabled,
  grand_final_at,
  rule_format,
  result_confirmation_window_minutes,
  first_completed_at,
  terminal_at
) on public.tournaments to anon, authenticated;

create function public.assert_tournament_not_terminal(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  select tournament.status
  into v_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for key share;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if v_status in ('cancelled', 'voided') then
    raise exception 'Terminal tournaments cannot accept competitive mutation'
      using errcode = '55000';
  end if;
end;
$$;

alter function public.assert_tournament_not_terminal(uuid)
  owner to postgres;
revoke all on function public.assert_tournament_not_terminal(uuid)
  from public, anon, authenticated, service_role;

-- Root-lock holders must never wait on a tournament row: a completion
-- transaction may already hold that row while its deferred recalculation
-- waits for the same PR 2 root lock. Refuse safely so the caller can retry.
create function public.assert_tournament_not_terminal_nowait(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  begin
    select tournament.status
    into v_status
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for key share nowait;
  exception when lock_not_available then
    raise exception 'Tournament is being updated; retry the operation'
      using errcode = '55P03';
  end;

  if v_status is null then
    raise exception 'Tournament not found';
  end if;

  if v_status in ('cancelled', 'voided') then
    raise exception 'Terminal tournaments cannot accept competitive mutation'
      using errcode = '55000';
  end if;
end;
$$;

alter function public.assert_tournament_not_terminal_nowait(uuid)
  owner to postgres;
revoke all on function public.assert_tournament_not_terminal_nowait(uuid)
  from public, anon, authenticated, service_role;

create function public.tournament_has_official_competition(
  p_tournament_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select
        tournament.first_completed_at is not null
        or exists (
          select 1
          from public.leaderboard_tournament_season_memberships as membership
          where membership.tournament_id = tournament.id
        )
        or exists (
          select 1
          from public.leaderboard_point_events as event
          where event.tournament_id = tournament.id
            or event.tournament_bracket_id in (
              select bracket.id
              from public.tournament_brackets as bracket
              where bracket.tournament_id = tournament.id
            )
            or event.registration_id in (
              select registration.id
              from public.registrations as registration
              where registration.tournament_id = tournament.id
            )
        )
        or exists (
          select 1
          from public.tournament_brackets as bracket
          join public.generated_brackets as generated
            on generated.tournament_bracket_id = bracket.id
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          where bracket.tournament_id = tournament.id
            and (
              match.status = 'completed'
              or match.player_one_score is not null
              or match.player_two_score is not null
              or match.winner_registration_id is not null
              or match.official_result_submission_id is not null
              or match.official_result_decided_by is not null
              or match.official_result_decided_at is not null
              or match.outcome_type is not null
              or match.deadline_ruled_at is not null
            )
        )
        or exists (
          select 1
          from public.match_result_submissions as submission
          join public.tournament_matches as match
            on match.id = submission.match_id
          join public.generated_brackets as generated
            on generated.id = match.generated_bracket_id
          join public.tournament_brackets as bracket
            on bracket.id = generated.tournament_bracket_id
          where bracket.tournament_id = tournament.id
            and submission.status = 'approved'
        )
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.tournament_id = tournament.id
            and report_group.finalized_at is not null
            and report_group.status in (
              'confirmed',
              'auto_approved',
              'approved'
            )
        )
      from public.tournaments as tournament
      where tournament.id = p_tournament_id
    ),
    false
  );
$$;

alter function public.tournament_has_official_competition(uuid)
  owner to postgres;
revoke all on function public.tournament_has_official_competition(uuid)
  from public, anon, authenticated, service_role;

create function public.guard_tournament_terminal_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_terminal_transition boolean :=
    coalesce(
      pg_catalog.current_setting(
        'ironclad.tournament_terminal_transition',
        true
      ),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
  v_account_closure boolean :=
    coalesce(
      pg_catalog.current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if old.status in ('cancelled', 'voided') then
    if new.status is distinct from old.status then
      raise exception 'A terminal tournament cannot be reopened or changed'
        using errcode = '55000';
    end if;

    if (
      new.terminal_at is distinct from old.terminal_at
      or new.terminal_reason is distinct from old.terminal_reason
      or new.terminated_by_clerk_user_id is distinct from
        old.terminated_by_clerk_user_id
    ) and not v_account_closure then
      raise exception 'Tournament terminal metadata is immutable'
        using errcode = '55000';
    end if;

    new.registration_enabled := false;
    return new;
  end if;

  if new.status in ('cancelled', 'voided') and not v_terminal_transition then
    raise exception 'Use the protected tournament recovery operation'
      using errcode = '55000';
  end if;

  if new.status in ('cancelled', 'voided') then
    new.registration_enabled := false;
  end if;

  return new;
end;
$$;

alter function public.guard_tournament_terminal_transition()
  owner to postgres;
revoke all on function public.guard_tournament_terminal_transition()
  from public, anon, authenticated, service_role;

drop trigger if exists tournaments_guard_terminal_transition
  on public.tournaments;
create trigger tournaments_guard_terminal_transition
before update of
  status,
  terminal_at,
  terminal_reason,
  terminated_by_clerk_user_id
on public.tournaments
for each row execute function public.guard_tournament_terminal_transition();

-- Phase 4 normally freezes global registration availability while launched
-- and unlaunched sibling divisions coexist. A trusted terminal RPC must still
-- be able to close registration while preserving every division fact.
create or replace function public.protect_tournament_lifecycle_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_has_launched boolean;
  v_has_unlaunched boolean;
  v_explicit_transition boolean;
  v_terminal_transition boolean :=
    coalesce(
      pg_catalog.current_setting(
        'ironclad.tournament_terminal_transition',
        true
      ),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  select
    coalesce(bool_or(bracket.launched_at is not null), false),
    coalesce(bool_or(bracket.launched_at is null), false)
  into v_has_launched, v_has_unlaunched
  from public.tournament_brackets as bracket
  where bracket.tournament_id = old.id;

  v_explicit_transition := coalesce(
    pg_catalog.current_setting('ironclad.explicit_division_launch', true),
    ''
  ) = 'on';

  if new.status = 'in_progress'
    and old.status is distinct from 'in_progress'
    and not v_explicit_transition then
    raise exception
      'Use Launch Division to move a tournament into progress';
  end if;

  if v_has_launched
    and new.status in ('upcoming', 'registration_open') then
    raise exception 'A tournament with a launched division cannot be reopened';
  end if;

  if new.status = 'completed' and v_has_unlaunched then
    raise exception
      'A tournament cannot complete while a configured division is unlaunched';
  end if;

  if new.registration_enabled is true
    and v_has_launched
    and not v_has_unlaunched then
    raise exception
      'Registration cannot reopen after every division has launched';
  end if;

  if v_has_launched
    and v_has_unlaunched
    and not v_explicit_transition
    and not v_terminal_transition
    and new.registration_enabled is distinct from
      old.registration_enabled then
    raise exception
      'Global registration availability must remain unchanged while sibling divisions are unlaunched';
  end if;

  return new;
end;
$$;

alter function public.protect_tournament_lifecycle_boundary()
  owner to postgres;
revoke all on function public.protect_tournament_lifecycle_boundary()
  from public, anon, authenticated;
grant execute on function public.protect_tournament_lifecycle_boundary()
  to service_role;

create function public.guard_terminal_competition_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_old_tournament_id uuid;
  v_new_tournament_id uuid;
  v_trusted_caller boolean :=
    session_user = 'postgres'
    or coalesce(auth.role(), '') = 'service_role';
begin
  if v_trusted_caller and (
    coalesce(
      pg_catalog.current_setting('ironclad.tournament_deletion', true),
      ''
    ) = 'on'
    or coalesce(
      pg_catalog.current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'registrations' then
    if tg_op <> 'INSERT' then
      v_old_tournament_id := old.tournament_id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_tournament_id := new.tournament_id;
    end if;
  elsif tg_table_name = 'tournament_brackets' then
    if tg_op <> 'INSERT' then
      v_old_tournament_id := old.tournament_id;
    end if;
    if tg_op <> 'DELETE' then
      v_new_tournament_id := new.tournament_id;
    end if;
  elsif tg_table_name = 'generated_brackets' then
    if tg_op <> 'INSERT' then
      select bracket.tournament_id
      into v_old_tournament_id
      from public.tournament_brackets as bracket
      where bracket.id = old.tournament_bracket_id;
    end if;
    if tg_op <> 'DELETE' then
      select bracket.tournament_id
      into v_new_tournament_id
      from public.tournament_brackets as bracket
      where bracket.id = new.tournament_bracket_id;
    end if;
  elsif tg_table_name = 'bracket_rounds' then
    if tg_op <> 'INSERT' then
      select bracket.tournament_id
      into v_old_tournament_id
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where generated.id = old.generated_bracket_id;
    end if;
    if tg_op <> 'DELETE' then
      select bracket.tournament_id
      into v_new_tournament_id
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where generated.id = new.generated_bracket_id;
    end if;
  elsif tg_table_name in ('tournament_matches', 'tournament_standings') then
    if tg_op <> 'INSERT' then
      select bracket.tournament_id
      into v_old_tournament_id
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where generated.id = old.generated_bracket_id;
    end if;
    if tg_op <> 'DELETE' then
      select bracket.tournament_id
      into v_new_tournament_id
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where generated.id = new.generated_bracket_id;
    end if;
  elsif tg_table_name in (
    'match_result_submissions',
    'match_result_report_groups'
  ) then
    if tg_op <> 'INSERT' then
      select bracket.tournament_id
      into v_old_tournament_id
      from public.tournament_matches as match
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where match.id = old.match_id;
    end if;
    if tg_op <> 'DELETE' then
      select bracket.tournament_id
      into v_new_tournament_id
      from public.tournament_matches as match
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where match.id = new.match_id;
    end if;
  end if;

  for v_tournament_id in
    select distinct candidate.tournament_id
    from unnest(array[v_old_tournament_id, v_new_tournament_id])
      as candidate(tournament_id)
    where candidate.tournament_id is not null
  loop
    if coalesce(
      pg_catalog.current_setting('ironclad.terminal_worker_skip', true),
      ''
    ) = 'on' and v_trusted_caller and exists (
      select 1
      from public.tournaments as tournament
      where tournament.id = v_tournament_id
        and tournament.status in ('cancelled', 'voided')
    ) then
      return null;
    end if;

    perform public.assert_tournament_not_terminal(v_tournament_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_terminal_competition_mutation()
  owner to postgres;
revoke all on function public.guard_terminal_competition_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists registrations_guard_terminal_competition
  on public.registrations;
create trigger registrations_guard_terminal_competition
before insert or update or delete on public.registrations
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists tournament_brackets_guard_terminal_competition
  on public.tournament_brackets;
create trigger tournament_brackets_guard_terminal_competition
before insert or update or delete on public.tournament_brackets
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists generated_brackets_guard_terminal_competition
  on public.generated_brackets;
create trigger generated_brackets_guard_terminal_competition
before insert or update or delete on public.generated_brackets
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists bracket_rounds_guard_terminal_competition
  on public.bracket_rounds;
create trigger bracket_rounds_guard_terminal_competition
before insert or update or delete on public.bracket_rounds
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists tournament_matches_guard_terminal_competition
  on public.tournament_matches;
create trigger tournament_matches_guard_terminal_competition
before insert or update or delete on public.tournament_matches
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists tournament_standings_guard_terminal_competition
  on public.tournament_standings;
create trigger tournament_standings_guard_terminal_competition
before insert or update or delete on public.tournament_standings
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists match_result_submissions_guard_terminal_competition
  on public.match_result_submissions;
create trigger match_result_submissions_guard_terminal_competition
before insert or update or delete on public.match_result_submissions
for each row execute function public.guard_terminal_competition_mutation();

drop trigger if exists match_result_report_groups_guard_terminal_competition
  on public.match_result_report_groups;
create trigger match_result_report_groups_guard_terminal_competition
before insert or update or delete on public.match_result_report_groups
for each row execute function public.guard_terminal_competition_mutation();

-- Keep the supported administrator scoring path on the existing PR 2 root
-- lock, then row-check every linked tournament before inserting. Cancel's
-- FOR UPDATE row lock therefore linearizes with this non-waiting key-share
-- check without introducing a root/tournament lock inversion into result
-- workflows.
alter function public.add_leaderboard_admin_adjustment(
  uuid, uuid, text, integer, text, uuid, uuid, uuid, text
) rename to add_leaderboard_admin_adjustment_without_terminal_guard;
revoke all on function
  public.add_leaderboard_admin_adjustment_without_terminal_guard(
    uuid, uuid, text, integer, text, uuid, uuid, uuid, text
  ) from public, anon, authenticated, service_role;

create function public.add_leaderboard_admin_adjustment(
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
  v_tournament_id uuid;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  for v_tournament_id in
    select distinct linked.tournament_id
    from (
      select p_tournament_id as tournament_id
      union all
      select bracket.tournament_id
      from public.tournament_brackets as bracket
      where bracket.id = p_tournament_bracket_id
      union all
      select registration.tournament_id
      from public.registrations as registration
      where registration.id = p_registration_id
    ) as linked
    where linked.tournament_id is not null
    order by linked.tournament_id
  loop
    perform public.assert_tournament_not_terminal_nowait(v_tournament_id);
  end loop;

  return public.add_leaderboard_admin_adjustment_without_terminal_guard(
    p_season_id,
    p_player_id,
    p_bracket_type,
    p_points,
    p_description,
    p_tournament_id,
    p_tournament_bracket_id,
    p_registration_id,
    p_triggered_by_clerk_user_id
  );
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

-- PR 3 remains the season engine. These replacements only teach its factual
-- membership model which historical assignments are no longer valid.
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
    where membership.tournament_id = v_context_tournament_id
      and membership.voided_at is null;

    if v_season_id is not null then
      return v_season_id;
    end if;

    raise exception 'Valid leaderboard tournament membership was not assigned'
      using errcode = '55000';
  end if;

  select season.id
  into v_season_id
  from public.leaderboard_seasons as season
  where season.finalized_at is null
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = season.id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
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

create or replace function public.assign_leaderboard_tournament_season(
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
  v_valid_event_count integer;
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
    if v_existing.voided_at is not null then
      raise exception 'A voided tournament membership cannot be reassigned'
        using errcode = '55000';
    end if;

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
    where season.finalized_at is null
      and (
        select count(*)
        from public.leaderboard_tournament_season_memberships as membership
        where membership.season_id = season.id
          and membership.qualifying_event_number is not null
          and membership.voided_at is null
      ) < 6
    order by season.created_at, season.id
    limit 1;

    if v_season_id is null then
      v_season_id := public.get_or_create_leaderboard_season(v_effective_date);
    end if;

    select slot.event_number::smallint
    into v_event_number
    from generate_series(1, 6) as slot(event_number)
    where not exists (
      select 1
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_season_id
        and membership.qualifying_event_number = slot.event_number
        and membership.voided_at is null
    )
    order by slot.event_number
    limit 1;

    if v_event_number is null then
      raise exception 'Main/Pro leaderboard season already contains six valid events';
    end if;
  else
    -- Career-only history remains in the latest factual container and never
    -- consumes or creates a Main/Pro event slot.
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

  select count(*)::integer
  into v_valid_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = v_season_id
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  update public.leaderboard_seasons
  set
    start_date = least(start_date, v_effective_date),
    end_date = greatest(end_date, v_effective_date),
    is_active = case
      when v_has_launched_main and v_valid_event_count = 6 then false
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

create or replace function public.finalize_leaderboard_main_season_if_ready(
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
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  if v_event_count <> 6 then
    return false;
  end if;

  if exists (
    select 1
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = p_season_id
      and membership.qualifying_event_number is not null
      and membership.voided_at is null
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

create or replace function public.award_leaderboard_late_entry_bonuses(
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
    bonus.id,
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

  drop table if exists pg_temp.leaderboard_desired_late_entry_bonuses;
  create temporary table leaderboard_desired_late_entry_bonuses
  on commit drop
  as
  with current_membership as (
    select
      membership.season_id,
      membership.tournament_id,
      tournament.first_completed_at
    from public.leaderboard_tournament_season_memberships as membership
    join public.tournaments as tournament
      on tournament.id = membership.tournament_id
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
    where membership.voided_at is null
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
          and prior_tournament.status = 'completed'
          and prior_tournament.first_completed_at is not null
        where prior_membership.voided_at is null
          and (
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
        and anchor_tournament.status = 'completed'
        and anchor_tournament.first_completed_at is not null
      where anchor_membership.voided_at is null
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
          and earlier_tournament.status = 'completed'
          and earlier_tournament.first_completed_at is not null
        where earlier_membership.voided_at is null
          and (
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
  select
    candidate.season_id,
    candidate.tournament_id,
    candidate.tournament_bracket_id,
    candidate.registration_id,
    candidate.player_id,
    candidate.bracket_type,
    least(candidate.missed_event_count, 5) * 5 as points
  from awardable as candidate;

  insert into pg_temp.leaderboard_late_entry_affected_seasons (season_id)
  select changed.season_id
  from (
    select existing.season_id
    from pg_temp.leaderboard_existing_late_entry_bonuses as existing
    where not exists (
      select 1
      from pg_temp.leaderboard_desired_late_entry_bonuses as desired
      where desired.season_id = existing.season_id
        and desired.tournament_id = existing.tournament_id
        and desired.tournament_bracket_id = existing.tournament_bracket_id
        and desired.registration_id = existing.registration_id
        and desired.player_id = existing.player_id
        and desired.bracket_type = existing.bracket_type
        and desired.points = existing.points
    )
    union
    select desired.season_id
    from pg_temp.leaderboard_desired_late_entry_bonuses as desired
    where not exists (
      select 1
      from pg_temp.leaderboard_existing_late_entry_bonuses as existing
      where existing.season_id = desired.season_id
        and existing.tournament_id = desired.tournament_id
        and existing.tournament_bracket_id = desired.tournament_bracket_id
        and existing.registration_id = desired.registration_id
        and existing.player_id = desired.player_id
        and existing.bracket_type = desired.bracket_type
        and existing.points = desired.points
    )
  ) as changed
  on conflict (season_id) do nothing;

  delete from public.leaderboard_point_events as bonus
  using pg_temp.leaderboard_existing_late_entry_bonuses as existing
  where bonus.id = existing.id
    and not exists (
      select 1
      from pg_temp.leaderboard_desired_late_entry_bonuses as desired
      where desired.season_id = existing.season_id
        and desired.tournament_id = existing.tournament_id
        and desired.tournament_bracket_id = existing.tournament_bracket_id
        and desired.registration_id = existing.registration_id
        and desired.player_id = existing.player_id
        and desired.bracket_type = existing.bracket_type
        and desired.points = existing.points
    );

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
    desired.season_id,
    desired.tournament_id,
    desired.tournament_bracket_id,
    desired.registration_id,
    desired.player_id,
    desired.bracket_type,
    desired.points,
    'missing_tournament_bonus',
    'One-time Career late-entry catch-up',
    'recalculation',
    nullif(pg_catalog.btrim(p_triggered_by_clerk_user_id), '')
  from pg_temp.leaderboard_desired_late_entry_bonuses as desired
  where not exists (
    select 1
    from public.leaderboard_point_events as current_bonus
    where current_bonus.event_type = 'missing_tournament_bonus'
      and current_bonus.source in ('system', 'recalculation')
      and current_bonus.season_id = desired.season_id
      and current_bonus.tournament_id = desired.tournament_id
      and current_bonus.tournament_bracket_id =
        desired.tournament_bracket_id
      and current_bonus.registration_id = desired.registration_id
      and current_bonus.player_id = desired.player_id
      and current_bonus.bracket_type = desired.bracket_type
      and current_bonus.points = desired.points
  )
  on conflict (player_id, bracket_type)
  where event_type = 'missing_tournament_bonus'
    and source in ('system', 'recalculation')
  do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

alter function public.award_leaderboard_late_entry_bonuses(uuid, text)
  owner to postgres;
revoke all on function
  public.award_leaderboard_late_entry_bonuses(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.is_tournament_bracket_regeneration_safe(
  p_tournament_bracket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select tournament.status not in ('cancelled', 'voided')
        and bracket.launched_at is null
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          where generated.tournament_bracket_id = bracket.id
            and (
              match.status <> 'scheduled'
              or match.player_one_score is not null
              or match.player_two_score is not null
              or match.winner_registration_id is not null
              or match.official_result_submission_id is not null
              or match.official_result_decided_by is not null
              or match.official_result_decided_at is not null
              or match.outcome_type is not null
            )
        )
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          join public.match_result_submissions as submission
            on submission.match_id = match.id
          where generated.tournament_bracket_id = bracket.id
        )
        and not exists (
          select 1
          from public.generated_brackets as generated
          join public.tournament_matches as match
            on match.generated_bracket_id = generated.id
          join public.match_result_report_groups as report_group
            on report_group.match_id = match.id
          where generated.tournament_bracket_id = bracket.id
        )
      from public.tournament_brackets as bracket
      join public.tournaments as tournament
        on tournament.id = bracket.tournament_id
      where bracket.id = p_tournament_bracket_id
    ),
    false
  );
$$;

alter function public.is_tournament_bracket_regeneration_safe(uuid)
  owner to postgres;
revoke all on function public.is_tournament_bracket_regeneration_safe(uuid)
  from public, anon, authenticated;
grant execute on function public.is_tournament_bracket_regeneration_safe(uuid)
  to service_role;

alter function public.reconcile_tournament_waitlist(uuid)
  rename to reconcile_tournament_waitlist_without_terminal_guard;
revoke all on function
  public.reconcile_tournament_waitlist_without_terminal_guard(uuid)
  from public, anon, authenticated, service_role;

create function public.reconcile_tournament_waitlist(
  p_tournament_bracket_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where bracket.id = p_tournament_bracket_id
      and tournament.status in ('cancelled', 'voided')
  ) then
    return 0;
  end if;

  return public.reconcile_tournament_waitlist_without_terminal_guard(
    p_tournament_bracket_id
  );
end;
$$;

alter function public.reconcile_tournament_waitlist(uuid)
  owner to postgres;
revoke all on function public.reconcile_tournament_waitlist(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.process_expired_waitlist_offers(
  p_batch_size integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registration record;
  v_processed integer := 0;
  v_batch_size integer;
begin
  v_batch_size := greatest(1, least(coalesce(p_batch_size, 100), 500));

  for v_registration in
    select
      registration.id,
      registration.tournament_bracket_id
    from public.registrations as registration
    join public.tournament_brackets as bracket
      on bracket.id = registration.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where registration.registration_status = 'waitlisted'
      and registration.waitlist_offer_status = 'offered'
      and registration.waitlist_offer_expires_at <= now()
      and bracket.launched_at is null
    order by
      registration.waitlist_offer_expires_at,
      registration.created_at,
      registration.id
    limit v_batch_size
    for update of bracket skip locked
  loop
    update public.registrations
    set
      waitlist_offer_status = 'expired',
      waitlist_offer_resolved_at = clock_timestamp()
    where id = v_registration.id
      and registration_status = 'waitlisted'
      and waitlist_offer_status = 'offered'
      and waitlist_offer_expires_at <= now();

    if found then
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

alter function public.process_expired_waitlist_offers(integer)
  owner to postgres;
revoke all on function public.process_expired_waitlist_offers(integer)
  from public, anon, authenticated;
grant execute on function public.process_expired_waitlist_offers(integer)
  to service_role;

create or replace function public.recompute_tournament_lifecycle_status(
  p_tournament_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_status text;
  v_bracket_count integer;
begin
  select tournament.status
  into v_current_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  if not found or v_current_status in ('cancelled', 'voided') then
    return;
  end if;

  select count(*)::integer
  into v_bracket_count
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id;

  if v_bracket_count = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is null
  ) then
    if v_current_status = 'completed' then
      perform pg_catalog.set_config(
        'ironclad.explicit_division_launch',
        'on',
        true
      );
      update public.tournaments
      set status = 'in_progress'
      where id = p_tournament_id;
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    left join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.tournament_id = p_tournament_id
      and (
        generated.id is null
        or public.is_generated_bracket_complete(generated.id)
          is distinct from true
      )
  ) then
    if v_current_status = 'completed' then
      perform pg_catalog.set_config(
        'ironclad.explicit_division_launch',
        'on',
        true
      );
      update public.tournaments
      set status = 'in_progress'
      where id = p_tournament_id;
    end if;
    return;
  end if;

  update public.tournaments
  set
    status = 'completed',
    registration_enabled = false
  where id = p_tournament_id
    and status <> 'completed';
end;
$$;

alter function public.recompute_tournament_lifecycle_status(uuid)
  owner to postgres;
revoke all on function public.recompute_tournament_lifecycle_status(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_tournament_lifecycle_status(uuid)
  to service_role;

create or replace function public.auto_approve_expired_match_result_groups(
  batch_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group_id uuid;
  v_approved_count integer := 0;
  v_batch_limit integer;
begin
  v_batch_limit := greatest(1, least(coalesce(batch_limit, 50), 500));

  for v_group_id in
    select report_group.id
    from public.match_result_report_groups as report_group
    join public.tournament_matches as match
      on match.id = report_group.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where report_group.status = 'pending_confirmation'
      and report_group.confirmation_deadline_at <= now()
      and report_group.finalized_at is null
      and match.status <> 'completed'
      and match.official_result_submission_id is null
    order by report_group.confirmation_deadline_at, report_group.created_at
    limit v_batch_limit
    for update of report_group skip locked
  loop
    begin
      perform public.finalize_match_result_report_group(
        v_group_id,
        'auto_approved',
        'cron_auto_approval',
        'system:cron',
        'Automatically approved after the opponent confirmation window expired.'
      );
      v_approved_count := v_approved_count + 1;
    exception when others then
      update public.match_result_report_groups
      set
        status = 'under_review',
        reviewed_by = 'system:cron',
        reviewed_at = now(),
        review_notes =
          'Automatic approval failed and requires administrator review: '
          || left(sqlerrm, 1000)
      where id = v_group_id
        and status = 'pending_confirmation'
        and finalized_at is null;
    end;
  end loop;

  return v_approved_count;
end;
$$;

alter function public.auto_approve_expired_match_result_groups(integer)
  owner to postgres;
revoke all on function public.auto_approve_expired_match_result_groups(integer)
  from public, anon, authenticated;
grant execute on function public.auto_approve_expired_match_result_groups(integer)
  to service_role;

alter function public.create_matchup_notifications(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) rename to create_matchup_notifications_without_terminal_guard;
revoke all on function public.create_matchup_notifications_without_terminal_guard(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) from public, anon, authenticated, service_role;

create function public.create_matchup_notifications(
  p_match_id uuid,
  p_event_key_suffix text,
  p_type text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_recipient_registration_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_status text;
begin
  select tournament.status
  into v_tournament_status
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where match.id = p_match_id
    for key share of tournament;

  if v_tournament_status in ('cancelled', 'voided') then
    return 0;
  end if;

  return public.create_matchup_notifications_without_terminal_guard(
    p_match_id,
    p_event_key_suffix,
    p_type,
    p_title,
    p_message,
    p_metadata,
    p_recipient_registration_ids
  );
end;
$$;

alter function public.create_matchup_notifications(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) owner to postgres;
revoke all on function public.create_matchup_notifications(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) from public, anon, authenticated, service_role;

alter function public.activate_tournament_match_if_ready(uuid, boolean)
  rename to activate_tournament_match_if_ready_without_terminal_guard;
revoke all on function
  public.activate_tournament_match_if_ready_without_terminal_guard(
    uuid,
    boolean
  ) from public, anon, authenticated, service_role;

create function public.activate_tournament_match_if_ready(
  p_match_id uuid,
  p_force_new_activation boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where match.id = p_match_id
      and tournament.status in ('cancelled', 'voided')
  ) then
    return false;
  end if;

  return public.activate_tournament_match_if_ready_without_terminal_guard(
    p_match_id,
    p_force_new_activation
  );
end;
$$;

alter function public.activate_tournament_match_if_ready(uuid, boolean)
  owner to postgres;
revoke all on function
  public.activate_tournament_match_if_ready(uuid, boolean)
  from public, anon, authenticated, service_role;

alter function public.process_matchup_deadlines(integer)
  rename to process_matchup_deadlines_without_terminal_guard;
revoke all on function
  public.process_matchup_deadlines_without_terminal_guard(integer)
  from public, anon, authenticated, service_role;

create function public.process_matchup_deadlines(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous_skip text;
  v_result jsonb;
begin
  v_previous_skip := pg_catalog.current_setting(
    'ironclad.terminal_worker_skip',
    true
  );
  perform pg_catalog.set_config(
    'ironclad.terminal_worker_skip',
    'on',
    true
  );

  begin
    v_result :=
      public.process_matchup_deadlines_without_terminal_guard(p_limit);
  exception when others then
    perform pg_catalog.set_config(
      'ironclad.terminal_worker_skip',
      coalesce(v_previous_skip, ''),
      true
    );
    raise;
  end;

  perform pg_catalog.set_config(
    'ironclad.terminal_worker_skip',
    coalesce(v_previous_skip, ''),
    true
  );
  return v_result;
end;
$$;

alter function public.process_matchup_deadlines(integer)
  owner to postgres;
revoke all on function public.process_matchup_deadlines(integer)
  from public, anon, authenticated;
grant execute on function public.process_matchup_deadlines(integer)
  to service_role;

alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  rename to
    recalculate_leaderboard_for_tournament_without_terminal_guard;
revoke all on function
  public.recalculate_leaderboard_for_tournament_without_terminal_guard(
    uuid,
    text
  ) from public, anon, authenticated, service_role;

create function public.recalculate_leaderboard_for_tournament(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  select tournament.status
  into v_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if v_status <> 'completed' then
    raise exception 'Only a completed non-terminal tournament can be recalculated'
      using errcode = '55000';
  end if;

  return
    public.recalculate_leaderboard_for_tournament_without_terminal_guard(
      p_tournament_id,
      p_triggered_by_clerk_user_id
    );
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

create function public.tournament_has_linked_admin_adjustment(
  p_tournament_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.leaderboard_point_events as event
    where event.source = 'admin'
      and (
        event.tournament_id = p_tournament_id
        or event.tournament_bracket_id in (
          select bracket.id
          from public.tournament_brackets as bracket
          where bracket.tournament_id = p_tournament_id
        )
        or event.registration_id in (
          select registration.id
          from public.registrations as registration
          where registration.tournament_id = p_tournament_id
        )
      )
  );
$$;

alter function public.tournament_has_linked_admin_adjustment(uuid)
  owner to postgres;
revoke all on function public.tournament_has_linked_admin_adjustment(uuid)
  from public, anon, authenticated, service_role;

create function public.cancel_tournament(
  p_tournament_id uuid,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_previous_transition text;
begin
  perform public.leaderboard_require_write_access();

  if p_tournament_id is null then
    raise exception 'Tournament is required';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'A non-empty cancellation reason of at most 2000 characters is required';
  end if;
  if v_actor is null then
    raise exception 'Cancelling administrator identity is required';
  end if;

  select tournament.*
  into v_tournament
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;
  if v_tournament.status = 'cancelled' then
    return pg_catalog.jsonb_build_object('outcome', 'already_cancelled');
  end if;
  if v_tournament.status = 'voided' then
    raise exception 'A voided tournament cannot be cancelled'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is not null
  ) then
    raise exception 'Only a launched tournament can be cancelled';
  end if;

  if exists (
    select 1
    from public.leaderboard_point_events as event
    where event.tournament_id = p_tournament_id
      or event.tournament_bracket_id in (
        select bracket.id
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or event.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_id = p_tournament_id
      )
  ) then
    raise exception 'Leaderboard point history requires the Void operation'
      using errcode = '55000';
  end if;

  if public.tournament_has_official_competition(p_tournament_id) then
    raise exception 'Official competitive history requires the Void operation'
      using errcode = '55000';
  end if;

  v_previous_transition := pg_catalog.current_setting(
    'ironclad.tournament_terminal_transition',
    true
  );
  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    'on',
    true
  );

  update public.tournaments
  set
    status = 'cancelled',
    registration_enabled = false,
    terminal_at = clock_timestamp(),
    terminal_reason = v_reason,
    terminated_by_clerk_user_id = v_actor
  where id = p_tournament_id;

  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    coalesce(v_previous_transition, ''),
    true
  );

  return pg_catalog.jsonb_build_object('outcome', 'cancelled');
end;
$$;

alter function public.cancel_tournament(uuid, text, text)
  owner to postgres;
revoke all on function public.cancel_tournament(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_tournament(uuid, text, text)
  to service_role;

create function public.void_tournament(
  p_tournament_id uuid,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_membership public.leaderboard_tournament_season_memberships%rowtype;
  v_season public.leaderboard_seasons%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_previous_transition text;
  v_affected_season record;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
begin
  perform public.leaderboard_require_write_access();

  if p_tournament_id is null then
    raise exception 'Tournament is required';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'A non-empty void reason of at most 2000 characters is required';
  end if;
  if v_actor is null then
    raise exception 'Voiding administrator identity is required';
  end if;

  -- Reuse the PR 2/3 global root before the narrower tournament lock.
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

  begin
    select tournament.*
    into v_tournament
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for update nowait;
  exception when lock_not_available then
    raise exception 'Tournament is being updated; retry the void operation'
      using errcode = '55P03';
  end;

  if not found then
    raise exception 'Tournament not found';
  end if;
  if v_tournament.status = 'voided' then
    return pg_catalog.jsonb_build_object('outcome', 'already_voided');
  end if;
  if v_tournament.status = 'cancelled' then
    raise exception 'A cancelled tournament cannot be voided'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is not null
  ) then
    raise exception 'Only a launched tournament can be voided';
  end if;

  select membership.*
  into v_membership
  from public.leaderboard_tournament_season_memberships as membership
  where membership.tournament_id = p_tournament_id
  for update;

  if found then
    select season.*
    into v_season
    from public.leaderboard_seasons as season
    where season.id = v_membership.season_id
    for update;
  end if;

  if v_membership.qualifying_event_number is not null
    and v_season.finalized_at is not null then
    if v_season.under_review_at is not null then
      return pg_catalog.jsonb_build_object(
        'outcome',
        'already_under_review'
      );
    end if;

    update public.leaderboard_seasons
    set
      under_review_at = clock_timestamp(),
      under_review_reason = v_reason,
      under_review_by_clerk_user_id = v_actor,
      under_review_tournament_id = p_tournament_id
    where id = v_membership.season_id;

    return pg_catalog.jsonb_build_object('outcome', 'under_review');
  end if;

  if public.tournament_has_linked_admin_adjustment(p_tournament_id) then
    raise exception 'Tournament-linked administrator adjustment must be adjudicated before Void'
      using errcode = '55000';
  end if;

  drop table if exists pg_temp.tournament_void_affected_seasons;
  create temporary table tournament_void_affected_seasons (
    season_id uuid primary key
  ) on commit drop;

  insert into pg_temp.tournament_void_affected_seasons (season_id)
  select distinct event.season_id
  from public.leaderboard_point_events as event
  where event.source in ('system', 'recalculation')
    and (
      event.tournament_id = p_tournament_id
      or event.tournament_bracket_id in (
        select bracket.id
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or event.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_id = p_tournament_id
      )
    )
  on conflict (season_id) do nothing;

  if v_membership.season_id is not null then
    insert into pg_temp.tournament_void_affected_seasons (season_id)
    values (v_membership.season_id)
    on conflict (season_id) do nothing;
  end if;

  v_previous_transition := pg_catalog.current_setting(
    'ironclad.tournament_terminal_transition',
    true
  );
  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    'on',
    true
  );

  update public.tournaments
  set
    status = 'voided',
    registration_enabled = false,
    terminal_at = clock_timestamp(),
    terminal_reason = v_reason,
    terminated_by_clerk_user_id = v_actor
  where id = p_tournament_id;

  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    coalesce(v_previous_transition, ''),
    true
  );

  update public.leaderboard_tournament_season_memberships
  set
    voided_at = clock_timestamp(),
    voided_by_clerk_user_id = v_actor,
    void_reason = v_reason
  where tournament_id = p_tournament_id
    and voided_at is null;

  delete from public.leaderboard_point_events as event
  where event.source in ('system', 'recalculation')
    and (
      event.tournament_id = p_tournament_id
      or event.tournament_bracket_id in (
        select bracket.id
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or event.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_id = p_tournament_id
      )
    );

  if v_membership.season_id is not null then
    perform public.award_leaderboard_late_entry_bonuses(
      p_tournament_id,
      v_actor
    );

    insert into pg_temp.tournament_void_affected_seasons (season_id)
    select affected.season_id
    from pg_temp.leaderboard_late_entry_affected_seasons as affected
    on conflict (season_id) do nothing;
  end if;

  for v_affected_season in
    select affected.season_id
    from pg_temp.tournament_void_affected_seasons as affected
    order by affected.season_id
  loop
    v_season_run_id := public.recalculate_leaderboard_for_season(
      v_affected_season.season_id,
      v_actor
    );

    select run.status, run.notes
    into v_season_run_status, v_season_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      raise exception 'Void leaderboard reconciliation failed: %',
        coalesce(
          nullif(v_season_run_notes, ''),
          v_season_run_status,
          'unknown'
        );
    end if;
  end loop;

  if v_membership.season_id is not null
    and v_season.finalized_at is null
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_membership.season_id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) < 6
    and not exists (
      select 1
      from public.leaderboard_seasons as other_season
      where other_season.is_active
        and other_season.id <> v_membership.season_id
    ) then
    update public.leaderboard_seasons
    set is_active = true
    where id = v_membership.season_id
      and finalized_at is null;
  end if;

  return pg_catalog.jsonb_build_object('outcome', 'voided');
end;
$$;

alter function public.void_tournament(uuid, text, text)
  owner to postgres;
revoke all on function public.void_tournament(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.void_tournament(uuid, text, text)
  to service_role;

comment on function public.cancel_tournament(uuid, text, text) is
  'Service-role terminal recovery for launched tournaments without official competitive history.';
comment on function public.void_tournament(uuid, text, text) is
  'Service-role terminal recovery that preserves factual history and reconciles derived scoring under the PR 2 root lock.';

commit;
