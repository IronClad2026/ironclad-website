-- STAGING ONLY: project_id zzbnneprhjicmajpjkdg, after migrations 20260909234122 and 20260910020800.
-- Run as ONE execute_sql request, or psql with ON_ERROR_STOP=1. Never split it.
-- Root must independently capture protected-data fingerprints before/after.
-- JWT claims below are simulated database-role tests, not real Clerk/browser auth.
-- Only existing approved actors, their Showcase rows, the feature flag and one
-- actor's public_profile_enabled are changed. Every change is rolled back.
-- No legal/award-authority/notification mutation, identity edit or account closure.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local client_min_messages = warning;

do $staging_guard$
declare v_history_hash text;
begin
  if current_user <> 'postgres' or session_user <> 'postgres'
    or current_setting('server_version_num')::integer < 150000
    or current_setting('server_encoding') <> 'UTF8' then
    raise exception 'Staging Showcase tests require the verified postgres/UTF8 context';
  end if;
  select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version)::text, 'UTF8')), 'hex')
  into v_history_hash from supabase_migrations.schema_migrations m
  where m.version not in ('20260909234122', '20260910020800');
  if v_history_hash is distinct from '86d032ff2d6bb18210713ef8d35304f52d4464d4fbbc471fa4a87146bf961891'
    or (select count(*) from supabase_migrations.schema_migrations) <> 150
    or not exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260909234122' and name = 'player_showcase_phase_a'
        and cardinality(statements) = 1
        and encode(sha256(convert_to(statements[1], 'UTF8')), 'hex')
          = '1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e'
    ) or not exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260910020800' and name = 'player_showcase_owner_read_rls'
        and cardinality(statements) = 1
        and encode(sha256(convert_to(statements[1], 'UTF8')), 'hex')
          = '78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319'
    ) or not exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260908052210' and name = 'member_rpc_current_account_acceptance'
        and cardinality(statements) = 18
        and encode(sha256(convert_to(to_jsonb(statements)::text, 'UTF8')), 'hex')
          = 'f3304fafe08da15ef7f941c0dff0067536a6ccbb482148a94b4a2c597ed780d1'
    ) then
    raise exception 'Staging historical pair, member RPC or Showcase ledger guard failed';
  end if;
  if to_regclass('public.player_showcases') is null
    or to_regclass('public.public_player_showcases') is null
    or not exists (select 1 from public.platform_settings
      where key = 'player_showcase' and value = '{"enabled":false}'::jsonb)
    or exists (select 1 from public.player_showcases
      where player_id in ('03f83118-81c9-438c-92db-b5d307547197', 'c0bfabca-11bb-4d90-92f9-77119debe15b'))
    or (select count(*) from public.players where account_closed_at is null
      and id in ('03f83118-81c9-438c-92db-b5d307547197', 'c0bfabca-11bb-4d90-92f9-77119debe15b')
      and ironclad_private.player_showcase_has_current_legal_acceptance(clerk_user_id)) <> 2
    or not exists (select 1 from public.players
      where id = '03f83118-81c9-438c-92db-b5d307547197' and public_profile_enabled is true)
    or not exists (select 1 from public.players
      where id = 'c0bfabca-11bb-4d90-92f9-77119debe15b' and public_profile_enabled is false)
    or exists (select 1 from ironclad_private.staging_synthetic_uat_players
      where player_id in ('03f83118-81c9-438c-92db-b5d307547197', 'c0bfabca-11bb-4d90-92f9-77119debe15b')) then
    raise exception 'Expected fresh ordinary Staging actors and disabled Showcase';
  end if;
end;
$staging_guard$;

create temporary table showcase_contract_checks (label text primary key);
create function pg_temp.showcase_assert(p_condition boolean, p_label text)
returns void language plpgsql security definer set search_path = pg_catalog as $assert$
begin
  if p_condition is distinct from true then
    raise exception 'Staging Showcase assertion failed: %', p_label;
  end if;
  insert into pg_temp.showcase_contract_checks(label) values (p_label);
end;
$assert$;
grant execute on function pg_temp.showcase_assert(boolean,text) to anon, authenticated, service_role;

create temporary table showcase_contract_awards as
select (array_agg(id order by id))[1] as first_award,
  (array_agg(id order by id))[2] as second_award
from public.player_badge_awards
where player_id = '03f83118-81c9-438c-92db-b5d307547197'
  and ironclad_private.player_showcase_badge_slug_allowed(badge_slug)
  and isfinite(unlocked_at);
grant select on pg_temp.showcase_contract_awards to authenticated, service_role;

do $catalog$
begin
  perform pg_temp.showcase_assert((select first_award is not null and second_award is not null
    and first_award <> second_award from pg_temp.showcase_contract_awards), 'two-existing-owned-canonical-awards');
  perform pg_temp.showcase_assert((select array_agg(attname::text order by attnum)
    from pg_attribute where attrelid = 'public.public_player_showcases'::regclass
      and attnum > 0 and not attisdropped)
    = array['player_id','current_thought','featured_badge_slug','featured_badge_unlocked_at'],
    'public-projection-four-safe-columns');
  perform pg_temp.showcase_assert(pg_get_viewdef('public.public_player_showcases'::regclass, true)
    ~* 'account_closed_at IS NULL'
    and pg_get_viewdef('public.public_player_showcases'::regclass, true) ~* 'public_profile_enabled IS TRUE',
    'closed-and-private-projection-predicates');
  perform pg_temp.showcase_assert(not has_table_privilege('authenticated','public.player_showcases','INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon','public.player_showcases','SELECT,INSERT,UPDATE,DELETE'),
    'raw-write-and-anonymous-read-grants-denied');
  perform pg_temp.showcase_assert(not has_column_privilege('authenticated','public.player_showcases',
    'thought_moderated_by_clerk_user_id','SELECT'), 'moderator-attribution-private');
  perform pg_temp.showcase_assert((select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex')
    from pg_proc where oid = 'public.close_ironclad_player_account_without_showcase_cleanup(text)'::regprocedure)
    = 'f1a9423c4aa4b121b079d3dd949273ae5a3a9cadcf47451ecafcfb888fc70e33',
    'prior-closure-body-preserved-without-invocation');
  perform pg_temp.showcase_assert((select relrowsecurity and relforcerowsecurity
    from pg_class where oid = 'public.player_showcases'::regclass), 'showcase-rls-enabled-and-forced');
end;
$catalog$;

-- Resolve Clerk identity server-side; never select claims into query output.
do $owner_claims$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text, true);
end;
$owner_claims$;
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $disabled_owner$
declare r jsonb;
begin
  r := public.get_my_player_showcase();
  perform pg_temp.showcase_assert(r->>'player_id' = '03f83118-81c9-438c-92db-b5d307547197'
    and (r->>'revision')::bigint = 0 and r->>'current_thought' is null, 'absent-owner-state');
  r := public.save_my_player_showcase_thought('Unavailable content', 0);
  perform pg_temp.showcase_assert(r->>'code' = 'feature-disabled'
    and (r#>>'{showcase,revision}')::bigint = 0, 'feature-off-create-rejected');
  r := public.save_my_player_showcase_thought(U&'\2003\0009\000A\2028\2029\FEFF', 0);
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and (r#>>'{showcase,revision}')::bigint = 0, 'feature-off-empty-clear-no-row');
  r := public.save_my_player_showcase_thought('Invalid revision', null);
  perform pg_temp.showcase_assert(r->>'code' = 'invalid-input', 'null-revision-rejected');
end;
$disabled_owner$;
reset role;

update public.platform_settings set value = '{"enabled":true}'::jsonb where key = 'player_showcase';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $owner_content$
declare r jsonb; v_revision bigint; v_award uuid;
begin
  r := public.save_my_player_showcase_thought(U&'  Cafe\0301\0009\4E16\754C\2028\041F\0440\0438\0432\0435\0442  ', 0);
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and r#>>'{showcase,current_thought}' = 'Café 世界 Привет'
    and (r#>>'{showcase,revision}')::bigint = 1, 'create-nfc-trim-multilingual-separators');
  r := public.save_my_player_showcase_thought('English Ελληνικά 日本語', 1);
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and r#>>'{showcase,current_thought}' = 'English Ελληνικά 日本語'
    and (r#>>'{showcase,revision}')::bigint = 2, 'edit-multilingual-and-revision');
  r := public.save_my_player_showcase_thought(repeat('😀',160), 2);
  v_revision := (r#>>'{showcase,revision}')::bigint;
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and char_length(r#>>'{showcase,current_thought}') = 160 and v_revision = 3, '160-emoji-codepoints-accepted');
  r := public.save_my_player_showcase_thought(repeat('😀',161), v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'invalid-thought'
    and (r#>>'{showcase,revision}')::bigint = v_revision, '161-emoji-rejected-without-revision');
  r := public.save_my_player_showcase_thought(U&'bad\0001control', v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'invalid-thought', 'c0-control-rejected');
  r := public.save_my_player_showcase_thought(U&'bad\202Ebidi', v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'invalid-thought', 'bidi-control-rejected');
  r := public.save_my_player_showcase_thought('Stale content', 0);
  perform pg_temp.showcase_assert(r->>'code' = 'conflict'
    and (r#>>'{showcase,revision}')::bigint = v_revision
    and char_length(r#>>'{showcase,current_thought}') = 160, 'stale-write-returns-current-owner-state');
  r := public.save_my_player_showcase_thought(U&'\2003\0009\000A\2028\2029\FEFF', v_revision);
  v_revision := v_revision + 1;
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,current_thought}' is null
    and (r#>>'{showcase,revision}')::bigint = v_revision, 'empty-trim-clears-thought');
  r := public.save_my_player_showcase_thought('Visible staging thought', v_revision);
  v_revision := v_revision + 1;
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and (r#>>'{showcase,revision}')::bigint = v_revision, 'thought-restored');
  select first_award into v_award from pg_temp.showcase_contract_awards;
  r := public.save_my_player_showcase_badge(v_award, v_revision);
  v_revision := v_revision + 1;
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and (r#>>'{showcase,featured_badge_award_id}')::uuid = v_award
    and r#>>'{showcase,current_thought}' = 'Visible staging thought', 'owned-badge-selected-thought-preserved');
  select second_award into v_award from pg_temp.showcase_contract_awards;
  r := public.save_my_player_showcase_badge(v_award, v_revision);
  v_revision := v_revision + 1;
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and (r#>>'{showcase,featured_badge_award_id}')::uuid = v_award
    and (r#>>'{showcase,revision}')::bigint = v_revision, 'owned-badge-changed');
  r := public.save_my_player_showcase_badge(null, v_revision);
  v_revision := v_revision + 1;
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and r#>>'{showcase,featured_badge_award_id}' is null
    and (r#>>'{showcase,revision}')::bigint = v_revision, 'badge-cleared');
  select first_award into v_award from pg_temp.showcase_contract_awards;
  r := public.save_my_player_showcase_badge(v_award, v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and (r#>>'{showcase,featured_badge_award_id}')::uuid = v_award, 'owned-badge-restored');
  perform pg_temp.showcase_assert((select count(player_id) from public.player_showcases) = 1,
    'owner-rls-read-own-row');
  begin
    update public.player_showcases set current_thought = 'Forbidden direct update'
      where player_id = '03f83118-81c9-438c-92db-b5d307547197';
    raise exception 'Direct raw write unexpectedly allowed';
  exception when insufficient_privilege then
    perform pg_temp.showcase_assert(true, 'authenticated-raw-update-denied');
  end;
  begin
    perform thought_moderated_by_clerk_user_id from public.player_showcases;
    raise exception 'Private attribution unexpectedly readable';
  exception when insufficient_privilege then
    perform pg_temp.showcase_assert(true, 'authenticated-attribution-read-denied');
  end;
  begin
    perform public.moderate_player_showcase_thought(
      '03f83118-81c9-438c-92db-b5d307547197',true,auth.jwt()->>'sub',v_revision);
    raise exception 'Owner moderation unexpectedly allowed';
  exception when insufficient_privilege then
    perform pg_temp.showcase_assert(true, 'owner-moderation-rpc-denied');
  end;
end;
$owner_content$;
reset role;

do $anon_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $anon_claims$;
do $set_anonymous_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $set_anonymous_claims$;
set local request.jwt.claim.role = 'anon';
set local role anon;
do $public_read$
begin
  perform pg_temp.showcase_assert((select count(*) from public.public_player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197'
      and current_thought = 'Visible staging thought'
      and featured_badge_slug is not null and featured_badge_unlocked_at is not null) = 1,
    'anonymous-public-thought-badge-and-safe-date');
  begin
    perform player_id from public.player_showcases;
    raise exception 'Anonymous raw read unexpectedly allowed';
  exception when insufficient_privilege then
    perform pg_temp.showcase_assert(true, 'anonymous-raw-read-denied');
  end;
  begin
    perform public.get_my_player_showcase();
    raise exception 'Anonymous owner RPC unexpectedly allowed';
  exception when insufficient_privilege then
    perform pg_temp.showcase_assert(true, 'anonymous-owner-rpc-denied');
  end;
end;
$public_read$;
reset role;

do $other_claims$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id = 'c0bfabca-11bb-4d90-92f9-77119debe15b'))::text,true);
end; $other_claims$;
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $foreign_owner$
declare r jsonb; v_award uuid;
begin
  r := public.get_my_player_showcase();
  perform pg_temp.showcase_assert(r->>'player_id' = 'c0bfabca-11bb-4d90-92f9-77119debe15b'
    and (r->>'revision')::bigint = 0, 'second-owner-identity-derived');
  select first_award into v_award from pg_temp.showcase_contract_awards;
  r := public.save_my_player_showcase_badge(v_award,0);
  perform pg_temp.showcase_assert(r->>'code' = 'invalid-badge'
    and (r#>>'{showcase,revision}')::bigint = 0, 'foreign-earned-award-rejected');
  perform pg_temp.showcase_assert((select count(player_id) from public.player_showcases) = 0,
    'second-owner-rls-cannot-read-first');
end;
$foreign_owner$;
reset role;

-- Only this actor's existing privacy field changes; no unrelated identity field.
update public.players set public_profile_enabled = false
where id = '03f83118-81c9-438c-92db-b5d307547197';
do $private_owner_claims$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text,true);
end; $private_owner_claims$;
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $private_owner_write$
declare r jsonb; v_revision bigint;
begin
  r := public.get_my_player_showcase(); v_revision := (r->>'revision')::bigint;
  r := public.save_my_player_showcase_thought('Private staging edit',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved'
    and r#>>'{showcase,current_thought}' = 'Private staging edit', 'private-owner-can-save-own-content');
end;
$private_owner_write$;
reset role;
do $privacy_not_enabled$ begin
  perform pg_temp.showcase_assert((select public_profile_enabled is false from public.players
    where id = '03f83118-81c9-438c-92db-b5d307547197'), 'successful-showcase-write-never-enables-parent-profile');
end; $privacy_not_enabled$;
do $set_anonymous_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $set_anonymous_claims$;
set local request.jwt.claim.role = 'anon';
set local role anon;
do $private_read$ begin
  perform pg_temp.showcase_assert(not exists (select 1 from public.public_player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197'), 'parent-private-hides-existing-showcase');
end; $private_read$;
reset role;
update public.players set public_profile_enabled = true
where id = '03f83118-81c9-438c-92db-b5d307547197';
do $privacy_unchanged$ begin
  perform pg_temp.showcase_assert((select public_profile_enabled is false from public.players
    where id = 'c0bfabca-11bb-4d90-92f9-77119debe15b'), 'feature-and-owner-writes-never-enable-other-profile');
end; $privacy_unchanged$;

-- This tests the service-role DB boundary, not Clerk Admin session authorization.
do $service_claims$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text,true);
end; $service_claims$;
set local request.jwt.claim.role = 'service_role';
set local role service_role;
do $hide$
declare r jsonb; v_revision bigint;
begin
  select revision into v_revision from public.player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197';
  r := public.moderate_player_showcase_thought('03f83118-81c9-438c-92db-b5d307547197',
    true,auth.jwt()->>'sub',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,thought_hidden_at}' is not null
    and (r#>>'{showcase,revision}')::bigint = v_revision + 1, 'service-moderation-hides-and-increments-revision');
end;
$hide$;
reset role;
do $set_anonymous_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $set_anonymous_claims$;
set local request.jwt.claim.role = 'anon';
set local role anon;
do $held_public$ begin
  perform pg_temp.showcase_assert((select count(*) from public.public_player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197' and current_thought is null
      and featured_badge_slug is not null) = 1, 'moderation-hides-only-thought-retains-badge');
end; $held_public$;
reset role;

do $owner_again$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text,true);
end; $owner_again$;
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $held_edit$
declare r jsonb; v_revision bigint;
begin
  r := public.get_my_player_showcase(); v_revision := (r->>'revision')::bigint;
  r := public.save_my_player_showcase_thought('Held staging edit',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,thought_hidden_at}' is not null,
    'owner-edit-cannot-clear-moderation-hold');
  v_revision := (r#>>'{showcase,revision}')::bigint;
  r := public.save_my_player_showcase_thought(null,v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,current_thought}' is null
    and r#>>'{showcase,thought_hidden_at}' is not null, 'owner-clear-retains-moderation-hold');
  v_revision := (r#>>'{showcase,revision}')::bigint;
  r := public.save_my_player_showcase_thought('Held staging edit',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,thought_hidden_at}' is not null,
    'owner-resave-still-held');
end;
$held_edit$;
reset role;
do $service_again$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text,true);
end; $service_again$;
set local request.jwt.claim.role = 'service_role';
set local role service_role;
do $restore$
declare r jsonb; v_revision bigint;
begin
  select revision into v_revision from public.player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197';
  r := public.moderate_player_showcase_thought('03f83118-81c9-438c-92db-b5d307547197',
    false,auth.jwt()->>'sub',0);
  perform pg_temp.showcase_assert(r->>'code' = 'conflict'
    and (r#>>'{showcase,revision}')::bigint = v_revision
    and r#>>'{showcase,thought_hidden_at}' is not null, 'stale-moderation-preserves-hold');
  r := public.moderate_player_showcase_thought('03f83118-81c9-438c-92db-b5d307547197',
    false,auth.jwt()->>'sub',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,thought_hidden_at}' is null,
    'service-moderation-restores-thought');
end;
$restore$;
reset role;
do $set_anonymous_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $set_anonymous_claims$;
set local request.jwt.claim.role = 'anon';
set local role anon;
do $restored_public$ begin
  perform pg_temp.showcase_assert((select count(*) from public.public_player_showcases
    where player_id = '03f83118-81c9-438c-92db-b5d307547197'
      and current_thought = 'Held staging edit' and featured_badge_slug is not null) = 1,
    'restored-thought-public-with-badge');
end; $restored_public$;
reset role;

update public.platform_settings set value = '{"enabled":false}'::jsonb where key = 'player_showcase';
do $set_anonymous_claims$ begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
end; $set_anonymous_claims$;
set local request.jwt.claim.role = 'anon';
set local role anon;
do $off_public$ begin
  perform pg_temp.showcase_assert(not exists (select 1 from public.public_player_showcases),
    'global-feature-off-hides-public-projection');
end; $off_public$;
reset role;
do $owner_final$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
    (select clerk_user_id from public.players where id = '03f83118-81c9-438c-92db-b5d307547197'))::text,true);
end; $owner_final$;
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $off_clear$
declare r jsonb; v_revision bigint;
begin
  r := public.get_my_player_showcase(); v_revision := (r->>'revision')::bigint;
  r := public.save_my_player_showcase_thought('New disabled edit',v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'feature-disabled'
    and (r#>>'{showcase,revision}')::bigint = v_revision, 'feature-off-existing-edit-rejected');
  r := public.save_my_player_showcase_thought(null,v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,current_thought}' is null,
    'feature-off-existing-thought-clear-allowed');
  v_revision := (r#>>'{showcase,revision}')::bigint;
  r := public.save_my_player_showcase_badge(null,v_revision);
  perform pg_temp.showcase_assert(r->>'code' = 'saved' and r#>>'{showcase,featured_badge_award_id}' is null,
    'feature-off-existing-badge-clear-allowed');
end;
$off_clear$;
reset role;

-- Exact count prevents a shortened or partially executed suite reporting success.
do $complete$
begin
  if (select count(*) from pg_temp.showcase_contract_checks) <> 50 then
    raise exception 'Incomplete Staging Showcase contract assertion set';
  end if;
end;
$complete$;
rollback;

-- Reached only after every assertion succeeds and all transactional writes roll back.
select 'passed' as showcase_staging_contract, 50 as assertions,
  'simulated JWT database roles; no browser auth or account closure exercised' as scope;
