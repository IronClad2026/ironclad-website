#!/usr/bin/env node
// New-only Staging fixture preparation. Default is read-only planning.
// RPC requests are individual transactions: a failed/uncertain request is never
// retried automatically. Preserve the private journal and inspect the new slug.
import { readFile, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGING_SUPABASE_REF, loadFixtureEnvironment, parseDotEnv,
  validateRuntimeGuards, validateClerkFixtureUser, buildRedactedResult,
} from "../lib/staging-synthetic-uat.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALIASES = Object.freeze(Array.from({ length: 8 }, (_, i) => `TestMain${i + 1}`));
const APPROVAL = "CREATE NEW STAGING P03 FIXTURE";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_TABLES = new Set([
  "tournaments", "tournament_brackets", "players", "coh3_maps",
  "registrations", "generated_brackets", "bracket_rounds",
  "tournament_matches", "push_subscriptions", "notifications",
  "legal_documents", "account_legal_acceptances",
]);
const WRITE_RPCS = new Set([
  "save_tournament", "enrol_staging_synthetic_uat_player",
  "review_tournament_registration", "publish_tournament_bracket_map_pools",
  "generate_tournament_bracket", "save_bracket_assignments",
  "launch_tournament_division", "apply_admin_official_match_result_api",
]);
function requireThat(ok, code) { if (!ok) throw new Error(code); }
function id(value) { requireThat(typeof value === "string" && UUID.test(value), "invalid_fixture_id"); return value; }
function only(rows) { requireThat(Array.isArray(rows) && rows.length === 1, "expected_one_fixture_row"); return rows[0]; }
function sameKeys(value, expected) {
  return value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, item]) => value[key] === item);
}
export function parseOptions(args) {
  const parsed = { create: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    requireThat(["--create", "--run-id", "--approval", "--outbound-proof"].includes(key), "invalid_arguments");
    const name = key.slice(2);
    requireThat(name === "create" ? !parsed.create : !Object.hasOwn(parsed, name), "duplicate_argument");
    if (key === "--create") parsed.create = true;
    else { requireThat(typeof args[i + 1] === "string" && !args[i + 1].startsWith("--"), "missing_argument"); parsed[name] = args[++i]; }
  }
  requireThat(/^[a-z0-9][a-z0-9-]{7,47}$/.test(parsed["run-id"] ?? ""), "unique_run_id_required");
  if (parsed.create) requireThat(parsed.approval === APPROVAL && parsed["outbound-proof"], "create_scope_and_outbound_proof_required");
  else requireThat(!parsed.approval, "approval_requires_create");
  return parsed;
}
export function validateDedicatedAdmin(user, email) {
  requireThat(typeof email === "string" && /^[^@\s]+\+clerk_test@[^@\s]+$/i.test(email), "admin_test_email_required");
  const entry = only(user.email_addresses);
  requireThat(/^user_[A-Za-z0-9]+$/.test(user.id ?? "")
    && user.external_id === "ironclad:p03-preview-admin:v1"
    && user.first_name === "P03PreviewAdmin"
    && !user.last_name && !user.username && user.password_enabled === true
    && !user.banned && !user.locked
    && entry.email_address.toLowerCase() === email.toLowerCase()
    && entry.verification?.status === "verified" && user.primary_email_address_id === entry.id
    && sameKeys(user.public_metadata, { role: "admin" })
    && sameKeys(user.private_metadata, {
      ironclad_fixture_source: "p03_preview_validation",
      ironclad_fixture_contract_version: 1,
      ironclad_fixture_alias: "P03PreviewAdmin",
    })
    && [user.phone_numbers, user.external_accounts, user.web3_wallets].every((items) => Array.isArray(items) && items.length === 0)
    && (!user.unsafe_metadata || Object.keys(user.unsafe_metadata).length === 0), "dedicated_admin_contract_rejected");
  return user;
}
export function validateAdminAccountState({ profiles, documents, acceptances }, clerkId, now = Date.now()) {
  requireThat(Array.isArray(profiles) && profiles.length === 1, "admin_active_profile_required");
  const profile = profiles[0];
  requireThat(UUID.test(profile.id ?? "") && profile.clerk_user_id === clerkId
    && profile.account_closed_at === null, "admin_active_profile_required");
  requireThat(Array.isArray(documents) && documents.length === 2, "admin_current_legal_documents_unavailable");
  const terms = documents.find((document) => document.document_kind === "terms");
  const privacy = documents.find((document) => document.document_kind === "privacy");
  requireThat(terms && privacy && documents.every((document) => UUID.test(document.id ?? "")
    && document.status === "effective" && /^[a-f0-9]{64}$/.test(document.sha256 ?? "")
    && Number.isFinite(Date.parse(document.published_at)) && Date.parse(document.published_at) <= now
    && Number.isFinite(Date.parse(document.effective_at)) && Date.parse(document.effective_at) <= now),
  "admin_current_legal_documents_unavailable");
  requireThat(Array.isArray(acceptances) && acceptances.length === 1, "admin_current_legal_acceptance_required");
  const acceptance = acceptances[0];
  requireThat(acceptance.clerk_user_id === clerkId
    && acceptance.terms_document_id === terms.id && acceptance.privacy_document_id === privacy.id
    && acceptance.terms_accepted === true && acceptance.privacy_acknowledged === true
    && acceptance.terms_sha256 === terms.sha256 && acceptance.privacy_sha256 === privacy.sha256
    && Number.isFinite(Date.parse(acceptance.accepted_at))
    && Date.parse(acceptance.accepted_at) <= now
    && Date.parse(acceptance.accepted_at) >= Math.max(...documents.flatMap((document) => [
      Date.parse(document.published_at), Date.parse(document.effective_at),
    ])), "admin_current_legal_acceptance_required");
}
export function validateOutboundProof(proof, actorIds, now = Date.now()) {
  const checked = Date.parse(proof.checkedAt);
  const expires = Date.parse(proof.expiresAt);
  requireThat(proof.schemaVersion === 1 && proof.projectRef === STAGING_SUPABASE_REF
    && Number.isFinite(checked) && checked <= now && now - checked <= 15 * 60_000
    && Number.isFinite(expires) && expires > now && expires - checked <= 15 * 60_000
    && proof.verifiedBy === "read-only-worker-environment-review"
    && proof.stagingCronWorkerVerified === true, "fresh_staging_outbound_proof_required");
  requireThat(proof.emailMode === "disabled" || (
    proof.emailMode === "allowlist"
    && Array.isArray(proof.emailAllowedClerkUserIds)
    && actorIds.every((actor) => !proof.emailAllowedClerkUserIds.includes(actor))
  ), "fixture_email_delivery_must_be_disabled_or_excluded");
}
export function validateFinalLayout(matches, rounds, registrations) {
  requireThat(matches.length === 7 && rounds.length === 3 && registrations.length === 8, "fixture_graph_size_mismatch");
  const roundNumber = new Map(rounds.map((row) => [id(row.id), row.round_number]));
  const forRound = (n) => matches.filter((row) => roundNumber.get(row.round_id) === n).sort((a, b) => a.match_number - b.match_number);
  const qf = forRound(1), sf = forRound(2), final = forRound(3);
  const count = (row) => Number(Boolean(row.player_one_registration_id)) + Number(Boolean(row.player_two_registration_id));
  requireThat(qf.length === 4 && sf.length === 2 && final.length === 1
    && qf.slice(0, 3).every((row) => row.status === "completed" && row.winner_registration_id)
    && qf[3].status === "in_progress" && count(qf[3]) === 2
    && sf[0].status === "in_progress" && count(sf[0]) === 2 && sf[0].activated_at
    && sf[1].status === "scheduled" && count(sf[1]) === 1 && !sf[1].activated_at
    && final[0].status === "scheduled" && count(final[0]) === 0 && !final[0].activated_at,
  "current_tbd_completed_fixture_not_established");
  const byId = new Map(registrations.map((row) => [row.id, row.alias]));
  return {
    currentMatchId: id(sf[0].id), onePlayerMatchId: id(sf[1].id), completedMatchId: id(qf[0].id),
    emptyFinalMatchId: id(final[0].id),
    firstAlias: byId.get(sf[0].player_one_registration_id),
    secondAlias: byId.get(sf[0].player_two_registration_id),
  };
}
export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const slug = `p03-preview-validation-${options["run-id"]}`;
  const title = `P03 Preview Validation ${options["run-id"]}`;
  const env = await loadFixtureEnvironment({
    rootDir: process.env.P03_STAGING_ENV_DIR ?? resolve(ROOT, "../ironclad-website"),
    processEnv: { NODE_ENV: "test" },
  });
  const configs = ALIASES.map((alias) => validateRuntimeGuards(env, alias));
  const config = configs[0];
  requireThat(process.env.P03_ADMIN_CREDENTIALS_FILE, "admin_credentials_file_required");
  const adminEnv = parseDotEnv(await readFile(process.env.P03_ADMIN_CREDENTIALS_FILE, "utf8"));
  let stage = "read_only_preflight", journal;
  const receipt = {
    schemaVersion: 1, projectRef: STAGING_SUPABASE_REF, source: "p03_preview_validation",
    slug, title, aliases: ALIASES, createdAt: new Date().toISOString(),
    status: "planned", mutations: [], tournamentId: null,
    provenance: "staging_synthetic_uat", fixtureContractVersion: "staging-synthetic-v1",
  };
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };
  async function request(url, init, label) {
    // Never follow a redirect with either credential; never expose backend text.
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
    requireThat(response.ok, `${label}_failed_http_${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function read(table, query) {
    requireThat(READ_TABLES.has(table), "table_outside_fixture_scope");
    const rows = await request(`${config.supabaseUrl}/rest/v1/${table}?${new URLSearchParams({ ...query, limit: "50" })}`, { headers }, "staging_read");
    requireThat(Array.isArray(rows) && rows.length < 50, "bounded_read_limit_reached");
    return rows;
  }
  async function clerkUser(email) {
    requireThat(typeof email === "string" && /^[^@\s]+\+clerk_test@[^@\s]+$/i.test(email), "test_email_required");
    return only(await request(`https://api.clerk.com/v1/users?${new URLSearchParams({ email_address: email, limit: "2" })}`, {
      headers: { Authorization: `Bearer ${config.clerkSecretKey}`, "Clerk-API-Version": "2025-11-10" },
    }, "clerk_read"));
  }
  async function record(kind, details = {}) {
    if (!journal) return;
    await journal.writeFile(JSON.stringify({ at: new Date().toISOString(), kind, stage, ...details }) + "\n");
    await journal.sync();
  }
  async function rpc(name, parameters, safeDetails = {}) {
    requireThat(options.create && WRITE_RPCS.has(name), "mutation_outside_fixture_scope");
    stage = name;
    await record("intent", safeDetails);
    const result = await request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST", headers, body: JSON.stringify(parameters),
    }, "staging_rpc");
    receipt.mutations.push(name);
    await record("success", safeDetails);
    return result;
  }
  try {
    const admin = validateDedicatedAdmin(await clerkUser(adminEnv.P03_ADMIN_EMAIL), adminEnv.P03_ADMIN_EMAIL);
    async function verifyAdminAccount() {
      const profiles = await read("players", {
        clerk_user_id: `eq.${admin.id}`, select: "id,clerk_user_id,account_closed_at",
      });
      const documents = await read("legal_documents", {
        status: "eq.effective", document_kind: "in.(terms,privacy)",
        select: "id,document_kind,status,published_at,effective_at,sha256",
      });
      const terms = documents.find((document) => document.document_kind === "terms");
      const privacy = documents.find((document) => document.document_kind === "privacy");
      requireThat(terms && privacy, "admin_current_legal_documents_unavailable");
      const acceptances = await read("account_legal_acceptances", {
        clerk_user_id: `eq.${admin.id}`, terms_document_id: `eq.${id(terms.id)}`,
        privacy_document_id: `eq.${id(privacy.id)}`,
        select: "clerk_user_id,terms_document_id,privacy_document_id,terms_sha256,privacy_sha256,terms_accepted,privacy_acknowledged,accepted_at",
      });
      validateAdminAccountState({ profiles, documents, acceptances }, admin.id);
    }
    await verifyAdminAccount();
    const actors = [];
    for (const actorConfig of configs) {
      const actor = validateClerkFixtureUser(await clerkUser(actorConfig.email), actorConfig);
      const result = only(await request(`${config.supabaseUrl}/rest/v1/rpc/inspect_staging_synthetic_uat_player`, {
        method: "POST", headers, body: JSON.stringify({ p_fixture_secret: config.fixtureSecret, p_alias: actorConfig.fixture.alias }),
      }, "fixture_inspect"));
      buildRedactedResult("inspect", actorConfig.fixture, result);
      const player = only(await read("players", { id: `eq.${id(result.player_id)}`, select: "id,clerk_user_id,account_closed_at" }));
      requireThat(player.clerk_user_id === actor.id && player.account_closed_at === null, "fixture_player_identity_mismatch");
      actors.push({ alias: actorConfig.fixture.alias, playerId: player.id, clerkId: actor.id });
    }
    requireThat(new Set(actors.map((actor) => actor.playerId)).size === 8
      && !actors.some((actor) => actor.clerkId === admin.id), "fixture_identities_not_distinct");
    requireThat((await read("tournaments", { slug: `eq.${slug}`, select: "id" })).length === 0, "fixture_slug_already_exists_no_automatic_resume");
    const maps = await read("coh3_maps", { status: "eq.active", game_mode: "eq.1v1", select: "id", order: "id.asc" });
    requireThat(maps.length >= 5, "five_active_maps_required");
    const actorFilter = `in.(${actors.map((actor) => actor.clerkId).join(",")})`;
    requireThat((await read("push_subscriptions", { owner_clerk_user_id: actorFilter, select: "id" })).length === 0, "fixture_push_subscriptions_must_be_absent");
    const outboundProof = options["outbound-proof"] ? JSON.parse(await readFile(resolve(options["outbound-proof"]), "utf8")) : null;
    if (outboundProof) validateOutboundProof(outboundProof, actors.map((actor) => actor.clerkId));
    receipt.outboundProofVerified = Boolean(outboundProof);
    receipt.plan = [
      "Create a new Main-only eight-player Staging event; save_tournament enforces the ranked-cycle exclusion lock.",
      "Enrol TestMain1–8 without reprovisioning; approve these eight NEW registrations.",
      "Publish five active 1v1 maps, generate and fill the new bracket, launch it.",
      "Finalize only new quarterfinals 1–3 with player-one wins through the official-result RPC.",
      "Retain current two-player semifinal, one-player/TBD semifinal, completed quarterfinal, and empty final.",
      "Retain audit history; after validation, separately void only this new event through void_tournament.",
    ];
    if (!options.create) return receipt;
    validateOutboundProof(outboundProof, actors.map((actor) => actor.clerkId));
    await verifyAdminAccount();
    await mkdir(resolve(ROOT, "p03-artifacts"), { recursive: true });
    const journalPath = resolve(ROOT, "p03-artifacts", `fixture-${options["run-id"]}.jsonl`);
    journal = await open(journalPath, "wx", 0o600);
    await record("plan", { ...receipt, adminVerified: true });
    const now = Date.now();
    receipt.tournamentId = id(await rpc("save_tournament", {
      p_tournament_id: null, p_title: title, p_slug: slug,
      p_description: "Disposable Staging-only P03 validation. All eight entrants and all three official quarterfinal outcomes are synthetic test fixtures; no provider verification or real competition is claimed.",
      p_banner_image_url: "/images/tournaments/1v1-operation-skyfall.jpeg",
      p_registration_open_at: new Date(now - 5 * 60_000).toISOString(),
      p_registration_close_at: new Date(now + 24 * 60 * 60_000).toISOString(),
      p_start_date: null, p_end_date: null, p_status: "registration_open", p_format: "1v1",
      p_prize_pool: "Synthetic test fixture — no prize", p_rules_url: null, p_battlefy_url: null,
      p_registration_enabled: true, p_grand_final_at: null, p_rule_format: "format_a",
      p_result_confirmation_window_minutes: 30,
      p_brackets: [{ name: "Main", elo_rules: "1400+ (synthetic Staging test ratings)", max_players: 8 }],
    }, { slug }));
    await record("new_tournament", { tournamentId: receipt.tournamentId });
    async function assertNewScope() {
      const event = only(await read("tournaments", { id: `eq.${receipt.tournamentId}`, select: "id,slug,title" }));
      requireThat(event.slug === slug && event.title === title, "new_event_scope_changed");
    }
    await assertNewScope();
    const bracket = only(await read("tournament_brackets", { tournament_id: `eq.${receipt.tournamentId}`, select: "id,name,max_players,launched_at" }));
    requireThat(bracket.name === "Main" && bracket.max_players === 8 && bracket.launched_at === null, "new_main_bracket_mismatch");
    receipt.bracketId = id(bracket.id);
    const registrations = [];
    for (const actor of actors) {
      await assertNewScope();
      const row = only(await rpc("enrol_staging_synthetic_uat_player", {
        p_fixture_secret: config.fixtureSecret, p_alias: actor.alias, p_tournament_id: receipt.tournamentId,
        p_tournament_bracket_id: bracket.id, p_waitlist_confirmed: false,
      }, { alias: actor.alias, tournamentId: receipt.tournamentId }));
      requireThat(row.created === true && row.player_id === actor.playerId
        && row.alias === actor.alias && row.provenance === "staging_synthetic_uat"
        && row.registration_status === "pending" && !row.waitlist_confirmation_required, "new_registration_contract_rejected");
      registrations.push({ id: id(row.registration_id), alias: actor.alias, playerId: actor.playerId, clerkId: actor.clerkId });
      await record("new_registration", { alias: actor.alias, registrationId: row.registration_id });
      await rpc("review_tournament_registration", {
        p_registration_id: row.registration_id, p_registration_status: "approved",
        p_admin_notes: `P03 disposable Staging fixture ${slug}; synthetic rating/provenance retained.`,
      }, { registrationId: row.registration_id });
    }
    receipt.registrations = registrations.map(({ id: registrationId, alias, playerId }) => ({ registrationId, alias, playerId, provenance: "staging_synthetic_uat" }));
    const roster = await read("registrations", { tournament_id: `eq.${receipt.tournamentId}`,
      select: "id,profile_id,clerk_user_id,tournament_bracket_id,registration_status,registration_provenance" });
    requireThat(roster.length === 8 && roster.every((row) => row.registration_status === "approved"
      && row.registration_provenance === "staging_synthetic_uat" && row.tournament_bracket_id === bracket.id
      && registrations.some((known) => known.id === row.id && known.playerId === row.profile_id && known.clerkId === row.clerk_user_id)),
    "new_roster_scope_mismatch");
    await assertNewScope();
    await rpc("publish_tournament_bracket_map_pools", { p_tournament_id: receipt.tournamentId,
      p_bracket_ids: [bracket.id], p_map_ids: maps.slice(0, 5).map((row) => id(row.id)), p_actor_clerk_user_id: admin.id });
    const generatedId = id(await rpc("generate_tournament_bracket", { p_tournament_bracket_id: bracket.id, p_generated_by: admin.id }));
    receipt.generatedBracketId = generatedId;
    const generated = only(await read("generated_brackets", { id: `eq.${generatedId}`, select: "id,tournament_bracket_id,format,slot_count,participant_count" }));
    requireThat(generated.tournament_bracket_id === bracket.id && generated.format === "single_elimination"
      && generated.slot_count === 8 && generated.participant_count === 8, "new_generated_bracket_mismatch");
    await rpc("save_bracket_assignments", { p_generated_bracket_id: generatedId,
      p_assignments: registrations.map((row, index) => ({ slot_number: index + 1, registration_id: row.id })), p_updated_by: admin.id });
    await assertNewScope();
    validateOutboundProof(outboundProof, actors.map((actor) => actor.clerkId));
    await rpc("launch_tournament_division", { p_tournament_bracket_id: bracket.id, p_actor_clerk_user_id: admin.id });
    const rounds = await read("bracket_rounds", { generated_bracket_id: `eq.${generatedId}`, select: "id,round_number" });
    requireThat(rounds.length === 3, "new_round_count_mismatch");
    const firstRound = only(rounds.filter((row) => row.round_number === 1));
    const matchColumns = "id,round_id,match_number,series_best_of,status,player_one_registration_id,player_two_registration_id,winner_registration_id,activated_at,deadline_at";
    const matches = () => read("tournament_matches", { generated_bracket_id: `eq.${generatedId}`, select: matchColumns });
    const quarterfinals = (await matches()).filter((row) => row.round_id === firstRound.id).sort((a, b) => a.match_number - b.match_number);
    requireThat(quarterfinals.length === 4, "new_quarterfinal_count_mismatch");
    for (const [index, match] of quarterfinals.slice(0, 3).entries()) {
      await assertNewScope();
      requireThat(match.match_number === index + 1 && match.status === "in_progress" && match.activated_at
        && match.player_one_registration_id === registrations[index * 2].id
        && match.player_two_registration_id === registrations[index * 2 + 1].id
        && [1, 3, 5, 7].includes(match.series_best_of), "new_quarterfinal_pairing_mismatch");
      await rpc("apply_admin_official_match_result_api", { p_match_id: id(match.id),
        p_player_one_score: Math.floor(match.series_best_of / 2) + 1, p_player_two_score: 0,
        p_winner_registration_id: match.player_one_registration_id, p_decided_by: admin.id,
      }, { matchId: match.id, syntheticOfficialResult: true });
    }
    const finalMatches = await matches();
    Object.assign(receipt, validateFinalLayout(finalMatches, rounds, registrations));
    receipt.completedTournamentId = receipt.tournamentId;
    requireThat(receipt.firstAlias === "TestMain1" && receipt.secondAlias === "TestMain3", "current_pair_alias_mismatch");
    // P03 communication tables deliberately revoke service-role SELECT. Never
    // inspect them through REST or resolve a room merely to test its absence.
    // Database rehearsal proves absent historical rooms; hosted UI validation
    // separately proves completed/TBD matches expose no writable room controls.
    const notifications = await read("notifications", { tournament_id: `eq.${receipt.tournamentId}`, select: "recipient_clerk_user_id,recipient_role" });
    requireThat(notifications.every((row) => row.recipient_role === "player" && actors.some((actor) => actor.clerkId === row.recipient_clerk_user_id)),
      "notification_recipient_outside_test_cohort");
    receipt.status = "ready";
    receipt.checkedAt = new Date().toISOString();
    receipt.notificationRecipientsVerified = true;
    receipt.cleanup = "After hosted validation, use void_tournament only for this tournamentId, with a synthetic-fixture cleanup reason and the dedicated admin actor. Do not delete or reset historical data.";
    await record("complete", receipt);
    const receiptFile = await open(resolve(ROOT, "p03-artifacts", `fixture-${options["run-id"]}.json`), "wx", 0o600);
    try { await receiptFile.writeFile(JSON.stringify(receipt, null, 2) + "\n"); await receiptFile.sync(); }
    finally { await receiptFile.close(); }
    return receipt;
  } catch (error) {
    const safe = /^[a-z0-9_]+$/.test(error?.message ?? "") ? error.message : "fixture_preparation_failed";
    await record("stopped", { code: safe, tournamentId: receipt.tournamentId, slug });
    throw new Error(`${safe}; stage=${stage}; new_fixture_slug=${slug}; preserve_private_journal_no_automatic_retry`);
  } finally { await journal?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n")).catch((error) => {
    const message = typeof error?.message === "string" && /^[a-z0-9_=; -]+$/.test(error.message) ? error.message : "fixture_preparation_failed";
    process.stderr.write(JSON.stringify({ status: "STOP", message }) + "\n");
    process.exitCode = 1;
  });
}
