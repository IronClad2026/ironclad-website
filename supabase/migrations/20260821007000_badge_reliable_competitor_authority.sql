begin;

create function public.get_player_badge_reliable_competitor_summary(
  p_player_id uuid
)
returns table (
  best_run integer,
  tenth_match_id uuid,
  tenth_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with recursive
  player_registrations as (
    select registration.id
    from public.registrations as registration
    where registration.profile_id = p_player_id
  ),
  latest_authority as (
    select distinct on (authority.match_id, authority.registration_id)
      authority.id,
      authority.match_id,
      authority.registration_id,
      authority.outcome_kind,
      authority.finalized_at
    from public.match_participant_outcome_authority as authority
    join player_registrations as player_registration
      on player_registration.id = authority.registration_id
    order by
      authority.match_id,
      authority.registration_id,
      authority.revision desc,
      authority.id desc
  ),
  ordered_authority as (
    select
      authority.id,
      authority.match_id,
      authority.outcome_kind,
      authority.finalized_at,
      row_number() over (
        order by authority.finalized_at, authority.match_id, authority.id
      ) as sequence_number
    from latest_authority as authority
    join public.match_participant_outcome_authority as authority_source
      on authority_source.id = authority.id
    join public.tournaments as tournament
      on tournament.id = authority_source.tournament_id
    where tournament.status not in ('cancelled', 'voided')
  ),
  run_history as (
    select
      ordered.id,
      ordered.match_id,
      ordered.outcome_kind,
      ordered.finalized_at,
      ordered.sequence_number,
      case
        when ordered.outcome_kind in ('played', 'opponent_no_show') then 1
        else 0
      end as run_length,
      case
        when ordered.outcome_kind in ('played', 'opponent_no_show') then 1
        else 0
      end as best_run,
      cast(null as uuid) as tenth_match_id,
      cast(null as timestamptz) as tenth_at
    from ordered_authority as ordered
    where ordered.sequence_number = 1

    union all

    select
      next_authority.id,
      next_authority.match_id,
      next_authority.outcome_kind,
      next_authority.finalized_at,
      next_authority.sequence_number,
      case
        when next_authority.outcome_kind in ('played', 'opponent_no_show')
          then history.run_length + 1
        when next_authority.outcome_kind = 'player_no_show'
          then 0
        else history.run_length
      end as run_length,
      greatest(
        history.best_run,
        case
          when next_authority.outcome_kind in ('played', 'opponent_no_show')
            then history.run_length + 1
          when next_authority.outcome_kind = 'player_no_show'
            then 0
          else history.run_length
        end
      ) as best_run,
      case
        when history.tenth_match_id is null
          and next_authority.outcome_kind in ('played', 'opponent_no_show')
          and history.run_length + 1 >= 10
          then next_authority.match_id
        else history.tenth_match_id
      end as tenth_match_id,
      case
        when history.tenth_at is null
          and next_authority.outcome_kind in ('played', 'opponent_no_show')
          and history.run_length + 1 >= 10
          then next_authority.finalized_at
        else history.tenth_at
      end as tenth_at
    from run_history as history
    join ordered_authority as next_authority
      on next_authority.sequence_number = history.sequence_number + 1
  )
  select
    coalesce(max(history.best_run), 0)::integer as best_run,
    (
      select threshold.tenth_match_id
      from run_history as threshold
      where threshold.tenth_match_id is not null
      order by threshold.sequence_number
      limit 1
    ) as tenth_match_id,
    (
      select threshold.tenth_at
      from run_history as threshold
      where threshold.tenth_at is not null
      order by threshold.sequence_number
      limit 1
    ) as tenth_at
  from run_history as history;
$$;

alter function public.get_player_badge_reliable_competitor_summary(uuid)
  owner to postgres;

revoke all on function public.get_player_badge_reliable_competitor_summary(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_player_badge_reliable_competitor_summary(uuid)
  to service_role;

comment on function public.get_player_badge_reliable_competitor_summary(uuid) is
  'Service-role-only summary of historical participant authority for Reliable Competitor. Only played and opponent_no_show advance the run; player_no_show resets it and all other authoritative states are neutral.';

commit;
