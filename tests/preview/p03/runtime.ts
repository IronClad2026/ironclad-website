import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  loadFixtureEnvironment, validateRuntimeGuards, validateClerkFixtureUser, parseDotEnv,
} from "../../../scripts/lib/staging-synthetic-uat.mjs";
import { loadTarget, stagingRef } from "./target";

export const fixture = {
  tournamentId: "b1230000-2026-4908-8000-000000001101",
  currentMatchId: "528069ef-3ba1-4451-a5ac-c54d6b8b5d62",
  completedTournamentId: "38235d4b-eba7-4ff8-9ee4-11ba085fa5de",
  completedMatchId: "96c9d208-9d73-43e7-9d39-6e0500994b7c",
  firstAlias: "TestChallenge1",
  secondAlias: "TestChallenge3",
};
export const contexts = new Set<BrowserContext>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const safeStates = new Map<string, Record<string, unknown>>();
let environmentPromise: Promise<Record<string, string | undefined>> | undefined;

async function environment() {
  environmentPromise ??= loadFixtureEnvironment({
    rootDir: process.env.P03_STAGING_ENV_DIR ?? resolve("../ironclad-website"),
    processEnv: { NODE_ENV: "test" },
  });
  return environmentPromise;
}

export async function stagingRead(table: string, query: string) {
  if (!["tournament_matches", "generated_brackets", "registrations", "match_rooms", "match_messages", "match_room_reads", "match_room_assistance", "legal_documents", "platform_settings"].includes(table)) {
    throw new Error("Hosted validation table is outside the bounded read scope.");
  }
  const env = await environment();
  const config = validateRuntimeGuards(env, fixture.firstAlias);
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Bounded Staging read failed.");
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.length > 50) throw new Error("Bounded Staging response is invalid.");
  return value as Record<string, unknown>[];
}

export async function matchFacts(matchId: string) {
  if (!/^[a-f0-9-]{36}$/.test(matchId)) throw new Error("Invalid fixture match identity.");
  const rows = await stagingRead("tournament_matches", `id=eq.${matchId}&select=id,generated_bracket_id,status,player_one_registration_id,player_two_registration_id,player_one_score,player_two_score,winner_registration_id,activated_at,activation_version,communication_generation,deadline_at,hold_started_at,hold_released_at,official_result_submission_id&limit=1`);
  if (rows.length !== 1) throw new Error("Fixture match is unavailable.");
  return rows[0];
}

export async function verifyPairing() {
  const env = await environment();
  const identities: string[] = [];
  for (const alias of [fixture.firstAlias, fixture.secondAlias]) {
    const config = validateRuntimeGuards(env, alias);
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/inspect_staging_synthetic_uat_player`, {
      method: "POST", headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_fixture_secret: config.fixtureSecret, p_alias: alias }), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Reserved fixture provenance cannot be verified.");
    const values = await response.json();
    if (values.length !== 1 || values[0].alias !== alias || values[0].provenance !== "staging_synthetic_uat") {
      throw new Error("Reserved fixture provenance mismatch.");
    }
    identities.push(values[0].player_id);
  }
  const facts = await matchFacts(fixture.currentMatchId);
  const registrations = await stagingRead("registrations", `id=in.(${facts.player_one_registration_id},${facts.player_two_registration_id})&select=id,profile_id,tournament_id,registration_provenance&limit=2`);
  if (registrations.length !== 2 || registrations.some((row) => row.tournament_id !== fixture.tournamentId || row.registration_provenance !== "staging_synthetic_uat" || !identities.includes(String(row.profile_id)))) {
    throw new Error("Current pairing is no longer the reserved synthetic fixture.");
  }
  if (!safeStates.has(fixture.currentMatchId)) safeStates.set(fixture.currentMatchId, facts);
  return facts;
}

export async function verifyCompetitionUnchanged() {
  for (const [id, before] of safeStates) {
    if (JSON.stringify(await matchFacts(id)) !== JSON.stringify(before)) {
      throw new Error("Competition facts changed during hosted validation; STOP.");
    }
  }
}

export async function findOnePlayerFixture() {
  const facts = await verifyPairing();
  const matches = await stagingRead("tournament_matches", `generated_bracket_id=eq.${facts.generated_bracket_id}&select=id,player_one_registration_id,player_two_registration_id,status&limit=50`);
  const candidate = matches.find((row) => Number(Boolean(row.player_one_registration_id)) + Number(Boolean(row.player_two_registration_id)) === 1);
  if (!candidate) throw new Error("BLOCKED: approved fixture has no one-player/TBD match; zero-player matches do not satisfy this case.");
  const id = String(candidate.id);
  if (!safeStates.has(id)) safeStates.set(id, await matchFacts(id));
  return id;
}

export async function verifyLegalOrigins() {
  const documents = await stagingRead("legal_documents", "status=eq.effective&select=document_kind,immutable_url&limit=10");
  const approved = new Set([
    "https://ironclad-website-o0575x5sw-ironclad-tournaments.vercel.app",
    "https://ironclad-website-8qjupto5h-ironclad-tournaments.vercel.app",
    "https://ironclad-website-jlu0oxb49-ironclad-tournaments.vercel.app",
  ]);
  if (documents.length !== 4 || documents.some((row) => !approved.has(new URL(String(row.immutable_url)).origin))) {
    throw new Error("The Staging legal register changed; verify Preview trusted origins again.");
  }
}

export async function createViewer(browser: Browser, alias: string, width = 1280) {
  const target = loadTarget();
  const env = await environment();
  const config = validateRuntimeGuards(env, alias === "admin" ? fixture.firstAlias : alias);
  let email = config.email;
  let password = config.password;
  if (alias === "admin") {
    if (!process.env.P03_ADMIN_CREDENTIALS_FILE) throw new Error("BLOCKED: no verified Staging admin test identity is available.");
    const credentials = parseDotEnv(await readFile(resolve(process.env.P03_ADMIN_CREDENTIALS_FILE), "utf8")) as Record<string, string>;
    email = credentials.P03_ADMIN_EMAIL;
    password = credentials.P03_ADMIN_PASSWORD;
    if (!email || !password || !email.includes("+clerk_test")) throw new Error("Admin credentials must identify an approved Clerk test account.");
  }
  const usersResponse = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${config.clerkSecretKey}` }, signal: AbortSignal.timeout(20_000),
  });
  if (!usersResponse.ok) throw new Error("Clerk test identity lookup failed.");
  const users = await usersResponse.json();
  if (!Array.isArray(users) || users.length !== 1) throw new Error("Clerk test identity is ambiguous.");
  const user = users[0];
  if (alias === "admin") {
    if (user.public_metadata?.role !== "admin" || user.banned || user.locked || !user.email_addresses?.some((item: {email_address: string}) => item.email_address === email)) {
      throw new Error("The supplied test identity is not an active authorized administrator.");
    }
  } else validateClerkFixtureUser(user, config);
  const clerkHost = Buffer.from(config.clerkPublishableKey.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "");
  if (!clerkHost.endsWith(".clerk.accounts.dev")) throw new Error("Unexpected Clerk Development frontend host.");
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: "en-US", storageState: sessions.get(alias) });
  contexts.add(context);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const localPreview = url.origin === target.previewUrl;
    const auth = url.hostname === clerkHost;
    const publicAsset = request.method() === "GET" && ["cdn.jsdelivr.net", "challenges.cloudflare.com"].includes(url.hostname);
    const staging = request.method() === "GET" && url.hostname === `${stagingRef}.supabase.co`;
    if (url.protocol !== "https:" || !(localPreview || auth || publicAsset || staging)) return route.abort();
    const bypass = process.env.P03_VERCEL_BYPASS_SECRET;
    if (localPreview && bypass) return route.continue({ headers: { ...request.headers(), "x-vercel-protection-bypass": bypass } });
    return route.continue();
  });
  const page = await context.newPage();
  if (!sessions.has(alias)) {
    await page.goto(`${target.previewUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    const identifier = page.locator('input[name="identifier"], input[type="email"]').first();
    await identifier.fill(email);
    const passwordField = page.locator('input[type="password"]').first();
    if (!(await passwordField.isVisible())) await page.getByRole("button", { name: /^continue$/i }).click();
    await passwordField.fill(password);
    await page.getByRole("button", { name: /^continue$|^sign in$/i }).last().click();
    await page.waitForFunction(() => Boolean((window as Window & {Clerk?: {user?: {id?: string}}}).Clerk?.user?.id));
    const verified = await page.evaluate(() => {
      const clerk = (window as Window & {Clerk?: {user?: {id?: string;publicMetadata?: {role?: string}}}}).Clerk;
      return { id: clerk?.user?.id, role: clerk?.user?.publicMetadata?.role };
    });
    if (verified.id !== user.id || (alias === "admin" && verified.role !== "admin")) throw new Error("The browser authenticated the wrong test identity.");
    sessions.set(alias, await context.storageState());
  }
  return page;
}

export function bracketPath(matchId?: string, tournamentId = fixture.tournamentId) {
  return `/tournaments?tournament=${tournamentId}&tab=brackets${matchId ? `&match=${matchId}` : ""}`;
}
export async function gotoBracket(page: Page, matchId?: string, tournamentId = fixture.tournamentId) {
  await page.goto(`${loadTarget().previewUrl}${bracketPath(matchId, tournamentId)}`, { waitUntil: "domcontentloaded" });
}
export async function closeViewers() {
  await Promise.all([...contexts].map((context) => context.close().catch(() => {})));
  contexts.clear();
}
