begin;

-- The player profile view is an intentionally retained owner-rights boundary.
-- Its definition masks private Discord values and raw avatar paths before
-- exposing opted-in profiles to anonymous readers.
alter view public.public_player_profiles
  set (
    security_barrier = true,
    security_invoker = false
  );

comment on view public.public_player_profiles is
  'Public-safe owner-rights projection intentionally retained to mask Discord and raw avatar fields before anonymous access. Only opted-in players are exposed; external roles have SELECT-only access.';

-- These public leaderboard views can safely honor the querying role because
-- their underlying public-display tables have matching RLS policies. The
-- nested public_player_profiles view remains the reviewed masking boundary.
alter view public.leaderboard_current_season
  set (
    security_barrier = true,
    security_invoker = true
  );

alter view public.leaderboard_public_season_standings
  set (
    security_barrier = true,
    security_invoker = true
  );

alter view public.leaderboard_public_all_time_standings
  set (
    security_barrier = true,
    security_invoker = true
  );

revoke all privileges on table
  public.public_player_profiles,
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings
from public, anon, authenticated, service_role;

grant select on table
  public.public_player_profiles,
  public.leaderboard_current_season,
  public.leaderboard_public_season_standings,
  public.leaderboard_public_all_time_standings
to anon, authenticated, service_role;

-- Public bracket presentation now passes through a server-only allowlist, and
-- platform settings are read only by protected server workflows.
revoke all privileges on table
  public.generated_brackets,
  public.tournament_matches,
  public.platform_settings
from public, anon, authenticated;

grant all privileges on table
  public.generated_brackets,
  public.tournament_matches,
  public.platform_settings
to service_role;

drop policy if exists "Public can read generated brackets"
  on public.generated_brackets;

drop policy if exists "Public can read tournament matches"
  on public.tournament_matches;

drop policy if exists "Public can read platform settings"
  on public.platform_settings;

-- Authenticated registration inserts still need the ELO feature flag inside
-- their RLS check. Keep that dependency out of the exposed API schema while
-- preserving the exact existing registration policy and trigger semantics.
create schema ironclad_private authorization postgres;

revoke all privileges on schema ironclad_private
  from public, anon, authenticated, service_role;
grant usage on schema ironclad_private
  to authenticated, service_role;

create function
  ironclad_private.registration_elo_verification_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.is_elo_verification_enabled();
$$;

alter function ironclad_private.registration_elo_verification_enabled()
  owner to postgres;

revoke execute on function
  ironclad_private.registration_elo_verification_enabled()
from public, anon, authenticated, service_role;
grant execute on function
  ironclad_private.registration_elo_verification_enabled()
to authenticated, service_role;

comment on schema ironclad_private is
  'Non-exposed helpers used by IronClad database authorization policies. Do not add this schema to the Supabase Data API exposed schemas.';
comment on function
  ironclad_private.registration_elo_verification_enabled() is
  'Private RLS helper that preserves the authenticated registration eligibility check without exposing the public ELO settings RPC.';

drop policy if exists "Players can submit registrations"
  on public.registrations;

create policy "Players can submit registrations"
on public.registrations
for insert
to authenticated
with check (
  clerk_user_id = (auth.jwt() ->> 'sub')
  and not ironclad_private.registration_elo_verification_enabled()
  and registration_status in ('pending', 'waitlisted')
  and elo_status = 'pending'
  and elo_verified_elo is null
  and elo_difference is null
  and elo_highest_faction is null
  and elo_checked_mode is null
  and elo_checked_at is null
  and elo_verification_source is null
  and elo_verification_error is null
  and elo_verification_payload is null
  and elo_verified_player_name is null
  and elo_identity_status is null
  and elo_identity_error is null
  and exists (
    select 1
    from public.players as player
    where player.id = registrations.profile_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
      and player.profile_completed
      and player.in_game_name = registrations.player_name
      and player.discord_username
        is not distinct from registrations.discord_username
      and player.steam_username
        is not distinct from registrations.steam_name
      and player.coh3_player_card_url
        is not distinct from registrations.coh3_player_card_url
      and player.country is not distinct from registrations.country
      and player.region is not distinct from registrations.region
      and player.timezone is not distinct from registrations.timezone
      and player.current_elo
        is not distinct from registrations.submitted_elo
  )
);

-- Trigger functions are invoked by their table triggers, not directly by API
-- callers. Keep explicit service-role access for protected server workflows.
revoke execute on function public.canonicalize_registration_identity()
  from public, anon, authenticated;
grant execute on function public.canonicalize_registration_identity()
  to service_role;

revoke execute on function public.enforce_registration_elo_eligibility()
  from public, anon, authenticated;
grant execute on function public.enforce_registration_elo_eligibility()
  to service_role;

revoke execute on function public.enforce_tournament_registration_availability()
  from public, anon, authenticated;
grant execute on function public.enforce_tournament_registration_availability()
  to service_role;

revoke execute on function public.link_approved_submission_to_match()
  from public, anon, authenticated;
grant execute on function public.link_approved_submission_to_match()
  to service_role;

revoke execute on function public.protect_notification_client_mutation()
  from public, anon, authenticated;
grant execute on function public.protect_notification_client_mutation()
  to service_role;

revoke execute on function public.protect_player_coh3_profile_id()
  from public, anon, authenticated;
grant execute on function public.protect_player_coh3_profile_id()
  to service_role;

revoke execute on function public.refresh_generated_bracket_on_approval()
  from public, anon, authenticated;
grant execute on function public.refresh_generated_bracket_on_approval()
  to service_role;

revoke execute on function public.refresh_round_robin_standings_on_match()
  from public, anon, authenticated;
grant execute on function public.refresh_round_robin_standings_on_match()
  to service_role;

-- Formerly public helper RPCs now run only through protected server clients.
revoke execute on function public.get_tournament_bracket_capacity()
  from public, anon, authenticated;
grant execute on function public.get_tournament_bracket_capacity()
  to service_role;

revoke execute on function public.is_elo_verification_enabled()
  from public, anon, authenticated;
grant execute on function public.is_elo_verification_enabled()
  to service_role;

-- Leaderboard writes are restricted to owner/service-role workflows.
revoke execute on function public.leaderboard_require_write_access()
  from public, anon, authenticated;
grant execute on function public.leaderboard_require_write_access()
  to service_role;

revoke execute on function public.get_or_create_leaderboard_season(date)
  from public, anon, authenticated;
grant execute on function public.get_or_create_leaderboard_season(date)
  to service_role;

revoke execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_tournament(uuid, text)
to service_role;

revoke execute on function
  public.recalculate_leaderboard_for_season(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_for_season(uuid, text)
to service_role;

revoke execute on function
  public.recalculate_leaderboard_all_time(text)
from public, anon, authenticated;
grant execute on function
  public.recalculate_leaderboard_all_time(text)
to service_role;

revoke execute on function public.add_leaderboard_admin_adjustment(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.add_leaderboard_admin_adjustment(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  uuid,
  uuid,
  text
) to service_role;

alter function public.ironclad_set_updated_at()
  set search_path = pg_catalog;

alter function public.is_admin_jwt()
  set search_path = pg_catalog;

alter function public.sync_tournament_registration_enabled()
  set search_path = pg_catalog;

commit;
