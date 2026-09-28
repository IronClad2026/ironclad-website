begin;

-- A Ranked Operation is immediate Company matchmaking. opened_at and
-- expires_at are supplied from one authoritative creation timestamp; the
-- constraint below makes the one-hour OPEN window exact without a scheduler.
create table public.warfront_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenger_company_id uuid not null
    references public.warfront_companies(id) on delete restrict,
  opponent_company_id uuid
    references public.warfront_companies(id) on delete restrict,
  format text not null,
  series_best_of smallint not null,
  region text,
  notes text,
  status text not null default 'open',
  opened_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  started_at timestamptz,
  roster_locked_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by_player_id uuid not null
    references public.players(id) on delete restrict,
  accepted_by_player_id uuid
    references public.players(id) on delete restrict,
  challenger_roster_elo_snapshot numeric(8, 4) not null,
  opponent_roster_elo_snapshot numeric(8, 4),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint warfront_operations_companies_check check (
    opponent_company_id is null
    or opponent_company_id <> challenger_company_id
  ),
  constraint warfront_operations_format_check check (
    format in ('2v2', '3v3', '4v4')
  ),
  constraint warfront_operations_series_best_of_check check (
    series_best_of in (3, 5)
  ),
  constraint warfront_operations_region_check check (
    region is null
    or (
      region = pg_catalog.btrim(region)
      and pg_catalog.char_length(region) between 1 and 80
      and region !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_operations_notes_check check (
    notes is null
    or (
      notes = pg_catalog.btrim(notes)
      and pg_catalog.char_length(notes) between 1 and 1000
      and pg_catalog.replace(
        pg_catalog.replace(notes, pg_catalog.chr(10), ''),
        pg_catalog.chr(13),
        ''
      ) !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_operations_status_check check (
    status in (
      'open',
      'accepted',
      'in_progress',
      'pending_result',
      'completed',
      'expired',
      'cancelled'
    )
  ),
  constraint warfront_operations_expiration_check check (
    expires_at = opened_at + interval '1 hour'
  ),
  constraint warfront_operations_challenger_elo_check check (
    challenger_roster_elo_snapshot between 0 and 5000
  ),
  constraint warfront_operations_opponent_elo_check check (
    opponent_roster_elo_snapshot is null
    or opponent_roster_elo_snapshot between 0 and 5000
  ),
  constraint warfront_operations_acceptance_bundle_check check (
    pg_catalog.num_nonnulls(
      opponent_company_id,
      accepted_by_player_id,
      opponent_roster_elo_snapshot,
      accepted_at,
      roster_locked_at
    ) in (0, 5)
  ),
  constraint warfront_operations_acceptance_time_check check (
    accepted_at is null
    or (accepted_at >= opened_at and accepted_at < expires_at)
  ),
  constraint warfront_operations_roster_lock_time_check check (
    roster_locked_at is null
    or (
      accepted_at is not null
      and roster_locked_at >= accepted_at
      and roster_locked_at < expires_at
    )
  ),
  constraint warfront_operations_started_time_check check (
    started_at is null
    or (
      roster_locked_at is not null
      and started_at >= roster_locked_at
    )
  ),
  constraint warfront_operations_completed_time_check check (
    completed_at is null
    or (started_at is not null and completed_at >= started_at)
  ),
  constraint warfront_operations_cancelled_time_check check (
    cancelled_at is null
    or (
      cancelled_at >= opened_at
      and (accepted_at is null or cancelled_at >= accepted_at)
      and (started_at is null or cancelled_at >= started_at)
    )
  ),
  constraint warfront_operations_lifecycle_state_check check (
    (status = 'open'
      and accepted_at is null
      and started_at is null
      and completed_at is null
      and cancelled_at is null)
    or (status = 'accepted'
      and accepted_at is not null
      and started_at is null
      and completed_at is null
      and cancelled_at is null)
    or (status in ('in_progress', 'pending_result')
      and accepted_at is not null
      and started_at is not null
      and completed_at is null
      and cancelled_at is null)
    or (status = 'completed'
      and accepted_at is not null
      and started_at is not null
      and completed_at is not null
      and cancelled_at is null)
    or (status = 'expired'
      and accepted_at is null
      and started_at is null
      and completed_at is null
      and cancelled_at is null)
    or (status = 'cancelled'
      and completed_at is null
      and cancelled_at is not null)
  ),
  constraint warfront_operations_updated_at_check check (
    updated_at >= created_at
  )
);

create index warfront_operations_open_matchmaking_idx
  on public.warfront_operations(
    format,
    series_best_of,
    region,
    expires_at,
    id
  )
  where status = 'open';

create index warfront_operations_challenger_history_idx
  on public.warfront_operations(
    challenger_company_id,
    opened_at desc,
    id
  );

create index warfront_operations_opponent_history_idx
  on public.warfront_operations(
    opponent_company_id,
    accepted_at desc,
    id
  )
  where opponent_company_id is not null;

-- Roster entries are immutable participant and matchmaking evidence. Company
-- identity is derived from operation_id plus side, so it is not duplicated.
create table public.warfront_operation_roster_entries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  side text not null,
  player_id uuid not null
    references public.players(id) on delete restrict,
  elo_snapshot integer not null,
  selected_at timestamptz not null,
  selected_by_player_id uuid not null
    references public.players(id) on delete restrict,
  constraint warfront_operation_roster_entries_side_check check (
    side in ('challenger', 'opponent')
  ),
  constraint warfront_operation_roster_entries_elo_check check (
    elo_snapshot between 0 and 5000
  )
);

-- This stronger key also prevents duplicate players within one side.
create unique index warfront_operation_roster_entries_player_key
  on public.warfront_operation_roster_entries(operation_id, player_id);

create index warfront_operation_roster_entries_side_idx
  on public.warfront_operation_roster_entries(
    operation_id,
    side,
    selected_at,
    id
  );

-- One composite key admits exactly one authoritative roll per Company side,
-- Game and tie round, even when multiple locked-roster players race to roll.
create table public.warfront_operation_dice_rolls (
  operation_id uuid not null
    references public.warfront_operations(id) on delete restrict,
  side text not null,
  game_number smallint not null,
  tie_round integer not null,
  rolled_by_player_id uuid not null
    references public.players(id) on delete restrict,
  die_1 smallint not null,
  die_2 smallint not null,
  rolled_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint warfront_operation_dice_rolls_side_check check (
    side in ('challenger', 'opponent')
  ),
  constraint warfront_operation_dice_rolls_game_check check (
    game_number in (1, 3, 5)
  ),
  constraint warfront_operation_dice_rolls_tie_round_check check (
    tie_round >= 1
  ),
  constraint warfront_operation_dice_rolls_die_1_check check (
    die_1 between 1 and 6
  ),
  constraint warfront_operation_dice_rolls_die_2_check check (
    die_2 between 1 and 6
  ),
  constraint warfront_operation_dice_rolls_pkey primary key (
    operation_id,
    game_number,
    tie_round,
    side
  )
);

drop trigger if exists warfront_operations_set_updated_at
  on public.warfront_operations;
create trigger warfront_operations_set_updated_at
before update on public.warfront_operations
for each row execute function public.ironclad_set_updated_at();

alter table public.warfront_operations owner to postgres;
alter table public.warfront_operations enable row level security;
alter table public.warfront_operations force row level security;

alter table public.warfront_operation_roster_entries owner to postgres;
alter table public.warfront_operation_roster_entries enable row level security;
alter table public.warfront_operation_roster_entries force row level security;

alter table public.warfront_operation_dice_rolls owner to postgres;
alter table public.warfront_operation_dice_rolls enable row level security;
alter table public.warfront_operation_dice_rolls force row level security;

revoke all on table public.warfront_operations
  from public, anon, authenticated, service_role;
revoke all on table public.warfront_operation_roster_entries
  from public, anon, authenticated, service_role;
revoke all on table public.warfront_operation_dice_rolls
  from public, anon, authenticated, service_role;

grant select on table public.warfront_operations to service_role;
grant select on table public.warfront_operation_roster_entries to service_role;
grant select on table public.warfront_operation_dice_rolls to service_role;

comment on table public.warfront_operations is
  'Private Ranked Operation lifecycle and immutable Company-level matchmaking ELO snapshots. Expired OPEN rows are interpreted by expires_at until a future authority persists terminal state.';
comment on table public.warfront_operation_roster_entries is
  'Private immutable roster identity and individual current-ELO snapshots. Exact format-sized rosters and actor membership are enforced by future authoritative RPCs.';
comment on table public.warfront_operation_dice_rolls is
  'Private immutable 2d6 facts for WARFRONT Company-side roll-offs. Game eligibility and locked-roster roller authority are enforced by future authoritative RPCs.';

commit;
