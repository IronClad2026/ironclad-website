-- Synthetic relation shapes only. The runner installs exact checked-in public
-- view/function definitions before applying the migration under test.
create role anon;
create role authenticated;
create role service_role bypassrls;
create role authenticator;
grant anon, authenticated, service_role to authenticator;
create schema auth;
create schema ironclad_private;
grant usage on schema auth to anon, authenticated, service_role;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.platform_settings(key text primary key, value jsonb not null);
create table public.players (
  id uuid primary key, clerk_user_id text unique not null, display_name text not null,
  in_game_name text not null, country text, region text, current_elo integer, avatar_url text,
  public_profile_enabled boolean not null default false, discord_public_enabled boolean not null default false,
  discord_username text, account_closed_at timestamptz, created_at timestamptz not null default clock_timestamp(),
  profile_completed boolean not null default true, coh3_profile_id text
);
create table public.legal_documents (
  id uuid primary key, document_kind text not null, version text not null, status text not null,
  canonical_url text, url text, sha256 text, published_at timestamptz, effective_at timestamptz
);
create table public.account_legal_acceptances (
  clerk_user_id text not null, accepted_at timestamptz not null default clock_timestamp(),
  terms_document_id uuid not null references public.legal_documents, terms_version text not null,
  terms_url text, terms_sha256 text, privacy_document_id uuid not null references public.legal_documents,
  privacy_version text not null, privacy_url text, privacy_sha256 text, terms_accepted boolean not null,
  privacy_acknowledged boolean not null, primary key (clerk_user_id, terms_document_id, privacy_document_id)
);
create table ironclad_private.patch2_closed_accounts(subject_digest bytea primary key, closed_at timestamptz default now());
create table public.player_showcases (
  player_id uuid primary key, current_thought text, thought_hidden_at timestamptz, featured_badge_award_id uuid
);
create table public.player_badge_awards (id uuid primary key, player_id uuid, badge_slug text, unlocked_at timestamptz);
create table public.player_combat_highlight_slots (
  player_id uuid, slot_number integer, display_order integer, revision bigint, hidden_at timestamptz,
  current_upload_id uuid, pending_upload_id uuid, primary key(player_id, slot_number)
);
create table ironclad_private.player_combat_highlight_uploads (
  id uuid primary key, player_id uuid, slot_number integer, state text, verified jsonb, title text, content_type text
);
create table public.leaderboard_seasons (
  id uuid primary key, name text, year integer, season_number integer, start_date date, end_date date
);
create table public.tournaments (id uuid primary key, title text not null, status text not null default 'completed', slug text, ends_at timestamptz);
create table public.registrations (
  id uuid primary key, profile_id uuid references public.players, tournament_id uuid references public.tournaments,
  player_name text not null, registration_status text not null, created_at timestamptz not null default clock_timestamp()
);
grant select on public.registrations to service_role;
create table public.leaderboard_player_season_stats (
  season_id uuid, player_id uuid, bracket_type text, total_points integer, tournaments_played integer,
  rounds_passed integer, tournament_wins integer, matches_played integer, matches_won integer,
  matches_lost integer, win_rate numeric, last_tournament_id uuid, last_tournament_points integer,
  current_rank integer, previous_rank integer, rank_movement integer, updated_at timestamptz
);
create table public.leaderboard_player_all_time_stats (
  player_id uuid, bracket_type text, total_points integer, tournaments_played integer, rounds_passed integer,
  tournament_wins integer, matches_played integer, matches_won integer, matches_lost integer, win_rate numeric,
  best_season_rank integer, last_active_season_id uuid, updated_at timestamptz
);
create table public.leaderboard_season_champions (
  id uuid primary key, season_id uuid, player_id uuid, bracket_type text, final_rank integer, final_points integer,
  created_at timestamptz
);

create function public.player_showcase_enabled() returns boolean language sql stable as $$ select true $$;
create function public.player_combat_highlights_enabled() returns boolean language sql stable as $$ select true $$;
create function ironclad_private.patch2_account_state(p_sub text) returns text
language sql stable set search_path=pg_catalog as $$
  select case when p_sub is null or exists (select from ironclad_private.patch2_closed_accounts
    where subject_digest=sha256(convert_to(p_sub,'UTF8')))
    or exists(select from public.players where clerk_user_id=p_sub and account_closed_at is not null) then 'denied'
  when exists(select from public.players where clerk_user_id=p_sub) then 'active-player' else 'no-player' end
$$;
