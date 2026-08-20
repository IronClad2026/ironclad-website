\set ON_ERROR_STOP on

-- Rollback-only Stage A database contract. Run only against a disposable
-- database or the explicitly approved Staging project after the migration.
set client_min_messages = warning;
set role postgres;

create temporary table stage_a_notification_baseline
on commit preserve rows
as
select pg_catalog.jsonb_build_object(
  'tournaments', (select pg_catalog.count(*) from public.tournaments),
  'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
  'registrations', (select pg_catalog.count(*) from public.registrations),
  'generated', (select pg_catalog.count(*) from public.generated_brackets),
  'rounds', (select pg_catalog.count(*) from public.bracket_rounds),
  'matches', (select pg_catalog.count(*) from public.tournament_matches),
  'groups', (
    select pg_catalog.count(*)
    from public.match_result_report_groups
  ),
  'notifications', (select pg_catalog.count(*) from public.notifications)
) as counts;

begin isolation level repeatable read;

create function pg_temp.stage_a_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Stage A contract failed: %', p_message;
  end if;
end;
$$;

-- Build one minimal launched Match graph without exercising unrelated roster,
-- map-pool, legal-acceptance, or bracket-generation workflows. Hosted
-- Supabase's postgres login is the table owner but is not a superuser, so use
-- rollback-contained USER-trigger suspension while foreign keys stay active.
alter table public.tournaments disable trigger user;
alter table public.tournament_brackets disable trigger user;
alter table public.registrations disable trigger user;
alter table public.generated_brackets disable trigger user;
alter table public.bracket_rounds disable trigger user;
alter table public.tournament_matches disable trigger user;

insert into public.tournaments (
  id,
  title,
  slug,
  format,
  status,
  description,
  banner_image_url,
  prize_pool,
  registration_enabled
) values (
  'a0000000-0000-4000-8000-000000000001',
  'Stage A Notification Contract',
  'stage-a-notification-contract',
  '1v1',
  'in_progress',
  'Rollback-only notification-truth contract.',
  '',
  '',
  false
);

insert into public.tournament_brackets (
  id,
  tournament_id,
  name,
  elo_rules,
  max_players,
  launched_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Academy',
  '0-5000',
  8,
  pg_catalog.clock_timestamp()
);

insert into public.registrations (
  id,
  clerk_user_id,
  player_name,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  admin_notes,
  tournament_id,
  tournament_bracket_id,
  submitted_elo,
  elo_verified_elo,
  elo_highest_faction,
  elo_checked_mode,
  elo_checked_at,
  elo_verification_source,
  elo_verified_division,
  elo_calculation_version
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'stage-a-player-one',
    'Stage A Player One',
    'Stage A Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'US Forces',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'stage-a-contract'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'stage-a-player-two',
    'Stage A Player Two',
    'Stage A Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'Wehrmacht',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'stage-a-contract'
  );

insert into public.generated_brackets (
  id,
  tournament_bracket_id,
  format,
  participant_count,
  slot_count,
  generated_by,
  competition_locked_at
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'single_elimination',
  8,
  8,
  'stage-a-contract-admin',
  pg_catalog.clock_timestamp()
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  1,
  'Stage A Final'
);

insert into public.tournament_matches (
  id,
  generated_bracket_id,
  round_id,
  match_number,
  player_one_registration_id,
  player_two_registration_id,
  status,
  series_best_of,
  activation_version,
  activated_at,
  deadline_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  1,
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'in_progress',
  3,
  1,
  pg_catalog.clock_timestamp() - interval '1 hour',
  pg_catalog.clock_timestamp() + interval '7 days'
);

alter table public.tournament_matches enable trigger user;
alter table public.bracket_rounds enable trigger user;
alter table public.generated_brackets enable trigger user;
alter table public.registrations enable trigger user;
alter table public.tournament_brackets enable trigger user;
alter table public.tournaments enable trigger user;

create function pg_temp.stage_a_force_notification_failure()
returns trigger
language plpgsql
as $$
begin
  if new.report_group_id =
    'a6000000-0000-4000-8000-000000000099'::uuid then
    raise exception 'Stage A forced notification failure';
  end if;
  return new;
end;
$$;

create trigger stage_a_force_notification_failure
before insert on public.notifications
for each row
execute function pg_temp.stage_a_force_notification_failure();

do $$
declare
  v_failed boolean;
  v_failure_message text;
begin
  insert into public.match_result_report_groups (
    id,
    match_id,
    tournament_id,
    submitted_by_clerk_user_id,
    submitted_by_registration_id,
    opponent_registration_id,
    winner_registration_id,
    player_one_score,
    player_two_score,
    replay_storage_path,
    replay_proof_mode,
    status,
    confirmation_deadline_at,
    result_type
  ) values (
    'a6000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'stage-a-player-one',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    2,
    0,
    'stage-a-contract/series-one.rec',
    'single_series_replay',
    'pending_confirmation',
    pg_catalog.clock_timestamp() + interval '24 hours',
    'normal'
  );

  perform pg_temp.stage_a_assert(
    (
      select pg_catalog.count(*) = 1
      from public.notifications
      where type = 'match.confirmation_required'
        and recipient_clerk_user_id = 'stage-a-player-two'
        and recipient_clerk_user_id <> 'stage-a-player-one'
        and registration_id =
          'a2000000-0000-4000-8000-000000000002'
        and match_id = 'a5000000-0000-4000-8000-000000000001'
        and report_group_id =
          'a6000000-0000-4000-8000-000000000001'
        and event_key =
          'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000001:confirmation-required'
        and read_at is null
        and email_template_key is null
        and email_delivery_status is null
        and email_next_attempt_at is null
    ),
    'normal pending confirmation must create one opponent-only durable row'
  );

  v_failed := false;
  begin
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      match_id,
      report_group_id,
      event_key
    ) values (
      'stage-a-player-two',
      'player',
      'match.confirmation_required',
      'Duplicate',
      'Duplicate',
      'a5000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000001:confirmation-required'
    );
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.stage_a_assert(
    v_failed,
    'the same Player event key must not duplicate'
  );

  update public.match_result_report_groups
  set
    status = 'confirmed',
    confirmed_at = pg_catalog.clock_timestamp(),
    confirmed_by_registration_id =
      'a2000000-0000-4000-8000-000000000002',
    finalized_at = pg_catalog.clock_timestamp(),
    finalized_source = 'opponent_confirmation'
  where id = 'a6000000-0000-4000-8000-000000000001';

  perform pg_temp.stage_a_assert(
    (
      select read_at is not null
      from public.notifications
      where report_group_id =
        'a6000000-0000-4000-8000-000000000001'
        and type = 'match.confirmation_required'
    ),
    'successful confirmation must resolve the durable unread row'
  );

  insert into public.match_result_report_groups (
    id,
    match_id,
    tournament_id,
    submitted_by_clerk_user_id,
    submitted_by_registration_id,
    opponent_registration_id,
    winner_registration_id,
    player_one_score,
    player_two_score,
    replay_storage_path,
    replay_proof_mode,
    status,
    confirmation_deadline_at,
    result_type
  ) values (
    'a6000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'stage-a-player-one',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    2,
    0,
    'stage-a-contract/series-two.rec',
    'single_series_replay',
    'pending_confirmation',
    pg_catalog.clock_timestamp() + interval '24 hours',
    'normal'
  );

  update public.match_result_report_groups
  set
    status = 'disputed',
    disputed_at = pg_catalog.clock_timestamp(),
    disputed_by_registration_id =
      'a2000000-0000-4000-8000-000000000002'
  where id = 'a6000000-0000-4000-8000-000000000002';

  perform pg_temp.stage_a_assert(
    (
      select read_at is not null
      from public.notifications
      where report_group_id =
        'a6000000-0000-4000-8000-000000000002'
        and type = 'match.confirmation_required'
    ),
    'successful dispute must resolve the durable unread row'
  );

  update public.match_result_report_groups
  set
    status = 'reset',
    finalized_at = pg_catalog.clock_timestamp(),
    finalized_source = 'reset'
  where id = 'a6000000-0000-4000-8000-000000000002';

  insert into public.match_result_report_groups (
    id,
    match_id,
    tournament_id,
    submitted_by_clerk_user_id,
    submitted_by_registration_id,
    opponent_registration_id,
    winner_registration_id,
    player_one_score,
    player_two_score,
    replay_proof_mode,
    status,
    confirmation_deadline_at,
    result_type,
    no_show_reported_by_registration_id,
    no_show_registration_id,
    no_show_status
  ) values (
    'a6000000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'stage-a-player-one',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    2,
    0,
    'no_show_report',
    'pending_confirmation',
    pg_catalog.clock_timestamp() + interval '24 hours',
    'no_show',
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'pending'
  );

  perform pg_temp.stage_a_assert(
    not exists (
      select 1
      from public.notifications
      where report_group_id =
        'a6000000-0000-4000-8000-000000000003'
        and type = 'match.confirmation_required'
    ),
    'no-show workflow must not create a normal confirmation notification'
  );

  update public.match_result_report_groups
  set
    status = 'reset',
    finalized_at = pg_catalog.clock_timestamp(),
    finalized_source = 'reset'
  where id = 'a6000000-0000-4000-8000-000000000003';

  v_failed := false;
  v_failure_message := null;
  begin
    insert into public.match_result_report_groups (
      id,
      match_id,
      tournament_id,
      submitted_by_clerk_user_id,
      submitted_by_registration_id,
      opponent_registration_id,
      winner_registration_id,
      player_one_score,
      player_two_score,
      replay_storage_path,
      replay_proof_mode,
      status,
      confirmation_deadline_at,
      result_type
    ) values (
      'a6000000-0000-4000-8000-000000000099',
      'a5000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      'stage-a-player-one',
      'a2000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001',
      2,
      0,
      'stage-a-contract/forced-failure.rec',
      'single_series_replay',
      'pending_confirmation',
      pg_catalog.clock_timestamp() + interval '24 hours',
      'normal'
    );
  exception when raise_exception then
    get stacked diagnostics v_failure_message = message_text;
    v_failed := v_failure_message = 'Stage A forced notification failure';
  end;

  perform pg_temp.stage_a_assert(
    v_failed
      and not exists (
        select 1
        from public.match_result_report_groups
        where id = 'a6000000-0000-4000-8000-000000000099'
      )
      and not exists (
        select 1
        from public.notifications
        where report_group_id =
          'a6000000-0000-4000-8000-000000000099'
      ),
    'notification failure must roll back the report-group insert'
  );

  insert into public.notifications (
    recipient_role,
    type,
    title,
    message,
    match_id,
    report_group_id,
    event_key
  ) values (
    'admin',
    'match.dispute_opened',
    'Stage A Admin Dispute',
    'A dispute requires review.',
    'a5000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000002',
    'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000002:dispute-opened'
  );

  v_failed := false;
  begin
    insert into public.notifications (
      recipient_role,
      type,
      title,
      message,
      event_key
    ) values (
      'admin',
      'match.dispute_opened',
      'Duplicate',
      'Duplicate',
      'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000002:dispute-opened'
    );
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.stage_a_assert(
    v_failed,
    'the same canonical Admin role event must not duplicate'
  );

  insert into public.notifications (
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    'admin',
    'match.dispute_opened',
    'Different Event',
    'A different event remains valid.',
    'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000003:dispute-opened'
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    event_key
  ) values (
    'stage-a-player-one',
    'player',
    'match.no_show_disputed',
    'Player-scoped Event',
    'Player events remain independently scoped.',
    'match:a5000000-0000-4000-8000-000000000001:report-group:a6000000-0000-4000-8000-000000000002:dispute-opened'
  );

  insert into public.notifications (
    recipient_role,
    type,
    title,
    message
  ) values
    ('admin', 'legacy.notice', 'Legacy One', 'Legacy row without key.'),
    ('admin', 'legacy.notice', 'Legacy Two', 'Legacy row without key.');

  insert into public.notifications (
    id,
    recipient_role,
    type,
    title,
    message,
    actor_clerk_user_id,
    match_id,
    event_key,
    in_app_hidden_at
  ) values (
    'a7000000-0000-4000-8000-000000000001',
    'admin',
    'match.admin_assistance_requested',
    'Hidden Assistance One',
    'A hidden historical request.',
    'stage-a-player-one',
    'a5000000-0000-4000-8000-000000000001',
    'match:a5000000-0000-4000-8000-000000000001:registration:a2000000-0000-4000-8000-000000000001:admin-assistance-request:initial',
    pg_catalog.clock_timestamp()
  );

  v_failed := false;
  begin
    insert into public.notifications (
      recipient_role,
      type,
      title,
      message,
      actor_clerk_user_id,
      match_id,
      event_key,
      in_app_hidden_at
    ) values (
      'admin',
      'match.admin_assistance_requested',
      'Duplicate Assistance',
      'The same logical request must not duplicate.',
      'stage-a-player-one',
      'a5000000-0000-4000-8000-000000000001',
      'match:a5000000-0000-4000-8000-000000000001:registration:a2000000-0000-4000-8000-000000000001:admin-assistance-request:initial',
      pg_catalog.clock_timestamp()
    );
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.stage_a_assert(
    v_failed,
    'the same canonical Admin assistance cycle must not duplicate'
  );

  insert into public.notifications (
    id,
    recipient_role,
    type,
    title,
    message,
    actor_clerk_user_id,
    match_id,
    event_key,
    in_app_hidden_at
  ) values (
    'a7000000-0000-4000-8000-000000000002',
    'admin',
    'match.admin_assistance_requested',
    'Hidden Assistance Two',
    'A later legitimate request cycle.',
    'stage-a-player-one',
    'a5000000-0000-4000-8000-000000000001',
    'match:a5000000-0000-4000-8000-000000000001:registration:a2000000-0000-4000-8000-000000000001:admin-assistance-request:after:a7000000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp()
  );

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    tournament_id,
    registration_id,
    metadata
  ) values
    (
      'stage-a-player-one',
      'player',
      'registration.waitlist_offer',
      'Stage A Waitlist Offer',
      'A place is available.',
      'a0000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    ),
    (
      'stage-a-player-two',
      'player',
      'registration.waitlist_closed',
      'Stage A Waitlist Closed',
      'The waitlist is closed.',
      'a0000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    );

  perform pg_temp.stage_a_assert(
    exists (
      select 1
      from public.notifications
      where type = 'registration.waitlist_offer'
        and event_key =
          'registration:a2000000-0000-4000-8000-000000000001:waitlist-offer'
        and email_template_key is null
        and email_delivery_status is null
    )
      and exists (
        select 1
        from public.notifications
        where type = 'registration.waitlist_closed'
          and event_key =
            'registration:a2000000-0000-4000-8000-000000000002:waitlist-closed'
          and email_template_key is null
          and email_delivery_status is null
      ),
    'waitlist event keys must be deterministic and email-ineligible'
  );
end;
$$;

drop trigger stage_a_force_notification_failure on public.notifications;

rollback;

do $$
declare
  v_baseline pg_temp.stage_a_notification_baseline%rowtype;
  v_after jsonb;
begin
  select * into strict v_baseline
  from pg_temp.stage_a_notification_baseline;

  select pg_catalog.jsonb_build_object(
    'tournaments', (select pg_catalog.count(*) from public.tournaments),
    'brackets', (select pg_catalog.count(*) from public.tournament_brackets),
    'registrations', (select pg_catalog.count(*) from public.registrations),
    'generated', (select pg_catalog.count(*) from public.generated_brackets),
    'rounds', (select pg_catalog.count(*) from public.bracket_rounds),
    'matches', (select pg_catalog.count(*) from public.tournament_matches),
    'groups', (
      select pg_catalog.count(*)
      from public.match_result_report_groups
    ),
    'notifications', (select pg_catalog.count(*) from public.notifications)
  ) into v_after;

  if v_after is distinct from v_baseline.counts then
    raise exception 'Stage A rollback changed Staging row counts';
  end if;

  if exists (
    select 1
    from public.tournaments
    where id = 'a0000000-0000-4000-8000-000000000001'
  ) or exists (
    select 1
    from public.notifications
    where recipient_clerk_user_id like 'stage-a-%'
      or actor_clerk_user_id like 'stage-a-%'
      or event_key like '%a5000000-0000-4000-8000-000000000001%'
  ) then
    raise exception 'Stage A deterministic fixture residue remains';
  end if;
end;
$$;

select pg_catalog.jsonb_build_object(
  'contract', 'stage-a-notification-truth',
  'fixture_transaction', 'rolled_back',
  'zero_residue', true
)::text;
