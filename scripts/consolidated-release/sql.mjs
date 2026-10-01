import { FACTS } from "../p03-release/facts.mjs";
import { verifyPostDeploymentPackage } from "../consolidated-db/post-deployment.mjs";
import { baseline } from "../consolidated-db/package.mjs";

export const PRODUCTION_REF = "nsyjtqpvyxlzyujlbzos";
export const SHA = /^[0-9a-f]{40}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const originalCheckNames = ["tournaments_end_after_start", "tournaments_format_check", "tournaments_registration_dates", "tournaments_slug_format", "tournaments_start_after_registration"];
export const HISTORICAL_CHECK_CONSTRAINTS = originalCheckNames.map((name) => {
  const constraint = baseline.constraints.find((item) => item.schema === "public" && item.table_name === "tournaments" && item.constraint_name === name);
  if (!constraint || constraint.contype !== "c" || constraint.convalidated !== false) throw new Error("Original five historical CHECK contracts are missing from the reviewed schema catalog.");
  return { name, definition: constraint.definition };
});
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const originalCheckValues = HISTORICAL_CHECK_CONSTRAINTS.map((item) => `(${literal(item.name)},${literal(item.definition)})`).join(",");

// Whole-relation digests only. Identifiers and private values never leave SQL.
// Do not import the old capture()/competitionSql() runner: those export rows.
const relation = (fields, schema = "public") => ({ schema, fields: fields.split(" "), scope: "true" });
export const HISTORY = {
  ...Object.fromEntries(Object.entries(FACTS).map(([name, spec]) => [name, { ...spec, schema: "public", scope: "true" }])),
  registrations: { ...FACTS.registrations, schema: "public", scope: "true", fields: [...FACTS.registrations.fields, "registration_provenance", "fixture_contract_version"] },
  players: relation("id clerk_user_id profile_completed public_profile_enabled discord_public_enabled coh3_profile_id steam_id64 relic_verified_elo relic_verified_faction relic_verified_division relic_elo_calculation_version relic_elo_verified_at relic_elo_last_attempt_at account_closed_at created_at updated_at"),
  leaderboard_seasons: relation("id name year season_number start_date end_date is_active created_at updated_at finalized_at under_review_at under_review_reason under_review_by_clerk_user_id under_review_tournament_id"),
  leaderboard_recalculation_runs: relation("id tournament_id season_id scope status started_at finished_at triggered_by_clerk_user_id notes"),
  player_badge_awards: relation("id player_id badge_slug source_type source_id source_metadata unlocked_at original_unlocked_at standard_reveal_seen_at premium_reveal_seen_at created_at"),
  player_badge_reveals: relation("id player_badge_award_id player_id revealed_at created_at"),
  badge_reconciliation_targets: relation("target_id player_id reason source_type source_id status requested_at available_at claimed_at claim_token attempt_count last_error_code completed_at updated_at", "ironclad_private"),
  legal_documents: relation("id document_kind version immutable_url status published_at effective_at sha256 created_at updated_at"),
  account_legal_acceptances: relation("id clerk_user_id accepted_at terms_document_id terms_version terms_url terms_sha256 privacy_document_id privacy_version privacy_url privacy_sha256 terms_accepted privacy_acknowledged"),
  registration_acceptances: relation("id registration_id tournament_id clerk_user_id accepted_at rulebook_document_id rulebook_version rulebook_url rulebook_sha256 ppa_document_id ppa_version ppa_url ppa_sha256 terms_document_id terms_version terms_url terms_sha256 privacy_document_id privacy_version privacy_url privacy_sha256 rulebook_accepted ppa_accepted terms_accepted privacy_acknowledged age_18_confirmed own_ironclad_account_confirmed linked_steam_account_confirmed"),
  match_rooms: relation("id match_id room_revision communication_generation activation_version_snapshot player_one_registration_id player_two_registration_id created_at closed_at closure_reason last_sequence content_purged_at"),
  match_messages: relation("id room_id sequence sender_kind sender_registration_id actor_clerk_user_id client_message_id body created_at author_player_id"),
  match_room_reads: relation("room_id viewer_clerk_user_id last_read_sequence updated_at"),
  match_room_assistance: relation("room_id status request_version requested_by_registration_id requested_at resolved_at resolved_by_clerk_user_id notification_id"),
  match_room_notification_episodes: relation("id room_id recipient_registration_id first_sequence notification_id created_at resolved_at"),
  match_room_tournament_closures: relation("tournament_id completed_at", "ironclad_private"),
  match_room_redactions: relation("message_id redacted_at", "ironclad_private"),
  match_room_retention_cases: relation("room_id case_reference case_kind closed_at updated_at", "ironclad_private"),
  match_room_retention_holds: relation("id room_id message_ids case_reference reason created_at expires_at released_at", "ironclad_private"),
  match_room_privacy_audit: relation("id room_id operation actor_player_id reference_id counts occurred_at", "ironclad_private"),
  platform_settings: { ...relation("key value updated_at updated_by_clerk_user_id"), scope: "t.key in ('match_room', 'elo_verification')" },
};

export const CHECKS = {
  missingTargets: "select count(*) from requested_ids r left join public.tournaments t on t.id=r.id where t.id is null",
  unfinishedTournaments: "select count(*) from relevant_tournaments where status not in ('completed','cancelled','voided') or (status='completed' and first_completed_at is null) or (status in ('cancelled','voided') and terminal_at is null)",
  invalidLaunchedBrackets: "select count(*) from launched_brackets b where (select count(*) from public.generated_brackets g where g.tournament_bracket_id=b.id) <> 1 or not exists(select 1 from relevant_matches m where m.bracket_id=b.id)",
  unresolvedMatches: "select count(*) from relevant_matches where status <> 'completed' or status is null",
  heldMatches: "select count(*) from relevant_matches where hold_started_at is not null and hold_released_at is null",
  unresolvedGroups: "select count(*) from public.match_result_report_groups r join relevant_matches m on m.id=r.match_id where r.status in ('pending_confirmation','disputed','under_review') or r.no_show_status in ('pending','disputed') or (r.status in ('confirmed','auto_approved','approved') and r.finalized_at is null)",
  unresolvedLegacySubmissions: "select count(*) from public.match_result_submissions r join relevant_matches m on m.id=r.match_id where r.report_group_id is null and r.status in ('pending','resubmission_requested')",
  unfinishedReplayAttempts: "select count(*) from public.match_replay_upload_attempts r join relevant_matches m on m.id=r.match_id where r.status not in ('committed','cleaned')",
  missingSettlements: "select count(*) from launched_brackets b join public.tournaments t on t.id=b.tournament_id where t.status='completed' and not exists(select 1 from public.leaderboard_division_settlements s where s.tournament_bracket_id=b.id and s.settled_at is not null and s.calculation_checksum is not null)",
  settlementSeasonMismatch: "select count(*) from public.leaderboard_point_events p join public.leaderboard_division_settlements s on s.tournament_bracket_id=p.tournament_bracket_id where p.season_id is distinct from s.season_id",
  missingOfficialMemberships: "select count(*) from relevant_tournaments t where t.status='completed' and exists(select 1 from launched_brackets b where b.tournament_id=t.id and b.name='Main') and not exists(select 1 from public.leaderboard_tournament_season_memberships m where m.tournament_id=t.id and m.scored_at is not null and m.voided_at is null)",
  invalidMemberships: "select count(*) from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id where (m.voided_at is null and (m.scored_at is null or t.status<>'completed')) or m.qualifying_event_number not between 1 and 6",
  duplicateMembershipSlots: "select count(*) from (select season_id, qualifying_event_number from public.leaderboard_tournament_season_memberships where voided_at is null group by season_id, qualifying_event_number having count(*)>1) duplicates",
  partialLegacyMainSeasons: "select count(*) from season_summary where official_family='main' and finalized_at is null and (valid_events<>6 or scored_events<>6)",
  unfinalizedSixEventSeasons: "select count(*) from season_summary where finalized_at is null and valid_events=6",
  invalidFinalizedSeasons: "select count(*) from season_summary where finalized_at is not null and (valid_events<>6 or scored_events<>6 or is_active)",
  seasonsUnderReview: "select count(*) from public.leaderboard_seasons where under_review_at is not null",
  pendingAccountingRuns: "select count(*) from public.leaderboard_recalculation_runs where status='pending' or (status='failed' and finished_at is null)",
  pendingCompetitionBadgeWork: "select count(*) from ironclad_private.badge_reconciliation_targets where status<>'completed' and (source_type in ('match','tournament','season') or reason in ('tournament_completion','leaderboard_recalculation','season_finalization','match_finalization','match_authority'))",
  protectedLegalAuthorityMismatch: "select case when (select count(*) from public.legal_documents where status='effective')=4 and exists(select 1 from public.legal_documents where document_kind='privacy' and version='1.3' and status='effective' and sha256='6e0d930983e2f7fb82b0e6fa17da52b8255a0102d23bd7532874db2aa28de00a') and exists(select 1 from public.legal_documents where document_kind='terms' and version='1.1' and status='effective' and sha256='59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1') then 0 else 1 end",
  invalidHistoricEndAfterStart: "select count(*) from public.tournaments where (end_date is null or start_date is null or end_date>=start_date) is false",
  invalidHistoricFormat: "select count(*) from public.tournaments where (format=any(array['1v1'::text,'2v2'::text,'4v4'::text])) is false",
  invalidHistoricRegistrationDates: "select count(*) from public.tournaments where (registration_open_at is null or registration_close_at is null or registration_open_at<registration_close_at) is false",
  invalidHistoricSlug: "select count(*) from public.tournaments where (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text) is false",
  invalidHistoricStartAfterRegistration: "select count(*) from public.tournaments where (registration_close_at is null or start_date is null or registration_close_at<=start_date) is false",
  historicConstraintInventoryMismatch: `select (select count(*) from (values ${originalCheckValues}) expected(name,definition) left join pg_catalog.pg_constraint c on c.conrelid='public.tournaments'::regclass and c.conname=expected.name where c.oid is null or c.contype<>'c' or c.convalidated is distinct from false or pg_catalog.pg_get_constraintdef(c.oid) is distinct from expected.definition)+(select count(*) from pg_catalog.pg_constraint c where c.conrelid='public.tournaments'::regclass and c.contype='c' and not c.convalidated and c.conname not in (${originalCheckNames.map(literal).join(",")}))`,
};

/** Generate SQL only. Never opens a connection or calls application functions. */
export function preflightSql({ candidateSha, targetRef, tournamentIds, phase = "before-schema", rowLimit = 20000 }) {
  if (!SHA.test(candidateSha ?? "")) throw new Error("An exact 40-character candidate SHA is required.");
  if (targetRef !== PRODUCTION_REF) throw new Error("Explicit Production target confirmation is required.");
  if (!Array.isArray(tournamentIds) || tournamentIds.length < 1 || tournamentIds.length > 5 || tournamentIds.some((id) => !UUID.test(id)) || new Set(tournamentIds).size !== tournamentIds.length) throw new Error("Provide 1–5 unique tournament UUIDs.");
  if (!["before-schema", "after-schema", "after-activation"].includes(phase)) throw new Error("Unknown preflight phase.");
  if (!Number.isSafeInteger(rowLimit) || rowLimit < 1 || rowLimit > 100000) throw new Error("Invalid aggregate row bound.");
  const ids = tournamentIds.map((id) => `('${id}'::uuid)`).join(",");
  const family = phase === "before-schema" ? "'main'::text" : "s.official_bracket_type";
  const digests = Object.entries(HISTORY).map(([table, spec]) => {
    const fields = spec.fields.map((field) => `'${field}', to_jsonb(t.${field})`).join(", ");
    return `select '${table}' as name, count(*) as count, case when count(*) <= ${rowLimit} then encode(sha256(convert_to(coalesce(jsonb_agg(fact order by fact::text), '[]'::jsonb)::text,'UTF8')),'hex') else null end as sha256 from (select jsonb_build_object(${fields}) as fact from ${spec.schema}.${table} t where ${spec.scope} limit ${rowLimit + 1}) bounded`;
  });
  const checks = { ...CHECKS };
  if (phase !== "before-schema") {
    checks.missingOfficialMemberships = checks.missingOfficialMemberships.replace("b.name='Main'", "((t.division_model_version='legacy_three_v1' and b.name='Main') or (t.division_model_version='four_division_v1' and b.name='Pro'))");
    checks.unknownDivisionModels = "select count(*) from public.tournaments where division_model_version not in ('legacy_three_v1','four_division_v1') or division_model_version is null";
    checks.reclassifiedHistoricalTournaments = "select count(*) from public.tournaments where division_model_version is distinct from 'legacy_three_v1'";
    checks.reclassifiedHistoricalSeasons = "select count(*) from public.leaderboard_seasons where official_bracket_type is distinct from 'main'";
    checks[phase === "after-activation" ? "showcaseNotOn" : "showcaseNotOff"] = `select case when (select value->>'enabled' from public.platform_settings where key='player_showcase')='${phase === "after-activation" ? "true" : "false"}' then 0 else 1 end`;
    checks.manufacturedShowcaseRows = "select count(*) from public.player_showcases";
    checks.manufacturedHighlightRows = "select (select count(*) from public.player_combat_highlight_slots)+(select count(*) from ironclad_private.player_combat_highlight_uploads)+(select count(*) from ironclad_private.player_combat_highlight_reports)";
    checks.highlightsNotOff = "select case when (select value->>'enabled' from public.platform_settings where key='player_combat_highlights')='false' then 0 else 1 end";
    if (phase === "after-activation") {
      const guard = verifyPostDeploymentPackage();
      checks.postDeploymentGuardLedgerMismatch = `select case when exists(select 1 from supabase_migrations.schema_migrations where version='${guard.version}' and name='${guard.name}' and cardinality(statements)=1 and encode(sha256(convert_to(replace(statements[1],chr(13),''),'UTF8')),'hex')='${guard.sha256}') then 0 else 1 end`;
    }
  }
  return `-- OFFLINE GENERATED READ-ONLY AUDIT; manual target attestation is mandatory.
-- Aggregate counts/hashes only. Do not invoke application or lifecycle RPCs.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '45s';
set local timezone = 'UTC';
with requested_ids(id) as (values ${ids}),
relevant_tournaments as (select t.* from public.tournaments t where t.id in (select id from requested_ids) or exists(select 1 from public.tournament_brackets b where b.tournament_id=t.id and b.launched_at is not null)),
launched_brackets as (select b.* from public.tournament_brackets b join relevant_tournaments t on t.id=b.tournament_id where b.launched_at is not null),
relevant_matches as (select m.*, b.id as bracket_id from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id join launched_brackets b on b.id=g.tournament_bracket_id),
season_summary as (select s.id, s.finalized_at, s.is_active, ${family} as official_family,
 count(m.tournament_id) filter(where m.voided_at is null) as valid_events,
 count(m.tournament_id) filter(where m.voided_at is null and m.scored_at is not null) as scored_events
 from public.leaderboard_seasons s left join public.leaderboard_tournament_season_memberships m on m.season_id=s.id group by s.id),
digests as (${digests.join("\nunion all\n")})
select jsonb_build_object(
 'schemaVersion',1, 'format','aggregate-only-v1', 'candidateSha','${candidateSha}', 'projectRef','${targetRef}', 'phase','${phase}',
 'capturedAt',clock_timestamp(), 'readOnly',current_setting('transaction_read_only')='on', 'requestedTournamentCount',${tournamentIds.length},
 'scopeSha256',(select encode(sha256(convert_to(jsonb_agg(id order by id)::text,'UTF8')),'hex') from requested_ids),
 'ledgerRowCount',(select count(*) from supabase_migrations.schema_migrations),
 'checks',jsonb_build_object(${Object.entries(checks).map(([key, query]) => `'${key}', (${query})`).join(",\n")}),
 'tables',(select jsonb_object_agg(name,jsonb_build_object('count',count,'sha256',sha256)) from digests),
 'ledgerSha256',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb)::text,'UTF8')),'hex') from supabase_migrations.schema_migrations)
);
rollback;
`;
}
