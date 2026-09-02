begin;

-- A terminal transition can resolve outstanding offers without asking the
-- normal vacancy reconciler to promote another waitlisted registration. The
-- transition flag is already restricted to trusted terminal authorities.
create or replace function public.refresh_phase4_registration_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
  v_terminal_transition boolean :=
    coalesce(
      pg_catalog.current_setting(
        'ironclad.tournament_terminal_transition',
        true
      ),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if v_terminal_transition then
    return new;
  end if;

  if current_setting('ironclad.tournament_deletion', true) = 'on' then
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.tournament_bracket_id is not null
      and new.registration_status = 'waitlisted'
      and new.waitlist_offer_status is null then
      perform public.reconcile_tournament_waitlist(
        new.tournament_bracket_id
      );
    end if;
    return new;
  end if;

  v_old_bracket_id := old.tournament_bracket_id;
  v_new_bracket_id := new.tournament_bracket_id;

  if old.registration_status = 'approved'
    and (
      new.registration_status <> 'approved'
      or v_old_bracket_id is distinct from v_new_bracket_id
    )
    and v_old_bracket_id is not null then
    perform public.reset_unlaunched_tournament_bracket_draft(
      v_old_bracket_id
    );
  end if;

  if new.registration_status = 'approved'
    and (
      old.registration_status <> 'approved'
      or v_old_bracket_id is distinct from v_new_bracket_id
    )
    and v_new_bracket_id is not null then
    perform public.reset_unlaunched_tournament_bracket_draft(
      v_new_bracket_id
    );
  end if;

  if v_old_bracket_id is not null
    and (
      (
        old.registration_status in (
          'pending',
          'manual_review',
          'approved'
        )
        and new.registration_status not in (
          'pending',
          'manual_review',
          'approved'
        )
      )
      or (
        old.registration_status = 'waitlisted'
        and old.waitlist_offer_status = 'offered'
        and not (
          new.registration_status = 'pending'
          and new.waitlist_offer_status = 'accepted'
        )
      )
    ) then
    perform public.reconcile_tournament_waitlist(v_old_bracket_id);
  elsif v_new_bracket_id is not null
    and tg_op = 'UPDATE'
    and old.waitlist_offer_status is null
    and new.waitlist_offer_status is null
    and new.registration_status = 'waitlisted' then
    perform public.reconcile_tournament_waitlist(v_new_bracket_id);
  end if;

  return new;
end;
$$;

alter function public.refresh_phase4_registration_state()
  owner to postgres;
revoke all on function public.refresh_phase4_registration_state()
  from public, anon, authenticated;
grant execute on function public.refresh_phase4_registration_state()
  to service_role;

create or replace function public.void_tournament(
  p_tournament_id uuid,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_membership public.leaderboard_tournament_season_memberships%rowtype;
  v_season public.leaderboard_seasons%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_has_launched boolean;
  v_previous_transition text;
  v_affected_season record;
  v_season_run_id uuid;
  v_season_run_status text;
  v_season_run_notes text;
begin
  perform public.leaderboard_require_write_access();

  if p_tournament_id is null then
    raise exception 'Tournament is required';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'A non-empty void reason of at most 2000 characters is required';
  end if;
  if v_actor is null then
    raise exception 'Voiding administrator identity is required';
  end if;

  -- Reuse the PR 2/3 global root before the narrower tournament lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:tournament:'
        || coalesce(p_tournament_id::text, 'null'),
      0
    )
  );

  begin
    select tournament.*
    into v_tournament
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for update nowait;
  exception when lock_not_available then
    raise exception 'Tournament is being updated; retry the void operation'
      using errcode = '55P03';
  end;

  if not found then
    raise exception 'Tournament not found';
  end if;
  if v_tournament.status = 'voided' then
    return pg_catalog.jsonb_build_object('outcome', 'already_voided');
  end if;
  if v_tournament.status = 'cancelled' then
    raise exception 'A cancelled tournament cannot be voided'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is not null
  )
  into v_has_launched;

  if not v_has_launched then
    -- The target event is locked first. Deterministic NOWAIT child locks then
    -- avoid inversion with registration, launch, and generation authorities,
    -- which lock a division before consulting the tournament terminal guard.
    begin
      perform bracket.id
      from public.tournament_brackets as bracket
      where bracket.tournament_id = p_tournament_id
      order by bracket.id
      for update of bracket nowait;
    exception when lock_not_available then
      raise exception 'Tournament divisions are being updated; retry the void operation'
        using errcode = '55P03';
    end;

    select exists (
      select 1
      from public.tournament_brackets as bracket
      where bracket.tournament_id = p_tournament_id
        and bracket.launched_at is not null
    )
    into v_has_launched;
  end if;

  if not v_has_launched then
    if v_tournament.status is null
      or v_tournament.status not in ('upcoming', 'registration_open')
      or v_tournament.terminal_at is not null
      or v_tournament.first_completed_at is not null
      or not exists (
        select 1
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or public.tournament_has_official_competition(p_tournament_id)
      or exists (
        select 1
        from public.generated_brackets as generated
        join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where bracket.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.tournament_matches as match
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where bracket.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_result_report_groups as report_group
        where report_group.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_result_submissions as submission
        join public.tournament_matches as match
          on match.id = submission.match_id
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where bracket.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_replay_upload_attempts as replay_attempt
        join public.tournament_matches as match
          on match.id = replay_attempt.match_id
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where bracket.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_dice_rolls as dice_roll
        join public.tournament_matches as match
          on match.id = dice_roll.match_id
        join public.generated_brackets as generated
          on generated.id = match.generated_bracket_id
        join public.tournament_brackets as bracket
          on bracket.id = generated.tournament_bracket_id
        where bracket.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_participant_outcome_authority as authority
        where authority.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.match_game_result_authority as authority
        where authority.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.tournament_championship_path_authority as authority
        where authority.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.tournament_championship_path_summary_authority as summary
        where summary.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.leaderboard_tournament_season_memberships as membership
        where membership.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.leaderboard_point_events as event
        where event.tournament_id = p_tournament_id
          or event.tournament_bracket_id in (
            select bracket.id
            from public.tournament_brackets as bracket
            where bracket.tournament_id = p_tournament_id
          )
          or event.registration_id in (
            select registration.id
            from public.registrations as registration
            where registration.tournament_id = p_tournament_id
              or registration.tournament_bracket_id in (
                select bracket.id
                from public.tournament_brackets as bracket
                where bracket.tournament_id = p_tournament_id
              )
          )
      )
      or exists (
        select 1
        from public.leaderboard_recalculation_runs as run
        where run.tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.leaderboard_player_season_stats as stats
        where stats.last_tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.leaderboard_seasons as season
        where season.under_review_tournament_id = p_tournament_id
      )
      or exists (
        select 1
        from public.player_badge_awards as award
        where award.source_id = p_tournament_id
          or (
            award.source_type = 'match'
            and award.source_id in (
              select match.id
              from public.tournament_matches as match
              join public.generated_brackets as generated
                on generated.id = match.generated_bracket_id
              join public.tournament_brackets as bracket
                on bracket.id = generated.tournament_bracket_id
              where bracket.tournament_id = p_tournament_id
            )
          )
          or award.source_metadata ->> 'tournamentId' = p_tournament_id::text
          or award.source_metadata ->> 'tournament_id' = p_tournament_id::text
          or award.source_metadata ->> 'originalTournamentId' = p_tournament_id::text
          or award.source_metadata ->> 'original_tournament_id' = p_tournament_id::text
          or award.source_metadata ->> 'thresholdTournamentId' = p_tournament_id::text
          or award.source_metadata ->> 'threshold_tournament_id' = p_tournament_id::text
          or award.source_metadata ->> 'matchId' in (
            select match.id::text
            from public.tournament_matches as match
            join public.generated_brackets as generated
              on generated.id = match.generated_bracket_id
            join public.tournament_brackets as bracket
              on bracket.id = generated.tournament_bracket_id
            where bracket.tournament_id = p_tournament_id
          )
          or award.source_metadata ->> 'match_id' in (
            select match.id::text
            from public.tournament_matches as match
            join public.generated_brackets as generated
              on generated.id = match.generated_bracket_id
            join public.tournament_brackets as bracket
              on bracket.id = generated.tournament_bracket_id
            where bracket.tournament_id = p_tournament_id
          )
          or pg_catalog.lower(award.source_metadata::text) like
            '%' || p_tournament_id::text || '%'
      )
      or exists (
        select 1
        from ironclad_private.badge_reconciliation_targets as target
        where (
          target.source_type = 'tournament'
          and pg_catalog.lower(target.source_id) = p_tournament_id::text
        )
        or (
          target.source_type = 'match'
          and pg_catalog.lower(target.source_id) in (
            select match.id::text
            from public.tournament_matches as match
            join public.generated_brackets as generated
              on generated.id = match.generated_bracket_id
            join public.tournament_brackets as bracket
              on bracket.id = generated.tournament_bracket_id
            where bracket.tournament_id = p_tournament_id
          )
        )
      ) then
      raise exception 'Unlaunched tournament Void requires zero competitive, scoring, season, or Badge evidence'
        using errcode = '55000';
    end if;

    begin
      perform registration.id
      from public.registrations as registration
      where registration.tournament_id = p_tournament_id
        and registration.registration_status = 'waitlisted'
        and registration.waitlist_offer_status = 'offered'
      order by registration.id
      for update of registration nowait;
    exception when lock_not_available then
      raise exception 'Tournament registrations are being updated; retry the void operation'
        using errcode = '55P03';
    end;
  end if;

  select membership.*
  into v_membership
  from public.leaderboard_tournament_season_memberships as membership
  where membership.tournament_id = p_tournament_id
  for update;

  if found then
    select season.*
    into v_season
    from public.leaderboard_seasons as season
    where season.id = v_membership.season_id
    for update;
  end if;

  if v_membership.qualifying_event_number is not null
    and v_season.finalized_at is not null then
    if v_season.under_review_at is not null then
      return pg_catalog.jsonb_build_object(
        'outcome',
        'already_under_review'
      );
    end if;

    update public.leaderboard_seasons
    set
      under_review_at = clock_timestamp(),
      under_review_reason = v_reason,
      under_review_by_clerk_user_id = v_actor,
      under_review_tournament_id = p_tournament_id
    where id = v_membership.season_id;

    return pg_catalog.jsonb_build_object('outcome', 'under_review');
  end if;

  if public.tournament_has_linked_admin_adjustment(p_tournament_id) then
    raise exception 'Tournament-linked administrator adjustment must be adjudicated before Void'
      using errcode = '55000';
  end if;

  drop table if exists pg_temp.tournament_void_affected_seasons;
  create temporary table tournament_void_affected_seasons (
    season_id uuid primary key
  ) on commit drop;

  insert into pg_temp.tournament_void_affected_seasons (season_id)
  select distinct event.season_id
  from public.leaderboard_point_events as event
  where event.source in ('system', 'recalculation')
    and (
      event.tournament_id = p_tournament_id
      or event.tournament_bracket_id in (
        select bracket.id
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or event.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_id = p_tournament_id
      )
    )
  on conflict (season_id) do nothing;

  if v_membership.season_id is not null then
    insert into pg_temp.tournament_void_affected_seasons (season_id)
    values (v_membership.season_id)
    on conflict (season_id) do nothing;
  end if;

  v_previous_transition := pg_catalog.current_setting(
    'ironclad.tournament_terminal_transition',
    true
  );
  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    'on',
    true
  );

  if not v_has_launched then
    update public.registrations
    set
      waitlist_offer_status = 'cancelled',
      waitlist_offer_resolved_at = clock_timestamp()
    where tournament_id = p_tournament_id
      and registration_status = 'waitlisted'
      and waitlist_offer_status = 'offered';
  end if;

  update public.tournaments
  set
    status = 'voided',
    registration_enabled = false,
    terminal_at = clock_timestamp(),
    terminal_reason = v_reason,
    terminated_by_clerk_user_id = v_actor
  where id = p_tournament_id;

  perform pg_catalog.set_config(
    'ironclad.tournament_terminal_transition',
    coalesce(v_previous_transition, ''),
    true
  );

  update public.leaderboard_tournament_season_memberships
  set
    voided_at = clock_timestamp(),
    voided_by_clerk_user_id = v_actor,
    void_reason = v_reason
  where tournament_id = p_tournament_id
    and voided_at is null;

  delete from public.leaderboard_point_events as event
  where event.source in ('system', 'recalculation')
    and (
      event.tournament_id = p_tournament_id
      or event.tournament_bracket_id in (
        select bracket.id
        from public.tournament_brackets as bracket
        where bracket.tournament_id = p_tournament_id
      )
      or event.registration_id in (
        select registration.id
        from public.registrations as registration
        where registration.tournament_id = p_tournament_id
      )
    );

  if v_membership.season_id is not null then
    perform public.award_leaderboard_late_entry_bonuses(
      p_tournament_id,
      v_actor
    );

    insert into pg_temp.tournament_void_affected_seasons (season_id)
    select affected.season_id
    from pg_temp.leaderboard_late_entry_affected_seasons as affected
    on conflict (season_id) do nothing;
  end if;

  for v_affected_season in
    select affected.season_id
    from pg_temp.tournament_void_affected_seasons as affected
    order by affected.season_id
  loop
    v_season_run_id := public.recalculate_leaderboard_for_season(
      v_affected_season.season_id,
      v_actor
    );

    select run.status, run.notes
    into v_season_run_status, v_season_run_notes
    from public.leaderboard_recalculation_runs as run
    where run.id = v_season_run_id;

    if v_season_run_status is distinct from 'completed' then
      raise exception 'Void leaderboard reconciliation failed: %',
        coalesce(
          nullif(v_season_run_notes, ''),
          v_season_run_status,
          'unknown'
        );
    end if;
  end loop;

  if v_membership.season_id is not null
    and v_season.finalized_at is null
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = v_membership.season_id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) < 6
    and not exists (
      select 1
      from public.leaderboard_seasons as other_season
      where other_season.is_active
        and other_season.id <> v_membership.season_id
    ) then
    update public.leaderboard_seasons
    set is_active = true
    where id = v_membership.season_id
      and finalized_at is null;
  end if;

  return pg_catalog.jsonb_build_object('outcome', 'voided');
end;
$$;

alter function public.void_tournament(uuid, text, text)
  owner to postgres;
revoke all on function public.void_tournament(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.void_tournament(uuid, text, text)
  to service_role;

comment on function public.void_tournament(uuid, text, text) is
  'Single service-role Void authority for evidence-free unlaunched events and launched-event scoring recovery under the established root lock.';

commit;
