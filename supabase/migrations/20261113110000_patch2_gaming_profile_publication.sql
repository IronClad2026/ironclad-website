begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

-- The migration preserves the temporary publication state. Only the separate
-- operator activation may end it. Existing flags and receipts are untouched.
create table ironclad_private.gaming_profile_publication_policy (
  id boolean primary key default true check (id),
  activated_at timestamptz,
  terms_document_id uuid references public.legal_documents(id),
  privacy_document_id uuid references public.legal_documents(id),
  check (
    (activated_at is null and terms_document_id is null and privacy_document_id is null) or
    (activated_at is not null and terms_document_id is not null and privacy_document_id is not null)
  )
);
insert into ironclad_private.gaming_profile_publication_policy default values;

-- Append a decision rather than rewriting an older choice. Account closure's
-- existing deletion/retention decision determines the lifetime of this record.
create table ironclad_private.gaming_profile_publications (
  player_id uuid not null references public.players(id) on delete cascade,
  revision bigint not null check (revision > 0),
  publication_basis text check (publication_basis in ('player-choice', 'documented-legacy')),
  verification_reference text check (verification_reference ~ '^[a-zA-Z0-9._:-]{3,120}$'),
  objection_open boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (player_id, revision),
  check (publication_basis is distinct from 'documented-legacy' or verification_reference is not null),
  check (not objection_open or publication_basis is null)
);
alter table ironclad_private.gaming_profile_publication_policy enable row level security;
alter table ironclad_private.gaming_profile_publications enable row level security;
revoke all on ironclad_private.gaming_profile_publication_policy, ironclad_private.gaming_profile_publications
  from public, anon, authenticated, service_role;

-- Core identity remains public for active players regardless of the historic
-- profile flag. Optional fields have their own publication decision.
create view ironclad_private.gaming_profile_visibility with (security_barrier = true) as
select player.id,
  policy.activated_at is not null as policy_active,
  player.account_closed_at is null and not coalesce(choice.objection_open, false) as profile_public,
  player.account_closed_at is null and not coalesce(choice.objection_open, false) and
    ((policy.activated_at is null and choice.revision is null) or choice.publication_basis is not null) as optional_public
from public.players player
cross join ironclad_private.gaming_profile_publication_policy policy
left join lateral (
  select history.revision, history.publication_basis, history.objection_open
  from ironclad_private.gaming_profile_publications history
  where history.player_id = player.id
  order by history.revision desc limit 1
) choice on true;
revoke all on ironclad_private.gaming_profile_visibility from public, anon, authenticated, service_role;

create view public.gaming_profile_disclosure with (security_barrier = true, security_invoker = false) as
select player.id, player.clerk_user_id, player.account_closed_at,
  case when visibility.profile_public then player.in_game_name end as in_game_name,
  case when visibility.optional_public then player.display_name
    when visibility.profile_public then player.in_game_name end as display_name,
  case when visibility.optional_public then player.coh3_profile_id end as coh3_profile_id,
  coalesce(visibility.profile_public, false) as profile_public,
  coalesce(visibility.optional_public, false) as optional_public
from public.players player
left join ironclad_private.gaming_profile_visibility visibility on visibility.id = player.id;
revoke all on public.gaming_profile_disclosure from public, anon, authenticated, service_role;
grant select on public.gaming_profile_disclosure to service_role;

create function ironclad_private.activate_gaming_profile_publication()
returns timestamptz language plpgsql set search_path = pg_catalog as $$
declare
  v_terms uuid;
  v_privacy uuid;
  v_activated_at timestamptz;
begin
  perform 1 from ironclad_private.gaming_profile_publication_policy where id for update;
  select activated_at into v_activated_at from ironclad_private.gaming_profile_publication_policy where id;
  if v_activated_at is not null then return v_activated_at; end if;

  perform 1 from public.tournaments where slug = 'hold-the-line' for share;
  if not found or exists (
    select from public.tournaments where slug = 'hold-the-line' and status is distinct from 'completed'
  ) then
    raise exception 'HOLD THE LINE must be completed before profile policy activation' using errcode = '55000';
  end if;
  select id into v_terms from public.legal_documents
    where document_kind = 'terms' and version = '1.2' and status = 'effective'
      and published_at <= clock_timestamp() and effective_at <= clock_timestamp() and sha256 is not null for share;
  select id into v_privacy from public.legal_documents
    where document_kind = 'privacy' and version = '1.4' and status = 'effective'
      and published_at <= clock_timestamp() and effective_at <= clock_timestamp() and sha256 is not null for share;
  if v_terms is null or v_privacy is null then
    raise exception 'Effective successor Terms and Privacy Policy required' using errcode = '55000';
  end if;
  v_activated_at := clock_timestamp();
  update ironclad_private.gaming_profile_publication_policy
  set activated_at = v_activated_at, terms_document_id = v_terms, privacy_document_id = v_privacy
  where id;
  return v_activated_at;
end;
$$;
revoke all on function ironclad_private.activate_gaming_profile_publication() from public, anon, authenticated, service_role;

create function ironclad_private.accepted_gaming_profile_policy(p_subject text)
returns boolean language sql stable set search_path = pg_catalog as $$
  select exists (
    select from ironclad_private.gaming_profile_publication_policy policy
    join public.account_legal_acceptances acceptance
      on acceptance.terms_document_id = policy.terms_document_id
      and acceptance.privacy_document_id = policy.privacy_document_id
    join public.legal_documents terms on terms.id = policy.terms_document_id
    join public.legal_documents privacy on privacy.id = policy.privacy_document_id
    where policy.activated_at is not null and acceptance.clerk_user_id = p_subject
      and acceptance.terms_accepted and acceptance.privacy_acknowledged
      and acceptance.accepted_at >= greatest(terms.effective_at, privacy.effective_at)
      and acceptance.terms_sha256 = terms.sha256 and acceptance.privacy_sha256 = privacy.sha256
  );
$$;
revoke all on function ironclad_private.accepted_gaming_profile_policy(text) from public, anon, authenticated, service_role;

create function ironclad_private.require_gaming_profile_creation_acceptance()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_activated_at timestamptz;
begin
  -- Ordinary profile updates do not repeat this first-creation check.
  if auth.role() = 'authenticated' and auth.jwt()->>'sub' = new.clerk_user_id
    and new.account_closed_at is null then
    select activated_at into strict v_activated_at from ironclad_private.gaming_profile_publication_policy
      where id for share;
    if v_activated_at is not null then
      perform ironclad_private.require_current_account_legal_acceptance();
      if not ironclad_private.accepted_gaming_profile_policy(new.clerk_user_id) then
        raise exception 'Gaming profile policy acceptance is required' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function ironclad_private.require_gaming_profile_creation_acceptance() from public, anon, authenticated, service_role;
create trigger players_require_gaming_profile_creation_acceptance
  after insert on public.players for each row execute function ironclad_private.require_gaming_profile_creation_acceptance();

create function public.get_my_gaming_profile_publication()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_subject text := auth.jwt()->>'sub';
  v_player_id uuid;
  v_choice ironclad_private.gaming_profile_publications%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or ironclad_private.patch2_account_state(v_subject) = 'denied' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  if not exists (select from ironclad_private.gaming_profile_publication_policy where id and activated_at is not null) then
    return null;
  end if;
  select id into v_player_id from public.players where clerk_user_id = v_subject and account_closed_at is null;
  if v_player_id is null then
    if not ironclad_private.accepted_gaming_profile_policy(v_subject) then return null; end if;
    return jsonb_build_object('mode', 'new', 'public', false, 'revision', 0, 'objectionOpen', false);
  end if;
  select * into v_choice from ironclad_private.gaming_profile_publications
    where player_id = v_player_id order by revision desc limit 1;
  return jsonb_build_object(
    'mode', 'legacy',
    'public', v_choice.publication_basis is not null and not coalesce(v_choice.objection_open, false),
    'revision', coalesce(v_choice.revision, 0),
    'objectionOpen', coalesce(v_choice.objection_open, false)
  );
end;
$$;
revoke all on function public.get_my_gaming_profile_publication() from public, anon, authenticated, service_role;
grant execute on function public.get_my_gaming_profile_publication() to authenticated;

create function public.set_my_legacy_gaming_profile_publication(p_public boolean, p_expected_revision bigint)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_subject text := auth.jwt()->>'sub';
  v_player_id uuid;
  v_choice ironclad_private.gaming_profile_publications%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or p_public is null or p_expected_revision is null
    or p_expected_revision < 0 or v_subject is null then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  if ironclad_private.patch2_account_state(v_subject) is distinct from 'active-player' then
    raise exception 'Account access is unavailable' using errcode = '42501';
  end if;
  perform 1 from ironclad_private.gaming_profile_publication_policy where id and activated_at is not null for share;
  if not found then return false; end if;
  -- Withdrawing optional publication does not require new legal acceptance.
  if p_public then
    perform ironclad_private.require_current_account_legal_acceptance();
    if not ironclad_private.accepted_gaming_profile_policy(v_subject) then return false; end if;
  end if;
  select id into v_player_id from public.players where clerk_user_id = v_subject and account_closed_at is null for update;
  if v_player_id is null then return false; end if;
  select * into v_choice from ironclad_private.gaming_profile_publications
    where player_id = v_player_id order by revision desc limit 1;
  if coalesce(v_choice.revision, 0) <> p_expected_revision
    or (p_public and v_choice.objection_open) then return false; end if;
  if p_public = (v_choice.publication_basis is not null) then return true; end if;

  insert into ironclad_private.gaming_profile_publications (player_id, revision, publication_basis)
    values (v_player_id, p_expected_revision + 1, case when p_public then 'player-choice' end);
  return true;
end;
$$;
revoke all on function public.set_my_legacy_gaming_profile_publication(boolean,bigint) from public, anon, authenticated, service_role;
grant execute on function public.set_my_legacy_gaming_profile_publication(boolean,bigint) to authenticated;

-- The evidence reference for verify-legacy must cover the complete optional
-- bundle, including partner correlation. A legacy flag alone is insufficient.
-- Record only supported historical elections or a verified objection event.
-- Resolving an objection restores core only; optional publication stays off.
create function ironclad_private.record_gaming_profile_publication_review(
  p_player_id uuid, p_expected_revision bigint, p_action text, p_reference text
)
returns boolean language plpgsql set search_path = pg_catalog as $$
declare
  v_player public.players%rowtype;
  v_choice ironclad_private.gaming_profile_publications%rowtype;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_action is null
    or p_action not in ('verify-legacy', 'open-objection', 'resolve-objection')
    or p_reference is null or p_reference !~ '^[a-zA-Z0-9._:-]{3,120}$' then return false; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0));
  select * into v_player from public.players where id = p_player_id and account_closed_at is null for update;
  if not found or ironclad_private.patch2_account_state(v_player.clerk_user_id) is distinct from 'active-player' then return false; end if;
  select * into v_choice from ironclad_private.gaming_profile_publications
    where player_id = p_player_id order by revision desc limit 1;
  if coalesce(v_choice.revision, 0) <> p_expected_revision
    or (p_action = 'verify-legacy' and (p_expected_revision <> 0 or v_player.public_profile_enabled is not true))
    or (p_action = 'open-objection' and v_choice.objection_open is true)
    or (p_action = 'resolve-objection' and v_choice.objection_open is not true) then return false; end if;
  insert into ironclad_private.gaming_profile_publications
    (player_id, revision, publication_basis, verification_reference, objection_open)
    values (p_player_id, p_expected_revision + 1, case when p_action = 'verify-legacy' then 'documented-legacy' end,
      p_reference, p_action = 'open-objection');
  return true;
end;
$$;
revoke all on function ironclad_private.record_gaming_profile_publication_review(uuid,bigint,text,text)
  from public, anon, authenticated, service_role;

-- The private avatar object name never reaches the browser. Owners can still
-- preview their own avatar while it is unavailable to everyone else.
create function public.get_gaming_profile_avatar_target(p_player_id uuid, p_viewer_subject text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select player.clerk_user_id
  from public.players player
  join ironclad_private.gaming_profile_visibility visibility on visibility.id = player.id
  where auth.role() = 'service_role' and player.id = p_player_id
    and player.avatar_url is not null and player.account_closed_at is null
    and (visibility.optional_public or player.clerk_user_id = p_viewer_subject);
$$;
revoke all on function public.get_gaming_profile_avatar_target(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_gaming_profile_avatar_target(uuid,text) to service_role;

-- The new notice may be enabled only after the visibility rules are active.
create function ironclad_private.guard_gaming_profile_v2_notice()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.key = 'public_gaming_profile_notice' and new.value->'enabled' = 'true'::jsonb
    and new.value->>'version' = 'public-gaming-profile-v2' and not exists (
      select from ironclad_private.gaming_profile_publication_policy where id and activated_at is not null
    ) then
    raise exception 'Gaming profile policy must be active before enabling notice v2' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function ironclad_private.guard_gaming_profile_v2_notice() from public, anon, authenticated, service_role;
create trigger platform_settings_guard_gaming_profile_v2_notice
  before insert or update on public.platform_settings
  for each row execute function ironclad_private.guard_gaming_profile_v2_notice();

-- The standings remain public. For restricted profiles, use the competition
-- alias recorded at registration instead of the editable current profile name.
create view ironclad_private.gaming_profile_competition_aliases as
select registration.profile_id, registration.tournament_id, registration.created_at, registration.id,
  nullif(btrim(registration.player_name), '') as competition_alias
from public.registrations registration
where registration.registration_status = 'approved';
revoke all on ironclad_private.gaming_profile_competition_aliases from public, anon, authenticated, service_role;

-- Existing projection contracts are redefined explicitly below.

do $preconditions$
declare expected record; actual record;
begin
  for expected in select * from (values
    ('leaderboard_public_all_time_standings', array['a3edad90e789fd680d963440c9c21333']),
    ('leaderboard_public_season_champions', array['ab479b90424ae6b665c015db159a00f4', '4ccaf3c9e241d120263bb3e4caa67561']),
    ('leaderboard_public_season_standings', array['e698efcf08a2c962f6f31de907108dd6', '55069c88ef25c6536313f8bed7c62c16']),
    ('public_player_profiles', array['88a38eb4106336a67c7dc9219b550351']),
    ('public_player_showcases', array['517ba2f57d97aba850a6db596ac5b9d4'])
  ) as reviewed(name, definitions) loop
    select c.relkind, c.relowner, c.reloptions, pg_get_viewdef(c.oid, true) as definition
      into actual from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = expected.name;
    if not found or actual.relkind <> 'v' or pg_get_userbyid(actual.relowner) <> 'postgres'
      or not coalesce(actual.reloptions @> array['security_barrier=true','security_invoker=false'], false)
      or not (md5(replace(actual.definition, chr(13), '')) = any(expected.definitions)) then
      raise exception 'Unexpected pre-transition view definition for %', expected.name;
    end if;
  end loop;
  if (to_regclass('ironclad_private.legacy_main_pro_season_transition') is null)
    <> (to_regclass('ironclad_private.leaderboard_official_season_standings') is null) then
    raise exception 'Incomplete leaderboard bridge';
  end if;
end;
$preconditions$;

create or replace view public.leaderboard_public_all_time_standings
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN visibility.profile_public THEN all_time.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.optional_public THEN player.display_name
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS display_name,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS in_game_name,
        CASE
            WHEN visibility.optional_public THEN player.country
            ELSE NULL::text
        END AS country,
        CASE
            WHEN visibility.profile_public THEN player.region
            ELSE NULL::text
        END AS region,
        CASE
            WHEN visibility.profile_public THEN player.current_elo
            ELSE NULL::integer
        END AS current_elo,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    all_time.bracket_type,
    all_time.total_points,
    all_time.tournaments_played,
    all_time.rounds_passed,
    all_time.tournament_wins,
    all_time.matches_played,
    all_time.matches_won,
    all_time.matches_lost,
    all_time.win_rate,
    all_time.best_season_rank,
    all_time.last_active_season_id,
    season.name AS last_active_season_name,
    season.year AS last_active_season_year,
    season.season_number AS last_active_season_number,
    all_time.updated_at,
    row_number() OVER (PARTITION BY all_time.bracket_type ORDER BY all_time.player_id) AS display_order
   FROM leaderboard_player_all_time_stats all_time
     JOIN players player ON player.id = all_time.player_id
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
     LEFT JOIN LATERAL (
       SELECT alias.competition_alias FROM ironclad_private.gaming_profile_competition_aliases alias
       WHERE NOT visibility.profile_public AND player.account_closed_at IS NULL AND alias.profile_id = player.id
         AND alias.competition_alias IS NOT NULL
       ORDER BY alias.created_at DESC NULLS LAST, alias.id LIMIT 1
     ) historical ON true
     LEFT JOIN leaderboard_seasons season ON season.id = all_time.last_active_season_id;

create or replace view public.public_player_profiles
with (security_barrier = true, security_invoker = false) as
 SELECT player.id,
    CASE WHEN visibility.optional_public THEN player.display_name ELSE player.in_game_name END AS display_name,
    player.in_game_name AS player_name,
    CASE WHEN visibility.optional_public THEN player.country END AS country,
    player.region,
    player.current_elo,
    true AS public_profile_enabled,
    player.discord_public_enabled,
    CASE WHEN player.discord_public_enabled THEN player.discord_username END AS discord_username,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    CASE WHEN NOT visibility.policy_active THEN player.created_at END AS created_at,
    visibility.optional_public AS optional_profile_enabled
   FROM public.players player
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
  WHERE visibility.profile_public;

create or replace view public.public_player_showcases
with (security_barrier = true, security_invoker = false) as
 SELECT showcase.player_id,
        CASE
            WHEN showcase.thought_hidden_at IS NULL THEN showcase.current_thought
            ELSE NULL::text
        END AS current_thought,
    award.badge_slug AS featured_badge_slug,
        CASE
            WHEN isfinite(award.unlocked_at) THEN award.unlocked_at
            ELSE NULL::timestamp with time zone
        END AS featured_badge_unlocked_at
   FROM player_showcases showcase
     JOIN players player ON player.id = showcase.player_id
     LEFT JOIN player_badge_awards award ON award.id = showcase.featured_badge_award_id AND award.player_id = showcase.player_id AND (award.badge_slug = ANY (ARRAY['ironclad-recruit'::text, 'first-deployment'::text, 'first-victory'::text, 'battle-tested'::text, 'rising-through-the-ranks'::text, 'first-campaign'::text, 'iron-regular'::text, 'tournament-veteran'::text, 'season-campaigner'::text, 'reliable-competitor'::text, 'five-victories'::text, 'ten-victories'::text, 'twenty-five-victories'::text, 'iron-streak'::text, 'unbroken'::text, 'clean-sweep'::text, 'comeback-commander'::text, 'giant-slayer'::text, 'giant-hunter'::text, 'flawless-campaign'::text, 'first-advance'::text, 'semifinalist'::text, 'finalist'::text, 'academy-champion'::text, 'challenge-champion'::text, 'elite-champion'::text, 'double-champion'::text, 'triple-crown'::text, 'season-podium'::text, 'season-champion'::text]))
  WHERE player_showcase_enabled()
    AND player.id IN (SELECT id FROM ironclad_private.gaming_profile_visibility WHERE optional_public);

do $projection$
begin
  if to_regclass('ironclad_private.legacy_main_pro_season_transition') is not null then
    execute $view$
create or replace view public.leaderboard_public_season_standings
with (security_barrier = true, security_invoker = false) as
 SELECT season_stats.season_id,
        CASE
            WHEN season_stats.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season.id AND x.activated_at IS NOT NULL)) THEN (season.year::text || ' Pro Season '::text) || season.season_number::text
            ELSE season.name
        END AS season_name,
    season.year,
    season.season_number,
    season.start_date,
    season.end_date,
        CASE
            WHEN visibility.profile_public THEN season_stats.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.optional_public THEN player.display_name
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS display_name,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS in_game_name,
        CASE
            WHEN visibility.optional_public THEN player.country
            ELSE NULL::text
        END AS country,
        CASE
            WHEN visibility.profile_public THEN player.region
            ELSE NULL::text
        END AS region,
        CASE
            WHEN visibility.profile_public THEN player.current_elo
            ELSE NULL::integer
        END AS current_elo,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    season_stats.bracket_type,
    season_stats.total_points,
    season_stats.tournaments_played,
    season_stats.rounds_passed,
    season_stats.tournament_wins,
    season_stats.matches_played,
    season_stats.matches_won,
    season_stats.matches_lost,
    season_stats.win_rate,
        CASE
            WHEN player.account_closed_at IS NULL THEN season_stats.last_tournament_id
            ELSE NULL::uuid
        END AS last_tournament_id,
    last_tournament.title AS last_tournament_title,
    season_stats.last_tournament_points,
    season_stats.current_rank,
    season_stats.previous_rank,
    season_stats.rank_movement,
    season_stats.updated_at,
    row_number() OVER (PARTITION BY season_stats.season_id, season_stats.bracket_type ORDER BY season_stats.player_id) AS display_order,
        CASE
            WHEN season_stats.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season_stats.season_id AND x.tournament_id = season_stats.last_tournament_id AND x.activated_at IS NOT NULL)) THEN 'main'::text
            ELSE season_stats.bracket_type
        END AS last_tournament_bracket_type
   FROM ( SELECT s.season_id,
            s.player_id,
            s.bracket_type,
            s.total_points,
            s.tournaments_played,
            s.rounds_passed,
            s.tournament_wins,
            s.matches_played,
            s.matches_won,
            s.matches_lost,
            s.win_rate,
            s.last_tournament_id,
            s.last_tournament_points,
            s.current_rank,
            s.previous_rank,
            s.rank_movement,
            s.updated_at
           FROM leaderboard_player_season_stats s
          WHERE s.bracket_type <> 'pro'::text OR NOT (EXISTS ( SELECT 1
                   FROM ironclad_private.legacy_main_pro_season_transition x
                  WHERE x.season_id = s.season_id AND x.activated_at IS NOT NULL))
        UNION ALL
         SELECT official.season_id,
            official.player_id,
            official.bracket_type,
            official.total_points,
            official.tournaments_played,
            official.rounds_passed,
            official.tournament_wins,
            official.matches_played,
            official.matches_won,
            official.matches_lost,
            official.win_rate,
            official.last_tournament_id,
            official.last_tournament_points,
            official.current_rank,
            official.previous_rank,
            official.rank_movement,
            official.updated_at
           FROM ironclad_private.leaderboard_official_season_standings official
             JOIN ironclad_private.legacy_main_pro_season_transition x ON x.season_id = official.season_id AND x.activated_at IS NOT NULL) season_stats
     JOIN leaderboard_seasons season ON season.id = season_stats.season_id
     JOIN players player ON player.id = season_stats.player_id
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
     LEFT JOIN LATERAL (
       SELECT alias.competition_alias FROM ironclad_private.gaming_profile_competition_aliases alias
       WHERE NOT visibility.profile_public AND player.account_closed_at IS NULL AND alias.profile_id = player.id
         AND alias.competition_alias IS NOT NULL
         AND alias.tournament_id = season_stats.last_tournament_id
       ORDER BY alias.created_at DESC NULLS LAST, alias.id LIMIT 1
     ) historical ON true
     LEFT JOIN tournaments last_tournament ON last_tournament.id = season_stats.last_tournament_id;
    $view$;
  else
    execute $view$
create or replace view public.leaderboard_public_season_standings
with (security_barrier = true, security_invoker = false) as
 SELECT season_stats.season_id,
    season.name AS season_name,
    season.year,
    season.season_number,
    season.start_date,
    season.end_date,
        CASE
            WHEN visibility.profile_public THEN season_stats.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.optional_public THEN player.display_name
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS display_name,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS in_game_name,
        CASE
            WHEN visibility.optional_public THEN player.country
            ELSE NULL::text
        END AS country,
        CASE
            WHEN visibility.profile_public THEN player.region
            ELSE NULL::text
        END AS region,
        CASE
            WHEN visibility.profile_public THEN player.current_elo
            ELSE NULL::integer
        END AS current_elo,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    season_stats.bracket_type,
    season_stats.total_points,
    season_stats.tournaments_played,
    season_stats.rounds_passed,
    season_stats.tournament_wins,
    season_stats.matches_played,
    season_stats.matches_won,
    season_stats.matches_lost,
    season_stats.win_rate,
        CASE
            WHEN player.account_closed_at IS NULL THEN season_stats.last_tournament_id
            ELSE NULL::uuid
        END AS last_tournament_id,
    last_tournament.title AS last_tournament_title,
    season_stats.last_tournament_points,
    season_stats.current_rank,
    season_stats.previous_rank,
    season_stats.rank_movement,
    season_stats.updated_at,
    row_number() OVER (PARTITION BY season_stats.season_id, season_stats.bracket_type ORDER BY season_stats.player_id) AS display_order
   FROM leaderboard_player_season_stats season_stats
     JOIN leaderboard_seasons season ON season.id = season_stats.season_id
     JOIN players player ON player.id = season_stats.player_id
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
     LEFT JOIN LATERAL (
       SELECT alias.competition_alias FROM ironclad_private.gaming_profile_competition_aliases alias
       WHERE NOT visibility.profile_public AND player.account_closed_at IS NULL AND alias.profile_id = player.id
         AND alias.competition_alias IS NOT NULL
         AND alias.tournament_id = season_stats.last_tournament_id
       ORDER BY alias.created_at DESC NULLS LAST, alias.id LIMIT 1
     ) historical ON true
     LEFT JOIN tournaments last_tournament ON last_tournament.id = season_stats.last_tournament_id;
    $view$;
  end if;
end;
$projection$;

do $projection$
begin
  if to_regclass('ironclad_private.legacy_main_pro_season_transition') is not null then
    execute $view$
create or replace view public.leaderboard_public_season_champions
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN visibility.profile_public THEN champion.id::text
            ELSE 'private-champion:'::text || md5(champion.id::text)
        END AS id,
    champion.season_id,
        CASE
            WHEN champion.bracket_type = 'pro'::text AND (EXISTS ( SELECT 1
               FROM ironclad_private.legacy_main_pro_season_transition x
              WHERE x.season_id = season.id AND x.activated_at IS NOT NULL)) THEN (season.year::text || ' Pro Season '::text) || season.season_number::text
            ELSE season.name
        END AS season_name,
    champion.bracket_type,
        CASE
            WHEN visibility.profile_public THEN champion.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS player_name,
        CASE
            WHEN visibility.optional_public THEN player.country
            ELSE NULL::text
        END AS country,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    champion.final_rank,
    champion.final_points,
    champion.created_at
   FROM leaderboard_season_champions champion
     JOIN leaderboard_seasons season ON season.id = champion.season_id
     JOIN players player ON player.id = champion.player_id
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
     LEFT JOIN LATERAL (
       SELECT alias.competition_alias FROM ironclad_private.gaming_profile_competition_aliases alias
       WHERE NOT visibility.profile_public AND player.account_closed_at IS NULL AND alias.profile_id = player.id
         AND alias.competition_alias IS NOT NULL
       ORDER BY alias.created_at DESC NULLS LAST, alias.id LIMIT 1
     ) historical ON true;
    $view$;
  else
    execute $view$
create or replace view public.leaderboard_public_season_champions
with (security_barrier = true, security_invoker = false) as
 SELECT
        CASE
            WHEN visibility.profile_public THEN champion.id::text
            ELSE 'private-champion:'::text || md5(champion.id::text)
        END AS id,
    champion.season_id,
    season.name AS season_name,
    champion.bracket_type,
        CASE
            WHEN visibility.profile_public THEN champion.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN visibility.profile_public THEN player.in_game_name
            ELSE coalesce(historical.competition_alias, 'Competitor'::text)
        END AS player_name,
        CASE
            WHEN visibility.optional_public THEN player.country
            ELSE NULL::text
        END AS country,
    visibility.optional_public AND player.avatar_url IS NOT NULL AS has_avatar,
    champion.final_rank,
    champion.final_points,
    champion.created_at
   FROM leaderboard_season_champions champion
     JOIN leaderboard_seasons season ON season.id = champion.season_id
     JOIN players player ON player.id = champion.player_id
     JOIN ironclad_private.gaming_profile_visibility visibility ON visibility.id = player.id
     LEFT JOIN LATERAL (
       SELECT alias.competition_alias FROM ironclad_private.gaming_profile_competition_aliases alias
       WHERE NOT visibility.profile_public AND player.account_closed_at IS NULL AND alias.profile_id = player.id
         AND alias.competition_alias IS NOT NULL
       ORDER BY alias.created_at DESC NULLS LAST, alias.id LIMIT 1
     ) historical ON true;
    $view$;
  end if;
end;
$projection$;

comment on view public.public_player_profiles is
  'Public competitive identity for active players. Optional details are filtered separately. Discord has its own setting.';

CREATE OR REPLACE FUNCTION public.can_read_public_player_combat_highlight(p_upload_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select public.player_combat_highlights_enabled() and exists (
    select 1 from ironclad_private.player_combat_highlight_uploads u
    join public.player_combat_highlight_slots s on s.player_id=u.player_id
      and s.slot_number=u.slot_number and s.current_upload_id=u.id
    join ironclad_private.gaming_profile_visibility visibility on visibility.id=s.player_id
    where u.id=p_upload_id and u.state='ready' and u.verified is not null
      and s.hidden_at is null and visibility.optional_public
  );
$function$
;

notify pgrst, 'reload schema';
commit;
