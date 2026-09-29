// Default: read-only plan. --apply explicitly runs the authorized Staging-only
// synthetic transition through the same public RPCs used by Admin workflows.
// Never writes result, leaderboard, membership, season, or award tables directly.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  STAGING_SUPABASE_REF,
  loadFixtureEnvironment,
  validateRuntimeGuards,
  assertClerkDevelopmentInstance,
  validateClerkFixtureUser,
  getFixtureDefinition,
} from "../lib/staging-synthetic-uat.mjs";

const EXISTING = Object.freeze({
  tournamentId: "48c83ecd-ed3c-4a80-9830-fe5d6e035405",
  bracketId: "85238e86-27f1-4e04-8d51-5bad81f53de3",
  generatedId: "00c314a5-d07e-4512-82e6-f2dd2b6410df",
  preservedResults: [
    "499bc4dc-e926-4d28-9c58-375937f8c074",
    "82ae2fca-fe7c-48c5-9555-652838ff148f",
    "9fb38ade-8535-4881-a604-0dd43268fbd4",
  ],
});
const ACTOR = "staging-synthetic-uat:legacy-season-transition";
const ADDITIONAL_SLUG = "staging-synthetic-legacy-transition-season-2-final";
const ADDITIONAL_TITLE = "Legacy Season 2 Completion";
const MATCH_COLUMNS = "id,round_id,match_number,series_best_of,status,player_one_registration_id,player_two_registration_id,player_one_score,player_two_score,winner_registration_id,outcome_type,official_result_submission_id,official_result_decided_by,official_result_decided_at";
const SUPPORTED_OPTIONS = new Set(["--apply", "--dry-run", "--env-root"]);

function guard(ok, code) {
  if (!ok) throw new Error(code);
}
function value(result, operation) {
  if (result.error) {
    throw new Error(`${operation}_rejected_${String(result.error.code ?? "unknown").replace(/[^A-Za-z0-9]/g, "")}`);
  }
  return result.data;
}
function first(data) {
  return Array.isArray(data) ? data[0] : data;
}
function fingerprint(rows) {
  return createHash("sha256").update(JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
}
function options(argv) {
  let envRoot = process.cwd();
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    guard(SUPPORTED_OPTIONS.has(arg), "arguments_rejected");
    if (arg === "--apply") apply = true;
    if (arg === "--env-root") {
      guard(Boolean(argv[index + 1]) && !argv[index + 1].startsWith("--"), "environment_path_rejected");
      envRoot = resolve(argv[++index]);
    }
  }
  guard(!(apply && argv.includes("--dry-run")), "conflicting_modes_rejected");
  return { apply, envRoot };
}

async function run() {
  const args = options(process.argv.slice(2));
  const env = await loadFixtureEnvironment({ rootDir: args.envRoot });
  const config = validateRuntimeGuards(env, "TestMain1");
  await assertClerkDevelopmentInstance(config);
  const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const read = async (query, label) => value(await query, label);
  const rpc = async (name, parameters) => value(await db.rpc(name, parameters), name);
  const write = async (name, parameters) => {
    guard(args.apply, "mutation_requires_apply");
    return rpc(name, parameters);
  };
  const verified = new Map();
  async function verifyAlias(alias, registration) {
    const definition = getFixtureDefinition(alias);
    const fixtureConfig = validateRuntimeGuards(env, alias);
    const inspected = first(await rpc("inspect_staging_synthetic_uat_player", {
      p_fixture_secret: config.fixtureSecret,
      p_alias: alias,
    }));
    guard(inspected?.alias === alias && inspected.profile_complete === true &&
      inspected.profile_public === false && inspected.provenance === "staging_synthetic_uat" &&
      inspected.contract_version === "staging-synthetic-v1" &&
      inspected.synthetic_elo === definition.syntheticElo && inspected.has_steam_identity === false &&
      inspected.has_provider_facts === false, "fixture_authority_rejected");
    if (registration) {
      guard(registration.profile_id === inspected.player_id && registration.player_name === alias &&
        registration.registration_provenance === "staging_synthetic_uat" &&
        registration.fixture_contract_version === "staging-synthetic-v1" &&
        registration.submitted_elo === definition.syntheticElo, "registration_fixture_binding_rejected");
    }
    const player = first(await read(db.from("players").select("id,clerk_user_id")
      .eq("id", inspected.player_id).limit(2), "fixture_player_read"));
    guard(player?.id === inspected.player_id && (!registration || player.clerk_user_id === registration.clerk_user_id), "fixture_identity_rejected");
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(player.clerk_user_id)}`, {
      headers: { Authorization: `Bearer ${config.clerkSecretKey}`, "Clerk-API-Version": "2025-11-10" },
      signal: AbortSignal.timeout(20_000),
    });
    guard(response.ok, "clerk_fixture_read_rejected");
    validateClerkFixtureUser(await response.json(), fixtureConfig);
    verified.set(alias, { playerId: player.id });
    return inspected;
  }
  async function roster(tournamentId, bracketId, requireFull = true) {
    const rows = await read(db.from("registrations")
      .select("id,profile_id,clerk_user_id,player_name,registration_status,registration_provenance,fixture_contract_version,submitted_elo")
      .eq("tournament_id", tournamentId).eq("tournament_bracket_id", bracketId), "roster_read");
    guard(rows.length <= 8 && (!requireFull || rows.length === 8), "roster_size_rejected");
    for (const row of rows) {
      guard(/^TestMain([1-9]|10)$/.test(row.player_name) &&
        ["pending", "manual_review", "approved"].includes(row.registration_status), "roster_scope_rejected");
      await verifyAlias(row.player_name, row);
      if (requireFull) guard(row.registration_status === "approved", "roster_not_approved");
    }
    return rows;
  }
  const matches = (generatedId) => read(db.from("tournament_matches").select(MATCH_COLUMNS)
    .eq("generated_bracket_id", generatedId).order("id"), "match_read");
  async function assertNoPendingAuthority(rows) {
    const ids = rows.map((row) => row.id);
    const groups = await read(db.from("match_result_report_groups").select("id")
      .in("match_id", ids).is("finalized_at", null).in("status", ["pending_confirmation", "disputed", "under_review"]), "report_authority_read");
    const submissions = await read(db.from("match_result_submissions").select("id")
      .in("match_id", ids).eq("status", "pending"), "submission_authority_read");
    guard(groups.length === 0 && submissions.length === 0, "unresolved_result_authority_rejected");
  }
  async function finishCompetition(tournamentId, bracketId, generatedId, preservedIds = []) {
    await roster(tournamentId, bracketId);
    const initial = await matches(generatedId);
    guard(initial.length === 7, "single_elimination_shape_rejected");
    const preserved = initial.filter((row) => preservedIds.includes(row.id));
    guard(preserved.length === preservedIds.length && preserved.every((row) => row.status === "completed"), "historical_results_rejected");
    const before = fingerprint(preserved);
    for (let step = 0; step < 7; step += 1) {
      const rows = await matches(generatedId);
      if (rows.every((row) => row.status === "completed")) break;
      await assertNoPendingAuthority(rows);
      const ready = rows.find((row) => ["in_progress", "pending_review"].includes(row.status) &&
        row.player_one_registration_id && row.player_two_registration_id && !row.winner_registration_id && !row.outcome_type);
      guard(ready && !preservedIds.includes(ready.id) && [3, 5].includes(ready.series_best_of), "ready_match_rejected");
      const currentRoster = await roster(tournamentId, bracketId);
      guard(currentRoster.some((row) => row.id === ready.player_one_registration_id) &&
        currentRoster.some((row) => row.id === ready.player_two_registration_id), "match_participant_scope_rejected");
      await write("apply_admin_official_match_result_api", {
        p_match_id: ready.id,
        p_player_one_score: Math.floor(ready.series_best_of / 2) + 1,
        p_player_two_score: 0,
        p_winner_registration_id: ready.player_one_registration_id,
        p_decided_by: ACTOR,
      });
      const after = await matches(generatedId);
      guard(fingerprint(after.filter((row) => preservedIds.includes(row.id))) === before, "historical_result_changed");
      console.log(JSON.stringify({ operation: "synthetic_official_result", completedMatches: after.filter((row) => row.status === "completed").length, totalMatches: 7 }));
    }
    const final = await matches(generatedId);
    guard(final.every((row) => row.status === "completed") && fingerprint(final.filter((row) => preservedIds.includes(row.id))) === before, "competition_completion_rejected");
    await write("settle_leaderboard_division", { p_tournament_bracket_id: bracketId, p_triggered_by_clerk_user_id: ACTOR });
    const runId = await write("recalculate_leaderboard_for_tournament", { p_tournament_id: tournamentId, p_triggered_by_clerk_user_id: ACTOR });
    const run = first(await read(db.from("leaderboard_recalculation_runs").select("id,status").eq("id", runId), "reconciliation_read"));
    guard(run?.status === "completed", "reconciliation_failed");
  }
  async function seasonSnapshot() {
    const rows = await read(db.from("leaderboard_current_season").select("*"), "season_read");
    const row = first(rows);
    guard(row, "season_unavailable");
    return { id: row.id, authority: row.official_bracket_type ?? "main", count: row.valid_qualifying_event_count ?? row.valid_main_event_count, finalized: row.is_finalized };
  }
  const existingTournament = first(await read(db.from("tournaments").select("*").eq("id", EXISTING.tournamentId), "existing_event_read"));
  guard(existingTournament && [undefined, "legacy_three_v1"].includes(existingTournament.division_model_version) &&
    !["cancelled", "voided"].includes(existingTournament.status), "existing_event_scope_rejected");
  const existingBracket = first(await read(db.from("tournament_brackets").select("id,name,tournament_id,launched_at,max_players")
    .eq("id", EXISTING.bracketId), "existing_bracket_read"));
  guard(existingBracket?.name === "Main" && existingBracket.tournament_id === EXISTING.tournamentId &&
    existingBracket.launched_at && existingBracket.max_players === 8, "existing_bracket_scope_rejected");
  await roster(EXISTING.tournamentId, EXISTING.bracketId);
  const initialMatches = await matches(EXISTING.generatedId);
  guard(initialMatches.length === 7 && EXISTING.preservedResults.every((id) => initialMatches.some((row) => row.id === id && row.status === "completed")), "preserved_history_rejected");
  await assertNoPendingAuthority(initialMatches);
  const initialSeason = await seasonSnapshot();
  guard((initialSeason.authority === "main" && [4, 5].includes(initialSeason.count)) ||
    (initialSeason.authority === "pro" && initialSeason.count === 0), "unexpected_transition_state");
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "read_only_plan", project: STAGING_SUPABASE_REF,
    actor: ACTOR, existingTournamentId: EXISTING.tournamentId, verifiedSyntheticParticipants: 8,
    preservedCompletedResults: 3, remainingExistingResults: initialMatches.filter((row) => row.status !== "completed").length,
    officialAuthority: initialSeason.authority, qualifyingEvents: initialSeason.count,
    additionalLegacyEventsMaximum: 1, additionalEventSlug: ADDITIONAL_SLUG,
    requiredMigrationsPresent: existingTournament.division_model_version === "legacy_three_v1" }));
  if (!args.apply) return;
  guard(existingTournament.division_model_version === "legacy_three_v1", "migrations_required");
  if (initialSeason.authority === "pro") {
    guard(initialMatches.every((row) => row.status === "completed"), "unexpected_successor_state");
    console.log(JSON.stringify({ operation: "already_complete", authority: "pro", qualifyingEvents: 0 }));
    return;
  }
  await finishCompetition(EXISTING.tournamentId, EXISTING.bracketId, EXISTING.generatedId, EXISTING.preservedResults);
  const afterExisting = await seasonSnapshot();
  if (afterExisting.authority === "pro") {
    guard(afterExisting.count === 0, "successor_state_rejected");
    return;
  }
  guard(afterExisting.authority === "main" && afterExisting.count === 5, "minimum_transition_state_rejected");
  const additionalId = await write("create_staging_legacy_transition_tournament", {
    p_fixture_secret: config.fixtureSecret, p_slug: ADDITIONAL_SLUG, p_title: ADDITIONAL_TITLE,
  });
  const additional = first(await read(db.from("tournaments").select("*").eq("id", additionalId), "additional_event_read"));
  guard(additional?.slug === ADDITIONAL_SLUG && additional.title === `[SYNTHETIC] ${ADDITIONAL_TITLE}` &&
    additional.division_model_version === "legacy_three_v1", "additional_event_scope_rejected");
  const brackets = await read(db.from("tournament_brackets").select("id,name,elo_rules,max_players,launched_at,map_pool_published_at")
    .eq("tournament_id", additionalId), "additional_bracket_read");
  guard(brackets.length === 1 && brackets[0].name === "Main" && brackets[0].max_players === 8, "additional_bracket_scope_rejected");
  const bracket = brackets[0];
  if (!bracket.launched_at) {
    await write("save_tournament", { p_tournament_id: additionalId, p_title: additional.title, p_slug: additional.slug,
      p_description: additional.description, p_banner_image_url: "", p_registration_open_at: null, p_registration_close_at: null,
      p_start_date: null, p_end_date: null, p_status: "registration_open", p_format: "1v1", p_prize_pool: "",
      p_rules_url: null, p_battlefy_url: null, p_registration_enabled: true, p_grand_final_at: null, p_rule_format: "format_a",
      p_result_confirmation_window_minutes: 30, p_brackets: [{ name: "Main", elo_rules: "1400+ ELO", max_players: 8 }],
      p_division_model_version: "legacy_three_v1" });
    for (let index = 1; index <= 8; index += 1) {
      const alias = `TestMain${index}`;
      await verifyAlias(alias);
      const enrolled = first(await write("enrol_staging_synthetic_uat_player", {
        p_fixture_secret: config.fixtureSecret, p_alias: alias, p_tournament_id: additionalId,
        p_tournament_bracket_id: bracket.id, p_waitlist_confirmed: false,
      }));
      guard(enrolled && enrolled.waitlist_confirmation_required === false &&
        ["pending", "manual_review", "approved"].includes(enrolled.registration_status) &&
        enrolled.contract_version === "staging-synthetic-v1", "additional_enrolment_rejected");
      if (enrolled.registration_status !== "approved") await write("review_tournament_registration", {
        p_registration_id: enrolled.registration_id, p_registration_status: "approved",
        p_admin_notes: `Authorized synthetic Staging season transition; operation ${ACTOR}. No real provider or legal ownership claim.`,
      });
    }
    const approved = await roster(additionalId, bracket.id);
    let generated = first(await read(db.from("generated_brackets").select("id")
      .eq("tournament_bracket_id", bracket.id), "additional_generated_read"));
    if (!generated) generated = { id: await write("generate_tournament_bracket", {
      p_tournament_bracket_id: bracket.id, p_generated_by: ACTOR,
    }) };
    await write("save_bracket_assignments", { p_generated_bracket_id: generated.id,
      p_assignments: [...approved].sort((a, b) => a.player_name.localeCompare(b.player_name, "en", { numeric: true }))
        .map((row, index) => ({ slot_number: index + 1, registration_id: row.id })), p_updated_by: ACTOR });
    if (!bracket.map_pool_published_at) {
      const sourceMaps = await read(db.from("tournament_bracket_map_pool_entries").select("coh3_map_id")
        .eq("tournament_bracket_id", EXISTING.bracketId).is("removed_at", null), "map_pool_read");
      const mapIds = [...new Set(sourceMaps.map((row) => row.coh3_map_id))];
      guard(mapIds.length >= 5, "map_pool_scope_rejected");
      await write("publish_tournament_bracket_map_pools", { p_tournament_id: additionalId,
        p_bracket_ids: [bracket.id], p_map_ids: mapIds, p_actor_clerk_user_id: ACTOR });
    }
    await write("launch_tournament_division", { p_tournament_bracket_id: bracket.id, p_actor_clerk_user_id: ACTOR });
  }
  const generated = first(await read(db.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id), "final_generated_read"));
  guard(generated?.id, "generated_bracket_unavailable");
  await finishCompetition(additionalId, bracket.id, generated.id);
  const successor = await seasonSnapshot();
  const legacy = first(await read(db.from("leaderboard_seasons").select("id,official_bracket_type,finalized_at,is_active")
    .eq("id", initialSeason.id), "final_legacy_season_read"));
  // Membership rows are intentionally private even to service_role. The normal
  // finalized-season authority RPC proves both events belong to this finalized
  // six-event season; the finalizer enforces six scored qualifying events.
  const memberships = await Promise.all([EXISTING.tournamentId, additionalId].map((id) =>
    rpc("get_player_badge_finalized_season_for_tournament", { p_tournament_id: id })));
  guard(legacy?.official_bracket_type === "main" && legacy.finalized_at && !legacy.is_active &&
    memberships.every((rows) => rows.length === 1 && rows[0].season_id === initialSeason.id) &&
    successor.authority === "pro" && successor.count === 0, "transition_finalization_rejected");
  console.log(JSON.stringify({ operation: "transition_complete", legacyAuthority: "main", legacyQualifyingEvents: 6,
    legacyFinalized: true, successorAuthority: "pro", successorQualifyingEvents: 0, additionalLegacyEventsCreatedMaximum: 1,
    preservedHistoricalResults: 3 }));
}

run().catch((error) => {
  const code = typeof error?.message === "string" && /^[A-Za-z0-9_:]+$/.test(error.message)
    ? error.message : "transition_failed_details_suppressed";
  console.error(JSON.stringify({ status: "failed", code }));
  process.exitCode = 1;
});
