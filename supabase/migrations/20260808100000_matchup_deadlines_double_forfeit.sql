begin;

-- Matchup deadlines are attached to one concrete bracket match. Existing
-- completed rows are intentionally left without retroactive activations; the
-- bounded reconciler gives eligible launched, incomplete rows a fresh seven
-- day activation from database time after deployment.
alter table public.tournament_matches
  add column if not exists activation_version integer not null default 0,
  add column if not exists activated_at timestamptz,
  add column if not exists deadline_at timestamptz,
  add column if not exists outcome_type text,
  add column if not exists deadline_ruled_at timestamptz,
  add column if not exists extension_minutes smallint,
  add column if not exists extension_reason text,
  add column if not exists extended_at timestamptz,
  add column if not exists extended_by_clerk_user_id text,
  add column if not exists hold_started_at timestamptz,
  add column if not exists hold_released_at timestamptz,
  add column if not exists hold_reason text,
  add column if not exists held_by_clerk_user_id text;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_activation_version_check,
  drop constraint if exists tournament_matches_activation_fields_check,
  drop constraint if exists tournament_matches_deadline_after_activation_check,
  drop constraint if exists tournament_matches_outcome_type_check,
  drop constraint if exists tournament_matches_outcome_integrity_check,
  drop constraint if exists tournament_matches_extension_integrity_check,
  drop constraint if exists tournament_matches_hold_integrity_check;

alter table public.tournament_matches
  add constraint tournament_matches_activation_version_check
    check (activation_version >= 0),
  add constraint tournament_matches_activation_fields_check
    check (
      (
        activation_version = 0
        and activated_at is null
        and deadline_at is null
      )
      or (
        activation_version > 0
        and activated_at is not null
        and deadline_at is not null
      )
    ),
  add constraint tournament_matches_deadline_after_activation_check
    check (deadline_at is null or deadline_at > activated_at),
  add constraint tournament_matches_outcome_type_check
    check (
      outcome_type is null
      or outcome_type in (
        'deadline_double_forfeit',
        'automatic_bye',
        'empty_feeder'
      )
    ),
  add constraint tournament_matches_outcome_integrity_check
    check (
      (outcome_type is null and deadline_ruled_at is null)
      or (
        status = 'completed'
        and player_one_score is null
        and player_two_score is null
        and official_result_submission_id is null
        and (
          (
            outcome_type = 'deadline_double_forfeit'
            and activation_version > 0
            and activated_at is not null
            and deadline_at is not null
            and player_one_registration_id is not null
            and player_two_registration_id is not null
            and winner_registration_id is null
            and deadline_ruled_at is not null
          )
          or (
            outcome_type = 'automatic_bye'
            and activation_version = 0
            and activated_at is null
            and deadline_at is null
            and num_nonnulls(
              player_one_registration_id,
              player_two_registration_id
            ) = 1
            and winner_registration_id is not null
            and winner_registration_id = coalesce(
              player_one_registration_id,
              player_two_registration_id
            )
            and deadline_ruled_at is null
          )
          or (
            outcome_type = 'empty_feeder'
            and activation_version = 0
            and activated_at is null
            and deadline_at is null
            and player_one_registration_id is null
            and player_two_registration_id is null
            and winner_registration_id is null
            and deadline_ruled_at is null
          )
        )
      )
    ),
  add constraint tournament_matches_extension_integrity_check
    check (
      (
        extension_minutes is null
        and extension_reason is null
        and extended_at is null
        and extended_by_clerk_user_id is null
      )
      or (
        extension_minutes is not null
        and extension_minutes between 1 and 2880
        and nullif(btrim(extension_reason), '') is not null
        and length(extension_reason) <= 2000
        and extended_at is not null
        and nullif(btrim(extended_by_clerk_user_id), '') is not null
      )
    ),
  add constraint tournament_matches_hold_integrity_check
    check (
      (
        hold_started_at is null
        and hold_released_at is null
        and hold_reason is null
        and held_by_clerk_user_id is null
      )
      or (
        hold_started_at is not null
        and (hold_released_at is null or hold_released_at >= hold_started_at)
        and nullif(btrim(hold_reason), '') is not null
        and length(hold_reason) <= 2000
        and nullif(btrim(held_by_clerk_user_id), '') is not null
      )
    );

create index if not exists tournament_matches_deadline_due_idx
  on public.tournament_matches(deadline_at, id)
  where status = 'in_progress'
    and deadline_at is not null
    and outcome_type is null;

create index if not exists tournament_matches_activation_reconcile_idx
  on public.tournament_matches(generated_bracket_id, round_id, match_number)
  where status = 'scheduled'
    and activation_version = 0;

alter table public.notifications
  add column if not exists event_key text,
  add column if not exists in_app_hidden_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_event_key_check;

alter table public.notifications
  add constraint notifications_event_key_check
  check (
    event_key is null
    or (
      nullif(btrim(event_key), '') is not null
      and length(event_key) <= 300
    )
  );

create unique index if not exists notifications_recipient_event_key_unique_idx
  on public.notifications(recipient_clerk_user_id, event_key)
  where event_key is not null;

create index if not exists notifications_visible_recipient_idx
  on public.notifications(recipient_clerk_user_id, created_at desc)
  where in_app_hidden_at is null;

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
        or old.created_at is distinct from new.created_at then
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

revoke all on function public.protect_notification_client_mutation()
  from public, anon, authenticated;
grant execute on function public.protect_notification_client_mutation()
  to service_role;

revoke update on public.notifications from authenticated;
grant update(read_at, in_app_hidden_at) on public.notifications
  to authenticated;

create or replace function public.create_matchup_notifications(
  p_match_id uuid,
  p_event_key_suffix text,
  p_type text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_recipient_registration_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament_id uuid;
  v_tournament_title text;
  v_tournament_slug text;
  v_tournament_bracket_id uuid;
  v_bracket_name text;
  v_round_name text;
  v_event_key text;
  v_inserted integer := 0;
  v_recipient record;
begin
  if nullif(btrim(p_event_key_suffix), '') is null
    or nullif(btrim(p_type), '') is null
    or nullif(btrim(p_title), '') is null
    or nullif(btrim(p_message), '') is null then
    raise exception 'Canonical notification details are required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select
    tournament.id,
    tournament.title,
    tournament.slug,
    bracket.id,
    bracket.name,
    round.name
  into
    v_tournament_id,
    v_tournament_title,
    v_tournament_slug,
    v_tournament_bracket_id,
    v_bracket_name,
    v_round_name
  from public.generated_brackets as generated
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  join public.bracket_rounds as round
    on round.id = v_match.round_id
    and round.generated_bracket_id = generated.id
  where generated.id = v_match.generated_bracket_id;

  if not found then
    raise exception 'Tournament match bracket context not found';
  end if;

  v_event_key := format(
    'match:%s:%s',
    p_match_id,
    btrim(p_event_key_suffix)
  );

  for v_recipient in
    select
      registration.id as registration_id,
      registration.clerk_user_id,
      registration.player_name,
      opponent.player_name as opponent_name
    from public.registrations as registration
    left join public.registrations as opponent
      on opponent.id = case
        when registration.id = v_match.player_one_registration_id
          then v_match.player_two_registration_id
        else v_match.player_one_registration_id
      end
    where registration.id in (
      v_match.player_one_registration_id,
      v_match.player_two_registration_id
    )
      and (
        p_recipient_registration_ids is null
        or registration.id = any(p_recipient_registration_ids)
      )
    order by registration.id
  loop
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      tournament_id,
      tournament_title,
      registration_id,
      match_id,
      metadata,
      event_key
    )
    values (
      v_recipient.clerk_user_id,
      'player',
      p_type,
      p_title,
      case
        when p_type = 'match.ready'
          and nullif(btrim(v_recipient.opponent_name), '') is not null
          then p_message || format(
            ' Your opponent is %s.',
            v_recipient.opponent_name
          )
        else p_message
      end,
      v_tournament_id,
      v_tournament_title,
      v_recipient.registration_id,
      p_match_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'tournamentId', v_tournament_id,
        'tournamentSlug', v_tournament_slug,
        'bracketId', v_tournament_bracket_id,
        'bracketName', v_bracket_name,
        'matchId', p_match_id,
        'roundName', v_round_name,
        'activationVersion', v_match.activation_version,
        'deadlineAt', v_match.deadline_at,
        'opponentName', v_recipient.opponent_name
      ),
      v_event_key
    )
    on conflict (recipient_clerk_user_id, event_key)
      where event_key is not null
    do nothing;

    v_inserted := v_inserted + case when found then 1 else 0 end;
  end loop;

  return v_inserted;
end;
$$;

alter function public.create_matchup_notifications(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) owner to postgres;
revoke all on function public.create_matchup_notifications(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid[]
) from public, anon, authenticated, service_role;

-- Keep the existing launch boundary and make new player-owned report inserts
-- share the same match-row lock and strict deadline boundary as enforcement.
create or replace function public.require_launched_match_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_generated_bracket_id uuid;
  v_match_id uuid;
  v_match public.tournament_matches%rowtype;
  v_format text;
begin
  if tg_table_name = 'tournament_matches' then
    if tg_op = 'INSERT'
      and new.status = 'scheduled'
      and new.player_one_score is null
      and new.player_two_score is null
      and new.winner_registration_id is null
      and new.official_result_submission_id is null
      and new.official_result_decided_by is null
      and new.official_result_decided_at is null
      and new.activation_version = 0
      and new.activated_at is null
      and new.deadline_at is null
      and new.outcome_type is null
      and new.deadline_ruled_at is null then
      return new;
    end if;

    if tg_op = 'UPDATE'
      and old.status is not distinct from new.status
      and old.player_one_score is not distinct from new.player_one_score
      and old.player_two_score is not distinct from new.player_two_score
      and old.winner_registration_id is not distinct from
        new.winner_registration_id
      and old.official_result_submission_id is not distinct from
        new.official_result_submission_id
      and old.official_result_decided_by is not distinct from
        new.official_result_decided_by
      and old.official_result_decided_at is not distinct from
        new.official_result_decided_at
      and old.activation_version is not distinct from new.activation_version
      and old.activated_at is not distinct from new.activated_at
      and old.deadline_at is not distinct from new.deadline_at
      and old.outcome_type is not distinct from new.outcome_type
      and old.deadline_ruled_at is not distinct from new.deadline_ruled_at then
      return new;
    end if;

    v_generated_bracket_id := coalesce(
      new.generated_bracket_id,
      old.generated_bracket_id
    );
  else
    v_match_id := case
      when tg_op = 'DELETE' then old.match_id
      else new.match_id
    end;

    if tg_op = 'INSERT' then
      select match.*
      into v_match
      from public.tournament_matches as match
      where match.id = v_match_id
      for update;

      if not found then
        raise exception 'Tournament match not found';
      end if;

      select generated.format
      into v_format
      from public.generated_brackets as generated
      where generated.id = v_match.generated_bracket_id;

      if v_format = 'single_elimination' then
        if v_match.status <> 'in_progress'
          or v_match.activation_version < 1
          or v_match.activated_at is null
          or v_match.deadline_at is null
          or v_match.outcome_type is not null
          or v_match.hold_started_at is not null
            and v_match.hold_released_at is null then
          raise exception 'This matchup is not currently actionable';
        end if;

        if clock_timestamp() >= v_match.deadline_at then
          raise exception 'The matchup deadline has passed';
        end if;
      end if;

      v_generated_bracket_id := v_match.generated_bracket_id;
    else
      select match.generated_bracket_id
      into v_generated_bracket_id
      from public.tournament_matches as match
      where match.id = v_match_id;
    end if;
  end if;

  if not exists (
    select 1
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where generated.id = v_generated_bracket_id
      and bracket.launched_at is not null
  ) then
    raise exception 'Match activity is blocked until this division launches';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.require_launched_match_activity()
  owner to postgres;
revoke all on function public.require_launched_match_activity()
  from public, anon, authenticated;
grant execute on function public.require_launched_match_activity()
  to service_role;

drop trigger if exists tournament_matches_require_launched_activity
  on public.tournament_matches;
create trigger tournament_matches_require_launched_activity
before insert or update of
  status,
  player_one_score,
  player_two_score,
  winner_registration_id,
  official_result_submission_id,
  official_result_decided_by,
  official_result_decided_at,
  activation_version,
  activated_at,
  deadline_at,
  outcome_type,
  deadline_ruled_at
on public.tournament_matches
for each row
execute function public.require_launched_match_activity();

create or replace function public.activate_tournament_match_if_ready(
  p_match_id uuid,
  p_force_new_activation boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_number integer;
  v_round_name text;
  v_format text;
  v_launched_at timestamptz;
  v_prior_round_id uuid;
  v_left_feeder public.tournament_matches%rowtype;
  v_right_feeder public.tournament_matches%rowtype;
  v_activated_at timestamptz;
  v_activation_version integer;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status <> 'scheduled'
    or v_match.outcome_type is not null
    or v_match.winner_registration_id is not null
    or v_match.player_one_score is not null
    or v_match.player_two_score is not null
    or v_match.official_result_submission_id is not null
    or v_match.official_result_decided_by is not null
    or v_match.official_result_decided_at is not null
    or v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null
    or v_match.player_one_registration_id =
      v_match.player_two_registration_id then
    return false;
  end if;

  if not p_force_new_activation
    and (
      v_match.activation_version <> 0
      or v_match.activated_at is not null
      or v_match.deadline_at is not null
    ) then
    return false;
  end if;

  select
    round.round_number,
    round.name,
    generated.format,
    bracket.launched_at
  into
    v_round_number,
    v_round_name,
    v_format,
    v_launched_at
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where round.id = v_match.round_id
    and generated.id = v_match.generated_bracket_id;

  if v_format <> 'single_elimination' or v_launched_at is null then
    return false;
  end if;

  if v_round_number > 1 then
    select round.id
    into v_prior_round_id
    from public.bracket_rounds as round
    where round.generated_bracket_id = v_match.generated_bracket_id
      and round.round_number = v_round_number - 1;

    select feeder.*
    into v_left_feeder
    from public.tournament_matches as feeder
    where feeder.round_id = v_prior_round_id
      and feeder.match_number = (v_match.match_number * 2) - 1;

    select feeder.*
    into v_right_feeder
    from public.tournament_matches as feeder
    where feeder.round_id = v_prior_round_id
      and feeder.match_number = v_match.match_number * 2;

    if v_left_feeder.id is null
      or v_right_feeder.id is null
      or v_left_feeder.status <> 'completed'
      or v_right_feeder.status <> 'completed'
      or v_left_feeder.winner_registration_id is distinct from
        v_match.player_one_registration_id
      or v_right_feeder.winner_registration_id is distinct from
        v_match.player_two_registration_id then
      return false;
    end if;
  end if;

  v_activated_at := clock_timestamp();
  v_activation_version := case
    when p_force_new_activation
      then greatest(v_match.activation_version + 1, 1)
    else 1
  end;

  update public.tournament_matches
  set
    status = 'in_progress',
    activation_version = v_activation_version,
    activated_at = v_activated_at,
    deadline_at = v_activated_at + interval '7 days',
    deadline_ruled_at = null
  where id = p_match_id;

  perform public.create_matchup_notifications(
    p_match_id,
    format('activation:%s:ready', v_activation_version),
    'match.ready',
    case
      when v_round_number = 1
        then 'Division started — your first matchup is ready'
      else 'Your next matchup is ready'
    end,
    format(
      '%s is ready. You have seven days to complete the matchup.',
      v_round_name
    ),
    jsonb_build_object(
      'deadlineEvent', 'ready',
      'roundNumber', v_round_number,
      'activatedAt', v_activated_at,
      'deadlineAt', v_activated_at + interval '7 days'
    )
  );

  return true;
end;
$$;

alter function public.activate_tournament_match_if_ready(uuid, boolean)
  owner to postgres;
revoke all on function
  public.activate_tournament_match_if_ready(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.reconcile_downstream_match(
  p_source_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source public.tournament_matches%rowtype;
  v_source_round_number integer;
  v_format text;
  v_next_round_id uuid;
  v_next_match_number integer;
  v_next public.tournament_matches%rowtype;
  v_left public.tournament_matches%rowtype;
  v_right public.tournament_matches%rowtype;
  v_single_winner uuid;
  v_now timestamptz;
  v_next_is_final boolean;
begin
  select match.*
  into v_source
  from public.tournament_matches as match
  where match.id = p_source_match_id;

  if not found or v_source.status <> 'completed' then
    return;
  end if;

  select round.round_number, generated.format
  into v_source_round_number, v_format
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.id = v_source.round_id;

  if v_format <> 'single_elimination' then
    return;
  end if;

  select round.id
  into v_next_round_id
  from public.bracket_rounds as round
  where round.generated_bracket_id = v_source.generated_bracket_id
    and round.round_number = v_source_round_number + 1;

  if v_next_round_id is null then
    return;
  end if;

  v_next_is_final := not exists (
    select 1
    from public.bracket_rounds as round
    where round.generated_bracket_id = v_source.generated_bracket_id
      and round.round_number = v_source_round_number + 2
  );

  v_next_match_number := ceil(v_source.match_number / 2.0)::integer;

  select match.*
  into v_next
  from public.tournament_matches as match
  where match.round_id = v_next_round_id
    and match.match_number = v_next_match_number
  for update;

  if not found then
    raise exception 'Generated downstream match not found';
  end if;

  if v_next.status = 'completed' then
    return;
  end if;

  if v_next.status <> 'scheduled'
    or v_next.activation_version <> 0
    or v_next.activated_at is not null
    or v_next.deadline_at is not null
    or v_next.player_one_score is not null
    or v_next.player_two_score is not null
    or v_next.winner_registration_id is not null
    or v_next.official_result_submission_id is not null
    or v_next.official_result_decided_by is not null
    or v_next.official_result_decided_at is not null
    or v_next.deadline_ruled_at is not null
    or v_next.extension_minutes is not null
    or v_next.hold_started_at is not null
    or exists (
      select 1
      from public.match_result_submissions as submission
      where submission.match_id = v_next.id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      where report_group.match_id = v_next.id
    ) then
    raise exception
      'Downstream match activity prevents feeder reconciliation';
  end if;

  select match.*
  into v_left
  from public.tournament_matches as match
  where match.round_id = v_source.round_id
    and match.match_number = (v_next_match_number * 2) - 1;

  select match.*
  into v_right
  from public.tournament_matches as match
  where match.round_id = v_source.round_id
    and match.match_number = v_next_match_number * 2;

  if v_left.id is null or v_right.id is null then
    raise exception 'Generated feeder matches not found';
  end if;

  update public.tournament_matches
  set
    player_one_registration_id = case
      when v_left.status = 'completed'
        then v_left.winner_registration_id
      else player_one_registration_id
    end,
    player_two_registration_id = case
      when v_right.status = 'completed'
        then v_right.winner_registration_id
      else player_two_registration_id
    end
  where id = v_next.id;

  if v_left.status <> 'completed' or v_right.status <> 'completed' then
    return;
  end if;

  if v_left.winner_registration_id is not null
    and v_right.winner_registration_id is not null then
    perform public.activate_tournament_match_if_ready(v_next.id, false);
    return;
  end if;

  v_now := clock_timestamp();
  v_single_winner := coalesce(
    v_left.winner_registration_id,
    v_right.winner_registration_id
  );

  if v_single_winner is not null then
    update public.tournament_matches
    set
      status = 'completed',
      winner_registration_id = v_single_winner,
      player_one_score = null,
      player_two_score = null,
      official_result_submission_id = null,
      official_result_decided_by = null,
      official_result_decided_at = null,
      outcome_type = 'automatic_bye',
      deadline_ruled_at = null
    where id = v_next.id;

    perform public.create_matchup_notifications(
      v_next.id,
      format(
        'automatic-advance:left:%s:%s:%s:right:%s:%s:%s',
        v_left.id,
        v_left.activation_version,
        extract(epoch from v_left.updated_at)::numeric(20, 6),
        v_right.id,
        v_right.activation_version,
        extract(epoch from v_right.updated_at)::numeric(20, 6)
      ),
      'match.automatic_advance',
      case
        when v_next_is_final
          then 'You are the division champion by walkover'
        else 'You advanced automatically'
      end,
      case
        when v_next_is_final
          then 'The other Final feeder produced no eligible player, so you became champion by walkover without a played match.'
        else 'The other feeder produced no eligible player, so you advanced without a played match.'
      end,
      jsonb_build_object(
        'deadlineEvent', 'automatic_advance',
        'outcomeType', 'automatic_bye',
        'championByWalkover', v_next_is_final,
        'resolvedAt', v_now
      ),
      array[v_single_winner]
    );
  else
    update public.tournament_matches
    set
      status = 'completed',
      player_one_registration_id = null,
      player_two_registration_id = null,
      player_one_score = null,
      player_two_score = null,
      winner_registration_id = null,
      official_result_submission_id = null,
      official_result_decided_by = null,
      official_result_decided_at = null,
      outcome_type = 'empty_feeder',
      deadline_ruled_at = null
    where id = v_next.id;
  end if;

  perform public.reconcile_downstream_match(v_next.id);
end;
$$;

alter function public.reconcile_downstream_match(uuid) owner to postgres;
revoke all on function public.reconcile_downstream_match(uuid)
  from public, anon, authenticated, service_role;

-- Preserve the existing official-result engine. The only progression change is
-- that the source result is made official before the shared downstream
-- reconciler evaluates activation, byes, or an empty feeder.
create or replace function public.apply_official_match_result(
  p_match_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_winner_registration_id uuid,
  p_decided_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
  v_wins_required integer;
  v_loser_score integer;
begin
  if p_decided_by is null or btrim(p_decided_by) = '' then
    raise exception 'Deciding administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = v_match.generated_bracket_id;

  if (
      v_format = 'single_elimination'
      and v_match.status not in ('in_progress', 'pending_review')
    )
    or v_match.status = 'completed'
    or v_match.outcome_type is not null
    or v_match.winner_registration_id is not null then
    raise exception 'This match cannot receive an official result';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Both match participants must be assigned';
  end if;

  if p_winner_registration_id not in (
    v_match.player_one_registration_id,
    v_match.player_two_registration_id
  ) then
    raise exception 'Winner must be a participant in this match';
  end if;

  if p_player_one_score is null
    or p_player_two_score is null
    or p_player_one_score < 0
    or p_player_two_score < 0
    or p_player_one_score = p_player_two_score then
    raise exception 'A valid non-tied score is required';
  end if;

  v_wins_required := (v_match.series_best_of / 2) + 1;

  if p_winner_registration_id = v_match.player_one_registration_id then
    if p_player_one_score <> v_wins_required
      or p_player_two_score >= v_wins_required then
      raise exception 'Score does not satisfy the match format';
    end if;
    v_loser_score := p_player_two_score;
  else
    if p_player_two_score <> v_wins_required
      or p_player_one_score >= v_wins_required then
      raise exception 'Score does not satisfy the match format';
    end if;
    v_loser_score := p_player_one_score;
  end if;

  if v_loser_score < 0 or v_loser_score >= v_wins_required then
    raise exception 'Score does not satisfy the match format';
  end if;

  update public.tournament_matches
  set
    player_one_score = p_player_one_score,
    player_two_score = p_player_two_score,
    winner_registration_id = p_winner_registration_id,
    outcome_type = null,
    deadline_ruled_at = null,
    status = 'completed'
  where id = p_match_id;

  update public.match_result_submissions
  set
    status = 'rejected',
    reviewed_by = p_decided_by,
    review_notes = coalesce(
      review_notes,
      'Superseded by the official match result.'
    ),
    reviewed_at = now()
  where match_id = p_match_id
    and status = 'pending';

  if v_format = 'round_robin' then
    update public.tournament_standings as standing
    set
      wins = results.wins,
      losses = results.losses,
      points = results.wins * 3
    from (
      select
        roster.registration_id,
        count(*) filter (
          where match.winner_registration_id = roster.registration_id
        )::integer as wins,
        count(*) filter (
          where match.status = 'completed'
            and match.winner_registration_id is distinct from
              roster.registration_id
        )::integer as losses
      from public.tournament_standings as roster
      cross join lateral (
        select match.*
        from public.tournament_matches as match
        where match.generated_bracket_id = v_match.generated_bracket_id
          and match.status = 'completed'
          and roster.registration_id in (
            match.player_one_registration_id,
            match.player_two_registration_id
          )
      ) as match
      where roster.generated_bracket_id = v_match.generated_bracket_id
      group by roster.registration_id
    ) as results
    where standing.generated_bracket_id = v_match.generated_bracket_id
      and standing.registration_id = results.registration_id;
  else
    perform public.reconcile_downstream_match(p_match_id);
  end if;
end;
$$;

alter function public.apply_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) owner to postgres;
revoke all on function public.apply_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.apply_official_match_result(
  uuid,
  integer,
  integer,
  uuid,
  text
) to service_role;

-- Wrap the already-deployed launch transaction instead of duplicating its
-- roster, waitlist, and lifecycle rules. First-round activation runs before
-- this wrapper commits and is therefore part of the same authoritative action.
alter function public.launch_tournament_division(uuid, text)
  rename to launch_tournament_division_without_matchup_activation;

alter function public.launch_tournament_division_without_matchup_activation(
  uuid,
  text
) owner to postgres;
revoke all on function
  public.launch_tournament_division_without_matchup_activation(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.launch_tournament_division(
  p_tournament_bracket_id uuid,
  p_actor_clerk_user_id text
)
returns table (
  tournament_id uuid,
  tournament_bracket_id uuid,
  launched_at timestamptz,
  already_launched boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_launch record;
  v_generated_bracket_id uuid;
  v_match_id uuid;
begin
  select result.*
  into v_launch
  from public.launch_tournament_division_without_matchup_activation(
    p_tournament_bracket_id,
    p_actor_clerk_user_id
  ) as result;

  if not found then
    raise exception 'Division launch did not return a result';
  end if;

  select generated.id
  into v_generated_bracket_id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id;

  for v_match_id in
    select match.id
    from public.tournament_matches as match
    join public.bracket_rounds as round
      on round.id = match.round_id
    where match.generated_bracket_id = v_generated_bracket_id
      and round.round_number = 1
    order by match.match_number, match.id
  loop
    perform public.activate_tournament_match_if_ready(v_match_id, false);
  end loop;

  tournament_id := v_launch.tournament_id;
  tournament_bracket_id := v_launch.tournament_bracket_id;
  launched_at := v_launch.launched_at;
  already_launched := v_launch.already_launched;
  return next;
end;
$$;

alter function public.launch_tournament_division(uuid, text)
  owner to postgres;
revoke all on function public.launch_tournament_division(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.launch_tournament_division(uuid, text)
  to service_role;

-- Keep the deployed replay and no-show validation bodies intact. These narrow
-- wrappers make the actionable state and strict match deadline authoritative
-- at the same row lock used by deadline enforcement.
alter function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
  text
) rename to create_match_result_report_group_without_matchup_deadline;

revoke all on function
  public.create_match_result_report_group_without_matchup_deadline(
    uuid,
    text,
    uuid,
    integer,
    integer,
    uuid[],
    text
  ) from public, anon, authenticated, service_role;

create or replace function public.create_match_result_report_group(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_winner_registration_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_submission_ids uuid[] default null,
  p_replay_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = v_match.generated_bracket_id;

  if v_format = 'single_elimination' then
    if v_match.status <> 'in_progress'
      or v_match.activation_version < 1
      or v_match.deadline_at is null
      or v_match.outcome_type is not null
      or v_match.hold_started_at is not null
        and v_match.hold_released_at is null then
      raise exception 'This matchup is not currently actionable';
    end if;

    if clock_timestamp() >= v_match.deadline_at then
      raise exception 'The matchup deadline has passed';
    end if;
  end if;

  return public.create_match_result_report_group_without_matchup_deadline(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_winner_registration_id,
    p_player_one_score,
    p_player_two_score,
    p_submission_ids,
    p_replay_storage_path
  );
end;
$$;

alter function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
  text
) owner to postgres;
revoke all on function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
  text
) from public, anon, authenticated;
grant execute on function public.create_match_result_report_group(
  uuid,
  text,
  uuid,
  integer,
  integer,
  uuid[],
  text
) to service_role;

alter function public.submit_match_no_show_report(uuid, text, uuid, text)
  rename to submit_match_no_show_report_without_matchup_deadline;

revoke all on function
  public.submit_match_no_show_report_without_matchup_deadline(
    uuid,
    text,
    uuid,
    text
  ) from public, anon, authenticated, service_role;

create or replace function public.submit_match_no_show_report(
  p_match_id uuid,
  p_submitted_by_clerk_user_id text,
  p_no_show_registration_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_format text;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = v_match.generated_bracket_id;

  if v_format = 'single_elimination' then
    if v_match.status <> 'in_progress'
      or v_match.activation_version < 1
      or v_match.deadline_at is null
      or v_match.outcome_type is not null
      or v_match.hold_started_at is not null
        and v_match.hold_released_at is null then
      raise exception 'This matchup is not currently actionable';
    end if;

    if clock_timestamp() >= v_match.deadline_at then
      raise exception 'The matchup deadline has passed';
    end if;
  end if;

  return public.submit_match_no_show_report_without_matchup_deadline(
    p_match_id,
    p_submitted_by_clerk_user_id,
    p_no_show_registration_id,
    p_notes
  );
end;
$$;

alter function public.submit_match_no_show_report(uuid, text, uuid, text)
  owner to postgres;
revoke all on function public.submit_match_no_show_report(
  uuid,
  text,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.submit_match_no_show_report(
  uuid,
  text,
  uuid,
  text
) to service_role;

-- Resolve/reject wrappers preserve the deployed adjudication behavior and add
-- back precisely the time consumed by an accepted pending workflow.
alter function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) rename to admin_finalize_match_result_report_group_core;

revoke all on function
  public.admin_finalize_match_result_report_group_core(
    uuid,
    text,
    text,
    text,
    integer,
    integer,
    uuid
  ) from public, anon, authenticated, service_role;

create or replace function public.admin_finalize_match_result_report_group(
  p_report_group_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null,
  p_player_one_score integer default null,
  p_player_two_score integer default null,
  p_winner_registration_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group public.match_result_report_groups%rowtype;
  v_match public.tournament_matches%rowtype;
  v_resolved_at timestamptz;
begin
  select report_group.*
  into v_group
  from public.match_result_report_groups as report_group
  where report_group.id = p_report_group_id
  for update;

  if not found then
    raise exception 'Match result report group not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_group.match_id
  for update;

  perform public.admin_finalize_match_result_report_group_core(
    p_report_group_id,
    p_decision,
    p_reviewed_by,
    p_review_notes,
    p_player_one_score,
    p_player_two_score,
    p_winner_registration_id
  );

  if p_decision not in ('rejected', 'reset') then
    return;
  end if;

  v_resolved_at := clock_timestamp();

  update public.tournament_matches
  set
    status = 'in_progress',
    deadline_at = deadline_at + greatest(
      interval '0 seconds',
      v_resolved_at - v_group.created_at
    )
  where id = v_group.match_id
    and status = 'scheduled'
    and activation_version > 0
    and deadline_at is not null
    and outcome_type is null;

  if not found then
    perform public.activate_tournament_match_if_ready(v_group.match_id, false);
  end if;
end;
$$;

alter function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) owner to postgres;
revoke all on function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) from public, anon, authenticated;
grant execute on function public.admin_finalize_match_result_report_group(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) to service_role;

alter function public.review_match_series_result(uuid, text, text, text)
  rename to review_match_series_result_without_deadline_restore;

revoke all on function
  public.review_match_series_result_without_deadline_restore(
    uuid,
    text,
    text,
    text
  ) from public, anon, authenticated, service_role;

create or replace function public.review_match_series_result(
  p_submission_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_submission public.match_result_submissions%rowtype;
  v_match public.tournament_matches%rowtype;
  v_review_started_at timestamptz;
  v_resolved_at timestamptz;
begin
  select submission.*
  into v_submission
  from public.match_result_submissions as submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Match result submission not found';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = v_submission.match_id
  for update;

  select min(submission.created_at)
  into v_review_started_at
  from public.match_result_submissions as submission
  where submission.match_id = v_submission.match_id
    and submission.status = 'pending'
    and submission.report_group_id is null;

  perform public.review_match_series_result_without_deadline_restore(
    p_submission_id,
    p_decision,
    p_reviewed_by,
    p_review_notes
  );

  if p_decision not in ('rejected', 'resubmission_requested') then
    return;
  end if;

  v_resolved_at := clock_timestamp();

  update public.tournament_matches
  set
    status = 'in_progress',
    deadline_at = deadline_at + greatest(
      interval '0 seconds',
      v_resolved_at - coalesce(v_review_started_at, v_resolved_at)
    )
  where id = v_submission.match_id
    and status = 'scheduled'
    and activation_version > 0
    and deadline_at is not null
    and outcome_type is null;

  if not found then
    perform public.activate_tournament_match_if_ready(
      v_submission.match_id,
      false
    );
  end if;
end;
$$;

alter function public.review_match_series_result(uuid, text, text, text)
  owner to postgres;
revoke all on function public.review_match_series_result(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.review_match_series_result(
  uuid,
  text,
  text,
  text
) to service_role;

create or replace function public.extend_tournament_match_deadline(
  p_match_id uuid,
  p_extension_minutes integer,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_extended_at timestamptz;
  v_deadline_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_extension_minutes is null
    or p_extension_minutes < 1
    or p_extension_minutes > 2880 then
    raise exception 'Extension must be between 1 and 2880 minutes';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'An extension reason is required';
  end if;

  if length(p_reason) > 2000 then
    raise exception 'Extension reason must be 2000 characters or fewer';
  end if;

  if nullif(btrim(p_actor_clerk_user_id), '') is null then
    raise exception 'Approving administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status <> 'in_progress'
    or v_match.activation_version < 1
    or v_match.deadline_at is null
    or v_match.outcome_type is not null
    or v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Only an active two-player matchup can be extended';
  end if;

  if v_match.extension_minutes is not null then
    raise exception 'This matchup has already used its extension';
  end if;

  if v_match.hold_started_at is not null
    and v_match.hold_released_at is null then
    raise exception 'Release the active administrative hold first';
  end if;

  if clock_timestamp() >= v_match.deadline_at then
    raise exception 'An expired matchup cannot be extended';
  end if;

  if exists (
    select 1
    from public.match_result_report_groups as report_group
    where report_group.match_id = p_match_id
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
      and report_group.finalized_at is null
  ) or exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
  ) then
    raise exception 'Resolve the pending result workflow before extending';
  end if;

  v_extended_at := clock_timestamp();
  v_deadline_at := v_match.deadline_at
    + make_interval(mins => p_extension_minutes);

  update public.tournament_matches
  set
    deadline_at = v_deadline_at,
    extension_minutes = p_extension_minutes,
    extension_reason = btrim(p_reason),
    extended_at = v_extended_at,
    extended_by_clerk_user_id = btrim(p_actor_clerk_user_id)
  where id = p_match_id;

  perform public.create_matchup_notifications(
    p_match_id,
    'extension',
    'match.deadline_updated',
    'Match deadline extended',
    format(
      'An administrator added %s minute%s to this matchup. Your new deadline is shown in the match.',
      p_extension_minutes,
      case when p_extension_minutes = 1 then '' else 's' end
    ),
    jsonb_build_object(
      'deadlineEvent', 'deadline_updated',
      'updateKind', 'extension',
      'extensionMinutes', p_extension_minutes,
      'extendedAt', v_extended_at,
      'deadlineAt', v_deadline_at
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'extension_minutes', p_extension_minutes,
    'extended_at', v_extended_at,
    'deadline_at', v_deadline_at
  );
end;
$$;

alter function public.extend_tournament_match_deadline(
  uuid,
  integer,
  text,
  text
) owner to postgres;
revoke all on function public.extend_tournament_match_deadline(
  uuid,
  integer,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.extend_tournament_match_deadline(
  uuid,
  integer,
  text,
  text
) to service_role;

create or replace function public.hold_tournament_match_deadline(
  p_match_id uuid,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_started_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'An administrative hold reason is required';
  end if;

  if length(p_reason) > 2000 then
    raise exception 'Hold reason must be 2000 characters or fewer';
  end if;

  if nullif(btrim(p_actor_clerk_user_id), '') is null then
    raise exception 'Holding administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status <> 'in_progress'
    or v_match.activation_version < 1
    or v_match.deadline_at is null
    or v_match.outcome_type is not null
    or v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'Only an active two-player matchup can be held';
  end if;

  if v_match.hold_started_at is not null then
    raise exception 'This matchup has already used its administrative hold';
  end if;

  if clock_timestamp() >= v_match.deadline_at then
    raise exception 'An expired matchup cannot be held';
  end if;

  if exists (
    select 1
    from public.match_result_report_groups as report_group
    where report_group.match_id = p_match_id
      and report_group.status in (
        'pending_confirmation',
        'disputed',
        'under_review'
      )
      and report_group.finalized_at is null
  ) or exists (
    select 1
    from public.match_result_submissions as submission
    where submission.match_id = p_match_id
      and submission.status = 'pending'
  ) then
    raise exception 'Resolve the pending result workflow before holding';
  end if;

  v_started_at := clock_timestamp();

  update public.tournament_matches
  set
    hold_started_at = v_started_at,
    hold_reason = btrim(p_reason),
    held_by_clerk_user_id = btrim(p_actor_clerk_user_id)
  where id = p_match_id;

  perform public.create_matchup_notifications(
    p_match_id,
    'hold:started',
    'match.deadline_updated',
    'Match deadline paused',
    'An administrator paused this matchup deadline. Reminders and automatic enforcement are suspended.',
    jsonb_build_object(
      'deadlineEvent', 'deadline_updated',
      'updateKind', 'hold',
      'holdStartedAt', v_started_at
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'hold_started_at', v_started_at,
    'deadline_at', v_match.deadline_at
  );
end;
$$;

alter function public.hold_tournament_match_deadline(uuid, text, text)
  owner to postgres;
revoke all on function public.hold_tournament_match_deadline(
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.hold_tournament_match_deadline(
  uuid,
  text,
  text
) to service_role;

create or replace function public.release_tournament_match_deadline(
  p_match_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_released_at timestamptz;
  v_deadline_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(p_actor_clerk_user_id), '') is null then
    raise exception 'Releasing administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  if v_match.status <> 'in_progress'
    or v_match.outcome_type is not null then
    raise exception 'Only an active matchup can be resumed';
  end if;

  if v_match.hold_started_at is null then
    raise exception 'This matchup has not used an administrative hold';
  end if;

  if v_match.hold_released_at is not null then
    raise exception 'This matchup hold has already been released';
  end if;

  v_released_at := clock_timestamp();
  v_deadline_at := v_match.deadline_at
    + (v_released_at - v_match.hold_started_at);

  update public.tournament_matches
  set
    deadline_at = v_deadline_at,
    hold_released_at = v_released_at
  where id = p_match_id;

  perform public.create_matchup_notifications(
    p_match_id,
    'hold:released',
    'match.deadline_updated',
    'Match deadline resumed',
    'The administrative hold ended. Your restored deadline is shown in the match.',
    jsonb_build_object(
      'deadlineEvent', 'deadline_updated',
      'updateKind', 'resumed',
      'holdReleasedAt', v_released_at,
      'deadlineAt', v_deadline_at
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'hold_released_at', v_released_at,
    'deadline_at', v_deadline_at
  );
end;
$$;

alter function public.release_tournament_match_deadline(uuid, text)
  owner to postgres;
revoke all on function public.release_tournament_match_deadline(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.release_tournament_match_deadline(uuid, text)
  to service_role;

-- One bounded scan prioritizes overdue rulings, then the 24-hour reminder, the
-- 72-hour reminder, and finally missed-activation reconciliation.
create or replace function public.process_matchup_deadlines(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_limit integer;
  v_now timestamptz;
  v_candidate record;
  v_match public.tournament_matches%rowtype;
  v_event_suffix text;
  v_inserted integer;
  v_double_forfeit_count integer := 0;
  v_reminder_one_count integer := 0;
  v_reminder_two_count integer := 0;
  v_reconciled_count integer := 0;
begin
  v_limit := greatest(1, least(coalesce(p_limit, 100), 500));
  v_now := clock_timestamp();

  for v_candidate in
    select
      match.id,
      case
        when match.status = 'in_progress'
          and match.deadline_at <= v_now then 1
        when match.status = 'in_progress'
          and match.deadline_at > v_now
          and match.deadline_at <= v_now + interval '24 hours' then 2
        when match.status = 'in_progress'
          and match.deadline_at > v_now + interval '24 hours'
          and match.deadline_at <= v_now + interval '72 hours' then 3
        else 4
      end as priority,
      coalesce(match.deadline_at, match.created_at) as due_at
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
      and generated.format = 'single_elimination'
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
      and bracket.launched_at is not null
    where (
      match.status = 'in_progress'
      and match.deadline_at is not null
      and match.outcome_type is null
      and match.deadline_ruled_at is null
      and match.player_one_score is null
      and match.player_two_score is null
      and match.winner_registration_id is null
      and match.official_result_submission_id is null
      and match.official_result_decided_by is null
      and match.official_result_decided_at is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and (
        match.hold_started_at is null
        or match.hold_released_at is not null
      )
      and not exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = match.id
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
      and not exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = match.id
          and submission.status = 'pending'
      )
      and (
        match.deadline_at <= v_now
        or (
          match.deadline_at > v_now
          and match.deadline_at <= v_now + interval '24 hours'
          and exists (
            select 1
            from public.registrations as recipient
            where recipient.id in (
              match.player_one_registration_id,
              match.player_two_registration_id
            )
              and not exists (
                select 1
                from public.notifications as notification
                where notification.recipient_clerk_user_id =
                  recipient.clerk_user_id
                  and notification.event_key = format(
                    'match:%s:activation:%s:reminder:2',
                    match.id,
                    match.activation_version
                  )
              )
          )
        )
        or (
          match.deadline_at > v_now + interval '24 hours'
          and match.deadline_at <= v_now + interval '72 hours'
          and exists (
            select 1
            from public.registrations as recipient
            where recipient.id in (
              match.player_one_registration_id,
              match.player_two_registration_id
            )
              and not exists (
                select 1
                from public.notifications as notification
                where notification.recipient_clerk_user_id =
                  recipient.clerk_user_id
                  and notification.event_key = format(
                    'match:%s:activation:%s:reminder:1',
                    match.id,
                    match.activation_version
                  )
              )
          )
        )
      )
    ) or (
      match.status = 'scheduled'
      and match.activation_version = 0
      and match.activated_at is null
      and match.deadline_at is null
      and match.outcome_type is null
      and match.deadline_ruled_at is null
      and match.player_one_score is null
      and match.player_two_score is null
      and match.winner_registration_id is null
      and match.official_result_submission_id is null
      and match.official_result_decided_by is null
      and match.official_result_decided_at is null
      and match.player_one_registration_id is not null
      and match.player_two_registration_id is not null
      and not exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = match.id
      )
      and not exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = match.id
      )
    )
    order by priority, due_at, match.id
    limit v_limit
    for update of match skip locked
  loop
    select match.*
    into v_match
    from public.tournament_matches as match
    where match.id = v_candidate.id;

    if v_candidate.priority = 4 then
      if public.activate_tournament_match_if_ready(v_match.id, false) then
        v_reconciled_count := v_reconciled_count + 1;
      end if;
      continue;
    end if;

    if v_candidate.priority = 1 then
      if v_match.status <> 'in_progress'
        or v_match.outcome_type is not null
        or v_match.deadline_ruled_at is not null
        or v_match.player_one_score is not null
        or v_match.player_two_score is not null
        or v_match.winner_registration_id is not null
        or v_match.official_result_submission_id is not null
        or v_match.official_result_decided_by is not null
        or v_match.official_result_decided_at is not null
        or v_match.player_one_registration_id is null
        or v_match.player_two_registration_id is null
        or v_match.deadline_at is null
        or not (clock_timestamp() >= v_match.deadline_at)
        or v_match.hold_started_at is not null
          and v_match.hold_released_at is null
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.match_id = v_match.id
            and report_group.status in (
              'pending_confirmation',
              'disputed',
              'under_review'
            )
            and report_group.finalized_at is null
        )
        or exists (
          select 1
          from public.match_result_report_groups as report_group
          where report_group.match_id = v_match.id
            and report_group.status in (
              'confirmed',
              'auto_approved',
              'approved'
            )
        )
        or exists (
          select 1
          from public.match_result_submissions as submission
          where submission.match_id = v_match.id
            and submission.status = 'pending'
        ) then
        continue;
      end if;

      v_now := clock_timestamp();

      update public.tournament_matches
      set
        status = 'completed',
        player_one_score = null,
        player_two_score = null,
        winner_registration_id = null,
        official_result_submission_id = null,
        official_result_decided_by = null,
        official_result_decided_at = null,
        outcome_type = 'deadline_double_forfeit',
        deadline_ruled_at = v_now
      where id = v_match.id
        and status = 'in_progress'
        and outcome_type is null;

      if not found then
        continue;
      end if;

      perform public.create_matchup_notifications(
        v_match.id,
        format(
          'activation:%s:deadline-ruling',
          v_match.activation_version
        ),
        'match.deadline_ruling',
        'Match ended by double forfeit',
        'The matchup deadline passed without a completed valid process. Both players were eliminated and no winner advanced.',
        jsonb_build_object(
          'deadlineEvent', 'deadline_ruling',
          'outcomeType', 'deadline_double_forfeit',
          'deadlineRuledAt', v_now
        )
      );

      v_double_forfeit_count := v_double_forfeit_count + 1;
      perform public.reconcile_downstream_match(v_match.id);
      continue;
    end if;

    if v_match.status <> 'in_progress'
      or v_match.outcome_type is not null
      or v_match.deadline_ruled_at is not null
      or v_match.player_one_score is not null
      or v_match.player_two_score is not null
      or v_match.winner_registration_id is not null
      or v_match.official_result_submission_id is not null
      or v_match.official_result_decided_by is not null
      or v_match.official_result_decided_at is not null
      or v_match.deadline_at is null
      or clock_timestamp() >= v_match.deadline_at
      or v_match.hold_started_at is not null
        and v_match.hold_released_at is null
      or exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = v_match.id
          and report_group.status in (
            'pending_confirmation',
            'disputed',
            'under_review'
          )
          and report_group.finalized_at is null
      )
      or exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = v_match.id
          and report_group.status in (
            'confirmed',
            'auto_approved',
            'approved'
          )
      )
      or exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = v_match.id
          and submission.status = 'pending'
      ) then
      continue;
    end if;

    if v_candidate.priority = 2 then
      if v_match.deadline_at > clock_timestamp() + interval '24 hours' then
        continue;
      end if;
      v_event_suffix := format(
        'activation:%s:reminder:2',
        v_match.activation_version
      );
      v_inserted := public.create_matchup_notifications(
        v_match.id,
        v_event_suffix,
        'match.deadline_reminder',
        '24-hour match deadline reminder',
        'Your active matchup has 24 hours or less remaining.',
        jsonb_build_object(
          'deadlineEvent', 'reminder',
          'reminderOrdinal', 2,
          'deadlineAt', v_match.deadline_at
        )
      );
      if v_inserted > 0 then
        v_reminder_two_count := v_reminder_two_count + 1;
      end if;
    elsif v_candidate.priority = 3 then
      if v_match.deadline_at <= clock_timestamp() + interval '24 hours'
        or v_match.deadline_at > clock_timestamp() + interval '72 hours' then
        continue;
      end if;
      v_event_suffix := format(
        'activation:%s:reminder:1',
        v_match.activation_version
      );
      v_inserted := public.create_matchup_notifications(
        v_match.id,
        v_event_suffix,
        'match.deadline_reminder',
        '72-hour match deadline reminder',
        'Your active matchup has 72 hours or less remaining.',
        jsonb_build_object(
          'deadlineEvent', 'reminder',
          'reminderOrdinal', 1,
          'deadlineAt', v_match.deadline_at
        )
      );
      if v_inserted > 0 then
        v_reminder_one_count := v_reminder_one_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'processed_limit', v_limit,
    'double_forfeits', v_double_forfeit_count,
    'reminder_two', v_reminder_two_count,
    'reminder_one', v_reminder_one_count,
    'reconciled_activations', v_reconciled_count
  );
end;
$$;

create or replace function public.is_generated_bracket_complete(
  p_generated_bracket_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_format text;
  v_match_count integer;
  v_incomplete_count integer;
  v_final_completed boolean;
begin
  select generated.format
  into v_format
  from public.generated_brackets as generated
  where generated.id = p_generated_bracket_id;

  if not found then
    return false;
  end if;

  if v_format = 'round_robin' then
    select
      count(*)::integer,
      count(*) filter (
        where match.status <> 'completed'
          or match.winner_registration_id is null
      )::integer
    into v_match_count, v_incomplete_count
    from public.tournament_matches as match
    where match.generated_bracket_id = p_generated_bracket_id;

    return v_match_count > 0 and v_incomplete_count = 0;
  end if;

  select
    match.status = 'completed'
      and (
        match.winner_registration_id is not null
        or match.outcome_type in (
          'deadline_double_forfeit',
          'empty_feeder'
        )
      )
  into v_final_completed
  from public.tournament_matches as match
  join public.bracket_rounds as round
    on round.id = match.round_id
  where match.generated_bracket_id = p_generated_bracket_id
  order by round.round_number desc, match.match_number desc
  limit 1;

  return coalesce(v_final_completed, false);
end;
$$;

alter function public.is_generated_bracket_complete(uuid)
  owner to postgres;
revoke all on function public.is_generated_bracket_complete(uuid)
  from public, anon, authenticated;
grant execute on function public.is_generated_bracket_complete(uuid)
  to service_role;

create or replace function public.is_registration_confirmed_no_show_for_leaderboard(
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_registration_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.match_result_report_groups as report_group
    join public.tournament_matches as match
      on match.id = report_group.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    where report_group.result_type = 'no_show'
      and report_group.no_show_registration_id = p_registration_id
      and report_group.tournament_id = p_tournament_id
      and generated.tournament_bracket_id = p_tournament_bracket_id
      and report_group.finalized_at is not null
      and report_group.status in (
        'confirmed',
        'auto_approved',
        'approved'
      )
      and report_group.no_show_status in (
        'confirmed',
        'auto_confirmed',
        'approved'
      )
  ) or exists (
    select 1
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and bracket.id = p_tournament_bracket_id
      and match.outcome_type = 'deadline_double_forfeit'
      and match.status = 'completed'
      and p_registration_id in (
        match.player_one_registration_id,
        match.player_two_registration_id
      )
  );
$$;

alter function public.is_registration_confirmed_no_show_for_leaderboard(
  uuid,
  uuid,
  uuid
) owner to postgres;
revoke all on function
  public.is_registration_confirmed_no_show_for_leaderboard(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.is_registration_confirmed_no_show_for_leaderboard(uuid, uuid, uuid)
  to service_role;

create or replace function public.unwind_derived_match_outcome(
  p_match_id uuid,
  p_reset_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_number integer;
  v_format text;
  v_next_round_id uuid;
  v_next_match_number integer;
  v_next public.tournament_matches%rowtype;
begin
  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Derived tournament match not found';
  end if;

  if v_match.status <> 'completed'
    or v_match.outcome_type not in ('automatic_bye', 'empty_feeder') then
    raise exception 'Only an untouched derived outcome can be unwound';
  end if;

  if v_match.activation_version <> 0
    or v_match.activated_at is not null
    or v_match.deadline_at is not null
    or v_match.extension_minutes is not null
    or v_match.hold_started_at is not null
    or exists (
      select 1
      from public.match_result_submissions as submission
      where submission.match_id = p_match_id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      where report_group.match_id = p_match_id
    ) then
    raise exception 'Derived match activity prevents reset';
  end if;

  select round.round_number, generated.format
  into v_round_number, v_format
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.id = v_match.round_id;

  if v_format <> 'single_elimination' then
    raise exception 'Only single-elimination derived outcomes can be unwound';
  end if;

  select round.id
  into v_next_round_id
  from public.bracket_rounds as round
  where round.generated_bracket_id = v_match.generated_bracket_id
    and round.round_number = v_round_number + 1;

  if v_next_round_id is not null then
    v_next_match_number := ceil(v_match.match_number / 2.0)::integer;

    select match.*
    into v_next
    from public.tournament_matches as match
    where match.round_id = v_next_round_id
      and match.match_number = v_next_match_number
    for update;

    if not found then
      raise exception 'Generated downstream match not found';
    end if;

    if v_next.outcome_type in ('automatic_bye', 'empty_feeder') then
      perform public.unwind_derived_match_outcome(v_next.id, p_reset_by);

      select match.*
      into v_next
      from public.tournament_matches as match
      where match.id = v_next.id
      for update;
    end if;

    if v_next.status <> 'scheduled'
      or v_next.activation_version <> 0
      or v_next.activated_at is not null
      or v_next.deadline_at is not null
      or v_next.player_one_score is not null
      or v_next.player_two_score is not null
      or v_next.winner_registration_id is not null
      or v_next.official_result_submission_id is not null
      or v_next.official_result_decided_by is not null
      or v_next.official_result_decided_at is not null
      or v_next.outcome_type is not null
      or v_next.deadline_ruled_at is not null
      or v_next.extension_minutes is not null
      or v_next.hold_started_at is not null
      or exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = v_next.id
      )
      or exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = v_next.id
      ) then
      raise exception 'Downstream activity prevents derived outcome reset';
    end if;

    if (v_match.match_number % 2) = 1 then
      if v_match.winner_registration_id is not null
        and v_next.player_one_registration_id is distinct from
          v_match.winner_registration_id then
        raise exception 'Downstream player slot no longer matches the derived winner';
      end if;

      update public.tournament_matches
      set player_one_registration_id = null
      where id = v_next.id;
    else
      if v_match.winner_registration_id is not null
        and v_next.player_two_registration_id is distinct from
          v_match.winner_registration_id then
        raise exception 'Downstream player slot no longer matches the derived winner';
      end if;

      update public.tournament_matches
      set player_two_registration_id = null
      where id = v_next.id;
    end if;
  end if;

  update public.tournament_matches
  set
    status = 'scheduled',
    player_one_score = null,
    player_two_score = null,
    winner_registration_id = null,
    official_result_submission_id = null,
    official_result_decided_by = null,
    official_result_decided_at = null,
    outcome_type = null,
    deadline_ruled_at = null
  where id = p_match_id;
end;
$$;

alter function public.unwind_derived_match_outcome(uuid, text)
  owner to postgres;
revoke all on function public.unwind_derived_match_outcome(uuid, text)
  from public, anon, authenticated, service_role;

alter function public.admin_reset_tournament_match(uuid, text)
  rename to admin_reset_tournament_match_without_deadline_outcomes;

revoke all on function
  public.admin_reset_tournament_match_without_deadline_outcomes(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.admin_reset_tournament_match(
  p_match_id uuid,
  p_reset_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_round_number integer;
  v_round_name text;
  v_format text;
  v_next_round_id uuid;
  v_next_match_number integer;
  v_next public.tournament_matches%rowtype;
  v_activated_at timestamptz;
  v_activation_version integer;
begin
  if nullif(btrim(p_reset_by), '') is null then
    raise exception 'Resetting administrator is required';
  end if;

  select match.*
  into v_match
  from public.tournament_matches as match
  where match.id = p_match_id
  for update;

  if not found then
    raise exception 'Tournament match not found';
  end if;

  select round.round_number, round.name, generated.format
  into v_round_number, v_round_name, v_format
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.id = v_match.round_id;

  if v_format = 'round_robin' then
    perform public.admin_reset_tournament_match_without_deadline_outcomes(
      p_match_id,
      p_reset_by
    );
    return;
  end if;

  if v_match.status <> 'completed' then
    raise exception 'Only a completed match can use the downstream-safe reset';
  end if;

  if v_match.outcome_type in ('automatic_bye', 'empty_feeder') then
    raise exception 'Reset the originating feeder result instead';
  end if;

  if v_match.hold_started_at is not null
    and v_match.hold_released_at is null then
    raise exception 'Release the administrative hold before resetting';
  end if;

  if v_match.player_one_registration_id is null
    or v_match.player_two_registration_id is null then
    raise exception 'A reopened real matchup requires both participants';
  end if;

  select round.id
  into v_next_round_id
  from public.bracket_rounds as round
  where round.generated_bracket_id = v_match.generated_bracket_id
    and round.round_number = v_round_number + 1;

  if v_next_round_id is not null then
    v_next_match_number := ceil(v_match.match_number / 2.0)::integer;

    select match.*
    into v_next
    from public.tournament_matches as match
    where match.round_id = v_next_round_id
      and match.match_number = v_next_match_number
    for update;

    if not found then
      raise exception 'Generated downstream match not found';
    end if;

    if v_next.outcome_type in ('automatic_bye', 'empty_feeder') then
      perform public.unwind_derived_match_outcome(v_next.id, p_reset_by);

      select match.*
      into v_next
      from public.tournament_matches as match
      where match.id = v_next.id
      for update;
    end if;

    if v_next.status <> 'scheduled'
      or v_next.activation_version <> 0
      or v_next.activated_at is not null
      or v_next.deadline_at is not null
      or v_next.player_one_score is not null
      or v_next.player_two_score is not null
      or v_next.winner_registration_id is not null
      or v_next.official_result_submission_id is not null
      or v_next.official_result_decided_by is not null
      or v_next.official_result_decided_at is not null
      or v_next.outcome_type is not null
      or v_next.deadline_ruled_at is not null
      or v_next.extension_minutes is not null
      or v_next.hold_started_at is not null
      or exists (
        select 1
        from public.match_result_submissions as submission
        where submission.match_id = v_next.id
      )
      or exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.match_id = v_next.id
      ) then
      raise exception 'Reset blocked because the downstream match has activity';
    end if;

    if (v_match.match_number % 2) = 1 then
      if v_match.winner_registration_id is not null
        and v_next.player_one_registration_id is distinct from
          v_match.winner_registration_id then
        raise exception 'Downstream player slot no longer matches this winner';
      end if;

      update public.tournament_matches
      set player_one_registration_id = null
      where id = v_next.id;
    else
      if v_match.winner_registration_id is not null
        and v_next.player_two_registration_id is distinct from
          v_match.winner_registration_id then
        raise exception 'Downstream player slot no longer matches this winner';
      end if;

      update public.tournament_matches
      set player_two_registration_id = null
      where id = v_next.id;
    end if;
  end if;

  update public.match_result_report_groups
  set
    status = 'reset',
    reviewed_by = p_reset_by,
    reviewed_at = now(),
    review_notes = coalesce(
      review_notes,
      'Match was reset by an administrator.'
    ),
    finalized_at = coalesce(finalized_at, now()),
    finalized_source = 'reset'
  where match_id = p_match_id
    and status <> 'reset';

  update public.match_result_submissions
  set
    status = 'rejected',
    reviewed_by = p_reset_by,
    review_notes = coalesce(
      review_notes,
      'Match was reset by an administrator.'
    ),
    reviewed_at = now()
  where match_id = p_match_id
    and status <> 'rejected';

  v_activated_at := clock_timestamp();
  v_activation_version := greatest(v_match.activation_version + 1, 1);

  update public.tournament_matches
  set
    player_one_score = null,
    player_two_score = null,
    winner_registration_id = null,
    official_result_submission_id = null,
    official_result_decided_by = null,
    official_result_decided_at = null,
    outcome_type = null,
    deadline_ruled_at = null,
    status = 'in_progress',
    activation_version = v_activation_version,
    activated_at = v_activated_at,
    deadline_at = v_activated_at + interval '7 days'
  where id = p_match_id;

  perform public.create_matchup_notifications(
    p_match_id,
    format('activation:%s:ready', v_activation_version),
    'match.ready',
    'Your matchup reopened',
    format(
      '%s reopened with a fresh seven-day window after an administrator reset.',
      v_round_name
    ),
    jsonb_build_object(
      'deadlineEvent', 'ready',
      'reopened', true,
      'activatedAt', v_activated_at,
      'deadlineAt', v_activated_at + interval '7 days'
    )
  );
end;
$$;

alter function public.admin_reset_tournament_match(uuid, text)
  owner to postgres;
revoke all on function public.admin_reset_tournament_match(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reset_tournament_match(uuid, text)
  to service_role;

-- Preserve the deployed Academy-aware season calculation and correct only its
-- played-match projection. Canonical point events intentionally continue to
-- award round_passed for a non-final automatic_bye and tournament_win for a
-- Final walkover, while non-result outcomes never become a played match.
alter function public.recalculate_leaderboard_for_season(uuid, text)
  rename to recalculate_leaderboard_for_season_without_outcome_filtering;

revoke all on function
  public.recalculate_leaderboard_for_season_without_outcome_filtering(
    uuid,
    text
  ) from public, anon, authenticated, service_role;

create or replace function public.recalculate_leaderboard_for_season(
  p_season_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_run_status text;
  v_all_time_run_id uuid;
  v_all_time_status text;
  v_all_time_notes text;
begin
  v_run_id := public.recalculate_leaderboard_for_season_without_outcome_filtering(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  with event_registrations as (
    select distinct
      event.player_id,
      event.bracket_type as stat_bracket_type,
      event.registration_id,
      event.tournament_bracket_id
    from public.leaderboard_point_events as event
    where event.season_id = p_season_id
      and event.event_type <> 'participation_withheld'
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
    union
    select distinct
      event.player_id,
      'overall'::text as stat_bracket_type,
      event.registration_id,
      event.tournament_bracket_id
    from public.leaderboard_point_events as event
    where event.season_id = p_season_id
      and event.event_type <> 'participation_withheld'
      and event.bracket_type in ('academy', 'main', 'challenge')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
  ),
  matched as (
    select distinct
      event_registration.player_id,
      event_registration.stat_bracket_type,
      match.id as match_id,
      match.winner_registration_id,
      event_registration.registration_id
    from event_registrations as event_registration
    join public.generated_brackets as generated
      on generated.tournament_bracket_id =
        event_registration.tournament_bracket_id
    join public.tournament_matches as match
      on match.generated_bracket_id = generated.id
      and match.status = 'completed'
      and match.outcome_type is null
      and (
        match.player_one_registration_id =
          event_registration.registration_id
        or match.player_two_registration_id =
          event_registration.registration_id
      )
  ),
  match_stats as (
    select
      player_id,
      stat_bracket_type as bracket_type,
      count(distinct match_id)::integer as matches_played,
      count(distinct match_id) filter (
        where winner_registration_id = registration_id
      )::integer as matches_won
    from matched
    group by player_id, stat_bracket_type
  )
  update public.leaderboard_player_season_stats as season_stats
  set
    matches_played = coalesce(match_stats.matches_played, 0),
    matches_won = coalesce(match_stats.matches_won, 0),
    matches_lost = greatest(
      coalesce(match_stats.matches_played, 0)
        - coalesce(match_stats.matches_won, 0),
      0
    ),
    win_rate = case
      when coalesce(match_stats.matches_played, 0) = 0 then 0::numeric
      else round(
        (
          coalesce(match_stats.matches_won, 0)::numeric
          / match_stats.matches_played
        ) * 100,
        2
      )
    end,
    updated_at = now()
  from (
    select
      current_stats.player_id,
      current_stats.bracket_type,
      aggregated.matches_played,
      aggregated.matches_won
    from public.leaderboard_player_season_stats as current_stats
    left join match_stats as aggregated
      on aggregated.player_id = current_stats.player_id
      and aggregated.bracket_type = current_stats.bracket_type
    where current_stats.season_id = p_season_id
  ) as match_stats
  where season_stats.season_id = p_season_id
    and season_stats.player_id = match_stats.player_id
    and season_stats.bracket_type = match_stats.bracket_type;

  v_all_time_run_id := public.recalculate_leaderboard_all_time(
    p_triggered_by_clerk_user_id
  );

  select run.status, run.notes
  into v_all_time_status, v_all_time_notes
  from public.leaderboard_recalculation_runs as run
  where run.id = v_all_time_run_id;

  if v_all_time_status is distinct from 'completed' then
    update public.leaderboard_recalculation_runs
    set
      status = 'failed',
      finished_at = now(),
      notes = format(
        'Outcome-aware all-time leaderboard recalculation failed: %s',
        coalesce(nullif(v_all_time_notes, ''), v_all_time_status, 'unknown')
      )
    where id = v_run_id;
  end if;

  return v_run_id;
end;
$$;

alter function public.recalculate_leaderboard_for_season(uuid, text)
  owner to postgres;
revoke all on function public.recalculate_leaderboard_for_season(uuid, text)
  from public, anon, authenticated;
grant execute on function public.recalculate_leaderboard_for_season(uuid, text)
  to service_role;

-- The deployed tournament calculation already maps every completed non-final
-- winner to round_passed and the completed Final winner to tournament_win.
-- Preserve that behavior for outcome_type = 'automatic_bye'. The updated
-- no-show helper withholds participation for deadline_double_forfeit, and the
-- season wrapper above excludes all non-result outcomes from played-match
-- statistics.
alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  rename to recalculate_leaderboard_for_tournament_without_matchup_outcomes;

revoke all on function
  public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
    uuid,
    text
  ) from public, anon, authenticated, service_role;

create or replace function public.recalculate_leaderboard_for_tournament(
  p_tournament_id uuid,
  p_triggered_by_clerk_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_run_status text;
  v_season_id uuid;
  v_deleted_participation_count integer;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
begin
  -- `automatic_bye` remains progression (`round_passed`) and can produce the
  -- Final `tournament_win`; `deadline_double_forfeit` and `empty_feeder`
  -- provide no winner. Played-match filtering is delegated to the season
  -- calculation after canonical point-event generation.
  perform count(*)
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  where bracket.tournament_id = p_tournament_id
    and match.outcome_type in (
      'automatic_bye',
      'deadline_double_forfeit',
      'empty_feeder'
    );

  v_run_id :=
    public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
      p_tournament_id,
      p_triggered_by_clerk_user_id
    );

  select run.status, run.season_id
  into v_run_status, v_season_id
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  -- Cap participation rows to result-bearing completed matches. The current
  -- core emits one distinct row per player/bracket, while this count-based
  -- cleanup also remains correct if a deployed core ever emits per-match
  -- rows: a real earlier result stays eligible and an automatic bye adds none.
  with result_match_counts as (
    select
      generated.tournament_bracket_id,
      participant.registration_id,
      count(distinct match.id)::integer as result_match_count
    from public.generated_brackets as generated
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
      and bracket.tournament_id = p_tournament_id
    join public.tournament_matches as match
      on match.generated_bracket_id = generated.id
      and match.status = 'completed'
      and match.outcome_type is null
    join lateral (
      values
        (match.player_one_registration_id),
        (match.player_two_registration_id)
    ) as participant(registration_id)
      on participant.registration_id is not null
    group by
      generated.tournament_bracket_id,
      participant.registration_id
  ),
  ranked_participation as (
    select
      event.id,
      row_number() over (
        partition by
          event.registration_id,
          event.tournament_bracket_id
        order by event.created_at, event.id
      ) as participation_number,
      coalesce(result_count.result_match_count, 0) as result_match_count
    from public.leaderboard_point_events as event
    left join result_match_counts as result_count
      on result_count.tournament_bracket_id = event.tournament_bracket_id
      and result_count.registration_id = event.registration_id
    where event.tournament_id = p_tournament_id
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
  )
  delete from public.leaderboard_point_events as event
  using ranked_participation as ranked
  where event.id = ranked.id
    and ranked.participation_number > ranked.result_match_count;

  get diagnostics v_deleted_participation_count = row_count;

  if v_deleted_participation_count > 0 and v_season_id is not null then
    v_season_run_id := public.recalculate_leaderboard_for_season(
      v_season_id,
      p_triggered_by_clerk_user_id
    );

    select run.status, run.notes
    into v_season_run_status, v_season_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      update public.leaderboard_recalculation_runs
      set
        status = 'failed',
        finished_at = now(),
        notes = format(
          'Outcome-aware participation recalculation failed: %s',
          coalesce(
            nullif(v_season_run_notes, ''),
            v_season_run_status,
            'unknown'
          )
        )
      where id = v_run_id;
    end if;
  end if;

  return v_run_id;
end;
$$;

alter function public.recalculate_leaderboard_for_tournament(uuid, text)
  owner to postgres;
revoke all on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
  to service_role;

-- Match deadline audit actors remain server-only. Browser projections must
-- continue to select reviewed fields through existing server loaders.
revoke all privileges on table public.tournament_matches
  from public, anon, authenticated;
grant select (
  id,
  player_one_registration_id,
  player_two_registration_id
) on table public.tournament_matches
  to authenticated;
grant all privileges on table public.tournament_matches
  to service_role;

alter function public.process_matchup_deadlines(integer)
  owner to postgres;
revoke all on function public.process_matchup_deadlines(integer)
  from public, anon, authenticated;
grant execute on function public.process_matchup_deadlines(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception when others then
    raise notice
      'pg_cron extension was not enabled automatically: %',
      sqlerrm;
  end;

  if to_regnamespace('cron') is null then
    raise notice
      'pg_cron is unavailable. Configure matchup deadline processing before deployment.';
    return;
  end if;

  for v_job_id in
    execute 'select jobid from cron.job where jobname = $1'
    using 'ironclad-process-matchup-deadlines'
  loop
    execute 'select cron.unschedule($1)' using v_job_id;
  end loop;

  execute 'select cron.schedule($1, $2, $3)'
  using
    'ironclad-process-matchup-deadlines',
    '* * * * *',
    'select public.process_matchup_deadlines(100);';
exception when others then
  raise notice
    'pg_cron matchup deadline job was not scheduled automatically: %',
    sqlerrm;
end;
$$;

commit;
