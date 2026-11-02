// ROOT-REVIEWED STAGING API ACCEPTANCE ONLY. No browser automation or uploads.
// Reads credentials in memory through the already approved guarded loader;
// never copies an env file, prints provider errors, creates users/roles/tickets,
// or touches Production. Only existing synthetic Academy1..4 sessions are used.
// Root must keep email off/push claiming blocked and suppress only this run's
// newly generated notification deliveries after execution. This script does
// NOT claim to verify Vercel email configuration or restore any delivery grant.
// Usage: node scripts/patch2/private-assistance-hosted.mjs --manifest <json>
//   --phase create|off --confirm-run <runTag> --isolation-verified-at <ISO UTC>
// Factory receipt is the create manifest. For phase off, merge the receipt's
// `requests` field into that same nonsecret manifest first. No tokens/passwords
// are written. Phase create requires the separately enabled Staging DB flag;
// phase off proves existing conversations still accept replies with it disabled.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import { loadFixtureEnvironment, validateRuntimeGuards, validateClerkFixtureUser, assertClerkDevelopmentInstance } from "../lib/staging-synthetic-uat.mjs";

const STAGING = "zzbnneprhjicmajpjkdg";
const STAGING_URL = `https://${STAGING}.supabase.co`;
const CLERK_ISSUER = "https://guided-goshawk-34.clerk.accounts.dev";
const APPROVED_ENV_ROOT = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const ALIASES = ["TestAcademy1", "TestAcademy2", "TestAcademy3", "TestAcademy4"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessions = [];
const clients = [];
let clerk;
let step = "arguments";
let checks = 0;
let requests;
let manifest;
let phase;
let failed = false;
let realClerkPlayerRpc = false;
function safeRequestIds(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(["aRequester", "aOpponent", "bRequester", "bOpponent"].filter((key) => typeof value[key] === "string" && UUID.test(value[key])).map((key) => [key, value[key]]));
}
function verify(condition, label) { step = label; if (!condition) throw new Error("CHECK_FAILED"); checks++; }
function success(result, label) { verify(!result.error && result.data !== null, label); return result.data; }
function denied(result, label) { verify(result.error?.code === "42501", label); }
function args(tokens) {
  const result = {};
  for (let i = 0; i < tokens.length; i += 2) {
    verify(["--manifest", "--phase", "--confirm-run", "--isolation-verified-at"].includes(tokens[i]) && typeof tokens[i + 1] === "string" && !tokens[i + 1].startsWith("--") && !Object.hasOwn(result, tokens[i]), "arguments");
    result[tokens[i]] = tokens[i + 1];
  }
  return result;
}
const history = async (client, target, requestId) => success(await client.rpc("read_private_assistance", { p_request_id: requestId, p_after_sequence: 0, p_limit: 50, p_tournament_id: target.tournamentId }), "owned history read");
const open = (client, target, nonce, body) => client.rpc("open_private_assistance", { p_room_id: target.roomId, p_client_message_id: nonce, p_body: body });
const reply = (client, target, requestId, nonce, body) => client.rpc("reply_private_assistance", { p_request_id: requestId, p_client_message_id: nonce, p_body: body, p_tournament_id: target.tournamentId });

try {
  const options = args(process.argv.slice(2));
  phase = options["--phase"];
  verify(phase === "create" || phase === "off", "explicit phase");
  verify(typeof options["--manifest"] === "string" && /\.json$/i.test(options["--manifest"]), "nonsecret run manifest required");
  manifest = JSON.parse(await readFile(resolve(options["--manifest"]), "utf8"));
  verify(manifest?.projectRef === STAGING && manifest.committed === true && /^patch3-staging-assistance-\d{8}-v\d+$/.test(manifest.runTag) && options["--confirm-run"] === manifest.runTag, "exact committed owned run");
  verify(Array.isArray(manifest.tournaments) && manifest.tournaments.length === 2, "two fixture tournaments only");
  const [a, b] = manifest.tournaments;
  verify(a.label === "A" && b.label === "B" && a.tournamentId !== b.tournamentId && a.roomId !== b.roomId, "distinct scopes");
  for (const target of [a, b]) verify([target.tournamentId, target.bracketId, target.matchId, target.roomId].every((id) => UUID.test(id)) && target.tag === `${manifest.runTag}-${target.label.toLowerCase()}` && target.requesterAlias === "TestAcademy1", "manifest target validation");
  verify(a.opponentAlias === "TestAcademy2" && b.opponentAlias === "TestAcademy3", "known synthetic opponent pairings");
  const verifiedAt = Date.parse(options["--isolation-verified-at"] ?? "");
  verify(Number.isFinite(verifiedAt) && verifiedAt <= Date.now() && Date.now() - verifiedAt <= 30 * 60_000, "fresh explicit root isolation attestation");

  step = "guarded environment loading";
  const environment = await loadFixtureEnvironment({ rootDir: APPROVED_ENV_ROOT, processEnv: {} });
  const base = validateRuntimeGuards(environment, ALIASES[0]);
  verify(base.supabaseUrl === STAGING_URL, "exact Staging backend");
  await assertClerkDevelopmentInstance(base);
  clerk = createClerkClient({ secretKey: base.clerkSecretKey });
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  verify(typeof publicKey === "string" && publicKey.length > 20, "public API key available");
  if (publicKey.split(".").length === 3) verify(JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url")).ref === STAGING, "public key project binding");
  const admin = createClient(STAGING_URL, base.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(admin);
  const tournaments = success(await admin.from("tournaments").select("id,slug,status,terminal_at").in("id", [a.tournamentId, b.tournamentId]), "fixture tournament inspection");
  verify(tournaments.length === 2 && [a, b].every((target) => tournaments.some((row) => row.id === target.tournamentId && row.slug === target.tag && row.status === "cancelled" && row.terminal_at)), "only exact cancelled fixture tournaments");
  const registrations = success(await admin.from("registrations").select("id,tournament_id,profile_id,registration_provenance,fixture_contract_version").in("tournament_id", [a.tournamentId, b.tournamentId]), "fixture registration inspection");
  verify(registrations.length === 16 && registrations.every((row) => row.registration_provenance === "staging_synthetic_uat" && row.fixture_contract_version === "staging-synthetic-v2"), "sixteen canonical fixture registrations");

  const people = new Map();
  for (const alias of ALIASES) {
    step = "synthetic registry validation";
    const config = validateRuntimeGuards(environment, alias);
    const found = success(await admin.rpc("inspect_staging_synthetic_uat_player", { p_fixture_secret: config.fixtureSecret, p_alias: alias }), "guarded existing fixture registry");
    verify(Array.isArray(found) && found.length === 1 && UUID.test(found[0].player_id), "unique approved fixture identity");
    const player = success(await admin.from("players").select("id,clerk_user_id,in_game_name,profile_completed,account_closed_at").eq("id", found[0].player_id).single(), "owned synthetic player lookup");
    verify(player.in_game_name === alias && player.profile_completed && player.account_closed_at === null, "active complete synthetic profile");
    step = "official Clerk fixture verification";
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(player.clerk_user_id)}`, { headers: { Authorization: `Bearer ${config.clerkSecretKey}` }, signal: AbortSignal.timeout(20_000) });
    verify(response.ok, "Clerk fixture read");
    const raw = await response.json();
    validateClerkFixtureUser(raw, config);
    verify(raw.id === player.clerk_user_id, "registry and Development identity pairing");
    const session = await clerk.sessions.createSession({ userId: raw.id });
    sessions.push(session.id);
    const getToken = async () => {
      const jwt = (await clerk.sessions.getToken(session.id)).jwt;
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url"));
      verify(payload.sub === raw.id && payload.iss === CLERK_ISSUER && payload.metadata?.role !== "admin", "real Development player token classification");
      return jwt;
    };
    const client = createClient(STAGING_URL, publicKey, { accessToken: getToken, auth: { persistSession: false, autoRefreshToken: false } });
    clients.push(client);
    people.set(alias, { client, playerId: player.id, userId: raw.id });
  }
  const p1 = people.get("TestAcademy1");
  const p2 = people.get("TestAcademy2");
  const p3 = people.get("TestAcademy3");
  const p4 = people.get("TestAcademy4");
  // Read-only prerequisite, before any assistance write. Never fabricate legal
  // consent for a fixture if the existing normal account flow is incomplete.
  const legalDocuments = success(await admin.from("legal_documents").select("id,document_kind").eq("status", "effective").in("document_kind", ["terms", "privacy"]), "effective legal document prerequisite");
  verify(legalDocuments.length === 2 && legalDocuments.some((row) => row.document_kind === "terms") && legalDocuments.some((row) => row.document_kind === "privacy"), "unique effective legal pair");
  const terms = legalDocuments.find((row) => row.document_kind === "terms").id;
  const privacy = legalDocuments.find((row) => row.document_kind === "privacy").id;
  for (const person of [p1, p2, p3]) {
    const accepted = success(await admin.from("account_legal_acceptances").select("terms_accepted,privacy_acknowledged").eq("clerk_user_id", person.userId).eq("terms_document_id", terms).eq("privacy_document_id", privacy).maybeSingle(), "existing synthetic legal prerequisite; no consent writes");
    verify(accepted.terms_accepted === true && accepted.privacy_acknowledged === true, "existing synthetic legal acceptance complete");
  }
  const anon = createClient(STAGING_URL, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(anon);
  const contextA = success(await p1.client.rpc("get_private_assistance_context", { p_room_id: a.roomId }), "genuine participant context A");
  const contextB = success(await p1.client.rpc("get_private_assistance_context", { p_room_id: b.roomId }), "genuine participant context B");
  verify(contextA.room.tournamentId === a.tournamentId && contextB.room.tournamentId === b.tournamentId && contextA.room.matchId === a.matchId && contextB.room.matchId === b.matchId, "authenticated exact tournament/match contexts");
  realClerkPlayerRpc = true;
  denied(await p4.client.rpc("get_private_assistance_context", { p_room_id: a.roomId }), "unrelated player context denied");
  denied(await anon.rpc("get_private_assistance_context", { p_room_id: a.roomId }), "anonymous context denied");

  if (phase === "create") {
    verify(contextA.newRequestsEnabled && contextA.canCreate && contextA.request === null && contextB.newRequestsEnabled && contextB.canCreate && contextB.request === null, "fresh fixture and separately enabled creation gate");
    const nonceA = randomUUID();
    const bodyA = `[SYNTHETIC STAGING ${manifest.runTag}] Requester A initial: schedule 03 Nov 2026 18:30 UTC. No real assistance needed.`;
    const [first, opponent] = await Promise.all([open(p1.client, a, nonceA, bodyA), open(p2.client, a, randomUUID(), `[SYNTHETIC STAGING ${manifest.runTag}] Opponent A private initial.`)]);
    const ra = success(first, "requester A creation");
    const oa = success(opponent, "simultaneous opponent A creation");
    verify(ra.accepted && ra.acceptedClientMessageId === nonceA && oa.accepted && ra.request.id !== oa.request.id, "separate simultaneous private conversations");
    const repeat = success(await open(p1.client, a, nonceA, bodyA), "idempotent initial retry");
    verify(repeat.accepted && repeat.duplicate && repeat.request.id === ra.request.id && repeat.message.id === ra.message.id && repeat.acceptedClientMessageId === nonceA, "same initial retry creates no extra message");
    const before = await history(p1.client, a, ra.request.id);
    const collision = await open(p1.client, a, nonceA, `${bodyA} changed`);
    verify(collision.error?.code === "23505", "changed-body initial nonce rejected");
    const after = await history(p1.client, a, ra.request.id);
    verify(JSON.stringify(before) === JSON.stringify(after), "rejected nonce collision leaves history unchanged");
    const nonceB1 = randomUUID(); const nonceB2 = randomUUID();
    const raced = await Promise.all([open(p1.client, b, nonceB1, `[SYNTHETIC STAGING ${manifest.runTag}] B first attempt.`), open(p1.client, b, nonceB2, `[SYNTHETIC STAGING ${manifest.runTag}] B simultaneous second attempt.`)]);
    const rb = raced.map((result) => success(result, "same-requester B create race"));
    verify(rb.filter((result) => result.accepted).length === 1 && rb.filter((result) => !result.accepted && result.message === null && result.acceptedClientMessageId === null).length === 1 && rb[0].request.id === rb[1].request.id, "same requester has one thread and one accepted initial body");
    const ob = success(await open(p3.client, b, randomUUID(), `[SYNTHETIC STAGING ${manifest.runTag}] Opponent B private initial.`), "opponent B creation");
    verify(ob.accepted && ob.request.id !== rb[0].request.id, "different B opponent thread");
    requests = { aRequester: ra.request.id, aOpponent: oa.request.id, bRequester: rb[0].request.id, bOpponent: ob.request.id };
    const registrationA = registrations.find((row) => row.tournament_id === a.tournamentId && row.profile_id === p1.playerId);
    const registrationB = registrations.find((row) => row.tournament_id === b.tournamentId && row.profile_id === p1.playerId);
    verify(ra.request.requesterRegistrationId === registrationA?.id && rb[0].request.requesterRegistrationId === registrationB?.id && registrationA?.id !== registrationB?.id, "same player owns separate tournament registrations and requests");
    const nonceReply = randomUUID();
    const bodyReply = `[SYNTHETIC STAGING ${manifest.runTag}] Requester follow-up; retain original scheduling detail.`;
    const sent = success(await reply(p1.client, a, requests.aRequester, nonceReply, bodyReply), "requester reply");
    const resent = success(await reply(p1.client, a, requests.aRequester, nonceReply, bodyReply), "idempotent reply retry");
    verify(sent.accepted && resent.duplicate && sent.message.id === resent.message.id && resent.acceptedClientMessageId === nonceReply, "reply UUID idempotency");
  } else {
    requests = manifest.requests;
    verify(requests && [requests.aRequester, requests.aOpponent, requests.bRequester, requests.bOpponent].every((id) => UUID.test(id)), "existing run request IDs required for off phase");
    verify(!contextA.newRequestsEnabled && !contextA.canCreate && !contextB.newRequestsEnabled && !contextB.canCreate && contextA.request?.id === requests.aRequester && contextB.request?.id === requests.bRequester, "creation off retains both existing contexts");
    const freshOtherRoom = await p4.client.rpc("get_private_assistance_context", { p_room_id: a.roomId });
    denied(freshOtherRoom, "off phase does not grant outsider membership");
    const sent = success(await reply(p1.client, a, requests.aRequester, randomUUID(), `[SYNTHETIC STAGING ${manifest.runTag}] Existing conversation reply while creation is OFF.`), "existing reply while creation off");
    verify(sent.accepted && sent.request.status === "open", "creation switch does not disable replies or requester reopening");
  }
  denied(await p2.client.rpc("read_private_assistance", { p_request_id: requests.aRequester, p_after_sequence: 0, p_limit: 50, p_tournament_id: a.tournamentId }), "opponent cannot read requester private thread");
  denied(await p1.client.rpc("read_private_assistance", { p_request_id: requests.aOpponent, p_after_sequence: 0, p_limit: 50, p_tournament_id: a.tournamentId }), "requester cannot read opponent private thread");
  denied(await p3.client.rpc("read_private_assistance", { p_request_id: requests.bRequester, p_after_sequence: 0, p_limit: 50, p_tournament_id: b.tournamentId }), "second opponent private read denied");
  denied(await p4.client.rpc("read_private_assistance", { p_request_id: requests.aRequester, p_after_sequence: 0, p_limit: 50, p_tournament_id: a.tournamentId }), "nonparticipant private read denied");
  denied(await anon.rpc("read_private_assistance", { p_request_id: requests.aRequester, p_after_sequence: 0, p_limit: 50, p_tournament_id: a.tournamentId }), "anonymous private read denied");
  const stable = await history(p1.client, a, requests.aRequester);
  denied(await p1.client.rpc("read_private_assistance", { p_request_id: requests.aRequester, p_after_sequence: 0, p_limit: 50, p_tournament_id: b.tournamentId }), "cross-tournament detail denied");
  denied(await reply(p1.client, b, requests.aRequester, randomUUID(), `[SYNTHETIC STAGING ${manifest.runTag}] Rejected cross-tournament target.`), "cross-tournament reply denied");
  denied(await p2.client.rpc("reply_private_assistance", { p_request_id: requests.aRequester, p_client_message_id: randomUUID(), p_body: `[SYNTHETIC STAGING ${manifest.runTag}] Rejected opponent reply.`, p_tournament_id: a.tournamentId }), "opponent cannot reply to requester private thread");
  denied(await p1.client.rpc("list_admin_private_assistance", { p_tournament_id: a.tournamentId, p_status: "all", p_page: 1, p_selected_id: requests.aRequester }), "player cannot read admin queue");
  denied(await p1.client.rpc("set_private_assistance_status", { p_tournament_id: a.tournamentId, p_request_id: requests.aRequester, p_status: "resolved", p_expected_version: stable.request.version }), "player cannot change workflow status");
  verify(JSON.stringify(stable) === JSON.stringify(await history(p1.client, a, requests.aRequester)), "all denied actions leave exact owned history unchanged");
  for (const client of [p1.client, anon]) {
    const raw = await client.from("assistance_requests").select("id").eq("id", requests.aRequester);
    verify(raw.error?.code === "42501", "direct private-table access remains denied");
  }
  // The trusted server retains legacy-compatible request-metadata SELECT, but
  // all raw message bodies remain denied even to its service role.
  for (const client of [p1.client, anon, admin]) {
    const raw = await client.from("assistance_messages").select("id").eq("request_id", requests.aRequester);
    verify(raw.error?.code === "42501", "direct private-message access remains denied");
  }
  const terminal = success(await admin.from("tournaments").select("id,status,terminal_at").in("id", [a.tournamentId, b.tournamentId]), "terminal preservation readback");
  verify(terminal.every((row) => row.status === "cancelled" && row.terminal_at), "assistance does not revive competition");
} catch {
  failed = true;
  // Deliberately suppress raw SDK errors, assertions, payloads and identities.
  console.error(JSON.stringify({ result: "FAILED", check: step, checksPassed: checks }));
} finally {
  let revoked = 0;
  for (const id of sessions) {
    try { await clerk.sessions.revokeSession(id); revoked++; }
    catch { failed = true; }
  }
  for (const client of clients) {
    try { await client.removeAllChannels(); await client.realtime.disconnect(); }
    catch { failed = true; }
  }
  console.log(JSON.stringify({ result: failed ? "FAILED" : "PASS", phase: phase === "create" || phase === "off" ? phase : null, runTag: typeof manifest?.runTag === "string" && /^patch3-staging-assistance-\d{8}-v\d+$/.test(manifest.runTag) ? manifest.runTag : null, projectRef: STAGING, checksPassed: checks, temporarySessionsCreated: sessions.length, temporarySessionsRevoked: revoked, requests: safeRequestIds(requests), realClerkPlayerRpc, realClerkAdminTest: false, browserTest: false, deliveryConfigurationAttestedByRootOnly: true }));
  if (failed) process.exitCode = 1;
}
