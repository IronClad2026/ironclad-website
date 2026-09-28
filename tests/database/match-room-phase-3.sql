-- Match Room Phase 3 executable security/lifecycle contract.
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

-- New raw tables remain unavailable even to service-role application code.
do $$
declare v_table text; v_role text; v_privilege text; v_rpc text;
begin
  foreach v_table in array array['match_room_notification_episodes','match_room_assistance'] loop
    perform pg_temp.mr_assert((select relrowsecurity and relforcerowsecurity from pg_class
      where oid = ('public.' || v_table)::regclass), v_table || ' forced RLS');
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
        perform pg_temp.mr_assert(not has_table_privilege(v_role,'public.' || v_table,v_privilege),
          v_table || ' ' || v_role || ' ' || v_privilege || ' denied');
      end loop;
    end loop;
  end loop;
  foreach v_rpc in array array['get_match_room_earlier_history(uuid,bigint,integer)',
    'get_match_room_assistance(uuid)','request_match_room_assistance(uuid,bigint)','resolve_match_room_assistance(uuid,bigint)'] loop
    perform pg_temp.mr_assert(has_function_privilege('authenticated','public.' || v_rpc,'EXECUTE'),v_rpc || ' authenticated');
    perform pg_temp.mr_assert(not has_function_privilege('anon','public.' || v_rpc,'EXECUTE'),v_rpc || ' anon denied');
    perform pg_temp.mr_assert(not has_function_privilege('service_role','public.' || v_rpc,'EXECUTE'),v_rpc || ' service denied');
  end loop;
end;
$$;
insert into match_room_test_state values('competition-before',(select jsonb_agg(to_jsonb(m) order by id)
  from public.tournament_matches m where id::text like 'd19a0000%'));
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('ab',public.resolve_match_room(pg_temp.mr_id(311)));
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(801),'First private message');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(802),'Second private message');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(803),'Third private message');
select pg_temp.mr_assert((public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(801),'First private message')->>'duplicate')::boolean,
  'idempotent send returns duplicate');
reset role;
select pg_temp.mr_assert((select count(*)=3 from public.match_messages where room_id=pg_temp.mr_room('ab')),
  'three persisted messages after retry');
select pg_temp.mr_assert((select count(*)=1 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('ab')),
  'three messages create one unread episode');
select pg_temp.mr_assert((select count(*)=1 from public.notifications where type='match.message_received' and match_id=pg_temp.mr_id(311)),
  'three messages create one notification');
select pg_temp.mr_assert((select recipient_clerk_user_id='match-room-test-2' and recipient_role='player'
  and push_delivery_status='pending' and actor_clerk_user_id is null and message='You have new messages in your Match Room.'
  and metadata->>'roomId'=pg_temp.mr_room('ab')::text and metadata ? 'episodeId'
  and position('private message' in (metadata::text || message || title))=0
  from public.notifications where type='match.message_received' and match_id=pg_temp.mr_id(311)),
  'generic durable recipient-only exact-room push episode');

set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
reset role;
update public.notifications set read_at=clock_timestamp(),in_app_hidden_at=clock_timestamp()
  where type='match.message_received' and match_id=pg_temp.mr_id(311);
set local role authenticated;
select public.mark_match_room_read(pg_temp.mr_room('ab'),2);
reset role;
select pg_temp.mr_assert((select count(*)=1 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('ab') and resolved_at is null),
  'bell read dismissal and partial transcript read do not resolve episode');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(804),'After bell dismissal');
reset role;
select pg_temp.mr_assert((select count(*)=1 from public.notifications where type='match.message_received' and match_id=pg_temp.mr_id(311)),
  'bell dismissal cannot start another notification episode');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select public.mark_match_room_read(pg_temp.mr_room('ab'),4);
reset role;
select pg_temp.mr_assert((select count(*)=0 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('ab') and resolved_at is null),
  'full cursor catchup resolves episode');
select pg_temp.mr_assert((select push_delivery_status='skipped' and read_at is not null from public.notifications
  where type='match.message_received' and match_id=pg_temp.mr_id(311)), 'catchup skips pending push');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(805),'New episode after catchup');
select pg_temp.mr_actor('match-room-test-4',true);
select public.send_admin_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(806),'Admin message');
reset role;
select pg_temp.mr_assert((select count(*)=3 from public.notifications where type='match.message_received' and match_id=pg_temp.mr_id(311)),
  'new episode after catchup and admin notifies both original members as appropriate');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1',true);
select public.send_admin_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(807),'Participant acting as admin');
reset role;
select pg_temp.mr_assert((select count(*)=1 from public.notifications where type='match.message_received'
  and recipient_clerk_user_id='match-room-test-1' and match_id=pg_temp.mr_id(311)),
  'admin sender who is a participant receives no self notification');

-- Failure in durable episode insertion rolls back its message and sequence.
create function pg_temp.mr_fail_notification() returns trigger language plpgsql as $$
begin if new.type='match.message_received' then raise exception 'MATCH_ROOM_TEST_NOTIFICATION_FAILURE'; end if; return new; end;
$$;
create trigger match_room_test_notification_failure before insert on public.notifications
for each row execute function pg_temp.mr_fail_notification();
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select public.mark_match_room_read(pg_temp.mr_room('ab'),7);
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_error($q$select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ab'),pg_temp.mr_id(808),'Atomic failure')$q$,
  'P0001','notification insertion failure rejects entire send');
reset role;
drop trigger match_room_test_notification_failure on public.notifications;
select pg_temp.mr_assert((select last_sequence=7 from public.match_rooms where id=pg_temp.mr_room('ab')),
  'notification insertion failure preserves message sequence');

set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert(public.get_match_room_assistance(pg_temp.mr_room('ab'))->>'status'='none','initial assistance none');
select pg_temp.mr_assert(public.request_match_room_assistance(pg_temp.mr_room('ab'),0)->>'status'='requested','participant requests assistance');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert((public.request_match_room_assistance(pg_temp.mr_room('ab'),0)->>'requestVersion')::bigint=1,'duplicate open request coalesces per room');
select pg_temp.mr_error($q$select public.resolve_match_room_assistance(pg_temp.mr_room('ab'),1)$q$,'42501','player cannot resolve assistance');
select pg_temp.mr_actor('match-room-test-4',true);
reset role;
update public.notifications set read_at=clock_timestamp(),in_app_hidden_at=clock_timestamp()
where type='match.admin_assistance_requested' and match_id=pg_temp.mr_id(311);
set local role authenticated;
select pg_temp.mr_assert(public.get_match_room_assistance(pg_temp.mr_room('ab'))->>'status'='requested','notification dismissal does not resolve assistance');
select pg_temp.mr_assert(public.resolve_match_room_assistance(pg_temp.mr_room('ab'),1)->>'status'='resolved','admin explicitly resolves assistance');
select pg_temp.mr_assert(public.resolve_match_room_assistance(pg_temp.mr_room('ab'),1)->>'status'='resolved','resolve retry idempotent');
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_error($q$select public.request_match_room_assistance(pg_temp.mr_room('ab'),0)$q$,'40001','stale request cannot reopen resolved assistance');
select pg_temp.mr_assert((public.request_match_room_assistance(pg_temp.mr_room('ab'),1)->>'requestVersion')::bigint=2,'participant reopens a new assistance version');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_error($q$select public.get_match_room_assistance(pg_temp.mr_room('ab'))$q$,'42501','outsider cannot see assistance');
select pg_temp.mr_error($q$select public.request_match_room_assistance(pg_temp.mr_room('ab'),0)$q$,'42501','outsider cannot request assistance');
select pg_temp.mr_error($q$select public.get_match_room_earlier_history(pg_temp.mr_room('ab'),8,50)$q$,'42501','outsider cannot read earlier history');
select pg_temp.mr_error('select public.list_match_room_assistance_requests(200)','42501','browser cannot list operational assistance');
reset role;
select pg_temp.mr_assert((select count(*)=2 from public.notifications where type='match.admin_assistance_requested' and match_id=pg_temp.mr_id(311)),
  'reopen creates separate canonical notification evidence');
select pg_temp.mr_assert((select value from match_room_test_state where name='competition-before')=
  (select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m where id::text like 'd19a0000%'),
  'messages cursors assistance resolution and reopen never modify competition facts');

-- Seed retained history without rate-limit bypass in the actual RPC.
insert into public.match_messages(room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body,created_at)
select pg_temp.mr_room('ab'),n,'player',pg_temp.mr_id(211),'match-room-test-1',pg_temp.mr_id(900+n),'Earlier fixture '||n,now()-interval '1 day'
from generate_series(8,67)n;
update public.match_rooms set last_sequence=67 where id=pg_temp.mr_room('ab');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
insert into match_room_test_state values('newest',public.get_match_room_earlier_history(pg_temp.mr_room('ab'),68,50));
insert into match_room_test_state values('earlier',public.get_match_room_earlier_history(pg_temp.mr_room('ab'),18,50));
select pg_temp.mr_assert((select jsonb_array_length(value->'messages')=50 and value->>'nextBeforeSequence'='18'
  and (value->>'hasMore')::boolean and value->'messages'->0->>'sequence'='18' and value->'messages'->49->>'sequence'='67'
  from match_room_test_state where name='newest'),'newest bounded backward page stays chronological');
select pg_temp.mr_assert((select jsonb_array_length(value->'messages')=17 and value->>'nextBeforeSequence'='1'
  and not (value->>'hasMore')::boolean and value->'messages'->0->>'sequence'='1' and value->'messages'->16->>'sequence'='17'
  from match_room_test_state where name='earlier'),'older page has no overlaps and reaches beginning');
select pg_temp.mr_assert(public.get_match_room_earlier_history(pg_temp.mr_room('ab'),1,50)->>'nextBeforeSequence'='1',
  'empty earlier page retains cursor');
select pg_temp.mr_error($q$select public.get_match_room_earlier_history(pg_temp.mr_room('ab'),100,50)$q$,'22023','future backward cursor rejected');
select pg_temp.mr_error($q$select public.get_match_room_earlier_history(pg_temp.mr_room('ab'),18,51)$q$,'22023','unbounded earlier page rejected');
reset role;
select pg_temp.mr_assert((select last_read_sequence=7 from public.match_room_reads where room_id=pg_temp.mr_room('ab') and viewer_clerk_user_id='match-room-test-2'),
  'loading earlier history never advances read state');

-- Current authority changes cannot grant old room or episode membership.
update public.tournament_matches set player_two_registration_id=pg_temp.mr_id(213) where id=pg_temp.mr_id(311);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-3');
insert into match_room_test_state values('ac',public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(public.get_match_room_assistance(pg_temp.mr_room('ac'))->>'status'='none','replacement participant does not inherit assistance');
select pg_temp.mr_error($q$select public.get_match_room_earlier_history(pg_temp.mr_room('ab'),18,50)$q$,'42501','replacement C cannot read AB earlier history');
select pg_temp.mr_error($q$select public.get_match_room_assistance(pg_temp.mr_room('ab'))$q$,'42501','replacement C cannot read AB assistance');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_earlier_history(pg_temp.mr_room('ab'),18,50)->'messages')=17,
  'original B retains historical earlier access');
reset role;
select pg_temp.mr_assert(not exists(select 1 from public.match_room_notification_episodes where room_id=pg_temp.mr_room('ac')),
  'replacement room does not inherit unread episode');
set local role service_role;
select pg_temp.mr_actor('match-room-test-4',true);
select pg_temp.mr_assert((select (value->>'totalCount')::integer>=1 and exists(
  select 1 from jsonb_array_elements(value->'requests') item
  where item->>'roomId'=pg_temp.mr_room('ab')::text and item->>'status'='requested'
) from (select public.list_match_room_assistance_requests(5000) value) queue),
  'service assistance list reflects fixture requested state without assuming an empty queue');
reset role;

-- Closed recipients are excluded and direct resolver attribution is removed.
set local role authenticated;
select pg_temp.mr_actor('match-room-test-4',true);
select public.resolve_match_room_assistance(pg_temp.mr_room('ab'),2);
reset role;
select public.close_ironclad_player_account('match-room-test-4');
select pg_temp.mr_assert((select resolved_by_clerk_user_id is null from public.match_room_assistance where room_id=pg_temp.mr_room('ab')),
  'account closure clears assistance resolver identity');
select public.close_ironclad_player_account('match-room-test-3');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
select public.send_match_room_message(pg_temp.mr_id(311),pg_temp.mr_room('ac'),pg_temp.mr_id(1101),'Closed recipient ignored');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_error($q$select public.get_match_room_assistance(pg_temp.mr_room('ac'))$q$,'42501','closed identity cannot access assistance');
reset role;
select pg_temp.mr_assert(not exists(select 1 from public.notifications where recipient_clerk_user_id='match-room-test-3'),
  'closed profile receives no message notifications');

-- Critical events outrank older chat episodes in the existing bounded worker.
-- Isolate this rollback-only queue assertion from pre-existing hosted deliveries,
-- including expired processing leases. No provider calls occur; ROLLBACK restores
-- every prior claim token, attempt, schedule and status exactly.
update public.notifications set
  push_delivery_status='skipped', push_next_attempt_at=null,
  push_claim_token=null, push_claim_expires_at=null,
  push_completed_at=clock_timestamp(), push_last_error_code='TEST_FIXTURE_ISOLATION'
where push_delivery_status in ('pending','retryable_failure','processing');
insert into public.notifications(id,recipient_role,recipient_clerk_user_id,type,title,message,event_key,metadata)
select pg_temp.mr_id(2000+n),'player','match-room-test-1','match.message_received','Generic','Generic','priority-chat-'||n,
  jsonb_build_object('roomId',pg_temp.mr_room('ab')) from generate_series(1,12)n;
update public.notifications set push_next_attempt_at='1900-01-01T00:00:00Z'::timestamptz where event_key like 'priority-chat-%';
insert into public.notifications(id,recipient_role,recipient_clerk_user_id,type,title,message,event_key)
values(pg_temp.mr_id(2100),'player','match-room-test-1','match.confirmation_required','Critical','Critical','priority-critical');
update public.notifications set push_next_attempt_at='1901-01-01T00:00:00Z'::timestamptz where id=pg_temp.mr_id(2100);
set local role service_role;
select pg_temp.mr_actor('match-room-test-1');
select pg_temp.mr_assert((select notification_id=pg_temp.mr_id(2100) from public.claim_web_push_notifications(1)),
  'critical notification outranks older message backlog');
reset role;

select 'MATCH_ROOM_PHASE_3_ASSERTIONS=' || count(*) from match_room_test_results;
rollback;
