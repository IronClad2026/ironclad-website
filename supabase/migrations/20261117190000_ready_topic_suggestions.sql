begin;

create table ironclad_private.ready_topic_suggestions (
  id uuid primary key,
  submitted_at timestamptz not null default clock_timestamp(),
  category_id text check (category_id in ('match', 'results', 'rules', 'tournaments', 'profile', 'support')),
  description text not null check (char_length(description) between 1 and 500 and description ~ '[^[:space:]]'),
  menu_version text not null check (menu_version ~ '^[0-9]{1,8}$'),
  catalogue_version text not null check (catalogue_version ~ '^[0-9]{1,8}$'),
  status text not null default 'new' check (status in ('new', 'reviewed', 'added'))
);

create index ready_topic_suggestions_date_idx
  on ironclad_private.ready_topic_suggestions (submitted_at desc, id desc);
create index ready_topic_suggestions_status_date_idx
  on ironclad_private.ready_topic_suggestions (status, submitted_at desc, id desc);

-- The limiter has no connection to suggestions or usage analytics.
create table ironclad_private.ready_topic_suggestion_limits (
  window_start timestamptz not null,
  actor_key text not null check (actor_key ~ '^[a-f0-9]{64}$'),
  accepted integer not null check (accepted between 1 and 5),
  primary key (window_start, actor_key)
);

alter table ironclad_private.ready_topic_suggestions enable row level security;
alter table ironclad_private.ready_topic_suggestion_limits enable row level security;
revoke all on ironclad_private.ready_topic_suggestions, ironclad_private.ready_topic_suggestion_limits
  from public, anon, authenticated, service_role;

create function public.submit_ready_topic_suggestion(
  p_id uuid, p_description text, p_category text, p_menu text, p_catalogue text, p_rate_key text
) returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  saved ironclad_private.ready_topic_suggestions%rowtype;
  current_window timestamptz;
  accepted_count integer;
begin
  if p_id is null or p_id::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' or
    p_description is null or char_length(p_description) not between 1 and 500 or p_description !~ '[^[:space:]]' or
    (p_category is not null and p_category not in ('match', 'results', 'rules', 'tournaments', 'profile', 'support')) or
    p_menu is null or p_menu !~ '^[0-9]{1,8}$' or p_catalogue is null or p_catalogue !~ '^[0-9]{1,8}$' or
    p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' then
    return 'invalid';
  end if;

  -- Check ID before quota so a retry after an ambiguous response remains safe.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:ready:suggestion:' || p_id::text, 0));
  select * into saved from ironclad_private.ready_topic_suggestions where id = p_id;
  if found then
    if saved.description = p_description and saved.category_id is not distinct from p_category then
      return 'duplicate';
    end if;
    return 'conflict';
  end if;

  current_window := date_trunc('hour', clock_timestamp(), 'UTC');
  insert into ironclad_private.ready_topic_suggestion_limits as bucket (window_start, actor_key, accepted)
    values (current_window, p_rate_key, 1)
  on conflict (window_start, actor_key) do update set accepted = bucket.accepted + 1
    where bucket.accepted < 5
  returning accepted into accepted_count;
  if accepted_count is null then return 'rate_limited'; end if;

  insert into ironclad_private.ready_topic_suggestions (id, description, category_id, menu_version, catalogue_version)
    values (p_id, p_description, p_category, p_menu, p_catalogue);
  return 'stored';
end;
$$;

create function public.get_ready_topic_suggestions(p_status text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  result jsonb;
begin
  if (p_status is not null and p_status not in ('new', 'reviewed', 'added')) or
    p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 100000 then
    return null;
  end if;
  select jsonb_build_object(
    'total', (select count(*) from ironclad_private.ready_topic_suggestions where p_status is null or status = p_status),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'submittedAt', submitted_at, 'categoryId', category_id, 'description', description,
      'menuVersion', menu_version, 'catalogueVersion', catalogue_version, 'status', status
    ) order by submitted_at desc, id desc), '[]'::jsonb)
  ) into result
  from (
    select * from ironclad_private.ready_topic_suggestions where p_status is null or status = p_status
    order by submitted_at desc, id desc limit p_limit offset p_offset
  ) page;
  return result;
end;
$$;

create function public.review_ready_topic_suggestion(p_id uuid, p_status text, p_delete boolean)
returns text language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_id is null or p_delete is null then return 'invalid'; end if;
  if p_delete then
    if p_status is not null then return 'invalid'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ironclad:ready:suggestion:' || p_id::text, 0));
    delete from ironclad_private.ready_topic_suggestions where id = p_id;
    if found then return 'deleted'; end if;
  else
    if p_status is null or p_status not in ('new', 'reviewed', 'added') then return 'invalid'; end if;
    update ironclad_private.ready_topic_suggestions set status = p_status where id = p_id;
    if found then return 'updated'; end if;
  end if;
  return 'not_found';
end;
$$;

create function ironclad_private.maintain_ready_topic_suggestions()
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  delete from ironclad_private.ready_topic_suggestions where submitted_at < clock_timestamp() - interval '90 days';
  delete from ironclad_private.ready_topic_suggestion_limits where window_start < clock_timestamp() - interval '1 hour';
end;
$$;

revoke all on function public.submit_ready_topic_suggestion(uuid, text, text, text, text, text),
  public.get_ready_topic_suggestions(text, integer, integer), public.review_ready_topic_suggestion(uuid, text, boolean),
  ironclad_private.maintain_ready_topic_suggestions() from public, anon, authenticated, service_role;
grant execute on function public.submit_ready_topic_suggestion(uuid, text, text, text, text, text),
  public.get_ready_topic_suggestions(text, integer, integer), public.review_ready_topic_suggestion(uuid, text, boolean)
  to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('ironclad-ready-suggestions-retention', '37 * * * *',
      'select ironclad_private.maintain_ready_topic_suggestions()');
  end if;
end;
$$;

commit;
