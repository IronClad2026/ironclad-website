-- Synthetic loopback-only parent-completion proof; all future competition writes roll back.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
set local ironclad.test_model='four_division_v1';
set local lock_timeout='5s';
set local statement_timeout='2min';
select pg_temp.fd_assert(inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal','parent-completion proof requires the attested disposable loopback');
select pg_temp.fd_assert(not exists(select 1 from public.players where clerk_user_id not like 'local-consolidated-%'),'parent-completion proof rejects non-synthetic identities');
create temporary table bridge_completion_source as
select transition.season_id,transition.tournament_id,
 (select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=transition.tournament_id) points,
 (select to_jsonb(membership) from public.leaderboard_tournament_season_memberships membership where membership.tournament_id=transition.tournament_id) membership
from ironclad_private.legacy_main_pro_season_transition transition where transition.activated_at is not null;
select pg_temp.fd_assert((select count(*)=1 from bridge_completion_source),'parent-completion proof requires exactly one activated continuation');

do $$ declare event integer; begin
 for event in 2..5 loop
  perform pg_temp.fd_create(event,'Pro');
  perform pg_temp.fd_play(event,'Pro');
 end loop;
end $$;
select pg_temp.fd_assert((select valid_qualifying_event_count=5 and valid_main_event_count=5 and not is_finalized from public.leaderboard_current_season),'five complete genuine events must report factual 5/6 progress');
create temporary table bridge_completion_five as select jsonb_agg(to_jsonb(standing) order by standing.player_id) official_standings from ironclad_private.leaderboard_official_season_standings standing where standing.season_id=(select season_id from bridge_completion_source);

-- Slot6 has genuine completed Pro competition, but its launched sibling is unfinished.
select pg_temp.fd_create(6,'Academy');
select pg_temp.fd_create(6,'Pro');
select pg_temp.fd_play(6,'Pro');
select pg_temp.fd_assert((select status='in_progress' from public.tournaments where id=pg_temp.fd_id('event',6)),'unfinished Academy sibling must keep the parent event in progress');
select pg_temp.fd_assert((select qualifying_event_number=6 and scored_at is not null and voided_at is null from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',6)),'sixth Pro division must hold its genuine numbered membership without fabricating parent completion');
select pg_temp.fd_assert((select valid_qualifying_event_count=5 and valid_main_event_count=5 and not is_finalized from public.leaderboard_current_season),'unfinished sibling must keep official progress at5/6');
select pg_temp.fd_assert((select finalized_at is null from public.leaderboard_seasons where id=(select season_id from bridge_completion_source)) and not exists(select 1 from public.leaderboard_season_champions where season_id=(select season_id from bridge_completion_source)),'sixth Pro division cannot prematurely finalize or award a season champion');
select pg_temp.fd_assert((select official_standings=(select jsonb_agg(to_jsonb(standing) order by standing.player_id) from ironclad_private.leaderboard_official_season_standings standing where standing.season_id=(select season_id from bridge_completion_source)) from bridge_completion_five),'incomplete parent event contributed provisional Pro points or rank to official standings');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_seasons where official_bracket_type='pro'),'unfinished sixth parent opened a premature Pro successor');
do $$ declare blocked boolean:=false; begin
 begin perform public.get_or_create_leaderboard_season(current_date);
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'getter manufactured a successor before genuine sixth parent completion');
end $$;

-- A separate genuine Main-only completion cannot replace the missing sixth Pro event.
select pg_temp.fd_create(7,'Main');
select pg_temp.fd_play(7,'Main');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_tournament_season_memberships where tournament_id=pg_temp.fd_id('event',7) and qualifying_event_number is not null),'Main-only event consumed an official Pro season slot');
select pg_temp.fd_assert((select valid_qualifying_event_count=5 and not is_finalized from public.leaderboard_current_season),'Main-only completion incremented valid official Pro progress');
select pg_temp.fd_assert((select official_standings=(select jsonb_agg(to_jsonb(standing) order by standing.player_id) from ironclad_private.leaderboard_official_season_standings standing where standing.season_id=(select season_id from bridge_completion_source)) from bridge_completion_five),'Main progression points leaked into continued official Pro standings');

-- The ordinary final sibling result/settlement supplies parent completion.
-- Flush the commit-time constraint trigger inside this rollback proof.
select pg_temp.fd_play(6,'Academy');
set constraints finalize_pro_season_event_completion immediate;
select pg_temp.fd_assert((select status='completed' and first_completed_at is not null from public.tournaments where id=pg_temp.fd_id('event',6)),'normal final sibling did not complete the sixth parent event');
select pg_temp.fd_assert((select finalized_at is not null and not is_active and official_bracket_type='main' from public.leaderboard_seasons where id=(select season_id from bridge_completion_source)),'six genuine parent completions did not finalize the unchanged historical Main season');
select pg_temp.fd_assert((select count(*)=1 from public.leaderboard_seasons where official_bracket_type='pro' and is_active and finalized_at is null),'six genuine parent completions must open exactly one fresh Pro successor');
select pg_temp.fd_assert((select count(*)>0 and bool_and(bracket_type='pro') from public.leaderboard_season_champions where season_id=(select season_id from bridge_completion_source)),'genuine completed continued season did not create the official Pro champion snapshot');
select pg_temp.fd_assert(champion.final_points=standing.total_points and champion.final_rank=standing.current_rank,'final champion differs from completed-source official standing') from public.leaderboard_season_champions champion join ironclad_private.leaderboard_official_season_standings standing on standing.season_id=champion.season_id and standing.player_id=champion.player_id and standing.bracket_type=champion.bracket_type where champion.season_id=(select season_id from bridge_completion_source);
select pg_temp.fd_assert(source.points=(select jsonb_agg(to_jsonb(point) order by point.id) from public.leaderboard_point_events point where point.tournament_id=source.tournament_id) and source.membership=(select to_jsonb(membership) from public.leaderboard_tournament_season_memberships membership where membership.tournament_id=source.tournament_id),'parent-completion recovery rewrote original Main event evidence') from bridge_completion_source source;
rollback;
