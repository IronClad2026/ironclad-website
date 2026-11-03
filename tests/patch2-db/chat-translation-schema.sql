-- Deliberately local-only domain fixture. The runner loads the actual current
-- actor/access/context, ordinary history/send, legal guard and Phase 4 migration.
-- This does not emulate Clerk signing, PostgREST, Storage, full competition
-- authority, notification triggers or the complete privacy/retention executor.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema ironclad_private;
create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.role(),auth.jwt() to anon,authenticated,service_role;
create function public.translation_test_uuid(p_value integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-'||lpad(p_value::text,12,'0'))::uuid $$;
create table public.players(id uuid primary key,clerk_user_id text unique not null,account_closed_at timestamptz);
create table public.platform_settings(key text primary key,value jsonb not null);
create table public.tournaments(id uuid primary key,title text,status text,terminal_at timestamptz);
create table public.tournament_brackets(id uuid primary key,tournament_id uuid,launched_at timestamptz);
create table public.generated_brackets(id uuid primary key,tournament_bracket_id uuid,format text);
create table public.tournament_division_not_held_closures(tournament_bracket_id uuid);
create table public.registrations(id uuid primary key,tournament_id uuid,tournament_bracket_id uuid,
  profile_id uuid,clerk_user_id text,registration_status text,waitlist_position integer,elo integer);
create table public.tournament_matches(id uuid primary key,generated_bracket_id uuid,
  player_one_registration_id uuid,player_two_registration_id uuid,activation_version bigint,
  communication_generation bigint,status text,outcome_type text,official_result_decided_at timestamptz,
  deadline_ruled_at timestamptz,updated_at timestamptz,deadline_at timestamptz,result jsonb,replay_ids uuid[]);
create table public.match_rooms(id uuid primary key,match_id uuid,room_revision bigint,
  communication_generation bigint,activation_version_snapshot bigint,player_one_registration_id uuid,
  player_two_registration_id uuid,created_at timestamptz not null default clock_timestamp(),closed_at timestamptz,
  closure_reason text,last_sequence bigint default 0,content_purged_at timestamptz);
create table public.match_messages(id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.match_rooms(id),sequence bigint,sender_kind text,
  sender_registration_id uuid,actor_clerk_user_id text,client_message_id uuid not null,
  body text not null check(char_length(body) between 1 and 1000),created_at timestamptz default clock_timestamp(),
  unique(room_id,sequence),unique(room_id,actor_clerk_user_id,client_message_id));
create table public.match_room_reads(room_id uuid,viewer_clerk_user_id text,last_read_sequence bigint);
create table ironclad_private.match_room_redactions(message_id uuid primary key references public.match_messages(id) on delete cascade);
create table public.legal_documents(id uuid primary key,document_kind text,status text,published_at timestamptz,effective_at timestamptz,sha256 text);
create table public.account_legal_acceptances(clerk_user_id text,terms_document_id uuid,privacy_document_id uuid,terms_accepted boolean,privacy_acknowledged boolean);
-- Direct browser reads and writes remain closed, as on the deployed authority.
alter table public.match_messages enable row level security;
alter table public.match_rooms enable row level security;
revoke all on public.match_messages,public.match_rooms from public,anon,authenticated,service_role;
insert into public.players values
  (public.translation_test_uuid(1),'translation_p1',null),
  (public.translation_test_uuid(2),'translation_p2',null),
  (public.translation_test_uuid(3),'translation_p3',null),
  (public.translation_test_uuid(4),'translation_admin',null),
  (public.translation_test_uuid(5),'translation_outsider',null),
  (public.translation_test_uuid(6),'translation_closed',now());
insert into public.platform_settings values('match_room','{"enabled":true}');
insert into public.tournaments values
  (public.translation_test_uuid(101),'Local translation tournament A','in_progress',null),
  (public.translation_test_uuid(102),'Local translation tournament B','in_progress',null);
insert into public.tournament_brackets values
  (public.translation_test_uuid(201),public.translation_test_uuid(101),now()),
  (public.translation_test_uuid(202),public.translation_test_uuid(102),now());
insert into public.generated_brackets values
  (public.translation_test_uuid(301),public.translation_test_uuid(201),'single_elimination'),
  (public.translation_test_uuid(302),public.translation_test_uuid(202),'single_elimination');
insert into public.registrations values
  (public.translation_test_uuid(401),public.translation_test_uuid(101),public.translation_test_uuid(201),public.translation_test_uuid(1),'translation_p1','approved',null,1234),
  (public.translation_test_uuid(402),public.translation_test_uuid(101),public.translation_test_uuid(201),public.translation_test_uuid(2),'translation_p2','approved',null,1234),
  (public.translation_test_uuid(403),public.translation_test_uuid(102),public.translation_test_uuid(202),public.translation_test_uuid(1),'translation_p1','approved',null,1234),
  (public.translation_test_uuid(404),public.translation_test_uuid(102),public.translation_test_uuid(202),public.translation_test_uuid(3),'translation_p3','approved',null,1234),
  (public.translation_test_uuid(405),public.translation_test_uuid(101),public.translation_test_uuid(201),public.translation_test_uuid(3),'translation_p3','waitlisted',2,1250);
insert into public.tournament_matches values
  (public.translation_test_uuid(501),public.translation_test_uuid(301),public.translation_test_uuid(401),public.translation_test_uuid(402),1,1,'in_progress',null,null,null,now(),'2026-12-01Z','{"score":[1,0]}',array[public.translation_test_uuid(801)]),
  (public.translation_test_uuid(502),public.translation_test_uuid(302),public.translation_test_uuid(403),public.translation_test_uuid(404),1,1,'scheduled',null,null,null,now(),'2026-12-02Z','{}',array[]::uuid[]);
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,player_one_registration_id,player_two_registration_id,last_sequence) values
  (public.translation_test_uuid(601),public.translation_test_uuid(501),1,1,1,public.translation_test_uuid(401),public.translation_test_uuid(402),2),
  (public.translation_test_uuid(602),public.translation_test_uuid(502),1,1,1,public.translation_test_uuid(403),public.translation_test_uuid(404),1);
insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body) values
  (public.translation_test_uuid(701),public.translation_test_uuid(601),1,'player',public.translation_test_uuid(401),'translation_p1',public.translation_test_uuid(901),'No, @Ace: 7 Nov 2026 at 19:30 UTC; score 2–1. https://example.com/match'),
  (public.translation_test_uuid(702),public.translation_test_uuid(601),2,'admin',null,'translation_admin',public.translation_test_uuid(902),'Administrative message is outside player-chat translation'),
  (public.translation_test_uuid(703),public.translation_test_uuid(602),1,'player',public.translation_test_uuid(404),'translation_p3',public.translation_test_uuid(903),'Non cambiare le 19:30 UTC: punteggio 2–1.');
insert into public.legal_documents values
  (public.translation_test_uuid(1001),'terms','effective',now()-interval '1 day',now()-interval '1 day','local terms'),
  (public.translation_test_uuid(1002),'privacy','effective',now()-interval '1 day',now()-interval '1 day','local privacy');
-- Fictional local acceptance; no real identity/provider assertion is made.
insert into public.account_legal_acceptances select clerk_user_id,public.translation_test_uuid(1001),public.translation_test_uuid(1002),true,true from public.players;
