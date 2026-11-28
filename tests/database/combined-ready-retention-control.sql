begin;

set local request.jwt.claims = '{"role":"service_role"}';
insert into public.players (id,clerk_user_id,display_name,in_game_name,profile_completed,current_elo)
values ('ca570005-0000-4000-8000-000000000096','user_SyntheticReadyRetention',
  'Synthetic Ready retention operator','Synthetic Ready retention operator',false,1000);
reset request.jwt.claims;
insert into ironclad_private.ready_usage_consent (player_id,account_key)
values ('ca570005-0000-4000-8000-000000000096','ca570005-0000-4000-8000-000000000097');
insert into ironclad_private.ready_usage_events
  (event_id,account_key,session_key,received_at,usage_day,event_type,menu_version,catalogue_version)
values ('ca570005-0000-4000-8000-000000000098','ca570005-0000-4000-8000-000000000097',
  'ca570005-0000-4000-8000-000000000099',clock_timestamp()-interval '95 days',current_date-95,'manual_open','2','1');
insert into ironclad_private.ready_topic_suggestions (id,submitted_at,description,menu_version,catalogue_version)
values ('ca570005-0000-4000-8000-000000000100',clock_timestamp()-interval '95 days','Synthetic expired suggestion','2','1');

do $ready_retention$
begin
  if has_function_privilege('service_role','ironclad_private.maintain_ready_usage()','execute')
    or has_function_privilege('service_role','ironclad_private.maintain_ready_topic_suggestions()','execute') then
    raise exception 'Routine Ready cleanup must be operator-only';
  end if;
  perform ironclad_private.maintain_ready_usage();
  perform ironclad_private.maintain_ready_topic_suggestions();
  if not exists(select from ironclad_private.ready_usage_events where event_id='ca570005-0000-4000-8000-000000000098')
    or not exists(select from ironclad_private.ready_topic_suggestions where id='ca570005-0000-4000-8000-000000000100') then
    raise exception 'Default schedules processed irreversible Ready cleanup';
  end if;
  update ironclad_private.caster_privacy_control set irreversible_enabled = true where singleton;
  perform ironclad_private.maintain_ready_usage();
  perform ironclad_private.maintain_ready_topic_suggestions();
  if not exists(select from ironclad_private.ready_usage_events where event_id='ca570005-0000-4000-8000-000000000098')
    or not exists(select from ironclad_private.ready_topic_suggestions where id='ca570005-0000-4000-8000-000000000100') then
    raise exception 'Caster disposal approval enabled Ready schedules';
  end if;
  update ironclad_private.caster_privacy_control set ready_scheduled_cleanup_enabled = true where singleton;
  perform ironclad_private.maintain_ready_usage();
  perform ironclad_private.maintain_ready_topic_suggestions();
  if exists(select from ironclad_private.ready_usage_events where event_id='ca570005-0000-4000-8000-000000000098')
    or exists(select from ironclad_private.ready_topic_suggestions where id='ca570005-0000-4000-8000-000000000100')
    or exists(select from ironclad_private.ready_usage_daily where usage_day=current_date-95 and event_type='manual_open') then
    raise exception 'Explicitly approved Ready disposal must erase details and suppress an aggregate from a single account';
  end if;
end;
$ready_retention$;

rollback;
