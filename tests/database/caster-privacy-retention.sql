-- Entire disposal exercise is disposable and rolls back every fixture change.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
set local time zone 'UTC';

create function pg_temp.cp_id(n integer) returns uuid language sql immutable as $$
  select ('ca570005-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.cp_check(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Caster privacy: %',label; end if;
end;
$$;
create function pg_temp.cp_apply(kind text,id text) returns text language sql as $$
  select ironclad_private.caster_privacy_apply(kind,id,(select p.eligible_at
    from ironclad_private.caster_privacy_plan(clock_timestamp(),1000) p where p.category = kind and p.record_key = id));
$$;

insert into public.players (id,clerk_user_id,display_name,in_game_name,profile_completed,current_elo)
values (pg_temp.cp_id(1),'user_CasterPrivacyOperator','Synthetic Privacy Operator','Synthetic Privacy Operator',false,1000);
insert into ironclad_private.patch2_staff_authorizations (subject_digest,verification_reference)
values (sha256(convert_to('user_CasterPrivacyOperator','UTF8')),'disposable retention operator');
insert into public.tournaments (id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled,division_model_version)
values (pg_temp.cp_id(2),'Synthetic Caster Privacy Tournament','synthetic-caster-privacy','1v1','upcoming','','','',false,'four_division_v1');

insert into ironclad_private.caster_phase1_invitations (id,token_digest,reference,created_by,created_at,expires_at,claimed_at,claimed_by)
values (pg_temp.cp_id(10),sha256(convert_to('privacy-unclaimed-fixture','UTF8')),'Private invitation reference','user_CasterPrivacyOperator',
  now()-interval '130 days',now()-interval '123 days',null,null),
  (pg_temp.cp_id(11),sha256(convert_to('privacy-claimed-fixture','UTF8')),'Private claimed reference','user_CasterPrivacyOperator',
  now()-interval '130 days',now()-interval '123 days',now()-interval '128 days','user_CasterPrivacyAbandoned');
insert into ironclad_private.caster_applications (id,owner_clerk_user_id,invitation_id,status,draft,created_at,updated_at)
values (pg_temp.cp_id(20),'user_CasterPrivacyAbandoned',pg_temp.cp_id(11),'draft','{"discord":"private-draft"}',now()-interval '121 days',now()-interval '121 days'),
  (pg_temp.cp_id(21),'user_CasterPrivacyClosed',null,'approved','{"discord":"closed-private"}',now()-interval '130 days',now()-interval '40 days'),
  (pg_temp.cp_id(22),'user_CasterPrivacyActive',null,'approved','{}',now()-interval '250 days',now()-interval '20 days');
insert into ironclad_private.caster_memberships (application_id,status,granted_by,granted_at)
values (pg_temp.cp_id(21),'active','user_CasterPrivacyOperator',now()-interval '130 days'),
  (pg_temp.cp_id(22),'active','user_CasterPrivacyOperator',now()-interval '250 days');
insert into ironclad_private.caster_profiles (application_id,draft,version)
values (pg_temp.cp_id(21),'{}',1),(pg_temp.cp_id(22),'{}',2);

insert into storage.objects(bucket_id,name)
select 'caster-application-media',app_id::text || '/' || asset_id::text || '.webp'
from (values (pg_temp.cp_id(21),pg_temp.cp_id(31)),(pg_temp.cp_id(22),pg_temp.cp_id(32)),
  (pg_temp.cp_id(22),pg_temp.cp_id(33)),(pg_temp.cp_id(22),pg_temp.cp_id(34)),(pg_temp.cp_id(22),pg_temp.cp_id(35))) assets(app_id,asset_id);
insert into ironclad_private.caster_application_media (id,application_id,kind,object_path,content_type,size,state)
select asset_id,app_id,'avatar',app_id::text || '/' || asset_id::text || '.webp','image/webp',1024,'ready'
from (values (pg_temp.cp_id(21),pg_temp.cp_id(31)),(pg_temp.cp_id(22),pg_temp.cp_id(32)),
  (pg_temp.cp_id(22),pg_temp.cp_id(33)),(pg_temp.cp_id(22),pg_temp.cp_id(34)),(pg_temp.cp_id(22),pg_temp.cp_id(35))) assets(app_id,asset_id);
insert into ironclad_private.caster_profile_revisions (id,application_id,version,display_name,avatar,languages,games,bio,experience,links,videos,gallery,published_at)
values
  (pg_temp.cp_id(41),pg_temp.cp_id(21),1,'Closed identity to erase',pg_temp.cp_id(31),'["en"]','[]','{}','Personal content','[]','[]','{}',now()-interval '110 days'),
  (pg_temp.cp_id(42),pg_temp.cp_id(22),1,'Superseded identity',pg_temp.cp_id(33),'["en"]','[]','{}','Old content','[]','[]',
    array[pg_temp.cp_id(32)],now()-interval '230 days'),
  (pg_temp.cp_id(43),pg_temp.cp_id(22),2,'Active synthetic identity',pg_temp.cp_id(32),'["en"]','[]','{}','Current content','[]','[]','{}',now()-interval '100 days');
update ironclad_private.caster_profiles set slug = 'synthetic-privacy-closed',publication_id = pg_temp.cp_id(41) where application_id = pg_temp.cp_id(21);
update ironclad_private.caster_profiles set slug = 'synthetic-privacy-active',publication_id = pg_temp.cp_id(43) where application_id = pg_temp.cp_id(22);
update ironclad_private.caster_privacy_media_retirements set unreferenced_since = now()-interval '30 days'
where media_id in (pg_temp.cp_id(34),pg_temp.cp_id(35));

insert into ironclad_private.patch2_closed_accounts (subject_digest,closed_at)
values (sha256(convert_to('user_CasterPrivacyClosed','UTF8')),now()-interval '30 days');
insert into ironclad_private.caster_assignments(id,application_id,tournament_id,live_tournament_id,tournament_title,
  status,covered_at,verified_at,verified_by,broadcast_url,recording_url)
values (pg_temp.cp_id(51),pg_temp.cp_id(21),pg_temp.cp_id(2),pg_temp.cp_id(2),'Synthetic Caster Privacy Tournament',
  'completed',now()-interval '100 days',now()-interval '99 days','user_CasterPrivacyOperator',
  'https://www.twitch.tv/privatecaster','https://www.twitch.tv/videos/99999'),
  (pg_temp.cp_id(52),pg_temp.cp_id(22),pg_temp.cp_id(2),pg_temp.cp_id(2),'Synthetic Caster Privacy Tournament',
  'completed',now()-interval '41 days',now()-interval '40 days','user_CasterPrivacyOperator',null,null);
insert into ironclad_private.caster_assignment_events (assignment_id,version,action,actor,reason,current,created_at)
values (pg_temp.cp_id(51),1,'complete','user_CasterPrivacyOperator','Closed identity',
  '{"status":"completed","recording_url":"https://www.twitch.tv/videos/99999","owner":"private"}',now()-interval '99 days'),
  (pg_temp.cp_id(52),1,'complete','user_CasterPrivacyOperator','Old audit',
  '{"status":"completed","owner":"private","verified_by":"user_CasterPrivacyOperator"}',now()-interval '400 days');

insert into public.tournament_media (id,tournament_id,media_type,title,url,published,caster_managed)
values (pg_temp.cp_id(60),pg_temp.cp_id(2),'video','Closed caster video','https://www.twitch.tv/videos/99999',false,true),
  (pg_temp.cp_id(61),pg_temp.cp_id(2),'video','Keep native media and approval','https://www.twitch.tv/videos/99998',true,false);
insert into ironclad_private.caster_media_links (id,media_id,application_id,tournament_id,tournament_title,tournament_slug_snapshot,url_digest,published_at,created_at,updated_at)
values (pg_temp.cp_id(60),pg_temp.cp_id(60),pg_temp.cp_id(21),pg_temp.cp_id(2),'Synthetic Caster Privacy Tournament','synthetic-caster-privacy',
  sha256(convert_to('https://www.twitch.tv/videos/99999','UTF8')),now()-interval '95 days',now()-interval '95 days',now()-interval '95 days');

do $fixture$
declare
  c_operator constant text := 'user_CasterPrivacyOperator';
  v_cutoff timestamptz := now();
  v_clock timestamptz;
  v_hold uuid;
  v_former jsonb;
  v_path text;
  v_effect text;
  v_retry text;
begin
  perform pg_temp.cp_check(not has_function_privilege('anon','public.caster_privacy_public_verified_tournaments(uuid[])','EXECUTE')
    and not has_function_privilege('authenticated','public.caster_privacy_media_claim(text,uuid[])','EXECUTE')
    and not has_function_privilege('service_role','ironclad_private.caster_privacy_apply(text,text,timestamptz)','EXECUTE')
    and not has_table_privilege('service_role','ironclad_private.caster_privacy_control','UPDATE'),'staff and owner-only ACLs');
  perform pg_temp.cp_check(not ironclad_private.caster_privacy_enabled()
    and pg_temp.cp_apply('application',pg_temp.cp_id(20)::text) = 'disabled'
    and public.caster_privacy_media_claim(c_operator,array[pg_temp.cp_id(34)])->>'status' = 'disabled','irreversible operations start disabled');
  begin
    perform public.caster_privacy_media_claim('user_CasterPrivacyActive',array[pg_temp.cp_id(34)]);
    raise exception 'ordinary caster could execute privacy operator function';
  exception when insufficient_privilege then null;
  end;

  select item into v_former from jsonb_array_elements(public.caster_privacy_public_verified_tournaments(array[pg_temp.cp_id(2)])) item
    where item->>'former_caster' = 'true';
  perform pg_temp.cp_check((v_former->>'id')::uuid <> pg_temp.cp_id(51) and v_former->>'caster' is null
    and not v_former ?| array['broadcast_url','recording_url','media_id','application_id','verified_by','owner_clerk_user_id']
    and date_trunc('day',(v_former->>'covered_at')::timestamptz) = (v_former->>'covered_at')::timestamptz,
    'former attribution retains date and context only with independent ID');
  perform pg_temp.cp_check(public.caster_phase3_public_profile('synthetic-privacy-closed') is null
    and public.caster_media_public_profile('synthetic-privacy-closed') = '[]'::jsonb,
    'closed profile and owner-submitted videos stay withdrawn');

  perform pg_temp.cp_check(not exists(select from ironclad_private.caster_privacy_plan(v_cutoff-interval '1 microsecond',1000)
    where category = 'media' and record_key = pg_temp.cp_id(34)::text)
    and exists(select from ironclad_private.caster_privacy_plan(v_cutoff,1000)
    where category = 'media' and record_key = pg_temp.cp_id(34)::text),'exact thirty-day cutoff');

  update ironclad_private.caster_privacy_control set irreversible_enabled = true where singleton;
  v_hold := ironclad_private.caster_privacy_place_hold('invitation',pg_temp.cp_id(11),'SYNTHETIC123','appeal',clock_timestamp()+interval '7 days');
  perform pg_temp.cp_check(pg_temp.cp_apply('application',pg_temp.cp_id(20)::text) = 'held', 'linked invitation hold protects application');
  perform pg_temp.cp_check(ironclad_private.caster_privacy_release_hold(v_hold), 'explicit release reopens retention eligibility');
  v_effect := pg_temp.cp_apply('application',pg_temp.cp_id(20)::text);
  perform pg_temp.cp_check(v_effect = 'ok'
    and (select draft = '{}' and owner_clerk_user_id = 'user_CasterPrivacyAbandoned'
      from ironclad_private.caster_applications where id = pg_temp.cp_id(20)), 'abandoned payload erased without disturbing open account identity');
  v_effect := pg_temp.cp_apply('invitation',pg_temp.cp_id(10)::text);
  perform pg_temp.cp_check(v_effect = 'ok'
    and (select reference is null and created_by = 'redacted' and token_digest <> sha256(convert_to('privacy-unclaimed-fixture','UTF8'))
      from ironclad_private.caster_phase1_invitations where id = pg_temp.cp_id(10)), 'expired invitation material minimized');
  v_effect := pg_temp.cp_apply('profile_revision',pg_temp.cp_id(42)::text);
  perform pg_temp.cp_check(v_effect = 'ok'
    and exists(select from ironclad_private.caster_profile_revisions where id = pg_temp.cp_id(43))
    and not exists(select from ironclad_private.caster_privacy_media_retirements where media_id = pg_temp.cp_id(32))
    and exists(select from ironclad_private.caster_privacy_media_retirements where media_id = pg_temp.cp_id(33) and unreferenced_since >= v_cutoff),
    'superseded revision removed and shared live reference protected');
  v_effect := public.caster_privacy_media_claim(c_operator,array[pg_temp.cp_id(34),pg_temp.cp_id(32)])->>'status';
  perform pg_temp.cp_check(v_effect = 'blocked'
    and (select claimed_at is null from ironclad_private.caster_privacy_media_retirements where media_id = pg_temp.cp_id(34)),
    'aliased active asset blocks entire removal batch');

  v_path := public.caster_privacy_media_claim(c_operator,array[pg_temp.cp_id(34)])#>>'{assets,0,path}';
  perform pg_temp.cp_check(v_path = pg_temp.cp_id(22)::text || '/' || pg_temp.cp_id(34)::text || '.webp'
    and (select state = 'failed' from ironclad_private.caster_application_media where id = pg_temp.cp_id(34)),
    'claim returns only the exact path and makes media unavailable to writes');
  begin
    perform ironclad_private.caster_privacy_place_hold('application',pg_temp.cp_id(22),'SYNTHETIC456','appeal',clock_timestamp()+interval '7 days');
    raise exception 'hold accepted after irreversible Storage claim';
  exception when object_not_in_prerequisite_state then null;
  end;
  perform pg_temp.cp_check(public.caster_privacy_media_finish(c_operator,pg_temp.cp_id(34))->>'status' = 'storage_present',
    'owned metadata cannot finalize before the Storage API removed the object');
  -- This metadata deletion simulates the external API in the disposable fake
  -- Storage fixture. The deployed migration never deletes storage.objects.
  delete from storage.objects where bucket_id = 'caster-application-media' and name = v_path;
  v_effect := public.caster_privacy_media_finish(c_operator,pg_temp.cp_id(34))->>'status';
  v_retry := public.caster_privacy_media_finish(c_operator,pg_temp.cp_id(34))->>'status';
  perform pg_temp.cp_check(v_effect = 'ok' and v_retry = 'ok'
    and not exists(select from ironclad_private.caster_application_media where id = pg_temp.cp_id(34)),
    'finished cleanup removes only the leased metadata and is retry-safe');

  select eligible_at into strict v_clock from ironclad_private.caster_privacy_plan(clock_timestamp(),1000)
    where category = 'closed_application' and record_key = pg_temp.cp_id(21)::text;
  v_effect := ironclad_private.caster_privacy_apply('closed_application',pg_temp.cp_id(21)::text,v_clock);
  v_retry := ironclad_private.caster_privacy_apply('closed_application',pg_temp.cp_id(21)::text,v_clock);
  perform pg_temp.cp_check(v_effect = 'ok' and v_retry = 'already_completed',
    'closed identity erasure is exact and retry-safe');
  perform pg_temp.cp_check(not exists(select from ironclad_private.caster_applications where owner_clerk_user_id = 'user_CasterPrivacyClosed')
    and not exists(select from ironclad_private.caster_profile_revisions where id = pg_temp.cp_id(41))
    and not exists(select from public.tournament_media where id = pg_temp.cp_id(60))
    and exists(select from public.tournament_media where id = pg_temp.cp_id(61) and published)
    and exists(select from ironclad_private.caster_assignments where id = pg_temp.cp_id(51) and status = 'completed' and recording_url is null)
    and exists(select from ironclad_private.caster_privacy_plan(clock_timestamp(),1000) where category = 'media' and record_key = pg_temp.cp_id(31)::text)
    and public.caster_privacy_public_verified_tournaments(array[pg_temp.cp_id(2)]) @> jsonb_build_array(v_former),
    'erasure removes private media access and links while retaining neutral history and native tournament data');
  update ironclad_private.caster_profiles set slug = 'synthetic-privacy-closed' where application_id = pg_temp.cp_id(22);
  perform pg_temp.cp_check((select slug like 'synthetic-privacy-closed-%' from ironclad_private.caster_profiles where application_id = pg_temp.cp_id(22)),
    'erased profile URL cannot start identifying another caster');
  v_effect := pg_temp.cp_apply('coverage_audit',(select id::text from ironclad_private.caster_assignment_events
    where assignment_id = pg_temp.cp_id(52)));
  perform pg_temp.cp_check(v_effect = 'ok'
    and (select actor = 'redacted' and reason is null and current = '{"status":"completed"}'
      from ironclad_private.caster_assignment_events where assignment_id = pg_temp.cp_id(52)),
    'audit minimization retains the integrity record without old identity fields');
end;
$fixture$;

rollback;
