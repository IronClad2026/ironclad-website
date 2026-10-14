-- Rollback-only public projection proof after approved synthetic bridge activation.
-- Real source rows/identities are never imported. Run on the genuine-shaped local baseline.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
set local lock_timeout='5s';
set local statement_timeout='2min';
select pg_temp.fd_assert(inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal','public privacy proof requires attested synthetic loopback');
select pg_temp.fd_assert(not exists(select 1 from public.players where clerk_user_id not like 'local-consolidated-%'),'public privacy proof rejects non-synthetic identities');
select pg_temp.fd_assert((select count(*)=1 from ironclad_private.legacy_main_pro_season_transition where activated_at is not null),'public privacy proof requires exactly one activated approved bridge');

create temporary table bridge_privacy_before as
select season.id, to_jsonb(season) as source_season,
  (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(event) order by event.id),'[]'::jsonb)::text,'UTF8')),'hex')
   from public.leaderboard_point_events event where event.season_id=season.id) as points_sha256,
  (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(membership) order by membership.tournament_id),'[]'::jsonb)::text,'UTF8')),'hex')
   from public.leaderboard_tournament_season_memberships membership where membership.season_id=season.id) as membership_sha256
from public.leaderboard_seasons season
join ironclad_private.legacy_main_pro_season_transition transition on transition.season_id=season.id and transition.activated_at is not null;
select pg_temp.fd_assert((select count(*)=1 and bool_and(source_season->>'official_bracket_type'='main') from bridge_privacy_before),'source season remains historical main');
select pg_temp.fd_assert((select count(*)=3 from public.leaderboard_player_season_stats where season_id=(select id from bridge_privacy_before) and bracket_type='main' and player_id in (pg_temp.fd_id('Main-player',0,1),pg_temp.fd_id('Main-player',0,3),pg_temp.fd_id('Main-player',0,4))),'three genuine-shaped historical competitors required');

-- Synthetic stale personal columns deliberately remain populated for the closed
-- competitor, proving the projection mask rather than relying on prior erasure.
update public.players set public_profile_enabled=true, display_name='Bridge Public Alias', in_game_name='Bridge Public Competition Name', country='Australia', region='Oceania', avatar_url='https://example.invalid/bridge-public-avatar'
where id=pg_temp.fd_id('Main-player',0,1);
update public.players set public_profile_enabled=false, display_name='Bridge Private Alias Must Stay Private', in_game_name='Bridge Private Competition Name', country='Italy', region='Europe', avatar_url='https://example.invalid/bridge-private-avatar'
where id=pg_temp.fd_id('Main-player',0,3);
set local ironclad.account_closure='on';
update public.players set public_profile_enabled=true, display_name='Bridge Closed Alias Must Stay Private', in_game_name='Bridge Closed Competition Name Must Stay Private', country='Canada', region='North America', avatar_url='https://example.invalid/bridge-closed-avatar', account_closed_at=clock_timestamp()
where id=pg_temp.fd_id('Main-player',0,4);
set local ironclad.account_closure='off';

create function pg_temp.bridge_private_projection_reads_denied()
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare denied integer:=0;
begin
  begin perform season_id from ironclad_private.legacy_main_pro_season_transition;
  exception when insufficient_privilege then denied:=denied+1; end;
  begin perform player_id from ironclad_private.leaderboard_official_season_standings;
  exception when insufficient_privilege then denied:=denied+1; end;
  begin perform ironclad_private.leaderboard_official_season_role('00000000-0000-4000-8000-000000000000'::uuid);
  exception when insufficient_privilege then denied:=denied+1; end;
  return denied=3;
end $$;

set local role anon;
select pg_temp.fd_assert(current_user='anon','public projection proof executes as actual anon');
select pg_temp.fd_assert(pg_temp.bridge_private_projection_reads_denied(),'anon cannot read private bridge/aggregate or execute private role helper');
select pg_temp.fd_assert((select official_bracket_type='pro' and has_legacy_main_transition and valid_qualifying_event_count=1 and name=year::text||' Pro Season '||season_number::text from public.leaderboard_current_season),'anon sees continuing Pro heading and factual 1/6 progress');
select pg_temp.fd_assert((select count(*)=2 and bool_and(display_name='Bridge Public Alias' and in_game_name='Bridge Public Competition Name' and country='Australia' and region='Oceania' and current_elo=1500 and has_avatar and avatar_url is null and last_tournament_bracket_type='main')
 from public.leaderboard_public_season_standings where player_id=pg_temp.fd_id('Main-player',0,1) and bracket_type in ('main','pro')),'public open profile appears in factual Main and derived Pro with mediated avatar and Main source');
select pg_temp.fd_assert((select count(*)=2 and bool_and(player_id is null and display_name='Bridge Private Competition Name' and country is null and region is null and current_elo is null and not has_avatar and avatar_url is null and last_tournament_bracket_type='main')
 from public.leaderboard_public_season_standings where in_game_name='Bridge Private Competition Name' and bracket_type in ('main','pro')),'opted-out profile keeps only factual competition name in Main and Pro');
select pg_temp.fd_assert((select count(*)=2 and bool_and(player_id is null and display_name='Former Competitor' and in_game_name='Former Competitor' and country is null and region is null and current_elo is null and not has_avatar and avatar_url is null and last_tournament_id is null)
 from public.leaderboard_public_season_standings where display_name='Former Competitor' and bracket_type in ('main','pro')),'closed profile is masked in factual Main and derived Pro even with stale populated columns');
select pg_temp.fd_assert(not exists(select 1 from public.leaderboard_public_season_standings public_row where to_jsonb(public_row)::text like '%Bridge Private Alias Must Stay Private%' or to_jsonb(public_row)::text like '%Bridge Closed Alias Must Stay Private%' or to_jsonb(public_row)::text like '%Bridge Closed Competition Name Must Stay Private%' or to_jsonb(public_row)::text like '%bridge-private-avatar%' or to_jsonb(public_row)::text like '%bridge-closed-avatar%'),'no stale private or closed personal values escape any public standing');
reset role;

set local role authenticated;
select pg_temp.fd_assert(current_user='authenticated' and pg_temp.bridge_private_projection_reads_denied(),'authenticated cannot read private bridge/aggregate or execute private role helper');
reset role;
set local role service_role;
select pg_temp.fd_assert(current_user='service_role' and pg_temp.bridge_private_projection_reads_denied(),'service_role bypassrls does not grant private bridge/aggregate/helper access');
reset role;

select pg_temp.fd_assert((select reloptions @> array['security_barrier=true','security_invoker=false'] from pg_class where oid='public.leaderboard_current_season'::regclass)
 and (select reloptions @> array['security_barrier=true','security_invoker=false'] from pg_class where oid='public.leaderboard_public_season_standings'::regclass),'both public projections preserve explicit privacy view options');
select pg_temp.fd_assert(not exists(select 1 from pg_attribute where attrelid='public.leaderboard_public_season_standings'::regclass and not attisdropped and attname in ('clerk_user_id','steam_id64','coh3_profile_id','account_closed_at','source_metadata')),'public standing column inventory has no new raw identity/private authority fields');
select pg_temp.fd_assert((select count(*)=1 and bool_and(to_jsonb(season)=before.source_season)
 from public.leaderboard_seasons season join bridge_privacy_before before on before.id=season.id),'derived heading/role never rewrites original season name or stored main family');
select pg_temp.fd_assert((select count(*)=1 and bool_and(before.points_sha256=(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(event) order by event.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.leaderboard_point_events event where event.season_id=before.id)
 and before.membership_sha256=(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(membership) order by membership.tournament_id),'[]'::jsonb)::text,'UTF8')),'hex') from public.leaderboard_tournament_season_memberships membership where membership.season_id=before.id))
 from bridge_privacy_before before),'privacy projection fixture does not rewrite source points or memberships');
select pg_temp.fd_assert((select bool_and(case when standing.bracket_type='main' then standing.season_name=season.name else standing.season_name=season.year::text||' Pro Season '||season.season_number::text end)
 from public.leaderboard_public_season_standings standing join public.leaderboard_seasons season on season.id=standing.season_id
 where season.id=(select id from bridge_privacy_before) and standing.bracket_type in ('main','pro')),'original Main rows retain historical season heading while only derived Pro rows display Pro');
rollback;
