begin;

-- Historical Badge migrations 20260821000000 through 20260831090000 are
-- immutable Staging history. Repair their current behavior only here.

create or replace function public.record_tournament_void_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_participant record;
  v_game record;
  v_latest_game public.match_game_result_authority%rowtype;
  v_finalized_at timestamptz := coalesce(new.terminal_at, clock_timestamp());
  v_kind text := case when new.status = 'voided' then 'voided' else 'cancelled' end;
begin
  if old.status is not distinct from new.status
    or new.status not in ('cancelled', 'voided') then
    return new;
  end if;

  for v_participant in
    select distinct on (authority.match_id, authority.registration_id)
      authority.*
    from public.match_participant_outcome_authority as authority
    where authority.tournament_id = new.id
    order by authority.match_id, authority.registration_id,
      authority.revision desc, authority.id desc
  loop
    if v_participant.outcome_kind not in ('cancelled', 'voided', 'unknown') then
      perform public.append_match_participant_outcome_authority(
        v_participant.match_id,
        new.id,
        v_participant.registration_id,
        v_kind,
        v_finalized_at,
        'tournament_void',
        new.id,
        jsonb_build_object('tournament_status', new.status)
      );
    end if;
  end loop;

  for v_game in
    select distinct on (authority.match_id, authority.game_number)
      authority.match_id,
      authority.game_number
    from public.match_game_result_authority as authority
    where authority.tournament_id = new.id
    order by authority.match_id, authority.game_number,
      authority.revision desc, authority.id desc
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_game.match_id::text || ':game:' || v_game.game_number::text,
        0
      )
    );

    select authority.*
    into v_latest_game
    from public.match_game_result_authority as authority
    where authority.match_id = v_game.match_id
      and authority.game_number = v_game.game_number
    order by authority.revision desc, authority.id desc
    limit 1;

    if v_latest_game.id is not null
      and v_latest_game.authority_state = 'active' then
      insert into public.match_game_result_authority (
        match_id,
        tournament_id,
        game_number,
        series_best_of,
        finalized_game_count,
        game_authority_complete,
        revision,
        supersedes_id,
        authority_state,
        finalized_at,
        source_type,
        source_id,
        source_metadata
      )
      values (
        v_latest_game.match_id,
        new.id,
        v_latest_game.game_number,
        v_latest_game.series_best_of,
        v_latest_game.finalized_game_count,
        false,
        v_latest_game.revision + 1,
        v_latest_game.id,
        'invalidated',
        v_finalized_at,
        'tournament_void',
        new.id,
        jsonb_build_object('tournament_status', new.status)
      );
    end if;
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_void_authority() owner to postgres;
revoke all on function public.record_tournament_void_authority()
  from public, anon, authenticated, service_role;

create or replace function public.record_tournament_championship_path_void()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_path record;
  v_summary record;
  v_kind text := case when new.status = 'voided' then 'voided' else 'cancelled' end;
  v_finalized_at timestamptz := coalesce(new.terminal_at, clock_timestamp());
begin
  if old.status is not distinct from new.status
    or new.status not in ('cancelled', 'voided') then
    return new;
  end if;

  for v_path in
    select distinct on (
      authority.tournament_id,
      authority.registration_id,
      authority.path_index
    )
      authority.*
    from public.tournament_championship_path_authority as authority
    where authority.tournament_id = new.id
      and authority.authority_state = 'active'
    order by authority.tournament_id, authority.registration_id,
      authority.path_index, authority.revision desc, authority.id desc
  loop
    perform public.append_tournament_championship_path_authority(
      v_path.tournament_id,
      v_path.registration_id,
      v_path.path_index,
      v_path.round_number,
      v_path.expected_path_segment_count,
      v_path.source_match_id,
      v_path.source_generated_bracket_id,
      v_path.source_round_id,
      v_kind,
      'active',
      v_finalized_at,
      'tournament_void',
      new.id,
      jsonb_build_object('tournamentStatus', new.status)
    );
  end loop;

  for v_summary in
    select distinct on (summary.tournament_id, summary.registration_id)
      summary.*
    from public.tournament_championship_path_summary_authority as summary
    where summary.tournament_id = new.id
    order by summary.tournament_id, summary.registration_id,
      summary.revision desc, summary.id desc
  loop
    perform public.append_tournament_championship_path_summary_authority(
      v_summary.tournament_id,
      v_summary.registration_id,
      v_summary.expected_path_segment_count,
      v_summary.observed_path_segment_count,
      'invalidated',
      v_finalized_at,
      'tournament_void',
      new.id,
      jsonb_build_object('tournamentStatus', new.status)
    );
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_championship_path_void()
  owner to postgres;
revoke all on function public.record_tournament_championship_path_void()
  from public, anon, authenticated, service_role;

-- The original recorder remains responsible for report-group game evidence.
-- This second, ordered trigger only normalizes two current-platform outcomes:
-- slot-independent automatic byes and canonical scored direct-admin results.
create or replace function public.record_badge_match_authority_corrections()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_registration_id uuid;
  v_latest_kind text;
  v_finalized_at timestamptz := coalesce(
    new.official_result_decided_at,
    new.deadline_ruled_at,
    clock_timestamp()
  );
begin
  select bracket.tournament_id
  into v_tournament_id
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where generated.id = new.generated_bracket_id;

  if v_tournament_id is null then
    return new;
  end if;

  if new.outcome_type = 'automatic_bye'
    and new.winner_registration_id is not null
    and new.winner_registration_id in (
      new.player_one_registration_id,
      new.player_two_registration_id
    )
    and num_nonnulls(
      new.player_one_registration_id,
      new.player_two_registration_id
    ) = 1 then
    select authority.outcome_kind
    into v_latest_kind
    from public.match_participant_outcome_authority as authority
    where authority.match_id = new.id
      and authority.registration_id = new.winner_registration_id
    order by authority.revision desc, authority.id desc
    limit 1;

    if v_latest_kind is distinct from 'automatic_bye' then
      perform public.append_match_participant_outcome_authority(
        new.id,
        v_tournament_id,
        new.winner_registration_id,
        'automatic_bye',
        v_finalized_at,
        'derived_outcome',
        new.id,
        jsonb_build_object(
          'outcome_type',
          'automatic_bye',
          'slot_independent',
          true
        )
      );
    end if;

    return new;
  end if;

  if new.status = 'completed'
    and new.outcome_type is null
    and new.player_one_registration_id is not null
    and new.player_two_registration_id is not null
    and new.winner_registration_id in (
      new.player_one_registration_id,
      new.player_two_registration_id
    )
    and new.player_one_score is not null
    and new.player_two_score is not null
    and public.is_tournament_match_played_for_leaderboard(new.id) then
    foreach v_registration_id in array ARRAY[
      new.player_one_registration_id,
      new.player_two_registration_id
    ] loop
      select authority.outcome_kind
      into v_latest_kind
      from public.match_participant_outcome_authority as authority
      where authority.match_id = new.id
        and authority.registration_id = v_registration_id
      order by authority.revision desc, authority.id desc
      limit 1;

      if v_latest_kind is distinct from 'played' then
        perform public.append_match_participant_outcome_authority(
          new.id,
          v_tournament_id,
          v_registration_id,
          'played',
          v_finalized_at,
          'match_finalization',
          new.id,
          jsonb_build_object(
            'winner_registration_id',
            new.winner_registration_id,
            'canonical_scored_result',
            true
          )
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

alter function public.record_badge_match_authority_corrections()
  owner to postgres;
revoke all on function public.record_badge_match_authority_corrections()
  from public, anon, authenticated, service_role;

drop trigger if exists zz_tournament_matches_record_badge_authority_corrections
  on public.tournament_matches;
create trigger zz_tournament_matches_record_badge_authority_corrections
after update of
  official_result_decided_at,
  official_result_submission_id,
  winner_registration_id,
  outcome_type,
  status
on public.tournament_matches
for each row
execute function public.record_badge_match_authority_corrections();

create or replace function public.get_player_badge_reliable_competitor_summary(
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
    order by authority.match_id, authority.registration_id,
      authority.revision desc, authority.id desc
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
        when next_authority.outcome_kind in ('player_no_show', 'double_no_show')
          then 0
        else history.run_length
      end as run_length,
      greatest(
        history.best_run,
        case
          when next_authority.outcome_kind in ('played', 'opponent_no_show')
            then history.run_length + 1
          when next_authority.outcome_kind in ('player_no_show', 'double_no_show')
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

alter function public.get_player_badge_flawless_campaign_summary(uuid)
  rename to get_player_badge_flawless_campaign_summary_pre_played_requirement;

revoke all on function
  public.get_player_badge_flawless_campaign_summary_pre_played_requirement(uuid)
  from public, anon, authenticated, service_role;

create function public.get_player_badge_flawless_campaign_summary(
  p_player_id uuid
)
returns table (
  tournament_id uuid,
  registration_id uuid,
  first_completed_at timestamptz,
  expected_path_segment_count integer,
  played_segment_count integer,
  automatic_bye_count integer,
  opponent_no_show_count integer,
  verified_game_count integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select summary.*
  from public.get_player_badge_flawless_campaign_summary_pre_played_requirement(
    p_player_id
  ) as summary
  where summary.played_segment_count > 0;
$$;

alter function public.get_player_badge_flawless_campaign_summary(uuid)
  owner to postgres;
revoke all on function public.get_player_badge_flawless_campaign_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_badge_flawless_campaign_summary(uuid)
  to service_role;

create function public.guard_open_player_badge_award()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.players as player
    where player.id = new.player_id
      and player.account_closed_at is null
  ) then
    raise exception 'Badge ownership cannot be created for a closed account'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

alter function public.guard_open_player_badge_award() owner to postgres;
revoke all on function public.guard_open_player_badge_award()
  from public, anon, authenticated, service_role;

drop trigger if exists player_badge_awards_guard_open_player
  on public.player_badge_awards;
create trigger player_badge_awards_guard_open_player
before insert on public.player_badge_awards
for each row execute function public.guard_open_player_badge_award();

revoke all on table public.player_badge_awards from service_role;
grant select, insert on table public.player_badge_awards to service_role;

revoke select on table public.leaderboard_tournament_season_memberships
  from service_role;

comment on function public.get_player_badge_reliable_competitor_summary(uuid) is
  'Service-role-only Badge 10 summary. Played and opponent no-show advance; player and double no-show reset; automatic bye and unknown remain neutral.';

comment on function public.get_player_badge_flawless_campaign_summary(uuid) is
  'Service-role-only Badge 20 evidence requiring an authoritative champion, zero individual game losses, and at least one genuinely played official series.';

commit;
