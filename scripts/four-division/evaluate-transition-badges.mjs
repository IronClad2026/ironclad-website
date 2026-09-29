// Trusted local operator entry point. Node 24.12+ and its real react-server
// condition are required; server-only is never mocked or replaced.
// Default is read-only. --apply is for the approved synthetic Staging transition.
// No global worker, queue drain, HTTP endpoint, or arbitrary player selector.
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  STAGING_SUPABASE_REF,
  loadFixtureEnvironment,
  validateRuntimeGuards,
  assertClerkDevelopmentInstance,
  validateClerkFixtureUser,
  getFixtureDefinition,
} from "../lib/staging-synthetic-uat.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOURNAMENT_ID = "48c83ecd-ed3c-4a80-9830-fe5d6e035405";
const BRACKET_ID = "85238e86-27f1-4e04-8d51-5bad81f53de3";
const GENERATED_ID = "00c314a5-d07e-4512-82e6-f2dd2b6410df";
const ADDITIONAL_SLUG = "staging-synthetic-legacy-transition-season-2-final";
const ALIASES = Array.from({ length: 8 }, (_, index) => `TestMain${index + 1}`);
const READ_RPCS = new Set([
  "get_player_badge_match_threshold_summary",
  "get_player_badge_reliable_competitor_summary",
  "get_player_badge_comeback_commander_summary",
  "get_player_badge_match_excellence_summary",
  "get_player_badge_tournament_summary",
  "get_player_badge_bracket_progression_summary",
  "get_player_badge_tournament_prestige_summary",
  "get_player_badge_flawless_campaign_summary",
  "get_player_badge_season_summary",
]);

function guard(ok, code) {
  if (!ok) throw new Error(code);
}
function value(result, operation) {
  if (result.error) throw new Error(`${operation}_rejected`);
  return result.data;
}
function one(rows) {
  guard(Array.isArray(rows) && rows.length === 1, "single_authority_row_required");
  return rows[0];
}
function options(argv) {
  let envRoot = ROOT;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    guard(["--apply", "--dry-run", "--env-root"].includes(arg), "arguments_rejected");
    if (arg === "--apply") apply = true;
    if (arg === "--env-root") {
      guard(argv[index + 1] && !argv[index + 1].startsWith("--"), "environment_path_rejected");
      envRoot = resolve(argv[++index]);
    }
  }
  guard(!(apply && argv.includes("--dry-run")), "conflicting_modes_rejected");
  return { apply, envRoot };
}
function sourceFile(path) {
  const inside = relative(ROOT, path);
  guard(inside && !inside.startsWith("..") && !isAbsolute(inside) && !inside.split(/[\\/]/).includes("node_modules"), "source_scope_rejected");
  const candidates = extname(path) ? [path] : [`${path}.ts`, `${path}.mjs`, resolve(path, "index.ts")];
  const found = candidates.find((candidate) => {
    try { return statSync(candidate).isFile(); } catch { return false; }
  });
  guard(found, "source_resolution_failed");
  return pathToFileURL(found).href;
}
function enableRepositoryTypeScript() {
  // Resolve only this repository's alias/extensionless local imports. Node does
  // the type stripping; package resolution and server-only remain untouched.
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) return nextResolve(sourceFile(resolve(ROOT, specifier.slice(2))), context);
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith(pathToFileURL(ROOT).href) && !context.parentURL.includes("/node_modules/") && !extname(specifier)) {
        return nextResolve(sourceFile(fileURLToPath(new URL(specifier, context.parentURL))), context);
      }
      return nextResolve(specifier, context);
    },
  });
}

async function run() {
  const args = options(process.argv.slice(2));
  const [major, minor] = process.versions.node.split(".").map(Number);
  guard(major > 24 || (major === 24 && minor >= 12), "node_24_12_or_newer_required");
  guard(process.execArgv.includes("--conditions=react-server"), "real_react_server_condition_required");
  guard(import.meta.resolve("server-only").endsWith("/server-only/empty.js"), "server_only_boundary_rejected");
  const env = await loadFixtureEnvironment({ rootDir: args.envRoot });
  const config = validateRuntimeGuards(env, "TestMain1");
  await assertClerkDevelopmentInstance(config);
  const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const read = async (query, label) => value(await query, label);
  const event = one(await read(db.from("tournaments").select("*").eq("id", TOURNAMENT_ID), "event_read"));
  guard([undefined, "legacy_three_v1"].includes(event.division_model_version) && !["cancelled", "voided"].includes(event.status), "event_scope_rejected");
  const bracket = one(await read(db.from("tournament_brackets").select("id,tournament_id,name,launched_at,max_players").eq("id", BRACKET_ID), "bracket_read"));
  guard(bracket.tournament_id === TOURNAMENT_ID && bracket.name === "Main" && bracket.launched_at && bracket.max_players === 8, "bracket_scope_rejected");
  const roster = await read(db.from("registrations").select("id,profile_id,clerk_user_id,player_name,registration_status,registration_provenance,fixture_contract_version,submitted_elo")
    .eq("tournament_id", TOURNAMENT_ID).eq("tournament_bracket_id", BRACKET_ID), "roster_read");
  guard(roster.length === 8 && new Set(roster.map((row) => row.player_name)).size === 8 && roster.every((row) => ALIASES.includes(row.player_name)), "fixed_eight_fixture_scope_rejected");
  const verified = [];
  for (const alias of ALIASES) {
    const registration = roster.find((row) => row.player_name === alias);
    const fixture = getFixtureDefinition(alias);
    const fixtureConfig = validateRuntimeGuards(env, alias);
    const inspected = one(await read(db.rpc("inspect_staging_synthetic_uat_player", {
      p_fixture_secret: config.fixtureSecret, p_alias: alias,
    }), "fixture_inspection"));
    guard(inspected.alias === alias && inspected.player_id === registration.profile_id && inspected.profile_complete === true &&
      inspected.profile_public === false && inspected.provenance === "staging_synthetic_uat" && inspected.contract_version === "staging-synthetic-v1" &&
      inspected.synthetic_elo === fixture.syntheticElo && inspected.has_steam_identity === false && inspected.has_provider_facts === false &&
      registration.registration_status === "approved" && registration.registration_provenance === "staging_synthetic_uat" &&
      registration.fixture_contract_version === "staging-synthetic-v1" && registration.submitted_elo === fixture.syntheticElo, "fixture_binding_rejected");
    const player = one(await read(db.from("players").select("id,clerk_user_id,account_closed_at").eq("id", inspected.player_id), "player_read"));
    guard(player.clerk_user_id === registration.clerk_user_id && player.account_closed_at === null, "player_authority_rejected");
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(player.clerk_user_id)}`, {
      headers: { Authorization: `Bearer ${config.clerkSecretKey}`, "Clerk-API-Version": "2025-11-10" }, signal: AbortSignal.timeout(20_000),
    });
    guard(response.ok, "clerk_fixture_read_rejected");
    validateClerkFixtureUser(await response.json(), fixtureConfig);
    verified.push({ alias, playerId: player.id, clerkUserId: player.clerk_user_id });
  }
  guard(new Set(verified.map((row) => row.playerId)).size === 8, "distinct_fixture_players_required");
  const matches = await read(db.from("tournament_matches").select("id,status").eq("generated_bracket_id", GENERATED_ID), "matches_read");
  guard(matches.length === 7, "competition_shape_rejected");
  const current = one(await read(db.from("leaderboard_current_season").select("*"), "current_season_read"));
  const transitionComplete = event.division_model_version === "legacy_three_v1" && matches.every((row) => row.status === "completed") &&
    current.official_bracket_type === "pro" && current.valid_qualifying_event_count === 0 && !current.is_finalized;

  // These values remain in memory. The canonical evaluator's own admin client
  // (used for in-app badge notifications) must have the same verified target.
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.serviceRoleKey;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  guard(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "public_client_configuration_required");
  const hooks = enableRepositoryTypeScript();
  const { evaluateAllBadgeAwardsForPlayer, PRODUCTION_BADGE_AUTHORITY_SLUGS } = await import(pathToFileURL(resolve(ROOT, "lib/badges/authority.ts")).href);
  guard(typeof evaluateAllBadgeAwardsForPlayer === "function" && PRODUCTION_BADGE_AUTHORITY_SLUGS.length === 30, "canonical_badge_authority_required");
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "read_only_plan", project: STAGING_SUPABASE_REF,
    verifiedSyntheticParticipants: verified.length, aliases: ALIASES, canonicalAuthorityLoaded: true,
    badgeDefinitions: 30, transitionComplete, globalWorkersInvoked: false }));
  if (!args.apply) { hooks.deregister(); return; }
  guard(transitionComplete, "completed_legacy_transition_required");
  const additional = one(await read(db.from("tournaments").select("id,status,division_model_version").eq("slug", ADDITIONAL_SLUG), "additional_event_read"));
  guard(additional.status === "completed" && additional.division_model_version === "legacy_three_v1", "additional_event_completion_required");
  const additionalRoster = await read(db.from("registrations").select("profile_id,registration_status,registration_provenance,fixture_contract_version").eq("tournament_id", additional.id), "additional_roster_read");
  guard(additionalRoster.length === 8 && additionalRoster.every((row) => verified.some((player) => player.playerId === row.profile_id) &&
    row.registration_status === "approved" && row.registration_provenance === "staging_synthetic_uat" && row.fixture_contract_version === "staging-synthetic-v1"), "additional_fixture_scope_rejected");
  const legacySeason = one(await read(db.from("leaderboard_seasons").select("id,official_bracket_type,is_active,finalized_at").eq("id", "ad974140-9974-4135-bb96-c957df6f259b"), "legacy_season_read"));
  guard(legacySeason.official_bracket_type === "main" && !legacySeason.is_active && legacySeason.finalized_at, "legacy_finalization_required");
  // Use the existing read-only authority RPC; private membership rows have no
  // service-role SELECT grant. Six scored events are a finalizer invariant.
  for (const tournamentId of [TOURNAMENT_ID, additional.id]) {
    const membership = one(await read(db.rpc("get_player_badge_finalized_season_for_tournament", { p_tournament_id: tournamentId }), "finalized_membership_read"));
    guard(membership.season_id === legacySeason.id, "legacy_finalized_membership_required");
  }

  const originalFetch = globalThis.fetch;
  let activePlayer = null;
  // Defense in depth: canonical evaluation may only read Staging and insert
  // idempotent awards/in-app notifications for the one verified active fixture.
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    guard(activePlayer && url.origin === new URL(config.supabaseUrl).origin && url.pathname.startsWith("/rest/v1/"), "badge_transport_scope_rejected");
    if (!["GET", "HEAD"].includes(request.method)) {
      guard(request.method === "POST", "badge_transport_method_rejected");
      const body = await request.clone().json();
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        guard(READ_RPCS.has(url.pathname.split("/").at(-1)) && body.p_player_id === activePlayer.playerId, "badge_rpc_scope_rejected");
      } else if (url.pathname === "/rest/v1/player_badge_awards") {
        const rows = Array.isArray(body) ? body : [body];
        guard(url.searchParams.get("on_conflict") === "player_id,badge_slug" && rows.every((row) => row.player_id === activePlayer.playerId && PRODUCTION_BADGE_AUTHORITY_SLUGS.includes(row.badge_slug)), "badge_write_scope_rejected");
      } else if (url.pathname === "/rest/v1/notifications") {
        const rows = Array.isArray(body) ? body : [body];
        guard(rows.every((row) => row.recipient_clerk_user_id === activePlayer.clerkUserId && row.recipient_role === "player" && row.type === "badge.unlocked"), "badge_notification_scope_rejected");
      } else throw new Error("badge_write_target_rejected");
    }
    return originalFetch(request);
  };
  try {
    let createdTotal = 0;
    for (const player of verified) {
      activePlayer = player;
      const result = await evaluateAllBadgeAwardsForPlayer({ playerId: player.playerId, supabase: db, evaluationMode: "reconciliation" });
      guard(result.evaluatedSlugs.length === 30, "incomplete_badge_evaluation");
      createdTotal += result.createdCount;
      console.log(JSON.stringify({ alias: player.alias, evaluated: result.evaluatedSlugs.length, created: result.createdCount, createdSlugs: result.createdSlugs }));
    }
    console.log(JSON.stringify({ status: "completed", evaluatedPlayers: 8, createdAwards: createdTotal, globalWorkersInvoked: false }));
  } finally {
    activePlayer = null;
    globalThis.fetch = originalFetch;
    hooks.deregister();
  }
}

run().catch((error) => {
  const raw = error?.code ?? error?.message;
  const code = typeof raw === "string" && /^[A-Za-z0-9_]+$/.test(raw) ? raw : "badge_transition_failed_details_suppressed";
  console.error(JSON.stringify({ status: "failed", code }));
  process.exitCode = 1;
});
