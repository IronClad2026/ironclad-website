// Explicit competition fields only; private evidence paths are hashed in SQL.
const fields = (text) => text.split(/\s+/).filter(Boolean);
const tournament = "tournament_id in (select id from selected_tournaments)";
const generated = "generated_bracket_id in (select id from selected_generated)";
const match = "match_id in (select id from selected_matches)";
const player = "player_id in (select profile_id from selected_registrations)";
const fact = (scope, text, key = "id") => ({ scope, fields: fields(text), key });
export const FACTS = {
  tournaments: fact("id in (select id from selected_tournaments)", "id status format start_date end_date registration_open_at registration_close_at registration_enabled grand_final_at rule_format result_confirmation_window_minutes first_completed_at terminal_at terminal_reason"),
  tournament_brackets: fact(tournament, "id tournament_id name max_players elo_rules launched_at map_pool_published_at"),
  registrations: fact("tournament_bracket_id in (select id from selected_brackets)", "id tournament_id tournament_bracket_id profile_id registration_status elo_status submitted_elo elo_verified_elo elo_verified_division elo_calculation_version withdrawn_at waitlist_offer_status waitlist_offer_created_at waitlist_offer_expires_at waitlist_offer_resolved_at created_at"),
  generated_brackets: fact("tournament_bracket_id in (select id from selected_brackets)", "id tournament_bracket_id format participant_count generated_at slot_count competition_locked_at"),
  bracket_rounds: fact(generated, "id generated_bracket_id round_number"),
  tournament_matches: fact(generated, "id generated_bracket_id round_id match_number player_one_registration_id player_two_registration_id player_one_slot player_two_slot player_one_score player_two_score winner_registration_id status scheduled_at series_best_of official_result_submission_id official_result_decided_at activation_version activated_at deadline_at outcome_type deadline_ruled_at extension_minutes extension_reason extended_at hold_started_at hold_released_at hold_reason"),
  tournament_standings: fact(generated, "id generated_bracket_id registration_id wins losses points rank"),
  match_result_submissions: fact(match, "id match_id report_group_id claimed_winner_registration_id submitted_by_registration_id submission_number player_one_score player_two_score game_number status reviewed_at created_at replay_storage_path screenshot_storage_path replay_content_hash"),
  match_result_report_groups: fact(tournament, "id match_id tournament_id submitted_by_registration_id opponent_registration_id winner_registration_id player_one_score player_two_score status confirmation_deadline_at confirmed_at confirmed_by_registration_id disputed_at disputed_by_registration_id reviewed_at finalized_at finalized_source created_at replay_storage_path replay_proof_mode result_type no_show_reported_by_registration_id no_show_registration_id no_show_status no_show_resolved_at"),
  match_replay_upload_attempts: fact(match, "id match_id submitting_registration_id winner_registration_id player_one_score player_two_score required_replay_count declared_replay_sizes status committed_report_group_id committed_at cleaned_at replay_storage_paths game_winner_registration_ids"),
  match_participant_outcome_authority: fact(tournament, "id match_id tournament_id registration_id outcome_kind revision supersedes_id finalized_at source_type source_id"),
  match_game_result_authority: fact(tournament, "id match_id tournament_id game_number winner_registration_id loser_registration_id revision supersedes_id authority_state series_best_of finalized_game_count game_authority_complete finalized_at source_type source_id"),
  tournament_championship_path_authority: fact(tournament, "id tournament_id registration_id path_index round_number expected_path_segment_count source_match_id source_generated_bracket_id source_round_id outcome_kind authority_state revision supersedes_id finalized_at source_type source_id"),
  tournament_championship_path_summary_authority: fact(tournament, "id tournament_id registration_id expected_path_segment_count observed_path_segment_count completeness_state revision supersedes_id finalized_at source_type source_id"),
  leaderboard_point_events: fact(tournament, "id season_id tournament_id tournament_bracket_id registration_id player_id bracket_type points event_type source"),
  leaderboard_player_season_stats: fact(player, "id season_id player_id bracket_type total_points tournaments_played rounds_passed tournament_wins matches_played matches_won matches_lost win_rate last_tournament_id last_tournament_points current_rank previous_rank rank_movement"),
  leaderboard_player_all_time_stats: fact(player, "id player_id bracket_type total_points tournaments_played rounds_passed tournament_wins matches_played matches_won matches_lost win_rate best_season_rank last_active_season_id"),
  leaderboard_division_settlements: fact("tournament_bracket_id in (select id from selected_brackets)", "tournament_bracket_id season_id settlement_version calculation_checksum settled_at last_reconciled_at", "tournament_bracket_id"),
  tournament_division_not_held_closures: fact("tournament_bracket_id in (select id from selected_brackets)", "tournament_bracket_id reason_code closed_at active_registration_count waitlist_registration_count", "tournament_bracket_id"),
  leaderboard_tournament_season_memberships: fact(tournament, "tournament_id season_id qualifying_event_number assigned_at scored_at voided_at", "tournament_id"),
  leaderboard_season_champions: fact(player, "id season_id player_id bracket_type final_rank final_points"),
  tournament_bracket_map_pool_entries: fact("tournament_bracket_id in (select id from selected_brackets)", "id tournament_bracket_id coh3_map_id added_at removed_at added_by_correction_id removed_by_correction_id"),
};
export const PRIVATE_FIELDS = new Set(["replay_storage_path", "screenshot_storage_path", "replay_storage_paths", "hold_reason", "extension_reason"]);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateTournamentIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || ids.some((id) => !UUID.test(id)) || new Set(ids).size !== ids.length) throw new Error("Provide 1–5 unique tournament UUIDs.");
  return [...ids].sort();
}
export function competitionSql(ids, maxRows = 10000) {
  validateTournamentIds(ids);
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 20000) throw new Error("Row bound must be 1–20000.");
  const tables = Object.entries(FACTS).map(([table, spec]) => {
    // Direct column references intentionally fail SQL compilation if any fact
    // disappears. JSON lookup of a nonexistent column would silently give null.
    const pairs = spec.fields.map((field) => `('${field}', ${PRIVATE_FIELDS.has(field) ? `to_jsonb(encode(sha256(convert_to(to_jsonb(t.${field})::text, 'UTF8')), 'hex'))` : `to_jsonb(t.${field})`})`);
    return `select '${table}' as table_name, coalesce(jsonb_agg(fact order by fact->>'${spec.key}'), '[]'::jsonb) as rows from (select (select jsonb_object_agg(k, v) from (values ${pairs.join(",")}) as projection(k,v)) as fact from public.${table} t where ${spec.scope} order by ${spec.key} limit ${maxRows + 1}) bounded`;
  });
  return `with selected_tournaments as (select id from public.tournaments where id in (${ids.map((id) => `'${id}'::uuid`).join(",")})),
selected_brackets as (select id from public.tournament_brackets where tournament_id in (select id from selected_tournaments)),
selected_generated as (select id from public.generated_brackets where tournament_bracket_id in (select id from selected_brackets)),
selected_matches as (select id from public.tournament_matches where generated_bracket_id in (select id from selected_generated)),
selected_registrations as (select id, profile_id from public.registrations where tournament_bracket_id in (select id from selected_brackets))
select jsonb_object_agg(table_name, rows) from (${tables.join("\nunion all\n")}) facts;`;
}

// Preparation validation returns counts and digests only. All fact projection,
// including the private-field hashing above, remains inside PostgreSQL.
export function competitionDigestSql(ids, maxRows = 10000) {
  const projection = competitionSql(ids, maxRows).replace(/;\s*$/, "");
  return `with projected(facts) as (${projection})
select jsonb_object_agg(table_name, jsonb_build_object('count', jsonb_array_length(rows),
 'sha256', encode(sha256(convert_to(rows::text, 'UTF8')), 'hex')))
from projected, lateral jsonb_each(facts) as relation(table_name, rows);`;
}
