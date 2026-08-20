begin;

create function public.get_player_badge_finalized_season_for_tournament(
  p_tournament_id uuid
)
returns table (
  season_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select membership.season_id
  from public.leaderboard_tournament_season_memberships as membership
  join public.leaderboard_seasons as season
    on season.id = membership.season_id
  join public.tournaments as tournament
    on tournament.id = membership.tournament_id
  where membership.tournament_id = p_tournament_id
    and membership.voided_at is null
    and tournament.status = 'completed'
    and tournament.first_completed_at is not null
    and season.finalized_at is not null
    and season.under_review_at is null;
$$;

alter function public.get_player_badge_finalized_season_for_tournament(uuid)
  owner to postgres;
revoke all on function
  public.get_player_badge_finalized_season_for_tournament(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_player_badge_finalized_season_for_tournament(uuid)
  to service_role;

create function public.get_player_badge_season_authority_participants(
  p_season_id uuid
)
returns table (
  player_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with season_scope as (
    select season.id
    from public.leaderboard_seasons as season
    where season.id = p_season_id
      and season.finalized_at is not null
      and season.under_review_at is null
  ),
  participation_candidates as (
    select distinct event.player_id
    from public.leaderboard_point_events as event
    join season_scope as season
      on season.id = event.season_id
    join public.leaderboard_tournament_season_memberships as membership
      on membership.season_id = event.season_id
      and membership.tournament_id = event.tournament_id
      and membership.voided_at is null
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    where tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.tournament_id is not null
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  podium_candidates as (
    select season_stats.player_id
    from public.leaderboard_player_season_stats as season_stats
    join season_scope as season
      on season.id = season_stats.season_id
    where season_stats.bracket_type = 'main'
      and season_stats.current_rank <= 3
  ),
  champion_candidates as (
    select champion.player_id
    from public.leaderboard_season_champions as champion
    join season_scope as season
      on season.id = champion.season_id
    where champion.bracket_type = 'main'
      and champion.final_rank = 1
  )
  select distinct candidate.player_id
  from (
    select participation.player_id
    from participation_candidates as participation
    union all
    select podium.player_id
    from podium_candidates as podium
    union all
    select champion.player_id
    from champion_candidates as champion
  ) as candidate
  where candidate.player_id is not null;
$$;

alter function public.get_player_badge_season_authority_participants(uuid)
  owner to postgres;
revoke all on function
  public.get_player_badge_season_authority_participants(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_player_badge_season_authority_participants(uuid)
  to service_role;

create function public.get_player_badge_season_summary(
  p_player_id uuid
)
returns table (
  season_campaigner_count integer,
  first_season_campaigner_season_id uuid,
  first_season_campaigner_at timestamptz,
  first_season_campaigner_threshold_tournament_id uuid,
  first_season_campaigner_tournament_count integer,
  podium_finish_count integer,
  first_podium_season_id uuid,
  first_podium_at timestamptz,
  first_podium_rank integer,
  champion_finish_count integer,
  first_champion_season_id uuid,
  first_champion_at timestamptz,
  first_champion_rank integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with finalized_seasons as (
    select
      season.id,
      season.finalized_at
    from public.leaderboard_seasons as season
    where season.finalized_at is not null
      and season.under_review_at is null
  ),
  qualifying_participation as (
    select
      event.season_id,
      event.tournament_id,
      min(tournament.first_completed_at) as completed_at
    from public.leaderboard_point_events as event
    join finalized_seasons as season
      on season.id = event.season_id
    join public.leaderboard_tournament_season_memberships as membership
      on membership.season_id = event.season_id
      and membership.tournament_id = event.tournament_id
      and membership.voided_at is null
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
    where event.player_id = p_player_id
      and tournament.status = 'completed'
      and tournament.first_completed_at is not null
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.tournament_id is not null
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
    group by
      event.season_id,
      event.tournament_id
  ),
  ranked_participation as (
    select
      participation.season_id,
      participation.tournament_id,
      participation.completed_at,
      row_number() over (
        partition by participation.season_id
        order by participation.completed_at, participation.tournament_id
      ) as tournament_number,
      count(*) over (
        partition by participation.season_id
      )::integer as season_tournament_count
    from qualifying_participation as participation
  ),
  season_campaigners as (
    select
      ranked.season_id,
      ranked.tournament_id as threshold_tournament_id,
      ranked.completed_at as threshold_completed_at,
      ranked.season_tournament_count
    from ranked_participation as ranked
    where ranked.tournament_number = 4
  ),
  ranked_campaigners as (
    select
      campaigner.*,
      row_number() over (
        order by campaigner.threshold_completed_at, campaigner.season_id
      ) as campaigner_number
    from season_campaigners as campaigner
  ),
  podium_finishes as (
    select
      season_stats.season_id,
      season.finalized_at,
      season_stats.current_rank
    from public.leaderboard_player_season_stats as season_stats
    join finalized_seasons as season
      on season.id = season_stats.season_id
    where season_stats.player_id = p_player_id
      and season_stats.bracket_type = 'main'
      and season_stats.current_rank <= 3
  ),
  ranked_podiums as (
    select
      podium.*,
      row_number() over (
        order by podium.finalized_at, podium.season_id
      ) as podium_number
    from podium_finishes as podium
  ),
  champion_finishes as (
    select
      champion.season_id,
      season.finalized_at,
      champion.final_rank
    from public.leaderboard_season_champions as champion
    join finalized_seasons as season
      on season.id = champion.season_id
    where champion.player_id = p_player_id
      and champion.bracket_type = 'main'
      and champion.final_rank = 1
  ),
  ranked_champions as (
    select
      champion.*,
      row_number() over (
        order by champion.finalized_at, champion.season_id
      ) as champion_number
    from champion_finishes as champion
  )
  select
    coalesce(
      (select count(*)::integer from ranked_campaigners),
      0
    ) as season_campaigner_count,
    (
      select campaigner.season_id
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1
    ) as first_season_campaigner_season_id,
    (
      select campaigner.threshold_completed_at
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1
    ) as first_season_campaigner_at,
    (
      select campaigner.threshold_tournament_id
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1
    ) as first_season_campaigner_threshold_tournament_id,
    (
      select campaigner.season_tournament_count
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1
    ) as first_season_campaigner_tournament_count,
    coalesce(
      (select count(*)::integer from ranked_podiums),
      0
    ) as podium_finish_count,
    (
      select podium.season_id
      from ranked_podiums as podium
      where podium.podium_number = 1
    ) as first_podium_season_id,
    (
      select podium.finalized_at
      from ranked_podiums as podium
      where podium.podium_number = 1
    ) as first_podium_at,
    (
      select podium.current_rank
      from ranked_podiums as podium
      where podium.podium_number = 1
    ) as first_podium_rank,
    coalesce(
      (select count(*)::integer from ranked_champions),
      0
    ) as champion_finish_count,
    (
      select champion.season_id
      from ranked_champions as champion
      where champion.champion_number = 1
    ) as first_champion_season_id,
    (
      select champion.finalized_at
      from ranked_champions as champion
      where champion.champion_number = 1
    ) as first_champion_at,
    (
      select champion.final_rank
      from ranked_champions as champion
      where champion.champion_number = 1
    ) as first_champion_rank;
$$;

alter function public.get_player_badge_season_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_season_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_season_summary(uuid)
  to service_role;

commit;
