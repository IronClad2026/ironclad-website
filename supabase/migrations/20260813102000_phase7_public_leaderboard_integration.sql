begin;

-- The public rankings page needs one featured Main/Pro season without reading
-- private season or membership tables. Prefer an unfinished season (including
-- the brief 6/6 finalization-pending boundary); otherwise show the latest
-- finalized season. Only public-safe state is projected.
create or replace view public.leaderboard_current_season
with (security_barrier = true)
as
select
  season.id,
  season.name,
  season.year,
  season.season_number,
  season.start_date,
  season.end_date,
  season.is_active,
  season.created_at,
  season.updated_at,
  (
    select count(*)::integer
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = season.id
      and membership.qualifying_event_number is not null
      and membership.voided_at is null
  ) as valid_main_event_count,
  season.finalized_at is not null as is_finalized,
  season.under_review_at is not null as is_under_review
from public.leaderboard_seasons as season
order by
  case when season.finalized_at is null then 0 else 1 end,
  case
    when season.finalized_at is null then season.created_at
    else null
  end asc nulls last,
  season.finalized_at desc nulls last,
  season.created_at desc
limit 1;

-- Official standings include active competitors even when their optional
-- public profile is disabled. Opted-out competitors retain only their factual
-- in-game competition identity; both opted-out and closed rows use a null
-- public player id so the browser cannot form a profile or avatar link.
create or replace view public.leaderboard_public_season_standings
with (security_barrier = true)
as
select
  season_stats.season_id,
  season.name as season_name,
  season.year,
  season.season_number,
  season.start_date,
  season.end_date,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then season_stats.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is not null then 'Former Competitor'
    when player.public_profile_enabled then player.display_name
    else player.in_game_name
  end as display_name,
  case
    when player.account_closed_at is not null then 'Former Competitor'
    else player.in_game_name
  end as in_game_name,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.country
    else null
  end as country,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.region
    else null
  end as region,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.current_elo
    else null
  end as current_elo,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  null::text as avatar_url,
  season_stats.bracket_type,
  season_stats.total_points,
  season_stats.tournaments_played,
  season_stats.rounds_passed,
  season_stats.tournament_wins,
  season_stats.matches_played,
  season_stats.matches_won,
  season_stats.matches_lost,
  season_stats.win_rate,
  case
    when player.account_closed_at is null then season_stats.last_tournament_id
    else null::uuid
  end as last_tournament_id,
  last_tournament.title as last_tournament_title,
  season_stats.last_tournament_points,
  season_stats.current_rank,
  season_stats.previous_rank,
  season_stats.rank_movement,
  season_stats.updated_at,
  row_number() over (
    partition by season_stats.season_id, season_stats.bracket_type
    order by season_stats.player_id
  ) as display_order
from public.leaderboard_player_season_stats as season_stats
join public.leaderboard_seasons as season
  on season.id = season_stats.season_id
join public.players as player
  on player.id = season_stats.player_id
left join public.tournaments as last_tournament
  on last_tournament.id = season_stats.last_tournament_id;

create or replace view public.leaderboard_public_all_time_standings
with (security_barrier = true)
as
select
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then all_time.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is not null then 'Former Competitor'
    when player.public_profile_enabled then player.display_name
    else player.in_game_name
  end as display_name,
  case
    when player.account_closed_at is not null then 'Former Competitor'
    else player.in_game_name
  end as in_game_name,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.country
    else null
  end as country,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.region
    else null
  end as region,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.current_elo
    else null
  end as current_elo,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  null::text as avatar_url,
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
  season.name as last_active_season_name,
  season.year as last_active_season_year,
  season.season_number as last_active_season_number,
  all_time.updated_at,
  row_number() over (
    partition by all_time.bracket_type
    order by all_time.player_id
  ) as display_order
from public.leaderboard_player_all_time_stats as all_time
join public.players as player
  on player.id = all_time.player_id
left join public.leaderboard_seasons as season
  on season.id = all_time.last_active_season_id;

create or replace view public.leaderboard_public_season_champions
with (security_barrier = true)
as
select
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then champion.id::text
    else 'private-champion:' || md5(champion.id::text)
  end as id,
  champion.season_id,
  season.name as season_name,
  champion.bracket_type,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then champion.player_id
    else null::uuid
  end as player_id,
  case
    when player.account_closed_at is not null then 'Former Competitor'
    else player.in_game_name
  end as player_name,
  case
    when player.account_closed_at is null
      and player.public_profile_enabled then player.country
    else null
  end as country,
  player.account_closed_at is null
    and player.public_profile_enabled
    and player.avatar_url is not null as has_avatar,
  champion.final_rank,
  champion.final_points,
  champion.created_at
from public.leaderboard_season_champions as champion
join public.leaderboard_seasons as season
  on season.id = champion.season_id
join public.players as player
  on player.id = champion.player_id;

alter view public.leaderboard_current_season owner to postgres;
alter view public.leaderboard_public_season_standings owner to postgres;
alter view public.leaderboard_public_all_time_standings owner to postgres;
alter view public.leaderboard_public_season_champions owner to postgres;

alter view public.leaderboard_current_season
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_season_standings
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_all_time_standings
  set (security_barrier = true, security_invoker = false);
alter view public.leaderboard_public_season_champions
  set (security_barrier = true, security_invoker = false);

revoke all privileges on table
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings,
  public.leaderboard_public_season_champions
from public, anon, authenticated, service_role;

grant select on table
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings,
  public.leaderboard_public_season_champions
to anon, authenticated, service_role;

comment on view public.leaderboard_current_season is
  'Public-safe featured Main/Pro season: an unfinished season first, otherwise the latest finalized season, with factual valid-event progress.';
comment on view public.leaderboard_public_season_standings is
  'Public-safe official season standings. Active opted-out and closed competitors retain factual standings without public profile identifiers.';
comment on view public.leaderboard_public_all_time_standings is
  'Public-safe permanent Career standings with profile identity available only for active opted-in competitors.';
comment on view public.leaderboard_public_season_champions is
  'Public-safe frozen champion archive with pseudonymous identities for opted-out and closed competitors.';

commit;
