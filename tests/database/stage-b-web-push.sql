\set ON_ERROR_STOP on

-- Rollback-only Stage B Web Push database contract. Run only against the
-- explicitly approved Staging project after the Stage B migration.
set client_min_messages = warning;
set role postgres;
set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"stage-b-web-push-contract"}';

create temporary table stage_b_web_push_baseline
on commit preserve rows
as
select pg_catalog.jsonb_build_object(
  'subscriptions', (select pg_catalog.count(*) from public.push_subscriptions),
  'notifications', (select pg_catalog.count(*) from public.notifications)
) as counts;

create function pg_temp.stage_b_push_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Stage B Web Push contract failed: %', p_message;
  end if;
end;
$$;

begin isolation level repeatable read;

do $$
declare
  v_owner constant text := 'stage-b-push-owner';
  v_other constant text := 'stage-b-push-other';
  v_closure constant text := 'stage-b-push-closure-no-player';
  v_endpoint constant text :=
    'https://fcm.googleapis.com/fcm/send/stage-b-primary';
  v_p256dh constant text := repeat('A', 87);
  v_auth constant text := repeat('B', 22);
  v_first_id uuid;
  v_refreshed_id uuid;
  v_notification_id uuid;
  v_claim record;
  v_failed boolean;
  v_outcome jsonb;
  v_index integer;
begin
  perform pg_temp.stage_b_push_assert(
    to_regclass('public.push_subscriptions') is not null,
    'subscription table is absent'
  );
  perform pg_temp.stage_b_push_assert(
    (
      select relrowsecurity
      from pg_catalog.pg_class
      where oid = 'public.push_subscriptions'::regclass
    ),
    'RLS is not enabled'
  );
  perform pg_temp.stage_b_push_assert(
    not pg_catalog.has_table_privilege(
      'anon',
      'public.push_subscriptions',
      'select'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.push_subscriptions',
      'select'
    ),
    'browser roles can read subscription secrets'
  );

  v_first_id := public.upsert_web_push_subscription(
    v_owner,
    v_endpoint,
    v_p256dh,
    v_auth,
    null
  );
  v_refreshed_id := public.upsert_web_push_subscription(
    v_owner,
    v_endpoint,
    v_p256dh,
    v_auth,
    null
  );
  perform pg_temp.stage_b_push_assert(
    v_first_id = v_refreshed_id
    and (
      select count(*)
      from public.push_subscriptions
      where endpoint = v_endpoint
    ) = 1,
    'same-owner endpoint refresh is not idempotent'
  );

  v_failed := false;
  begin
    perform public.upsert_web_push_subscription(
      v_other,
      v_endpoint,
      v_p256dh,
      v_auth,
      null
    );
  exception
    when unique_violation then
      v_failed := true;
  end;
  perform pg_temp.stage_b_push_assert(
    v_failed,
    'cross-account endpoint ownership was reassigned'
  );

  perform pg_temp.stage_b_push_assert(
    public.delete_web_push_subscription(v_other, v_endpoint) = false,
    'cross-account endpoint deletion disclosed or deleted ownership'
  );
  perform pg_temp.stage_b_push_assert(
    exists (
      select 1 from public.push_subscriptions where id = v_first_id
    ),
    'cross-account deletion removed the endpoint'
  );

  perform public.upsert_web_push_subscription(
    v_owner,
    'https://fcm.googleapis.com/fcm/send/stage-b-second-device',
    v_p256dh,
    v_auth,
    null
  );
  perform pg_temp.stage_b_push_assert(
    public.delete_web_push_subscription(v_owner, v_endpoint),
    'current-device deletion did not remove the owned endpoint'
  );
  perform pg_temp.stage_b_push_assert(
    not exists (
      select 1 from public.push_subscriptions where endpoint = v_endpoint
    )
    and exists (
      select 1
      from public.push_subscriptions
      where endpoint =
        'https://fcm.googleapis.com/fcm/send/stage-b-second-device'
    ),
    'current-device deletion removed another owned device'
  );

  for v_index in 1..10 loop
    perform public.upsert_web_push_subscription(
      'stage-b-push-cap',
      pg_catalog.format(
        'https://fcm.googleapis.com/fcm/send/stage-b-cap-%s',
        v_index
      ),
      v_p256dh,
      v_auth,
      null
    );
  end loop;

  v_failed := false;
  begin
    perform public.upsert_web_push_subscription(
      'stage-b-push-cap',
      'https://fcm.googleapis.com/fcm/send/stage-b-cap-11',
      v_p256dh,
      v_auth,
      null
    );
  exception
    when program_limit_exceeded then
      v_failed := true;
  end;
  perform pg_temp.stage_b_push_assert(
    v_failed,
    'ten-subscription account cap was bypassed'
  );

  -- Simulate a pre-cutover row by suspending only the Stage B enrollment
  -- trigger. Its private Push state must stay null forever.
  alter table public.notifications
    disable trigger notifications_initialize_web_push_state;
  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    v_owner,
    'player',
    'match.ready',
    'Historical fixture',
    'Historical fixture',
    'stage-b:historical:match-ready'
  ) returning id into v_notification_id;
  alter table public.notifications
    enable trigger notifications_initialize_web_push_state;
  perform pg_temp.stage_b_push_assert(
    (
      select push_delivery_status is null
        and push_enqueued_at is null
      from public.notifications
      where id = v_notification_id
    ),
    'historical row entered Push delivery'
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    v_owner,
    'player',
    'match.ready',
    'Eligible fixture',
    'Eligible fixture',
    'stage-b:eligible:match-ready'
  ) returning id into v_notification_id;
  perform pg_temp.stage_b_push_assert(
    (
      select push_delivery_status = 'pending'
        and push_attempt_count = 0
        and push_enqueued_at is not null
      from public.notifications
      where id = v_notification_id
    ),
    'new eligible Player row was not enrolled'
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    v_owner,
    'player',
    'registration.waitlisted',
    'In-site fixture',
    'In-site fixture',
    'stage-b:in-site:waitlisted'
  );
  perform pg_temp.stage_b_push_assert(
    (
      select push_delivery_status is null
      from public.notifications
      where event_key = 'stage-b:in-site:waitlisted'
    ),
    'in-site-only Player row entered Push delivery'
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    null,
    'admin',
    'registration.submitted',
    'In-site Admin fixture',
    'In-site Admin fixture',
    'stage-b:admin:registration-submitted'
  );
  perform pg_temp.stage_b_push_assert(
    (
      select push_delivery_status is null
      from public.notifications
      where event_key = 'stage-b:admin:registration-submitted'
    ),
    'in-site-only Admin row entered Push delivery'
  );

  foreach v_index in array array[1, 2, 3] loop
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      event_key
    ) values (
      null,
      'admin',
      case v_index
        when 1 then 'match.dispute_opened'
        when 2 then 'match.no_show_disputed'
        else 'match.admin_assistance_requested'
      end,
      'Admin fixture',
      'Admin fixture',
      pg_catalog.format('stage-b:admin:eligible:%s', v_index)
    );
  end loop;
  perform pg_temp.stage_b_push_assert(
    (
      select count(*)
      from public.notifications
      where event_key like 'stage-b:admin:eligible:%'
        and push_delivery_status = 'pending'
    ) = 3,
    'exact approved Admin set was not enrolled'
  );

  -- Make the Player fixture deterministically first in the bounded claim.
  update public.notifications
  set push_next_attempt_at = '2000-01-01T00:00:00Z'
  where id = v_notification_id;

  select claimed.*
  into v_claim
  from public.claim_web_push_notifications(10) as claimed
  where claimed.notification_id = v_notification_id;
  perform pg_temp.stage_b_push_assert(
    v_claim.notification_id = v_notification_id
    and v_claim.push_attempt_count = 1
    and v_claim.push_claim_token is not null,
    'claim/lease did not claim the eligible fixture exactly once'
  );
  perform pg_temp.stage_b_push_assert(
    not exists (
      select 1
      from public.claim_web_push_notifications(10) as claimed_again
      where claimed_again.notification_id = v_notification_id
    ),
    'an active Push claim was reclaimed before lease expiry'
  );
  perform pg_temp.stage_b_push_assert(
    public.complete_web_push_notification(
      v_claim.notification_id,
      v_claim.push_claim_token,
      'sent',
      null
    ),
    'token-bound completion failed'
  );
  perform pg_temp.stage_b_push_assert(
    (
      select push_delivery_status = 'sent'
        and push_completed_at is not null
        and push_claim_token is null
      from public.notifications
      where id = v_notification_id
    ),
    'completed delivery state is incoherent'
  );

  -- A subscription created after the event snapshot cannot match the worker
  -- cutoff for that old event.
  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    'stage-b-late-owner',
    'player',
    'match.ready',
    'Late-subscription fixture',
    'Late-subscription fixture',
    'stage-b:late-subscription:notification'
  ) returning id into v_notification_id;
  perform public.upsert_web_push_subscription(
    'stage-b-late-owner',
    'https://fcm.googleapis.com/fcm/send/stage-b-late',
    v_p256dh,
    v_auth,
    null
  );
  perform pg_temp.stage_b_push_assert(
    (
      select count(*)
      from public.push_subscriptions as subscription
      join public.notifications as notification
        on notification.id = v_notification_id
      where subscription.owner_clerk_user_id = 'stage-b-late-owner'
        and subscription.created_at <= notification.push_enqueued_at
    ) = 0,
    'late subscription matched an older notification snapshot'
  );

  perform public.upsert_web_push_subscription(
    v_closure,
    'https://fcm.googleapis.com/fcm/send/stage-b-closure',
    v_p256dh,
    v_auth,
    null
  );
  v_outcome := public.close_ironclad_player_account(v_closure);
  perform pg_temp.stage_b_push_assert(
    v_outcome ->> 'outcome' = 'not_found'
    and not exists (
      select 1
      from public.push_subscriptions
      where owner_clerk_user_id = v_closure
    ),
    'account closure left an active endpoint'
  );
end;
$$;

rollback;

select pg_temp.stage_b_push_assert(
  (select counts from stage_b_web_push_baseline) =
    pg_catalog.jsonb_build_object(
      'subscriptions', (
        select pg_catalog.count(*) from public.push_subscriptions
      ),
      'notifications', (
        select pg_catalog.count(*) from public.notifications
      )
    ),
  'rollback left fixture residue'
);

drop table stage_b_web_push_baseline;
