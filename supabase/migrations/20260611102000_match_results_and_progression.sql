begin;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_status_check;

alter table public.tournament_matches
  add constraint tournament_matches_status_check
  check (
    status in (
      'scheduled',
      'in_progress',
      'pending_review',
      'completed'
    )
  );

create table if not exists public.match_result_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.tournament_matches(id) on delete cascade,
  submitted_by_clerk_user_id text not null,
  claimed_winner_registration_id uuid not null
    references public.registrations(id) on delete restrict,
  player_one_score integer not null check (player_one_score >= 0),
  player_two_score integer not null check (player_two_score >= 0),
  replay_storage_path text,
  screenshot_storage_path text,
  notes text,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'rejected',
        'resubmission_requested'
      )
    ),
  reviewed_by text,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    replay_storage_path is not null
    or screenshot_storage_path is not null
  )
);

create index if not exists match_result_submissions_match_idx
  on public.match_result_submissions(match_id, created_at desc);

create index if not exists match_result_submissions_status_idx
  on public.match_result_submissions(status, created_at);

create unique index if not exists match_result_submissions_one_pending_per_player
  on public.match_result_submissions(match_id, submitted_by_clerk_user_id)
  where status = 'pending';

drop trigger if exists match_result_submissions_set_updated_at
  on public.match_result_submissions;
create trigger match_result_submissions_set_updated_at
before update on public.match_result_submissions
for each row execute function public.ironclad_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit)
values ('match-proofs', 'match-proofs', false, 2097152)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

alter table public.match_result_submissions enable row level security;

drop policy if exists "Players can read their own match submissions"
  on public.match_result_submissions;
create policy "Players can read their own match submissions"
on public.match_result_submissions
for select
to authenticated
using (
  submitted_by_clerk_user_id =
    coalesce(
      auth.jwt()->>'sub',
      auth.jwt()->>'user_id'
    )
);

grant select on public.match_result_submissions to authenticated;

create or replace function public.submit_match_result_claim(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_replay_storage_path text,
  p_screenshot_storage_path text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_name text;
  v_wins_required integer;
  v_submission_id uuid;
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
    raise exception 'This match is not accepting result submissions';
  end if;

  select round.name
  into v_round_name
  from public.bracket_rounds as round
  where round.id = v_match.round_id;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  if not exists (
    select 1
    from public.registrations as registration
    where registration.id in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
      and registration.clerk_user_id = p_submitted_by_clerk_user_id
  ) then
    raise exception 'Player is not a participant in this match';
  end if;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  v_wins_required := case
    when lower(v_round_name) in ('grand final', 'final') then 3
    else 2
  end;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score = p_player_two_score
    or p_player_one_score < 0
    or p_player_two_score < 0
    or greatest(p_player_one_score, p_player_two_score) <> v_wins_required
    or least(p_player_one_score, p_player_two_score) >= v_wins_required
    or (
      p_winner_registration_id = v_match.player_one_registration_id
      and p_player_one_score <= p_player_two_score
    )
    or (
      p_winner_registration_id = v_match.player_two_registration_id
      and p_player_two_score <= p_player_one_score
    ) then
    raise exception 'Score does not satisfy the match format';
  end if;

  insert into public.match_result_submissions (
    match_id,
    submitted_by_clerk_user_id,
    claimed_winner_registration_id,
    player_one_score,
    player_two_score,
    replay_storage_path,
    screenshot_storage_path,
    notes
  )
  values (
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_replay_storage_path,
    p_screenshot_storage_path,
    nullif(btrim(p_notes), '')
  )
  returning id into v_submission_id;

  update public.tournament_matches
  set status = 'pending_review'
  where id = p_match_id;

  return v_submission_id;
end;
$$;

revoke all on function public.submit_match_result_claim(
  uuid,
  text,
  uuid,
  integer,
  integer,
  text,
  text,
  text
) from public;
grant execute on function public.submit_match_result_claim(
  uuid,
  text,
  uuid,
  integer,
  integer,
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
  v_round_name text;
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

  select round.round_number, round.name, generated.format
  into v_round_number, v_round_name, v_format
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

  v_wins_required := case
    when lower(v_round_name) in ('grand final', 'final') then 3
    else 2
  end;

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

create or replace function public.review_match_result_submission(
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

  select submission.*
  into v_submission
  from public.match_result_submissions as submission
  where submission.id = p_submission_id
  for update;

  if not found or v_submission.status <> 'pending' then
    raise exception 'Pending result submission not found';
  end if;

  if p_decision = 'approved' then
    perform public.apply_official_match_result(
      v_submission.match_id,
      v_submission.player_one_score,
      v_submission.player_two_score,
      v_submission.claimed_winner_registration_id,
      p_reviewed_by
    );
  else
    update public.tournament_matches
    set status = 'scheduled'
    where id = v_submission.match_id
      and status = 'pending_review';
  end if;

  update public.match_result_submissions
  set
    status = p_decision,
    reviewed_by = p_reviewed_by,
    review_notes = nullif(btrim(p_review_notes), ''),
    reviewed_at = now()
  where id = p_submission_id;
end;
$$;

revoke all on function public.review_match_result_submission(
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.review_match_result_submission(
  uuid,
  text,
  text,
  text
) to service_role;

commit;
