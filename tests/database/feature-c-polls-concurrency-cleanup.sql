\set ON_ERROR_STOP on

set client_min_messages = warning;
set role postgres;

begin;

alter table public.poll_ballot_choices
  disable trigger poll_ballot_choices_open_window_guard;
alter table public.poll_eligible_voters
  disable trigger poll_eligibility_published_identity_guard;
alter table public.poll_options
  disable trigger poll_options_published_configuration_guard;
alter table public.polls
  disable trigger polls_published_configuration_guard;

delete from public.poll_ballot_choices
where poll_id = 'c7000000-0000-4000-8000-000000000001';
delete from public.poll_eligible_voters
where poll_id = 'c7000000-0000-4000-8000-000000000001';
delete from public.poll_options
where poll_id = 'c7000000-0000-4000-8000-000000000001';
delete from public.polls
where id = 'c7000000-0000-4000-8000-000000000001';

alter table public.polls
  enable trigger polls_published_configuration_guard;
alter table public.poll_options
  enable trigger poll_options_published_configuration_guard;
alter table public.poll_eligible_voters
  enable trigger poll_eligibility_published_identity_guard;
alter table public.poll_ballot_choices
  enable trigger poll_ballot_choices_open_window_guard;

delete from public.notifications
where recipient_clerk_user_id in (
  'feature-c-concurrency-player',
  'feature-c-concurrency-admin'
) or event_key like 'poll:c7000000-0000-4000-8000-000000000001:%';

delete from public.players
where id = 'c7300000-0000-4000-8000-000000000001'
  or clerk_user_id = 'feature-c-concurrency-player';

commit;

do $$
begin
  if exists (
    select 1 from public.polls
    where id = 'c7000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.poll_options
    where poll_id = 'c7000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.poll_eligible_voters
    where poll_id = 'c7000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.poll_ballot_choices
    where poll_id = 'c7000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.players
    where id = 'c7300000-0000-4000-8000-000000000001'
      or clerk_user_id = 'feature-c-concurrency-player'
  ) or exists (
    select 1 from public.notifications
    where recipient_clerk_user_id in (
      'feature-c-concurrency-player',
      'feature-c-concurrency-admin'
    ) or event_key like 'poll:c7000000-0000-4000-8000-000000000001:%'
  ) then
    raise exception 'Feature C concurrency canary residue remains';
  end if;
end;
$$;

select 'feature_c_concurrency_clean';
