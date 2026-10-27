-- Public competitive identity is mandatory for active accounts.
-- DDL only: no player/competition/registration/identity rows are changed.
-- Existing owner-rights allowlists, closure masks, grants and raw-table denial stay intact.
-- Explicit variants preserve the existing Production Main/Pro bridge and older Staging source.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_catalog;

-- Fail closed on unreviewed catalog drift. CREATE OR REPLACE retains each view OID/owner/ACL.
do $preconditions$
declare expected record; actual record;
begin
  for expected in select * from (values
    ('leaderboard_public_all_time_standings', array['9de9de3df35a8a91e113df6e6379196f', 'a3edad90e789fd680d963440c9c21333']::text[]),
    ('leaderboard_public_season_champions', array['2f2fb55ab9b6875016ea742aa0f8223d', 'ab479b90424ae6b665c015db159a00f4', '036ab7f9943a4f74651e76b6e5b2e6a9', '4ccaf3c9e241d120263bb3e4caa67561']::text[]),
    ('leaderboard_public_season_standings', array['47e8afe97565e1e627935bbc09c972a5', 'e698efcf08a2c962f6f31de907108dd6', '1407bbe0100b5f7087618d7b90d65b16', '55069c88ef25c6536313f8bed7c62c16']::text[]),
    ('public_player_profiles', array['2209e8298655e42a1235ca39bd4c2b57', '88a38eb4106336a67c7dc9219b550351']::text[]),
    ('public_player_showcases', array['842a1336d50f2946037c58a11eb476c3', '517ba2f57d97aba850a6db596ac5b9d4']::text[])
  ) as reviewed(name, definitions) loop
    select c.relkind, c.relowner, c.reloptions, pg_get_viewdef(c.oid, true) as definition
      into actual from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=expected.name;
    if not found or actual.relkind <> 'v' or pg_get_userbyid(actual.relowner) <> 'postgres'
      or not coalesce(actual.reloptions @> array['security_barrier=true','security_invoker=false'], false)
      or not (md5(replace(actual.definition, chr(13), '')) = any(expected.definitions)) then
      raise exception 'Public profile projection precondition failed for %', expected.name;
    end if;
  end loop;
  if (to_regclass('ironclad_private.legacy_main_pro_season_transition') is null)
    <> (to_regclass('ironclad_private.leaderboard_official_season_standings') is null) then
    raise exception 'Incomplete leaderboard bridge; refusing to change public projections';
  end if;
end;
$preconditions$;

create or replace view public.leaderboard_public_all_time_standings
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN player.account_closed_at IS NULL THEN all_time.player_id
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
    all_time.bracket_type,
    all_time.total_points,
    all_time.tournaments_played,
    all_time.rounds_passed,
    all_time.tournament_wins,
    all_time.matches_played,
    all_time.matches_won,
    all_time.matches_lost,
    all_time.win_rate,
    all_time.best_season_rank,
    all_time.last_active_season_id,
    season.name AS last_active_season_name,
    season.year AS last_active_season_year,
    season.season_number AS last_active_season_number,
    all_time.updated_at,
    row_number() OVER (PARTITION BY all_time.bracket_type ORDER BY all_time.player_id) AS display_order
   FROM leaderboard_player_all_time_stats all_time
     JOIN players player ON player.id = all_time.player_id
     LEFT JOIN leaderboard_seasons season ON season.id = all_time.last_active_season_id;

create or replace view public.public_player_profiles
with (security_barrier = true, security_invoker = false) as
 SELECT id,
    display_name,
    in_game_name AS player_name,
    country,
    region,
    current_elo,
    public_profile_enabled,
    discord_public_enabled,
        CASE
            WHEN discord_public_enabled THEN discord_username
            ELSE NULL::text
        END AS discord_username,
    avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    created_at
   FROM players player
  WHERE account_closed_at IS NULL;

create or replace view public.public_player_showcases
with (security_barrier = true, security_invoker = false) as
 SELECT showcase.player_id,
        CASE
            WHEN showcase.thought_hidden_at IS NULL THEN showcase.current_thought
            ELSE NULL::text
        END AS current_thought,
    award.badge_slug AS featured_badge_slug,
        CASE
            WHEN isfinite(award.unlocked_at) THEN award.unlocked_at
            ELSE NULL::timestamp with time zone
        END AS featured_badge_unlocked_at
   FROM player_showcases showcase
     JOIN players player ON player.id = showcase.player_id
     LEFT JOIN player_badge_awards award ON award.id = showcase.featured_badge_award_id AND award.player_id = showcase.player_id AND (award.badge_slug = ANY (ARRAY['ironclad-recruit'::text, 'first-deployment'::text, 'first-victory'::text, 'battle-tested'::text, 'rising-through-the-ranks'::text, 'first-campaign'::text, 'iron-regular'::text, 'tournament-veteran'::text, 'season-campaigner'::text, 'reliable-competitor'::text, 'five-victories'::text, 'ten-victories'::text, 'twenty-five-victories'::text, 'iron-streak'::text, 'unbroken'::text, 'clean-sweep'::text, 'comeback-commander'::text, 'giant-slayer'::text, 'giant-hunter'::text, 'flawless-campaign'::text, 'first-advance'::text, 'semifinalist'::text, 'finalist'::text, 'academy-champion'::text, 'challenge-champion'::text, 'elite-champion'::text, 'double-champion'::text, 'triple-crown'::text, 'season-podium'::text, 'season-champion'::text]))
  WHERE player_showcase_enabled() AND player.account_closed_at IS NULL;

do $projection$
begin
  if to_regclass('ironclad_private.legacy_main_pro_season_transition') is not null then
    execute $view$
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
    $view$;
  else
    execute $view$
create or replace view public.leaderboard_public_season_standings
with (security_barrier = true, security_invoker = false) as
 SELECT season_stats.season_id,
    season.name AS season_name,
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
    row_number() OVER (PARTITION BY season_stats.season_id, season_stats.bracket_type ORDER BY season_stats.player_id) AS display_order
   FROM leaderboard_player_season_stats season_stats
     JOIN leaderboard_seasons season ON season.id = season_stats.season_id
     JOIN players player ON player.id = season_stats.player_id
     LEFT JOIN tournaments last_tournament ON last_tournament.id = season_stats.last_tournament_id;
    $view$;
  end if;
end;
$projection$;

do $projection$
begin
  if to_regclass('ironclad_private.legacy_main_pro_season_transition') is not null then
    execute $view$
create or replace view public.leaderboard_public_season_champions
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN player.account_closed_at IS NULL THEN champion.id::text
            ELSE 'private-champion:'::text || md5(champion.id::text)
        END AS id,
    champion.season_id,
        CASE
            WHEN champion.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season.id AND x.activated_at IS NOT NULL)) THEN (season.year::text || ' Pro Season '::text) || season.season_number::text
            ELSE season.name
        END AS season_name,
    champion.bracket_type,
        CASE
            WHEN player.account_closed_at IS NULL THEN champion.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.in_game_name
        END AS player_name,
        CASE
            WHEN player.account_closed_at IS NULL THEN player.country
            ELSE NULL::text
        END AS country,
    player.account_closed_at IS NULL AND player.avatar_url IS NOT NULL AS has_avatar,
    champion.final_rank,
    champion.final_points,
    champion.created_at
   FROM leaderboard_season_champions champion
     JOIN leaderboard_seasons season ON season.id = champion.season_id
     JOIN players player ON player.id = champion.player_id;
    $view$;
  else
    execute $view$
create or replace view public.leaderboard_public_season_champions
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN player.account_closed_at IS NULL THEN champion.id::text
            ELSE 'private-champion:'::text || md5(champion.id::text)
        END AS id,
    champion.season_id,
    season.name AS season_name,
    champion.bracket_type,
        CASE
            WHEN player.account_closed_at IS NULL THEN champion.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.in_game_name
        END AS player_name,
        CASE
            WHEN player.account_closed_at IS NULL THEN player.country
            ELSE NULL::text
        END AS country,
    player.account_closed_at IS NULL AND player.avatar_url IS NOT NULL AS has_avatar,
    champion.final_rank,
    champion.final_points,
    champion.created_at
   FROM leaderboard_season_champions champion
     JOIN leaderboard_seasons season ON season.id = champion.season_id
     JOIN players player ON player.id = champion.player_id;
    $view$;
  end if;
end;
$projection$;

comment on view public.public_player_profiles is
  'Public competitive allowlist for every active player; legacy profile preference is retained only for rollback compatibility. Closed accounts are excluded. Discord remains independently optional.';
comment on column public.public_player_profiles.has_avatar is
  'True when an active public player has an avatar available through the player-ID proxy.';

-- Only these two existing read helpers change. Their OIDs, owners and ACLs are retained.
do $read_helpers$
declare expected record; actual record;
begin
  for expected in select * from (values
    ('ironclad_private.combat_highlight_state(uuid)', array['7056828e3457ab6e67743f69206009b4','eb7cfc95ea70bc4b1efd81b5d82dc089']::text[]),
    ('public.can_read_public_player_combat_highlight(uuid)', array['db77fc883de58813c8d7002fc3e63fca','f5edcdb1fb3f8dc2d03bf3a834e3ee65']::text[])
  ) as reviewed(identity, definitions) loop
    select p.proowner, p.prosecdef, p.provolatile, p.proconfig, pg_get_functiondef(p.oid) as definition
      into actual from pg_proc p where p.oid=to_regprocedure(expected.identity);
    if not found or pg_get_userbyid(actual.proowner) <> 'postgres'
      or actual.prosecdef is distinct from true or actual.provolatile <> 's'
      or actual.proconfig is distinct from array['search_path=pg_catalog']::text[]
      or not (md5(replace(actual.definition, chr(13), '')) = any(expected.definitions)) then
      raise exception 'Combat Highlights read-helper precondition failed for %', expected.identity;
    end if;
  end loop;
end;
$read_helpers$;

CREATE OR REPLACE FUNCTION ironclad_private.combat_highlight_state(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'playerId',p.id,'enabled',public.player_combat_highlights_enabled(),
    'slots',(select jsonb_agg(jsonb_build_object(
      'slotNumber',n,'displayOrder',coalesce(s.display_order,n),
      'revision',coalesce(s.revision,0),'hidden',s.hidden_at is not null,
      'clip',case when u.state='ready' then jsonb_build_object(
        'uploadId',u.id,'title',coalesce(u.title,''),
        'durationMs',(u.verified->>'durationMs')::integer,
        'width',(u.verified->>'width')::integer,'height',(u.verified->>'height')::integer,
        'fps',(u.verified->>'fps')::numeric,'contentType',u.content_type,
        'hasPoster',(u.verified->>'hasPoster')::boolean) else null end,
      'pendingUploadId',s.pending_upload_id
    ) order by coalesce(s.display_order,n))
    from generate_series(1,3) n
    left join public.player_combat_highlight_slots s on s.player_id=p.id and s.slot_number=n
    left join ironclad_private.player_combat_highlight_uploads u
      on u.id=s.current_upload_id and u.player_id=p.id and u.slot_number=s.slot_number)
  ) from public.players p where p.id=p_player_id and p.account_closed_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_public_player_combat_highlight(p_upload_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select public.player_combat_highlights_enabled() and exists (
    select 1 from ironclad_private.player_combat_highlight_uploads u
    join public.player_combat_highlight_slots s on s.player_id=u.player_id
      and s.slot_number=u.slot_number and s.current_upload_id=u.id
    join public.players p on p.id=s.player_id
    where u.id=p_upload_id and u.state='ready' and u.verified is not null
      and s.hidden_at is null and p.account_closed_at is null
  );
$function$
;

commit;
