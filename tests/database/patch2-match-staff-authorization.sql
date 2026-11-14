-- Disposable PostgreSQL only. Synthetic auth claims and a small match schema.
-- Run with psql -X -v ON_ERROR_STOP=1 -f from an empty localhost database.
\set QUIET on
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema ironclad_private;
create schema realtime;
grant usage on schema auth, ironclad_private to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb
$$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;

create table public.legal_documents (
  id uuid primary key, document_kind text, status text, published_at timestamptz,
  effective_at timestamptz, sha256 text
);
create table public.account_legal_acceptances (
  clerk_user_id text, terms_document_id uuid, privacy_document_id uuid,
  terms_accepted boolean, privacy_acknowledged boolean
);
create table public.players (clerk_user_id text primary key, account_closed_at timestamptz);
create table public.tournaments (id uuid primary key, status text);
create table public.tournament_brackets (id uuid primary key, tournament_id uuid, launched_at timestamptz);
create table public.generated_brackets (id uuid primary key, tournament_bracket_id uuid, format text);
create table public.tournament_matches (
  id uuid primary key, generated_bracket_id uuid, communication_generation bigint,
  player_one_registration_id uuid, player_two_registration_id uuid, status text,
  activation_version integer, series_best_of integer, official_result_submission_id uuid,
  winner_registration_id uuid, outcome_type text, hold_started_at timestamptz, hold_released_at timestamptz,
  deadline_at timestamptz
);
create table public.registrations (id uuid primary key, clerk_user_id text, player_name text,
  tournament_id uuid, tournament_bracket_id uuid);
create table public.match_rooms (
  id uuid primary key default gen_random_uuid(), match_id uuid, room_revision bigint,
  communication_generation bigint, activation_version_snapshot integer,
  player_one_registration_id uuid, player_two_registration_id uuid, created_at timestamptz default now(),
  last_sequence bigint default 0, closed_at timestamptz, closure_reason text, content_purged_at timestamptz
);
create table public.match_messages (
  id uuid primary key default gen_random_uuid(), room_id uuid, sequence bigint, sender_kind text,
  sender_registration_id uuid, actor_clerk_user_id text, client_message_id uuid, body text, created_at timestamptz
);
create table public.match_dice_rolls (
  match_id uuid, activation_version integer, game_number smallint, tie_round integer,
  participant_registration_id uuid, die_1 smallint, die_2 smallint, rolled_at timestamptz
);
create table public.match_room_reads (
  room_id uuid, viewer_clerk_user_id text, last_read_sequence bigint, updated_at timestamptz,
  primary key (room_id, viewer_clerk_user_id)
);
create table public.match_room_assistance (
  room_id uuid primary key, status text, request_version bigint, requested_at timestamptz,
  resolved_at timestamptz, resolved_by_clerk_user_id text
);
create table public.match_room_notification_episodes (room_id uuid, recipient_registration_id uuid, notification_id uuid, resolved_at timestamptz);
create table public.notifications (id uuid primary key, type text, metadata jsonb, match_id uuid, finished boolean default false);
create table public.platform_settings (key text primary key, value jsonb, updated_by_clerk_user_id text);
create table public.tournament_division_not_held_closures (tournament_bracket_id uuid);
create table ironclad_private.patch2_closed_accounts (subject_digest bytea primary key);
create table ironclad_private.patch2_staff_authorizations (
  subject_digest bytea primary key, verified_at timestamptz default now(), verification_reference text, revoked_at timestamptz
);
create table ironclad_private.public_gaming_profile_acknowledgements (subject_digest bytea, notice_version text);

-- Existing business dependencies and synthetic provider stand-ins. The test
-- runner imports the unchanged candidate ownership and policy helpers below.
create function ironclad_private.match_room_context(p_match_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('generation', communication_generation, 'playerOne', player_one_registration_id,
    'playerTwo', player_two_registration_id, 'activation', activation_version, 'eligible', true, 'writable', true)
  from public.tournament_matches where id = p_match_id
$$;
create function ironclad_private.finish_match_room_notification(p_id uuid, p_hide boolean default false)
returns void language sql as $$ update public.notifications set finished = true where id = p_id $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language plpgsql as $$ begin return; end $$;
create function ironclad_private.call_patch2_private_assistance(text,jsonb,text,boolean) returns jsonb language sql as $$ select null::jsonb $$;

-- Existing signatures and ACLs that the new migration must preserve or revoke.
create function ironclad_private.send_match_room_message(p_match_id uuid,p_expected_room_id uuid,p_client_message_id uuid,p_body text,p_admin boolean)
returns jsonb language sql as $$ select null::jsonb $$;
create function public.send_match_room_message(p_match_id uuid, p_expected_room_id uuid, p_client_message_id uuid, p_body text)
returns jsonb language sql security definer as $$
  select ironclad_private.send_match_room_message(p_match_id,p_expected_room_id,p_client_message_id,p_body,false)
$$;
create function public.send_admin_match_room_message(uuid,uuid,uuid,text) returns jsonb language sql as $$ select null::jsonb $$;
create function public.get_match_room_assistance(uuid) returns jsonb language sql as $$ select null::jsonb $$;
revoke execute on function public.get_match_room_assistance(uuid) from public;
create function public.resolve_match_room_assistance(p_room_id uuid,p_expected_request_version bigint) returns jsonb language sql as $$ select null::jsonb $$;
create function public.call_patch2_private_assistance(p_operation text,p_arguments jsonb,p_actor_clerk_user_id text,p_actor_is_admin boolean)
returns jsonb language sql as $$ select null::jsonb $$;
revoke execute on function public.call_patch2_private_assistance(text,jsonb,text,boolean) from public;
grant execute on function public.call_patch2_private_assistance(text,jsonb,text,boolean) to service_role;
create function public.get_match_dice_rolloff(p_match_id uuid) returns jsonb language sql as $$ select null::jsonb $$;
create function public.set_match_room_enabled(p_enabled boolean,p_actor_clerk_user_id text) returns jsonb language sql as $$ select null::jsonb $$;
create function ironclad_private.match_room_access(p_room_id uuid,p_sub text) returns public.match_rooms language sql as $$ select null::public.match_rooms $$;
create function ironclad_private.match_room_assistance_projection(p_room_id uuid) returns jsonb language sql as $$ select null::jsonb $$;
revoke execute on all functions in schema public, ironclad_private from public;
grant execute on function public.send_match_room_message(uuid,uuid,uuid,text), public.send_admin_match_room_message(uuid,uuid,uuid,text),
  public.get_match_dice_rolloff(uuid) to authenticated;
grant execute on function public.set_match_room_enabled(boolean,text) to service_role;

-- Unchanged function definitions from existing immutable migrations.
\i :match_staff_baseline
\ir ../../supabase/migrations/20261114064733_patch2_match_staff_authorization.sql

grant execute on function public.resolve_match_room(uuid), public.get_match_room_history(uuid,bigint,integer),
  public.get_match_room_earlier_history(uuid,bigint,integer), public.mark_match_room_read(uuid,bigint) to authenticated;

create function pg_temp.check_true(p_ok boolean, p_name text) returns text language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %', p_name; end if;
  return 'PASS ' || p_name;
end;
$$;
create function pg_temp.expect_denied(p_sql text, p_expected text default '42501') returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  if sqlstate <> p_expected then raise; end if;
  return true;
end;
$$;
create function pg_temp.claims(p_sub text, p_role text, p_staff boolean default false) returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('role', p_role, 'sub', p_sub,
    'metadata', jsonb_build_object('role', case when p_staff then 'admin' else 'player' end))::text, false)
$$;
create function pg_temp.id(p_n integer) returns uuid language sql immutable as $$
  select ('f1220000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
create function pg_temp.room_args(p_n integer) returns jsonb language sql as $$
  select jsonb_build_object('p_room_id', pg_temp.id(p_n),'p_after_sequence',0,'p_limit',50)
$$;
create function pg_temp.send_args(p_n integer, p_body text) returns jsonb language sql as $$
  select jsonb_build_object('p_match_id', pg_temp.id(4),'p_expected_room_id',pg_temp.id(7),
    'p_client_message_id',pg_temp.id(p_n),'p_body',p_body)
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated, anon, service_role',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end $$;

insert into public.platform_settings(key,value) values
  ('match_room','{"enabled":true}'),
  ('public_gaming_profile_notice','{"enabled":true,"version":"match-staff-test"}');
insert into public.players(clerk_user_id) values ('user_p1'),('user_p2'),('user_staff'),('user_demoted'),('user_closed'),('user_unrelated');
insert into ironclad_private.patch2_staff_authorizations(subject_digest,verification_reference,revoked_at) values
  (sha256(convert_to('user_staff','UTF8')),'synthetic staff',null),
  (sha256(convert_to('user_p1','UTF8')),'synthetic demoted participant',now()),
  (sha256(convert_to('user_demoted','UTF8')),'synthetic demoted staff',now()),
  (sha256(convert_to('user_closed','UTF8')),'synthetic closed staff',null),
  (sha256(convert_to('user_unacknowledged','UTF8')),'synthetic staff without notice',null);
insert into ironclad_private.patch2_closed_accounts values (sha256(convert_to('user_closed','UTF8')));
insert into ironclad_private.public_gaming_profile_acknowledgements
  select sha256(convert_to(subject,'UTF8')),'match-staff-test'
  from unnest(array['user_p1','user_p2','user_staff','user_demoted','user_closed','user_unrelated']) subject;
insert into public.legal_documents values
  (pg_temp.id(19),'terms','effective',now()-interval '1 day',now()-interval '1 day','terms-hash'),
  (pg_temp.id(20),'privacy','effective',now()-interval '1 day',now()-interval '1 day','privacy-hash');
insert into public.account_legal_acceptances values
  ('user_staff',pg_temp.id(19),pg_temp.id(20),true,true),
  ('user_p1',pg_temp.id(19),pg_temp.id(20),true,true),
  ('user_p2',pg_temp.id(19),pg_temp.id(20),true,true);
insert into public.tournaments values (pg_temp.id(1),'in_progress');
insert into public.tournament_brackets values (pg_temp.id(2),pg_temp.id(1),now()-interval '1 hour');
insert into public.generated_brackets values (pg_temp.id(3),pg_temp.id(2),'single_elimination');
insert into public.registrations values
  (pg_temp.id(5),'user_p1','Participant 1',pg_temp.id(1),pg_temp.id(2)),
  (pg_temp.id(6),'user_p2','Participant 2',pg_temp.id(1),pg_temp.id(2)),
  (pg_temp.id(8),'user_unrelated','Participant 3',pg_temp.id(1),pg_temp.id(2));
insert into public.tournament_matches(id,generated_bracket_id,communication_generation,player_one_registration_id,
  player_two_registration_id,status,activation_version,series_best_of,deadline_at) values
  (pg_temp.id(4),pg_temp.id(3),1,pg_temp.id(5),pg_temp.id(6),'in_progress',1,3,now()+interval '1 day'),
  (pg_temp.id(9),pg_temp.id(3),1,pg_temp.id(6),pg_temp.id(8),'in_progress',1,3,now()+interval '1 day');
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,
  player_one_registration_id,player_two_registration_id,last_sequence) values
  (pg_temp.id(7),pg_temp.id(4),1,1,1,pg_temp.id(5),pg_temp.id(6),1),
  (pg_temp.id(10),pg_temp.id(9),1,1,1,pg_temp.id(6),pg_temp.id(8),0);
insert into public.match_messages(room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body,created_at)
  values (pg_temp.id(7),1,'player',pg_temp.id(5),'user_p1',pg_temp.id(21),'[removed following privacy request]',now());
insert into public.match_room_assistance(room_id,status,request_version,requested_at) values (pg_temp.id(7),'requested',1,now());
insert into public.notifications(id,type,metadata,match_id) values
  (pg_temp.id(11),'match.admin_assistance_requested',jsonb_build_object('roomId',pg_temp.id(7)),pg_temp.id(4));

create function pg_temp.fingerprint() returns text language sql stable as $$
  select md5(jsonb_build_object(
    'match',(select jsonb_agg(x order by id) from public.tournament_matches x),
    'tournament',(select jsonb_agg(x order by id) from public.tournaments x),
    'messages',(select jsonb_agg(x order by id) from public.match_messages x),
    'assistance',(select jsonb_agg(x order by room_id) from public.match_room_assistance x),
    'notices',(select jsonb_agg(x order by id) from public.notifications x),
    'rooms',(select jsonb_agg(x order by id) from public.match_rooms x),
    'read',(select jsonb_agg(x order by room_id,viewer_clerk_user_id) from public.match_room_reads x)
  )::text)
$$;
select pg_temp.fingerprint() as before_denied \gset

set role anon;
select pg_temp.claims(null,'anon') \gset
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_history(pg_temp.id(7),0,50)'), 'anonymous history denied');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_dice_rolloff(pg_temp.id(4))'), 'anonymous dice denied');
reset role;
set role authenticated;
select pg_temp.claims('user_demoted','authenticated',true) \gset
select pg_temp.check_true(pg_temp.expect_denied('select public.resolve_match_room(pg_temp.id(4))'), 'stale admin cannot resolve unrelated room');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_history(pg_temp.id(7),0,50)'), 'stale admin cannot read current history');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_earlier_history(pg_temp.id(7),2,50)'), 'stale admin cannot read earlier history');
select pg_temp.check_true(pg_temp.expect_denied('select public.mark_match_room_read(pg_temp.id(7),1)'), 'stale admin cannot mark read');
select pg_temp.check_true(pg_temp.expect_denied('select public.send_match_room_message(pg_temp.id(4),pg_temp.id(7),pg_temp.id(22),''stale'')'), 'stale admin cannot send player message in unrelated room');
select pg_temp.check_true(pg_temp.expect_denied('select public.send_admin_match_room_message(pg_temp.id(4),pg_temp.id(7),pg_temp.id(22),''stale'')'), 'old staff send RPC is closed');
select pg_temp.check_true(pg_temp.expect_denied('select public.resolve_match_room_assistance(pg_temp.id(7),1)'), 'old staff assistance RPC is closed');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_dice_rolloff(pg_temp.id(4))'), 'stale admin cannot read unrelated dice');
select pg_temp.check_true(pg_temp.expect_denied($$select public.call_patch2_match_staff('get_match_room_history',pg_temp.room_args(7),'user_staff')$$), 'browser cannot forge a verified actor');
select pg_temp.check_true(pg_temp.expect_denied('select ironclad_private.get_match_room_history(pg_temp.id(7),0,50,''user_staff'',true)'), 'browser cannot reach the private staff implementation');

select pg_temp.claims('user_closed','authenticated',true) \gset
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_history(pg_temp.id(7),0,50)'), 'closed stale token cannot read rooms');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_dice_rolloff(pg_temp.id(4))'), 'closed stale token cannot read dice');
select pg_temp.claims('user_unrelated','authenticated') \gset
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_history(pg_temp.id(7),0,50)'), 'unrelated signed-in player cannot read rooms');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_dice_rolloff(pg_temp.id(4))'), 'unrelated signed-in player cannot read dice');

reset role;
set role service_role;
select pg_temp.claims(null,'service_role') \gset
select pg_temp.check_true(pg_temp.expect_denied($$select public.call_patch2_match_staff('send_admin_match_room_message',pg_temp.send_args(22,'stale'),'user_demoted')$$), 'database denies revoked roster actor through trusted gateway');
select pg_temp.check_true(pg_temp.expect_denied($$select public.call_patch2_match_staff('get_match_dice_rolloff',jsonb_build_object('p_match_id',pg_temp.id(4)),'user_closed')$$), 'database denies closed roster actor through trusted gateway');
select pg_temp.check_true(pg_temp.expect_denied($$select public.call_patch2_match_staff('get_match_dice_rolloff',jsonb_build_object('p_match_id',pg_temp.id(4)),'user_unacknowledged')$$), 'staff gateway preserves profile notice gate');
select pg_temp.check_true(pg_temp.expect_denied($$select public.call_patch2_private_assistance('resolve_match_room_assistance',jsonb_build_object('p_room_id',pg_temp.id(7),'p_expected_request_version',1),'user_demoted',true)$$), 'legacy assistance gateway rejects revoked staff');
select pg_temp.check_true(pg_temp.expect_denied($$select public.set_match_room_enabled(false,'user_demoted')$$), 'database denies revoked staff setting change');
reset role;
select pg_temp.check_true(pg_temp.fingerprint() = :'before_denied', 'denied operations preserve messages, assistance, notifications, rooms, cursors, matches and tournaments');

set role authenticated;
select pg_temp.claims('user_p2','authenticated') \gset
select pg_temp.check_true(public.get_match_room_history(pg_temp.id(7),0,50)->'messages'->0->>'body' = '[removed following privacy request]', 'participant history preserves redaction');
select pg_temp.check_true(public.get_match_dice_rolloff(pg_temp.id(4))->>'viewerRole' = 'participant', 'participant can read own dice');
select pg_temp.claims('user_p1','authenticated',true) \gset
select pg_temp.check_true(public.resolve_match_room(pg_temp.id(4))->'room'->>'viewerRegistrationId' = pg_temp.id(5)::text, 'demoted participant keeps own room');
select pg_temp.check_true(public.get_match_dice_rolloff(pg_temp.id(4))->>'viewerRole' = 'participant', 'demoted participant keeps own dice');
select pg_temp.check_true(pg_temp.expect_denied('select public.get_match_room_history(pg_temp.id(10),0,50)'), 'demoted participant loses unrelated room access');
select pg_temp.check_true(public.send_match_room_message(pg_temp.id(4),pg_temp.id(7),pg_temp.id(22),'Participant message')->'message'->>'senderKind' = 'player', 'demoted participant keeps ordinary message send');
reset role;

set role service_role;
select pg_temp.claims(null,'service_role') \gset
select pg_temp.check_true(public.call_patch2_match_staff('resolve_match_room',jsonb_build_object('p_match_id',pg_temp.id(4)),'user_staff')->'room'->>'id' = pg_temp.id(7)::text, 'verified staff can resolve a room');
select pg_temp.check_true(jsonb_array_length(public.call_patch2_match_staff('get_match_room_history',pg_temp.room_args(7),'user_staff')->'messages') = 2, 'verified staff can read current history');
select pg_temp.check_true(jsonb_array_length(public.call_patch2_match_staff('get_match_room_earlier_history',jsonb_build_object('p_room_id',pg_temp.id(7),'p_before_sequence',3,'p_limit',50),'user_staff')->'messages') = 2, 'verified staff can read earlier history');
select pg_temp.check_true(public.call_patch2_match_staff('get_match_dice_rolloff',jsonb_build_object('p_match_id',pg_temp.id(4)),'user_staff')->>'viewerRole' = 'admin', 'verified staff can read unrelated dice');
select pg_temp.check_true(public.call_patch2_match_staff('send_admin_match_room_message',pg_temp.send_args(23,'Staff message'),'user_staff')->'message'->>'senderKind' = 'admin', 'verified staff can send staff message');
select pg_temp.check_true(public.call_patch2_match_staff('send_admin_match_room_message',pg_temp.send_args(23,'Staff message'),'user_staff')->>'duplicate' = 'true', 'staff retry preserves duplicate protection');
select pg_temp.check_true(public.call_patch2_match_staff('mark_match_room_read',jsonb_build_object('p_room_id',pg_temp.id(7),'p_through_sequence',3),'user_staff')->>'lastReadSequence' = '3', 'verified staff can advance own read cursor');
select pg_temp.check_true(public.call_patch2_private_assistance('get_match_room_assistance',jsonb_build_object('p_room_id',pg_temp.id(7)),'user_staff',true)->>'canResolve' = 'true', 'verified staff can read legacy assistance');
select pg_temp.check_true(public.call_patch2_private_assistance('resolve_match_room_assistance',jsonb_build_object('p_room_id',pg_temp.id(7),'p_expected_request_version',1),'user_staff',true)->>'status' = 'resolved', 'verified staff can resolve legacy assistance through protected gateway');
reset role;
select pg_temp.check_true((select finished from public.notifications where id=pg_temp.id(11)), 'legitimate assistance resolution preserves notification behavior');
