-- Synthetic loopback-only continuation recovery/privacy proof. Every write rolls back.
-- Run after the inert schema, app/legal gates and explicit transition activation.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
set local lock_timeout='5s';
set local statement_timeout='2min';
select pg_temp.fd_assert(inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal','bridge recovery proof requires the attested disposable loopback');
select pg_temp.fd_assert(not exists(select 1 from public.players where clerk_user_id not like 'local-consolidated-%'),'bridge recovery proof rejects non-synthetic identities');

create temporary table bridge_recovery_before as
select transition.season_id,transition.tournament_id,transition.tournament_bracket_id,
 (select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=transition.tournament_id) points,
 (select to_jsonb(membership) from public.leaderboard_tournament_season_memberships membership where membership.tournament_id=transition.tournament_id) membership,
 (select jsonb_agg(to_jsonb(settlement) order by settlement.tournament_bracket_id) from public.leaderboard_division_settlements settlement join public.tournament_brackets bracket on bracket.id=settlement.tournament_bracket_id where bracket.tournament_id=transition.tournament_id) settlements,
 (select jsonb_agg(to_jsonb(stats) order by stats.player_id) from public.leaderboard_player_season_stats stats where stats.season_id=transition.season_id and stats.bracket_type='main') main_stats,
 (select to_jsonb(tournament) from public.tournaments tournament where tournament.id=transition.tournament_id) tournament
from ironclad_private.legacy_main_pro_season_transition transition where transition.activated_at is not null;
select pg_temp.fd_assert((select count(*)=1 from bridge_recovery_before),'bridge recovery proof requires one activated exact mapping');
select pg_temp.fd_assert((select count(*)=45 and count(*) filter(where bracket_type='main')=15 and sum(points) filter(where bracket_type='main')=105 from public.leaderboard_point_events where tournament_id=(select tournament_id from bridge_recovery_before)),'synthetic preserved source must match genuine 45-row historical shape');

-- Recalculation must keep unchanged factual Main cache IDs/timestamps and evidence.
do $$ declare iteration integer; run_id uuid; begin
 for iteration in 1..3 loop
  run_id:=public.recalculate_leaderboard_for_season((select season_id from bridge_recovery_before),null);
  perform pg_temp.fd_assert((select status='completed' from public.leaderboard_recalculation_runs where id=run_id),'continued season recalculation did not complete');
  perform pg_temp.fd_assert((select main_stats=(select jsonb_agg(to_jsonb(stats) order by stats.player_id) from public.leaderboard_player_season_stats stats where stats.season_id=before.season_id and stats.bracket_type='main') from bridge_recovery_before before),'unchanged recalculation changed historical Main cache identity, timestamps or facts');
 end loop;
end $$;

-- Existing settlements are retried through the ordinary writer, never recreated.
do $$ declare bracket record; outcome jsonb; begin
 for bracket in select id from public.tournament_brackets where tournament_id=(select tournament_id from bridge_recovery_before) loop
  outcome:=public.settle_leaderboard_division(bracket.id,null);
  perform pg_temp.fd_assert(not (outcome->>'settlementCreated')::boolean and not (outcome->>'pointEventsChanged')::boolean and not (outcome->>'lateEntryBonusesChanged')::boolean,'historical settlement retry changed accounting evidence');
 end loop;
end $$;
select pg_temp.fd_assert(before.points=(select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=before.tournament_id) and before.membership=(select to_jsonb(membership) from public.leaderboard_tournament_season_memberships membership where membership.tournament_id=before.tournament_id) and before.settlements=(select jsonb_agg(to_jsonb(settlement) order by settlement.tournament_bracket_id) from public.leaderboard_division_settlements settlement join public.tournament_brackets bracket on bracket.id=settlement.tournament_bracket_id where bracket.tournament_id=before.tournament_id),'recalculation and settlement retries changed original point IDs, membership or settlement checksum') from bridge_recovery_before before;

-- Ordinary recovery must fail closed before rewriting the preserved contribution.
do $$ declare blocked boolean:=false; begin
 begin
  perform public.void_tournament((select tournament_id from bridge_recovery_before),'Synthetic proof must preserve transitional Event 1','local-consolidated-admin');
 exception when sqlstate '55000' then blocked:=sqlerrm='Transitional Event 1 membership is immutable'; end;
 perform pg_temp.fd_assert(blocked,'ordinary Void did not fail at immutable transitional membership');
end $$;
select pg_temp.fd_assert(before.tournament=(select to_jsonb(tournament) from public.tournaments tournament where tournament.id=before.tournament_id) and before.points=(select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=before.tournament_id) and before.membership=(select to_jsonb(membership) from public.leaderboard_tournament_season_memberships membership where membership.tournament_id=before.tournament_id),'failed source Void leaked tournament, point or membership changes') from bridge_recovery_before before;
do $$ declare blocked boolean:=false; begin
 begin delete from public.leaderboard_tournament_season_memberships where tournament_id=(select tournament_id from bridge_recovery_before);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'ordinary recovery removed transitional source membership');
 blocked:=false;
 begin update public.leaderboard_tournament_season_memberships set tournament_id=pg_temp.fd_id('event',299),qualifying_event_number=null where tournament_id=(select tournament_id from bridge_recovery_before);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'source membership identity remap bypassed original Event 1 protection');
 blocked:=false;
 begin update public.leaderboard_tournament_season_memberships set season_id=pg_temp.fd_id('season-remap',299),qualifying_event_number=null where tournament_id=(select tournament_id from bridge_recovery_before);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'source membership season remap bypassed original Event 1 protection');
 blocked:=false;
 begin update public.leaderboard_point_events set points=points+1 where tournament_id=(select tournament_id from bridge_recovery_before) and bracket_type='main';
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'ordinary recovery changed transitional source points');
 blocked:=false;
 begin update public.leaderboard_point_events set tournament_id=null,tournament_bracket_id=null,registration_id=null,bracket_type='challenge' where tournament_id=(select tournament_id from bridge_recovery_before) and bracket_type='main';
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'point identity/source remap bypassed original Event 1 protection');
 blocked:=false;
 begin delete from public.leaderboard_point_events where tournament_id=(select tournament_id from bridge_recovery_before);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'ordinary recovery deleted transitional source points');
 blocked:=false;
 begin
  insert into public.leaderboard_point_events(season_id,tournament_id,tournament_bracket_id,player_id,bracket_type,points,event_type,source)
  select season_id,tournament_id,tournament_bracket_id,pg_temp.fd_id('Main-player',0,1),'main',0,'participation','recalculation' from bridge_recovery_before;
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'ordinary recovery recreated transitional source scoring');
end $$;

-- Historical Main adjustments cannot become unscoped future official Pro facts.
do $$ declare blocked boolean:=false; begin
 begin
  insert into public.leaderboard_point_events(season_id,player_id,bracket_type,points,event_type,source,description)
  select season_id,pg_temp.fd_id('Main-player',0,1),'main',3,'admin_adjustment','admin','Synthetic unscoped historical adjustment' from bridge_recovery_before;
 exception when sqlstate '23514' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'unscoped historical Main adjustment was accepted');
 blocked:=false;
 begin
  perform public.add_leaderboard_admin_adjustment(before.season_id,pg_temp.fd_id('Main-player',0,1),'pro',3,'Synthetic Pro cannot originate from legacy Event 1',before.tournament_id,null,null,'local-consolidated-admin') from bridge_recovery_before before;
 exception when sqlstate '23514' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'public adjustment API fabricated a Pro source family against historical Event 1');
 blocked:=false;
 begin
  perform public.add_leaderboard_admin_adjustment(before.season_id,pg_temp.fd_id('Main-player',0,1),'main_progression',3,'Synthetic future Main cannot originate from legacy Event 1',before.tournament_id,null,null,'local-consolidated-admin') from bridge_recovery_before before;
 exception when sqlstate '23514' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'public adjustment API fabricated a future Main source family against historical Event 1');
end $$;

-- The existing public adjustment authority accepts genuine completed-event corrections.
-- This synthetic audited correction adds its own ledger row and changes no old fact.
create temporary table bridge_scoped_correction as
select public.add_leaderboard_admin_adjustment(before.season_id,pg_temp.fd_id('Main-player',0,1),'main',3,'Synthetic explicitly scoped historical correction',before.tournament_id,before.tournament_bracket_id,null,'local-consolidated-'||pg_temp.fd_id('Main-player',0,1)) point_id
from bridge_recovery_before before;
select pg_temp.fd_assert((select count(*)=1 and min(bracket_type)='main' and sum(points)=3 from public.leaderboard_point_events where id=(select point_id from bridge_scoped_correction)),'audited historical correction lost its factual Main scope');
select pg_temp.fd_assert(stats.total_points=(select sum(point.points) from public.leaderboard_point_events point where point.season_id=stats.season_id and point.player_id=stats.player_id and point.bracket_type='main'),'legitimate scoped correction was silently discarded by historical cache restoration') from public.leaderboard_player_season_stats stats where stats.season_id=(select season_id from bridge_recovery_before) and stats.player_id=pg_temp.fd_id('Main-player',0,1) and stats.bracket_type='main';
select pg_temp.fd_assert(official.total_points=(select sum(point.points) from public.leaderboard_point_events point where point.season_id=official.season_id and point.player_id=official.player_id and point.bracket_type in ('main','pro')),'official Pro projection discarded the scoped historical contribution') from ironclad_private.leaderboard_official_season_standings official where official.season_id=(select season_id from bridge_recovery_before) and official.player_id=pg_temp.fd_id('Main-player',0,1);
select pg_temp.fd_assert(before.points=(select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=before.tournament_id and point.id<>(select point_id from bridge_scoped_correction)),'audited correction rewrote original historical point IDs or values') from bridge_recovery_before before;

-- One returning historical competitor now has a genuinely fresh Pro snapshot.
-- Only disposable new-event input identity is reused; old 1500 Main admission is unchanged.
create temporary table bridge_corrected_main_cache as select jsonb_agg(to_jsonb(stats) order by stats.player_id) main_stats from public.leaderboard_player_season_stats stats where stats.season_id=(select season_id from bridge_recovery_before) and stats.bracket_type='main';
set local ironclad.test_model='four_division_v1';
select pg_temp.fd_create(2,'Pro');
set local session_replication_role='replica';
update public.players set current_elo=1800 where id=pg_temp.fd_id('Main-player',0,1);
update public.registrations set profile_id=pg_temp.fd_id('Main-player',0,1),clerk_user_id='local-consolidated-'||pg_temp.fd_id('Main-player',0,1) where id=pg_temp.fd_id('Pro-registration',2,1);
set local session_replication_role='origin';
select pg_temp.fd_assert((select elo_verified_elo=1500 and elo_verified_division='Main / Pro' and elo_calculation_version='relic-highest-1v1-v1' from public.registrations where id=pg_temp.fd_id('Main-registration',1,1)) and (select elo_verified_elo=1800 and elo_verified_division='Pro' and elo_calculation_version='relic-highest-1v1-v2' from public.registrations where id=pg_temp.fd_id('Pro-registration',2,1)),'returning competitor fixture must retain old admission and use a distinct fresh Pro eligibility snapshot');
select pg_temp.fd_play(2,'Pro');
select pg_temp.fd_assert((select qualifying_event_number=2 and scored_at is not null and voided_at is null and season_id=(select season_id from bridge_recovery_before) from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',2)),'genuine returning competitor event did not consume exactly continued Pro slot 2');
select pg_temp.fd_assert((select count(*)=1 and sum(total_points)=(select sum(point.points) from public.leaderboard_point_events point where point.season_id=(select season_id from bridge_recovery_before) and point.player_id=pg_temp.fd_id('Main-player',0,1) and point.bracket_type in ('main','pro')) and sum(tournaments_played)=2 from ironclad_private.leaderboard_official_season_standings where season_id=(select season_id from bridge_recovery_before) and player_id=pg_temp.fd_id('Main-player',0,1)),'returning competitor must have one official standing summing both genuine source families');
select pg_temp.fd_assert((select main_stats=(select jsonb_agg(to_jsonb(stats) order by stats.player_id) from public.leaderboard_player_season_stats stats where stats.season_id=(select season_id from bridge_recovery_before) and stats.bracket_type='main') from bridge_corrected_main_cache),'new Pro scoring changed the stable corrected historical Main cache');
select pg_temp.fd_assert((select total_points=(select sum(point.points) from public.leaderboard_point_events point where point.player_id=stats.player_id and point.bracket_type='main') from public.leaderboard_player_all_time_stats stats where player_id=pg_temp.fd_id('Main-player',0,1) and bracket_type='main') and (select total_points=(select sum(point.points) from public.leaderboard_point_events point where point.player_id=stats.player_id and point.bracket_type='pro') from public.leaderboard_player_all_time_stats stats where player_id=pg_temp.fd_id('Main-player',0,1) and bracket_type='pro'),'all-time career accounting must keep historical Main and future Pro source families separate');
select pg_temp.fd_assert((select finalized_at is null and official_bracket_type='main' from public.leaderboard_seasons where id=(select season_id from bridge_recovery_before)) and not exists(select 1 from public.leaderboard_season_champions where season_id=(select season_id from bridge_recovery_before)),'two genuine continued events cannot finalize or create champion authority');

-- The cached legacy editor cannot strip a new unlaunched Pro division.
-- Unlike a launched fixture, this event has no protected bracket children to mask the hole.
do $$ declare event_id uuid; before_event jsonb; before_brackets jsonb; blocked boolean:=false; begin
 event_id:=public.save_tournament(null,'Local cached bridge edit proof','local-cached-bridge-edit-proof','','',null,null,null,null,'upcoming','1v1','','','',false,null,'format_a',30,
 '[{"name":"Academy","elo_rules":"0-1099 ELO","max_players":8},{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8},{"name":"Main","elo_rules":"1400-1699 ELO","max_players":8},{"name":"Pro","elo_rules":"1700+ ELO","max_players":8}]'::jsonb,'four_division_v1');
 select to_jsonb(tournament) into before_event from public.tournaments tournament where id=event_id;
 select jsonb_agg(to_jsonb(bracket) order by bracket.id) into before_brackets from public.tournament_brackets bracket where tournament_id=event_id;
 begin
  perform public.save_tournament(event_id,'Local cached bridge edit proof','local-cached-bridge-edit-proof','','',null,null,null,null,'upcoming','1v1','','','',false,null,'format_a',30,
   '[{"name":"Academy","elo_rules":"Below 1100 ELO","max_players":8},{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8},{"name":"Main","elo_rules":"1400+ ELO","max_players":8}]'::jsonb);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'cached legacy editor edited a four-model event without explicit model authority');
 perform pg_temp.fd_assert(before_event=(select to_jsonb(tournament) from public.tournaments tournament where id=event_id) and before_brackets=(select jsonb_agg(to_jsonb(bracket) order by bracket.id) from public.tournament_brackets bracket where tournament_id=event_id),'rejected cached editor changed future event or removed its unlaunched Pro division');
end $$;

-- The mapping and true-identity projection remain inaccessible to application roles.
select pg_temp.fd_assert(not has_table_privilege('anon','ironclad_private.legacy_main_pro_season_transition','select') and not has_table_privilege('authenticated','ironclad_private.legacy_main_pro_season_transition','select') and not has_table_privilege('service_role','ironclad_private.legacy_main_pro_season_transition','select'),'private exact mapping grants leaked');
select pg_temp.fd_assert(not has_table_privilege('anon','ironclad_private.leaderboard_official_season_standings','select') and not has_table_privilege('authenticated','ironclad_private.leaderboard_official_season_standings','select') and not has_table_privilege('service_role','ironclad_private.leaderboard_official_season_standings','select'),'private true-identity standings grants leaked');
select pg_temp.fd_assert(not has_function_privilege('service_role','ironclad_private.leaderboard_official_season_role(uuid)','execute') and not has_function_privilege('authenticated','ironclad_private.leaderboard_official_season_role(uuid)','execute') and not has_function_privilege('anon','ironclad_private.leaderboard_official_season_role(uuid)','execute'),'private season-role helper execution grants leaked');

-- Actor identity redaction is allowed only through existing trusted closure authority.
-- It must not become a scoring, source-family, scope or timestamp correction bypass.
create temporary table bridge_actor_before as select to_jsonb(point) point from public.leaderboard_point_events point where point.id=(select point_id from bridge_scoped_correction);
do $$ declare blocked boolean:=false; begin
 begin update public.leaderboard_point_events set created_by_clerk_user_id=null where id=(select point_id from bridge_scoped_correction);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'ordinary actor update bypassed transitional evidence protection');
end $$;
select set_config('ironclad.account_closure','on',true);
do $$ declare blocked boolean:=false; begin
 begin update public.leaderboard_point_events set created_by_clerk_user_id=null,points=points+1 where id=(select point_id from bridge_scoped_correction);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'trusted closure actor exception allowed a simultaneous scoring change');
 blocked:=false;
 begin update public.leaderboard_point_events set created_by_clerk_user_id='deleted:invalid-new-actor' where id=(select point_id from bridge_scoped_correction);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'trusted closure actor exception permitted an arbitrary new actor identity');
end $$;
update public.leaderboard_point_events set created_by_clerk_user_id=null where id=(select point_id from bridge_scoped_correction);
select pg_temp.fd_assert((before.point-'created_by_clerk_user_id')=(to_jsonb(point)-'created_by_clerk_user_id') and point.created_by_clerk_user_id is null,'trusted closure identity scrub changed competitive facts, scope, source or timestamp') from bridge_actor_before before cross join public.leaderboard_point_events point where point.id=(select point_id from bridge_scoped_correction);
-- Restore only this disposable local actor input, so actual closure must perform
-- the unchanged predecessor's deleted:UUID pseudonymization in the next section.
set local session_replication_role='replica';
update public.leaderboard_point_events set created_by_clerk_user_id='local-consolidated-'||pg_temp.fd_id('Main-player',0,1) where id=(select point_id from bridge_scoped_correction);
set local session_replication_role='origin';
select set_config('ironclad.account_closure','',true);

-- Public masking and internal competition identity are independent.
update public.players set public_profile_enabled=false,country='CA',region='North America',avatar_url='/synthetic-private-avatar.png' where id=pg_temp.fd_id('Main-player',0,1);
select pg_temp.fd_assert((select count(*)=1 from public.leaderboard_public_season_standings where season_id=(select season_id from bridge_recovery_before) and bracket_type='pro' and display_name='Local fixture 1' and player_id is null and country is null and region is null and current_elo is null and not has_avatar and avatar_url is null),'private profile leaked public identity in continued Pro projection');
select public.close_ironclad_player_account('local-consolidated-'||pg_temp.fd_id('Main-player',0,1));
select pg_temp.fd_assert((before.point-'created_by_clerk_user_id')=(to_jsonb(point)-'created_by_clerk_user_id') and point.created_by_clerk_user_id=player.clerk_user_id and player.account_closed_at is not null,'complete ordinary closure failed to scrub scoped correction actor while preserving competitive evidence') from bridge_actor_before before cross join public.leaderboard_point_events point join public.players player on player.id=point.player_id where point.id=(select point_id from bridge_scoped_correction);
select pg_temp.fd_assert((select count(*)=1 from public.leaderboard_public_season_standings where season_id=(select season_id from bridge_recovery_before) and bracket_type='pro' and display_name='Former Competitor' and in_game_name='Former Competitor' and player_id is null and country is null and region is null and current_elo is null and not has_avatar and avatar_url is null and last_tournament_id is null),'closed identity leaked through continued Pro public projection');
select pg_temp.fd_assert((select count(*)=1 from ironclad_private.leaderboard_official_season_standings where season_id=(select season_id from bridge_recovery_before) and player_id=pg_temp.fd_id('Main-player',0,1) and bracket_type='pro'),'privacy closure removed true competitive identity from private season authority');
select pg_temp.fd_assert((select count(*)=45 and sum(points) filter(where bracket_type='main')=105 from public.leaderboard_point_events where tournament_id=(select tournament_id from bridge_recovery_before) and id<>(select point_id from bridge_scoped_correction)),'privacy closure changed original 45 historical scoring rows');
rollback;
