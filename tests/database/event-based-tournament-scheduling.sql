-- Rollback-only behavioral proof for the event-based save authority.
begin;

set local client_min_messages = warning;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '2min';

create function pg_temp.event_schedule_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Event scheduling behavior failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.save_event(
  p_slug text,
  p_division text,
  p_open_at timestamptz default null,
  p_close_at timestamptz default null
)
returns uuid
language sql
as $$
  select public.save_tournament(
    null,
    'Event scheduling fixture ' || p_slug,
    p_slug,
    'Rollback-only synthetic event scheduling fixture.',
    '/images/tournaments/event-scheduling-fixture.jpg',
    p_open_at,
    p_close_at,
    null,
    null,
    'registration_open',
    '1v1',
    '',
    null,
    null,
    true,
    '2099-12-31T23:59:59Z',
    'format_a',
    30,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'name', p_division,
        'elo_rules', case p_division
          when 'Academy' then 'Below 1100 ELO'
          when 'Challenge' then '1100-1399 ELO'
          else '1400+ ELO'
        end,
        'max_players', 8
      )
    )
  );
$$;

create temporary table event_schedule_baseline as
select
  (select count(*) from public.player_badge_awards) as badge_awards,
  (select count(*) from public.player_badge_reveals) as badge_reveals,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.leaderboard_point_events) as point_events,
  (select count(*) from public.leaderboard_tournament_season_memberships)
    as season_memberships;

do $$
declare
  v_academy uuid;
  v_academy_after_terminal uuid;
  v_academy_independent uuid;
  v_academy_bracket uuid;
  v_challenge uuid;
  v_generated_bracket uuid;
  v_main uuid;
  v_round uuid;
  v_rejected boolean := false;
  v_legacy_grand_final constant timestamptz := '2027-04-12T10:30:00Z';
begin
  v_academy := pg_temp.save_event(
    'event-scheduling-academy-a',
    'Academy',
    '2027-01-01T00:00:00Z',
    '2027-01-31T00:00:00Z'
  );

  perform pg_temp.event_schedule_assert(
    exists (
      select 1
      from public.tournaments
      where id = v_academy
        and grand_final_at is null
        and registration_open_at = '2027-01-01T00:00:00Z'
        and registration_close_at = '2027-01-31T00:00:00Z'
    ),
    'new Event did not clear the supplied predicted Grand Final'
  );

  begin
    perform pg_temp.save_event(
      'event-scheduling-academy-conflict',
      'Academy'
    );
  exception when sqlstate '55000' then
    v_rejected := true;
  end;

  perform pg_temp.event_schedule_assert(
    v_rejected,
    'a second unresolved Academy cycle was not rejected'
  );

  v_challenge := pg_temp.save_event(
    'event-scheduling-challenge',
    'Challenge'
  );
  v_main := pg_temp.save_event('event-scheduling-main', 'Main');

  perform pg_temp.event_schedule_assert(
    (
      select count(*) = 2
      from public.tournaments
      where id in (v_challenge, v_main)
        and registration_open_at is null
        and registration_close_at is null
    ),
    'unrelated Divisions or blank optional dates were rejected'
  );

  update public.tournaments
  set grand_final_at = v_legacy_grand_final
  where id = v_challenge;

  perform public.save_tournament(
    v_challenge,
    'Event scheduling fixture historical edit',
    'event-scheduling-challenge',
    'Rollback-only edited synthetic fixture.',
    '/images/tournaments/event-scheduling-fixture.jpg',
    null,
    null,
    null,
    null,
    'registration_open',
    '1v1',
    '',
    null,
    null,
    true,
    null,
    'format_a',
    30,
    '[{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8}]'::jsonb
  );

  perform pg_temp.event_schedule_assert(
    (select grand_final_at = v_legacy_grand_final
     from public.tournaments
     where id = v_challenge),
    'historical Grand Final metadata changed during edit'
  );

  perform public.void_tournament(
    v_academy,
    'Rollback-only terminal-cycle scheduling proof',
    'test:event-based-tournament-scheduling'
  );

  v_academy_after_terminal := pg_temp.save_event(
    'event-scheduling-academy-after-terminal',
    'Academy'
  );

  perform pg_temp.event_schedule_assert(
    v_academy_after_terminal is not null,
    'a terminal prior Academy cycle blocked the next Academy event'
  );

  perform public.void_tournament(
    v_challenge,
    'Rollback-only mixed-state scheduling proof',
    'test:event-based-tournament-scheduling'
  );

  perform public.save_tournament(
    v_academy_after_terminal,
    'Event scheduling fixture mixed-state parent',
    'event-scheduling-academy-after-terminal',
    'Rollback-only mixed-state synthetic fixture.',
    '/images/tournaments/event-scheduling-fixture.jpg',
    null,
    null,
    null,
    null,
    'registration_open',
    '1v1',
    '',
    null,
    null,
    true,
    null,
    'format_a',
    30,
    '[{"name":"Academy","elo_rules":"Below 1100 ELO","max_players":8},{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8}]'::jsonb
  );

  select id
  into v_academy_bracket
  from public.tournament_brackets
  where tournament_id = v_academy_after_terminal
    and name = 'Academy';

  perform pg_catalog.set_config('session_replication_role', 'replica', true);

  update public.tournament_brackets
  set launched_at = '2027-02-01T00:00:00Z'
  where id = v_academy_bracket;

  update public.tournaments
  set status = 'in_progress'
  where id = v_academy_after_terminal;

  insert into public.generated_brackets (
    tournament_bracket_id,
    format,
    participant_count,
    slot_count,
    generated_by
  )
  values (
    v_academy_bracket,
    'single_elimination',
    8,
    8,
    'test:event-based-tournament-scheduling'
  )
  returning id into v_generated_bracket;

  insert into public.bracket_rounds (
    generated_bracket_id,
    round_number,
    name
  )
  values (v_generated_bracket, 3, 'Grand Final')
  returning id into v_round;

  insert into public.tournament_matches (
    generated_bracket_id,
    round_id,
    match_number,
    status,
    outcome_type
  )
  values (
    v_generated_bracket,
    v_round,
    1,
    'completed',
    'empty_feeder'
  );

  perform pg_catalog.set_config('session_replication_role', 'origin', true);

  perform pg_temp.event_schedule_assert(
    public.is_generated_bracket_complete(v_generated_bracket),
    'the mixed-state Academy fixture did not resolve authoritatively'
  );

  v_academy_independent := pg_temp.save_event(
    'event-scheduling-academy-independent',
    'Academy'
  );

  perform pg_temp.event_schedule_assert(
    v_academy_independent is not null
      and exists (
        select 1
        from public.tournament_brackets
        where tournament_id = v_academy_after_terminal
          and name = 'Challenge'
          and launched_at is null
      ),
    'a resolved Academy Division remained blocked by its open Challenge sibling'
  );

  perform pg_temp.event_schedule_assert(
    not exists (
      select bracket.name
      from public.tournament_brackets as bracket
      join public.tournaments as tournament
        on tournament.id = bracket.tournament_id
      where tournament.status not in ('completed', 'cancelled', 'voided')
        and (
          bracket.launched_at is null
          or not exists (
            select 1
            from public.generated_brackets as generated
            where generated.tournament_bracket_id = bracket.id
          )
          or exists (
            select 1
            from public.generated_brackets as generated
            where generated.tournament_bracket_id = bracket.id
              and public.is_generated_bracket_complete(generated.id)
                is distinct from true
          )
        )
      group by bracket.name
      having count(*) > 1
    ),
    'the fixture ended with duplicate unresolved canonical Divisions'
  );
end;
$$;

select pg_temp.event_schedule_assert(
  baseline.badge_awards = (select count(*) from public.player_badge_awards)
    and baseline.badge_reveals = (select count(*) from public.player_badge_reveals)
    and baseline.notifications = (select count(*) from public.notifications)
    and baseline.point_events = (select count(*) from public.leaderboard_point_events)
    and baseline.season_memberships = (
      select count(*)
      from public.leaderboard_tournament_season_memberships
    ),
  'save operations changed Badge, Reveal, notification, point, or season totals'
)
from event_schedule_baseline as baseline;

select 'event_based_tournament_scheduling_behavior_passed';

rollback;
