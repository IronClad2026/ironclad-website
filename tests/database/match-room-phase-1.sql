-- Match Room Phase 1 executable security/lifecycle contract.
-- Run only in a disposable local replay or the positively verified, explicitly
-- approved ironclad-staging project. The runner must reject Production BEFORE
-- executing this file. Everything below, including fixtures and failure hooks,
-- rolls back. No real identities, provider requests, or Storage writes are used.
-- Plain SQL: compatible with psql and a single-connection SQL runner.
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

-- Physical boundary: deny all raw paths, including service-role shortcuts.
do $$
declare v_table text; v_role text; v_privilege text; v_rpc text;
begin
  foreach v_table in array array['match_rooms', 'match_messages', 'match_room_reads'] loop
    perform pg_temp.mr_assert((select c.relrowsecurity and c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table), v_table || ' has forced RLS');
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        perform pg_temp.mr_assert(not has_table_privilege(v_role, 'public.' || v_table, v_privilege),
          v_role || ' raw ' || v_table || ' ' || v_privilege || ' denied');
      end loop;
    end loop;
  end loop;
  foreach v_rpc in array array[
    'public.resolve_match_room(uuid)', 'public.get_match_room_history(uuid,bigint,integer)',
    'public.send_match_room_message(uuid,uuid,uuid,text)', 'public.send_admin_match_room_message(uuid,uuid,uuid,text)',
    'public.mark_match_room_read(uuid,bigint)'
  ] loop
    perform pg_temp.mr_assert(has_function_privilege('authenticated', v_rpc, 'EXECUTE'), v_rpc || ' authenticated grant');
    perform pg_temp.mr_assert(not has_function_privilege('anon', v_rpc, 'EXECUTE'), v_rpc || ' anon denied');
    perform pg_temp.mr_assert(not has_function_privilege('service_role', v_rpc, 'EXECUTE'), v_rpc || ' service denied');
  end loop;
end;
$$;

insert into match_room_test_state values ('competition-before', (
  select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m
  where id in (pg_temp.mr_id(301), pg_temp.mr_id(302), pg_temp.mr_id(311), pg_temp.mr_id(321))
));
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(current_user = 'authenticated', 'RPCs execute as authenticated database role');
insert into match_room_test_state values ('ab', public.resolve_match_room(pg_temp.mr_id(301)));
insert into match_room_test_state values ('rr', public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(pg_temp.mr_room('ab') is not null and pg_temp.mr_room('rr') is not null,
  'launched SE and RR authoritative pairs receive rooms');
select pg_temp.mr_assert((public.resolve_match_room(pg_temp.mr_id(301)) -> 'room' ->> 'id')::uuid = pg_temp.mr_room('ab'),
  'repeat resolution returns exactly the same room');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(321)) -> 'room' = 'null'::jsonb,
  'unlaunched pair has no room');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(302)) -> 'room' = 'null'::jsonb,
  'TBD pair has no room');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab'), 0, 50) -> 'messages') = 0,
  'participant A reads empty own room');
select pg_temp.mr_error('select * from public.match_messages', '42501', 'authenticated actual raw SELECT denied');
select pg_temp.mr_error('update public.tournament_matches set communication_generation = communication_generation + 1 where id = pg_temp.mr_id(301)',
  '42501', 'participant cannot increment lifecycle marker');
select pg_temp.mr_error($q$insert into public.match_messages(room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body)
  values(pg_temp.mr_room('ab'),1,'admin',pg_temp.mr_id(202),'match-room-test-2',pg_temp.mr_id(801),'spoof')$q$,
  '42501', 'direct spoofed sender insert denied');
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(802),'spoof')$q$,
  '42501', 'participant cannot call admin send');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(803),E' \t\n')$q$,
  '22023', 'ASCII whitespace-only body rejected');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(804),U&'\2003\00a0')$q$,
  '22023', 'Unicode whitespace-only body rejected');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(805),repeat('😀',1001))$q$,
  '22023', '1001 Unicode codepoints rejected');
insert into match_room_test_state values ('first-message', public.send_match_room_message(
  pg_temp.mr_id(301), pg_temp.mr_room('ab'), pg_temp.mr_id(806), repeat('😀', 1000)
));
select pg_temp.mr_assert((value -> 'message' ->> 'sequence')::bigint = 1
  and char_length(value -> 'message' ->> 'body') = 1000 and value ->> 'duplicate' = 'false',
  '1000 supplementary Unicode codepoints accepted as first message')
from match_room_test_state where name = 'first-message';
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(806),repeat('😀',1000)) ->> 'duplicate' = 'true',
  'same sender/client retry is idempotent');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(806),'different body')$q$,
  '23505', 'same idempotency key cannot change body');

select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab'),0,50) -> 'messages') = 1,
  'participant B reads A message');
select pg_temp.mr_assert((public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(806),'B may reuse client UUID') -> 'message' ->> 'sequence')::bigint = 2,
  'idempotency is scoped to authenticated sender and sequence is ordered');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ab'),0,50)$q$,'42501','unrelated C cannot read AB');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(807),'outsider')$q$,'42501','unrelated C cannot send to AB');
select pg_temp.mr_error($q$select public.mark_match_room_read(pg_temp.mr_room('ab'),1)$q$,'42501','unrelated C cannot mark AB read');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"match-room-test-3","user_metadata":{"role":"admin"}}',true);
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(808),'forged user metadata')$q$,'42501','user_metadata does not grant admin authority');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab'),0,50) -> 'messages') = 2,'admin reads private room');
select pg_temp.mr_assert(public.send_admin_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(809),'Admin context') -> 'message' ->> 'senderKind' = 'admin','admin sender kind is persisted distinctly');
select pg_temp.mr_assert(not (public.get_match_room_history(pg_temp.mr_room('ab'),0,1)::text like '%actor_clerk_user_id%')
  and not (public.get_match_room_history(pg_temp.mr_room('ab'),0,1)::text like '%match-room-test-%'), 'history projection excludes private Clerk attribution');
set local role anon;
select pg_temp.mr_actor(null);
select pg_temp.mr_error($q$select public.resolve_match_room(pg_temp.mr_id(301))$q$,'42501','anonymous RPC denied');
select pg_temp.mr_error('select * from public.match_rooms','42501','anonymous actual raw SELECT denied');
set local role authenticated;
select pg_temp.mr_actor(null);
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ab'),0,50)$q$,'42501','authenticated role without Clerk subject denied');
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert((public.mark_match_room_read(pg_temp.mr_room('ab'),2) ->> 'lastReadSequence')::bigint = 2,'read cursor advances to observed sequence');
select pg_temp.mr_assert((public.mark_match_room_read(pg_temp.mr_room('ab'),1) ->> 'lastReadSequence')::bigint = 2,'stale read cursor never moves backward');
select pg_temp.mr_error($q$select public.mark_match_room_read(pg_temp.mr_room('ab'),-1)$q$,'22023','negative read cursor rejected');
select pg_temp.mr_error($q$select public.mark_match_room_read(pg_temp.mr_room('ab'),999999)$q$,'22023','future unread sequence cannot be marked read');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab'),0,1) ->> 'hasMore' = 'true'
  and (public.get_match_room_history(pg_temp.mr_room('ab'),0,1) ->> 'nextAfterSequence')::bigint = 1,'history page is bounded with continuation');
select pg_temp.mr_assert((public.get_match_room_history(pg_temp.mr_room('ab'),1,1) -> 'messages' -> 0 ->> 'sequence')::bigint = 2,'history cursor resumes after prior page');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ab'),0,1001)$q$,'22023','unbounded history request rejected');
-- A already sent once; retries did not consume allowance. New 14 sends reach 15.
do $$ begin
  for n in 1..14 loop
    perform public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(820+n),'Rate test '||n);
  end loop;
end $$;
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(850),'sixteenth')$q$,'P0001','sixteenth sender message within minute rate limited');
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(806),repeat('😀',1000)) ->> 'duplicate' = 'true','idempotent retry survives reached rate limit');
select pg_temp.mr_assert((public.get_match_room_history(pg_temp.mr_room('ab'),0,50) -> 'room' ->> 'lastReadSequence')::bigint = 2,'new sends do not advance read cursor');
reset role;
select pg_temp.mr_assert((select count(*) from public.match_rooms where match_id=pg_temp.mr_id(301) and closed_at is null)=1,'exactly one open room persisted');
select pg_temp.mr_assert((select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m
  where id in(pg_temp.mr_id(301),pg_temp.mr_id(302),pg_temp.mr_id(311),pg_temp.mr_id(321))) =
  (select value from match_room_test_state where name='competition-before'),'communication commands preserve competition facts');
select pg_temp.mr_error($q$update public.match_messages set body='changed' where room_id=pg_temp.mr_room('ab')$q$,'55000','ordinary message update is immutable');
select pg_temp.mr_error($q$update public.match_rooms set player_two_registration_id=pg_temp.mr_id(203) where id=pg_temp.mr_room('ab')$q$,'55000','fixed room membership is immutable');

-- No-show uses the supported report/finalize commands. Double-forfeit is a
-- synthetic official-outcome fixture; do not invoke a global deadline sweep.
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('no-show',public.resolve_match_room(pg_temp.mr_id(303)));
insert into match_room_test_state values ('double-forfeit',public.resolve_match_room(pg_temp.mr_id(304)));
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
insert into match_room_test_state values ('no-show-report',public.submit_match_no_show_report(
  pg_temp.mr_id(303),'match-room-test-1',pg_temp.mr_id(232),'Rollback-only no-show evidence'
));
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(303),pg_temp.mr_room('no-show'),pg_temp.mr_id(851),'Responding to pending no-show') ->> 'duplicate'='false',
  'pending no-show remains writable for disputed scheduling');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.admin_finalize_match_result_report_group(
  (select (value->>'report_group_id')::uuid from match_room_test_state where name='no-show-report'),
  'approved','match-room-test-4','Rollback confirmed no-show'
);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('no-show'),0,50)->'room'->>'writable'='false',
  'authoritatively finalized no-show room is read-only');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(303),pg_temp.mr_room('no-show'),pg_temp.mr_id(852),'after no-show')$q$,
  '55000','confirmed no-show denies new player messages');
reset role;
update public.tournament_matches set status='completed',outcome_type='deadline_double_forfeit',
  activated_at=now()-interval '2 days',deadline_at=now()-interval '1 day',deadline_ruled_at=now()
where id=pg_temp.mr_id(304);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('double-forfeit'),0,50)->'room'->>'writable'='false',
  'official double-forfeit room is read-only');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(304),pg_temp.mr_room('double-forfeit'),pg_temp.mr_id(853),'after double-forfeit')$q$,
  '55000','double-forfeit denies new player messages');
reset role;
-- Lifecycle cases follow below. Fixture-only state transitions use real triggers;
-- reset and report review use supported authority commands, never trigger bypass.
update public.tournament_matches set
  activated_at=now()-interval '2 days', deadline_at=now()-interval '1 day',
  hold_started_at=now()-interval '1 hour', hold_released_at=null,
  hold_reason='Rollback test hold', held_by_clerk_user_id='match-room-test-4'
where id=pg_temp.mr_id(301);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(860),'Still coordinating during hold and expiry') ->> 'duplicate'='false',
  'hold and expired deadline without official outcome remain writable');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(301)) -> 'room' ->> 'id'=pg_temp.mr_room('ab')::text,
  'hold and expiry retain room identity');
reset role;
update public.tournament_matches set hold_released_at=now() where id=pg_temp.mr_id(301);
insert into match_room_test_state values ('generation-before-report-reset',(
  select jsonb_object_agg(id::text,communication_generation) from public.tournament_matches where id in(pg_temp.mr_id(301),pg_temp.mr_id(311))
));
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.admin_finalize_match_result_report_group(pg_temp.mr_id(401),'under_review','match-room-test-4','Rollback review');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(861),'Discussion during review') ->> 'duplicate'='false',
  'pending result under admin review remains writable');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.admin_finalize_match_result_report_group(pg_temp.mr_id(401),'reset','match-room-test-4','Reset report only');
select public.admin_finalize_match_result_report_group(pg_temp.mr_id(402),'reset','match-room-test-4','Reset RR report only');
reset role;
select pg_temp.mr_assert((select jsonb_object_agg(id::text,communication_generation) from public.tournament_matches
  where id in(pg_temp.mr_id(301),pg_temp.mr_id(311)))=(select value from match_room_test_state where name='generation-before-report-reset'),
  'real SE and RR report resets preserve communication generation');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(301)) -> 'room' ->> 'id'=pg_temp.mr_room('ab')::text
  and public.resolve_match_room(pg_temp.mr_id(311)) -> 'room' ->> 'id'=pg_temp.mr_room('rr')::text,
  'real report resets preserve both room identities');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('rr'),pg_temp.mr_id(862),'Original RR room private history');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.apply_admin_official_match_result(pg_temp.mr_id(301),2,0,pg_temp.mr_id(201),'match-room-test-4');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab'),0,50) -> 'room' ->> 'writable'='false',
  'official completion retains readable player transcript');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(863),'after final')$q$,
  '55000','completed room denies new player message');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(864),'after final')$q$,
  '55000','completed room denies new admin message');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.admin_reset_tournament_match(pg_temp.mr_id(301),'match-room-test-4');
select public.apply_admin_official_match_result(pg_temp.mr_id(311),2,0,pg_temp.mr_id(211),'match-room-test-4');
select public.admin_reset_tournament_match(pg_temp.mr_id(311),'match-room-test-4');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('ab-reset',public.resolve_match_room(pg_temp.mr_id(301)));
insert into match_room_test_state values ('rr-reset',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(pg_temp.mr_room('ab-reset')<>pg_temp.mr_room('ab') and pg_temp.mr_room('rr-reset')<>pg_temp.mr_room('rr'),
  'real same-pair SE and RR Match resets create new rooms');
select pg_temp.mr_assert((select (value->'room'->>'roomRevision')::integer from match_room_test_state where name='ab-reset')>
  (select (value->'room'->>'roomRevision')::integer from match_room_test_state where name='ab'),
  'room revision advances after actual reset');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'room'->>'writable'='false'
  and jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('rr'),0,50)->'messages')=1,
  'historical fixed participants retain old reset transcripts read-only');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab'),pg_temp.mr_id(806),repeat('😀',1000))$q$,
  '40001','old-room retry cannot write through actual reset');
select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('ab-reset'),pg_temp.mr_id(870),'Fresh SE lifecycle');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('rr-reset'),pg_temp.mr_id(871),'RR AB before replacement');
select pg_temp.mr_actor('match-room-test-2');
select public.mark_match_room_read(pg_temp.mr_room('rr-reset'),1);
reset role;
select pg_temp.mr_assert((select status='in_progress' and activation_version=2
  and player_one_registration_id=pg_temp.mr_id(201) and player_two_registration_id=pg_temp.mr_id(202)
  from public.tournament_matches where id=pg_temp.mr_id(301)), 'SE reset retains established activation and participant behavior');
select pg_temp.mr_assert((select status='scheduled' and activation_version=0
  and player_one_score is null and player_two_score is null and winner_registration_id is null
  from public.tournament_matches where id=pg_temp.mr_id(311)), 'RR reset retains established score and scheduled behavior');

-- Failure injection is transaction-local and narrowly tied to this fixture.
-- The real reset clears official competition facts BEFORE recording its new
-- marker; rejecting that marker must roll all those writes back together.
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.apply_admin_official_match_result(pg_temp.mr_id(301),2,0,pg_temp.mr_id(201),'match-room-test-4');
reset role;
insert into match_room_test_state values ('before-marker-failure',jsonb_build_object(
  'match',(select to_jsonb(m) from public.tournament_matches m where id=pg_temp.mr_id(301)),
  'rooms',(select jsonb_agg(to_jsonb(r) order by id) from public.match_rooms r where match_id=pg_temp.mr_id(301)),
  'reports',(select jsonb_agg(to_jsonb(g) order by id) from public.match_result_report_groups g where match_id=pg_temp.mr_id(301))
));
create function pg_temp.mr_fail_marker() returns trigger language plpgsql as $$
begin
  if new.id in(pg_temp.mr_id(301),pg_temp.mr_id(311)) and new.communication_generation<>old.communication_generation then
    raise exception 'MATCH_ROOM_TEST_MARKER_FAILURE';
  end if;
  return new;
end;
$$;
create trigger zz_match_room_test_marker_failure before update of communication_generation,player_one_registration_id,player_two_registration_id
on public.tournament_matches for each row execute function pg_temp.mr_fail_marker();
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_error($q$select public.admin_reset_tournament_match(pg_temp.mr_id(301),'match-room-test-4')$q$,
  'P0001','marker failure aborts supported reset');
reset role;
select pg_temp.mr_assert(jsonb_build_object(
  'match',(select to_jsonb(m) from public.tournament_matches m where id=pg_temp.mr_id(301)),
  'rooms',(select jsonb_agg(to_jsonb(r) order by id) from public.match_rooms r where match_id=pg_temp.mr_id(301)),
  'reports',(select jsonb_agg(to_jsonb(g) order by id) from public.match_result_report_groups g where match_id=pg_temp.mr_id(301))
)=(select value from match_room_test_state where name='before-marker-failure'),
  'failed marker leaves scores result state rooms and reports unchanged');
insert into match_room_test_state values ('before-reassignment-failure',jsonb_build_object(
  'match',(select to_jsonb(m) from public.tournament_matches m where id=pg_temp.mr_id(311)),
  'rooms',(select jsonb_agg(to_jsonb(r) order by id) from public.match_rooms r where match_id=pg_temp.mr_id(311))
));
select pg_temp.mr_error($q$update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311)$q$,
  'P0001','marker failure aborts authoritative reassignment');
select pg_temp.mr_assert(jsonb_build_object(
  'match',(select to_jsonb(m) from public.tournament_matches m where id=pg_temp.mr_id(311)),
  'rooms',(select jsonb_agg(to_jsonb(r) order by id) from public.match_rooms r where match_id=pg_temp.mr_id(311))
)=(select value from match_room_test_state where name='before-reassignment-failure'),
  'failed reassignment leaves original pairing generation and room intact');
drop trigger zz_match_room_test_marker_failure on public.tournament_matches;

-- Existing UI retired arbitrary participant-edit commands. Exercise the trusted
-- reassignment database boundary only in this rollback fixture, after actual RR
-- reset returns scheduled state; all existing participant/domain triggers run.
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311);
select pg_temp.mr_assert((select closed_at is not null from public.match_rooms where id=pg_temp.mr_room('rr-reset')),
  'replacement transaction closes the original fixed-member room');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-3');
insert into match_room_test_state values ('ac',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(pg_temp.mr_room('ac')<>pg_temp.mr_room('rr-reset'),'AC obtains independent room identity');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('rr-reset'),0,50)$q$,'42501','replacement C cannot read original AB transcript');
select pg_temp.mr_error($q$select public.mark_match_room_read(pg_temp.mr_room('rr-reset'),1)$q$,'42501','replacement C cannot access original AB unread state');
select pg_temp.mr_assert((public.get_match_room_history(pg_temp.mr_room('ac'),0,50)->'room'->>'lastReadSequence')::bigint=0,
  'new opponent starts with independent unread state');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ac'),pg_temp.mr_id(880),'C private reply');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('rr-reset'),0,50)->'messages')=1,
  'replaced B retains historical fixed-membership access');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ac'),0,50)$q$,'42501','replaced B cannot read AC');
reset role;
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(212) where id=pg_temp.mr_id(311);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
insert into match_room_test_state values ('ab-return',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(pg_temp.mr_room('ab-return')<>pg_temp.mr_room('rr-reset') and pg_temp.mr_room('ab-return')<>pg_temp.mr_room('ac'),
  'AB returning after AC creates third independent lifecycle');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab-return'),0,50)->'messages')=0,
  'returning pairing never reuses earlier messages');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab-return'),pg_temp.mr_id(881),'B attribution to clear on closure');
select public.mark_match_room_read(pg_temp.mr_room('ab-return'),1);
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ab-return'),0,50)$q$,'42501','C cannot follow current-match link into returned AB room');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ac'),0,50)->'messages')=1,'C retains only original AC history');

-- Both pairing changes happen without anyone resolving the intermediate room.
-- Generation must still advance twice; the original AB transcript stays closed.
reset role;
insert into match_room_test_state values ('before-silent-pairing',(
  select to_jsonb(communication_generation) from public.tournament_matches where id=pg_temp.mr_id(311)
));
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311);
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(212) where id=pg_temp.mr_id(311);
select pg_temp.mr_assert((select communication_generation from public.tournament_matches where id=pg_temp.mr_id(311))=
  (select value::bigint+2 from match_room_test_state where name='before-silent-pairing'),
  'unvisited AB to AC to AB records both pairing generations');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('ab-silent-return',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(pg_temp.mr_room('ab-silent-return')<>pg_temp.mr_room('ab-return')
  and jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab-silent-return'),0,50)->'messages')=0,
  'unvisited pairing roundtrip cannot revive old AB room');
-- Closing the account uses the real current chain, not a hand-written flag.
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select public.close_ironclad_player_account('match-room-test-2');
reset role;
select pg_temp.mr_assert((select account_closed_at is not null and clerk_user_id<>'match-room-test-2'
  from public.players where id=pg_temp.mr_id(102)), 'real account closure pseudonymizes history-bearing player');
select pg_temp.mr_assert(not exists(select 1 from public.match_room_reads where viewer_clerk_user_id='match-room-test-2'),
  'account closure removes private room read attribution');
select pg_temp.mr_assert(not exists(select 1 from public.match_messages where actor_clerk_user_id='match-room-test-2'),
  'account closure clears direct message actor attribution');
select pg_temp.mr_assert(exists(select 1 from public.match_messages where room_id=pg_temp.mr_room('ab-return')
  and sender_registration_id=pg_temp.mr_id(212) and actor_clerk_user_id is null and body='B attribution to clear on closure'),
  'closure retains fixed authorship and body without falsely anonymizing text');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('ab-return'),0,50)$q$,'42501','stale JWT after account closure cannot read');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab-return'),pg_temp.mr_id(882),'closed actor')$q$,'42501','stale JWT after account closure cannot send');
select pg_temp.mr_error($q$select public.mark_match_room_read(pg_temp.mr_room('ab-return'),1)$q$,'42501','stale JWT cannot recreate removed read state');
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab-return'),0,50)->'messages')=1,
  'remaining member can read retained transcript after opponent closure');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ac'),0,50)->'messages')=1,'admin retains historical room inspection');
reset role;
select pg_temp.mr_error($q$select public.delete_tournament_data(pg_temp.mr_id(2),'match-room-test-4')$q$,null,
  'room history does not weaken protected tournament hard-delete guard');

-- Terminal state independently closes player/admin writes without exposing or
-- erasing private history. Use a fixture owner transition, no live tournament.
select set_config('ironclad.tournament_terminal_transition','on',true);
update public.tournaments set status='voided', terminal_at=clock_timestamp(),
  terminal_reason='Rollback-only terminal room fixture', terminated_by_clerk_user_id='match-room-test-4'
where id=pg_temp.mr_id(2);
select set_config('ironclad.tournament_terminal_transition','',true);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('ab-silent-return'),0,50)->'room'->>'writable'='false',
  'void tournament retains transcript read-only');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab-silent-return'),pg_temp.mr_id(883),'terminal')$q$,
  '55000','terminal tournament player send denied');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab-silent-return'),pg_temp.mr_id(884),'terminal admin')$q$,
  '55000','terminal tournament admin send denied');
reset role;

select count(*) as passed_assertions from match_room_test_results;
select name as passed_check from match_room_test_results order by name;
rollback;
-- Post-rollback verification is read-only and catches fixture leakage even when
-- a runner does not otherwise inspect transaction state.
do $$ begin
  if exists(select 1 from public.tournaments where id::text like 'd19a0000-%')
    or exists(select 1 from public.players where clerk_user_id like 'match-room-test-%')
    or exists(select 1 from public.match_rooms where match_id::text like 'd19a0000-%') then
    raise exception 'MATCH ROOM TEST FAILED: rollback left synthetic fixture data';
  end if;
end $$;
