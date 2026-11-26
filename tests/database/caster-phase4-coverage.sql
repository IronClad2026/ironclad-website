begin;
set local request.jwt.claims = '{"role":"service_role"}';

create function pg_temp.c4_id(n integer) returns uuid language sql immutable as $$
  select ('ca570004-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;

create function pg_temp.c4_check(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Caster Phase 4: %',p_label; end if;
end;
$$;

create function pg_temp.c4_save(
  p_action text,p_id uuid default null,p_version integer default null,p_caster uuid default null,
  p_tournament uuid default null,p_division uuid default null,p_match uuid default null,
  p_covered timestamptz default null,p_broadcast text default null,p_recording text default null,
  p_media uuid default null,p_ack boolean default false,p_reason text default null
) returns jsonb language sql as $$
  select public.caster_phase4_admin_save('user_CasterPhase3Staff',p_id,p_version,p_caster,p_tournament,p_division,p_match,
    p_action,now()+interval '1 hour',p_covered,p_broadcast,p_recording,p_media,p_ack,p_reason);
$$;

-- Existing Phase 3 disposable fixture supplies two published synthetic casters.
-- For the competition fixture, keep CHECK/FK enforcement and avoid normal
-- production roster/provider setup. Restore all user triggers before testing.
alter table public.players disable trigger user;
alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;
insert into public.players (id,clerk_user_id,display_name,in_game_name,profile_completed,current_elo)
values (pg_temp.c4_id(31),'user_CasterPhase3Owner','Caster Synthetic','Caster Synthetic',true,1000),
       (pg_temp.c4_id(32),'user_CasterPhase4Opponent','Caster Synthetic','Caster Synthetic',true,1000);
insert into public.tournaments (id,title,slug,format,status,description,banner_image_url,prize_pool,
  registration_enabled,division_model_version)
values (pg_temp.c4_id(1),'Caster Coverage Test','caster-coverage-test','1v1','in_progress','Synthetic coverage','','',false,'four_division_v1'),
       (pg_temp.c4_id(2),'Caster Coverage Future','caster-coverage-future','1v1','upcoming','Synthetic coverage','','',false,'four_division_v1');
insert into public.tournament_brackets (id,tournament_id,name,elo_rules,max_players,launched_at)
values (pg_temp.c4_id(11),pg_temp.c4_id(1),'Academy','0-1099',8,now()-interval '2 hours'),
       (pg_temp.c4_id(12),pg_temp.c4_id(2),'Academy','0-1099',8,null);
insert into public.registrations (
  id,profile_id,clerk_user_id,player_name,tournament_title,bracket_name,registration_status,elo_status,submitted_elo,
  tournament_id,tournament_bracket_id,elo_verified_elo,elo_highest_faction,elo_checked_mode,elo_checked_at,
  elo_verification_source,elo_verified_division,elo_calculation_version
)
select pg_temp.c4_id(40+n),p.id,p.clerk_user_id,p.display_name,'Caster Coverage Test','Academy','approved','verified',1000,
  pg_temp.c4_id(1),pg_temp.c4_id(11),1000,'US Forces','1v1',now(),'relic','Academy','relic-highest-1v1-v2'
from generate_series(1,2) n join public.players p on p.id=pg_temp.c4_id(30+n);
insert into public.generated_brackets (id,tournament_bracket_id,format,participant_count,slot_count,generated_by)
values (pg_temp.c4_id(21),pg_temp.c4_id(11),'single_elimination',2,2,'user_CasterPhase3Staff'),
       (pg_temp.c4_id(22),pg_temp.c4_id(12),'single_elimination',2,2,'user_CasterPhase3Staff');
insert into public.bracket_rounds (id,generated_bracket_id,round_number,name)
values (pg_temp.c4_id(23),pg_temp.c4_id(21),1,'Synthetic Final'),
       (pg_temp.c4_id(24),pg_temp.c4_id(22),1,'Unreleased Round');
insert into public.tournament_matches (id,generated_bracket_id,round_id,match_number,player_one_registration_id,
  player_two_registration_id,status,series_best_of)
values (pg_temp.c4_id(51),pg_temp.c4_id(21),pg_temp.c4_id(23),1,pg_temp.c4_id(41),pg_temp.c4_id(42),'scheduled',3),
       (pg_temp.c4_id(52),pg_temp.c4_id(22),pg_temp.c4_id(24),1,null,null,'scheduled',3);
alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;
alter table public.players enable trigger user;

insert into public.tournament_media (id,tournament_id,title,url,media_type,match_id,published)
values (pg_temp.c4_id(61),pg_temp.c4_id(1),'Published match VOD','https://www.twitch.tv/videos/215','match_cast',pg_temp.c4_id(51),true),
       (pg_temp.c4_id(62),pg_temp.c4_id(1),'Not published','https://www.twitch.tv/videos/216','match_cast',pg_temp.c4_id(51),false),
       (pg_temp.c4_id(63),pg_temp.c4_id(1),'Restricted proof','https://www.ironclad-tournaments.example/api/private-replay','match_cast',pg_temp.c4_id(51),true);

do $coverage$
declare
  c_staff constant text := 'user_CasterPhase3Staff';
  c_owner constant text := 'user_CasterPhase3Owner';
  c_other constant text := 'user_CasterPhase3Other';
  v_owner uuid := (select id from ironclad_private.caster_applications where owner_clerk_user_id=c_owner);
  v_other uuid := (select id from ironclad_private.caster_applications where owner_clerk_user_id=c_other);
  v_t uuid := pg_temp.c4_id(1);
  v_d uuid := pg_temp.c4_id(11);
  v_m uuid := pg_temp.c4_id(51);
  v_owner_slug text := public.caster_phase3_owner(c_owner)#>>'{profile,slug}';
  v_other_slug text := public.caster_phase3_owner(c_other)#>>'{profile,slug}';
  v_t_row uuid;
  v_d_row uuid;
  v_m_row uuid;
  v_target uuid;
  v_result jsonb;
  v_events jsonb;
  v_coverage_day timestamptz := date_trunc('day', now() - interval '1 day', 'UTC') + interval '12 hours';
begin
  perform pg_temp.c4_check((
    select count(*)=8 and bool_and(has_function_privilege('service_role',f.oid,'EXECUTE'))
      and bool_and(not has_function_privilege('anon',f.oid,'EXECUTE'))
      and bool_and(not has_function_privilege('authenticated',f.oid,'EXECUTE'))
    from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='public' and f.proname like 'caster_phase4_%'
  ),'caster coverage RPC grants');
  perform pg_temp.c4_check((
    select count(*)=2 and bool_and(c.relrowsecurity and not has_table_privilege('service_role',c.oid,'UPDATE'))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ironclad_private'
      and c.relname in ('caster_assignments','caster_assignment_events')
  ),'private assignments and audit enforce RLS');
  perform pg_temp.c4_check(public.caster_phase4_admin_conflict(c_staff,v_owner,v_t,null,null)->>'conflict'='tournament'
    and public.caster_phase4_admin_conflict(c_staff,v_owner,v_t,v_d,null)->>'conflict'='division'
    and public.caster_phase4_admin_conflict(c_staff,v_owner,v_t,v_d,v_m)->>'conflict'='own_match'
    and public.caster_phase4_admin_conflict(c_staff,v_other,v_t,v_d,v_m)->>'conflict'='none',
    'participation checks actual identities and scope');
  perform pg_temp.c4_check(pg_temp.c4_save('create',p_caster=>v_owner,p_tournament=>v_t,p_division=>pg_temp.c4_id(12),
    p_match=>v_m)->>'status'='target_unavailable','canonical match and division ancestry');
  perform pg_temp.c4_check(pg_temp.c4_save('create',p_caster=>v_owner,p_tournament=>v_t,p_division=>v_d,
    p_match=>v_m,p_ack=>true)->>'status'='own_match_ack_required','own match requires acknowledgement and reason');
  perform pg_temp.c4_check(public.caster_phase4_admin_save(c_owner,null,null,v_owner,v_t,null,null,
    'create',null,null,null,null,null,false,null)->>'status'='locked','staff casters cannot assign themselves');
  v_result := public.caster_phase4_admin_assign(c_staff,array[v_other,v_owner],v_t,v_d,v_m,null,null,null,null,false,null);
  perform pg_temp.c4_check(v_result->>'status'='own_match_ack_required'
    and not exists(select from ironclad_private.caster_assignments),'batch rolls back if one caster needs exception');

  perform pg_temp.c4_check(pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>v_t,p_division=>v_d,
    p_match=>v_m,p_broadcast=>'https://www.twitch.tv@private.invalid/live')->>'status'='invalid'
    and pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>v_t,p_division=>v_d,
      p_match=>v_m,p_media=>pg_temp.c4_id(62))->>'status'='invalid'
    and pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>v_t,p_division=>v_d,
      p_match=>v_m,p_media=>pg_temp.c4_id(63))->>'status'='invalid'
    and pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>v_t,p_media=>pg_temp.c4_id(61))->>'status'='invalid',
    'unpublished, wrong scope, deceptive links and restricted replay links are rejected');

  v_result := pg_temp.c4_save('create',p_caster=>v_owner,p_tournament=>v_t,
    p_broadcast=>'https://www.twitch.tv/officialcaster');
  v_t_row := (v_result#>>'{assignment,id}')::uuid;
  perform pg_temp.c4_check(v_result#>>'{assignment,scope}'='tournament','tournament assignment');
  v_result := pg_temp.c4_save('create',p_caster=>v_owner,p_tournament=>v_t,p_division=>v_d);
  v_d_row := (v_result#>>'{assignment,id}')::uuid;
  perform pg_temp.c4_check(v_result#>>'{assignment,scope}'='division','division assignment without required exception');
  v_result := public.caster_phase4_admin_assign(c_staff,array[v_other,v_owner],v_t,v_d,v_m,null,
    'https://www.twitch.tv/officialcaster','https://www.youtube.com/watch?v=ABCDEFGHIJK',pg_temp.c4_id(61),
    true,'Independent synthetic case');
  perform pg_temp.c4_check(v_result->>'status'='ok' and jsonb_array_length(v_result->'assignments')=2,'multi-caster match assignment');
  select id into v_m_row from ironclad_private.caster_assignments where application_id=v_owner and match_id=v_m;
  select id into v_target from ironclad_private.caster_assignments where application_id=v_other and match_id=v_m;
  perform pg_temp.c4_check(public.caster_phase4_admin_save(c_owner,v_m_row,1,null,null,null,null,
    'complete',null,now()-interval '1 hour',null,null,null,true,'Self attempt')->>'status'='locked',
    'staff casters cannot verify their own history');
  perform pg_temp.c4_check(pg_temp.c4_save('create',p_caster=>v_owner,p_tournament=>v_t)->>'status'='duplicate',
    'duplicate active tournament assignment');
  v_result := public.caster_phase4_public_schedules(array[v_t]);
  perform pg_temp.c4_check(jsonb_array_length(v_result)=4 and not v_result::text like '%Independent synthetic case%'
    and not v_result::text like '%application_id%' and not v_result::text like '%verified_by%',
    'public DTO only discloses appropriate fields');
  perform pg_temp.c4_check(jsonb_array_length(public.caster_phase4_owner(c_owner)->'assignments')=3
    and jsonb_array_length(public.caster_phase4_owner(c_other)->'assignments')=1,
    'private Studio lists only its own assignments');
  perform pg_temp.c4_check(public.caster_phase4_public_history(v_owner_slug)='[]'::jsonb,
    'scheduled assignment alone never counts as verified coverage');

  v_result := pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>pg_temp.c4_id(2),
    p_division=>pg_temp.c4_id(12),p_match=>pg_temp.c4_id(52));
  perform pg_temp.c4_check(v_result->>'status'='ok','staff can plan for an unreleased match');
  perform pg_temp.c4_check(public.caster_phase4_public_schedules(array[pg_temp.c4_id(2)])='[]'::jsonb,
    'unreleased competition scopes remain private');

  v_result := pg_temp.c4_save('complete',v_t_row,1,p_covered=>v_coverage_day);
  perform pg_temp.c4_check(v_result#>>'{assignment,status}'='completed','explicit tournament completion');
  v_result := pg_temp.c4_save('complete',v_d_row,1,p_covered=>v_coverage_day+interval '5 minutes');
  perform pg_temp.c4_check(v_result#>>'{assignment,status}'='completed','explicit division completion');
  v_result := pg_temp.c4_save('complete',v_m_row,1,p_covered=>v_coverage_day+interval '10 minutes',
    p_recording=>'https://www.youtube.com/watch?v=ABCDEFGHIJK',p_media=>pg_temp.c4_id(61));
  perform pg_temp.c4_check(v_result#>>'{assignment,status}'='completed'
    and v_result#>>'{assignment,verified_by}'=c_staff,'explicit verified match completion and staff actor');
  v_result := public.caster_phase4_public_history(v_owner_slug);
  perform pg_temp.c4_check(jsonb_array_length(v_result)=1 and v_result#>>'{0,scope}'='match'
    and v_result#>>'{0,media_url}'='https://www.twitch.tv/videos/215',
    'verified child deduplicates same-day ancestor scopes');
  v_result := pg_temp.c4_save('correct',v_m_row,2,p_covered=>v_coverage_day+interval '15 minutes',
    p_recording=>'https://www.youtube.com/watch?v=ACDEFGHIJKL',p_media=>pg_temp.c4_id(61),p_reason=>'Synthetic time correction');
  perform pg_temp.c4_check(v_result#>>'{assignment,version}'='3','completed coverage correction');
  v_events := public.caster_phase4_admin_history(c_staff,v_m_row)->'events';
  perform pg_temp.c4_check(jsonb_array_length(v_events)=3 and v_events#>>'{0,action}'='correct'
    and v_events#>>'{1,action}'='complete' and v_events#>>'{1,current,verified_by}'=c_staff,
    'immutable verification and private correction reason remain in history');
  update public.tournament_media set published=false where id=pg_temp.c4_id(61);
  perform pg_temp.c4_check(public.caster_phase4_public_history(v_owner_slug)#>>'{0,media_url}' is null,
    'native tournament media takedown applies immediately');

  v_result := pg_temp.c4_save('unfulfilled',v_target,1,p_reason=>'Synthetic caster did not broadcast');
  perform pg_temp.c4_check(v_result#>>'{assignment,status}'='unfulfilled','unfulfilled remains distinct');
  v_result := pg_temp.c4_save('create',p_caster=>v_other,p_tournament=>v_t);
  v_target := (v_result#>>'{assignment,id}')::uuid;
  v_result := pg_temp.c4_save('cancel',v_target,1,p_reason=>'Synthetic cancellation');
  perform pg_temp.c4_check(v_result#>>'{assignment,status}'='cancelled'
    and public.caster_phase4_public_history(v_other_slug)='[]'::jsonb,'cancelled is never verified');
  perform pg_temp.c4_check((select registration_status='approved' and submitted_elo=1000 and profile_id=pg_temp.c4_id(31)
    from public.registrations where id=pg_temp.c4_id(41)),'competitive identity and registration are unchanged');

  -- Replacing an empty tree deletes old live match FKs but keeps the verified UUID
  -- and round snapshot. The replacement must not inherit the old assignment.
  delete from public.generated_brackets where id=pg_temp.c4_id(21);
  insert into public.generated_brackets (id,tournament_bracket_id,format,participant_count,slot_count,generated_by)
  values (pg_temp.c4_id(71),v_d,'single_elimination',2,2,c_staff);
  insert into public.bracket_rounds (id,generated_bracket_id,round_number,name)
  values (pg_temp.c4_id(72),pg_temp.c4_id(71),1,'Replacement Final');
  insert into public.tournament_matches (id,generated_bracket_id,round_id,match_number,status,series_best_of)
  values (pg_temp.c4_id(73),pg_temp.c4_id(71),pg_temp.c4_id(72),1,'scheduled',3);
  v_result := public.caster_phase4_public_history(v_owner_slug);
  perform pg_temp.c4_check(v_result#>>'{0,match_id}'=v_m::text and v_result#>>'{0,target_available}'='false'
    and v_result#>>'{0,tournament_available}'='true' and v_result#>>'{0,match_label}'='Synthetic Final · 1'
    and not public.caster_phase4_public_schedules(array[v_t])::text like '%'||v_m_row||'%',
    'bracket regeneration preserves historical old match and drops current promotion');

  v_result := public.caster_phase3_moderate(c_staff,v_owner,4,'suspend','Synthetic Phase 4 suspension');
  perform pg_temp.c4_check(v_result->>'status'='ok' and public.caster_phase4_owner(c_owner)->>'status'='not_found',
    'suspended caster cannot access protected Studio assignment read');
  perform pg_temp.c4_check(public.caster_phase4_public_history(v_owner_slug)='[]'::jsonb
    and jsonb_array_length(public.caster_phase4_admin_history(c_staff,v_m_row)->'events')=3,
    'suspension removes public coverage and retains audit');
  v_result := public.caster_phase3_moderate(c_staff,v_owner,5,'reinstate','Synthetic Phase 4 reinstatement');
  perform pg_temp.c4_check(v_result->>'status'='ok','reinstatement succeeds');
  perform pg_temp.c4_check(jsonb_array_length(public.caster_phase4_public_history(v_owner_slug))=1,
    'reinstatement restores eligible historical coverage');

  v_result := public.close_ironclad_player_account(c_owner);
  perform pg_temp.c4_check(v_result->>'outcome' in ('deleted','pseudonymized'),'existing verified player can close account');
  perform pg_temp.c4_check(public.caster_phase4_owner(c_owner)->>'status'='closed'
    and public.caster_phase4_public_history(v_owner_slug)='[]'::jsonb
    and jsonb_array_length(public.caster_phase4_admin_history(c_staff,v_m_row)->'events')=3,
    'Patch 2 closure removes public and private access while durable audit survives');
end;
$coverage$;

commit;
