\set ON_ERROR_STOP on

-- Reproducible Feature A database contract.
--
-- Run this only against a disposable/local database or an explicitly approved
-- non-Production project after the Feature A migration has been applied. The
-- caller must be able to SET ROLE postgres. No credentials or project identity
-- are embedded here. All fixture mutations occur in one transaction and are
-- rolled back; the session-local baseline survives solely to prove zero residue.

set client_min_messages = warning;
set role postgres;
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"feature-a-contract-admin"}';

create temporary table feature_a_contract_baseline
on commit preserve rows
as
select
  pg_catalog.jsonb_build_object(
    'coh3_maps', (
      select count(*) from public.coh3_maps
    ),
    'pool_entries', (
      select count(*)
      from public.tournament_bracket_map_pool_entries
    ),
    'pool_corrections', (
      select count(*)
      from public.tournament_bracket_map_pool_corrections
    ),
    'tournaments', (
      select count(*) from public.tournaments
    ),
    'tournament_brackets', (
      select count(*) from public.tournament_brackets
    ),
    'registrations', (
      select count(*) from public.registrations
    ),
    'generated_brackets', (
      select count(*) from public.generated_brackets
    ),
    'bracket_rounds', (
      select count(*) from public.bracket_rounds
    ),
    'tournament_matches', (
      select count(*) from public.tournament_matches
    ),
    'notifications', (
      select count(*) from public.notifications
    ),
    'deletion_jobs', (
      select count(*) from public.tournament_deletion_jobs
    )
  ) as public_counts,
  (
    select count(*) from storage.buckets
  ) as storage_bucket_count,
  (
    select pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            bucket.id::text,
            bucket.name,
            bucket.public::text
          ),
          E'\n' order by bucket.id::text
        ),
        ''
      )
    )
    from storage.buckets as bucket
  ) as storage_bucket_digest,
  (
    select count(*) from storage.objects
  ) as storage_object_count,
  (
    select pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            object.id::text,
            object.bucket_id,
            object.name
          ),
          E'\n' order by object.id::text
        ),
        ''
      )
    )
    from storage.objects as object
  ) as storage_object_digest;

begin;

create function pg_temp.feature_a_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Feature A contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_pool_tournament constant uuid :=
    'fa000000-0000-4000-8000-000000000001';
  v_launch_tournament constant uuid :=
    'fa000000-0000-4000-8000-000000000002';
  v_pool_academy constant uuid :=
    'fb000000-0000-4000-8000-000000000001';
  v_pool_challenge constant uuid :=
    'fb000000-0000-4000-8000-000000000002';
  v_pool_main constant uuid :=
    'fb000000-0000-4000-8000-000000000003';
  v_launch_academy constant uuid :=
    'fb000000-0000-4000-8000-000000000004';
  v_actor constant text := 'feature-a-contract-admin';
  v_delete_actor constant text := 'feature-a-contract-delete-admin';
  v_map_1 constant uuid := '00000000-0000-4000-8000-000000000001';
  v_map_2 constant uuid := '00000000-0000-4000-8000-000000000002';
  v_map_3 constant uuid := '00000000-0000-4000-8000-000000000003';
  v_map_4 constant uuid := '00000000-0000-4000-8000-000000000004';
  v_map_5 constant uuid := '00000000-0000-4000-8000-000000000005';
  v_map_6 constant uuid := '00000000-0000-4000-8000-000000000006';
  v_map_7 constant uuid := '00000000-0000-4000-8000-000000000007';
  v_map_8 constant uuid := '00000000-0000-4000-8000-000000000008';
  v_map_9 constant uuid := '00000000-0000-4000-8000-000000000009';
  v_map_10 constant uuid := '00000000-0000-4000-8000-000000000010';
  v_maps_1_5 uuid[] := array[v_map_1, v_map_2, v_map_3, v_map_4, v_map_5];
  v_maps_2_6 uuid[] := array[v_map_2, v_map_3, v_map_4, v_map_5, v_map_6];
  v_maps_3_7 uuid[] := array[v_map_3, v_map_4, v_map_5, v_map_6, v_map_7];
  v_maps_6_10 uuid[] := array[v_map_6, v_map_7, v_map_8, v_map_9, v_map_10];
  v_community_map uuid;
  v_generated_bracket uuid;
  v_correction uuid;
  v_registration uuid;
  v_assignments jsonb;
  v_result jsonb;
  v_snapshot_before jsonb;
  v_snapshot_after jsonb;
  v_notification_count integer;
  v_notification_count_after integer;
  v_failed boolean;
  v_already_launched boolean;
  v_error text;
  v_state text;
  v_index integer;
begin
  -- Migration/schema/grant boundary.
  perform pg_temp.feature_a_assert(
    pg_catalog.to_regclass('public.coh3_maps') is not null
      and pg_catalog.to_regclass(
        'public.tournament_bracket_map_pool_entries'
      ) is not null
      and pg_catalog.to_regclass(
        'public.tournament_bracket_map_pool_corrections'
      ) is not null,
    'all three narrow Feature A tables must exist'
  );

  perform pg_temp.feature_a_assert(
    exists (
      select 1
      from information_schema.columns as column_definition
      where column_definition.table_schema = 'public'
        and column_definition.table_name = 'tournament_brackets'
        and column_definition.column_name = 'map_pool_published_at'
        and column_definition.data_type = 'timestamp with time zone'
    ),
    'map_pool_published_at must be a timestamptz column'
  );

  perform pg_temp.feature_a_assert(
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_definition
      join pg_catalog.pg_class as relation
        on relation.oid = constraint_definition.conrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'tournament_brackets'
        and constraint_definition.conname =
          'tournament_brackets_max_players_check'
        and pg_catalog.pg_get_constraintdef(
          constraint_definition.oid
        ) ~ 'max_players = 8'
    ),
    'the database capacity constraint must require exactly eight'
  );

  perform pg_temp.feature_a_assert(
    (
      select pg_catalog.bool_and(
        relation.relrowsecurity and relation.relforcerowsecurity
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in (
          'coh3_maps',
          'tournament_bracket_map_pool_entries',
          'tournament_bracket_map_pool_corrections'
        )
    ),
    'Feature A tables must have forced RLS'
  );

  perform pg_temp.feature_a_assert(
    not pg_catalog.has_table_privilege('anon', 'public.coh3_maps', 'SELECT')
      and not pg_catalog.has_table_privilege(
        'anon', 'public.coh3_maps', 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'anon', 'public.coh3_maps', 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'anon', 'public.coh3_maps', 'DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.coh3_maps', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.coh3_maps', 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.coh3_maps', 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', 'public.coh3_maps', 'DELETE'
      )
      and pg_catalog.has_table_privilege(
        'service_role', 'public.coh3_maps', 'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', 'public.coh3_maps', 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', 'public.coh3_maps', 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', 'public.coh3_maps', 'DELETE'
      ),
    'catalogue grants must expose trusted reads but no direct DML'
  );

  perform pg_temp.feature_a_assert(
    (
      select pg_catalog.bool_and(
        not pg_catalog.has_table_privilege(
          'anon', table_name, 'SELECT'
        )
          and not pg_catalog.has_table_privilege(
            'authenticated', table_name, 'SELECT'
          )
          and pg_catalog.has_table_privilege(
            'service_role', table_name, 'SELECT'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', table_name, 'INSERT'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', table_name, 'UPDATE'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', table_name, 'DELETE'
          )
      )
      from unnest(array[
        'public.tournament_bracket_map_pool_entries',
        'public.tournament_bracket_map_pool_corrections'
      ]) as restricted_table(table_name)
    ),
    'pool history grants must be trusted-read-only with no browser access'
  );

  perform pg_temp.feature_a_assert(
    pg_catalog.has_function_privilege(
      'service_role',
      'public.save_coh3_map(uuid,text,text,text,text,text,text,text,text,text,text)',
      'EXECUTE'
    )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.save_coh3_map(uuid,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.save_coh3_map(uuid,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.publish_tournament_bracket_map_pools(uuid,uuid[],uuid[],text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.publish_tournament_bracket_map_pools(uuid,uuid[],uuid[],text)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.correct_tournament_bracket_map_pool(uuid,uuid[],text,text,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.correct_tournament_bracket_map_pool(uuid,uuid[],text,text,text)',
        'EXECUTE'
      ),
    'mutations must be service-role-only trusted RPCs'
  );

  perform pg_temp.feature_a_assert(
    (
      select pg_catalog.bool_and(
        routine.prosecdef
          and routine.proconfig @> array['search_path=pg_catalog']::text[]
      )
      from pg_catalog.pg_proc as routine
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.oid in (
          'public.save_coh3_map(uuid,text,text,text,text,text,text,text,text,text,text)'::pg_catalog.regprocedure,
          'public.publish_tournament_bracket_map_pools(uuid,uuid[],uuid[],text)'::pg_catalog.regprocedure,
          'public.correct_tournament_bracket_map_pool(uuid,uuid[],text,text,text)'::pg_catalog.regprocedure,
          'public.launch_tournament_division(uuid,text)'::pg_catalog.regprocedure
        )
    ),
    'trusted RPCs must be SECURITY DEFINER with a fixed safe search_path'
  );

  -- Current official launch seed: 17 active official 1v1 maps, no subjective
  -- community seed, all with an IronClad slug and source provenance.
  perform pg_temp.feature_a_assert(
    (
      select count(*) = 17
        and count(*) filter (where source_type = 'official') = 17
        and count(*) filter (where game_mode = '1v1') = 17
        and count(*) filter (where status = 'active') = 17
        and count(*) filter (where source_reference is not null) = 17
        and count(distinct slug) = 17
        and count(distinct normalized_name) = 17
      from public.coh3_maps
      where created_by_clerk_user_id = 'system:official-map-seed'
    ),
    'the verified official seed must contain exactly 17 active 1v1 maps'
  );
  perform pg_temp.feature_a_assert(
    not exists (
      select 1
      from public.coh3_maps
      where created_by_clerk_user_id = 'system:official-map-seed'
        and source_type = 'community'
    ),
    'the migration must not seed subjective community maps'
  );
  perform pg_temp.feature_a_assert(
    (
      select count(*) = 17
      from public.coh3_maps
      where id >= '00000000-0000-4000-8000-000000000001'::uuid
        and id <= '00000000-0000-4000-8000-000000000017'::uuid
    ),
    'all deterministic official seed identities must exist'
  );
  perform pg_temp.feature_a_assert(
    pg_catalog.to_regclass('public.tournament_match_games') is null,
    'Feature A must not introduce per-Game or Dice state'
  );

  -- Manual community catalogue workflow and constraints.
  v_community_map := public.save_coh3_map(
    null,
    'feature-a-contract-community-map',
    '  Feature A   Contract Community Map  ',
    'community',
    'Contract Cartographer',
    '1v1',
    'active',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );

  perform pg_temp.feature_a_assert(
    exists (
      select 1
      from public.coh3_maps
      where id = v_community_map
        and slug = 'feature-a-contract-community-map'
        and display_name = 'Feature A Contract Community Map'
        and source_type = 'community'
        and creator_name = 'Contract Cartographer'
        and game_mode = '1v1'
        and status = 'active'
        and thumbnail_path is null
        and source_reference =
          'https://example.invalid/feature-a-contract-map'
        and admin_note = 'private Feature A contract note'
        and created_by_clerk_user_id = v_actor
        and updated_by_clerk_user_id = v_actor
    ),
    'an Admin must be able to create an attributed Community map without a thumbnail'
  );

  v_failed := false;
  begin
    perform public.save_coh3_map(
      null,
      'feature-a-contract-community-map',
      'Different Map Name',
      'community',
      null,
      '1v1',
      'active',
      null,
      null,
      null,
      v_actor
    );
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(v_failed, 'duplicate slugs must be rejected');

  v_failed := false;
  begin
    perform public.save_coh3_map(
      null,
      'feature-a-contract-duplicate-name',
      ' feature a contract community map ',
      'community',
      null,
      '1v1',
      'active',
      null,
      null,
      null,
      v_actor
    );
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(
    v_failed,
    'case/whitespace-normalized duplicate display names must be rejected'
  );

  v_failed := false;
  begin
    perform public.save_coh3_map(
      null,
      'feature-a-contract-team-map',
      'Feature A Contract Team Map',
      'community',
      null,
      '2v2',
      'active',
      null,
      null,
      null,
      v_actor
    );
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(
    v_failed,
    'the launch catalogue must accept 1v1 only'
  );

  v_failed := false;
  begin
    perform public.save_coh3_map(
      v_community_map,
      'feature-a-contract-community-map-renamed',
      'Feature A Contract Community Map',
      'community',
      'Contract Cartographer',
      '1v1',
      'active',
      null,
      'https://example.invalid/feature-a-contract-map',
      'private Feature A contract note',
      v_actor
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(v_failed, 'map slugs must be immutable');

  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'temporarily_disabled',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  perform pg_temp.feature_a_assert(
    (select status = 'temporarily_disabled'
      from public.coh3_maps where id = v_community_map),
    'an Admin must be able to temporarily disable a map'
  );
  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'retired',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  perform pg_temp.feature_a_assert(
    (select status = 'retired'
      from public.coh3_maps where id = v_community_map),
    'an Admin must be able to retire a map'
  );
  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'active',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );

  -- Two deterministic synthetic tournaments. The first owns all three launch
  -- Divisions and remains disposable; the second exercises a real eight-player
  -- bracket generation/assignment/launch lifecycle.
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
    v_pool_tournament,
    'Feature A Contract Disposable Tournament',
    'feature-a-contract-disposable-tournament',
    '1v1',
    'upcoming',
    'Rollback-only Feature A database contract fixture.',
    '',
    '',
    false
  );

  insert into public.tournaments (
    id,
    title,
    slug,
    format,
    status,
    description,
    banner_image_url,
    registration_open_at,
    registration_close_at,
    start_date,
    prize_pool,
    registration_enabled
  ) values (
    v_launch_tournament,
    'Feature A Contract Launch Tournament',
    'feature-a-contract-launch-tournament',
    '1v1',
    'registration_open',
    'Rollback-only Feature A launch fixture.',
    '',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '1 day',
    clock_timestamp() + interval '2 days',
    '',
    true
  );

  insert into public.tournament_brackets (
    id, tournament_id, name, elo_rules, max_players
  ) values
    (v_pool_academy, v_pool_tournament, 'Academy', '0-1099', 8),
    (v_pool_challenge, v_pool_tournament, 'Challenge', '1100-1399', 8),
    (v_pool_main, v_pool_tournament, 'Main', '1400+', 8),
    (v_launch_academy, v_launch_tournament, 'Academy', '0-1099', 8);

  v_failed := false;
  begin
    update public.tournament_brackets
    set max_players = 16
    where id = v_pool_academy;
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(
    v_failed
      and (select max_players = 8
        from public.tournament_brackets where id = v_pool_academy),
    'the database must reject a non-eight Division update atomically'
  );

  -- Independent Division publication and pre-launch replacement.
  perform public.publish_tournament_bracket_map_pools(
    v_pool_tournament,
    array[v_pool_academy],
    v_maps_1_5,
    v_actor
  );
  perform public.publish_tournament_bracket_map_pools(
    v_pool_tournament,
    array[v_pool_challenge],
    v_maps_2_6,
    v_actor
  );
  perform public.publish_tournament_bracket_map_pools(
    v_pool_tournament,
    array[v_pool_main],
    v_maps_3_7,
    v_actor
  );

  perform pg_temp.feature_a_assert(
    (
      select count(*) = 15
        and count(distinct tournament_bracket_id) = 3
      from public.tournament_bracket_map_pool_entries
      where tournament_bracket_id in (
        v_pool_academy, v_pool_challenge, v_pool_main
      )
        and removed_at is null
    )
      and (
        select count(*) = 3
        from public.tournament_brackets
        where id in (v_pool_academy, v_pool_challenge, v_pool_main)
          and map_pool_published_at is not null
      ),
    'Academy, Challenge and Main/Pro must publish independent five-map pools'
  );

  perform public.publish_tournament_bracket_map_pools(
    v_pool_tournament,
    array[v_pool_academy],
    v_maps_3_7,
    v_actor
  );
  perform pg_temp.feature_a_assert(
    (
      select count(*) = 5
      from public.tournament_bracket_map_pool_entries
      where tournament_bracket_id = v_pool_academy
        and removed_at is null
        and coh3_map_id = any(v_maps_3_7)
    )
      and (
        select count(*) = 7
          and count(*) filter (where removed_at is not null) = 2
        from public.tournament_bracket_map_pool_entries
        where tournament_bracket_id = v_pool_academy
      ),
    'pre-launch republish must replace the current pool and preserve temporal history'
  );

  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_pool_tournament,
      array[v_pool_main],
      array[v_map_1, v_map_2, v_map_3, v_map_4],
      v_actor
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_failed := v_error ilike '%five distinct maps%';
  end;
  perform pg_temp.feature_a_assert(v_failed, 'publication must require five maps');

  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_pool_tournament,
      array[v_pool_main],
      array[v_map_1, v_map_2, v_map_3, v_map_4, v_map_4],
      v_actor
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_failed := v_error ilike '%duplicate maps%';
  end;
  perform pg_temp.feature_a_assert(v_failed, 'publication must reject duplicates');

  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'temporarily_disabled',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_pool_tournament,
      array[v_pool_main],
      array[v_map_1, v_map_2, v_map_3, v_map_4, v_community_map],
      v_actor
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(v_failed, 'disabled maps must not publish');

  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'retired',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_pool_tournament,
      array[v_pool_main],
      array[v_map_1, v_map_2, v_map_3, v_map_4, v_community_map],
      v_actor
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(v_failed, 'retired maps must not publish');

  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'active',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'bracket', bracket.id,
      'published', bracket.map_pool_published_at,
      'maps', (
        select pg_catalog.jsonb_agg(entry.coh3_map_id order by entry.coh3_map_id)
        from public.tournament_bracket_map_pool_entries as entry
        where entry.tournament_bracket_id = bracket.id
          and entry.removed_at is null
      )
    ) order by bracket.id
  )
  into v_snapshot_before
  from public.tournament_brackets as bracket
  where bracket.id in (v_pool_academy, v_pool_challenge, v_pool_main);

  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_pool_tournament,
      array[v_pool_academy, v_launch_academy],
      v_maps_1_5,
      v_actor
    );
  exception when others then
    v_failed := true;
  end;
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'bracket', bracket.id,
      'published', bracket.map_pool_published_at,
      'maps', (
        select pg_catalog.jsonb_agg(entry.coh3_map_id order by entry.coh3_map_id)
        from public.tournament_bracket_map_pool_entries as entry
        where entry.tournament_bracket_id = bracket.id
          and entry.removed_at is null
      )
    ) order by bracket.id
  )
  into v_snapshot_after
  from public.tournament_brackets as bracket
  where bracket.id in (v_pool_academy, v_pool_challenge, v_pool_main);
  perform pg_temp.feature_a_assert(
    v_failed and v_snapshot_after = v_snapshot_before,
    'a foreign-Division multi-publication must roll back every Division'
  );

  -- The same-pool action is one atomic call, but each Division owns independent
  -- current membership rows and its own immutable launch snapshot.
  perform public.publish_tournament_bracket_map_pools(
    v_pool_tournament,
    array[v_pool_academy, v_pool_challenge, v_pool_main],
    v_maps_6_10,
    v_actor
  );
  perform pg_temp.feature_a_assert(
    (
      select count(*) = 15
      from public.tournament_bracket_map_pool_entries
      where tournament_bracket_id in (
        v_pool_academy, v_pool_challenge, v_pool_main
      )
        and removed_at is null
        and coh3_map_id = any(v_maps_6_10)
    )
      and (
        select count(distinct map_set) = 1
        from (
          select pg_catalog.array_agg(
            entry.coh3_map_id order by entry.coh3_map_id
          ) as map_set
          from public.tournament_bracket_map_pool_entries as entry
          where entry.tournament_bracket_id in (
            v_pool_academy, v_pool_challenge, v_pool_main
          )
            and entry.removed_at is null
          group by entry.tournament_bracket_id
        ) as pools
      )
      and (
        select count(distinct map_pool_published_at) = 1
        from public.tournament_brackets
        where id in (v_pool_academy, v_pool_challenge, v_pool_main)
      ),
    'same-pool publication must copy atomically to three independent Divisions'
  );

  -- Exactly eight approved registrations plus one deterministic waitlist row.
  for v_index in 1..8 loop
    v_registration := (
      'fc000000-0000-4000-8000-'
        || pg_catalog.lpad(v_index::text, 12, '0')
    )::uuid;
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
    ) values (
      v_registration,
      'feature-a-contract-player-' || v_index::text,
      'Feature A Contract Player ' || v_index::text,
      'Feature A Contract Launch Tournament',
      'Academy Bracket',
      'approved',
      'verified',
      '',
      v_launch_tournament,
      v_launch_academy,
      1000,
      1000,
      'US Forces',
      '1v1',
      clock_timestamp(),
      'relic',
      'Academy',
      'feature-a-contract'
    );
  end loop;

  perform pg_catalog.set_config('ironclad.waitlist_confirmed', 'on', true);
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
  ) values (
    'fc000000-0000-4000-8000-000000000009',
    'feature-a-contract-player-9',
    'Feature A Contract Player 9',
    'Feature A Contract Launch Tournament',
    'Academy Bracket',
    'waitlisted',
    'verified',
    '',
    v_launch_tournament,
    v_launch_academy,
    1000,
    1000,
    'US Forces',
    '1v1',
    clock_timestamp(),
    'relic',
    'Academy',
    'feature-a-contract'
  );
  perform pg_catalog.set_config('ironclad.waitlist_confirmed', 'off', true);

  perform pg_temp.feature_a_assert(
    (
      select count(*) filter (where registration_status = 'approved') = 8
        and count(*) filter (where registration_status = 'waitlisted') = 1
      from public.registrations
      where tournament_bracket_id = v_launch_academy
    ),
    'the launch fixture must retain the existing eight-player cohort and waitlist'
  );

  v_generated_bracket := public.generate_tournament_bracket(
    v_launch_academy,
    v_actor
  );
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'slot_number', slot_number,
      'registration_id', (
        'fc000000-0000-4000-8000-'
          || pg_catalog.lpad(slot_number::text, 12, '0')
      )::uuid
    ) order by slot_number
  )
  into v_assignments
  from pg_catalog.generate_series(1, 8) as slot_number;
  perform public.save_bracket_assignments(
    v_generated_bracket,
    v_assignments,
    v_actor
  );

  select count(*)::integer
  into v_notification_count
  from public.notifications
  where tournament_id = v_launch_tournament;

  -- The Feature A outer launch wrapper must roll the complete pre-existing
  -- launch mutation back when no pool is published.
  v_failed := false;
  begin
    perform 1
    from public.launch_tournament_division(v_launch_academy, v_actor);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_failed := v_error ilike '%map pool before launch%';
  end;
  perform pg_temp.feature_a_assert(
    v_failed,
    'launch without a published pool must fail at the Feature A boundary'
  );
  perform pg_temp.feature_a_assert(
    (select launched_at is null
      from public.tournament_brackets where id = v_launch_academy)
      and (select competition_locked_at is null
        from public.generated_brackets where id = v_generated_bracket)
      and (select status = 'registration_open' and registration_enabled
        from public.tournaments where id = v_launch_tournament)
      and (
        select count(*) = 4
        from public.tournament_matches as match
        join public.bracket_rounds as round on round.id = match.round_id
        where match.generated_bracket_id = v_generated_bracket
          and round.round_number = 1
          and match.status = 'scheduled'
          and match.activation_version = 0
          and match.activated_at is null
      )
      and (select registration_status = 'waitlisted'
        and waitlist_offer_status is null
        from public.registrations
        where id = 'fc000000-0000-4000-8000-000000000009')
      and (
        select count(*) = v_notification_count
        from public.notifications
        where tournament_id = v_launch_tournament
      ),
    'pool-validation failure must roll back launch, waitlist, match and notification changes'
  );

  -- Publish a currently valid pool, then disable one member. The launch-time
  -- revalidation must still reject it and retain full atomicity.
  perform public.publish_tournament_bracket_map_pools(
    v_launch_tournament,
    array[v_launch_academy],
    array[v_map_1, v_map_2, v_map_3, v_map_4, v_community_map],
    v_actor
  );
  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'temporarily_disabled',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  v_failed := false;
  begin
    perform 1
    from public.launch_tournament_division(v_launch_academy, v_actor);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_failed := v_error ilike '%active 1v1 pool maps%';
  end;
  perform pg_temp.feature_a_assert(
    v_failed
      and (select launched_at is null
        from public.tournament_brackets where id = v_launch_academy)
      and (select status = 'registration_open'
        from public.tournaments where id = v_launch_tournament)
      and (
        select count(*) = v_notification_count
        from public.notifications
        where tournament_id = v_launch_tournament
      ),
    'launch-time invalid-map rejection must be atomic'
  );

  perform public.save_coh3_map(
    v_community_map,
    'feature-a-contract-community-map',
    'Feature A Contract Community Map',
    'community',
    'Contract Cartographer',
    '1v1',
    'active',
    null,
    'https://example.invalid/feature-a-contract-map',
    'private Feature A contract note',
    v_actor
  );
  perform public.publish_tournament_bracket_map_pools(
    v_launch_tournament,
    array[v_launch_academy],
    v_maps_1_5,
    v_actor
  );

  select already_launched
  into v_already_launched
  from public.launch_tournament_division(v_launch_academy, v_actor);
  perform pg_temp.feature_a_assert(
    v_already_launched is false
      and (select launched_at is not null
        from public.tournament_brackets where id = v_launch_academy)
      and (select competition_locked_at is not null
        from public.generated_brackets where id = v_generated_bracket)
      and (select status = 'in_progress' and not registration_enabled
        from public.tournaments where id = v_launch_tournament)
      and (
        select count(*) = 4
        from public.tournament_matches as match
        join public.bracket_rounds as round on round.id = match.round_id
        where match.generated_bracket_id = v_generated_bracket
          and round.round_number = 1
          and match.status = 'in_progress'
          and match.activation_version = 1
          and match.activated_at is not null
      )
      and (
        select count(*) = 8
        from public.notifications
        where tournament_id = v_launch_tournament
          and type = 'match.ready'
      )
      and (
        select count(*) = 1
        from public.notifications
        where tournament_id = v_launch_tournament
          and type = 'registration.waitlist_closed'
      ),
    'a valid five-map pool must permit the normal atomic eight-player launch'
  );

  select count(*)::integer
  into v_notification_count
  from public.notifications
  where tournament_id = v_launch_tournament;
  select already_launched
  into v_already_launched
  from public.launch_tournament_division(v_launch_academy, v_actor);
  select count(*)::integer
  into v_notification_count_after
  from public.notifications
  where tournament_id = v_launch_tournament;
  perform pg_temp.feature_a_assert(
    v_already_launched
      and v_notification_count_after = v_notification_count,
    'idempotent relaunch must not duplicate notifications or state'
  );

  v_failed := false;
  begin
    perform public.publish_tournament_bracket_map_pools(
      v_launch_tournament,
      array[v_launch_academy],
      v_maps_2_6,
      v_actor
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(v_failed, 'normal publication must freeze at launch');

  v_failed := false;
  begin
    perform public.correct_tournament_bracket_map_pool(
      v_launch_academy,
      v_maps_2_6,
      'ordinary_edit',
      'This reason is deliberately outside the locked correction set.',
      v_actor
    );
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.feature_a_assert(
    v_failed,
    'post-launch correction must require a locked reason category'
  );

  v_correction := public.correct_tournament_bracket_map_pool(
    v_launch_academy,
    v_maps_2_6,
    'technical_issue',
    'Rollback-only validation of the auditable exceptional correction path.',
    v_actor
  );
  set constraints all immediate;
  perform pg_temp.feature_a_assert(
    exists (
      select 1
      from public.tournament_bracket_map_pool_corrections
      where id = v_correction
        and tournament_bracket_id = v_launch_academy
        and actor_clerk_user_id = v_actor
        and reason = 'technical_issue'
    )
      and (
        select count(*) = 5
        from public.tournament_bracket_map_pool_entries
        where tournament_bracket_id = v_launch_academy
          and removed_at is null
          and coh3_map_id = any(v_maps_2_6)
      )
      and (
        -- The launch pool was first published with the synthetic Community
        -- map, then republished with five official maps. That pre-launch row
        -- remains temporal history, so the correction brings the total to 7.
        select count(*) = 7
          and count(*) filter (
            where removed_by_correction_id = v_correction
          ) = 1
          and count(*) filter (
            where added_by_correction_id = v_correction
          ) = 1
        from public.tournament_bracket_map_pool_entries
        where tournament_bracket_id = v_launch_academy
      ),
    'correction must preserve old membership and audit both removed and added maps'
  );

  -- Hard-delete protects launched competition even though the pool itself is
  -- not what creates that protection.
  v_failed := false;
  begin
    perform public.delete_tournament_data(v_launch_tournament, v_delete_actor);
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_failed := v_error ilike '%cannot be permanently deleted%';
  end;
  perform pg_temp.feature_a_assert(
    v_failed and exists (
      select 1 from public.tournaments where id = v_launch_tournament
    ),
    'a launched/history-bearing tournament must remain hard-delete protected'
  );

  -- Cancel and Void each retain the published pool as read-only factual
  -- context. The intentionally raised private SQLSTATE rolls each terminal
  -- subcase back before exercising the other.
  begin
    v_result := public.cancel_tournament(
      v_launch_tournament,
      'Rollback-only Feature A cancellation case.',
      v_actor
    );
    perform pg_temp.feature_a_assert(
      v_result->>'outcome' = 'cancelled'
        and (select status = 'cancelled'
          from public.tournaments where id = v_launch_tournament)
        and (
          select count(*) = 5
          from public.tournament_bracket_map_pool_entries
          where tournament_bracket_id = v_launch_academy
            and removed_at is null
        ),
      'Cancel must retain the current published pool'
    );
    v_failed := false;
    begin
      perform public.correct_tournament_bracket_map_pool(
        v_launch_academy,
        v_maps_3_7,
        'exploit',
        'A terminal tournament must reject this correction.',
        v_actor
      );
    exception when others then
      v_failed := true;
    end;
    perform pg_temp.feature_a_assert(
      v_failed,
      'Cancelled tournaments must reject corrections'
    );
    raise exception using
      errcode = 'FA001',
      message = 'rollback cancellation subcase';
  exception when sqlstate 'FA001' then
    null;
  end;
  perform pg_temp.feature_a_assert(
    (select status = 'in_progress'
      from public.tournaments where id = v_launch_tournament),
    'the cancellation test subtransaction must roll back'
  );

  begin
    v_result := public.void_tournament(
      v_launch_tournament,
      'Rollback-only Feature A void case.',
      v_actor
    );
    perform pg_temp.feature_a_assert(
      v_result->>'outcome' = 'voided'
        and (select status = 'voided'
          from public.tournaments where id = v_launch_tournament)
        and (
          select count(*) = 5
          from public.tournament_bracket_map_pool_entries
          where tournament_bracket_id = v_launch_academy
            and removed_at is null
        ),
      'Void must retain the current published pool'
    );
    v_failed := false;
    begin
      perform public.correct_tournament_bracket_map_pool(
        v_launch_academy,
        v_maps_3_7,
        'game_update',
        'A terminal tournament must reject this correction.',
        v_actor
      );
    exception when others then
      v_failed := true;
    end;
    perform pg_temp.feature_a_assert(
      v_failed,
      'Voided tournaments must reject corrections'
    );
    raise exception using
      errcode = 'FA002',
      message = 'rollback void subcase';
  exception when sqlstate 'FA002' then
    null;
  end;
  perform pg_temp.feature_a_assert(
    (select status = 'in_progress'
      from public.tournaments where id = v_launch_tournament),
    'the void test subtransaction must roll back'
  );

  -- Phase 7 account closure generates one replacement identity and applies it
  -- to map and correction actor fields without turning map activity into
  -- authoritative competition history.
  v_result := public.close_ironclad_player_account(v_actor);
  perform pg_temp.feature_a_assert(
    v_result->>'outcome' = 'not_found'
      and (
        select created_by_clerk_user_id like 'deleted:%'
          and updated_by_clerk_user_id = created_by_clerk_user_id
        from public.coh3_maps
        where id = v_community_map
      )
      and (
        select correction.actor_clerk_user_id = map.created_by_clerk_user_id
        from public.tournament_bracket_map_pool_corrections as correction
        cross join public.coh3_maps as map
        where correction.id = v_correction
          and map.id = v_community_map
      ),
    'account closure must pseudonymize Feature A actor attribution consistently'
  );

  -- A draft/published pool alone is disposable. The existing trusted hard-delete
  -- path must cascade temporal pool rows and leave only its deletion job (which
  -- is itself rolled back by this contract's outer transaction).
  v_result := public.delete_tournament_data(
    v_pool_tournament,
    v_delete_actor
  );
  perform pg_temp.feature_a_assert(
    v_result ? 'job_id'
      and not exists (
        select 1 from public.tournaments where id = v_pool_tournament
      )
      and not exists (
        select 1
        from public.tournament_brackets
        where tournament_id = v_pool_tournament
      )
      and not exists (
        select 1
        from public.tournament_bracket_map_pool_entries
        where tournament_bracket_id in (
          v_pool_academy, v_pool_challenge, v_pool_main
        )
      )
      and exists (
        select 1
        from public.tournament_deletion_jobs
        where tournament_id = v_pool_tournament
      ),
    'a disposable unlaunched tournament must hard-delete despite published pools'
  );
end;
$$;

rollback;

do $$
declare
  v_baseline pg_temp.feature_a_contract_baseline%rowtype;
  v_public_counts jsonb;
  v_storage_bucket_count bigint;
  v_storage_bucket_digest text;
  v_storage_object_count bigint;
  v_storage_object_digest text;
begin
  select * into strict v_baseline
  from pg_temp.feature_a_contract_baseline;

  select pg_catalog.jsonb_build_object(
    'coh3_maps', (
      select count(*) from public.coh3_maps
    ),
    'pool_entries', (
      select count(*)
      from public.tournament_bracket_map_pool_entries
    ),
    'pool_corrections', (
      select count(*)
      from public.tournament_bracket_map_pool_corrections
    ),
    'tournaments', (
      select count(*) from public.tournaments
    ),
    'tournament_brackets', (
      select count(*) from public.tournament_brackets
    ),
    'registrations', (
      select count(*) from public.registrations
    ),
    'generated_brackets', (
      select count(*) from public.generated_brackets
    ),
    'bracket_rounds', (
      select count(*) from public.bracket_rounds
    ),
    'tournament_matches', (
      select count(*) from public.tournament_matches
    ),
    'notifications', (
      select count(*) from public.notifications
    ),
    'deletion_jobs', (
      select count(*) from public.tournament_deletion_jobs
    )
  ) into v_public_counts;

  select
    count(*),
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            bucket.id::text,
            bucket.name,
            bucket.public::text
          ),
          E'\n' order by bucket.id::text
        ),
        ''
      )
    )
  into v_storage_bucket_count, v_storage_bucket_digest
  from storage.buckets as bucket;

  select
    count(*),
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            object.id::text,
            object.bucket_id,
            object.name
          ),
          E'\n' order by object.id::text
        ),
        ''
      )
    )
  into v_storage_object_count, v_storage_object_digest
  from storage.objects as object;

  if v_public_counts is distinct from v_baseline.public_counts then
    raise exception 'Feature A contract left public-schema row-count residue';
  end if;
  if v_storage_bucket_count is distinct from v_baseline.storage_bucket_count
    or v_storage_bucket_digest is distinct from
      v_baseline.storage_bucket_digest
    or v_storage_object_count is distinct from
      v_baseline.storage_object_count
    or v_storage_object_digest is distinct from
      v_baseline.storage_object_digest then
    raise exception 'Feature A contract changed Storage state';
  end if;
  if exists (
    select 1
    from public.tournaments
    where id in (
      'fa000000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000002'
    )
      or slug like 'feature-a-contract-%'
  )
    or exists (
      select 1
      from public.tournament_brackets
      where id in (
        'fb000000-0000-4000-8000-000000000001',
        'fb000000-0000-4000-8000-000000000002',
        'fb000000-0000-4000-8000-000000000003',
        'fb000000-0000-4000-8000-000000000004'
      )
    )
    or exists (
      select 1
      from public.registrations
      where id >= 'fc000000-0000-4000-8000-000000000001'::uuid
        and id <= 'fc000000-0000-4000-8000-000000000009'::uuid
    )
    or exists (
      select 1
      from public.coh3_maps
      where slug like 'feature-a-contract-%'
        or created_by_clerk_user_id like 'feature-a-contract-%'
        or updated_by_clerk_user_id like 'feature-a-contract-%'
    )
    or exists (
      select 1
      from public.tournament_bracket_map_pool_corrections
      where actor_clerk_user_id like 'feature-a-contract-%'
    )
    or exists (
      select 1
      from public.notifications
      where recipient_clerk_user_id like 'feature-a-contract-%'
        or actor_clerk_user_id like 'feature-a-contract-%'
        or tournament_id in (
          'fa000000-0000-4000-8000-000000000001',
          'fa000000-0000-4000-8000-000000000002'
        )
    ) then
    raise exception 'Feature A deterministic fixture residue remains';
  end if;
end;
$$;

select pg_catalog.jsonb_build_object(
  'contract', 'feature-a-map-catalogue-division-pools',
  'seed_count', (
    select count(*)
    from public.coh3_maps
    where created_by_clerk_user_id = 'system:official-map-seed'
  ),
  'fixture_transaction', 'rolled_back',
  'zero_residue', true,
  'storage_unchanged', true
)::text;
