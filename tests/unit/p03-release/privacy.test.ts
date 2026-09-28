import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { authorizePrivacyOperation, buildPrivacyRequest, main, privacyConfig, validatePrivacyResult, verifyPrivacyAdmin } from "../../../scripts/p03-release/privacy.mjs";
import { PRODUCTION_REF, STAGING_REF } from "../../../scripts/p03-release/core.mjs";

const player = "d23a0000-0000-4000-8000-000000000001";
const room = "d23a0000-0000-4000-8000-000000000002";
const message = "d23a0000-0000-4000-8000-000000000003";
const actor = "user_syntheticadmin";
const environment = { NODE_ENV: "test" as const, P03_PRIVACY_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`, P03_PRIVACY_SERVICE_ROLE_KEY: "sb_secret_synthetic_placeholder", P03_PRIVACY_CLERK_SECRET_KEY: "sk_test_synthetic", P03_PRIVACY_ADMIN_CLERK_USER_ID: actor };
const now = Date.parse("2026-09-23T00:00:00Z");

describe("operator privacy authority", () => {
  it("pins exact Supabase and Clerk environments without credential fallbacks", () => {
    expect(privacyConfig(environment, STAGING_REF).production).toBe(false);
    expect(() => privacyConfig(environment, PRODUCTION_REF)).toThrow("endpoint");
    expect(() => privacyConfig({ ...environment, P03_PRIVACY_CLERK_SECRET_KEY: "sk_live_unrelated" }, STAGING_REF)).toThrow("environment");
    expect(() => privacyConfig({ ...environment, P03_PRIVACY_SERVICE_ROLE_KEY: "missing" }, STAGING_REF)).toThrow("key");
  });
  it("rejects mismatched JWT service-role credentials", () => {
    const key = `eyJ.${Buffer.from(JSON.stringify({ ref: PRODUCTION_REF, role: "service_role" })).toString("base64url")}.synthetic`;
    expect(() => privacyConfig({ ...environment, P03_PRIVACY_SERVICE_ROLE_KEY: key }, STAGING_REF)).toThrow("mismatch");
  });
  it("verifies admin identity against Clerk and rejects disabled or unrelated users", async () => {
    const config = privacyConfig(environment, STAGING_REF);
    const response = (user: object) => async () => new Response(JSON.stringify(user), { status: 200 });
    const admin = { id: actor, public_metadata: { role: "admin" }, banned: false, locked: false };
    await expect(verifyPrivacyAdmin(config, response(admin))).resolves.toBeUndefined();
    for (const user of [{ ...admin, id: "user_other" }, { ...admin, public_metadata: { role: "member" } }, { ...admin, banned: true }, { ...admin, locked: true }]) await expect(verifyPrivacyAdmin(config, response(user))).rejects.toThrow("administrator");
    await expect(verifyPrivacyAdmin(config, async () => new Response("private secret", { status: 403 }))).rejects.toThrow("HTTP 403");
  });
  it("requires exact operation/project approval before mutations", () => {
    const plan = buildPrivacyRequest("purge", { roomIds: [room] }, actor);
    const config = privacyConfig(environment, STAGING_REF);
    expect(() => authorizePrivacyOperation(plan, config, {})).toThrow("approval");
    expect(() => authorizePrivacyOperation(plan, config, { execute: true, approval: "APPROVE P03 PRODUCTION PRIVACY PURGE" })).toThrow("approval");
    expect(() => authorizePrivacyOperation(plan, config, { execute: true, approval: "APPROVE P03 STAGING PRIVACY PURGE" })).not.toThrow();
    expect(() => authorizePrivacyOperation(buildPrivacyRequest("preview", {}, actor), config, { execute: true })).toThrow("Read-only");
  });
});

describe("bounded privacy scope", () => {
  it("requires an explicit purge scope and bounds every page", () => {
    expect(buildPrivacyRequest("preview", {}, actor).parameters.p_room_ids).toBeNull();
    expect(buildPrivacyRequest("preview", { afterRoomId: room }, actor).parameters.p_after_room_id).toBe(room);
    expect(() => buildPrivacyRequest("preview", { roomIds: [room], afterRoomId: room }, actor)).toThrow("cursor");
    expect(() => buildPrivacyRequest("purge", {}, actor)).toThrow("unique UUIDs");
    expect(() => buildPrivacyRequest("purge", { roomIds: [room, room] }, actor)).toThrow("unique");
    expect(() => buildPrivacyRequest("locate", { playerId: player, limit: 101 }, actor)).toThrow("bound");
    expect(() => buildPrivacyRequest("export", { playerId: player, roomId: room, limit: 501 }, actor)).toThrow("bound");
    expect(() => buildPrivacyRequest("export", { playerId: player, roomId: room, afterSequence: -1 }, actor)).toThrow("bound");
    expect(() => buildPrivacyRequest("locate", { playerId: player, actor: "user_forged" }, actor)).toThrow("Unexpected");
  });
  it("requires finite narrow holds and authoritative case references", () => {
    const hold = { roomId: room, messageIds: [message], caseReference: player, reason: "legal", expiresAt: "2026-10-23T00:00:00Z" };
    expect(buildPrivacyRequest("hold", hold, actor, now).parameters.p_message_ids).toEqual([message]);
    expect(() => buildPrivacyRequest("hold", { ...hold, expiresAt: "2099-01-01" }, actor, now)).toThrow("366");
    expect(() => buildPrivacyRequest("hold", { ...hold, reason: "message sounds suspicious" }, actor, now)).toThrow("category");
    expect(() => buildPrivacyRequest("link-case", { roomId: room, caseReference: player, caseKind: "support", closedAt: "2099-01-01" }, actor, now)).toThrow("verified");
    expect(buildPrivacyRequest("link-case", { roomId: room, caseReference: player, caseKind: "support", closedAt: null }, actor, now).parameters.p_closed_at).toBeNull();
  });
  it("requires subject and explicit message IDs for redaction", () => {
    expect(() => buildPrivacyRequest("redact", { playerId: player, roomId: room }, actor)).toThrow("unique");
    expect(buildPrivacyRequest("redact", { playerId: player, roomId: room, messageIds: [message] }, actor).parameters.p_player_id).toBe(player);
  });
  it("prevents body export by default and rejects unrelated or extra private data", () => {
    const plan = buildPrivacyRequest("export", { playerId: player, roomId: room }, actor);
    const config = privacyConfig(environment, STAGING_REF);
    expect(() => authorizePrivacyOperation(plan, config, {})).toThrow("include-bodies");
    expect(() => authorizePrivacyOperation(plan, config, { "include-bodies": true })).not.toThrow();
    const value = { playerId: player, roomId: room, messages: [{ id: message, sequence: 1, senderKind: "participant", isSubjectSender: true, body: "synthetic", createdAt: "2026-09-23T00:00:00Z" }], nextSequence: null };
    expect(() => validatePrivacyResult(plan, value)).not.toThrow();
    expect(() => validatePrivacyResult(plan, { ...value, roomId: player })).toThrow("scope");
    expect(() => validatePrivacyResult(plan, { ...value, unrelatedRooms: [] })).toThrow("unexpected");
    expect(() => validatePrivacyResult(plan, { ...value, messages: [{ ...value.messages[0], clerk_user_id: "private" }] })).toThrow("private field");
    expect(() => validatePrivacyResult(plan, { ...value, nextSequence: 99 })).toThrow("cursor");
  });
  it("rejects accidental content in metadata commands", () => {
    const plan = buildPrivacyRequest("locate", { playerId: player }, actor);
    expect(() => validatePrivacyResult(plan, { playerId: player, rooms: [{ roomId: room, body: "private" }] })).toThrow("private content");
    expect(() => validatePrivacyResult(plan, { playerId: room, rooms: [] })).toThrow("scope");
    expect(() => validatePrivacyResult(plan, { playerId: player, rooms: [] })).not.toThrow();
  });
});

describe("private operator output", () => {
  it("verifies the admin before one scoped export and never logs its body", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "p03-private-export-"));
    const request = path.join(directory, "request.json");
    const output = path.join(directory, "new-output");
    writeFileSync(request, JSON.stringify({ playerId: player, roomId: room }));
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
      return new Response(JSON.stringify(calls.length === 1
        ? { id: actor, public_metadata: { role: "admin" }, banned: false, locked: false }
        : { playerId: player, roomId: room, messages: [{ id: message, sequence: 1, senderKind: "participant", isSubjectSender: true, body: "private synthetic export content", createdAt: "2026-09-23T00:00:00Z" }], nextSequence: null }), { status: 200 });
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await main(["export", "--request", request, "--project-ref", STAGING_REF, "--include-bodies", "--out", output], { env: environment, fetchImpl });
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe(`https://api.clerk.com/v1/users/${actor}`);
      expect(JSON.parse(calls[1].body!)).toMatchObject({ p_player_id: player, p_room_id: room, p_actor_clerk_user_id: actor });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private synthetic export content");
      expect(JSON.parse(readFileSync(path.join(output, "private-export.json"), "utf8")).messages[0].body).toBe("private synthetic export content");
      expect(JSON.parse(readFileSync(path.join(output, "receipt.json"), "utf8")).status).toBe("PASS");
    } finally { log.mockRestore(); }
  });
  it("preserves a mutation intent and does not retry an uncertain RPC", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "p03-private-intent-"));
    const request = path.join(directory, "request.json"); const output = path.join(directory, "new-output");
    writeFileSync(request, JSON.stringify({ roomIds: [room] }));
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ id: actor, public_metadata: { role: "admin" }, banned: false, locked: false }), { status: 200 });
      throw new Error("synthetic uncertain connection");
    };
    await expect(main(["purge", "--request", request, "--project-ref", STAGING_REF, "--execute", "--approval", "APPROVE P03 STAGING PRIVACY PURGE", "--out", output], { env: environment, fetchImpl })).rejects.toThrow("preserve intent");
    expect(calls).toBe(2);
    expect(JSON.parse(readFileSync(path.join(output, "intent.json"), "utf8")).mutation).toBe(true);
  });
});
