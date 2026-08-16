begin;

-- Feature A is deliberately limited to the current eight-player 1v1 launch
-- format. Refuse rather than silently rewriting any incompatible live row.
do $$
declare
  v_conflicting_brackets integer;
begin
  select count(*)::integer
  into v_conflicting_brackets
  from public.tournament_brackets as bracket
  where bracket.max_players <> 8;

  if v_conflicting_brackets > 0 then
    raise exception
      'Feature A requires exactly eight players; % tournament Division rows conflict',
      v_conflicting_brackets;
  end if;
end;
$$;

alter table public.tournament_brackets
  drop constraint if exists tournament_brackets_max_players_check;
alter table public.tournament_brackets
  add constraint tournament_brackets_max_players_check
  check (max_players = 8);

alter table public.tournament_brackets
  add column map_pool_published_at timestamptz;

create table public.coh3_maps (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  slug text not null check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 100
  ),
  display_name text not null
    check (btrim(display_name) <> '' and char_length(display_name) <= 120),
  normalized_name text generated always as (
    lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g'))
  ) stored,
  source_type text not null
    check (source_type in ('official', 'community')),
  creator_name text
    check (creator_name is null or (
      btrim(creator_name) <> '' and char_length(creator_name) <= 120
    )),
  game_mode text not null default '1v1'
    check (game_mode = '1v1'),
  status text not null
    check (status in ('active', 'retired', 'temporarily_disabled')),
  thumbnail_path text
    check (thumbnail_path is null or (
      char_length(thumbnail_path) <= 500
      and left(thumbnail_path, 1) = '/'
      and left(thumbnail_path, 2) <> '//'
      and position(E'\\' in thumbnail_path) = 0
      and position('..' in thumbnail_path) = 0
    )),
  source_reference text
    check (source_reference is null or (
      btrim(source_reference) <> '' and char_length(source_reference) <= 500
    )),
  admin_note text
    check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by_clerk_user_id text not null
    check (btrim(created_by_clerk_user_id) <> ''),
  updated_by_clerk_user_id text not null
    check (btrim(updated_by_clerk_user_id) <> ''),
  constraint coh3_maps_slug_unique unique (slug),
  constraint coh3_maps_normalized_name_unique unique (normalized_name)
);

create table public.tournament_bracket_map_pool_corrections (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  actor_clerk_user_id text not null
    check (btrim(actor_clerk_user_id) <> ''),
  reason text not null check (reason in (
    'technical_issue',
    'exploit',
    'game_update',
    'competitive_integrity'
  )),
  explanation text not null check (
    btrim(explanation) <> '' and char_length(explanation) <= 500
  ),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tournament_bracket_id)
);

create table public.tournament_bracket_map_pool_entries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  coh3_map_id uuid not null
    references public.coh3_maps(id) on delete restrict,
  added_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  added_by_correction_id uuid,
  removed_by_correction_id uuid,
  constraint tournament_map_pool_entry_time_order_check check (
    removed_at is null or removed_at >= added_at
  ),
  constraint tournament_map_pool_entry_removed_correction_check check (
    removed_by_correction_id is null or removed_at is not null
  ),
  constraint tournament_map_pool_entry_added_correction_fk
    foreign key (added_by_correction_id, tournament_bracket_id)
    references public.tournament_bracket_map_pool_corrections(
      id,
      tournament_bracket_id
    ) on delete no action deferrable initially deferred,
  constraint tournament_map_pool_entry_removed_correction_fk
    foreign key (removed_by_correction_id, tournament_bracket_id)
    references public.tournament_bracket_map_pool_corrections(
      id,
      tournament_bracket_id
    ) on delete no action deferrable initially deferred
);

create unique index tournament_bracket_map_pool_entries_current_unique
  on public.tournament_bracket_map_pool_entries(
    tournament_bracket_id,
    coh3_map_id
  )
  where removed_at is null;
create index tournament_bracket_map_pool_entries_bracket_history_idx
  on public.tournament_bracket_map_pool_entries(
    tournament_bracket_id,
    added_at,
    id
  );
create index tournament_bracket_map_pool_corrections_bracket_created_idx
  on public.tournament_bracket_map_pool_corrections(
    tournament_bracket_id,
    created_at,
    id
  );

alter table public.coh3_maps enable row level security;
alter table public.coh3_maps force row level security;
alter table public.tournament_bracket_map_pool_entries
  enable row level security;
alter table public.tournament_bracket_map_pool_entries
  force row level security;
alter table public.tournament_bracket_map_pool_corrections
  enable row level security;
alter table public.tournament_bracket_map_pool_corrections
  force row level security;

revoke all on table public.coh3_maps
  from public, anon, authenticated, service_role;
revoke all on table public.tournament_bracket_map_pool_entries
  from public, anon, authenticated, service_role;
revoke all on table public.tournament_bracket_map_pool_corrections
  from public, anon, authenticated, service_role;
grant select on table public.coh3_maps to service_role;
grant select on table public.tournament_bracket_map_pool_entries
  to service_role;
grant select on table public.tournament_bracket_map_pool_corrections
  to service_role;

-- Current official 1v1 maps verified against Relic/SEGA's release and
-- maintenance notes through CoH3 2.5.3. This intentionally excludes non-1v1
-- maps, retired technical scenarios, and subjective Workshop selections.
insert into public.coh3_maps (
  id,
  slug,
  display_name,
  source_type,
  creator_name,
  game_mode,
  status,
  thumbnail_path,
  source_reference,
  admin_note,
  created_by_clerk_user_id,
  updated_by_clerk_user_id
) values
  ('00000000-0000-4000-8000-000000000001', 'twin-beaches', 'Twin Beaches', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as a maintained official 1v1 map on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000002', 'road-to-tunis', 'Road to Tunis', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as a maintained official 1v1 map on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000003', 'taranto-coastline', 'Taranto Coastline', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as a maintained official competitive 1v1 map on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000004', 'gardens', 'Gardens', 'official', null, '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/discussions/7/601897212769778816/', 'Verified as official 1v1 content on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000005', 'pachino-stalemate', 'Pachino Stalemate', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as the current official 1v1 Pachino map on 2026-08-15; legacy Pachino Farmlands 1v1 is excluded.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000006', 'villa-fiore', 'Villa Fiore', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as official Automatch, Co-op vs AI, Skirmish and Custom 1v1 content on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000007', 'semois', 'Semois', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Verified as retained official 1v1 content on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000008', 'faymonville', 'Faymonville', 'official', 'Kpen and AE', '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Officially integrated community-authored 1v1 map; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000009', 'blinder-alley', 'Blinder Alley', 'official', null, '1v1', 'active', null, 'https://help.relic.com/hc/en-us/articles/39307744455571-Company-of-Heroes-3-Patch-Notes-Archive', 'Official 1v1 Skirmish and Custom map; not represented as Quick Match content. Verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000010', 'angoville', 'Angoville', 'official', null, '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/discussions/7/601897212769778816/', 'Added as official 1v1 content in update 2.0; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000011', 'langres', 'Langres', 'official', 'Michael Scharhag (m1chi)', '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/discussions/7/601897212769778816/', 'Officially integrated community-authored 1v1 map; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000012', 'crossing-in-the-woods', 'Crossing in the Woods', 'official', 'OnkelSam', '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/discussions/7/601897212769778816/', 'Officially integrated community-authored 1v1 map; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000013', 'djebel-pass', 'Djebel Pass', 'official', 'GBPirate', '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/discussions/7/601897212769778816/', 'Official Community Map retained in 1v1 after its later team-map conversion; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000014', 'tuscan-vineyard', 'Tuscan Vineyard', 'official', null, '1v1', 'active', null, 'https://steamcommunity.com/games/1677280/announcements/detail/527598150402179270', 'Added as official 1v1 content in update 2.1; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000015', 'bologna', 'Bologna', 'official', 'Brian', '1v1', 'active', null, 'https://steamcommunity.com/games/1677280/announcements/detail/623313605272537292', 'Officially integrated community-authored 1v1 map; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000016', 'egletons', 'Égletons', 'official', 'DutchToast and FoolishViceroy (original: Cam51)', '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/announcements/', 'Officially integrated community-authored 1v1 map in update 2.3; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed'),
  ('00000000-0000-4000-8000-000000000017', 'butcher-and-bolt', 'Butcher & Bolt', 'official', null, '1v1', 'active', null, 'https://steamcommunity.com/app/1677280/announcements/', 'Added as official 1v1 content in update 2.5; verified on 2026-08-15.', 'system:official-map-seed', 'system:official-map-seed');

-- Terminal tournaments retain pools as factual read-only context. Trusted
-- account closure and hard-delete workflows keep their existing narrow bypass.
create function public.guard_tournament_map_pool_terminal_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_bracket_id uuid;
  v_new_bracket_id uuid;
  v_tournament_id uuid;
  v_trusted_bypass boolean :=
    (session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role')
    and (
      coalesce(current_setting('ironclad.tournament_deletion', true), '') = 'on'
      or coalesce(current_setting('ironclad.account_closure', true), '') = 'on'
    );
begin
  if v_trusted_bypass then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_bracket_id := old.tournament_bracket_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_bracket_id := new.tournament_bracket_id;
  end if;

  for v_tournament_id in
    select distinct bracket.tournament_id
    from public.tournament_brackets as bracket
    where bracket.id = any(array[v_old_bracket_id, v_new_bracket_id])
  loop
    perform public.assert_tournament_not_terminal(v_tournament_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_tournament_map_pool_terminal_mutation()
  owner to postgres;
revoke all on function public.guard_tournament_map_pool_terminal_mutation()
  from public, anon, authenticated, service_role;

create trigger tournament_map_pool_entries_guard_terminal
before insert or update or delete
on public.tournament_bracket_map_pool_entries
for each row execute function
  public.guard_tournament_map_pool_terminal_mutation();

create trigger tournament_map_pool_corrections_guard_terminal
before insert or update or delete
on public.tournament_bracket_map_pool_corrections
for each row execute function
  public.guard_tournament_map_pool_terminal_mutation();

create function public.save_coh3_map(
  p_map_id uuid,
  p_slug text,
  p_display_name text,
  p_source_type text,
  p_creator_name text,
  p_game_mode text,
  p_status text,
  p_thumbnail_path text,
  p_source_reference text,
  p_admin_note text,
  p_actor_clerk_user_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_map_id uuid := coalesce(p_map_id, pg_catalog.gen_random_uuid());
  v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
  v_slug text := nullif(btrim(p_slug), '');
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Map catalogue mutation requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor is null then
    raise exception 'Map catalogue administrator is required'
      using errcode = '22023';
  end if;

  if v_slug is null then
    raise exception 'Map slug is required'
      using errcode = '22023';
  end if;

  if p_map_id is not null then
    perform map.id
    from public.coh3_maps as map
    where map.id = p_map_id
    for update;

    if not found then
      raise exception 'CoH3 map not found';
    end if;

    if not exists (
      select 1
      from public.coh3_maps as map
      where map.id = p_map_id
        and map.slug = v_slug
    ) then
      raise exception 'A map slug cannot be changed after creation'
        using errcode = '22023';
    end if;

    update public.coh3_maps
    set
      display_name = regexp_replace(btrim(p_display_name), '\s+', ' ', 'g'),
      source_type = p_source_type,
      creator_name = nullif(btrim(p_creator_name), ''),
      game_mode = p_game_mode,
      status = p_status,
      thumbnail_path = nullif(btrim(p_thumbnail_path), ''),
      source_reference = nullif(btrim(p_source_reference), ''),
      admin_note = nullif(btrim(p_admin_note), ''),
      updated_at = clock_timestamp(),
      updated_by_clerk_user_id = v_actor
    where id = p_map_id;
  else
    insert into public.coh3_maps (
      id,
      slug,
      display_name,
      source_type,
      creator_name,
      game_mode,
      status,
      thumbnail_path,
      source_reference,
      admin_note,
      created_by_clerk_user_id,
      updated_by_clerk_user_id
    ) values (
      v_map_id,
      v_slug,
      regexp_replace(btrim(p_display_name), '\s+', ' ', 'g'),
      p_source_type,
      nullif(btrim(p_creator_name), ''),
      p_game_mode,
      p_status,
      nullif(btrim(p_thumbnail_path), ''),
      nullif(btrim(p_source_reference), ''),
      nullif(btrim(p_admin_note), ''),
      v_actor,
      v_actor
    );
  end if;

  return v_map_id;
end;
$$;

alter function public.save_coh3_map(
  uuid, text, text, text, text, text, text, text, text, text, text
) owner to postgres;
revoke all on function public.save_coh3_map(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_coh3_map(
  uuid, text, text, text, text, text, text, text, text, text, text
) to service_role;

create function public.publish_tournament_bracket_map_pools(
  p_tournament_id uuid,
  p_bracket_ids uuid[],
  p_map_ids uuid[],
  p_actor_clerk_user_id text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
  v_tournament_status text;
  v_requested_bracket_count integer;
  v_matching_bracket_count integer;
  v_map_count integer;
  v_eligible_map_count integer;
  v_published_at timestamptz := clock_timestamp();
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Map-pool publication requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor is null then
    raise exception 'Publishing administrator is required'
      using errcode = '22023';
  end if;

  if p_tournament_id is null
    or coalesce(cardinality(p_bracket_ids), 0) = 0
    or array_position(p_bracket_ids, null) is not null then
    raise exception 'Select at least one valid tournament Division';
  end if;

  select count(distinct bracket_id)::integer
  into v_requested_bracket_count
  from unnest(p_bracket_ids) as bracket_id;

  if v_requested_bracket_count <> cardinality(p_bracket_ids) then
    raise exception 'Select each tournament Division only once';
  end if;

  if coalesce(cardinality(p_map_ids), 0) < 5
    or array_position(p_map_ids, null) is not null then
    raise exception 'A published Division pool requires five distinct maps';
  end if;

  select count(distinct map_id)::integer
  into v_map_count
  from unnest(p_map_ids) as map_id;

  if v_map_count <> cardinality(p_map_ids) then
    raise exception 'A published Division pool cannot contain duplicate maps';
  end if;

  select tournament.status
  into v_tournament_status
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if v_tournament_status in ('cancelled', 'voided', 'completed') then
    raise exception 'This tournament is read-only';
  end if;

  perform bracket.id
  from public.tournament_brackets as bracket
  where bracket.id = any(p_bracket_ids)
    and bracket.tournament_id = p_tournament_id
  order by bracket.id
  for update;

  select count(*)::integer
  into v_matching_bracket_count
  from public.tournament_brackets as bracket
  where bracket.id = any(p_bracket_ids)
    and bracket.tournament_id = p_tournament_id
    and bracket.launched_at is null
    and bracket.max_players = 8;

  if v_matching_bracket_count <> v_requested_bracket_count then
    raise exception
      'Every selected Division must belong to the tournament, be unlaunched, and have an eight-player capacity';
  end if;

  perform entry.id
  from public.tournament_bracket_map_pool_entries as entry
  where entry.tournament_bracket_id = any(p_bracket_ids)
    and entry.removed_at is null
  order by entry.tournament_bracket_id, entry.id
  for update;

  perform map.id
  from public.coh3_maps as map
  where map.id = any(p_map_ids)
  order by map.id
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where map.status = 'active'
        and map.game_mode = '1v1'
    )::integer
  into v_map_count, v_eligible_map_count
  from public.coh3_maps as map
  where map.id = any(p_map_ids);

  if v_map_count <> cardinality(p_map_ids)
    or v_eligible_map_count <> cardinality(p_map_ids) then
    raise exception 'Published pools require existing active 1v1 maps only';
  end if;

  update public.tournament_bracket_map_pool_entries as entry
  set removed_at = v_published_at
  where entry.tournament_bracket_id = any(p_bracket_ids)
    and entry.removed_at is null
    and not (entry.coh3_map_id = any(p_map_ids));

  insert into public.tournament_bracket_map_pool_entries (
    tournament_bracket_id,
    coh3_map_id,
    added_at
  )
  select bracket_id, map_id, v_published_at
  from unnest(p_bracket_ids) as bracket_id
  cross join unnest(p_map_ids) as map_id
  where not exists (
    select 1
    from public.tournament_bracket_map_pool_entries as current_entry
    where current_entry.tournament_bracket_id = bracket_id
      and current_entry.coh3_map_id = map_id
      and current_entry.removed_at is null
  );

  update public.tournament_brackets as bracket
  set map_pool_published_at = v_published_at
  where bracket.id = any(p_bracket_ids);

  return v_published_at;
end;
$$;

alter function public.publish_tournament_bracket_map_pools(
  uuid, uuid[], uuid[], text
) owner to postgres;
revoke all on function public.publish_tournament_bracket_map_pools(
  uuid, uuid[], uuid[], text
) from public, anon, authenticated, service_role;
grant execute on function public.publish_tournament_bracket_map_pools(
  uuid, uuid[], uuid[], text
) to service_role;

create function public.correct_tournament_bracket_map_pool(
  p_tournament_bracket_id uuid,
  p_map_ids uuid[],
  p_reason text,
  p_explanation text,
  p_actor_clerk_user_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := nullif(btrim(p_actor_clerk_user_id), '');
  v_explanation text := nullif(btrim(p_explanation), '');
  v_tournament_id uuid;
  v_tournament_status text;
  v_launched_at timestamptz;
  v_map_count integer;
  v_eligible_map_count integer;
  v_correction_id uuid := pg_catalog.gen_random_uuid();
  v_corrected_at timestamptz := clock_timestamp();
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Map-pool correction requires the trusted server boundary'
      using errcode = '42501';
  end if;

  if v_actor is null then
    raise exception 'Correcting administrator is required'
      using errcode = '22023';
  end if;

  if p_reason not in (
    'technical_issue',
    'exploit',
    'game_update',
    'competitive_integrity'
  ) then
    raise exception 'Select an approved correction reason';
  end if;

  if v_explanation is null or char_length(v_explanation) > 500 then
    raise exception 'Enter a correction explanation of 500 characters or fewer';
  end if;

  if coalesce(cardinality(p_map_ids), 0) < 5
    or array_position(p_map_ids, null) is not null then
    raise exception 'A corrected Division pool requires five distinct maps';
  end if;

  select count(distinct map_id)::integer
  into v_map_count
  from unnest(p_map_ids) as map_id;

  if v_map_count <> cardinality(p_map_ids) then
    raise exception 'A corrected Division pool cannot contain duplicate maps';
  end if;

  select bracket.tournament_id
  into v_tournament_id
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id;

  if not found then
    raise exception 'Tournament Division not found';
  end if;

  select tournament.status
  into v_tournament_status
  from public.tournaments as tournament
  where tournament.id = v_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  select bracket.launched_at
  into v_launched_at
  from public.tournament_brackets as bracket
  where bracket.id = p_tournament_bracket_id
    and bracket.tournament_id = v_tournament_id
    and bracket.max_players = 8
    and bracket.map_pool_published_at is not null
  for update;

  if not found or v_launched_at is null then
    raise exception
      'Only a launched eight-player Division with a published pool can be corrected';
  end if;

  if v_tournament_status <> 'in_progress' then
    raise exception 'Only an active nonterminal tournament can be corrected';
  end if;

  perform entry.id
  from public.tournament_bracket_map_pool_entries as entry
  where entry.tournament_bracket_id = p_tournament_bracket_id
    and entry.removed_at is null
  order by entry.id
  for update;

  perform map.id
  from public.coh3_maps as map
  where map.id = any(p_map_ids)
  order by map.id
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where map.status = 'active'
        and map.game_mode = '1v1'
    )::integer
  into v_map_count, v_eligible_map_count
  from public.coh3_maps as map
  where map.id = any(p_map_ids);

  if v_map_count <> cardinality(p_map_ids)
    or v_eligible_map_count <> cardinality(p_map_ids) then
    raise exception 'Corrected pools require existing active 1v1 maps only';
  end if;

  if not exists (
    (
      select current_entry.coh3_map_id
      from public.tournament_bracket_map_pool_entries as current_entry
      where current_entry.tournament_bracket_id = p_tournament_bracket_id
        and current_entry.removed_at is null
      except
      select map_id from unnest(p_map_ids) as map_id
    )
    union all
    (
      select map_id from unnest(p_map_ids) as map_id
      except
      select current_entry.coh3_map_id
      from public.tournament_bracket_map_pool_entries as current_entry
      where current_entry.tournament_bracket_id = p_tournament_bracket_id
        and current_entry.removed_at is null
    )
  ) then
    raise exception 'The corrected map pool must change at least one map';
  end if;

  insert into public.tournament_bracket_map_pool_corrections (
    id,
    tournament_bracket_id,
    actor_clerk_user_id,
    reason,
    explanation,
    created_at
  ) values (
    v_correction_id,
    p_tournament_bracket_id,
    v_actor,
    p_reason,
    v_explanation,
    v_corrected_at
  );

  update public.tournament_bracket_map_pool_entries as entry
  set
    removed_at = v_corrected_at,
    removed_by_correction_id = v_correction_id
  where entry.tournament_bracket_id = p_tournament_bracket_id
    and entry.removed_at is null
    and not (entry.coh3_map_id = any(p_map_ids));

  insert into public.tournament_bracket_map_pool_entries (
    tournament_bracket_id,
    coh3_map_id,
    added_at,
    added_by_correction_id
  )
  select
    p_tournament_bracket_id,
    map_id,
    v_corrected_at,
    v_correction_id
  from unnest(p_map_ids) as map_id
  where not exists (
    select 1
    from public.tournament_bracket_map_pool_entries as current_entry
    where current_entry.tournament_bracket_id = p_tournament_bracket_id
      and current_entry.coh3_map_id = map_id
      and current_entry.removed_at is null
  );

  return v_correction_id;
end;
$$;

alter function public.correct_tournament_bracket_map_pool(
  uuid, uuid[], text, text, text
) owner to postgres;
revoke all on function public.correct_tournament_bracket_map_pool(
  uuid, uuid[], text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.correct_tournament_bracket_map_pool(
  uuid, uuid[], text, text, text
) to service_role;

-- Keep the authoritative launch core and first-round activation in one
-- transaction. This validation runs after the core has taken its established
-- tournament/Division locks but before match activation; any failure rolls the
-- complete launch transaction back.
create or replace function public.launch_tournament_division(
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
  v_launch record;
  v_generated_bracket_id uuid;
  v_match_id uuid;
  v_max_players integer;
  v_map_pool_published_at timestamptz;
  v_entry_count integer;
  v_distinct_map_count integer;
  v_eligible_map_count integer;
begin
  select result.*
  into v_launch
  from public.launch_tournament_division_without_matchup_activation(
    p_tournament_bracket_id,
    p_actor_clerk_user_id
  ) as result;

  if not found then
    raise exception 'Division launch did not return a result';
  end if;

  if not v_launch.already_launched then
    select
      bracket.max_players,
      bracket.map_pool_published_at
    into
      v_max_players,
      v_map_pool_published_at
    from public.tournament_brackets as bracket
    where bracket.id = p_tournament_bracket_id;

    if v_max_players <> 8 then
      raise exception 'Division launch capacity must be exactly eight players';
    end if;

    if v_map_pool_published_at is null then
      raise exception 'Publish the Division map pool before launch';
    end if;

    perform entry.id
    from public.tournament_bracket_map_pool_entries as entry
    where entry.tournament_bracket_id = p_tournament_bracket_id
      and entry.removed_at is null
    order by entry.id
    for update;

    perform map.id
    from public.coh3_maps as map
    join public.tournament_bracket_map_pool_entries as entry
      on entry.coh3_map_id = map.id
    where entry.tournament_bracket_id = p_tournament_bracket_id
      and entry.removed_at is null
    order by map.id
    for update of map;

    select
      count(*)::integer,
      count(distinct entry.coh3_map_id)::integer,
      count(*) filter (
        where map.status = 'active'
          and map.game_mode = '1v1'
      )::integer
    into
      v_entry_count,
      v_distinct_map_count,
      v_eligible_map_count
    from public.tournament_bracket_map_pool_entries as entry
    join public.coh3_maps as map
      on map.id = entry.coh3_map_id
    where entry.tournament_bracket_id = p_tournament_bracket_id
      and entry.removed_at is null;

    if v_entry_count < 5
      or v_distinct_map_count <> v_entry_count
      or v_eligible_map_count <> v_entry_count then
      raise exception
        'Division launch requires at least five distinct active 1v1 pool maps';
    end if;
  end if;

  select generated.id
  into v_generated_bracket_id
  from public.generated_brackets as generated
  where generated.tournament_bracket_id = p_tournament_bracket_id;

  for v_match_id in
    select match.id
    from public.tournament_matches as match
    join public.bracket_rounds as round
      on round.id = match.round_id
    where match.generated_bracket_id = v_generated_bracket_id
      and round.round_number = 1
    order by match.match_number, match.id
  loop
    perform public.activate_tournament_match_if_ready(v_match_id, false);
  end loop;

  tournament_id := v_launch.tournament_id;
  tournament_bracket_id := v_launch.tournament_bracket_id;
  launched_at := v_launch.launched_at;
  already_launched := v_launch.already_launched;
  return next;
end;
$$;

alter function public.launch_tournament_division(uuid, text)
  owner to postgres;
revoke all on function public.launch_tournament_division(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.launch_tournament_division(uuid, text)
  to service_role;

-- Preserve every Phase 7 closure behavior and extend its one generated
-- pseudonym to the Feature A actor-attribution fields. Map activity does not
-- become authoritative competition history.
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

comment on table public.coh3_maps is
  'Authoritative manually maintained CoH3 map catalogue.';
comment on table public.tournament_bracket_map_pool_entries is
  'Temporal per-Division map-pool membership; current rows have removed_at null.';
comment on table public.tournament_bracket_map_pool_corrections is
  'Auditable exceptional corrections to launched Division map pools.';
comment on column public.tournament_brackets.map_pool_published_at is
  'Latest pre-launch publication timestamp; launched_at remains the freeze boundary.';

commit;
