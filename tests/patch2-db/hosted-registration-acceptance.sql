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
    'public.tournament_brackets','public.registrations','public.registration_acceptances','public.account_legal_acceptances',
    'public.notifications','public.assistance_requests','public.generated_brackets','public.bracket_rounds','public.coh3_maps','public.tournament_bracket_map_pool_entries',
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

-- Additional registration acceptance. Upstream Relic/Steam facts and legal
-- acknowledgements below are explicitly SYNTHETIC trusted-server test inputs.
-- No external lookup, verified human identity or real user consent is claimed.
-- They exist only inside this rollback transaction. Existing Effective legal
-- documents are read/referenced without alteration. Permanent Test* UAT users,
-- fixture provenance registries and their prepared contracts remain untouched.

create temporary table patch2_run(tag text not null) on commit drop;
insert into patch2_run values('patch2-reg-rollback-' || gen_random_uuid()::text);
create temporary table patch2_players(n integer primary key,id uuid not null,clerk text not null,steam text not null) on commit drop;

create function pg_temp.patch2_claim(p_role text,p_sub text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role',p_role,true);
  perform set_config('request.jwt.claim.sub',p_sub,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role',p_role,'sub',p_sub,'metadata',jsonb_build_object('role',case when p_role='service_role' then 'admin' else 'player' end))::text,true);
end;
$$;

create function pg_temp.patch2_reject(p_sql text,p_state text,p_fragment text,p_label text)
returns void language plpgsql as $$
declare v_state text; v_message text; v_failed boolean := false;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    v_failed:=true;
  end;
  perform pg_temp.patch2_assert(v_failed and v_state=p_state and strpos(lower(v_message),lower(p_fragment))>0,p_label);
end;
$$;

create function pg_temp.patch2_player(p_n integer)
returns void language plpgsql as $$
declare v_tag text; v_clerk text; v_steam text; v_id uuid:=gen_random_uuid();
  v_terms uuid; v_privacy uuid; v_acceptances integer;
begin
  select tag into strict v_tag from patch2_run;
  v_clerk:=v_tag || '-p' || p_n;
  -- An unmistakably synthetic numeric identifier, never sent to Steam.
  v_steam:=(90000000000000000::numeric + (('x'||substr(md5(v_tag),1,8))::bit(32)::bigint % 1000000)*100+p_n)::text;
  -- The real Steam/profile trigger derives completion and requires a nonblank
  -- avatar label. This synthetic label creates/fetches no Storage object.
  insert into public.players(id,clerk_user_id,display_name,in_game_name,steam_username,steam_id64,country,region,timezone,avatar_url,public_profile_enabled)
  values(v_id,v_clerk,'Patch2 rollback '||p_n,'Patch2 rollback '||p_n,'Patch2 synthetic',v_steam,'AU','OCE','Australia/Sydney','/patch2-rollback-fixture-avatar.png',false);
  perform pg_temp.patch2_assert((select profile_completed and steam_id64=v_steam from public.players where id=v_id),
    'synthetic player satisfies the real derived profile/Steam identity prerequisites');
  -- Explicitly SYNTHETIC account acknowledgements for this fictional identity.
  -- Registration's four-document acceptance is a separate invariant and does
  -- not satisfy the member-RPC current-account gate. Exercise its REAL writer;
  -- never disable the gate or insert a partial hand-written acceptance row.
  select id into strict v_terms from public.legal_documents where document_kind='terms'
    and status='effective' and published_at<=clock_timestamp() and effective_at<=clock_timestamp() and sha256 is not null;
  select id into strict v_privacy from public.legal_documents where document_kind='privacy'
    and status='effective' and published_at<=clock_timestamp() and effective_at<=clock_timestamp() and sha256 is not null;
  select count(*) into v_acceptances from public.accept_current_account_legal_documents(v_clerk,v_terms,v_privacy,true,true);
  perform pg_temp.patch2_assert(v_acceptances=1 and exists(select 1 from public.account_legal_acceptances
    where clerk_user_id=v_clerk and terms_document_id=v_terms and privacy_document_id=v_privacy
      and terms_accepted and privacy_acknowledged), 'fictional player has the exact current account document pair');
  insert into patch2_players values(p_n,v_id,v_clerk,v_steam);
end;
$$;

create function pg_temp.patch2_register(p_n integer,p_t uuid,p_b uuid,p_elo bigint default 700,p_division text default 'Academy',p_wait boolean default false)
returns uuid language plpgsql as $$
declare v_p record; v_rulebook uuid; v_ppa uuid; v_terms uuid; v_privacy uuid; v_result record;
begin
  select * into strict v_p from patch2_players where n=p_n;
  perform pg_temp.patch2_assert(auth.role()='service_role' and exists(
    select 1 from public.players p where p.id=v_p.id and p.clerk_user_id=v_p.clerk
      and p.steam_id64=v_p.steam and p.profile_completed and p.account_closed_at is null),
    'trusted fixture identity must satisfy the actual submission prerequisites');
  select id into strict v_rulebook from public.legal_documents where document_kind='rulebook' and status='effective' and effective_at<=clock_timestamp() and sha256 is not null;
  select id into strict v_ppa from public.legal_documents where document_kind='ppa' and status='effective' and effective_at<=clock_timestamp() and sha256 is not null;
  select id into strict v_terms from public.legal_documents where document_kind='terms' and status='effective' and effective_at<=clock_timestamp() and sha256 is not null;
  select id into strict v_privacy from public.legal_documents where document_kind='privacy' and status='effective' and effective_at<=clock_timestamp() and sha256 is not null;
  select * into strict v_result from public.submit_verified_player_registration(v_p.id,v_p.clerk,v_p.steam,p_t,p_b,p_elo,'US Forces',p_division,'relic-highest-1v1-v2',v_rulebook,v_ppa,v_terms,v_privacy,true,true,true,true,true,true,p_wait);
  return v_result.id;
end;
$$;

select pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');

do $$
declare
  v_tag text; v_t uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_b uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_r uuid[]:=array[]::uuid[]; v_other uuid; v_expired uuid:=gen_random_uuid();
  v_launch_regs uuid[]:=array[]::uuid[]; v_maps uuid[]:=array[]::uuid[];
  v_i integer; v_id uuid; v_generated uuid; v_p record; v_counts jsonb; v_bulk_count integer;
  v_before jsonb; v_after jsonb; v_assignments jsonb; v_changed integer;
begin
  select tag into strict v_tag from patch2_run;
  -- These are direct synthetic historical scope snapshots. Creation/editor
  -- ranked-cycle policy is not under test: save_tournament would intentionally
  -- reject several simultaneously unresolved Academy events. Registration,
  -- review, eligibility, waitlist and launch guards remain enabled throughout.
  for v_i in 1..4 loop
    insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,
      registration_open_at,registration_close_at,start_date,registration_enabled,division_model_version)
    values(v_t[v_i],v_tag||' '||v_i,v_tag||'-'||v_i,'1v1','registration_open',v_tag,'','',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',true,'four_division_v1');
    insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players)
    values(v_b[v_i],v_t[v_i],'Academy','0-1099 ELO',8);
    -- Mirror the EXACT final derivation in the current save_tournament RPC.
    -- INSERT's status trigger cannot see brackets not yet inserted, so it
    -- correctly derives registration_enabled=false until this lifecycle pass.
    update public.tournaments t set status=t.status where t.id=v_t[v_i];
  end loop;
  perform pg_temp.patch2_assert(auth.role()='service_role' and (
    select count(*)=4 and bool_and(t.format='1v1' and t.status='registration_open'
      and t.registration_enabled and t.terminal_at is null
      and t.division_model_version='four_division_v1'
      and t.registration_open_at<=clock_timestamp() and t.registration_close_at>clock_timestamp()
      and t.registration_close_at<=t.start_date
      and b.name='Academy' and b.elo_rules='0-1099 ELO' and b.max_players=8 and b.launched_at is null
      and not exists(select 1 from public.tournament_division_not_held_closures c where c.tournament_bracket_id=b.id))
    from public.tournaments t join public.tournament_brackets b on b.tournament_id=t.id
    where t.id=any(v_t) and b.id=any(v_b)),
    'all actual tournament/model/division/window/closure availability prerequisites hold before submission');
  perform pg_temp.patch2_assert((select count(*)=4 and count(distinct document_kind)=4
    from public.legal_documents where document_kind in ('rulebook','ppa','terms','privacy')
      and status='effective' and effective_at<=clock_timestamp() and sha256 is not null
      and (document_kind not in ('terms','privacy') or published_at<=clock_timestamp())),
    'one current hashed Effective document per legal kind is required before submission');
  for v_i in 1..14 loop perform pg_temp.patch2_player(v_i); end loop;
  for v_i in 1..8 loop v_r:=array_append(v_r,pg_temp.patch2_register(v_i,v_t[1],v_b[1])); end loop;
  perform pg_temp.patch2_assert((select active_cohort_players=8 and offered_reservations=0 from public.get_tournament_bracket_capacity() where bracket_id=v_b[1]),'actual eight-player active capacity');
  perform pg_temp.patch2_assert(pg_temp.patch2_register(9,v_t[1],v_b[1],700,'Academy',false) is null
    and not exists(select 1 from public.registrations where tournament_id=v_t[1] and clerk_user_id=(select clerk from patch2_players where n=9)), 'full cohort requires confirmation without saving a registration');
  for v_i in 9..11 loop v_r:=array_append(v_r,pg_temp.patch2_register(v_i,v_t[1],v_b[1],700,'Academy',true)); end loop;
  perform pg_temp.patch2_assert((select active_cohort_players=8 and waitlisted_players=3 from public.get_tournament_bracket_capacity() where bracket_id=v_b[1]),'confirmed waitlist never exceeds active capacity');
  v_other:=pg_temp.patch2_register(1,v_t[2],v_b[2]);
  perform pg_temp.patch2_assert(v_other is not null and (select count(*)=2 from public.registrations where clerk_user_id=(select clerk from patch2_players where n=1) and tournament_id=any(v_t[1:2])),'same player registers independently in two tournaments');
  perform pg_temp.patch2_reject(format('select pg_temp.patch2_register(1,%L,%L)',v_t[1],v_b[1]),'23505','Already registered','one registration per player per tournament');
  perform pg_temp.patch2_reject(format('select pg_temp.patch2_register(12,%L,%L,1200,''Challenge'',false)',v_t[1],v_b[1]),'P0001','selected tournament division','actual verified ELO rejects the wrong division');
  perform pg_temp.patch2_assert(not exists(select 1 from public.registrations where profile_id=(select id from patch2_players where n=12)),'failed ELO submission creates no registration or consent');

  -- Canonical legacy signature and new scoped wrappers coexist. Null notes retain
  -- history; an empty note deliberately clears it, matching the real authority.
  perform * from public.review_tournament_registration(v_r[1],'manual_review','rollback retained note');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[1],'manual_review',null);
  perform pg_temp.patch2_assert((select admin_notes='rollback retained note' from public.registrations where id=v_r[1]),'old review signature and scoped note retention coexist');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[2],'approved','');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[3],'rejected','rollback rejection');
  perform pg_temp.patch2_claim('authenticated',(select clerk from patch2_players where n=4));
  perform * from public.withdraw_tournament_registration(v_r[4]);
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  select jsonb_object_agg(registration_status,n) into v_counts from
    (select registration_status,count(*)::int n from public.registrations where tournament_id=v_t[1] group by registration_status) s;
  perform pg_temp.patch2_assert(v_counts='{"pending":4,"manual_review":1,"approved":1,"rejected":1,"withdrawn":1,"waitlisted":3}'::jsonb,'all six statuses remain associated with the selected tournament');
  perform pg_temp.patch2_assert((select registration_status='pending' from public.registrations where id=v_other),'same player in other tournament remains pending');
  perform pg_temp.patch2_assert((select waitlist_offer_status='offered' and waitlist_offer_expires_at=waitlist_offer_created_at+interval '24 hours' from public.registrations where id=v_r[9])
    and (select waitlist_offer_status='offered' from public.registrations where id=v_r[10])
    and (select waitlist_offer_status is null from public.registrations where id=v_r[11]),'rejection and withdrawal offer vacancies in real FIFO order');
  select jsonb_agg(to_jsonb(r) order by id) into v_before from public.registrations r where id=any(array[v_r[5],v_other]);
  perform pg_temp.patch2_reject(format('select * from public.approve_tournament_registrations_scoped(%L,array[%L::uuid,%L::uuid])',v_t[1],v_r[5],v_other),'22023','selected tournament','forged mixed bulk selection rejected');
  select jsonb_agg(to_jsonb(r) order by id) into v_after from public.registrations r where id=any(array[v_r[5],v_other]);
  perform pg_temp.patch2_assert(v_before=v_after,'mixed registration bulk action is atomic');
  perform pg_temp.patch2_reject(format('select * from public.review_tournament_registration_scoped(%L,%L,''approved'',null)',v_t[1],v_other),'22023','selected tournament','individual cross-tournament action denied');
  select count(*) into v_bulk_count from public.approve_tournament_registrations_scoped(v_t[1],array[v_r[5],v_r[6]]) where error_message is null;
  perform pg_temp.patch2_assert(v_bulk_count=2 and (select bool_and(registration_status='approved') from public.registrations where id=any(array[v_r[5],v_r[6]])),'valid scoped bulk approval delegates to real authority');
  perform pg_temp.patch2_reject(format('select * from public.review_tournament_registration_scoped(%L,%L,''withdrawn'',null)',v_t[1],v_r[7]),'P0001','Only the player','admin cannot manufacture a player withdrawal');
  perform pg_temp.patch2_reject(format('select * from public.review_tournament_registration_scoped(%L,%L,''approved'',null)',v_t[1],v_r[9]),'P0001','accept an offer','admin cannot skip an offered waitlist position');

  perform pg_temp.patch2_claim('authenticated',(select clerk from patch2_players where n=9));
  perform * from public.respond_to_waitlist_offer(v_r[9],'accept');
  perform pg_temp.patch2_claim('authenticated',(select clerk from patch2_players where n=10));
  perform * from public.respond_to_waitlist_offer(v_r[10],'decline');
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  perform pg_temp.patch2_assert((select registration_status='pending' and waitlist_offer_status='accepted' from public.registrations where id=v_r[9])
    and (select waitlist_offer_status='declined' from public.registrations where id=v_r[10])
    and (select waitlist_offer_status='offered' from public.registrations where id=v_r[11]),'acceptance enters review and decline offers the next FIFO player');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[11],'rejected','rollback reject offered');
  perform pg_temp.patch2_assert((select registration_status='rejected' and waitlist_offer_status='cancelled' and waitlist_offer_resolved_at is not null from public.registrations where id=v_r[11]),'rejecting an offered registration cancels only its own offer');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[3],'pending',null);
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[3],'rejected',null);
  perform pg_temp.patch2_assert((select admin_notes='rollback rejection' and registration_status='rejected' from public.registrations where id=v_r[3]),'prelaunch rejected registration can be reviewed again without erasing history');
  perform * from public.review_tournament_registration_scoped(v_t[1],v_r[4],'withdrawn','rollback note on final withdrawal');
  perform pg_temp.patch2_reject(format('select * from public.review_tournament_registration_scoped(%L,%L,''pending'',null)',v_t[1],v_r[4]),'P0001','withdrawn registration is final','withdrawal cannot be reopened');

  -- No clock override or immutable-deadline edits. Insert ONE test-owned expired
  -- snapshot plus matching legal evidence, with every actual guard enabled.
  -- The global expiry authority is called ONLY if no pre-existing eligible row
  -- exists in this repeatable-read snapshot, and batch size is exactly one.
  select * into strict v_p from patch2_players where n=13;
  -- Historical synthetic fixture preparation: this transaction-local consent
  -- setting is also set by the real submission RPC. It permits the explicit
  -- test-owned waitlist INSERT; it does not disable any trigger or guard.
  perform set_config('ironclad.waitlist_confirmed','on',true);
  insert into public.registrations select (jsonb_populate_record(null::public.registrations,to_jsonb(r)||jsonb_build_object(
    'id',v_expired,'profile_id',v_p.id,'clerk_user_id',v_p.clerk,'player_name','Patch2 rollback expiry',
    'tournament_id',v_t[3],'tournament_bracket_id',v_b[3],'tournament_title',v_tag||' 3','registration_status','waitlisted',
    'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'waitlist_offer_status','offered',
    'waitlist_offer_created_at',now()-interval '25 hours','waitlist_offer_expires_at',now()-interval '1 hour',
    'waitlist_offer_resolved_at',null,'withdrawn_at',null,'admin_notes',v_tag))).*
    from public.registrations r where id=v_r[1];
  insert into public.registration_acceptances select (jsonb_populate_record(null::public.registration_acceptances,to_jsonb(a)||jsonb_build_object(
    'id',gen_random_uuid(),'registration_id',v_expired,'tournament_id',v_t[3],'clerk_user_id',v_p.clerk,'accepted_at',clock_timestamp()))).*
    from public.registration_acceptances a where registration_id=v_r[1];
  perform pg_temp.patch2_claim('authenticated',v_p.clerk);
  perform pg_temp.patch2_reject(format('select * from public.respond_to_waitlist_offer(%L,''accept'')',v_expired),'P0001','expired','expired offer cannot be accepted');
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  perform pg_temp.patch2_assert(not exists(select 1 from public.registrations r join public.tournament_brackets b on b.id=r.tournament_bracket_id
    where r.registration_status='waitlisted' and r.waitlist_offer_status='offered' and r.waitlist_offer_expires_at<=now() and b.launched_at is null and r.id<>v_expired),
    'refuse global expiry if any other existing row could be selected');
  v_changed:=public.process_expired_waitlist_offers(1);
  perform pg_temp.patch2_assert(v_changed=1 and (select registration_status='waitlisted' and waitlist_offer_status='expired' and waitlist_offer_resolved_at is not null from public.registrations where id=v_expired),'real global expiry processes only the isolated owned offer');
  update public.tournaments set registration_close_at=now()-interval '1 hour' where id=v_t[3];
  perform pg_temp.patch2_reject(format('select pg_temp.patch2_register(14,%L,%L)',v_t[3],v_b[3]),'P0001','not available','real submission respects a closed registration window');

  -- Full real launch uses only new private players, new catalogue map rows and
  -- new bracket rows. No existing maps, matches, rooms or assets are modified.
  for v_i in 20..27 loop
    perform pg_temp.patch2_player(v_i);
    v_id:=pg_temp.patch2_register(v_i,v_t[4],v_b[4]); v_launch_regs:=array_append(v_launch_regs,v_id);
    perform * from public.review_tournament_registration_scoped(v_t[4],v_id,'approved',null);
  end loop;
  for v_i in 1..5 loop
    v_id:=gen_random_uuid(); v_maps:=array_append(v_maps,v_id);
    insert into public.coh3_maps(id,slug,display_name,source_type,creator_name,game_mode,status,admin_note,created_by_clerk_user_id,updated_by_clerk_user_id)
    values(v_id,v_tag||'-map-'||v_i,v_tag||' map '||v_i,'community','Patch2 rollback','1v1','active',v_tag,'patch2-reg-rollback-admin','patch2-reg-rollback-admin');
  end loop;
  perform public.publish_tournament_bracket_map_pools(v_t[4],array[v_b[4]],v_maps,'patch2-reg-rollback-admin');
  v_generated:=public.generate_tournament_bracket(v_b[4],'patch2-reg-rollback-admin');
  select jsonb_agg(jsonb_build_object('slot_number',s,'registration_id',v_launch_regs[s]) order by s) into v_assignments from generate_series(1,8) s;
  perform public.save_bracket_assignments(v_generated,v_assignments,'patch2-reg-rollback-admin');
  perform * from public.launch_tournament_division(v_b[4],'patch2-reg-rollback-admin');
  perform pg_temp.patch2_assert(public.is_tournament_bracket_roster_locked(v_b[4]) and (select launched_at is not null from public.tournament_brackets where id=v_b[4]),'full real launch locks the approved roster');
  perform pg_temp.patch2_assert((select count(*)=4 from public.tournament_matches m join public.bracket_rounds r on r.id=m.round_id where m.generated_bracket_id=v_generated and r.round_number=1 and m.activated_at is not null and m.deadline_at>m.activated_at),'real launch activates first-round match deadlines');
  perform pg_temp.patch2_reject(format('select * from public.review_tournament_registration_scoped(%L,%L,''rejected'',null)',v_t[4],v_launch_regs[1]),'P0001','division has launched','launched roster review is blocked');
  perform pg_temp.patch2_reject(format('select public.generate_tournament_bracket(%L,''patch2-reg-rollback-admin'')',v_b[4]),'P0001','cannot be regenerated','launched bracket regeneration is blocked');
  perform pg_temp.patch2_claim('authenticated',(select clerk from patch2_players where n=20));
  perform pg_temp.patch2_reject(format('select * from public.withdraw_tournament_registration(%L)',v_launch_regs[1]),'P0001','division has launched','launched player withdrawal is blocked');
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  perform pg_temp.patch2_assert((select registration_status='pending' from public.registrations where id=v_other),'other tournament still unchanged after all real authorities');
end;
$$;
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
select jsonb_build_object('patch2HostedRegistrationAssertionsPassed',true,'transactionRolledBack',true,
  'target','zzbnneprhjicmajpjkdg','fixturesPersisted',false,
  'limits','Real DB capacity, ELO, FIFO, offer expiry, review, withdrawal, launch and deadline activation assertions only. No Clerk signature, provider verification, browser draft, chat delivery, sequential result, confirmation/dispute or replay Storage acceptance is claimed.') as acceptance_result;
