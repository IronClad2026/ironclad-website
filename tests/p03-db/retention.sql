-- Synthetic retention/privacy contract. The local runner prepends the existing
-- phase-one rollback fixture; all competition fixture changes roll back.
select public.set_match_room_enabled(true,'match-room-test-4');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values('retention_room',public.resolve_match_room(pg_temp.mr_id(301)));
select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('retention_room'),pg_temp.mr_id(8001),'Private retained text');
select public.send_match_room_message(pg_temp.mr_id(301),pg_temp.mr_room('retention_room'),pg_temp.mr_id(8002),'Second private text');
reset role;
select pg_temp.mr_assert((select author_player_id=pg_temp.mr_id(101) from public.match_messages where client_message_id=pg_temp.mr_id(8001)),'author subject provenance follows authoritative sender');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='tournament_not_terminal_or_closure_unknown','active tournament blocks old-round routine purge');
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_room('retention_room')],'match-room-test-4')->>'messagesDeleted')::int=0,'active tournament purge deletes no message');
select pg_temp.mr_assert((public.export_match_room_privacy_data(pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),null,1,'match-room-test-4')->>'nextSequence')::int=1,'bounded subject export supplies cursor');
select pg_temp.mr_assert(jsonb_array_length(public.locate_match_room_privacy_data(pg_temp.mr_id(101),null,100,'match-room-test-4')->'rooms')=1,'subject locate exposes only linked room metadata');
select pg_temp.mr_error(format('select public.export_match_room_privacy_data(%L,%L,null,500,%L)',pg_temp.mr_id(103),pg_temp.mr_room('retention_room'),'match-room-test-4'),'42501','unrelated subject cannot export room');
select pg_temp.mr_error(format('select public.preview_match_room_retention(null,%L)','unknown-actor'),'42501','unknown operator denied');
select pg_temp.mr_error(format('select public.purge_match_room_retention(null,%L)','match-room-test-4'),'22023','purge requires explicit bounded rooms');
select pg_temp.mr_error(format('select public.export_match_room_privacy_data(%L,%L,null,501,%L)',pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),'match-room-test-4'),'22023','export rejects oversized page');
select pg_temp.mr_error(format('select public.redact_match_room_messages(%L,%L,array[%L]::uuid[],%L)',pg_temp.mr_id(102),pg_temp.mr_room('retention_room'),(select id from public.match_messages where client_message_id=pg_temp.mr_id(8001)),'match-room-test-4'),'42501','redaction cannot target another author');
select pg_temp.mr_assert((public.redact_match_room_messages(pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),array[(select id from public.match_messages where client_message_id=pg_temp.mr_id(8001))],'match-room-test-4')->>'redactedCount')::int=1,'approved privacy redaction changes only subject-authored message');
select pg_temp.mr_assert((public.redact_match_room_messages(pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),array[(select id from public.match_messages where client_message_id=pg_temp.mr_id(8001))],'match-room-test-4')->>'redactedCount')::int=0,'repeated redaction idempotent');
select pg_temp.mr_assert((select body='[removed following privacy request]' and actor_clerk_user_id is null from public.match_messages where client_message_id=pg_temp.mr_id(8001)),'redaction removes body and direct attribution');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_error(format('select public.send_match_room_message(%L,%L,%L,%L)',pg_temp.mr_id(301),pg_temp.mr_room('retention_room'),pg_temp.mr_id(8001),'Private retained text'),'23505','client retry cannot resurrect redacted content');
reset role;
select pg_temp.mr_assert((select count(*)=2 from public.match_messages),'retry failure rolls back message insertion and sequence');

set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_history(pg_temp.mr_room('retention_room'),0,50)::text not like '%author_player_id%' and public.get_match_room_history(pg_temp.mr_room('retention_room'),0,50)::text not like '%authorPlayerId%','ordinary history projection never leaks internal subject UUID');
reset role;

-- Already-unlinked historical admin attribution cannot be reconstructed. A
-- participant may still export their room without a nullable identity flag.
insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body)
values(pg_temp.mr_id(8003),pg_temp.mr_room('retention_room'),3,'admin',null,null,pg_temp.mr_id(8003),'Synthetic pre-attribution legacy message');
select pg_temp.mr_assert((public.export_match_room_privacy_data(pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),2,1,'match-room-test-4')->'messages'->0->'isSubjectSender')='false'::jsonb,'legacy null-author export has explicit false subject flag');
select pg_temp.mr_error(format('select public.export_match_room_privacy_data(%L,%L,2,1,%L)',pg_temp.mr_id(104),pg_temp.mr_room('retention_room'),'match-room-test-4'),'42501','unknown legacy administrator attribution cannot authorize unrelated export');
delete from public.match_messages where id=pg_temp.mr_id(8003);

-- Current terminal completion is observed, not first-ever completion. Suppress
-- unrelated competition fixture triggers, keep the observer under test active.
alter table public.tournaments disable trigger user;
alter table public.tournaments enable trigger tournaments_match_room_closure_observation;
update public.tournaments set status='completed' where id=pg_temp.mr_id(1);
select pg_temp.mr_assert((select completed_at>=transaction_timestamp() from ironclad_private.match_room_tournament_closures where tournament_id=pg_temp.mr_id(1)),'authoritative completed transition records current clock');
update ironclad_private.match_room_tournament_closures set completed_at=now()-interval '39 days' where tournament_id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='routine_retention','39 days retains routine messages');
update ironclad_private.match_room_tournament_closures set completed_at=now()-interval '41 days' where tournament_id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'eligibleMessageCount')::int=2,'40-day clock uses tournament closure');
update public.tournaments set status='in_progress' where id=pg_temp.mr_id(1);
select pg_temp.mr_assert(not exists(select 1 from ironclad_private.match_room_tournament_closures where tournament_id=pg_temp.mr_id(1)),'reopen clears current closure observation');
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_room('retention_room')],'match-room-test-4')->>'messagesDeleted')::int=0,'reopened tournament blocks purge');
update public.tournaments set status='completed' where id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='routine_retention','second completion starts fresh clock');
delete from ironclad_private.match_room_tournament_closures where tournament_id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='tournament_not_terminal_or_closure_unknown','legacy completed without observation fails closed');
insert into ironclad_private.match_room_tournament_closures values(pg_temp.mr_id(1),now()-interval '41 days');
alter table public.tournaments enable trigger user;

-- Explicit case identity; neither keyword-like body nor account status selects
-- a retention class. Formal assistance follows the existing 24-month policy.
select public.link_match_room_retention_case(pg_temp.mr_room('retention_room'),pg_temp.mr_id(9001),'support',null,'match-room-test-4');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_open_or_result_not_final','open support case blocks purge');
select pg_temp.mr_error(format('select public.redact_match_room_messages(%L,%L,array[%L]::uuid[],%L)',pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),(select id from public.match_messages where client_message_id=pg_temp.mr_id(8002)),'match-room-test-4'),'55000','formal case blocks ordinary privacy redaction');
select public.link_match_room_retention_case(pg_temp.mr_room('retention_room'),pg_temp.mr_id(9001),'support',now()-interval '23 months','match-room-test-4');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_retention','support closure retains 24 months');
select public.link_match_room_retention_case(pg_temp.mr_room('retention_room'),pg_temp.mr_id(9001),'support',now()-interval '25 months','match-room-test-4');
select pg_temp.mr_assert(ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason' is null,'support case expiry resumes routine eligibility');
select pg_temp.mr_error(format('select public.link_match_room_retention_case(%L,%L,%L,null,%L)',pg_temp.mr_room('retention_room'),pg_temp.mr_id(9001),'dispute','match-room-test-4'),'22023','case kind cannot be rewritten');
insert into public.match_room_assistance(room_id,status,request_version,requested_by_registration_id,requested_at,resolved_at)
 values(pg_temp.mr_room('retention_room'),'resolved',1,pg_temp.mr_id(201),now()-interval '26 months',now()-interval '23 months');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_retention','canonical assistance takes longer policy');
update public.match_room_assistance set status='requested',resolved_at=null where room_id=pg_temp.mr_room('retention_room');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_open_or_result_not_final','reopened assistance blocks purge');
update public.match_room_assistance set status='resolved',resolved_at=now()-interval '25 months' where room_id=pg_temp.mr_room('retention_room');

-- Result-linked cases use official RESULTFINAL, not support-case closed_at.
alter table public.tournament_matches disable trigger user;
alter table public.match_result_report_groups disable trigger user;
update public.tournament_matches set status='completed',winner_registration_id=pg_temp.mr_id(201),player_one_score=2,player_two_score=0,official_result_decided_at=now()-interval '23 months' where id=pg_temp.mr_id(301);
update public.match_result_report_groups set status='approved',disputed_at=now()-interval '26 months',finalized_at=now()-interval '25 months' where id=pg_temp.mr_id(401);
alter table public.match_result_report_groups enable trigger user;
alter table public.tournament_matches enable trigger user;
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'caseEligibleAt')::timestamptz>now(),'dispute uses authoritative current result-final clock');
alter table public.tournament_matches disable trigger user;
update public.tournament_matches set official_result_decided_at=now()-interval '25 months' where id=pg_temp.mr_id(301);
alter table public.tournament_matches enable trigger user;
select pg_temp.mr_assert(ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason' is null,'24 months after result final permits cleanup');
alter table public.tournament_matches disable trigger user;
update public.tournament_matches set status='in_progress',official_result_decided_at=null,winner_registration_id=null,player_one_score=null,player_two_score=null where id=pg_temp.mr_id(301);
alter table public.tournament_matches enable trigger user;
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_open_or_result_not_final','result reset invalidates previous final retention clock');
alter table public.tournament_matches disable trigger user;
update public.tournament_matches set status='completed',winner_registration_id=pg_temp.mr_id(201),player_one_score=2,player_two_score=0,official_result_decided_at=now()-interval '25 months' where id=pg_temp.mr_id(301);
alter table public.tournament_matches enable trigger user;

alter table public.tournament_matches disable trigger user;
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(203) where id=pg_temp.mr_id(301);
alter table public.tournament_matches enable trigger user;
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'blockedReason')='formal_case_open_or_result_not_final','replacement pairing cannot supply old room case result-final clock');
alter table public.tournament_matches disable trigger user;
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(202) where id=pg_temp.mr_id(301);
alter table public.tournament_matches enable trigger user;

-- Mixed unknown IDs cannot hide behind an otherwise valid subject-owned row.
select pg_temp.mr_error(format('select public.redact_match_room_messages(%L,%L,array[%L,%L]::uuid[],%L)',pg_temp.mr_id(101),pg_temp.mr_room('retention_room'),(select id from public.match_messages where client_message_id=pg_temp.mr_id(8002)),pg_temp.mr_id(998877),'match-room-test-4'),'42501','mixed unavailable redaction IDs fail whole batch');
select pg_temp.mr_error(format('select public.set_match_room_retention_hold(%L,array[%L,%L]::uuid[],%L,%L,now()+interval ''1 day'',%L)',pg_temp.mr_room('retention_room'),(select id from public.match_messages where client_message_id=pg_temp.mr_id(8002)),pg_temp.mr_id(998877),pg_temp.mr_id(991122),'legal','match-room-test-4'),'22023','mixed unavailable hold IDs fail whole batch');

savepoint formal_case_provenance;
update public.match_result_report_groups set review_notes='Synthetic explicit formal-case authority' where id=pg_temp.mr_id(401);
select pg_temp.mr_assert(exists(select 1 from ironclad_private.match_room_retention_cases where room_id=pg_temp.mr_room('retention_room') and case_reference=pg_temp.mr_id(401) and case_kind='dispute'),'formal report transition records minimal authoritative case linkage');
delete from public.match_result_report_groups where id=pg_temp.mr_id(401);
select pg_temp.mr_assert(ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'retentionClass'='formal_case','deleted report cannot silently downgrade retained case evidence to routine');
rollback to savepoint formal_case_provenance;
-- Assertions above are intentionally rolled back with this savepoint; repeat
-- their result labels after verifying the restored source row exists.
select pg_temp.mr_assert(exists(select 1 from public.match_result_report_groups where id=pg_temp.mr_id(401)),'formal-case provenance and deletion safety savepoint passed');

-- A narrow hold protects exactly its selected message while the other eligible
-- body is removed. Expiration/release does not start a new retention period.
insert into match_room_test_state values('hold',public.set_match_room_retention_hold(pg_temp.mr_room('retention_room'),
 array[(select id from public.match_messages where client_message_id=pg_temp.mr_id(8002))],pg_temp.mr_id(9010),'legal',now()+interval '5 days','match-room-test-4'));
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'heldMessageCount')::int=1,'narrow hold counts only affected message');
select pg_temp.mr_error(format('select public.set_match_room_retention_hold(%L,null,%L,%L,null,%L)',pg_temp.mr_room('retention_room'),pg_temp.mr_id(9011),'legal','match-room-test-4'),'22023','indefinite hold rejected');
select pg_temp.mr_error(format('select public.set_match_room_retention_hold(%L,null,%L,%L,now()+interval ''367 days'',%L)',pg_temp.mr_room('retention_room'),pg_temp.mr_id(9011),'legal','match-room-test-4'),'22023','hold maximum expiry enforced');
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_room('retention_room')],'match-room-test-4')->>'messagesDeleted')::int=1,'purge removes unheld routine content without broadening hold');
select pg_temp.mr_assert((select body='Second private text' from public.match_messages where client_message_id=pg_temp.mr_id(8002)),'held body survives purge');
select pg_temp.mr_assert((select content_purged_at is null from public.match_rooms where id=pg_temp.mr_room('retention_room')),'partially held room not marked fully purged');

-- Actual account closure preserves legitimate held content without claiming
-- anonymisation; direct Clerk/read attribution goes and retained UUID locates it.
select public.close_ironclad_player_account('match-room-test-1');
select pg_temp.mr_assert((select actor_clerk_user_id is null and body='Second private text' and author_player_id=pg_temp.mr_id(101) from public.match_messages where client_message_id=pg_temp.mr_id(8002)),'account closure scrubs attribution but preserves held body and subject provenance');
select pg_temp.mr_assert(not exists(select 1 from public.match_room_reads where viewer_clerk_user_id='match-room-test-1'),'account closure removes reads');
select pg_temp.mr_assert(jsonb_array_length(public.locate_match_room_privacy_data(pg_temp.mr_id(101),null,100,'match-room-test-4')->'rooms')=1,'closed subject still locatable by retained player UUID');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_error(format('select public.get_match_room_history(%L,0,50)',pg_temp.mr_room('retention_room')),null,'closed account immediately loses room access');
reset role;
select public.release_match_room_retention_hold((select (value->>'holdId')::uuid from match_room_test_state where name='hold'),'match-room-test-4');
select public.release_match_room_retention_hold((select (value->>'holdId')::uuid from match_room_test_state where name='hold'),'match-room-test-4');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_room('retention_room'))->>'eligibleMessageCount')::int=1,'hold release resumes already overdue eligibility immediately');
create temporary table retention_competition_before as
 select (select jsonb_agg(to_jsonb(t) order by id) from public.tournaments t) tournaments,
 (select jsonb_agg(to_jsonb(t) order by id) from public.tournament_matches t) matches,
 (select jsonb_agg(to_jsonb(t) order by id) from public.match_result_report_groups t) reports,
 (select jsonb_agg(to_jsonb(t) order by id) from public.registrations t) registrations;
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_room('retention_room')],'match-room-test-4')->>'messagesDeleted')::int=1,'released hold permits final content purge');
select pg_temp.mr_assert((select content_purged_at is not null and closed_at is not null and last_sequence=2 from public.match_rooms where id=pg_temp.mr_room('retention_room')),'minimal room tombstone keeps sequence and closes history');
select pg_temp.mr_assert(not exists(select 1 from public.match_room_reads where room_id=pg_temp.mr_room('retention_room')) and not exists(select 1 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('retention_room')) and not exists(select 1 from public.match_room_assistance where room_id=pg_temp.mr_room('retention_room')),'expired private reads episodes and assistance cleaned');
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_room('retention_room')],'match-room-test-4')->>'messagesDeleted')::int=0,'completed purge is idempotent');
select pg_temp.mr_assert((public.preview_match_room_retention(null,'match-room-test-4')->'rooms'->0->>'eligibleMessageCount')::int=0,'default preview exposes zero eligibility for purged tombstone');
select pg_temp.mr_assert((select tournaments=(select jsonb_agg(to_jsonb(t) order by id) from public.tournaments t) and matches=(select jsonb_agg(to_jsonb(t) order by id) from public.tournament_matches t) and reports=(select jsonb_agg(to_jsonb(t) order by id) from public.match_result_report_groups t) and registrations=(select jsonb_agg(to_jsonb(t) order by id) from public.registrations t) from retention_competition_before),'purge preserves exact competitive authority rows');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_error(format('select public.mark_match_room_read(%L,2)',pg_temp.mr_room('retention_room')),'55000','purged tombstone cannot acquire fresh read cursor');
select pg_temp.mr_error(format('select public.request_match_room_assistance(%L,0)',pg_temp.mr_room('retention_room')),null,'purged tombstone cannot reopen assistance');
reset role;
select pg_temp.mr_assert(not exists(select 1 from ironclad_private.match_room_privacy_audit where counts::text like '%Private retained%' or counts::text like '%Second private%' or counts::text like '%match-room-test%'),'audit contains no body or Clerk identifiers');

do $$ declare f record; r text; t text; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in('preview_match_room_retention','purge_match_room_retention','locate_match_room_privacy_data','export_match_room_privacy_data','link_match_room_retention_case','set_match_room_retention_hold','release_match_room_retention_hold','redact_match_room_messages') loop
  perform pg_temp.mr_assert(has_function_privilege('service_role',f.signature,'EXECUTE') and not has_function_privilege('authenticated',f.signature,'EXECUTE') and not has_function_privilege('anon',f.signature,'EXECUTE'),f.signature||' explicit service-only grant');
 end loop;
 foreach t in array array['match_room_tournament_closures','match_room_retention_cases','match_room_retention_holds','match_room_privacy_audit','match_room_redactions'] loop
  perform pg_temp.mr_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid=('ironclad_private.'||t)::regclass) and not has_table_privilege('service_role','ironclad_private.'||t,'SELECT'),t||' forced RLS without raw service grant');
 end loop;
end $$;
-- Bounded deletion, finite-hold expiry and cancelled/voided terminal authority.
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,player_one_registration_id,player_two_registration_id,last_sequence)
values(pg_temp.mr_id(8100),pg_temp.mr_id(301),2,2,1,pg_temp.mr_id(201),pg_temp.mr_id(202),1001);
insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body)
select pg_temp.mr_id(10000+n),pg_temp.mr_id(8100),n,'player',pg_temp.mr_id(202),'match-room-test-2',pg_temp.mr_id(20000+n),'Synthetic bounded retention body' from generate_series(1,1001)n;
insert into match_room_test_state values('expired_hold',public.set_match_room_retention_hold(pg_temp.mr_id(8100),null,pg_temp.mr_id(9020),'security',now()+interval '1 day','match-room-test-4'));
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_id(8100)],'match-room-test-4')->>'messagesDeleted')::int=0,'whole-room hold blocks exactly selected room');
update ironclad_private.match_room_retention_holds set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=(select (value->>'holdId')::uuid from match_room_test_state where name='expired_hold');
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_id(8100))->>'eligibleMessageCount')::int=1001,'finite hold expiry restores ordinary eligibility without restart');
alter table public.tournaments disable trigger user;
update public.tournaments set status='cancelled',terminal_at=now()-interval '41 days',terminal_reason='Synthetic cancellation authority',terminated_by_clerk_user_id='match-room-test-4' where id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_id(8100))->>'closedAt')::timestamptz=(select terminal_at from public.tournaments where id=pg_temp.mr_id(1)),'cancelled uses authoritative terminal_at');
update public.tournaments set status='voided' where id=pg_temp.mr_id(1);
select pg_temp.mr_assert((ironclad_private.match_room_retention_state(pg_temp.mr_id(8100))->>'eligibleMessageCount')::int=1001,'voided terminal timestamp gives same routine eligibility');
alter table public.tournaments enable trigger user;
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_id(8100)],'match-room-test-4')->>'messagesDeleted')::int=1000,'purge caps each room at 1000 bodies per invocation');
select pg_temp.mr_assert((select count(*)=1 from public.match_messages where room_id=pg_temp.mr_id(8100)) and (select content_purged_at is null from public.match_rooms where id=pg_temp.mr_id(8100)),'partial bounded batch preserves resumable room state');
select pg_temp.mr_assert((public.purge_match_room_retention(array[pg_temp.mr_id(8100)],'match-room-test-4')->>'messagesDeleted')::int=1,'safe retry finishes bounded batch');
select pg_temp.mr_assert(exists(select 1 from ironclad_private.match_room_privacy_audit where room_id=pg_temp.mr_id(8100) and operation='purge' and counts->>'messagesDeleted'='1000'),'purge audit attributes counts to correct room');
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,player_one_registration_id,player_two_registration_id,closed_at,closure_reason)
select pg_temp.mr_id(30000+n),pg_temp.mr_id(301),100+n,100+n,1,pg_temp.mr_id(201),pg_temp.mr_id(202),now(),'match_completed' from generate_series(1,101)n;
select pg_temp.mr_assert(jsonb_array_length(public.preview_match_room_retention(null,'match-room-test-4')->'rooms')=100 and public.preview_match_room_retention(null,'match-room-test-4')->>'nextRoomId' is not null,'preview bounds candidate inspection before eligibility evaluation');
select pg_temp.mr_assert(jsonb_array_length(public.preview_match_room_retention(null,'match-room-test-4',(public.preview_match_room_retention(null,'match-room-test-4')->>'nextRoomId')::uuid)->'rooms')=3,'preview cursor advances past blocked or tombstoned candidates');
select jsonb_build_object('suite','match-room-retention','passed',count(*),'checks',jsonb_agg(name order by name)) from match_room_test_results;
rollback;
