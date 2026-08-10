begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

alter table public.notifications
  add column if not exists email_template_key text,
  add column if not exists email_delivery_status text,
  add column if not exists email_attempt_count integer,
  add column if not exists email_next_attempt_at timestamptz,
  add column if not exists email_claim_token uuid,
  add column if not exists email_claim_expires_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_last_error_code text,
  add column if not exists email_provider_message_id text;

-- Add the default only after the nullable column exists. Existing rows remain
-- null and therefore email-ineligible; new eligible rows are initialized by
-- the insert trigger below.
alter table public.notifications
  alter column email_attempt_count set default 0;

alter table public.notifications
  drop constraint if exists notifications_email_template_key_check,
  drop constraint if exists notifications_email_delivery_status_check,
  drop constraint if exists notifications_email_pair_check,
  drop constraint if exists notifications_email_attempt_count_check,
  drop constraint if exists notifications_email_ineligible_state_check,
  drop constraint if exists notifications_email_claim_state_check,
  drop constraint if exists notifications_email_next_attempt_check,
  drop constraint if exists notifications_email_terminal_schedule_check,
  drop constraint if exists notifications_email_sent_state_check,
  drop constraint if exists notifications_email_error_code_check,
  drop constraint if exists notifications_email_error_state_check,
  drop constraint if exists notifications_email_provider_id_check,
  drop constraint if exists notifications_email_provider_state_check;

alter table public.notifications
  add constraint notifications_email_template_key_check
    check (
      email_template_key is null
      or email_template_key in (
        'registration_approved',
        'division_started_first_match',
        'later_round_match_ready',
        'deadline_reminder_72h',
        'deadline_reminder_24h'
      )
    ),
  add constraint notifications_email_delivery_status_check
    check (
      email_delivery_status is null
      or email_delivery_status in (
        'pending',
        'processing',
        'sent',
        'skipped',
        'retryable_failure',
        'permanent_failure'
      )
    ),
  add constraint notifications_email_pair_check
    check (
      (
        email_template_key is null
        and email_delivery_status is null
      )
      or (
        email_template_key is not null
        and email_delivery_status is not null
        and email_attempt_count is not null
      )
    ),
  add constraint notifications_email_attempt_count_check
    check (
      email_attempt_count is null
      or email_attempt_count between 0 and 5
    ),
  add constraint notifications_email_ineligible_state_check
    check (
      email_template_key is not null
      or (
        email_attempt_count is null
        and email_next_attempt_at is null
        and email_claim_token is null
        and email_claim_expires_at is null
        and email_sent_at is null
        and email_last_error_code is null
        and email_provider_message_id is null
      )
    ),
  add constraint notifications_email_claim_state_check
    check (
      (
        email_delivery_status = 'processing'
        and email_claim_token is not null
        and email_claim_expires_at is not null
      )
      or (
        email_delivery_status is distinct from 'processing'
        and email_claim_token is null
        and email_claim_expires_at is null
      )
    ),
  add constraint notifications_email_next_attempt_check
    check (
      (
        email_delivery_status in ('pending', 'retryable_failure')
        and email_next_attempt_at is not null
      )
      or (
        email_delivery_status in (
          'processing',
          'sent',
          'skipped',
          'permanent_failure'
        )
        and email_next_attempt_at is null
      )
      or (
        email_delivery_status is null
        and email_next_attempt_at is null
      )
    ),
  add constraint notifications_email_terminal_schedule_check
    check (
      (
        email_delivery_status in ('skipped', 'permanent_failure')
        and email_next_attempt_at is null
      )
      or email_delivery_status not in ('skipped', 'permanent_failure')
      or email_delivery_status is null
    ),
  add constraint notifications_email_sent_state_check
    check (
      (
        email_delivery_status = 'sent'
        and email_sent_at is not null
      )
      or (
        email_delivery_status is distinct from 'sent'
        and email_sent_at is null
      )
    ),
  add constraint notifications_email_error_code_check
    check (
      email_last_error_code is null
      or (
        length(email_last_error_code) <= 64
        and email_last_error_code ~ '^[A-Z][A-Z0-9_]*$'
      )
    ),
  add constraint notifications_email_error_state_check
    check (
      (
        email_delivery_status in (
          'skipped',
          'retryable_failure',
          'permanent_failure'
        )
        and email_last_error_code is not null
      )
      or (
        email_delivery_status in ('pending', 'processing', 'sent')
        and email_last_error_code is null
      )
      or (
        email_delivery_status is null
        and email_last_error_code is null
      )
    ),
  add constraint notifications_email_provider_id_check
    check (
      email_provider_message_id is null
      or (
        nullif(btrim(email_provider_message_id), '') is not null
        and length(email_provider_message_id) <= 255
        and email_provider_message_id !~ '[[:cntrl:]]'
      )
    ),
  add constraint notifications_email_provider_state_check
    check (
      (
        email_delivery_status = 'sent'
        and email_provider_message_id is not null
      )
      or (
        email_delivery_status is distinct from 'sent'
        and email_provider_message_id is null
      )
    );

create index if not exists notifications_transactional_email_due_idx
  on public.notifications(email_next_attempt_at, id)
  where email_delivery_status in ('pending', 'retryable_failure');

create index if not exists notifications_transactional_email_expired_lease_idx
  on public.notifications(email_claim_expires_at, id)
  where email_delivery_status = 'processing';

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
          new.email_provider_message_id then
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
  from public, anon, authenticated;
grant execute on function public.protect_notification_client_mutation()
  to service_role;

create or replace function public.initialize_transactional_email_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registration public.registrations%rowtype;
  v_match public.tournament_matches%rowtype;
  v_match_context record;
  v_round_number integer;
  v_round_name text;
  v_max_round_number integer;
  v_bracket_id uuid;
  v_tournament_id uuid;
  v_format text;
  v_launched_at timestamptz;
  v_feeders_valid boolean;
  v_reminder_ordinal integer;
  v_template_key text;
  v_now timestamptz;
begin
  -- Defaults never make an ordinary notification eligible. Only the exact
  -- canonical branches below may repopulate this private state.
  new.email_template_key := null;
  new.email_delivery_status := null;
  new.email_attempt_count := null;
  new.email_next_attempt_at := null;
  new.email_claim_token := null;
  new.email_claim_expires_at := null;
  new.email_sent_at := null;
  new.email_last_error_code := null;
  new.email_provider_message_id := null;

  if nullif(btrim(new.event_key), '') is null then
    return new;
  end if;

  if new.type = 'registration.approved'
    and new.registration_id is not null
    and new.tournament_id is not null
    and nullif(btrim(new.recipient_clerk_user_id), '') is not null
    and new.recipient_role = 'player'
    and new.event_key = format(
      'registration:%s:approved',
      new.registration_id
    ) then
    select registration.*
    into v_registration
    from public.registrations as registration
    where registration.id = new.registration_id
      and registration.tournament_id = new.tournament_id
      and registration.clerk_user_id = new.recipient_clerk_user_id
      and registration.registration_status = 'approved';

    if found
      and v_registration.tournament_bracket_id is not null
      and new.metadata ->> 'nextStatus' = 'approved'
      and new.metadata ->> 'previousStatus' in (
        'pending',
        'manual_review',
        'rejected',
        'waitlisted',
        'withdrawn'
      )
      and new.metadata -> 'registrationId' = to_jsonb(v_registration.id)
      and new.metadata -> 'tournamentId' =
        to_jsonb(v_registration.tournament_id)
      and new.metadata -> 'bracketId' =
        to_jsonb(v_registration.tournament_bracket_id)
      and new.metadata ->> 'bracketName' is not distinct from
        v_registration.bracket_name then
      v_template_key := 'registration_approved';
    end if;
  elsif new.type in ('match.ready', 'match.deadline_reminder')
    and new.match_id is not null
    and new.registration_id is not null
    and new.tournament_id is not null
    and nullif(btrim(new.recipient_clerk_user_id), '') is not null
    and new.recipient_role = 'player' then
    select
      tournament_match as match_row,
      round.round_number as round_number,
      round.name as round_name,
      (
        select max(candidate_round.round_number)
        from public.bracket_rounds as candidate_round
        where candidate_round.generated_bracket_id =
          tournament_match.generated_bracket_id
      ) as max_round_number,
      bracket.id as bracket_id,
      bracket.tournament_id as tournament_id,
      generated.format as bracket_format,
      bracket.launched_at as launched_at
    into v_match_context
    from public.tournament_matches as tournament_match
    join public.bracket_rounds as round
      on round.id = tournament_match.round_id
      and round.generated_bracket_id =
        tournament_match.generated_bracket_id
    join public.generated_brackets as generated
      on generated.id = tournament_match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where tournament_match.id = new.match_id
      and bracket.launched_at is not null
      and tournament_match.player_one_registration_id is not null
      and tournament_match.player_two_registration_id is not null
      and tournament_match.outcome_type is null
      and tournament_match.deadline_ruled_at is null;

    if not found then
      return new;
    end if;

    v_match := v_match_context.match_row;
    v_round_number := v_match_context.round_number;
    v_round_name := v_match_context.round_name;
    v_max_round_number := v_match_context.max_round_number;
    v_bracket_id := v_match_context.bracket_id;
    v_tournament_id := v_match_context.tournament_id;
    v_format := v_match_context.bracket_format;
    v_launched_at := v_match_context.launched_at;

    if v_format <> 'single_elimination'
      or v_launched_at is null
      or v_match.status <> 'in_progress'
      -- Version one is the normal activation. Administrative reopen/reset
      -- activations increment it and must remain in-app only.
      or v_match.activation_version <> 1
      or v_match.activated_at is null
      or v_match.deadline_at is null
      or v_match.player_one_registration_id is null
      or v_match.player_two_registration_id is null
      or v_match.player_one_registration_id =
        v_match.player_two_registration_id
      or v_match.outcome_type is not null
      or v_match.deadline_ruled_at is not null
      or v_match.player_one_score is not null
      or v_match.player_two_score is not null
      or v_match.winner_registration_id is not null
      or v_match.official_result_submission_id is not null
      or v_match.official_result_decided_by is not null
      or v_match.official_result_decided_at is not null
      or v_match.hold_started_at is not null
        and v_match.hold_released_at is null
      or new.tournament_id is distinct from v_tournament_id
      or new.metadata -> 'tournamentId' is distinct from
        to_jsonb(v_tournament_id)
      or new.metadata -> 'bracketId' is distinct from to_jsonb(v_bracket_id)
      or new.metadata -> 'matchId' is distinct from to_jsonb(v_match.id)
      or new.metadata -> 'activationVersion' is distinct from
        to_jsonb(v_match.activation_version)
      or new.metadata ->> 'roundName' is distinct from v_round_name
      or not exists (
        select 1
        from public.registrations as recipient
        where recipient.id = new.registration_id
          and recipient.clerk_user_id = new.recipient_clerk_user_id
          and recipient.id in (
            v_match.player_one_registration_id,
            v_match.player_two_registration_id
          )
      ) then
      return new;
    end if;

    if new.type = 'match.ready' then
      if new.event_key <> format(
          'match:%s:activation:%s:ready',
          v_match.id,
          v_match.activation_version
        )
        or new.metadata ->> 'deadlineEvent' is distinct from 'ready'
        or new.metadata -> 'roundNumber' is distinct from
          to_jsonb(v_round_number)
        or new.metadata -> 'activatedAt' is distinct from
          to_jsonb(v_match.activated_at)
        or new.metadata -> 'deadlineAt' is distinct from
          to_jsonb(v_match.deadline_at)
        or new.metadata ? 'reopened'
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.match_id = v_match.id
        )
        or exists (
          select 1
          from public.match_result_submissions as submission
          where submission.match_id = v_match.id
        ) then
        return new;
      end if;

      if v_round_number = 1 then
        v_template_key := 'division_started_first_match';
      elsif v_round_number > 1
        and v_round_number >= v_max_round_number - 1 then
        select
          count(*) = 2
          and bool_and(
            (
              feeder.match_number = (v_match.match_number * 2) - 1
              and feeder.winner_registration_id =
                v_match.player_one_registration_id
            )
            or (
              feeder.match_number = v_match.match_number * 2
              and feeder.winner_registration_id =
                v_match.player_two_registration_id
            )
          )
        into v_feeders_valid
        from public.bracket_rounds as prior_round
        join public.tournament_matches as feeder
          on feeder.round_id = prior_round.id
          and feeder.generated_bracket_id =
            v_match.generated_bracket_id
          and feeder.match_number in (
            (v_match.match_number * 2) - 1,
            v_match.match_number * 2
          )
        where prior_round.generated_bracket_id =
            v_match.generated_bracket_id
          and prior_round.round_number = v_round_number - 1
          and feeder.status = 'completed'
          and feeder.outcome_type is null
          and feeder.deadline_ruled_at is null
          and feeder.winner_registration_id is not null;

        if coalesce(v_feeders_valid, false) then
          v_template_key := 'later_round_match_ready';
        end if;
      end if;
    elsif new.type = 'match.deadline_reminder' then
      if new.metadata -> 'reminderOrdinal' = to_jsonb(1) then
        v_reminder_ordinal := 1;
      elsif new.metadata -> 'reminderOrdinal' = to_jsonb(2) then
        v_reminder_ordinal := 2;
      else
        return new;
      end if;

      if new.event_key <> format(
          'match:%s:activation:%s:reminder:%s',
          v_match.id,
          v_match.activation_version,
          v_reminder_ordinal
        )
        or new.metadata ->> 'deadlineEvent' is distinct from 'reminder'
        or new.metadata -> 'deadlineAt' is distinct from
          to_jsonb(v_match.deadline_at)
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.match_id = v_match.id
            and (
              (
                report_group.status in (
                  'pending_confirmation',
                  'disputed',
                  'under_review'
                )
                and report_group.finalized_at is null
              )
              or report_group.status in (
                'confirmed',
                'auto_approved',
                'approved'
              )
            )
        )
        or exists (
          select 1
          from public.match_result_submissions as submission
          where submission.match_id = v_match.id
            and submission.status = 'pending'
        ) then
        return new;
      end if;

      v_now := clock_timestamp();
      if v_reminder_ordinal = 1
        and v_match.deadline_at > v_now + interval '24 hours'
        and v_match.deadline_at <= v_now + interval '72 hours' then
        v_template_key := 'deadline_reminder_72h';
      elsif v_reminder_ordinal = 2
        and v_match.deadline_at > v_now
        and v_match.deadline_at <= v_now + interval '24 hours' then
        v_template_key := 'deadline_reminder_24h';
      end if;
    end if;
  end if;

  if v_template_key is not null then
    new.email_template_key := v_template_key;
    new.email_delivery_status := 'pending';
    new.email_attempt_count := 0;
    new.email_next_attempt_at := clock_timestamp();
  end if;

  return new;
end;
$$;

alter function public.initialize_transactional_email_state()
  owner to postgres;
revoke all on function public.initialize_transactional_email_state()
  from public, anon, authenticated, service_role;

drop trigger if exists notifications_initialize_transactional_email_state
  on public.notifications;
create trigger notifications_initialize_transactional_email_state
before insert on public.notifications
for each row
execute function public.initialize_transactional_email_state();

create or replace function public.create_registration_approved_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.registration_status = 'approved'
    and old.registration_status is distinct from 'approved' then
    if exists (
      select 1
      from public.notifications as notification
      where notification.registration_id = new.id
        and notification.type = 'registration.approved'
        and notification.event_key = format(
          'registration:%s:approved',
          new.id
        )
    ) then
      return new;
    end if;

    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      actor_display_name,
      tournament_id,
      tournament_title,
      registration_id,
      metadata,
      event_key
    )
    values (
      new.clerk_user_id,
      'player',
      'registration.approved',
      'Registration Approved',
      format(
        'You have been approved for %s.',
        coalesce(nullif(btrim(new.tournament_title), ''), 'this tournament')
      ),
      'IronClad Admin',
      new.tournament_id,
      new.tournament_title,
      new.id,
      jsonb_build_object(
        'registrationId', new.id,
        'tournamentId', new.tournament_id,
        'bracketId', new.tournament_bracket_id,
        'bracketName', new.bracket_name,
        'previousStatus', old.registration_status,
        'nextStatus', 'approved'
      ),
      format('registration:%s:approved', new.id)
    )
    on conflict (recipient_clerk_user_id, event_key)
      where event_key is not null
    do nothing;
  end if;

  return new;
end;
$$;

alter function public.create_registration_approved_notification()
  owner to postgres;
revoke all on function public.create_registration_approved_notification()
  from public, anon, authenticated, service_role;

drop trigger if exists registrations_create_approved_notification
  on public.registrations;
create trigger registrations_create_approved_notification
after update of registration_status on public.registrations
for each row
execute function public.create_registration_approved_notification();

create or replace function public.claim_transactional_email_notifications(
  p_limit integer default 10
)
returns table (
  notification_id uuid,
  recipient_clerk_user_id text,
  notification_type text,
  event_key text,
  email_template_key text,
  tournament_id uuid,
  registration_id uuid,
  match_id uuid,
  metadata jsonb,
  email_attempt_count integer,
  email_claim_token uuid
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
    raise exception 'Not authorized';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 10), 10));
  v_now := clock_timestamp();

  -- Reclaim a bounded set of expired leases without blocking another worker.
  -- A fifth attempt becomes terminal; earlier attempts re-enter due work.
  with expired as materialized (
    select notification.id
    from public.notifications as notification
    where notification.email_delivery_status = 'processing'
      and notification.email_claim_expires_at <= v_now
    order by notification.email_claim_expires_at, notification.id
    limit v_limit
    for update of notification skip locked
  )
  update public.notifications as notification
  set
    email_delivery_status = case
      when notification.email_attempt_count >= 5
        then 'permanent_failure'
      else 'retryable_failure'
    end,
    email_next_attempt_at = case
      when notification.email_attempt_count >= 5 then null
      else v_now
    end,
    email_claim_token = null,
    email_claim_expires_at = null,
    email_last_error_code = case
      when notification.email_attempt_count >= 5
        then 'LEASE_EXPIRED_FINAL_ATTEMPT'
      else 'LEASE_EXPIRED'
    end,
    email_provider_message_id = null
  from expired
  where notification.id = expired.id;

  return query
  with due as materialized (
    select
      notification.id,
      notification.email_next_attempt_at
    from public.notifications as notification
    where notification.email_delivery_status in (
        'pending',
        'retryable_failure'
      )
      and notification.email_next_attempt_at <= v_now
      and notification.email_attempt_count < 5
    order by notification.email_next_attempt_at, notification.id
    limit v_limit
    for update of notification skip locked
  ),
  claimed as (
    update public.notifications as notification
    set
      email_delivery_status = 'processing',
      email_attempt_count = notification.email_attempt_count + 1,
      email_next_attempt_at = null,
      email_claim_token = gen_random_uuid(),
      email_claim_expires_at = v_now + interval '10 minutes',
      email_last_error_code = null,
      email_provider_message_id = null
    from due
    where notification.id = due.id
    returning
      notification.id,
      notification.recipient_clerk_user_id,
      notification.type,
      notification.event_key,
      notification.email_template_key,
      notification.tournament_id,
      notification.registration_id,
      notification.match_id,
      notification.metadata,
      notification.email_attempt_count,
      notification.email_claim_token,
      due.email_next_attempt_at as claimed_due_at
  )
  select
    claimed.id,
    claimed.recipient_clerk_user_id,
    claimed.type,
    claimed.event_key,
    claimed.email_template_key,
    claimed.tournament_id,
    claimed.registration_id,
    claimed.match_id,
    claimed.metadata,
    claimed.email_attempt_count,
    claimed.email_claim_token
  from claimed
  order by claimed.claimed_due_at, claimed.id;
end;
$$;

alter function public.claim_transactional_email_notifications(integer)
  owner to postgres;
revoke all on function
  public.claim_transactional_email_notifications(integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.claim_transactional_email_notifications(integer)
  to service_role;

create or replace function public.complete_transactional_email_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_attempt_count integer;
  v_error_code text;
  v_next_attempt_at timestamptz;
  v_final_status text;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_outcome not in (
    'sent',
    'skipped',
    'retryable_failure',
    'permanent_failure'
  ) then
    raise exception 'Invalid email completion outcome';
  end if;

  v_now := clock_timestamp();

  select notification.email_attempt_count
  into v_attempt_count
  from public.notifications as notification
  where notification.id = p_notification_id
    and notification.email_delivery_status = 'processing'
    and notification.email_claim_token = p_claim_token
    and notification.email_claim_expires_at > v_now
  for update;

  if not found then
    raise exception 'No active email claim';
  end if;

  if p_outcome = 'sent' then
    if nullif(btrim(p_provider_message_id), '') is null
      or length(p_provider_message_id) > 255
      or p_provider_message_id ~ '[[:cntrl:]]' then
      raise exception 'Invalid provider message ID';
    end if;

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
    email_delivery_status = v_final_status,
    email_next_attempt_at = v_next_attempt_at,
    email_claim_token = null,
    email_claim_expires_at = null,
    email_sent_at = case
      when v_final_status = 'sent' then v_now
      else null
    end,
    email_last_error_code = v_error_code,
    email_provider_message_id = case
      when v_final_status = 'sent' then btrim(p_provider_message_id)
      else null
    end
  where notification.id = p_notification_id
    and notification.email_delivery_status = 'processing'
    and notification.email_claim_token = p_claim_token
    and notification.email_claim_expires_at > v_now;

  if not found then
    raise exception 'No active email claim';
  end if;

  return true;
end;
$$;

alter function public.complete_transactional_email_notification(
  uuid,
  uuid,
  text,
  text,
  text
) owner to postgres;
revoke all on function public.complete_transactional_email_notification(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_transactional_email_notification(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;

create or replace function public.invoke_transactional_email_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_worker_url text;
  v_worker_secret text;
begin
  select secret.decrypted_secret
  into v_worker_url
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_transactional_email_worker_url'
  limit 1;

  select secret.decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_transactional_email_worker_secret'
  limit 1;

  v_worker_url := nullif(btrim(v_worker_url), '');
  v_worker_secret := nullif(btrim(v_worker_secret), '');

  if v_worker_url is null or v_worker_secret is null then
    return null;
  end if;

  if v_worker_url !~
      '^https://[^/?#@[:space:]]+/api/internal/transactional-email$'
    or position('?' in v_worker_url) > 0
    or position('#' in v_worker_url) > 0
    or position('@' in v_worker_url) > 0 then
    return null;
  end if;

  return net.http_post(
    url := v_worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_worker_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 70000
  );
end;
$$;

alter function public.invoke_transactional_email_worker()
  owner to postgres;
revoke all on function public.invoke_transactional_email_worker()
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'ironclad-transactional-email-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'ironclad-transactional-email-worker',
    '*/5 * * * *',
    'select public.invoke_transactional_email_worker();'
  );
end;
$$;

revoke all privileges on table public.notifications
  from public, anon, authenticated;
grant all privileges on table public.notifications
  to service_role;

commit;
