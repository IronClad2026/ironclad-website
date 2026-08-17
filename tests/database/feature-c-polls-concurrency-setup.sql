\set ON_ERROR_STOP on

set client_min_messages = warning;
set role postgres;

do $$
begin
  if exists (
    select 1 from public.players
    where id = 'c7300000-0000-4000-8000-000000000001'
      or clerk_user_id = 'feature-c-concurrency-player'
  ) or exists (
    select 1 from public.polls
    where id = 'c7000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Feature C concurrency canary already exists';
  end if;
end;
$$;

begin;

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name,
  profile_completed,
  account_closed_at
) values (
  'c7300000-0000-4000-8000-000000000001',
  'feature-c-concurrency-player',
  'Feature C Concurrency Player',
  'Feature C Concurrency Player',
  true,
  null
);

insert into public.polls (
  id,
  purpose,
  audience_kind,
  question,
  context,
  option_source,
  max_selections,
  winner_count,
  authority,
  result_visibility,
  public_final_totals,
  opens_at,
  closes_at,
  created_by_clerk_user_id,
  updated_by_clerk_user_id
) values (
  'c7000000-0000-4000-8000-000000000001',
  'community_feedback',
  'selected_active_players',
  'Feature C concurrency canary?',
  'Synthetic Staging-only concurrency evidence.',
  'text',
  1,
  1,
  'advisory',
  'live',
  false,
  pg_catalog.clock_timestamp() - interval '5 minutes',
  pg_catalog.clock_timestamp() + interval '30 minutes',
  'feature-c-concurrency-admin',
  'feature-c-concurrency-admin'
);

insert into public.poll_options (id, poll_id, position, label_snapshot)
values
  (
    'c7100000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001',
    1,
    'One'
  ),
  (
    'c7100000-0000-4000-8000-000000000002',
    'c7000000-0000-4000-8000-000000000001',
    2,
    'Two'
  ),
  (
    'c7100000-0000-4000-8000-000000000003',
    'c7000000-0000-4000-8000-000000000001',
    3,
    'Three'
  );

insert into public.poll_eligible_voters (id, poll_id, player_id)
values (
  'c7200000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000001'
);

update public.polls
set published_at = pg_catalog.clock_timestamp(),
  published_by_clerk_user_id = 'feature-c-concurrency-admin'
where id = 'c7000000-0000-4000-8000-000000000001';

commit;

select 'feature_c_concurrency_ready';
