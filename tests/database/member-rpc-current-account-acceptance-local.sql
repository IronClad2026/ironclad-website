\set ON_ERROR_STOP on
-- LOCAL ONLY: full replay, synthetic fixtures, no hosted credentials.
-- Uses actual member session authorization and role for every tested RPC.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local client_min_messages = warning;
do $$
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
    or inet_server_port() <> 56584
    or current_database() <> 'ironclad_member_rpc_tests' then
    raise exception 'Member RPC tests require the isolated local replay';
  end if;
end;
$$;
create role ironclad_member_rpc_test_client noinherit login;
grant authenticated, anon to ironclad_member_rpc_test_client;
grant usage on schema auth to authenticated, anon;
create temporary table member_rpc_results (name text primary key);
grant insert, select on member_rpc_results to authenticated, anon;

create function pg_temp.assert_true(p_ok boolean, p_name text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %', p_name; end if;
  insert into member_rpc_results values(p_name);
end;
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text,p_name text)
returns void language plpgsql as $$
declare v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and sqlerrm <> p_message) then
      raise exception 'FAILED: %: unexpected SQLSTATE %, message %',p_name,sqlstate,sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.assert_true(v_failed,p_name);
end;
$$;

-- Synthetic prerequisites only. Preserve FKs/checks, enable all domain triggers
-- again before tested operations; the entire fixture rolls back.
alter table public.players disable trigger user;
alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;
alter table public.polls disable trigger user;
alter table public.poll_options disable trigger user;
alter table public.poll_eligible_voters disable trigger user;

insert into public.legal_documents(id,document_kind,version,immutable_url,status,published_at,effective_at,sha256)
select ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
case when n in(1,3) then 'terms' else 'privacy' end,
case when n<3 then 'local-current' else 'local-stale' end,
'https://local-test.invalid/legal/member-rpc-'||n||'.pdf',
case when n<3 then 'effective' else 'superseded' end,
clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',repeat('a',64)
from generate_series(1,4)n;
insert into public.players(id,clerk_user_id,display_name,in_game_name,profile_completed,current_elo)
select ('a1100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'member-rpc-test-'||n,'Member RPC Synthetic '||n,'Member RPC Synthetic '||n,true,1000
from generate_series(1,7)n;
insert into public.account_legal_acceptances(clerk_user_id,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
select 'member-rpc-test-'||n,t.id,t.version,t.immutable_url,t.sha256,p.id,p.version,p.immutable_url,p.sha256,true,true
from generate_series(1,7)n
join public.legal_documents t on t.id=case when n=3 then 'a1000000-0000-4000-8000-000000000003' else 'a1000000-0000-4000-8000-000000000001' end::uuid
join public.legal_documents p on p.id=case when n=3 then 'a1000000-0000-4000-8000-000000000004' else 'a1000000-0000-4000-8000-000000000002' end::uuid
where n in(1,3,6,7);
insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled)
values
('a1200000-0000-4000-8000-000000000001','Member RPC Dice','member-rpc-dice','1v1','in_progress','Synthetic','','',false),
('a1200000-0000-4000-8000-000000000002','Member RPC Waitlist','member-rpc-waitlist','1v1','registration_open','Synthetic','','',true);
insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players,launched_at)
values
('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','Academy','0-1099',8,clock_timestamp()-interval '1 hour'),
('a1300000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000002','Academy','0-1099',8,null);
insert into public.registrations(id,profile_id,clerk_user_id,player_name,tournament_title,bracket_name,registration_status,elo_status,submitted_elo,tournament_id,tournament_bracket_id,waitlist_offer_status,waitlist_offer_created_at,waitlist_offer_expires_at)
select ('a1400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
('a1100000-0000-4000-8000-'||lpad(player_n::text,12,'0'))::uuid,
'member-rpc-test-'||player_n,'Synthetic','Member RPC','Academy Bracket',state,'pending',1000,
('a1200000-0000-4000-8000-'||lpad(event_n::text,12,'0'))::uuid,
('a1300000-0000-4000-8000-'||lpad(event_n::text,12,'0'))::uuid,
case when state='waitlisted' then 'offered' end,
case when state='waitlisted' then now()-interval '1 hour' end,
case when state='waitlisted' then now()+interval '23 hours' end
from (values(1,1,1,'approved'),(2,2,1,'approved'),(3,1,2,'waitlisted'),(4,2,2,'waitlisted'),(5,4,2,'waitlisted'),(6,5,2,'pending')) x(n,player_n,event_n,state);
insert into public.generated_brackets(id,tournament_bracket_id,format,participant_count,slot_count,generated_by)
values('a1800000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','single_elimination',8,8,'member-rpc-test');
insert into public.bracket_rounds(id,generated_bracket_id,round_number,name)
values('a1900000-0000-4000-8000-000000000001','a1800000-0000-4000-8000-000000000001',1,'Synthetic');
insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,player_one_registration_id,player_two_registration_id,status,series_best_of,activation_version,activated_at,deadline_at)
values('a1700000-0000-4000-8000-000000000001','a1800000-0000-4000-8000-000000000001','a1900000-0000-4000-8000-000000000001',1,'a1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000002','in_progress',3,1,now()-interval '1 hour',now()+interval '1 day');
insert into public.polls(id,purpose,audience_kind,question,option_source,max_selections,winner_count,authority,result_visibility,opens_at,closes_at,published_at,published_by_clerk_user_id,created_by_clerk_user_id,updated_by_clerk_user_id)
values('a1500000-0000-4000-8000-000000000001','community_feedback','selected_active_players','Synthetic?','text',1,1,'advisory','live',now()-interval '1 hour',now()+interval '1 day',now()-interval '1 hour','member-rpc-test','member-rpc-test','member-rpc-test');
insert into public.poll_options(id,poll_id,position,label_snapshot)
values('a1600000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001',1,'One'),('a1600000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000001',2,'Two');
insert into public.poll_eligible_voters(poll_id,player_id)
select 'a1500000-0000-4000-8000-000000000001',('a1100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3)n;

alter table public.poll_eligible_voters enable trigger user;
alter table public.poll_options enable trigger user;
alter table public.polls enable trigger user;
alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;
alter table public.players enable trigger user;

set session authorization ironclad_member_rpc_test_client;
set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-1"}';
select pg_temp.assert_true(current_user='authenticated' and session_user='ironclad_member_rpc_test_client','actual member role and session identity');
select pg_temp.assert_true(not has_function_privilege('authenticated','ironclad_private.require_current_account_legal_acceptance()','EXECUTE'),'internal helper not directly callable');
select pg_temp.assert_true((public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])->>'ballot_revision')='1','current acceptance permits ballot');
select pg_temp.assert_true((public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])->>'idempotent')='true','current ballot retry remains idempotent');
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000002'::uuid])$q$,'40001','Ballot revision conflict','ballot stale revision still denied');
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid,'a1600000-0000-4000-8000-000000000001'::uuid])$q$,'22023','Ballot selections are invalid','duplicate poll selections denied');
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid,'a1600000-0000-4000-8000-000000000002'::uuid])$q$,'22023','Ballot selections are invalid','over-limit poll selections denied');
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000099'::uuid])$q$,'22023','Ballot selections are invalid','foreign poll option denied');
select pg_temp.assert_true((public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)#>>'{roll,created}')='true','current acceptance permits dice');
select pg_temp.assert_true((public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)#>>'{roll,created}')='false','current dice retry remains idempotent');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',2,1::smallint,1)$q$,'40001',null,'stale activation denied');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003',null)$q$,'P0001','Waitlist response must be accept or decline','NULL waitlist input denied');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','')$q$,'P0001','Waitlist response must be accept or decline','empty waitlist input denied');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','unsupported')$q$,'P0001','Waitlist response must be accept or decline','invalid waitlist input denied');

set request.jwt.claims='{"role":"authenticated","sub":""}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','Poll unavailable','empty subject cannot vote');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'28000','Authentication is required','empty subject cannot roll');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')$q$,'P0001','Not authorized','empty subject cannot accept');
set request.jwt.claims='{"role":"authenticated"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','Poll unavailable','missing subject cannot vote');

set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-2"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','missing acceptance blocks ballot');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','missing acceptance blocks dice');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000004','accept')$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','missing acceptance blocks offer acceptance');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')$q$,'P0001','Waitlist offer not found','wrong offer owner denied before acceptance');

set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-3"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','stale pair does not satisfy ballot');

set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-6"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','Poll unavailable','accepted outsider cannot vote');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','Dice roll-off is unavailable','accepted outsider cannot roll');
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-7","metadata":{"role":"admin"}}';
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','Dice roll-off is unavailable','admin has no participant roll shortcut');

-- Exit paths intentionally do not require acceptance.
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-4"}';
select pg_temp.assert_true((select waitlist_offer_status='declined' from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000005','decline')),'decline works without acceptance');
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-5"}';
select pg_temp.assert_true((select registration_status='withdrawn' from public.withdraw_tournament_registration('a1400000-0000-4000-8000-000000000006')),'withdrawal works without acceptance');

-- Future/successor/unavailable document-state cases are LOCAL ONLY. Nothing
-- here may be run against the shared hosted staging effective-document set.
reset role;
reset session authorization;
update public.legal_documents set status='superseded' where id='a1000000-0000-4000-8000-000000000002';
insert into public.legal_documents(id,document_kind,version,immutable_url,status,published_at,effective_at,sha256)
values('a1000000-0000-4000-8000-000000000005','privacy','local-future','https://local-test.invalid/legal/member-rpc-5.pdf','effective',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day',repeat('b',64));
set session authorization ironclad_member_rpc_test_client;
set role authenticated;
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-1"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','future effective pair blocks even ballot retry');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','future effective pair blocks even dice retry');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','future effective pair blocks offer acceptance');

reset role;
reset session authorization;
update public.legal_documents set status='superseded' where id='a1000000-0000-4000-8000-000000000005';
set session authorization ironclad_member_rpc_test_client;
set role authenticated;
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','missing current document fails closed');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','missing current document blocks dice');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','missing current document blocks acceptance');
reset role;
reset session authorization;
insert into public.legal_documents(id,document_kind,version,immutable_url,status,published_at,effective_at,sha256)
values('a1000000-0000-4000-8000-000000000006','privacy','local-successor','https://local-test.invalid/legal/member-rpc-6.pdf','effective',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',repeat('c',64));
-- Corrupt-pair fail-closed defense is exercised only inside a local savepoint;
-- the canonical unique index is restored before any accepted mutation.
savepoint malformed_pair;
drop index public.legal_documents_one_effective_kind_idx;
insert into public.legal_documents(id,document_kind,version,immutable_url,status,published_at,effective_at,sha256)
values('a1000000-0000-4000-8000-000000000007','privacy','local-duplicate','https://local-test.invalid/legal/member-rpc-7.pdf','effective',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',repeat('d',64));
set session authorization ironclad_member_rpc_test_client;
set role authenticated;
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE','multiple current documents fail closed');
reset role;
reset session authorization;
rollback to savepoint malformed_pair;
-- Savepoint rollback also rolls back its assertion record; record completion.
select pg_temp.assert_true(to_regclass('public.legal_documents_one_effective_kind_idx') is not null,'multiple-document denial passed and canonical index restored');
set session authorization ironclad_member_rpc_test_client;
set role authenticated;
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','successor invalidates previously accepted ballot retry');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','successor invalidates previously accepted dice retry');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')$q$,'42501','ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED','successor invalidates previous offer acceptance');
reset role;
reset session authorization;
set request.jwt.claim.role='service_role';
set request.jwt.claims='{"role":"service_role","sub":"member-rpc-test-admin"}';
select * from public.accept_current_account_legal_documents('member-rpc-test-1','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000006',true,true);
set session authorization ironclad_member_rpc_test_client;
set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claims='{"role":"authenticated","sub":"member-rpc-test-1"}';
select pg_temp.assert_true((public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',0,array['a1600000-0000-4000-8000-000000000001'::uuid])->>'idempotent')='true','canonical successor acceptance restores ballot retry');
select pg_temp.assert_true((public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)#>>'{roll,created}')='false','canonical successor acceptance restores dice retry');
select pg_temp.assert_true((select waitlist_offer_status='accepted' and registration_status='pending' from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000003','accept')),'canonical successor acceptance permits owned offer');

set role anon;
set request.jwt.claim.role='anon';
set request.jwt.claims='{"role":"anon"}';
select pg_temp.expect_error($q$select public.cast_poll_ballot('a1500000-0000-4000-8000-000000000001',1,array['a1600000-0000-4000-8000-000000000001'::uuid])$q$,'42501',null,'anonymous ballot denied');
select pg_temp.expect_error($q$select public.roll_match_dice('a1700000-0000-4000-8000-000000000001',1,1::smallint,1)$q$,'42501',null,'anonymous dice denied');
select pg_temp.expect_error($q$select * from public.respond_to_waitlist_offer('a1400000-0000-4000-8000-000000000004','decline')$q$,'42501',null,'anonymous offer denied');

reset role;
reset session authorization;
select pg_temp.assert_true((select count(*)=1 from public.poll_ballot_choices),'rejections did not add ballots');
select pg_temp.assert_true((select count(*)=1 from public.match_dice_rolls),'rejections did not add dice');
select pg_temp.assert_true((select waitlist_offer_status='offered' from public.registrations where id='a1400000-0000-4000-8000-000000000004'),'rejected acceptance preserved offer');
select count(*) as passed_member_rpc_assertions from member_rpc_results;
rollback;
select (select count(*) from public.players)=0
  and (select count(*) from public.polls)=0
  and (select count(*) from public.registrations)=0
  and (select count(*) from public.account_legal_acceptances)=0
  and (select count(*) from public.legal_documents)=0
  as synthetic_fixture_rollback_restored_empty_baseline;
