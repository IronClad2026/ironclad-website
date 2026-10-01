-- LOCAL ONLY adapted genuine feature contract; no Staging row or live identity imported.
-- LOCAL ONLY: runner prepends rollback fixture and a transaction outbox shim.
-- Hosted websocket authorization is tested separately, never by these fixtures.
select public.set_match_room_enabled(true,'match-room-test-4');
create function pg_temp.mr_topic(p_name text) returns text language sql stable as $$
  select 'match-room:' || (value->'room'->>'id') || ':' || (value->'room'->>'communicationGeneration')
  from match_room_test_state where name=p_name;
$$;
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values('realtime_ab',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'current participant may subscribe');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9001),'Private realtime fixture');
reset role;
select pg_temp.mr_assert((select count(*)=1 from realtime.messages),'one successful send creates one invalidation');
select pg_temp.mr_assert((select private and event='invalidate' and extension='broadcast'
  and topic=pg_temp.mr_topic('realtime_ab') and payload->>'roomId'=pg_temp.mr_room('realtime_ab')::text
  and payload->>'communicationGeneration'='1' and payload ? 'id'
  and (payload - 'id' - 'roomId' - 'communicationGeneration')='{}'::jsonb from realtime.messages),
  'private payload has only room generation and platform transport id');
select pg_temp.mr_assert((select count(*)=0 from public.match_room_reads),'signal does not mark content read');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select set_config('realtime.topic',pg_temp.mr_topic('realtime_ab'),true);
select pg_temp.mr_assert((select count(*)=1 from realtime.messages),'recipient RLS receives exact authorized topic');
select pg_temp.mr_error($q$insert into realtime.messages(topic,extension,event,payload,private) values(pg_temp.mr_topic('realtime_ab'),'broadcast','invalidate','{}',true)$q$,
  '42501','participant cannot broadcast client-authored signals');
select pg_temp.mr_error('select * from public.match_messages','42501','Realtime does not grant direct private message reads');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'unrelated participant cannot subscribe');
select pg_temp.mr_assert((select count(*)=0 from realtime.messages),'unrelated RLS cannot read events');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"match-room-test-3","user_metadata":{"role":"admin"}}',true);
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'user_metadata cannot forge Realtime admin access');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'trusted Clerk admin can subscribe');
select public.send_admin_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9002),'Admin realtime fixture');
select pg_temp.mr_actor(null,true);
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'missing Clerk subject denied even with admin claim');
set local role anon;
select pg_temp.mr_assert((select count(*)=0 from realtime.messages),'anonymous policy cannot read events');
reset role;
select pg_temp.mr_assert((select count(*)=2 from realtime.messages),'admin send publishes same minimal contract');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9001),'Private realtime fixture');
reset role;
select pg_temp.mr_assert((select count(*)=2 from realtime.messages),'idempotent retry creates no duplicate invalidation');

-- Real transaction rollback removes both private message and outbox event.
savepoint realtime_rollback;
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9003),'Rollback fixture');
reset role;
select pg_temp.mr_assert((select count(*)=3 from realtime.messages),'uncommitted outbox write shares sender transaction');
rollback to savepoint realtime_rollback;
select pg_temp.mr_assert((select count(*)=2 from realtime.messages) and not exists(select 1 from public.match_messages where client_message_id=pg_temp.mr_id(9003)),
  'rollback leaves no publishable event or message');

-- Stub only the LOCAL compatibility transport within a savepoint, prove a
-- transport outage cannot break authoritative sends, then restore everything.
savepoint realtime_outage;
create or replace function realtime.send(payload jsonb,event text,topic text,private boolean default true)
returns void language plpgsql as $$ begin raise exception 'synthetic transport outage'; end $$;
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9004),'Fallback fixture');
reset role;
do $$ begin
  if (select count(*) from realtime.messages)<>2 or not exists(select 1 from public.match_messages where client_message_id=pg_temp.mr_id(9004)) then
    raise exception 'Transport failure broke authoritative send';
  end if;
end $$;
rollback to savepoint realtime_outage;
select pg_temp.mr_assert(true,'transport failure preserves authoritative send and polling recovery');

set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.request_match_room_assistance(pg_temp.mr_room('realtime_ab'),0);
select pg_temp.mr_actor('match-room-test-4',true);
select public.resolve_match_room_assistance(pg_temp.mr_room('realtime_ab'),1);
reset role;
select pg_temp.mr_assert((select count(*)=4 from realtime.messages),'assistance request and resolution invalidate workspace');
select public.set_match_room_enabled(false,'match-room-test-4');
select pg_temp.mr_assert((select count(*)=5 from realtime.messages),'kill switch wakes existing subscriptions');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'disabled gate denies Realtime join');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9005),'Disabled fixture')$q$,'P0001','disabled send cannot emit');
reset role;
select public.set_match_room_enabled(true,'match-room-test-4');
insert into match_room_test_state values('before_reassignment',jsonb_build_object('events',(select count(*) from realtime.messages)));
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311);
select pg_temp.mr_assert((select count(*) from realtime.messages)=(select (value->>'events')::int+1 from match_room_test_state where name='before_reassignment'),
  'reassignment emits only final old-room invalidation');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'old opponent subscription becomes stale');
select pg_temp.mr_actor('match-room-test-3');
insert into match_room_test_state values('realtime_ac',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac')),'replacement opponent may join only new generation');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab')),'replacement opponent denied old-generation stream');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('realtime_ab'),0,50)$q$,'42501','replacement opponent denied old transcript');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ac'),pg_temp.mr_id(9006),'Replacement fixture');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac')),'old opponent denied new generation');
reset role;
select pg_temp.mr_assert((select count(*)=1 from realtime.messages where topic=pg_temp.mr_topic('realtime_ac'))
  and not exists(select 1 from realtime.messages where topic=pg_temp.mr_topic('realtime_ab') and payload->>'roomId'=pg_temp.mr_room('realtime_ac')::text),
  'new messages emit only new room and generation identity');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime('match-room:garbage:1')
  and not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac')||':extra'), 'malformed and forged topics fail closed');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(302))->'room'='null'::jsonb,'one player plus TBD creates no subscribable room');
reset role;
savepoint closed_account;
select public.close_ironclad_player_account('match-room-test-3');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-3');
do $$ begin
  if ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac')) then
    raise exception 'Closed account retained Realtime join authorization';
  end if;
end $$;
rollback to savepoint closed_account;
select pg_temp.mr_assert(true,'account closure immediately denies new Realtime authorization despite stale JWT');
update public.tournament_matches set status='completed', outcome_type='deadline_double_forfeit',
  activation_version=1, activated_at=now()-interval '2 days', deadline_at=now()-interval '1 day',deadline_ruled_at=now()
where id=pg_temp.mr_id(311);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac')),'completed match denies active subscription');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('realtime_ac'),0,50)->'room'->>'writable'='false','completed history remains read-only');
reset role;
select pg_temp.mr_assert(not has_function_privilege('anon','ironclad_private.can_receive_match_room_realtime(text)','EXECUTE')
  and not has_function_privilege('authenticated','ironclad_private.broadcast_match_room_invalidation(public.match_rooms)','EXECUTE'), 'anonymous helper and browser broadcast execution denied');
select pg_temp.mr_assert(not exists(select 1 from pg_publication_tables where schemaname='public' and tablename in ('match_messages','match_rooms','match_room_assistance')), 'private rows never enter Postgres Changes publication');
select jsonb_build_object('suite','match-room-realtime','passed',count(*),'checks',jsonb_agg(name order by name)) from match_room_test_results;
rollback;
