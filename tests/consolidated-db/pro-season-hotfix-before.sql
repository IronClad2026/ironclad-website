-- Run inside the isolated synthetic rehearsal transaction before the hotfix DDL.
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
set local ironclad.test_model='four_division_v1';
set local lock_timeout='5s';
set local statement_timeout='120s';
select pg_temp.fd_assert(
  inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623
  and current_database()='consolidated_rehearsal'
  and not exists(select 1 from public.players where clerk_user_id not like 'local-consolidated-%'),
  'hotfix proof requires the isolated synthetic replay');

create temp table pro_hotfix_expected (
  player_name text primary key,
  historical_seed integer unique,
  pro_seed integer unique,
  expected_points integer not null,
  expected_rank integer not null
);
insert into pro_hotfix_expected values
 ('Reakly',1,1,50,1), ('tushkan',5,3,35,2), ('Nub',7,5,25,3),
 ('JRaptor',3,6,25,4), ('oziligath',2,4,20,5), ('tonimontana',4,8,20,5),
 ('Theodosios',null,7,15,7), ('AlexStan',null,2,10,8),
 ('Fractured',8,null,10,8), ('Perketic',6,null,10,8);

select pg_temp.fd_create(2,'Pro');
select pg_temp.fd_create(2,'Academy');
select pg_temp.fd_create(2,'Challenge');
select pg_temp.fd_create(2,'Main',2);

-- Pair synthetic identities across two model-specific registrations while preserving
-- the legacy ELO snapshot on Event 1. Layout yields the same point and rank facts.
set local session_replication_role='replica';
update public.registrations r
set profile_id=pg_temp.fd_id('Main-player',0,e.historical_seed),
    clerk_user_id='local-consolidated-'||pg_temp.fd_id('Main-player',0,e.historical_seed),
    player_name=e.player_name
from pro_hotfix_expected e
where r.id=pg_temp.fd_id('Pro-registration',2,e.pro_seed) and e.historical_seed is not null;
update public.players p
set display_name=e.player_name, in_game_name=e.player_name
from pro_hotfix_expected e
where p.id=case when e.historical_seed is not null
  then pg_temp.fd_id('Main-player',0,e.historical_seed)
  else pg_temp.fd_id('Pro-player',0,e.pro_seed) end;
set local session_replication_role='origin';

select pg_temp.fd_play(2,'Pro');
select pg_temp.fd_play(2,'Main');
select pg_temp.fd_play(2,'Academy',6);
select pg_temp.fd_play(2,'Challenge',6);
set constraints all immediate;

create temp table pro_hotfix_source as
select season_id,tournament_id,tournament_bracket_id
from ironclad_private.legacy_main_pro_season_transition where activated_at is not null;

create function pg_temp.pro_hotfix_evidence() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'points', (select jsonb_agg(to_jsonb(p) order by p.id) from public.leaderboard_point_events p),
    'settlements', (select jsonb_agg(to_jsonb(s) order by s.tournament_bracket_id) from public.leaderboard_division_settlements s),
    'memberships', (select jsonb_agg(to_jsonb(m) order by m.tournament_id) from public.leaderboard_tournament_season_memberships m),
    'matches', (select jsonb_agg(to_jsonb(m) order by m.id) from public.tournament_matches m),
    'registrations', (select jsonb_agg(to_jsonb(r) order by r.id) from public.registrations r),
    'registration_acceptances', (select jsonb_agg(to_jsonb(a) order by a.registration_id) from public.registration_acceptances a),
    'legacy_mapping', (select jsonb_agg(to_jsonb(x) order by x.season_id) from ironclad_private.legacy_main_pro_season_transition x),
    'seasons', (select jsonb_agg(to_jsonb(s) order by s.id) from public.leaderboard_seasons s),
    'champions', (select jsonb_agg(to_jsonb(c) order by c.id) from public.leaderboard_season_champions c),
    'runs', (select jsonb_agg(to_jsonb(r) order by r.id) from public.leaderboard_recalculation_runs r),
    'public_view_contracts', (select jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl,c.reloptions,
      a.attnum,a.attname,format_type(a.atttypid,a.atttypmod)) order by c.relname,a.attnum)
      from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where c.oid in ('public.leaderboard_current_season'::regclass,'public.leaderboard_public_season_standings'::regclass,
        'public.leaderboard_public_all_time_standings'::regclass,'public.leaderboard_public_season_champions'::regclass))
  );
$$;

select pg_temp.fd_assert(
 current_setting('ironclad.test_hotfix_keep_fixture',true) is not distinct from 'on' or (
 (select count(*)=1 and bool_and(valid_qualifying_event_count=1 and not is_finalized) from public.leaderboard_current_season)
 and (select count(*)=8 from public.leaderboard_public_season_standings where bracket_type='pro')
 and (select total_points=5 and current_rank=8 and tournaments_played=0 and rounds_passed=1
             and matches_played=1 and matches_won=1
      from public.leaderboard_public_season_standings where bracket_type='pro' and in_game_name='Nub')),
 'original public projection omitted the settled Pro event and showed Nub at #8 with five points');

select pg_temp.fd_assert(
 (select status='in_progress' and first_completed_at is null from public.tournaments where id=pg_temp.fd_id('event',2))
 and (select count(*)=7 and bool_and(status='completed') from public.tournament_matches
      where generated_bracket_id=pg_temp.fd_id('Pro-generated',2))
 and (select qualifying_event_number=2 and scored_at is not null and voided_at is null
      and season_id=(select season_id from pro_hotfix_source)
      from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',2))
 and (select count(*)=15 and sum(points)=115 from public.leaderboard_point_events
      where tournament_id=pg_temp.fd_id('event',2) and bracket_type='pro')
 and (select count(*)=1 from public.leaderboard_division_settlements
      where tournament_bracket_id=pg_temp.fd_id('Pro',2) and season_id=(select season_id from pro_hotfix_source)),
 'seven official results, one Pro receipt, 15 award rows and scored Event 2 predate the migration');

create temp table pro_hotfix_before as select pg_temp.pro_hotfix_evidence() evidence;
