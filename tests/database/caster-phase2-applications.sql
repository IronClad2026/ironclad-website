begin;

create function pg_temp.check_true(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Caster Phase 2: %', p_label; end if;
end;
$$;

insert into public.legal_documents (id, document_kind, version, immutable_url, status, published_at, effective_at, sha256)
select gen_random_uuid(), kind, 'caster-phase2-disposable', 'https://phase2.invalid/' || kind || '.pdf',
  'effective', now() - interval '2 days', now() - interval '1 day', repeat('a', 64)
from (values ('terms'), ('privacy')) documents(kind)
where not exists (select from public.legal_documents where document_kind = kind and status = 'effective');

insert into ironclad_private.patch2_staff_authorizations (subject_digest, verification_reference)
select sha256(convert_to(actor, 'UTF8')), 'disposable Phase 2 staff'
from unnest(array['user_CasterPhase2Staff','user_CasterPhase2Owner','user_CasterPhase2SecondStaff']) actors(actor);
set local request.jwt.claims = '{"role":"service_role"}';

do $test$
declare
  c_owner constant text := 'user_CasterPhase2Owner';
  c_other constant text := 'user_CasterPhase2Other';
  c_staff constant text := 'user_CasterPhase2Staff';
  c_direct constant text := 'user_CasterPhase2Direct';
  c_race constant text := 'user_CasterPhase2Race';
  v_actor text;
  v_application uuid;
  v_revision uuid;
  v_old_revision uuid;
  v_avatar uuid;
  v_other_avatar uuid;
  v_result jsonb;
  v_draft jsonb;
  v_terms uuid := (select id from public.legal_documents where document_kind = 'terms' and status = 'effective');
  v_privacy uuid := (select id from public.legal_documents where document_kind = 'privacy' and status = 'effective');
  v_token text;
  v_continuation text;
  v_count integer;
  v_version integer;
begin
  select count(*) into v_count from pg_proc f join pg_namespace n on n.oid = f.pronamespace
  where n.nspname = 'public' and f.proname like 'caster_phase2_%'
    and has_function_privilege('service_role', f.oid, 'EXECUTE')
    and not has_function_privilege('anon', f.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', f.oid, 'EXECUTE');
  perform pg_temp.check_true(v_count = 10, 'all RPCs are service-only');
  perform pg_temp.check_true((
    select count(*) = 5 and bool_and(c.relrowsecurity)
      and bool_and(not has_table_privilege('authenticated', c.oid, 'SELECT'))
      and bool_and(not has_table_privilege('service_role', c.oid, 'UPDATE'))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ironclad_private' and c.relname in (
      'caster_applications','caster_application_revisions','caster_application_media',
      'caster_application_events','caster_memberships')
  ), 'all application persistence is private, including immutable server snapshots');
  perform pg_temp.check_true((
    select not public and file_size_limit = 3145728 and allowed_mime_types = array['image/webp']
    from storage.buckets where id = 'caster-application-media'
  ), 'private bounded WebP bucket');

  perform pg_temp.check_true(public.caster_phase2_get('user_CasterPhase2Missing')->>'status' = 'legal_required',
    'legal acceptance required before application read');
  foreach v_actor in array array[c_owner,c_other,c_staff,c_direct,c_race,
    'user_CasterPhase2SecondStaff','user_CasterPhase2MixedRace'] loop
    perform public.caster_phase1_accept_legal(v_actor, v_terms, v_privacy);
  end loop;
  begin
    perform public.caster_phase2_admin_list(c_other, null, null, 0);
    raise exception 'non-staff listing unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.check_true(public.caster_phase2_get(c_other)->>'status' = 'not_found', 'own application lookup only');

  foreach v_actor in array array[c_owner,c_other,c_race] loop
    v_token := encode(sha256(convert_to(v_actor || ':token','UTF8')), 'hex');
    v_continuation := encode(sha256(convert_to(v_actor || ':continuation','UTF8')), 'hex');
    perform pg_temp.check_true(public.caster_phase1_issue(c_staff, v_token, 'Phase 2 disposable fixture')->>'status' = 'issued',
      'Phase 1 invitation issue after additive migration');
    perform pg_temp.check_true(public.caster_phase1_prepare_continuation(v_token, v_continuation,
      encode(sha256(convert_to(v_actor || ':source','UTF8')), 'hex'))->>'status' = 'valid',
      'Phase 1 continuation preparation after additive migration');
    perform pg_temp.check_true(public.caster_phase1_claim_continuation(v_actor, v_continuation)->>'status' = 'claimed',
      'Phase 1 claim still produces a private draft');
  end loop;
  v_result := public.caster_phase2_get(c_owner);
  v_application := (v_result#>>'{application,id}')::uuid;
  perform pg_temp.check_true(v_result#>>'{application,status}' = 'draft'
    and v_result#>>'{application,membership_active}' = 'false'
    and v_result#>'{application,draft}' = '{}'::jsonb, 'legacy-compatible blank draft without membership');
  perform pg_temp.check_true(public.caster_phase2_submit(c_owner, 0)->>'status' = 'incomplete', 'required fields guard');
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 0, '{"languages":{}}')->>'status' = 'invalid',
    'malformed draft fails closed');

  perform pg_temp.check_true(public.caster_phase2_reserve_media(c_owner, 'avatar', 2097153, 'image/webp')->>'status' = 'invalid',
    'avatar max size enforced');
  perform pg_temp.check_true(public.caster_phase2_reserve_media(c_owner, 'banner', 1, 'image/png')->>'status' = 'invalid',
    'reservation requires optimized MIME');
  v_result := public.caster_phase2_reserve_media(c_owner, 'avatar', 4096, 'image/webp');
  v_avatar := (v_result#>>'{media,id}')::uuid;
  perform pg_temp.check_true(v_result#>>'{media,state}' = 'reserved'
    and v_result#>>'{media,object_path}' = v_application::text || '/' || v_avatar::text || '.webp', 'trusted media path');
  perform pg_temp.check_true(public.caster_phase2_finish_media(c_owner, v_avatar, true)->>'status' = 'not_found',
    'object required before readiness');
  insert into storage.objects(bucket_id, name) values ('caster-application-media', v_result#>>'{media,object_path}');
  perform pg_temp.check_true(public.caster_phase2_finish_media(c_other, v_avatar, true)->>'status' = 'not_found',
    'other applicant cannot finalize media');
  perform pg_temp.check_true(public.caster_phase2_finish_media(c_owner, v_avatar, true)#>>'{media,state}' = 'ready',
    'owner finalizes present object');
  perform pg_temp.check_true(public.caster_phase2_get_media(c_other, v_avatar, false)->>'status' = 'not_found',
    'other applicant cannot obtain objects');
  perform pg_temp.check_true(public.caster_phase2_get_media(c_staff, v_avatar, true)->>'status' = 'not_found',
    'staff cannot fetch a never-submitted object');

  v_result := public.caster_phase2_reserve_media(c_other, 'avatar', 4096, 'image/webp');
  v_other_avatar := (v_result#>>'{media,id}')::uuid;
  insert into storage.objects(bucket_id, name) values ('caster-application-media', v_result#>>'{media,object_path}');
  perform public.caster_phase2_finish_media(c_other, v_other_avatar, true);
  v_draft := jsonb_build_object('displayName','Caster Phase Two','country','GB','languages',jsonb_build_array('en'),
    'avatar',v_avatar,'banner',null,'gallery','[]'::jsonb,'discord','private-contact',
    'bio','{"version":1,"doc":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Caster biography"}]}]}}'::jsonb,
    'links','[{"label":"Website","url":"https://example.invalid/casting"}]'::jsonb,
    'videos','["https://www.youtube.com/watch?v=examplecast"]'::jsonb,'games','[]'::jsonb,'experience','');
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 0, jsonb_set(v_draft,'{avatar}',to_jsonb(v_other_avatar)))->>'status' = 'invalid',
    'another applicant media cannot be put in the draft');
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 0, v_draft)->>'status' = 'ok', 'valid draft saves');
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 0, v_draft)->>'status' = 'conflict', 'stale save rejected');
  v_result := public.caster_phase2_submit(c_owner, 1);
  v_revision := (v_result#>>'{application,submitted_revision_id}')::uuid;
  v_old_revision := v_revision;
  perform pg_temp.check_true(v_result#>>'{application,status}' = 'submitted' and v_revision is not null
    and v_result#>'{application,revision,draft}' = v_draft, 'submission freezes exact revision');
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 2, v_draft)->>'status' = 'locked', 'submitted draft does not change');
  perform pg_temp.check_true(public.caster_phase2_get_media(c_staff, v_avatar, true)->>'status' = 'ok', 'staff can review submitted media');
  perform pg_temp.check_true(public.caster_phase2_admin_list(c_staff, 'submitted', 'phase two', 0)#>>'{applications,0,id}' = v_application::text,
    'staff queue searches frozen name');
  perform pg_temp.check_true(public.caster_phase2_admin_detail(c_staff, v_application)#>'{application,revision,draft}' = v_draft,
    'admin reads frozen snapshot');
  perform pg_temp.check_true(public.caster_phase2_review(c_owner, v_application, v_revision, 'approve', null)->>'status' = 'self_review',
    'verified staff cannot self approve');
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_revision, 'request_changes', 'Revise your biography')
    #>>'{application,status}' = 'changes_requested', 'staff requests changes');
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_revision, 'approve', null)->>'status' = 'conflict',
    'decision race loses after first review');

  v_draft := jsonb_set(v_draft, '{displayName}', '"Edited Caster"'::jsonb);
  perform pg_temp.check_true(public.caster_phase2_save(c_owner, 2, v_draft)->>'status' = 'ok', 'changes-requested draft reopens');
  perform pg_temp.check_true(public.caster_phase2_admin_detail(c_staff, v_application)#>>'{application,revision,draft,displayName}'
    = 'Caster Phase Two', 'staff view does not read unsubmitted edits');
  v_result := public.caster_phase2_submit(c_owner, 3);
  v_revision := (v_result#>>'{application,submitted_revision_id}')::uuid;
  perform pg_temp.check_true(v_revision is distinct from v_old_revision and v_revision is not null, 'resubmission creates another revision');
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_old_revision, 'approve', null)->>'status' = 'conflict',
    'stale revision cannot be reviewed');
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_revision, 'reject', 'Needs a revised identity')
    #>>'{application,status}' = 'rejected', 'staff rejects a frozen revision');
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_revision, 'reopen', null)
    #>>'{application,status}' = 'changes_requested', 'staff reopens a rejected application');
  v_result := public.caster_phase2_submit(c_owner, 4);
  v_revision := (v_result#>>'{application,submitted_revision_id}')::uuid;
  perform pg_temp.check_true(public.caster_phase2_review(c_staff, v_application, v_revision, 'approve', null)
    #>>'{application,membership_active}' = 'true', 'approval creates independent membership');
  perform pg_temp.check_true((select count(*) = 3 from ironclad_private.caster_application_revisions where application_id = v_application),
    'all frozen revisions preserved');
  perform pg_temp.check_true((select count(*) = 4
    and bool_and(email_delivery_status is null and push_delivery_status is null and (metadata - 'status') = '{}'::jsonb)
    from public.notifications where recipient_clerk_user_id = c_owner and type = 'caster.application_updated'),
    'review notices deduplicated, status-only and in-app');
  perform pg_temp.check_true((select count(*) = 0 from public.players where clerk_user_id in (c_owner, c_direct)),
    'no competitive player record created by approval');

  perform pg_temp.check_true(public.caster_phase2_grant(c_staff, c_staff, 'Synthetic self attempt')->>'status' = 'self_review', 'self-grant blocked');
  perform pg_temp.check_true(public.caster_phase2_grant(c_staff, c_owner, 'Existing application')->>'status' = 'conflict',
    'direct grant never overwrites an existing application');
  perform pg_temp.check_true(public.caster_phase2_grant(c_staff, c_direct, 'Independently checked synthetic Clerk account')
    #>>'{application,membership_active}' = 'true', 'direct grant is independent of invitations');
  perform pg_temp.check_true(public.caster_phase2_save(c_direct, 0, jsonb_set(v_draft,'{avatar}','null'::jsonb))->>'status' = 'ok',
    'direct-approved owner can complete first profile draft');
  perform pg_temp.check_true(public.caster_phase2_submit(c_direct, 1)->>'status' = 'locked', 'direct grant does not allow review or publishing actions');

  for v_count in 1..10 loop
    perform pg_temp.check_true(public.caster_phase2_reserve_media(c_other, 'gallery', 3145728, 'image/webp')->>'status' = 'ok',
      'pending media reservations count toward account quota');
  end loop;
  perform pg_temp.check_true(public.caster_phase2_reserve_media(c_other, 'gallery', 3145728, 'image/webp')->>'status' = 'quota_exceeded',
    '32 MiB quota is applied to pending and ready media');
  for v_count in 1..24 loop
    v_result := public.caster_phase2_reserve_media(c_direct,'gallery',1,'image/webp');
    perform pg_temp.check_true(v_result->>'status' = 'ok', 'small upload within rate allowance');
    perform public.caster_phase2_finish_media(c_direct,(v_result#>>'{media,id}')::uuid,false);
  end loop;
  perform pg_temp.check_true(public.caster_phase2_reserve_media(c_direct,'gallery',1,'image/webp')->>'status' = 'rate_limited',
    'failed and tiny uploads still count toward reservation rate');

  -- Leave a submitted synthetic fixture for two separate review connections.
  v_result := public.caster_phase2_reserve_media(c_race,'avatar',1024,'image/webp');
  v_avatar := (v_result#>>'{media,id}')::uuid;
  insert into storage.objects(bucket_id, name) values ('caster-application-media', v_result#>>'{media,object_path}');
  perform public.caster_phase2_finish_media(c_race, v_avatar, true);
  perform public.caster_phase2_save(c_race,0,jsonb_set(v_draft,'{avatar}',to_jsonb(v_avatar)));
  perform pg_temp.check_true(public.caster_phase2_submit(c_race,1)#>>'{application,status}' = 'submitted', 'concurrency fixture submitted');

  -- A separate fixture lets invitation claim and direct grant contend for the
  -- same account in real PostgreSQL sessions.
  perform public.caster_phase1_issue(c_staff, repeat('a',64), 'Phase 2 grant and claim race');
  perform pg_temp.check_true(public.caster_phase1_prepare_continuation(repeat('a',64),repeat('b',64),repeat('c',64))
    ->>'status' = 'valid', 'claim/grant concurrency fixture prepared');

  insert into ironclad_private.patch2_closed_accounts (subject_digest) values (sha256(convert_to(c_owner,'UTF8')));
  perform pg_temp.check_true(public.caster_phase2_get(c_owner)->>'status' = 'closed', 'account closure immediately denies private application');
  perform pg_temp.check_true(public.caster_phase2_admin_detail(c_staff, v_application)->>'status' = 'not_found',
    'private review no longer resolves for closed account');
end;
$test$;
commit;
