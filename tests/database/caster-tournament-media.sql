begin;
set local request.jwt.claims = '{"role":"service_role"}';

create function pg_temp.cm_id(n integer) returns uuid language sql immutable as $$
  select ('ca570004-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;

create function pg_temp.cm_check(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Caster Tournament Media: %',p_label; end if;
end;
$$;

do $media$
declare
  c_owner constant text := 'user_CasterPhase3Other';
  c_staff constant text := 'user_CasterPhase3Staff';
  c_race constant text := 'user_CasterPhase3Race';
  c_unrelated constant text := 'user_UnrelatedMediaActor';
  v_application uuid := (select id from ironclad_private.caster_applications where owner_clerk_user_id=c_owner);
  v_race_application uuid := (select id from ironclad_private.caster_applications where owner_clerk_user_id=c_race);
  v_slug text := public.caster_phase3_owner(c_owner)#>>'{profile,slug}';
  v_race_slug text;
  v_tournament uuid := pg_temp.cm_id(1);
  v_division uuid := pg_temp.cm_id(11);
  v_match uuid := pg_temp.cm_id(73);
  v_legacy uuid := current_setting('fixture.caster_verified_history')::uuid;
  v_match_media uuid;
  v_tournament_media uuid;
  v_race_media uuid;
  v_date text;
  v_result jsonb;
  v_rows jsonb;
  v_index integer;
begin
  perform pg_temp.cm_check(public.caster_media_owner(c_owner)->>'status'='ok'
    and public.caster_media_owner(c_unrelated)->>'status'='legal_required'
    and public.caster_media_owner('user_CasterPhase3Closed')->>'status'='closed',
    'current legal acceptance, approval and an open account are enforced');
  perform pg_temp.cm_check(public.caster_media_save(c_race,null,null,v_tournament,null,null,
    'Waiting on profile','https://www.youtube.com/watch?v=Waiting1234',null,'save')->>'status'='profile_required',
    'caster explicitly publishes a profile before publishing media');
  perform pg_temp.cm_check(public.caster_media_owner(c_staff)->>'status'='not_found',
    'administrative permission alone cannot publish caster media');
  perform pg_temp.cm_check(public.caster_media_contexts(c_owner,v_tournament)#>>'{matches,0,id}'=v_match::text
    and public.caster_media_contexts(c_owner,pg_temp.cm_id(2))->'divisions'='[]'::jsonb
    and public.caster_media_admin_contexts(c_staff,v_tournament)#>>'{divisions,0,id}'=v_division::text,
    'owner and staff can discover real public contexts; unreleased matches remain private');
  perform pg_temp.cm_check(public.caster_media_save(c_owner,null,null,pg_temp.cm_id(2),pg_temp.cm_id(12),pg_temp.cm_id(52),
    'Unreleased','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save')->>'status'='target_unavailable'
    and public.caster_media_save(c_owner,null,null,v_tournament,pg_temp.cm_id(12),v_match,
    'Wrong division','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save')->>'status'='target_unavailable'
    and public.caster_media_save(c_owner,null,null,v_tournament,null,null,
    'Unsafe','https://www.twitch.tv@private.invalid/videos/1',null,'save')->>'status'='invalid',
    'target ancestry, publication and canonical recording URL are enforced by SQL');

  v_result := public.caster_media_save(c_owner,null,null,v_tournament,v_division,v_match,
    'Caster match VOD','https://www.youtube.com/watch?v=ABCDEFGHIJK','Caster content','save');
  v_match_media := (v_result#>>'{media,id}')::uuid;
  v_date := v_result#>>'{media,published_at}';
  perform pg_temp.cm_check(v_result->>'status'='ok' and v_result#>>'{media,publicly_visible}'='true' and v_date is not null
    and (select caster_managed and not published and match_id=v_match from public.tournament_media where id=v_match_media)
    and not exists(select from ironclad_private.caster_assignments where application_id=v_application and match_id=v_match),
    'a single canonical media item publishes immediately without an assignment or legacy reader leak');
  v_rows := public.caster_media_public_tournaments(array[v_tournament]);
  perform pg_temp.cm_check((select count(*)=1 from jsonb_array_elements(v_rows) item where item->>'id'=v_match_media::text)
    and public.caster_media_public_profile(v_slug)#>>'{0,id}'=v_match_media::text
    and not v_rows::text like '%application_id%' and not v_rows::text like '%verified_by%'
    and not v_rows::text like '%user_CasterPhase3Other%'
    and not public.caster_media_public_tournaments(array[v_tournament],false)::text like '%'||v_match_media||'%',
    'the same canonical ID appears in both public projections; disable path preserves old media only');
  perform pg_temp.cm_check(public.caster_media_save(c_owner,null,null,pg_temp.cm_id(2),null,null,
    'Same URI','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save')->>'status'='duplicate'
    and (select count(*)=1 from public.tournament_media where caster_managed),
    'same source retry or scope change cannot create a second canonical row');

  perform pg_temp.cm_check(public.caster_media_save(c_race,v_match_media,1,v_tournament,v_division,v_match,
    'Steal','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save')->>'status'='not_found',
    'another approved caster cannot acquire a different owner’s record');
  v_result := public.caster_media_save(c_owner,v_match_media,1,v_tournament,v_division,v_match,
    'Edited match VOD','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save');
  perform pg_temp.cm_check(v_result#>>'{media,published_at}'=v_date and v_result#>>'{media,version}'='2'
    and public.caster_media_public_profile(v_slug)#>>'{0,title}'='Edited match VOD',
    'metadata edits update both destinations while preserving publication time');
  v_result := public.caster_media_save(c_owner,v_match_media,2,null,null,null,null,null,null,'unpublish');
  perform pg_temp.cm_check(v_result#>>'{media,publicly_visible}'='false'
    and public.caster_media_public_profile(v_slug)='[]'::jsonb,
    'owner unpublish is immediate and retains the record');
  v_result := public.caster_media_save(c_owner,v_match_media,3,v_tournament,v_division,v_match,
    'Reposted match VOD','https://www.youtube.com/watch?v=ABCDEFGHIJK',null,'save');
  perform pg_temp.cm_check(v_result#>>'{media,id}'=v_match_media::text and v_result#>>'{media,version}'='4',
    'republish uses the original canonical ID');

  v_result := public.caster_media_save(c_owner,null,null,v_tournament,null,null,'Whole event VOD',
    'https://www.twitch.tv/videos/817',null,'save');
  v_tournament_media := (v_result#>>'{media,id}')::uuid;
  v_result := public.caster_media_admin_moderate(c_staff,v_tournament_media,1,'correct',v_tournament,v_division,null,'Correct division');
  perform pg_temp.cm_check(v_result#>>'{media,scope}'='division' and v_result#>>'{media,version}'='2'
    and public.caster_media_admin_list(c_staff,0)#>>'{media,0,events,0,reason}'='Correct division',
    'staff correct association atomically and preserve audit');
  v_result := public.caster_media_admin_moderate(c_staff,v_tournament_media,2,'hide',null,null,null,'Synthetic moderation');
  perform pg_temp.cm_check(v_result#>>'{media,moderation_status}'='hidden'
    and public.caster_media_save(c_owner,v_tournament_media,3,v_tournament,null,null,'Attempt restore',
      'https://www.twitch.tv/videos/817',null,'save')->>'status'='moderated'
    and public.caster_media_save(c_owner,null,null,pg_temp.cm_id(2),null,null,'Different target',
      'https://www.twitch.tv/videos/817',null,'save')->>'status'='duplicate'
    and not public.caster_media_public_tournaments(array[v_tournament])::text like '%'||v_tournament_media||'%'
    and not public.caster_media_public_profile(v_slug)::text like '%'||v_tournament_media||'%',
    'moderation removes both public entries and an owner cannot restore or re-add the same URL');
  v_result := public.caster_media_admin_moderate(c_staff,v_tournament_media,3,'remove',null,null,null,'Synthetic removal');
  perform pg_temp.cm_check(v_result#>>'{media,moderation_status}'='removed'
    and exists(select from public.tournament_media where id=v_tournament_media),
    'staff removal is durable and preserves the canonical record and audit');
  -- The canonical foreign key may delete this row with the tournament. Its
  -- replacement/history must still be understandable to authorized readers.
  delete from public.tournament_media where id=v_tournament_media;
  perform pg_temp.cm_check((select item->>'tournament_slug' is not null and item->>'title'='Whole event VOD'
    from jsonb_array_elements(public.caster_media_admin_list(c_staff,0)->'media') item
    where item->>'id'=v_tournament_media::text), 'canonical deletion preserves the private contextual audit snapshot');

  perform pg_temp.cm_check(public.caster_media_correct_verified_history(c_staff,v_legacy,2,now()-interval '3 hours',
    null,'https://www.twitch.tv/videos/919',null,'Correct archived coverage')->>'status'='ok'
    and public.caster_phase4_admin_history(c_staff,v_legacy)#>>'{events,0,action}'='correct'
    and public.caster_phase4_public_history(v_slug)::text like '%'||v_legacy||'%',
    'explicit verified legacy correction and existing history survive scheduling retirement');
  perform pg_temp.cm_check(public.caster_media_owner_verified_history(c_owner)#>>'{assignments,0,id}'=v_legacy::text
    and jsonb_array_length(public.caster_media_owner_verified_history(c_owner)->'assignments')=1
    and public.caster_media_public_verified_tournaments(array[pg_temp.cm_id(2)])#>>'{0,id}'=v_legacy::text
    and jsonb_array_length(public.caster_media_public_verified_tournaments(array[pg_temp.cm_id(2)]))=1,
    'replacement history readers expose only governed completed legacy records');

  delete from public.generated_brackets where id=pg_temp.cm_id(71);
  perform pg_temp.cm_check((select match_id is null from public.tournament_media where id=v_match_media)
    and public.caster_media_public_profile(v_slug)='[]'::jsonb
    and public.caster_media_owner(c_owner)::text like '%Replacement Final · 1%',
    'bracket regeneration does not retarget media and keeps historical private scope');

  perform pg_temp.cm_check(public.caster_phase3_publish(c_race,2)->>'status'='ok', 'publish second synthetic profile');
  v_race_slug := public.caster_phase3_owner(c_race)#>>'{profile,slug}';
  v_result := public.caster_media_save(c_race,null,null,v_tournament,null,null,'Temporary caster VOD',
    'https://www.twitch.tv/videos/818',null,'save');
  v_race_media := (v_result#>>'{media,id}')::uuid;
  v_result := public.caster_phase3_moderate(c_staff,v_race_application,0,'hide','Synthetic profile hide');
  perform pg_temp.cm_check(v_result->>'status'='ok'
    and public.caster_media_public_profile(v_race_slug)='[]'::jsonb
    and not public.caster_media_public_tournaments(array[v_tournament])::text like '%'||v_race_media||'%',
    'profile hide withdraws both public projections');
  perform pg_temp.cm_check(public.caster_media_save(c_race,v_race_media,1,null,null,null,null,null,null,'unpublish')->>'status'='ok',
    'a hidden profile still permits removal of the caster’s own media');
  perform pg_temp.cm_check(public.caster_phase3_moderate(c_staff,v_race_application,1,'restore','Synthetic profile restore')->>'status'='ok',
    'restore synthetic profile');
  perform pg_temp.cm_check(public.caster_media_save(c_race,v_race_media,2,v_tournament,null,null,'Caster closure VOD',
    'https://www.twitch.tv/videos/818',null,'save')->>'status'='ok', 'republish under eligible profile');
  v_result := public.caster_phase3_moderate(c_staff,v_race_application,2,'suspend','Synthetic suspension');
  perform pg_temp.cm_check(v_result->>'status'='ok'
    and public.caster_media_owner(c_race)->>'status'='not_found' and public.caster_media_public_profile(v_race_slug)='[]'::jsonb
    and not public.caster_media_public_tournaments(array[v_tournament])::text like '%'||v_race_media||'%',
    'suspension removes owner access and both public projections');
  perform pg_temp.cm_check(public.caster_phase3_moderate(c_staff,v_race_application,3,'reinstate','Synthetic reinstatement')->>'status'='ok',
    'reinstate the synthetic caster');
  perform public.close_ironclad_player_account(c_race);
  perform pg_temp.cm_check(public.caster_media_owner(c_race)->>'status'='closed'
    and public.caster_media_public_profile(v_race_slug)='[]'::jsonb
    and not public.caster_media_public_tournaments(array[v_tournament])::text like '%'||v_race_media||'%'
    and exists(select from ironclad_private.caster_media_events where link_id=v_race_media),
    'account closure removes both public and owner access and preserves private authority history');

  v_result := public.caster_media_owner(c_owner);
  perform pg_temp.cm_check(v_result->>'published_count'='0' and v_result->'covered_tournament_ids'='[]'::jsonb,
    'Overview excludes moderated and detached media while the owner keeps private history');
  for v_index in 1..201 loop
    v_result := public.caster_media_save(c_owner,null,null,
      case when v_index=1 then pg_temp.cm_id(2) else v_tournament end,null,null,'Overview fixture',
      'https://www.twitch.tv/videos/'||(70000+v_index)::text,null,'save');
    perform pg_temp.cm_check(v_result->>'status'='ok','create Overview paging fixture');
  end loop;
  v_result := public.caster_media_owner(c_owner);
  perform pg_temp.cm_check(v_result->>'published_count'='201' and jsonb_array_length(v_result->'media')=200
    and v_result->'covered_tournament_ids'=to_jsonb(array[v_tournament,pg_temp.cm_id(2)])
    and not exists(select from jsonb_array_elements(v_result->'media') item
      where item->>'tournament_id'=pg_temp.cm_id(2)::text),
    'Overview counts all currently visible media and distinct tournaments beyond the capped list');
end;
$media$;

commit;
