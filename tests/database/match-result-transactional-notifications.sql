begin;

-- Rollback-only IC-AUD-003 contract. Run only against the explicitly approved
-- Staging project after 20260823100000_match_result_transactional_trust.sql.
set client_min_messages = warning;
set role postgres;

create function pg_temp.match_result_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Match-result notification contract failed: %', p_message;
  end if;
end;
$$;

select pg_temp.match_result_assert(
  not exists (
    select 1
    from public.tournaments
    where id = 'b0000000-0000-4000-8000-000000000001'
      or slug = 'p1-match-result-notification-contract'
  ),
  'deterministic fixture already exists'
);

-- Build one minimal launched final. USER triggers are suspended only inside
-- this rollback transaction; foreign keys remain active.
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
  'b0000000-0000-4000-8000-000000000001',
  'P1 Match Result Notification Contract',
  'p1-match-result-notification-contract',
  '1v1',
  'in_progress',
  'Rollback-only P1 notification contract.',
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
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
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
    'b2000000-0000-4000-8000-000000000001',
    'p1-match-result-player-one',
    'P1 Player One',
    'P1 Match Result Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'US Forces',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-match-result-contract'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'p1-match-result-player-two',
    'P1 Player Two',
    'P1 Match Result Notification Contract',
    'Academy',
    'approved',
    'verified',
    '',
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1000,
    1000,
    'Wehrmacht',
    '1v1',
    pg_catalog.clock_timestamp(),
    'relic',
    'Academy',
    'p1-match-result-contract'
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
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'single_elimination',
  8,
  8,
  'p1-match-result-contract-admin',
  pg_catalog.clock_timestamp()
);

insert into public.bracket_rounds (
  id,
  generated_bracket_id,
  round_number,
  name
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  1,
  'P1 Final'
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
  'b5000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  1,
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
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

create function pg_temp.force_match_notification_failure()
returns trigger
language plpgsql
as $$
begin
  if new.type = pg_catalog.current_setting(
    'ironclad_test.fail_notification_type',
    true
  ) and (
    nullif(
      pg_catalog.current_setting(
        'ironclad_test.fail_notification_role',
        true
      ),
      ''
    ) is null
    or new.recipient_role = pg_catalog.current_setting(
      'ironclad_test.fail_notification_role',
      true
    )
  ) then
    raise exception 'P1 forced notification failure: %', new.type;
  end if;
  return new;
end;
$$;

create trigger force_match_notification_failure
before insert on public.notifications
for each row
execute function pg_temp.force_match_notification_failure();

do $$
declare
  v_result jsonb;
  v_group_id uuid;
  v_normal_group_id constant uuid :=
    'b6000000-0000-4000-8000-000000000001';
  v_failed boolean;
  v_message text;
begin
  -- A mandatory accused-player notification failure must abort no-show truth.
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    'match.no_show_reported',
    true
  );
  v_failed := false;
  begin
    perform public.submit_match_no_show_report(
      'b5000000-0000-4000-8000-000000000001',
      'p1-match-result-player-one',
      'b2000000-0000-4000-8000-000000000002',
      'Forced creation failure'
    );
  exception when raise_exception then
    get stacked diagnostics v_message = message_text;
    v_failed := v_message =
      'P1 forced notification failure: match.no_show_reported';
  end;
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    '',
    true
  );

  perform pg_temp.match_result_assert(
    v_failed
      and not exists (
        select 1
        from public.match_result_report_groups
        where match_id = 'b5000000-0000-4000-8000-000000000001'
      )
      and (
        select status = 'in_progress'
        from public.tournament_matches
        where id = 'b5000000-0000-4000-8000-000000000001'
      ),
    'no-show notification failure did not roll back group and Match state'
  );

  -- Create an authoritative no-show, then prove a failed Admin/counterpart
  -- dispute notification leaves the group actionable and its alert unread.
  v_result := public.submit_match_no_show_report(
    'b5000000-0000-4000-8000-000000000001',
    'p1-match-result-player-one',
    'b2000000-0000-4000-8000-000000000002',
    'Opponent did not arrive'
  );
  v_group_id := (v_result ->> 'report_group_id')::uuid;

  perform pg_temp.match_result_assert(
    (
      select pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          recipient_clerk_user_id = 'p1-match-result-player-two'
          and recipient_role = 'player'
          and actor_clerk_user_id is null
          and event_key = pg_catalog.format(
            'match:%s:report-group:%s:no-show-reported',
            'b5000000-0000-4000-8000-000000000001',
            v_group_id
          )
          and email_template_key is null
          and email_delivery_status is null
        )
      from public.notifications
      where report_group_id = v_group_id
        and type = 'match.no_show_reported'
    ),
    'canonical no-show notification is not exact and email-independent'
  );

  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    'match.no_show_disputed',
    true
  );
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_role',
    'player',
    true
  );
  v_failed := false;
  begin
    perform public.dispute_match_result_report_group(
      v_group_id,
      'p1-match-result-player-two',
      'Reporter was mistaken'
    );
  exception when raise_exception then
    get stacked diagnostics v_message = message_text;
    v_failed := v_message =
      'P1 forced notification failure: match.no_show_disputed';
  end;
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    '',
    true
  );
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_role',
    '',
    true
  );

  perform pg_temp.match_result_assert(
    v_failed
      and (
        select status = 'pending_confirmation'
          and disputed_at is null
          and disputed_by_registration_id is null
        from public.match_result_report_groups
        where id = v_group_id
      )
      and (
        select read_at is null
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_reported'
      )
      and not exists (
        select 1
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_disputed'
      ),
    'counterpart notification failure did not roll back the earlier Admin row and authoritative truth'
  );

  perform public.dispute_match_result_report_group(
    v_group_id,
    'p1-match-result-player-two',
    'Reporter was mistaken'
  );

  perform pg_temp.match_result_assert(
    (
      select status = 'disputed'
        and no_show_status = 'disputed'
        and finalized_at is null
      from public.match_result_report_groups
      where id = v_group_id
    )
      and (
        select read_at is not null
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_reported'
      )
      and (
        select pg_catalog.count(*) = 1
          and pg_catalog.bool_and(
            recipient_role = 'admin'
            and recipient_clerk_user_id is null
            and actor_clerk_user_id is null
            and event_key = pg_catalog.format(
              'match:%s:report-group:%s:dispute-opened',
              'b5000000-0000-4000-8000-000000000001',
              v_group_id
            )
          )
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_disputed'
          and recipient_role = 'admin'
      )
      and (
        select pg_catalog.count(*) = 1
          and pg_catalog.bool_and(
            recipient_clerk_user_id = 'p1-match-result-player-one'
            and recipient_role = 'player'
            and actor_clerk_user_id is null
            and event_key = pg_catalog.format(
              'match:%s:report-group:%s:response:disputed',
              'b5000000-0000-4000-8000-000000000001',
              v_group_id
            )
          )
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_disputed'
          and recipient_role = 'player'
      ),
    'successful no-show dispute did not create exact durable workflow rows'
  );

  perform public.admin_finalize_match_result_report_group(
    v_group_id,
    'reset',
    'p1-match-result-contract-admin',
    'Reset between rollback-contained cases'
  );

  -- A normal dispute uses the same database-owned Admin hand-off.
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
    v_normal_group_id,
    'b5000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'p1-match-result-player-one',
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001',
    2,
    0,
    'p1-match-result-contract/normal.rec',
    'single_series_replay',
    'pending_confirmation',
    pg_catalog.clock_timestamp() + interval '24 hours',
    'normal'
  );
  update public.tournament_matches
  set status = 'pending_review'
  where id = 'b5000000-0000-4000-8000-000000000001';

  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    'match.dispute_opened',
    true
  );
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_role',
    'admin',
    true
  );
  v_failed := false;
  begin
    perform public.dispute_match_result_report_group(
      v_normal_group_id,
      'p1-match-result-player-two',
      'Forced normal-dispute hand-off failure'
    );
  exception when raise_exception then
    get stacked diagnostics v_message = message_text;
    v_failed := v_message =
      'P1 forced notification failure: match.dispute_opened';
  end;
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    '',
    true
  );
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_role',
    '',
    true
  );

  perform pg_temp.match_result_assert(
    v_failed
      and (
        select status = 'pending_confirmation'
          and disputed_at is null
          and disputed_by_registration_id is null
        from public.match_result_report_groups
        where id = v_normal_group_id
      )
      and (
        select read_at is null
        from public.notifications
        where report_group_id = v_normal_group_id
          and type = 'match.confirmation_required'
      )
      and not exists (
        select 1
        from public.notifications
        where report_group_id = v_normal_group_id
          and type = 'match.dispute_opened'
      ),
    'Admin dispute-notification failure did not roll back authoritative truth'
  );

  perform public.dispute_match_result_report_group(
    v_normal_group_id,
    'p1-match-result-player-two',
    'Normal result score is wrong'
  );
  perform pg_temp.match_result_assert(
    exists (
      select 1
      from public.notifications
      where report_group_id = v_normal_group_id
        and recipient_role = 'admin'
        and recipient_clerk_user_id is null
        and type = 'match.dispute_opened'
        and event_key = pg_catalog.format(
          'match:%s:report-group:%s:dispute-opened',
          'b5000000-0000-4000-8000-000000000001',
          v_normal_group_id
        )
    ),
    'normal dispute did not create the canonical Admin hand-off'
  );
  perform public.admin_finalize_match_result_report_group(
    v_normal_group_id,
    'reset',
    'p1-match-result-contract-admin',
    'Reset between rollback-contained cases'
  );

  -- A failed reporter-response notification must roll back confirmation,
  -- Match completion, report-group finalization, and original-alert resolution.
  v_result := public.submit_match_no_show_report(
    'b5000000-0000-4000-8000-000000000001',
    'p1-match-result-player-one',
    'b2000000-0000-4000-8000-000000000002',
    'Second no-show case'
  );
  v_group_id := (v_result ->> 'report_group_id')::uuid;

  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    'match.no_show_confirmed',
    true
  );
  v_failed := false;
  begin
    perform public.confirm_match_result_report_group(
      v_group_id,
      'p1-match-result-player-two'
    );
  exception when raise_exception then
    get stacked diagnostics v_message = message_text;
    v_failed := v_message =
      'P1 forced notification failure: match.no_show_confirmed';
  end;
  perform pg_catalog.set_config(
    'ironclad_test.fail_notification_type',
    '',
    true
  );

  perform pg_temp.match_result_assert(
    v_failed
      and (
        select status = 'pending_confirmation'
          and finalized_at is null
          and confirmed_at is null
        from public.match_result_report_groups
        where id = v_group_id
      )
      and (
        select status = 'pending_review'
          and winner_registration_id is null
          and official_result_decided_at is null
        from public.tournament_matches
        where id = 'b5000000-0000-4000-8000-000000000001'
      )
      and (
        select read_at is null
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_reported'
      )
      and not exists (
        select 1
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_confirmed'
      ),
    'confirmation notification failure did not roll back authoritative truth'
  );

  perform public.confirm_match_result_report_group(
    v_group_id,
    'p1-match-result-player-two'
  );
  perform pg_temp.match_result_assert(
    (
      select status = 'confirmed'
        and finalized_at is not null
        and finalized_source = 'opponent_confirmation'
        and no_show_status = 'confirmed'
      from public.match_result_report_groups
      where id = v_group_id
    )
      and (
        select status = 'completed'
          and player_one_score = 2
          and player_two_score = 0
          and winner_registration_id =
            'b2000000-0000-4000-8000-000000000001'
        from public.tournament_matches
        where id = 'b5000000-0000-4000-8000-000000000001'
      )
      and (
        select read_at is not null
        from public.notifications
        where report_group_id = v_group_id
          and type = 'match.no_show_reported'
      )
      and exists (
        select 1
        from public.notifications
        where report_group_id = v_group_id
          and recipient_clerk_user_id = 'p1-match-result-player-one'
          and type = 'match.no_show_confirmed'
          and actor_clerk_user_id is null
          and event_key = pg_catalog.format(
            'match:%s:report-group:%s:response:confirmed',
            'b5000000-0000-4000-8000-000000000001',
            v_group_id
          )
      ),
    'successful confirmation did not leave one consistent durable outcome'
  );
end;
$$;

drop trigger force_match_notification_failure on public.notifications;

rollback;

do $$
begin
  if exists (
    select 1
    from public.tournaments
    where id = 'b0000000-0000-4000-8000-000000000001'
      or slug = 'p1-match-result-notification-contract'
  ) or exists (
    select 1
    from public.notifications
    where recipient_clerk_user_id like 'p1-match-result-%'
      or actor_clerk_user_id like 'p1-match-result-%'
      or event_key like '%b5000000-0000-4000-8000-000000000001%'
  ) then
    raise exception 'Match-result notification fixture residue remains';
  end if;
end;
$$;

select 'p1_match_result_notifications_rolled_back' as contract_status;
