begin;

-- A row is the durable completion receipt for one accounting settlement. The
-- launched bracket and its official outcomes remain the competitive source of
-- truth; this table stores only reconciliation metadata needed for retry-safe
-- division-scoped accounting.
create table public.leaderboard_division_settlements (
  tournament_bracket_id uuid primary key
    references public.tournament_brackets(id) on delete restrict,
  season_id uuid not null
    references public.leaderboard_seasons(id) on delete restrict,
  settlement_version integer not null
    check (settlement_version > 0),
  calculation_checksum text not null
    check (calculation_checksum ~ '^[0-9a-f]{32}$'),
  settled_at timestamptz not null default clock_timestamp(),
  last_reconciled_at timestamptz not null default clock_timestamp(),
  constraint leaderboard_division_settlements_reconciliation_order_check
    check (last_reconciled_at >= settled_at)
);

create index leaderboard_division_settlements_season_idx
  on public.leaderboard_division_settlements(season_id, settled_at);

alter table public.leaderboard_division_settlements enable row level security;
revoke all on table public.leaderboard_division_settlements
  from public, anon, authenticated, service_role;

-- Existing system/recalculation point history must identify exactly one
-- canonical Division before the shadow model can be installed. The legacy
-- no-show event deliberately stores a null bracket ID, so its registration is
-- the accepted authoritative fallback.
do $$
begin
  if exists (
    select 1
    from public.leaderboard_point_events as event
    left join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    left join public.tournament_brackets as explicit_bracket
      on explicit_bracket.id = event.tournament_bracket_id
    left join public.tournament_brackets as registration_bracket
      on registration_bracket.id = registration.tournament_bracket_id
    where event.source in ('system', 'recalculation')
      and event.event_type <> 'admin_adjustment'
      and (
        event.tournament_id is null
        or coalesce(explicit_bracket.id, registration_bracket.id) is null
        or (
          event.tournament_bracket_id is null
          and event.event_type <> 'participation_withheld'
        )
        or (
          explicit_bracket.id is not null
          and registration_bracket.id is not null
          and explicit_bracket.id is distinct from registration_bracket.id
        )
        or coalesce(
          explicit_bracket.tournament_id,
          registration_bracket.tournament_id
        ) is distinct from event.tournament_id
        or case event.bracket_type
          when 'academy' then 'Academy'
          when 'challenge' then 'Challenge'
          when 'main' then 'Main'
          else null
        end is distinct from coalesce(
          explicit_bracket.name,
          registration_bracket.name
        )
      )
  ) then
    raise exception
      'Historical leaderboard point history has ambiguous Division identity'
      using errcode = '55000';
  end if;
end;
$$;

-- This is the future writer's single calculation source. PR 5 exposes it only
-- through the read-only shadow RPC below; PR 7 may consume the same rows when
-- the existing event writer is converted to a Division coordinator.
create function ironclad_private.calculate_leaderboard_division_point_events(
  p_tournament_bracket_id uuid
)
returns table (
  point_event_tournament_bracket_id uuid,
  registration_id uuid,
  player_id uuid,
  bracket_type text,
  points integer,
  event_type text,
  description text,
  source_match_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with target as (
    select
      tournament.id as tournament_id,
      bracket.id as tournament_bracket_id,
      bracket.name as bracket_name,
      case bracket.name
        when 'Academy' then 'academy'
        when 'Challenge' then 'challenge'
        when 'Main' then 'main'
      end as bracket_type,
      generated.id as generated_bracket_id,
      generated.format,
      case when bracket.name = 'Main' then 5 else 2 end
        as round_passed_points,
      case when bracket.name = 'Main' then 5 else 3 end
        as tournament_win_points
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.id = p_tournament_bracket_id
      and bracket.name in ('Academy', 'Challenge', 'Main')
  ),
  completed_participants as (
    select distinct
      target.tournament_id,
      target.tournament_bracket_id,
      target.bracket_type,
      participant.registration_id,
      registration.profile_id as player_id
    from target
    join public.tournament_matches as match
      on match.generated_bracket_id = target.generated_bracket_id
      and match.status = 'completed'
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
  ),
  result_participants as (
    select distinct
      target.tournament_id,
      target.tournament_bracket_id,
      target.bracket_type,
      participant.registration_id,
      registration.profile_id as player_id
    from target
    join public.tournament_matches as match
      on match.generated_bracket_id = target.generated_bracket_id
      and match.status = 'completed'
      and match.outcome_type is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and match.player_one_score is not null
      and match.player_two_score is not null
      and match.winner_registration_id is not null
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
  ),
  participation_events as (
    select
      participant.tournament_bracket_id
        as point_event_tournament_bracket_id,
      participant.registration_id,
      participant.player_id,
      participant.bracket_type,
      10 as points,
      'participation'::text as event_type,
      'Participation points for completed match participation'::text
        as description,
      null::uuid as source_match_id
    from result_participants as participant
    where not public.is_registration_confirmed_no_show_for_leaderboard(
      participant.tournament_id,
      participant.tournament_bracket_id,
      participant.registration_id
    )
  ),
  withheld_events as (
    select
      null::uuid as point_event_tournament_bracket_id,
      participant.registration_id,
      participant.player_id,
      participant.bracket_type,
      0 as points,
      'participation_withheld'::text as event_type,
      'Participation points withheld due to confirmed no-show'::text
        as description,
      null::uuid as source_match_id
    from completed_participants as participant
    where public.is_registration_confirmed_no_show_for_leaderboard(
      participant.tournament_id,
      participant.tournament_bracket_id,
      participant.registration_id
    )
  ),
  single_elimination_final_rounds as (
    select
      target.generated_bracket_id,
      max(round.round_number) as final_round_number
    from target
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
    where target.format = 'single_elimination'
    group by target.generated_bracket_id
  ),
  progression_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.round_passed_points as points,
      'round_passed'::text as event_type,
      'Round passed points for non-final single-elimination match win'::text
        as description,
      match.id as source_match_id
    from target
    join single_elimination_final_rounds as final_round
      on final_round.generated_bracket_id = target.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
      and round.round_number < final_round.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
  ),
  single_elimination_win_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.tournament_win_points as points,
      'tournament_win'::text as event_type,
      'Tournament winner bonus for final single-elimination match win'::text
        as description,
      match.id as source_match_id
    from target
    join single_elimination_final_rounds as final_round
      on final_round.generated_bracket_id = target.generated_bracket_id
    join public.bracket_rounds as round
      on round.generated_bracket_id = target.generated_bracket_id
      and round.round_number = final_round.final_round_number
    join public.tournament_matches as match
      on match.round_id = round.id
      and match.status = 'completed'
      and match.winner_registration_id is not null
    join public.registrations as registration
      on registration.id = match.winner_registration_id
      and registration.profile_id is not null
  ),
  round_robin_rank_one as (
    select
      standing.generated_bracket_id,
      count(*)::integer as rank_one_count,
      (
        select selected.registration_id
        from public.tournament_standings as selected
        where selected.generated_bracket_id = standing.generated_bracket_id
          and selected.rank = 1
        order by selected.registration_id::text
        limit 1
      ) as winner_registration_id
    from public.tournament_standings as standing
    join target
      on target.generated_bracket_id = standing.generated_bracket_id
      and target.format = 'round_robin'
    where standing.rank = 1
    group by standing.generated_bracket_id
  ),
  round_robin_win_events as (
    select
      target.tournament_bracket_id
        as point_event_tournament_bracket_id,
      registration.id as registration_id,
      registration.profile_id as player_id,
      target.bracket_type,
      target.tournament_win_points as points,
      'tournament_win'::text as event_type,
      'Tournament winner bonus for completed round-robin rank 1'::text
        as description,
      null::uuid as source_match_id
    from target
    join round_robin_rank_one as rank_one
      on rank_one.generated_bracket_id = target.generated_bracket_id
      and rank_one.rank_one_count = 1
    join public.registrations as registration
      on registration.id = rank_one.winner_registration_id
      and registration.profile_id is not null
  ),
  lower_division_history as (
    select
      bracket.id as tournament_bracket_id,
      tournament.id as tournament_id,
      bracket.name as bracket_name,
      case bracket.name
        when 'Academy' then 'academy'
        when 'Challenge' then 'challenge'
      end as bracket_type,
      coalesce(
        settlement.settled_at,
        tournament.first_completed_at,
        (
          select max(match.updated_at)
          from public.tournament_matches as match
          where match.generated_bracket_id = generated.id
        ),
        bracket.launched_at
      ) as completed_at
    from target
    join public.tournament_brackets as bracket
      on bracket.name = target.bracket_name
      and bracket.name in ('Academy', 'Challenge')
      and bracket.launched_at is not null
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
      and public.is_generated_bracket_complete(generated.id)
    left join public.leaderboard_division_settlements as settlement
      on settlement.tournament_bracket_id = bracket.id
    left join public.leaderboard_tournament_season_memberships as membership
      on membership.tournament_id = tournament.id
      and membership.voided_at is null
    where bracket.id = target.tournament_bracket_id
      or settlement.tournament_bracket_id is not null
      or (
        tournament.status = 'completed'
        and tournament.first_completed_at is not null
        and membership.tournament_id is not null
      )
  ),
  valid_lower_division_candidates as (
    select
      history.*,
      registration.id as registration_id,
      registration.profile_id as player_id
    from lower_division_history as history
    join public.registrations as registration
      on registration.tournament_id = history.tournament_id
      and registration.tournament_bracket_id = history.tournament_bracket_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
    where public.is_valid_late_entry_participation(
      history.tournament_id,
      history.tournament_bracket_id,
      registration.id
    )
  ),
  anchored_lower_division_candidates as (
    select
      candidate.*,
      anchor.completed_at as anchor_completed_at,
      anchor.tournament_id as anchor_tournament_id,
      anchor.tournament_bracket_id as anchor_tournament_bracket_id,
      (
        select count(distinct prior.tournament_id)::integer
        from lower_division_history as prior
        where prior.bracket_name = candidate.bracket_name
          and (
            prior.completed_at,
            prior.tournament_id,
            prior.tournament_bracket_id
          ) < (
            anchor.completed_at,
            anchor.tournament_id,
            anchor.tournament_bracket_id
          )
      ) as missed_event_count
    from valid_lower_division_candidates as candidate
    join lateral (
      select
        anchor_history.completed_at,
        anchor_history.tournament_id,
        anchor_history.tournament_bracket_id
      from lower_division_history as anchor_history
      join public.registrations as anchor_registration
        on anchor_registration.tournament_id = anchor_history.tournament_id
        and anchor_registration.tournament_bracket_id =
          anchor_history.tournament_bracket_id
        and anchor_registration.registration_status = 'approved'
        and anchor_registration.profile_id = candidate.player_id
      where anchor_history.bracket_name = candidate.bracket_name
      order by
        anchor_history.completed_at,
        anchor_history.tournament_id,
        anchor_history.tournament_bracket_id
      limit 1
    ) as anchor on true
  ),
  awardable_late_entry_candidates as (
    select candidate.*
    from anchored_lower_division_candidates as candidate
    where candidate.missed_event_count > 0
      and not exists (
        select 1
        from lower_division_history as earlier_history
        join public.registrations as earlier_registration
          on earlier_registration.tournament_id =
            earlier_history.tournament_id
          and earlier_registration.tournament_bracket_id =
            earlier_history.tournament_bracket_id
          and earlier_registration.registration_status = 'approved'
          and earlier_registration.profile_id = candidate.player_id
        where earlier_history.bracket_name = candidate.bracket_name
          and (
            earlier_history.completed_at,
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id
          ) >= (
            candidate.anchor_completed_at,
            candidate.anchor_tournament_id,
            candidate.anchor_tournament_bracket_id
          )
          and (
            earlier_history.completed_at,
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id
          ) < (
            candidate.completed_at,
            candidate.tournament_id,
            candidate.tournament_bracket_id
          )
          and public.is_valid_late_entry_participation(
            earlier_history.tournament_id,
            earlier_history.tournament_bracket_id,
            earlier_registration.id
          )
      )
  ),
  late_entry_bonus_events as (
    select
      candidate.tournament_bracket_id
        as point_event_tournament_bracket_id,
      candidate.registration_id,
      candidate.player_id,
      candidate.bracket_type,
      least(candidate.missed_event_count, 5) * 5 as points,
      'missing_tournament_bonus'::text as event_type,
      'One-time Career late-entry catch-up'::text as description,
      null::uuid as source_match_id
    from awardable_late_entry_candidates as candidate
    where candidate.tournament_bracket_id = p_tournament_bracket_id
  )
  select * from participation_events
  union all
  select * from withheld_events
  union all
  select * from progression_events
  union all
  select * from single_elimination_win_events
  union all
  select * from round_robin_win_events
  union all
  select * from late_entry_bonus_events;
$$;

alter function
  ironclad_private.calculate_leaderboard_division_point_events(uuid)
  owner to postgres;
revoke all on function
  ironclad_private.calculate_leaderboard_division_point_events(uuid)
  from public, anon, authenticated, service_role;

create function public.get_leaderboard_division_shadow(
  p_tournament_bracket_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_bracket_name text;
  v_bracket_type text;
  v_launched_at timestamptz;
  v_generated_bracket_id uuid;
  v_generated_count integer;
  v_result jsonb;
begin
  if p_tournament_bracket_id is null then
    raise exception 'Tournament Division is required';
  end if;

  select
    tournament.id,
    tournament.status,
    bracket.name,
    case bracket.name
      when 'Academy' then 'academy'
      when 'Challenge' then 'challenge'
      when 'Main' then 'main'
    end,
    bracket.launched_at,
    count(generated.id)::integer,
    min(generated.id::text)::uuid
  into
    v_tournament_id,
    v_tournament_status,
    v_bracket_name,
    v_bracket_type,
    v_launched_at,
    v_generated_count,
    v_generated_bracket_id
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  left join public.generated_brackets as generated
    on generated.tournament_bracket_id = bracket.id
  where bracket.id = p_tournament_bracket_id
    and bracket.name in ('Academy', 'Challenge', 'Main')
  group by
    tournament.id,
    tournament.status,
    bracket.name,
    bracket.launched_at;

  if not found then
    raise exception 'Tournament Division not found';
  end if;
  if v_tournament_status in ('cancelled', 'voided') then
    raise exception 'A terminal Event Division cannot be shadow settled'
      using errcode = '55000';
  end if;
  if v_launched_at is null then
    raise exception 'Tournament Division must be launched before shadow settlement'
      using errcode = '55000';
  end if;
  if v_generated_count <> 1 or v_generated_bracket_id is null then
    raise exception 'Tournament Division requires exactly one generated bracket'
      using errcode = '55000';
  end if;
  if public.is_generated_bracket_complete(v_generated_bracket_id)
    is distinct from true then
    raise exception 'Tournament Division must be complete before shadow settlement'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_report_groups as report_group
      on report_group.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and report_group.finalized_at is null
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
  ) or exists (
    select 1
    from public.tournament_matches as match
    join public.match_result_submissions as submission
      on submission.match_id = match.id
    where match.generated_bracket_id = v_generated_bracket_id
      and submission.status = 'pending'
  ) then
    raise exception 'Tournament Division has unresolved result authority'
      using errcode = '55000';
  end if;

  with shadow_events as materialized (
    select *
    from ironclad_private.calculate_leaderboard_division_point_events(
      p_tournament_bracket_id
    )
  ),
  approved_targets as (
    select distinct
      registration.id as registration_id,
      registration.profile_id as player_id
    from public.registrations as registration
    where registration.tournament_id = v_tournament_id
      and registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'approved'
      and registration.profile_id is not null
  ),
  real_matches as (
    select distinct
      participant.registration_id,
      registration.profile_id as player_id,
      match.id as match_id,
      match.winner_registration_id
    from public.tournament_matches as match
    cross join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
    join public.registrations as registration
      on registration.id = participant.registration_id
      and registration.profile_id is not null
    where match.generated_bracket_id = v_generated_bracket_id
      and public.is_tournament_match_played_for_leaderboard(match.id)
  ),
  player_scope as (
    select event.registration_id, event.player_id from shadow_events as event
    union
    select target.registration_id, target.player_id from approved_targets as target
    union
    select match.registration_id, match.player_id from real_matches as match
  ),
  event_effects as (
    select
      event.registration_id,
      event.player_id,
      coalesce(sum(event.points), 0)::integer as points,
      count(*) filter (
        where event.event_type = 'participation'
      )::integer as competitions_played,
      count(*) filter (
        where event.event_type = 'round_passed'
      )::integer as rounds_passed,
      count(*) filter (
        where event.event_type = 'tournament_win'
      )::integer as division_wins,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'eventType', event.event_type,
            'points', event.points,
            'description', event.description,
            'pointEventTournamentBracketId',
              event.point_event_tournament_bracket_id,
            'sourceMatchId', event.source_match_id
          )
          order by
            event.event_type,
            event.source_match_id,
            event.points,
            event.registration_id
        ) filter (where event.event_type is not null),
        '[]'::jsonb
      ) as point_events
    from shadow_events as event
    group by event.registration_id, event.player_id
  ),
  real_match_effects as (
    select
      real_match.registration_id,
      real_match.player_id,
      count(distinct real_match.match_id)::integer as real_matches,
      count(distinct real_match.match_id) filter (
        where real_match.winner_registration_id = real_match.registration_id
      )::integer as real_match_wins
    from real_matches as real_match
    group by real_match.registration_id, real_match.player_id
  ),
  player_effects as (
    select
      player.registration_id,
      player.player_id,
      coalesce(event.points, 0)::integer as points,
      coalesce(event.competitions_played, 0)::integer as competitions_played,
      coalesce(event.rounds_passed, 0)::integer as rounds_passed,
      coalesce(event.division_wins, 0)::integer as division_wins,
      coalesce(real_match.real_matches, 0)::integer as real_matches,
      coalesce(real_match.real_match_wins, 0)::integer as real_match_wins,
      coalesce(event.point_events, '[]'::jsonb) as point_events,
      target.player_id is not null as badge_evaluation_target
    from player_scope as player
    left join event_effects as event
      on event.registration_id = player.registration_id
      and event.player_id = player.player_id
    left join real_match_effects as real_match
      on real_match.registration_id = player.registration_id
      and real_match.player_id = player.player_id
    left join approved_targets as target
      on target.registration_id = player.registration_id
      and target.player_id = player.player_id
  ),
  shadow_event_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from shadow_events as event
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  authoritative_event_counts as (
    select
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type,
      count(*)::integer as event_count
    from public.leaderboard_point_events as event
    left join public.registrations as registration
      on registration.id = event.registration_id
      and registration.profile_id = event.player_id
    where event.tournament_id = v_tournament_id
      and event.source in ('system', 'recalculation')
      and event.event_type <> 'admin_adjustment'
      and coalesce(
        event.tournament_bracket_id,
        registration.tournament_bracket_id
      ) = p_tournament_bracket_id
    group by
      event.registration_id,
      event.player_id,
      event.bracket_type,
      event.points,
      event.event_type
  ),
  parity_difference as (
    select 1
    from shadow_event_counts as shadow
    full join authoritative_event_counts as authoritative
      on authoritative.registration_id = shadow.registration_id
      and authoritative.player_id = shadow.player_id
      and authoritative.bracket_type = shadow.bracket_type
      and authoritative.points = shadow.points
      and authoritative.event_type = shadow.event_type
    where shadow.event_count is distinct from authoritative.event_count
    limit 1
  ),
  calculation as (
    select md5(
      coalesce(
        string_agg(
          concat_ws(
            '|',
            event.registration_id::text,
            event.player_id::text,
            event.bracket_type,
            event.event_type,
            event.points::text,
            coalesce(event.source_match_id::text, '')
          ),
          E'\n'
          order by
            event.registration_id,
            event.player_id,
            event.event_type,
            event.source_match_id,
            event.points
        ),
        ''
      )
    ) as checksum,
    count(*)::integer as event_count,
    coalesce(sum(event.points), 0)::integer as points
    from shadow_events as event
  ),
  authoritative_totals as (
    select
      coalesce(sum(event_count), 0)::integer as event_count,
      coalesce(sum(points * event_count), 0)::integer as points
    from authoritative_event_counts
  ),
  membership as (
    select
      current_membership.season_id,
      current_membership.qualifying_event_number,
      current_membership.voided_at
    from public.leaderboard_tournament_season_memberships
      as current_membership
    where current_membership.tournament_id = v_tournament_id
  )
  select jsonb_build_object(
    'calculationVersion', 1,
    'calculationChecksum', calculation.checksum,
    'tournamentId', v_tournament_id,
    'tournamentBracketId', p_tournament_bracket_id,
    'generatedBracketId', v_generated_bracket_id,
    'division', v_bracket_name,
    'bracketType', v_bracket_type,
    'pointEvents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'registrationId', event.registration_id,
            'playerId', event.player_id,
            'bracketType', event.bracket_type,
            'points', event.points,
            'eventType', event.event_type,
            'description', event.description,
            'pointEventTournamentBracketId',
              event.point_event_tournament_bracket_id,
            'sourceMatchId', event.source_match_id
          )
          order by
            event.registration_id,
            event.event_type,
            event.source_match_id,
            event.points
        )
        from shadow_events as event
      ),
      '[]'::jsonb
    ),
    'playerEffects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'registrationId', effect.registration_id,
            'playerId', effect.player_id,
            'points', effect.points,
            'competitionsPlayed', effect.competitions_played,
            'roundsPassed', effect.rounds_passed,
            'divisionWins', effect.division_wins,
            'realMatches', effect.real_matches,
            'realMatchWins', effect.real_match_wins,
            'allTimeEffect', jsonb_build_object(
              'points', effect.points,
              'competitionsPlayed', effect.competitions_played,
              'roundsPassed', effect.rounds_passed,
              'divisionWins', effect.division_wins,
              'realMatches', effect.real_matches,
              'realMatchWins', effect.real_match_wins
            ),
            'mainSeasonEffect', jsonb_build_object(
              'points', case
                when v_bracket_type = 'main' then effect.points
                else 0
              end,
              'competitionsPlayed', case
                when v_bracket_type = 'main'
                  then effect.competitions_played
                else 0
              end
            ),
            'badgeEvaluationTarget', effect.badge_evaluation_target,
            'pointEvents', effect.point_events
          )
          order by effect.registration_id, effect.player_id
        )
        from player_effects as effect
      ),
      '[]'::jsonb
    ),
    'badgeEvaluationTargets', coalesce(
      (
        select jsonb_agg(target.player_id order by target.player_id)
        from approved_targets as target
      ),
      '[]'::jsonb
    ),
    'mainSeasonEffect', jsonb_build_object(
      'qualifyingCompetitionDelta', case
        when v_bracket_type = 'main' then 1
        else 0
      end,
      'existingSeasonId', membership.season_id,
      'existingQualifyingEventNumber',
        membership.qualifying_event_number,
      'requiresSeasonAssignment', membership.season_id is null
    ),
    'comparison', jsonb_build_object(
      'eligible',
        v_tournament_status = 'completed'
        and membership.season_id is not null
        and membership.voided_at is null,
      'pointEventsMatch', case
        when v_tournament_status = 'completed'
          and membership.season_id is not null
          and membership.voided_at is null
          then not exists (select 1 from parity_difference)
        else null
      end,
      'shadowEventCount', calculation.event_count,
      'authoritativeEventCount', authoritative_totals.event_count,
      'shadowPoints', calculation.points,
      'authoritativePoints', authoritative_totals.points
    )
  )
  into v_result
  from calculation
  cross join authoritative_totals
  left join membership on true;

  return v_result;
end;
$$;

alter function public.get_leaderboard_division_shadow(uuid)
  owner to postgres;
revoke all on function public.get_leaderboard_division_shadow(uuid)
  from public, anon, authenticated;
grant execute on function public.get_leaderboard_division_shadow(uuid)
  to service_role;

comment on table public.leaderboard_division_settlements is
  'Private one-row-per-Division accounting completion receipts. Competitive truth remains in the launched generated bracket and official match outcomes.';
comment on function
  ironclad_private.calculate_leaderboard_division_point_events(uuid) is
  'Private deterministic projection of existing IronClad point rules for one Division; it performs no writes.';
comment on function public.get_leaderboard_division_shadow(uuid) is
  'Service-role-only read-only Division accounting projection and historical point-event parity report. It creates no settlement, points, seasons, Badges, notifications, or Reveal state.';

commit;
