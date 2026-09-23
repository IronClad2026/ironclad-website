-- Rollback-only hardening contract. Local or explicitly approved Staging only.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local client_min_messages = warning;

create temporary table match_room_test_results (name text primary key);
create temporary table match_room_test_state (name text primary key, value jsonb);
do $$ begin
  execute format('grant usage on schema %I to authenticated, anon, service_role',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
end $$;
grant select, insert, update on match_room_test_results, match_room_test_state
  to authenticated, anon, service_role;

create function pg_temp.mr_id(p_n integer) returns uuid
language sql immutable as $$
  select ('d19a0000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
create function pg_temp.mr_assert(p_ok boolean, p_name text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'MATCH ROOM TEST FAILED: %', p_name; end if;
  insert into match_room_test_results values (p_name);
end;
$$;
create function pg_temp.mr_error(p_sql text, p_state text, p_name text) returns void
language plpgsql as $$
declare v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception 'MATCH ROOM TEST FAILED: %: expected %, got % (%)', p_name, p_state, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.mr_assert(v_failed, p_name);
end;
$$;
create function pg_temp.mr_actor(p_subject text, p_admin boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role', current_user, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', current_user, 'sub', p_subject,
    'metadata', jsonb_build_object('role', case when p_admin then 'admin' else 'player' end)
  )::text, true);
end;
$$;
create function pg_temp.mr_room(p_name text) returns uuid
language sql stable as $$ select (value -> 'room' ->> 'id')::uuid from match_room_test_state where name = p_name $$;

select pg_temp.mr_assert(not exists (
  select 1 from public.tournaments where id in (pg_temp.mr_id(1), pg_temp.mr_id(2), pg_temp.mr_id(3))
), 'fixture namespace is unused');

-- Keep foreign keys and CHECK constraints active. Only synthetic fixture setup
-- suppresses user/domain triggers; all are restored before the first RPC.
alter table public.players disable trigger user;
alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;
alter table public.match_result_report_groups disable trigger user;
alter table public.account_legal_acceptances disable trigger user;

-- A replay may have no published legal documents. Reuse the effective hosted
-- pair when present; do not alter existing documents or acceptance records.
insert into public.legal_documents (id, document_kind, version, immutable_url, status, published_at, effective_at, sha256)
select pg_temp.mr_id(500 + n), kind, 'match-room-rollback-test',
  'https://match-room-test.invalid/' || kind || '.pdf', 'effective',
  now() - interval '2 days', now() - interval '1 day', repeat('a', 64)
from (values (1, 'terms'), (2, 'privacy')) as x(n, kind)
where not exists (select 1 from public.legal_documents d where d.document_kind = x.kind and d.status = 'effective');

insert into public.players (id, clerk_user_id, display_name, in_game_name, profile_completed, current_elo)
select pg_temp.mr_id(100 + n), 'match-room-test-' || n, 'Room Test ' || n, 'Room Test ' || n, true, 1000
from generate_series(1, 4) n;
insert into public.account_legal_acceptances (
  clerk_user_id, terms_document_id, terms_version, terms_url, terms_sha256,
  privacy_document_id, privacy_version, privacy_url, privacy_sha256,
  terms_accepted, privacy_acknowledged
)
select 'match-room-test-' || n, t.id, t.version, t.immutable_url, t.sha256,
  p.id, p.version, p.immutable_url, p.sha256, true, true
from generate_series(1, 4) n
cross join public.legal_documents t cross join public.legal_documents p
where t.document_kind = 'terms' and t.status = 'effective'
  and p.document_kind = 'privacy' and p.status = 'effective';

insert into public.tournaments (id, title, slug, format, status, description, banner_image_url, prize_pool, registration_enabled)
select pg_temp.mr_id(n), 'Match Room Test ' || n, 'match-room-rollback-' || n, '1v1',
  case when n = 3 then 'registration_open' else 'in_progress' end,
  'Rollback-only Match Room fixture', '', '', n = 3
from generate_series(1, 4) n;
insert into public.tournament_brackets (id, tournament_id, name, elo_rules, max_players, launched_at)
select pg_temp.mr_id(10 + n), pg_temp.mr_id(n), 'Academy', '0-1099', 8,
  case when n <> 3 then now() - interval '1 hour' end
from generate_series(1, 4) n;
insert into public.registrations (
  id, profile_id, clerk_user_id, player_name, tournament_title, bracket_name,
  registration_status, elo_status, submitted_elo, tournament_id, tournament_bracket_id,
  elo_verified_elo, elo_highest_faction, elo_checked_mode, elo_checked_at,
  elo_verification_source, elo_verified_division, elo_calculation_version
)
select pg_temp.mr_id(200 + (event_n - 1) * 10 + player_n), pg_temp.mr_id(100 + player_n),
  'match-room-test-' || player_n, 'Room Test ' || player_n, 'Match Room Test ' || event_n,
  'Academy', 'approved', 'verified', 1000, pg_temp.mr_id(event_n), pg_temp.mr_id(10 + event_n),
  1000, 'US Forces', '1v1', now(), 'relic', 'Academy', 'match-room-test'
from generate_series(1, 4) event_n cross join generate_series(1, 3) player_n;
insert into public.generated_brackets (id, tournament_bracket_id, format, participant_count, slot_count, generated_by, competition_locked_at)
select pg_temp.mr_id(20 + n), pg_temp.mr_id(10 + n),
  case when n = 2 then 'round_robin' else 'single_elimination' end, 8, 8,
  'match-room-test-4', case when n <> 3 then now() end
from generate_series(1, 4) n;
insert into public.bracket_rounds (id, generated_bracket_id, round_number, name)
select pg_temp.mr_id(30 + n), pg_temp.mr_id(20 + n), 1, 'Room Test Final'
from generate_series(1, 4) n;
insert into public.tournament_matches (
  id, generated_bracket_id, round_id, match_number,
  player_one_registration_id, player_two_registration_id, status, series_best_of,
  activation_version, activated_at, deadline_at
)
select pg_temp.mr_id(300 + (n - 1) * 10 + 1), pg_temp.mr_id(20 + n), pg_temp.mr_id(30 + n), 1,
  pg_temp.mr_id(200 + (n - 1) * 10 + 1), pg_temp.mr_id(200 + (n - 1) * 10 + 2),
  case when n = 1 then 'in_progress' else 'scheduled' end, 3,
  case when n = 1 then 1 else 0 end,
  case when n = 1 then now() - interval '1 hour' end,
  case when n = 1 then now() + interval '1 day' end
from generate_series(1, 4) n;
insert into public.tournament_matches (
  id, generated_bracket_id, round_id, match_number, player_one_registration_id, status, series_best_of
) values (pg_temp.mr_id(302), pg_temp.mr_id(21), pg_temp.mr_id(31), 2, pg_temp.mr_id(201), 'scheduled', 3);
insert into public.tournament_matches (
  id, generated_bracket_id, round_id, match_number, player_one_registration_id,
  player_two_registration_id, status, series_best_of, activation_version, activated_at, deadline_at
)
select pg_temp.mr_id(300+n),pg_temp.mr_id(24),pg_temp.mr_id(34),n,
  pg_temp.mr_id(231),pg_temp.mr_id(232),'in_progress',3,1,now()-interval '1 hour',now()+interval '1 day'
from generate_series(3,4)n;
insert into public.match_result_report_groups (
  id, match_id, tournament_id, submitted_by_clerk_user_id, submitted_by_registration_id,
  opponent_registration_id, winner_registration_id, player_one_score, player_two_score,
  status, confirmation_deadline_at
)
select pg_temp.mr_id(400 + n), pg_temp.mr_id(300 + (n - 1) * 10 + 1), pg_temp.mr_id(n),
  'match-room-test-1', pg_temp.mr_id(200 + (n - 1) * 10 + 1),
  pg_temp.mr_id(200 + (n - 1) * 10 + 2), pg_temp.mr_id(200 + (n - 1) * 10 + 1), 2, 0,
  'pending_confirmation', now() + interval '30 minutes'
from generate_series(1, 2) n;

alter table public.account_legal_acceptances enable trigger user;
alter table public.match_result_report_groups enable trigger user;
alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;
alter table public.players enable trigger user;


-- Fail-closed setting and RPC permissions; no production network calls.
-- Save/restore the live flag transactionally; the concurrency harness checks the migration default.
select public.set_match_room_enabled(false,'match-room-test-4');
select pg_temp.mr_assert(public.get_match_room_enabled()=false,'disabled setting is observable');
select pg_temp.mr_assert(not has_function_privilege('anon','public.get_match_room_enabled()','execute'),'anonymous setting lookup denied');
select pg_temp.mr_assert(has_function_privilege('authenticated','public.get_match_room_enabled()','execute'),'authenticated setting lookup allowed');
select pg_temp.mr_assert(not has_function_privilege('authenticated','public.set_match_room_enabled(boolean,text)','execute'),'browser admin cannot set flag');
select pg_temp.mr_assert(not has_function_privilege('service_role','ironclad_private.require_match_room_enabled()','execute'),'gate has no service shortcut');
create temporary table hardening_competition_snapshot as select id,to_jsonb(m) value from public.tournament_matches m where id::text like 'd19a0000-%';
create temporary table hardening_other_settings as select key,value,updated_by_clerk_user_id from public.platform_settings where key<>'match_room';
set local role authenticated; select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert((public.resolve_match_room(pg_temp.mr_id(301))->'room')='null'::jsonb,'disabled lazy resolve does not create SE room');
select pg_temp.mr_assert((public.resolve_match_room(pg_temp.mr_id(311))->'room')='null'::jsonb,'disabled lazy resolve does not create RR room');
select pg_temp.mr_error('select public.set_match_room_enabled(true,''forged'')','42501','authenticated setter denied');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_error('select public.set_match_room_enabled(true,''forged'')','42501','Clerk admin browser setter denied');
reset role;
select pg_temp.mr_assert(not exists(select 1 from public.match_rooms where match_id::text like 'd19a0000-%'),'default off has zero private rooms');
set local role service_role; select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(public.set_match_room_enabled(true,'match-room-test-4')='{"enabled":true}'::jsonb,'service enables exact setting');
reset role;
select pg_temp.mr_assert((select updated_by_clerk_user_id='match-room-test-4' from public.platform_settings where key='match_room'),'setting actor attributed');
select pg_temp.mr_assert(not exists(select * from hardening_other_settings except select key,value,updated_by_clerk_user_id from public.platform_settings where key<>'match_room'),'other settings preserved');
set local role authenticated; select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values('ab',public.resolve_match_room(pg_temp.mr_id(301))),('rr',public.resolve_match_room(pg_temp.mr_id(311)));
select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(901),'Retained private body');
select public.request_match_room_assistance(pg_temp.mr_room('ab'),0);
select public.mark_match_room_read(pg_temp.mr_room('ab'),1);
reset role;
select public.set_match_room_enabled(false,'match-room-test-4');
set local role authenticated; select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert((public.resolve_match_room(pg_temp.mr_id(301))->'room'->>'id')::uuid=pg_temp.mr_room('ab'),'disabled resolves existing immutable room');
select pg_temp.mr_assert((public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'room'->>'writable')::boolean=false,'disabled history is read-only');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'room'->'closedAt'='null'::jsonb,'disable does not permanently close room');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'messages'->0->>'body'='Retained private body','history retained while disabled');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_earlier_history(pg_temp.mr_room('ab'),2,50)->'messages')=1,'earlier history allowed while disabled');
select pg_temp.mr_error(format('select public.send_match_room_message(%L,%L,%L,%L)',pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(902),'blocked'),'P0001','player send blocked while disabled');
select pg_temp.mr_error(format('select public.request_match_room_assistance(%L,0)',pg_temp.mr_room('rr')),'P0001','new assistance blocked while disabled');
select pg_temp.mr_error(format('select public.mark_match_room_read(%L,0)',pg_temp.mr_room('ab')),'P0001','disabled read does not advance existing cursor');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_error(format('select public.mark_match_room_read(%L,1)',pg_temp.mr_room('ab')),'P0001','disabled read does not create cursor or falsely acknowledge');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_error(format('select public.get_match_room_history(%L,0,50)',pg_temp.mr_room('ab')),'42501','off switch does not bypass fixed membership');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_error(format('select public.send_admin_match_room_message(%L,%L,%L,%L)',pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(903),'blocked'),'P0001','admin send blocked while disabled');
select pg_temp.mr_assert(public.get_match_room_assistance(pg_temp.mr_room('ab'))->>'status'='requested','assistance evidence readable while disabled');
select pg_temp.mr_assert((public.get_match_room_assistance(pg_temp.mr_room('ab'))->>'canResolve')::boolean=false,'admin projection disables resolution while OFF');
select pg_temp.mr_error(format('select public.resolve_match_room_assistance(%L,1)',pg_temp.mr_room('ab')),'P0001','admin resolution blocked while disabled');
select pg_temp.mr_error(format('select public.request_match_room_assistance(%L,1)',pg_temp.mr_room('ab')),'P0001','assistance reopening blocked while disabled');
reset role;
select pg_temp.mr_assert((select count(*)=1 from public.match_messages where room_id=pg_temp.mr_room('ab')),'blocked sends create no messages');
select pg_temp.mr_assert((select count(*)=1 from public.match_room_reads where room_id=pg_temp.mr_room('ab')),'blocked cursor creates no private state');
select pg_temp.mr_assert((select count(*)=1 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('ab') and resolved_at is null),'off read leaves unread episode pending');
select pg_temp.mr_assert(not exists(select 1 from hardening_competition_snapshot s join public.tournament_matches m using(id) where s.value<>to_jsonb(m)),'flag and communication operations preserve competitive facts');
update public.platform_settings set value='{"enabled":"true"}' where key='match_room';
select pg_temp.mr_assert(not public.get_match_room_enabled(),'string enabled value fails closed');
update public.platform_settings set value='{}' where key='match_room';
select pg_temp.mr_assert(not public.get_match_room_enabled(),'malformed setting fails closed');
delete from public.platform_settings where key='match_room';
select pg_temp.mr_assert(not public.get_match_room_enabled(),'missing setting fails closed');
select pg_temp.mr_error('select public.set_match_room_enabled(null,''admin'')','22023','null enabled rejected');
select pg_temp.mr_error('select public.set_match_room_enabled(true,'' '')','22023','empty setting actor rejected');
select public.set_match_room_enabled(true,'match-room-test-4');
set local role authenticated; select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(public.resolve_match_room_assistance(pg_temp.mr_room('ab'),1)->>'status'='resolved','admin can resolve existing assistance after enable');
set local role authenticated; select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert((public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'room'->>'writable')::boolean,'reenable restores same room writable');
select public.mark_match_room_read(pg_temp.mr_room('ab'),1);
select pg_temp.mr_assert((public.request_match_room_assistance(pg_temp.mr_room('ab'),1)->>'requestVersion')::bigint=2,'reenable permits new assistance revision');
reset role;
select public.set_match_room_enabled(false,'match-room-test-4');
-- Reset and closure are existing authorities and remain available while off.
select public.admin_reset_tournament_match(pg_temp.mr_id(311),'match-room-test-4');
select pg_temp.mr_assert((select closure_reason='lifecycle_changed' from public.match_rooms where id=pg_temp.mr_room('rr')),'reset while disabled still closes prior generation');
select pg_temp.mr_assert((select count(*)=2 from public.match_rooms where match_id::text like 'd19a0000-%'),'reset while disabled creates no replacement room');
select public.close_ironclad_player_account('match-room-test-2');
set local role authenticated; select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_error(format('select public.get_match_room_history(%L,0,50)',pg_temp.mr_room('ab')),'42501','closed identity denied even while Clerk token remains');
reset role;
select pg_temp.mr_assert((select body='Retained private body' from public.match_messages where room_id=pg_temp.mr_room('ab')),'closure retains authorized historical evidence');
select 'HARDENING_ASSERTIONS='||count(*) from match_room_test_results;
rollback;
