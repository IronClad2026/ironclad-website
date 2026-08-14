begin;

-- Leaderboard caches and recalculation audit rows are mutated only by the
-- trusted recalculation functions and the Clerk-authorized server admin path.
-- The foundation's authenticated grants and FOR ALL policies accidentally
-- left a direct browser-admin write path around that authority boundary.
revoke insert, update, delete
  on table public.leaderboard_player_all_time_stats
  from authenticated;

revoke select, insert, update, delete
  on table public.leaderboard_recalculation_runs
  from authenticated;

drop policy if exists "Admins can manage leaderboard all time stats"
  on public.leaderboard_player_all_time_stats;

drop policy if exists "Admins can manage leaderboard recalculation runs"
  on public.leaderboard_recalculation_runs;

commit;
