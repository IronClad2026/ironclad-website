-- Appended to the real Phase 1 synthetic seed prefix, before COMMIT. The runner
-- pins a disposable loopback PostgreSQL database and keeps all CHECK/FK rules.
alter table public.tournament_matches disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.match_result_report_groups disable trigger user;

update public.bracket_rounds set name='Completed quarterfinals' where id=pg_temp.mr_id(31);
insert into public.bracket_rounds(id,generated_bracket_id,round_number,name) values
  (pg_temp.mr_id(902),pg_temp.mr_id(21),2,'Current semifinals'),
  (pg_temp.mr_id(903),pg_temp.mr_id(21),3,'Final');
-- One current semifinal, one pending-result match, a disputed match and a hold.
update public.tournament_matches set round_id=pg_temp.mr_id(902) where id=pg_temp.mr_id(301);
update public.tournament_matches set status='pending_review',hold_started_at=now(),
  hold_reason='Synthetic admin review',held_by_clerk_user_id='p03-rehearsal-4' where id=pg_temp.mr_id(303);
update public.match_result_report_groups set status='disputed',disputed_at=now(),
  disputed_by_registration_id=pg_temp.mr_id(212),dispute_notes='Synthetic replay discrepancy',
  replay_storage_path='synthetic-private-evidence/p03-rehearsal.rec'
  where id=pg_temp.mr_id(402);

insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,
  player_one_registration_id,player_two_registration_id,status,series_best_of,
  activation_version,activated_at,deadline_at,player_one_score,player_two_score,
  winner_registration_id,official_result_decided_at)
select pg_temp.mr_id(900+n),pg_temp.mr_id(21),
  case when n=1 then pg_temp.mr_id(31) else pg_temp.mr_id(902) end,10+n,
  pg_temp.mr_id(201),pg_temp.mr_id(202),'completed',3,1,
  now()-interval '2 days',now()-interval '1 day',2,0,pg_temp.mr_id(201),now()-interval '1 day'
from generate_series(1,2)n;
insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,
  player_one_registration_id,player_two_registration_id,status,series_best_of,
  activation_version,activated_at,deadline_at)
values
  (pg_temp.mr_id(903),pg_temp.mr_id(21),pg_temp.mr_id(902),13,pg_temp.mr_id(201),null,'scheduled',3,0,null,null),
  (pg_temp.mr_id(904),pg_temp.mr_id(21),pg_temp.mr_id(903),14,null,null,'scheduled',3,0,null,null),
  (pg_temp.mr_id(905),pg_temp.mr_id(21),pg_temp.mr_id(903),15,pg_temp.mr_id(201),pg_temp.mr_id(202),'scheduled',3,0,null,null),
  (pg_temp.mr_id(906),pg_temp.mr_id(21),pg_temp.mr_id(902),16,pg_temp.mr_id(201),null,'completed',3,0,null,null);
update public.tournament_matches set outcome_type='automatic_bye',winner_registration_id=player_one_registration_id where id=pg_temp.mr_id(906);
-- Advancement is derived from authoritative round/match position and slots.
-- Preserve those original fields in the before/after competition fingerprint.

alter table public.match_result_report_groups enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.tournament_matches enable trigger user;

-- Pre-P03 assistance notification has no invented room identity. Its legacy
-- operational semantics must survive the phase-three room-scoped backfill.
insert into public.notifications(recipient_role,type,title,message,tournament_id,match_id,event_key,metadata)
values('admin','match.admin_assistance_requested','Synthetic legacy assistance','Synthetic fixture',
  pg_temp.mr_id(1),pg_temp.mr_id(301),'p03-rehearsal-legacy-assistance','{}'::jsonb);
