-- Rollback-only behavioral contract for Badge ownership, Reveal RLS, and the
-- bounded reconciliation queue. All fixture identities and rows are local to
-- this transaction.

begin;

set local client_min_messages = warning;
set local lock_timeout = '5s';
set local statement_timeout = '2min';
set local idle_in_transaction_session_timeout = '1min';

create function pg_temp.badge_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'Badge security contract failed: %', p_message;
  end if;
end;
$$;

set local role postgres;

insert into public.players (
  id,
  clerk_user_id,
  display_name,
  in_game_name
)
values
  (
    'ba000000-0000-4000-8000-000000000001'::uuid,
    'badge-security-owner',
    'Badge security owner',
    'BadgeSecurityOwner'
  ),
  (
    'ba000000-0000-4000-8000-000000000002'::uuid,
    'badge-security-other',
    'Badge security other',
    'BadgeSecurityOther'
  ),
  (
    'ba000000-0000-4000-8000-000000000003'::uuid,
    'badge-security-closed',
    'Badge security closed',
    'BadgeSecurityClosed'
  );

set local role service_role;

insert into public.player_badge_awards (
  id,
  player_id,
  badge_slug,
  source_type,
  source_metadata
)
values
  (
    'ba100000-0000-4000-8000-000000000001'::uuid,
    'ba000000-0000-4000-8000-000000000001'::uuid,
    'first-deployment',
    'match',
    '{"contract":"owner"}'::jsonb
  ),
  (
    'ba100000-0000-4000-8000-000000000002'::uuid,
    'ba000000-0000-4000-8000-000000000002'::uuid,
    'first-victory',
    'match',
    '{"contract":"other"}'::jsonb
  );

do $$
begin
  begin
    insert into public.player_badge_awards (
      player_id,
      badge_slug,
      source_type
    )
    values (
      'ba000000-0000-4000-8000-000000000001'::uuid,
      'first-deployment',
      'match'
    );
    raise exception 'duplicate ownership unexpectedly succeeded';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

select pg_temp.badge_assert(
  (
    select count(*) = 2
    from public.player_badge_awards
  ),
  'service-side ownership inserts must remain unique'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"badge-security-owner"}',
  true
);
set local role authenticated;

select pg_temp.badge_assert(
  (
    select count(*) = 1
    from public.player_badge_awards
  ),
  'an authenticated player must see exactly their own Badge awards'
);

do $$
begin
  begin
    insert into public.player_badge_awards (
      player_id,
      badge_slug,
      source_type
    )
    values (
      'ba000000-0000-4000-8000-000000000001'::uuid,
      'battle-tested',
      'match'
    );
    raise exception 'browser Badge ownership mutation unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

insert into public.player_badge_reveals (
  player_badge_award_id,
  player_id
)
values (
  'ba100000-0000-4000-8000-000000000001'::uuid,
  'ba000000-0000-4000-8000-000000000001'::uuid
);

select pg_temp.badge_assert(
  (
    select count(*) = 1
    from public.player_badge_reveals
  ),
  'an authenticated player must read their own Reveal acknowledgement'
);

do $$
begin
  begin
    insert into public.player_badge_reveals (
      player_badge_award_id,
      player_id
    )
    values (
      'ba100000-0000-4000-8000-000000000001'::uuid,
      'ba000000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'duplicate Reveal acknowledgement unexpectedly succeeded';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.player_badge_reveals (
      player_badge_award_id,
      player_id
    )
    values (
      'ba100000-0000-4000-8000-000000000002'::uuid,
      'ba000000-0000-4000-8000-000000000002'::uuid
    );
    raise exception 'cross-player Reveal acknowledgement unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;

do $$
begin
  begin
    perform count(*) from public.player_badge_awards;
    raise exception 'anonymous Badge ownership read unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    insert into public.player_badge_reveals (
      player_badge_award_id,
      player_id
    )
    values (
      'ba100000-0000-4000-8000-000000000001'::uuid,
      'ba000000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'anonymous Reveal acknowledgement unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"badge-security-contract"}',
  true
);
set local role service_role;

select public.enqueue_badge_reconciliation_target(
  'ba000000-0000-4000-8000-000000000001'::uuid,
  'evaluation_failure',
  'system',
  'badge-security-contract'
);
select public.enqueue_badge_reconciliation_target(
  'ba000000-0000-4000-8000-000000000001'::uuid,
  'manual_recovery',
  'system',
  'badge-security-contract-retry'
);

reset role;
set local role postgres;
select pg_catalog.set_config('ironclad.account_closure', 'on', true);
update public.players
set account_closed_at = pg_catalog.clock_timestamp()
where id = 'ba000000-0000-4000-8000-000000000003'::uuid;

reset role;
set local role service_role;

do $$
begin
  begin
    insert into public.player_badge_awards (
      player_id,
      badge_slug,
      source_type
    )
    values (
      'ba000000-0000-4000-8000-000000000003'::uuid,
      'ironclad-recruit',
      'profile'
    );
    raise exception 'closed-account Badge ownership unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

select public.enqueue_badge_reconciliation_target(
  'ba000000-0000-4000-8000-000000000003'::uuid,
  'manual_recovery',
  'system',
  'badge-security-closed'
);

select pg_temp.badge_assert(
  (
    select count(*) = 1
    from public.claim_badge_reconciliation_targets(10)
  ),
  'the bounded claim must deduplicate open players and exclude closed accounts'
);

select pg_temp.badge_assert(
  (
    select count(*) = 0
    from public.claim_badge_reconciliation_targets(10)
  ),
  'a claimed target must remain leased and unavailable to another worker'
);

do $$
begin
  begin
    perform public.claim_badge_reconciliation_targets(51);
    raise exception 'an oversized Badge reconciliation claim unexpectedly succeeded';
  exception
    when invalid_parameter_value then
      null;
  end;
end;
$$;

reset role;
set local role postgres;

select pg_temp.badge_assert(
  not exists (
    select 1
    from ironclad_private.badge_reconciliation_targets
    where player_id = 'ba000000-0000-4000-8000-000000000003'::uuid
  ),
  'closed accounts must not be accepted into the reconciliation queue'
);

select pg_temp.badge_assert(
  (
    select count(*) = 1
      and bool_and(status = 'claimed')
      and bool_and(attempt_count = 1)
    from ironclad_private.badge_reconciliation_targets
    where player_id = 'ba000000-0000-4000-8000-000000000001'::uuid
  ),
  'the reconciliation queue must retain one leased row per open player'
);

rollback;

select pg_catalog.jsonb_build_object(
  'contract', 'badge-security-reconciliation',
  'fixture_transaction', 'rolled_back',
  'database_rows_mutated', false
)::text;
