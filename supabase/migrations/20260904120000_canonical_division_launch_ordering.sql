begin;

-- Release blocker A: publish the canonical Event state before launched_at
-- causes the existing registration-summary trigger to update that Event.
-- Previously, the trigger observed a launched Division in registration_open
-- and correctly rejected that invalid intermediate state.
--
-- Move the existing Event UPDATE, without changing its contents or guards.
-- The existing registration-enabled BEFORE trigger preserves availability
-- while the target remains unlaunched. The Division AFTER trigger then closes
-- it when the final open Division launches. Mixed Events retain their flag.
-- Map validation in the outer RPC still rolls the entire transaction back.
-- No trigger, authorization boundary, or alternate lifecycle writer is added.

create or replace function public.launch_tournament_division_without_matchup_activation(
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
  v_tournament_id uuid;
  v_tournament_title text;
  v_bracket_name text;
  v_existing_launched_at timestamptz;
  v_max_players integer;
  v_required_count integer;
  v_approved_count integer;
  v_unresolved_count integer;
  v_generated_bracket_id uuid;
  v_slot_count integer;
  v_participant_count integer;
  v_assigned_count integer;
  v_launch_at timestamptz;
  v_waitlisted record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_actor_clerk_user_id is null
    or btrim(p_actor_clerk_user_id) = '' then
    raise exception 'Launching administrator is required';
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  select tournament.title
  into v_tournament_title
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for no key update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  select
    bracket.name,
    bracket.launched_at,
    bracket.max_players
  into
    v_bracket_name,
    v_existing_launched_at,
    v_max_players
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
    and bracket.tournament_id = v_tournament_id
  for update;

  if not found then
    raise exception 'Tournament division not found';
  end if;

  if v_existing_launched_at is not null then
    tournament_id := v_tournament_id;
    tournament_bracket_id := p_tournament_bracket_id;
    launched_at := v_existing_launched_at;
    already_launched := true;
    return next;
    return;
  end if;

  v_required_count := least(v_max_players, 8);

  select
    count(*) filter (
      where registration.registration_status = 'approved'
    )::integer,
    count(*) filter (
      where registration.registration_status in (
        'pending',
        'manual_review'
      )
        or (
          registration.registration_status = 'waitlisted'
          and registration.waitlist_offer_status = 'offered'
        )
    )::integer
  into v_approved_count, v_unresolved_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id;

  if v_approved_count <> v_required_count or v_unresolved_count <> 0 then
    raise exception
      'Division launch requires exactly % approved players and no unresolved vacancy',
      v_required_count;
  end if;

  select
    generated.id,
    generated.slot_count,
    generated.participant_count
  into
    v_generated_bracket_id,
    v_slot_count,
    v_participant_count
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id
  for update;

  if not found
    or v_slot_count <> v_required_count
    or v_participant_count <> v_required_count
    or public.is_generated_bracket_populated(v_generated_bracket_id)
      is distinct from true then
    raise exception
      'Division launch requires a complete private bracket with % populated seeds',
      v_required_count;
  end if;

  select count(distinct assigned.registration_id)::integer
  into v_assigned_count
  from (
    select match.player_one_registration_id as registration_id
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and match.player_one_slot is not null
      and match.player_one_registration_id is not null
    union
    select match.player_two_registration_id
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and match.player_two_slot is not null
      and match.player_two_registration_id is not null
  ) as assigned;

  if v_assigned_count <> v_required_count
    or exists (
      (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id =
          p_tournament_bracket_id
          and registration.registration_status = 'approved'
      )
      except
      (
        select match.player_one_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_one_slot is not null
          and match.player_one_registration_id is not null
        union
        select match.player_two_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_two_slot is not null
          and match.player_two_registration_id is not null
      )
    )
    or exists (
      (
        select match.player_one_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_one_slot is not null
          and match.player_one_registration_id is not null
        union
        select match.player_two_registration_id
        from public.tournament_matches as match
        where match.generated_bracket_id = v_generated_bracket_id
          and match.player_two_slot is not null
          and match.player_two_registration_id is not null
      )
      except
      (
        select registration.id
        from public.registrations as registration
        where registration.tournament_bracket_id =
          p_tournament_bracket_id
          and registration.registration_status = 'approved'
      )
    ) then
    raise exception
      'Bracket assignments must exactly match the approved division roster';
  end if;

  if exists (
    select 1
    from public.tournament_matches as match
    where match.generated_bracket_id = v_generated_bracket_id
      and (
        match.status <> 'scheduled'
        or match.player_one_score is not null
        or match.player_two_score is not null
        or match.winner_registration_id is not null
        or match.official_result_submission_id is not null
        or match.official_result_decided_by is not null
        or match.official_result_decided_at is not null
      )
  )
    or exists (
      select 1
      from public.match_result_submissions as submission
      join public.tournament_matches as match
        on match.id = submission.match_id
      where match.generated_bracket_id = v_generated_bracket_id
    )
    or exists (
      select 1
      from public.match_result_report_groups as report_group
      join public.tournament_matches as match
        on match.id = report_group.match_id
      where match.generated_bracket_id = v_generated_bracket_id
    ) then
    raise exception 'Pre-launch result activity blocks division launch';
  end if;

  v_launch_at := clock_timestamp();
  perform set_config(
    'ironclad.explicit_division_launch',
    'on',
    true
  );

  update public.tournaments
  set
    status = 'in_progress',
    registration_enabled = case
      when exists (
        select 1
        from public.tournament_brackets as other_bracket
        where other_bracket.tournament_id = v_tournament_id
          and other_bracket.launched_at is null
      ) then registration_enabled
      else false
    end
  where id = v_tournament_id;

  update public.tournament_brackets as bracket
  set launched_at = v_launch_at
  where bracket.id = p_tournament_bracket_id
    and bracket.launched_at is null;

  update public.generated_brackets
  set competition_locked_at = coalesce(
    competition_locked_at,
    v_launch_at
  )
  where id = v_generated_bracket_id;

  for v_waitlisted in
    select
      registration.id,
      registration.clerk_user_id,
      registration.waitlist_offer_status
    from public.registrations as registration
    where registration.tournament_bracket_id = p_tournament_bracket_id
      and registration.registration_status = 'waitlisted'
      and (
        registration.waitlist_offer_status is null
        or registration.waitlist_offer_status = 'offered'
      )
    order by registration.created_at, registration.id
    for update
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
      metadata
    )
    values (
      v_waitlisted.clerk_user_id,
      'player',
      'registration.waitlist_closed',
      'Tournament waitlist closed',
      'This tournament division has now started, and no place became available. Thank you for joining the waitlist. We hope to see you in the next IronClad tournament.',
      v_tournament_id,
      v_tournament_title,
      v_waitlisted.id,
      jsonb_build_object(
        'registrationId', v_waitlisted.id,
        'tournamentId', v_tournament_id,
        'bracketId', p_tournament_bracket_id,
        'bracketName', v_bracket_name,
        'launchedAt', v_launch_at
      )
    );

    if v_waitlisted.waitlist_offer_status = 'offered' then
      update public.registrations
      set
        waitlist_offer_status = 'cancelled',
        waitlist_offer_resolved_at = v_launch_at
      where id = v_waitlisted.id
        and registration_status = 'waitlisted'
        and waitlist_offer_status = 'offered';
    end if;
  end loop;

  tournament_id := v_tournament_id;
  tournament_bracket_id := p_tournament_bracket_id;
  launched_at := v_launch_at;
  already_launched := false;
  return next;
end;
$$;

alter function public.launch_tournament_division_without_matchup_activation(uuid, text)
  owner to postgres;
revoke all on function public.launch_tournament_division_without_matchup_activation(uuid, text)
  from public, anon, authenticated, service_role;

commit;

