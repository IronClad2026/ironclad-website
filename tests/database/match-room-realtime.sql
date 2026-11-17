-- LOCAL ONLY: runner prepends rollback fixture and a transaction outbox shim.
-- Hosted websocket authorization is tested separately, never by these fixtures.
insert into ironclad_private.patch2_staff_authorizations(subject_digest,verification_reference)
values(sha256(convert_to('match-room-test-4','UTF8')),'disposable Realtime fixture');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select public.set_match_room_enabled(true,'match-room-test-4');
reset role;
create function pg_temp.mr_topic(p_name text,p_actor integer) returns text language sql stable as $$
  select 'match-room:v2:' || (value->'room'->>'id') || ':' || (value->'room'->>'communicationGeneration') ||
    ':' || encode(sha256(convert_to('match-room-test-' || p_actor,'UTF8')),'hex')
  from match_room_test_state where name=p_name;
$$;
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values('realtime_ab',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',1)),'current participant may subscribe to their own topic');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',2))
  and not ironclad_private.can_receive_match_room_realtime('match-room:'||pg_temp.mr_room('realtime_ab')||':1'),
  'current participant cannot join the other subject or the former shared topic');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9001),'Private realtime fixture');
reset role;
select pg_temp.mr_assert((select array_agg(topic order by topic)=array(
    select pg_temp.mr_topic('realtime_ab',actor) from generate_series(1,2) actor order by 1)
  and bool_and(private and event='invalidate' and extension='broadcast'
    and payload->>'roomId'=pg_temp.mr_room('realtime_ab')::text
    and payload->>'communicationGeneration'='1' and payload ? 'id'
    and (payload - 'id' - 'roomId' - 'communicationGeneration')='{}'::jsonb)
  from realtime.messages), 'successful send publishes one minimal private invalidation to each participant only');
select pg_temp.mr_assert((select count(*)=0 from public.match_room_reads),'signal does not mark content read');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select set_config('realtime.topic',pg_temp.mr_topic('realtime_ab',2),true);
select pg_temp.mr_assert((select count(*)=1 from realtime.messages),'recipient RLS receives exact authorized topic');
select set_config('realtime.topic',pg_temp.mr_topic('realtime_ab',1),true);
select pg_temp.mr_assert((select count(*)=0 from realtime.messages),'recipient RLS denies the other participant topic');
select set_config('realtime.topic',pg_temp.mr_topic('realtime_ab',2),true);
select pg_temp.mr_error($q$insert into realtime.messages(topic,extension,event,payload,private) values(pg_temp.mr_topic('realtime_ab',2),'broadcast','invalidate','{}',true)$q$,
  '42501','participant cannot broadcast client-authored signals');
select pg_temp.mr_error('select * from public.match_messages','42501','Realtime does not grant direct private message reads');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',3)),'unrelated participant cannot subscribe');
select pg_temp.mr_assert((select count(*)=0 from realtime.messages),'unrelated RLS cannot read events');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"match-room-test-3","user_metadata":{"role":"admin"}}',true);
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',3)),'user_metadata cannot forge Realtime admin access');
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',4))
  and (select count(*)=0 from realtime.messages),'verified staff without a registration use guarded polling instead of Realtime');
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9002),'Direct browser attempt')$q$,
  '42501','a browser staff claim cannot send a staff message');
select pg_temp.mr_actor(null,true);
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',1)),'missing Clerk subject denied even with admin claim');
set local role anon;
select pg_temp.mr_actor(null);
select pg_temp.mr_assert((select count(*)=0 from realtime.messages),'anonymous policy cannot read events');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select public.call_patch2_match_staff('send_admin_match_room_message',
  jsonb_build_object('p_match_id',pg_temp.mr_id(311),'p_expected_room_id',pg_temp.mr_room('realtime_ab'),
    'p_client_message_id',pg_temp.mr_id(9002),'p_body','Admin realtime fixture'),'match-room-test-4');
reset role;
select pg_temp.mr_assert((select count(*)=4 and count(*) filter(where topic=pg_temp.mr_topic('realtime_ab',1))=2
  and count(*) filter(where topic=pg_temp.mr_topic('realtime_ab',2))=2 from realtime.messages),
  'trusted staff send publishes only to the same participant topics');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9001),'Private realtime fixture');
reset role;
select pg_temp.mr_assert((select count(*)=4 from realtime.messages),'idempotent retry creates no duplicate invalidation');

-- Real transaction rollback removes both private message and outbox event.
savepoint realtime_rollback;
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9003),'Rollback fixture');
reset role;
select pg_temp.mr_assert((select count(*)=6 from realtime.messages),'both uncommitted outbox writes share the sender transaction');
rollback to savepoint realtime_rollback;
select pg_temp.mr_assert((select count(*)=4 from realtime.messages) and not exists(select 1 from public.match_messages where client_message_id=pg_temp.mr_id(9003)),
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
  if (select count(*) from realtime.messages)<>4 or not exists(select 1 from public.match_messages where client_message_id=pg_temp.mr_id(9004)) then
    raise exception 'Transport failure broke authoritative send';
  end if;
end $$;
rollback to savepoint realtime_outage;
select pg_temp.mr_assert(true,'transport failure preserves authoritative send and polling recovery');

set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_error($q$select public.request_match_room_assistance(pg_temp.mr_room('realtime_ab'),0)$q$,
  '55000','old clients cannot create a shared textless assistance request');
reset role;
update public.platform_settings set value='{"enabled":true}' where key='private_assistance_new_requests_enabled';
set local role service_role;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.call_patch2_private_assistance('open_private_assistance',
  jsonb_build_object('p_room_id',pg_temp.mr_room('realtime_ab'),'p_client_message_id',pg_temp.mr_id(9007),
    'p_body','Synthetic private assistance fixture'),'match-room-test-1',false)->>'accepted'='true',
  'current server assistance flow creates a private request');
reset role;
select pg_temp.mr_assert((select count(*)=4 from realtime.messages)
  and not exists(select 1 from public.match_room_assistance),'private assistance never emits a shared room invalidation');

-- Model a request created before private conversations replaced shared ones.
insert into public.match_room_assistance(room_id,status,request_version,requested_by_registration_id,requested_at)
values(pg_temp.mr_room('realtime_ab'),'requested',1,pg_temp.mr_id(211),now());
select pg_temp.mr_assert((select count(*)=6 from realtime.messages),'legacy state change signals both participant workspaces');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select pg_temp.mr_assert(public.call_patch2_private_assistance('resolve_match_room_assistance',
  jsonb_build_object('p_room_id',pg_temp.mr_room('realtime_ab'),'p_expected_request_version',1),'match-room-test-4',true)->>'status'='resolved',
  'verified staff still resolve a pre-existing legacy request');
reset role;
select pg_temp.mr_assert((select count(*)=8 from realtime.messages),'legacy resolution invalidates both participant workspaces');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select public.set_match_room_enabled(false,'match-room-test-4');
reset role;
select pg_temp.mr_assert((select count(*)=10 from realtime.messages),'kill switch wakes existing participant subscriptions');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',1)),'disabled gate denies Realtime join');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ab'),pg_temp.mr_id(9005),'Disabled fixture')$q$,'P0001','disabled send cannot emit');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select public.set_match_room_enabled(true,'match-room-test-4');
reset role;
insert into match_room_test_state values('before_reassignment',jsonb_build_object('events',(select count(*) from realtime.messages)));
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311);
select pg_temp.mr_assert((select count(*) from realtime.messages)=(select (value->>'events')::int+2 from match_room_test_state where name='before_reassignment'),
  'reassignment emits one final old-room invalidation per old participant');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',2)),'old opponent subscription becomes stale');
select pg_temp.mr_actor('match-room-test-3');
insert into match_room_test_state values('realtime_ac',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac',3)),'replacement opponent may join only new generation');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ab',3)),'replacement opponent denied old-generation stream');
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('realtime_ab'),0,50)$q$,'42501','replacement opponent denied old transcript');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('realtime_ac'),pg_temp.mr_id(9006),'Replacement fixture');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac',2)),'old opponent denied new generation');
reset role;
select pg_temp.mr_assert((select array_agg(topic order by topic)=array(
    select pg_temp.mr_topic('realtime_ac',actor) from unnest(array[1,3]) actor order by 1)
  from realtime.messages where payload->>'roomId'=pg_temp.mr_room('realtime_ac')::text),
  'new messages emit new room identity only to the new participants and generation');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime('match-room:v2:garbage:1')
  and not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac',1)||':extra'), 'malformed and forged topics fail closed');
select pg_temp.mr_assert(public.resolve_match_room(pg_temp.mr_id(302))->'room'='null'::jsonb,'one player plus TBD creates no subscribable room');
reset role;
savepoint closed_account;
set local role service_role;
select pg_temp.mr_actor('match-room-test-4');
select public.close_ironclad_player_account('match-room-test-3');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-3');
do $$ begin
  if ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac',3)) then
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
select pg_temp.mr_assert(not ironclad_private.can_receive_match_room_realtime(pg_temp.mr_topic('realtime_ac',1)),'completed match denies active subscription');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('realtime_ac'),0,50)->'room'->>'writable'='false','completed history remains read-only');
reset role;
select pg_temp.mr_assert(not has_function_privilege('anon','ironclad_private.can_receive_match_room_realtime(text)','EXECUTE')
  and not has_function_privilege('authenticated','ironclad_private.broadcast_match_room_invalidation(public.match_rooms)','EXECUTE'), 'anonymous helper and browser broadcast execution denied');
select pg_temp.mr_assert(not exists(select 1 from pg_publication_tables where schemaname='public' and tablename in ('match_messages','match_rooms','match_room_assistance')), 'private rows never enter Postgres Changes publication');
select jsonb_build_object('suite','match-room-realtime','passed',count(*),'checks',jsonb_agg(name order by name)) from match_room_test_results;
rollback;
