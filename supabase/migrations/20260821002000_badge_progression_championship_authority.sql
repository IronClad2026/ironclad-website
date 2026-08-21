begin;

create function public.get_player_badge_tournament_authority_participants(
  p_tournament_id uuid
)
returns table (
  player_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select distinct event.player_id
  from public.leaderboard_point_events as event
  join public.tournaments as tournament
    on tournament.id = event.tournament_id
  where event.tournament_id = p_tournament_id
    and tournament.status = 'completed'
    and tournament.first_completed_at is not null
    and event.event_type in ('participation', 'tournament_win')
    and event.source in ('system', 'recalculation')
    and event.bracket_type in ('academy', 'challenge', 'main')
    and event.registration_id is not null
    and event.tournament_bracket_id is not null
    and not public.is_registration_confirmed_no_show_for_leaderboard(
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id
    )
    and not exists (
      select 1
      from public.leaderboard_point_events as withheld
      where withheld.tournament_id = event.tournament_id
        and withheld.registration_id = event.registration_id
        and withheld.player_id = event.player_id
        and withheld.event_type = 'participation_withheld'
        and withheld.source = event.source
    );
$$;

alter function public.get_player_badge_tournament_authority_participants(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_authority_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_authority_participants(uuid)
  to service_role;

create function public.get_player_badge_tournament_prestige_summary(
  p_player_id uuid
)
returns table (
  played_advance_win_count integer,
  first_advance_match_id uuid,
  first_advance_at timestamptz,
  semifinalist_count integer,
  first_semifinal_tournament_id uuid,
  first_semifinal_at timestamptz,
  finalist_count integer,
  first_finalist_tournament_id uuid,
  first_finalist_at timestamptz,
  academy_championship_count integer,
  first_academy_championship_tournament_id uuid,
  first_academy_championship_at timestamptz,
  challenge_championship_count integer,
  first_challenge_championship_tournament_id uuid,
  first_challenge_championship_at timestamptz,
  main_championship_count integer,
  first_main_championship_tournament_id uuid,
  first_main_championship_at timestamptz,
  championship_count integer,
  second_championship_tournament_id uuid,
  second_championship_at timestamptz,
  triple_crown_bracket_count integer,
  triple_crown_tournament_id uuid,
  triple_crown_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with valid_championship_events as (
    select
      event.tournament_id,
      event.tournament_bracket_id,
      event.registration_id,
      event.bracket_type,
      tournament.first_completed_at as completed_at
    from public.leaderboard_point_events as event
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    where event.player_id = p_player_id
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and event.event_type = 'tournament_win'
      and event.source in ('system', 'recalculation')
      and event.bracket_type in ('academy', 'challenge', 'main')
      and event.tournament_id is not null
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        event.tournament_id,
        event.tournament_bracket_id,
        event.registration_id
      )
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = p_player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  played_advancement_matches as (
    select
      match.id as match_id,
      coalesce(
        match.official_result_decided_at,
        match.updated_at
      ) as advanced_at
    from public.tournament_matches as match
    join public.bracket_rounds as round
      on round.id = match.round_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    join public.registrations as winner
      on winner.id = match.winner_registration_id
      and winner.profile_id = p_player_id
    join public.bracket_rounds as next_round
      on next_round.generated_bracket_id = generated.id
      and next_round.round_number = round.round_number + 1
    join public.tournament_matches as next_match
      on next_match.round_id = next_round.id
      and next_match.match_number = ceil(match.match_number / 2.0)::integer
      and (
        (
          mod(match.match_number, 2) = 1
          and next_match.player_one_registration_id =
            match.winner_registration_id
        )
        or (
          mod(match.match_number, 2) = 0
          and next_match.player_two_registration_id =
            match.winner_registration_id
        )
      )
    where tournament.status not in ('cancelled', 'voided')
      and bracket.launched_at is not null
      and bracket.name in ('Academy', 'Challenge', 'Main')
      and generated.format = 'single_elimination'
      and public.is_tournament_match_played_for_leaderboard(match.id)
  ),
  ranked_advances as (
    select
      advance.match_id,
      advance.advanced_at,
      row_number() over (
        order by advance.advanced_at, advance.match_id
      ) as advance_number
    from played_advancement_matches as advance
  ),
  single_elimination_rounds as (
    select
      generated.id as generated_bracket_id,
      bracket.id as tournament_bracket_id,
      tournament.id as tournament_id,
      tournament.first_completed_at as completed_at,
      max(round.round_number) as final_round_number
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = generated.id
    where tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and bracket.launched_at is not null
      and bracket.name in ('Academy', 'Challenge', 'Main')
      and generated.format = 'single_elimination'
    group by
      generated.id,
      bracket.id,
      tournament.id,
      tournament.first_completed_at
  ),
  target_round_appearances as (
    select distinct
      round_scope.tournament_id,
      round_scope.completed_at,
      case
        when round.round_number = round_scope.final_round_number - 1 then
          'semifinal'
        when round.round_number = round_scope.final_round_number then
          'final'
      end as reached_stage
    from single_elimination_rounds as round_scope
    join public.bracket_rounds as round
      on round.generated_bracket_id = round_scope.generated_bracket_id
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
      on participant.registration_id is not null
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id = p_player_id
      and registration.registration_status = 'approved'
    where (
        round.round_number = round_scope.final_round_number
        or (
          round_scope.final_round_number >= 2
          and round.round_number = round_scope.final_round_number - 1
        )
      )
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        round_scope.tournament_id,
        round_scope.tournament_bracket_id,
        registration.id
      )
  ),
  semifinal_tournaments as (
    select
      appearance.tournament_id,
      min(appearance.completed_at) as completed_at
    from target_round_appearances as appearance
    where appearance.reached_stage = 'semifinal'
    group by appearance.tournament_id
  ),
  finalist_tournaments as (
    select
      appearance.tournament_id,
      min(appearance.completed_at) as completed_at
    from target_round_appearances as appearance
    where appearance.reached_stage = 'final'
    group by appearance.tournament_id
  ),
  ranked_semifinals as (
    select
      semifinal.tournament_id,
      semifinal.completed_at,
      row_number() over (
        order by semifinal.completed_at, semifinal.tournament_id
      ) as semifinal_number
    from semifinal_tournaments as semifinal
  ),
  ranked_finals as (
    select
      finalist.tournament_id,
      finalist.completed_at,
      row_number() over (
        order by finalist.completed_at, finalist.tournament_id
      ) as finalist_number
    from finalist_tournaments as finalist
  ),
  championship_events as (
    select
      event.tournament_id,
      event.bracket_type,
      event.completed_at
    from valid_championship_events as event
  ),
  championship_tournaments as (
    select
      event.tournament_id,
      min(event.completed_at) as completed_at
    from championship_events as event
    group by event.tournament_id
  ),
  ranked_championships as (
    select
      championship.tournament_id,
      championship.completed_at,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from championship_tournaments as championship
  ),
  academy_championships as (
    select
      event.tournament_id,
      min(event.completed_at) as completed_at
    from championship_events as event
    where event.bracket_type = 'academy'
    group by event.tournament_id
  ),
  challenge_championships as (
    select
      event.tournament_id,
      min(event.completed_at) as completed_at
    from championship_events as event
    where event.bracket_type = 'challenge'
    group by event.tournament_id
  ),
  main_championships as (
    select
      event.tournament_id,
      min(event.completed_at) as completed_at
    from championship_events as event
    where event.bracket_type = 'main'
    group by event.tournament_id
  ),
  ranked_academy_championships as (
    select
      championship.tournament_id,
      championship.completed_at,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from academy_championships as championship
  ),
  ranked_challenge_championships as (
    select
      championship.tournament_id,
      championship.completed_at,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from challenge_championships as championship
  ),
  ranked_main_championships as (
    select
      championship.tournament_id,
      championship.completed_at,
      row_number() over (
        order by championship.completed_at, championship.tournament_id
      ) as championship_number
    from main_championships as championship
  ),
  division_firsts as (
    select
      'academy'::text as bracket_type,
      championship.tournament_id,
      championship.completed_at
    from ranked_academy_championships as championship
    where championship.championship_number = 1
    union all
    select
      'challenge'::text as bracket_type,
      championship.tournament_id,
      championship.completed_at
    from ranked_challenge_championships as championship
    where championship.championship_number = 1
    union all
    select
      'main'::text as bracket_type,
      championship.tournament_id,
      championship.completed_at
    from ranked_main_championships as championship
    where championship.championship_number = 1
  ),
  triple_crown_source as (
    select
      firsts.tournament_id,
      firsts.completed_at
    from division_firsts as firsts
    order by firsts.completed_at desc, firsts.tournament_id desc
    limit 1
  )
  select
    coalesce((select count(*)::integer from ranked_advances), 0)
      as played_advance_win_count,
    (
      select ranked.match_id
      from ranked_advances as ranked
      where ranked.advance_number = 1
    ) as first_advance_match_id,
    (
      select ranked.advanced_at
      from ranked_advances as ranked
      where ranked.advance_number = 1
    ) as first_advance_at,
    coalesce((select count(*)::integer from ranked_semifinals), 0)
      as semifinalist_count,
    (
      select ranked.tournament_id
      from ranked_semifinals as ranked
      where ranked.semifinal_number = 1
    ) as first_semifinal_tournament_id,
    (
      select ranked.completed_at
      from ranked_semifinals as ranked
      where ranked.semifinal_number = 1
    ) as first_semifinal_at,
    coalesce((select count(*)::integer from ranked_finals), 0)
      as finalist_count,
    (
      select ranked.tournament_id
      from ranked_finals as ranked
      where ranked.finalist_number = 1
    ) as first_finalist_tournament_id,
    (
      select ranked.completed_at
      from ranked_finals as ranked
      where ranked.finalist_number = 1
    ) as first_finalist_at,
    coalesce(
      (select count(*)::integer from ranked_academy_championships),
      0
    ) as academy_championship_count,
    (
      select ranked.tournament_id
      from ranked_academy_championships as ranked
      where ranked.championship_number = 1
    ) as first_academy_championship_tournament_id,
    (
      select ranked.completed_at
      from ranked_academy_championships as ranked
      where ranked.championship_number = 1
    ) as first_academy_championship_at,
    coalesce(
      (select count(*)::integer from ranked_challenge_championships),
      0
    ) as challenge_championship_count,
    (
      select ranked.tournament_id
      from ranked_challenge_championships as ranked
      where ranked.championship_number = 1
    ) as first_challenge_championship_tournament_id,
    (
      select ranked.completed_at
      from ranked_challenge_championships as ranked
      where ranked.championship_number = 1
    ) as first_challenge_championship_at,
    coalesce(
      (select count(*)::integer from ranked_main_championships),
      0
    ) as main_championship_count,
    (
      select ranked.tournament_id
      from ranked_main_championships as ranked
      where ranked.championship_number = 1
    ) as first_main_championship_tournament_id,
    (
      select ranked.completed_at
      from ranked_main_championships as ranked
      where ranked.championship_number = 1
    ) as first_main_championship_at,
    coalesce((select count(*)::integer from ranked_championships), 0)
      as championship_count,
    (
      select ranked.tournament_id
      from ranked_championships as ranked
      where ranked.championship_number = 2
    ) as second_championship_tournament_id,
    (
      select ranked.completed_at
      from ranked_championships as ranked
      where ranked.championship_number = 2
    ) as second_championship_at,
    coalesce((select count(*)::integer from division_firsts), 0)
      as triple_crown_bracket_count,
    (
      select source.tournament_id
      from triple_crown_source as source
      where (select count(*) from division_firsts) = 3
    ) as triple_crown_tournament_id,
    (
      select source.completed_at
      from triple_crown_source as source
      where (select count(*) from division_firsts) = 3
    ) as triple_crown_at;
$$;

alter function public.get_player_badge_tournament_prestige_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_tournament_prestige_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_tournament_prestige_summary(uuid)
  to service_role;

comment on function public.get_player_badge_tournament_authority_participants(uuid) is
  'Service-role-only helper listing completed tournament players with authoritative leaderboard participation or championship facts for badge evaluators.';
comment on function public.get_player_badge_tournament_prestige_summary(uuid) is
  'Service-role-only helper summarizing played match advancement, round reach, and championship facts for badge evaluators.';

commit;
