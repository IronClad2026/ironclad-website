-- Supabase applies these statements and records this version in one transaction.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $lock$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time', 0)) then
    raise exception 'Leaderboard settlement is active. Retry this migration outside result reporting.'
      using errcode = '55P03';
  end if;
end;
$lock$;

-- A scored membership identifies the event. Native Pro eligibility also
-- requires the launched, completed Pro bracket and its own season receipt.
-- Keep the activated transition's single historical source on legacy rules.
create view ironclad_private.leaderboard_qualified_season_events
with (security_barrier = true) as
with scored_memberships as (
  select membership.season_id, membership.tournament_id,
    membership.qualifying_event_number, tournament.title as tournament_title,
    tournament.division_model_version, tournament.status, tournament.first_completed_at,
    season.official_bracket_type, transition.tournament_id as historical_tournament_id
  from public.leaderboard_tournament_season_memberships membership
  join public.tournaments tournament on tournament.id = membership.tournament_id
  join public.leaderboard_seasons season on season.id = membership.season_id
  left join ironclad_private.legacy_main_pro_season_transition transition
    on transition.season_id = season.id and transition.activated_at is not null
  where membership.qualifying_event_number between 1 and 6
    and membership.scored_at is not null and membership.voided_at is null
)
select membership.season_id, membership.tournament_id, membership.tournament_title,
  membership.qualifying_event_number, bracket.id as tournament_bracket_id, 'main'::text as bracket_type
from scored_memberships membership
join public.tournament_brackets bracket
  on bracket.tournament_id = membership.tournament_id and bracket.name = 'Main'
where membership.division_model_version = 'legacy_three_v1'
  and membership.status = 'completed' and membership.first_completed_at is not null
  and (
    (membership.historical_tournament_id = membership.tournament_id and membership.qualifying_event_number = 1)
    or (membership.historical_tournament_id is null and membership.official_bracket_type = 'main')
  )
union all
select membership.season_id, membership.tournament_id, membership.tournament_title,
  membership.qualifying_event_number, bracket.id, 'pro'::text
from scored_memberships membership
join public.tournament_brackets bracket
  on bracket.tournament_id = membership.tournament_id and bracket.name = 'Pro'
  and bracket.launched_at is not null
join public.generated_brackets generated on generated.tournament_bracket_id = bracket.id
join public.leaderboard_division_settlements receipt
  on receipt.tournament_bracket_id = bracket.id and receipt.season_id = membership.season_id
where membership.division_model_version = 'four_division_v1'
  and membership.status not in ('cancelled', 'voided')
  and (
    (membership.historical_tournament_id is not null and membership.qualifying_event_number > 1)
    or (membership.historical_tournament_id is null and membership.official_bracket_type = 'pro')
  )
  and not exists (
    select 1 from public.tournament_division_not_held_closures closure
    where closure.tournament_bracket_id = bracket.id
  )
  -- Mirror the bracket-completion predicate in this read model so public
  -- callers need no access to the service-role-only completion function.
  and case when generated.format = 'round_robin' then
    exists (select 1 from public.tournament_matches match where match.generated_bracket_id = generated.id)
    and not exists (
      select 1 from public.tournament_matches match
      where match.generated_bracket_id = generated.id
        and (match.status <> 'completed' or match.winner_registration_id is null)
    )
  else coalesce((
    select match.status = 'completed'
      and (match.winner_registration_id is not null or match.outcome_type in ('deadline_double_forfeit', 'empty_feeder'))
    from public.tournament_matches match
    join public.bracket_rounds round on round.id = match.round_id
    where match.generated_bracket_id = generated.id
    order by round.round_number desc, match.match_number desc
    limit 1
  ), false) end;

alter view ironclad_private.leaderboard_qualified_season_events owner to postgres;
revoke all on ironclad_private.leaderboard_qualified_season_events from public, anon, authenticated, service_role;

-- A withheld award may identify its bracket through its registration. An
-- event-scoped admin award may omit both IDs after the model guard has verified
-- the participant and division. Season-only adjustments are handled separately.
create view ironclad_private.leaderboard_qualified_season_point_events
with (security_barrier = true) as
select point.season_id, point.tournament_id, qualified.tournament_bracket_id,
  qualified.qualifying_event_number, point.registration_id, point.player_id,
  point.bracket_type, point.points, point.event_type, point.created_at
from ironclad_private.leaderboard_qualified_season_events qualified
join public.leaderboard_point_events point
  on point.season_id = qualified.season_id and point.tournament_id = qualified.tournament_id
  and point.bracket_type = qualified.bracket_type
left join public.registrations registration
  on registration.id = point.registration_id and registration.profile_id = point.player_id
where coalesce(point.tournament_bracket_id, registration.tournament_bracket_id) = qualified.tournament_bracket_id
  or (point.source = 'admin' and point.tournament_bracket_id is null and point.registration_id is null);

alter view ironclad_private.leaderboard_qualified_season_point_events owner to postgres;
revoke all on ironclad_private.leaderboard_qualified_season_point_events from public, anon, authenticated, service_role;

create or replace view ironclad_private.leaderboard_official_season_standings
with (security_barrier = true) as
with pro_events as (
  select point.season_id, point.tournament_id, point.tournament_bracket_id,
    point.qualifying_event_number, point.registration_id, point.player_id,
    point.points, point.event_type, point.created_at
  from ironclad_private.leaderboard_qualified_season_point_events point
  where point.bracket_type = 'pro'
  union all
  select point.season_id, point.tournament_id, point.tournament_bracket_id,
    null::smallint, point.registration_id, point.player_id,
    point.points, point.event_type, point.created_at
  from public.leaderboard_point_events point
  join public.leaderboard_seasons season on season.id = point.season_id
  left join ironclad_private.legacy_main_pro_season_transition transition
    on transition.season_id = season.id and transition.activated_at is not null
  where point.bracket_type = 'pro' and point.tournament_id is null and point.source = 'admin'
    and (season.official_bracket_type = 'pro' or transition.season_id is not null)
), pro_points as (
  select season_id, player_id, sum(points)::integer as total_points,
    count(distinct tournament_id) filter (where event_type = 'participation')::integer as tournaments_played,
    count(*) filter (where event_type = 'round_passed')::integer as rounds_passed,
    count(*) filter (where event_type = 'tournament_win')::integer as tournament_wins,
    max(created_at) as updated_at
  from pro_events
  group by season_id, player_id
), pro_matches as (
  select event.season_id, event.player_id, count(distinct match.id)::integer as matches_played,
    count(distinct match.id) filter (where match.winner_registration_id = event.registration_id)::integer as matches_won
  from pro_events event
  join public.registrations registration
    on registration.id = event.registration_id and registration.profile_id = event.player_id
  join public.generated_brackets generated
    on generated.tournament_bracket_id = coalesce(event.tournament_bracket_id, registration.tournament_bracket_id)
  join public.tournament_matches match
    on match.generated_bracket_id = generated.id and match.status = 'completed' and match.outcome_type is null
    and match.player_one_registration_id is not null and match.player_two_registration_id is not null
    and match.player_one_score is not null and match.player_two_score is not null and match.winner_registration_id is not null
    and (event.registration_id = match.player_one_registration_id or event.registration_id = match.player_two_registration_id)
  where not exists (
    select 1 from public.match_result_report_groups report
    where report.match_id = match.id and report.result_type = 'no_show' and report.finalized_at is not null
      and report.status in ('confirmed', 'auto_approved', 'approved')
      and report.no_show_status in ('confirmed', 'auto_confirmed', 'approved')
  )
  group by event.season_id, event.player_id
), continued as (
  select stats.season_id, stats.player_id, stats.bracket_type, stats.total_points,
    stats.tournaments_played, stats.rounds_passed, stats.tournament_wins,
    stats.matches_played, stats.matches_won, stats.matches_lost, stats.win_rate,
    stats.last_tournament_id, stats.last_tournament_points, stats.current_rank,
    stats.previous_rank, stats.rank_movement, stats.updated_at
  from public.leaderboard_player_season_stats stats
  join ironclad_private.legacy_main_pro_season_transition transition
    on transition.season_id = stats.season_id and transition.activated_at is not null
  where stats.bracket_type = 'main'
  union all
  select points.season_id, points.player_id, 'pro'::text, points.total_points,
    points.tournaments_played, points.rounds_passed, points.tournament_wins,
    coalesce(matches.matches_played, 0), coalesce(matches.matches_won, 0),
    greatest(coalesce(matches.matches_played, 0) - coalesce(matches.matches_won, 0), 0),
    case when coalesce(matches.matches_played, 0) = 0 then 0
      else round(matches.matches_won::numeric / matches.matches_played * 100, 2) end::numeric(5,2),
    latest.tournament_id, latest.points, null::integer, null::integer, 0, points.updated_at
  from pro_points points
  left join pro_matches matches on matches.season_id = points.season_id and matches.player_id = points.player_id
  left join lateral (
    select event.tournament_id, sum(event.points)::integer as points
    from pro_events event
    where event.season_id = points.season_id and event.player_id = points.player_id
      and event.tournament_id is not null
    group by event.tournament_id, event.qualifying_event_number
    order by event.qualifying_event_number desc, event.tournament_id desc
    limit 1
  ) latest on true
), sums as (
  select season_id, player_id, 'pro'::text as bracket_type,
    sum(total_points)::integer as total_points, sum(tournaments_played)::integer as tournaments_played,
    sum(rounds_passed)::integer as rounds_passed, sum(tournament_wins)::integer as tournament_wins,
    sum(matches_played)::integer as matches_played, sum(matches_won)::integer as matches_won,
    sum(matches_lost)::integer as matches_lost,
    case when sum(matches_played) = 0 then 0
      else round(sum(matches_won)::numeric / sum(matches_played) * 100, 2) end::numeric(5,2) as win_rate,
    max(updated_at) as updated_at
  from continued
  group by season_id, player_id
), ranked as (
  select sums.*,
    rank() over (partition by season_id order by total_points desc, tournament_wins desc, rounds_passed desc,
      case when matches_played = 0 then 0 else matches_won::numeric / matches_played end desc,
      matches_won desc)::integer as current_rank
  from sums
)
select stats.season_id, stats.player_id, stats.bracket_type, stats.total_points, stats.tournaments_played,
  stats.rounds_passed, stats.tournament_wins, stats.matches_played, stats.matches_won, stats.matches_lost,
  stats.win_rate, stats.last_tournament_id, stats.last_tournament_points, stats.current_rank,
  stats.previous_rank, stats.rank_movement, stats.updated_at
from public.leaderboard_player_season_stats stats
join public.leaderboard_seasons season on season.id = stats.season_id
where stats.bracket_type = 'main' and season.official_bracket_type = 'main' and not exists (
  select 1 from ironclad_private.legacy_main_pro_season_transition transition
  where transition.season_id = stats.season_id and transition.activated_at is not null
)
union all
select ranked.season_id, ranked.player_id, ranked.bracket_type, ranked.total_points, ranked.tournaments_played,
  ranked.rounds_passed, ranked.tournament_wins, ranked.matches_played, ranked.matches_won, ranked.matches_lost,
  ranked.win_rate, latest.last_tournament_id, latest.last_tournament_points, ranked.current_rank,
  case when season.official_bracket_type = 'pro' then native_stats.previous_rank
    when not latest.has_pro_points then latest.previous_rank else null::integer end,
  case when season.official_bracket_type = 'pro' then coalesce(native_stats.rank_movement, 0)
    when not latest.has_pro_points then latest.rank_movement else 0 end, ranked.updated_at
from ranked
join public.leaderboard_seasons season on season.id = ranked.season_id
left join public.leaderboard_player_season_stats native_stats
  on native_stats.season_id = ranked.season_id and native_stats.player_id = ranked.player_id and native_stats.bracket_type = 'pro'
cross join lateral (
  select contribution.last_tournament_id, contribution.last_tournament_points,
    contribution.previous_rank, contribution.rank_movement,
    bool_or(contribution.bracket_type = 'pro') over () as has_pro_points
  from continued contribution
  left join ironclad_private.leaderboard_qualified_season_events qualified
    on qualified.season_id = contribution.season_id and qualified.tournament_id = contribution.last_tournament_id
  left join public.tournaments tournament on tournament.id = contribution.last_tournament_id
  where contribution.season_id = ranked.season_id and contribution.player_id = ranked.player_id
  order by qualified.qualifying_event_number desc nulls last,
    coalesce(tournament.first_completed_at, tournament.created_at) desc nulls last, contribution.last_tournament_id desc
  limit 1
) latest;

create or replace view public.leaderboard_current_season
with (security_barrier = true, security_invoker = false) as
select season.id,
  case when transition.activated_at is not null
    then season.year::text || ' Pro Season ' || season.season_number::text else season.name end as name,
  season.year, season.season_number, season.start_date, season.end_date, season.is_active,
  season.created_at, season.updated_at, events.event_count as valid_main_event_count,
  season.finalized_at is not null as is_finalized, season.under_review_at is not null as is_under_review,
  case when transition.activated_at is not null then 'pro'::text else season.official_bracket_type end as official_bracket_type,
  events.event_count as valid_qualifying_event_count, transition.activated_at is not null as has_legacy_main_transition
from public.leaderboard_seasons season
left join ironclad_private.legacy_main_pro_season_transition transition on transition.season_id = season.id
cross join lateral (
  select count(*)::integer as event_count
  from ironclad_private.leaderboard_qualified_season_events qualified
  where qualified.season_id = season.id
) events
order by case when season.finalized_at is null then 0 else 1 end,
  case when season.finalized_at is null then season.created_at else null::timestamptz end,
  season.finalized_at desc nulls last, season.created_at desc
limit 1;

create or replace view public.leaderboard_public_season_standings
with (security_barrier = true, security_invoker = false) as
with standings as (
  select stats.season_id, stats.player_id, stats.bracket_type, stats.total_points,
    stats.tournaments_played, stats.rounds_passed, stats.tournament_wins, stats.matches_played,
    stats.matches_won, stats.matches_lost, stats.win_rate, stats.last_tournament_id,
    stats.last_tournament_points, stats.current_rank, stats.previous_rank, stats.rank_movement, stats.updated_at
  from public.leaderboard_player_season_stats stats
  where stats.bracket_type <> 'pro' or not exists (
    select 1
    from public.leaderboard_seasons season
    left join ironclad_private.legacy_main_pro_season_transition transition
      on transition.season_id = season.id and transition.activated_at is not null
    where season.id = stats.season_id
      and (season.official_bracket_type = 'pro' or transition.season_id is not null)
  )
  union all
  select official.season_id, official.player_id, official.bracket_type, official.total_points,
    official.tournaments_played, official.rounds_passed, official.tournament_wins, official.matches_played,
    official.matches_won, official.matches_lost, official.win_rate, official.last_tournament_id,
    official.last_tournament_points, official.current_rank, official.previous_rank, official.rank_movement, official.updated_at
  from ironclad_private.leaderboard_official_season_standings official
  where official.bracket_type = 'pro'
)
select standings.season_id,
  case when standings.bracket_type = 'pro' and transition.season_id is not null
    then season.year::text || ' Pro Season ' || season.season_number::text else season.name end as season_name,
  season.year, season.season_number, season.start_date, season.end_date,
  case when player.account_closed_at is null then standings.player_id else null::uuid end as player_id,
  case when player.account_closed_at is not null then 'Former Competitor'::text else player.display_name end as display_name,
  case when player.account_closed_at is not null then 'Former Competitor'::text else player.in_game_name end as in_game_name,
  case when player.account_closed_at is null then player.country else null::text end as country,
  case when player.account_closed_at is null then player.region else null::text end as region,
  case when player.account_closed_at is null then player.current_elo else null::integer end as current_elo,
  player.account_closed_at is null and player.avatar_url is not null as has_avatar,
  null::text as avatar_url,
  standings.bracket_type, standings.total_points, standings.tournaments_played, standings.rounds_passed,
  standings.tournament_wins, standings.matches_played, standings.matches_won, standings.matches_lost, standings.win_rate,
  case when player.account_closed_at is null then standings.last_tournament_id else null::uuid end as last_tournament_id,
  tournament.title as last_tournament_title, standings.last_tournament_points, standings.current_rank,
  standings.previous_rank, standings.rank_movement, standings.updated_at,
  row_number() over (partition by standings.season_id, standings.bracket_type order by standings.player_id) as display_order,
  case when standings.bracket_type = 'pro' and transition.tournament_id = standings.last_tournament_id
    then 'main'::text else standings.bracket_type end as last_tournament_bracket_type
from standings
join public.leaderboard_seasons season on season.id = standings.season_id
join public.players player on player.id = standings.player_id
left join ironclad_private.legacy_main_pro_season_transition transition
  on transition.season_id = season.id and transition.activated_at is not null
left join public.tournaments tournament on tournament.id = standings.last_tournament_id;

create view public.leaderboard_public_season_event_impacts
with (security_barrier = true, security_invoker = false) as
with contributions as (
  select point.season_id, point.tournament_id, point.player_id, sum(point.points)::integer as points
  from ironclad_private.leaderboard_qualified_season_point_events point
  group by point.season_id, point.tournament_id, point.player_id
), named_contributions as (
  select contribution.*,
    case when player.account_closed_at is not null then 'Former Competitor'::text
      else coalesce(nullif(player.in_game_name, ''), player.display_name) end as player_name
  from contributions contribution
  join public.players player on player.id = contribution.player_id
), top_scorers as (
  select contribution.*,
    row_number() over (partition by season_id, tournament_id order by points desc, player_name, player_id) as display_order
  from named_contributions contribution
)
select qualified.season_id, qualified.tournament_id, qualified.tournament_title,
  qualified.bracket_type, qualified.qualifying_event_number,
  scorer.player_name as top_scorer_name, scorer.points as top_scorer_points
from ironclad_private.leaderboard_qualified_season_events qualified
join top_scorers scorer on scorer.season_id = qualified.season_id and scorer.tournament_id = qualified.tournament_id
where scorer.display_order = 1;

alter view public.leaderboard_public_season_event_impacts owner to postgres;
revoke all on public.leaderboard_public_season_event_impacts from public, anon, authenticated, service_role;
grant select on public.leaderboard_public_season_event_impacts to anon, authenticated, service_role;

create or replace function public.finalize_leaderboard_main_season_if_ready(p_season_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_event_count integer;
  v_next_season_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time', 0));
  select season.finalized_at, ironclad_private.leaderboard_official_season_role(season.id)
  into v_finalized_at, v_authority
  from public.leaderboard_seasons season
  where season.id = p_season_id
  for update;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;
  if v_finalized_at is not null then
    return true;
  end if;

  -- The membership writer already enforces source authority. Retain the
  -- explicit corruption check from the continuing-season finalizer as well.
  if exists (
    select 1 from ironclad_private.legacy_main_pro_season_transition transition
    where transition.season_id = p_season_id and transition.activated_at is not null
  ) and exists (
    select 1 from public.leaderboard_tournament_season_memberships membership
    join public.tournaments tournament on tournament.id = membership.tournament_id
    where membership.season_id = p_season_id and membership.qualifying_event_number is not null
      and membership.voided_at is null and (
        (membership.qualifying_event_number = 1 and not exists (
          select 1 from ironclad_private.legacy_main_pro_season_transition transition
          where transition.season_id = membership.season_id and transition.tournament_id = membership.tournament_id
        )) or (membership.qualifying_event_number > 1 and (
          tournament.division_model_version <> 'four_division_v1' or not exists (
            select 1 from public.tournament_brackets bracket
            where bracket.tournament_id = tournament.id and bracket.name = 'Pro' and bracket.launched_at is not null
          )
        ))
      )
  ) then
    raise exception 'Invalid source in continued Pro season' using errcode = '55000';
  end if;

  -- The canonical settlement writer invokes this after the receipt, awards and
  -- scored_at are persisted. The existing parent-completion trigger can retry.
  select count(*)::integer into v_event_count
  from ironclad_private.leaderboard_qualified_season_events qualified
  where qualified.season_id = p_season_id;
  if v_event_count <> 6 then
    return false;
  end if;

  insert into public.leaderboard_season_champions (season_id, player_id, bracket_type, final_rank, final_points)
  select p_season_id, standings.player_id, v_authority, standings.current_rank, standings.total_points
  from ironclad_private.leaderboard_official_season_standings standings
  where standings.season_id = p_season_id and standings.bracket_type = v_authority
    and standings.current_rank between 1 and 3
  on conflict (season_id, player_id, bracket_type) do nothing;

  update public.leaderboard_seasons
  set finalized_at = clock_timestamp(), is_active = false
  where id = p_season_id and finalized_at is null;

  select public.get_or_create_leaderboard_season(current_date) into v_next_season_id;
  update public.leaderboard_seasons set is_active = true
  where id = v_next_season_id and finalized_at is null and not is_active;

  return true;
end;
$function$;

create or replace function ironclad_private.guard_pro_season_champion_snapshot()
returns trigger language plpgsql security definer set search_path = pg_catalog as $function$
begin
  if ironclad_private.leaderboard_official_season_role(new.season_id) = 'pro' and (
    new.bracket_type <> 'pro' or (
      select count(*) from ironclad_private.leaderboard_qualified_season_events qualified
      where qualified.season_id = new.season_id
    ) <> 6 or not exists (
      select 1 from ironclad_private.leaderboard_official_season_standings standings
      where standings.season_id = new.season_id and standings.player_id = new.player_id
        and standings.bracket_type = 'pro' and standings.current_rank = new.final_rank
        and standings.total_points = new.final_points and standings.current_rank between 1 and 3
    )
  ) then
    raise exception 'Pro champion snapshot requires six genuine events and exact official standings' using errcode = '55000';
  end if;
  return new;
end;
$function$;

create or replace function ironclad_private.guard_pro_season_badge_finalization()
returns trigger language plpgsql security definer set search_path = pg_catalog as $function$
begin
  if new.source_type = 'season' and ironclad_private.leaderboard_official_season_role(new.source_id) = 'pro'
    and not exists (
      select 1 from public.leaderboard_seasons season
      where season.id = new.source_id and season.finalized_at is not null and season.under_review_at is null
        and (
          select count(*) from ironclad_private.leaderboard_qualified_season_events qualified
          where qualified.season_id = season.id
        ) = 6
    ) then
    raise exception 'Pro season badge requires valid six-event finalization' using errcode = '55000';
  end if;
  return new;
end;
$function$;

-- Verify the public contract and private privilege boundary before commit.
do $verify$
begin
  if exists (
    select 1 from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
    where not has_table_privilege(role_name, 'public.leaderboard_public_season_event_impacts', 'select')
      or not has_table_privilege(role_name, 'public.leaderboard_current_season', 'select')
      or not has_table_privilege(role_name, 'public.leaderboard_public_season_standings', 'select')
      or has_table_privilege(role_name, 'ironclad_private.leaderboard_qualified_season_events', 'select')
      or has_table_privilege(role_name, 'ironclad_private.leaderboard_qualified_season_point_events', 'select')
      or has_function_privilege(role_name, 'public.finalize_leaderboard_main_season_if_ready(uuid)', 'execute')
      or has_function_privilege(role_name, 'ironclad_private.guard_pro_season_champion_snapshot()', 'execute')
      or has_function_privilege(role_name, 'ironclad_private.guard_pro_season_badge_finalization()', 'execute')
  ) then
    raise exception 'Leaderboard eligibility migration has unexpected grants';
  end if;
end;
$verify$;
