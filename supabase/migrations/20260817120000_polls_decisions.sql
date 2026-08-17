begin;

create table public.polls (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  purpose text not null check (
    purpose in ('tournament_decision', 'community_feedback')
  ),
  audience_kind text not null check (
    audience_kind in (
      'tournament_approved',
      'tournament_division_approved',
      'selected_tournament_players',
      'active_players',
      'selected_active_players'
    )
  ),
  tournament_id uuid
    references public.tournaments(id) on delete cascade,
  tournament_bracket_id uuid
    references public.tournament_brackets(id) on delete cascade,
  question text not null check (
    nullif(pg_catalog.btrim(question), '') is not null
    and char_length(question) <= 160
  ),
  context text check (
    context is null or (
      nullif(pg_catalog.btrim(context), '') is not null
      and char_length(context) <= 1000
    )
  ),
  option_source text not null check (option_source in ('text', 'coh3_map')),
  max_selections smallint not null check (max_selections between 1 and 5),
  winner_count smallint not null check (
    winner_count between 1 and 5
    and winner_count <= max_selections
  ),
  authority text not null check (authority in ('advisory', 'binding')),
  result_visibility text not null check (
    result_visibility in ('live', 'after_close')
  ),
  public_final_totals boolean not null default false,
  draft_audience_invalidated boolean not null default false,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or (
      nullif(pg_catalog.btrim(cancellation_reason), '') is not null
      and char_length(cancellation_reason) <= 500
    )
  ),
  final_decision_basis text check (
    final_decision_basis is null or final_decision_basis in (
      'advisory_poll_result',
      'advisory_admin_override',
      'binding_computed',
      'binding_cutoff_tiebreak'
    )
  ),
  final_rationale text check (
    final_rationale is null or (
      nullif(pg_catalog.btrim(final_rationale), '') is not null
      and char_length(final_rationale) <= 1000
    )
  ),
  binding_tie_rule_used boolean not null default false,
  final_decision_published_at timestamptz,
  created_by_clerk_user_id text not null check (
    nullif(pg_catalog.btrim(created_by_clerk_user_id), '') is not null
  ),
  updated_by_clerk_user_id text not null check (
    nullif(pg_catalog.btrim(updated_by_clerk_user_id), '') is not null
  ),
  published_by_clerk_user_id text,
  cancelled_by_clerk_user_id text,
  final_decision_published_by_clerk_user_id text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint polls_duration_check check (
    closes_at >= opens_at + interval '15 minutes'
    and closes_at <= opens_at + interval '30 days'
  ),
  constraint polls_purpose_audience_check check (
    (
      purpose = 'tournament_decision'
      and tournament_id is not null
      and audience_kind in (
        'tournament_approved',
        'tournament_division_approved',
        'selected_tournament_players'
      )
      and (
        (audience_kind = 'tournament_division_approved'
          and tournament_bracket_id is not null)
        or
        (audience_kind <> 'tournament_division_approved'
          and tournament_bracket_id is null)
      )
    )
    or
    (
      purpose = 'community_feedback'
      and audience_kind in (
        'active_players',
        'selected_active_players'
      )
      and tournament_id is null
      and tournament_bracket_id is null
      and authority = 'advisory'
      and public_final_totals = false
    )
  ),
  constraint polls_cancelled_facts_check check (
    (
      cancelled_at is null
      and cancellation_reason is null
      and cancelled_by_clerk_user_id is null
    )
    or
    (
      cancelled_at is not null
      and published_at is not null
      and cancelled_at >= published_at
      and cancellation_reason is not null
      and nullif(pg_catalog.btrim(cancelled_by_clerk_user_id), '') is not null
    )
  ),
  constraint polls_final_decision_facts_check check (
    (
      final_decision_published_at is null
      and final_decision_basis is null
      and final_rationale is null
      and binding_tie_rule_used = false
      and final_decision_published_by_clerk_user_id is null
    )
    or
    (
      final_decision_published_at is not null
      and purpose = 'tournament_decision'
      and published_at is not null
      and final_decision_published_at >= closes_at
      and final_decision_published_at >= published_at
      and final_decision_basis is not null
      and nullif(
        pg_catalog.btrim(final_decision_published_by_clerk_user_id),
        ''
      ) is not null
      and cancelled_at is null
      and (
        (
          authority = 'advisory'
          and final_decision_basis in (
            'advisory_poll_result',
            'advisory_admin_override'
          )
          and binding_tie_rule_used = false
          and (
            final_decision_basis <> 'advisory_admin_override'
            or final_rationale is not null
          )
        )
        or
        (
          authority = 'binding'
          and final_decision_basis in (
            'binding_computed',
            'binding_cutoff_tiebreak'
          )
          and binding_tie_rule_used =
            (final_decision_basis = 'binding_cutoff_tiebreak')
        )
      )
    )
  ),
  constraint polls_publication_actor_check check (
    (published_at is null and published_by_clerk_user_id is null)
    or
    (
      published_at is not null
      and published_at < closes_at
      and nullif(pg_catalog.btrim(published_by_clerk_user_id), '') is not null
    )
  )
);

create table public.poll_options (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  position smallint not null check (position between 1 and 24),
  label_snapshot text not null check (
    nullif(pg_catalog.btrim(label_snapshot), '') is not null
    and char_length(label_snapshot) <= 120
  ),
  coh3_map_id uuid references public.coh3_maps(id) on delete restrict,
  map_display_name_snapshot text check (
    map_display_name_snapshot is null or (
      nullif(pg_catalog.btrim(map_display_name_snapshot), '') is not null
      and char_length(map_display_name_snapshot) <= 120
    )
  ),
  map_slug_snapshot text check (
    map_slug_snapshot is null or (
      map_slug_snapshot ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(map_slug_snapshot) <= 100
    )
  ),
  final_decision_rank smallint check (final_decision_rank between 1 and 5),
  final_decision_selected_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint poll_options_map_snapshot_check check (
    (
      coh3_map_id is null
      and map_display_name_snapshot is null
      and map_slug_snapshot is null
    )
    or
    (
      coh3_map_id is not null
      and map_display_name_snapshot is not null
      and map_slug_snapshot is not null
    )
  ),
  constraint poll_options_final_decision_check check (
    (final_decision_rank is null and final_decision_selected_at is null)
    or
    (final_decision_rank is not null and final_decision_selected_at is not null)
  ),
  constraint poll_options_poll_position_unique unique (poll_id, position),
  constraint poll_options_id_poll_unique unique (id, poll_id)
);

create unique index poll_options_poll_map_unique_idx
  on public.poll_options(poll_id, coh3_map_id)
  where coh3_map_id is not null;
create unique index poll_options_poll_label_unique_idx
  on public.poll_options(
    poll_id,
    lower(regexp_replace(pg_catalog.btrim(label_snapshot), '\s+', ' ', 'g'))
  );
create unique index poll_options_final_decision_rank_unique_idx
  on public.poll_options(poll_id, final_decision_rank)
  where final_decision_rank is not null;

create table public.poll_eligible_voters (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  eligible_at timestamptz not null default pg_catalog.clock_timestamp(),
  first_voted_at timestamptz,
  ballot_updated_at timestamptz,
  ballot_revision integer not null default 0 check (ballot_revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint poll_eligible_voters_ballot_facts_check check (
    (
      ballot_revision = 0
      and first_voted_at is null
      and ballot_updated_at is null
    )
    or
    (
      ballot_revision > 0
      and first_voted_at is not null
      and ballot_updated_at is not null
      and ballot_updated_at >= first_voted_at
    )
  ),
  constraint poll_eligible_voters_id_poll_unique unique (id, poll_id)
);

create unique index poll_eligible_voters_poll_player_unique_idx
  on public.poll_eligible_voters(poll_id, player_id)
  where player_id is not null;
create index poll_eligible_voters_player_poll_idx
  on public.poll_eligible_voters(player_id, poll_id)
  where player_id is not null;

create table public.poll_ballot_choices (
  poll_id uuid not null,
  eligible_voter_id uuid not null,
  option_id uuid not null,
  selected_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint poll_ballot_choices_primary_key
    primary key (eligible_voter_id, option_id),
  constraint poll_ballot_choices_eligibility_fk
    foreign key (eligible_voter_id, poll_id)
    references public.poll_eligible_voters(id, poll_id)
    on delete cascade,
  constraint poll_ballot_choices_option_fk
    foreign key (option_id, poll_id)
    references public.poll_options(id, poll_id)
    on delete restrict
);

create index poll_ballot_choices_poll_option_idx
  on public.poll_ballot_choices(poll_id, option_id);

alter table public.polls enable row level security;
alter table public.polls force row level security;
alter table public.poll_options enable row level security;
alter table public.poll_options force row level security;
alter table public.poll_eligible_voters enable row level security;
alter table public.poll_eligible_voters force row level security;
alter table public.poll_ballot_choices enable row level security;
alter table public.poll_ballot_choices force row level security;

revoke all on table public.polls
  from public, anon, authenticated, service_role;
revoke all on table public.poll_options
  from public, anon, authenticated, service_role;
revoke all on table public.poll_eligible_voters
  from public, anon, authenticated, service_role;
revoke all on table public.poll_ballot_choices
  from public, anon, authenticated, service_role;

create function public.guard_poll_configuration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account_closure boolean :=
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  if tg_op <> 'DELETE' and new.tournament_bracket_id is not null
    and not exists (
      select 1
      from public.tournament_brackets as bracket
      where bracket.id = new.tournament_bracket_id
        and bracket.tournament_id = new.tournament_id
    ) then
    raise exception 'Tournament Division does not belong to the poll tournament'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'Published polls cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.published_at is not null then
    if old.purpose is distinct from new.purpose
      or old.audience_kind is distinct from new.audience_kind
      or old.tournament_id is distinct from new.tournament_id
      or old.tournament_bracket_id is distinct from new.tournament_bracket_id
      or old.question is distinct from new.question
      or old.context is distinct from new.context
      or old.option_source is distinct from new.option_source
      or old.max_selections is distinct from new.max_selections
      or old.winner_count is distinct from new.winner_count
      or old.authority is distinct from new.authority
      or old.result_visibility is distinct from new.result_visibility
      or old.public_final_totals is distinct from new.public_final_totals
      or old.draft_audience_invalidated is distinct from
        new.draft_audience_invalidated
      or old.opens_at is distinct from new.opens_at
      or old.closes_at is distinct from new.closes_at
      or old.published_at is distinct from new.published_at
      or old.created_at is distinct from new.created_at
      or (
        not v_account_closure
        and (
          old.published_by_clerk_user_id is distinct from
            new.published_by_clerk_user_id
          or old.created_by_clerk_user_id is distinct from
            new.created_by_clerk_user_id
        )
      ) then
      raise exception 'Published poll configuration is immutable'
        using errcode = '55000';
    end if;

    if old.cancelled_at is not null and (
      old.cancelled_at is distinct from new.cancelled_at
      or old.cancellation_reason is distinct from new.cancellation_reason
      or (
        not v_account_closure
        and old.cancelled_by_clerk_user_id is distinct from
          new.cancelled_by_clerk_user_id
      )
    ) then
      raise exception 'Poll cancellation is immutable'
        using errcode = '55000';
    end if;

    if old.final_decision_published_at is not null and (
      old.final_decision_published_at is distinct from
        new.final_decision_published_at
      or old.final_decision_basis is distinct from new.final_decision_basis
      or old.final_rationale is distinct from new.final_rationale
      or old.binding_tie_rule_used is distinct from
        new.binding_tie_rule_used
      or (
        not v_account_closure
        and old.final_decision_published_by_clerk_user_id is distinct from
          new.final_decision_published_by_clerk_user_id
      )
    ) then
      raise exception 'Final poll decision is immutable'
        using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

alter function public.guard_poll_configuration() owner to postgres;
revoke all on function public.guard_poll_configuration()
  from public, anon, authenticated, service_role;

create trigger polls_published_configuration_guard
before insert or update or delete on public.polls
for each row execute function public.guard_poll_configuration();

create function public.guard_poll_option_configuration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll_id uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_published_at timestamptz;
  v_finalization boolean :=
    coalesce(current_setting('ironclad.poll_finalization', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  select poll.published_at
  into v_published_at
  from public.polls as poll
  where poll.id = v_poll_id;

  if v_published_at is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'UPDATE' or not v_finalization then
    raise exception 'Published poll options are immutable'
      using errcode = '55000';
  end if;

  if old.id is distinct from new.id
    or old.poll_id is distinct from new.poll_id
    or old.position is distinct from new.position
    or old.label_snapshot is distinct from new.label_snapshot
    or old.coh3_map_id is distinct from new.coh3_map_id
    or old.map_display_name_snapshot is distinct from
      new.map_display_name_snapshot
    or old.map_slug_snapshot is distinct from new.map_slug_snapshot
    or old.created_at is distinct from new.created_at then
    raise exception 'Published poll option configuration is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

alter function public.guard_poll_option_configuration() owner to postgres;
revoke all on function public.guard_poll_option_configuration()
  from public, anon, authenticated, service_role;

create trigger poll_options_published_configuration_guard
before insert or update or delete on public.poll_options
for each row execute function public.guard_poll_option_configuration();

create function public.guard_poll_eligibility_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll_id uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_published_at timestamptz;
  v_account_closure boolean :=
    coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    );
begin
  select poll.published_at
  into v_published_at
  from public.polls as poll
  where poll.id = v_poll_id;

  if v_published_at is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Published poll eligibility is immutable'
      using errcode = '55000';
  end if;

  if old.id is distinct from new.id
    or old.poll_id is distinct from new.poll_id
    or old.eligible_at is distinct from new.eligible_at
    or old.created_at is distinct from new.created_at then
    raise exception 'Published poll eligibility is immutable'
      using errcode = '55000';
  end if;

  if old.player_id is distinct from new.player_id and not (
    v_account_closure
    and old.player_id is not null
    and new.player_id is null
  ) then
    raise exception 'Published poll voter identity is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

alter function public.guard_poll_eligibility_identity() owner to postgres;
revoke all on function public.guard_poll_eligibility_identity()
  from public, anon, authenticated, service_role;

create trigger poll_eligibility_published_identity_guard
before insert or update or delete on public.poll_eligible_voters
for each row execute function public.guard_poll_eligibility_identity();

create function public.guard_poll_ballot_choice_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll_id uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_poll public.polls%rowtype;
  v_choice_count integer;
begin
  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = v_poll_id;

  if not found
    or v_poll.published_at is null
    or v_poll.cancelled_at is not null
    or pg_catalog.clock_timestamp() < v_poll.opens_at
    or pg_catalog.clock_timestamp() >= v_poll.closes_at then
    raise exception 'Poll voting is unavailable'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer + 1
    into v_choice_count
    from public.poll_ballot_choices as choice
    where choice.eligible_voter_id = new.eligible_voter_id;

    if v_choice_count > v_poll.max_selections then
      raise exception 'Ballot exceeds the poll selection limit'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_poll_ballot_choice_mutation() owner to postgres;
revoke all on function public.guard_poll_ballot_choice_mutation()
  from public, anon, authenticated, service_role;

create trigger poll_ballot_choices_open_window_guard
before insert or update or delete on public.poll_ballot_choices
for each row execute function public.guard_poll_ballot_choice_mutation();

comment on table public.polls is
  'Feature C poll configuration and immutable decision-publication facts.';
comment on table public.poll_options is
  'Ordered immutable poll option snapshots and final outcome ranks.';
comment on table public.poll_eligible_voters is
  'Publication-frozen eligibility and one current ballot revision per voter.';
comment on table public.poll_ballot_choices is
  'Private normalized current ballot choices; votes are not attributable publicly.';

create function public.assert_poll_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Poll administration requires the trusted server boundary'
      using errcode = '42501';
  end if;
end;
$$;

alter function public.assert_poll_service_role() owner to postgres;
revoke all on function public.assert_poll_service_role()
  from public, anon, authenticated, service_role;

create function public.poll_eligible_candidates(p_poll_id uuid)
returns table (
  player_id uuid,
  display_name text,
  in_game_name text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll public.polls%rowtype;
begin
  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id;

  if not found then
    return;
  end if;

  if v_poll.audience_kind = 'active_players' then
    return query
    select player.id, player.display_name, player.in_game_name
    from public.players as player
    where player.account_closed_at is null
    order by player.id;
  elsif v_poll.audience_kind = 'selected_active_players' then
    return query
    select player.id, player.display_name, player.in_game_name
    from public.poll_eligible_voters as selected
    join public.players as player on player.id = selected.player_id
    where selected.poll_id = p_poll_id
      and player.account_closed_at is null
    order by player.id;
  elsif v_poll.audience_kind = 'tournament_approved' then
    return query
    select distinct player.id, player.display_name, player.in_game_name
    from public.registrations as registration
    join public.players as player on player.id = registration.profile_id
    where registration.tournament_id = v_poll.tournament_id
      and registration.registration_status = 'approved'
      and player.account_closed_at is null
    order by player.id;
  elsif v_poll.audience_kind = 'tournament_division_approved' then
    return query
    select distinct player.id, player.display_name, player.in_game_name
    from public.registrations as registration
    join public.players as player on player.id = registration.profile_id
    where registration.tournament_id = v_poll.tournament_id
      and registration.tournament_bracket_id = v_poll.tournament_bracket_id
      and registration.registration_status = 'approved'
      and player.account_closed_at is null
    order by player.id;
  elsif v_poll.audience_kind = 'selected_tournament_players' then
    return query
    select distinct player.id, player.display_name, player.in_game_name
    from public.poll_eligible_voters as selected
    join public.players as player on player.id = selected.player_id
    join public.registrations as registration
      on registration.profile_id = player.id
      and registration.tournament_id = v_poll.tournament_id
      and registration.registration_status = 'approved'
    where selected.poll_id = p_poll_id
      and player.account_closed_at is null
    order by player.id;
  end if;
end;
$$;

alter function public.poll_eligible_candidates(uuid) owner to postgres;
revoke all on function public.poll_eligible_candidates(uuid)
  from public, anon, authenticated, service_role;

create function public.save_poll_draft(
  p_poll_id uuid,
  p_purpose text,
  p_audience_kind text,
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_question text,
  p_context text,
  p_option_source text,
  p_options jsonb,
  p_max_selections smallint,
  p_winner_count smallint,
  p_authority text,
  p_result_visibility text,
  p_public_final_totals boolean,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_selected_player_ids uuid[],
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll_id uuid := coalesce(p_poll_id, pg_catalog.gen_random_uuid());
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_question text := nullif(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_question), '\s+', ' ', 'g'),
    ''
  );
  v_context text := nullif(pg_catalog.btrim(p_context), '');
  v_option_count integer;
  v_distinct_position_count integer;
  v_selected_count integer;
  v_valid_selected_count integer;
  v_existing public.polls%rowtype;
begin
  perform public.assert_poll_service_role();

  if v_actor is null then
    raise exception 'Poll administrator is required' using errcode = '22023';
  end if;

  if p_poll_id is not null then
    select poll.*
    into v_existing
    from public.polls as poll
    where poll.id = p_poll_id
    for update;

    if not found then
      raise exception 'Poll not found';
    end if;
    if v_existing.published_at is not null then
      raise exception 'Published polls cannot be edited'
        using errcode = '55000';
    end if;
  end if;

  if p_purpose not in ('tournament_decision', 'community_feedback') then
    raise exception 'Poll purpose is invalid' using errcode = '22023';
  end if;
  if p_audience_kind not in (
    'tournament_approved',
    'tournament_division_approved',
    'selected_tournament_players',
    'active_players',
    'selected_active_players'
  ) then
    raise exception 'Poll audience is invalid' using errcode = '22023';
  end if;
  if v_question is null or char_length(v_question) > 160 then
    raise exception 'Poll question must be between 1 and 160 characters'
      using errcode = '22023';
  end if;
  if v_context is not null and char_length(v_context) > 1000 then
    raise exception 'Poll context cannot exceed 1000 characters'
      using errcode = '22023';
  end if;
  if p_option_source not in ('text', 'coh3_map') then
    raise exception 'Poll option source is invalid' using errcode = '22023';
  end if;
  if p_max_selections not between 1 and 5
    or p_winner_count not between 1 and 5
    or p_winner_count > p_max_selections then
    raise exception 'Poll selection and winner limits are invalid'
      using errcode = '22023';
  end if;
  if p_result_visibility not in ('live', 'after_close') then
    raise exception 'Poll result visibility is invalid' using errcode = '22023';
  end if;
  if p_authority not in ('advisory', 'binding') then
    raise exception 'Poll authority is invalid' using errcode = '22023';
  end if;
  if p_opens_at is null or p_closes_at is null
    or p_closes_at < p_opens_at + interval '15 minutes'
    or p_closes_at > p_opens_at + interval '30 days' then
    raise exception 'Poll duration must be between 15 minutes and 30 days'
      using errcode = '22023';
  end if;

  if p_purpose = 'community_feedback' then
    if p_audience_kind not in ('active_players', 'selected_active_players')
      or p_tournament_id is not null
      or p_tournament_bracket_id is not null then
      raise exception 'Community Feedback audience is invalid'
        using errcode = '22023';
    end if;
    if p_authority <> 'advisory' then
      raise exception 'Community Feedback polls must be Advisory'
        using errcode = '22023';
    end if;
    if coalesce(p_public_final_totals, false) then
      raise exception 'Community Feedback remains authenticated-only'
        using errcode = '22023';
    end if;
  else
    if p_audience_kind not in (
      'tournament_approved',
      'tournament_division_approved',
      'selected_tournament_players'
    ) or p_tournament_id is null then
      raise exception 'Tournament Decision audience is invalid'
        using errcode = '22023';
    end if;
    if p_audience_kind = 'tournament_division_approved'
      and p_tournament_bracket_id is null then
      raise exception 'Tournament Division is required'
        using errcode = '22023';
    end if;
    if p_audience_kind <> 'tournament_division_approved'
      and p_tournament_bracket_id is not null then
      raise exception 'Tournament Division is not valid for this audience'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.tournaments as tournament
      where tournament.id = p_tournament_id
    ) then
      raise exception 'Tournament not found';
    end if;
    if p_tournament_bracket_id is not null and not exists (
      select 1 from public.tournament_brackets as bracket
      where bracket.id = p_tournament_bracket_id
        and bracket.tournament_id = p_tournament_id
    ) then
      raise exception 'Tournament Division does not belong to the tournament';
    end if;
  end if;

  if p_options is null or pg_catalog.jsonb_typeof(p_options) <> 'array' then
    raise exception 'Poll options must be a JSON array' using errcode = '22023';
  end if;

  select count(*)::integer,
    count(distinct (option_value ->> 'position')::integer)::integer
  into v_option_count, v_distinct_position_count
  from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value);

  if v_option_count not between 2 and 24 then
    raise exception 'Poll option count must be between 2 and 24'
      using errcode = '22023';
  end if;
  if p_max_selections > v_option_count or p_winner_count > v_option_count then
    raise exception 'Poll selection limits cannot exceed the option count'
      using errcode = '22023';
  end if;
  if v_distinct_position_count <> v_option_count or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value)
    where (option_value ->> 'position')::integer not between 1 and v_option_count
  ) then
    raise exception 'Poll option positions must be unique and contiguous'
      using errcode = '22023';
  end if;

  if p_option_source = 'text' then
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value)
      where nullif(pg_catalog.btrim(option_value ->> 'label'), '') is null
        or char_length(pg_catalog.btrim(option_value ->> 'label')) > 120
        or nullif(option_value ->> 'coh3_map_id', '') is not null
    ) then
      raise exception 'Text poll options require labels of at most 120 characters'
        using errcode = '22023';
    end if;
    if (
      select count(distinct lower(pg_catalog.regexp_replace(
        pg_catalog.btrim(option_value ->> 'label'), '\s+', ' ', 'g'
      )))
      from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value)
    ) <> v_option_count then
      raise exception 'Duplicate poll options are not allowed'
        using errcode = '22023';
    end if;
  else
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value)
      where nullif(option_value ->> 'coh3_map_id', '') is null
    ) then
      raise exception 'Map poll options require catalogue map IDs'
        using errcode = '22023';
    end if;
    if (
      select count(distinct (option_value ->> 'coh3_map_id')::uuid)
      from pg_catalog.jsonb_array_elements(p_options) as option_row(option_value)
    ) <> v_option_count then
      raise exception 'Duplicate poll options are not allowed'
        using errcode = '22023';
    end if;
    if (
      select count(*)::integer
      from public.coh3_maps as map
      where map.id in (
        select (option_value ->> 'coh3_map_id')::uuid
        from pg_catalog.jsonb_array_elements(p_options)
          as option_row(option_value)
      )
        and map.status = 'active'
        and map.game_mode = '1v1'
    ) <> v_option_count then
      raise exception 'Map polls require active 1v1 catalogue maps'
        using errcode = '22023';
    end if;
  end if;

  if coalesce(cardinality(p_selected_player_ids), 0) > 0 then
    if array_position(p_selected_player_ids, null) is not null then
      raise exception 'Selected players must be valid'
        using errcode = '22023';
    end if;
    select count(distinct selected_id)::integer
    into v_selected_count
    from unnest(p_selected_player_ids) as selected_id;
    if v_selected_count <> cardinality(p_selected_player_ids) then
      raise exception 'Select each player only once' using errcode = '22023';
    end if;
  else
    v_selected_count := 0;
  end if;

  if p_audience_kind in (
    'selected_tournament_players',
    'selected_active_players'
  ) then
    -- Serialize Draft selection with account closure. If save wins, closure
    -- subsequently removes and invalidates the selection; if closure wins,
    -- the active/scope validation below rejects the stale target.
    perform player.id
    from public.players as player
    where player.id = any(
      coalesce(p_selected_player_ids, array[]::uuid[])
    )
    order by player.id
    for share;

    if p_audience_kind = 'selected_active_players' then
      select count(*)::integer
      into v_valid_selected_count
      from public.players as player
      where player.id = any(coalesce(p_selected_player_ids, array[]::uuid[]))
        and player.account_closed_at is null;
    else
      select count(distinct player.id)::integer
      into v_valid_selected_count
      from public.players as player
      join public.registrations as registration
        on registration.profile_id = player.id
      where player.id = any(coalesce(p_selected_player_ids, array[]::uuid[]))
        and player.account_closed_at is null
        and registration.tournament_id = p_tournament_id
        and registration.registration_status = 'approved';
    end if;
    if v_valid_selected_count <> v_selected_count then
      raise exception 'Selected audience contains an ineligible player'
        using errcode = '22023';
    end if;
  elsif v_selected_count <> 0 then
    raise exception 'This audience does not accept selected players'
      using errcode = '22023';
  end if;

  if p_poll_id is null then
    insert into public.polls (
      id, purpose, audience_kind, tournament_id, tournament_bracket_id,
      question, context, option_source, max_selections, winner_count,
      authority, result_visibility, public_final_totals, opens_at, closes_at,
      created_by_clerk_user_id, updated_by_clerk_user_id
    ) values (
      v_poll_id, p_purpose, p_audience_kind, p_tournament_id,
      p_tournament_bracket_id, v_question, v_context, p_option_source,
      p_max_selections, p_winner_count, p_authority, p_result_visibility,
      coalesce(p_public_final_totals, false), p_opens_at, p_closes_at,
      v_actor, v_actor
    );
  else
    update public.polls
    set purpose = p_purpose,
      audience_kind = p_audience_kind,
      tournament_id = p_tournament_id,
      tournament_bracket_id = p_tournament_bracket_id,
      question = v_question,
      context = v_context,
      option_source = p_option_source,
      max_selections = p_max_selections,
      winner_count = p_winner_count,
      authority = p_authority,
      result_visibility = p_result_visibility,
      public_final_totals = coalesce(p_public_final_totals, false),
      draft_audience_invalidated = false,
      opens_at = p_opens_at,
      closes_at = p_closes_at,
      updated_by_clerk_user_id = v_actor
    where id = v_poll_id;
  end if;

  delete from public.poll_eligible_voters
  where poll_id = v_poll_id;
  delete from public.poll_options
  where poll_id = v_poll_id;

  if p_option_source = 'text' then
    insert into public.poll_options (
      id, poll_id, position, label_snapshot
    )
    select
      coalesce(
        nullif(option_value ->> 'id', '')::uuid,
        pg_catalog.gen_random_uuid()
      ),
      v_poll_id,
      (option_value ->> 'position')::smallint,
      pg_catalog.regexp_replace(
        pg_catalog.btrim(option_value ->> 'label'), '\s+', ' ', 'g'
      )
    from pg_catalog.jsonb_array_elements(p_options)
      as option_row(option_value)
    order by (option_value ->> 'position')::integer;
  else
    insert into public.poll_options (
      id, poll_id, position, label_snapshot, coh3_map_id,
      map_display_name_snapshot, map_slug_snapshot
    )
    select
      coalesce(
        nullif(option_value ->> 'id', '')::uuid,
        pg_catalog.gen_random_uuid()
      ),
      v_poll_id,
      (option_value ->> 'position')::smallint,
      map.display_name,
      map.id,
      map.display_name,
      map.slug
    from pg_catalog.jsonb_array_elements(p_options)
      as option_row(option_value)
    join public.coh3_maps as map
      on map.id = (option_value ->> 'coh3_map_id')::uuid
    order by (option_value ->> 'position')::integer;
  end if;

  if p_audience_kind in (
    'selected_tournament_players',
    'selected_active_players'
  ) then
    insert into public.poll_eligible_voters (poll_id, player_id)
    select v_poll_id, selected_id
    from unnest(coalesce(p_selected_player_ids, array[]::uuid[]))
      as selected_id
    order by selected_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'poll_id', v_poll_id,
    'saved', true
  );
end;
$$;

alter function public.save_poll_draft(
  uuid, text, text, uuid, uuid, text, text, text, jsonb, smallint,
  smallint, text, text, boolean, timestamptz, timestamptz, uuid[], text
) owner to postgres;
revoke all on function public.save_poll_draft(
  uuid, text, text, uuid, uuid, text, text, text, jsonb, smallint,
  smallint, text, text, boolean, timestamptz, timestamptz, uuid[], text
) from public, anon, authenticated, service_role;
grant execute on function public.save_poll_draft(
  uuid, text, text, uuid, uuid, text, text, text, jsonb, smallint,
  smallint, text, text, boolean, timestamptz, timestamptz, uuid[], text
) to service_role;

create function public.preview_poll_eligibility(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll public.polls%rowtype;
  v_selected_count integer;
  v_eligible_count integer;
  v_players jsonb;
begin
  perform public.assert_poll_service_role();

  select poll.* into v_poll
  from public.polls as poll
  where poll.id = p_poll_id;

  if not found then
    raise exception 'Poll not found';
  end if;
  if v_poll.published_at is not null then
    raise exception 'Published poll eligibility is already frozen'
      using errcode = '55000';
  end if;

  select count(*)::integer
  into v_selected_count
  from public.poll_eligible_voters as selected
  where selected.poll_id = p_poll_id;

  select count(*)::integer,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', candidate.player_id,
          'display_name', candidate.display_name,
          'in_game_name', candidate.in_game_name
        ) order by candidate.display_name, candidate.player_id
      ),
      '[]'::jsonb
    )
  into v_eligible_count, v_players
  from public.poll_eligible_candidates(p_poll_id) as candidate;

  if v_poll.audience_kind in (
    'selected_tournament_players',
    'selected_active_players'
  ) and v_selected_count <> v_eligible_count then
    raise exception 'Selected audience contains an ineligible player'
      using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'eligible_count', v_eligible_count,
    'players', v_players
  );
end;
$$;

alter function public.preview_poll_eligibility(uuid) owner to postgres;
revoke all on function public.preview_poll_eligibility(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.preview_poll_eligibility(uuid)
  to service_role;

create function public.build_poll_payload(
  p_poll_id uuid,
  p_viewer_player_id uuid,
  p_viewer_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_poll public.polls%rowtype;
  v_eligibility public.poll_eligible_voters%rowtype;
  v_now timestamptz;
  v_status text;
  v_include_option_totals boolean;
  v_include_turnout boolean;
  v_eligible_count integer;
  v_submitted_ballot_count integer;
  v_options jsonb;
  v_selected_option_ids jsonb;
  v_selected_player_ids jsonb;
  v_computed_winner_option_ids jsonb;
  v_cutoff_tie_option_ids jsonb;
  v_cutoff_count integer;
  v_safe_winner_count integer;
  v_cutoff_slots integer;
  v_cutoff_tie_count integer;
begin
  if p_viewer_mode not in ('admin', 'eligible') then
    raise exception 'Poll projection mode is invalid' using errcode = '22023';
  end if;

  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  -- Derive lifecycle and visibility from one authoritative database-clock
  -- instant. Nullable v_now would otherwise collapse every published payload
  -- into the CLOSED fallback and suppress valid live aggregates.
  v_now := pg_catalog.clock_timestamp();

  if p_viewer_mode = 'eligible' then
    select eligible.*
    into v_eligibility
    from public.poll_eligible_voters as eligible
    where eligible.poll_id = p_poll_id
      and eligible.player_id = p_viewer_player_id;

    if not found or v_poll.published_at is null then
      raise exception 'Poll unavailable' using errcode = '42501';
    end if;
  end if;

  v_status := case
    when v_poll.cancelled_at is not null then 'cancelled'
    when v_poll.published_at is null then 'draft'
    when v_poll.final_decision_published_at is not null
      then 'final_decision_published'
    when v_now < v_poll.opens_at then 'scheduled'
    when v_now < v_poll.closes_at then 'open'
    else 'closed'
  end;

  v_include_option_totals :=
    v_poll.published_at is not null
    and v_poll.cancelled_at is null
    and (
      v_now >= v_poll.closes_at
      or (
        v_poll.result_visibility = 'live'
        and v_now >= v_poll.opens_at
        and v_now < v_poll.closes_at
      )
    );
  v_include_turnout := p_viewer_mode = 'admin' or v_include_option_totals;

  select count(*)::integer,
    count(*) filter (where eligible.first_voted_at is not null)::integer
  into v_eligible_count, v_submitted_ballot_count
  from public.poll_eligible_voters as eligible
  where eligible.poll_id = p_poll_id;

  with option_counts as (
    select option.id, option.position, option.label_snapshot,
      option.coh3_map_id, option.map_display_name_snapshot,
      option.map_slug_snapshot, option.final_decision_rank,
      count(choice.option_id)::integer as vote_count
    from public.poll_options as option
    left join public.poll_ballot_choices as choice
      on choice.poll_id = option.poll_id
      and choice.option_id = option.id
    where option.poll_id = p_poll_id
    group by option.id
  ), ranked as (
    select option_counts.*,
      rank() over (
        order by option_counts.vote_count desc
      )::integer as poll_result_rank
    from option_counts
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
          'id', ranked.id,
          'position', ranked.position,
          'label', ranked.label_snapshot,
          'map', case when ranked.coh3_map_id is null then null else
            pg_catalog.jsonb_build_object(
              'id', ranked.coh3_map_id,
              'name', ranked.map_display_name_snapshot,
              'slug', ranked.map_slug_snapshot
            ) end,
          'poll_result_rank', case
            when v_now >= v_poll.closes_at
              and ranked.poll_result_rank <= v_poll.winner_count
              then ranked.poll_result_rank
            else null
          end,
          'final_decision_rank', ranked.final_decision_rank
        )
        || case when v_include_option_totals then
          pg_catalog.jsonb_build_object(
            'vote_count', ranked.vote_count,
            'selection_share_percent', case
              when v_submitted_ballot_count > 0 then pg_catalog.round(
                100.0 * ranked.vote_count / v_submitted_ballot_count,
                1
              )
              else 0
            end
          )
        else '{}'::jsonb end
      order by ranked.position
    ),
    '[]'::jsonb
  )
  into v_options
  from ranked;

  if p_viewer_mode = 'eligible' then
    select coalesce(
      pg_catalog.jsonb_agg(choice.option_id order by choice.option_id),
      '[]'::jsonb
    )
    into v_selected_option_ids
    from public.poll_ballot_choices as choice
    where choice.poll_id = p_poll_id
      and choice.eligible_voter_id = v_eligibility.id;
  end if;

  if p_viewer_mode = 'admin'
    and v_poll.published_at is null
    and v_poll.audience_kind in (
      'selected_tournament_players',
      'selected_active_players'
    ) then
    select coalesce(
      pg_catalog.jsonb_agg(eligible.player_id order by eligible.player_id)
        filter (where eligible.player_id is not null),
      '[]'::jsonb
    )
    into v_selected_player_ids
    from public.poll_eligible_voters as eligible
    where eligible.poll_id = p_poll_id;
  end if;

  if p_viewer_mode = 'admin' then
    if v_poll.published_at is not null
      and v_poll.cancelled_at is null
      and v_now >= v_poll.closes_at then
      if v_poll.authority = 'advisory' then
        -- Advisory finalization compares against one deterministic full top-K
        -- set. The Admin projection must expose that exact default even when
        -- aggregate result ranks honestly show a tie across the cutoff.
        with option_counts as (
          select option.id, option.position,
            count(choice.option_id)::integer as vote_count
          from public.poll_options as option
          left join public.poll_ballot_choices as choice
            on choice.poll_id = option.poll_id
            and choice.option_id = option.id
          where option.poll_id = p_poll_id
          group by option.id
        ), ranked as (
          select option_counts.*,
            row_number() over (
              order by option_counts.vote_count desc, option_counts.position
            )::integer as result_rank
          from option_counts
        )
        select coalesce(
          pg_catalog.jsonb_agg(ranked.id order by ranked.result_rank)
            filter (where ranked.result_rank <= v_poll.winner_count),
          '[]'::jsonb
        )
        into v_computed_winner_option_ids
        from ranked;
      else
        with option_counts as (
          select option.id, option.position,
            count(choice.option_id)::integer as vote_count
          from public.poll_options as option
          left join public.poll_ballot_choices as choice
            on choice.poll_id = option.poll_id
            and choice.option_id = option.id
          where option.poll_id = p_poll_id
          group by option.id
        ), ranked as (
          select option_counts.*,
            row_number() over (
              order by option_counts.vote_count desc, option_counts.position
            )::integer as result_rank
          from option_counts
        )
        select vote_count
        into v_cutoff_count
        from ranked
        where result_rank = v_poll.winner_count;

        select count(*) filter (
            where option_counts.vote_count > v_cutoff_count
          )::integer,
          count(*) filter (
            where option_counts.vote_count = v_cutoff_count
          )::integer
        into v_safe_winner_count, v_cutoff_tie_count
        from (
          select option.id,
            count(choice.option_id)::integer as vote_count
          from public.poll_options as option
          left join public.poll_ballot_choices as choice
            on choice.poll_id = option.poll_id
            and choice.option_id = option.id
          where option.poll_id = p_poll_id
          group by option.id
        ) as option_counts;

        v_cutoff_slots := v_poll.winner_count - v_safe_winner_count;

        with option_counts as (
          select option.id, option.position,
            count(choice.option_id)::integer as vote_count
          from public.poll_options as option
          left join public.poll_ballot_choices as choice
            on choice.poll_id = option.poll_id
            and choice.option_id = option.id
          where option.poll_id = p_poll_id
          group by option.id
        ), ranked as (
          select option_counts.*,
            row_number() over (
              order by option_counts.vote_count desc, option_counts.position
            )::integer as result_rank
          from option_counts
        )
        select coalesce(
          pg_catalog.jsonb_agg(ranked.id order by ranked.result_rank)
            filter (where
              case
                when v_cutoff_tie_count > v_cutoff_slots
                  then ranked.vote_count > v_cutoff_count
                else ranked.result_rank <= v_poll.winner_count
              end
            ),
          '[]'::jsonb
        )
        into v_computed_winner_option_ids
        from ranked;

        if v_cutoff_tie_count > v_cutoff_slots then
          with option_counts as (
            select option.id, option.position,
              count(choice.option_id)::integer as vote_count
            from public.poll_options as option
            left join public.poll_ballot_choices as choice
              on choice.poll_id = option.poll_id
              and choice.option_id = option.id
            where option.poll_id = p_poll_id
            group by option.id
          )
          select coalesce(
            pg_catalog.jsonb_agg(
              option_counts.id order by option_counts.position
            ),
            '[]'::jsonb
          )
          into v_cutoff_tie_option_ids
          from option_counts
          where option_counts.vote_count = v_cutoff_count;
        end if;
      end if;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
      'id', v_poll.id,
      'purpose', v_poll.purpose,
      'audience_kind', v_poll.audience_kind,
      'tournament_id', v_poll.tournament_id,
      'tournament_bracket_id', v_poll.tournament_bracket_id,
      'question', v_poll.question,
      'context', v_poll.context,
      'option_source', v_poll.option_source,
      'max_selections', v_poll.max_selections,
      'winner_count', v_poll.winner_count,
      'authority', v_poll.authority,
      'result_visibility', v_poll.result_visibility,
      'public_final_totals', v_poll.public_final_totals,
      'opens_at', v_poll.opens_at,
      'closes_at', v_poll.closes_at,
      'published_at', v_poll.published_at,
      'cancelled_at', v_poll.cancelled_at,
      'cancellation_reason', v_poll.cancellation_reason,
      'final_decision_basis', v_poll.final_decision_basis,
      'final_rationale', v_poll.final_rationale,
      'binding_tie_rule_used', v_poll.binding_tie_rule_used,
      'final_decision_published_at', v_poll.final_decision_published_at,
      'status', v_status,
      'options', v_options
    )
    || case
      when p_viewer_mode = 'admin' or v_include_turnout then
        pg_catalog.jsonb_build_object(
          'eligible_count', v_eligible_count,
          'submitted_ballot_count', v_submitted_ballot_count
        )
      else '{}'::jsonb
    end
    || case
      when p_viewer_mode = 'eligible' then
        pg_catalog.jsonb_build_object(
          'ballot_revision', v_eligibility.ballot_revision,
          'selected_option_ids', v_selected_option_ids
        )
      else '{}'::jsonb
    end
    || case
      when p_viewer_mode = 'admin' then
        pg_catalog.jsonb_build_object(
          'draft_audience_invalidated', v_poll.draft_audience_invalidated
        )
      else '{}'::jsonb
    end
    || case
      when v_selected_player_ids is not null then
        pg_catalog.jsonb_build_object(
          'selected_player_ids', v_selected_player_ids
        )
      else '{}'::jsonb
    end
    || case
      when v_computed_winner_option_ids is not null then
        pg_catalog.jsonb_build_object(
          'computed_winner_option_ids', v_computed_winner_option_ids
        )
      else '{}'::jsonb
    end
    || case
      when v_cutoff_tie_option_ids is not null then
        pg_catalog.jsonb_build_object(
          'cutoff_tie_option_ids', v_cutoff_tie_option_ids,
          'cutoff_slots_remaining', v_cutoff_slots
        )
      else '{}'::jsonb
    end;
end;
$$;

alter function public.build_poll_payload(uuid, uuid, text) owner to postgres;
revoke all on function public.build_poll_payload(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.list_admin_polls(
  p_tournament_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_polls jsonb;
begin
  perform public.assert_poll_service_role();

  select coalesce(
    pg_catalog.jsonb_agg(
      public.build_poll_payload(poll.id, null, 'admin')
      order by poll.created_at desc, poll.id
    ),
    '[]'::jsonb
  )
  into v_polls
  from public.polls as poll
  where p_tournament_id is null or poll.tournament_id = p_tournament_id;

  return pg_catalog.jsonb_build_object('polls', v_polls);
end;
$$;

alter function public.list_admin_polls(uuid) owner to postgres;
revoke all on function public.list_admin_polls(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_polls(uuid) to service_role;

create function public.get_admin_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.assert_poll_service_role();

  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'Poll not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'poll', public.build_poll_payload(p_poll_id, null, 'admin')
  );
end;
$$;

alter function public.get_admin_poll(uuid) owner to postgres;
revoke all on function public.get_admin_poll(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_poll(uuid) to service_role;

create function public.delete_poll_draft(
  p_poll_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_poll public.polls%rowtype;
begin
  perform public.assert_poll_service_role();
  if v_actor is null then
    raise exception 'Poll administrator is required' using errcode = '22023';
  end if;

  select poll.* into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found';
  end if;
  if v_poll.published_at is not null then
    raise exception 'Published polls cannot be deleted'
      using errcode = '55000';
  end if;
  delete from public.polls where id = p_poll_id;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'deleted', true
  );
end;
$$;

alter function public.delete_poll_draft(uuid, text) owner to postgres;
revoke all on function public.delete_poll_draft(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_poll_draft(uuid, text)
  to service_role;

create function public.publish_poll(
  p_poll_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_poll public.polls%rowtype;
  v_published_at timestamptz;
  v_option_count integer;
  v_selected_count integer;
  v_eligible_count integer;
  v_tournament_status text;
  v_tournament_title text;
  v_notification_title text;
  v_notification_message text;
begin
  perform public.assert_poll_service_role();
  if v_actor is null then
    raise exception 'Poll administrator is required' using errcode = '22023';
  end if;

  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found';
  end if;
  v_published_at := pg_catalog.clock_timestamp();
  if v_poll.published_at is not null then
    raise exception 'Poll has already been published' using errcode = '55000';
  end if;
  if v_poll.draft_audience_invalidated then
    raise exception 'Selected audience changed after account closure; review and save the Draft again'
      using errcode = '55000';
  end if;
  if v_published_at >= v_poll.closes_at then
    raise exception 'A poll cannot be published after its database close time'
      using errcode = '55000';
  end if;

  select count(*)::integer
  into v_option_count
  from public.poll_options as option
  where option.poll_id = p_poll_id;

  if v_option_count not between 2 and 24
    or v_poll.max_selections > v_option_count
    or v_poll.winner_count > v_option_count then
    raise exception 'Poll configuration is incomplete'
      using errcode = '22023';
  end if;

  if v_poll.purpose = 'tournament_decision' then
    select tournament.status, tournament.title
    into v_tournament_status, v_tournament_title
    from public.tournaments as tournament
    where tournament.id = v_poll.tournament_id
    for share;

    if not found then
      raise exception 'Tournament not found';
    end if;
    if v_tournament_status in ('completed', 'cancelled', 'voided') then
      raise exception 'New Tournament Decisions cannot be published for a terminal tournament'
        using errcode = '55000';
    end if;

    perform registration.id
    from public.registrations as registration
    where registration.tournament_id = v_poll.tournament_id
      and (
        v_poll.audience_kind <> 'tournament_division_approved'
        or registration.tournament_bracket_id = v_poll.tournament_bracket_id
      )
    order by registration.id
    for share;
  end if;

  perform player.id
  from public.players as player
  where player.id in (
    select candidate.player_id
    from public.poll_eligible_candidates(p_poll_id) as candidate
  )
  order by player.id
  for share;

  if v_poll.audience_kind in (
    'selected_tournament_players',
    'selected_active_players'
  ) then
    select count(*)::integer
    into v_selected_count
    from public.poll_eligible_voters as selected
    where selected.poll_id = p_poll_id;

    select count(*)::integer
    into v_eligible_count
    from public.poll_eligible_candidates(p_poll_id);

    if v_selected_count <> v_eligible_count then
      raise exception 'Selected audience contains an ineligible player'
        using errcode = '22023';
    end if;
  end if;

  if v_poll.option_source = 'coh3_map' then
    -- Keep catalogue rows stable from publication revalidation through the
    -- immutable snapshot write so retirement cannot slip between statements.
    perform map.id
    from public.coh3_maps as map
    join public.poll_options as option on option.coh3_map_id = map.id
    where option.poll_id = p_poll_id
    order by map.id
    for share of map;

    if exists (
      select 1
      from public.poll_options as option
      left join public.coh3_maps as map on map.id = option.coh3_map_id
      where option.poll_id = p_poll_id
        and (
          map.id is null
          or map.status <> 'active'
          or map.game_mode <> '1v1'
        )
    ) then
      raise exception 'Map polls require active 1v1 catalogue maps'
        using errcode = '22023';
    end if;

    update public.poll_options as option
    set label_snapshot = map.display_name,
      map_display_name_snapshot = map.display_name,
      map_slug_snapshot = map.slug
    from public.coh3_maps as map
    where option.poll_id = p_poll_id
      and map.id = option.coh3_map_id;
  elsif exists (
    select 1 from public.poll_options as option
    where option.poll_id = p_poll_id
      and option.coh3_map_id is not null
  ) then
    raise exception 'Text poll options cannot reference maps'
      using errcode = '22023';
  end if;

  if v_poll.audience_kind not in (
    'selected_tournament_players',
    'selected_active_players'
  ) then
    delete from public.poll_eligible_voters
    where poll_id = p_poll_id;

    insert into public.poll_eligible_voters (
      poll_id, player_id, eligible_at
    )
    select p_poll_id, candidate.player_id, v_published_at
    from public.poll_eligible_candidates(p_poll_id) as candidate
    order by candidate.player_id;
    get diagnostics v_eligible_count = row_count;
  else
    update public.poll_eligible_voters
    set eligible_at = v_published_at
    where poll_id = p_poll_id;
    get diagnostics v_eligible_count = row_count;
  end if;

  if v_eligible_count = 0 then
    raise exception 'Poll publication requires at least one eligible player'
      using errcode = '22023';
  end if;

  update public.polls
  set published_at = v_published_at,
    published_by_clerk_user_id = v_actor,
    updated_by_clerk_user_id = v_actor
  where id = p_poll_id;

  v_notification_title := case
    when v_published_at < v_poll.opens_at then 'Poll scheduled'
    else 'Your vote is requested'
  end;
  v_notification_message := case
    when v_published_at < v_poll.opens_at then
      pg_catalog.format(
        '%s Voting opens %s and closes %s.',
        v_poll.question,
        v_poll.opens_at,
        v_poll.closes_at
      )
    else
      pg_catalog.format(
        '%s Vote before %s.',
        v_poll.question,
        v_poll.closes_at
      )
  end;

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    tournament_id,
    tournament_title,
    metadata,
    event_key
  )
  select
    player.clerk_user_id,
    'player',
    'poll.published',
    v_notification_title,
    v_notification_message,
    v_poll.tournament_id,
    v_tournament_title,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'pollId', p_poll_id,
      'purpose', v_poll.purpose,
      'tournamentId', v_poll.tournament_id,
      'opensAt', v_poll.opens_at,
      'closesAt', v_poll.closes_at
    )),
    pg_catalog.format('poll:%s:published', p_poll_id)
  from public.poll_eligible_voters as eligible
  join public.players as player on player.id = eligible.player_id
  where eligible.poll_id = p_poll_id
  order by player.id
  on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null
  do nothing;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'published_at', v_published_at,
    'eligible_count', v_eligible_count
  );
end;
$$;

alter function public.publish_poll(uuid, text) owner to postgres;
revoke all on function public.publish_poll(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_poll(uuid, text) to service_role;

create function public.cancel_poll(
  p_poll_id uuid,
  p_reason text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_poll public.polls%rowtype;
  v_cancelled_at timestamptz;
begin
  perform public.assert_poll_service_role();
  if v_actor is null then
    raise exception 'Poll administrator is required' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Cancellation reason must be between 1 and 500 characters'
      using errcode = '22023';
  end if;

  select poll.* into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found';
  end if;
  if v_poll.published_at is null then
    raise exception 'Delete an unpublished Draft instead'
      using errcode = '55000';
  end if;
  if v_poll.cancelled_at is not null then
    raise exception 'Poll is already cancelled' using errcode = '55000';
  end if;
  if v_poll.final_decision_published_at is not null then
    raise exception 'A final-published decision cannot be cancelled'
      using errcode = '55000';
  end if;

  -- Record the factual cancellation instant only after the serialized poll
  -- state is known. A request waiting behind publication cannot backdate it.
  v_cancelled_at := pg_catalog.clock_timestamp();

  update public.polls
  set cancelled_at = v_cancelled_at,
    cancellation_reason = v_reason,
    cancelled_by_clerk_user_id = v_actor,
    updated_by_clerk_user_id = v_actor
  where id = p_poll_id;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'cancelled_at', v_cancelled_at
  );
end;
$$;

alter function public.cancel_poll(uuid, text, text) owner to postgres;
revoke all on function public.cancel_poll(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_poll(uuid, text, text)
  to service_role;

create function public.cast_poll_ballot(
  p_poll_id uuid,
  p_expected_revision integer,
  p_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(auth.jwt() ->> 'sub', '');
  v_player_id uuid;
  v_poll public.polls%rowtype;
  v_eligibility public.poll_eligible_voters%rowtype;
  v_now timestamptz;
  v_requested_count integer;
  v_valid_option_count integer;
  v_requested_options uuid[];
  v_current_options uuid[];
  v_first_voted_at timestamptz;
  v_ballot_updated_at timestamptz;
  v_new_revision integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
    and player.account_closed_at is null
  for share;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for share;

  if not found
    or v_poll.published_at is null
    or v_poll.cancelled_at is not null then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select eligible.*
  into v_eligibility
  from public.poll_eligible_voters as eligible
  where eligible.poll_id = p_poll_id
    and eligible.player_id = v_player_id
  for update;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  -- Capture the authoritative time only after a concurrent ballot update can
  -- no longer keep this request waiting across the close boundary.
  v_now := pg_catalog.clock_timestamp();
  if v_now < v_poll.opens_at or v_now >= v_poll.closes_at then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  if p_option_ids is null
    or coalesce(cardinality(p_option_ids), 0) = 0
    or array_position(p_option_ids, null) is not null then
    raise exception 'Select at least one valid poll option'
      using errcode = '22023';
  end if;

  select count(distinct option_id)::integer,
    pg_catalog.array_agg(distinct option_id order by option_id)
  into v_requested_count, v_requested_options
  from unnest(p_option_ids) as option_id;

  if v_requested_count <> cardinality(p_option_ids)
    or v_requested_count > v_poll.max_selections then
    raise exception 'Ballot selections are invalid'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_valid_option_count
  from public.poll_options as option
  where option.poll_id = p_poll_id
    and option.id = any(v_requested_options);

  if v_valid_option_count <> v_requested_count then
    raise exception 'Ballot selections are invalid'
      using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(choice.option_id order by choice.option_id),
    array[]::uuid[]
  )
  into v_current_options
  from public.poll_ballot_choices as choice
  where choice.poll_id = p_poll_id
    and choice.eligible_voter_id = v_eligibility.id;

  if v_current_options = v_requested_options then
    return pg_catalog.jsonb_build_object(
      'poll_id', p_poll_id,
      'ballot_revision', v_eligibility.ballot_revision,
      'selected_option_ids', pg_catalog.to_jsonb(v_current_options),
      'first_voted_at', v_eligibility.first_voted_at,
      'ballot_updated_at', v_eligibility.ballot_updated_at,
      'idempotent', true
    );
  end if;

  if p_expected_revision is null
    or p_expected_revision < 0
    or p_expected_revision <> v_eligibility.ballot_revision then
    raise exception 'Ballot revision conflict' using errcode = '40001';
  end if;

  delete from public.poll_ballot_choices
  where poll_id = p_poll_id
    and eligible_voter_id = v_eligibility.id;

  v_ballot_updated_at := pg_catalog.clock_timestamp();
  insert into public.poll_ballot_choices (
    poll_id, eligible_voter_id, option_id, selected_at
  )
  select p_poll_id, v_eligibility.id, option_id, v_ballot_updated_at
  from unnest(v_requested_options) as option_id
  order by option_id;

  update public.poll_eligible_voters
  set first_voted_at = coalesce(first_voted_at, v_ballot_updated_at),
    ballot_updated_at = v_ballot_updated_at,
    ballot_revision = ballot_revision + 1
  where id = v_eligibility.id
    and poll_id = p_poll_id
  returning first_voted_at, ballot_updated_at, ballot_revision
  into v_first_voted_at, v_ballot_updated_at, v_new_revision;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'ballot_revision', v_new_revision,
    'selected_option_ids', pg_catalog.to_jsonb(v_requested_options),
    'first_voted_at', v_first_voted_at,
    'ballot_updated_at', v_ballot_updated_at,
    'idempotent', false
  );
end;
$$;

alter function public.cast_poll_ballot(uuid, integer, uuid[]) owner to postgres;
revoke all on function public.cast_poll_ballot(uuid, integer, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.cast_poll_ballot(uuid, integer, uuid[])
  to authenticated;

create function public.current_poll_player_id()
returns uuid
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(auth.jwt() ->> 'sub', '');
  v_player_id uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  select player.id
  into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
    and player.account_closed_at is null;

  if not found then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  return v_player_id;
end;
$$;

alter function public.current_poll_player_id() owner to postgres;
revoke all on function public.current_poll_player_id()
  from public, anon, authenticated, service_role;

create function public.get_my_tournament_polls(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := public.current_poll_player_id();
  v_polls jsonb;
begin
  select coalesce(
    pg_catalog.jsonb_agg(
      public.build_poll_payload(poll.id, v_player_id, 'eligible')
      order by
        case
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() >= poll.opens_at
            and pg_catalog.clock_timestamp() < poll.closes_at
            and eligible.first_voted_at is null then 1
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() >= poll.opens_at
            and pg_catalog.clock_timestamp() < poll.closes_at then 2
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() < poll.opens_at then 3
          when poll.final_decision_published_at is null
            and poll.cancelled_at is null then 4
          when poll.final_decision_published_at is not null then 5
          else 6
        end,
        poll.closes_at desc,
        poll.id
    ),
    '[]'::jsonb
  )
  into v_polls
  from public.polls as poll
  join public.poll_eligible_voters as eligible
    on eligible.poll_id = poll.id
    and eligible.player_id = v_player_id
  where poll.purpose = 'tournament_decision'
    and poll.tournament_id = p_tournament_id
    and poll.published_at is not null;

  return pg_catalog.jsonb_build_object('polls', v_polls);
end;
$$;

alter function public.get_my_tournament_polls(uuid) owner to postgres;
revoke all on function public.get_my_tournament_polls(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_tournament_polls(uuid)
  to authenticated;

create function public.get_my_community_polls()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := public.current_poll_player_id();
  v_polls jsonb;
begin
  select coalesce(
    pg_catalog.jsonb_agg(
      public.build_poll_payload(poll.id, v_player_id, 'eligible')
      order by
        case
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() >= poll.opens_at
            and pg_catalog.clock_timestamp() < poll.closes_at
            and eligible.first_voted_at is null then 1
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() >= poll.opens_at
            and pg_catalog.clock_timestamp() < poll.closes_at then 2
          when poll.cancelled_at is null
            and pg_catalog.clock_timestamp() < poll.opens_at then 3
          when poll.cancelled_at is null then 4
          else 6
        end,
        poll.closes_at desc,
        poll.id
    ),
    '[]'::jsonb
  )
  into v_polls
  from public.polls as poll
  join public.poll_eligible_voters as eligible
    on eligible.poll_id = poll.id
    and eligible.player_id = v_player_id
  where poll.purpose = 'community_feedback'
    and poll.published_at is not null;

  return pg_catalog.jsonb_build_object('polls', v_polls);
end;
$$;

alter function public.get_my_community_polls() owner to postgres;
revoke all on function public.get_my_community_polls()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_community_polls()
  to authenticated;

create function public.get_my_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := public.current_poll_player_id();
begin
  if not exists (
    select 1
    from public.poll_eligible_voters as eligible
    join public.polls as poll on poll.id = eligible.poll_id
    where eligible.poll_id = p_poll_id
      and eligible.player_id = v_player_id
      and poll.published_at is not null
  ) then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'poll', public.build_poll_payload(p_poll_id, v_player_id, 'eligible')
  );
end;
$$;

alter function public.get_my_poll(uuid) owner to postgres;
revoke all on function public.get_my_poll(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_poll(uuid) to authenticated;

create function public.finalize_poll_decision(
  p_poll_id uuid,
  p_selected_option_ids uuid[],
  p_rationale text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_rationale text := nullif(pg_catalog.btrim(p_rationale), '');
  v_poll public.polls%rowtype;
  v_now timestamptz;
  v_submitted_ballot_count integer;
  v_selected_count integer;
  v_valid_selected_count integer;
  v_selected_ids uuid[];
  v_computed_ids uuid[];
  v_safe_ids uuid[];
  v_cutoff_ids uuid[];
  v_outcome_ids uuid[];
  v_cutoff_count integer;
  v_safe_winner_count integer;
  v_cutoff_slots integer;
  v_cutoff_tie_count integer;
  v_selected_cutoff_count integer;
  v_has_cutoff_tie boolean := false;
  v_basis text;
  v_previous_finalization text :=
    current_setting('ironclad.poll_finalization', true);
  v_tournament_title text;
begin
  perform public.assert_poll_service_role();
  if v_actor is null then
    raise exception 'Poll administrator is required' using errcode = '22023';
  end if;
  if v_rationale is not null and char_length(v_rationale) > 1000 then
    raise exception 'Final rationale cannot exceed 1000 characters'
      using errcode = '22023';
  end if;

  select poll.*
  into v_poll
  from public.polls as poll
  where poll.id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found';
  end if;
  v_now := pg_catalog.clock_timestamp();
  if v_poll.purpose <> 'tournament_decision'
    or v_poll.published_at is null
    or v_poll.cancelled_at is not null then
    raise exception 'Tournament Decision is unavailable for final publication'
      using errcode = '55000';
  end if;
  if v_now < v_poll.closes_at then
    raise exception 'A poll cannot be finalized before its database close time'
      using errcode = '55000';
  end if;
  if v_poll.final_decision_published_at is not null then
    raise exception 'Final poll decision is already published'
      using errcode = '55000';
  end if;

  select count(*) filter (
    where eligible.first_voted_at is not null
  )::integer
  into v_submitted_ballot_count
  from public.poll_eligible_voters as eligible
  where eligible.poll_id = p_poll_id;

  if v_poll.authority = 'binding' and v_submitted_ballot_count = 0 then
    raise exception 'Zero-ballot Binding polls must be cancelled and replaced'
      using errcode = '55000';
  end if;

  if coalesce(cardinality(p_selected_option_ids), 0) > 0 then
    if array_position(p_selected_option_ids, null) is not null then
      raise exception 'Final decision options are invalid'
        using errcode = '22023';
    end if;
    select count(distinct option_id)::integer,
      pg_catalog.array_agg(distinct option_id order by option_id)
    into v_selected_count, v_selected_ids
    from unnest(p_selected_option_ids) as option_id;
    if v_selected_count <> cardinality(p_selected_option_ids) then
      raise exception 'Final decision options must be distinct'
        using errcode = '22023';
    end if;
    select count(*)::integer
    into v_valid_selected_count
    from public.poll_options as option
    where option.poll_id = p_poll_id
      and option.id = any(v_selected_ids);
    if v_valid_selected_count <> v_selected_count then
      raise exception 'Final decision options are invalid'
        using errcode = '22023';
    end if;
  else
    v_selected_count := 0;
    v_selected_ids := array[]::uuid[];
  end if;

  with option_counts as (
    select option.id, option.position,
      count(choice.option_id)::integer as vote_count
    from public.poll_options as option
    left join public.poll_ballot_choices as choice
      on choice.poll_id = option.poll_id
      and choice.option_id = option.id
    where option.poll_id = p_poll_id
    group by option.id
  ), ranked as (
    select option_counts.*,
      row_number() over (
        order by option_counts.vote_count desc, option_counts.position
      )::integer as result_rank,
      dense_rank() over (
        order by option_counts.vote_count desc
      )::integer as vote_rank
    from option_counts
  )
  select pg_catalog.array_agg(ranked.id order by ranked.result_rank)
  into v_computed_ids
  from ranked
  where ranked.result_rank <= v_poll.winner_count;

  if v_poll.authority = 'advisory' then
    if v_selected_count <> v_poll.winner_count then
      raise exception 'Advisory final decisions require exactly winner_count options'
        using errcode = '22023';
    end if;

    -- Advisory Admins may publish any option set, but the unqualified poll
    -- result is the deterministic top-K set (votes DESC, published position).
    -- Choosing another set -- including another fill from an aggregate cutoff
    -- tie -- is an Admin override and therefore requires an explanation.
    if not (
      v_selected_ids @> v_computed_ids
      and v_computed_ids @> v_selected_ids
    ) then
      if v_rationale is null then
        raise exception 'An Advisory override requires a rationale'
          using errcode = '22023';
      end if;
      v_basis := 'advisory_admin_override';
    else
      v_basis := 'advisory_poll_result';
    end if;

    with option_counts as (
      select option.id, option.position,
        count(choice.option_id)::integer as vote_count
      from public.poll_options as option
      left join public.poll_ballot_choices as choice
        on choice.poll_id = option.poll_id
        and choice.option_id = option.id
      where option.poll_id = p_poll_id
      group by option.id
    )
    select pg_catalog.array_agg(
      option_counts.id
      order by option_counts.vote_count desc, option_counts.position
    )
    into v_outcome_ids
    from option_counts
    where option_counts.id = any(v_selected_ids);
  else
    with option_counts as (
      select option.id, option.position,
        count(choice.option_id)::integer as vote_count
      from public.poll_options as option
      left join public.poll_ballot_choices as choice
        on choice.poll_id = option.poll_id
        and choice.option_id = option.id
      where option.poll_id = p_poll_id
      group by option.id
    ), ranked as (
      select option_counts.*,
        row_number() over (
          order by option_counts.vote_count desc, option_counts.position
        )::integer as result_rank
      from option_counts
    )
    select ranked.vote_count
    into v_cutoff_count
    from ranked
    where ranked.result_rank = v_poll.winner_count;

    with option_counts as (
      select option.id, option.position,
        count(choice.option_id)::integer as vote_count
      from public.poll_options as option
      left join public.poll_ballot_choices as choice
        on choice.poll_id = option.poll_id
        and choice.option_id = option.id
      where option.poll_id = p_poll_id
      group by option.id
    )
    select coalesce(
        pg_catalog.array_agg(
          option_counts.id
          order by option_counts.vote_count desc, option_counts.position
        ) filter (where option_counts.vote_count > v_cutoff_count),
        array[]::uuid[]
      ),
      coalesce(
        pg_catalog.array_agg(
          option_counts.id order by option_counts.position
        ) filter (where option_counts.vote_count = v_cutoff_count),
        array[]::uuid[]
      )
    into v_safe_ids, v_cutoff_ids
    from option_counts;

    v_safe_winner_count := cardinality(v_safe_ids);
    v_cutoff_tie_count := cardinality(v_cutoff_ids);
    v_cutoff_slots := v_poll.winner_count - v_safe_winner_count;
    v_has_cutoff_tie := v_cutoff_tie_count > v_cutoff_slots;

    if v_has_cutoff_tie then
      if v_selected_count <> v_cutoff_slots
        or exists (
          select 1 from unnest(v_selected_ids) as selected_id
          where not (selected_id = any(v_cutoff_ids))
        ) then
        raise exception 'Cutoff tie selections must come only from the tied cutoff group'
          using errcode = '22023';
      end if;

      select count(*)::integer
      into v_selected_cutoff_count
      from unnest(v_selected_ids) as selected_id
      where selected_id = any(v_cutoff_ids);

      if v_selected_cutoff_count <> v_cutoff_slots then
        raise exception 'Select exactly enough tied cutoff options to fill the remaining winner slots'
          using errcode = '22023';
      end if;

      with option_counts as (
        select option.id, option.position,
          count(choice.option_id)::integer as vote_count
        from public.poll_options as option
        left join public.poll_ballot_choices as choice
          on choice.poll_id = option.poll_id
          and choice.option_id = option.id
        where option.poll_id = p_poll_id
        group by option.id
      )
      select pg_catalog.array_agg(
        option_counts.id
        order by option_counts.vote_count desc, option_counts.position
      )
      into v_outcome_ids
      from option_counts
      where option_counts.id = any(v_safe_ids)
        or option_counts.id = any(v_selected_ids);

      v_basis := 'binding_cutoff_tiebreak';
    else
      if v_selected_count <> 0 then
        raise exception 'Binding outcome is computed unless a cutoff tie requires Admin input'
          using errcode = '22023';
      end if;
      v_outcome_ids := v_computed_ids;
      v_basis := 'binding_computed';
    end if;
  end if;

  perform pg_catalog.set_config(
    'ironclad.poll_finalization',
    'on',
    true
  );

  update public.poll_options as option
  set final_decision_rank = pg_catalog.array_position(v_outcome_ids, option.id),
    final_decision_selected_at = v_now
  where option.poll_id = p_poll_id
    and option.id = any(v_outcome_ids);

  update public.polls
  set final_decision_basis = v_basis,
    final_rationale = v_rationale,
    binding_tie_rule_used = v_has_cutoff_tie,
    final_decision_published_at = v_now,
    final_decision_published_by_clerk_user_id = v_actor,
    updated_by_clerk_user_id = v_actor
  where id = p_poll_id;

  perform pg_catalog.set_config(
    'ironclad.poll_finalization',
    coalesce(v_previous_finalization, ''),
    true
  );

  select tournament.title
  into v_tournament_title
  from public.tournaments as tournament
  where tournament.id = v_poll.tournament_id;

  insert into public.notifications (
    recipient_clerk_user_id,
    recipient_role,
    type,
    title,
    message,
    tournament_id,
    tournament_title,
    metadata,
    event_key
  )
  select
    player.clerk_user_id,
    'player',
    'poll.decision_published',
    'Tournament decision published',
    pg_catalog.format('The final decision for "%s" is now available.', v_poll.question),
    v_poll.tournament_id,
    v_tournament_title,
    pg_catalog.jsonb_build_object(
      'pollId', p_poll_id,
      'purpose', v_poll.purpose,
      'tournamentId', v_poll.tournament_id
    ),
    pg_catalog.format('poll:%s:decision-published', p_poll_id)
  from public.poll_eligible_voters as eligible
  join public.players as player on player.id = eligible.player_id
  where eligible.poll_id = p_poll_id
    and v_poll.purpose = 'tournament_decision'
  order by player.id
  on conflict (recipient_clerk_user_id, event_key)
    where event_key is not null
  do nothing;

  return pg_catalog.jsonb_build_object(
    'poll_id', p_poll_id,
    'final_decision_published_at', v_now,
    'final_decision_basis', v_basis,
    'binding_tie_rule_used', v_has_cutoff_tie,
    'selected_option_ids', pg_catalog.to_jsonb(v_outcome_ids)
  );
end;
$$;

alter function public.finalize_poll_decision(uuid, uuid[], text, text)
  owner to postgres;
revoke all on function public.finalize_poll_decision(uuid, uuid[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_poll_decision(uuid, uuid[], text, text)
  to service_role;

create function public.get_public_tournament_decisions(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  v_decision record;
  v_eligible_count integer;
  v_submitted_ballot_count integer;
  v_options jsonb;
  v_polls jsonb := '[]'::jsonb;
begin
  for v_decision in
    select poll.*
    from public.polls as poll
    where poll.purpose = 'tournament_decision'
      and poll.tournament_id = p_tournament_id
      and poll.cancelled_at is null
      and poll.final_decision_published_at is not null
    order by poll.final_decision_published_at desc, poll.id
  loop
    select count(*)::integer,
      count(*) filter (where eligible.first_voted_at is not null)::integer
    into v_eligible_count, v_submitted_ballot_count
    from public.poll_eligible_voters as eligible
    where eligible.poll_id = v_decision.id;

    with option_counts as (
      select option.id, option.position, option.label_snapshot,
        option.coh3_map_id, option.map_display_name_snapshot,
        option.map_slug_snapshot, option.final_decision_rank,
        count(choice.option_id)::integer as vote_count
      from public.poll_options as option
      left join public.poll_ballot_choices as choice
        on choice.poll_id = option.poll_id
        and choice.option_id = option.id
      where option.poll_id = v_decision.id
      group by option.id
    ), ranked as (
      select option_counts.*,
        rank() over (
          order by option_counts.vote_count desc
        )::integer as poll_result_rank
      from option_counts
    )
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ranked.id,
          'position', ranked.position,
          'label', ranked.label_snapshot,
          'map', case when ranked.coh3_map_id is null then null else
            pg_catalog.jsonb_build_object(
              'id', ranked.coh3_map_id,
              'name', ranked.map_display_name_snapshot,
              'slug', ranked.map_slug_snapshot
            ) end,
          'poll_result_rank', case
            when ranked.poll_result_rank <= v_decision.winner_count
              then ranked.poll_result_rank else null end,
          'final_decision_rank', ranked.final_decision_rank
        )
        || case when v_decision.public_final_totals then
          pg_catalog.jsonb_build_object(
            'vote_count', ranked.vote_count,
            'selection_share_percent', case
              when v_submitted_ballot_count > 0 then pg_catalog.round(
                100.0 * ranked.vote_count / v_submitted_ballot_count,
                1
              )
              else 0
            end
          )
        else '{}'::jsonb end
        order by ranked.position
      ),
      '[]'::jsonb
    )
    into v_options
    from ranked;

    v_polls := v_polls || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_decision.id,
        'purpose', v_decision.purpose,
        'audience_kind', v_decision.audience_kind,
        'tournament_id', v_decision.tournament_id,
        'tournament_bracket_id', v_decision.tournament_bracket_id,
        'question', v_decision.question,
        'context', v_decision.context,
        'option_source', v_decision.option_source,
        'max_selections', v_decision.max_selections,
        'winner_count', v_decision.winner_count,
        'authority', v_decision.authority,
        'result_visibility', v_decision.result_visibility,
        'public_final_totals', v_decision.public_final_totals,
        'opens_at', v_decision.opens_at,
        'closes_at', v_decision.closes_at,
        'published_at', v_decision.published_at,
        'cancelled_at', null,
        'cancellation_reason', null,
        'final_decision_basis', v_decision.final_decision_basis,
        'final_rationale', v_decision.final_rationale,
        'binding_tie_rule_used', v_decision.binding_tie_rule_used,
        'final_decision_published_at',
          v_decision.final_decision_published_at,
        'status', 'final_decision_published',
        'options', v_options
      )
      || case when v_decision.public_final_totals then
        pg_catalog.jsonb_build_object(
          'eligible_count', v_eligible_count,
          'submitted_ballot_count', v_submitted_ballot_count
        )
      else '{}'::jsonb end
    );
  end loop;

  return pg_catalog.jsonb_build_object('polls', v_polls);
end;
$$;

alter function public.get_public_tournament_decisions(uuid) owner to postgres;
revoke all on function public.get_public_tournament_decisions(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_tournament_decisions(uuid)
  to anon, authenticated, service_role;

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

  if v_player_found then
    update public.polls as poll
    set draft_audience_invalidated = true
    where poll.published_at is null
      and poll.audience_kind in (
        'selected_tournament_players',
        'selected_active_players'
      )
      and exists (
        select 1
        from public.poll_eligible_voters as selected
        where selected.poll_id = poll.id
          and selected.player_id = v_player.id
      );

    delete from public.poll_eligible_voters as selected
    using public.polls as poll
    where selected.poll_id = poll.id
      and selected.player_id = v_player.id
      and poll.published_at is null;

    update public.poll_eligible_voters as eligible
    set player_id = null
    from public.polls as poll
    where eligible.poll_id = poll.id
      and eligible.player_id = v_player.id
      and poll.published_at is not null;
  end if;

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

  update public.coh3_maps
  set
    created_by_clerk_user_id = case
      when created_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else created_by_clerk_user_id
    end,
    updated_by_clerk_user_id = case
      when updated_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else updated_by_clerk_user_id
    end
  where created_by_clerk_user_id = v_clerk_user_id
    or updated_by_clerk_user_id = v_clerk_user_id;

  update public.tournament_bracket_map_pool_corrections
  set actor_clerk_user_id = v_closed_identity
  where actor_clerk_user_id = v_clerk_user_id;

  update public.polls
  set
    created_by_clerk_user_id = case
      when created_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else created_by_clerk_user_id
    end,
    updated_by_clerk_user_id = case
      when updated_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else updated_by_clerk_user_id
    end,
    published_by_clerk_user_id = case
      when published_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else published_by_clerk_user_id
    end,
    cancelled_by_clerk_user_id = case
      when cancelled_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else cancelled_by_clerk_user_id
    end,
    final_decision_published_by_clerk_user_id = case
      when final_decision_published_by_clerk_user_id = v_clerk_user_id
        then v_closed_identity
      else final_decision_published_by_clerk_user_id
    end
  where created_by_clerk_user_id = v_clerk_user_id
    or updated_by_clerk_user_id = v_clerk_user_id
    or published_by_clerk_user_id = v_clerk_user_id
    or cancelled_by_clerk_user_id = v_clerk_user_id
    or final_decision_published_by_clerk_user_id = v_clerk_user_id;

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
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

create or replace function public.delete_tournament_data(
  p_tournament_id uuid,
  p_deleted_by text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_title text;
  v_banner_image_url text;
  v_banner_path text;
  v_banner_paths text[] := array[]::text[];
  v_counts jsonb;
  v_proof_paths text[];
  v_job_id uuid;
  v_banner_marker constant text :=
    '/storage/v1/object/public/tournament-banners/';
begin
  if p_deleted_by is null or pg_catalog.btrim(p_deleted_by) = '' then
    raise exception 'Deleting administrator is required';
  end if;

  select title, banner_image_url
  into v_tournament_title, v_banner_image_url
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  perform 1
  from public.tournament_brackets as bracket
  where bracket.tournament_id = p_tournament_id
  order by bracket.id
  for update;

  perform 1
  from public.registrations as registration
  where registration.tournament_id = p_tournament_id
    or registration.tournament_bracket_id in (
      select bracket.id
      from public.tournament_brackets as bracket
      where bracket.tournament_id = p_tournament_id
    )
  order by registration.id
  for update;

  perform 1
  from public.polls as poll
  where poll.tournament_id = p_tournament_id
  order by poll.id
  for update;

  if exists (
    select 1
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.launched_at is not null
  )
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
        and (
          match.status <> 'scheduled'
          or match.player_one_score is not null
          or match.player_two_score is not null
          or match.winner_registration_id is not null
          or match.official_result_submission_id is not null
          or match.official_result_decided_by is not null
          or match.official_result_decided_at is not null
          or match.outcome_type is not null
        )
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
      from public.match_result_report_groups as report_group
      where report_group.tournament_id = p_tournament_id
        or report_group.match_id in (
          select match.id
          from public.tournament_matches as match
          join public.generated_brackets as generated
            on generated.id = match.generated_bracket_id
          join public.tournament_brackets as bracket
            on bracket.id = generated.tournament_bracket_id
          where bracket.tournament_id = p_tournament_id
        )
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
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Tournament has launched or contains competitive history and cannot be permanently deleted.';
  end if;

  -- Published Tournament Decision history is an authoritative Feature C fact.
  -- Draft polls cascade with an otherwise disposable tournament.
  if exists (
    select 1
    from public.polls as poll
    where poll.tournament_id = p_tournament_id
      and poll.purpose = 'tournament_decision'
      and poll.published_at is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Tournament has published Tournament Decision history and cannot be permanently deleted.';
  end if;

  if position(v_banner_marker in coalesce(v_banner_image_url, '')) > 0 then
    v_banner_path := pg_catalog.split_part(
      pg_catalog.split_part(v_banner_image_url, v_banner_marker, 2),
      '?',
      1
    );
    if v_banner_path <> '' then
      v_banner_paths := array[v_banner_path];
    end if;
  end if;

  v_counts := public.get_tournament_deletion_preview(p_tournament_id);

  select coalesce(
    pg_catalog.array_agg(distinct proof.path),
    array[]::text[]
  )
  into v_proof_paths
  from (
    select submission.replay_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.replay_storage_path is not null
    union all
    select submission.screenshot_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.screenshot_storage_path is not null
    union all
    select report_group.replay_storage_path as path
    from public.match_result_report_groups as report_group
    where report_group.tournament_id = p_tournament_id
      and report_group.replay_storage_path is not null
  ) as proof;

  insert into public.tournament_deletion_jobs (
    tournament_id,
    tournament_title,
    requested_by,
    proof_paths,
    banner_paths,
    deleted_counts
  )
  values (
    p_tournament_id,
    v_tournament_title,
    p_deleted_by,
    v_proof_paths,
    v_banner_paths,
    v_counts
  )
  returning id into v_job_id;

  perform pg_catalog.set_config(
    'ironclad.tournament_deletion',
    'on',
    true
  );

  delete from public.match_result_submissions
  where match_id in (
    select match.id
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
  );

  delete from public.generated_brackets
  where tournament_bracket_id in (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  );

  delete from public.registrations
  where tournament_id = p_tournament_id
    or tournament_bracket_id in (
      select id
      from public.tournament_brackets
      where tournament_id = p_tournament_id
    );

  delete from public.tournament_brackets
  where tournament_id = p_tournament_id;

  delete from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament deletion did not remove the tournament';
  end if;

  return pg_catalog.jsonb_build_object(
    'job_id', v_job_id,
    'tournament_title', v_tournament_title,
    'proof_paths', pg_catalog.to_jsonb(v_proof_paths),
    'banner_paths', pg_catalog.to_jsonb(v_banner_paths),
    'deleted_counts', v_counts
  );
end;
$$;

alter function public.delete_tournament_data(uuid, text) owner to postgres;
revoke all on function public.delete_tournament_data(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_tournament_data(uuid, text)
  to service_role;

commit;
