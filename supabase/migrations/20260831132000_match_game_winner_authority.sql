begin;

alter table public.match_replay_upload_attempts
  add column game_winner_registration_ids uuid[] not null
    default array[]::uuid[];

alter table public.match_replay_upload_attempts
  add constraint match_replay_upload_attempts_game_winner_count_check
  check (
    cardinality(game_winner_registration_ids) = 0
    or cardinality(game_winner_registration_ids) = required_replay_count
  );

comment on column public.match_replay_upload_attempts.game_winner_registration_ids is
  'Ordered winner registration for each uploaded game. Empty arrays preserve compatibility with upload attempts prepared before per-game winner capture was deployed.';

create function ironclad_private.validate_match_game_winner_sequence(
  p_match_id uuid,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_game_winner_registration_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_required_game_count integer;
  v_wins_required integer;
  v_player_one_wins integer := 0;
  v_player_two_wins integer := 0;
  v_index integer;
  v_game_winner uuid;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score < 0
    or p_player_two_score < 0 then
    raise exception 'Enter a valid final score';
  end if;

  v_required_game_count := p_player_one_score + p_player_two_score;
  v_wins_required := (v_match.series_best_of / 2) + 1;

  if p_game_winner_registration_ids is null
    or cardinality(p_game_winner_registration_ids) <> v_required_game_count
    or array_position(p_game_winner_registration_ids, null) is not null then
    raise exception 'Select one winner for every played game';
  end if;

  for v_index in 1..v_required_game_count loop
    v_game_winner := p_game_winner_registration_ids[v_index];

    if v_game_winner = v_match.player_one_registration_id then
      v_player_one_wins := v_player_one_wins + 1;
    elsif v_game_winner = v_match.player_two_registration_id then
      v_player_two_wins := v_player_two_wins + 1;
    else
      raise exception 'Every game winner must be a match participant';
    end if;

    if v_index < v_required_game_count
      and (
        v_player_one_wins >= v_wins_required
        or v_player_two_wins >= v_wins_required
      ) then
      raise exception 'A played game cannot follow the series-clinching game';
    end if;
  end loop;

  if v_player_one_wins <> p_player_one_score
    or v_player_two_wins <> p_player_two_score then
    raise exception 'Game winners do not match the final score';
  end if;

  if (
    p_winner_registration_id = v_match.player_one_registration_id
    and v_player_one_wins <> v_wins_required
  ) or (
    p_winner_registration_id = v_match.player_two_registration_id
    and v_player_two_wins <> v_wins_required
  ) then
    raise exception 'Game winners do not match the series winner';
  end if;

  return p_game_winner_registration_ids;
end;
$$;

alter function ironclad_private.validate_match_game_winner_sequence(
  uuid, uuid, integer, integer, uuid[]
) owner to postgres;

revoke all on function ironclad_private.validate_match_game_winner_sequence(
  uuid, uuid, integer, integer, uuid[]
) from public, anon, authenticated, service_role;

create function ironclad_private.clear_stale_match_game_winner_sequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.winner_registration_id is distinct from old.winner_registration_id
    or new.player_one_score is distinct from old.player_one_score
    or new.player_two_score is distinct from old.player_two_score
    or new.required_replay_count is distinct from old.required_replay_count
    or new.declared_replay_sizes is distinct from old.declared_replay_sizes then
    new.game_winner_registration_ids := array[]::uuid[];
  end if;

  return new;
end;
$$;

alter function ironclad_private.clear_stale_match_game_winner_sequence()
  owner to postgres;

revoke all on function
  ironclad_private.clear_stale_match_game_winner_sequence()
  from public, anon, authenticated, service_role;

create trigger match_replay_upload_attempts_clear_stale_game_winners
before update of
  winner_registration_id,
  player_one_score,
  player_two_score,
  required_replay_count,
  declared_replay_sizes
on public.match_replay_upload_attempts
for each row execute function
  ironclad_private.clear_stale_match_game_winner_sequence();

alter function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) rename to prepare_match_replay_upload_attempt_pre_game_winner_capture;

revoke all on function
  public.prepare_match_replay_upload_attempt_pre_game_winner_capture(
    uuid, text, uuid, integer, integer, integer[]
  )
  from public, anon, authenticated, service_role;

create function public.prepare_match_replay_upload_attempt(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_declared_replay_sizes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_attempt_id uuid;
begin
  v_result :=
    public.prepare_match_replay_upload_attempt_pre_game_winner_capture(
      p_match_id,
      p_submitted_by_clerk_user_id,
      p_winner_registration_id,
      p_player_one_score,
      p_player_two_score,
      p_declared_replay_sizes
    );

  if v_result->>'outcome' in ('prepared', 'recycle_required') then
    v_attempt_id := (v_result->>'attempt_id')::uuid;

    update public.match_replay_upload_attempts as attempt
    set
      game_winner_registration_ids = array[]::uuid[],
      updated_at = clock_timestamp()
    where attempt.id = v_attempt_id
      and attempt.match_id = p_match_id;

    if not found then
      raise exception 'Replay attempt no longer matches this match';
    end if;
  end if;

  return v_result;
end;
$$;

alter function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) owner to postgres;

revoke all on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[]
) to service_role;

create function public.prepare_match_replay_upload_attempt(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_declared_replay_sizes integer[],
  p_game_winner_registration_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_outcome text;
  v_attempt_id uuid;
begin
  perform ironclad_private.validate_match_game_winner_sequence(
    p_match_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_game_winner_registration_ids
  );

  v_result := public.prepare_match_replay_upload_attempt(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_declared_replay_sizes
  );

  v_outcome := v_result->>'outcome';

  if v_outcome in ('prepared', 'recycle_required') then
    v_attempt_id := (v_result->>'attempt_id')::uuid;

    update public.match_replay_upload_attempts as attempt
    set
      game_winner_registration_ids = p_game_winner_registration_ids,
      updated_at = clock_timestamp()
    where attempt.id = v_attempt_id
      and attempt.match_id = p_match_id;

    if not found then
      raise exception 'Replay attempt no longer matches this match';
    end if;
  end if;

  return v_result;
end;
$$;

alter function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[], uuid[]
) owner to postgres;

revoke all on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[], uuid[]
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_match_replay_upload_attempt(
  uuid, text, uuid, integer, integer, integer[], uuid[]
) to service_role;

create function public.submit_match_series_result_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_paths text[],
  p_replay_content_hashes text[],
  p_game_winner_registration_ids uuid[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_updated_count integer;
begin
  perform ironclad_private.validate_match_game_winner_sequence(
    p_match_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_game_winner_registration_ids
  );

  v_result := public.submit_match_series_result_report(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_replay_storage_paths,
    p_replay_content_hashes,
    p_notes
  );

  with linked_submission as (
    select
      submission_id::uuid as id,
      ordinal
    from jsonb_array_elements_text(v_result->'submission_ids')
      with ordinality as submission(submission_id, ordinal)
  ),
  game_winner as (
    select winner_registration_id, ordinal
    from unnest(p_game_winner_registration_ids)
      with ordinality as winner(winner_registration_id, ordinal)
  )
  update public.match_result_submissions as submission
  set claimed_winner_registration_id = game_winner.winner_registration_id
  from linked_submission
  join game_winner using (ordinal)
  where submission.id = linked_submission.id
    and submission.match_id = p_match_id
    and submission.report_group_id = (v_result->>'report_group_id')::uuid;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> cardinality(p_game_winner_registration_ids) then
    raise exception 'Per-game winner authority could not be linked completely';
  end if;

  return v_result || jsonb_build_object(
    'game_winner_count', v_updated_count
  );
end;
$$;

alter function public.submit_match_series_result_report(
  uuid, text, uuid, integer, integer, text[], text[], uuid[], text
) owner to postgres;

revoke all on function public.submit_match_series_result_report(
  uuid, text, uuid, integer, integer, text[], text[], uuid[], text
) from public, anon, authenticated, service_role;

create or replace function public.commit_match_replay_attempt_result(
  p_attempt_id uuid,
  p_finalization_claim_id uuid,
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_replay_content_hashes text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt public.match_replay_upload_attempts%rowtype;
  v_tournament_id uuid;
  v_result jsonb;
  v_paths text[];
  v_now timestamptz := clock_timestamp();
begin
  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where match.id = p_match_id
  for update of match;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select attempt.*
  into v_attempt
  from public.match_replay_upload_attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.match_id = p_match_id
  for update;

  if not found then
    raise exception 'Replay attempt not found';
  end if;

  if not exists (
    select 1
    from public.registrations as registration
    where registration.id = v_attempt.submitting_registration_id
      and registration.clerk_user_id = p_submitted_by_clerk_user_id
  ) then
    raise exception 'Player does not own this replay attempt';
  end if;

  if v_attempt.status = 'committed' then
    return v_attempt.committed_result;
  end if;

  if v_attempt.status <> 'finalizing'
    or v_attempt.finalization_claim_id <> p_finalization_claim_id
    or v_attempt.finalization_lease_expires_at <= v_now then
    raise exception 'Replay finalization claim no longer owns this attempt';
  end if;

  perform public.assert_tournament_not_terminal(v_tournament_id);

  if cardinality(p_replay_content_hashes) <> v_attempt.required_replay_count then
    raise exception 'Replay hash count does not match this attempt';
  end if;

  v_paths := v_attempt.replay_storage_paths[1:v_attempt.required_replay_count];

  if cardinality(v_attempt.game_winner_registration_ids) = 0 then
    if least(v_attempt.player_one_score, v_attempt.player_two_score) > 0 then
      raise exception
        'Replay attempt predates per-game winner capture; resubmit this non-shutout result'
        using errcode = '55000';
    end if;

    -- A pre-deployment shutout is unambiguous: every game has one winner.
    v_result := public.submit_match_series_result_report(
      p_match_id,
      p_submitted_by_clerk_user_id,
      v_attempt.winner_registration_id,
      v_attempt.player_one_score,
      v_attempt.player_two_score,
      v_paths,
      p_replay_content_hashes,
      p_notes
    );
  else
    v_result := public.submit_match_series_result_report(
      p_match_id,
      p_submitted_by_clerk_user_id,
      v_attempt.winner_registration_id,
      v_attempt.player_one_score,
      v_attempt.player_two_score,
      v_paths,
      p_replay_content_hashes,
      v_attempt.game_winner_registration_ids,
      p_notes
    );
  end if;

  update public.match_replay_upload_attempts as attempt
  set
    status = 'committed',
    finalization_claim_id = null,
    finalization_lease_expires_at = null,
    committed_report_group_id = (v_result->>'report_group_id')::uuid,
    committed_result = v_result,
    committed_at = v_now,
    updated_at = v_now
  where attempt.id = v_attempt.id;

  return v_result;
end;
$$;

alter function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) owner to postgres;

revoke all on function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) from public, anon, authenticated;

grant execute on function public.commit_match_replay_attempt_result(
  uuid, uuid, uuid, text, text[], text
) to service_role;

create or replace function public.get_player_badge_flawless_campaign_summary(
  p_player_id uuid
)
returns table (
  tournament_id uuid,
  registration_id uuid,
  first_completed_at timestamptz,
  expected_path_segment_count integer,
  played_segment_count integer,
  automatic_bye_count integer,
  opponent_no_show_count integer,
  verified_game_count integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with latest_paths as (
    select distinct on (
      path.tournament_id,
      path.registration_id,
      path.path_index
    )
      path.tournament_id,
      path.registration_id,
      path.path_index,
      path.source_match_id,
      path.outcome_kind,
      path.authority_state,
      path.revision,
      path.id
    from public.tournament_championship_path_authority as path
    order by
      path.tournament_id,
      path.registration_id,
      path.path_index,
      path.revision desc,
      path.id desc
  )
  select summary.*
  from public.get_player_badge_flawless_campaign_summary_pre_played_requirement(
    p_player_id
  ) as summary
  where summary.played_segment_count > 0
    and not exists (
      select 1
      from latest_paths as path
      left join public.tournament_matches as source_match
        on source_match.id = path.source_match_id
      where path.tournament_id = summary.tournament_id
        and path.registration_id = summary.registration_id
        and path.authority_state = 'active'
        and path.outcome_kind = 'played'
        and (
          source_match.id is null
          or source_match.status <> 'completed'
          or source_match.player_one_registration_id is null
          or source_match.player_two_registration_id is null
          or source_match.player_one_registration_id =
            source_match.player_two_registration_id
          or not exists (
            select 1
            from public.registrations as player_one_registration
            join public.registrations as player_two_registration
              on player_two_registration.id =
                source_match.player_two_registration_id
            where player_one_registration.id =
                source_match.player_one_registration_id
              and player_one_registration.tournament_id =
                summary.tournament_id
              and player_two_registration.tournament_id =
                summary.tournament_id
          )
          or source_match.winner_registration_id is distinct from
            summary.registration_id
          or source_match.player_one_score is null
          or source_match.player_two_score is null
          or case
            when summary.registration_id =
              source_match.player_one_registration_id
              then source_match.player_two_score <> 0
            when summary.registration_id =
              source_match.player_two_registration_id
              then source_match.player_one_score <> 0
            else true
          end
        )
    );
$$;

alter function public.get_player_badge_flawless_campaign_summary(uuid)
  owner to postgres;

revoke all on function public.get_player_badge_flawless_campaign_summary(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_flawless_campaign_summary(uuid)
  to service_role;

comment on function public.get_player_badge_flawless_campaign_summary(uuid) is
  'Service-role-only Badge 20 evidence requiring an authoritative champion, at least one genuinely played series, complete per-game authority, and matching aggregate zero-loss scores.';

commit;
