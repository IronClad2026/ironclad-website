-- ROOT-REVIEWED EXECUTION ONLY. This script COMMITS a dedicated Staging fixture.
-- Target ONLY zzbnneprhjicmajpjkdg. Send the WHOLE file with stop-on-error.
-- NOT a migration. No new Clerk users/roles, provider facts, consent records,
-- Storage objects, proof paths, results or messages are manufactured here.
-- Root must fill the browser-readiness attestation below only when the existing
-- TestAcademy1 browser account and TWO DISTINCT REAL .rec files are ready for a
-- test within 10 minutes. Until then this draft deliberately fails closed.
-- Root must also refresh its external email-disabled verification if expired.
-- Initial notifications are retained/suppressed before COMMIT. LATER browser
-- or deadline actions can enqueue NEW notices: keep the Staging push-claim and
-- email controls until explicitly reviewed test completion/retirement.
-- This creates FOUR live 7-day matchup timers, with no automatic cleanup.
-- The configured result-confirmation window is the supported 1440 minutes;
-- it starts only when a real report is submitted. Normal cron stays enabled.

begin isolation level repeatable read;
set local lock_timeout='2s';
set local statement_timeout='90s';
set local idle_in_transaction_session_timeout='2min';
set local client_min_messages=warning;

create function pg_temp.patch2_replay_assert(p_ok boolean,p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'Patch2 replay fixture precondition failed: %',p_label;
  end if;
end;
$$;

create temporary table patch2_replay_run(tag text,tournament_id uuid,bracket_id uuid) on commit drop;
insert into patch2_replay_run values('patch2-staging-replay-20261102-v1',gen_random_uuid(),gen_random_uuid());
create temporary table patch2_replay_regs(slot integer primary key,alias text,player_id uuid,registration_id uuid) on commit drop;
create temporary table patch2_replay_baseline(
  relation regclass primary key,identity_expression text not null,keys jsonb not null,digest text not null
) on commit drop;
create temporary table patch2_replay_old_notifications(id uuid primary key) on commit drop;
create temporary table patch2_replay_new_notifications(id uuid primary key) on commit drop;

do $$
declare
  -- ROOT REVIEW GATES: these record human/operator observations, not database
  -- proof of Vercel configuration, Clerk sessions, files or browser behaviour.
  v_browser_ready_at constant timestamptz := '2026-11-02T18:24:56Z';
  v_email_disabled_verified_at constant timestamptz := '2026-11-02T18:23:45Z';
  v_relation record; v_identity text; v_keys jsonb; v_digest text; v_tag text;
begin
  select tag into strict v_tag from patch2_replay_run;
  perform pg_temp.patch2_replay_assert(current_user='postgres','trusted Staging SQL operator required');
  perform pg_temp.patch2_replay_assert(v_browser_ready_at is not null and clock_timestamp() between v_browser_ready_at
    and v_browser_ready_at+interval '10 minutes','root must confirm readiness for the existing participant browser and two real replay files');
  perform pg_temp.patch2_replay_assert(clock_timestamp() between v_email_disabled_verified_at
    and v_email_disabled_verified_at+interval '30 minutes','fresh independent root verification of disabled Staging email');
  perform pg_temp.patch2_replay_assert((select count(*)=1 and bool_and(btrim(decrypted_secret)=
    'https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email')
    from vault.decrypted_secrets where name='ironclad_transactional_email_worker_url'),'exact Staging dispatcher fingerprint');
  perform pg_temp.patch2_replay_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE')
    and not has_function_privilege('anon','public.claim_web_push_notifications(integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.claim_web_push_notifications(integer)','EXECUTE')
    and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='public.claim_web_push_notifications(integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
    and has_function_privilege('service_role','public.complete_web_push_notification(uuid,uuid,text,text)','EXECUTE'),
    'push permission block and preserved completion required');
  perform pg_temp.patch2_replay_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex')=
    '5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115'
    from pg_proc where oid='public.claim_web_push_notifications(integer)'::regprocedure),'unchanged push claim body');
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.notifications where push_delivery_status='processing'
    or email_delivery_status='processing' or push_claim_token is not null or email_claim_token is not null),'finished worker-drain prerequisite');
  perform pg_temp.patch2_replay_assert((select count(*)=4 and bool_and(active) from cron.job),'existing four independent cron jobs stay active');
  perform pg_temp.patch2_replay_assert((select count(*)=1 and bool_and(not public) from storage.buckets where id='match-proofs'),
    'proof bucket stays private');
  perform pg_temp.patch2_replay_assert(to_regclass('ironclad_private.staging_synthetic_uat_players') is not null
    and ironclad_private.match_room_writes_enabled(),'existing fixture and Match Room contracts required');
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.tournaments where slug=v_tag)
    and not exists(select 1 from public.registrations where admin_notes like v_tag||'%'),
    'new fixture run only; never recreate or clean up a prior manifest');
  -- Fingerprint ALL pre-existing public/private application table rows. Use the
  -- complete primary key, including composites; tables without a PK use their
  -- current tuple identity. This detects this transaction changing/deleting any
  -- old row, including A/B registrations and partner fixture identities/history.
  -- It does not claim to observe concurrent external writers past this snapshot.
  for v_relation in select c.oid::regclass relation,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') order by c.oid loop
    select 'jsonb_build_array('||string_agg(format('t.%I',a.attname),',' order by k.ordinal)||')::text'
      into v_identity from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinal)
      join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
      where i.indrelid=v_relation.oid and i.indisprimary;
    v_identity:=coalesce(v_identity,'t.ctid::text');
    execute format('select coalesce(jsonb_agg(%1$s order by %1$s),''[]''::jsonb),md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$s,to_jsonb(t)::text)::text,''[]'')) from %2$s t',v_identity,v_relation.relation)
      into v_keys,v_digest;
    insert into patch2_replay_baseline values(v_relation.relation,v_identity,v_keys,v_digest);
  end loop;
  insert into patch2_replay_old_notifications select id from public.notifications;
end;
$$;

do $$
declare
  v_tag text; v_t uuid; v_b uuid; v_secret text; v_i integer; v_result record;
  v_maps uuid[]; v_regs uuid[]:=array[]::uuid[]; v_generated uuid; v_assignments jsonb; v_matches uuid[];
begin
  select tag,tournament_id,bracket_id into strict v_tag,v_t,v_b from patch2_replay_run;
  -- Trusted SQL context for the existing Staging-only fixture authority. This
  -- is NOT a signed Clerk participant/admin browser session or a new role.
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','ref','zzbnneprhjicmajpjkdg')::text,true);
  select nullif(btrim(decrypted_secret),'') into strict v_secret from vault.decrypted_secrets
    where name='ironclad_staging_synthetic_uat_fixture_secret';
  perform ironclad_private.assert_staging_synthetic_uat_access(v_secret);
  perform pg_temp.patch2_replay_assert((select count(*)=8 and bool_and(f.clerk_environment='development'
    and f.clerk_test_user_verified and f.clerk_test_user_verified_at is not null
    and not f.steam_openid_verified and not f.steam_ownership_verified and not f.relic_live_lookup_verified
    and not f.linked_steam_legal_confirmation and p.profile_completed and p.account_closed_at is null
    and not p.public_profile_enabled and p.coh3_profile_id is null)
    from ironclad_private.staging_synthetic_uat_players f join public.players p on p.id=f.player_id
    where f.approved_alias in (select 'TestAcademy'||n from generate_series(1,8) n)),
    'existing approved Development Academy1-8 identities only; provider assertions stay false');
  -- Explicitly labelled SQL fixture construction, matching the passing rollback
  -- setup. The normal tournament editor's unresolved-division cycle rule is not
  -- tested here; no editor/row guard is disabled or replaced. All enrolment,
  -- eligibility, approval, map-pool, bracket, launch and deadline guards apply.
  insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,
    registration_enabled,division_model_version,result_confirmation_window_minutes)
    values(v_t,'[SYNTHETIC STAGING] Patch 2 replay acceptance',v_tag,'1v1','registration_open',
      'Dedicated synthetic browser replay acceptance. Eight existing approved synthetic identities; no real competition or provider verification asserted. Canonical launch creates four seven-day matchup timers. No automatic cleanup. Run: '||v_tag,
      '','',true,'four_division_v1',1440);
  insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players)
    values(v_b,v_t,'Academy','0-1099 ELO',8);
  update public.tournaments t set status=t.status where t.id=v_t;
  perform pg_temp.patch2_replay_assert((select registration_enabled and status='registration_open'
    and registration_open_at is null and registration_close_at is null and division_model_version='four_division_v1'
    from public.tournaments where id=v_t),'real derived registration availability');
  for v_i in 1..8 loop
    select * into strict v_result from public.enrol_staging_synthetic_uat_player(v_secret,'TestAcademy'||v_i,v_t,v_b,false);
    perform pg_temp.patch2_replay_assert(v_result.created and v_result.registration_id is not null
      and v_result.registration_status='pending' and not v_result.waitlist_confirmation_required
      and v_result.provenance='staging_synthetic_uat' and v_result.contract_version='staging-synthetic-v2',
      'one new canonical synthetic registration without an offer');
    insert into patch2_replay_regs values(v_i,'TestAcademy'||v_i,v_result.player_id,v_result.registration_id);
    v_regs:=array_append(v_regs,v_result.registration_id);
    perform * from public.review_tournament_registration_scoped(v_t,v_result.registration_id,'approved',
      v_tag||' [SYNTHETIC] dedicated browser replay fixture. Provider/ownership verification remains false; no real consent or played game asserted.');
  end loop;
  -- Reuse existing official catalogue rows READ-ONLY; do not pollute or change
  -- global map records. Canonical publication validates the selected five maps.
  select array_agg(id order by display_name,id) into v_maps from
    (select id,display_name from public.coh3_maps where source_type='official' and status='active' and game_mode='1v1'
      order by display_name,id limit 5) m;
  perform pg_temp.patch2_replay_assert(cardinality(v_maps)=5,'five existing active official 1v1 maps required');
  perform public.publish_tournament_bracket_map_pools(v_t,array[v_b],v_maps,'patch2-synthetic-sql-operator');
  v_generated:=public.generate_tournament_bracket(v_b,'patch2-synthetic-sql-operator');
  select jsonb_agg(jsonb_build_object('slot_number',s,'registration_id',v_regs[s]) order by s)
    into v_assignments from generate_series(1,8) s;
  perform public.save_bracket_assignments(v_generated,v_assignments,'patch2-synthetic-sql-operator');
  perform * from public.launch_tournament_division(v_b,'patch2-synthetic-sql-operator');
  select array_agg(m.id order by m.match_number) into v_matches from public.tournament_matches m
    join public.bracket_rounds r on r.id=m.round_id where m.generated_bracket_id=v_generated and r.round_number=1;
  perform pg_temp.patch2_replay_assert(cardinality(v_matches)=4 and (select bool_and(series_best_of=3 and status='in_progress'
    and activation_version>=1 and activated_at is not null and deadline_at=activated_at+interval '7 days'
    and winner_registration_id is null and official_result_submission_id is null)
    from public.tournament_matches where id=any(v_matches)),'four normal BO3 matches with canonical seven-day activation deadlines');
  perform pg_temp.patch2_replay_assert((select player_one_registration_id=v_regs[1] and player_two_registration_id=v_regs[2]
    from public.tournament_matches where id=v_matches[1]),'TestAcademy1 vs TestAcademy2 is the exact first match');
  perform pg_temp.patch2_replay_assert(public.is_tournament_bracket_roster_locked(v_b)
    and (select status='in_progress' and not registration_enabled and result_confirmation_window_minutes=1440
      from public.tournaments where id=v_t),'real launch locks this roster and closes its registration');
  insert into patch2_replay_new_notifications select n.id from public.notifications n
    where not exists(select 1 from patch2_replay_old_notifications o where o.id=n.id);
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.notifications where id in
    (select id from patch2_replay_new_notifications) and (tournament_id is distinct from v_t
      or push_delivery_status='processing' or email_delivery_status='processing')),'all new uncommitted notices belong to this fixture and have no worker claim');
  update public.notifications set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('patch2TestRun',v_tag,'syntheticFixture',true),
    title='[SYNTHETIC STAGING] '||title,message='Synthetic replay-browser fixture; no real competition is asserted. '||message
    where id in (select id from patch2_replay_new_notifications);
  update public.notifications set push_delivery_status='skipped',push_next_attempt_at=null,push_claim_token=null,
    push_claim_expires_at=null,push_completed_at=clock_timestamp(),push_last_error_code='PATCH2_STAGING_FIXTURE_SUPPRESSED'
    where id in (select id from patch2_replay_new_notifications) and push_delivery_status in ('pending','retryable_failure');
  update public.notifications set email_delivery_status='skipped',email_next_attempt_at=null,email_claim_token=null,
    email_claim_expires_at=null,email_sent_at=null,email_provider_message_id=null,email_last_error_code='PATCH2_STAGING_FIXTURE_SUPPRESSED'
    where id in (select id from patch2_replay_new_notifications) and email_delivery_status in ('pending','retryable_failure');
end;
$$;

set constraints all immediate;
do $$
declare v_original record; v_digest text; v_t uuid;
begin
  select tournament_id into strict v_t from patch2_replay_run;
  for v_original in select * from patch2_replay_baseline loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$s,to_jsonb(t)::text)::text,''[]'')) from %2$s t where %1$s in (select jsonb_array_elements_text($1))',v_original.identity_expression,v_original.relation)
      into v_digest using v_original.keys;
    perform pg_temp.patch2_replay_assert(v_digest=v_original.digest,'every pre-existing application/fixture/history row must be unchanged');
  end loop;
  perform pg_temp.patch2_replay_assert((select count(*)=8 and bool_and(registration_status='approved'
    and registration_provenance='staging_synthetic_uat' and fixture_contract_version='staging-synthetic-v2'
    and elo_status='manual_review' and elo_verification_source is null and elo_verified_elo is null and elo_calculation_version is null)
    from public.registrations where tournament_id=v_t),'eight synthetic manual snapshots; no invented provider verification');
  perform pg_temp.patch2_replay_assert((select count(*)=8 and bool_and(not e.steam_openid_verified and not e.steam_ownership_verified
    and not e.relic_live_lookup_verified and not e.linked_steam_legal_confirmation)
    from ironclad_private.staging_synthetic_uat_enrolments e where e.tournament_id=v_t),'all new canonical enrolment provider facts remain false');
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.registrations where tournament_id=v_t
    and (waitlist_offer_status is not null or waitlist_offer_expires_at is not null)),'no waitlist timers');
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.match_result_report_groups where tournament_id=v_t)
    and not exists(select 1 from public.match_replay_upload_attempts a join public.tournament_matches m on m.id=a.match_id
      join public.generated_brackets g on g.id=m.generated_bracket_id join public.tournament_brackets b on b.id=g.tournament_bracket_id
      where b.tournament_id=v_t),'no report, replay attempt or proof reference is fabricated');
  perform pg_temp.patch2_replay_assert(not exists(select 1 from public.notifications where id in
    (select id from patch2_replay_new_notifications) and (push_delivery_status in ('pending','retryable_failure','processing')
      or email_delivery_status in ('pending','retryable_failure','processing') or push_claim_token is not null or email_claim_token is not null)),
    'all initial notices retained and nondeliverable before COMMIT');
  perform pg_temp.patch2_replay_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE')
    and (select count(*)=4 and bool_and(active) from cron.job),'push permission block and independent cron remain intact');
end;
$$;
commit;

-- Last statement for hosted-tool readback. Store this manifest. It contains no
-- Clerk identity, credentials, Storage paths or invented file-success evidence.
with fixture as (select * from public.tournaments where slug='patch2-staging-replay-20261102-v1'),
  matches as (select m.*,r.round_number from public.tournament_matches m join public.bracket_rounds r on r.id=m.round_id
    join public.generated_brackets g on g.id=m.generated_bracket_id join public.tournament_brackets b on b.id=g.tournament_bracket_id
    where b.tournament_id=(select id from fixture))
select jsonb_build_object('fixtureRun','patch2-staging-replay-20261102-v1','target','zzbnneprhjicmajpjkdg','committed',true,
  'tournamentId',f.id,'tournamentStatus',f.status,'resultConfirmationWindowMinutes',f.result_confirmation_window_minutes,
  'bracketId',(select id from public.tournament_brackets where tournament_id=f.id and name='Academy'),
  'firstMatchId',(select id from matches where round_number=1 and match_number=1),
  'browserMatchHref','/tournaments?tournament='||f.id||'&tab=brackets&match='||(select id from matches where round_number=1 and match_number=1),
  'reporterAlias','TestAcademy1','opponentAlias','TestAcademy2','intendedBrowserScore','2-0 with two distinct real .rec files',
  'firstRoundTimers',(select jsonb_agg(jsonb_build_object('matchId',id,'activatedAt',activated_at,'deadlineAt',deadline_at,
    'bestOf',series_best_of,'status',status) order by match_number) from matches where round_number=1),
  'initialSourceNotices',(select count(*) from public.notifications where metadata->>'patch2TestRun'='patch2-staging-replay-20261102-v1'),
  'automaticCleanup',false,
  'limits','Committed synthetic fixture readiness only. Four canonical seven-day matchup timers are live; future actions can enqueue new notifications. Keep Staging delivery controls until explicit review. No browser login, human consent, played match, replay bytes/upload/retrieval or result acceptance is established by this SQL.') as fixture_manifest
from fixture f;
