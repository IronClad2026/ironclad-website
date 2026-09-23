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
alter table public.account_legal_acceptances enable trigger user;
alter table public.match_result_report_groups enable trigger user;
alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;
alter table public.players enable trigger user;

select pg_temp.mr_assert(has_function_privilege('authenticated',
  'public.get_match_room_unread_summary(uuid[])', 'execute'), 'authenticated batch execute allowed');
select pg_temp.mr_assert(not has_function_privilege('anon',
  'public.get_match_room_unread_summary(uuid[])', 'execute'), 'public batch execute denied');
select pg_temp.mr_assert(not has_function_privilege('service_role',
  'public.get_match_room_unread_summary(uuid[])', 'execute'), 'service role has no unread shortcut');
select pg_temp.mr_assert(not has_table_privilege('authenticated', 'public.match_messages', 'select'),
  'projection adds no broad message grant');
select public.set_match_room_enabled(true, 'match-room-test-4');
create temporary table unread_competition_snapshot as
select id, to_jsonb(m) value from public.tournament_matches m where id::text like 'd19a0000-%';

set local role authenticated;
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values
  ('ab', public.resolve_match_room(pg_temp.mr_id(301))),
  ('rr', public.resolve_match_room(pg_temp.mr_id(311)));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'empty room is not unread');
insert into match_room_test_state values ('send1', public.send_match_room_message(
  pg_temp.mr_id(301), pg_temp.mr_room('ab'), pg_temp.mr_id(901), 'Private opponent message'));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'A does not receive attention for own send');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) =
  jsonb_build_object('items', jsonb_build_array(jsonb_build_object('matchId', pg_temp.mr_id(301),
    'roomId', pg_temp.mr_room('ab'), 'unreadSource', 'opponent'))),
  'B receives exact safe opponent projection');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_unread_summary(
  array[pg_temp.mr_id(301), pg_temp.mr_id(311), pg_temp.mr_id(999)])->'items') = 1,
  'batch returns only genuinely unread rooms');
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'unrelated C receives no private state');
select pg_temp.mr_actor('match-room-test-4', true);
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'admin privileges do not grant player attention');
reset role;
set local role anon;
select pg_temp.mr_actor('');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array[pg_temp.mr_id(301)])',
  '42501', 'signed-out projection access denied');
reset role;

update public.notifications set read_at = now(), in_app_hidden_at = now()
where recipient_clerk_user_id = 'match-room-test-2' and match_id = pg_temp.mr_id(301);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_unread_summary(
  array[pg_temp.mr_id(301)])->'items') = 1, 'bell dismiss does not acknowledge room');
insert into match_room_test_state values ('read1', public.mark_match_room_read(pg_temp.mr_room('ab'), 1));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'genuine room cursor catch-up clears attention');
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('send2', public.send_match_room_message(
  pg_temp.mr_id(301), pg_temp.mr_room('ab'), pg_temp.mr_id(902), 'Later opponent message'));
select pg_temp.mr_actor('match-room-test-2');
insert into match_room_test_state values ('read-stale', public.mark_match_room_read(pg_temp.mr_room('ab'), 1));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)])
  ->'items'->0->>'unreadSource' = 'opponent', 'new incoming message survives stale read acknowledgement');
select pg_temp.mr_actor('match-room-test-4', true);
insert into match_room_test_state values ('send-admin', public.send_admin_match_room_message(
  pg_temp.mr_id(301), pg_temp.mr_room('ab'), pg_temp.mr_id(903), 'Private admin message'));
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)])
  ->'items'->0->>'unreadSource' = 'generic', 'mixed unread source uses generic label');
insert into match_room_test_state values ('read-opponent', public.mark_match_room_read(pg_temp.mr_room('ab'), 2));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)])
  ->'items'->0->>'unreadSource' = 'admin', 'admin-only unread source receives admin label');
select pg_temp.mr_actor('match-room-test-1');
insert into match_room_test_state values ('send-rr', public.send_match_room_message(
  pg_temp.mr_id(311), pg_temp.mr_room('rr'), pg_temp.mr_id(904), 'Round robin message'));
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_unread_summary(
  array[pg_temp.mr_id(301), pg_temp.mr_id(311)])->'items') = 2,
  'two legitimate rooms independently show unread including scheduled round robin');
select pg_temp.mr_assert(public.get_match_room_unread_summary('{}'::uuid[]) = '{"items":[]}', 'empty batch supported');
select pg_temp.mr_error('select public.get_match_room_unread_summary(null)', '22023', 'null batch denied');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array[null]::uuid[])', '22023', 'null ID denied');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array[pg_temp.mr_id(301),pg_temp.mr_id(301)])',
  '22023', 'duplicate batch IDs denied');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array(select pg_temp.mr_id(n) from generate_series(1,129)n))',
  '22023', 'oversized batch denied');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array[[pg_temp.mr_id(301)],[pg_temp.mr_id(311)]])',
  '22023', 'multidimensional batch denied');
reset role;
select pg_temp.mr_assert(not exists(select 1 from unread_competition_snapshot s
  join public.tournament_matches m using(id) where s.value <> to_jsonb(m)),
  'summary send and read leave all competition facts untouched');
select public.set_match_room_enabled(false, 'match-room-test-4');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301), pg_temp.mr_id(311)]) = '{"items":[]}',
  'database kill switch safely removes all attention');
select pg_temp.mr_error(format('select public.mark_match_room_read(%L,3)', pg_temp.mr_room('ab')),
  'P0001', 'summary does not bypass disabled read mutation');
reset role;
select public.set_match_room_enabled(true, 'match-room-test-4');

-- Only synthetic fixtures are changed; existing pairing triggers perform the
-- same immutable generation transition used by authorized match management.
update public.tournament_matches set status = 'scheduled' where id = pg_temp.mr_id(301);
update public.tournament_matches set player_two_registration_id = pg_temp.mr_id(203)
where id = pg_temp.mr_id(301);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-3');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'C never inherits B unread on A/C reassignment');
insert into match_room_test_state values ('ac', public.resolve_match_room(pg_temp.mr_id(301)));
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'new empty A/C room does not inherit historical state');
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_history(pg_temp.mr_room('ab'),0,50)->'messages') = 3,
  'B can still retrieve authorized pinned historical A/B history');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(301)]) = '{"items":[]}',
  'pinned historical A/B cannot contaminate current A/C card');
reset role;

update public.tournament_matches set status = 'pending_review' where id = pg_temp.mr_id(311);
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(jsonb_array_length(public.get_match_room_unread_summary(array[pg_temp.mr_id(311)])->'items') = 1,
  'pending review remains an actionable attention state');
reset role;
-- Complete only the synthetic fixture through the existing result authority.
-- The summary must recheck lifecycle before any history call closes the room.
select public.apply_admin_official_match_result(pg_temp.mr_id(311), 2, 0, pg_temp.mr_id(211), 'match-room-test-4');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_assert(public.get_match_room_unread_summary(array[pg_temp.mr_id(311)]) = '{"items":[]}',
  'completed match suppresses persistent historical glow');
reset role;
select public.close_ironclad_player_account('match-room-test-2');
set local role authenticated;
select pg_temp.mr_actor('match-room-test-2');
select pg_temp.mr_error('select public.get_match_room_unread_summary(array[pg_temp.mr_id(301)])', '42501',
  'closed account cannot use an otherwise valid Clerk token');
reset role;
select 'UNREAD_SUMMARY_ASSERTIONS=' || count(*) from match_room_test_results;
rollback;
