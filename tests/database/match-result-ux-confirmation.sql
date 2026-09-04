begin;

-- LOCAL ONLY: requires the disposable PostgreSQL instance on port 55462.
-- Rollback restores clock functions, fixtures, and every result side effect.
-- No production function body or migration is changed.
do $$ begin
  if (inet_server_addr() = '127.0.0.1'::inet and inet_server_port() = 55462) is distinct from true then
    raise exception 'Local match UX test instance required';
  end if;
end $$;
set local ironclad_test.clock = '2026-09-04 14:00:00+00';
create or replace function pg_catalog.now() returns timestamptz
language sql stable as $$ select current_setting('ironclad_test.clock')::timestamptz $$;
create or replace function pg_catalog.clock_timestamp() returns timestamptz
language sql volatile as $$ select current_setting('ironclad_test.clock')::timestamptz $$;
set client_min_messages = warning;
set role postgres;

create function pg_temp.match_result_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Match-result notification contract failed: %', p_message;
  end if;
end;
$$;

select pg_temp.match_result_assert(
  not exists (
    select 1
    from public.tournaments
    where id = 'b0000000-0000-4000-8000-000000000001'
      or slug = 'p1-match-result-notification-contract'
  ),
  'deterministic fixture already exists'
);

-- Build one minimal launched final. USER triggers are suspended only inside
-- this rollback transaction; foreign keys remain active.
alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;

insert into public.tournaments (
  id,
  title,
  slug,
  format,
  status,
  description,
  banner_image_url,
  prize_pool,
  registration_enabled
) values (
  'b0000000-0000-4000-8000-000000000001',
  'P1 Match Result Notification Contract',
  'p1-match-result-notification-contract',
  '1v1',
  'in_progress',
  'Rollback-only P1 notification contract.',
  '',
  '',
  false
);

insert into public.tournament_brackets (
  id,
  tournament_id,
  name,
  elo_rules,
  max_players,
  launched_at
) values (
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Academy',
  '0-5000',
  8,
  pg_catalog.clock_timestamp()
);

insert into public.registrations (
  id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  submitted_elo,
  elo_verified_elo,
  elo_highest_faction,
  elo_checked_mode,
  elo_checked_at,
  elo_verification_source,
  elo_verified_division,
  elo_calculation_version
) values
  (
    'b2000000-0000-4000-8000-000000000001',
    'p1-match-result-player-one',
    'P1 Player One',
    'P1 Match Result Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'US Forces',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-match-result-contract'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'p1-match-result-player-two',
    'P1 Player Two',
    'P1 Match Result Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'Wehrmacht',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-match-result-contract'
  );

insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by,
  competition_locked_at
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'single_elimination',
  8,
  8,
  'p1-match-result-contract-admin',
  pg_catalog.clock_timestamp()
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  1,
  'P1 Final'
);

insert into public.tournament_matches (
  id,
  generated_bracket_id,
  round_id,
  match_number,
  player_one_registration_id,
  player_two_registration_id,
  status,
  series_best_of,
  activation_version,
  activated_at,
  deadline_at
) values (
  'b5000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  1,
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'in_progress',
  3,
  1,
  pg_catalog.clock_timestamp() - interval '1 hour',
  pg_catalog.clock_timestamp() + interval '7 days'
);


-- Extra isolated matches cover auto, manual, disputed and future submissions.
insert into public.players(id, clerk_user_id, display_name, in_game_name)
values ('b6000000-0000-4000-8000-000000000001','p1-match-result-player-one','Fixture One','Fixture One'),
       ('b6000000-0000-4000-8000-000000000002','p1-match-result-player-two','Fixture Two','Fixture Two');
update public.registrations set profile_id = case when id = 'b2000000-0000-4000-8000-000000000001' then 'b6000000-0000-4000-8000-000000000001'::uuid else 'b6000000-0000-4000-8000-000000000002'::uuid end
where tournament_id='b0000000-0000-4000-8000-000000000001';
insert into public.bracket_rounds(id,generated_bracket_id,round_number,name)
values ('b4000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001',2,'Fixture next round');
insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,player_one_registration_id,player_two_registration_id,status,series_best_of,activation_version,activated_at,deadline_at)
select ('b5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'b3000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',n,
'b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002',
'in_progress',3,1,now()-interval '1 hour',now()+interval '7 days' from generate_series(2,6) n;
insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,status,series_best_of)
select ('b5000000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,
'b3000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002',n,'scheduled',3 from generate_series(1,3) n;

alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;

create function pg_temp.report(p_number integer) returns uuid language plpgsql as $$
declare v_report jsonb;
begin
  v_report := public.submit_match_series_result_report(
    ('b5000000-0000-4000-8000-'||lpad(p_number::text,12,'0'))::uuid,
    'p1-match-result-player-one', 'b2000000-0000-4000-8000-000000000001', 2, 1,
    array['fixture/'||p_number||'/1.rec','fixture/'||p_number||'/2.rec','fixture/'||p_number||'/3.rec'],
    array[repeat(p_number::text,63)||'a',repeat(p_number::text,63)||'b',repeat(p_number::text,63)||'c'],
    array['b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001']::uuid[],
    'Isolated replay sequence'
  );
  return (v_report->>'report_group_id')::uuid;
end $$;

create temp table ux_reports(kind text primary key, id uuid);
-- Existing recorders preserve revisions as the official submission is linked.
-- Count the current outcome per participant, retaining all raw rows for retry checks.
create temp view ux_current_outcomes as
select distinct on (match_id,registration_id) *
from public.match_participant_outcome_authority
order by match_id,registration_id,revision desc;
insert into ux_reports values ('automatic',pg_temp.report(1)),('manual',pg_temp.report(3)),('dispute',pg_temp.report(4));
select pg_temp.match_result_assert(
  (select bool_and(created_at='2026-09-04 14:00:00+00'::timestamptz and confirmation_deadline_at='2026-09-04 14:30:00+00'::timestamptz)
   from public.match_result_report_groups where id in(select id from ux_reports)),
  '14:00 submission must snapshot 14:30 deadline');
select pg_temp.match_result_assert(not exists(select 1 from public.match_participant_outcome_authority), 'pending reports must not create result authority');
select pg_temp.match_result_assert(not exists(select 1 from ironclad_private.badge_reconciliation_targets), 'pending reports must not enqueue result Badge progress');

update public.tournaments set result_confirmation_window_minutes=60 where id='b0000000-0000-4000-8000-000000000001';
insert into ux_reports values ('future',pg_temp.report(5));
select pg_temp.match_result_assert(
  (select bool_and(confirmation_deadline_at=case when r.kind='future' then '2026-09-04 15:00:00+00'::timestamptz else '2026-09-04 14:30:00+00'::timestamptz end)
   from public.match_result_report_groups g join ux_reports r on r.id=g.id),
  'setting changes must affect future reports only');

set local ironclad_test.clock='2026-09-04 14:10:00+00';
select public.confirm_match_result_report_group_api((select id from ux_reports where kind='manual'),'p1-match-result-player-two');
select public.dispute_match_result_report_group_api((select id from ux_reports where kind='dispute'),'p1-match-result-player-two','Wrong chronological replay evidence');
create temp table ux_manual_snapshot as select count(*) as n from ux_current_outcomes;
select pg_temp.match_result_assert((select n=2 from ux_manual_snapshot), 'manual confirmation creates exactly two participant outcomes; disputes create none');

set local ironclad_test.clock='2026-09-04 14:29:59+00';
select pg_temp.match_result_assert(public.auto_approve_expired_match_result_groups(50)=0,'no early automatic confirmation');
set local ironclad_test.clock='2026-09-04 14:30:00+00';
select pg_temp.match_result_assert(public.auto_approve_expired_match_result_groups(50)=1,'exactly one report automatically confirms at expiry');
select pg_temp.match_result_assert(
  (select status='auto_approved' and finalized_source='cron_auto_approval' from public.match_result_report_groups where id=(select id from ux_reports where kind='automatic')),
  'canonical processor records automatic source');
select pg_temp.match_result_assert(
  (select status='completed' and player_one_score=2 and player_two_score=1 and winner_registration_id='b2000000-0000-4000-8000-000000000001' from public.tournament_matches where id='b5000000-0000-4000-8000-000000000001'),
  'canonical match result must be official');
select pg_temp.match_result_assert(
  (select player_one_registration_id='b2000000-0000-4000-8000-000000000001' and status='scheduled' from public.tournament_matches where id='b5000000-0000-4000-8000-000000000011'),
  'winner advances into the next round while other feeder is pending');
select pg_temp.match_result_assert((select count(*)=4 and bool_and(outcome_kind='played') from ux_current_outcomes),'exactly two finalized matches create current participant authority');
select pg_temp.match_result_assert((select count(*)=6 from public.match_game_result_authority),'six chronological Game authorities');
select pg_temp.match_result_assert(exists(select 1 from ironclad_private.badge_reconciliation_targets),'canonical result trigger must enqueue legitimate Badge reconciliation');
select pg_temp.match_result_assert(
  (select status='disputed' and finalized_at is null from public.match_result_report_groups where id=(select id from ux_reports where kind='dispute')),
  'dispute prevents automatic confirmation');
select pg_temp.match_result_assert(
  (select status='confirmed' and finalized_source='opponent_confirmation' from public.match_result_report_groups where id=(select id from ux_reports where kind='manual')),
  'manual confirmation cannot be reclassified by expiry');
create temp table ux_effect_snapshot as select
  (select count(*) from public.notifications) notifications,
  (select count(*) from public.match_participant_outcome_authority) outcomes,
  (select count(*) from public.match_game_result_authority) games,
  (select count(*) from ironclad_private.badge_reconciliation_targets) badge_targets,
  (select updated_at from public.tournament_matches where id='b5000000-0000-4000-8000-000000000011') advancement;
select pg_temp.match_result_assert(public.auto_approve_expired_match_result_groups(50)=0,'repeat processor must be a no-op');
select pg_temp.match_result_assert((select
  notifications=(select count(*) from public.notifications) and
  outcomes=(select count(*) from public.match_participant_outcome_authority) and
  games=(select count(*) from public.match_game_result_authority) and
  badge_targets=(select count(*) from ironclad_private.badge_reconciliation_targets) and
  advancement=(select updated_at from public.tournament_matches where id='b5000000-0000-4000-8000-000000000011')
  from ux_effect_snapshot),'repeat expiry cannot duplicate notifications, Badge targets, authority or advancement');
select 'PASS: fixed 30-minute deadline, setting snapshot, manual/dispute/automatic authority and exactly-once side effects' as result;
rollback;
