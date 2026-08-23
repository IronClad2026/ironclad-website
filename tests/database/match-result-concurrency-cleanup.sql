set client_min_messages = warning;
set role postgres;

begin;

drop function if exists public.p1_test_advisory_lock_is_held(bigint);
drop function if exists public.p1_test_admin_official_result(
  uuid, integer, integer, uuid, text, bigint
);
drop function if exists public.p1_test_submit_no_show(
  uuid, text, uuid, text, bigint
);
drop function if exists public.p1_test_admin_review_match_result(
  uuid, text, text, text, bigint
);
drop function if exists public.p1_test_confirm_match_result(
  uuid, text, bigint
);
drop function if exists public.p1_test_hold_match_lock(
  uuid, bigint, integer
);

alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;

delete from public.notifications
where tournament_id = 'd0000000-0000-4000-8000-000000000001'
  or match_id in (
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000002'
  )
  or recipient_clerk_user_id like 'p1-concurrency-%'
  or actor_clerk_user_id like 'p1-concurrency-%';

delete from public.match_result_submissions
where match_id in (
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
);
delete from public.match_result_report_groups
where match_id in (
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
);
delete from public.tournament_matches
where id in (
  'd5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
);
delete from public.bracket_rounds
where generated_bracket_id = 'd3000000-0000-4000-8000-000000000001';
delete from public.generated_brackets
where id = 'd3000000-0000-4000-8000-000000000001';
delete from public.registrations
where tournament_id = 'd0000000-0000-4000-8000-000000000001';
delete from public.tournament_brackets
where id = 'd1000000-0000-4000-8000-000000000001';
delete from public.tournaments
where id = 'd0000000-0000-4000-8000-000000000001';

alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;

commit;

do $$
begin
  if exists (
    select 1 from public.tournaments
    where id = 'd0000000-0000-4000-8000-000000000001'
      or slug = 'p1-match-result-concurrency'
  ) or exists (
    select 1 from public.tournament_matches
    where id in (
      'd5000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000002'
    )
  ) or exists (
    select 1 from public.match_result_report_groups
    where match_id in (
      'd5000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000002'
    )
  ) or exists (
    select 1 from public.match_result_submissions
    where match_id in (
      'd5000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000002'
    )
  ) or exists (
    select 1 from public.notifications
    where tournament_id = 'd0000000-0000-4000-8000-000000000001'
      or event_key like '%d5000000-0000-4000-8000-00000000000%'
      or recipient_clerk_user_id like 'p1-concurrency-%'
      or actor_clerk_user_id like 'p1-concurrency-%'
  ) or pg_catalog.to_regprocedure(
    'public.p1_test_hold_match_lock(uuid,bigint,integer)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_confirm_match_result(uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_admin_review_match_result(uuid,text,text,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_submit_no_show(uuid,text,uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_admin_official_result(uuid,integer,integer,uuid,text,bigint)'
  ) is not null
  or pg_catalog.to_regprocedure(
    'public.p1_test_advisory_lock_is_held(bigint)'
  ) is not null
  then
    raise exception 'P1 match-result concurrency canary residue remains';
  end if;
end;
$$;

select 'p1_match_result_concurrency_clean';
