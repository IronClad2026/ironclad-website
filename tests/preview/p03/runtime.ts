import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  loadFixtureEnvironment, validateRuntimeGuards, validateClerkFixtureUser, parseDotEnv,
} from "../../../scripts/lib/staging-synthetic-uat.mjs";
import { loadTarget, stagingRef } from "./target";
import { parseFixtureReceipt } from "./fixture";
import { verifyReceiptScope } from "./receipt-scope";
import { validateDedicatedAdmin } from "../../../scripts/p03-preview/create-fixture.mjs";

const fixtureReceipt = process.env.P03_FIXTURE_FILE
  ? parseFixtureReceipt(JSON.parse(readFileSync(resolve(process.env.P03_FIXTURE_FILE), "utf8"))) : null;
export const fixture = fixtureReceipt ?? {
  tournamentId: "b1230000-2026-4908-8000-000000001101",
  currentMatchId: "528069ef-3ba1-4451-a5ac-c54d6b8b5d62",
  completedTournamentId: "38235d4b-eba7-4ff8-9ee4-11ba085fa5de",
  completedMatchId: "96c9d208-9d73-43e7-9d39-6e0500994b7c",
  firstAlias: "TestChallenge1",
  secondAlias: "TestChallenge3",
};
export const contexts = new Set<BrowserContext>();
let validationPhase = "preflight";
export const getValidationPhase = () => validationPhase;
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const safeStates = new Map<string, Record<string, unknown>>();
let previewAccessState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
let environmentPromise: Promise<Record<string, string | undefined>> | undefined;

async function environment() {
  environmentPromise ??= loadFixtureEnvironment({
    rootDir: process.env.P03_STAGING_ENV_DIR ?? resolve("../ironclad-website"),
    processEnv: { NODE_ENV: "test" },
  });
  return environmentPromise;
}

export async function stagingRead(table: string, query: string) {
  if (!["tournaments", "tournament_brackets", "tournament_matches", "generated_brackets", "registrations", "match_rooms", "match_messages", "match_room_reads", "match_room_assistance", "legal_documents", "platform_settings"].includes(table)) {
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
  if (fixtureReceipt) await verifyReceiptScope(fixtureReceipt, stagingRead);
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
  if (fixtureReceipt) {
    for (const id of [fixtureReceipt.completedMatchId, fixtureReceipt.onePlayerMatchId, fixtureReceipt.emptyFinalMatchId]) {
      if (!safeStates.has(id)) safeStates.set(id, await matchFacts(id));
    }
  }
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
  const candidate = matches.find((row) => (!fixtureReceipt || row.id === fixtureReceipt.onePlayerMatchId) &&
    Number(Boolean(row.player_one_registration_id)) + Number(Boolean(row.player_two_registration_id)) === 1);
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

export async function verifyPreviewReachability(browser: Browser) {
  const target = loadTarget();
  if (process.env.P03_PREVIEW_ACCESS_URL_FILE && !previewAccessState) {
    const access = JSON.parse(await readFile(resolve(process.env.P03_PREVIEW_ACCESS_URL_FILE), "utf8"));
    const url = new URL(access.url);
    const issued = Date.parse(access.issuedAt);
    const expires = Date.parse(access.expiresAt);
    if (access.previewUrl !== target.previewUrl || url.origin !== target.previewUrl ||
      url.pathname !== "/" || url.username || url.password || url.hash ||
      [...url.searchParams.keys()].some((key) => key !== "_vercel_share") ||
      !url.searchParams.get("_vercel_share") || !Number.isFinite(issued) || !Number.isFinite(expires) ||
      issued > Date.now() || expires <= Date.now() || expires - issued > 23 * 60 * 60 * 1000 + 1000) {
      throw new Error("BLOCKED: temporary Preview access does not match this deployment or has expired.");
    }
    const bootstrap = await browser.newContext();
    try {
      let destination = url.toString();
      let reached = false;
      for (let redirect = 0; redirect < 5; redirect++) {
        const response = await bootstrap.request.get(destination, { maxRedirects: 0, timeout: 15_000 });
        const next = response.headers().location;
        if (next && response.status() >= 300 && response.status() < 400) {
          const nextUrl = new URL(next, target.previewUrl);
          if (nextUrl.origin !== target.previewUrl) throw new Error("Temporary Preview access was rejected.");
          destination = nextUrl.toString();
          continue;
        }
        reached = response.ok();
        break;
      }
      if (!reached) throw new Error("Temporary Preview access was rejected.");
      const state = await bootstrap.storageState();
      if (!state.cookies.length || state.cookies.some((cookie) => cookie.domain.replace(/^\./, "") !== new URL(target.previewUrl).hostname)) {
        throw new Error("Temporary Preview access cookie scope is invalid.");
      }
      previewAccessState = state;
    } catch {
      throw new Error("BLOCKED: temporary exact-Preview access could not establish a protected browser session.");
    } finally { await bootstrap.close(); }
  }
  if (previewAccessState) return;
  const bypass = process.env.P03_VERCEL_BYPASS_SECRET;
  const response = await fetch(target.previewUrl + "/sign-in", {
    redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
  });
  const location = response.headers.get("location");
  const redirected = location ? new URL(location, target.previewUrl) : null;
  if ([401, 403].includes(response.status) || (redirected && redirected.origin !== target.previewUrl)) {
    throw new Error("BLOCKED: Vercel Preview protection prevents reaching Clerk; supply an approved Preview-only automation bypass.");
  }
  if (response.status >= 400) throw new Error("The candidate Preview sign-in route is unavailable.");
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
  validationPhase = "Clerk test identity lookup";
  const usersResponse = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${config.clerkSecretKey}` }, signal: AbortSignal.timeout(20_000),
  });
  if (!usersResponse.ok) throw new Error("Clerk test identity lookup failed.");
  const users = await usersResponse.json();
  if (!Array.isArray(users) || users.length !== 1) throw new Error("Clerk test identity is ambiguous.");
  const user = users[0];
  if (alias === "admin") {
    validateDedicatedAdmin(user, email);
  } else validateClerkFixtureUser(user, config);
  const clerkHost = Buffer.from(config.clerkPublishableKey.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "");
  if (!clerkHost.endsWith(".clerk.accounts.dev")) throw new Error("Unexpected Clerk Development frontend host.");
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: "en-US", storageState: sessions.get(alias) ?? previewAccessState });
  contexts.add(context);
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(25_000);
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
    validationPhase = "Preview sign-in navigation";
    await page.goto(`${target.previewUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    const identifier = page.locator('input[name="identifier"], input[type="email"]').first();
    validationPhase = "Clerk identifier form";
    await identifier.fill(email);
    const passwordField = page.locator('input[type="password"]').first();
    if (!(await passwordField.isVisible())) await page.getByRole("button", { name: /^continue$/i }).click();
    validationPhase = "Clerk password form";
    await passwordField.fill(password);
    await page.getByRole("button", { name: /^continue$|^sign in$/i }).last().click();
    validationPhase = "Clerk authenticated session";
    await page.waitForFunction(() => {
      const signedIn = Boolean((window as Window & {Clerk?: {user?: {id?: string}}}).Clerk?.user?.id);
      const otp = document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
      return signedIn || Boolean(otp && otp.getClientRects().length);
    }, undefined, { timeout: 10_000 }).catch(() => {});
    const otpFields = page.locator('input[autocomplete="one-time-code"]:visible');
    const otp = otpFields.first();
    if (await otp.isVisible()) {
      validationPhase = "Clerk Development test verification code";
      // The field can mount before Clerk finishes preparing Device Trust.
      await page.waitForFunction(() => {
        const signIn = (window as Window & {Clerk?: {client?: {signIn?: {secondFactorVerification?: {status?: string;strategy?: string}}}}}).Clerk?.client?.signIn;
        return signIn?.secondFactorVerification?.strategy === "email_code" && signIn.secondFactorVerification.status === "unverified";
      }, undefined, { timeout: 15_000 });
      // Clerk's documented reserved test-email flow sends no OTP email.
      const count = await otpFields.count();
      const maxLength = await otp.getAttribute("maxlength");

      if (count === 6 && maxLength === "1") {
        for (const [index, digit] of [..."424242"].entries()) await otpFields.nth(index).fill(digit);
      } else {
        await otp.fill("");
        await otp.pressSequentially("424242");
      }
      const verify = page.getByRole("button", { name: /^(continue|verify)$/i }).last();
      if (await otp.isVisible() && await verify.isVisible() && await verify.isEnabled()) await verify.click();
    }
    await page.waitForFunction(() => Boolean((window as Window & {Clerk?: {user?: {id?: string}}}).Clerk?.user?.id)).catch(async () => {
      const signals = await page.evaluate(() => {
        const clerk = (window as Window & {Clerk?: {client?: {signIn?: {status?: string}}}}).Clerk;
        const status = clerk?.client?.signIn?.status;
        const allowed = ["complete", "needs_identifier", "needs_first_factor", "needs_second_factor"];
        const code = document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
        const text = document.body.innerText;
        return {status: status && allowed.includes(status) ? status : "unavailable", codeVisible: Boolean(code?.getClientRects().length), codeLength: code?.value.length ?? 0,
          incorrectCode: /incorrect code|invalid code|code is incorrect|code is invalid/i.test(text),
          verifyButton: [...document.querySelectorAll("button")].some((button) => /^(continue|verify)$/i.test(button.innerText.trim()) && !button.disabled),
          botPrompt: /unusual traffic|verify you are human|verification failed/i.test(text)};
      });
      throw new Error("BLOCKED: Clerk test verification did not complete: " + JSON.stringify(signals));
    });
    validationPhase = "Clerk session identity validation";
    const verified = await page.evaluate(async () => {
      const clerk = (window as Window & {Clerk?: {
        user?: {id?: string;publicMetadata?: {role?: string}};
        session?: {getToken: () => Promise<string | null>};
      }}).Clerk;
      const token = await clerk?.session?.getToken();
      const payload = token ? JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) : {};
      return { id: clerk?.user?.id, role: clerk?.user?.publicMetadata?.role, claimRole: payload.metadata?.role };
    });
    if (verified.id !== user.id || (alias === "admin" && (verified.role !== "admin" || verified.claimRole !== "admin"))) throw new Error("The browser authenticated the wrong test identity.");
    sessions.set(alias, await context.storageState());
    validationPhase = "authenticated Preview application";
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
