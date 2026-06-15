begin;

alter table public.generated_brackets
  add column if not exists competition_locked_at timestamptz;

update public.generated_brackets as generated
set competition_locked_at = coalesce(
  generated.competition_locked_at,
  generated.updated_at,
  generated.generated_at,
  now()
)
where generated.competition_locked_at is null
  and (
    exists (
      select 1
      from public.tournament_matches as match
      where match.generated_bracket_id = generated.id
        and (
          match.player_one_registration_id is not null
          or match.player_two_registration_id is not null
          or match.status <> 'scheduled'
          or match.player_one_score is not null
          or match.player_two_score is not null
          or match.winner_registration_id is not null
          or match.official_result_submission_id is not null
          or match.official_result_decided_by is not null
          or match.official_result_decided_at is not null
        )
    )
    or exists (
      select 1
      from public.match_result_submissions as submission
      join public.tournament_matches as match
        on match.id = submission.match_id
      where match.generated_bracket_id = generated.id
    )
    or exists (
      select 1
      from public.tournament_standings as standing
      where standing.generated_bracket_id = generated.id
    )
  );

create or replace function public.lock_generated_bracket_on_activity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.player_one_registration_id is not null
    or new.player_two_registration_id is not null
    or new.status <> 'scheduled'
    or new.player_one_score is not null
    or new.player_two_score is not null
    or new.winner_registration_id is not null
    or new.official_result_submission_id is not null
    or new.official_result_decided_by is not null
    or new.official_result_decided_at is not null then
    update public.generated_brackets
    set competition_locked_at = coalesce(competition_locked_at, now())
    where id = new.generated_bracket_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_matches_lock_generated_bracket
  on public.tournament_matches;
drop trigger if exists tournament_matches_lock_generated_bracket_insert
  on public.tournament_matches;
drop trigger if exists tournament_matches_lock_generated_bracket_update
  on public.tournament_matches;
create trigger tournament_matches_lock_generated_bracket_insert
after insert
on public.tournament_matches
for each row
execute function public.lock_generated_bracket_on_activity();

create trigger tournament_matches_lock_generated_bracket_update
after update of
  player_one_registration_id,
  player_two_registration_id,
  status,
  player_one_score,
  player_two_score,
  winner_registration_id,
  official_result_submission_id,
  official_result_decided_by,
  official_result_decided_at
on public.tournament_matches
for each row
execute function public.lock_generated_bracket_on_activity();

create or replace function public.is_tournament_bracket_regeneration_safe(
  p_tournament_bracket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select generated.competition_locked_at is null
        and not exists (
          select 1
          from public.tournament_matches as match
          where match.generated_bracket_id = generated.id
            and (
              match.player_one_registration_id is not null
              or match.player_two_registration_id is not null
              or match.status <> 'scheduled'
              or match.player_one_score is not null
              or match.player_two_score is not null
              or match.winner_registration_id is not null
              or match.official_result_submission_id is not null
              or match.official_result_decided_by is not null
              or match.official_result_decided_at is not null
            )
        )
        and not exists (
          select 1
          from public.match_result_submissions as submission
          join public.tournament_matches as match
            on match.id = submission.match_id
          where match.generated_bracket_id = generated.id
        )
        and not exists (
          select 1
          from public.tournament_standings as standing
          where standing.generated_bracket_id = generated.id
        )
      from public.generated_brackets as generated
      where generated.tournament_bracket_id = p_tournament_bracket_id
    ),
    true
  );
$$;

revoke all on function public.is_tournament_bracket_regeneration_safe(uuid)
  from public;
grant execute
  on function public.is_tournament_bracket_regeneration_safe(uuid)
  to service_role;

create or replace function public.generate_tournament_bracket(
  p_tournament_bracket_id uuid,
  p_generated_by text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved_count integer;
  v_format text;
  v_generated_bracket_id uuid;
  v_round_id uuid;
  v_round_count integer;
  v_round_number integer;
  v_match_count integer;
  v_match_number integer;
  v_round_name text;
  v_first_slot integer;
  v_second_slot integer;
begin
  if p_generated_by is null or btrim(p_generated_by) = '' then
    raise exception 'Generating administrator is required';
  end if;

  perform 1
  from public.tournament_brackets
  where id = p_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament bracket not found';
  end if;

  if not public.is_tournament_bracket_regeneration_safe(
    p_tournament_bracket_id
  ) then
    raise exception
      'Bracket regeneration blocked: assignments or competition data already exist. Existing matches, submissions, standings, and results were preserved. Use an explicit administrator reset workflow before regenerating.';
  end if;

  select count(*)::integer
  into v_approved_count
  from public.registrations
  where tournament_bracket_id = p_tournament_bracket_id
    and registration_status = 'approved';

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;

  if v_approved_count < 2 then
    return null;
  end if;

  v_format := case
    when (v_approved_count & (v_approved_count - 1)) = 0
      then 'single_elimination'
    else 'round_robin'
  end;

  insert into public.generated_brackets (
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by
  )
  values (
    p_tournament_bracket_id,
    v_format,
    v_approved_count,
    v_approved_count,
    p_generated_by
  )
  returning id into v_generated_bracket_id;

  if v_format = 'single_elimination' then
    v_round_count := log(2, v_approved_count)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_approved_count / power(2, v_round_number)::integer;
      v_round_name := case
        when v_match_count = 1 then 'Grand Final'
        when v_match_count = 2 then 'Semi Finals'
        when v_match_count = 4 then 'Quarter Finals'
        else 'Round of ' || (v_match_count * 2)::text
      end;

      insert into public.bracket_rounds (
        generated_bracket_id,
        round_number,
        name
      )
      values (
        v_generated_bracket_id,
        v_round_number,
        v_round_name
      )
      returning id into v_round_id;

      for v_match_number in 1..v_match_count loop
        v_first_slot := ((v_match_number - 1) * 2) + 1;
        v_second_slot := v_first_slot + 1;

        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          case when v_round_number = 1 then v_first_slot else null end,
          case when v_round_number = 1 then v_second_slot else null end,
          null,
          null
        );
      end loop;
    end loop;
  else
    insert into public.bracket_rounds (
      generated_bracket_id,
      round_number,
      name
    )
    values (v_generated_bracket_id, 1, 'Round Robin')
    returning id into v_round_id;

    v_match_number := 0;
    for v_first_slot in 1..(v_approved_count - 1) loop
      for v_second_slot in (v_first_slot + 1)..v_approved_count loop
        v_match_number := v_match_number + 1;
        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_slot,
          player_two_slot,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          v_first_slot,
          v_second_slot,
          null,
          null
        );
      end loop;
    end loop;
  end if;

  return v_generated_bracket_id;
end;
$$;

revoke all on function public.generate_tournament_bracket(uuid, text)
  from public;
grant execute on function public.generate_tournament_bracket(uuid, text)
  to service_role;

create or replace function public.refresh_generated_bracket_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
begin
  if current_setting('ironclad.tournament_deletion', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    if old.registration_status = 'approved' then
      v_old_bracket_id := old.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.registration_status = 'approved' then
      v_new_bracket_id := new.tournament_bracket_id;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.registration_status is not distinct from new.registration_status
      and old.tournament_bracket_id is not distinct from new.tournament_bracket_id then
      return new;
    end if;
  end if;

  if v_old_bracket_id is not null
    and public.is_tournament_bracket_regeneration_safe(v_old_bracket_id) then
    perform public.generate_tournament_bracket(
      v_old_bracket_id,
      'system:approval-change'
    );
  end if;

  if v_new_bracket_id is not null
    and v_new_bracket_id is distinct from v_old_bracket_id
    and public.is_tournament_bracket_regeneration_safe(v_new_bracket_id) then
    perform public.generate_tournament_bracket(
      v_new_bracket_id,
      'system:approval-change'
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_round_robin_standings(
  p_generated_bracket_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.generated_brackets
    where id = p_generated_bracket_id
      and format = 'round_robin'
  ) then
    return;
  end if;

  with statistics as (
    select
      standing.registration_id,
      count(match.id) filter (
        where match.status = 'completed'
          and match.winner_registration_id = standing.registration_id
      )::integer as wins,
      count(match.id) filter (
        where match.status = 'completed'
          and match.winner_registration_id is distinct from
            standing.registration_id
      )::integer as losses,
      coalesce(
        sum(
          case
            when match.status <> 'completed' then 0
            when match.player_one_registration_id =
              standing.registration_id
              then coalesce(match.player_one_score, 0) -
                coalesce(match.player_two_score, 0)
            else coalesce(match.player_two_score, 0) -
              coalesce(match.player_one_score, 0)
          end
        ),
        0
      )::integer as score_difference
    from public.tournament_standings as standing
    left join public.tournament_matches as match
      on match.generated_bracket_id = standing.generated_bracket_id
      and standing.registration_id in (
        match.player_one_registration_id,
        match.player_two_registration_id
      )
    where standing.generated_bracket_id = p_generated_bracket_id
    group by standing.registration_id
  ),
  ranked as (
    select
      registration_id,
      wins,
      losses,
      wins * 3 as points,
      row_number() over (
        order by
          wins * 3 desc,
          wins desc,
          score_difference desc,
          losses asc,
          registration_id
      )::integer as rank
    from statistics
  )
  update public.tournament_standings as standing
  set
    wins = ranked.wins,
    losses = ranked.losses,
    points = ranked.points,
    rank = ranked.rank
  from ranked
  where standing.generated_bracket_id = p_generated_bracket_id
    and standing.registration_id = ranked.registration_id;
end;
$$;

revoke all on function public.recalculate_round_robin_standings(uuid)
  from public;
grant execute on function public.recalculate_round_robin_standings(uuid)
  to service_role;

create or replace function public.refresh_round_robin_standings_on_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_round_robin_standings(
    new.generated_bracket_id
  );
  return new;
end;
$$;

drop trigger if exists tournament_matches_refresh_round_robin_standings
  on public.tournament_matches;
create trigger tournament_matches_refresh_round_robin_standings
after update of
  status,
  winner_registration_id,
  player_one_score,
  player_two_score
on public.tournament_matches
for each row
when (
  old.status is distinct from new.status
  or old.winner_registration_id is distinct from
    new.winner_registration_id
  or old.player_one_score is distinct from new.player_one_score
  or old.player_two_score is distinct from new.player_two_score
)
execute function public.refresh_round_robin_standings_on_match();

do $$
declare
  v_generated_bracket_id uuid;
begin
  for v_generated_bracket_id in
    select id
    from public.generated_brackets
    where format = 'round_robin'
  loop
    perform public.recalculate_round_robin_standings(
      v_generated_bracket_id
    );
  end loop;
end;
$$;

commit;
