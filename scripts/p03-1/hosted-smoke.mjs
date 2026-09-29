// Small Staging transport smoke using an EXISTING synthetic pair only.
// Creates no players, tournaments, messages, read cursors or assistance rows.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createClerkClient } from "@clerk/backend";
import { readFileSync } from "node:fs";
import {
  getFixtureDefinition,
  buildClerkFixtureIdentity,
  assertClerkDevelopmentInstance,
  hasAdminMetadata,
} from "../lib/staging-synthetic-uat.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(url, "https://zzbnneprhjicmajpjkdg.supabase.co");
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));
await assertClerkDevelopmentInstance({
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
});
for (const credential of [key, serviceKey]) {
  assert.ok(credential);
  if (credential.split(".").length === 3) {
    assert.equal(JSON.parse(Buffer.from(credential.split(".")[1], "base64url")).ref, "zzbnneprhjicmajpjkdg");
  }
}
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = [admin];
const sessions = [];
const channels = [];
function check(result) {
  if (result.error) throw new Error("Staging read failed; details suppressed");
  return result.data;
}
function synthetic(user) {
  let identity;
  try {
    identity = buildClerkFixtureIdentity(user.privateMetadata?.ironclad_fixture_alias);
  } catch {
    return false;
  }
  return user.privateMetadata?.ironclad_fixture_source === "staging_synthetic_uat" &&
    user.privateMetadata?.ironclad_fixture_contract_version === "staging-synthetic-v1" &&
    user.externalId === identity.externalId && user.publicMetadata?.role === "player" &&
    !hasAdminMetadata(user.publicMetadata) && !hasAdminMetadata(user.privateMetadata) &&
    !hasAdminMetadata(user.unsafeMetadata);
}
async function subscribe(client, topic, onSignal) {
  const channel = client.channel(topic, { config: { private: true } });
  channels.push(channel);
  if (onSignal) channel.on("broadcast", { event: "invalidate" }, onSignal);
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 12_000);
    channel.subscribe((value, error) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(value)) {
        if (error) console.log(JSON.stringify({ transportStatus: value, diagnostic: String(error.message)
          .replace(/user_[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[identity]")
          .replace(/eyJ[A-Za-z0-9_.-]+/g, "[token]") }));
        clearTimeout(timer);
        resolve(value);
      }
    });
  });
  return { channel, status };
}
try {
  // Candidates are restricted to the immutable verified synthetic registry by
  // read-only SQL inspection. Direct service-role room-table SELECT stays denied.
  const rooms = JSON.parse(readFileSync(process.argv[2], "utf8"));
  assert.ok(Array.isArray(rooms) && rooms.length <= 1);
  let room;
  let participant;
  for (const candidate of rooms) {
    const aliases = [candidate.participant_one_alias, candidate.participant_two_alias];
    assert.ok(aliases.every((alias) => getFixtureDefinition(alias).alias === alias));
    const identities = await Promise.all(aliases.map(async (alias) => {
      const result = await clerk.users.getUserList({ externalId: [buildClerkFixtureIdentity(alias).externalId], limit: 2 });
      assert.equal(result.data.length, 1);
      return result.data[0];
    }));
    if (!identities.every(synthetic)) continue;
    room = candidate;
    participant = identities[0];
    break;
  }
  assert.ok(room && participant, "No existing fully synthetic open pair available for hosted smoke");
  const session = await clerk.sessions.createSession({ userId: participant.id });
  sessions.push(session.id);
  const getToken = async () => (await clerk.sessions.getToken(session.id)).jwt;
  const client = createClient(url, key, { accessToken: getToken });
  clients.push(client);
  await client.realtime.setAuth(await getToken());
  const tokenRefresh = setInterval(() => { void getToken().then((token) => client.realtime.setAuth(token)).catch(() => {}); }, 25_000);
  client.smokeTokenTimer = tokenRefresh;
  const topic = `match-room:${room.id}:${room.communication_generation}`;
  const read = async () => {
    const result = check(await client.rpc("get_match_room_history", { p_room_id: room.id, p_after_sequence: 0, p_limit: 1 }));
    assert.equal(result.room.id, room.id);
    assert.equal(result.room.communicationGeneration, room.communication_generation);
    return result;
  };
  const before = await read();
  assert.equal(before.room.writable, true);
  let received;
  const arrival = new Promise((resolve) => { received = resolve; });
  const authorized = await subscribe(client, topic, async ({ payload }) => {
    if (payload.roomId !== room.id || payload.communicationGeneration !== room.communication_generation) return;
    const snapshot = await read();
    received(snapshot.room.id === room.id);
  });
  assert.equal(authorized.status, "SUBSCRIBED", `Authorized private join failed (${authorized.status})`);
  console.log("PASS: existing synthetic participant authorized private subscription");
  const denied = await subscribe(client, `match-room:00000000-0000-4000-8000-000000000001:1`);
  assert.equal(denied.status, "CHANNEL_ERROR", "Unrelated room join was not denied");
  await client.removeChannel(denied.channel);
  const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(anonymous);
  const publicDenied = await subscribe(anonymous, topic);
  assert.equal(publicDenied.status, "CHANNEL_ERROR", "Unauthenticated private join was not denied");
  console.log("PASS: unrelated and unauthenticated private subscriptions denied");
  // A transport-only signal exercises refresh without creating a conversation.
  if (process.argv.includes("--database-signal")) {
    console.log("READY: waiting for one content-free database broadcast on the verified synthetic room");
  } else {
    const sender = admin.channel(topic, { config: { private: true } });
    channels.push(sender);
    assert.equal((await sender.httpSend("invalidate", {
      roomId: room.id, communicationGeneration: room.communication_generation,
    })).success, true);
  }
  let arrivalTimeout;
  const delivered = await Promise.race([arrival, new Promise((resolve) => {
    arrivalTimeout = setTimeout(() => resolve(false), process.argv.includes("--database-signal") ? 45_000 : 10_000);
  })]);
  clearTimeout(arrivalTimeout);
  assert.equal(delivered, true, "Broadcast did not trigger authoritative refresh");
  console.log("PASS: private signal triggers authoritative RPC refresh");
  await client.removeChannel(authorized.channel);
  const after = await read();
  assert.equal(after.room.lastReadSequence, before.room.lastReadSequence);
  console.log("PASS: authorized read works disconnected; read cursor unchanged");
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Hosted operation failed; details suppressed"}`);
  process.exitCode = 1;
} finally {
  for (const channel of channels) channel.teardown();
  await Promise.all(clients.map(async (client) => {
    clearInterval(client.smokeTokenTimer);
    try { await client.removeAllChannels(); }
    finally { await client.realtime.disconnect(); }
  }));
  for (const id of sessions) {
    try { await clerk.sessions.revokeSession(id); }
    catch { process.exitCode = 1; console.error("Temporary test session revocation failed; details suppressed."); }
  }
  console.log("Smoke subscription and temporary session cleanup attempted.");
}
