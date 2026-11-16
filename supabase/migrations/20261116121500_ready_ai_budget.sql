-- Ready's counters are isolated from chat translation and reachable only by the server.
begin;
set local lock_timeout = '2s';

create table ironclad_private.ready_ai_budget (
  account text not null,
  window_start timestamptz not null,
  counter text not null,
  consumed integer not null check (consumed >= 0),
  expires_at timestamptz not null,
  primary key (account, window_start, counter)
);
create index ready_ai_budget_expiry on ironclad_private.ready_ai_budget (account, expires_at);
alter table ironclad_private.ready_ai_budget enable row level security;
revoke all on ironclad_private.ready_ai_budget from public, anon, authenticated, service_role;

create function public.reserve_ready_ai_usage(
  p_account text,
  p_user_hash text,
  p_session_hash text,
  p_day date,
  p_neurons integer,
  p_neuron_cap integer
) returns text language plpgsql security definer
  set search_path = pg_catalog
as $$
declare
  instant timestamptz;
  day_start timestamptz;
  minute_start timestamptz;
  item record;
  prior integer;
  effective_cap integer;
begin
  if p_account is null or p_account !~ '^[a-f0-9]{32}$'
    or p_user_hash is null or p_user_hash !~ '^[a-f0-9]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
    or p_day is null or p_neurons is null or p_neurons not between 1 and 128
    or p_neuron_cap is null or p_neuron_cap not between 1 and 2000 then
    return 'unavailable';
  end if;

  -- Keep this key independent of model, application instance and deployment.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:ready:ai:' || p_account, 0));
  instant := clock_timestamp();
  if (instant at time zone 'UTC')::date <> p_day then return 'unavailable'; end if;
  if (select value->'enabled' from public.platform_settings where key = 'match_chat_translation_enabled')
    is distinct from 'false'::jsonb then return 'unavailable'; end if;
  day_start := date_trunc('day', instant, 'UTC');
  minute_start := date_trunc('minute', instant, 'UTC');

  delete from ironclad_private.ready_ai_budget where account = p_account and expires_at <= instant;
  -- An older deployment cannot raise a ceiling already reduced by a newer deployment.
  insert into ironclad_private.ready_ai_budget (account, window_start, counter, consumed, expires_at)
    values (p_account, day_start, 'neuron-ceiling', p_neuron_cap, day_start + interval '2 days')
    on conflict (account, window_start, counter)
    do update set consumed = least(ready_ai_budget.consumed, excluded.consumed)
    returning consumed into effective_cap;

  for item in select * from (values
    (day_start, 'neurons', p_neurons, effective_cap, day_start + interval '2 days'),
    (day_start, 'account', 1, 100, day_start + interval '2 days'),
    (day_start, 'user:' || p_user_hash, 1, 24, day_start + interval '2 days'),
    (day_start, 'session:' || p_session_hash, 1, 18, day_start + interval '2 days'),
    (minute_start, 'minute:account', 1, 10, minute_start + interval '2 minutes'),
    (minute_start, 'minute:user:' || p_user_hash, 1, 5, minute_start + interval '2 minutes'),
    (minute_start, 'minute:session:' || p_session_hash, 1, 4, minute_start + interval '2 minutes')
  ) as limits(window_start, counter, cost, ceiling, expires_at) loop
    select consumed into prior from ironclad_private.ready_ai_budget
      where account = p_account and window_start = item.window_start and counter = item.counter;
    if coalesce(prior, 0) + item.cost > item.ceiling then return 'quota'; end if;
  end loop;

  insert into ironclad_private.ready_ai_budget (account, window_start, counter, consumed, expires_at)
    values
      (p_account, day_start, 'neurons', p_neurons, day_start + interval '2 days'),
      (p_account, day_start, 'account', 1, day_start + interval '2 days'),
      (p_account, day_start, 'user:' || p_user_hash, 1, day_start + interval '2 days'),
      (p_account, day_start, 'session:' || p_session_hash, 1, day_start + interval '2 days'),
      (p_account, minute_start, 'minute:account', 1, minute_start + interval '2 minutes'),
      (p_account, minute_start, 'minute:user:' || p_user_hash, 1, minute_start + interval '2 minutes'),
      (p_account, minute_start, 'minute:session:' || p_session_hash, 1, minute_start + interval '2 minutes')
    on conflict (account, window_start, counter)
    do update set consumed = ready_ai_budget.consumed + excluded.consumed;
  return 'reserved';
end;
$$;

revoke all on function public.reserve_ready_ai_usage(text, text, text, date, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_ready_ai_usage(text, text, text, date, integer, integer)
  to service_role;
commit;
