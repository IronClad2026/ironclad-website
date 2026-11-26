begin;
set local request.jwt.claims = '{"role":"service_role"}';

create function pg_temp.check_caster(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Caster Phase 3: %', p_label; end if;
end;
$$;

create function pg_temp.caster_media(p_actor text, p_kind text)
returns uuid language plpgsql as $$
declare v_media jsonb;
begin
  v_media := public.caster_phase2_reserve_media(p_actor, p_kind, 1024, 'image/webp');
  perform pg_temp.check_caster(v_media->>'status' = 'ok', 'owner can reserve private media');
  insert into storage.objects(bucket_id, name) values ('caster-application-media', v_media#>>'{media,object_path}');
  perform pg_temp.check_caster(
    public.caster_phase2_finish_media(p_actor, (v_media#>>'{media,id}')::uuid, true)#>>'{media,state}' = 'ready',
    'owner can finish private media');
  return (v_media#>>'{media,id}')::uuid;
end;
$$;

create function pg_temp.caster_draft(p_name text, p_avatar uuid, p_banner uuid default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'displayName', p_name, 'country', 'GB', 'languages', jsonb_build_array('en', 'fr'),
    'avatar', p_avatar, 'banner', p_banner, 'gallery', '[]'::jsonb, 'discord', 'private-discord-fixture',
    'bio', '{"version":1,"doc":{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Broadcasting","marks":[{"type":"bold"}]}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Community coverage 🎙️"}]}]}]}]}}'::jsonb,
    'links', '[{"label":"Twitch","url":"https://www.twitch.tv/synthetic"}]'::jsonb,
    'videos', '["https://www.youtube.com/watch?v=ABCDEFGHIJK"]'::jsonb,
    'games', '["Company of Heroes 3"]'::jsonb, 'experience', 'Synthetic fixture'
  );
$$;

insert into public.legal_documents (id, document_kind, version, immutable_url, status, published_at, effective_at, sha256)
select gen_random_uuid(), kind, 'caster-phase3-disposable', 'https://phase3.invalid/' || kind || '.pdf',
  'effective', now() - interval '2 days', now() - interval '1 day', repeat('a', 64)
from (values ('terms'), ('privacy')) documents(kind)
where not exists (select from public.legal_documents where document_kind = kind and status = 'effective');

insert into ironclad_private.patch2_staff_authorizations (subject_digest, verification_reference)
select sha256(convert_to(actor, 'UTF8')), 'disposable Phase 3 staff'
from unnest(array['user_CasterPhase3Staff','user_CasterPhase3Owner']) actors(actor);

do $test$
declare
  c_staff constant text := 'user_CasterPhase3Staff';
  c_owner constant text := 'user_CasterPhase3Owner';
  c_other constant text := 'user_CasterPhase3Other';
  c_pending constant text := 'user_CasterPhase3Pending';
  c_race constant text := 'user_CasterPhase3Race';
  c_closed constant text := 'user_CasterPhase3Closed';
  v_actor text;
  v_terms uuid := (select id from public.legal_documents where document_kind = 'terms' and status = 'effective');
  v_privacy uuid := (select id from public.legal_documents where document_kind = 'privacy' and status = 'effective');
  v_avatar uuid;
  v_banner uuid;
  v_other_avatar uuid;
  v_next_avatar uuid;
  v_application uuid;
  v_invited_application uuid;
  v_revision uuid;
  v_next_revision uuid;
  v_slug text;
  v_draft jsonb;
  v_invited_draft jsonb;
  v_invited_revision uuid;
  v_result jsonb;
  v_original jsonb;
  v_token text;
  v_continuation text;
begin
  perform pg_temp.check_caster((
    select count(*) = 9 and bool_and(has_function_privilege('service_role', f.oid, 'EXECUTE'))
      and bool_and(not has_function_privilege('anon', f.oid, 'EXECUTE'))
      and bool_and(not has_function_privilege('authenticated', f.oid, 'EXECUTE'))
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'public' and f.proname like 'caster_phase3_%'
  ), 'every Phase 3 RPC is service-only');
  perform pg_temp.check_caster((
    select count(*) = 3 and bool_and(c.relrowsecurity)
      and bool_and(not has_table_privilege('authenticated', c.oid, 'SELECT'))
      and bool_and(not has_table_privilege('service_role', c.oid, 'UPDATE'))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ironclad_private' and c.relname in (
      'caster_profiles','caster_profile_revisions','caster_profile_moderation_events'
    )
  ), 'working, immutable public and audit rows are private');
  perform pg_temp.check_caster((select not public from storage.buckets where id = 'caster-application-media'),
    'media bucket remains private');
  perform pg_temp.check_caster(public.caster_phase3_publish('user_CasterPhase3NoLegal',0)->>'status' = 'legal_required',
    'publication requires current legal acceptance');

  foreach v_actor in array array[c_staff,c_owner,c_other,c_pending,c_race,c_closed] loop
    perform public.caster_phase1_accept_legal(v_actor, v_terms, v_privacy);
  end loop;
  v_result := public.caster_phase2_grant(c_staff, c_owner, 'Independently verified synthetic owner');
  v_application := (v_result#>>'{application,id}')::uuid;
  perform pg_temp.check_caster(v_result->>'status' = 'ok', 'direct grant creates owner workspace prerequisites');
  perform pg_temp.check_caster(public.caster_phase3_owner(c_owner)#>>'{profile,membership_status}' = 'active'
    and public.caster_phase3_owner(c_owner)#>>'{profile,publication_id}' is null
    and public.caster_phase3_directory(0,100) = '[]'::jsonb,
    'approval alone does not create a public profile');
  perform pg_temp.check_caster(public.caster_phase3_publish(c_owner,0)->>'status' = 'incomplete',
    'incomplete draft cannot publish');

  v_token := encode(sha256(convert_to(c_pending || ':token','UTF8')), 'hex');
  v_continuation := encode(sha256(convert_to(c_pending || ':continuation','UTF8')), 'hex');
  perform public.caster_phase1_issue(c_staff, v_token, 'Phase 3 synthetic invited');
  perform public.caster_phase1_prepare_continuation(v_token, v_continuation, repeat('f',64));
  perform pg_temp.check_caster(public.caster_phase1_claim_continuation(c_pending, v_continuation)->>'status' = 'claimed',
    'Phase 1 claim stays private');
  perform pg_temp.check_caster(public.caster_phase3_publish(c_pending,0)->>'status' = 'not_found',
    'unapproved applicant cannot publish');
  v_other_avatar := pg_temp.caster_media(c_pending, 'avatar');
  v_invited_draft := pg_temp.caster_draft('Reviewed application', v_other_avatar);
  perform public.caster_phase2_save(c_pending,0,v_invited_draft);
  v_result := public.caster_phase2_submit(c_pending,1);
  v_invited_application := (v_result#>>'{application,id}')::uuid;
  v_invited_revision := (v_result#>>'{application,submitted_revision_id}')::uuid;
  perform pg_temp.check_caster(public.caster_phase2_review(c_staff,v_invited_application,v_invited_revision,
    'approve',null)->>'status' = 'ok', 'Phase 2 approved frozen review still grants independent membership');
  perform pg_temp.check_caster(public.caster_phase3_owner(c_pending)#>>'{profile,draft,displayName}' = 'Reviewed application'
    and public.caster_phase3_owner(c_pending)#>>'{profile,draft,discord}' = '',
    'reviewed profile seed uses the approved content without private Discord');
  perform pg_temp.caster_media(c_pending, 'gallery');
  perform pg_temp.check_caster(public.caster_phase3_save(c_pending,0,
    jsonb_set(v_invited_draft,'{displayName}','"Private reviewed update"'),false)->>'status' = 'ok'
    and (select draft = v_invited_draft from ironclad_private.caster_application_revisions where id = v_invited_revision),
    'approved invited owner can use Studio while the reviewed snapshot stays frozen');
  perform pg_temp.check_caster(public.caster_phase2_save(c_pending,2,v_invited_draft)->>'status' = 'locked',
    'legacy Phase 2 invited approval remains frozen');

  v_avatar := pg_temp.caster_media(c_owner, 'avatar');
  v_banner := pg_temp.caster_media(c_owner, 'banner');
  v_draft := pg_temp.caster_draft('Caster Phase Three', v_avatar, v_banner);
  perform pg_temp.check_caster(public.caster_phase3_save(c_owner,0,
    jsonb_set(v_draft,'{avatar}',to_jsonb(v_other_avatar)),false)->>'status' = 'invalid',
    'other owner media cannot enter the working profile');
  perform pg_temp.check_caster(public.caster_phase2_get_media(c_pending,v_avatar,false)->>'status' = 'not_found',
    'another caster cannot fetch private media');
  perform pg_temp.check_caster(public.caster_phase3_save(c_owner,0,v_draft,false)#>>'{profile,version}' = '1',
    'owner saves first working profile');
  perform pg_temp.check_caster(public.caster_phase3_save(c_owner,0,v_draft,false)->>'status' = 'conflict',
    'stale working draft write is denied');
  perform pg_temp.check_caster(public.caster_phase3_publish(c_owner,0)->>'status' = 'conflict',
    'stale publication request is denied');
  perform pg_temp.check_caster(public.caster_phase3_directory(0,100) = '[]'::jsonb,
    'working data is not promoted before explicit publication');
  v_result := public.caster_phase3_publish(c_owner,1);
  v_revision := (v_result#>>'{profile,publication_id}')::uuid;
  v_slug := v_result#>>'{profile,slug}';
  perform pg_temp.check_caster(v_result->>'status' = 'ok' and v_slug = 'caster-phase-three'
    and public.caster_phase3_publish(c_owner,1)#>>'{profile,publication_id}' = v_revision::text,
    'publication creates a stable slug and repeating an unchanged version retains its immutable snapshot');
  v_original := public.caster_phase3_public_profile(v_slug);
  perform pg_temp.check_caster((v_original - array[
    'slug','publication_id','display_name','avatar','languages','games','platforms',
    'banner','bio','experience','links','videos','gallery','country'
  ]) = '{}'::jsonb and v_original->'country' = 'null'::jsonb and v_original::text not like '%private-discord-fixture%',
    'public profile keys are allowlisted with default private country and no Discord');
  perform pg_temp.check_caster(public.caster_phase3_directory(0,100)#>>'{0,display_name}' = 'Caster Phase Three'
    and public.caster_phase3_directory(0,100)#>'{0,platforms}' = '["twitch","youtube"]'::jsonb
    and public.caster_phase3_directory(0,100)#>'{0,bio}' is null,
    'directory only returns eligible card fields with provider indicators');
  perform pg_temp.check_caster(public.caster_phase3_public_media(v_slug,v_revision,v_avatar)->>'content_type' = 'image/webp'
    and public.caster_phase3_public_media(v_slug,v_revision,v_banner) is not null
    and public.caster_phase3_public_media(v_slug,v_revision,v_other_avatar) is null,
    'public media ties slug and revision to its own referenced assets');

  v_next_avatar := pg_temp.caster_media(c_owner, 'avatar');
  v_draft := jsonb_set(jsonb_set(v_draft,'{displayName}','"Changed caster"'),'{avatar}',to_jsonb(v_next_avatar));
  perform pg_temp.check_caster(public.caster_phase3_save(c_owner,1,v_draft,true)->>'status' = 'ok'
    and public.caster_phase3_public_profile(v_slug) = v_original
    and public.caster_phase3_public_media(v_slug,v_revision,v_next_avatar) is null,
    'private country, renamed content and replacement image stay private before publish');
  v_result := public.caster_phase3_publish(c_owner,2);
  v_next_revision := (v_result#>>'{profile,publication_id}')::uuid;
  perform pg_temp.check_caster(v_next_revision <> v_revision and v_result#>>'{profile,slug}' = v_slug
    and public.caster_phase3_public_profile(v_slug)->>'country' = 'GB'
    and public.caster_phase3_public_profile(v_slug)->>'display_name' = 'Changed caster'
    and public.caster_phase3_public_media(v_slug,v_revision,v_avatar) is null
    and public.caster_phase3_public_media(v_slug,v_next_revision,v_avatar) is null
    and public.caster_phase3_public_media(v_slug,v_next_revision,v_next_avatar) is not null,
    'republish switches atomic revision, preserves URL and removes previous media access');

  perform pg_temp.check_caster(public.caster_phase3_moderate(c_owner,v_application,0,'hide','Synthetic self attempt')->>'status' = 'locked',
    'staff caster cannot moderate themselves');
  v_result := public.caster_phase3_moderate(c_staff,v_application,0,'hide','Synthetic review');
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_public_profile(v_slug) is null
    and public.caster_phase3_public_media(v_slug,v_next_revision,v_next_avatar) is null,
    'administrator hide removes profile and media');
  v_result := public.caster_phase3_save(c_owner,2,v_draft,false);
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_publish(c_owner,3)->>'status' = 'hidden',
    'owner cannot override hide even after saving another draft');
  perform pg_temp.check_caster(public.caster_phase3_moderate(c_staff,v_application,0,'restore','Stale staff action')->>'status' = 'conflict',
    'moderation compare-and-set rejects stale action');
  v_result := public.caster_phase3_moderate(c_staff,v_application,1,'suspend','Synthetic suspension');
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_owner(c_owner)#>'{profile,draft}' = '{}'::jsonb
    and public.caster_phase3_publish(c_owner,3)->>'status' = 'locked'
    and public.caster_phase3_save(c_owner,3,v_draft,false)->>'status' = 'locked'
    and public.caster_phase2_save(c_owner,0,v_draft)->>'status' = 'locked'
    and public.caster_phase2_reserve_media(c_owner,'avatar',1024,'image/webp')->>'status' = 'locked'
    and public.caster_phase2_finish_media(c_owner,v_next_avatar,true)->>'status' = 'locked'
    and public.caster_phase2_get_media(c_owner,v_next_avatar,false)->>'status' = 'not_found',
    'suspension prevents Phase 3 writes and legacy draft and media callbacks');
  perform pg_temp.check_caster(public.caster_phase2_get_media(c_staff,v_next_avatar,true)->>'status' = 'ok'
    and jsonb_array_length(public.caster_phase3_admin_detail(c_staff,v_application)->'publications') = 2
    and jsonb_array_length(public.caster_phase3_admin_detail(c_staff,v_application)->'history') = 2
    and public.caster_phase3_admin_list(c_staff,'suspended','changed caster',0)#>>'{casters,0,application_id}' = v_application::text,
    'staff can inspect current suspended publication, media and retained history');
  v_result := public.caster_phase3_moderate(c_staff,v_application,2,'reinstate','Synthetic reinstatement');
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_public_profile(v_slug) is null,
    'reinstate preserves independent hidden status');
  v_result := public.caster_phase3_moderate(c_staff,v_application,3,'restore','Synthetic visibility restore');
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_public_profile(v_slug)->>'publication_id' = v_next_revision::text,
    'restore exposes only the current published snapshot');
  v_result := public.caster_phase3_publish(c_owner,3);
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_public_profile(v_slug)->'country' = 'null'::jsonb,
    'publishing with opt-in cleared removes country');
  v_result := public.caster_phase3_save(c_owner,3,
    jsonb_set(v_draft,'{bio,doc,content,0,privateEmail}','"private-email-fixture"'),false);
  perform pg_temp.check_caster(v_result->>'status' = 'ok'
    and public.caster_phase3_publish(c_owner,4)->>'status' = 'incomplete'
    and (public.caster_phase3_public_profile(v_slug)::text not like '%private-email-fixture%'),
    'unforeseen private biography keys cannot enter the public snapshot');
  perform pg_temp.check_caster((select count(*) = 0 from public.players where clerk_user_id in (c_owner,c_pending)),
    'publication and moderation never create competitive player rows');

  foreach v_actor in array array[c_other,c_race,c_closed] loop
    perform public.caster_phase2_grant(c_staff,v_actor,'Synthetic fixture');
    v_avatar := pg_temp.caster_media(v_actor, 'avatar');
    perform public.caster_phase3_save(v_actor,0,pg_temp.caster_draft(
      case v_actor when c_other then 'Caster Phase Three' when c_race then 'Caster Race' else 'Caster Closure' end,
      v_avatar),false);
  end loop;
  v_result := public.caster_phase3_publish(c_other,1);
  perform pg_temp.check_caster(v_result#>>'{profile,slug}' ~ '^caster-phase-three-[a-f0-9]{16}$'
    and public.caster_phase3_public_profile(v_slug)->>'display_name' = 'Changed caster',
    'slug collisions allocate distinct shareable URLs without moving existing profiles');
  perform pg_temp.check_caster(public.caster_phase3_save(c_race,1,
    pg_temp.caster_draft('Invitation',(public.caster_phase3_owner(c_race)#>>'{profile,draft,avatar}')::uuid),false)->>'status' = 'ok',
    'reserved-name fixture prepared for the concurrent publication test');
end;
$test$;
commit;
