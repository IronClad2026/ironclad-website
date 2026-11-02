-- Minimal local domain fixture. The runner separately loads the actual Phase2
-- migration, legal guard, retention state/locks/purge and the new migration.
-- JWT signing, complete competition schema and provider delivery are not mocked
-- as successes: they are outside this local authority regression's scope.
alter table public.players add column display_name text default 'Local player';
alter table public.registrations add column player_name text default 'Local player',
  add column profile_id uuid, add column tournament_title text default 'Local tournament',
  add column bracket_name text default 'Academy';
alter table public.tournaments add column status text default 'in_progress',add column terminal_at timestamptz;
alter table public.tournament_brackets add column name text default 'Academy';
create table public.generated_brackets(id uuid primary key,tournament_bracket_id uuid,format text);
create table public.bracket_rounds(id uuid primary key,round_number integer);
alter table public.tournament_matches add column generated_bracket_id uuid,add column round_id uuid,
  add column match_number integer default 1,add column player_one_registration_id uuid,
  add column player_two_registration_id uuid,add column official_result_decided_at timestamptz,
  add column deadline_ruled_at timestamptz;
alter table public.match_rooms add column room_revision bigint default 1,
  add column communication_generation bigint default 1,add column activation_version_snapshot bigint default 1,
  add column created_at timestamptz default now(),add column closed_at timestamptz,
  add column closure_reason text,add column last_sequence bigint default 0,add column content_purged_at timestamptz;
alter table public.match_room_assistance add column requested_by_registration_id uuid,
  add column requested_at timestamptz default now(),add column resolved_at timestamptz,add column resolved_by_clerk_user_id text;
grant select,insert,update,delete on public.notifications to service_role;
create table public.platform_settings(key text primary key,value jsonb not null);
create table public.match_messages(id uuid primary key,room_id uuid,sequence bigint,body text,actor_clerk_user_id text,author_player_id uuid);
create table public.match_room_reads(room_id uuid,viewer_clerk_user_id text);
create table public.match_room_notification_episodes(id uuid primary key,room_id uuid,notification_id uuid,recipient_registration_id uuid,resolved_at timestamptz);
alter table public.match_result_report_groups add column match_id uuid,add column submitted_by_registration_id uuid,
  add column opponent_registration_id uuid,add column disputed_at timestamptz,add column result_type text,add column status text;
create table ironclad_private.match_room_tournament_closures(tournament_id uuid primary key,completed_at timestamptz);
create table ironclad_private.match_room_retention_cases(room_id uuid,case_reference uuid,case_kind text,closed_at timestamptz,updated_at timestamptz default now(),primary key(room_id,case_reference));
create table ironclad_private.match_room_retention_holds(id uuid primary key default gen_random_uuid(),room_id uuid,message_ids uuid[],case_reference uuid,reason text,created_at timestamptz default now(),expires_at timestamptz,released_at timestamptz);
create table ironclad_private.match_room_privacy_audit(id uuid primary key default gen_random_uuid(),room_id uuid,operation text,actor_player_id uuid,reference_id uuid,counts jsonb,occurred_at timestamptz default now());
create table public.legal_documents(id uuid primary key,document_kind text,status text,published_at timestamptz,effective_at timestamptz,sha256 text);
create table public.account_legal_acceptances(clerk_user_id text,terms_document_id uuid,privacy_document_id uuid,terms_accepted boolean,privacy_acknowledged boolean);

-- This is only the underlying account-storage stand-in; the new closure wrapper
-- is actual migration SQL. Complete prior multi-step account closure remains a
-- separately reviewed hosted integration boundary, never a claimed local pass.
-- Model both observed final identity shapes: a historically referenced player
-- is pseudonymized; an unreferenced player is deleted. Provider/Storage cleanup
-- and the complete deployed closure chain are intentionally not represented.
create function public.close_ironclad_player_account(p_clerk_user_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$ declare v_player uuid; begin
  select id into v_player from public.players where clerk_user_id=p_clerk_user_id;
  if exists(select 1 from public.registrations where profile_id=v_player) then
    update public.players set account_closed_at=clock_timestamp(),clerk_user_id='closed-player-'||id::text
      where id=v_player;
  else
    delete from public.players where id=v_player;
  end if;
  return jsonb_build_object('localUnderlyingClosure',true);
end $$;
create function public.request_match_room_assistance(uuid,bigint default 0) returns jsonb language sql as $$ select '{}'::jsonb $$;

insert into public.players(id,clerk_user_id,display_name) values
  ('00000000-0000-4000-8000-000000000021','local_p1','Requester One'),
  ('00000000-0000-4000-8000-000000000022','local_p2','Requester Two'),
  ('00000000-0000-4000-8000-000000000023','local_admin','Local Admin'),
  ('00000000-0000-4000-8000-000000000024','local_admin2','Local Admin Two');
insert into public.registrations(id,tournament_id,clerk_user_id,registration_status,tournament_bracket_id,profile_id)
values('00000000-0000-4000-8000-000000000031',public.patch2_notification_test_uuid(1),'local_p1','approved',public.patch2_notification_test_uuid(801),'00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000032',public.patch2_notification_test_uuid(1),'local_p2','approved',public.patch2_notification_test_uuid(801),'00000000-0000-4000-8000-000000000022'),
  ('00000000-0000-4000-8000-000000000033',public.patch2_notification_test_uuid(2),'local_p1','approved',public.patch2_notification_test_uuid(802),'00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000034',public.patch2_notification_test_uuid(2),'local_p2','approved',public.patch2_notification_test_uuid(802),'00000000-0000-4000-8000-000000000022');
insert into public.generated_brackets values
  ('00000000-0000-4000-8000-000000000041',public.patch2_notification_test_uuid(801),'single_elimination'),
  ('00000000-0000-4000-8000-000000000042',public.patch2_notification_test_uuid(802),'single_elimination');
insert into public.bracket_rounds values('00000000-0000-4000-8000-000000000051',1);
update public.tournament_matches set generated_bracket_id='00000000-0000-4000-8000-000000000041',round_id='00000000-0000-4000-8000-000000000051',
  player_one_registration_id='00000000-0000-4000-8000-000000000031',player_two_registration_id='00000000-0000-4000-8000-000000000032' where id=public.patch2_notification_test_uuid(201);
update public.tournament_matches set generated_bracket_id='00000000-0000-4000-8000-000000000042',round_id='00000000-0000-4000-8000-000000000051',
  player_one_registration_id='00000000-0000-4000-8000-000000000033',player_two_registration_id='00000000-0000-4000-8000-000000000034' where id=public.patch2_notification_test_uuid(202);
insert into public.match_rooms(id,match_id,player_one_registration_id,player_two_registration_id) values
  ('00000000-0000-4000-8000-000000000061',public.patch2_notification_test_uuid(201),'00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032'),
  ('00000000-0000-4000-8000-000000000062',public.patch2_notification_test_uuid(202),'00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000034');
insert into public.legal_documents values
  ('00000000-0000-4000-8000-000000000071','terms','effective',now()-interval '1 day',now()-interval '1 day','fixture terms hash'),
  ('00000000-0000-4000-8000-000000000072','privacy','effective',now()-interval '1 day',now()-interval '1 day','fixture privacy hash');
-- Explicitly fictional acceptance rows for the local fixture; no real user's
-- consent/profile/provider assertions are created or represented by this test.
insert into public.account_legal_acceptances select clerk_user_id,'00000000-0000-4000-8000-000000000071',
  '00000000-0000-4000-8000-000000000072',true,true from public.players;
