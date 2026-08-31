-- Rollback-only database contract for Badge ownership, reveal acknowledgement,
-- authority repairs, and the bounded reconciliation backstop.

begin;

set local client_min_messages = warning;
set local role postgres;
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
    raise exception 'Badge database contract failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_match_void text := lower(
    pg_catalog.pg_get_functiondef(
      'public.record_tournament_void_authority()'::regprocedure
    )
  );
  v_path_void text := lower(
    pg_catalog.pg_get_functiondef(
      'public.record_tournament_championship_path_void()'::regprocedure
    )
  );
  v_corrections text := lower(
    pg_catalog.pg_get_functiondef(
      'public.record_badge_match_authority_corrections()'::regprocedure
    )
  );
  v_reliable text := lower(
    pg_catalog.pg_get_functiondef(
      'public.get_player_badge_reliable_competitor_summary(uuid)'::regprocedure
    )
  );
  v_flawless text := lower(
    pg_catalog.pg_get_functiondef(
      'public.get_player_badge_flawless_campaign_summary(uuid)'::regprocedure
    )
  );
  v_claim text := lower(
    pg_catalog.pg_get_functiondef(
      'public.claim_badge_reconciliation_targets(integer)'::regprocedure
    )
  );
  v_open_award_guard text := lower(
    pg_catalog.pg_get_functiondef(
      'public.guard_open_player_badge_award()'::regprocedure
    )
  );
begin
  perform pg_temp.badge_assert(
    (
      select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_catalog.pg_class as relation
      where relation.oid = 'public.player_badge_awards'::regclass
    ),
    'player_badge_awards must use forced RLS'
  );
  perform pg_temp.badge_assert(
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.player_badge_awards',
      'SELECT'
    )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.player_badge_awards',
        'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.player_badge_awards',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.player_badge_awards',
        'DELETE'
      ),
    'authenticated clients must read only their RLS-filtered awards'
  );
  perform pg_temp.badge_assert(
    pg_catalog.has_table_privilege(
      'service_role',
      'public.player_badge_awards',
      'SELECT'
    )
      and pg_catalog.has_table_privilege(
        'service_role',
        'public.player_badge_awards',
        'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'service_role',
        'public.player_badge_awards',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'service_role',
        'public.player_badge_awards',
        'DELETE'
      ),
    'runtime service authority must be limited to award read and insert'
  );
  perform pg_temp.badge_assert(
    v_open_award_guard like '%account_closed_at is null%'
      and exists (
        select 1
        from pg_catalog.pg_trigger as trigger_definition
        where trigger_definition.tgrelid =
            'public.player_badge_awards'::regclass
          and trigger_definition.tgname =
            'player_badge_awards_guard_open_player'
          and not trigger_definition.tgisinternal
      ),
    'the final ownership write must reject closed players'
  );

  perform pg_temp.badge_assert(
    (
      select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_catalog.pg_class as relation
      where relation.oid = 'public.player_badge_reveals'::regclass
    ),
    'player_badge_reveals must use forced RLS'
  );
  perform pg_temp.badge_assert(
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.player_badge_reveals',
      'SELECT'
    )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.player_badge_reveals',
        'player_badge_award_id',
        'INSERT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.player_badge_reveals',
        'player_id',
        'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.player_badge_reveals',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.player_badge_reveals',
        'DELETE'
      ),
    'authenticated reveal acknowledgement must be insert-only'
  );
  perform pg_temp.badge_assert(
    (
      select count(*) = 2
      from pg_catalog.pg_constraint as constraint_definition
      where constraint_definition.conrelid =
          'public.player_badge_reveals'::regclass
        and constraint_definition.conname in (
          'player_badge_reveals_award_unique',
          'player_badge_reveals_owned_award_fk'
        )
    ),
    'reveal acknowledgement must be unique and tied to the owned player award'
  );

  perform pg_temp.badge_assert(
    v_match_void like '%new.terminal_at%'
      and v_match_void not like '%new.voided_at%'
      and v_path_void like '%new.terminal_at%'
      and v_path_void not like '%new.voided_at%',
    'terminal authority must use tournaments.terminal_at'
  );
  perform pg_temp.badge_assert(
    v_match_void like '%order by authority.revision desc%'
      and v_match_void like '%v_latest_game.authority_state = ''active''%'
      and v_match_void like '%v_latest_game.revision + 1%'
      and v_match_void like '%pg_advisory_xact_lock%',
    'tournament void must lock and derive from the true latest game revision'
  );
  perform pg_temp.badge_assert(
    v_corrections like '%new.winner_registration_id%'
      and v_corrections like '%num_nonnulls%'
      and v_corrections like '%automatic_bye%'
      and v_corrections like
        '%is_tournament_match_played_for_leaderboard(new.id)%'
      and v_corrections like '%canonical_scored_result%',
    'match corrections must cover either-slot byes and scored official results'
  );
  perform pg_temp.badge_assert(
    v_reliable like
      '%(''player_no_show'', ''double_no_show'')%then 0%'
      and v_reliable like
        '%(''played'', ''opponent_no_show'')%history.run_length + 1%',
    'Reliable Competitor must reset double/player no-shows only'
  );
  perform pg_temp.badge_assert(
    v_flawless like '%played_segment_count > 0%',
    'Flawless Campaign must require a genuinely played series'
  );

  perform pg_temp.badge_assert(
    (
      select relation.relrowsecurity and relation.relforcerowsecurity
      from pg_catalog.pg_class as relation
      where relation.oid =
        'ironclad_private.badge_reconciliation_targets'::regclass
    )
      and not pg_catalog.has_table_privilege(
        'service_role',
        'ironclad_private.badge_reconciliation_targets',
        'SELECT'
      ),
    'raw reconciliation targets must be private with forced RLS'
  );
  perform pg_temp.badge_assert(
    pg_catalog.has_function_privilege(
      'service_role',
      'public.enqueue_badge_reconciliation_target(uuid,text,text,text)',
      'EXECUTE'
    )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.claim_badge_reconciliation_targets(integer)',
        'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.complete_badge_reconciliation_target(uuid,uuid,boolean,text)',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.claim_badge_reconciliation_targets(integer)',
        'EXECUTE'
      ),
    'bounded reconciliation RPCs must be service-role-only'
  );
  perform pg_temp.badge_assert(
    v_claim like '%p_limit < 1 or p_limit > 50%'
      and v_claim like '%for update of target skip locked%'
      and v_claim like '%interval ''15 minutes''%'
      and v_claim like '%player.account_closed_at is null%',
    'reconciliation claims must be bounded, leased, concurrent, and open-account-only'
  );
  perform pg_temp.badge_assert(
    not pg_catalog.has_table_privilege(
      'service_role',
      'public.leaderboard_tournament_season_memberships',
      'SELECT'
    ),
    'the historical E2E-only season membership grant must be revoked'
  );
end;
$$;

rollback;

select pg_catalog.jsonb_build_object(
  'contract', 'badge-authority-forward-repairs',
  'fixture_transaction', 'rolled_back',
  'database_rows_mutated', false
)::text;
