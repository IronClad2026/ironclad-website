-- ROOT REVIEW / EXECUTION ONLY. Exact Staging project zzbnneprhjicmajpjkdg.
-- Additive fixture, NOT a migration. No users, roles, consent, provider facts,
-- results, replays, chat or assistance messages are manufactured.
-- Both tournaments launch, allocate one canonical room, then CANCEL in THIS
-- transaction. No live tournament timer becomes visible at COMMIT.
-- Review the complete request, run with sole COMMIT changed to ROLLBACK first,
-- then execute the reviewed whole request with stop-on-error.
-- Fill BOTH root attestations only after fresh independent isolation checks.
begin isolation level repeatable read;
set local lock_timeout='2s';
set local statement_timeout='90s';
set local idle_in_transaction_session_timeout='2min';
set local client_min_messages=warning;

create function pg_temp.patch3_assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'Phase3 fixture blocked: %',p_label; end if; end $$;
create temporary table patch3_run(label text primary key,tag text unique,tournament_id uuid,bracket_id uuid,match_id uuid,room_id uuid,opponent_alias text) on commit preserve rows;
insert into patch3_run values
 ('A','patch3-staging-assistance-20261103-v1-a',gen_random_uuid(),gen_random_uuid(),null,null,'TestAcademy2'),
 ('B','patch3-staging-assistance-20261103-v1-b',gen_random_uuid(),gen_random_uuid(),null,null,'TestAcademy3');
create temporary table patch3_baseline(relation regclass primary key,identity_expression text,keys jsonb,digest text) on commit drop;
create temporary table patch3_old_notices(id uuid primary key) on commit drop;
create temporary table patch3_new_notices(id uuid primary key) on commit drop;

do $$
declare
  v_root_setup_verified_at constant timestamptz:='2026-11-02T19:51:40Z'; -- ROOT fills fresh actual time; never assume.
  v_email_disabled_verified_at constant timestamptz:='2026-11-02T19:51:40Z'; -- ROOT independent Vercel/config proof.
  v_relation record; v_identity text; v_keys jsonb; v_digest text;
begin
  perform pg_temp.patch3_assert(current_user='postgres','trusted Staging SQL operator');
  perform pg_temp.patch3_assert(clock_timestamp() between v_root_setup_verified_at and v_root_setup_verified_at+interval '10 minutes','fresh explicit root fixture decision');
  perform pg_temp.patch3_assert(clock_timestamp() between v_email_disabled_verified_at and v_email_disabled_verified_at+interval '30 minutes','fresh external email-disabled proof');
  perform pg_temp.patch3_assert((select count(*)=1 and bool_and(btrim(decrypted_secret)='https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email') from vault.decrypted_secrets where name='ironclad_transactional_email_worker_url'),'exact Staging dispatcher destination');
  perform pg_temp.patch3_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE') and not has_function_privilege('anon','public.claim_web_push_notifications(integer)','EXECUTE') and not has_function_privilege('authenticated','public.claim_web_push_notifications(integer)','EXECUTE') and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.claim_web_push_notifications(integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'push claiming remains blocked');
  perform pg_temp.patch3_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex')='5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115' from pg_proc where oid='public.claim_web_push_notifications(integer)'::regprocedure),'unchanged push claim body');
  perform pg_temp.patch3_assert(not exists(select 1 from public.notifications where push_delivery_status='processing' or email_delivery_status='processing' or push_claim_token is not null or email_claim_token is not null),'no worker lease in flight');
  perform pg_temp.patch3_assert((select count(*)=4 and bool_and(active) from cron.job),'all four existing cron jobs remain active');
  perform pg_temp.patch3_assert((select count(*)=1 and bool_and(not public) from storage.buckets where id='match-proofs'),'private proof bucket');
  perform pg_temp.patch3_assert(to_regprocedure('public.get_private_assistance_context(uuid)') is not null and ironclad_private.match_room_writes_enabled(),'deployed Phase3 and existing room authority');
  perform pg_temp.patch3_assert((select value='{"enabled":false}'::jsonb from public.platform_settings where key='private_assistance_new_requests_enabled'),'creation flag stays OFF during setup; activation is separate');
  perform pg_temp.patch3_assert(not exists(select 1 from public.tournaments t join patch3_run f on f.tag=t.slug),'new run only; never reuse/reset a manifest');
  for v_relation in select c.oid::regclass relation,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') order by c.oid loop
    select 'jsonb_build_array('||string_agg(format('t.%I',a.attname),',' order by k.ordinal)||')::text' into v_identity from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinal) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where i.indrelid=v_relation.oid and i.indisprimary;
    v_identity:=coalesce(v_identity,'t.ctid::text');
    execute format('select coalesce(jsonb_agg(%1$s order by %1$s),''[]''::jsonb),md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$s,to_jsonb(t)::text)::text,''[]'')) from %2$s t',v_identity,v_relation.relation) into v_keys,v_digest;
    insert into patch3_baseline values(v_relation.relation,v_identity,v_keys,v_digest);
  end loop;
  insert into patch3_baseline select 'storage.objects'::regclass,'jsonb_build_array(t.id)::text',coalesce(jsonb_agg(jsonb_build_array(id)::text order by id),'[]'),md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from storage.objects t;
  insert into patch3_old_notices select id from public.notifications;
end $$;

do $$
declare f record; v_secret text; v_i integer; v_result record; v_maps uuid[]; v_regs uuid[]; v_generated uuid; v_assignments jsonb; v_match uuid; v_room jsonb; v_sub text; v_before jsonb; v_after jsonb; v_cancel jsonb;
begin
  -- Existing fixture guard secret stays wholly inside PostgreSQL; never output.
  select nullif(btrim(decrypted_secret),'') into strict v_secret from vault.decrypted_secrets where name='ironclad_staging_synthetic_uat_fixture_secret';
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role","ref":"zzbnneprhjicmajpjkdg"}',true);
  perform ironclad_private.assert_staging_synthetic_uat_access(v_secret);
  perform pg_temp.patch3_assert((select count(*)=8 and bool_and(fixture.clerk_environment='development' and fixture.clerk_test_user_verified and fixture.clerk_test_user_verified_at is not null and not fixture.steam_openid_verified and not fixture.steam_ownership_verified and not fixture.relic_live_lookup_verified and not fixture.linked_steam_legal_confirmation and p.profile_completed and p.account_closed_at is null and not p.public_profile_enabled and p.coh3_profile_id is null) from ironclad_private.staging_synthetic_uat_players fixture join public.players p on p.id=fixture.player_id where fixture.approved_alias in (select 'TestAcademy'||n from generate_series(1,8) n)),'only existing approved Development Academy1-8; provider claims remain false');
  select array_agg(id order by display_name,id) into v_maps from (select id,display_name from public.coh3_maps where source_type='official' and status='active' and game_mode='1v1' order by display_name,id limit 5) m;
  perform pg_temp.patch3_assert(cardinality(v_maps)=5,'five existing official maps');
  for f in select * from patch3_run order by label loop
    v_regs:=array[]::uuid[];
    -- Same explicitly labelled canonical fixture construction as the reviewed
    -- replay factory, not a normal editor/real-provider verification test.
    insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled,division_model_version,result_confirmation_window_minutes)
      values(f.tournament_id,'[SYNTHETIC STAGING] Phase 3 private assistance '||f.label,f.tag,'1v1','registration_open','Dedicated synthetic private-assistance acceptance. No real competition or provider verification asserted. Canonically cancelled in the setup transaction. Run: '||f.tag,'','',true,'four_division_v1',1440);
    insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players) values(f.bracket_id,f.tournament_id,'Academy','0-1099 ELO',8);
    update public.tournaments set status=status where id=f.tournament_id;
    for v_i in 1..8 loop
      select * into strict v_result from public.enrol_staging_synthetic_uat_player(v_secret,'TestAcademy'||v_i,f.tournament_id,f.bracket_id,false);
      perform pg_temp.patch3_assert(v_result.created and v_result.registration_status='pending' and not v_result.waitlist_confirmation_required and v_result.provenance='staging_synthetic_uat' and v_result.contract_version='staging-synthetic-v2','new canonical synthetic registration only');
      v_regs:=array_append(v_regs,v_result.registration_id);
      perform * from public.review_tournament_registration_scoped(f.tournament_id,v_result.registration_id,'approved',f.tag||' [SYNTHETIC] private-assistance acceptance only. No provider ownership, real consent or played result asserted.');
    end loop;
    perform public.publish_tournament_bracket_map_pools(f.tournament_id,array[f.bracket_id],v_maps,'patch3-synthetic-sql-operator');
    v_generated:=public.generate_tournament_bracket(f.bracket_id,'patch3-synthetic-sql-operator');
    select jsonb_agg(jsonb_build_object('slot_number',s,'registration_id',case when f.label='B' and s=2 then v_regs[3] when f.label='B' and s=3 then v_regs[2] else v_regs[s] end) order by s) into v_assignments from generate_series(1,8) s;
    perform public.save_bracket_assignments(v_generated,v_assignments,'patch3-synthetic-sql-operator');
    perform * from public.launch_tournament_division(f.bracket_id,'patch3-synthetic-sql-operator');
    select m.id into strict v_match from public.tournament_matches m join public.bracket_rounds r on r.id=m.round_id where m.generated_bracket_id=v_generated and r.round_number=1 and m.match_number=1;
    perform pg_temp.patch3_assert((select player_one_registration_id=v_regs[1] and player_two_registration_id=v_regs[case when f.label='A' then 2 else 3 end] and status='in_progress' and series_best_of=3 from public.tournament_matches where id=v_match),'exact requester and different opponent per tournament');
    select clerk_user_id into strict v_sub from public.registrations where id=v_regs[1];
    -- Honest trusted-SQL participant simulation only, NOT a signed Clerk session.
    -- Calls the canonical room resolver while the new tournament is live.
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_sub,'metadata',jsonb_build_object('role','player'))::text,true);
    v_room:=public.resolve_match_room(v_match);
    perform pg_temp.patch3_assert((v_room->'room'->>'writable')::boolean and (v_room->'room'->>'lastSequence')::bigint=0,'canonical empty room created');
    update patch3_run set match_id=v_match,room_id=(v_room->'room'->>'id')::uuid where label=f.label;
    select jsonb_build_object('matches',(select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m where generated_bracket_id=v_generated),'regs',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r where tournament_id=f.tournament_id),'room',(select to_jsonb(r) from public.match_rooms r where id=(v_room->'room'->>'id')::uuid)) into v_before;
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims','{"role":"service_role","ref":"zzbnneprhjicmajpjkdg"}',true);
    v_cancel:=public.cancel_tournament(f.tournament_id,'Synthetic assistance fixture: cancel atomically before commit; retain registrations, rooms, recorded deadlines and history. No game was played or result reported.','patch3-synthetic-sql-operator');
    perform pg_temp.patch3_assert(v_cancel->>'outcome'='cancelled','canonical terminal cancellation');
    select jsonb_build_object('matches',(select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m where generated_bracket_id=v_generated),'regs',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r where tournament_id=f.tournament_id),'room',(select to_jsonb(r) from public.match_rooms r where id=(v_room->'room'->>'id')::uuid)) into v_after;
    perform pg_temp.patch3_assert(v_before=v_after,'cancellation preserves new room, roster and all match/deadline rows');
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_sub,'metadata',jsonb_build_object('role','player'))::text,true);
    v_room:=public.get_match_room_history((v_room->'room'->>'id')::uuid,0,1);
    perform pg_temp.patch3_assert(not (v_room->'room'->>'writable')::boolean and jsonb_array_length(v_room->'messages')=0,'terminal room remains readable without chat mutation');
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims','{"role":"service_role","ref":"zzbnneprhjicmajpjkdg"}',true);
  end loop;
  insert into patch3_new_notices select id from public.notifications n where not exists(select 1 from patch3_old_notices old where old.id=n.id);
  perform pg_temp.patch3_assert(not exists(select 1 from public.notifications where id in(select id from patch3_new_notices) and (tournament_id not in(select tournament_id from patch3_run) or tournament_id is null or push_delivery_status='processing' or email_delivery_status='processing')),'all newly created notices belong only to the two new fixtures and are unclaimed');
  update public.notifications set metadata=coalesce(metadata,'{}')||jsonb_build_object('patch3TestRun','patch3-staging-assistance-20261103-v1','syntheticFixture',true) where id in(select id from patch3_new_notices);
  update public.notifications set push_delivery_status='skipped',push_next_attempt_at=null,push_claim_token=null,push_claim_expires_at=null,push_completed_at=clock_timestamp(),push_last_error_code='PATCH3_STAGING_FIXTURE_SUPPRESSED' where id in(select id from patch3_new_notices) and push_delivery_status in('pending','retryable_failure');
  update public.notifications set email_delivery_status='skipped',email_next_attempt_at=null,email_claim_token=null,email_claim_expires_at=null,email_sent_at=null,email_provider_message_id=null,email_last_error_code='PATCH3_STAGING_FIXTURE_SUPPRESSED' where id in(select id from patch3_new_notices) and email_delivery_status in('pending','retryable_failure');
end $$;
set constraints all immediate;
do $$
declare old record; v_digest text;
begin
  for old in select * from patch3_baseline loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$s,to_jsonb(t)::text)::text,''[]'')) from %2$s t where %1$s in(select jsonb_array_elements_text($1))',old.identity_expression,old.relation) into v_digest using old.keys;
    -- storage.objects uses the same ordering expression as its snapshot below.
    if old.relation='storage.objects'::regclass then select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) into v_digest from storage.objects t; end if;
    perform pg_temp.patch3_assert(v_digest=old.digest,'every pre-existing application/fixture/history/Storage row unchanged');
  end loop;
  perform pg_temp.patch3_assert((select count(*)=2 and bool_and(t.status='cancelled' and t.terminal_at is not null and not t.registration_enabled) from public.tournaments t join patch3_run f on f.tournament_id=t.id),'only two new cancelled historical fixtures');
  perform pg_temp.patch3_assert((select count(*)=16 and bool_and(registration_status='approved' and registration_provenance='staging_synthetic_uat' and fixture_contract_version='staging-synthetic-v2' and elo_status='manual_review' and elo_verification_source is null and elo_verified_elo is null and waitlist_offer_status is null) from public.registrations where tournament_id in(select tournament_id from patch3_run)),'sixteen synthetic registrations; no invented ELO/offer facts');
  perform pg_temp.patch3_assert((select count(*)=2 from public.match_rooms where id in(select room_id from patch3_run)) and not exists(select 1 from public.assistance_requests where tournament_id in(select tournament_id from patch3_run)),'two empty rooms and no fabricated assistance');
  perform pg_temp.patch3_assert(not exists(select 1 from public.match_result_report_groups where tournament_id in(select tournament_id from patch3_run)) and not exists(select 1 from public.match_replay_upload_attempts where match_id in(select m.id from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id join patch3_run f on f.bracket_id=g.tournament_bracket_id)),'no report/upload attempts manufactured');
  perform pg_temp.patch3_assert(not exists(select 1 from public.notifications where id in(select id from patch3_new_notices) and (push_delivery_status in('pending','retryable_failure','processing') or email_delivery_status in('pending','retryable_failure','processing') or push_claim_token is not null or email_claim_token is not null)),'all new notices retained and nondeliverable before commit');
  perform pg_temp.patch3_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE') and (select count(*)=4 and bool_and(active) from cron.job),'push block and cron preserved');
end $$;
commit;
-- Persist this nonsecret manifest; API runner consumes its exact IDs, never guesses.
select jsonb_build_object('runTag','patch3-staging-assistance-20261103-v1','projectRef','zzbnneprhjicmajpjkdg','committed',true,'tournaments',jsonb_agg(jsonb_build_object('label',label,'tag',tag,'tournamentId',tournament_id,'bracketId',bracket_id,'matchId',match_id,'roomId',room_id,'requesterAlias','TestAcademy1','opponentAlias',opponent_alias) order by label)) as assistance_fixture_manifest from patch3_run;
