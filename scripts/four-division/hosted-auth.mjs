// Short-lived real Clerk Development sessions, held in memory and revoked after hosted UAT.
// This module never writes cookies, storage state, credentials or token-bearing URLs.
import assert from "node:assert/strict";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import {
  loadFixtureEnvironment,
  validateRuntimeGuards,
  validateClerkFixtureUser,
  assertClerkDevelopmentInstance,
} from "../lib/staging-synthetic-uat.mjs";

export async function createHostedAuth({ environmentDirectory, origin }) {
  assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  const environment = await loadFixtureEnvironment({ rootDir: environmentDirectory, processEnv: {} });
  const base = validateRuntimeGuards(environment, "TestMain1");
  await assertClerkDevelopmentInstance(base);
  const clerk = createClerkClient({ secretKey: base.clerkSecretKey });
  const admin = createClient(base.supabaseUrl, base.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const sessions = new Set();
  const tickets = new Set();
  const participantClients = new Set();

  async function fixture(alias) {
    const config = validateRuntimeGuards(environment, alias);
    const result = await admin.rpc("inspect_staging_synthetic_uat_player", {
      p_fixture_secret: config.fixtureSecret,
      p_alias: alias,
    });
    assert(!result.error && Array.isArray(result.data) && result.data.length === 1, "Permanent synthetic registry proof failed");
    const registry = result.data[0];
    const playerResult = await admin.from("players")
      .select("id,clerk_user_id,in_game_name,steam_id64,profile_completed")
      .eq("id", registry.player_id).single();
    assert(!playerResult.error && playerResult.data?.in_game_name === alias, "Synthetic player proof failed");
    const player = playerResult.data;
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(player.clerk_user_id)}`, {
      headers: { Authorization: `Bearer ${config.clerkSecretKey}` }, signal: AbortSignal.timeout(20_000),
    });
    assert(response.ok, "Clerk Development identity lookup failed");
    const raw = await response.json();
    validateClerkFixtureUser(raw, config);
    assert.equal(raw.id, player.clerk_user_id, "Registry identity does not match Clerk");
    return { alias, playerId: player.id, userId: raw.id, steamId64: player.steam_id64, profileCompleted: player.profile_completed };
  }

  async function existingAdmin(userId, selectedName) {
    if (!userId) {
      const candidates = [];
      let offset = 0;
      while (true) {
        const batch = await clerk.users.getUserList({ limit: 100, offset });
        candidates.push(...batch.data.filter((user) => user.publicMetadata?.role === "admin" && !user.banned && !user.locked &&
          !user.privateMetadata?.ironclad_fixture_alias && !user.privateMetadata?.ironclad_fixture_source &&
          (!selectedName || [user.firstName, user.lastName].filter(Boolean).join(" ") === selectedName)));
        offset += batch.data.length;
        if (offset >= batch.totalCount || batch.data.length === 0) break;
      }
      assert.equal(candidates.length, 1, "Development administrator is not unique; an existing identity must be selected explicitly");
      userId = candidates[0].id;
    }
    assert.match(userId, /^user_[A-Za-z0-9]+$/);
    const user = await clerk.users.getUser(userId);
    assert(user.publicMetadata?.role === "admin" && !user.banned && !user.locked, "Existing Development administrator proof failed");
    assert(!user.privateMetadata?.ironclad_fixture_alias && !user.privateMetadata?.ironclad_fixture_source, "Permanent fixtures must never be administrators");
    return { userId: user.id, alias: "existing-development-admin" };
  }

  async function signIn(page, identity) {
    const ticket = await clerk.signInTokens.createSignInToken({ userId: identity.userId, expiresInSeconds: 60 });
    tickets.add(ticket.id);
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.Clerk?.loaded && window.Clerk?.client?.signIn, undefined, { timeout: 30_000 });
    const signIn = await page.evaluate(async (token) => {
      const result = await window.Clerk.client.signIn.create({ strategy: "ticket", ticket: token });
      return { status: result.status, sessionId: result.createdSessionId };
    }, ticket.token);
    assert.equal(signIn.status, "complete", "Clerk Development sign-in was not complete");
    assert.equal(typeof signIn.sessionId, "string", "Clerk Development did not create a session");
    sessions.add(signIn.sessionId);
    await page.evaluate(async (session) => { await window.Clerk.setActive({ session }); }, signIn.sessionId);
    await page.waitForFunction(() => Boolean(window.Clerk?.session?.id));
    return identity;
  }

  async function close() {
    for (const client of participantClients) {
      await client.removeAllChannels();
      await client.realtime.disconnect();
    }
    let revoked = 0;
    for (const session of sessions) {
      try { await clerk.sessions.revokeSession(session); revoked += 1; }
      catch { /* Only a count is reported below; provider errors can contain identifiers. */ }
    }
    for (const ticket of tickets) {
      try { await clerk.signInTokens.revokeSignInToken(ticket); }
      catch { /* A consumed one-use ticket is already inactive. */ }
    }
    await admin.removeAllChannels();
    assert.equal(revoked, sessions.size, "A temporary Development session could not be revoked");
    return { temporarySessionsCreated: sessions.size, temporarySessionsRevoked: revoked };
  }

  function clientForPage(page) {
    const key = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert(key, "Staging public client key is missing");
    const client = createClient(base.supabaseUrl, key, {
      accessToken: () => page.evaluate(async () => window.Clerk.session.getToken()),
      auth: { persistSession: false, autoRefreshToken: false },
    });
    participantClients.add(client);
    return client;
  }

  return { fixture, existingAdmin, signIn, close, admin, clientForPage };
}
