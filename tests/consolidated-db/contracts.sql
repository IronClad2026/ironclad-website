-- Local-only runtime assertions; rollback every changed fixture/configuration.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
select pg_temp.fd_assert(not public.player_showcase_enabled() and not public.player_combat_highlights_enabled(),'new optional features disabled');
select pg_temp.fd_assert((select division_model_version='legacy_three_v1' from public.tournaments where id=pg_temp.fd_id('event',1)),'historic event version immutable legacy');
select pg_temp.fd_assert((select bool_and(official_bracket_type='main') from public.leaderboard_seasons),'historic seasons remain Main');
select pg_temp.fd_assert((select count(*)=2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_tournament'),'old and explicit-model editor RPC coexist during cutover');
select pg_temp.fd_assert((select reloptions @> array['security_barrier=true','security_invoker=false'] from pg_class where oid='public.leaderboard_current_season'::regclass),'current season projection security preserved');
select pg_temp.fd_assert(ironclad_private.division_for_elo('four_division_v1',1099)='Academy'
 and ironclad_private.division_for_elo('four_division_v1',1100)='Challenge'
 and ironclad_private.division_for_elo('four_division_v1',1399)='Challenge'
 and ironclad_private.division_for_elo('four_division_v1',1400)='Main'
 and ironclad_private.division_for_elo('four_division_v1',1699)='Main'
 and ironclad_private.division_for_elo('four_division_v1',1700)='Pro'
 and ironclad_private.division_for_elo('legacy_three_v1',1700)='Main / Pro','exact rating boundaries and legacy interpretation');
do $$ declare blocked boolean; begin
 blocked:=false; begin perform ironclad_private.elo_calculation_model('unknown-provider-version'); exception when sqlstate '22023' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'unknown provider model fails closed');
 blocked:=false; begin update public.tournaments set division_model_version='four_division_v1' where id=pg_temp.fd_id('event',1); exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'event cannot reinterpret legacy as four');
 blocked:=false; begin update public.leaderboard_seasons set official_bracket_type='pro'; exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'season cannot reinterpret Main as Pro');
 blocked:=false; begin perform ironclad_private.resolve_competition_leaderboard_season('four_division_v1',current_date,true); exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'partial legacy season cannot silently become Pro');
 blocked:=false; begin perform public.save_tournament(null,'Local future event','local-future-preflight-stop','','',null,null,null,null,'draft','1v1','','','',false,null,'format_a',30,
 '[{"name":"Academy","elo_rules":"Below 1100 ELO","max_players":8}]'::jsonb,'four_division_v1'); exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked,'new event creation gates unresolved legacy Main transition');
end $$;
select pg_temp.fd_assert(not has_function_privilege('authenticated','public.complete_player_combat_highlight_upload(uuid,jsonb)','EXECUTE')
 and has_function_privilege('service_role','public.complete_player_combat_highlight_upload(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.moderate_player_combat_highlight(uuid,smallint,boolean,text,bigint)','EXECUTE')
 and not has_function_privilege('anon','public.save_my_player_showcase_thought(text,bigint)','EXECUTE'),'owner/service/public mutation grants bounded');
select pg_temp.fd_assert(not has_column_privilege('authenticated','public.players','account_closed_at','SELECT') and not has_column_privilege('authenticated','public.players','steam_id64','SELECT'),'private closure/Steam fields ungranted despite owner RLS');
select pg_temp.fd_assert(ironclad_private.player_showcase_has_current_legal_acceptance('local-consolidated-'||pg_temp.fd_id('Main-player',0,1)),'Showcase current acceptance follows Production Privacy1.3');
select pg_temp.fd_assert((select definition like '%close_ironclad_player_account_without_showcase_cleanup%' from (select pg_get_functiondef('public.close_ironclad_player_account_without_combat_highlights(text)'::regprocedure) definition) d)
 and (select definition like '%close_ironclad_player_account_without_room_episodes%' from (select pg_get_functiondef('public.close_ironclad_player_account_without_showcase_cleanup(text)'::regprocedure) definition) d),'full pre-existing Production closure chain retained');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','local-consolidated-'||pg_temp.fd_id('Main-player',0,1))::text,true);
set local role authenticated;
select pg_temp.fd_assert(public.save_my_player_showcase_thought('Local thought',0)->>'code'='feature-disabled','disabled Showcase fails closed');
reset role;
update public.platform_settings set value='{"enabled":true}' where key='player_showcase';
set local role authenticated;
select pg_temp.fd_assert(public.save_my_player_showcase_thought('Local thought',0)->>'code'='saved','current Privacy1.3 owner may save');
select pg_temp.fd_assert(public.save_my_player_showcase_thought('Stale overwrite',0)->>'code'='conflict','Showcase stale revision CAS blocked');
select pg_temp.fd_assert((select count(*)=1 from public.player_showcases),'owner RLS compiles without private identity grants');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','local-consolidated-'||pg_temp.fd_id('Main-player',0,2))::text,true);
set local role authenticated;
select pg_temp.fd_assert((select count(*)=0 from public.player_showcases),'another owner cannot read thought');
reset role;
select pg_temp.fd_assert((select count(*)=3 from pg_policy where polrelid='realtime.messages'::regclass and polname like 'match_room_%'),'private receive and restrictive client-send guard installed');
select pg_temp.fd_assert(not ironclad_private.can_receive_match_room_realtime('match-room:invalid:1'),'forged realtime topic fails closed');
select pg_temp.fd_assert(not exists(select 1 from pg_publication_tables where schemaname='public' and tablename in ('match_messages','match_rooms')),'private content never published');
rollback;
