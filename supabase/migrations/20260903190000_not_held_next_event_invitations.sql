begin;

-- A Division invitation is an administrative bridge from one preserved Not
-- Held registration to one explicit future Division. It is not registration
-- authority: acceptance records the player's decision and the existing
-- submit_verified_player_registration authority remains the only writer of a
-- new registration.
create table public.tournament_division_invitations (
  id uuid primary key default gen_random_uuid(),
  source_registration_id uuid not null
    references public.registrations(id) on delete cascade,
  source_tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  target_tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  recipient_player_id uuid not null
    references public.players(id) on delete cascade,
  created_by_clerk_user_id text not null
    check (
      created_by_clerk_user_id = pg_catalog.btrim(created_by_clerk_user_id)
      and created_by_clerk_user_id <> ''
      and pg_catalog.char_length(created_by_clerk_user_id) <= 256
    ),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'invalidated')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  accepted_at timestamptz,
  declined_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text
    check (
      invalidation_reason is null
      or invalidation_reason in (
        'account_closed',
        'already_registered',
        'target_division_launched',
        'target_division_not_held',
        'target_event_terminal',
        'target_registration_unavailable'
      )
    ),
  check (source_tournament_bracket_id <> target_tournament_bracket_id),
  check (
    (status = 'pending'
      and accepted_at is null
      and declined_at is null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'accepted'
      and accepted_at is not null
      and declined_at is null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'declined'
      and accepted_at is null
      and declined_at is not null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'invalidated'
      and accepted_at is null
      and declined_at is null
      and invalidated_at is not null
      and invalidation_reason is not null)
  )
);

create unique index tournament_division_invitations_one_pending_target_idx
  on public.tournament_division_invitations(
    recipient_player_id,
    target_tournament_bracket_id
  )
  where status = 'pending';

create index tournament_division_invitations_source_idx
  on public.tournament_division_invitations(
    source_tournament_bracket_id,
    created_at desc,
    id
  );

create index tournament_division_invitations_recipient_idx
  on public.tournament_division_invitations(
    recipient_player_id,
    status,
    created_at desc,
    id
  );

alter table public.tournament_division_invitations enable row level security;
alter table public.tournament_division_invitations force row level security;
alter table public.tournament_division_invitations owner to postgres;

revoke all on table public.tournament_division_invitations
  from public, anon, authenticated, service_role;
grant select on table public.tournament_division_invitations to service_role;

-- One subordinate invalidation helper is shared by lifecycle triggers and
-- read-time reconciliation. The latter makes time-window closure durable
-- without a new scheduler, queue, or worker.
create function public.reconcile_tournament_division_invitations(
  p_target_tournament_id uuid default null,
  p_target_tournament_bracket_id uuid default null,
  p_recipient_player_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invalidated integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Division invitation reconciliation requires the trusted server boundary'
      using errcode = '42501';
  end if;

  update public.tournament_division_invitations as invitation
  set
    status = 'invalidated',
    invalidated_at = v_now,
    invalidation_reason = case
      when player.id is null or player.account_closed_at is not null
        then 'account_closed'
      when exists (
        select 1
        from public.registrations as registration
        where registration.tournament_id = target_tournament.id
          and (
            registration.profile_id = invitation.recipient_player_id
            or registration.clerk_user_id = player.clerk_user_id
          )
      ) then 'already_registered'
      when target_bracket.launched_at is not null
        then 'target_division_launched'
      when exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id =
          invitation.target_tournament_bracket_id
      ) then 'target_division_not_held'
      when target_tournament.status in ('completed', 'cancelled', 'voided')
        or target_tournament.terminal_at is not null
        then 'target_event_terminal'
      else 'target_registration_unavailable'
    end
  from
    public.tournament_brackets as target_bracket,
    public.tournaments as target_tournament,
    public.players as player
  where invitation.status = 'pending'
    and target_bracket.id = invitation.target_tournament_bracket_id
    and target_tournament.id = target_bracket.tournament_id
    and player.id = invitation.recipient_player_id
    and (
      p_target_tournament_id is null
      or target_tournament.id = p_target_tournament_id
    )
    and (
      p_target_tournament_bracket_id is null
      or target_bracket.id = p_target_tournament_bracket_id
    )
    and (
      p_recipient_player_id is null
      or invitation.recipient_player_id = p_recipient_player_id
    )
    and (
      player.id is null
      or player.account_closed_at is not null
      or target_bracket.launched_at is not null
      or exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = target_bracket.id
      )
      or target_tournament.status not in ('registration_open', 'in_progress')
      or target_tournament.terminal_at is not null
      or target_tournament.registration_enabled is distinct from true
      or (
        target_tournament.registration_open_at is not null
        and v_now < target_tournament.registration_open_at
      )
      or (
        target_tournament.registration_close_at is not null
        and v_now > target_tournament.registration_close_at
      )
      or exists (
        select 1
        from public.registrations as registration
        where registration.tournament_id = target_tournament.id
          and (
            registration.profile_id = invitation.recipient_player_id
            or registration.clerk_user_id = player.clerk_user_id
          )
      )
    );

  get diagnostics v_invalidated = row_count;
  return v_invalidated;
end;
$$;

alter function public.reconcile_tournament_division_invitations(uuid, uuid, uuid)
  owner to postgres;
revoke all on function public.reconcile_tournament_division_invitations(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_tournament_division_invitations(
  uuid, uuid, uuid
) to service_role;

create function public.create_tournament_division_invitation(
  p_source_registration_id uuid,
  p_target_tournament_bracket_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source_registration public.registrations%rowtype;
  v_recipient public.players%rowtype;
  v_source_bracket_name text;
  v_target_tournament_id uuid;
  v_target_tournament_title text;
  v_target_tournament_status text;
  v_target_terminal_at timestamptz;
  v_target_registration_enabled boolean;
  v_target_registration_open_at timestamptz;
  v_target_registration_close_at timestamptz;
  v_target_bracket_name text;
  v_target_launched_at timestamptz;
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_invitation_id uuid;
  v_created_at timestamptz;
  v_already_pending boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Division invitation creation requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if p_source_registration_id is null
    or p_target_tournament_bracket_id is null
    or v_actor is null
    or pg_catalog.char_length(v_actor) > 256 then
    raise exception 'Division invitation input is invalid'
      using errcode = '22023';
  end if;

  select registration.*
  into v_source_registration
  from public.registrations as registration
  where registration.id = p_source_registration_id
  for update;

  if not found
    or v_source_registration.profile_id is null
    or v_source_registration.tournament_bracket_id is null then
    raise exception 'Source registration is unavailable'
      using errcode = '55000';
  end if;

  if v_source_registration.registration_status not in (
    'pending', 'manual_review', 'approved', 'waitlisted'
  ) then
    raise exception 'Source registration is not invitation eligible'
      using errcode = '55000';
  end if;

  select player.*
  into v_recipient
  from public.players as player
  where player.id = v_source_registration.profile_id
  for update;

  if not found
    or v_recipient.account_closed_at is not null
    or v_recipient.clerk_user_id is distinct from
      v_source_registration.clerk_user_id
    or v_recipient.clerk_user_id like 'deleted:%' then
    raise exception 'Invitation recipient is unavailable'
      using errcode = '55000';
  end if;

  select source_bracket.name
  into v_source_bracket_name
  from public.tournament_brackets as source_bracket
  join public.tournament_division_not_held_closures as closure
    on closure.tournament_bracket_id = source_bracket.id
  where source_bracket.id = v_source_registration.tournament_bracket_id
  for update of source_bracket;

  if not found then
    raise exception 'Source registration must belong to a Not Held Division'
      using errcode = '55000';
  end if;

  select
    target_tournament.id,
    target_tournament.title,
    target_tournament.status,
    target_tournament.terminal_at,
    target_tournament.registration_enabled,
    target_tournament.registration_open_at,
    target_tournament.registration_close_at,
    target_bracket.name,
    target_bracket.launched_at
  into
    v_target_tournament_id,
    v_target_tournament_title,
    v_target_tournament_status,
    v_target_terminal_at,
    v_target_registration_enabled,
    v_target_registration_open_at,
    v_target_registration_close_at,
    v_target_bracket_name,
    v_target_launched_at
  from public.tournament_brackets as target_bracket
  join public.tournaments as target_tournament
    on target_tournament.id = target_bracket.tournament_id
  where target_bracket.id = p_target_tournament_bracket_id
  for update of target_tournament, target_bracket;

  if not found then
    raise exception 'Target Division is unavailable'
      using errcode = '55000';
  end if;

  if p_target_tournament_bracket_id =
      v_source_registration.tournament_bracket_id
    or v_target_bracket_name is distinct from v_source_bracket_name then
    raise exception 'Invitation target must be an explicit matching Division'
      using errcode = '55000';
  end if;

  if v_target_tournament_status not in ('registration_open', 'in_progress')
    or v_target_terminal_at is not null
    or v_target_registration_enabled is distinct from true
    or v_target_launched_at is not null
    or (
      v_target_registration_open_at is not null
      and v_now < v_target_registration_open_at
    )
    or (
      v_target_registration_close_at is not null
      and v_now > v_target_registration_close_at
    )
    or exists (
      select 1
      from public.tournament_division_not_held_closures as closure
      where closure.tournament_bracket_id = p_target_tournament_bracket_id
    ) then
    raise exception 'Target Division is not accepting registration'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.registrations as registration
    where registration.tournament_id = v_target_tournament_id
      and (
        registration.profile_id = v_recipient.id
        or registration.clerk_user_id = v_recipient.clerk_user_id
      )
  ) then
    raise exception 'Player already has a registration in the target event'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.tournament_brackets as competing_bracket
    join public.tournaments as competing_tournament
      on competing_tournament.id = competing_bracket.tournament_id
    where competing_bracket.name = v_target_bracket_name
      and competing_bracket.id <> p_target_tournament_bracket_id
      and competing_tournament.status not in ('completed', 'cancelled', 'voided')
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = competing_bracket.id
      )
      and (
        competing_bracket.launched_at is null
        or not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = competing_bracket.id
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = competing_bracket.id
            and public.is_generated_bracket_complete(generated.id)
              is distinct from true
        )
      )
  ) then
    raise exception 'The matching Division has another unresolved ranked cycle'
      using errcode = '55000';
  end if;

  insert into public.tournament_division_invitations as invitation (
    source_registration_id,
    source_tournament_bracket_id,
    target_tournament_bracket_id,
    recipient_player_id,
    created_by_clerk_user_id
  )
  values (
    v_source_registration.id,
    v_source_registration.tournament_bracket_id,
    p_target_tournament_bracket_id,
    v_recipient.id,
    v_actor
  )
  on conflict (recipient_player_id, target_tournament_bracket_id)
    where status = 'pending'
    do nothing
  returning invitation.id, invitation.created_at
  into v_invitation_id, v_created_at;

  if not found then
    select invitation.id, invitation.created_at
    into v_invitation_id, v_created_at
    from public.tournament_division_invitations as invitation
    where invitation.recipient_player_id = v_recipient.id
      and invitation.target_tournament_bracket_id =
        p_target_tournament_bracket_id
      and invitation.status = 'pending'
    for update;
    v_already_pending := true;
  end if;

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    actor_clerk_user_id,
    tournament_id,
    tournament_title,
    registration_id,
    event_key,
    metadata
  )
  values (
    v_recipient.clerk_user_id,
    'player',
    'tournament.division_invitation',
    'Tournament Division Invitation',
    pg_catalog.format(
      'You are invited to register for the %s Division of %s. Accepting opens the normal registration flow, where current eligibility and capacity are checked.',
      v_target_bracket_name,
      v_target_tournament_title
    ),
    v_actor,
    v_target_tournament_id,
    v_target_tournament_title,
    v_source_registration.id,
    pg_catalog.format('division-invitation:%s', v_invitation_id),
    pg_catalog.jsonb_build_object(
      'invitationId', v_invitation_id,
      'sourceRegistrationId', v_source_registration.id,
      'sourceBracketId', v_source_registration.tournament_bracket_id,
      'targetBracketId', p_target_tournament_bracket_id,
      'targetTournamentId', v_target_tournament_id,
      'bracketName', v_target_bracket_name
    )
  )
  on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null
    do nothing;

  return pg_catalog.jsonb_build_object(
    'invitationId', v_invitation_id,
    'sourceRegistrationId', v_source_registration.id,
    'sourceTournamentBracketId',
      v_source_registration.tournament_bracket_id,
    'targetTournamentId', v_target_tournament_id,
    'targetTournamentBracketId', p_target_tournament_bracket_id,
    'status', 'pending',
    'createdAt', v_created_at,
    'alreadyPending', v_already_pending
  );
end;
$$;

alter function public.create_tournament_division_invitation(uuid, uuid, text)
  owner to postgres;
revoke all on function public.create_tournament_division_invitation(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_tournament_division_invitation(
  uuid, uuid, text
) to service_role;

create function public.respond_to_tournament_division_invitation(
  p_invitation_id uuid,
  p_recipient_clerk_user_id text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invitation public.tournament_division_invitations%rowtype;
  v_recipient public.players%rowtype;
  v_target_tournament_id uuid;
  v_target_tournament_bracket_id uuid;
  v_target_tournament_slug text;
  v_response text := pg_catalog.lower(coalesce(pg_catalog.btrim(p_response), ''));
  v_actor text := nullif(pg_catalog.btrim(p_recipient_clerk_user_id), '');
  v_resolved_at timestamptz;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Division invitation response requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if p_invitation_id is null
    or v_actor is null
    or pg_catalog.char_length(v_actor) > 256
    or v_response not in ('accept', 'decline') then
    raise exception 'Division invitation response is invalid'
      using errcode = '22023';
  end if;

  select invitation.*
  into v_invitation
  from public.tournament_division_invitations as invitation
  where invitation.id = p_invitation_id;

  if not found then
    raise exception 'Division invitation is unavailable'
      using errcode = 'P0002';
  end if;

  v_target_tournament_bracket_id :=
    v_invitation.target_tournament_bracket_id;

  select player.*
  into v_recipient
  from public.players as player
  where player.id = v_invitation.recipient_player_id
    and player.clerk_user_id = v_actor
    and player.account_closed_at is null
  for update;

  if not found then
    raise exception 'Division invitation is unavailable'
      using errcode = '42501';
  end if;

  select tournament.id, tournament.slug
  into v_target_tournament_id, v_target_tournament_slug
  from public.tournament_brackets as bracket
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where bracket.id = v_target_tournament_bracket_id
  for update of tournament, bracket;

  if not found then
    raise exception 'Division invitation is unavailable'
      using errcode = 'P0002';
  end if;

  -- Lifecycle writers lock the target before invalidating invitations, while
  -- account closure locks the recipient first. Follow that established order
  -- before taking the invitation lock so response cannot deadlock either path.
  select invitation.*
  into v_invitation
  from public.tournament_division_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.recipient_player_id = v_recipient.id
    and invitation.target_tournament_bracket_id =
      v_target_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Division invitation is unavailable'
      using errcode = 'P0002';
  end if;

  perform public.reconcile_tournament_division_invitations(
    v_target_tournament_id,
    v_target_tournament_bracket_id,
    v_invitation.recipient_player_id
  );

  select invitation.*
  into v_invitation
  from public.tournament_division_invitations as invitation
  where invitation.id = p_invitation_id;

  if v_invitation.status = 'invalidated' then
    return pg_catalog.jsonb_build_object(
      'invitationId', v_invitation.id,
      'status', v_invitation.status,
      'invalidationReason', v_invitation.invalidation_reason,
      'targetTournamentId', v_target_tournament_id,
      'targetTournamentSlug', v_target_tournament_slug,
      'targetTournamentBracketId',
        v_invitation.target_tournament_bracket_id
    );
  end if;

  if (v_response = 'accept' and v_invitation.status = 'accepted')
    or (v_response = 'decline' and v_invitation.status = 'declined') then
    return pg_catalog.jsonb_build_object(
      'invitationId', v_invitation.id,
      'status', v_invitation.status,
      'targetTournamentId', v_target_tournament_id,
      'targetTournamentSlug', v_target_tournament_slug,
      'targetTournamentBracketId',
        v_invitation.target_tournament_bracket_id
    );
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Division invitation has already been resolved'
      using errcode = '55000';
  end if;

  v_resolved_at := pg_catalog.clock_timestamp();
  update public.tournament_division_invitations as invitation
  set
    status = case when v_response = 'accept' then 'accepted' else 'declined' end,
    accepted_at = case when v_response = 'accept' then v_resolved_at else null end,
    declined_at = case when v_response = 'decline' then v_resolved_at else null end
  where invitation.id = p_invitation_id
  returning invitation.* into v_invitation;

  return pg_catalog.jsonb_build_object(
    'invitationId', v_invitation.id,
    'status', v_invitation.status,
    'targetTournamentId', v_target_tournament_id,
    'targetTournamentSlug', v_target_tournament_slug,
    'targetTournamentBracketId', v_invitation.target_tournament_bracket_id
  );
end;
$$;

alter function public.respond_to_tournament_division_invitation(uuid, text, text)
  owner to postgres;
revoke all on function public.respond_to_tournament_division_invitation(
  uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.respond_to_tournament_division_invitation(
  uuid, text, text
) to service_role;

create function public.sync_tournament_division_invitation_availability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_table_name = 'tournaments' then
    perform public.reconcile_tournament_division_invitations(new.id, null, null);
  elsif tg_table_name = 'tournament_brackets' then
    perform public.reconcile_tournament_division_invitations(
      new.tournament_id,
      new.id,
      null
    );
  elsif tg_table_name = 'tournament_division_not_held_closures' then
    perform public.reconcile_tournament_division_invitations(
      null,
      new.tournament_bracket_id,
      null
    );
  elsif tg_table_name = 'registrations' then
    perform public.reconcile_tournament_division_invitations(
      new.tournament_id,
      null,
      new.profile_id
    );
  elsif tg_table_name = 'players' then
    if old.clerk_user_id is distinct from new.clerk_user_id then
      update public.tournament_division_invitations as invitation
      set created_by_clerk_user_id = new.clerk_user_id
      where invitation.created_by_clerk_user_id = old.clerk_user_id;
    end if;
    perform public.reconcile_tournament_division_invitations(
      null,
      null,
      new.id
    );
  end if;

  return new;
end;
$$;

alter function public.sync_tournament_division_invitation_availability()
  owner to postgres;
revoke all on function public.sync_tournament_division_invitation_availability()
  from public, anon, authenticated, service_role;

create trigger tournaments_sync_division_invitation_availability
after update of
  status,
  terminal_at,
  registration_enabled,
  registration_open_at,
  registration_close_at
on public.tournaments
for each row
execute function public.sync_tournament_division_invitation_availability();

create trigger tournament_brackets_sync_division_invitation_availability
after update of launched_at on public.tournament_brackets
for each row
when (old.launched_at is distinct from new.launched_at)
execute function public.sync_tournament_division_invitation_availability();

create trigger not_held_sync_division_invitation_availability
after insert on public.tournament_division_not_held_closures
for each row
execute function public.sync_tournament_division_invitation_availability();

create trigger registrations_sync_division_invitation_availability
after insert or update of tournament_id, tournament_bracket_id, profile_id
on public.registrations
for each row
execute function public.sync_tournament_division_invitation_availability();

create trigger players_sync_division_invitation_availability
after update of clerk_user_id, account_closed_at on public.players
for each row
when (
  old.clerk_user_id is distinct from new.clerk_user_id
  or old.account_closed_at is distinct from new.account_closed_at
)
execute function public.sync_tournament_division_invitation_availability();

comment on table public.tournament_division_invitations is
  'Durable optional invitation from one preserved Not Held registration to one explicit matching future Division. It never creates a registration.';
comment on function public.create_tournament_division_invitation(uuid, uuid, text) is
  'Single service-role invitation creation authority. Requires a legitimate Not Held source and an explicit matching open target, then emits one canonical notification.';
comment on function public.respond_to_tournament_division_invitation(uuid, text, text) is
  'Records an authenticated recipient accept/decline decision only. Acceptance returns the explicit target for the existing normal registration flow and never inserts a registration.';
comment on function public.reconcile_tournament_division_invitations(uuid, uuid, uuid) is
  'Subordinate idempotent invalidation helper used by lifecycle triggers and read-time reconciliation; it creates no queue, worker, registration, points, season, or Badge facts.';

commit;
