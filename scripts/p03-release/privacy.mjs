// Operator-only privacy maintenance. No application import or automatic job.
// Metadata preview is the default; every body export and mutation is explicit.
import { chmodSync, lstatSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assertPrivateOutputDirectory, canonical, digest, fileHash, invariant, PRODUCTION_REF, readJson, run, saveJson, STAGING_REF } from "./core.mjs";
import { UUID } from "./facts.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ACTIONS = {
  preview: { rpc: "preview_match_room_retention", keys: ["roomIds", "afterRoomId"], write: false },
  locate: { rpc: "locate_match_room_privacy_data", keys: ["playerId", "afterRoomId", "limit"], write: false },
  export: { rpc: "export_match_room_privacy_data", keys: ["playerId", "roomId", "afterSequence", "limit"], write: false },
  purge: { rpc: "purge_match_room_retention", keys: ["roomIds"], write: true },
  hold: { rpc: "set_match_room_retention_hold", keys: ["roomId", "messageIds", "caseReference", "reason", "expiresAt"], write: true },
  "release-hold": { rpc: "release_match_room_retention_hold", keys: ["holdId"], write: true },
  redact: { rpc: "redact_match_room_messages", keys: ["playerId", "roomId", "messageIds"], write: true },
  "link-case": { rpc: "link_match_room_retention_case", keys: ["roomId", "caseReference", "caseKind", "closedAt"], write: true },
};
const uuid = (value) => { invariant(typeof value === "string" && UUID.test(value), "A valid UUID is required."); return value; };
function ids(value, limit, nullable = false) {
  if (nullable && value == null) return null;
  invariant(Array.isArray(value) && value.length >= 1 && value.length <= limit && new Set(value).size === value.length, `Provide 1–${limit} unique UUIDs.`);
  return value.map(uuid);
}
function integer(value, fallback, maximum) {
  const number = value ?? fallback;
  invariant(Number.isSafeInteger(number) && number >= 0 && number <= maximum, "Pagination value is outside its bound.");
  return number;
}
export function buildPrivacyRequest(command, input, actor, now = Date.now()) {
  const action = ACTIONS[command];
  invariant(action && input && typeof input === "object" && !Array.isArray(input), "Unknown privacy command or invalid request.");
  invariant(Object.keys(input).every((key) => action.keys.includes(key)), "Unexpected privacy request field.");
  invariant(/^user_[A-Za-z0-9]+$/.test(actor ?? ""), "Explicit Clerk admin actor is required.");
  /** @type {Record<string, unknown>} */
  const parameters = { p_actor_clerk_user_id: actor };
  if (["preview", "purge"].includes(command)) parameters.p_room_ids = ids(input.roomIds, 100, command === "preview");
  if (command === "preview") {
    parameters.p_after_room_id = input.afterRoomId == null ? null : uuid(input.afterRoomId);
    invariant(!parameters.p_room_ids || !parameters.p_after_room_id, "Use explicit room IDs or a preview cursor, not both.");
  }
  if (["locate", "export", "redact"].includes(command)) parameters.p_player_id = uuid(input.playerId);
  if (["export", "hold", "redact", "link-case"].includes(command)) parameters.p_room_id = uuid(input.roomId);
  if (command === "locate") {
    parameters.p_after_room_id = input.afterRoomId == null ? null : uuid(input.afterRoomId);
    parameters.p_limit = integer(input.limit, 100, 100);
    invariant(parameters.p_limit > 0, "A positive page limit is required.");
  }
  if (command === "export") {
    parameters.p_after_sequence = integer(input.afterSequence, 0, Number.MAX_SAFE_INTEGER);
    parameters.p_limit = integer(input.limit, 100, 500);
    invariant(parameters.p_limit > 0, "A positive page limit is required.");
  }
  if (["hold", "redact"].includes(command)) parameters.p_message_ids = ids(input.messageIds, 1000, command === "hold");
  if (command === "hold") {
    parameters.p_case_reference = uuid(input.caseReference);
    invariant(["legal", "security", "abuse_safety", "competition_integrity"].includes(input.reason), "Hold requires an approved reason category.");
    const expires = Date.parse(input.expiresAt);
    invariant(Number.isFinite(expires) && expires > now && expires <= now + 366 * 86400000, "Hold requires an explicit future expiry within 366 days.");
    parameters.p_reason = input.reason;
    parameters.p_expires_at = new Date(expires).toISOString();
  }
  if (command === "release-hold") parameters.p_hold_id = uuid(input.holdId);
  if (command === "link-case") {
    parameters.p_case_reference = uuid(input.caseReference);
    invariant(["support", "complaint", "privacy", "abuse_security", "dispute", "no_show", "competition_integrity"].includes(input.caseKind), "Formal case kind is invalid.");
    const closed = input.closedAt == null ? null : Date.parse(input.closedAt);
    invariant(closed === null || (Number.isFinite(closed) && closed <= now), "Case closure must be a verified past/current timestamp or null for open.");
    parameters.p_case_kind = input.caseKind;
    parameters.p_closed_at = closed === null ? null : new Date(closed).toISOString();
  }
  return { command, rpc: action.rpc, write: action.write, parameters };
}
export function privacyConfig(env, projectRef) {
  invariant([PRODUCTION_REF, STAGING_REF].includes(projectRef), "Choose the exact approved Production or Staging project ref.");
  invariant(env.P03_PRIVACY_SUPABASE_URL === `https://${projectRef}.supabase.co`, "Privacy endpoint does not match the explicit project ref.");
  const key = env.P03_PRIVACY_SERVICE_ROLE_KEY;
  invariant(typeof key === "string" && key.length > 20, "Private service-role key required.");
  if (!key.startsWith("sb_secret_")) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); } catch { throw new Error("Service-role key format is invalid."); }
    invariant(claims.ref === projectRef && claims.role === "service_role", "Service-role credential project/role mismatch.");
  }
  const production = projectRef === PRODUCTION_REF;
  invariant(typeof env.P03_PRIVACY_CLERK_SECRET_KEY === "string" && env.P03_PRIVACY_CLERK_SECRET_KEY.startsWith(production ? "sk_live_" : "sk_test_"), "Clerk credential environment does not match the project.");
  invariant(/^user_[A-Za-z0-9]+$/.test(env.P03_PRIVACY_ADMIN_CLERK_USER_ID ?? ""), "Explicit Clerk admin actor is required.");
  return { projectRef, production, url: env.P03_PRIVACY_SUPABASE_URL, serviceKey: key, clerkKey: env.P03_PRIVACY_CLERK_SECRET_KEY, actor: env.P03_PRIVACY_ADMIN_CLERK_USER_ID };
}
async function responseJson(fetchImpl, url, init, label) {
  let response;
  try { response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error(`${label} connection failed; preserve intent and inspect privately before any retry.`); }
  invariant(response.ok, `${label} failed with HTTP ${response.status}; response contents suppressed.`);
  const data = await response.text();
  invariant(Buffer.byteLength(data) <= 4 * 1024 * 1024, `${label} response exceeded its byte bound.`);
  try { return JSON.parse(data); } catch { throw new Error(`${label} returned invalid JSON.`); }
}
export async function verifyPrivacyAdmin(config, fetchImpl = fetch) {
  const user = await responseJson(fetchImpl, `https://api.clerk.com/v1/users/${config.actor}`, { headers: { Authorization: `Bearer ${config.clerkKey}`, "Clerk-API-Version": "2025-11-10" } }, "Clerk admin verification");
  invariant(user.id === config.actor && user.public_metadata?.role === "admin" && user.banned === false && user.locked === false, "Acting Clerk account is not an active administrator.");
}
export function validatePrivacyResult(plan, value) {
  invariant(value && typeof value === "object" && !Array.isArray(value), "Privacy RPC returned an invalid result.");
  if (plan.command === "export") {
    invariant(Object.keys(value).every((key) => ["roomId", "playerId", "messages", "nextSequence"].includes(key)), "Export contains an unexpected scope or private field.");
    invariant(value.playerId === plan.parameters.p_player_id && value.roomId === plan.parameters.p_room_id, "Export subject/room scope differs.");
    invariant(Array.isArray(value.messages) && value.messages.length <= plan.parameters.p_limit, "Export page exceeds its bound.");
    let previous = plan.parameters.p_after_sequence;
    for (const message of value.messages) {
      uuid(message.id);
      invariant(Object.keys(message).every((key) => ["id", "sequence", "senderKind", "isSubjectSender", "body", "createdAt"].includes(key)), "Export contains an unexpected private field.");
      invariant(Number.isSafeInteger(message.sequence) && message.sequence > previous && typeof message.body === "string" && message.body.length <= 10000 && typeof message.isSubjectSender === "boolean", "Export message shape/order is invalid.");
      previous = message.sequence;
    }
    invariant(value.nextSequence == null || value.nextSequence === previous, "Export cursor differs from the last message.");
  } else {
    const check = (item) => {
      if (!item || typeof item !== "object") return;
      for (const [key, child] of Object.entries(item)) {
        invariant(!["body", "messages", "messageBody", "replay_storage_path", "clerk_user_id"].includes(key), "Metadata response unexpectedly contains private content.");
        check(child);
      }
    };
    check(value);
    if (plan.command === "locate") invariant(value.playerId === plan.parameters.p_player_id && Array.isArray(value.rooms) && value.rooms.length <= plan.parameters.p_limit, "Locate subject/page scope differs.");
    if (plan.command === "preview") {
      invariant(Array.isArray(value.rooms) && value.rooms.length <= 100, "Preview exceeds the bounded room inventory.");
      if (value.nextRoomId != null) uuid(value.nextRoomId);
    }
  }
  return value;
}
export function authorizePrivacyOperation(plan, config, options) {
  if (plan.command === "export") invariant(options["include-bodies"] === true, "Body export requires --include-bodies and a private output directory.");
  else invariant(!options["include-bodies"], "Body export flag is valid only for export.");
  if (plan.write) invariant(options.execute === true && options.approval === `APPROVE P03 ${config.production ? "PRODUCTION" : "STAGING"} PRIVACY ${plan.command.toUpperCase()}`, "Mutation requires --execute and the exact operation/project approval.");
  else invariant(!options.execute && !options.approval, "Read-only command does not accept mutation approval.");
}
function privateDirectory(directory) {
  invariant(typeof directory === "string" && path.isAbsolute(directory), "An absolute, new private output directory is required.");
  for (let ancestor = path.dirname(directory); ancestor !== path.dirname(ancestor); ancestor = path.dirname(ancestor)) {
    if (existsSync(ancestor)) invariant(!lstatSync(ancestor).isSymbolicLink(), "Private output ancestors must not be symlinks.");
  }
  const output = assertPrivateOutputDirectory(directory, ROOT);
  if (process.platform === "win32") {
    const identity = run("whoami", []);
    run("icacls", [output, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`]);
  } else chmodSync(output, 0o700);
  return output;
}
export async function main(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch } = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { request: { type: "string" }, out: { type: "string" }, "project-ref": { type: "string" }, "include-bodies": { type: "boolean" }, execute: { type: "boolean" }, approval: { type: "string" } } });
  invariant(positionals.length <= 1 && values.request && values.out, "Use [preview|locate|export|purge|hold|release-hold|redact|link-case] --request JSON --project-ref REF --out NEW_PRIVATE_DIRECTORY.");
  const config = privacyConfig(env, values["project-ref"]);
  const plan = buildPrivacyRequest(positionals[0] ?? "preview", readJson(values.request), config.actor);
  authorizePrivacyOperation(plan, config, values);
  await verifyPrivacyAdmin(config, fetchImpl);
  const output = privateDirectory(values.out);
  const intent = { schemaVersion: 1, createdAt: new Date().toISOString(), projectRef: config.projectRef, command: plan.command, rpc: plan.rpc, mutation: plan.write, subjectScopeSha256: digest(plan.parameters), adminActorSha256: digest(config.actor) };
  saveJson(path.join(output, "intent.json"), intent);
  const result = validatePrivacyResult(plan, await responseJson(fetchImpl, `${config.url}/rest/v1/rpc/${plan.rpc}`, { method: "POST", headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" }, body: canonical(plan.parameters) }, "Privacy RPC"));
  const resultFile = path.join(output, plan.command === "export" ? "private-export.json" : "metadata.json");
  saveJson(resultFile, result);
  saveJson(path.join(output, "receipt.json"), { ...intent, completedAt: new Date().toISOString(), resultSha256: fileHash(resultFile), status: "PASS" });
  console.log(`P03 PRIVACY ${plan.command.toUpperCase()}: PASS (private result and audit receipt saved; no content logged)`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error("P03 PRIVACY: STOP. Check operation scope, credentials, private intent and database state; no automatic retry."); process.exitCode = 1; });
