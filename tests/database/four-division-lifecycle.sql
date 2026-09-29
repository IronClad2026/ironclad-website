-- Disposable loopback PostgreSQL only. Setup follows the existing settlement
-- harness: replica mode builds coherent inputs, then normal result, lifecycle,
-- settlement and season authorities perform every scored transition.
\set ON_ERROR_STOP on
begin;
set local client_min_messages = warning;
set local lock_timeout = '5s';
set local statement_timeout = '3min';
set local request.jwt.claims = '{"role":"service_role","sub":"four-division-local-rehearsal"}';

do $$ begin
  if current_database() not like 'p03_four_division_fixtures_%' then
    raise exception 'This harness requires its isolated fixture database';
  end if;
  if exists(select 1 from public.leaderboard_seasons) then
    raise exception 'This harness requires a fresh empty leaderboard';
  end if;
end $$;

create function pg_temp.fd_id(kind text,event integer,slot integer default 0)
returns uuid language sql immutable as $$
  select md5('four-division-lifecycle:'||kind||':'||event||':'||slot)::uuid;
$$;
create temporary table fd_assertions(message text);
create function pg_temp.fd_assert(ok boolean,message text)
returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Four-division lifecycle: %',message; end if;
  insert into pg_temp.fd_assertions values(message);
end $$;

create function pg_temp.fd_create(event integer,division text,player_group integer default 0)
returns uuid language plpgsql as $$
declare
  tid uuid:=pg_temp.fd_id('event',event);
  bid uuid:=pg_temp.fd_id(division,event);
  gid uuid:=pg_temp.fd_id(division||'-generated',event);
  pid uuid; rid uuid; rd uuid; idx integer; round_no integer; match_no integer;
  elo integer:=case division when 'Pro' then 1800 else 1500 end;
begin
  perform set_config('session_replication_role','replica',true);
  insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled,division_model_version)
  values(tid,'Local four division '||event,'local-four-division-'||event,'1v1','in_progress','Disposable local lifecycle inputs','','',false,'four_division_v1')
  on conflict(id) do nothing;
  insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players,launched_at)
  values(bid,tid,division,case division when 'Pro' then '1700+ ELO' else '1400-1699 ELO' end,8,now());
  for idx in 1..8 loop
    pid:=pg_temp.fd_id(division||'-player',player_group,idx);
    rid:=pg_temp.fd_id(division||'-registration',event,idx);
    insert into public.players(id,clerk_user_id,display_name,in_game_name,current_elo,profile_completed)
    values(pid,'local-four-division-'||pid,'Local fixture '||idx,'Local fixture '||idx,elo,true)
    on conflict(id) do nothing;
    insert into public.registrations(id,profile_id,clerk_user_id,player_name,submitted_elo,tournament_title,bracket_name,registration_status,elo_status,tournament_id,tournament_bracket_id)
    values(rid,pid,'local-four-division-'||pid,'Local fixture '||idx,elo,'Local four division '||event,division,'approved','verified',tid,bid);
  end loop;
  insert into public.generated_brackets(id,tournament_bracket_id,format,participant_count,slot_count,generated_by,competition_locked_at)
  values(gid,bid,'single_elimination',8,8,'local-four-division-admin',now());
  for round_no in 1..3 loop
    rd:=pg_temp.fd_id(division||'-round',event,round_no);
    insert into public.bracket_rounds(id,generated_bracket_id,round_number,name)
    values(rd,gid,round_no,case round_no when 1 then 'Quarter Finals' when 2 then 'Semi Finals' else 'Grand Final' end);
    for match_no in 1..(8/power(2,round_no)::integer) loop
      insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,
        player_one_slot,player_two_slot,player_one_registration_id,player_two_registration_id,
        status,series_best_of,activation_version,activated_at,deadline_at)
      values(pg_temp.fd_id(division||'-match-'||round_no,event,match_no),gid,rd,match_no,
        case when round_no=1 then match_no*2-1 end,case when round_no=1 then match_no*2 end,
        case when round_no=1 then pg_temp.fd_id(division||'-registration',event,match_no*2-1) end,
        case when round_no=1 then pg_temp.fd_id(division||'-registration',event,match_no*2) end,
        case when round_no=1 then 'in_progress' else 'scheduled' end,
        case when round_no=3 then 5 else 3 end,case when round_no=1 then 1 else 0 end,
        case when round_no=1 then now() end,case when round_no=1 then now()+interval '1 day' end);
    end loop;
  end loop;
  perform set_config('session_replication_role','origin',true);
  return bid;
end $$;

create function pg_temp.fd_play(event integer,division text,p_limit integer default 7)
returns void language plpgsql as $$
declare m record; played integer:=0;
begin
  loop
    select tm.* into m from public.tournament_matches tm
    join public.bracket_rounds r on r.id=tm.round_id
    where tm.generated_bracket_id=pg_temp.fd_id(division||'-generated',event)
      and tm.status='in_progress' and tm.player_one_registration_id is not null
      and tm.player_two_registration_id is not null
    order by r.round_number,tm.match_number limit 1;
    exit when not found;
    perform public.apply_admin_official_match_result_api(m.id,m.series_best_of/2+1,0,m.player_one_registration_id,'local-four-division-admin');
    played:=played+1;
    exit when played=p_limit;
  end loop;
  if p_limit<7 then
    perform pg_temp.fd_assert(played=p_limit,'race setup failed to complete expected preliminary matches');
    return;
  end if;
  perform pg_temp.fd_assert(played=7,'full eight-player '||division||' bracket did not play seven matches');
  perform pg_temp.fd_assert(public.is_generated_bracket_complete(pg_temp.fd_id(division||'-generated',event)),'normal result advancement did not complete '||division);
  perform public.settle_leaderboard_division(pg_temp.fd_id(division,event),null);
end $$;

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
\if :{?prepare_races}
select pg_temp.fd_create(9,'Main');
select pg_temp.fd_create(9,'Pro');
select pg_temp.fd_play(9,'Main',6);
select pg_temp.fd_play(9,'Pro',6);
select pg_temp.fd_create(10,'Main');
select pg_temp.fd_play(10,'Main',6);
\endif
\if :{?persist}
commit;
\else
rollback;
\endif
