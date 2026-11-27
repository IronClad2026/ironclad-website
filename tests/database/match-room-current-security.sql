-- Disposable CI only. The runner prepends the original rollback fixture's
-- synthetic tournament and players and separately seeds verified staff.
do $checks$
declare v_role text; v_rpc text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_rpc in array array[
      'public.send_admin_match_room_message(uuid,uuid,uuid,text)',
      'public.get_match_room_assistance(uuid)',
      'public.resolve_match_room_assistance(uuid,bigint)'
    ] loop
      perform pg_temp.mr_assert(not has_function_privilege(v_role,v_rpc,'EXECUTE'),v_role || ' denied: ' || v_rpc);
    end loop;
    foreach v_rpc in array array[
      'public.call_patch2_match_staff(text,jsonb,text)',
      'public.call_patch2_private_assistance(text,jsonb,text,boolean)',
      'public.set_match_room_enabled(boolean,text)'
    ] loop
      perform pg_temp.mr_assert(has_function_privilege(v_role,v_rpc,'EXECUTE') = (v_role='service_role'),
        v_role || ' current boundary: ' || v_rpc);
    end loop;
    perform pg_temp.mr_assert(not has_table_privilege(v_role,'public.match_messages','SELECT'),
      v_role || ' cannot read private Match Room bodies directly');
  end loop;
end;
$checks$;

set local role authenticated;
select pg_temp.mr_actor('user_MatchRoomFixture1');
insert into match_room_test_state values ('current-room',public.resolve_match_room(pg_temp.mr_id(301)));
select pg_temp.mr_assert(pg_temp.mr_room('current-room') is not null,'eligible participant resolves current room');
select pg_temp.mr_assert(public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('current-room'),
  pg_temp.mr_id(911),'Current participant message')->'message'->>'senderKind'='player','participant can send through existing RPC');
select pg_temp.mr_error($q$select public.request_match_room_assistance(pg_temp.mr_room('current-room'),0)$q$,
  '55000','legacy empty assistance request is retired');
select pg_temp.mr_actor('user_MatchRoomFixture4',true);
select pg_temp.mr_error($q$select public.get_match_room_history(pg_temp.mr_room('current-room'),0,50)$q$,
  '42501','browser staff claim cannot read an unrelated participant transcript');
select pg_temp.mr_error($q$select public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')$q$,
  '42501','authenticated browser cannot call trusted gateway even with staff metadata');
reset role;

set local role service_role;
select pg_temp.mr_actor('user_MatchRoomFixture4',true);
select pg_temp.mr_error($q$select public.send_admin_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('current-room'),
  pg_temp.mr_id(912),'Old direct call')$q$,'42501','service caller cannot use retired staff send');
select pg_temp.mr_error($q$select public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture3')$q$,
  '42501','trusted server request still requires independently verified staff identity');
select pg_temp.mr_assert(jsonb_array_length(public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')->'messages')=1,
  'verified staff can inspect participant room through trusted gateway');
select pg_temp.mr_assert(public.call_patch2_match_staff('send_admin_match_room_message',
  jsonb_build_object('p_match_id',pg_temp.mr_id(301),'p_expected_room_id',pg_temp.mr_room('current-room'),
    'p_client_message_id',pg_temp.mr_id(913),'p_body','Verified staff message'),'user_MatchRoomFixture4')->'message'->>'senderKind'='admin',
  'verified staff sends through current gateway with explicit attribution');
select pg_temp.mr_assert(public.call_patch2_match_staff('send_admin_match_room_message',
  jsonb_build_object('p_match_id',pg_temp.mr_id(301),'p_expected_room_id',pg_temp.mr_room('current-room'),
    'p_client_message_id',pg_temp.mr_id(913),'p_body','Verified staff message'),'user_MatchRoomFixture4')->>'duplicate'='true',
  'trusted staff send preserves idempotency');
select pg_temp.mr_assert(public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')::text
  not like '%user_MatchRoomFixture%','current history projection excludes Clerk attribution');
select pg_temp.mr_error($q$select public.call_patch2_private_assistance('open_private_assistance',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_client_message_id',pg_temp.mr_id(914),
    'p_body','Current private assistance message'),'user_MatchRoomFixture1',false)$q$,'P0001',
  'new private assistance is disabled by default');
reset role;
insert into public.platform_settings (key,value,updated_by_clerk_user_id)
values ('private_assistance_new_requests_enabled','{"enabled":true}','user_MatchRoomFixture4')
on conflict (key) do update set value=excluded.value;
set local role service_role;
select pg_temp.mr_actor('user_MatchRoomFixture4',true);
select pg_temp.mr_assert(public.call_patch2_private_assistance('open_private_assistance',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_client_message_id',pg_temp.mr_id(914),
    'p_body','Current private assistance message'),'user_MatchRoomFixture1',false)->>'accepted'='true',
  'current private assistance opens only with participant message through trusted boundary');
select pg_temp.mr_error($q$select public.call_patch2_private_assistance('open_private_assistance',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_client_message_id',pg_temp.mr_id(915),
    'p_body','Unrelated assistance attempt'),'user_MatchRoomFixture3',false)$q$,'42501','outsider cannot open participant assistance');
reset role;

update public.platform_settings set value='{"enabled":true,"version":"public-gaming-profile-v1"}'
where key='public_gaming_profile_notice';
set local role service_role;
select pg_temp.mr_actor('user_MatchRoomFixture4',true);
select pg_temp.mr_error($q$select public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')$q$,
  '42501','verified staff still needs current competitive acknowledgement');
select public.acknowledge_public_gaming_profile_notice('user_MatchRoomFixture4','public-gaming-profile-v1');
select pg_temp.mr_assert(jsonb_array_length(public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')->'messages')=2,
  'acknowledged verified staff retains proper current access');
select pg_temp.mr_assert(public.set_match_room_enabled(false,'user_MatchRoomFixture4')='{"enabled":false}'::jsonb,
  'verified service caller can disable Match Room');
select pg_temp.mr_error($q$select public.call_patch2_match_staff('send_admin_match_room_message',
  jsonb_build_object('p_match_id',pg_temp.mr_id(301),'p_expected_room_id',pg_temp.mr_room('current-room'),
    'p_client_message_id',pg_temp.mr_id(916),'p_body','Blocked by feature disable'),'user_MatchRoomFixture4')$q$,
  'P0001','kill switch also blocks the trusted staff gateway');
select public.close_ironclad_player_account('user_MatchRoomFixture4');
select pg_temp.mr_error($q$select public.call_patch2_match_staff('get_match_room_history',
  jsonb_build_object('p_room_id',pg_temp.mr_room('current-room'),'p_after_sequence',0,'p_limit',50),'user_MatchRoomFixture4')$q$,
  '42501','account closure overrides persisted staff grant and receipt');
reset role;

select jsonb_build_object('suite','match-room-current-security','passed',count(*))
from match_room_test_results;
rollback;
