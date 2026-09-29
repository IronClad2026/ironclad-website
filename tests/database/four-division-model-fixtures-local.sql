-- LOCAL ONLY, rollback-only: model boundaries, immutable history, exact fixtures,
-- normal registration snapshots, private provenance, and service-only grants.
begin;
set local client_min_messages=warning;
set local request.jwt.claims='{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"user_FourDivisionContract"}';
set local statement_timeout='120s';
do $$ begin
 if inet_server_addr() is distinct from '127.0.0.1'::inet and inet_server_addr() is distinct from '::1'::inet then raise exception 'Local database required'; end if;
end $$;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Four division contract: %',message; end if; end $$;
create function pg_temp.assert_rejects(statement text,message text) returns void language plpgsql as $$ declare rejected boolean:=false; begin begin execute statement; exception when others then rejected:=true; end; perform pg_temp.assert_true(rejected,message); end $$;
insert into vault.decrypted_secrets(name,decrypted_secret) values('ironclad_staging_synthetic_uat_fixture_secret',repeat('local-only-fixture-',4)) on conflict(name) do nothing;
do $$
declare r record; v_future uuid; v_legacy uuid; v_season uuid; v_pro uuid; v_main uuid; v_player uuid; v_alias text; v_definition record; v_result record; v_secret text; v_count integer; v_registration uuid; v_before jsonb; v_docs uuid[]; v_elo integer;
begin
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='ironclad_staging_synthetic_uat_fixture_secret';
 for r in select * from (values(0,'Academy'),(1099,'Academy'),(1100,'Challenge'),(1399,'Challenge'),(1400,'Main'),(1699,'Main'),(1700,'Pro'),(2100,'Pro')) v(elo,division) loop
  perform pg_temp.assert_true(ironclad_private.division_for_elo('four_division_v1',r.elo)=r.division,'future boundary '||r.elo);
 end loop;
 perform pg_temp.assert_true(ironclad_private.division_for_elo('legacy_three_v1',1700)='Main / Pro','historical top label');
 perform pg_temp.assert_rejects($q$select ironclad_private.division_for_elo('unknown',1700)$q$,'unknown model rejected');
 perform pg_temp.assert_rejects($q$select ironclad_private.division_for_elo('four_division_v1',null)$q$,'missing ELO rejected');
 perform pg_temp.assert_rejects($q$select ironclad_private.division_for_elo('four_division_v1',-1)$q$,'negative ELO rejected');
 perform pg_temp.assert_rejects($q$select ironclad_private.elo_calculation_model('unknown')$q$,'unknown version rejected');
 perform pg_temp.assert_true(ironclad_private.division_accounting_type('legacy_three_v1','Main')='main' and ironclad_private.division_accounting_type('four_division_v1','Main')='main_progression' and ironclad_private.division_accounting_type('four_division_v1','Pro')='pro','separate accounting identities');
 perform pg_temp.assert_rejects($q$select ironclad_private.division_accounting_type('legacy_three_v1','Pro')$q$,'legacy Pro rejected');
 perform pg_temp.assert_true(not has_function_privilege('anon','public.resolve_staging_synthetic_registration_elo(uuid,text,text,text)','execute') and not has_function_privilege('authenticated','public.resolve_staging_synthetic_registration_elo(uuid,text,text,text)','execute') and has_function_privilege('service_role','public.resolve_staging_synthetic_registration_elo(uuid,text,text,text)','execute'),'resolver service only');
 perform pg_temp.assert_true(not has_table_privilege('service_role','ironclad_private.staging_synthetic_uat_players','select') and not has_table_privilege('authenticated','ironclad_private.staging_synthetic_uat_enrolments','select'),'private provenance not exposed');
 v_future:=public.save_tournament(null,'Four Division Contract','four-division-contract','Local only','',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',null,'registration_open','1v1','',null,null,true,null,'format_a',30,'[{"name":"Main","elo_rules":"1400-1699 ELO","max_players":8},{"name":"Pro","elo_rules":"1700+ ELO","max_players":8}]','four_division_v1');
 select id into v_main from public.tournament_brackets where tournament_id=v_future and name='Main';
 select id into v_pro from public.tournament_brackets where tournament_id=v_future and name='Pro';
 perform pg_temp.assert_true(v_main is not null and v_pro is not null,'separate Main and Pro bracket creation');
 perform pg_temp.assert_rejects(format('update public.tournaments set division_model_version=%L where id=%L','legacy_three_v1',v_future),'event model immutable');
 perform pg_temp.assert_rejects(format('update public.tournament_brackets set elo_rules=%L where id=%L','1400+ ELO',v_main),'future broad upper range rejected');
 perform pg_temp.assert_rejects(format('update public.tournament_brackets set max_players=16 where id=%L',v_main),'future capacity fixed');
 perform pg_temp.assert_rejects(format($q$select public.save_tournament(%L,'Four Division Contract','four-division-contract','Local only','',null,null,null,null,'registration_open','1v1','',null,null,true,null,'format_a',30,'[{"name":"Main","elo_rules":"1400-1699 ELO","max_players":8}]')$q$,v_future),'stale future payload rejected before Pro deletion');
 perform pg_temp.assert_true(exists(select 1 from public.tournament_brackets where id=v_pro),'stale editor preserves Pro');
 -- Authorized fixture seed represents the pre-migration legacy event boundary.
 perform set_config('ironclad.staging_legacy_transition','on',true);
 insert into public.tournaments(title,slug,description,format,status,banner_image_url,prize_pool,registration_enabled,division_model_version) values('Legacy Contract','legacy-contract','Local only','1v1','registration_open','','',true,'legacy_three_v1') returning id into v_legacy;
 perform set_config('ironclad.staging_legacy_transition','off',true);
 insert into public.tournament_brackets(tournament_id,name,elo_rules,max_players) values(v_legacy,'Main','1400+ ELO',8);
 perform pg_temp.assert_rejects(format($q$select public.save_tournament(%L,'Four Division Contract','four-division-contract','Local only','',null,null,null,null,'registration_open','1v1','',null,null,true,null,'format_a',30,'[{"name":"Pro","elo_rules":"1700+ ELO","max_players":8}]','four_division_v1')$q$,v_future),'unresolved legacyMain blocks futurePro cycle');
 perform pg_temp.assert_rejects(format('insert into public.tournament_brackets(tournament_id,name,elo_rules,max_players) values(%L,%L,%L,8)',v_legacy,'Pro','1700+ ELO'),'legacy Pro bracket rejected');
 perform pg_temp.assert_rejects($q$insert into public.tournaments(title,slug,description,format,status,banner_image_url,prize_pool,division_model_version) values('Forbidden Legacy','forbidden-legacy','','1v1','upcoming','','','legacy_three_v1')$q$,'unguarded legacy creation rejected');
 insert into public.leaderboard_seasons(name,year,season_number,start_date,end_date,is_active,official_bracket_type) values('Local Legacy Season',2099,1,current_date,current_date,true,'main') returning id into v_season;
 perform pg_temp.assert_rejects(format('update public.leaderboard_seasons set official_bracket_type=%L where id=%L','pro',v_season),'season authority immutable');
 perform pg_temp.assert_rejects(format('insert into public.leaderboard_tournament_season_memberships(tournament_id,season_id,qualifying_event_number) values(%L,%L,1)',v_future,v_season),'future official event cannot join legacy season');
 perform pg_temp.assert_rejects($q$select ironclad_private.resolve_competition_leaderboard_season('four_division_v1',current_date,true)$q$,'future official waits for legacy completion');
 -- All original fixture ratings remain exact; only new identities are appended.
 for r in select * from (values('TestMain1',1400),('TestMain5',1600),('TestMain6',1700),('TestMain10',2200),('TestMain11',1625),('TestMain12',1650),('TestMain13',1675),('TestMain14',1699),('TestPro1',1701),('TestPro4',2100)) v(alias,elo) loop
  select synthetic_elo into v_elo from ironclad_private.staging_synthetic_uat_alias_definition(r.alias);
  perform pg_temp.assert_true(v_elo=r.elo,'immutable catalogue ELO '||r.alias);
 end loop;
 foreach v_alias in array array['TestMain1','TestMain6','TestMain11','TestMain14','TestPro1','TestPro4'] loop
  select * into v_result from public.provision_staging_synthetic_uat_player(v_secret,v_alias,'user_Four'||v_alias);
  v_player:=v_result.player_id;
  select * into v_definition from ironclad_private.staging_synthetic_registration_definition(v_alias,'four_division_v1');
  update public.players set steam_id64=v_definition.synthetic_steam_id64,steam_username=v_definition.synthetic_steam_username where id=v_player;
  select * into v_result from public.resolve_staging_synthetic_registration_elo(v_player,'user_Four'||v_alias,v_definition.synthetic_steam_id64,'four_division_v1');
  perform pg_temp.assert_true(v_result.elo=v_definition.synthetic_elo and v_result.division=v_definition.synthetic_division and v_result.calculation_version='staging-synthetic-v2','future synthetic resolver '||v_alias);
  select * into v_result from public.resolve_staging_synthetic_registration_elo(v_player,'user_Four'||v_alias,v_definition.synthetic_steam_id64,'legacy_three_v1');
  perform pg_temp.assert_true(v_result.division='Main / Pro' and v_result.calculation_version='staging-synthetic-v1','legacy synthetic resolver '||v_alias);
  perform pg_temp.assert_true(not exists(select 1 from public.resolve_staging_synthetic_registration_elo(v_player,'user_Wrong',v_definition.synthetic_steam_id64,'four_division_v1')),'resolver identity mismatch');
  select to_jsonb(p) into v_before from public.players p where id=v_player;
  perform public.provision_staging_synthetic_uat_player(v_secret,v_alias,'user_Four'||v_alias);
  perform pg_temp.assert_true((select steam_id64=v_definition.synthetic_steam_id64 from public.players where id=v_player),'provision preserves prepared identity');
  select * into v_result from public.inspect_staging_synthetic_uat_player(v_secret,v_alias);
  perform pg_temp.assert_true(not v_result.has_steam_identity and not v_result.has_provider_facts,'synthetic never claims real provider authority');
 end loop;
 -- Current documents are test-local immutable records.
 insert into public.legal_documents(document_kind,version,immutable_url,status,published_at,effective_at,sha256)
 select kind,'LOCAL-FOUR-'||kind,'https://example.invalid/local-four/'||kind,'effective',now()-interval '2 minutes',now()-interval '1 minute',repeat('a',64) from unnest(array['rulebook','ppa','terms','privacy']) kind;
 select array_agg(id order by array_position(array['rulebook','ppa','terms','privacy'],document_kind)) into v_docs from public.legal_documents where version like 'LOCAL-FOUR-%';
 select player_id into v_player from ironclad_private.staging_synthetic_uat_players where approved_alias='TestMain11';
 select * into v_definition from ironclad_private.staging_synthetic_registration_definition('TestMain11','four_division_v1');
 select * into v_result from public.submit_verified_player_registration(v_player,'user_FourTestMain11',v_definition.synthetic_steam_id64,v_future,v_main,1625,'US Forces','Main','staging-synthetic-v2',v_docs[1],v_docs[2],v_docs[3],v_docs[4],true,true,true,true,true,true,false);
 v_registration:=v_result.id;
 perform pg_temp.assert_true(v_registration is not null,'normal synthetic registration returns id');
 perform pg_temp.assert_true((select submitted_elo=1625 and elo_verified_division='Main' and elo_calculation_version='staging-synthetic-v2' and registration_provenance='staging_synthetic_uat' and fixture_contract_version='staging-synthetic-v2' from public.registrations where id=v_registration),'future registration exact snapshot');
 perform pg_temp.assert_true((select not linked_steam_account_confirmed from public.registration_acceptances where registration_id=v_registration),'synthetic cannot assert linked Steam legal confirmation');
 perform pg_temp.assert_true((select synthetic_elo=1625 and synthetic_division='Main' and contract_version='staging-synthetic-v2' and not steam_openid_verified and not steam_ownership_verified and not relic_live_lookup_verified and not linked_steam_legal_confirmation from ironclad_private.staging_synthetic_uat_enrolments where registration_id=v_registration),'private enrollment exact evidence');
 perform pg_temp.assert_rejects(format('update public.registrations set tournament_bracket_id=%L where id=%L',v_pro,v_registration),'registration identity and division immutable');
 perform pg_temp.assert_rejects(format('update public.registrations set elo_calculation_version=%L where id=%L','staging-synthetic-v1',v_registration),'snapshot version immutable');
 select * into v_result from public.enrol_staging_synthetic_uat_player(v_secret,'TestPro1',v_future,v_pro,false);
 perform pg_temp.assert_true(v_result.synthetic_division='Pro' and v_result.contract_version='staging-synthetic-v2','CLI effective contract');
 select * into v_result from public.enrol_staging_synthetic_uat_player(v_secret,'TestPro1',v_future,v_pro,false);
 perform pg_temp.assert_true(not v_result.created and v_result.synthetic_division='Pro' and v_result.contract_version='staging-synthetic-v2','CLI retry preserves contract');
 perform pg_temp.assert_rejects(format('select public.enrol_staging_synthetic_uat_player(%L,%L,%L,%L,false)',v_secret,'TestMain6',v_future,v_main),'legacy named Main1700 classifies future Pro');
 perform set_config('request.jwt.claims','{"role":"service_role","ref":"not-staging"}',true);
 perform pg_temp.assert_rejects(format('select * from public.resolve_staging_synthetic_registration_elo(%L,%L,%L,%L)',v_player,'user_FourTestMain11',v_definition.synthetic_steam_id64,'four_division_v1'),'synthetic resolver rejects nonStaging');
 raise notice 'Four division boundaries and fixtures passed';
end $$;
rollback;


-- The minimum legacy creator is retry-safe and stamps private provenance.
begin;
set local request.jwt.claims='{"role":"service_role","ref":"zzbnneprhjicmajpjkdg"}';
insert into vault.decrypted_secrets(name,decrypted_secret) values('ironclad_staging_synthetic_uat_fixture_secret',repeat('local-only-fixture-',4)) on conflict(name) do nothing;
do $$ declare v_id uuid; v_again uuid; v_secret text; begin
 if inet_server_addr() is distinct from '127.0.0.1'::inet and inet_server_addr() is distinct from '::1'::inet then raise exception 'Local database required'; end if;
 insert into public.leaderboard_seasons(name,year,season_number,start_date,end_date,is_active,official_bracket_type) values('Local legacy creator',2099,1,current_date,current_date,true,'main');
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='ironclad_staging_synthetic_uat_fixture_secret';
 v_id:=public.create_staging_legacy_transition_tournament(v_secret,'staging-synthetic-legacy-transition-local-contract','Local creator contract');
 v_again:=public.create_staging_legacy_transition_tournament(v_secret,'staging-synthetic-legacy-transition-local-contract','Local creator contract');
 if v_id is distinct from v_again then raise exception 'Creator not idempotent'; end if;
 if not exists(select 1 from ironclad_private.staging_legacy_transition_events where tournament_id=v_id) then raise exception 'Private transition marker missing'; end if;
 if not exists(select 1 from public.tournaments where id=v_id and division_model_version='legacy_three_v1' and banner_image_url='') then raise exception 'Legacy creator contract changed'; end if;
end $$;
rollback;

begin;
set local role anon;
select division_model_version from public.tournaments limit 0;
select official_bracket_type,valid_qualifying_event_count from public.leaderboard_current_season limit 0;
rollback;
begin;
set local role authenticated;
select division_model_version from public.tournaments limit 0;
select official_bracket_type,valid_qualifying_event_count from public.leaderboard_current_season limit 0;
rollback;
