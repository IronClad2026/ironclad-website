\set ON_ERROR_STOP on

-- LOCAL ONLY. Run with psql against an isolated, fully migrated UTF8 database
-- named ironclad_showcase_contract. This script never contacts providers.
-- All data changes roll back, including fixture legal and historical rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local client_min_messages = warning;

do $local_only$
begin
  if current_database() <> 'ironclad_showcase_contract'
    or (
      inet_server_addr() is not null
      and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet)
    ) then
    raise exception 'Showcase contract requires its named local disposable database';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Showcase contract requires the local postgres fixture owner';
  end if;
end;
$local_only$;

create function pg_temp.showcase_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'Showcase contract failed: %', p_message;
  end if;
end;
$$;

set local request.jwt.claims = '{"role":"service_role","sub":"showcase-local-admin"}';

-- Fixed fixture IDs are permitted only in the disposable database above.
insert into public.players (
  id, clerk_user_id, display_name, in_game_name, public_profile_enabled
) values
  ('75000000-0000-4000-8000-000000000001', 'showcase-local-owner', 'Owner', 'Owner', true),
  ('75000000-0000-4000-8000-000000000002', 'showcase-local-other', 'Other', 'Other', true),
  ('75000000-0000-4000-8000-000000000003', 'showcase-local-closing', 'Closing', 'Closing', true),
  ('75000000-0000-4000-8000-000000000004', 'showcase-local-deleting', 'Deleting', 'Deleting', true);

insert into public.player_badge_awards (
  id, player_id, badge_slug, source_type, source_metadata
) values
  ('75100000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001',
    'first-victory', 'backfill', '{"private_evidence":"must-not-project"}'),
  ('75100000-0000-4000-8000-000000000002', '75000000-0000-4000-8000-000000000002',
    'ironclad-recruit', 'backfill', '{}'),
  ('75100000-0000-4000-8000-000000000003', '75000000-0000-4000-8000-000000000001',
    'unknown-future-badge', 'backfill', '{}');

update public.legal_documents set status = 'superseded'
where document_kind in ('terms', 'privacy') and status = 'effective';
insert into public.legal_documents (
  id, document_kind, version, immutable_url, status, published_at, effective_at, sha256
) values
  ('75200000-0000-4000-8000-000000000001', 'terms', 'showcase-local-terms',
    'https://example.invalid/showcase-local-terms', 'effective',
    clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', repeat('a', 64)),
  ('75200000-0000-4000-8000-000000000002', 'privacy', 'showcase-local-privacy',
    'https://example.invalid/showcase-local-privacy', 'effective',
    clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', repeat('b', 64));

update public.platform_settings
set value = '{"enabled":false}'::jsonb where key = 'player_showcase';

-- Actual role permissions, not only source-text assertions.
set local role anon;
select pg_temp.showcase_assert(not public.player_showcase_enabled(), 'default/off feature');
select pg_temp.showcase_assert(
  not exists (select 1 from public.public_player_showcases), 'off projection is empty'
);
do $anonymous_permissions$
begin
  begin
    perform public.get_my_player_showcase();
    raise exception 'anonymous owner RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform current_thought from public.player_showcases;
    raise exception 'anonymous raw read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_my_player_showcase_thought('forged', 0);
    raise exception 'anonymous write unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$anonymous_permissions$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-owner"}';
select pg_temp.showcase_assert(
  (public.get_my_player_showcase() ->> 'revision')::bigint = 0,
  'absent row has virtual revision zero'
);
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought('Off', 0) ->> 'code' = 'feature-disabled',
  'feature-off addition rejected'
);
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought(null, 0) ->> 'code' = 'saved',
  'absent clear is harmless while off'
);
do $owner_permissions$
begin
  begin
    insert into public.player_showcases(player_id, current_thought)
    values ('75000000-0000-4000-8000-000000000001', 'bypass');
    raise exception 'direct owner insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.player_showcases set thought_hidden_at = null;
    raise exception 'direct owner moderation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.moderate_player_showcase_thought(
      '75000000-0000-4000-8000-000000000001', false, 'showcase-local-owner', 0
    );
    raise exception 'owner moderation RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform thought_moderated_by_clerk_user_id from public.player_showcases;
    raise exception 'private moderator attribution unexpectedly readable';
  exception when insufficient_privilege then null;
  end;
end;
$owner_permissions$;
reset role;

update public.platform_settings
set value = '{"enabled":"true"}'::jsonb where key = 'player_showcase';
select pg_temp.showcase_assert(not public.player_showcase_enabled(), 'string true fails closed');
update public.platform_settings
set value = '{"enabled":true}'::jsonb where key = 'player_showcase';

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-owner"}';
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought('No acceptance yet', 0) ->> 'code' = 'legal-required',
  'direct RPC cannot bypass account legal acceptance'
);
reset role;
set local request.jwt.claims = '{"role":"service_role","sub":"showcase-local-admin"}';
select public.accept_current_account_legal_documents(
  'showcase-local-owner',
  '75200000-0000-4000-8000-000000000001',
  '75200000-0000-4000-8000-000000000002', true, true
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-owner"}';
do $normalization_and_revisions$
declare
  v_result jsonb;
  v_revision bigint;
  v_character text;
begin
  v_result := public.save_my_player_showcase_thought(U&'\00A0Cafe\0301\0009wins\2028today\FEFF', 0);
  perform pg_temp.showcase_assert(v_result ->> 'code' = 'saved', 'first thought saves');
  perform pg_temp.showcase_assert(
    v_result #>> '{showcase,current_thought}' = U&'Caf\00E9 wins today', 'NFC/line/trim normalization'
  );
  perform pg_temp.showcase_assert(
    (v_result #>> '{showcase,revision}')::bigint = 1, 'first persisted revision'
  );
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_badge('75100000-0000-4000-8000-000000000001', 0)
      ->> 'code' = 'conflict', 'stale first-save selector conflicts'
  );
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_thought('stale overwrite', 0)
      #>> '{showcase,current_thought}' = U&'Caf\00E9 wins today',
    'conflict returns latest own state without changing it'
  );
  v_result := public.save_my_player_showcase_thought(repeat(U&'\+01F600', 160), 1);
  perform pg_temp.showcase_assert(v_result ->> 'code' = 'saved', '160 non-BMP codepoints allowed');
  v_revision := (v_result #>> '{showcase,revision}')::bigint;
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_thought(repeat(U&'\+01F600', 161), v_revision)
      ->> 'code' = 'invalid-thought', '161 codepoints rejected'
  );
  foreach v_character in array array[
    U&'\0001', U&'\000B', U&'\000C', U&'\007F', U&'\0085',
    U&'\202A', U&'\202E', U&'\2066', U&'\2069'
  ] loop
    perform pg_temp.showcase_assert(
      public.save_my_player_showcase_thought(v_character || 'text', v_revision)
        ->> 'code' = 'invalid-thought', 'forbidden controls rejected before trim'
    );
  end loop;
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_thought('text', -1) ->> 'code' = 'invalid-input',
    'negative expected revision rejected'
  );
  v_result := public.save_my_player_showcase_thought('Ready to compete', v_revision);
  v_revision := (v_result #>> '{showcase,revision}')::bigint;
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_badge('75100000-0000-4000-8000-000000000002', v_revision)
      ->> 'code' = 'invalid-badge', 'foreign award rejected'
  );
  perform pg_temp.showcase_assert(
    public.save_my_player_showcase_badge('75100000-0000-4000-8000-000000000003', v_revision)
      ->> 'code' = 'invalid-badge', 'unknown catalog slug rejected'
  );
  v_result := public.save_my_player_showcase_badge(
    '75100000-0000-4000-8000-000000000001', v_revision
  );
  perform pg_temp.showcase_assert(v_result ->> 'code' = 'saved', 'owned earned badge selected');
  perform pg_temp.showcase_assert(
    v_result #>> '{showcase,current_thought}' = 'Ready to compete',
    'badge write preserves thought'
  );
end;
$normalization_and_revisions$;

set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-other"}';
select pg_temp.showcase_assert(
  not exists (
    select 1 from public.player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'
  ), 'RLS hides another owner'
);
select pg_temp.showcase_assert(
  public.get_my_player_showcase() ->> 'player_id' = '75000000-0000-4000-8000-000000000002',
  'owner loader derives identity from sub'
);
reset role;

do $foreign_key_and_projection$
begin
  begin
    update public.player_showcases
    set featured_badge_award_id = '75100000-0000-4000-8000-000000000002'
    where player_id = '75000000-0000-4000-8000-000000000001';
    raise exception 'foreign badge database FK unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;
  perform pg_temp.showcase_assert(
    (select array_agg(attname::text order by attnum)
      from pg_attribute
      where attrelid = 'public.public_player_showcases'::regclass
        and attnum > 0 and not attisdropped) =
      array['player_id', 'current_thought', 'featured_badge_slug', 'featured_badge_unlocked_at'],
    'public projection contains only safe columns'
  );
end;
$foreign_key_and_projection$;

set local role anon;
select pg_temp.showcase_assert(
  (select featured_badge_slug = 'first-victory'
    and current_thought = 'Ready to compete'
    from public.public_player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'),
  'public parent exposes normalized thought and safe earned badge'
);
reset role;
update public.player_showcases
set featured_badge_award_id = '75100000-0000-4000-8000-000000000003'
where player_id = '75000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.showcase_assert(
  (select featured_badge_slug is null and featured_badge_unlocked_at is null
    and current_thought = 'Ready to compete'
    from public.public_player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'),
  'unknown persisted award slug fails closed in the public projection'
);
reset role;
update public.player_showcases
set featured_badge_award_id = '75100000-0000-4000-8000-000000000001'
where player_id = '75000000-0000-4000-8000-000000000001';
update public.player_badge_awards set unlocked_at = 'infinity'::timestamptz
where id = '75100000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.showcase_assert(
  (select featured_badge_slug = 'first-victory' and featured_badge_unlocked_at is null
    from public.public_player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'),
  'non-finite award timestamps are not public'
);
reset role;
update public.player_badge_awards set unlocked_at = clock_timestamp()
where id = '75100000-0000-4000-8000-000000000001';
update public.players set public_profile_enabled = false
where id = '75000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.showcase_assert(
  not exists (select 1 from public.public_player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'),
  'parent opt-out removes direct public projection access'
);
reset role;
update public.players set public_profile_enabled = true
where id = '75000000-0000-4000-8000-000000000001';

set local role service_role;
set local request.jwt.claims = '{"role":"service_role","sub":"showcase-local-admin"}';
select pg_temp.showcase_assert(
  public.moderate_player_showcase_thought(
    '75000000-0000-4000-8000-000000000001', true, 'showcase-local-admin',
    (select revision from public.player_showcases
      where player_id = '75000000-0000-4000-8000-000000000001')
  ) ->> 'code' = 'saved', 'trusted moderation hides thought'
);
reset role;
set local role anon;
select pg_temp.showcase_assert(
  (select current_thought is null and featured_badge_slug = 'first-victory'
    from public.public_player_showcases
    where player_id = '75000000-0000-4000-8000-000000000001'),
  'hold hides only thought and preserves badge'
);
reset role;

-- A hold survives subsequent owner edits; an award delete only clears the
-- selection and advances its revision. It does not delete the Showcase.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-owner"}';
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought(
    'Edited while held', (public.get_my_player_showcase() ->> 'revision')::bigint
  ) #>> '{showcase,thought_hidden_at}' is not null, 'owner edit cannot unhide'
);
reset role;
delete from public.player_badge_awards where id = '75100000-0000-4000-8000-000000000001';
select pg_temp.showcase_assert(
  (select featured_badge_award_id is null and current_thought = 'Edited while held'
    from public.player_showcases where player_id = '75000000-0000-4000-8000-000000000001'),
  'award deletion clears only the selection'
);

-- Removal remains available when the feature is disabled and the effective
-- account acceptance becomes unavailable.
update public.platform_settings
set value = '{"enabled":false}'::jsonb where key = 'player_showcase';
update public.legal_documents set status = 'superseded'
where id = '75200000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-owner"}';
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought(
    null, (public.get_my_player_showcase() ->> 'revision')::bigint
  ) ->> 'code' = 'saved', 'clear survives disabled feature and unavailable legal pair'
);
select pg_temp.showcase_assert(
  public.get_my_player_showcase() ->> 'thought_hidden_at' is not null,
  'clearing thought preserves moderation hold'
);
reset role;

-- Exercise the real complete closure chain for both deletion outcomes.
insert into public.player_showcases (player_id, current_thought)
values
  ('75000000-0000-4000-8000-000000000003', 'Historical personal thought'),
  ('75000000-0000-4000-8000-000000000004', 'No-history personal thought');
insert into public.leaderboard_player_all_time_stats (player_id, bracket_type)
values ('75000000-0000-4000-8000-000000000003', 'main');
set local request.jwt.claims = '{"role":"service_role","sub":"showcase-local-admin"}';
select pg_temp.showcase_assert(
  public.close_ironclad_player_account('showcase-local-closing') ->> 'outcome' = 'pseudonymized',
  'historical closure retains competition identity'
);
select pg_temp.showcase_assert(
  public.close_ironclad_player_account('showcase-local-deleting') ->> 'outcome' = 'deleted',
  'no-history closure deletes player'
);
select pg_temp.showcase_assert(
  not exists (select 1 from public.player_showcases
    where player_id in ('75000000-0000-4000-8000-000000000003', '75000000-0000-4000-8000-000000000004')),
  'both closure outcomes remove Showcase'
);
select pg_temp.showcase_assert(
  (select account_closed_at is not null from public.players
    where id = '75000000-0000-4000-8000-000000000003'),
  'historical parent remains closed'
);
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"showcase-local-closing"}';
select pg_temp.showcase_assert(public.get_my_player_showcase() is null, 'closed owner read unavailable');
select pg_temp.showcase_assert(
  public.save_my_player_showcase_thought('late write', 0) ->> 'code' = 'profile-required',
  'old identity cannot recreate content after closure'
);
reset role;

rollback;
\echo 'PASS: Player Showcase local database security contract (rolled back)'
