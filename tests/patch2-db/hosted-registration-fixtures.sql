-- ROOT-REVIEWED EXECUTION ONLY: this script COMMITS additive Staging fixtures.
-- Target ONLY zzbnneprhjicmajpjkdg. Send the WHOLE file with stop-on-error.
-- This is NOT a migration or a Production script. No new Clerk identities,
-- sessions, roles, provider claims, consent records, Storage objects or timers.
-- Uses only existing approved synthetic players through their real enrolment
-- authority. The Vault fixture secret stays inside SQL and is NEVER returned.
-- Root independently verified Staging email mode disabled at 03:24:44 UTC below;
-- that is an operator attestation, NOT a database setting or runtime probe.
-- After its 30-minute freshness window, root must reverify and review a new
-- timestamp before execution. Push claim denial is checked inside SQL as well.
-- Exact owned inbox A/B are opened ONLY inside this uncommitted transaction,
-- then restored to Upcoming/disabled. Existing partner/player/registry rows,
-- old registrations, notices and assistance cases must remain byte-identical.

begin isolation level repeatable read;
set local lock_timeout = '2s';
set local statement_timeout = '90s';
set local idle_in_transaction_session_timeout = '2min';
set local client_min_messages = warning;

create function pg_temp.patch2_fixture_assert(p_ok boolean,p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'Patch2 registration fixture precondition failed: %',p_label;
  end if;
end;
$$;

create temporary table patch2_fixture_run(
  tag text not null, a uuid not null, b uuid not null
) on commit drop;
insert into patch2_fixture_run values('patch2-staging-registration-20261102-c7bf6a3-v1',
  'a5e1146d-883b-4d96-9840-fa9abd6a3120','e1e8689b-1b17-4e5e-b229-c0abca00135a');
create temporary table patch2_fixture_brackets(
  tournament_id uuid, name text, id uuid not null, primary key(tournament_id,name)
) on commit drop;
create temporary table patch2_fixture_registrations(
  alias text, tournament_id uuid, player_id uuid not null, registration_id uuid not null,
  primary key(alias,tournament_id)
) on commit drop;
create temporary table patch2_fixture_notifications(id uuid primary key) on commit drop;
create temporary table patch2_fixture_original_tournaments(id uuid primary key, row_data jsonb not null) on commit drop;
create temporary table patch2_fixture_baseline(
  relation regclass primary key,key_column text not null,keys jsonb not null,digest text not null
) on commit drop;

do $$
declare
  v_verified_email_disabled_at constant timestamptz := '2026-11-02T03:24:44Z';
  v_a uuid; v_b uuid; v_tag text; v_relation text; v_key text; v_keys jsonb; v_digest text;
begin
  select a,b,tag into strict v_a,v_b,v_tag from patch2_fixture_run;
  perform pg_temp.patch2_fixture_assert(current_user='postgres','trusted SQL operator only');
  perform pg_temp.patch2_fixture_assert(clock_timestamp() between v_verified_email_disabled_at
    and v_verified_email_disabled_at+interval '30 minutes','fresh root verification of disabled Staging email required');
  perform pg_temp.patch2_fixture_assert((select count(*)=1 and bool_and(btrim(decrypted_secret)=
    'https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email')
    from vault.decrypted_secrets where name='ironclad_transactional_email_worker_url'),
    'exact independently verified Staging dispatcher fingerprint');
  perform pg_temp.patch2_fixture_assert(to_regclass('ironclad_private.staging_synthetic_uat_players') is not null
    and to_regprocedure('public.review_tournament_registration_scoped(uuid,uuid,text,text)') is not null,
    'existing approved fixture contract and Patch2 authority required');
  perform pg_temp.patch2_fixture_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE')
    and not has_function_privilege('anon','public.claim_web_push_notifications(integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.claim_web_push_notifications(integer)','EXECUTE')
    and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='public.claim_web_push_notifications(integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
    and has_function_privilege('service_role','public.complete_web_push_notification(uuid,uuid,text,text)','EXECUTE'),
    'push claim remains permission-blocked, with completion preserved');
  perform pg_temp.patch2_fixture_assert((select encode(sha256(convert_to(prosrc,'UTF8')),'hex')=
    '5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115'
    from pg_proc where oid='public.claim_web_push_notifications(integer)'::regprocedure),'unchanged push claim authority');
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.notifications
    where push_delivery_status='processing' or email_delivery_status='processing'
      or push_claim_token is not null or email_claim_token is not null),'root worker-drain prerequisite');
  -- Lock only these two owned fixtures. No new alias/Clerk record is provisioned.
  perform 1 from public.tournaments where id in (v_a,v_b) order by id for update;
  perform pg_temp.patch2_fixture_assert((select count(*)=2 and bool_and(status='upcoming' and not registration_enabled
    and division_model_version='four_division_v1' and registration_open_at is null and registration_close_at is null
    and start_date is null and end_date is null and grand_final_at is null and terminal_at is null
    and ((id=v_a and slug='patch2-staging-20261102-c7bf6a3-race-v1-a' and title='Patch 2 synthetic inbox A')
      or (id=v_b and slug='patch2-staging-20261102-c7bf6a3-race-v1-b' and title='Patch 2 synthetic inbox B')))
    from public.tournaments where id in (v_a,v_b)),'exact unchanged owned A/B identity and disabled/no-date state');
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.tournament_brackets where tournament_id in (v_a,v_b))
    and not exists(select 1 from public.registrations where tournament_id in (v_a,v_b))
    and not exists(select 1 from public.registrations where admin_notes like '%'||v_tag||'%'),
    'fixture run must be new; reuse its manifest after a successful commit');
  insert into patch2_fixture_original_tournaments select id,to_jsonb(t) from public.tournaments t where id in (v_a,v_b);
  -- Capture every pre-existing row in the affected identity/history/notification
  -- boundaries. Digests remain server-side; no private row content is returned.
  foreach v_relation in array array['public.players','public.tournaments','public.registrations','public.registration_acceptances',
    'public.account_legal_acceptances','public.notifications','public.assistance_requests','public.tournament_brackets',
    'public.generated_brackets','public.tournament_matches','public.match_rooms','public.match_room_assistance',
    'ironclad_private.staging_synthetic_uat_players','ironclad_private.staging_synthetic_uat_enrolments'] loop
    select a.attname into v_key from pg_attribute a join pg_index i on i.indrelid=a.attrelid and a.attnum=any(i.indkey)
      where a.attrelid=v_relation::regclass and i.indisprimary order by a.attnum limit 1;
    perform pg_temp.patch2_fixture_assert(v_key is not null,'baseline relation primary key required');
    execute format('select coalesce(jsonb_agg(%1$I::text order by %1$I),''[]''::jsonb),md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I,to_jsonb(t)::text)::text,''[]'')) from %2$s t',v_key,v_relation::regclass)
      ||case when v_relation='public.tournaments' then format(' where t.id not in (%L::uuid,%L::uuid)',v_a,v_b) else '' end
      into v_keys,v_digest;
    insert into patch2_fixture_baseline values(v_relation::regclass,v_key,v_keys,v_digest);
  end loop;
end;
$$;

do $$
declare
  v_tag text; v_a uuid; v_b uuid; v_t uuid; v_id uuid; v_bracket uuid; v_alias text; v_name text;
  v_secret text; v_i integer; v_result record; v_counts jsonb;
  v_aliases text[]:=array[]::text[];
begin
  select tag,a,b into strict v_tag,v_a,v_b from patch2_fixture_run;
  -- SQL-local trusted-service context for the existing fixture authority only.
  -- This is NOT a Clerk administrator/player session or signature verification.
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','ref','zzbnneprhjicmajpjkdg')::text,true);
  select nullif(btrim(decrypted_secret),'') into strict v_secret from vault.decrypted_secrets
    where name='ironclad_staging_synthetic_uat_fixture_secret';
  perform ironclad_private.assert_staging_synthetic_uat_access(v_secret);
  for v_i in 1..10 loop v_aliases:=array_append(v_aliases,'TestAcademy'||v_i); end loop;
  for v_i in 1..10 loop v_aliases:=array_append(v_aliases,'TestChallenge'||v_i); end loop;
  v_aliases:=v_aliases||array['TestMain1','TestMain2','TestMain3','TestMain4','TestMain5','TestMain11'];
  perform pg_temp.patch2_fixture_assert((select count(*)=26 and bool_and(f.clerk_environment='development'
    and f.clerk_test_user_verified and f.clerk_test_user_verified_at is not null
    and not f.steam_openid_verified and not f.steam_ownership_verified and not f.relic_live_lookup_verified
    and not f.linked_steam_legal_confirmation and p.profile_completed and p.account_closed_at is null
    and not p.public_profile_enabled and p.coh3_profile_id is null)
    from ironclad_private.staging_synthetic_uat_players f join public.players p on p.id=f.player_id
    where f.approved_alias=any(v_aliases)), 'exact existing approved Development fixture players; no fabricated provider facts');
  foreach v_t in array array[v_a,v_b] loop
    foreach v_name in array array['Academy','Challenge','Main','Pro'] loop
      v_id:=gen_random_uuid();
      insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players)
      values(v_id,v_t,v_name,case v_name when 'Academy' then '0-1099 ELO' when 'Challenge' then '1100-1399 ELO'
        when 'Main' then '1400-1699 ELO' else '1700+ ELO' end,8);
      insert into patch2_fixture_brackets values(v_t,v_name,v_id);
    end loop;
  end loop;
  -- The real availability trigger refuses INSERTs into Upcoming events. This
  -- temporary setup is not externally visible and never supplies public dates.
  update public.tournaments set status='registration_open' where id in (v_a,v_b);
  perform pg_temp.patch2_fixture_assert((select count(*)=2 and bool_and(status='registration_open' and registration_enabled)
    from public.tournaments where id in (v_a,v_b)),'real derived availability before canonical fixture enrolment');
  foreach v_alias in array v_aliases loop
    select ironclad_private.division_for_elo('four_division_v1',f.synthetic_elo)
      into strict v_name from ironclad_private.staging_synthetic_uat_players f where f.approved_alias=v_alias;
    select id into strict v_bracket from patch2_fixture_brackets where tournament_id=v_a and name=v_name;
    select * into strict v_result from public.enrol_staging_synthetic_uat_player(v_secret,v_alias,v_a,v_bracket,true);
    perform pg_temp.patch2_fixture_assert(v_result.created and v_result.registration_id is not null
      and not v_result.waitlist_confirmation_required and v_result.provenance='staging_synthetic_uat'
      and v_result.contract_version='staging-synthetic-v2','canonical fixture authority created one new provenanced registration');
    insert into patch2_fixture_registrations values(v_alias,v_a,v_result.player_id,v_result.registration_id);
    -- Set the six-status examples BEFORE any waiting Academy rows exist, so
    -- rejecting/withdrawing cannot create an offer or deadline. Later Academy9
    -- and Academy10 fill those two vacancies. Challenge9/10 wait behind 8 active.
    if v_alias='TestAcademy1' then
      perform * from public.review_tournament_registration_scoped(v_a,v_result.registration_id,'manual_review',v_tag||' [SYNTHETIC] manual review example; provider verification remains false.');
    elsif v_alias='TestAcademy2' then
      perform * from public.review_tournament_registration_scoped(v_a,v_result.registration_id,'approved',v_tag||' [SYNTHETIC] admin approval example, not provider verification.');
    elsif v_alias='TestAcademy3' then
      perform * from public.review_tournament_registration_scoped(v_a,v_result.registration_id,'rejected',v_tag||' [SYNTHETIC] rejected historical status example.');
    elsif v_alias='TestAcademy4' then
      -- Explicit trusted SQL historical snapshot preparation, NOT a player
      -- withdrawal action, consent or authenticated member-flow test. Do not
      -- impersonate a user or manufacture their current legal acceptance.
      update public.registrations set registration_status='withdrawn',withdrawn_at=clock_timestamp(),
        admin_notes=v_tag||' [SYNTHETIC] withdrawn historical snapshot; no real player withdrew.'
        where id=v_result.registration_id and tournament_id=v_a and registration_provenance='staging_synthetic_uat';
      perform * from public.review_tournament_registration_scoped(v_a,v_result.registration_id,'withdrawn',
        v_tag||' [SYNTHETIC] administrative note on a final withdrawn snapshot; no real player withdrew.');
    end if;
  end loop;
  select id into strict v_bracket from patch2_fixture_brackets where tournament_id=v_b and name='Academy';
  select * into strict v_result from public.enrol_staging_synthetic_uat_player(v_secret,'TestAcademy1',v_b,v_bracket,true);
  perform pg_temp.patch2_fixture_assert(v_result.created and v_result.registration_id is not null
    and v_result.registration_status='pending','same existing synthetic player has an independent B registration');
  insert into patch2_fixture_registrations values('TestAcademy1',v_b,v_result.player_id,v_result.registration_id);
  update public.registrations r set admin_notes=v_tag||' [SYNTHETIC] selected-tournament registration fixture. '
    ||coalesce(nullif(r.admin_notes,''),'No provider verification or real consent asserted.')
    where r.id in (select registration_id from patch2_fixture_registrations);
  select jsonb_object_agg(registration_status,n) into v_counts from
    (select registration_status,count(*) n from public.registrations where tournament_id=v_a group by registration_status) s;
  perform pg_temp.patch2_fixture_assert(v_counts='{"pending":20,"manual_review":1,"approved":1,"rejected":1,"withdrawn":1,"waitlisted":2}'::jsonb,
    '26 A rows: all six exact statuses and a second 25-row workspace page');
  perform pg_temp.patch2_fixture_assert((select count(*)=2 and count(distinct tournament_id)=2
    from patch2_fixture_registrations where alias='TestAcademy1') and (select count(*)=1 and bool_and(registration_status='pending')
    from public.registrations where tournament_id=v_b),'same-player two-tournament isolation fixture');
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.registrations where id in
    (select registration_id from patch2_fixture_registrations) and (waitlist_offer_status is not null
      or waitlist_offer_created_at is not null or waitlist_offer_expires_at is not null or waitlist_offer_resolved_at is not null)),
    'no waitlist offer, expiry timer or response work was created');
  update public.tournaments set status='upcoming',description=case when id=v_a
    then '[SYNTHETIC STAGING] Patch 2 inbox and registration acceptance: 26 existing synthetic fixture identities, six statuses and two registration pages. Registration disabled; no public dates, matches or offer timers. Run: '||v_tag
    else '[SYNTHETIC STAGING] Patch 2 tournament isolation: the same approved synthetic player has an independent pending registration. Registration disabled; no public dates, matches or offer timers. Run: '||v_tag end
    where id in (v_a,v_b);
  -- Two deliberately synthetic source notices bind the SAME fixture player to
  -- its actual independent registration IDs, for scoped deletion/deep-link UI
  -- acceptance. They are not reports of real player submissions or decisions.
  insert into public.notifications(recipient_role,type,title,message,tournament_id,tournament_title,
    registration_id,event_key,metadata)
    select 'admin',case when r.tournament_id=v_a then 'registration.manual_review_required' else 'registration.submitted' end,
      '[SYNTHETIC STAGING] Registration deep link '||case when r.tournament_id=v_a then 'A' else 'B' end,
      'Synthetic registration-linked notice only. Removing it must preserve the independent source registration and its current status.',
      r.tournament_id,t.title,r.registration_id,v_tag||':registration-link:'||r.tournament_id,
      jsonb_build_object('patch2TestRun',v_tag,'syntheticFixture',true,'patch2FixtureRole','registration-deep-link',
        'registrationId',r.registration_id,'tournamentId',r.tournament_id)
    from patch2_fixture_registrations r join public.tournaments t on t.id=r.tournament_id where r.alias='TestAcademy1';
  perform pg_temp.patch2_fixture_assert((select count(*)=2 and count(distinct n.tournament_id)=2
    from public.notifications n join patch2_fixture_registrations r on r.registration_id=n.registration_id
    where r.alias='TestAcademy1' and n.metadata->>'patch2TestRun'=v_tag
      and n.metadata->>'patch2FixtureRole'='registration-deep-link' and n.recipient_role='admin'),
    'one new synthetic registration-linked admin notice in each tournament');
  -- A repeatable-read snapshot sees only this transaction's own new notices
  -- beyond the captured IDs. Other committed activity cannot enter this set.
  insert into patch2_fixture_notifications select n.id from public.notifications n
    where not exists(select 1 from patch2_fixture_baseline b where b.relation='public.notifications'::regclass
      and n.id::text in (select jsonb_array_elements_text(b.keys)));
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.notifications where id in
    (select id from patch2_fixture_notifications) and (tournament_id not in (v_a,v_b) or tournament_id is null)),
    'every new notice belongs to these owned tournaments');
  update public.notifications set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('patch2TestRun',v_tag,'syntheticFixture',true),
    title=case when title like '[SYNTHETIC STAGING]%' then title else '[SYNTHETIC STAGING] '||title end,
    message='Synthetic Patch 2 fixture only; this is not a real registration decision. '||message
    where id in (select id from patch2_fixture_notifications);
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.notifications where id in
    (select id from patch2_fixture_notifications) and (push_delivery_status='processing' or email_delivery_status='processing')),
    'uncommitted fixture notifications cannot have worker claims');
  -- Preserve every source notice and NULL eligibility; retire ONLY newly
  -- enrolled pending/retry work before any worker can see this transaction.
  update public.notifications set push_delivery_status='skipped',push_next_attempt_at=null,push_claim_token=null,
    push_claim_expires_at=null,push_completed_at=clock_timestamp(),push_last_error_code='PATCH2_STAGING_FIXTURE_SUPPRESSED'
    where id in (select id from patch2_fixture_notifications) and push_delivery_status in ('pending','retryable_failure');
  update public.notifications set email_delivery_status='skipped',email_next_attempt_at=null,email_claim_token=null,
    email_claim_expires_at=null,email_sent_at=null,email_provider_message_id=null,email_last_error_code='PATCH2_STAGING_FIXTURE_SUPPRESSED'
    where id in (select id from patch2_fixture_notifications) and email_delivery_status in ('pending','retryable_failure');
end;
$$;

set constraints all immediate;
do $$
declare v_b record; v_digest text;
begin
  for v_b in select * from patch2_fixture_baseline loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by %1$I,to_jsonb(t)::text)::text,''[]'')) from %2$s t where %1$I::text in (select jsonb_array_elements_text($1))',v_b.key_column,v_b.relation)
      into v_digest using v_b.keys;
    perform pg_temp.patch2_fixture_assert(v_digest=v_b.digest,'all captured pre-existing history/identity/inbox rows unchanged');
  end loop;
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from patch2_fixture_original_tournaments o
    join public.tournaments t on t.id=o.id where (to_jsonb(t)-'updated_at'-'description')<>(o.row_data-'updated_at'-'description')),
    'A/B final fields unchanged except explicit synthetic description and timestamp');
  perform pg_temp.patch2_fixture_assert((select count(*)=2 and bool_and(status='upcoming' and not registration_enabled
    and registration_open_at is null and registration_close_at is null and start_date is null and end_date is null and grand_final_at is null)
    from public.tournaments where id in (select a from patch2_fixture_run union all select b from patch2_fixture_run)),
    'A/B restored Upcoming/disabled with no public schedule before COMMIT');
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.generated_brackets where tournament_bracket_id in
    (select id from patch2_fixture_brackets)),'no generated bracket, match or match deadline');
  perform pg_temp.patch2_fixture_assert((select count(*)=27 and bool_and(registration_provenance='staging_synthetic_uat'
    and fixture_contract_version='staging-synthetic-v2' and elo_status='manual_review' and elo_verification_source is null
    and elo_verified_elo is null and elo_checked_at is null and elo_calculation_version is null)
    from public.registrations where id in (select registration_id from patch2_fixture_registrations)),
    'new registrations remain explicit manual synthetic snapshots without invented provider verification');
  perform pg_temp.patch2_fixture_assert((select count(*)=27 and bool_and(not e.steam_openid_verified and not e.steam_ownership_verified
    and not e.relic_live_lookup_verified and not e.linked_steam_legal_confirmation)
    from ironclad_private.staging_synthetic_uat_enrolments e where registration_id in
      (select registration_id from patch2_fixture_registrations)),'canonical new enrolments keep every provider/ownership assertion false');
  perform pg_temp.patch2_fixture_assert(not exists(select 1 from public.notifications where id in
    (select id from patch2_fixture_notifications) and (push_delivery_status in ('pending','retryable_failure','processing')
      or email_delivery_status in ('pending','retryable_failure','processing') or push_claim_token is not null or email_claim_token is not null)),
    'all newly owned notices retained but nondeliverable');
  perform pg_temp.patch2_fixture_assert(not has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE'),
    'push claim restriction remains in force');
end;
$$;

commit;

-- Keep this SELECT last: the hosted SQL tool returns the last result only.
-- Its manifest is reconstructed from this run's persisted notes/metadata;
-- no private Clerk IDs, Vault material or proof paths are returned.
with run as (select 'patch2-staging-registration-20261102-c7bf6a3-v1'::text tag,
    'a5e1146d-883b-4d96-9840-fa9abd6a3120'::uuid a,'e1e8689b-1b17-4e5e-b229-c0abca00135a'::uuid b),
  regs as (select r.*,f.approved_alias from public.registrations r
    join ironclad_private.staging_synthetic_uat_players f on f.player_id=r.profile_id,run
    where r.tournament_id in (run.a,run.b) and r.admin_notes like run.tag||'%')
select jsonb_build_object('fixtureRun',run.tag,'target','zzbnneprhjicmajpjkdg','committed',true,
  'tournamentA',run.a,'tournamentB',run.b,'registrationPageSize',25,
  'tournamentACount',(select count(*) from regs where tournament_id=run.a),
  'tournamentAPages',(select ceil(count(*)::numeric/25)::int from regs where tournament_id=run.a),
  'tournamentBCount',(select count(*) from regs where tournament_id=run.b),
  'tournamentAStatuses',(select jsonb_object_agg(registration_status,n) from
    (select registration_status,count(*) n from regs where tournament_id=run.a group by registration_status) s),
  'registrations',(select jsonb_agg(jsonb_build_object('alias',r.approved_alias,'tournamentId',r.tournament_id,'playerId',r.profile_id,
    'registrationId',r.id,'status',r.registration_status,'division',b.name) order by r.tournament_id,r.created_at,r.id)
    from regs r join public.tournament_brackets b on b.id=r.tournament_bracket_id),
  'newSourceNotices',(select count(*) from public.notifications where metadata->>'patch2TestRun'=run.tag),
  'registrationLinkedAdminNotices',(select jsonb_agg(jsonb_build_object('notificationId',id,
    'tournamentId',tournament_id,'registrationId',registration_id) order by tournament_id)
    from public.notifications where metadata->>'patch2TestRun'=run.tag
      and metadata->>'patch2FixtureRole'='registration-deep-link' and recipient_role='admin'),
  'limits','Committed clearly labelled synthetic UI fixtures, not a Clerk-session, provider-verification, consent or normal player-registration acceptance test. Only historical withdrawn status is prepared directly; current player withdrawal was tested separately in rollback acceptance.') as fixture_manifest
from run;
