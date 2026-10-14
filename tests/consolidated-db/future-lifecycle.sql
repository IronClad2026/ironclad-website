-- LOCAL ONLY isolated future-state branch; remove synthetic legacy rows only inside rollback.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
set local ironclad.test_model='four_division_v1';
do $$ declare targets text; begin
 if current_database()<>'consolidated_rehearsal' then raise exception 'Wrong disposable database'; end if;
 select string_agg(format('%I.%I',n.nspname,c.relname),',') into targets from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') and c.relname not in ('platform_settings','legal_documents');
 execute 'truncate '||targets||' cascade';
end $$;
savepoint genuine_future_editor;
do $$ declare tid uuid; bid uuid; pid uuid:=pg_temp.fd_id('genuine-future-profile',0); sub text:='local-consolidated-genuine-future';
 doc record; accepted record; blocked boolean:=false; begin
 tid:=public.save_tournament(null,'Local genuine future editor','local-genuine-future-editor','','',null,null,null,null,'registration_open','1v1','','','',true,null,'format_a',30,
 '[{"name":"Academy","elo_rules":"0-1099 ELO","max_players":8},{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8},{"name":"Main","elo_rules":"1400-1699 ELO","max_players":8},{"name":"Pro","elo_rules":"1700+ ELO","max_players":8}]'::jsonb,'four_division_v1');
 perform pg_temp.fd_assert((select division_model_version='four_division_v1' from public.tournaments where id=tid),'independent explicit20 editor creates future four model');
 perform pg_temp.fd_assert((select count(*)=4 from public.tournament_brackets where tournament_id=tid),'future editor creates four named divisions');
 insert into public.players(id,clerk_user_id,display_name,in_game_name,steam_id64,profile_completed,avatar_url,country,region,timezone)
 values(pid,sub,'Local fresh provider','Local fresh provider','76561198000000091',true,'/local-avatar.png','CA','North America','UTC');
 select id into bid from public.tournament_brackets where tournament_id=tid and name='Pro';
 select (select id from public.legal_documents where document_kind='rulebook' and status='effective') r,
 (select id from public.legal_documents where document_kind='ppa' and status='effective') p,
 (select id from public.legal_documents where document_kind='terms' and status='effective') t,
 (select id from public.legal_documents where document_kind='privacy' and status='effective') v into doc;
 select * into accepted from public.submit_verified_player_registration(pid,sub,'76561198000000091',tid,bid,1800,'US Forces','Pro','relic-highest-1v1-v2',doc.r,doc.p,doc.t,doc.v,true,true,true,true,true,true,false);
 perform pg_temp.fd_assert((select elo_verification_source='relic' and elo_verified_division='Pro' and elo_calculation_version='relic-highest-1v1-v2' and submitted_elo=1800 from public.registrations where id=accepted.id),'normal registration authority stores genuine-shaped future provider snapshot');
 perform pg_temp.fd_assert((select rulebook_version='3.2' and ppa_version='3.2' and terms_version='1.1' and privacy_version='1.3' from public.registration_acceptances where registration_id=accepted.id),'genuine registration acceptance uses successor rules and protected Privacy1.3');
 begin perform public.submit_verified_player_registration(pid,sub,'76561198000000091',tid,bid,1800,'US Forces','Main / Pro','relic-highest-1v1-v1',doc.r,doc.p,doc.t,doc.v,true,true,true,true,true,true,false);
 exception when others then blocked:=sqlerrm='Registration calculation version does not match competition model'; end;
 perform pg_temp.fd_assert(blocked,'future registration rejects legacy calculation model before any write');
end $$;
rollback to savepoint genuine_future_editor;
select pg_temp.fd_create(1,'Main');
select pg_temp.fd_create(1,'Pro');
select pg_temp.fd_play(1,'Main');
select pg_temp.fd_assert((select status='in_progress' from public.tournaments where id=pg_temp.fd_id('event',1)),'Main completion prematurely completed sibling Pro');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_tournament_season_memberships where qualifying_event_number is not null),'Main consumed an official Pro slot');
select pg_temp.fd_assert((select sum(points)=25 from public.leaderboard_point_events where tournament_bracket_id=pg_temp.fd_id('Main',1) and player_id=pg_temp.fd_id('Main-player',0,1)),'Main champion must earn 10+5+5+5=25 points');
select pg_temp.fd_assert((select count(*)=2 from public.leaderboard_point_events where tournament_bracket_id=pg_temp.fd_id('Main',1) and player_id=pg_temp.fd_id('Main-player',0,1) and event_type='round_passed'),'Main final was counted as both advancement and winner bonus');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_point_events where tournament_bracket_id=pg_temp.fd_id('Main',1) and bracket_type<>'main_progression'),'Main leaked into legacy main or Pro');

select pg_temp.fd_play(1,'Pro');
select pg_temp.fd_assert((select status='completed' from public.tournaments where id=pg_temp.fd_id('event',1)),'normal last sibling completion did not finish tournament');
select pg_temp.fd_assert((select qualifying_event_number=1 from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',1)),'Pro completion did not consume exactly slot one');
select pg_temp.fd_assert((select sum(points)=25 from public.leaderboard_point_events where tournament_bracket_id=pg_temp.fd_id('Pro',1) and player_id=pg_temp.fd_id('Pro-player',0,1)),'Pro champion must earn 25 points');

do $$ declare event integer; begin
  for event in 2..6 loop
    perform pg_temp.fd_create(event,'Pro');
    perform pg_temp.fd_play(event,'Pro');
    perform pg_temp.fd_assert((select qualifying_event_number=event from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',event)),'Pro qualifying event numbering diverged at '||event);
  end loop;
end $$;
set constraints all immediate;

create temporary table fd_frozen as select s.id season_id,
  (select md5(string_agg(to_jsonb(c)::text,E'\n' order by c.id)) from public.leaderboard_season_champions c where c.season_id=s.id) champion_hash,
  (select md5(string_agg(to_jsonb(p)::text,E'\n' order by p.player_id,p.bracket_type)) from public.leaderboard_player_season_stats p where p.season_id=s.id and p.bracket_type='pro') stats_hash
from public.leaderboard_seasons s where s.finalized_at is not null;
select pg_temp.fd_assert((select count(*)=1 from fd_frozen),'six events did not finalize exactly one season');
select pg_temp.fd_assert((select count(*)=6 and min(qualifying_event_number)=1 and max(qualifying_event_number)=6 from public.leaderboard_tournament_season_memberships where season_id=(select season_id from fd_frozen)),'finalized season does not contain six unique factual slots');
select pg_temp.fd_assert((select count(*)=1 from public.leaderboard_seasons where is_active and official_bracket_type='pro' and finalized_at is null),'successor official Pro season is not singular');
select pg_temp.fd_assert((select count(*)=0 from public.leaderboard_tournament_season_memberships m join public.leaderboard_seasons s on s.id=m.season_id where s.is_active and m.qualifying_event_number is not null),'new Pro season is not clean at zero');
select pg_temp.fd_assert((select final_points=150 and final_rank=1 and bracket_type='pro' from public.leaderboard_season_champions where season_id=(select season_id from fd_frozen) and player_id=pg_temp.fd_id('Pro-player',0,1)),'Pro champion snapshot is not six times25');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_season_champions where bracket_type<>'pro'),'non-Pro result became current official podium');

-- Fresh entrants in the second Main event still receive no lower-Division catch-up.
select pg_temp.fd_create(8,'Main',1);
select pg_temp.fd_play(8,'Main');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_point_events where bracket_type in ('pro','main_progression') and event_type='missing_tournament_bonus'),'Main or Pro received a late-entry bonus');
select pg_temp.fd_assert((select sum(points)=25 from public.leaderboard_point_events where tournament_bracket_id=pg_temp.fd_id('Main',8) and player_id=pg_temp.fd_id('Main-player',1,1)),'new Main entrants did not use fixed scoring');

select pg_temp.fd_create(7,'Pro');
select pg_temp.fd_play(7,'Pro');
select pg_temp.fd_assert((select m.qualifying_event_number=1 and s.is_active from public.leaderboard_tournament_season_memberships m join public.leaderboard_seasons s on s.id=m.season_id where m.tournament_id=pg_temp.fd_id('event',7)),'seventh Pro event corrupted finalized six-event authority');

create temporary table fd_retry as select md5(string_agg(to_jsonb(e)::text,E'\n' order by id)) digest from public.leaderboard_point_events e;
select pg_temp.fd_assert(main_championship_count=1 and first_main_championship_bracket_type='main_progression' and championship_count=1,'future Main did not establish Elite championship authority')
from public.get_player_badge_tournament_prestige_summary(pg_temp.fd_id('Main-player',0,1));
select pg_temp.fd_assert(main_championship_count=0 and first_main_championship_bracket_type is null and championship_count=7 and triple_crown_bracket_count=0,'Pro championship substituted for Main or failed generic championship count')
from public.get_player_badge_tournament_prestige_summary(pg_temp.fd_id('Pro-player',0,1));
select pg_temp.fd_assert(podium_finish_count=1 and champion_finish_count=1 and first_champion_rank=1,'finalized Pro podium/champion badge authority missing')
from public.get_player_badge_season_summary(pg_temp.fd_id('Pro-player',0,1));
select pg_temp.fd_assert(podium_finish_count=0 and champion_finish_count=0,'Main Career acquired official season podium badge authority')
from public.get_player_badge_season_summary(pg_temp.fd_id('Main-player',0,1));
do $$ declare bracket record; result jsonb; begin
  for bracket in select id from public.tournament_brackets loop
    result:=public.settle_leaderboard_division(bracket.id,null);
    perform pg_temp.fd_assert(not (result->>'settlementCreated')::boolean and not (result->>'pointEventsChanged')::boolean and not (result->>'lateEntryBonusesChanged')::boolean,'settlement retry changed immutable accounting facts');
  end loop;
end $$;
select pg_temp.fd_assert((select digest=(select md5(string_agg(to_jsonb(e)::text,E'\n' order by id)) from public.leaderboard_point_events e) from fd_retry),'retry changed point IDs or evidence');
select public.recalculate_leaderboard_for_season(season_id,null) from fd_frozen;
select pg_temp.fd_assert(f.champion_hash=(select md5(string_agg(to_jsonb(c)::text,E'\n' order by c.id)) from public.leaderboard_season_champions c where c.season_id=f.season_id) and
  f.stats_hash=(select md5(string_agg(to_jsonb(p)::text,E'\n' order by p.player_id,p.bracket_type)) from public.leaderboard_player_season_stats p where p.season_id=f.season_id and p.bracket_type='pro'),
  'seventh event or retry changed frozen official podium or standings') from fd_frozen f;

do $$ declare blocked boolean:=false; begin
  begin
    insert into public.leaderboard_point_events(season_id,player_id,bracket_type,points,event_type,source,description)
    select season_id,pg_temp.fd_id('Pro-player',0,1),'pro',1,'admin_adjustment','admin','must reject finalized authority' from fd_frozen;
  exception when sqlstate '55000' then blocked:=true; end;
  perform pg_temp.fd_assert(blocked,'finalized Pro admin adjustment was accepted');
end $$;

select jsonb_build_object('result','passed','assertions',(select count(*) from fd_assertions),'playedMatches',(select count(*) from public.tournament_matches where status='completed'),'settledDivisions',(select count(*) from public.leaderboard_division_settlements),'finalizedProEvents',6,'successorProEvents',1,'championPoints',150,'fixtureConstruction','isolated coherent inputs; normal result and settlement authority');

rollback;
