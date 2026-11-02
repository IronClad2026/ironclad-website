-- ROOT-REVIEWED EXECUTION ONLY. Target: zzbnneprhjicmajpjkdg, after both Patch2 migrations.
-- Send this WHOLE file as ONE SQL request, or psql with ON_ERROR_STOP=1.
-- No operational HTTP/RPC dispatch, permanent UAT fixtures, credentials, Storage
-- objects, trigger disabling, scheduler sleeps, queue cleanup, or COMMIT.
-- All inserted fixtures are private, uniquely tagged, uncommitted and invisible
-- to background workers. The final success marker follows an explicit ROLLBACK.
-- Database role/JWT claims below simulate trusted server calls; this does not
-- verify Clerk signatures, browser sessions, Server Actions, or browser drafts.

begin isolation level repeatable read;
set local lock_timeout = '2s';
set local statement_timeout = '90s';
set local idle_in_transaction_session_timeout = '2min';
set local client_min_messages = warning;

create function pg_temp.patch2_assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'Patch2 hosted acceptance failed: %', p_label;
  end if;
end;
$$;

-- The database exposes no intrinsic project-ref setting. This is an additional
-- fail-closed fingerprint of the independently verified Staging-only dispatcher;
-- it does NOT replace selecting the exact project ref at the execution boundary.
do $$
begin
  perform pg_temp.patch2_assert(current_user = 'postgres', 'trusted SQL operator required');
  perform pg_temp.patch2_assert((select count(*) = 1 and bool_and(
    btrim(decrypted_secret) = 'https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email')
    from vault.decrypted_secrets where name = 'ironclad_transactional_email_worker_url'),
    'exact previously verified Staging dispatcher fingerprint required');
  perform pg_temp.patch2_assert(to_regclass('ironclad_private.staging_synthetic_uat_players') is not null,
    'expected Staging private fixture boundary required; it will not be modified');
  perform pg_temp.patch2_assert(not has_function_privilege('service_role',
    'public.claim_web_push_notifications(integer)', 'EXECUTE'), 'temporary push claim denial required');
  perform pg_temp.patch2_assert(has_function_privilege('service_role',
    'public.complete_web_push_notification(uuid,uuid,text,text)', 'EXECUTE'), 'push completion must remain permitted');
  perform pg_temp.patch2_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex') =
    '5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115'
    from pg_proc where oid = 'public.claim_web_push_notifications(integer)'::regprocedure), 'reviewed push claim body required');
  perform pg_temp.patch2_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex') =
    'd31d4c88bd400e27370be967f1787cdb3617a8ed4591bcb75d91f7dbd88ce7f6'
    from pg_proc where oid = 'public.review_tournament_registration(uuid,text,text)'::regprocedure), 'preserved real registration authority required');
  perform pg_temp.patch2_assert(to_regclass('public.assistance_requests') is not null
    and to_regprocedure('public.review_tournament_registration_scoped(uuid,uuid,text,text)') is not null
    and to_regprocedure('public.read_admin_notification_inbox(text,uuid,integer,boolean,uuid)') is not null,
    'both reviewed migrations must already be applied');
  perform pg_temp.patch2_assert((select count(*) = 4 and bool_and(active) from cron.job), 'four existing cron jobs must remain active');
  perform pg_temp.patch2_assert((select count(*) = 1 and bool_and(not public) from storage.buckets where id='match-proofs'), 'private proof bucket required');
end;
$$;

create temporary table patch2_existing_rows(
  relation regclass primary key, key_column text not null,
  keys jsonb not null, digest text not null
) on commit drop;

-- Capture existing row IDs and server-side digests; never return historical row
-- contents, private messages, proof paths, or identities. New fixture rows are
-- ignored by the final comparison; any changed/deleted original row fails it.
do $$
declare v_relation text; v_key text; v_keys jsonb; v_digest text;
begin
  foreach v_relation in array array['public.players','public.tournaments',
    'public.tournament_brackets','public.registrations','public.registration_acceptances',
    'public.notifications','public.assistance_requests','public.generated_brackets',
    'public.tournament_matches','public.match_rooms','public.match_room_assistance',
    'ironclad_private.staging_synthetic_uat_players','ironclad_private.staging_synthetic_uat_enrolments'] loop
    select a.attname into v_key from pg_attribute a
    join pg_index i on i.indrelid=a.attrelid and a.attnum=any(i.indkey)
    where a.attrelid=v_relation::regclass and i.indisprimary order by a.attnum limit 1;
    perform pg_temp.patch2_assert(v_key is not null, 'snapshot relation must have a primary key');
    execute format('select coalesce(jsonb_agg(%1$I::text order by %1$I),''[]''::jsonb), md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I)::text,''[]'')) from %2$s t',v_key,v_relation::regclass)
      into v_keys,v_digest;
    insert into patch2_existing_rows values(v_relation::regclass,v_key,v_keys,v_digest);
  end loop;
end;
$$;

-- Only this helper changes SQL role, to exercise the REAL service/browser
-- permission boundary. It restores postgres even when the rejected write raises.
create function pg_temp.patch2_expect_rejected_as(p_role text, p_sql text, p_state text, p_label text)
returns void language plpgsql as $$
declare v_state text; v_rejected boolean := false;
begin
  if p_role not in ('service_role','authenticated') then raise exception 'Invalid test role'; end if;
  begin
    execute format('set local role %I',p_role);
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_rejected := true;
  end;
  execute 'set local role postgres';
  if not v_rejected or v_state is distinct from p_state then
    raise exception 'Patch2 hosted acceptance failed: % (expected %, observed %)',p_label,p_state,coalesce(v_state,'success');
  end if;
end;
$$;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role","sub":"patch2-rollback-sql-admin","metadata":{"role":"admin"}}',true);

do $$
declare
  v_tag text := 'patch2-rollback-' || gen_random_uuid()::text;
  v_t1 uuid := gen_random_uuid(); v_t2 uuid := gen_random_uuid();
  v_ids uuid[] := array[]::uuid[]; v_other uuid := gen_random_uuid();
  v_platform uuid := gen_random_uuid(); v_unassigned uuid := gen_random_uuid();
  v_legacy uuid := gen_random_uuid(); v_legacy_null uuid := gen_random_uuid();
  v_hybrid uuid := gen_random_uuid(); v_case uuid; v_null_case uuid;
  v_id uuid; v_i integer; v_data jsonb; v_changed integer; v_failed boolean;
begin
  insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,
    registration_open_at,registration_close_at,start_date,registration_enabled)
  values(v_t1,v_tag || ' A',v_tag || '-a','1v1','registration_open',v_tag,'','',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',true),
        (v_t2,v_tag || ' B',v_tag || '-b','1v1','registration_open',v_tag,'','',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',true);
  for v_i in 1..31 loop
    v_id := gen_random_uuid(); v_ids := array_append(v_ids,v_id);
    insert into public.notifications(id,recipient_role,type,title,message,tournament_id,tournament_title,event_key,metadata,read_at,created_at)
    values(v_id,'admin','registration.manual_review_required',v_tag,v_tag,v_t1,v_tag || ' A',v_tag || ':a:' || v_i,
      jsonb_build_object('patch2TestRun',v_tag),case when v_i=1 then now() else null end,now()+v_i*interval '1 millisecond');
  end loop;
  insert into public.notifications(id,recipient_role,type,title,message,tournament_id,event_key,metadata)
  values(v_other,'admin','registration.manual_review_required',v_tag,v_tag,v_t2,v_tag || ':b',jsonb_build_object('patch2TestRun',v_tag)),
    (v_platform,'admin','registration.manual_review_required',v_tag,v_tag,null,v_tag || ':platform',jsonb_build_object('patch2TestRun',v_tag,'adminInboxScope','platform')),
    (v_unassigned,'admin','registration.manual_review_required',v_tag,v_tag,null,v_tag || ':unassigned',jsonb_build_object('patch2TestRun',v_tag));
  insert into public.notifications(id,recipient_role,type,title,message,tournament_id,event_key,metadata,in_app_hidden_at)
  values(v_legacy,'admin','match.admin_assistance_requested',v_tag,v_tag,v_t1,v_tag || ':legacy',jsonb_build_object('patch2TestRun',v_tag),now()),
    (v_legacy_null,'admin','match.admin_assistance_requested',v_tag,v_tag,null,v_tag || ':legacy-null',jsonb_build_object('patch2TestRun',v_tag),now());
  select id into strict v_case from public.assistance_requests where source_notification_id=v_legacy;
  select id into strict v_null_case from public.assistance_requests where source_notification_id=v_legacy_null;
  perform pg_temp.patch2_assert((select status='open' and legacy_resolution_unknown from public.assistance_requests where id=v_case), 'hidden legacy notice creates unresolved durable case');
  perform pg_temp.patch2_assert((select tournament_id is null from public.assistance_requests where id=v_null_case), 'legacy missing tournament is never guessed');

  v_data := public.read_admin_notification_inbox('tournament',v_t1,1,false,v_ids[2]);
  perform pg_temp.patch2_assert((v_data->>'totalCount')::int=31 and (v_data->>'unreadCount')::int=30
    and (v_data->>'filteredCount')::int=31 and (v_data->>'pageCount')::int=2
    and jsonb_array_length(v_data->'notifications')=25 and v_data#>>'{selectedNotification,id}'=v_ids[2]::text,
    'selected tournament has one canonical count/page/detail snapshot');
  v_data := public.read_admin_notification_inbox('tournament',v_t1,2,false,v_other);
  perform pg_temp.patch2_assert(jsonb_array_length(v_data->'notifications')=6 and v_data->'selectedNotification'='null'::jsonb, 'second page and foreign selected detail stay scoped');
  v_data := public.read_admin_notification_inbox('tournament',v_t1,999,true,null);
  perform pg_temp.patch2_assert((v_data->>'page')::int=2 and (v_data->>'filteredCount')::int=30 and jsonb_array_length(v_data->'notifications')=5, 'unread pagination clamps safely on server');
  v_data := public.read_admin_notification_inbox('platform',null,1,false,v_platform);
  perform pg_temp.patch2_assert(v_data#>>'{selectedNotification,id}'=v_platform::text, 'explicit platform classification retained');
  v_data := public.read_admin_notification_inbox('unassigned',null,1,false,v_platform);
  perform pg_temp.patch2_assert(v_data->'selectedNotification'='null'::jsonb, 'unassigned cannot expose a platform selected record');
  v_data := public.read_admin_notification_inbox('unassigned',null,1,false,v_unassigned);
  perform pg_temp.patch2_assert(v_data#>>'{selectedNotification,id}'=v_unassigned::text, 'unknown association remains available explicitly');

  v_changed := public.mutate_admin_notification_inbox('tournament',v_t1,'read',array[v_ids[2]]);
  perform pg_temp.patch2_assert(v_changed=1, 'individual mark read');
  perform set_config('request.jwt.claims','{"role":"service_role","sub":"patch2-rollback-sql-second-admin","metadata":{"role":"admin"}}',true);
  v_data := public.read_admin_notification_inbox('tournament',v_t1,1,false,v_ids[2]);
  perform pg_temp.patch2_assert(v_data#>>'{selectedNotification,read_at}' is not null and (v_data->>'unreadCount')::int=29, 'second administrator sees shared team read state');
  v_changed := public.mutate_admin_notification_inbox('tournament',v_t1,'dismiss',array[v_ids[3]]);
  perform pg_temp.patch2_assert(v_changed=1 and exists(select 1 from public.notifications where id=v_ids[3] and in_app_hidden_at is not null), 'dismiss retains notification row');

  v_failed := false;
  begin perform public.mutate_admin_notification_inbox('tournament',v_t1,'read',array[v_ids[4],v_other]);
  exception when sqlstate '22023' then v_failed := true; end;
  perform pg_temp.patch2_assert(v_failed and (select bool_and(read_at is null) from public.notifications where id=any(array[v_ids[4],v_other])), 'forged mixed tournament set fails atomically');
  v_failed := false;
  begin perform public.mutate_admin_notification_inbox('unassigned',null,'dismiss',array[v_platform]);
  exception when sqlstate '22023' then v_failed := true; end;
  perform pg_temp.patch2_assert(v_failed and exists(select 1 from public.notifications where id=v_platform and in_app_hidden_at is null), 'forged platform membership cannot dismiss');
  v_failed := false;
  begin perform public.mutate_admin_notification_inbox('platform',null,'read_all',null);
  exception when sqlstate '22023' then v_failed := true; end;
  perform pg_temp.patch2_assert(v_failed, 'mark all is restricted to one selected tournament');
  v_changed := public.mutate_admin_notification_inbox('tournament',v_t1,'read_all',null);
  v_data := public.read_admin_notification_inbox('tournament',v_t1,1,false,null);
  perform pg_temp.patch2_assert(v_changed=28 and (v_data->>'unreadCount')::int=0 and (v_data->>'totalCount')::int=30
    and exists(select 1 from public.notifications where id=v_other and read_at is null), 'mark all updates only active selected tournament rows');
  perform public.mutate_admin_notification_inbox('tournament',v_t1,'dismiss',array[v_legacy]);
  perform pg_temp.patch2_assert((select status='open' and legacy_resolution_unknown from public.assistance_requests where id=v_case), 'reading/dismissing legacy inbox cannot resolve assistance');
  perform pg_temp.patch2_assert(public.set_legacy_assistance_status(v_case,v_t1,'in_progress',1,'patch2-rollback-sql-admin'), 'explicit assistance progress workflow');
  perform pg_temp.patch2_assert(not public.set_legacy_assistance_status(v_case,v_t1,'resolved',1,'patch2-rollback-sql-second-admin'), 'stale assistance version cannot overwrite');
  perform pg_temp.patch2_assert(public.set_legacy_assistance_status(v_case,v_t1,'resolved',2,'patch2-rollback-sql-admin'), 'explicit current assistance version resolves');
  perform pg_temp.patch2_assert((select status='resolved' and resolved_at is not null and source_notification_id=v_legacy from public.assistance_requests where id=v_case)
    and exists(select 1 from public.notifications where id=v_legacy and read_at is null and in_app_hidden_at is not null), 'resolution preserves source history and separate read state');
  perform pg_temp.patch2_assert(not public.set_legacy_assistance_status(v_null_case,v_t1,'resolved',1,'patch2-rollback-sql-admin'), 'unassigned assistance cannot be moved into a selected tournament');

  perform pg_temp.patch2_expect_rejected_as('service_role',format('update public.notifications set read_at=now() where id=%L',v_other),'42501','old global service mark read denied');
  perform pg_temp.patch2_expect_rejected_as('service_role',format('update public.notifications set in_app_hidden_at=now() where id=%L',v_other),'42501','old global service hide denied');
  perform pg_temp.patch2_expect_rejected_as('service_role',format('delete from public.notifications where id=%L',v_legacy),'42501','old legacy physical delete denied');
  insert into public.notifications(id,recipient_role,recipient_clerk_user_id,type,title,message,tournament_id,event_key,metadata)
  values(v_hybrid,'admin',v_tag,'registration.manual_review_required',v_tag,v_tag,v_t1,v_tag || ':hybrid',jsonb_build_object('patch2TestRun',v_tag));
  perform pg_temp.patch2_expect_rejected_as('service_role',format('update public.notifications set read_at=now() where id=%L and recipient_clerk_user_id=%L',v_hybrid,v_tag),'42501','forged player recipient cannot mutate hybrid admin row');
  perform pg_temp.patch2_expect_rejected_as('service_role',format('delete from public.notifications where id=%L and recipient_clerk_user_id=%L',v_hybrid,v_tag),'42501','forged player recipient cannot delete hybrid admin row');
  perform pg_temp.patch2_expect_rejected_as('authenticated',format('select id from public.notifications where id=%L',v_hybrid),'42501','closed raw browser notification projection preserved');
  perform pg_temp.patch2_assert(exists(select 1 from public.notifications where id=v_other and read_at is null and in_app_hidden_at is null)
    and exists(select 1 from public.notifications where id=v_hybrid and read_at is null)
    and exists(select 1 from public.assistance_requests where id=v_case and source_notification_id=v_legacy), 'rejected old writes preserve all owned targets and durable source link');
end;
$$;

-- Broader real registration/capacity/FIFO/launch regressions are intentionally
-- not claimed by this first core pass. Browser-only checks remain outstanding.

set constraints all immediate;
do $$
declare v_baseline record; v_digest text;
begin
  for v_baseline in select * from patch2_existing_rows loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I)::text,''[]'')) from %2$s t where %1$I::text in (select jsonb_array_elements_text($1))',v_baseline.key_column,v_baseline.relation)
      into v_digest using v_baseline.keys;
    perform pg_temp.patch2_assert(v_digest=v_baseline.digest,'pre-existing rows must remain byte-for-byte unchanged');
  end loop;
  perform pg_temp.patch2_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE'), 'push claim denial preserved after acceptance');
  perform pg_temp.patch2_assert((select count(*)=4 and bool_and(active) from cron.job), 'independent cron jobs preserved');
  perform pg_temp.patch2_assert((select count(*)=1 and bool_and(not public) from storage.buckets where id='match-proofs'), 'private proof bucket preserved');
end;
$$;
rollback;

-- Reached only if every prior statement succeeded in this single request.
select jsonb_build_object('patch2HostedCoreAssertionsPassed',true,'transactionRolledBack',true,
  'target','zzbnneprhjicmajpjkdg','fixturesPersisted',false,
  'limits','No Clerk JWT signature, browser Server Action, chat, result, replay, provider or full registration-domain acceptance is claimed.') as acceptance_result;
