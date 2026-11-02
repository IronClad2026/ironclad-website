-- ROOT-REVIEWED EXECUTION ONLY. This file COMMITS clearly identified Staging
-- fixtures. Target only zzbnneprhjicmajpjkdg; send the WHOLE file in one request
-- with stop-on-error behaviour. It is not a migration or a Production script.
-- Prerequisite: the operator verified shared email is disabled and completed
-- the old-worker drain. The push-claim permission restriction remains in place.
-- No existing record, role, subscription, scheduler or delivery queue is reset.
-- T1 has 31 notices TOTAL, including two legacy assistance notices; T2 has one.
-- These are Staging-visible upcoming tournaments with registration disabled,
-- without real players, dates, matches or help requests. This schema has no
-- draft tournament status.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '2min';
set local client_min_messages = warning;

do $$
declare
  v_run constant text := 'patch2-staging-20261102-c7bf6a3-race-v1';
  v_suppressed constant text := 'PATCH2_STAGING_FIXTURE_SUPPRESSED';
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_i integer;
begin
  if current_user <> 'postgres' then
    raise exception 'A trusted Staging SQL operator is required';
  end if;
  if not (select count(*) = 1 and bool_and(btrim(decrypted_secret) =
    'https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email')
    from vault.decrypted_secrets where name = 'ironclad_transactional_email_worker_url') then
    raise exception 'The exact independently verified Staging dispatcher is required';
  end if;
  if to_regclass('ironclad_private.staging_synthetic_uat_players') is null
    or to_regclass('public.assistance_requests') is null then
    raise exception 'The reviewed Staging fixture boundary and Patch 2 schema are required';
  end if;
  if exists(select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='public.claim_web_push_notifications(integer)'::regprocedure
        and a.grantee=0 and a.privilege_type='EXECUTE')
    or has_function_privilege('anon','public.claim_web_push_notifications(integer)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_web_push_notifications(integer)','EXECUTE')
    or has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE')
    or not has_function_privilege('service_role','public.complete_web_push_notification(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'The temporary push-claim restriction and preserved completion access are required';
  end if;
  if not (select r.rolname = 'postgres' and p.prosecdef and
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') =
      '5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115'
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.claim_web_push_notifications(integer)'::regprocedure) then
    raise exception 'The reviewed push-claim authority is required';
  end if;
  if exists(select 1 from public.notifications where push_delivery_status='processing') then
    raise exception 'Finish the read-only worker-drain check before creating fixtures';
  end if;
  if exists(select 1 from public.tournaments where slug in (v_run||'-a',v_run||'-b'))
    or exists(select 1 from public.notifications where metadata->>'patch2TestRun'=v_run) then
    raise exception 'This fixture run already exists; reuse its manifest instead of creating duplicates';
  end if;

  insert into public.tournaments(id,title,slug,format,status,description,
    banner_image_url,prize_pool,registration_enabled,division_model_version)
  values
    (v_t1,'Patch 2 synthetic inbox A',v_run||'-a','1v1','upcoming',
      'Synthetic Staging inbox acceptance only. No players, matches or timers. Run: '||v_run,
      '','',false,'four_division_v1'),
    (v_t2,'Patch 2 synthetic inbox B',v_run||'-b','1v1','upcoming',
      'Synthetic Staging tournament-isolation acceptance only. Run: '||v_run,
      '','',false,'four_division_v1');

  for v_i in 1..31 loop
    v_id := gen_random_uuid();
    v_ids := array_append(v_ids,v_id);
    insert into public.notifications(id,recipient_role,type,title,message,
      tournament_id,tournament_title,event_key,metadata,created_at)
    values(v_id,'admin',
      case when v_i>=30 then 'match.admin_assistance_requested' else 'registration.manual_review_required' end,
      case when v_i>=30 then 'Patch 2 synthetic assistance '||(v_i-29)
        else 'Patch 2 synthetic inbox notice '||lpad(v_i::text,2,'0') end,
      case when v_i>=30 then 'Synthetic Staging request for inbox/queue testing. No real player needs help; preserve this test request separately from its notice.'
        else 'Synthetic Staging notification for shared inbox, pagination and tournament-isolation testing. It is not a real registration.' end,
      v_t1,'Patch 2 synthetic inbox A',v_run||':a:'||v_i,
      jsonb_build_object('patch2TestRun',v_run,'patch2FixtureOrdinal',v_i),
      clock_timestamp()+v_i*interval '1 millisecond');
  end loop;
  v_id := gen_random_uuid();
  v_ids := array_append(v_ids,v_id);
  insert into public.notifications(id,recipient_role,type,title,message,
    tournament_id,tournament_title,event_key,metadata)
  values(v_id,'admin','registration.manual_review_required','Patch 2 synthetic foreign-tournament notice',
    'Synthetic Staging notification for the second tournament. Actions in tournament A must reject this target.',
    v_t2,'Patch 2 synthetic inbox B',v_run||':b:1',
    jsonb_build_object('patch2TestRun',v_run,'patch2FixtureOrdinal',1));

  if (select count(*) from public.notifications where id=any(v_ids)
      and metadata->>'patch2TestRun'=v_run and tournament_id=v_t1) <> 31
    or (select count(*) from public.notifications where id=any(v_ids)
      and metadata->>'patch2TestRun'=v_run and tournament_id=v_t2) <> 1
    or (select count(*) from public.assistance_requests a join public.notifications n
      on n.id=a.source_notification_id where n.id=any(v_ids)
      and n.metadata->>'patch2TestRun'=v_run and a.tournament_id=v_t1
      and a.status='open' and a.version=1) <> 2 then
    raise exception 'The exact owned inbox and durable assistance fixtures were not created';
  end if;

  -- Triggers decide delivery eligibility. Retire ONLY this run's newly enrolled
  -- delivery work before it becomes visible to any shared worker. Null delivery
  -- state stays null; do not invent eligibility, attempts or enqueue evidence.
  if exists(select 1 from public.notifications where id=any(v_ids)
    and metadata->>'patch2TestRun'=v_run and tournament_id in (v_t1,v_t2)
    and (push_delivery_status='processing' or email_delivery_status='processing')) then
    raise exception 'Uncommitted fixture delivery work must not have a processing claim';
  end if;
  update public.notifications set
    push_delivery_status='skipped', push_next_attempt_at=null,
    push_claim_token=null, push_claim_expires_at=null,
    push_completed_at=clock_timestamp(), push_last_error_code=v_suppressed
  where id=any(v_ids) and metadata->>'patch2TestRun'=v_run
    and tournament_id in (v_t1,v_t2) and recipient_role='admin'
    and push_delivery_status in ('pending','retryable_failure');
  update public.notifications set
    email_delivery_status='skipped', email_next_attempt_at=null,
    email_claim_token=null, email_claim_expires_at=null,
    email_sent_at=null, email_provider_message_id=null,
    email_last_error_code=v_suppressed
  where id=any(v_ids) and metadata->>'patch2TestRun'=v_run
    and tournament_id in (v_t1,v_t2) and recipient_role='admin'
    and email_delivery_status in ('pending','retryable_failure');
  if exists(select 1 from public.notifications where id=any(v_ids)
    and metadata->>'patch2TestRun'=v_run and tournament_id in (v_t1,v_t2)
    and (push_delivery_status in ('pending','retryable_failure','processing')
      or email_delivery_status in ('pending','retryable_failure','processing')
      or read_at is not null or in_app_hidden_at is not null)) then
    raise exception 'Fixture delivery suppression must preserve unread, visible source notices';
  end if;
  if exists(select 1 from public.tournaments where id in (v_t1,v_t2)
    and (status<>'upcoming' or registration_enabled))
    or exists(select 1 from public.registrations where tournament_id in (v_t1,v_t2))
    or exists(select 1 from public.generated_brackets g join public.tournament_brackets b
      on b.id=g.tournament_bracket_id where b.tournament_id in (v_t1,v_t2)) then
    raise exception 'Fixture tournaments must remain upcoming with registration disabled and without generated competition';
  end if;
end;
$$;
set constraints all immediate;
commit;

-- Persist this non-secret manifest before racing actions. Both assistance cases
-- intentionally remain Open until explicit synthetic test status actions occur.
with run as (select 'patch2-staging-20261102-c7bf6a3-race-v1'::text tag),
  tours as (select t.id,t.slug from public.tournaments t,run
    where t.slug in (run.tag||'-a',run.tag||'-b')),
  notices as (select n.id,n.tournament_id,n.type,n.metadata,n.push_delivery_status,n.email_delivery_status
    from public.notifications n,run where n.metadata->>'patch2TestRun'=run.tag
      and n.tournament_id in (select id from tours))
select jsonb_build_object(
  'run',run.tag,'target','zzbnneprhjicmajpjkdg','fixturesCommitted',true,
  'tournamentA',(select id from tours where slug=run.tag||'-a'),
  'tournamentB',(select id from tours where slug=run.tag||'-b'),
  'notificationIds',(select jsonb_agg(id order by tournament_id,(metadata->>'patch2FixtureOrdinal')::int) from notices),
  'readRaceNotification',(select id from notices where tournament_id=(select id from tours where slug=run.tag||'-a') and metadata->>'patch2FixtureOrdinal'='1'),
  'dismissRaceNotification',(select id from notices where tournament_id=(select id from tours where slug=run.tag||'-a') and metadata->>'patch2FixtureOrdinal'='2'),
  'foreignNotification',(select id from notices where tournament_id=(select id from tours where slug=run.tag||'-b')),
  'legacyRequests',(select jsonb_agg(jsonb_build_object('id',a.id,'sourceNotificationId',a.source_notification_id,
    'status',a.status,'version',a.version) order by a.id) from public.assistance_requests a
    join notices n on n.id=a.source_notification_id),
  'pushSuppressed',(select count(*) from notices where push_delivery_status='skipped'),
  'emailSuppressed',(select count(*) from notices where email_delivery_status='skipped'),
  'limits','Committed synthetic SQL fixtures only; concurrent SQL-role claims do not establish Clerk authentication.') as fixture_manifest
from run;

-- Recorded races: root opened TWO actual database sessions concurrently and
-- recorded distinct pg_backend_pid() values plus overlapping clock timestamps.
-- The SQL operator remained postgres, with local simulated service-role
-- request.jwt.claim.role/claims for a DIFFERENT clearly synthetic administrator.
-- Actual service-role grants were checked separately by hosted-acceptance.sql;
-- these races do not establish two real Clerk-admin browser sessions.
-- A may hold its notification/case row lock for ~1 second AFTER its action, so
-- B genuinely waits on that lock. Only manifest-owned IDs may be targeted.
-- 1. Both call mutate_admin_notification_inbox('tournament',A,'read',ARRAY[readRaceNotification]): sorted changes [0,1].
-- 2. Both call the same RPC with 'dismiss' and dismissRaceNotification: [0,1]; source row remains.
-- 3. Both call set_legacy_assistance_status(case,A,'in_progress',1,syntheticAdmin): [false,true]; version becomes2.
-- Readback must prove the other tournament stayed unread/visible, exactly one
-- durable case per source notice, and the other legacy request remains Open.
-- Retain the fixture manifest, source notices and requests after acceptance.
