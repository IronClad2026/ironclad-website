begin;

-- Players still need their own registration rows, but private administrator
-- notes must not be selectable through the authenticated Supabase Data API.
-- Keep the existing own-row RLS policy and replace its table-wide SELECT grant
-- with the same column surface minus admin_notes.
revoke select on table public.registrations from authenticated;

grant select (
  id,
  profile_id,
  clerk_user_id,
  player_name,
  discord_username,
  steam_name,
  coh3_player_card_url,
  country,
  region,
  timezone,
  submitted_elo,
  tournament_title,
  bracket_name,
  registration_status,
  elo_status,
  created_at,
  updated_at,
  tournament_id,
  tournament_bracket_id,
  elo_verified_elo,
  elo_difference,
  elo_highest_faction,
  elo_checked_mode,
  elo_checked_at,
  elo_verification_source,
  elo_verification_error,
  elo_verification_payload,
  elo_verified_player_name,
  elo_identity_status,
  elo_identity_error,
  elo_verified_division,
  elo_calculation_version
) on table public.registrations to authenticated;

comment on column public.registrations.admin_notes is
  'Private administrator-only registration review context. Never include this column in player-facing or public projections.';

commit;
