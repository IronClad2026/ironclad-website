-- STAGING ONLY: zzbnneprhjicmajpjkdg, after the exact approved Phase B migration.
-- Preparation is NOT permission to run. Root must approve the fixed project and
-- independently compare protected-table fingerprints before and after execution.
-- Run as ONE execute_sql request, or psql ON_ERROR_STOP=1; never split statements.
-- Simulated transaction-local JWT claims test PostgreSQL roles/RLS, not real Clerk.
-- All media metadata below is synthetic; no R2 bytes, provider calls, notifications,
-- legal/award/competition writes, new identities or account closure are performed.
-- Only the two approved ordinary actors, new feature tables and two flags change
-- inside this transaction. Global cleanup is safe only because ALL new tables must
-- start empty. Initial flags and profile visibility are restored by ROLLBACK.
-- Full closure and FK behavior are exercised in the isolated PGlite harness;
-- this script checks the preserved closure body but never closes a Staging actor.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local client_min_messages = warning;

do $guard$
declare v_history text;
begin
  if current_user<>'postgres' or session_user<>'postgres'
    or current_setting('server_version_num')::integer<150000
    or current_setting('server_encoding')<>'UTF8' then
    raise exception 'Verified postgres PostgreSQL 15+ UTF8 context required';
  end if;
  select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version)::text,'UTF8')),'hex')
  into v_history from supabase_migrations.schema_migrations m
  where version not in ('20260909234122','20260910020800','20260913235133');
  if v_history is distinct from '86d032ff2d6bb18210713ef8d35304f52d4464d4fbbc471fa4a87146bf961891'
    or (select count(*) from supabase_migrations.schema_migrations)<>151
    or not exists(select 1 from supabase_migrations.schema_migrations
      where version='20260909234122' and name='player_showcase_phase_a' and cardinality(statements)=1
      and encode(sha256(convert_to(statements[1],'UTF8')),'hex')
        ='1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e')
    or not exists(select 1 from supabase_migrations.schema_migrations
      where version='20260910020800' and name='player_showcase_owner_read_rls' and cardinality(statements)=1
      and encode(sha256(convert_to(statements[1],'UTF8')),'hex')
        ='78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319')
    or not exists(select 1 from supabase_migrations.schema_migrations
      where version='20260913235133' and name='player_combat_highlights' and cardinality(statements)=1
      and encode(sha256(convert_to(statements[1],'UTF8')),'hex')
        ='99b319d9d478db2fabd3110434efe69e50da65b234b189de21e81edee17e5b8f')
    or not exists(select 1 from supabase_migrations.schema_migrations
      where version='20260908052210' and name='member_rpc_current_account_acceptance'
      and cardinality(statements)=18
      and encode(sha256(convert_to(to_jsonb(statements)::text,'UTF8')),'hex')
        ='f3304fafe08da15ef7f941c0dff0067536a6ccbb482148a94b4a2c597ed780d1') then
    raise exception 'Exact Staging migration history or approved source guard failed';
  end if;
  if exists(select 1 from public.player_combat_highlight_slots)
    or exists(select 1 from ironclad_private.player_combat_highlight_uploads)
    or exists(select 1 from ironclad_private.player_combat_highlight_reports)
    or (select count(*) from public.players where account_closed_at is null
      and id in ('c0bfabca-11bb-4d90-92f9-77119debe15b','03f83118-81c9-438c-92db-b5d307547197')
      and ironclad_private.player_showcase_has_current_legal_acceptance(clerk_user_id))<>2
    or exists(select 1 from ironclad_private.staging_synthetic_uat_players
      where player_id in ('c0bfabca-11bb-4d90-92f9-77119debe15b','03f83118-81c9-438c-92db-b5d307547197'))
    or (select count(*) from public.platform_settings
      where key in ('player_showcase','player_combat_highlights')
      and jsonb_typeof(value->'enabled')='boolean')<>2 then
    raise exception 'Fresh feature tables and the two approved current-legal ordinary actors required';
  end if;
end;
$guard$;

create temporary table combat_contract_checks(label text primary key);
create function pg_temp.combat_assert(p_condition boolean,p_label text)
returns void language plpgsql security definer set search_path=pg_catalog as $assert$
begin
  if p_condition is distinct from true then raise exception 'Combat contract failed: %',p_label; end if;
  insert into pg_temp.combat_contract_checks values (p_label);
end;
$assert$;
grant execute on function pg_temp.combat_assert(boolean,text) to anon,authenticated,service_role;
create temporary table combat_contract_context(
  first_id uuid default gen_random_uuid(), second_id uuid default gen_random_uuid(),
  expired_id uuid default gen_random_uuid(), replacement_id uuid default gen_random_uuid(),
  verified jsonb default jsonb_build_object('codec','avc','audioCodec','aac',
    'durationMs',15000,'width',1920,'height',1080,'fps',60,'byteLength',1000,
    'sha256',repeat('a',64),'etag','rollback-fixture','hasPoster',false),
  claim_token uuid
);
insert into pg_temp.combat_contract_context default values;
grant select,update on pg_temp.combat_contract_context to authenticated,service_role,anon;
create function pg_temp.combat_claims(p_actor uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $claims$
begin
  if p_actor not in ('c0bfabca-11bb-4d90-92f9-77119debe15b'::uuid,
    '03f83118-81c9-438c-92db-b5d307547197'::uuid) then
    raise exception 'Actor outside this rollback contract';
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id=p_actor and account_closed_at is null))::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$claims$;
revoke all on function pg_temp.combat_claims(uuid) from public,anon,authenticated,service_role;

do $catalog$
begin
  perform pg_temp.combat_assert((select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_class where oid in ('public.player_combat_highlight_slots'::regclass,
      'ironclad_private.player_combat_highlight_uploads'::regclass,
      'ironclad_private.player_combat_highlight_reports'::regclass)), 'forced-rls-all-tables');
  perform pg_temp.combat_assert(not has_table_privilege('anon','public.player_combat_highlight_slots','SELECT')
    and not has_table_privilege('authenticated','public.player_combat_highlight_slots','INSERT,UPDATE,DELETE'),
    'no-anonymous-raw-read-or-owner-write');
  perform pg_temp.combat_assert(not has_column_privilege('authenticated',
    'public.player_combat_highlight_slots','moderated_by_clerk_user_id','SELECT'), 'moderator-identity-private');
  perform pg_temp.combat_assert(not has_column_privilege('authenticated',
    'public.players','account_closed_at','SELECT'), 'private-player-column-stays-ungranted');
  perform pg_temp.combat_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc
    where oid='public.close_ironclad_player_account_without_combat_highlights(text)'::regprocedure)
      ='3989da58668de2c1d04307d6a5be9ce87a7186e143ea6c40df5d00aab9eb85a2',
    'prior-phase-a-closure-body-preserved-not-invoked');
end;
$catalog$;

update public.platform_settings set value='{"enabled":true}' where key='player_showcase';
update public.platform_settings set value='{"enabled":false}' where key='player_combat_highlights';
update public.players set public_profile_enabled=false where id='c0bfabca-11bb-4d90-92f9-77119debe15b';
select pg_temp.combat_claims('c0bfabca-11bb-4d90-92f9-77119debe15b');
set local role authenticated;
do $disabled$
declare r jsonb;
begin
  r:=public.get_my_player_combat_highlights();
  perform pg_temp.combat_assert(r->>'playerId'='c0bfabca-11bb-4d90-92f9-77119debe15b'
    and jsonb_array_length(r->'slots')=3 and r#>>'{slots,0,revision}'='0', 'fresh-owner-virtual-three-slots');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='feature-disabled','disabled-reserve-rejected');
  r:=public.clear_my_player_combat_highlight(1::smallint,0);
  perform pg_temp.combat_assert(r->>'code'='saved','disabled-empty-clear-allowed');
end;
$disabled$;
reset role;
update public.platform_settings set value='{"enabled":true}' where key='player_combat_highlights';
set local role authenticated;
do $reserve$
declare r jsonb; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.reserve_my_player_combat_highlight(4::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','fourth-slot-rejected');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),repeat('a',65),'clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','title-over-64-rejected');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,0,'v1',false);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','rights-declaration-required');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',15000001,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','video-byte-limit-enforced');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,200001,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','poster-byte-limit-enforced');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,c.first_id,U&'  Cafe\0301\0009\4E16\754C  ','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='saved' and (r->>'uploadId')::uuid=c.first_id
    and r#>>'{state,slots,0,revision}'='1','reserve-binds-signed-id-and-revision');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,c.first_id,U&'  Cafe\0301\0009\4E16\754C  ','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='saved' and (r->>'uploadId')::uuid=c.first_id,'idempotent-reservation-replay');
  r:=public.reserve_my_player_combat_highlight(1::smallint,1,c.first_id,'changed','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','request-payload-immutable');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='conflict' and r#>>'{state,slots,0,revision}'='1','stale-revision-has-current-state');
  r:=public.reserve_my_player_combat_highlight(1::smallint,1,gen_random_uuid(),'clip','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='upload-pending','second-pending-generation-denied');
  perform pg_temp.combat_assert((select count(player_id) from public.player_combat_highlight_slots)=3,'owner-rls-reads-only-safe-columns');
  r:=public.get_my_player_combat_highlight_upload(c.first_id);
  perform pg_temp.combat_assert(r->>'title'='Café 世界' and r->>'declarationVersion'='v1'
    and r->>'declarationAcceptedAt' is not null,'normalized-title-and-server-declaration-time');
  perform pg_temp.combat_assert(public.can_access_my_player_combat_highlight(c.first_id,'upload')
    and not public.can_access_my_player_combat_highlight(c.first_id,'read'),'pending-owner-upload-only');
  begin
    perform public.complete_player_combat_highlight_upload(c.first_id,c.verified);
    raise exception 'Owner reached service completion';
  exception when insufficient_privilege then
    perform pg_temp.combat_assert(true,'owner-completion-execute-denied');
  end;
  begin
    perform moderated_by_clerk_user_id from public.player_combat_highlight_slots;
    raise exception 'Owner read private moderator identity';
  exception when insufficient_privilege then
    perform pg_temp.combat_assert(true,'owner-private-column-read-denied');
  end;
  begin
    delete from public.player_combat_highlight_slots;
    raise exception 'Owner raw write succeeded';
  exception when insufficient_privilege then
    perform pg_temp.combat_assert(true,'owner-raw-delete-denied');
  end;
end;
$reserve$;
reset role;
select pg_temp.combat_claims('03f83118-81c9-438c-92db-b5d307547197');
set local role authenticated;
do $foreign$
declare r jsonb; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  perform pg_temp.combat_assert((select count(player_id) from public.player_combat_highlight_slots)=0,'foreign-rls-hides-slots');
  perform pg_temp.combat_assert(public.get_my_player_combat_highlight_upload(c.first_id) is null
    and not public.can_access_my_player_combat_highlight(c.first_id,'upload'),'foreign-reservation-authorization-denied');
  r:=public.reserve_my_player_combat_highlight(1::smallint,0,c.first_id,'clip','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','foreign-signed-id-collision-rejected');
  r:=public.cancel_my_player_combat_highlight_upload(c.first_id,1);
  perform pg_temp.combat_assert(r->>'code'='invalid-input','foreign-cancel-rejected');
end;
$foreign$;
reset role;
set local request.jwt.claim.role='anon';
set local role anon;
do $anonymous$
declare c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  perform pg_temp.combat_assert(not public.can_read_public_player_combat_highlight(c.first_id)
    and public.get_public_player_combat_highlights('c0bfabca-11bb-4d90-92f9-77119debe15b')='[]','pending-public-denied');
  perform pg_temp.combat_assert(not public.can_read_public_player_combat_highlight(gen_random_uuid()),'unknown-upload-public-denied');
  begin
    perform public.get_my_player_combat_highlights();
    raise exception 'Anonymous owner RPC succeeded';
  exception when insufficient_privilege then
    perform pg_temp.combat_assert(true,'anonymous-owner-rpc-denied');
  end;
end;
$anonymous$;
reset role;
set local request.jwt.claim.role='service_role';
set local role service_role;
do $verification$
declare c pg_temp.combat_contract_context%rowtype; r jsonb; invalid jsonb; n integer:=0;
begin
  select * into c from pg_temp.combat_contract_context;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('durationMs',15001),jsonb_build_object('fps',61),
    jsonb_build_object('width',1921),jsonb_build_object('height',1081),
    jsonb_build_object('byteLength',999),jsonb_build_object('codec','vp9'),
    jsonb_build_object('audioCodec','opus'),jsonb_build_object('hasPoster',true),
    jsonb_build_object('extra','rejected'),jsonb_build_object('width',1.5))) loop
    n:=n+1;
    r:=public.complete_player_combat_highlight_upload(c.first_id,c.verified||invalid);
    perform pg_temp.combat_assert(r->>'code'='invalid-input','verified-metadata-invalid-'||n);
  end loop;
  r:=public.complete_player_combat_highlight_upload(c.first_id,c.verified);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,0,clip,uploadId}'=c.first_id::text,'verified-current-ready');
  r:=public.complete_player_combat_highlight_upload(c.first_id,c.verified);
  perform pg_temp.combat_assert(r->>'code'='saved','duplicate-completion-idempotent');
  r:=public.complete_player_combat_highlight_upload(c.first_id,c.verified||'{"etag":"changed"}');
  perform pg_temp.combat_assert(r->>'code'='invalid-input','mismatched-completion-cannot-retire-current');
end;
$verification$;
reset role;
set local request.jwt.claim.role='anon';
set local role anon;
select pg_temp.combat_assert(not public.can_read_public_player_combat_highlight(
  (select first_id from pg_temp.combat_contract_context)),'private-parent-ready-denied');
reset role;
update public.players set public_profile_enabled=true where id='c0bfabca-11bb-4d90-92f9-77119debe15b';
set local role anon;
do $projection$
declare r jsonb; c pg_temp.combat_contract_context%rowtype; fields text[];
begin
  select * into c from pg_temp.combat_contract_context;
  perform pg_temp.combat_assert(public.can_read_public_player_combat_highlight(c.first_id),'public-active-ready-allowed');
  r:=public.get_public_player_combat_highlights('c0bfabca-11bb-4d90-92f9-77119debe15b');
  select array_agg(key order by key) into fields from jsonb_object_keys(r->0) key;
  perform pg_temp.combat_assert(jsonb_array_length(r)=1 and fields=
    array['contentType','displayOrder','durationMs','fps','hasPoster','height','slotNumber','title','uploadId','width'],
    'public-json-exact-safe-allowlist');
end;
$projection$;
reset role;
select pg_temp.combat_claims('03f83118-81c9-438c-92db-b5d307547197');
set local role authenticated;
do $report$
declare r jsonb; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.report_player_combat_highlight(c.first_id,'privacy');
  perform pg_temp.combat_assert(r->>'code'='reported','public-report-saved');
  r:=public.report_player_combat_highlight(c.first_id,'privacy');
  perform pg_temp.combat_assert(r->>'code'='reported','duplicate-report-idempotent');
end;
$report$;
reset role;
set local request.jwt.claim.role='service_role';
set local role service_role;
do $moderation$
declare r jsonb; v_revision bigint;
begin
  r:=public.get_player_combat_highlights_for_moderation(null);
  perform pg_temp.combat_assert(jsonb_array_length(r)=1 and r#>>'{0,reportCount}'='1','reported-datasource-aggregates-one-report');
  v_revision:=(r#>>'{0,revision}')::bigint;
  r:=public.moderate_player_combat_highlight('c0bfabca-11bb-4d90-92f9-77119debe15b',1::smallint,true,'rollback-only-moderator',v_revision-1);
  perform pg_temp.combat_assert(r->>'code'='conflict','moderation-stale-revision-denied');
  r:=public.moderate_player_combat_highlight('c0bfabca-11bb-4d90-92f9-77119debe15b',1::smallint,true,'rollback-only-moderator',v_revision);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,0,hidden}'='true','service-moderation-hold-applied');
end;
$moderation$;
reset role;
set local request.jwt.claim.role='anon';
set local role anon;
select pg_temp.combat_assert(not public.can_read_public_player_combat_highlight(
  (select first_id from pg_temp.combat_contract_context)),'held-public-read-denied');
reset role;
select pg_temp.combat_claims('c0bfabca-11bb-4d90-92f9-77119debe15b');
set local role authenticated;
do $replacement$
declare r jsonb; c pg_temp.combat_contract_context%rowtype; v_revision bigint;
begin
  select * into c from pg_temp.combat_contract_context;
  perform pg_temp.combat_assert(public.can_access_my_player_combat_highlight(c.first_id,'read'),'held-owner-preview-allowed');
  r:=public.get_my_player_combat_highlights();
  v_revision:=(r#>>'{slots,0,revision}')::bigint;
  r:=public.reserve_my_player_combat_highlight(1::smallint,v_revision,c.replacement_id,'replacement','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,0,clip,uploadId}'=c.first_id::text
    and r#>>'{state,slots,0,hidden}'='true','pending-replacement-preserves-current-and-hold');
end;
$replacement$;
reset role;
set local request.jwt.claim.role='service_role';
set local role service_role;
do $swap$
declare r jsonb; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.complete_player_combat_highlight_upload(c.replacement_id,c.verified);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,0,clip,uploadId}'=c.replacement_id::text
    and r#>>'{state,slots,0,hidden}'='true','verified-swap-preserves-hold');
  r:=public.complete_player_combat_highlight_upload(c.first_id,c.verified);
  perform pg_temp.combat_assert(r->>'code'='conflict','late-retired-completion-cannot-resurrect');
  r:=public.moderate_player_combat_highlight('c0bfabca-11bb-4d90-92f9-77119debe15b',1::smallint,false,'rollback-only-moderator',(r#>>'{state,slots,0,revision}')::bigint);
  perform pg_temp.combat_assert(r->>'code'='saved','service-restores-current-slot');
end;
$swap$;
reset role;
set local request.jwt.claim.role='anon';
set local role anon;
do $revocation$
declare c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  perform pg_temp.combat_assert(not public.can_read_public_player_combat_highlight(c.first_id)
    and public.can_read_public_player_combat_highlight(c.replacement_id),'old-id-denied-new-current-allowed');
end;
$revocation$;
reset role;
select pg_temp.combat_claims('c0bfabca-11bb-4d90-92f9-77119debe15b');
set local role authenticated;
do $reorder$
declare r jsonb; v_revisions bigint[]; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.get_my_player_combat_highlights();
  v_revisions:=array[(r#>>'{slots,2,revision}')::bigint,(r#>>'{slots,0,revision}')::bigint,(r#>>'{slots,1,revision}')::bigint];
  r:=public.reorder_my_player_combat_highlights(array[3,1,2]::smallint[],v_revisions);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,0,slotNumber}'='3'
    and r#>>'{state,slots,1,slotNumber}'='1','reorder-keeps-stable-slots');
  r:=public.reorder_my_player_combat_highlights(array[3,1,2]::smallint[],v_revisions);
  perform pg_temp.combat_assert(r->>'code'='conflict','stale-reorder-vector-rejected');
  r:=public.reserve_my_player_combat_highlight(2::smallint,
    (r#>>'{state,slots,2,revision}')::bigint,c.second_id,'cancellable','clip.mp4','video/mp4',1000,0,'v1',true);
  perform pg_temp.combat_assert(r->>'code'='saved','reserve-after-reorder-no-unique-conflict');
end;
$reorder$;
reset role;
update public.platform_settings set value='{"enabled":false}' where key='player_combat_highlights';
set local role authenticated;
do $clear$
declare r jsonb; c pg_temp.combat_contract_context%rowtype;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.get_my_player_combat_highlights();
  r:=public.cancel_my_player_combat_highlight_upload(c.second_id,(r#>>'{slots,2,revision}')::bigint);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,2,pendingUploadId}' is null,'feature-off-cancel-allowed');
  r:=public.clear_my_player_combat_highlight(1::smallint,(r#>>'{state,slots,1,revision}')::bigint);
  perform pg_temp.combat_assert(r->>'code'='saved' and r#>>'{state,slots,1,clip}' is null,'feature-off-clear-allowed');
end;
$clear$;
reset role;
-- A new expired fixture only: never UPDATE an immutable upload deadline.
insert into ironclad_private.player_combat_highlight_uploads(
  id,player_id,slot_number,request_id,title,file_name,content_type,byte_length,
  declaration_version,expires_at)
select expired_id,'c0bfabca-11bb-4d90-92f9-77119debe15b',3,expired_id,
  'expired fixture','expired.mp4','video/mp4',1000,'v1',clock_timestamp()-interval '2 minutes'
from pg_temp.combat_contract_context;
update public.player_combat_highlight_slots set pending_upload_id=
  (select expired_id from pg_temp.combat_contract_context)
where player_id='c0bfabca-11bb-4d90-92f9-77119debe15b' and slot_number=3;
set local request.jwt.claim.role='service_role';
set local role service_role;
do $cleanup$
declare r jsonb; c pg_temp.combat_contract_context%rowtype; v_claim uuid;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.claim_player_combat_highlight_cleanup(50);
  select (value->>'claimToken')::uuid into v_claim from jsonb_array_elements(r)
    where value->>'uploadId'=c.expired_id::text;
  perform pg_temp.combat_assert(v_claim is not null and jsonb_array_length(r)=1,'expiry-sweep-claims-only-due-fixture');
  update pg_temp.combat_contract_context set claim_token=v_claim;
  r:=public.finish_player_combat_highlight_cleanup(c.expired_id,gen_random_uuid(),true,null);
  perform pg_temp.combat_assert(r->>'code'='claim-lost','cleanup-wrong-lease-rejected');
  r:=public.finish_player_combat_highlight_cleanup(c.expired_id,v_claim,false,'provider-unavailable');
  perform pg_temp.combat_assert(r->>'code'='saved','cleanup-failure-queued-for-retry');
end;
$cleanup$;
reset role;
do $retry_clock$
begin
  perform pg_temp.combat_assert((select u.state='delete_pending' and u.cleanup_after>clock_timestamp()
    and u.cleanup_claim_token is null and s.pending_upload_id is null
    from ironclad_private.player_combat_highlight_uploads u
    join public.player_combat_highlight_slots s on s.player_id=u.player_id and s.slot_number=u.slot_number
    where u.id=(select expired_id from pg_temp.combat_contract_context)), 'expiry-detaches-and-failure-backs-off');
end;
$retry_clock$;
-- Advance ONLY this new synthetic fixture's retry clock, never another user's row.
update ironclad_private.player_combat_highlight_uploads
set cleanup_after=clock_timestamp()-interval '1 second'
where id=(select expired_id from pg_temp.combat_contract_context);
set local role service_role;
do $cleanup_success$
declare r jsonb; c pg_temp.combat_contract_context%rowtype; v_claim uuid;
begin
  select * into c from pg_temp.combat_contract_context;
  r:=public.claim_player_combat_highlight_cleanup(50);
  select (value->>'claimToken')::uuid into v_claim from jsonb_array_elements(r)
    where value->>'uploadId'=c.expired_id::text;
  perform pg_temp.combat_assert(v_claim is not null,'retry-claims-due-generation');
  r:=public.finish_player_combat_highlight_cleanup(c.expired_id,v_claim,true,null);
  perform pg_temp.combat_assert(r->>'code'='saved','cleanup-success-recorded');
end;
$cleanup_success$;
reset role;
do $final$
begin
  perform pg_temp.combat_assert((select state='deleted' and title is null and file_name is null
    and player_id='c0bfabca-11bb-4d90-92f9-77119debe15b'::uuid
    from ironclad_private.player_combat_highlight_uploads
    where id=(select expired_id from pg_temp.combat_contract_context)), 'deleted-attempt-preserves-only-hourly-quota-attribution');
end;
$final$;
select count(*)::integer as passed_assertions from pg_temp.combat_contract_checks;
rollback;
select 'PASS: Combat Highlights transaction rolled back; independently verify protected fingerprints' as result;
