-- Definitions-only rollback for Production baseline ad3eb5b7aee24878252b52bb483d14adf488764c.
-- Restore the previous application first. Do not remove the migration's history.
-- If a season finalized before its parent events closed, prefer a forward fix.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, ironclad_private;

do $preflight$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time', 0)) then
    raise exception 'Leaderboard settlement is active. Retry this rollback outside result reporting.'
      using errcode = '55P03';
  end if;
  if exists (
    select 1
    from ironclad_private.leaderboard_qualified_season_events qualified
    join public.leaderboard_seasons season on season.id = qualified.season_id
    join public.tournaments tournament on tournament.id = qualified.tournament_id
    where season.finalized_at is not null and qualified.bracket_type = 'pro'
      and (tournament.status <> 'completed' or tournament.first_completed_at is null)
  ) then
    raise exception 'Rollback would block award reconciliation for a legitimately finalized Pro season';
  end if;
end;
$preflight$;

create or replace view ironclad_private.leaderboard_official_season_standings
with (security_barrier = true) as
WITH pro_events AS (
         SELECT p.id,
            p.season_id,
            p.tournament_id,
            p.tournament_bracket_id,
            p.registration_id,
            p.player_id,
            p.bracket_type,
            p.points,
            p.event_type,
            p.description,
            p.source,
            p.created_by_clerk_user_id,
            p.created_at
           FROM leaderboard_point_events p
             JOIN ironclad_private.legacy_main_pro_season_transition x ON x.season_id = p.season_id AND x.activated_at IS NOT NULL
             LEFT JOIN leaderboard_tournament_season_memberships m ON m.tournament_id = p.tournament_id AND m.season_id = p.season_id
             LEFT JOIN tournaments t ON t.id = p.tournament_id
          WHERE p.bracket_type = 'pro'::text AND (p.tournament_id IS NULL AND p.source = 'admin'::text OR t.division_model_version = 'four_division_v1'::text AND t.status = 'completed'::text AND t.first_completed_at IS NOT NULL AND m.qualifying_event_number >= 2 AND m.qualifying_event_number <= 6 AND m.scored_at IS NOT NULL AND m.voided_at IS NULL)
        ), pro_points AS (
         SELECT pro_events.season_id,
            pro_events.player_id,
            sum(pro_events.points)::integer AS total_points,
            count(DISTINCT pro_events.tournament_id) FILTER (WHERE pro_events.event_type = 'participation'::text)::integer AS tournaments_played,
            count(*) FILTER (WHERE pro_events.event_type = 'round_passed'::text)::integer AS rounds_passed,
            count(*) FILTER (WHERE pro_events.event_type = 'tournament_win'::text)::integer AS tournament_wins,
            max(pro_events.created_at) AS updated_at
           FROM pro_events
          GROUP BY pro_events.season_id, pro_events.player_id
        ), pro_matches AS (
         SELECT e.season_id,
            e.player_id,
            count(DISTINCT m.id)::integer AS matches_played,
            count(DISTINCT m.id) FILTER (WHERE m.winner_registration_id = e.registration_id)::integer AS matches_won
           FROM pro_events e
             JOIN registrations r ON r.id = e.registration_id AND r.profile_id = e.player_id
             JOIN generated_brackets g ON g.tournament_bracket_id = COALESCE(e.tournament_bracket_id, r.tournament_bracket_id)
             JOIN tournament_matches m ON m.generated_bracket_id = g.id AND m.status = 'completed'::text AND m.outcome_type IS NULL AND m.player_one_registration_id IS NOT NULL AND m.player_two_registration_id IS NOT NULL AND m.player_one_score IS NOT NULL AND m.player_two_score IS NOT NULL AND m.winner_registration_id IS NOT NULL AND (e.registration_id = m.player_one_registration_id OR e.registration_id = m.player_two_registration_id)
          WHERE NOT (EXISTS ( SELECT 1
                   FROM match_result_report_groups rg
                  WHERE rg.match_id = m.id AND rg.result_type = 'no_show'::text AND rg.finalized_at IS NOT NULL AND (rg.status = ANY (ARRAY['confirmed'::text, 'auto_approved'::text, 'approved'::text])) AND (rg.no_show_status = ANY (ARRAY['confirmed'::text, 'auto_confirmed'::text, 'approved'::text]))))
          GROUP BY e.season_id, e.player_id
        ), continued AS (
         SELECT s.season_id,
            s.player_id,
            s.bracket_type,
            s.total_points,
            s.tournaments_played,
            s.rounds_passed,
            s.tournament_wins,
            s.matches_played,
            s.matches_won,
            s.matches_lost,
            s.win_rate,
            s.last_tournament_id,
            s.last_tournament_points,
            s.current_rank,
            s.previous_rank,
            s.rank_movement,
            s.updated_at
           FROM leaderboard_player_season_stats s
             JOIN ironclad_private.legacy_main_pro_season_transition x ON x.season_id = s.season_id AND x.activated_at IS NOT NULL
          WHERE s.bracket_type = 'main'::text
        UNION ALL
         SELECT p.season_id,
            p.player_id,
            'pro'::text AS text,
            p.total_points,
            p.tournaments_played,
            p.rounds_passed,
            p.tournament_wins,
            COALESCE(m.matches_played, 0) AS "coalesce",
            COALESCE(m.matches_won, 0) AS "coalesce",
            GREATEST(COALESCE(m.matches_played, 0) - COALESCE(m.matches_won, 0), 0) AS "greatest",
                CASE
                    WHEN COALESCE(m.matches_played, 0) = 0 THEN 0::numeric
                    ELSE round(m.matches_won::numeric / m.matches_played::numeric * 100::numeric, 2)
                END::numeric(5,2) AS round,
            last.tournament_id,
            last.points,
            NULL::integer AS int4,
            NULL::integer AS int4,
            0,
            p.updated_at
           FROM pro_points p
             LEFT JOIN pro_matches m ON m.season_id = p.season_id AND m.player_id = p.player_id
             LEFT JOIN LATERAL ( SELECT e.tournament_id,
                    sum(e.points)::integer AS points
                   FROM pro_events e
                     JOIN tournaments t ON t.id = e.tournament_id
                  WHERE e.season_id = p.season_id AND e.player_id = p.player_id
                  GROUP BY e.tournament_id, t.first_completed_at, t.created_at
                  ORDER BY (COALESCE(t.first_completed_at, t.created_at)) DESC, e.tournament_id DESC
                 LIMIT 1) last ON true
        ), sums AS (
         SELECT continued.season_id,
            continued.player_id,
            'pro'::text AS bracket_type,
            sum(continued.total_points)::integer AS total_points,
            sum(continued.tournaments_played)::integer AS tournaments_played,
            sum(continued.rounds_passed)::integer AS rounds_passed,
            sum(continued.tournament_wins)::integer AS tournament_wins,
            sum(continued.matches_played)::integer AS matches_played,
            sum(continued.matches_won)::integer AS matches_won,
            sum(continued.matches_lost)::integer AS matches_lost,
                CASE
                    WHEN sum(continued.matches_played) = 0 THEN 0::numeric
                    ELSE round(sum(continued.matches_won)::numeric / sum(continued.matches_played)::numeric * 100::numeric, 2)
                END::numeric(5,2) AS win_rate,
            max(continued.updated_at) AS updated_at
           FROM continued
          GROUP BY continued.season_id, continued.player_id
        ), ranked AS (
         SELECT sums.season_id,
            sums.player_id,
            sums.bracket_type,
            sums.total_points,
            sums.tournaments_played,
            sums.rounds_passed,
            sums.tournament_wins,
            sums.matches_played,
            sums.matches_won,
            sums.matches_lost,
            sums.win_rate,
            sums.updated_at,
            rank() OVER (PARTITION BY sums.season_id ORDER BY sums.total_points DESC, sums.tournament_wins DESC, sums.rounds_passed DESC, (
                CASE
                    WHEN sums.matches_played = 0 THEN 0::numeric
                    ELSE sums.matches_won::numeric / sums.matches_played::numeric
                END) DESC, sums.matches_won DESC)::integer AS current_rank
           FROM sums
        )
 SELECT s.season_id,
    s.player_id,
    s.bracket_type,
    s.total_points,
    s.tournaments_played,
    s.rounds_passed,
    s.tournament_wins,
    s.matches_played,
    s.matches_won,
    s.matches_lost,
    s.win_rate,
    s.last_tournament_id,
    s.last_tournament_points,
    s.current_rank,
    s.previous_rank,
    s.rank_movement,
    s.updated_at
   FROM leaderboard_player_season_stats s
     JOIN leaderboard_seasons season ON season.id = s.season_id
  WHERE s.bracket_type = season.official_bracket_type AND NOT (EXISTS ( SELECT 1
           FROM ironclad_private.legacy_main_pro_season_transition x
          WHERE x.season_id = s.season_id AND x.activated_at IS NOT NULL))
UNION ALL
 SELECT ranked.season_id,
    ranked.player_id,
    ranked.bracket_type,
    ranked.total_points,
    ranked.tournaments_played,
    ranked.rounds_passed,
    ranked.tournament_wins,
    ranked.matches_played,
    ranked.matches_won,
    ranked.matches_lost,
    ranked.win_rate,
    last.last_tournament_id,
    last.last_tournament_points,
    ranked.current_rank,
        CASE
            WHEN NOT (EXISTS ( SELECT 1
               FROM continued c
              WHERE c.season_id = ranked.season_id AND c.player_id = ranked.player_id AND c.bracket_type = 'pro'::text)) THEN last.previous_rank
            ELSE NULL::integer
        END AS previous_rank,
        CASE
            WHEN NOT (EXISTS ( SELECT 1
               FROM continued c
              WHERE c.season_id = ranked.season_id AND c.player_id = ranked.player_id AND c.bracket_type = 'pro'::text)) THEN last.rank_movement
            ELSE 0
        END AS rank_movement,
    ranked.updated_at
   FROM ranked
     CROSS JOIN LATERAL ( SELECT c.last_tournament_id,
            c.last_tournament_points,
            c.previous_rank,
            c.rank_movement
           FROM continued c
             LEFT JOIN tournaments t ON t.id = c.last_tournament_id
          WHERE c.season_id = ranked.season_id AND c.player_id = ranked.player_id
          ORDER BY (COALESCE(t.first_completed_at, t.created_at)) DESC NULLS LAST, c.last_tournament_id DESC
         LIMIT 1) last;

create or replace view public.leaderboard_current_season
with (security_barrier = true, security_invoker = false) as
SELECT s.id,
        CASE
            WHEN x.activated_at IS NOT NULL THEN (s.year::text || ' Pro Season '::text) || s.season_number::text
            ELSE s.name
        END AS name,
    s.year,
    s.season_number,
    s.start_date,
    s.end_date,
    s.is_active,
    s.created_at,
    s.updated_at,
    ( SELECT count(*)::integer AS count
           FROM leaderboard_tournament_season_memberships m
             JOIN tournaments t ON t.id = m.tournament_id
          WHERE m.season_id = s.id AND m.qualifying_event_number IS NOT NULL AND m.scored_at IS NOT NULL AND m.voided_at IS NULL AND t.status = 'completed'::text AND t.first_completed_at IS NOT NULL) AS valid_main_event_count,
    s.finalized_at IS NOT NULL AS is_finalized,
    s.under_review_at IS NOT NULL AS is_under_review,
        CASE
            WHEN x.activated_at IS NOT NULL THEN 'pro'::text
            ELSE s.official_bracket_type
        END AS official_bracket_type,
    ( SELECT count(*)::integer AS count
           FROM leaderboard_tournament_season_memberships m
             JOIN tournaments t ON t.id = m.tournament_id
          WHERE m.season_id = s.id AND m.qualifying_event_number IS NOT NULL AND m.scored_at IS NOT NULL AND m.voided_at IS NULL AND t.status = 'completed'::text AND t.first_completed_at IS NOT NULL) AS valid_qualifying_event_count,
    x.activated_at IS NOT NULL AS has_legacy_main_transition
   FROM leaderboard_seasons s
     LEFT JOIN ironclad_private.legacy_main_pro_season_transition x ON x.season_id = s.id
  ORDER BY (
        CASE
            WHEN s.finalized_at IS NULL THEN 0
            ELSE 1
        END), (
        CASE
            WHEN s.finalized_at IS NULL THEN s.created_at
            ELSE NULL::timestamp with time zone
        END), s.finalized_at DESC NULLS LAST, s.created_at DESC
 LIMIT 1;

create or replace view public.leaderboard_public_season_standings
with (security_barrier = true, security_invoker = false) as
SELECT season_stats.season_id,
        CASE
            WHEN season_stats.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season.id AND x.activated_at IS NOT NULL)) THEN (season.year::text || ' Pro Season '::text) || season.season_number::text
            ELSE season.name
        END AS season_name,
    season.year,
    season.season_number,
    season.start_date,
    season.end_date,
        CASE
            WHEN player.account_closed_at IS NULL THEN season_stats.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.display_name
        END AS display_name,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.in_game_name
        END AS in_game_name,
        CASE
            WHEN player.account_closed_at IS NULL THEN player.country
            ELSE NULL::text
        END AS country,
        CASE
            WHEN player.account_closed_at IS NULL THEN player.region
            ELSE NULL::text
        END AS region,
        CASE
            WHEN player.account_closed_at IS NULL THEN player.current_elo
            ELSE NULL::integer
        END AS current_elo,
    player.account_closed_at IS NULL AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    season_stats.bracket_type,
    season_stats.total_points,
    season_stats.tournaments_played,
    season_stats.rounds_passed,
    season_stats.tournament_wins,
    season_stats.matches_played,
    season_stats.matches_won,
    season_stats.matches_lost,
    season_stats.win_rate,
        CASE
            WHEN player.account_closed_at IS NULL THEN season_stats.last_tournament_id
            ELSE NULL::uuid
        END AS last_tournament_id,
    last_tournament.title AS last_tournament_title,
    season_stats.last_tournament_points,
    season_stats.current_rank,
    season_stats.previous_rank,
    season_stats.rank_movement,
    season_stats.updated_at,
    row_number() OVER (PARTITION BY season_stats.season_id, season_stats.bracket_type ORDER BY season_stats.player_id) AS display_order,
        CASE
            WHEN season_stats.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season_stats.season_id AND x.tournament_id = season_stats.last_tournament_id AND x.activated_at IS NOT NULL)) THEN 'main'::text
            ELSE season_stats.bracket_type
        END AS last_tournament_bracket_type
   FROM ( SELECT s.season_id,
            s.player_id,
            s.bracket_type,
            s.total_points,
            s.tournaments_played,
            s.rounds_passed,
            s.tournament_wins,
            s.matches_played,
            s.matches_won,
            s.matches_lost,
            s.win_rate,
            s.last_tournament_id,
            s.last_tournament_points,
            s.current_rank,
            s.previous_rank,
            s.rank_movement,
            s.updated_at
           FROM leaderboard_player_season_stats s
          WHERE s.bracket_type <> 'pro'::text OR NOT (EXISTS ( SELECT 1
                   FROM ironclad_private.legacy_main_pro_season_transition x
                  WHERE x.season_id = s.season_id AND x.activated_at IS NOT NULL))
        UNION ALL
         SELECT official.season_id,
            official.player_id,
            official.bracket_type,
            official.total_points,
            official.tournaments_played,
            official.rounds_passed,
            official.tournament_wins,
            official.matches_played,
            official.matches_won,
            official.matches_lost,
            official.win_rate,
            official.last_tournament_id,
            official.last_tournament_points,
            official.current_rank,
            official.previous_rank,
            official.rank_movement,
            official.updated_at
           FROM ironclad_private.leaderboard_official_season_standings official
             JOIN ironclad_private.legacy_main_pro_season_transition x ON x.season_id = official.season_id AND x.activated_at IS NOT NULL) season_stats
     JOIN leaderboard_seasons season ON season.id = season_stats.season_id
     JOIN players player ON player.id = season_stats.player_id
     LEFT JOIN tournaments last_tournament ON last_tournament.id = season_stats.last_tournament_id;

CREATE OR REPLACE FUNCTION public.finalize_leaderboard_main_season_if_ready(p_season_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_event_count integer;
  v_next_season_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));
  select season.finalized_at,ironclad_private.leaderboard_official_season_role(season.id)
  into v_finalized_at,v_authority
  from public.leaderboard_seasons as season
  where season.id = p_season_id
  for update;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  if v_finalized_at is not null then return true; end if;
  if exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=p_season_id and x.activated_at is not null)
    and exists(select 1 from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
      where m.season_id=p_season_id and m.qualifying_event_number is not null and m.voided_at is null
        and ((m.qualifying_event_number=1 and not exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=m.season_id and x.tournament_id=m.tournament_id))
          or (m.qualifying_event_number>1 and (t.division_model_version<>'four_division_v1' or not exists(select 1 from public.tournament_brackets b where b.tournament_id=t.id and b.name='Pro' and b.launched_at is not null))))) then
    raise exception 'Invalid source in continued Pro season' using errcode='55000'; end if;
  select count(*)::integer
  into v_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = p_season_id
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  if exists(select 1 from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
    where m.season_id=p_season_id and m.qualifying_event_number is not null and m.voided_at is null
      and (t.status<>'completed' or t.first_completed_at is null)) then return false; end if;
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
    v_authority,
    season_stats.current_rank,
    season_stats.total_points
  from ironclad_private.leaderboard_official_season_standings as season_stats
  where season_stats.season_id = p_season_id
    and season_stats.bracket_type = v_authority
    and season_stats.current_rank between 1 and 3
  on conflict (season_id, player_id, bracket_type) do nothing;

  if v_finalized_at is null then
    update public.leaderboard_seasons
    set
      finalized_at = clock_timestamp(),
      is_active = false
    where id = p_season_id
      and finalized_at is null;
  end if;

  select public.get_or_create_leaderboard_season(current_date)
  into v_next_season_id;

  update public.leaderboard_seasons
  set is_active = true
  where id = v_next_season_id
    and finalized_at is null
    and not is_active;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION ironclad_private.guard_pro_season_badge_finalization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ begin
 if new.source_type='season' and exists(select 1 from public.leaderboard_seasons s where s.id=new.source_id and ironclad_private.leaderboard_official_season_role(s.id)='pro')
   and not exists(select 1 from public.leaderboard_seasons s where s.id=new.source_id and s.finalized_at is not null and s.under_review_at is null
     and (select count(*) from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
       where m.season_id=s.id and m.qualifying_event_number is not null and m.voided_at is null and m.scored_at is not null and t.status='completed')=6) then
   raise exception 'Pro season badge requires valid six-event finalization' using errcode='55000'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION ironclad_private.guard_pro_season_champion_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ begin
 if ironclad_private.leaderboard_official_season_role(new.season_id)='pro' then
   if new.bracket_type<>'pro' or
    (select count(*) from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
      where m.season_id=new.season_id and m.qualifying_event_number is not null and m.voided_at is null
        and m.scored_at is not null and t.status='completed' and t.first_completed_at is not null)<>6
    or not exists(select 1 from ironclad_private.leaderboard_official_season_standings s where s.season_id=new.season_id
      and s.player_id=new.player_id and s.bracket_type='pro' and s.current_rank=new.final_rank and s.total_points=new.final_points
      and s.current_rank between 1 and 3) then
     raise exception 'Pro champion snapshot requires six genuine events and exact official standings' using errcode='55000'; end if;
 end if;
 return new;
end $function$;

drop view public.leaderboard_public_season_event_impacts;
drop view ironclad_private.leaderboard_qualified_season_point_events;
drop view ironclad_private.leaderboard_qualified_season_events;

commit;
