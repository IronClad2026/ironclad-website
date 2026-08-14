begin;

-- Preserve the established disposable-tournament deletion contract while
-- removing public from the SECURITY DEFINER function's resolution path.
create or replace function public.delete_tournament_data(
  p_tournament_id uuid,
  p_deleted_by text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_title text;
  v_banner_image_url text;
  v_banner_path text;
  v_banner_paths text[] := array[]::text[];
  v_counts jsonb;
  v_proof_paths text[];
  v_job_id uuid;
  v_banner_marker constant text :=
    '/storage/v1/object/public/tournament-banners/';
begin
  if p_deleted_by is null or pg_catalog.btrim(p_deleted_by) = '' then
    raise exception 'Deleting administrator is required';
  end if;

  select title, banner_image_url
  into v_tournament_title, v_banner_image_url
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  perform 1
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id
  order by bracket.id
  for update;

  perform 1
  from public.registrations as registration
  where registration.tournament_id = p_tournament_id
    or registration.tournament_bracket_id in (
      select bracket.id
      from public.tournament_brackets as bracket
      where bracket.tournament_id = p_tournament_id
    )
  order by registration.id
  for update;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is not null
  )
    or exists (
      select 1
      from public.generated_brackets as generated
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where bracket.tournament_id = p_tournament_id
    )
    or exists (
      select 1
      from public.tournament_matches as match
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where bracket.tournament_id = p_tournament_id
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
    or exists (
      select 1
      from public.match_result_submissions as submission
      join public.tournament_matches as match
        on match.id = submission.match_id
      join public.generated_brackets as generated
        on generated.id = match.generated_bracket_id
      join public.tournament_brackets as bracket
        on bracket.id = generated.tournament_bracket_id
      where bracket.tournament_id = p_tournament_id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      where report_group.tournament_id = p_tournament_id
        or report_group.match_id in (
          select match.id
          from public.tournament_matches as match
          join public.generated_brackets as generated
            on generated.id = match.generated_bracket_id
          join public.tournament_brackets as bracket
            on bracket.id = generated.tournament_bracket_id
          where bracket.tournament_id = p_tournament_id
        )
    )
    or exists (
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
            or registration.tournament_bracket_id in (
              select bracket.id
              from public.tournament_brackets as bracket
              where bracket.tournament_id = p_tournament_id
            )
        )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Tournament has launched or contains competitive history and cannot be permanently deleted.';
  end if;

  if position(v_banner_marker in coalesce(v_banner_image_url, '')) > 0 then
    v_banner_path := pg_catalog.split_part(
      pg_catalog.split_part(v_banner_image_url, v_banner_marker, 2),
      '?',
      1
    );
    if v_banner_path <> '' then
      v_banner_paths := array[v_banner_path];
    end if;
  end if;

  v_counts := public.get_tournament_deletion_preview(p_tournament_id);

  select coalesce(
    pg_catalog.array_agg(distinct proof.path),
    array[]::text[]
  )
  into v_proof_paths
  from (
    select submission.replay_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.replay_storage_path is not null
    union all
    select submission.screenshot_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.screenshot_storage_path is not null
    union all
    select report_group.replay_storage_path as path
    from public.match_result_report_groups as report_group
    where report_group.tournament_id = p_tournament_id
      and report_group.replay_storage_path is not null
  ) as proof;

  insert into public.tournament_deletion_jobs (
    tournament_id,
    tournament_title,
    requested_by,
    proof_paths,
    banner_paths,
    deleted_counts
  )
  values (
    p_tournament_id,
    v_tournament_title,
    p_deleted_by,
    v_proof_paths,
    v_banner_paths,
    v_counts
  )
  returning id into v_job_id;

  perform pg_catalog.set_config(
    'ironclad.tournament_deletion',
    'on',
    true
  );

  delete from public.match_result_submissions
  where match_id in (
    select match.id
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
  );

  delete from public.generated_brackets
  where tournament_bracket_id in (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  );

  delete from public.registrations
  where tournament_id = p_tournament_id
    or tournament_bracket_id in (
      select id
      from public.tournament_brackets
      where tournament_id = p_tournament_id
    );

  delete from public.tournament_brackets
  where tournament_id = p_tournament_id;

  delete from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament deletion did not remove the tournament';
  end if;

  return pg_catalog.jsonb_build_object(
    'job_id', v_job_id,
    'tournament_title', v_tournament_title,
    'proof_paths', pg_catalog.to_jsonb(v_proof_paths),
    'banner_paths', pg_catalog.to_jsonb(v_banner_paths),
    'deleted_counts', v_counts
  );
end;
$$;

alter function public.delete_tournament_data(uuid, text) owner to postgres;
revoke all on function public.delete_tournament_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_tournament_data(uuid, text)
  to service_role;

-- Academy is a permanent Career division like Challenge. Extend only the
-- already-private adjustment core; the public terminal guard remains intact.
create or replace function
  public.add_leaderboard_admin_adjustment_without_terminal_guard(
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

  if p_bracket_type not in ('academy', 'challenge', 'main', 'overall') then
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

alter function
  public.add_leaderboard_admin_adjustment_without_terminal_guard(
    uuid, uuid, text, integer, text, uuid, uuid, uuid, text
  ) owner to postgres;
revoke all on function
  public.add_leaderboard_admin_adjustment_without_terminal_guard(
    uuid, uuid, text, integer, text, uuid, uuid, uuid, text
  ) from public, anon, authenticated, service_role;

commit;
