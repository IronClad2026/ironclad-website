begin;

-- Public leaderboard reads must pass through the PostgreSQL-owned privacy
-- projections. Raw caches and operational rows carry stable player or actor
-- identifiers and private season-review facts that browser roles must not
-- retrieve directly.
revoke select on table
  public.leaderboard_seasons,
  public.leaderboard_point_events,
  public.leaderboard_player_season_stats,
  public.leaderboard_player_all_time_stats,
  public.leaderboard_season_champions,
  public.leaderboard_recalculation_runs
from public, anon, authenticated;

drop policy if exists "Public can read leaderboard seasons"
  on public.leaderboard_seasons;
drop policy if exists "Public can read leaderboard season stats"
  on public.leaderboard_player_season_stats;
drop policy if exists "Public can read leaderboard all time stats"
  on public.leaderboard_player_all_time_stats;
drop policy if exists "Public can read leaderboard season champions"
  on public.leaderboard_season_champions;

-- No current browser path reads raw point events. This inherited policy still
-- combined with an authenticated SELECT grant, unlike the other raw tables.
drop policy if exists "Admins can manage leaderboard point events"
  on public.leaderboard_point_events;

commit;
