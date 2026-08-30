import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  PRODUCTION_PROJECT,
  STAGING_PROJECT,
} from "./project-guard.mjs";

const SUPABASE_CLI_VERSION = "2.114.0";
const SECRET_ENVIRONMENT_KEYS = Object.freeze([
  "BADGE_E2E_STAGING_SERVICE_ROLE_KEY",
  "BADGE_E2E_STAGING_ANON_KEY",
  "BADGE_E2E_STAGING_AUTHENTICATED_JWT",
  "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
]);

export const REQUIRED_BADGE_MIGRATIONS = Object.freeze([
  "20260821000000",
  "20260821001000",
  "20260821002000",
  "20260821003000",
  "20260821004000",
  "20260821005000",
  "20260821006000",
  "20260821007000",
  "20260821008000",
  "20260821009000",
  "20260821010000",
  "20260830090000",
  "20260831090000",
  "20260831100000",
]);

export const REQUIRED_TABLES = Object.freeze([
  "public.player_badge_awards",
  "public.player_badge_reveals",
  "public.match_participant_outcome_authority",
  "public.match_game_result_authority",
  "public.tournament_championship_path_authority",
  "public.tournament_championship_path_summary_authority",
  "public.leaderboard_point_events",
  "public.leaderboard_seasons",
  "public.leaderboard_player_season_stats",
  "public.leaderboard_season_champions",
  "public.leaderboard_tournament_season_memberships",
  "public.players",
  "public.registrations",
  "public.tournaments",
  "public.tournament_brackets",
  "public.generated_brackets",
  "public.bracket_rounds",
  "public.tournament_matches",
  "public.match_result_report_groups",
  "public.match_result_submissions",
  "public.match_replay_upload_attempts",
  "public.tournament_bracket_map_pool_entries",
  "public.coh3_maps",
  "public.legal_documents",
  "public.registration_acceptances",
]);

export const REQUIRED_TABLE_COLUMNS = Object.freeze([
  ["public.players", "avatar_url"],
  ["public.players", "profile_completed"],
  ["public.players", "steam_id64"],
  ["public.players", "current_elo"],
  ["public.players", "relic_verified_elo"],
  ["public.players", "relic_verified_faction"],
  ["public.players", "relic_verified_division"],
  ["public.players", "relic_elo_calculation_version"],
  ["public.players", "relic_elo_verified_at"],
  ["public.players", "country"],
  ["public.players", "region"],
  ["public.players", "timezone"],
  ["public.player_badge_awards", "player_id"],
  ["public.player_badge_awards", "badge_slug"],
  ["public.player_badge_awards", "source_type"],
  ["public.player_badge_awards", "source_id"],
  ["public.player_badge_awards", "source_metadata"],
  ["public.player_badge_awards", "original_unlocked_at"],
  ["public.player_badge_reveals", "id"],
  ["public.player_badge_reveals", "player_badge_award_id"],
  ["public.player_badge_reveals", "player_id"],
  ["public.player_badge_reveals", "revealed_at"],
  ["public.player_badge_reveals", "created_at"],
  ["public.match_participant_outcome_authority", "match_id"],
  ["public.match_participant_outcome_authority", "registration_id"],
  ["public.match_participant_outcome_authority", "outcome_kind"],
  ["public.match_participant_outcome_authority", "revision"],
  ["public.match_game_result_authority", "winner_registration_id"],
  ["public.match_game_result_authority", "authority_state"],
  ["public.match_game_result_authority", "game_authority_complete"],
  ["public.tournament_championship_path_authority", "path_index"],
  ["public.tournament_championship_path_authority", "authority_state"],
  ["public.tournament_championship_path_summary_authority", "completeness_state"],
  ["public.leaderboard_player_season_stats", "current_rank"],
  ["public.leaderboard_season_champions", "final_rank"],
]);

export const REQUIRED_TABLE_COLUMN_TYPES = Object.freeze([
  ["public.players", "avatar_url", "text"],
  ["public.players", "profile_completed", "boolean"],
  ["public.players", "steam_id64", "text"],
  ["public.players", "current_elo", "integer"],
  ["public.players", "relic_verified_elo", "bigint"],
  ["public.players", "relic_verified_faction", "text"],
  ["public.players", "relic_verified_division", "text"],
  ["public.players", "relic_elo_calculation_version", "text"],
  ["public.players", "relic_elo_verified_at", "timestamp with time zone"],
  ["public.players", "country", "text"],
  ["public.players", "region", "text"],
  ["public.players", "timezone", "text"],
  ["public.player_badge_awards", "player_id", "uuid"],
  ["public.player_badge_awards", "badge_slug", "text"],
  ["public.player_badge_awards", "source_type", "text"],
  ["public.player_badge_awards", "source_id", "uuid"],
  ["public.player_badge_awards", "source_metadata", "jsonb"],
  [
    "public.player_badge_awards",
    "original_unlocked_at",
    "timestamp with time zone",
  ],
  ["public.player_badge_reveals", "id", "uuid"],
  ["public.player_badge_reveals", "player_badge_award_id", "uuid"],
  ["public.player_badge_reveals", "player_id", "uuid"],
  [
    "public.player_badge_reveals",
    "revealed_at",
    "timestamp with time zone",
  ],
  [
    "public.player_badge_reveals",
    "created_at",
    "timestamp with time zone",
  ],
  ["public.match_participant_outcome_authority", "match_id", "uuid"],
  ["public.match_participant_outcome_authority", "registration_id", "uuid"],
  ["public.match_participant_outcome_authority", "outcome_kind", "text"],
  ["public.match_participant_outcome_authority", "revision", "integer"],
  ["public.match_game_result_authority", "winner_registration_id", "uuid"],
  ["public.match_game_result_authority", "authority_state", "text"],
  ["public.match_game_result_authority", "game_authority_complete", "boolean"],
  ["public.tournament_championship_path_authority", "path_index", "integer"],
  ["public.tournament_championship_path_authority", "authority_state", "text"],
  [
    "public.tournament_championship_path_summary_authority",
    "completeness_state",
    "text",
  ],
  ["public.leaderboard_player_season_stats", "current_rank", "integer"],
  ["public.leaderboard_season_champions", "final_rank", "integer"],
]);

export const REQUIRED_UNIQUE_INDEXES = Object.freeze([
  ["public.player_badge_awards", "player_badge_awards_player_badge_key"],
  ["public.player_badge_awards", "player_badge_awards_id_player_unique"],
  ["public.player_badge_reveals", "player_badge_reveals_pkey"],
  ["public.player_badge_reveals", "player_badge_reveals_award_unique"],
  ["public.match_participant_outcome_authority", "match_participant_outcome_authority_revision_key"],
  ["public.match_game_result_authority", "match_game_result_authority_revision_key"],
]);

export const REQUIRED_REVEAL_COLUMN_CONTRACTS = Object.freeze([
  Object.freeze({
    table: "public.player_badge_reveals",
    column: "id",
    type: "uuid",
    notNull: true,
    defaultExpression: "gen_random_uuid()",
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    column: "player_badge_award_id",
    type: "uuid",
    notNull: true,
    defaultExpression: null,
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    column: "player_id",
    type: "uuid",
    notNull: true,
    defaultExpression: null,
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    column: "revealed_at",
    type: "timestamp with time zone",
    notNull: true,
    defaultExpression: "clock_timestamp()",
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    column: "created_at",
    type: "timestamp with time zone",
    notNull: true,
    defaultExpression: "clock_timestamp()",
  }),
]);

export const REQUIRED_REVEAL_CONSTRAINTS = Object.freeze([
  Object.freeze({
    table: "public.player_badge_awards",
    name: "player_badge_awards_id_player_unique",
    type: "u",
    definitionFragments: Object.freeze(["UNIQUE (id, player_id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_pkey",
    type: "p",
    definitionFragments: Object.freeze(["PRIMARY KEY (id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_player_id_fkey",
    type: "f",
    definitionFragments: Object.freeze([
      "FOREIGN KEY (player_id)",
      "REFERENCES players(id)",
      "ON DELETE CASCADE",
    ]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_award_unique",
    type: "u",
    definitionFragments: Object.freeze(["UNIQUE (player_badge_award_id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_owned_award_fk",
    type: "f",
    definitionFragments: Object.freeze([
      "FOREIGN KEY (player_badge_award_id, player_id)",
      "REFERENCES player_badge_awards(id, player_id)",
      "ON DELETE CASCADE",
    ]),
  }),
]);

export const REQUIRED_REVEAL_INDEXES = Object.freeze([
  Object.freeze({
    table: "public.player_badge_awards",
    name: "player_badge_awards_id_player_unique",
    unique: true,
    definitionFragments: Object.freeze(["(id, player_id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_pkey",
    unique: true,
    definitionFragments: Object.freeze(["(id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_award_unique",
    unique: true,
    definitionFragments: Object.freeze(["(player_badge_award_id)"]),
  }),
  Object.freeze({
    table: "public.player_badge_reveals",
    name: "player_badge_reveals_player_revealed_idx",
    unique: false,
    definitionFragments: Object.freeze(["(player_id, revealed_at DESC)"]),
  }),
]);

export const REQUIRED_REVEAL_POLICIES = Object.freeze([
  Object.freeze({
    name: "Players can read their own badge reveals",
    command: "SELECT",
    roles: Object.freeze(["authenticated"]),
    usingFragments: Object.freeze([
      "player.id = player_badge_reveals.player_id",
      "player.clerk_user_id = (auth.jwt() ->> 'sub'::text)",
    ]),
    withCheckFragments: Object.freeze([]),
  }),
  Object.freeze({
    name: "Players can acknowledge their own badge reveals",
    command: "INSERT",
    roles: Object.freeze(["authenticated"]),
    usingFragments: Object.freeze([]),
    withCheckFragments: Object.freeze([
      "player.id = player_badge_reveals.player_id",
      "player.clerk_user_id = (auth.jwt() ->> 'sub'::text)",
    ]),
  }),
]);

export const REQUIRED_REVEAL_GRANTS = Object.freeze({
  authenticatedTable: Object.freeze(["SELECT"]),
  authenticatedColumns: Object.freeze([
    "player_badge_award_id:INSERT",
    "player_id:INSERT",
  ]),
  anonTableOrColumns: Object.freeze([]),
  publicTableOrColumns: Object.freeze([]),
  serviceRoleTable: Object.freeze([
    "DELETE",
    "INSERT",
    "REFERENCES",
    "SELECT",
    "TRIGGER",
    "TRUNCATE",
    "UPDATE",
  ]),
});

export const REQUIRED_FUNCTION_ARGUMENT_FRAGMENTS = Object.freeze([
  ["save_tournament", "p_tournament_id uuid"],
  ["save_tournament", "p_brackets jsonb"],
  ["submit_verified_player_registration", "p_profile_id uuid"],
  ["submit_verified_player_registration", "p_relic_elo bigint"],
  ["review_tournament_registration", "p_registration_id uuid"],
  ["generate_tournament_bracket", "p_tournament_bracket_id uuid"],
  ["save_bracket_assignments", "p_generated_bracket_id uuid"],
  ["publish_tournament_bracket_map_pools", "p_map_ids uuid[]"],
  ["launch_tournament_division", "p_tournament_bracket_id uuid"],
  ["process_matchup_deadlines", "p_limit integer"],
  ["prepare_match_replay_upload_attempt", "p_declared_replay_sizes integer[]"],
  ["claim_match_replay_attempt_finalization", "p_attempt_id uuid"],
  ["commit_match_replay_attempt_result", "p_finalization_claim_id uuid"],
  ["commit_match_replay_attempt_result", "p_replay_content_hashes text[]"],
  ["create_match_result_report_group", "p_submission_ids uuid[]"],
  ["confirm_match_result_report_group", "p_report_group_id uuid"],
  ["submit_match_no_show_report", "p_no_show_registration_id uuid"],
  ["apply_admin_official_match_result", "p_winner_registration_id uuid"],
  ["admin_reset_tournament_match", "p_match_id uuid"],
  ["void_tournament", "p_tournament_id uuid"],
  ["recalculate_leaderboard_for_tournament", "p_tournament_id uuid"],
  ["recalculate_leaderboard_for_season", "p_season_id uuid"],
  ["get_tournament_championship_path_summary", "p_registration_id uuid"],
  ["get_tournament_championship_path_segments", "p_registration_id uuid"],
]);

export const REQUIRED_FUNCTION_SIGNATURES = Object.freeze([
  ["begin_staging_badge_e2e_run", "p_fixture_secret text, p_run_marker text, p_mode text"],
  ["provision_staging_badge_e2e_player", "p_fixture_secret text, p_run_marker text, p_semantic_role text, p_division text"],
  ["inspect_staging_badge_e2e_run", "p_fixture_secret text, p_run_marker text"],
  [
    "save_tournament",
    "p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb",
  ],
  [
    "submit_verified_player_registration",
    "p_profile_id uuid, p_clerk_user_id text, p_steam_id64 text, p_tournament_id uuid, p_tournament_bracket_id uuid, p_relic_elo bigint, p_relic_faction text, p_relic_division text, p_relic_calculation_version text, p_rulebook_document_id uuid, p_ppa_document_id uuid, p_terms_document_id uuid, p_privacy_document_id uuid, p_rulebook_accepted boolean, p_ppa_accepted boolean, p_terms_accepted boolean, p_privacy_acknowledged boolean, p_age_18_confirmed boolean, p_account_and_steam_ownership_confirmed boolean, p_waitlist_confirmed boolean",
  ],
  [
    "review_tournament_registration",
    "p_registration_id uuid, p_registration_status text, p_admin_notes text",
  ],
  [
    "generate_tournament_bracket",
    "p_tournament_bracket_id uuid, p_generated_by text",
  ],
  [
    "save_bracket_assignments",
    "p_generated_bracket_id uuid, p_assignments jsonb, p_updated_by text",
  ],
  [
    "publish_tournament_bracket_map_pools",
    "p_tournament_id uuid, p_bracket_ids uuid[], p_map_ids uuid[], p_actor_clerk_user_id text",
  ],
  [
    "launch_tournament_division",
    "p_tournament_bracket_id uuid, p_actor_clerk_user_id text",
  ],
  ["process_matchup_deadlines", "p_limit integer"],
  [
    "prepare_match_replay_upload_attempt",
    "p_match_id uuid, p_submitted_by_clerk_user_id text, p_winner_registration_id uuid, p_player_one_score integer, p_player_two_score integer, p_declared_replay_sizes integer[]",
  ],
  [
    "claim_match_replay_attempt_finalization",
    "p_attempt_id uuid, p_match_id uuid, p_submitted_by_clerk_user_id text, p_winner_registration_id uuid, p_player_one_score integer, p_player_two_score integer",
  ],
  [
    "commit_match_replay_attempt_result",
    "p_attempt_id uuid, p_finalization_claim_id uuid, p_match_id uuid, p_submitted_by_clerk_user_id text, p_replay_content_hashes text[], p_notes text",
  ],
  [
    "create_match_result_report_group",
    "p_match_id uuid, p_submitted_by_clerk_user_id text, p_winner_registration_id uuid, p_player_one_score integer, p_player_two_score integer, p_submission_ids uuid[], p_replay_storage_path text",
  ],
  [
    "confirm_match_result_report_group",
    "p_report_group_id uuid, p_confirmed_by_clerk_user_id text",
  ],
  [
    "admin_finalize_match_result_report_group",
    "p_report_group_id uuid, p_decision text, p_reviewed_by text, p_review_notes text, p_player_one_score integer, p_player_two_score integer, p_winner_registration_id uuid",
  ],
  [
    "submit_match_no_show_report",
    "p_match_id uuid, p_submitted_by_clerk_user_id text, p_no_show_registration_id uuid, p_notes text",
  ],
  [
    "apply_admin_official_match_result",
    "p_match_id uuid, p_player_one_score integer, p_player_two_score integer, p_winner_registration_id uuid, p_decided_by text",
  ],
  ["admin_reset_tournament_match", "p_match_id uuid, p_reset_by text"],
  [
    "cancel_tournament",
    "p_tournament_id uuid, p_reason text, p_actor_clerk_user_id text",
  ],
  [
    "void_tournament",
    "p_tournament_id uuid, p_reason text, p_actor_clerk_user_id text",
  ],
  [
    "recalculate_leaderboard_for_tournament",
    "p_tournament_id uuid, p_triggered_by_clerk_user_id text",
  ],
  [
    "recalculate_leaderboard_for_season",
    "p_season_id uuid, p_triggered_by_clerk_user_id text",
  ],
  ["finalize_leaderboard_main_season_if_ready", "p_season_id uuid"],
  ["get_player_badge_match_participants", "p_match_id uuid"],
  ["get_player_badge_match_threshold_summary", "p_player_id uuid"],
  ["get_player_badge_tournament_for_match", "p_match_id uuid"],
  ["get_player_badge_tournament_participants", "p_tournament_id uuid"],
  [
    "get_player_badge_tournament_authority_participants",
    "p_tournament_id uuid",
  ],
  ["get_player_badge_tournament_summary", "p_player_id uuid"],
  ["get_player_badge_tournament_prestige_summary", "p_player_id uuid"],
  ["get_player_badge_bracket_progression_summary", "p_player_id uuid"],
  ["get_player_badge_match_excellence_summary", "p_player_id uuid"],
  ["get_player_badge_finalized_season_for_tournament", "p_tournament_id uuid"],
  ["get_player_badge_season_authority_participants", "p_season_id uuid"],
  ["get_player_badge_season_summary", "p_player_id uuid"],
  ["get_player_badge_reliable_competitor_summary", "p_player_id uuid"],
  ["get_player_badge_comeback_commander_summary", "p_player_id uuid"],
  ["get_player_badge_flawless_campaign_summary", "p_player_id uuid"],
  [
    "get_tournament_championship_path_summary",
    "p_tournament_id uuid, p_registration_id uuid",
  ],
  [
    "get_tournament_championship_path_segments",
    "p_tournament_id uuid, p_registration_id uuid",
  ],
]);

export const REQUIRED_FUNCTION_RETURNS = Object.freeze([
  ["save_tournament", "uuid"],
  [
    "submit_verified_player_registration",
    "TABLE(id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text, submitted_elo bigint, waitlist_confirmation_required boolean)",
  ],
  [
    "review_tournament_registration",
    "TABLE(registration_id uuid, tournament_id uuid, tournament_bracket_id uuid, registration_status text)",
  ],
  ["generate_tournament_bracket", "uuid"],
  ["save_bracket_assignments", "void"],
  ["publish_tournament_bracket_map_pools", "timestamp with time zone"],
  [
    "launch_tournament_division",
    "TABLE(tournament_id uuid, tournament_bracket_id uuid, launched_at timestamp with time zone, already_launched boolean)",
  ],
  ["process_matchup_deadlines", "jsonb"],
  ["prepare_match_replay_upload_attempt", "jsonb"],
  ["claim_match_replay_attempt_finalization", "jsonb"],
  ["commit_match_replay_attempt_result", "jsonb"],
  ["create_match_result_report_group", "uuid"],
  ["confirm_match_result_report_group", "void"],
  ["admin_finalize_match_result_report_group", "void"],
  ["submit_match_no_show_report", "jsonb"],
  ["apply_admin_official_match_result", "void"],
  ["admin_reset_tournament_match", "void"],
  ["cancel_tournament", "jsonb"],
  ["void_tournament", "jsonb"],
  ["recalculate_leaderboard_for_tournament", "uuid"],
  ["recalculate_leaderboard_for_season", "uuid"],
  ["finalize_leaderboard_main_season_if_ready", "boolean"],
  [
    "get_player_badge_match_participants",
    "TABLE(player_id uuid, registration_id uuid, match_id uuid, is_winner boolean, original_unlocked_at timestamp with time zone)",
  ],
  [
    "get_player_badge_match_threshold_summary",
    "TABLE(played_match_count integer, win_count integer, first_played_match_id uuid, first_played_at timestamp with time zone, tenth_played_match_id uuid, tenth_played_at timestamp with time zone, first_win_match_id uuid, first_win_at timestamp with time zone, fifth_win_match_id uuid, fifth_win_at timestamp with time zone, tenth_win_match_id uuid, tenth_win_at timestamp with time zone, twenty_fifth_win_match_id uuid, twenty_fifth_win_at timestamp with time zone)",
  ],
  ["get_player_badge_tournament_for_match", "TABLE(tournament_id uuid)"],
  ["get_player_badge_tournament_participants", "TABLE(player_id uuid)"],
  [
    "get_player_badge_tournament_authority_participants",
    "TABLE(player_id uuid)",
  ],
  [
    "get_player_badge_tournament_summary",
    "TABLE(completed_tournament_count integer, first_completed_tournament_id uuid, first_completed_at timestamp with time zone, third_completed_tournament_id uuid, third_completed_at timestamp with time zone, tenth_completed_tournament_id uuid, tenth_completed_at timestamp with time zone)",
  ],
  [
    "get_player_badge_tournament_prestige_summary",
    "TABLE(played_advance_win_count integer, first_advance_match_id uuid, first_advance_at timestamp with time zone, semifinalist_count integer, first_semifinal_tournament_id uuid, first_semifinal_at timestamp with time zone, finalist_count integer, first_finalist_tournament_id uuid, first_finalist_at timestamp with time zone, academy_championship_count integer, first_academy_championship_tournament_id uuid, first_academy_championship_at timestamp with time zone, challenge_championship_count integer, first_challenge_championship_tournament_id uuid, first_challenge_championship_at timestamp with time zone, main_championship_count integer, first_main_championship_tournament_id uuid, first_main_championship_at timestamp with time zone, championship_count integer, second_championship_tournament_id uuid, second_championship_at timestamp with time zone, triple_crown_bracket_count integer, triple_crown_tournament_id uuid, triple_crown_at timestamp with time zone)",
  ],
  [
    "get_player_badge_bracket_progression_summary",
    "TABLE(original_bracket text, original_tournament_id uuid, original_completed_at timestamp with time zone, higher_bracket text, higher_tournament_id uuid, higher_completed_at timestamp with time zone)",
  ],
  [
    "get_player_badge_match_excellence_summary",
    "TABLE(best_win_streak integer, third_streak_match_id uuid, third_streak_at timestamp with time zone, fifth_streak_match_id uuid, fifth_streak_at timestamp with time zone, clean_sweep_count integer, first_clean_sweep_match_id uuid, first_clean_sweep_at timestamp with time zone, upset_win_count integer, first_upset_match_id uuid, first_upset_at timestamp with time zone, first_upset_elo_delta integer, third_upset_match_id uuid, third_upset_at timestamp with time zone, third_upset_elo_delta integer)",
  ],
  ["get_player_badge_finalized_season_for_tournament", "TABLE(season_id uuid)"],
  ["get_player_badge_season_authority_participants", "TABLE(player_id uuid)"],
  [
    "get_player_badge_season_summary",
    "TABLE(season_campaigner_count integer, first_season_campaigner_season_id uuid, first_season_campaigner_at timestamp with time zone, first_season_campaigner_threshold_tournament_id uuid, first_season_campaigner_tournament_count integer, podium_finish_count integer, first_podium_season_id uuid, first_podium_at timestamp with time zone, first_podium_rank integer, champion_finish_count integer, first_champion_season_id uuid, first_champion_at timestamp with time zone, first_champion_rank integer)",
  ],
  [
    "get_player_badge_reliable_competitor_summary",
    "TABLE(best_run integer, tenth_match_id uuid, tenth_at timestamp with time zone)",
  ],
  [
    "get_player_badge_comeback_commander_summary",
    "TABLE(match_id uuid, game1_winner_registration_id uuid, series_winner_registration_id uuid, series_best_of integer, finalized_game_count integer, finalized_at timestamp with time zone)",
  ],
  [
    "get_player_badge_flawless_campaign_summary",
    "TABLE(tournament_id uuid, registration_id uuid, first_completed_at timestamp with time zone, expected_path_segment_count integer, played_segment_count integer, automatic_bye_count integer, opponent_no_show_count integer, verified_game_count integer)",
  ],
  [
    "get_tournament_championship_path_summary",
    "TABLE(tournament_id uuid, registration_id uuid, expected_path_segment_count integer, observed_path_segment_count integer, completeness_state text, revision integer, finalized_at timestamp with time zone, source_type text, source_id uuid, source_metadata jsonb)",
  ],
  [
    "get_tournament_championship_path_segments",
    "TABLE(tournament_id uuid, registration_id uuid, path_index integer, round_number integer, expected_path_segment_count integer, source_match_id uuid, source_generated_bracket_id uuid, source_round_id uuid, outcome_kind text, authority_state text, revision integer, finalized_at timestamp with time zone, source_type text, source_id uuid, source_metadata jsonb)",
  ],
]);

export const REQUIRED_CONSTRAINT_VALUE_FRAGMENTS = Object.freeze([
  ["public.tournaments", "tournaments_status_check", "upcoming"],
  ["public.tournaments", "tournaments_status_check", "registration_open"],
  ["public.tournaments", "tournaments_status_check", "in_progress"],
  ["public.tournaments", "tournaments_status_check", "completed"],
  ["public.tournaments", "tournaments_status_check", "cancelled"],
  ["public.tournaments", "tournaments_status_check", "voided"],
  ["public.registrations", "registrations_registration_status_check", "pending"],
  [
    "public.registrations",
    "registrations_registration_status_check",
    "manual_review",
  ],
  ["public.registrations", "registrations_registration_status_check", "approved"],
  ["public.registrations", "registrations_registration_status_check", "rejected"],
  [
    "public.registrations",
    "registrations_registration_status_check",
    "waitlisted",
  ],
  [
    "public.registrations",
    "registrations_registration_status_check",
    "withdrawn",
  ],
  ["public.player_badge_awards", "player_badge_awards_source_type_check", "profile"],
  ["public.player_badge_awards", "player_badge_awards_source_type_check", "match"],
  [
    "public.player_badge_awards",
    "player_badge_awards_source_type_check",
    "tournament",
  ],
  ["public.player_badge_awards", "player_badge_awards_source_type_check", "season"],
  [
    "public.player_badge_awards",
    "player_badge_awards_source_type_check",
    "backfill",
  ],
  [
    "public.player_badge_awards",
    "player_badge_awards_source_type_check",
    "admin_correction",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "pending_confirmation",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "confirmed",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "auto_approved",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "disputed",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "under_review",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "approved",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "rejected",
  ],
  [
    "public.match_result_report_groups",
    "match_result_report_groups_status_check",
    "reset",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "played",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "opponent_no_show",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "player_no_show",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "double_no_show",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "automatic_bye",
  ],
  [
    "public.match_participant_outcome_authority",
    "match_participant_outcome_authority_kind_check",
    "admin_default",
  ],
  [
    "public.match_game_result_authority",
    "match_game_result_authority_state_check",
    "active",
  ],
  [
    "public.match_game_result_authority",
    "match_game_result_authority_state_check",
    "invalidated",
  ],
]);

export const REQUIRED_MAP_IDS = Object.freeze([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
]);

export const FORCE_RLS_TABLES = Object.freeze([
  "public.player_badge_awards",
  "public.player_badge_reveals",
  "public.match_participant_outcome_authority",
  "public.match_game_result_authority",
  "public.tournament_championship_path_authority",
  "public.tournament_championship_path_summary_authority",
  "public.match_replay_upload_attempts",
  "public.tournament_bracket_map_pool_entries",
  "public.coh3_maps",
  "public.legal_documents",
  "public.registration_acceptances",
]);

export const SERVICE_ROLE_MUTATION_TABLES = Object.freeze([
  "public.player_badge_awards",
  "public.player_badge_reveals",
  "public.match_participant_outcome_authority",
  "public.match_game_result_authority",
  "public.tournament_championship_path_authority",
  "public.tournament_championship_path_summary_authority",
  "public.players",
  "public.tournaments",
  "public.tournament_brackets",
  "public.generated_brackets",
  "public.bracket_rounds",
  "public.tournament_matches",
  "public.match_result_report_groups",
  "public.match_result_submissions",
  "public.leaderboard_point_events",
  "public.leaderboard_seasons",
  "public.leaderboard_player_season_stats",
  "public.leaderboard_season_champions",
]);

export const REQUIRED_FUNCTION_NAMES = Object.freeze([
  "begin_staging_badge_e2e_run",
  "provision_staging_badge_e2e_player",
  "inspect_staging_badge_e2e_run",
  "save_tournament",
  "generate_tournament_bracket",
  "save_bracket_assignments",
  "submit_verified_player_registration",
  "review_tournament_registration",
  "publish_tournament_bracket_map_pools",
  "launch_tournament_division",
  "process_matchup_deadlines",
  "create_match_result_report_group",
  "prepare_match_replay_upload_attempt",
  "claim_match_replay_attempt_finalization",
  "commit_match_replay_attempt_result",
  "submit_match_no_show_report",
  "confirm_match_result_report_group",
  "admin_finalize_match_result_report_group",
  "apply_admin_official_match_result",
  "admin_reset_tournament_match",
  "cancel_tournament",
  "void_tournament",
  "recalculate_leaderboard_for_tournament",
  "recalculate_leaderboard_for_season",
  "finalize_leaderboard_main_season_if_ready",
  "get_player_badge_match_participants",
  "get_player_badge_match_threshold_summary",
  "get_player_badge_tournament_for_match",
  "get_player_badge_tournament_participants",
  "get_player_badge_tournament_authority_participants",
  "get_player_badge_tournament_summary",
  "get_player_badge_tournament_prestige_summary",
  "get_player_badge_bracket_progression_summary",
  "get_player_badge_match_excellence_summary",
  "get_player_badge_finalized_season_for_tournament",
  "get_player_badge_season_authority_participants",
  "get_player_badge_season_summary",
  "get_player_badge_reliable_competitor_summary",
  "get_player_badge_comeback_commander_summary",
  "get_player_badge_flawless_campaign_summary",
  "get_tournament_championship_path_summary",
  "get_tournament_championship_path_segments",
]);

const SERVICE_ROLE_CALLABLE_FUNCTION_NAMES = Object.freeze(
  REQUIRED_FUNCTION_NAMES.filter(
    (name) => name !== "finalize_leaderboard_main_season_if_ready"
  )
);

export async function runRemotePreflight({ targetContext }) {
  const environment = targetContext.environment;

  assertReadOnlyPreflightTarget(targetContext);
  verifyStagingProjectIdentity(environment);

  const result = await runReadOnlyPreflightSql(environment);
  assertPreflightResult(result);

  return result;
}

export function printPreflightPlan() {
  console.log("Read-only remote preflight checks:");
  console.log(`- Exact project ref: ${STAGING_PROJECT.ref}`);
  console.log(`- Forbidden production ref: ${PRODUCTION_PROJECT.ref}`);
  console.log(
    `- Required badge migration chain through ${REQUIRED_BADGE_MIGRATIONS.at(-1)}`
  );
  console.log(`- Required tables: ${REQUIRED_TABLES.length}`);
  console.log(`- Required table columns: ${REQUIRED_TABLE_COLUMNS.length}`);
  console.log(`- Required table column types: ${REQUIRED_TABLE_COLUMN_TYPES.length}`);
  console.log(`- Required RPC/function names: ${REQUIRED_FUNCTION_NAMES.length}`);
  console.log(`- Required RPC/function argument fragments: ${REQUIRED_FUNCTION_ARGUMENT_FRAGMENTS.length}`);
  console.log(`- Required exact RPC/function signatures: ${REQUIRED_FUNCTION_SIGNATURES.length}`);
  console.log(`- Required RPC/function return types: ${REQUIRED_FUNCTION_RETURNS.length}`);
  console.log(`- Required uniqueness indexes: ${REQUIRED_UNIQUE_INDEXES.length}`);
  console.log(
    `- Required reveal column contracts: ${REQUIRED_REVEAL_COLUMN_CONTRACTS.length}`
  );
  console.log(
    `- Required reveal constraints/indexes: ${REQUIRED_REVEAL_CONSTRAINTS.length}/${REQUIRED_REVEAL_INDEXES.length}`
  );
  console.log(
    `- Required reveal RLS policies: ${REQUIRED_REVEAL_POLICIES.length}`
  );
  console.log(`- Required status/enum constraint values: ${REQUIRED_CONSTRAINT_VALUE_FRAGMENTS.length}`);
  console.log(`- Required seeded map IDs: ${REQUIRED_MAP_IDS.length}`);
  console.log("- RLS/FORCE RLS on badge authority and private ledgers");
  console.log("- Service-role table and RPC capabilities");
  console.log("- Anon/authenticated denial for private mutation surfaces");
  console.log("");
}

function assertReadOnlyPreflightTarget(targetContext) {
  if (targetContext.project.ref === PRODUCTION_PROJECT.ref) {
    throw new Error("Remote preflight refuses the production project ref.");
  }

  if (targetContext.project.ref !== STAGING_PROJECT.ref) {
    throw new Error("Remote preflight has no generic linked-project target.");
  }

  if (!environmentValue(targetContext.environment.supabaseAccessToken)) {
    throw new Error(
      "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN is required for remote preflight."
    );
  }
}

function verifyStagingProjectIdentity(environment) {
  const projects = parseJson(
    runSupabaseCli(
      ["--output", "json", "projects", "list"],
      environment.supabaseAccessToken
    ),
    "Supabase project list"
  );

  const matching = Array.isArray(projects)
    ? projects.filter(
        (project) =>
          project &&
          project.id === STAGING_PROJECT.ref &&
          project.name === STAGING_PROJECT.name &&
          project.id !== PRODUCTION_PROJECT.ref &&
          String(project.status ?? "").toUpperCase().includes("ACTIVE")
      )
    : [];

  if (matching.length !== 1) {
    throw new Error("Fixed staging project identity gate failed.");
  }
}

async function runReadOnlyPreflightSql(environment) {
  const output = await runReadOnlyManagementQuery(
    buildPreflightSql(),
    environment.supabaseAccessToken
  );
  const parsed = parseJson(output, "Badge staging preflight");
  const row = Array.isArray(parsed)
    ? parsed[0]?.badge_e2e_preflight
    : parsed?.rows?.[0]?.badge_e2e_preflight;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Badge staging preflight returned no result object.");
  }

  return row;
}

export function buildReadOnlyPreflightEndpoint() {
  if (STAGING_PROJECT.ref === PRODUCTION_PROJECT.ref) {
    throw new Error("Read-only preflight endpoint refuses the production ref.");
  }

  return `https://api.supabase.com/v1/projects/${STAGING_PROJECT.ref}/database/query/read-only`;
}

export async function runReadOnlyManagementQuery(
  sql,
  accessToken,
  fetchImplementation = globalThis.fetch
) {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new Error("Read-only preflight SQL is required.");
  }
  if (!environmentValue(accessToken)) {
    throw new Error(
      "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN is required for remote preflight."
    );
  }
  if (typeof fetchImplementation !== "function") {
    throw new Error("Fetch is unavailable for the read-only Management API query.");
  }

  let response;
  try {
    response = await fetchImplementation(buildReadOnlyPreflightEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "ironclad-badge-e2e-preflight",
      },
      body: JSON.stringify({ query: sql }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Badge staging read-only Management API request failed: ${sanitizeDiagnosticText(
        message,
        collectKnownSecretValues(accessToken, process.env)
      )}`
    );
  }

  const body = await response.text();

  if (response.status !== 201) {
    throw new Error(
      `Badge staging read-only Management API query failed (status ${response.status}): ${sanitizeDiagnosticText(
        body,
        [accessToken]
      )}`
    );
  }

  return body;
}

export function assertPreflightResult(result) {
  const failureKeys = [
    "missing_migrations",
    "missing_tables",
    "missing_table_columns",
    "missing_table_column_types",
    "missing_functions",
    "missing_function_arguments",
    "missing_function_signatures",
    "missing_function_returns",
    "missing_unique_indexes",
    "reveal_column_contract_issues",
    "reveal_constraint_issues",
    "reveal_index_issues",
    "reveal_policy_issues",
    "reveal_grant_issues",
    "missing_constraint_values",
    "missing_seeded_map_ids",
    "rls_issues",
    "force_rls_issues",
    "service_role_table_issues",
    "service_role_table_mutation_issues",
    "service_role_function_issues",
    "unsafe_anon_function_grants",
    "unsafe_authenticated_function_grants",
    "unsafe_anon_table_mutation_grants",
    "unsafe_authenticated_table_mutation_grants",
    "security_definer_issues",
    "search_path_issues",
  ];

  const failures = failureKeys
    .map((key) => [key, Array.isArray(result[key]) ? result[key] : []])
    .filter(([, values]) => values.length > 0);

  if (failures.length > 0) {
    throw new Error(
      `Badge staging preflight failed: ${failures
        .map(([key, values]) => `${key}=${JSON.stringify(values)}`)
        .join("; ")}`
    );
  }
}

export function buildPreflightSql() {
  const migrationValues = REQUIRED_BADGE_MIGRATIONS.map(
    (version) => `('${version}')`
  ).join(",\n    ");
  const tableValues = REQUIRED_TABLES.map((name) => `('${name}')`).join(",\n    ");
  const tableColumnValues = REQUIRED_TABLE_COLUMNS.map(
    ([table, column]) => `('${table}', '${column}')`
  ).join(",\n    ");
  const tableColumnTypeValues = REQUIRED_TABLE_COLUMN_TYPES.map(
    ([table, column, type]) => `('${table}', '${column}', '${type}')`
  ).join(",\n    ");
  const uniqueIndexValues = REQUIRED_UNIQUE_INDEXES.map(
    ([table, index]) => `('${table}', '${index}')`
  ).join(",\n    ");
  const functionArgumentValues = REQUIRED_FUNCTION_ARGUMENT_FRAGMENTS.map(
    ([name, fragment]) => `('${name}', ${sqlString(fragment)})`
  ).join(",\n    ");
  const functionSignatureValues = REQUIRED_FUNCTION_SIGNATURES.map(
    ([name, arguments_]) => `('${name}', ${sqlString(arguments_)})`
  ).join(",\n    ");
  const functionReturnValues = REQUIRED_FUNCTION_RETURNS.map(
    ([name, result]) => `('${name}', ${sqlString(result)})`
  ).join(",\n    ");
  const constraintValueFragmentValues = REQUIRED_CONSTRAINT_VALUE_FRAGMENTS.map(
    ([table, constraint, value]) =>
      `('${table}', '${constraint}', ${sqlString(value)})`
  ).join(",\n    ");
  const revealColumnContractValues = REQUIRED_REVEAL_COLUMN_CONTRACTS.map(
    ({ table, column, type, notNull, defaultExpression }) =>
      `('${table}', '${column}', '${type}', ${notNull}, ${
        defaultExpression === null ? "NULL" : sqlString(defaultExpression)
      })`
  ).join(",\n    ");
  const revealConstraintValues = REQUIRED_REVEAL_CONSTRAINTS.map(
    ({ table, name, type, definitionFragments }) =>
      `('${table}', '${name}', '${type}', ${sqlTextArray(definitionFragments)})`
  ).join(",\n    ");
  const revealIndexValues = REQUIRED_REVEAL_INDEXES.map(
    ({ table, name, unique, definitionFragments }) =>
      `('${table}', '${name}', ${unique}, ${sqlTextArray(definitionFragments)})`
  ).join(",\n    ");
  const revealPolicyValues = REQUIRED_REVEAL_POLICIES.map(
    ({ name, command, roles, usingFragments, withCheckFragments }) =>
      `('${name}', '${command}', ${sqlTextArray(roles)}, ${sqlTextArray(
        usingFragments
      )}, ${sqlTextArray(withCheckFragments)})`
  ).join(",\n    ");
  const revealAuthenticatedTableGrants = sqlTextArray(
    REQUIRED_REVEAL_GRANTS.authenticatedTable
  );
  const revealAuthenticatedColumnGrants = sqlTextArray(
    REQUIRED_REVEAL_GRANTS.authenticatedColumns
  );
  const revealServiceRoleTableGrants = sqlTextArray(
    REQUIRED_REVEAL_GRANTS.serviceRoleTable
  );
  const mapIdValues = REQUIRED_MAP_IDS.map((id) => `('${id}'::uuid)`).join(",\n    ");
  const forceRlsValues = FORCE_RLS_TABLES.map((name) => `('${name}')`).join(
    ",\n    "
  );
  const serviceRoleMutationValues = SERVICE_ROLE_MUTATION_TABLES.map(
    (name) => `('${name}')`
  ).join(",\n    ");
  const functionValues = REQUIRED_FUNCTION_NAMES.map((name) => `('${name}')`).join(
    ",\n    "
  );
  const serviceRoleFunctionValues = SERVICE_ROLE_CALLABLE_FUNCTION_NAMES.map(
    (name) => `('${name}')`
  ).join(",\n    ");

  return `
with
required_migrations(version) as (
  values
    ${migrationValues}
),
required_tables(name) as (
  values
    ${tableValues}
),
required_table_columns(table_name, column_name) as (
  values
    ${tableColumnValues}
),
required_table_column_types(table_name, column_name, data_type) as (
  values
    ${tableColumnTypeValues}
),
required_unique_indexes(table_name, index_name) as (
  values
    ${uniqueIndexValues}
),
required_function_arguments(function_name, argument_fragment) as (
  values
    ${functionArgumentValues}
),
required_function_signatures(function_name, identity_arguments) as (
  values
    ${functionSignatureValues}
),
required_function_returns(function_name, result) as (
  values
    ${functionReturnValues}
),
required_constraint_values(table_name, constraint_name, required_value) as (
  values
    ${constraintValueFragmentValues}
),
required_reveal_column_contracts(table_name, column_name, data_type, not_null, default_expression) as (
  values
    ${revealColumnContractValues}
),
required_reveal_constraints(table_name, constraint_name, constraint_type, definition_fragments) as (
  values
    ${revealConstraintValues}
),
required_reveal_indexes(table_name, index_name, is_unique, definition_fragments) as (
  values
    ${revealIndexValues}
),
required_reveal_policies(policy_name, command, roles, using_fragments, with_check_fragments) as (
  values
    ${revealPolicyValues}
),
required_map_ids(id) as (
  values
    ${mapIdValues}
),
force_rls_tables(name) as (
  values
    ${forceRlsValues}
),
service_role_mutation_tables(name) as (
  values
    ${serviceRoleMutationValues}
),
required_functions(name) as (
  values
    ${functionValues}
),
service_role_callable_functions(name) as (
  values
    ${serviceRoleFunctionValues}
),
function_catalog as (
  select
    namespace.nspname as schema_name,
    proc.proname as function_name,
    proc.oid,
    proc.oid::regprocedure::text as signature,
    pg_catalog.pg_get_function_arguments(proc.oid) as arguments,
    pg_catalog.pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(proc.oid) as result,
    proc.prosecdef,
    proc.proconfig
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
),
table_catalog as (
  select
    ('public.' || class.relname) as name,
    class.oid,
    class.relrowsecurity,
    class.relforcerowsecurity
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
),
column_catalog as (
  select
    ('public.' || class.relname) as table_name,
    attribute.attname as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
    attribute.attnotnull as not_null,
    pg_catalog.pg_get_expr(default_info.adbin, default_info.adrelid) as default_expression
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as class
    on class.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  left join pg_catalog.pg_attrdef as default_info
    on default_info.adrelid = attribute.attrelid
    and default_info.adnum = attribute.attnum
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
    and attribute.attnum > 0
    and not attribute.attisdropped
),
constraint_catalog as (
  select
    ('public.' || class.relname) as table_name,
    constraint_info.conname as constraint_name,
    constraint_info.contype::text as constraint_type,
    pg_catalog.pg_get_constraintdef(constraint_info.oid) as definition
  from pg_catalog.pg_constraint as constraint_info
  join pg_catalog.pg_class as class
    on class.oid = constraint_info.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
),
index_catalog as (
  select
    ('public.' || table_class.relname) as table_name,
    index_class.relname as index_name,
    index_info.indisunique as is_unique,
    pg_catalog.pg_get_indexdef(index_info.indexrelid) as definition
  from pg_catalog.pg_index as index_info
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_info.indexrelid
  join pg_catalog.pg_class as table_class
    on table_class.oid = index_info.indrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = table_class.relnamespace
  where namespace.nspname = 'public'
),
policy_catalog as (
  select
    ('public.' || table_class.relname) as table_name,
    policy.polname as policy_name,
    case policy.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      when '*' then 'ALL'
    end as command,
    array(
      select case
        when role_oid = 0 then 'public'
        else role_info.rolname
      end
      from pg_catalog.unnest(policy.polroles) as policy_role(role_oid)
      left join pg_catalog.pg_roles as role_info
        on role_info.oid = role_oid
      order by 1
    ) as roles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as with_check_expression
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as table_class
    on table_class.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = table_class.relnamespace
  where namespace.nspname = 'public'
),
table_acl_catalog as (
  select
    ('public.' || class.relname) as table_name,
    case
      when acl.grantee = 0 then 'public'
      else role_info.rolname
    end as grantee,
    acl.privilege_type
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(class.relacl, pg_catalog.acldefault('r', class.relowner))
  ) as acl(grantor, grantee, privilege_type, is_grantable)
  left join pg_catalog.pg_roles as role_info
    on role_info.oid = acl.grantee
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
),
column_acl_catalog as (
  select
    ('public.' || class.relname) as table_name,
    attribute.attname as column_name,
    case
      when acl.grantee = 0 then 'public'
      else role_info.rolname
    end as grantee,
    acl.privilege_type
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as class
    on class.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  cross join lateral pg_catalog.aclexplode(attribute.attacl)
    as acl(grantor, grantee, privilege_type, is_grantable)
  left join pg_catalog.pg_roles as role_info
    on role_info.oid = acl.grantee
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
    and attribute.attnum > 0
    and not attribute.attisdropped
)
select jsonb_build_object(
  'target_ref', '${STAGING_PROJECT.ref}',
  'target_environment', '${STAGING_PROJECT.name}',
  'server_time', clock_timestamp(),
  'missing_migrations', coalesce((
    select jsonb_agg(required.version order by required.version)
    from required_migrations as required
    where not exists (
      select 1
      from supabase_migrations.schema_migrations as migration
      where migration.version = required.version
    )
  ), '[]'::jsonb),
  'missing_tables', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_tables as required
    where pg_catalog.to_regclass(required.name) is null
  ), '[]'::jsonb),
  'missing_table_columns', coalesce((
    select jsonb_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name)
    from required_table_columns as required
    where not exists (
      select 1
      from information_schema.columns as column_info
      where column_info.table_schema = split_part(required.table_name, '.', 1)
        and column_info.table_name = split_part(required.table_name, '.', 2)
        and column_info.column_name = required.column_name
    )
  ), '[]'::jsonb),
  'missing_table_column_types', coalesce((
    select jsonb_agg(
      required.table_name || '.' || required.column_name || ':' || required.data_type
      order by required.table_name, required.column_name
    )
    from required_table_column_types as required
    left join column_catalog as found
      on found.table_name = required.table_name
      and found.column_name = required.column_name
    where found.data_type is distinct from required.data_type
  ), '[]'::jsonb),
  'missing_functions', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_functions as required
    where not exists (
      select 1
      from function_catalog as found
      where found.function_name = required.name
    )
  ), '[]'::jsonb),
  'missing_function_arguments', coalesce((
    select jsonb_agg(required.function_name || ':' || required.argument_fragment order by required.function_name, required.argument_fragment)
    from required_function_arguments as required
    where not exists (
      select 1
      from function_catalog as found
      where found.function_name = required.function_name
        and found.arguments ilike '%' || required.argument_fragment || '%'
    )
  ), '[]'::jsonb),
  'missing_function_signatures', coalesce((
    select jsonb_agg(required.function_name || '(' || required.identity_arguments || ')' order by required.function_name, required.identity_arguments)
    from required_function_signatures as required
    where not exists (
      select 1
      from function_catalog as found
      where found.function_name = required.function_name
        and found.identity_arguments = required.identity_arguments
    )
  ), '[]'::jsonb),
  'missing_function_returns', coalesce((
    select jsonb_agg(required.function_name || ':' || required.result order by required.function_name, required.result)
    from required_function_returns as required
    where not exists (
      select 1
      from function_catalog as found
      where found.function_name = required.function_name
        and found.result = required.result
    )
  ), '[]'::jsonb),
  'missing_unique_indexes', coalesce((
    select jsonb_agg(required.table_name || ':' || required.index_name order by required.table_name, required.index_name)
    from required_unique_indexes as required
    where not exists (
      select 1
      from pg_catalog.pg_indexes as index_info
      where index_info.schemaname = split_part(required.table_name, '.', 1)
        and index_info.tablename = split_part(required.table_name, '.', 2)
        and index_info.indexname = required.index_name
      and index_info.indexdef ilike 'create unique index%'
    )
  ), '[]'::jsonb),
  'reveal_column_contract_issues', coalesce((
    select jsonb_agg(
      required.table_name || '.' || required.column_name
      order by required.table_name, required.column_name
    )
    from required_reveal_column_contracts as required
    left join column_catalog as found
      on found.table_name = required.table_name
      and found.column_name = required.column_name
    where found.column_name is null
      or found.data_type is distinct from required.data_type
      or found.not_null is distinct from required.not_null
      or (
        required.default_expression is null
        and found.default_expression is not null
      )
      or (
        required.default_expression is not null
        and pg_catalog.regexp_replace(
          replace(coalesce(found.default_expression, ''), 'pg_catalog.', ''),
          '\\s+',
          '',
          'g'
        ) is distinct from pg_catalog.regexp_replace(
          replace(required.default_expression, 'pg_catalog.', ''),
          '\\s+',
          '',
          'g'
        )
      )
  ), '[]'::jsonb),
  'reveal_constraint_issues', coalesce((
    select jsonb_agg(
      required.table_name || ':' || required.constraint_name
      order by required.table_name, required.constraint_name
    )
    from required_reveal_constraints as required
    where not exists (
      select 1
      from constraint_catalog as found
      where found.table_name = required.table_name
        and found.constraint_name = required.constraint_name
        and found.constraint_type = required.constraint_type
        and not exists (
          select 1
          from pg_catalog.unnest(required.definition_fragments) as fragment(value)
          where lower(pg_catalog.regexp_replace(found.definition, '\\s+', '', 'g'))
            not like '%' || lower(pg_catalog.regexp_replace(fragment.value, '\\s+', '', 'g')) || '%'
        )
    )
  ), '[]'::jsonb),
  'reveal_index_issues', coalesce((
    select jsonb_agg(
      required.table_name || ':' || required.index_name
      order by required.table_name, required.index_name
    )
    from required_reveal_indexes as required
    where not exists (
      select 1
      from index_catalog as found
      where found.table_name = required.table_name
        and found.index_name = required.index_name
        and found.is_unique = required.is_unique
        and not exists (
          select 1
          from pg_catalog.unnest(required.definition_fragments) as fragment(value)
          where lower(pg_catalog.regexp_replace(found.definition, '\\s+', '', 'g'))
            not like '%' || lower(pg_catalog.regexp_replace(fragment.value, '\\s+', '', 'g')) || '%'
        )
    )
  ), '[]'::jsonb),
  'reveal_policy_issues', coalesce((
    select jsonb_agg(issue order by issue)
    from (
      select required.policy_name || ':missing_or_incorrect' as issue
      from required_reveal_policies as required
      where not exists (
        select 1
        from policy_catalog as found
        where found.table_name = 'public.player_badge_reveals'
          and found.policy_name = required.policy_name
          and found.command = required.command
          and found.roles::text[] = required.roles
          and (
            (
              cardinality(required.using_fragments) = 0
              and found.using_expression is null
            )
            or (
              cardinality(required.using_fragments) > 0
              and found.using_expression ilike '%exists%'
              and found.using_expression ilike '% and %'
              and not exists (
                select 1
                from pg_catalog.unnest(required.using_fragments) as fragment(value)
                where lower(pg_catalog.regexp_replace(found.using_expression, '\\s+', '', 'g'))
                  not like '%' || lower(pg_catalog.regexp_replace(fragment.value, '\\s+', '', 'g')) || '%'
              )
            )
          )
          and (
            (
              cardinality(required.with_check_fragments) = 0
              and found.with_check_expression is null
            )
            or (
              cardinality(required.with_check_fragments) > 0
              and found.with_check_expression ilike '%exists%'
              and found.with_check_expression ilike '% and %'
              and not exists (
                select 1
                from pg_catalog.unnest(required.with_check_fragments) as fragment(value)
                where lower(pg_catalog.regexp_replace(found.with_check_expression, '\\s+', '', 'g'))
                  not like '%' || lower(pg_catalog.regexp_replace(fragment.value, '\\s+', '', 'g')) || '%'
              )
            )
          )
      )
      union all
      select found.policy_name || ':' || found.command || ':unexpected' as issue
      from policy_catalog as found
      where found.table_name = 'public.player_badge_reveals'
        and not exists (
          select 1
          from required_reveal_policies as required
          where required.policy_name = found.policy_name
            and required.command = found.command
        )
    ) as issues
  ), '[]'::jsonb),
  'reveal_grant_issues', coalesce((
    select jsonb_agg(issue order by issue)
    from (
      values
        (
          'authenticated_table_grants',
          coalesce((
            select array_agg(distinct privilege_type order by privilege_type)
            from table_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'authenticated'
          ), array[]::text[]) <> ${revealAuthenticatedTableGrants}
        ),
        (
          'authenticated_column_grants',
          coalesce((
            select array_agg(
              distinct column_name || ':' || privilege_type
              order by column_name || ':' || privilege_type
            )
            from column_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'authenticated'
          ), array[]::text[]) <> ${revealAuthenticatedColumnGrants}
        ),
        (
          'anon_table_or_column_grants',
          exists (
            select 1 from table_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'anon'
          ) or exists (
            select 1 from column_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'anon'
          )
        ),
        (
          'anon_effective_privileges',
          pg_catalog.has_table_privilege(
            'anon',
            'public.player_badge_reveals',
            'SELECT'
          )
          or pg_catalog.has_table_privilege(
            'anon',
            'public.player_badge_reveals',
            'INSERT'
          )
          or pg_catalog.has_table_privilege(
            'anon',
            'public.player_badge_reveals',
            'UPDATE'
          )
          or pg_catalog.has_table_privilege(
            'anon',
            'public.player_badge_reveals',
            'DELETE'
          )
          or pg_catalog.has_any_column_privilege(
            'anon',
            'public.player_badge_reveals',
            'SELECT'
          )
          or pg_catalog.has_any_column_privilege(
            'anon',
            'public.player_badge_reveals',
            'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            'anon',
            'public.player_badge_reveals',
            'UPDATE'
          )
        ),
        (
          'anon_or_authenticated_bypass_rls',
          exists (
            select 1
            from pg_catalog.pg_roles
            where rolname in ('anon', 'authenticated')
              and rolbypassrls
          )
        ),
        (
          'public_table_or_column_grants',
          exists (
            select 1 from table_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'public'
          ) or exists (
            select 1 from column_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'public'
          )
        ),
        (
          'authenticated_effective_privileges',
          not pg_catalog.has_table_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'SELECT'
          )
          or pg_catalog.has_table_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'INSERT'
          )
          or pg_catalog.has_table_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'UPDATE'
          )
          or pg_catalog.has_table_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'DELETE'
          )
          or not pg_catalog.has_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'player_badge_award_id',
            'INSERT'
          )
          or not pg_catalog.has_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'player_id',
            'INSERT'
          )
          or pg_catalog.has_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'id',
            'INSERT'
          )
          or pg_catalog.has_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'revealed_at',
            'INSERT'
          )
          or pg_catalog.has_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'created_at',
            'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            'authenticated',
            'public.player_badge_reveals',
            'UPDATE'
          )
        ),
        (
          'service_role_table_grants',
          not (${revealServiceRoleTableGrants} <@ coalesce((
            select array_agg(distinct privilege_type order by privilege_type)
            from table_acl_catalog
            where table_name = 'public.player_badge_reveals'
              and grantee = 'service_role'
          ), array[]::text[]))
        ),
        (
          'service_role_effective_privileges',
          not (
            pg_catalog.has_table_privilege(
              'service_role',
              'public.player_badge_reveals',
              'SELECT'
            )
            and pg_catalog.has_table_privilege(
              'service_role',
              'public.player_badge_reveals',
              'INSERT'
            )
            and pg_catalog.has_table_privilege(
              'service_role',
              'public.player_badge_reveals',
              'UPDATE'
            )
            and pg_catalog.has_table_privilege(
              'service_role',
              'public.player_badge_reveals',
              'DELETE'
            )
          )
        ),
        (
          'service_role_bypass_rls',
          not exists (
            select 1
            from pg_catalog.pg_roles
            where rolname = 'service_role'
              and rolbypassrls
          )
        )
    ) as checks(issue, failed)
    where failed
  ), '[]'::jsonb),
  'missing_constraint_values', coalesce((
    select jsonb_agg(required.table_name || ':' || required.constraint_name || ':' || required.required_value order by required.table_name, required.constraint_name, required.required_value)
    from required_constraint_values as required
    where not exists (
      select 1
      from constraint_catalog as found
      where found.table_name = required.table_name
        and found.constraint_name = required.constraint_name
        and found.definition like '%' || pg_catalog.quote_literal(required.required_value) || '%'
    )
  ), '[]'::jsonb),
  'missing_seeded_map_ids', coalesce((
    select jsonb_agg(required.id order by required.id)
    from required_map_ids as required
    where not exists (
      select 1
      from public.coh3_maps as map
      where map.id = required.id
    )
  ), '[]'::jsonb),
  'rls_issues', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_tables as required
    join table_catalog as found
      on found.name = required.name
    where not found.relrowsecurity
  ), '[]'::jsonb),
  'force_rls_issues', coalesce((
    select jsonb_agg(required.name order by required.name)
    from force_rls_tables as required
    join table_catalog as found
      on found.name = required.name
    where not found.relforcerowsecurity
  ), '[]'::jsonb),
  'service_role_table_issues', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_tables as required
    where pg_catalog.to_regclass(required.name) is not null
      and not pg_catalog.has_table_privilege(
        'service_role',
        required.name,
        'SELECT'
      )
  ), '[]'::jsonb),
  'service_role_table_mutation_issues', coalesce((
    select jsonb_agg(required.name order by required.name)
    from service_role_mutation_tables as required
    where pg_catalog.to_regclass(required.name) is not null
      and not (
        pg_catalog.has_table_privilege('service_role', required.name, 'INSERT')
        and pg_catalog.has_table_privilege('service_role', required.name, 'UPDATE')
        and pg_catalog.has_table_privilege('service_role', required.name, 'DELETE')
      )
  ), '[]'::jsonb),
  'service_role_function_issues', coalesce((
    select jsonb_agg(required.name order by required.name)
    from service_role_callable_functions as required
    where exists (
      select 1
      from function_catalog as found
      where found.function_name = required.name
    )
      and not exists (
        select 1
        from function_catalog as found
        where found.function_name = required.name
          and pg_catalog.has_function_privilege(
            'service_role',
            found.oid,
            'EXECUTE'
          )
      )
  ), '[]'::jsonb),
  'unsafe_anon_function_grants', coalesce((
    select jsonb_agg(found.signature order by found.signature)
    from function_catalog as found
    join required_functions as required
      on required.name = found.function_name
    where pg_catalog.has_function_privilege('anon', found.oid, 'EXECUTE')
  ), '[]'::jsonb),
  'unsafe_authenticated_function_grants', coalesce((
    select jsonb_agg(found.signature order by found.signature)
    from function_catalog as found
    join required_functions as required
      on required.name = found.function_name
    where found.function_name like 'get_player_badge%'
      and pg_catalog.has_function_privilege(
        'authenticated',
        found.oid,
        'EXECUTE'
      )
  ), '[]'::jsonb),
  'unsafe_anon_table_mutation_grants', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_tables as required
    where pg_catalog.to_regclass(required.name) is not null
      and pg_catalog.has_table_privilege(
        'anon',
        required.name,
        'INSERT,UPDATE,DELETE'
      )
  ), '[]'::jsonb),
  'unsafe_authenticated_table_mutation_grants', coalesce((
    select jsonb_agg(required.name order by required.name)
    from required_tables as required
    where pg_catalog.to_regclass(required.name) is not null
      and required.name in (
        'public.player_badge_awards',
        'public.match_participant_outcome_authority',
        'public.match_game_result_authority',
        'public.tournament_championship_path_authority',
        'public.tournament_championship_path_summary_authority'
      )
      and pg_catalog.has_table_privilege(
        'authenticated',
        required.name,
        'INSERT,UPDATE,DELETE'
      )
  ), '[]'::jsonb),
  'security_definer_issues', coalesce((
    select jsonb_agg(found.signature order by found.signature)
    from function_catalog as found
    join required_functions as required
      on required.name = found.function_name
    where not found.prosecdef
  ), '[]'::jsonb),
  'search_path_issues', coalesce((
    select jsonb_agg(found.signature order by found.signature)
    from function_catalog as found
    join required_functions as required
      on required.name = found.function_name
    where not exists (
      select 1
      from pg_catalog.unnest(coalesce(found.proconfig, array[]::text[])) as config(value)
      where config.value like 'search_path=%'
        and config.value not like '%"$user"%'
    )
  ), '[]'::jsonb)
) as badge_e2e_preflight;
`;
}

function runSupabaseCli(arguments_, accessToken) {
  return runNpx(
    ["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...arguments_],
    accessToken
  );
}

function runNpx(arguments_, accessToken) {
  if (process.platform !== "win32") {
    return runCommand("npx", arguments_, accessToken);
  }

  const npxCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );
  if (!existsSync(npxCli)) {
    throw new Error(`Bundled npm launcher is unavailable: ${npxCli}`);
  }
  return runCommand(process.execPath, [npxCli, ...arguments_], accessToken);
}

export function buildSupabaseCliChildEnvironment(
  accessToken,
  baseEnvironment = process.env
) {
  if (!environmentValue(accessToken)) {
    throw new Error("Supabase CLI access token is required.");
  }

  return {
    ...baseEnvironment,
    SUPABASE_ACCESS_TOKEN: accessToken,
  };
}

export function runCommand(command, arguments_, accessToken) {
  const childEnvironment = buildSupabaseCliChildEnvironment(accessToken);
  const result = spawnSync(command, arguments_, {
    cwd: resolve("."),
    encoding: "utf8",
    env: childEnvironment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const secretValues = collectKnownSecretValues(accessToken, childEnvironment);

  if (result.error) {
    throw new Error(
      `Supabase CLI child failed to start: ${sanitizeDiagnosticText(
        result.error.message,
        secretValues
      )}`
    );
  }

  if (result.status !== 0) {
    const commandVector = sanitizeDiagnosticText(
      JSON.stringify([command, ...arguments_]),
      secretValues
    );
    const stderr = formatCapturedStream(result.stderr, secretValues);
    const stdout = formatCapturedStream(result.stdout, secretValues);
    throw new Error(
      [
        "Supabase CLI child failed.",
        `command: ${commandVector}`,
        `exit code: ${result.status ?? "unknown"}`,
        `signal: ${result.signal ?? "none"}`,
        `stderr: ${stderr}`,
        `stdout: ${stdout}`,
      ].join("\n")
    );
  }

  return result.stdout;
}

export function sanitizeDiagnosticText(value, secretValues = []) {
  let sanitized = String(value ?? "");

  for (const secret of secretValues) {
    if (typeof secret === "string" && secret.length >= 8) {
      sanitized = sanitized.replaceAll(secret, "[REDACTED]");
    }
  }

  return sanitized
    .replace(/(Bearer\s+)[^\s"']+/giu, "$1[REDACTED]")
    .replace(/\bsbp_[A-Za-z0-9_-]+\b/gu, "[REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
      "[REDACTED]"
    )
    .replace(
      /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+(@)/giu,
      "$1[REDACTED]$2"
    );
}

function collectKnownSecretValues(accessToken, environment) {
  return [
    accessToken,
    ...SECRET_ENVIRONMENT_KEYS.map((key) => environment[key]),
  ].filter((value) => typeof value === "string" && value.length > 0);
}

function formatCapturedStream(value, secretValues) {
  const sanitized = sanitizeDiagnosticText(value, secretValues).trim();
  return sanitized.length > 0 ? sanitized : "<empty>";
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function environmentValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sqlTextArray(values) {
  if (values.length === 0) {
    return "ARRAY[]::text[]";
  }

  return `ARRAY[${values.map((value) => sqlString(value)).join(", ")}]::text[]`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
