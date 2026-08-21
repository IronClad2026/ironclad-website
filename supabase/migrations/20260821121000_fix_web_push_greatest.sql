begin;

-- PostgreSQL implements GREATEST as SQL syntax rather than a schema-qualified
-- pg_catalog function. Replace only the affected subscription upsert while
-- preserving the deployed Stage B ownership, cap, and validation contract.
create or replace function public.upsert_web_push_subscription(
  p_clerk_user_id text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_endpoint text := btrim(p_endpoint);
  v_existing public.push_subscriptions%rowtype;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_clerk_user_id is null
    or length(v_clerk_user_id) > 255
    or v_clerk_user_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid subscription owner' using errcode = '22023';
  end if;

  if length(v_endpoint) not between 24 and 2048
    or v_endpoint ~ '[[:cntrl:][:space:]]'
    or v_endpoint !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.push\.apple\.com|([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.notify\.windows\.com)/'
    or length(p_p256dh) not between 80 and 120
    or p_p256dh !~ '^[A-Za-z0-9_-]+$'
    or length(p_auth) not between 16 and 64
    or p_auth !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Invalid Push subscription' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_clerk_user_id, 0)
  );

  delete from public.push_subscriptions as subscription
  where subscription.owner_clerk_user_id = v_clerk_user_id
    and subscription.expires_at is not null
    and subscription.expires_at <= pg_catalog.clock_timestamp();

  select subscription.*
  into v_existing
  from public.push_subscriptions as subscription
  where subscription.endpoint = v_endpoint
  for update;

  if found then
    if v_existing.owner_clerk_user_id <> v_clerk_user_id then
      raise exception 'Push endpoint is already owned'
        using errcode = '23505';
    end if;

    update public.push_subscriptions as subscription
    set
      p256dh = p_p256dh,
      auth = p_auth,
      expires_at = p_expires_at,
      updated_at = greatest(
        pg_catalog.clock_timestamp(),
        subscription.created_at
      )
    where subscription.id = v_existing.id
    returning subscription.id into v_id;

    return v_id;
  end if;

  if (
    select pg_catalog.count(*)
    from public.push_subscriptions as subscription
    where subscription.owner_clerk_user_id = v_clerk_user_id
  ) >= 10 then
    raise exception 'Push subscription limit reached'
      using errcode = '54000';
  end if;

  insert into public.push_subscriptions (
    owner_clerk_user_id,
    endpoint,
    p256dh,
    auth,
    expires_at
  ) values (
    v_clerk_user_id,
    v_endpoint,
    p_p256dh,
    p_auth,
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter function public.upsert_web_push_subscription(
  text,
  text,
  text,
  text,
  timestamptz
) owner to postgres;
revoke all on function public.upsert_web_push_subscription(
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.upsert_web_push_subscription(
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

commit;
