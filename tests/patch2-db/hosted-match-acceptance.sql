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
  perform pg_temp.patch2_assert(not has_function_privilege('service_role',
    'public.submit_match_series_result_report(uuid,text,uuid,integer,integer,text[],text[],uuid[],text)', 'EXECUTE'),
    'internal series writer must remain inaccessible to the application service role');
  perform pg_temp.patch2_assert(has_function_privilege('service_role',
    'public.prepare_match_replay_upload_attempt(uuid,text,uuid,integer,integer,integer[],uuid[])', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.claim_match_replay_attempt_finalization(uuid,uuid,text,uuid,integer,integer)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.commit_match_replay_attempt_result(uuid,uuid,uuid,text,text[],text)', 'EXECUTE'),
    'actual replay preparation, claim and commit authorities must remain service-callable');
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
    'public.notifications','public.assistance_requests','public.match_messages','public.match_room_reads','public.match_result_submissions','public.match_result_report_groups','public.match_replay_upload_attempts','public.generated_brackets','public.bracket_rounds','public.coh3_maps','public.tournament_bracket_map_pool_entries',
    'public.tournament_matches','public.match_rooms','public.match_room_assistance',
    'ironclad_private.staging_synthetic_uat_players','ironclad_private.staging_synthetic_uat_enrolments'] loop
    select a.attname into v_key from pg_attribute a
    join pg_index i on i.indrelid=a.attrelid and a.attnum=any(i.indkey)
    where a.attrelid=v_relation::regclass and i.indisprimary order by a.attnum limit 1;
    perform pg_temp.patch2_assert(v_key is not null, 'snapshot relation must have a primary key');
    execute format('select coalesce(jsonb_agg(%1$I::text order by %1$I),''[]''::jsonb), md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I,to_jsonb(t)::text)::text,''[]'')) from %2$s t',v_key,v_relation::regclass)
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

-- DB ENVELOPES ONLY: the real prepare authority allocates .rec references;
-- declared sizes and digest strings are synthetic trusted-server inputs.
-- No Storage objects or bytes exist; no file
-- upload/download, parsing, real file-byte hashing or provider proof is claimed.
do $$
declare
  v_tag text; v_t uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid();
  v_regs uuid[]:=array[]::uuid[]; v_maps uuid[]:=array[]::uuid[]; v_matches uuid[];
  v_id uuid; v_generated uuid; v_i integer; v_assignments jsonb; v_room uuid;
  v_client uuid:=gen_random_uuid(); v_response jsonb; v_message uuid; v_notice uuid;
  v_body text; v_before jsonb; v_after jsonb; v_seq bigint;
  v_one text; v_two text; v_outsider text; v_reporter text; v_opponent text;
  v_paths text[]; v_hashes text[]; v_winners uuid[]; v_report uuid;
  v_attempt uuid; v_claim uuid; v_committed jsonb;
begin
  select tag into strict v_tag from patch2_run;
  perform pg_temp.patch2_assert(ironclad_private.match_room_writes_enabled(),'existing Match Room switch must already be enabled; never change it for this test');
  insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,
    registration_open_at,registration_close_at,start_date,registration_enabled,division_model_version)
  values(v_t,v_tag||' match',v_tag||'-match','1v1','registration_open',v_tag,'','',now()-interval '1 day',now()+interval '1 day',now()+interval '2 days',true,'four_division_v1');
  insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players) values(v_b,v_t,'Academy','0-1099 ELO',8);
  update public.tournaments t set status=t.status where t.id=v_t;
  perform pg_temp.patch2_assert((select registration_enabled and status='registration_open' and division_model_version='four_division_v1' from public.tournaments where id=v_t),'real derived fixture availability');
  for v_i in 1..9 loop perform pg_temp.patch2_player(v_i); end loop;
  for v_i in 1..8 loop
    v_id:=pg_temp.patch2_register(v_i,v_t,v_b); v_regs:=array_append(v_regs,v_id);
    perform * from public.review_tournament_registration_scoped(v_t,v_id,'approved',null);
  end loop;
  for v_i in 1..5 loop
    v_id:=gen_random_uuid(); v_maps:=array_append(v_maps,v_id);
    insert into public.coh3_maps(id,slug,display_name,source_type,creator_name,game_mode,status,admin_note,created_by_clerk_user_id,updated_by_clerk_user_id)
    values(v_id,v_tag||'-map-'||v_i,v_tag||' map '||v_i,'community','Patch2 rollback','1v1','active',v_tag,'patch2-reg-rollback-admin','patch2-reg-rollback-admin');
  end loop;
  perform public.publish_tournament_bracket_map_pools(v_t,array[v_b],v_maps,'patch2-reg-rollback-admin');
  v_generated:=public.generate_tournament_bracket(v_b,'patch2-reg-rollback-admin');
  select jsonb_agg(jsonb_build_object('slot_number',s,'registration_id',v_regs[s]) order by s) into v_assignments from generate_series(1,8) s;
  perform public.save_bracket_assignments(v_generated,v_assignments,'patch2-reg-rollback-admin');
  perform * from public.launch_tournament_division(v_b,'patch2-reg-rollback-admin');
  select array_agg(m.id order by m.match_number) into v_matches from public.tournament_matches m join public.bracket_rounds r on r.id=m.round_id where m.generated_bracket_id=v_generated and r.round_number=1;
  perform pg_temp.patch2_assert(cardinality(v_matches)=4 and (select bool_and(series_best_of=3 and activated_at is not null and deadline_at>clock_timestamp()) from public.tournament_matches where id=any(v_matches)),'current first-round BO3 launch and future matchup deadlines');
  select clerk into strict v_one from patch2_players where n=1;
  select clerk into strict v_two from patch2_players where n=2;
  select clerk into strict v_outsider from patch2_players where n=9;

  -- Real private chat authorities, with fictional SQL-local JWT claims.
  perform pg_temp.patch2_claim('authenticated',v_one);
  v_response:=public.resolve_match_room(v_matches[1]); v_room:=(v_response#>>'{room,id}')::uuid;
  perform pg_temp.patch2_assert(v_room is not null and (v_response#>>'{room,writable}')::boolean,'participant resolves writable private room');
  perform pg_temp.patch2_reject(format('select public.send_match_room_message(%L,%L,%L,''wrong room'')',v_matches[1],gen_random_uuid(),gen_random_uuid()),'42501','unavailable','wrong expected room rejects write');
  v_body:='SYNTHETIC ROLLBACK: Match date 2026-11-03, 19:30 UTC. Confirm the original time.';
  v_response:=public.send_match_room_message(v_matches[1],v_room,v_client,v_body); v_message:=(v_response#>>'{message,id}')::uuid;
  perform pg_temp.patch2_assert(v_response#>>'{message,body}'=v_body and not (v_response->>'duplicate')::boolean,'original message stored exactly');
  v_response:=public.send_match_room_message(v_matches[1],v_room,v_client,v_body);
  perform pg_temp.patch2_assert((v_response->>'duplicate')::boolean and v_response#>>'{message,id}'=v_message::text,'same key and body is idempotent');
  perform pg_temp.patch2_reject(format('select public.send_match_room_message(%L,%L,%L,''changed duplicate'')',v_matches[1],v_room,v_client),'23505','already been used','duplicate key cannot overwrite original');
  perform pg_temp.patch2_claim('authenticated',v_two);
  v_response:=public.get_match_room_history(v_room,0,50);
  perform pg_temp.patch2_assert(jsonb_array_length(v_response->'messages')=1 and not exists(select 1 from public.match_room_reads where room_id=v_room and viewer_clerk_user_id=v_two),'history read does not acknowledge unseen messages');
  perform public.send_match_room_message(v_matches[1],v_room,v_client,'SYNTHETIC opponent reply');
  perform pg_temp.patch2_assert((select count(*)=2 from public.match_messages where room_id=v_room),'opponents may reuse a client key independently');
  perform pg_temp.patch2_claim('authenticated',v_outsider);
  perform pg_temp.patch2_reject(format('select public.get_match_room_history(%L,0,50)',v_room),'42501','unavailable','outsider history denied');
  perform pg_temp.patch2_reject(format('select public.resolve_match_room(%L)',v_matches[1]),'42501','unavailable','outsider room resolution denied');
  perform pg_temp.patch2_reject(format('select public.send_match_room_message(%L,%L,%L,''outsider'')',v_matches[1],v_room,gen_random_uuid()),'42501','unavailable','outsider write denied');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider,'metadata',jsonb_build_object('role','admin'))::text,true);
  perform public.send_admin_match_room_message(v_matches[1],v_room,gen_random_uuid(),'SYNTHETIC admin reply');
  perform pg_temp.patch2_assert((select count(*)=3 and count(*) filter(where sender_kind='admin')=1 from public.match_messages where room_id=v_room),'admin reply retains sender provenance');
  perform pg_temp.patch2_claim('authenticated',v_two);
  select last_sequence into v_seq from public.match_rooms where id=v_room;
  perform public.mark_match_room_read(v_room,v_seq); perform public.mark_match_room_read(v_room,1);
  perform pg_temp.patch2_assert((select last_read_sequence=v_seq from public.match_room_reads where room_id=v_room and viewer_clerk_user_id=v_two),'read cursor is explicit and monotonic');
  perform pg_temp.patch2_reject(format('select public.mark_match_room_read(%L,%s)',v_room,v_seq+1),'22023','ahead','future read cursor rejected');

  -- Current room assistance and scoped inbox operations remain independent.
  select to_jsonb(m) into v_before from public.tournament_matches m where id=v_matches[1];
  perform pg_temp.patch2_claim('authenticated',v_one); perform public.request_match_room_assistance(v_room,0);
  perform pg_temp.patch2_claim('authenticated',v_two); perform public.request_match_room_assistance(v_room,0);
  select notification_id into strict v_notice from public.match_room_assistance where room_id=v_room;
  perform pg_temp.patch2_assert((select status='requested' and request_version=1 from public.match_room_assistance where room_id=v_room) and not exists(select 1 from public.assistance_requests where source_notification_id=v_notice),'both opponents share one modern episode without legacy misclassification');
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  perform public.mutate_admin_notification_inbox('tournament',v_t,'read',array[v_notice]);
  perform public.mutate_admin_notification_inbox('tournament',v_t,'dismiss',array[v_notice]);
  perform pg_temp.patch2_assert((select status='requested' and request_version=1 from public.match_room_assistance where room_id=v_room),'inbox read/dismiss never resolves modern help');
  perform pg_temp.patch2_claim('authenticated',v_outsider);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider,'metadata',jsonb_build_object('role','admin'))::text,true);
  perform public.resolve_match_room_assistance(v_room,1);
  select to_jsonb(m) into v_after from public.tournament_matches m where id=v_matches[1];
  perform pg_temp.patch2_assert(v_before=v_after and (select status='resolved' from public.match_room_assistance where room_id=v_room),'real trusted modern resolution works and never changes match state or deadlines');

  -- Actual service-callable replay prepare/claim/commit database authorities.
  -- Their trusted size/hash inputs deliberately stand in for the server's file
  -- verification step; no bytes are uploaded, verified, parsed or downloaded.
  -- All calls run as the trusted SQL operator with simulated JWT claims above;
  -- effective grants are asserted separately, not presented as signed sessions.
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
  for v_i in 1..3 loop
    select clerk_user_id into v_reporter from public.registrations where id=v_regs[(v_i-1)*2+1];
    select clerk_user_id into v_opponent from public.registrations where id=v_regs[(v_i-1)*2+2];
    v_hashes:=array[encode(sha256(convert_to(v_tag||v_i||'g1','UTF8')),'hex'),encode(sha256(convert_to(v_tag||v_i||'g2','UTF8')),'hex'),encode(sha256(convert_to(v_tag||v_i||'g3','UTF8')),'hex')];
    v_winners:=array[v_regs[(v_i-1)*2+1],v_regs[(v_i-1)*2+2],v_regs[(v_i-1)*2+1]];
    if v_i=1 then
      perform pg_temp.patch2_reject(format('select public.prepare_match_replay_upload_attempt(%L,%L,%L,2,1,array[1024,1024,1024],%L::uuid[])',v_matches[1],v_reporter,v_regs[1],array[v_regs[1],v_regs[1],v_regs[2]]),'P0001','series-clinching','no game may follow a clinching win');
      perform pg_temp.patch2_reject(format('select public.prepare_match_replay_upload_attempt(%L,%L,%L,2,1,array[1024],%L::uuid[])',v_matches[1],v_reporter,v_regs[1],v_winners),'P0001','sizes do not match','missing replay size declarations rejected');
      perform pg_temp.patch2_reject(format('select public.prepare_match_replay_upload_attempt(%L,%L,%L,2,1,array[1024,1024,1024],%L::uuid[])',v_matches[1],v_outsider,v_regs[1],v_winners),'P0001','not a participant','outsider result reporter rejected');
      perform pg_temp.patch2_assert(not exists(select 1 from public.match_result_submissions where match_id=v_matches[1]),'invalid series envelopes are atomic');
    end if;
    v_response:=public.prepare_match_replay_upload_attempt(v_matches[v_i],v_reporter,v_regs[(v_i-1)*2+1],2,1,array[1024,1024,1024],v_winners);
    v_attempt:=(v_response->>'attempt_id')::uuid;
    perform pg_temp.patch2_assert(v_response->>'outcome'='prepared' and v_attempt is not null
      and (v_response->>'required_replay_count')::integer=3, 'real replay preparation allocates the correct own attempt');
    select array_agg(value order by ordinal) into v_paths from jsonb_array_elements_text(v_response->'replay_storage_paths') with ordinality as p(value,ordinal);
    if v_i=1 then
      perform pg_temp.patch2_reject(format('select public.claim_match_replay_attempt_finalization(%L,%L,%L,%L,2,1)',v_attempt,v_matches[1],v_outsider,v_regs[1]),'P0001','does not own','outsider cannot claim another player replay attempt');
      perform pg_temp.patch2_reject(format('select public.claim_match_replay_attempt_finalization(%L,%L,%L,%L,2,0)',v_attempt,v_matches[1],v_reporter,v_regs[1]),'P0001','does not match','claim cannot change the prepared result facts');
    end if;
    v_response:=public.claim_match_replay_attempt_finalization(v_attempt,v_matches[v_i],v_reporter,v_regs[(v_i-1)*2+1],2,1);
    v_claim:=(v_response->>'claim_id')::uuid;
    perform pg_temp.patch2_assert(v_response->>'outcome'='claimed' and v_claim is not null, 'real finalization claim acquired');
    if v_i=1 then
      perform pg_temp.patch2_reject(format('select public.commit_match_replay_attempt_result(%L,%L,%L,%L,%L::text[],null)',v_attempt,gen_random_uuid(),v_matches[1],v_reporter,v_hashes),'P0001','no longer owns','wrong finalization claim cannot commit');
      perform pg_temp.patch2_reject(format('select public.commit_match_replay_attempt_result(%L,%L,%L,%L,%L::text[],null)',v_attempt,v_claim,v_matches[1],v_reporter,array[v_hashes[1],v_hashes[1],v_hashes[3]]),'P0001','unique replay','duplicate replay envelope hashes rejected');
      perform pg_temp.patch2_assert(not exists(select 1 from public.match_result_submissions where match_id=v_matches[1])
        and (select status='finalizing' and finalization_claim_id=v_claim from public.match_replay_upload_attempts where id=v_attempt), 'failed commits preserve retryable own claim without partial result evidence');
    end if;
    v_response:=public.commit_match_replay_attempt_result(v_attempt,v_claim,v_matches[v_i],v_reporter,v_hashes,'SYNTHETIC DB-ONLY REFERENCES; no replay bytes exist.');
    v_committed:=public.commit_match_replay_attempt_result(v_attempt,v_claim,v_matches[v_i],v_reporter,v_hashes,'SYNTHETIC retry');
    perform pg_temp.patch2_assert(v_committed=v_response and (select status='committed' and finalization_claim_id is null
      and finalization_lease_expires_at is null and committed_result=v_response from public.match_replay_upload_attempts where id=v_attempt), 'commit retry returns one authoritative result and releases its lease');
    v_report:=(v_response->>'report_group_id')::uuid;
    perform pg_temp.patch2_assert((select count(*)=3 and array_agg(game_number order by game_number)=array[1,2,3] and array_agg(claimed_winner_registration_id order by game_number)=v_winners and count(distinct replay_content_hash)=3
      and array_agg(replay_storage_path order by game_number)=v_paths from public.match_result_submissions where report_group_id=v_report),'real commit preserves game order, individual winners and unique envelope digests/allocated references');
    perform pg_temp.patch2_assert((select status='pending_confirmation' and finalized_at is null from public.match_result_report_groups where id=v_report) and (select winner_registration_id is null from public.tournament_matches where id=v_matches[v_i]),'series report waits for opponent and does not invent official winner');
    if v_i=1 then
      perform pg_temp.patch2_reject(format('select public.confirm_match_result_report_group_api(%L,%L)',v_report,v_reporter),'P0001','Only the opponent','reporter cannot confirm own result');
      perform public.confirm_match_result_report_group_api(v_report,v_opponent);
      perform pg_temp.patch2_assert((select status='completed' and winner_registration_id=v_regs[1] and player_one_score=2 and player_two_score=1 from public.tournament_matches where id=v_matches[1]) and (select finalized_source='opponent_confirmation' and finalized_at is not null from public.match_result_report_groups where id=v_report),'opponent confirmation finalizes intended official score');
      perform pg_temp.patch2_reject(format('select public.confirm_match_result_report_group_api(%L,%L)',v_report,v_opponent),'PT409','no longer awaiting','repeat confirmation cannot finalize twice');
    elsif v_i=2 then
      perform pg_temp.patch2_reject(format('select public.dispute_match_result_report_group_api(%L,%L,''outsider'')',v_report,v_outsider),'P0001','Only the opponent','outsider cannot dispute');
      perform public.dispute_match_result_report_group_api(v_report,v_opponent,'SYNTHETIC dispute of DB-only evidence');
      perform pg_temp.patch2_assert((select status='disputed' and finalized_at is null and dispute_notes is not null from public.match_result_report_groups where id=v_report) and (select winner_registration_id is null from public.tournament_matches where id=v_matches[2]),'opponent dispute leaves official authority unresolved');
    else
      -- Explicit own historical-window fixture. No global clock changes, sleeps
      -- or cron invocation. Only this new report's deadline is prepared as past.
      update public.match_result_report_groups set confirmation_deadline_at=now()-interval '1 second' where id=v_report;
      perform pg_temp.patch2_reject(format('select public.confirm_match_result_report_group_api(%L,%L)',v_report,v_opponent),'P0001','window has expired','expired confirmation denied');
      perform pg_temp.patch2_reject(format('select public.dispute_match_result_report_group_api(%L,%L,''expired'')',v_report,v_opponent),'P0001','window has expired','expired dispute denied');
      perform pg_temp.patch2_assert((select status='pending_confirmation' and finalized_at is null from public.match_result_report_groups where id=v_report),'expired commands leave report unresolved');
    end if;
  end loop;

  -- Existing legacy per-game compatibility LIMITATION, not the current app
  -- reporting path. There are no app/lib callers of submit_match_game_result;
  -- the current app uses the prepare/claim/verify/commit flow tested above.
  -- This old writer changes the match to pending_review after game 1. The
  -- existing deadline/launch INSERT guard requires in_progress and therefore
  -- rejects game 2. Preserve and explicitly report that pre-existing behaviour;
  -- do not reset the match, disable its trigger, or claim legacy full-series
  -- compatibility. Both authority definitions predate these Patch2 changes.
  perform pg_temp.patch2_reject(format('select public.submit_match_game_result(%L,%L,2,%L,''patch2-db-only/g2.rec'',null,null)',v_matches[4],(select clerk from patch2_players where n=7),v_regs[7]),'P0001','series order','legacy game 2 cannot precede game 1');
  perform public.submit_match_game_result(v_matches[4],(select clerk from patch2_players where n=7),1,v_regs[7],'patch2-db-only/g1.rec',null,'SYNTHETIC legacy DB-only reference');
  perform pg_temp.patch2_reject(format('select public.submit_match_game_result(%L,%L,1,%L,''patch2-db-only/repeated.rec'',null,null)',v_matches[4],(select clerk from patch2_players where n=7),v_regs[7]),'P0001','series order','legacy duplicate game number rejected');
  perform pg_temp.patch2_assert((select status='pending_review' and winner_registration_id is null from public.tournament_matches where id=v_matches[4]),'old per-game writer leaves game 1 pending review');
  perform pg_temp.patch2_reject(format('select public.submit_match_game_result(%L,%L,2,%L,''patch2-db-only/g2.rec'',null,null)',v_matches[4],(select clerk from patch2_players where n=7),v_regs[7]),'P0001','not currently actionable','existing launch/deadline guard blocks old per-game writer after pending-review transition');
  perform pg_temp.patch2_assert((select count(*)=1 and min(game_number)=1 and bool_and(status='pending') from public.match_result_submissions where match_id=v_matches[4])
    and (select status='pending_review' and winner_registration_id is null and official_result_submission_id is null from public.tournament_matches where id=v_matches[4]),'rejected legacy game 2 is atomic and cannot invent an official result');
  perform pg_temp.patch2_claim('authenticated',v_one);
  v_response:=public.get_match_room_history(v_room,0,50);
  perform pg_temp.patch2_assert(jsonb_array_length(v_response->'messages')=3 and not (v_response#>>'{room,writable}')::boolean,'completed room retains original private history as read-only');
  perform pg_temp.patch2_reject(format('select public.send_match_room_message(%L,%L,%L,''after completion'')',v_matches[1],v_room,gen_random_uuid()),'55000','read-only','completed room rejects new writes');
  perform pg_temp.patch2_claim('service_role','patch2-reg-rollback-admin');
end;
$$;
set constraints all immediate;
do $$
declare v_baseline record; v_digest text;
begin
  for v_baseline in select * from patch2_existing_rows loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I,to_jsonb(t)::text)::text,''[]'')) from %2$s t where %1$I::text in (select jsonb_array_elements_text($1))',v_baseline.key_column,v_baseline.relation)
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
select jsonb_build_object('patch2HostedMatchDatabaseAssertionsPassed',true,'transactionRolledBack',true,
  'target','zzbnneprhjicmajpjkdg','fixturesPersisted',false,
  'existingLegacyLimitation','The unused old per-game writer moves game 1 to pending_review, so the existing actionable-match insert guard rejects game 2. This limitation is asserted and not changed; full legacy per-game series compatibility is not claimed.',
  'limits','Real SQL chat access, message idempotency, read state, modern assistance, current replay-attempt chronological result envelopes, confirmation/dispute/deadline guards and the existing legacy pending-review rejection only. No Clerk JWT signature, browser, realtime delivery, replay bytes, file-byte hashes, Storage upload/download, or provider acceptance is claimed.') as acceptance_result;
