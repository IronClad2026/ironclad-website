\set ON_ERROR_STOP on

-- Rollback-only PR 6 Announcement -> Tournament database contract. Run only
-- against the explicitly approved Staging project after migration 118.
set client_min_messages = warning;
set role postgres;
set request.jwt.claim.role = 'service_role';
set request.jwt.claims =
  '{"role":"service_role","sub":"pr6-announcement-link-contract"}';
set lock_timeout = '5s';
set statement_timeout = '2min';
set idle_in_transaction_session_timeout = '1min';

create temporary table pr6_announcement_link_baseline
on commit preserve rows
as
select pg_catalog.count(*) as announcement_count
from public.announcements;

create function pg_temp.pr6_announcement_link_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'PR 6 Announcement Tournament link failed: %', p_message;
  end if;
end;
$$;

begin isolation level repeatable read;

do $$
declare
  v_run_id uuid := pg_catalog.gen_random_uuid();
  v_actor text := 'pr6-announcement-link-' || v_run_id::text;
  v_tournament_id uuid;
  v_tournament_slug text;
  v_general jsonb;
  v_linked jsonb;
  v_legacy_feed jsonb;
  v_linked_feed jsonb;
  v_before_invalid bigint;
begin
  perform pg_temp.pr6_announcement_link_assert(
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ironclad:pr6-announcement-link-database-contract',
        0
      )
    ),
    'another PR 6 database contract holds the canary lock'
  );

  perform pg_temp.pr6_announcement_link_assert(
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = 'public.announcements'::pg_catalog.regclass
        and attribute.attname = 'linked_tournament_id'
        and attribute.atttypid = 'uuid'::pg_catalog.regtype
        and attribute.attnotnull is false
        and attribute.attisdropped is false
    ),
    'linked_tournament_id is missing, non-UUID, or not nullable'
  );

  perform pg_temp.pr6_announcement_link_assert(
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid =
        'public.announcements'::pg_catalog.regclass
        and constraint_row.confrelid =
          'public.tournaments'::pg_catalog.regclass
        and constraint_row.conname = 'announcements_linked_tournament_fk'
        and constraint_row.contype = 'f'
        and constraint_row.confdeltype = 'n'
    ),
    'Tournament FK must use ON DELETE SET NULL'
  );

  perform pg_temp.pr6_announcement_link_assert(
    pg_catalog.has_function_privilege(
      'service_role',
      'public.list_active_announcements_with_tournament()',
      'EXECUTE'
    )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.publish_official_announcement_with_tournament(text,text,text,text,text,text,text,uuid)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.list_active_announcements_with_tournament()',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.publish_official_announcement_with_tournament(text,text,text,text,text,text,text,uuid)',
        'EXECUTE'
      ),
    'new RPC grants are not service-role-only'
  );

  select tournament.id, tournament.slug
  into strict v_tournament_id, v_tournament_slug
  from public.tournaments as tournament
  order by tournament.created_at desc, tournament.id desc
  limit 1;

  v_general := public.publish_official_announcement(
    'PR 6 rollback-only general ' || v_run_id::text,
    'General announcement compatibility check.',
    null,
    null,
    null,
    null,
    v_actor
  );
  v_linked := public.publish_official_announcement_with_tournament(
    'PR 6 rollback-only linked ' || v_run_id::text,
    'Linked announcement compatibility check.',
    null,
    null,
    null,
    null,
    v_actor,
    v_tournament_id
  );

  perform pg_temp.pr6_announcement_link_assert(
    exists (
      select 1
      from public.announcements as announcement
      where announcement.id = (v_general ->> 'id')::uuid
        and announcement.linked_tournament_id is null
    ),
    'legacy publication no longer creates a general announcement'
  );
  perform pg_temp.pr6_announcement_link_assert(
    exists (
      select 1
      from public.announcements as announcement
      where announcement.id = (v_linked ->> 'id')::uuid
        and announcement.linked_tournament_id = v_tournament_id
    ),
    'linked publication did not persist the selected Tournament'
  );

  v_legacy_feed := public.list_active_announcements();
  v_linked_feed := public.list_active_announcements_with_tournament();
  perform pg_temp.pr6_announcement_link_assert(
    not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_legacy_feed -> 'announcements'
      ) as item
      where item ? 'linked_tournament_slug'
    ),
    'the PR 4 feed projection changed'
  );
  perform pg_temp.pr6_announcement_link_assert(
    exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_linked_feed -> 'announcements'
      ) as item
      where item ->> 'id' = v_linked ->> 'id'
        and item ->> 'linked_tournament_slug' = v_tournament_slug
        and not (item ? 'linked_tournament_id')
    ),
    'the safe linked feed projection is incorrect'
  );

  select pg_catalog.count(*)
  into v_before_invalid
  from public.announcements;

  begin
    perform public.publish_official_announcement_with_tournament(
      'PR 6 invalid link ' || v_run_id::text,
      'This publication must roll back.',
      null,
      null,
      null,
      null,
      v_actor,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'invalid Tournament publication unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  perform pg_temp.pr6_announcement_link_assert(
    (select pg_catalog.count(*) from public.announcements) = v_before_invalid,
    'invalid Tournament publication left an announcement row'
  );
end;
$$;

rollback;

do $$
begin
  perform pg_temp.pr6_announcement_link_assert(
    (select pg_catalog.count(*) from public.announcements) =
      (select baseline.announcement_count
       from pr6_announcement_link_baseline as baseline),
    'rollback did not restore the announcement row count'
  );
end;
$$;
