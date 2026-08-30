begin;

grant select
on table public.leaderboard_tournament_season_memberships
to service_role;

commit;
