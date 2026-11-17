-- Staging Ready cloud menu usage. Existing events, consent, grants and retention are preserved.
begin;
set local lock_timeout = '2s';

alter table ironclad_private.ready_usage_events
  drop constraint ready_usage_events_event_type_check,
  drop constraint ready_usage_events_check,
  add constraint ready_usage_events_event_type_check check (event_type in (
    'manual_open','engage','category_select','question_select','answer_display','action_click',
    'search_outcome','fallback','helpfulness','technical_error','topic_missing'
  )),
  add constraint ready_usage_events_category_scope_check check (
    category_id is null or event_type in ('category_select','question_select','answer_display','action_click','topic_missing')
  ),
  add constraint ready_usage_events_topic_missing_check check (
    event_type <> 'topic_missing' or (
      menu_version = '2' and catalogue_version = '1' and
      (category_id is null or category_id in ('match','results','rules','tournaments','profile','support'))
    )
  );

create or replace function public.record_ready_usage_event(
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
    p_menu is null or p_menu not in ('1','2') or p_catalogue is distinct from '1' or
    (p_type = 'topic_missing' and p_menu <> '2') or (p_type = 'search_outcome' and p_menu <> '1') then
    return 'invalid';
  end if;
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

create or replace function public.get_ready_usage_report(
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
    where event_type in ('engage','category_select','question_select','action_click','search_outcome','helpfulness','topic_missing')
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
      coalesce(sum(total) filter (where event_type = 'topic_missing'), 0) missing_topics,
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
      'answerDisplays', displays, 'actionClicks', clicks, 'unmatchedSearches', unmatched, 'missingTopics', missing_topics,
      'fallbacks', fallbacks,
      'technicalErrors', errors, 'helpful', positive, 'stillNeedHelp', negative),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', usage_day, 'manualOpenings', openings,
      'answerDisplays', displays, 'actionClicks', clicks) order by usage_day) from by_day), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', category_id, 'count', total) order by total desc, category_id)
      from (select category_id, sum(total) total from counts where event_type = 'category_select' group by category_id) c), '[]'::jsonb),
    'missingByCategory', coalesce((select jsonb_agg(jsonb_build_object('id', category, 'count', total) order by total desc, category)
      from (select coalesce(category_id, 'unknown') category, sum(total) total from counts
        where event_type = 'topic_missing' group by coalesce(category_id, 'unknown')) m), '[]'::jsonb),
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

commit;
