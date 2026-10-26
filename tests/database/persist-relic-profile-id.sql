-- Staging-only behavioral contract for canonical verified Relic identity.
-- The caller must independently resolve the connection as IronClad Staging
-- and set ironclad.target_project_ref from that verified target.
-- All domain triggers remain in origin mode. Synthetic fixtures use the real
-- claim/profile/registration RPCs and existing effective legal documents.
-- No provider HTTP, Steam OpenID, browser onboarding or Production mutation.
-- A deliberate subtransaction rollback precedes the safety result, followed
-- by an outer ROLLBACK that removes temporary test objects as well.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '1min';
set local client_min_messages = warning;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims =
  '{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"phase2-verified-relic-contract"}';

do $$
begin
  if current_setting('ironclad.target_project_ref', true)
    is distinct from 'zzbnneprhjicmajpjkdg' then
    raise exception 'Verified Relic contract requires independently verified IronClad Staging';
  end if;
  if current_user <> 'postgres'
    or current_setting('session_replication_role') <> 'origin' then
    raise exception 'Verified Relic contract requires postgres and normal origin-mode triggers';
  end if;
end;
$$;

create temporary table relic_contract_assertions(name text primary key);
create temporary table relic_contract_result(result jsonb not null);
create temporary table relic_contract_players (
  n integer primary key,
  id uuid not null,
  clerk_user_id text not null,
  steam_id64 text not null,
  relic_profile_id text not null,
  claimed_at timestamptz
);
create temporary table relic_contract_registration_context (
  tournament_id uuid not null,
  bracket_id uuid not null,
  rulebook_id uuid not null,
  ppa_id uuid not null,
  terms_id uuid not null,
  privacy_id uuid not null
);

create function pg_temp.relic_assert(p_ok boolean, p_name text)
returns void language plpgsql set search_path = pg_catalog as $$
begin
  if p_ok is distinct from true then
    raise exception 'Verified Relic contract failed: %', p_name;
  end if;
  insert into pg_temp.relic_contract_assertions values(p_name);
end;
$$;

create function pg_temp.relic_fingerprints()
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare v_table record; v_one jsonb; v_result jsonb := '{}'::jsonb;
begin
  for v_table in
    select namespace.nspname, relation.relname
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'ironclad_private')
      and relation.relkind in ('r', 'p')
    order by namespace.nspname, relation.relname
  loop
    execute pg_catalog.format(
      'select jsonb_build_object(''rows'',count(*),''md5'',md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),''''))) from %I.%I t',
      v_table.nspname,v_table.relname
    ) into v_one;
    v_result := v_result || jsonb_build_object(v_table.nspname||'.'||v_table.relname,v_one);
  end loop;
  return v_result;
end;
$$;

create function pg_temp.relic_expected_failure(
  p_sql text,
  p_state text,
  p_message text,
  p_name text
)
returns void language plpgsql set search_path = pg_catalog as $$
declare v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and sqlerrm <> p_message) then
      raise exception 'Verified Relic contract failed: % returned SQLSTATE %, message %',p_name,sqlstate,sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.relic_assert(v_failed,p_name);
end;
$$;

create function pg_temp.relic_save(
  p_n integer,
  p_profile_id text,
  p_elo integer default 1800,
  p_division text default 'Pro',
  p_version text default 'relic-highest-1v1-v2',
  p_claimed_at timestamptz default null,
  p_steam_id64 text default null,
  p_clerk_user_id text default null
)
returns integer language plpgsql set search_path = pg_catalog as $$
declare v_player record; v_count integer;
begin
  select * into strict v_player from pg_temp.relic_contract_players where n=p_n;
  select count(*) into v_count
  from public.save_relic_profile_elo_snapshot_with_identity(
    p_player_id => v_player.id,
    p_clerk_user_id => coalesce(p_clerk_user_id,v_player.clerk_user_id),
    p_steam_id64 => coalesce(p_steam_id64,v_player.steam_id64),
    p_claimed_at => coalesce(p_claimed_at,v_player.claimed_at),
    p_relic_elo => p_elo,
    p_relic_faction => 'US Forces',
    p_relic_division => p_division,
    p_relic_calculation_version => p_version,
    p_relic_profile_id => p_profile_id
  );
  return v_count;
end;
$$;

create function pg_temp.relic_register(
  p_n integer,p_profile_id text,p_waitlist boolean default false,p_legacy boolean default false
)
returns table (
  id uuid,
  tournament_id uuid,
  tournament_bracket_id uuid,
  registration_status text,
  submitted_elo bigint,
  waitlist_confirmation_required boolean
)
language plpgsql set search_path = pg_catalog as $$
declare v_player record; v_context record;
begin
  select * into strict v_player from pg_temp.relic_contract_players where n=p_n;
  select * into strict v_context from pg_temp.relic_contract_registration_context;
  if p_legacy then
    return query select * from public.submit_verified_player_registration(
      v_player.id,v_player.clerk_user_id,v_player.steam_id64,v_context.tournament_id,v_context.bracket_id,
      1800::bigint,'US Forces','Pro','relic-highest-1v1-v2',v_context.rulebook_id,v_context.ppa_id,
      v_context.terms_id,v_context.privacy_id,true,true,true,true,true,true,p_waitlist
    );
    return;
  end if;
  return query select *
  from public.submit_verified_player_registration_with_identity(
    p_profile_id => v_player.id,
    p_clerk_user_id => v_player.clerk_user_id,
    p_steam_id64 => v_player.steam_id64,
    p_tournament_id => v_context.tournament_id,
    p_tournament_bracket_id => v_context.bracket_id,
    p_relic_elo => 1800::bigint,
    p_relic_faction => 'US Forces',
    p_relic_division => 'Pro',
    p_relic_calculation_version => 'relic-highest-1v1-v2',
    p_rulebook_document_id => v_context.rulebook_id,
    p_ppa_document_id => v_context.ppa_id,
    p_terms_document_id => v_context.terms_id,
    p_privacy_document_id => v_context.privacy_id,
    p_rulebook_accepted => true,
    p_ppa_accepted => true,
    p_terms_accepted => true,
    p_privacy_acknowledged => true,
    p_age_18_confirmed => true,
    p_account_and_steam_ownership_confirmed => true,
    p_waitlist_confirmed => p_waitlist,
    p_relic_profile_id => p_profile_id
  );
end;
$$;

do $$
declare
  v_nonce text := replace(gen_random_uuid()::text,'-','');
  v_steam_base bigint := 76561190000000000 + floor(random()*100000000000)::bigint;
  v_relic_base bigint := 8000000000000 + floor(random()*100000000000)::bigint;
  v_tournament uuid := gen_random_uuid();
  v_bracket uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
  v_row_before jsonb;
  v_row_after jsonb;
  v_registration_before jsonb;
  v_player record;
  v_result record;
  v_context record;
  v_id text;
  v_invalid text;
  v_tests text[];
  v_plan jsonb;
  v_plan_summary jsonb;
  v_forced_plan jsonb;
  v_forced_summary jsonb;
  v_seqscan text;
  v_expected_failure boolean;
  v_completed boolean := false;
  v_rolled_back boolean := false;
  v_prior_context text;
  v_closure_context text;
  v_n integer;
begin
  v_before := pg_temp.relic_fingerprints();

  -- All persistent fixture rows live inside this rollback-only subtransaction.
  begin
    insert into pg_temp.relic_contract_players(n,id,clerk_user_id,steam_id64,relic_profile_id)
    select n,gen_random_uuid(),'phase2-relic-contract-'||v_nonce||'-'||n,
      (v_steam_base+n)::text,(v_relic_base+n)::text
    from generate_series(1,10)n;

    perform pg_temp.relic_assert(not exists(
      select 1 from public.players player join pg_temp.relic_contract_players fixture
      on player.id=fixture.id or player.clerk_user_id=fixture.clerk_user_id
        or player.steam_id64=fixture.steam_id64 or player.coh3_profile_id=fixture.relic_profile_id
    ),'synthetic identities start unused');

    insert into public.players(
      id,clerk_user_id,display_name,in_game_name,steam_username,steam_id64,
      country,region,timezone,avatar_url,public_profile_enabled,discord_public_enabled
    )
    select id,clerk_user_id,'Phase 2 Synthetic Player '||n,'Phase 2 Synthetic Player '||n,
      'Synthetic Steam Fixture '||n,steam_id64,'AU','OCE','Australia/Sydney',
      'avatars/phase2-relic-contract/avatar.png',false,false
    from pg_temp.relic_contract_players;

    perform pg_temp.relic_assert((
      select count(*)=10 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
      where player.steam_id64=fixture.steam_id64 and player.coh3_profile_id is null
        and player.account_closed_at is null and player.profile_completed
    ),'normal origin triggers create ten complete null-binding fixtures');

    for v_player in select * from pg_temp.relic_contract_players order by n loop
      select claimed_at into strict v_result
      from public.claim_relic_elo_verification_attempt(v_player.id,v_player.clerk_user_id,v_player.steam_id64);
      update pg_temp.relic_contract_players set claimed_at=v_result.claimed_at where n=v_player.n;
    end loop;
    perform pg_temp.relic_assert((select count(*)=10 from pg_temp.relic_contract_players where claimed_at is not null),
      'existing cooldown claim remains available');

    v_prior_context := 'phase2-contract-prior-context-'||v_nonce;
    perform set_config('ironclad.verified_relic_binding_context',v_prior_context,true);

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=1;
    perform pg_temp.relic_assert(pg_temp.relic_save(1,v_id)=1,'new verified identity save returns one result');
    perform pg_temp.relic_assert(exists(
      select 1 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
      where fixture.n=1 and player.coh3_profile_id=fixture.relic_profile_id
        and player.current_elo=1800 and player.relic_verified_elo=1800
        and player.relic_verified_faction='US Forces' and player.relic_verified_division='Pro'
        and player.relic_elo_calculation_version='relic-highest-1v1-v2' and player.relic_elo_verified_at is not null
    ),'identity and unchanged ELO snapshot persist together');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'profile success restores prior verification context');

    perform pg_temp.relic_assert(pg_temp.relic_save(1,v_id)=1,'same identity reverification is idempotent');
    perform pg_temp.relic_assert(pg_temp.relic_save(1,v_id,1820)=1,'same identity accepts updated ELO');
    update public.players player set in_game_name='Phase 2 Changed Alias'
    from pg_temp.relic_contract_players fixture where fixture.n=1 and player.id=fixture.id;
    perform pg_temp.relic_assert(pg_temp.relic_save(1,v_id,1830)=1,'alias change does not change identity authority');
    perform pg_temp.relic_assert(exists(
      select 1 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
      where fixture.n=1 and player.coh3_profile_id=v_id and player.relic_verified_elo=1830
        and player.in_game_name='Phase 2 Changed Alias'
    ),'reverification preserves bound identity across ELO and alias changes');

    -- Same-owner refresh and privacy changes do not need a binding-write context.
    update public.players player set steam_id64=fixture.steam_id64,steam_username='Same Owner Refreshed Steam',
      public_profile_enabled=true
    from pg_temp.relic_contract_players fixture where fixture.n=1 and player.id=fixture.id;
    update public.players player set public_profile_enabled=false
    from pg_temp.relic_contract_players fixture where fixture.n=1 and player.id=fixture.id;
    perform pg_temp.relic_assert(exists(
      select 1 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
      where fixture.n=1 and player.coh3_profile_id=fixture.relic_profile_id and player.relic_verified_elo=1830
        and player.steam_id64=fixture.steam_id64 and player.steam_username='Same Owner Refreshed Steam'
        and not player.public_profile_enabled
    ),'same-owner Steam refresh and privacy toggle preserve identity and ELO');
    -- Trusted fixture setup only: make the existing cooldown eligible without
    -- sleeping, then exercise the actual unchanged claim RPC on a bound player.
    update public.players player set relic_elo_last_attempt_at=clock_timestamp()-interval '16 minutes'
    from pg_temp.relic_contract_players fixture where fixture.n=1 and player.id=fixture.id;
    select * into v_player from pg_temp.relic_contract_players where n=1;
    select claimed_at into strict v_result
    from public.claim_relic_elo_verification_attempt(v_player.id,v_player.clerk_user_id,v_player.steam_id64);
    update pg_temp.relic_contract_players set claimed_at=v_result.claimed_at where n=1;
    perform pg_temp.relic_assert(exists(
      select 1 from public.players where id=v_player.id and coh3_profile_id=v_player.relic_profile_id
        and relic_verified_elo=1830 and relic_elo_last_attempt_at=v_result.claimed_at
    ),'cooldown-only claim remains permitted on bound player');

    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=1;
    perform pg_temp.relic_expected_failure(
      format('select pg_temp.relic_save(1,%L,1900)',v_id||'9'),'P0001','RELIC_IDENTITY_CONFLICT',
      'unexpected identity mismatch returns generic conflict');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=1;
    perform pg_temp.relic_assert(v_row_before=v_row_after,'mismatch leaves whole player row unchanged');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'profile mismatch restores prior verification context');

    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    perform pg_temp.relic_expected_failure(
      format('select pg_temp.relic_save(2,%L,1900)',v_id),'P0001','RELIC_IDENTITY_CONFLICT',
      'duplicate ownership returns same generic conflict');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    perform pg_temp.relic_assert(v_row_before=v_row_after,'duplicate ownership leaves claimant row unchanged');
    perform pg_temp.relic_assert(exists(
      select 1 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
      where fixture.n=1 and player.coh3_profile_id=v_id and player.relic_verified_elo=1830
    ),'duplicate ownership cannot overwrite original owner');

    -- This checks database uniqueness directly, not a simulated multi-session
    -- race. The service-only trusted tuple matches the claimant, so the existing
    -- unique partial index must reject another account's already-bound ID.
    select * into v_player from pg_temp.relic_contract_players where n=2;
    perform set_config('ironclad.verified_relic_binding_context',
      jsonb_build_array(v_player.id::text,v_player.clerk_user_id,v_player.steam_id64,v_id)::text,true);
    perform pg_temp.relic_expected_failure(format(
      'update public.players set coh3_profile_id=%L where id=%L::uuid',v_id,v_player.id),
      '23505',null,'database unique partial index rejects duplicate ownership');
    perform set_config('ironclad.verified_relic_binding_context',v_prior_context,true);
    perform pg_temp.relic_assert(v_row_before=(select to_jsonb(player) from public.players player where player.id=v_player.id),
      'database duplicate rejection leaves complete claimant row unchanged');

    for v_invalid in select unnest(array[null::text,'','0','00','042',' 42','42 ','1e3','-1','+1','1.0','abc']) loop
      perform pg_temp.relic_expected_failure(
        format('select pg_temp.relic_save(2,%L)',v_invalid),'22023','RELIC_IDENTITY_INVALID',
        'invalid canonical ID rejected: '||quote_nullable(v_invalid));
    end loop;

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=2;
    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    select claimed_at-interval '1 second' as claimed_at into v_result from pg_temp.relic_contract_players where n=2;
    perform pg_temp.relic_assert(pg_temp.relic_save(2,v_id,1800,'Pro','relic-highest-1v1-v2',v_result.claimed_at)=0,
      'stale cooldown claim cannot bind identity');
    perform pg_temp.relic_assert(pg_temp.relic_save(2,v_id,1800,'Pro','relic-highest-1v1-v2',null,'76561190000000001')=0,
      'changed Steam identity cannot bind identity');
    perform pg_temp.relic_assert(pg_temp.relic_save(2,v_id,1800,'Pro','relic-highest-1v1-v2',null,null,'phase2-wrong-owner')=0,
      'wrong Clerk ownership cannot bind identity');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    perform pg_temp.relic_assert(v_row_before=v_row_after,'stale and identity-race attempts leave whole player row unchanged');

    select * into v_player from pg_temp.relic_contract_players where n=10;
    perform * from public.save_relic_profile_elo_snapshot(v_player.id,v_player.clerk_user_id,v_player.steam_id64,
      v_player.claimed_at,1800,'US Forces','Main / Pro','relic-highest-1v1-v1');
    perform pg_temp.relic_assert(exists(
      select 1 from public.players where id=v_player.id and coh3_profile_id is null
        and relic_verified_division='Main / Pro' and relic_elo_calculation_version='relic-highest-1v1-v1'
    ),'old RPC preserves unbound legacy verification behavior');
    perform pg_temp.relic_assert(pg_temp.relic_save(10,'9999999999999999999999999999999999999999',1800,'Main / Pro','relic-highest-1v1-v1')=1,
      'legacy Main Pro binding uses text without lossy numeric conversion');

    select * into v_player from pg_temp.relic_contract_players where n=1;
    select to_jsonb(player) into v_row_before from public.players player where player.id=v_player.id;
    perform pg_temp.relic_expected_failure(format(
      'select * from public.save_relic_profile_elo_snapshot(%L::uuid,%L,%L,%L::timestamptz,1900,%L,%L,%L)',
      v_player.id,v_player.clerk_user_id,v_player.steam_id64,v_player.claimed_at,'US Forces','Pro','relic-highest-1v1-v2'),
      'P0001','RELIC_IDENTITY_CONFLICT','bound player rejects old ELO save without identity context');
    perform pg_temp.relic_expected_failure(format(
      'update public.players set coh3_profile_id=%L where id=%L::uuid',v_player.relic_profile_id||'9',v_player.id),
      'P0001','RELIC_IDENTITY_CONFLICT','raw service update cannot replace verified identity');
    perform pg_temp.relic_assert(v_row_before=(select to_jsonb(player) from public.players player where player.id=v_player.id),
      'legacy and raw write rejection preserves authoritative row');

    perform pg_temp.relic_assert(
      not has_function_privilege('anon','public.save_relic_profile_elo_snapshot_with_identity(uuid,text,text,timestamptz,integer,text,text,text,text)','EXECUTE')
      and not has_function_privilege('authenticated','public.save_relic_profile_elo_snapshot_with_identity(uuid,text,text,timestamptz,integer,text,text,text,text)','EXECUTE')
      and has_function_privilege('service_role','public.save_relic_profile_elo_snapshot_with_identity(uuid,text,text,timestamptz,integer,text,text,text,text)','EXECUTE'),
      'new profile RPC remains service-role-only');
    perform pg_temp.relic_assert(
      not has_function_privilege('anon','public.submit_verified_player_registration_with_identity(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)','EXECUTE')
      and not has_function_privilege('authenticated','public.submit_verified_player_registration_with_identity(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)','EXECUTE')
      and has_function_privilege('service_role','public.submit_verified_player_registration_with_identity(uuid,text,text,uuid,uuid,bigint,text,text,text,uuid,uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)','EXECUTE'),
      'new registration RPC remains service-role-only');

    -- Actual authenticated client SQL can either be denied by ACL or have the
    -- guarded field preserved; neither behavior may establish a new binding.
    select * into v_player from pg_temp.relic_contract_players where n=9;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_player.clerk_user_id)::text,true);
    execute 'set local role authenticated';
    begin
      update public.players set coh3_profile_id='2345678901' where id=v_player.id;
    exception when insufficient_privilege then null;
    end;
    v_expected_failure := false;
    begin
      perform * from public.save_relic_profile_elo_snapshot_with_identity(v_player.id,v_player.clerk_user_id,v_player.steam_id64,
        v_player.claimed_at,1800,'US Forces','Pro','relic-highest-1v1-v2',v_player.relic_profile_id);
    exception when insufficient_privilege then v_expected_failure := true;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims','{"role":"service_role","ref":"zzbnneprhjicmajpjkdg","sub":"phase2-verified-relic-contract"}',true);
    perform pg_temp.relic_assert(v_expected_failure and exists(
      select 1 from public.players where id=v_player.id and coh3_profile_id is null
    ),'authenticated client cannot set canonical identity or invoke trusted writer');

    insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,
      registration_enabled,division_model_version,registration_open_at,registration_close_at)
    values(v_tournament,'Phase 2 Relic Contract','phase2-relic-contract-'||v_nonce,'1v1','registration_open',
      'Rollback-only synthetic verification contract.','','',true,'four_division_v1',now()-interval '1 day',now()+interval '1 day');
    insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players)
    values(v_bracket,v_tournament,'Pro','1700+ ELO',8);
    -- The existing tournament INSERT synchronizer disables registration before
    -- its first Division exists. Reopen this synthetic event only after the
    -- normal bracket insert, allowing the unchanged synchronizer to validate it.
    update public.tournaments set registration_enabled=true where id=v_tournament;
    insert into pg_temp.relic_contract_registration_context
    select v_tournament,v_bracket,
      (select id from public.legal_documents where document_kind='rulebook' and status='effective' and effective_at<=clock_timestamp()),
      (select id from public.legal_documents where document_kind='ppa' and status='effective' and effective_at<=clock_timestamp()),
      (select id from public.legal_documents where document_kind='terms' and status='effective' and effective_at<=clock_timestamp()),
      (select id from public.legal_documents where document_kind='privacy' and status='effective' and effective_at<=clock_timestamp());

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=1;
    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=1;
    perform pg_temp.relic_expected_failure(format('select * from pg_temp.relic_register(1,%L,false,true)',v_id),
      'P0001','RELIC_IDENTITY_CONFLICT','bound old registration RPC rejects ELO update without verified identity');
    perform pg_temp.relic_assert(v_row_before=(select to_jsonb(player) from public.players player
      join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=1)
      and not exists(select 1 from public.registrations registration
        join pg_temp.relic_contract_players fixture on fixture.id=registration.profile_id where fixture.n=1)
      and not exists(select 1 from public.registration_acceptances acceptance
        join pg_temp.relic_contract_players fixture on fixture.clerk_user_id=acceptance.clerk_user_id where fixture.n=1),
      'old registration guard atomically rolls back registration legal and ELO rows');
    select * into strict v_result from pg_temp.relic_register(1,v_id);
    set constraints all immediate;
    set constraints all deferred;
    perform pg_temp.relic_assert(v_result.registration_status='pending' and v_result.submitted_elo=1800
      and v_result.waitlist_confirmation_required is false,'verified registration remains pending with existing snapshot');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'registration success restores prior verification context');
    perform pg_temp.relic_assert(exists(
      select 1 from public.registrations registration join pg_temp.relic_contract_players fixture on fixture.id=registration.profile_id
      where fixture.n=1 and registration.id=v_result.id and registration.tournament_bracket_id=v_bracket
        and registration.submitted_elo=1800 and registration.elo_verified_elo=1800
        and registration.elo_verified_division='Pro' and registration.elo_calculation_version='relic-highest-1v1-v2'
    ),'registration owner Division and immutable ELO facts are unchanged');
    select to_jsonb(registration) into v_registration_before from public.registrations registration where id=v_result.id;
    perform pg_temp.relic_save(1,v_id,1850);
    perform pg_temp.relic_assert(v_registration_before=(select to_jsonb(registration) from public.registrations registration where id=v_result.id),
      'later profile refresh cannot mutate registration snapshots');
    update public.registrations set registration_status='approved' where id=v_result.id;
    perform pg_temp.relic_assert(exists(select 1 from public.registrations where id=v_result.id and registration_status='approved'
      and submitted_elo=1800 and elo_verified_elo=1800),'existing approval update preserves event ELO snapshot');

    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    perform pg_temp.relic_expected_failure(format('select * from pg_temp.relic_register(2,%L)',v_id),
      'P0001','RELIC_IDENTITY_CONFLICT','registration duplicate identity fails generically');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=2;
    perform pg_temp.relic_assert(v_row_before=v_row_after and not exists(
      select 1 from public.registrations registration join pg_temp.relic_contract_players fixture on fixture.id=registration.profile_id where fixture.n=2
    ),'duplicate registration identity leaves no row or ELO residue');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'registration conflict restores prior verification context');

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=3;
    perform pg_temp.relic_save(3,v_id);
    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=3;
    perform pg_temp.relic_expected_failure(format('select * from pg_temp.relic_register(3,%L)',v_id||'9'),
      'P0001','RELIC_IDENTITY_CONFLICT','registration unexpected identity fails generically');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=3;
    perform pg_temp.relic_assert(v_row_before=v_row_after and not exists(
      select 1 from public.registrations registration join pg_temp.relic_contract_players fixture on fixture.id=registration.profile_id where fixture.n=3
    ),'mismatched registration identity leaves no row or ELO residue');

    for v_player in select * from pg_temp.relic_contract_players where n between 2 and 8 order by n loop
      select * into strict v_result from pg_temp.relic_register(v_player.n,v_player.relic_profile_id);
      perform pg_temp.relic_assert(v_result.registration_status='pending' and not v_result.waitlist_confirmation_required,
        'normal registration fills approved capacity slot '||v_player.n);
    end loop;
    set constraints all immediate;
    set constraints all deferred;

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=9;
    select to_jsonb(player) into v_row_before from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=9;
    select * into strict v_result from pg_temp.relic_register(9,v_id,false);
    perform pg_temp.relic_assert(v_result.id is null and v_result.waitlist_confirmation_required,
      'full Division preserves existing waitlist confirmation prompt');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'waitlist confirmation prompt restores prior verification context');
    select to_jsonb(player) into v_row_after from public.players player
    join pg_temp.relic_contract_players fixture on fixture.id=player.id where fixture.n=9;
    perform pg_temp.relic_assert(v_row_before=v_row_after and not exists(
      select 1 from public.registrations registration join pg_temp.relic_contract_players fixture on fixture.id=registration.profile_id where fixture.n=9
    ),'declined waitlist prompt does not bind identity or create registration');
    select * into strict v_result from pg_temp.relic_register(9,v_id,true);
    set constraints all immediate;
    set constraints all deferred;
    perform pg_temp.relic_assert(v_result.registration_status='waitlisted' and not v_result.waitlist_confirmation_required
      and exists(select 1 from public.players player join pg_temp.relic_contract_players fixture on fixture.id=player.id
        where fixture.n=9 and player.coh3_profile_id=v_id),'confirmed waitlist atomically preserves existing state and verified binding');
    perform pg_temp.relic_assert(current_setting('ironclad.verified_relic_binding_context')=v_prior_context,
      'confirmed waitlist restores prior verification context');

    -- Exercise the existing closure GUC boundary on a fixture without touching
    -- real accounts or invoking Clerk/Storage deletion. These are the same
    -- identity/verification clear operations performed by the existing closer.
    select * into v_player from pg_temp.relic_contract_players where n=10;
    v_closure_context := coalesce(current_setting('ironclad.account_closure',true),'');
    perform set_config('ironclad.account_closure','on',true);
    update public.players set clerk_user_id='deleted:phase2-'||v_nonce,
      display_name='Former Competitor',in_game_name='Former Competitor',
      discord_username=null,steam_username=null,coh3_player_card_url=null,
      country=null,region=null,timezone=null,current_elo=null,avatar_url=null,bio=null,
      profile_completed=false,public_profile_enabled=false,discord_public_enabled=false,
      coh3_profile_id=null,steam_id64=null,relic_verified_elo=null,relic_verified_faction=null,
      relic_verified_division=null,relic_elo_calculation_version=null,relic_elo_verified_at=null,
      relic_elo_last_attempt_at=null,account_closed_at=clock_timestamp()
    where id=v_player.id;
    perform set_config('ironclad.account_closure',v_closure_context,true);
    perform pg_temp.relic_assert(exists(select 1 from public.players where id=v_player.id
      and account_closed_at is not null and coh3_profile_id is null and steam_id64 is null
      and relic_verified_elo is null and current_elo is null and not public_profile_enabled),
      'existing closure boundary clears binding Steam and ELO without bypassing triggers');
    perform pg_temp.relic_assert(pg_temp.relic_save(10,v_player.relic_profile_id,1800,'Main / Pro','relic-highest-1v1-v1')=0,
      'closed fixture cannot rebind through profile verification');
    perform pg_temp.relic_expected_failure(format('select * from pg_temp.relic_register(10,%L)',v_player.relic_profile_id),
      'P0001','Registration identity is unavailable','closed fixture cannot register through identity wrapper');

    perform pg_temp.relic_assert(not exists(select 1 from public.generated_brackets where tournament_bracket_id=v_bracket)
      and exists(select 1 from public.tournament_brackets where id=v_bracket and launched_at is null),
      'registration capacity never launches or generates bracket automatically');
    perform pg_temp.relic_assert(not exists(select 1 from public.players where coh3_profile_id is not null group by coh3_profile_id having count(*)>1),
      'no duplicate canonical Relic identity exists');
    perform pg_temp.relic_assert(not exists(select 1 from public.players where steam_id64 is not null group by steam_id64 having count(*)>1),
      'existing Steam uniqueness remains intact');
    perform pg_temp.relic_assert(not exists(select 1 from public.players where coh3_profile_id is not null and coh3_profile_id !~ '^[1-9][0-9]*$'),
      'all persisted Relic identities have canonical positive decimal format');

    select relic_profile_id into v_id from pg_temp.relic_contract_players where n=1;
    execute format('explain (analyze,buffers,format json) select id from public.players where coh3_profile_id=%L',v_id) into v_plan;
    select jsonb_build_object('executionMs',v_plan->0->'Execution Time','planningMs',v_plan->0->'Planning Time',
      'nodeType',v_plan#>'{0,Plan,Node Type}','actualRows',v_plan#>'{0,Plan,Actual Rows}',
      'indexName',v_plan#>'{0,Plan,Index Name}') into v_plan_summary;
    v_seqscan := current_setting('enable_seqscan');
    perform set_config('enable_seqscan','off',true);
    execute format('explain (analyze,buffers,format json) select id from public.players where coh3_profile_id=%L',v_id) into v_forced_plan;
    perform set_config('enable_seqscan',v_seqscan,true);
    select jsonb_build_object('executionMs',v_forced_plan->0->'Execution Time','planningMs',v_forced_plan->0->'Planning Time',
      'nodeType',v_forced_plan#>'{0,Plan,Node Type}','actualRows',v_forced_plan#>'{0,Plan,Actual Rows}',
      'indexName',v_forced_plan#>'{0,Plan,Index Name}','forcedIndexAvailabilityCheck',true) into v_forced_summary;
    perform pg_temp.relic_assert((v_forced_plan#>>'{0,Plan,Actual Rows}')::integer=1
      and v_forced_plan#>>'{0,Plan,Index Name}'='players_coh3_profile_id_unique_idx',
      'successful Relic lookup can use existing unique partial index');

    select array_agg(name order by name) into v_tests from pg_temp.relic_contract_assertions;
    v_completed := true;
    raise exception 'phase2_persist_relic_contract_rollback' using errcode='P2R00';
  exception when sqlstate 'P2R00' then
    if sqlerrm <> 'phase2_persist_relic_contract_rollback' or not v_completed then raise; end if;
    v_rolled_back := true;
  end;

  v_after := pg_temp.relic_fingerprints();
  if not v_rolled_back or v_before is distinct from v_after
    or exists(select 1 from public.players where clerk_user_id like 'phase2-relic-contract-'||v_nonce||'-%')
    or exists(select 1 from public.tournaments where id=v_tournament) then
    raise exception 'Verified Relic safety failed: fixture residue or existing table data changed';
  end if;
  insert into pg_temp.relic_contract_result(result) values(jsonb_build_object(
    'status','passed','assertionCount',cardinality(v_tests),'assertions',to_jsonb(v_tests),
    'originModeTriggers',true,'fixtureSubtransactionRolledBack',v_rolled_back,'remainingFixturePlayers',0,
    'existingTableDataUnchanged',v_before=v_after,'comparedTables',(select count(*) from jsonb_object_keys(v_before)),
    'realProviderHttpOrSteamOpenIdExercised',false,'registrationTransactionExercised',true,
    'lookupNativePlan',v_plan_summary,'lookupIndexAvailabilityPlan',v_forced_summary,'outerTransactionRollbackRequired',true
  ));
end;
$$;

select result from relic_contract_result;

rollback;
