begin;

-- NULLIF and COALESCE are SQL expressions, not schema-qualified functions.
-- Replace only the Stage A trigger body after hosted Staging runtime validation
-- caught the invalid pg_catalog.nullif(...) call.
create or replace function
  public.sync_match_confirmation_required_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_recipient_clerk_user_id text;
  v_recipient_registration_id uuid;
  v_submitter_name text;
  v_tournament_title text;
  v_match_number integer;
  v_round_name text;
  v_event_key text;
begin
  if new.result_type is distinct from 'normal' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_confirmation'
      or new.finalized_at is not null then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from 'pending_confirmation'
      or (
        new.status is not distinct from 'pending_confirmation'
        and new.finalized_at is null
      ) then
      return new;
    end if;
  else
    return new;
  end if;

  select
    opponent.clerk_user_id,
    opponent.id,
    coalesce(
      nullif(pg_catalog.btrim(submitter.player_name), ''),
      'A player'
    ),
    tournament.title,
    match.match_number,
    round.name
  into
    v_recipient_clerk_user_id,
    v_recipient_registration_id,
    v_submitter_name,
    v_tournament_title,
    v_match_number,
    v_round_name
  from public.tournament_matches as match
  join public.generated_brackets as generated
    on generated.id = match.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  join public.bracket_rounds as round
    on round.id = match.round_id
    and round.generated_bracket_id = generated.id
  join public.registrations as submitter
    on submitter.id = new.submitted_by_registration_id
  join public.registrations as opponent
    on opponent.id = new.opponent_registration_id
  where match.id = new.match_id
    and tournament.id = new.tournament_id
    and submitter.id in (
      match.player_one_registration_id,
      match.player_two_registration_id
    )
    and opponent.id in (
      match.player_one_registration_id,
      match.player_two_registration_id
    )
    and submitter.id <> opponent.id;

  if not found then
    raise exception 'Match confirmation notification context is invalid';
  end if;

  if nullif(
      pg_catalog.btrim(v_recipient_clerk_user_id),
      ''
    ) is null
    or v_recipient_clerk_user_id like 'deleted:%'
    or v_recipient_clerk_user_id = new.submitted_by_clerk_user_id then
    return new;
  end if;

  v_event_key := pg_catalog.format(
    'match:%s:report-group:%s:confirmation-required',
    new.match_id,
    new.id
  );

  if tg_op = 'INSERT' then
    insert into public.notifications (
      recipient_clerk_user_id,
      recipient_role,
      type,
      title,
      message,
      actor_clerk_user_id,
      actor_display_name,
      tournament_id,
      tournament_title,
      registration_id,
      match_id,
      report_group_id,
      event_key,
      metadata
    ) values (
      v_recipient_clerk_user_id,
      'player',
      'match.confirmation_required',
      'Match result needs confirmation',
      pg_catalog.format(
        'A result was submitted for Match #%s. Confirm or dispute it before the deadline.',
        v_match_number
      ),
      new.submitted_by_clerk_user_id,
      v_submitter_name,
      new.tournament_id,
      v_tournament_title,
      v_recipient_registration_id,
      new.match_id,
      new.id,
      v_event_key,
      pg_catalog.jsonb_build_object(
        'deadlineAt', new.confirmation_deadline_at,
        'matchNumber', v_match_number,
        'reportedScore', pg_catalog.format(
          '%s-%s',
          new.player_one_score,
          new.player_two_score
        ),
        'resultType', 'normal',
        'roundName', v_round_name
      )
    )
    on conflict (recipient_clerk_user_id, event_key)
      where event_key is not null
    do nothing;
  else
    update public.notifications as notification
    set read_at = coalesce(
      notification.read_at,
      pg_catalog.clock_timestamp()
    )
    where notification.recipient_clerk_user_id =
        v_recipient_clerk_user_id
      and notification.type = 'match.confirmation_required'
      and notification.match_id = new.match_id
      and notification.report_group_id = new.id
      and notification.event_key = v_event_key;
  end if;

  return new;
end;
$$;

alter function public.sync_match_confirmation_required_notification()
  owner to postgres;
revoke all on function
  public.sync_match_confirmation_required_notification()
from public, anon, authenticated, service_role;

commit;
