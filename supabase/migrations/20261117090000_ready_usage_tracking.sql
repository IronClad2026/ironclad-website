-- Staging-only reviewer analytics. Separate from Ready AI, public-site analytics and match feedback.
begin;
set local lock_timeout = '2s';

create table ironclad_private.ready_usage_consent (
  player_id uuid primary key references public.players(id) on delete cascade,
  account_key uuid not null unique default gen_random_uuid(),
  epoch uuid not null default gen_random_uuid(),
  enabled boolean not null default false,
  notice_version smallint not null default 1 check (notice_version = 1),
  changed_at timestamptz not null default clock_timestamp(),
  rate_minute timestamptz,
  rate_count integer not null default 0 check (rate_count between 0 and 120)
);

create table ironclad_private.ready_usage_sessions (
  account_key uuid not null references ironclad_private.ready_usage_consent(account_key) on delete cascade,
  browser_key uuid not null,
  session_key uuid not null default gen_random_uuid(),
  last_event_at timestamptz not null,
  primary key (account_key, browser_key)
);
create index ready_usage_sessions_expiry on ironclad_private.ready_usage_sessions(last_event_at);

create table ironclad_private.ready_usage_events (
  event_id uuid primary key,
  account_key uuid not null references ironclad_private.ready_usage_consent(account_key) on delete cascade,
  session_key uuid not null,
  received_at timestamptz not null,
  usage_day date not null,
  environment text not null default 'staging' check (environment = 'staging'),
  cohort text not null default 'reviewer' check (cohort = 'reviewer'),
  event_type text not null check (event_type in (
    'manual_open','engage','category_select','question_select','answer_display','action_click',
    'search_outcome','fallback','helpfulness','technical_error'
  )),
  category_id text check (category_id ~ '^[a-z0-9_:-]{1,64}$'),
  question_id text check (question_id ~ '^[a-z0-9_:-]{1,64}$'),
  action_id text check (action_id ~ '^[a-z0-9_:-]{1,64}$'),
  destination text check (destination in (
    'tournaments','match','profile','notifications','rankings','rules','admin_assistance','discord','copy_reference'
  )),
  outcome text,
  helpful boolean,
  answer_instance_id uuid,
  menu_version text not null check (menu_version ~ '^[0-9]{1,8}$'),
  catalogue_version text not null check (catalogue_version ~ '^[0-9]{1,8}$'),
  check (category_id is null or event_type in ('category_select','question_select','answer_display','action_click')),
  check (question_id is null or event_type in ('question_select','answer_display','action_click','search_outcome','helpfulness')),
  check ((event_type = 'action_click') = (action_id is not null and destination is not null)),
  check ((action_id is null) = (destination is null)),
  check ((event_type in ('answer_display','helpfulness')) = (answer_instance_id is not null)),
  check ((event_type = 'helpfulness') = (helpful is not null)),
  check (event_type <> 'category_select' or category_id is not null),
  check (event_type not in ('question_select','answer_display','helpfulness') or question_id is not null),
  check (case event_type
    when 'search_outcome' then outcome is not null and outcome in ('matched','ambiguous','no_result') and
      ((outcome = 'matched') = (question_id is not null))
    when 'fallback' then outcome is not null and outcome in ('no_result','unavailable','unsupported')
    when 'technical_error' then outcome is not null and outcome in ('request_failed','invalid_reply','timeout')
    else outcome is null
  end)
);
create index ready_usage_events_range on ironclad_private.ready_usage_events(usage_day, menu_version, catalogue_version);
create index ready_usage_events_account on ironclad_private.ready_usage_events(account_key);
create unique index ready_usage_events_answer_once
  on ironclad_private.ready_usage_events(account_key, answer_instance_id, event_type)
  where answer_instance_id is not null;

-- The archive has no account, browser, session, answer-instance or event identifiers.
create table ironclad_private.ready_usage_daily (
  usage_day date not null,
  cohort text not null check (cohort = 'reviewer'),
  menu_version text not null,
  catalogue_version text not null,
  event_type text not null,
  category_id text,
  question_id text,
  destination text,
  outcome text,
  helpful boolean,
  total bigint not null check (total > 0),
  unique nulls not distinct (usage_day, cohort, menu_version, catalogue_version, event_type,
    category_id, question_id, destination, outcome, helpful)
);

alter table ironclad_private.ready_usage_consent enable row level security;
alter table ironclad_private.ready_usage_sessions enable row level security;
alter table ironclad_private.ready_usage_events enable row level security;
alter table ironclad_private.ready_usage_daily enable row level security;
revoke all on ironclad_private.ready_usage_consent, ironclad_private.ready_usage_sessions,
  ironclad_private.ready_usage_events, ironclad_private.ready_usage_daily from public, anon, authenticated, service_role;

create function public.get_ready_usage_choice(p_player uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select coalesce((
    select jsonb_build_object('enabled', c.enabled, 'epoch', case when c.enabled then c.epoch end)
    from ironclad_private.ready_usage_consent c
    join public.players p on p.id = c.player_id and p.account_closed_at is null
    where c.player_id = p_player
  ), jsonb_build_object('enabled', false, 'epoch', null))
$$;

create function public.set_ready_usage_choice(p_player uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  choice ironclad_private.ready_usage_consent%rowtype;
begin
  if p_enabled is null then return null; end if;
  perform 1 from public.players p where p.id = p_player and p.account_closed_at is null for share;
  if not found then return null; end if;
  insert into ironclad_private.ready_usage_consent as c (player_id, enabled)
    values (p_player, p_enabled)
  on conflict (player_id) do update
    set enabled = excluded.enabled,
        epoch = case when c.enabled <> excluded.enabled then gen_random_uuid() else c.epoch end,
        changed_at = case when c.enabled <> excluded.enabled then clock_timestamp() else c.changed_at end
  returning c.* into choice;
  if not choice.enabled then
    delete from ironclad_private.ready_usage_sessions where account_key = choice.account_key;
  end if;
  return jsonb_build_object('enabled', choice.enabled, 'epoch', case when choice.enabled then choice.epoch end);
end;
$$;

create function public.record_ready_usage_event(
  p_player uuid, p_epoch uuid, p_browser uuid, p_event uuid, p_type text,
  p_category text, p_question text, p_action text, p_destination text, p_outcome text,
  p_helpful boolean, p_answer uuid, p_menu text, p_catalogue text
) returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  choice ironclad_private.ready_usage_consent%rowtype;
  stamp timestamptz;
  minute_window timestamptz;
  session_id uuid;
begin
  if p_epoch is null or p_browser is null or p_event is null or p_type is null or
    p_menu is distinct from '1' or p_catalogue is distinct from '1' then return 'invalid'; end if;
  perform 1 from public.players p where p.id = p_player and p.account_closed_at is null for share;
  if not found then return 'off'; end if;
  select c.* into choice from ironclad_private.ready_usage_consent c where c.player_id = p_player for update;
  if not found or not choice.enabled or choice.epoch <> p_epoch then return 'off'; end if;
  if exists (select 1 from ironclad_private.ready_usage_events where event_id = p_event and account_key = choice.account_key)
    then return 'duplicate'; end if;
  if p_type = 'helpfulness' and not exists (
    select 1 from ironclad_private.ready_usage_events e
    where e.account_key = choice.account_key and e.event_type = 'answer_display' and e.answer_instance_id = p_answer
      and e.question_id = p_question and e.menu_version = p_menu and e.catalogue_version = p_catalogue
      and e.usage_day >= (clock_timestamp() at time zone 'Australia/Sydney')::date - 88
  ) then return 'invalid'; end if;
  if p_answer is not null and exists (
    select 1 from ironclad_private.ready_usage_events e
    where e.account_key = choice.account_key and e.event_type = p_type and e.answer_instance_id = p_answer
  ) then return 'duplicate'; end if;

  stamp := clock_timestamp();
  minute_window := date_trunc('minute', stamp);
  if choice.rate_minute = minute_window and choice.rate_count >= 120 then return 'rate_limited'; end if;
  insert into ironclad_private.ready_usage_sessions as s (account_key, browser_key, last_event_at)
    values (choice.account_key, p_browser, stamp)
  on conflict (account_key, browser_key) do update
    set session_key = case when stamp - s.last_event_at >= interval '30 minutes' then gen_random_uuid() else s.session_key end,
        last_event_at = stamp
  returning s.session_key into session_id;

  insert into ironclad_private.ready_usage_events (
    event_id, account_key, session_key, received_at, usage_day, event_type, category_id, question_id,
    action_id, destination, outcome, helpful, answer_instance_id, menu_version, catalogue_version
  ) values (
    p_event, choice.account_key, session_id, stamp, (stamp at time zone 'Australia/Sydney')::date,
    p_type, p_category, p_question, p_action, p_destination, p_outcome, p_helpful, p_answer, p_menu, p_catalogue
  ) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  update ironclad_private.ready_usage_consent
    set rate_minute = minute_window, rate_count = case when choice.rate_minute = minute_window then choice.rate_count + 1 else 1 end
    where player_id = p_player;
  return 'stored';
exception when check_violation or not_null_violation then return 'invalid';
end;
$$;

create function ironclad_private.erase_ready_usage_on_closure()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  delete from ironclad_private.ready_usage_consent where player_id = new.id;
  return new;
end;
$$;
create trigger erase_ready_usage_on_closure
after update of account_closed_at on public.players
for each row when (old.account_closed_at is null and new.account_closed_at is not null)
execute function ironclad_private.erase_ready_usage_on_closure();

create function ironclad_private.maintain_ready_usage()
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  today date := (clock_timestamp() at time zone 'Australia/Sydney')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:ready:usage-retention', 0));
  with expired as (
    delete from ironclad_private.ready_usage_events where usage_day < today - 88 returning *
  )
  insert into ironclad_private.ready_usage_daily as d (
    usage_day, cohort, menu_version, catalogue_version, event_type, category_id,
    question_id, destination, outcome, helpful, total
  )
  select usage_day, cohort, menu_version, catalogue_version, event_type, category_id,
    question_id, destination, outcome, helpful, count(*)
  from expired
  where usage_day > (today - interval '12 months')::date
  group by usage_day, cohort, menu_version, catalogue_version, event_type, category_id, question_id, destination, outcome, helpful
  having count(distinct account_key) >= 5
  on conflict (usage_day, cohort, menu_version, catalogue_version, event_type, category_id,
    question_id, destination, outcome, helpful)
  do update set total = d.total + excluded.total;
  delete from ironclad_private.ready_usage_sessions where last_event_at < clock_timestamp() - interval '1 day';
  delete from ironclad_private.ready_usage_daily where usage_day <= (today - interval '12 months')::date;
end;
$$;

create function public.get_ready_usage_report(
  p_start date, p_end date, p_menu_version text, p_catalogue_version text, p_cohort text
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  today date := (current_timestamp at time zone 'Australia/Sydney')::date;
  detail_from date := today - 88;
  archive_from date := (today - interval '12 months')::date + 1;
  available_from date;
  report jsonb;
begin
  if p_start is null or p_end is null or p_start > p_end or p_end > today or
    p_start < archive_from or p_cohort is distinct from 'reviewer' or
    (p_menu_version is not null and p_menu_version !~ '^[0-9]{1,8}$') or
    (p_catalogue_version is not null and p_catalogue_version !~ '^[0-9]{1,8}$') then return null;
  end if;
  select min(usage_day) into available_from from (
    select min(usage_day) as usage_day from ironclad_private.ready_usage_events where usage_day >= detail_from
    union all
    select min(usage_day) from ironclad_private.ready_usage_daily where usage_day >= archive_from
  ) days;
  with raw as materialized (
    select * from ironclad_private.ready_usage_events e
    where e.usage_day between greatest(p_start, detail_from) and p_end and e.cohort = p_cohort
      and (p_menu_version is null or e.menu_version = p_menu_version)
      and (p_catalogue_version is null or e.catalogue_version = p_catalogue_version)
  ), counts as materialized (
    select usage_day, event_type, category_id, question_id, destination, outcome, helpful, count(*) as total
    from raw group by usage_day, event_type, category_id, question_id, destination, outcome, helpful
    union all
    select usage_day, event_type, category_id, question_id, destination, outcome, helpful, total
    from ironclad_private.ready_usage_daily d
    where d.usage_day between p_start and least(p_end, detail_from - 1) and d.cohort = p_cohort
      and (p_menu_version is null or d.menu_version = p_menu_version)
      and (p_catalogue_version is null or d.catalogue_version = p_catalogue_version)
  ), engaged as (
    select count(distinct account_key) as accounts, count(distinct session_key) as sessions from raw
    where event_type in ('engage','category_select','question_select','action_click','search_outcome','helpfulness')
  ), versions as (
    select distinct menu_version, catalogue_version from (
      select menu_version, catalogue_version from ironclad_private.ready_usage_events where usage_day >= detail_from
      union all
      select menu_version, catalogue_version from ironclad_private.ready_usage_daily where usage_day >= archive_from
    ) v
  ), totals as (
    select coalesce(sum(total) filter (where event_type = 'manual_open'), 0) openings,
      coalesce(sum(total) filter (where event_type = 'category_select'), 0) categories,
      coalesce(sum(total) filter (where event_type = 'question_select'), 0) selections,
      coalesce(sum(total) filter (where event_type = 'answer_display'), 0) displays,
      coalesce(sum(total) filter (where event_type = 'action_click'), 0) clicks,
      coalesce(sum(total) filter (where event_type = 'search_outcome' and outcome = 'no_result'), 0) unmatched,
      coalesce(sum(total) filter (where event_type = 'fallback'), 0) fallbacks,
      coalesce(sum(total) filter (where event_type = 'technical_error'), 0) errors,
      coalesce(sum(total) filter (where event_type = 'helpfulness' and helpful), 0) positive,
      coalesce(sum(total) filter (where event_type = 'helpfulness' and not helpful), 0) negative
    from counts
  ), by_day as (
    select usage_day,
      coalesce(sum(total) filter (where event_type = 'manual_open'), 0) openings,
      coalesce(sum(total) filter (where event_type = 'answer_display'), 0) displays,
      coalesce(sum(total) filter (where event_type = 'action_click'), 0) clicks
    from counts group by usage_day
  ), by_question as (
    select question_id,
      coalesce(sum(total) filter (where event_type = 'question_select'), 0) selections,
      coalesce(sum(total) filter (where event_type = 'answer_display'), 0) displays,
      coalesce(sum(total) filter (where event_type = 'helpfulness' and helpful), 0) positive,
      coalesce(sum(total) filter (where event_type = 'helpfulness' and not helpful), 0) negative
    from counts where question_id is not null and event_type in ('question_select','answer_display','helpfulness')
    group by question_id
  )
  select jsonb_build_object(
    'coverage', jsonb_build_object('availableFrom', available_from, 'retainedDetailFrom', detail_from,
      'collected', exists(select 1 from counts), 'timezone', 'Australia/Sydney'),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('menuVersion', menu_version, 'catalogueVersion', catalogue_version)
      order by menu_version, catalogue_version) from versions), '[]'::jsonb),
    'totals', jsonb_build_object(
      'engagedAccounts', case when p_start >= detail_from then engaged.accounts end,
      'engagedSessions', case when p_start >= detail_from then engaged.sessions end,
      'manualOpenings', openings, 'categorySelections', categories, 'questionSelections', selections,
      'answerDisplays', displays, 'actionClicks', clicks, 'unmatchedSearches', unmatched, 'fallbacks', fallbacks,
      'technicalErrors', errors, 'helpful', positive, 'stillNeedHelp', negative),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', usage_day, 'manualOpenings', openings,
      'answerDisplays', displays, 'actionClicks', clicks) order by usage_day) from by_day), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', category_id, 'count', total) order by total desc, category_id)
      from (select category_id, sum(total) total from counts where event_type = 'category_select' group by category_id) c), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', question_id, 'selections', selections,
      'displays', displays, 'helpful', positive, 'stillNeedHelp', negative) order by selections desc, question_id) from by_question), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(jsonb_build_object('id', destination, 'count', total) order by total desc, destination)
      from (select destination, sum(total) total from counts where event_type = 'action_click' group by destination) d), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('id', outcome, 'count', total) order by total desc, outcome)
      from (select outcome, sum(total) total from counts where event_type = 'technical_error' group by outcome) e), '[]'::jsonb)
  ) into report from totals cross join engaged;
  return report;
end;
$$;

revoke all on function public.get_ready_usage_choice(uuid), public.set_ready_usage_choice(uuid, boolean),
  public.record_ready_usage_event(uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean, uuid, text, text),
  public.get_ready_usage_report(date, date, text, text, text),
  ironclad_private.erase_ready_usage_on_closure(), ironclad_private.maintain_ready_usage()
from public, anon, authenticated, service_role;
grant execute on function public.get_ready_usage_choice(uuid), public.set_ready_usage_choice(uuid, boolean),
  public.record_ready_usage_event(uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean, uuid, text, text),
  public.get_ready_usage_report(date, date, text, text, text) to service_role;

do $schedule$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('ironclad-ready-usage-retention', '23 * * * *', 'select ironclad_private.maintain_ready_usage()');
  end if;
end;
$schedule$;
commit;
