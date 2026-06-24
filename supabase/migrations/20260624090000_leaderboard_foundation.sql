begin;

create table if not exists public.leaderboard_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  season_number integer not null check (season_number in (1, 2)),
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_seasons_year_season_unique
    unique (year, season_number),
  constraint leaderboard_seasons_date_order_check
    check (start_date <= end_date),
  constraint leaderboard_seasons_calendar_window_check
    check (
      (
        season_number = 1
        and start_date = make_date(year, 1, 1)
        and end_date = make_date(year, 6, 30)
      )
      or (
        season_number = 2
        and start_date = make_date(year, 7, 1)
        and end_date = make_date(year, 12, 31)
      )
    )
);

create unique index if not exists leaderboard_seasons_one_active_idx
  on public.leaderboard_seasons(is_active)
  where is_active;

drop trigger if exists leaderboard_seasons_set_updated_at
  on public.leaderboard_seasons;
create trigger leaderboard_seasons_set_updated_at
before update on public.leaderboard_seasons
for each row execute function public.ironclad_set_updated_at();

create table if not exists public.leaderboard_point_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.leaderboard_seasons(id) on delete cascade,
  tournament_id uuid
    references public.tournaments(id) on delete cascade,
  tournament_bracket_id uuid
    references public.tournament_brackets(id) on delete set null,
  registration_id uuid
    references public.registrations(id) on delete set null,
  player_id uuid not null
    references public.players(id) on delete cascade,
  bracket_type text not null,
  points integer not null,
  event_type text not null,
  description text,
  source text not null default 'system',
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  constraint leaderboard_point_events_bracket_type_check
    check (bracket_type in ('main', 'challenge', 'overall')),
  constraint leaderboard_point_events_event_type_check
    check (
      event_type in (
        'participation',
        'round_passed',
        'tournament_win',
        'missing_tournament_bonus',
        'participation_withheld',
        'no_show_penalty',
        'admin_adjustment'
      )
    ),
  constraint leaderboard_point_events_source_check
    check (source in ('system', 'admin', 'recalculation'))
);

create index if not exists leaderboard_point_events_season_idx
  on public.leaderboard_point_events(season_id);
create index if not exists leaderboard_point_events_player_idx
  on public.leaderboard_point_events(player_id);
create index if not exists leaderboard_point_events_tournament_idx
  on public.leaderboard_point_events(tournament_id);
create index if not exists leaderboard_point_events_tournament_bracket_idx
  on public.leaderboard_point_events(tournament_bracket_id);
create index if not exists leaderboard_point_events_event_type_idx
  on public.leaderboard_point_events(event_type);

create table if not exists public.leaderboard_player_season_stats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.leaderboard_seasons(id) on delete cascade,
  player_id uuid not null
    references public.players(id) on delete cascade,
  bracket_type text not null,
  total_points integer not null default 0,
  tournaments_played integer not null default 0,
  rounds_passed integer not null default 0,
  tournament_wins integer not null default 0,
  matches_played integer not null default 0,
  matches_won integer not null default 0,
  matches_lost integer not null default 0,
  win_rate numeric(5, 2) not null default 0,
  last_tournament_id uuid
    references public.tournaments(id) on delete set null,
  last_tournament_points integer not null default 0,
  current_rank integer,
  previous_rank integer,
  rank_movement integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint leaderboard_player_season_stats_unique
    unique (season_id, player_id, bracket_type),
  constraint leaderboard_player_season_stats_bracket_type_check
    check (bracket_type in ('main', 'challenge', 'overall')),
  constraint leaderboard_player_season_stats_counts_check
    check (
      tournaments_played >= 0
      and rounds_passed >= 0
      and tournament_wins >= 0
      and matches_played >= 0
      and matches_won >= 0
      and matches_lost >= 0
    ),
  constraint leaderboard_player_season_stats_win_rate_check
    check (win_rate >= 0 and win_rate <= 100),
  constraint leaderboard_player_season_stats_rank_check
    check (
      (current_rank is null or current_rank > 0)
      and (previous_rank is null or previous_rank > 0)
    )
);

create index if not exists leaderboard_player_season_stats_rank_idx
  on public.leaderboard_player_season_stats(
    season_id,
    bracket_type,
    total_points desc
  );
create index if not exists leaderboard_player_season_stats_player_idx
  on public.leaderboard_player_season_stats(player_id);

drop trigger if exists leaderboard_player_season_stats_set_updated_at
  on public.leaderboard_player_season_stats;
create trigger leaderboard_player_season_stats_set_updated_at
before update on public.leaderboard_player_season_stats
for each row execute function public.ironclad_set_updated_at();

create table if not exists public.leaderboard_player_all_time_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players(id) on delete cascade,
  bracket_type text not null,
  total_points integer not null default 0,
  tournaments_played integer not null default 0,
  rounds_passed integer not null default 0,
  tournament_wins integer not null default 0,
  matches_played integer not null default 0,
  matches_won integer not null default 0,
  matches_lost integer not null default 0,
  win_rate numeric(5, 2) not null default 0,
  best_season_rank integer,
  last_active_season_id uuid
    references public.leaderboard_seasons(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint leaderboard_player_all_time_stats_unique
    unique (player_id, bracket_type),
  constraint leaderboard_player_all_time_stats_bracket_type_check
    check (bracket_type in ('main', 'challenge', 'overall')),
  constraint leaderboard_player_all_time_stats_counts_check
    check (
      tournaments_played >= 0
      and rounds_passed >= 0
      and tournament_wins >= 0
      and matches_played >= 0
      and matches_won >= 0
      and matches_lost >= 0
    ),
  constraint leaderboard_player_all_time_stats_win_rate_check
    check (win_rate >= 0 and win_rate <= 100),
  constraint leaderboard_player_all_time_stats_best_rank_check
    check (best_season_rank is null or best_season_rank > 0)
);

create index if not exists leaderboard_player_all_time_stats_rank_idx
  on public.leaderboard_player_all_time_stats(
    bracket_type,
    total_points desc
  );

drop trigger if exists leaderboard_player_all_time_stats_set_updated_at
  on public.leaderboard_player_all_time_stats;
create trigger leaderboard_player_all_time_stats_set_updated_at
before update on public.leaderboard_player_all_time_stats
for each row execute function public.ironclad_set_updated_at();

create table if not exists public.leaderboard_season_champions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.leaderboard_seasons(id) on delete cascade,
  player_id uuid not null
    references public.players(id) on delete cascade,
  bracket_type text not null,
  final_rank integer not null,
  final_points integer not null,
  created_at timestamptz not null default now(),
  constraint leaderboard_season_champions_unique
    unique (season_id, player_id, bracket_type),
  constraint leaderboard_season_champions_bracket_type_check
    check (bracket_type in ('main', 'challenge', 'overall')),
  constraint leaderboard_season_champions_final_rank_check
    check (final_rank > 0)
);

create index if not exists leaderboard_season_champions_season_bracket_idx
  on public.leaderboard_season_champions(season_id, bracket_type);

create table if not exists public.leaderboard_recalculation_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid
    references public.tournaments(id) on delete set null,
  season_id uuid
    references public.leaderboard_seasons(id) on delete set null,
  scope text not null,
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by_clerk_user_id text,
  notes text,
  constraint leaderboard_recalculation_runs_scope_check
    check (scope in ('tournament', 'season', 'all_time')),
  constraint leaderboard_recalculation_runs_status_check
    check (status in ('pending', 'completed', 'failed')),
  constraint leaderboard_recalculation_runs_finished_at_check
    check (finished_at is null or finished_at >= started_at)
);

create index if not exists leaderboard_recalculation_runs_tournament_idx
  on public.leaderboard_recalculation_runs(tournament_id);
create index if not exists leaderboard_recalculation_runs_season_idx
  on public.leaderboard_recalculation_runs(season_id);
create index if not exists leaderboard_recalculation_runs_scope_status_idx
  on public.leaderboard_recalculation_runs(scope, status);

alter table public.leaderboard_seasons enable row level security;
alter table public.leaderboard_point_events enable row level security;
alter table public.leaderboard_player_season_stats enable row level security;
alter table public.leaderboard_player_all_time_stats enable row level security;
alter table public.leaderboard_season_champions enable row level security;
alter table public.leaderboard_recalculation_runs enable row level security;

revoke all on public.leaderboard_seasons from public, anon, authenticated;
revoke all on public.leaderboard_point_events from public, anon, authenticated;
revoke all on public.leaderboard_player_season_stats from public, anon, authenticated;
revoke all on public.leaderboard_player_all_time_stats from public, anon, authenticated;
revoke all on public.leaderboard_season_champions from public, anon, authenticated;
revoke all on public.leaderboard_recalculation_runs from public, anon, authenticated;

grant select on public.leaderboard_seasons to anon, authenticated;
grant select on public.leaderboard_player_season_stats to anon, authenticated;
grant select on public.leaderboard_player_all_time_stats to anon, authenticated;
grant select on public.leaderboard_season_champions to anon, authenticated;

grant select, insert, update, delete
  on public.leaderboard_seasons,
     public.leaderboard_point_events,
     public.leaderboard_player_season_stats,
     public.leaderboard_player_all_time_stats,
     public.leaderboard_season_champions,
     public.leaderboard_recalculation_runs
  to authenticated;

grant all
  on public.leaderboard_seasons,
     public.leaderboard_point_events,
     public.leaderboard_player_season_stats,
     public.leaderboard_player_all_time_stats,
     public.leaderboard_season_champions,
     public.leaderboard_recalculation_runs
  to service_role;

drop policy if exists "Public can read leaderboard seasons"
  on public.leaderboard_seasons;
create policy "Public can read leaderboard seasons"
on public.leaderboard_seasons
for select to anon, authenticated
using (true);

drop policy if exists "Admins can manage leaderboard seasons"
  on public.leaderboard_seasons;
create policy "Admins can manage leaderboard seasons"
on public.leaderboard_seasons
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop policy if exists "Admins can manage leaderboard point events"
  on public.leaderboard_point_events;
create policy "Admins can manage leaderboard point events"
on public.leaderboard_point_events
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop policy if exists "Public can read leaderboard season stats"
  on public.leaderboard_player_season_stats;
create policy "Public can read leaderboard season stats"
on public.leaderboard_player_season_stats
for select to anon, authenticated
using (true);

drop policy if exists "Admins can manage leaderboard season stats"
  on public.leaderboard_player_season_stats;
create policy "Admins can manage leaderboard season stats"
on public.leaderboard_player_season_stats
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop policy if exists "Public can read leaderboard all time stats"
  on public.leaderboard_player_all_time_stats;
create policy "Public can read leaderboard all time stats"
on public.leaderboard_player_all_time_stats
for select to anon, authenticated
using (true);

drop policy if exists "Admins can manage leaderboard all time stats"
  on public.leaderboard_player_all_time_stats;
create policy "Admins can manage leaderboard all time stats"
on public.leaderboard_player_all_time_stats
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop policy if exists "Public can read leaderboard season champions"
  on public.leaderboard_season_champions;
create policy "Public can read leaderboard season champions"
on public.leaderboard_season_champions
for select to anon, authenticated
using (true);

drop policy if exists "Admins can manage leaderboard season champions"
  on public.leaderboard_season_champions;
create policy "Admins can manage leaderboard season champions"
on public.leaderboard_season_champions
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop policy if exists "Admins can manage leaderboard recalculation runs"
  on public.leaderboard_recalculation_runs;
create policy "Admins can manage leaderboard recalculation runs"
on public.leaderboard_recalculation_runs
for all to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

drop view if exists public.leaderboard_current_season;
create view public.leaderboard_current_season
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
  season.updated_at
from public.leaderboard_seasons as season
where season.is_active = true
order by season.start_date desc
limit 1;

drop view if exists public.leaderboard_public_season_standings;
create view public.leaderboard_public_season_standings
with (security_barrier = true)
as
select
  season_stats.season_id,
  season.name as season_name,
  season.year,
  season.season_number,
  season.start_date,
  season.end_date,
  season_stats.player_id,
  player.display_name,
  player.player_name as in_game_name,
  player.country,
  player.region,
  player.current_elo,
  player.has_avatar,
  player.avatar_url,
  season_stats.bracket_type,
  season_stats.total_points,
  season_stats.tournaments_played,
  season_stats.rounds_passed,
  season_stats.tournament_wins,
  season_stats.matches_played,
  season_stats.matches_won,
  season_stats.matches_lost,
  season_stats.win_rate,
  season_stats.last_tournament_id,
  last_tournament.title as last_tournament_title,
  season_stats.last_tournament_points,
  season_stats.current_rank,
  season_stats.previous_rank,
  season_stats.rank_movement,
  season_stats.updated_at
from public.leaderboard_player_season_stats as season_stats
join public.leaderboard_seasons as season
  on season.id = season_stats.season_id
join public.public_player_profiles as player
  on player.id = season_stats.player_id
left join public.tournaments as last_tournament
  on last_tournament.id = season_stats.last_tournament_id;

drop view if exists public.leaderboard_public_all_time_standings;
create view public.leaderboard_public_all_time_standings
with (security_barrier = true)
as
select
  all_time.player_id,
  player.display_name,
  player.player_name as in_game_name,
  player.country,
  player.region,
  player.current_elo,
  player.has_avatar,
  player.avatar_url,
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
  all_time.updated_at
from public.leaderboard_player_all_time_stats as all_time
join public.public_player_profiles as player
  on player.id = all_time.player_id
left join public.leaderboard_seasons as season
  on season.id = all_time.last_active_season_id;

revoke all on public.leaderboard_current_season from public;
revoke all on public.leaderboard_public_season_standings from public;
revoke all on public.leaderboard_public_all_time_standings from public;

grant select on public.leaderboard_current_season to anon, authenticated;
grant select on public.leaderboard_public_season_standings to anon, authenticated;
grant select on public.leaderboard_public_all_time_standings to anon, authenticated;

comment on table public.leaderboard_seasons is
  'IronClad leaderboard seasons. Two fixed calendar seasons are supported per year.';
comment on table public.leaderboard_point_events is
  'Admin-only raw point events used to calculate leaderboard totals. No historical tournament points are backfilled by this migration.';
comment on table public.leaderboard_player_season_stats is
  'Cached per-season leaderboard totals for public display.';
comment on table public.leaderboard_player_all_time_stats is
  'Cached all-time leaderboard totals for public display.';
comment on table public.leaderboard_season_champions is
  'Archived final season winners.';
comment on table public.leaderboard_recalculation_runs is
  'Admin-only audit trail for leaderboard recalculation jobs.';
comment on column public.leaderboard_public_season_standings.avatar_url is
  'Intentionally null because raw player avatar storage paths can expose Clerk user IDs. Use the app avatar proxy keyed by player_id.';
comment on column public.leaderboard_public_all_time_standings.avatar_url is
  'Intentionally null because raw player avatar storage paths can expose Clerk user IDs. Use the app avatar proxy keyed by player_id.';

commit;
