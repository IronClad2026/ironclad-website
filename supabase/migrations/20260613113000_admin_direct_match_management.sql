begin;

create or replace function public.admin_update_match_participants(
  p_match_id uuid,
  p_player_one_registration_id uuid,
  p_player_two_registration_id uuid,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
  v_tournament_bracket_id uuid;
begin
  if p_updated_by is null or btrim(p_updated_by) = '' then
    raise exception 'Updating administrator is required';
  end if;

  if p_player_one_registration_id is not null
    and p_player_one_registration_id = p_player_two_registration_id then
    raise exception 'A player cannot occupy both match slots';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select generated.format, generated.tournament_bracket_id
  into v_format, v_tournament_bracket_id
  from public.generated_brackets as generated
  where generated.id = v_match.generated_bracket_id;

  if v_format = 'round_robin' then
    raise exception
      'Round-robin participant edits require the bracket population or reset workflow';
  end if;

  if v_match.status <> 'scheduled'
    or v_match.player_one_score is not null
    or v_match.player_two_score is not null
    or v_match.winner_registration_id is not null
    or v_match.official_result_submission_id is not null
    or v_match.official_result_decided_by is not null
    or v_match.official_result_decided_at is not null then
    raise exception
      'Participant edits are blocked after a match has started, been scored, or received an official result';
  end if;

  if exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
  )
  or exists (
    select 1
    from public.match_result_report_groups as report_group
    where report_group.match_id = p_match_id
  ) then
    raise exception
      'Participant edits are blocked because this match has result activity or proof records';
  end if;

  if p_player_one_registration_id is not null
    and not exists (
      select 1
      from public.registrations as registration
      where registration.id = p_player_one_registration_id
        and registration.tournament_bracket_id = v_tournament_bracket_id
        and registration.registration_status = 'approved'
    ) then
    raise exception
      'Player 1 must be an approved registration in this bracket';
  end if;

  if p_player_two_registration_id is not null
    and not exists (
      select 1
      from public.registrations as registration
      where registration.id = p_player_two_registration_id
        and registration.tournament_bracket_id = v_tournament_bracket_id
        and registration.registration_status = 'approved'
    ) then
    raise exception
      'Player 2 must be an approved registration in this bracket';
  end if;

  if exists (
    select 1
    from public.tournament_matches as other_match
    where other_match.generated_bracket_id = v_match.generated_bracket_id
      and other_match.id <> p_match_id
      and (
        (
          p_player_one_registration_id is not null
          and p_player_one_registration_id in (
            other_match.player_one_registration_id,
            other_match.player_two_registration_id
          )
        )
        or (
          p_player_two_registration_id is not null
          and p_player_two_registration_id in (
            other_match.player_one_registration_id,
            other_match.player_two_registration_id
          )
        )
        or (
          v_match.player_one_registration_id is not null
          and v_match.player_one_registration_id in (
            other_match.player_one_registration_id,
            other_match.player_two_registration_id
          )
        )
        or (
          v_match.player_two_registration_id is not null
          and v_match.player_two_registration_id in (
            other_match.player_one_registration_id,
            other_match.player_two_registration_id
          )
        )
      )
  ) then
    raise exception
      'Participant edits are blocked because one of these players already appears elsewhere in this bracket';
  end if;

  update public.tournament_matches
  set
    player_one_registration_id = p_player_one_registration_id,
    player_two_registration_id = p_player_two_registration_id
  where id = p_match_id;
end;
$$;

create or replace function public.admin_reset_tournament_match(
  p_match_id uuid,
  p_reset_by text
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
  v_next_round_id uuid;
  v_next_match public.tournament_matches%rowtype;
  v_next_match_number integer;
begin
  if p_reset_by is null or btrim(p_reset_by) = '' then
    raise exception 'Resetting administrator is required';
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

  if v_format = 'single_elimination'
    and v_match.winner_registration_id is not null then
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
        raise exception 'Generated downstream match not found';
      end if;

      if v_next_match.status <> 'scheduled'
        or v_next_match.player_one_score is not null
        or v_next_match.player_two_score is not null
        or v_next_match.winner_registration_id is not null
        or v_next_match.official_result_submission_id is not null
        or v_next_match.official_result_decided_by is not null
        or v_next_match.official_result_decided_at is not null
        or exists (
          select 1
          from public.match_result_submissions as submission
          where submission.match_id = v_next_match.id
        )
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.match_id = v_next_match.id
        ) then
        raise exception
          'Reset blocked because the downstream match has result activity or an official result';
      end if;

      if (v_match.match_number % 2) = 1 then
        if v_next_match.player_one_registration_id is distinct from
          v_match.winner_registration_id then
          raise exception
            'Reset blocked because the downstream player slot no longer matches this winner';
        end if;

        update public.tournament_matches
        set player_one_registration_id = null
        where id = v_next_match.id;
      else
        if v_next_match.player_two_registration_id is distinct from
          v_match.winner_registration_id then
          raise exception
            'Reset blocked because the downstream player slot no longer matches this winner';
        end if;

        update public.tournament_matches
        set player_two_registration_id = null
        where id = v_next_match.id;
      end if;
    end if;
  end if;

  update public.match_result_report_groups
  set
    status = 'reset',
    reviewed_by = p_reset_by,
    reviewed_at = now(),
    review_notes = coalesce(
      review_notes,
      'Match was reset by an administrator.'
    ),
    finalized_at = coalesce(finalized_at, now()),
    finalized_source = 'reset'
  where match_id = p_match_id
    and status <> 'reset';

  update public.match_result_submissions
  set
    status = 'rejected',
    reviewed_by = p_reset_by,
    review_notes = coalesce(
      review_notes,
      'Match was reset by an administrator.'
    ),
    reviewed_at = now()
  where match_id = p_match_id
    and status <> 'rejected';

  update public.tournament_matches
  set
    player_one_score = null,
    player_two_score = null,
    winner_registration_id = null,
    official_result_submission_id = null,
    official_result_decided_by = null,
    official_result_decided_at = null,
    status = 'scheduled'
  where id = p_match_id;
end;
$$;

revoke all on function public.admin_update_match_participants(
  uuid,
  uuid,
  uuid,
  text
) from public;
grant execute on function public.admin_update_match_participants(
  uuid,
  uuid,
  uuid,
  text
) to service_role;

revoke all on function public.admin_reset_tournament_match(uuid, text)
  from public;
grant execute on function public.admin_reset_tournament_match(uuid, text)
  to service_role;

commit;
