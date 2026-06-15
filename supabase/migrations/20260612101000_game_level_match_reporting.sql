begin;

alter table public.tournament_matches
  add column if not exists series_best_of integer not null default 3;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_series_best_of_check;
alter table public.tournament_matches
  add constraint tournament_matches_series_best_of_check
  check (
    series_best_of >= 1
    and series_best_of <= 15
    and (series_best_of % 2) = 1
  );

update public.tournament_matches as match
set series_best_of = case
  when lower(round.name) in ('grand final', 'final') then 5
  else 3
end
from public.bracket_rounds as round
where round.id = match.round_id;

alter table public.match_result_submissions
  add column if not exists game_number integer;

update public.match_result_submissions
set game_number = 1
where game_number is null;

alter table public.match_result_submissions
  alter column game_number set not null;

alter table public.match_result_submissions
  drop constraint if exists match_result_submissions_game_number_check;
alter table public.match_result_submissions
  add constraint match_result_submissions_game_number_check
  check (game_number >= 1 and game_number <= 15);

drop index if exists
  public.match_result_submissions_one_pending_per_player;

create unique index
  match_result_submissions_one_pending_per_player_game
  on public.match_result_submissions(
    match_id,
    submitted_by_clerk_user_id,
    game_number
  )
  where status = 'pending';

create index if not exists
  match_result_submissions_match_game_idx
  on public.match_result_submissions(match_id, game_number, status);

create or replace function public.submit_match_game_result(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_game_number integer,
  p_winner_registration_id uuid,
  p_replay_storage_path text,
  p_screenshot_storage_path text,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_reporter_registration_id uuid;
  v_submission_number integer;
  v_expected_game_number integer;
  v_wins_required integer;
  v_reporter_player_one_wins integer;
  v_reporter_player_two_wins integer;
begin
  if p_submitted_by_clerk_user_id is null
    or btrim(p_submitted_by_clerk_user_id) = '' then
    raise exception 'Submitting player is required';
  end if;

  if p_replay_storage_path is null
    and p_screenshot_storage_path is null then
    raise exception 'At least one proof file is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found or v_match.status = 'completed' then
    raise exception 'This match is not accepting game reports';
  end if;

  if p_game_number < 1 or p_game_number > v_match.series_best_of then
    raise exception 'Game number is outside this series format';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  select registration.id
  into v_reporter_registration_id
  from public.registrations as registration
  where registration.id in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  )
    and registration.clerk_user_id = p_submitted_by_clerk_user_id;

  if v_reporter_registration_id is null then
    raise exception 'Player is not a participant in this match';
  end if;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Game winner must be a participant in this match';
  end if;

  select coalesce(max(report.game_number), 0) + 1
  into v_expected_game_number
  from public.match_result_submissions as report
  where report.match_id = p_match_id
    and report.submitted_by_registration_id =
      v_reporter_registration_id
    and report.status = 'pending';

  if p_game_number <> v_expected_game_number then
    raise exception 'Games must be reported in series order';
  end if;

  select
    count(*) filter (
      where report.claimed_winner_registration_id =
        v_match.player_one_registration_id
    )::integer,
    count(*) filter (
      where report.claimed_winner_registration_id =
        v_match.player_two_registration_id
    )::integer
  into v_reporter_player_one_wins, v_reporter_player_two_wins
  from public.match_result_submissions as report
  where report.match_id = p_match_id
    and report.submitted_by_registration_id =
      v_reporter_registration_id
    and report.status = 'pending';

  v_wins_required := (v_match.series_best_of / 2) + 1;
  if greatest(
    v_reporter_player_one_wins,
    v_reporter_player_two_wins
  ) >= v_wins_required then
    raise exception 'This player has already reported a complete series';
  end if;

  select coalesce(max(submission.submission_number), 0) + 1
  into v_submission_number
  from public.match_result_submissions as submission
  where submission.match_id = p_match_id;

  insert into public.match_result_submissions (
    submission_number,
    game_number,
    match_id,
    submitted_by_clerk_user_id,
    submitted_by_registration_id,
    claimed_winner_registration_id,
    player_one_score,
    player_two_score,
    replay_storage_path,
    screenshot_storage_path,
    notes,
    status
  )
  values (
    v_submission_number,
    p_game_number,
    p_match_id,
    p_submitted_by_clerk_user_id,
    v_reporter_registration_id,
    p_winner_registration_id,
    case when p_winner_registration_id =
      v_match.player_one_registration_id then 1 else 0 end,
    case when p_winner_registration_id =
      v_match.player_two_registration_id then 1 else 0 end,
    p_replay_storage_path,
    p_screenshot_storage_path,
    nullif(btrim(p_notes), ''),
    'pending'
  );

  update public.tournament_matches
  set status = 'pending_review'
  where id = p_match_id;

  return v_submission_number;
end;
$$;

revoke all on function public.submit_match_game_result(
  uuid,
  text,
  integer,
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.submit_match_game_result(
  uuid,
  text,
  integer,
  uuid,
  text,
  text,
  text
) to service_role;

create or replace function public.apply_official_match_result(
  p_match_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_winner_registration_id uuid,
  p_decided_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_number integer;
  v_format text;
  v_wins_required integer;
  v_loser_score integer;
  v_next_round_id uuid;
  v_next_match public.tournament_matches%rowtype;
  v_next_match_number integer;
  v_old_winner uuid;
begin
  if p_decided_by is null or btrim(p_decided_by) = '' then
    raise exception 'Deciding administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select round.round_number, generated.format
  into v_round_number, v_format
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.id = v_match.round_id;

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
    or p_player_two_score < 0
    or p_player_one_score = p_player_two_score then
    raise exception 'A valid non-tied score is required';
  end if;

  v_wins_required := (v_match.series_best_of / 2) + 1;

  if p_winner_registration_id = v_match.player_one_registration_id then
    if p_player_one_score <> v_wins_required
      or p_player_two_score >= v_wins_required then
      raise exception 'Score does not satisfy the match format';
    end if;
    v_loser_score := p_player_two_score;
  else
    if p_player_two_score <> v_wins_required
      or p_player_one_score >= v_wins_required then
      raise exception 'Score does not satisfy the match format';
    end if;
    v_loser_score := p_player_one_score;
  end if;

  if v_loser_score < 0 or v_loser_score >= v_wins_required then
    raise exception 'Score does not satisfy the match format';
  end if;

  v_old_winner := v_match.winner_registration_id;

  if v_format = 'single_elimination' then
    select id
    into v_next_round_id
    from public.bracket_rounds
    where generated_bracket_id = v_match.generated_bracket_id
      and round_number = v_round_number + 1;

    if v_next_round_id is not null then
      v_next_match_number := ceil(v_match.match_number / 2.0)::integer;

      select next_match.*
      into v_next_match
      from public.tournament_matches as next_match
      where next_match.round_id = v_next_round_id
        and next_match.match_number = v_next_match_number
      for update;

      if not found then
        raise exception 'Generated next-round match not found';
      end if;

      if v_next_match.status = 'completed'
        and v_old_winner is distinct from p_winner_registration_id then
        raise exception
          'A completed downstream match prevents changing this winner';
      end if;

      if (v_match.match_number % 2) = 1 then
        update public.tournament_matches
        set player_one_registration_id = p_winner_registration_id
        where id = v_next_match.id;
      else
        update public.tournament_matches
        set player_two_registration_id = p_winner_registration_id
        where id = v_next_match.id;
      end if;
    end if;
  end if;

  update public.tournament_matches
  set
    player_one_score = p_player_one_score,
    player_two_score = p_player_two_score,
    winner_registration_id = p_winner_registration_id,
    status = 'completed'
  where id = p_match_id;

  update public.match_result_submissions
  set
    status = 'rejected',
    reviewed_by = p_decided_by,
    review_notes = coalesce(
      review_notes,
      'Superseded by the official match result.'
    ),
    reviewed_at = now()
  where match_id = p_match_id
    and status = 'pending';

  if v_format = 'round_robin' then
    update public.tournament_standings as standing
    set
      wins = results.wins,
      losses = results.losses,
      points = results.wins * 3
    from (
      select
        roster.registration_id,
        count(*) filter (
          where match.winner_registration_id = roster.registration_id
        )::integer as wins,
        count(*) filter (
          where match.status = 'completed'
            and match.winner_registration_id is distinct from
              roster.registration_id
        )::integer as losses
      from public.tournament_standings as roster
      cross join lateral (
        select match.*
        from public.tournament_matches as match
        where match.generated_bracket_id = v_match.generated_bracket_id
          and match.status = 'completed'
          and roster.registration_id in (
            match.player_one_registration_id,
            match.player_two_registration_id
          )
      ) as match
      where roster.generated_bracket_id = v_match.generated_bracket_id
      group by roster.registration_id
    ) as results
    where standing.generated_bracket_id = v_match.generated_bracket_id
      and standing.registration_id = results.registration_id;
  end if;
end;
$$;

revoke all on function public.apply_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) from public;
grant execute on function public.apply_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) to service_role;

create or replace function public.review_match_series_result(
  p_submission_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.match_result_submissions%rowtype;
  v_match public.tournament_matches%rowtype;
  v_player_one_wins integer;
  v_player_two_wins integer;
  v_wins_required integer;
  v_series_winner uuid;
  v_pending_ids uuid[];
begin
  if p_reviewed_by is null or btrim(p_reviewed_by) = '' then
    raise exception 'Reviewing administrator is required';
  end if;

  if p_decision not in (
    'approved',
    'rejected',
    'resubmission_requested'
  ) then
    raise exception 'Invalid result review decision';
  end if;

  if p_decision in ('rejected', 'resubmission_requested')
    and nullif(btrim(p_review_notes), '') is null then
    raise exception
      'An administrator message is required for rejection or resubmission';
  end if;

  select submission.*
  into v_submission
  from public.match_result_submissions as submission
  where submission.id = p_submission_id
  for update;

  if not found or v_submission.status <> 'pending' then
    raise exception 'Pending game report not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_submission.match_id
  for update;

  select array_agg(submission.id)
  into v_pending_ids
  from public.match_result_submissions as submission
  where submission.match_id = v_submission.match_id
    and submission.status = 'pending';

  if p_decision <> 'approved' then
    update public.match_result_submissions
    set
      status = p_decision,
      reviewed_by = p_reviewed_by,
      review_notes = nullif(btrim(p_review_notes), ''),
      reviewed_at = now()
    where id = any(v_pending_ids);

    update public.tournament_matches
    set status = 'scheduled'
    where id = v_submission.match_id
      and status = 'pending_review';
    return;
  end if;

  if exists (
    select 1
    from public.match_result_submissions as report
    where report.match_id = v_submission.match_id
      and report.status = 'pending'
    group by report.game_number
    having count(distinct report.claimed_winner_registration_id) > 1
  ) then
    raise exception 'Conflicting player reports must be resolved before approval';
  end if;

  with resolved_games as (
    select
      report.game_number,
      min(report.claimed_winner_registration_id::text)::uuid as winner_id
    from public.match_result_submissions as report
    where report.match_id = v_submission.match_id
      and report.status = 'pending'
    group by report.game_number
  )
  select
    count(*) filter (
      where winner_id = v_match.player_one_registration_id
    )::integer,
    count(*) filter (
      where winner_id = v_match.player_two_registration_id
    )::integer
  into v_player_one_wins, v_player_two_wins
  from resolved_games;

  v_wins_required := (v_match.series_best_of / 2) + 1;

  if greatest(v_player_one_wins, v_player_two_wins) <> v_wins_required
    or least(v_player_one_wins, v_player_two_wins) >= v_wins_required then
    raise exception
      'The reported games do not yet form a complete series result';
  end if;

  v_series_winner := case
    when v_player_one_wins > v_player_two_wins
      then v_match.player_one_registration_id
    else v_match.player_two_registration_id
  end;

  perform public.apply_official_match_result(
    v_match.id,
    v_player_one_wins,
    v_player_two_wins,
    v_series_winner,
    p_reviewed_by
  );

  update public.match_result_submissions
  set
    status = 'approved',
    reviewed_by = p_reviewed_by,
    review_notes = nullif(btrim(p_review_notes), ''),
    reviewed_at = now()
  where id = any(v_pending_ids);

  update public.tournament_matches
  set
    official_result_submission_id = p_submission_id,
    official_result_decided_by = p_reviewed_by,
    official_result_decided_at = now()
  where id = v_match.id;
end;
$$;

revoke all on function public.review_match_series_result(
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.review_match_series_result(
  uuid,
  text,
  text,
  text
) to service_role;

commit;
