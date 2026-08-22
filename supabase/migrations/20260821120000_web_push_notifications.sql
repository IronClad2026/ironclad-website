begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_clerk_user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint push_subscriptions_owner_check check (
    nullif(btrim(owner_clerk_user_id), '') is not null
    and length(owner_clerk_user_id) <= 255
    and owner_clerk_user_id !~ '[[:cntrl:]]'
  ),
  constraint push_subscriptions_endpoint_check check (
    length(endpoint) between 24 and 2048
    and endpoint !~ '[[:cntrl:][:space:]]'
    and endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.push\.apple\.com|([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.notify\.windows\.com)/'
  ),
  constraint push_subscriptions_p256dh_check check (
    length(p256dh) between 80 and 120
    and p256dh ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_auth_check check (
    length(auth) between 16 and 64
    and auth ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_timestamps_check check (
    updated_at >= created_at
  ),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

comment on table public.push_subscriptions is
  'Account-owned browser Web Push delivery endpoints. Contains no role, fingerprint, IP, or user-agent history.';

create index push_subscriptions_owner_created_idx
  on public.push_subscriptions(owner_clerk_user_id, created_at, id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions
  to service_role;

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

  -- Serialize new endpoints per account so the ten-device cap cannot be
  -- bypassed by concurrent first-time inserts.
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
      updated_at = pg_catalog.greatest(
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

create or replace function public.delete_web_push_subscription(
  p_clerk_user_id text,
  p_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_endpoint text := btrim(p_endpoint);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_clerk_user_id is null or v_endpoint = '' then
    raise exception 'Invalid subscription deletion' using errcode = '22023';
  end if;

  delete from public.push_subscriptions as subscription
  where subscription.owner_clerk_user_id = v_clerk_user_id
    and subscription.endpoint = v_endpoint;

  return found;
end;
$$;

alter function public.delete_web_push_subscription(text, text)
  owner to postgres;
revoke all on function public.delete_web_push_subscription(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_web_push_subscription(text, text)
  to service_role;

-- Preserve the latest account-closure implementation byte-for-byte behind a
-- private wrapper. The wrapper removes every account-owned endpoint in the
-- same database transaction, including accounts with no Player row.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_push_cleanup;

revoke all on function
  public.close_ironclad_player_account_without_push_cleanup(text)
from public, anon, authenticated, service_role;

create or replace function public.close_ironclad_player_account(
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_clerk_user_id is null then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  delete from public.push_subscriptions as subscription
  where subscription.owner_clerk_user_id = v_clerk_user_id;

  return public.close_ironclad_player_account_without_push_cleanup(
    v_clerk_user_id
  );
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

alter table public.notifications
  add column push_delivery_status text,
  add column push_attempt_count integer,
  add column push_next_attempt_at timestamptz,
  add column push_claim_token uuid,
  add column push_claim_expires_at timestamptz,
  add column push_enqueued_at timestamptz,
  add column push_completed_at timestamptz,
  add column push_last_error_code text;

alter table public.notifications
  add constraint notifications_push_delivery_status_check check (
    push_delivery_status is null
    or push_delivery_status in (
      'pending',
      'processing',
      'sent',
      'skipped',
      'retryable_failure',
      'permanent_failure'
    )
  ),
  add constraint notifications_push_attempt_count_check check (
    push_attempt_count is null
    or push_attempt_count between 0 and 5
  ),
  add constraint notifications_push_eligibility_state_check check (
    (
      push_delivery_status is null
      and push_attempt_count is null
      and push_next_attempt_at is null
      and push_claim_token is null
      and push_claim_expires_at is null
      and push_enqueued_at is null
      and push_completed_at is null
      and push_last_error_code is null
    )
    or (
      push_delivery_status is not null
      and push_attempt_count is not null
      and push_enqueued_at is not null
    )
  ),
  add constraint notifications_push_claim_state_check check (
    (
      push_delivery_status = 'processing'
      and push_claim_token is not null
      and push_claim_expires_at is not null
    )
    or (
      push_delivery_status is distinct from 'processing'
      and push_claim_token is null
      and push_claim_expires_at is null
    )
  ),
  add constraint notifications_push_schedule_state_check check (
    (
      push_delivery_status in ('pending', 'retryable_failure')
      and push_next_attempt_at is not null
    )
    or (
      push_delivery_status in (
        'processing',
        'sent',
        'skipped',
        'permanent_failure'
      )
      and push_next_attempt_at is null
    )
    or (
      push_delivery_status is null
      and push_next_attempt_at is null
    )
  ),
  add constraint notifications_push_completion_state_check check (
    (
      push_delivery_status in ('sent', 'skipped', 'permanent_failure')
      and push_completed_at is not null
    )
    or (
      push_delivery_status in (
        'pending',
        'processing',
        'retryable_failure'
      )
      and push_completed_at is null
    )
    or (
      push_delivery_status is null
      and push_completed_at is null
    )
  ),
  add constraint notifications_push_error_code_check check (
    push_last_error_code is null
    or (
      length(push_last_error_code) <= 64
      and push_last_error_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  add constraint notifications_push_error_state_check check (
    (
      push_delivery_status in (
        'skipped',
        'retryable_failure',
        'permanent_failure'
      )
      and push_last_error_code is not null
    )
    or (
      push_delivery_status in ('pending', 'processing', 'sent')
      and push_last_error_code is null
    )
    or (
      push_delivery_status is null
      and push_last_error_code is null
    )
  );

create index notifications_web_push_due_idx
  on public.notifications(push_next_attempt_at, id)
  where push_delivery_status in ('pending', 'retryable_failure');

create index notifications_web_push_expired_lease_idx
  on public.notifications(push_claim_expires_at, id)
  where push_delivery_status = 'processing';

create or replace function public.initialize_web_push_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_eligible boolean := false;
  v_now timestamptz;
begin
  -- Historical rows and ordinary in-site-only notifications remain null.
  -- Only this trigger can enroll a newly inserted canonical notification.
  new.push_delivery_status := null;
  new.push_attempt_count := null;
  new.push_next_attempt_at := null;
  new.push_claim_token := null;
  new.push_claim_expires_at := null;
  new.push_enqueued_at := null;
  new.push_completed_at := null;
  new.push_last_error_code := null;

  if nullif(btrim(new.event_key), '') is null then
    return new;
  end if;

  if new.recipient_role = 'admin'
    and new.recipient_clerk_user_id is null
    and new.type in (
      'match.dispute_opened',
      'match.no_show_disputed',
      'match.admin_assistance_requested'
    ) then
    v_eligible := true;
  elsif new.recipient_role = 'player'
    and nullif(btrim(new.recipient_clerk_user_id), '') is not null
    and (
      new.type in (
        'registration.approved',
        'registration.rejected',
        'registration.waitlist_offer',
        'registration.waitlist_closed',
        'tournament.cancelled',
        'tournament.voided',
        'match.ready',
        'match.automatic_advance',
        'match.deadline_updated',
        'match.deadline_reminder',
        'match.deadline_ruling',
        'match.confirmation_required',
        'match.no_show_reported',
        'match.no_show_confirmed',
        'match.no_show_disputed',
        'match.no_show_approved',
        'match.no_show_rejected',
        'match.no_show_review_required',
        'match.result_approved',
        'match.result_review_required',
        'poll.decision_published'
      )
      or (
        new.type = 'poll.published'
        and new.metadata ->> 'purpose' = 'tournament_decision'
      )
    ) then
    v_eligible := true;
  end if;

  if not v_eligible then
    return new;
  end if;

  v_now := clock_timestamp();
  new.push_delivery_status := 'pending';
  new.push_attempt_count := 0;
  new.push_next_attempt_at := v_now;
  new.push_enqueued_at := v_now;
  return new;
end;
$$;

alter function public.initialize_web_push_state()
  owner to postgres;
revoke all on function public.initialize_web_push_state()
  from public, anon, authenticated, service_role;

create trigger notifications_initialize_web_push_state
before insert on public.notifications
for each row
execute function public.initialize_web_push_state();

create or replace function public.protect_notification_client_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user = 'postgres' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      raise exception
        'Notifications can only be created by protected server workflows';
    end if;

    if tg_op = 'DELETE' then
      raise exception 'Notifications cannot be deleted by clients';
    end if;

    if tg_op = 'UPDATE' then
      if old.id is distinct from new.id
        or old.recipient_clerk_user_id is distinct from
          new.recipient_clerk_user_id
        or old.recipient_role is distinct from new.recipient_role
        or old.type is distinct from new.type
        or old.title is distinct from new.title
        or old.message is distinct from new.message
        or old.actor_clerk_user_id is distinct from new.actor_clerk_user_id
        or old.actor_display_name is distinct from new.actor_display_name
        or old.tournament_id is distinct from new.tournament_id
        or old.tournament_title is distinct from new.tournament_title
        or old.registration_id is distinct from new.registration_id
        or old.match_id is distinct from new.match_id
        or old.report_group_id is distinct from new.report_group_id
        or old.metadata is distinct from new.metadata
        or old.event_key is distinct from new.event_key
        or old.created_at is distinct from new.created_at
        or old.email_template_key is distinct from new.email_template_key
        or old.email_delivery_status is distinct from
          new.email_delivery_status
        or old.email_attempt_count is distinct from new.email_attempt_count
        or old.email_next_attempt_at is distinct from
          new.email_next_attempt_at
        or old.email_claim_token is distinct from new.email_claim_token
        or old.email_claim_expires_at is distinct from
          new.email_claim_expires_at
        or old.email_sent_at is distinct from new.email_sent_at
        or old.email_last_error_code is distinct from
          new.email_last_error_code
        or old.email_provider_message_id is distinct from
          new.email_provider_message_id
        or old.push_delivery_status is distinct from
          new.push_delivery_status
        or old.push_attempt_count is distinct from new.push_attempt_count
        or old.push_next_attempt_at is distinct from
          new.push_next_attempt_at
        or old.push_claim_token is distinct from new.push_claim_token
        or old.push_claim_expires_at is distinct from
          new.push_claim_expires_at
        or old.push_enqueued_at is distinct from new.push_enqueued_at
        or old.push_completed_at is distinct from new.push_completed_at
        or old.push_last_error_code is distinct from
          new.push_last_error_code then
        raise exception
          'Only notification read and in-app visibility state can be updated by clients';
      end if;

      if old.read_at is not null and new.read_at is null then
        raise exception 'Notifications cannot be marked unread by clients';
      end if;

      if old.in_app_hidden_at is not null
        and new.in_app_hidden_at is null then
        raise exception 'Hidden notifications cannot be restored by clients';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.protect_notification_client_mutation()
  owner to postgres;
revoke all on function public.protect_notification_client_mutation()
  from public, anon, authenticated, service_role;
grant execute on function public.protect_notification_client_mutation()
  to service_role;

create or replace function public.claim_web_push_notifications(
  p_limit integer default 10
)
returns table (
  notification_id uuid,
  recipient_clerk_user_id text,
  recipient_role text,
  notification_type text,
  event_key text,
  tournament_id uuid,
  registration_id uuid,
  match_id uuid,
  report_group_id uuid,
  metadata jsonb,
  push_enqueued_at timestamptz,
  push_attempt_count integer,
  push_claim_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_limit integer;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 10), 10));
  v_now := clock_timestamp();

  -- Read/hidden notifications are terminal for external delivery. This update
  -- also closes work that became stale while waiting for a due slot.
  with stale as materialized (
    select notification.id
    from public.notifications as notification
    where notification.push_delivery_status in (
        'pending',
        'retryable_failure'
      )
      and (
        notification.read_at is not null
        or notification.in_app_hidden_at is not null
      )
    order by notification.push_next_attempt_at, notification.id
    limit v_limit
    for update of notification skip locked
  )
  update public.notifications as notification
  set
    push_delivery_status = 'skipped',
    push_next_attempt_at = null,
    push_completed_at = v_now,
    push_last_error_code = 'NO_LONGER_UNREAD'
  from stale
  where notification.id = stale.id;

  with expired as materialized (
    select notification.id
    from public.notifications as notification
    where notification.push_delivery_status = 'processing'
      and notification.push_claim_expires_at <= v_now
    order by notification.push_claim_expires_at, notification.id
    limit v_limit
    for update of notification skip locked
  )
  update public.notifications as notification
  set
    push_delivery_status = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null then 'skipped'
      when notification.push_attempt_count >= 5 then 'permanent_failure'
      else 'retryable_failure'
    end,
    push_next_attempt_at = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        or notification.push_attempt_count >= 5 then null
      else v_now
    end,
    push_claim_token = null,
    push_claim_expires_at = null,
    push_completed_at = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        or notification.push_attempt_count >= 5 then v_now
      else null
    end,
    push_last_error_code = case
      when notification.read_at is not null
        or notification.in_app_hidden_at is not null
        then 'NO_LONGER_UNREAD'
      when notification.push_attempt_count >= 5
        then 'LEASE_EXPIRED_FINAL_ATTEMPT'
      else 'LEASE_EXPIRED'
    end
  from expired
  where notification.id = expired.id;

  return query
  with due as materialized (
    select notification.id, notification.push_next_attempt_at
    from public.notifications as notification
    where notification.push_delivery_status in (
        'pending',
        'retryable_failure'
      )
      and notification.push_next_attempt_at <= v_now
      and notification.push_attempt_count < 5
      and notification.read_at is null
      and notification.in_app_hidden_at is null
    order by notification.push_next_attempt_at, notification.id
    limit v_limit
    for update of notification skip locked
  ),
  claimed as (
    update public.notifications as notification
    set
      push_delivery_status = 'processing',
      push_attempt_count = notification.push_attempt_count + 1,
      push_next_attempt_at = null,
      push_claim_token = gen_random_uuid(),
      push_claim_expires_at = v_now + interval '10 minutes',
      push_completed_at = null,
      push_last_error_code = null
    from due
    where notification.id = due.id
    returning
      notification.id,
      notification.recipient_clerk_user_id,
      notification.recipient_role,
      notification.type,
      notification.event_key,
      notification.tournament_id,
      notification.registration_id,
      notification.match_id,
      notification.report_group_id,
      notification.metadata,
      notification.push_enqueued_at,
      notification.push_attempt_count,
      notification.push_claim_token,
      due.push_next_attempt_at as claimed_due_at
  )
  select
    claimed.id,
    claimed.recipient_clerk_user_id,
    claimed.recipient_role,
    claimed.type,
    claimed.event_key,
    claimed.tournament_id,
    claimed.registration_id,
    claimed.match_id,
    claimed.report_group_id,
    claimed.metadata,
    claimed.push_enqueued_at,
    claimed.push_attempt_count,
    claimed.push_claim_token
  from claimed
  order by claimed.claimed_due_at, claimed.id;
end;
$$;

alter function public.claim_web_push_notifications(integer)
  owner to postgres;
revoke all on function public.claim_web_push_notifications(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_web_push_notifications(integer)
  to service_role;

create or replace function public.complete_web_push_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt_count integer;
  v_error_code text;
  v_final_status text;
  v_next_attempt_at timestamptz;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_outcome not in (
    'sent',
    'skipped',
    'retryable_failure',
    'permanent_failure'
  ) then
    raise exception 'Invalid Push completion outcome'
      using errcode = '22023';
  end if;

  v_now := clock_timestamp();

  select notification.push_attempt_count
  into v_attempt_count
  from public.notifications as notification
  where notification.id = p_notification_id
    and notification.push_delivery_status = 'processing'
    and notification.push_claim_token = p_claim_token
    and notification.push_claim_expires_at > v_now
  for update;

  if not found then
    raise exception 'No active Push claim' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_final_status := 'sent';
    v_error_code := null;
    v_next_attempt_at := null;
  else
    v_error_code := case
      when p_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        then p_error_code
      else 'UNCLASSIFIED_FAILURE'
    end;

    if p_outcome = 'retryable_failure' and v_attempt_count >= 5 then
      v_final_status := 'permanent_failure';
      v_next_attempt_at := null;
    elsif p_outcome = 'retryable_failure' then
      v_final_status := 'retryable_failure';
      v_next_attempt_at := v_now + case v_attempt_count
        when 1 then interval '5 minutes'
        when 2 then interval '15 minutes'
        when 3 then interval '30 minutes'
        else interval '2 hours'
      end;
    else
      v_final_status := p_outcome;
      v_next_attempt_at := null;
    end if;
  end if;

  update public.notifications as notification
  set
    push_delivery_status = v_final_status,
    push_next_attempt_at = v_next_attempt_at,
    push_claim_token = null,
    push_claim_expires_at = null,
    push_completed_at = case
      when v_final_status in ('sent', 'skipped', 'permanent_failure')
        then v_now
      else null
    end,
    push_last_error_code = v_error_code
  where notification.id = p_notification_id
    and notification.push_delivery_status = 'processing'
    and notification.push_claim_token = p_claim_token
    and notification.push_claim_expires_at > v_now;

  if not found then
    raise exception 'No active Push claim' using errcode = '55000';
  end if;

  return true;
end;
$$;

alter function public.complete_web_push_notification(
  uuid,
  uuid,
  text,
  text
) owner to postgres;
revoke all on function public.complete_web_push_notification(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_web_push_notification(
  uuid,
  uuid,
  text,
  text
) to service_role;

commit;
