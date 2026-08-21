begin;

create table public.player_badge_awards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players(id) on delete cascade,
  badge_slug text not null,
  source_type text not null,
  source_id uuid,
  source_metadata jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz not null default clock_timestamp(),
  original_unlocked_at timestamptz,
  standard_reveal_seen_at timestamptz,
  premium_reveal_seen_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint player_badge_awards_badge_slug_check
    check (
      badge_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(badge_slug) between 1 and 80
    ),
  constraint player_badge_awards_source_type_check
    check (
      source_type in (
        'profile',
        'match',
        'tournament',
        'season',
        'backfill',
        'admin_correction'
      )
    ),
  constraint player_badge_awards_source_metadata_object_check
    check (jsonb_typeof(source_metadata) = 'object')
);

create unique index player_badge_awards_player_badge_key
  on public.player_badge_awards(player_id, badge_slug);

create index player_badge_awards_player_unlocked_idx
  on public.player_badge_awards(player_id, unlocked_at desc, id desc);

create index player_badge_awards_source_idx
  on public.player_badge_awards(source_type, source_id)
  where source_id is not null;

alter table public.player_badge_awards enable row level security;
alter table public.player_badge_awards force row level security;

revoke all on table public.player_badge_awards
  from public, anon, authenticated, service_role;

grant select on table public.player_badge_awards to authenticated;
grant all privileges on table public.player_badge_awards to service_role;

drop policy if exists "Players can read their own badge awards"
  on public.player_badge_awards;
create policy "Players can read their own badge awards"
on public.player_badge_awards
for select
to authenticated
using (
  exists (
    select 1
    from public.players as player
    where player.id = player_badge_awards.player_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create function public.get_player_badge_match_participants(
  p_match_id uuid
)
returns table (
  player_id uuid,
  registration_id uuid,
  match_id uuid,
  is_winner boolean,
  original_unlocked_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with selected_match as (
    select
      tournament_match.id,
      tournament_match.player_one_registration_id,
      tournament_match.player_two_registration_id,
      tournament_match.winner_registration_id,
      coalesce(
        tournament_match.official_result_decided_at,
        tournament_match.updated_at
      ) as decided_at
    from public.tournament_matches as tournament_match
    join public.generated_brackets as generated
      on generated.id = tournament_match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where tournament_match.id = p_match_id
      and tournament.status not in ('cancelled', 'voided')
      and public.is_tournament_match_played_for_leaderboard(
        tournament_match.id
      )
  )
  select
    registration.profile_id as player_id,
    registration.id as registration_id,
    selected_match.id as match_id,
    registration.id = selected_match.winner_registration_id as is_winner,
    selected_match.decided_at as original_unlocked_at
  from selected_match
  join lateral (
    values
      (selected_match.player_one_registration_id),
      (selected_match.player_two_registration_id)
  ) as participant(registration_id)
    on participant.registration_id is not null
  join public.registrations as registration
    on registration.id = participant.registration_id
  where registration.profile_id is not null;
$$;

alter function public.get_player_badge_match_participants(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_match_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_match_participants(uuid)
  to service_role;

create function public.get_player_badge_match_summary(
  p_player_id uuid
)
returns table (
  played_match_count integer,
  win_count integer,
  first_played_match_id uuid,
  first_played_at timestamptz,
  tenth_played_match_id uuid,
  tenth_played_at timestamptz,
  first_win_match_id uuid,
  first_win_at timestamptz,
  fifth_win_match_id uuid,
  fifth_win_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with player_registrations as (
    select registration.id
    from public.registrations as registration
    where registration.profile_id = p_player_id
  ),
  played_matches as (
    select
      tournament_match.id,
      coalesce(
        tournament_match.official_result_decided_at,
        tournament_match.updated_at
      ) as completed_at,
      exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id =
          tournament_match.winner_registration_id
      ) as won
    from public.tournament_matches as tournament_match
    join public.generated_brackets as generated
      on generated.id = tournament_match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where public.is_tournament_match_played_for_leaderboard(
        tournament_match.id
      )
      and tournament.status not in ('cancelled', 'voided')
      and exists (
        select 1
        from player_registrations as player_registration
        where player_registration.id =
          tournament_match.player_one_registration_id
          or player_registration.id =
            tournament_match.player_two_registration_id
      )
  ),
  ranked_played_matches as (
    select
      played_match.id,
      played_match.completed_at,
      row_number() over (
        order by played_match.completed_at, played_match.id
      ) as played_number
    from played_matches as played_match
  ),
  ranked_wins as (
    select
      played_match.id,
      played_match.completed_at,
      row_number() over (
        order by played_match.completed_at, played_match.id
      ) as win_number
    from played_matches as played_match
    where played_match.won
  )
  select
    coalesce(
      (select count(*)::integer from ranked_played_matches),
      0
    ) as played_match_count,
    coalesce(
      (select count(*)::integer from ranked_wins),
      0
    ) as win_count,
    (
      select ranked.id
      from ranked_played_matches as ranked
      where ranked.played_number = 1
    ) as first_played_match_id,
    (
      select ranked.completed_at
      from ranked_played_matches as ranked
      where ranked.played_number = 1
    ) as first_played_at,
    (
      select ranked.id
      from ranked_played_matches as ranked
      where ranked.played_number = 10
    ) as tenth_played_match_id,
    (
      select ranked.completed_at
      from ranked_played_matches as ranked
      where ranked.played_number = 10
    ) as tenth_played_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 1
    ) as first_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 1
    ) as first_win_at,
    (
      select ranked.id
      from ranked_wins as ranked
      where ranked.win_number = 5
    ) as fifth_win_match_id,
    (
      select ranked.completed_at
      from ranked_wins as ranked
      where ranked.win_number = 5
    ) as fifth_win_at;
$$;

alter function public.get_player_badge_match_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_match_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_match_summary(uuid)
  to service_role;

comment on table public.player_badge_awards is
  'Authoritative persistent IronClad badge awards. Badge definitions remain canonical in the application catalog; this table stores per-player award facts only.';
comment on column public.player_badge_awards.badge_slug is
  'Canonical application badge slug from lib/badges/catalog.ts.';
comment on column public.player_badge_awards.source_type is
  'Authoritative source family that produced the award.';
comment on column public.player_badge_awards.source_id is
  'Stable source identifier when the award is attributable to a player, match, tournament, season, or other durable record.';
comment on column public.player_badge_awards.source_metadata is
  'Minimal non-secret evidence metadata for auditing evaluator behavior.';
comment on column public.player_badge_awards.unlocked_at is
  'Database-owned time when the award row was created.';
comment on column public.player_badge_awards.original_unlocked_at is
  'Best available source-event time. Historical backfills may be approximate and must preserve that distinction in metadata.';
comment on function public.get_player_badge_match_participants(uuid) is
  'Service-role-only helper exposing participants for one match only when the existing leaderboard played-match predicate says the match was truly played.';
comment on function public.get_player_badge_match_summary(uuid) is
  'Service-role-only helper summarizing played-match and win thresholds for badge evaluators using the existing leaderboard played-match predicate.';

commit;
