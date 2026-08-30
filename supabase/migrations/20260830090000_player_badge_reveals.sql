begin;

alter table public.player_badge_awards
  add constraint player_badge_awards_id_player_unique
  unique (id, player_id);

create table public.player_badge_reveals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  player_badge_award_id uuid not null,
  player_id uuid not null
    references public.players(id) on delete cascade,
  revealed_at timestamptz not null default pg_catalog.clock_timestamp(),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint player_badge_reveals_award_unique
    unique (player_badge_award_id),
  constraint player_badge_reveals_owned_award_fk
    foreign key (player_badge_award_id, player_id)
    references public.player_badge_awards(id, player_id)
    on delete cascade
);

create index player_badge_reveals_player_revealed_idx
  on public.player_badge_reveals(player_id, revealed_at desc);

alter table public.player_badge_reveals enable row level security;
alter table public.player_badge_reveals force row level security;

revoke all on table public.player_badge_reveals
  from public, anon, authenticated, service_role;

grant select on table public.player_badge_reveals to authenticated;
grant insert (player_badge_award_id, player_id)
  on table public.player_badge_reveals to authenticated;
grant all privileges on table public.player_badge_reveals
  to service_role;

create policy "Players can read their own badge reveals"
on public.player_badge_reveals
for select
to authenticated
using (
  exists (
    select 1
    from public.players as player
    where player.id = player_badge_reveals.player_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

create policy "Players can acknowledge their own badge reveals"
on public.player_badge_reveals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.players as player
    where player.id = player_badge_reveals.player_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

comment on table public.player_badge_reveals is
  'Presentation-only acknowledgement state for immutable badge awards. Award ownership remains authoritative in player_badge_awards.';
comment on column public.player_badge_reveals.player_badge_award_id is
  'The owned badge award acknowledged by its authenticated player. One row is allowed per award.';
comment on column public.player_badge_reveals.revealed_at is
  'Database-owned time when the player intentionally acknowledged the reveal.';

commit;
