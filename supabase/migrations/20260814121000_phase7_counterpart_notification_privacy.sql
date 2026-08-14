begin;

-- Match-ready notifications materialize the opponent's registration name.
-- Close the counterpart gap through match/registration relationships before
-- the registration snapshot is pseudonymized; do not infer identity from copy.
delete from public.notifications as notification
where notification.type = 'match.ready'
  and exists (
    select 1
    from public.tournament_matches as related_match
    join public.registrations as related_registration
      on related_registration.id in (
        related_match.player_one_registration_id,
        related_match.player_two_registration_id
      )
    join public.players as closed_player
      on closed_player.id = related_registration.profile_id
    where notification.match_id = related_match.id
      and closed_player.account_closed_at is not null
  );

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
  v_closed_identity text;
  v_player public.players%rowtype;
  v_player_found boolean;
  v_has_history boolean;
  v_previous_account_closure text :=
    current_setting('ironclad.account_closure', true);
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

  select player.*
  into v_player
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  v_player_found := found;
  if v_player_found then
    v_has_history :=
      public.player_has_authoritative_competition_history(v_player.id);
  else
    v_has_history := false;
  end if;

  v_closed_identity :=
    'deleted:' || pg_catalog.gen_random_uuid()::text;

  perform pg_catalog.set_config(
    'ironclad.account_closure',
    'on',
    true
  );

  delete from public.player_notification_dismissals as dismissal
  where dismissal.clerk_user_id = v_clerk_user_id;

  delete from public.player_report_group_notification_dismissals as dismissal
  where dismissal.clerk_user_id = v_clerk_user_id;

  delete from public.notifications as notification
  where notification.recipient_clerk_user_id = v_clerk_user_id
    or notification.actor_clerk_user_id = v_clerk_user_id
    or position(v_clerk_user_id in notification.metadata::text) > 0
    or exists (
      select 1
      from public.registrations as registration
      where (
          registration.profile_id = v_player.id
          or registration.clerk_user_id = v_clerk_user_id
        )
        and notification.registration_id = registration.id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report
      join public.registrations as registration
        on registration.id in (
          report.submitted_by_registration_id,
          report.opponent_registration_id,
          report.winner_registration_id,
          report.confirmed_by_registration_id,
          report.disputed_by_registration_id,
          report.no_show_reported_by_registration_id,
          report.no_show_registration_id
        )
      where (
          registration.profile_id = v_player.id
          or registration.clerk_user_id = v_clerk_user_id
        )
        and notification.report_group_id = report.id
    )
    or exists (
      select 1
      from public.tournament_matches as related_match
      join public.registrations as related_registration
        on related_registration.id in (
          related_match.player_one_registration_id,
          related_match.player_two_registration_id
        )
      where notification.type = 'match.ready'
        and notification.match_id = related_match.id
        and (
          related_registration.profile_id = v_player.id
          or related_registration.clerk_user_id = v_clerk_user_id
        )
    );

  update public.registrations
  set
    clerk_user_id = v_closed_identity,
    player_name = 'Former Competitor',
    discord_username = null,
    steam_name = null,
    coh3_player_card_url = null,
    country = null,
    region = null,
    timezone = null,
    admin_notes = '',
    elo_verification_error = null,
    elo_verification_payload = null,
    elo_verified_player_name = null,
    elo_identity_status = null,
    elo_identity_error = null
  where profile_id = v_player.id
    or clerk_user_id = v_clerk_user_id;

  update public.match_result_submissions
  set
    submitted_by_clerk_user_id = case
      when submitted_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else submitted_by_clerk_user_id
    end,
    reviewed_by = case
      when reviewed_by = v_clerk_user_id then v_closed_identity
      else reviewed_by
    end
  where submitted_by_clerk_user_id = v_clerk_user_id
    or reviewed_by = v_clerk_user_id;

  update public.match_result_report_groups
  set
    submitted_by_clerk_user_id = case
      when submitted_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else submitted_by_clerk_user_id
    end,
    reviewed_by = case
      when reviewed_by = v_clerk_user_id then v_closed_identity
      else reviewed_by
    end,
    no_show_resolved_by = case
      when no_show_resolved_by = v_clerk_user_id then v_closed_identity
      else no_show_resolved_by
    end
  where submitted_by_clerk_user_id = v_clerk_user_id
    or reviewed_by = v_clerk_user_id
    or no_show_resolved_by = v_clerk_user_id;

  update public.tournament_matches
  set
    official_result_decided_by = case
      when official_result_decided_by = v_clerk_user_id
        then v_closed_identity
      else official_result_decided_by
    end,
    extended_by_clerk_user_id = case
      when extended_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else extended_by_clerk_user_id
    end,
    held_by_clerk_user_id = case
      when held_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else held_by_clerk_user_id
    end
  where official_result_decided_by = v_clerk_user_id
    or extended_by_clerk_user_id = v_clerk_user_id
    or held_by_clerk_user_id = v_clerk_user_id;

  update public.generated_brackets
  set generated_by = v_closed_identity
  where generated_by = v_clerk_user_id;

  update public.leaderboard_point_events
  set created_by_clerk_user_id = v_closed_identity
  where created_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_recalculation_runs
  set triggered_by_clerk_user_id = v_closed_identity
  where triggered_by_clerk_user_id = v_clerk_user_id;

  update public.platform_settings
  set updated_by_clerk_user_id = v_closed_identity
  where updated_by_clerk_user_id = v_clerk_user_id;

  update public.tournament_deletion_jobs
  set requested_by = v_closed_identity
  where requested_by = v_clerk_user_id;

  update public.tournaments
  set terminated_by_clerk_user_id = v_closed_identity
  where terminated_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_tournament_season_memberships
  set voided_by_clerk_user_id = v_closed_identity
  where voided_by_clerk_user_id = v_clerk_user_id;

  update public.leaderboard_seasons
  set under_review_by_clerk_user_id = v_closed_identity
  where under_review_by_clerk_user_id = v_clerk_user_id;

  delete from public.profiles
  where clerk_user_id = v_clerk_user_id;

  if not v_player_found then
    perform pg_catalog.set_config(
      'ironclad.account_closure',
      coalesce(v_previous_account_closure, ''),
      true
    );

    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;

  if not v_has_history then
    delete from public.players
    where id = v_player.id;

    perform pg_catalog.set_config(
      'ironclad.account_closure',
      coalesce(v_previous_account_closure, ''),
      true
    );

    return pg_catalog.jsonb_build_object('outcome', 'deleted');
  end if;

  update public.players
  set
    clerk_user_id = v_closed_identity,
    display_name = 'Former Competitor',
    in_game_name = 'Former Competitor',
    discord_username = null,
    steam_username = null,
    coh3_player_card_url = null,
    country = null,
    region = null,
    timezone = null,
    current_elo = null,
    avatar_url = null,
    bio = null,
    profile_completed = false,
    public_profile_enabled = false,
    discord_public_enabled = false,
    coh3_profile_id = null,
    steam_id64 = null,
    relic_verified_elo = null,
    relic_verified_faction = null,
    relic_verified_division = null,
    relic_elo_calculation_version = null,
    relic_elo_verified_at = null,
    relic_elo_last_attempt_at = null,
    account_closed_at = clock_timestamp()
  where id = v_player.id;

  perform pg_catalog.set_config(
    'ironclad.account_closure',
    coalesce(v_previous_account_closure, ''),
    true
  );

  return pg_catalog.jsonb_build_object('outcome', 'pseudonymized');
end;
$$;

alter function public.close_ironclad_player_account(text)
  owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

commit;
