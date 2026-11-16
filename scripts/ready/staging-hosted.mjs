// Read-only acceptance of an exact Staging deployment. Run in 'vercel env run'
// for this project, which supplies the short-lived trusted-sources token in memory.
// Optional Chromium contexts prevent app writes other than the Ready answer request.
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import {
  assertClerkDevelopmentInstance,
  loadFixtureEnvironment,
  validateClerkFixtureUser,
  validateRuntimeGuards,
} from "../lib/staging-synthetic-uat.mjs";

const run = promisify(execFile);
const websiteProject = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const envRoot = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const stagingBackend = "https://zzbnneprhjicmajpjkdg.supabase.co";
const clerkIssuer = "https://guided-goshawk-34.clerk.accounts.dev";
const protectedHeader = "x-vercel-trusted-oidc-idp-token";
const appVersion = "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.2.pdf";
const ticketUrl = "https://discord.com/channels/1440092095619662105/1440201093110960137";
const fixtureA = { eventSlug: "patch3-staging-assistance-20261103-v1-a", matchId: "5131a673-4df4-4530-8f35-969997e2a5ec" };
const fixtureB = { eventSlug: "patch3-staging-assistance-20261103-v1-b", matchId: "5ad14749-7fbf-4811-bfaa-4e4a892aed9e" };
const report = { checks: [], timings: [], browser: [], temporarySessionsCreated: 0, temporarySessionsRevoked: 0 };
const sessions = [];
let clerk;
let step = "arguments";
let failed = false;

function verify(condition, label) {
  step = label;
  if (!condition) throw new Error("CHECK_FAILED");
  report.checks.push(label);
}

function claims(token) {
  if (typeof token !== "string" || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error("TOKEN_SHAPE");
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

function args(tokens) {
  const options = {};
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    if (key === "--headed" && !options.headed) {
      options.headed = true;
    } else if (["--url", "--deployment", "--commit", "--vercel-cli"].includes(key) && !options[key] && tokens[i + 1] && !tokens[i + 1].startsWith("--")) {
      options[key] = tokens[++i];
    } else {
      throw new Error("ARGUMENTS");
    }
  }
  verify(typeof options["--url"] === "string" && /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app\/?$/.test(options["--url"]), "immutable website Preview URL");
  verify(/^dpl_[A-Za-z0-9]+$/.test(options["--deployment"] ?? "") &&
    /^[a-f0-9]{40}$/.test(options["--commit"] ?? "") && /[\\/]vc\.js$/.test(options["--vercel-cli"] ?? ""), "exact deployment metadata arguments");
  return options;
}

function data(result, label) {
  verify(!result.error && result.data != null, label);
  return result.data;
}

async function verifyDeployment(options, origin) {
  step = "verify exact deployed commit in Vercel";
  const { stdout } = await run(process.execPath, [
    resolve(options["--vercel-cli"]), "api", `/v13/deployments/${options["--deployment"]}`,
    "--method", "GET", "--scope", "ironclad-tournaments",
  ], { timeout: 15_000, windowsHide: true, maxBuffer: 512_000 });
  const deploy = JSON.parse(stdout);
  verify(deploy.projectId === websiteProject && deploy.readyState === "READY" && deploy.target !== "production" &&
    deploy.url === new URL(origin).hostname &&
    (deploy.meta?.githubCommitRef ?? deploy.meta?.gitCommitRef ?? deploy.gitSource?.ref) === "staging" &&
    (deploy.meta?.githubCommitSha ?? deploy.meta?.gitCommitSha ?? deploy.gitSource?.sha) === options["--commit"],
  "verified exact READY Staging commit on the website project");
}

async function loadActor(admin, environment, alias) {
  step = "guarded fixture identity";
  const config = validateRuntimeGuards(environment, alias);
  const matches = data(await admin.rpc("inspect_staging_synthetic_uat_player", {
    p_alias: alias, p_fixture_secret: config.fixtureSecret,
  }), "read approved fixture registry");
  verify(matches.length === 1, "fixture registry has one synthetic identity");
  const profile = data(await admin.from("players").select("clerk_user_id,in_game_name,profile_completed,account_closed_at")
    .eq("id", matches[0].player_id).single(), "read verified synthetic profile");
  verify(profile.in_game_name === alias && profile.profile_completed === true && profile.account_closed_at === null, "synthetic player profile is active");
  const identityResponse = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(profile.clerk_user_id)}`, {
    headers: { authorization: `Bearer ${config.clerkSecretKey}` },
    redirect: "error", signal: AbortSignal.timeout(12_000),
  });
  verify(identityResponse.ok, "read guarded Clerk Development identity");
  const raw = await identityResponse.json();
  validateClerkFixtureUser(raw, config);
  verify(raw.id === profile.clerk_user_id, "verified Clerk and Staging profile identity pair");
  step = "create temporary fixture session";
  const session = await clerk.sessions.createSession({ userId: raw.id });
  sessions.push(session.id);
  report.temporarySessionsCreated++;
  let current;
  let expires = 0;
  return async () => {
    if (current && expires > Date.now() + 15_000) return current;
    const token = (await clerk.sessions.getToken(session.id)).jwt;
    const identity = claims(token);
    verify(identity.sub === raw.id && identity.iss === clerkIssuer && identity.sid === session.id &&
      identity.metadata?.role !== "admin", "temporary Clerk Development player token");
    current = token;
    expires = identity.exp * 1000;
    return current;
  };
}

async function query(origin, oidc, actor, label, payload) {
  step = label;
  const headers = { [protectedHeader]: oidc, origin, "content-type": "application/json" };
  if (actor) headers.authorization = `Bearer ${await actor()}`;
  step = label;
  const started = performance.now();
  const response = await fetch(new URL("/api/ready", origin), {
    method: "POST", headers, body: JSON.stringify(payload), cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const bodyIsJson = response.headers.get("content-type")?.startsWith("application/json");
  const body = bodyIsJson ? await response.json() : null;
  const serverTime = response.headers.get("server-timing")?.match(/(?:^|,\s*)ready;dur=(\d+(?:\.\d+)?)/)?.[1];
  report.timings.push({
    case: label, status: response.status, wallMs: Math.round(performance.now() - started),
    serverMs: serverTime === undefined ? null : Number(serverTime),
    ...(response.status === 403 ? { rejection: /account requirements/.test(body?.text ?? "") ? "account-legal-gate"
      : /authorised Staging review/.test(body?.text ?? "") ? "review-account-gate"
      : /Open Ready from IronClad/.test(body?.text ?? "") ? "request-origin" : "other" } : {}),
  });
  verify(bodyIsJson && response.headers.get("cache-control")?.includes("no-store"), `${label} JSON with private cache control`);
  return [response.status, body];
}

async function answer(origin, oidc, actor, label, payload) {
  const [status, body] = await query(origin, oidc, actor, label, payload);
  verify(status === 200 && typeof body?.text === "string", `${label} answered`);
  return body;
}

async function readPage(origin, oidc, actor, href, label) {
  verify(typeof href === "string", `${label} has a destination`);
  const url = new URL(href, origin);
  verify(url.origin === origin, "page inspection remains on Staging");
  const headers = { [protectedHeader]: oidc };
  if (actor) headers.authorization = `Bearer ${await actor()}`;
  step = label;
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  verify(response.ok && response.headers.get("content-type")?.includes("text/html"), label);
  return response.text();
}

function matchDestination(reply, fixture, needsRoom = false) {
  return (reply.actions ?? []).some(({ href }) => {
    if (typeof href !== "string" || !href.startsWith("/tournaments?")) return false;
    const url = new URL(href, "https://invalid.example");
    return url.searchParams.get("tournament") === fixture.eventSlug &&
      url.searchParams.get("match") === fixture.matchId && url.searchParams.get("tab") === "brackets" &&
      (!needsRoom || /^[0-9a-f-]{36}$/i.test(url.searchParams.get("room") ?? ""));
  });
}

async function browserJourney(origin, oidc, actor) {
  step = "launch visible Chrome";
  const { chromium, expect } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const output = resolve("test-results", "ready-staging");
  await mkdir(output, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const journey = mobile ? "touch-emulated Ready journey" : "desktop Ready journey";
      step = journey;
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
        hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1,
      });
      let pauseAnswer = false;
      let releaseAnswer;
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) {
          return ["GET", "HEAD"].includes(request.method()) ? route.continue() : route.abort();
        }
        const readyQuery = url.pathname === "/api/ready" && request.method() === "POST";
        if (!["GET", "HEAD"].includes(request.method()) && !readyQuery) return route.abort();
        try {
          const headers = { ...request.headers(), [protectedHeader]: oidc };
          if (request.isNavigationRequest() || readyQuery || request.headers()["rsc"]) {
            headers.authorization = `Bearer ${await actor()}`;
          }
          // A cross-origin redirect receives no credentials from this request.
          const response = await route.fetch({ headers, maxRedirects: 0 });
          if (readyQuery && pauseAnswer) await new Promise((done) => { releaseAnswer = done; });
          await route.fulfill({ response });
        } catch {
          await route.abort().catch(() => undefined);
        }
      });
      try {
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        step = `${journey} mount`;
        const dock = page.locator("[data-ready-dock]:visible");
        await expect(dock).toBeVisible({ timeout: 15_000 });
        if (mobile) await dock.tap();
        else await dock.click();
        await expect(page.locator("[data-mode='floating'][data-asset-status='ready']")).toHaveCount(1, { timeout: 15_000 });
        const input = page.getByRole("textbox", { name: "Ask about IronClad" });
        await input.fill("How does a genuine disconnect work?");
        if (mobile) await page.setViewportSize({ width: 390, height: 580 });
        step = `${journey} answer`;
        await page.getByRole("button", { name: "Send question" }).click();
        const message = page.locator("[data-mascot-message]");
        await expect(message).toContainText("10:00", { timeout: 15_000 });
        const showFull = page.getByRole("button", { name: "Show full message" });
        if (await showFull.isVisible()) await showFull.click();
        const source = page.getByRole("link", { name: /Official Tournament Rulebook v3\.2/ });
        await expect(source).toHaveAttribute("href", `${appVersion}#page=9`);
        if (mobile) await page.setViewportSize({ width: 390, height: 780 });
        await page.screenshot({ path: resolve(output, mobile ? "ready-narrow.png" : "ready-desktop.png") });
        const target = new URL(await source.getAttribute("href"), origin);
        verify(target.origin === origin, "browser report source is within the guarded Staging origin");
        const document = await context.request.get(target.href, {
          headers: { [protectedHeader]: oidc, authorization: `Bearer ${await actor()}` }, maxRedirects: 0,
        });
        verify(document.ok() && document.headers()["content-type"]?.includes("application/pdf"), "browser verifies citation destination");
        step = `${journey} opens citation`;
        const sourceWindow = page.waitForEvent("popup");
        await source.click();
        const citation = await sourceWindow;
        await expect(citation).toHaveURL(target.href);
        await citation.close();
        const close = page.getByRole("button", { name: "Dock assistant" });
        step = `${journey} dock and reopen`;
        if (!mobile) await page.locator("[data-mascot-drag]").hover();
        await close.click();
        await expect(page.locator("[data-mode='dock'][data-asset-status='ready']")).toHaveCount(1);
        await dock.click();
        await expect(input).toBeVisible();
        if (!mobile) {
          step = "expired response after docking";
          pauseAnswer = true;
          await input.fill("Are there prize terms?");
          await page.getByRole("button", { name: "Send question" }).click();
          await expect(message).toContainText("Thinking…");
          await expect.poll(() => typeof releaseAnswer, { timeout: 12_000 }).toBe("function");
          await page.locator("[data-mascot-drag]").hover();
          await close.click();
          await expect(page.locator("[data-mode='dock']")).toHaveCount(1);
          pauseAnswer = false;
          releaseAnswer?.();
          await dock.click();
          await expect(input).toBeVisible();
          await expect(message).toContainText("10:00");
          report.browser.push("desktop in-flight answer canceled on docking");
        }
        report.browser.push(mobile ? "visible Chrome touch emulation, text entry and viewport resize" : "visible Chrome desktop");
      } finally {
        pauseAnswer = false;
        releaseAnswer?.();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

try {
  const options = args(process.argv.slice(2));
  const origin = new URL(options["--url"]).origin;
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  step = "short-lived trusted-sources access";
  verify(claims(oidc).exp * 1000 > Date.now(), "unexpired OIDC token available in memory");
  await verifyDeployment(options, origin);

  const [anonymous, publicReply] = await query(origin, oidc, null, "anonymous gate", { question: "Open my match" });
  verify(anonymous === 403 && publicReply.actions?.some(({ href }) => href === "/rules"), "anonymous API access denied with rules available");

  step = "approved staging credentials";
  const environment = await loadFixtureEnvironment({ rootDir: envRoot, processEnv: {} });
  const base = validateRuntimeGuards(environment, "TestAcademy1");
  verify(base.supabaseUrl === stagingBackend, "exact Staging Supabase target");
  await assertClerkDevelopmentInstance(base);
  clerk = createClerkClient({ secretKey: base.clerkSecretKey });
  const admin = createClient(stagingBackend, base.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const a1 = await loadActor(admin, environment, "TestAcademy1");
  const a2 = await loadActor(admin, environment, "TestAcademy2");
  const a3 = await loadActor(admin, environment, "TestAcademy3");

  const [denied, denial] = await query(origin, oidc, a3, "out-of-review account", { question: "Open my match" });
  verify(denied === 403 && /authorised staging review/i.test(denial.text), "non-review account denied");
  const ordinaryRules = await readPage(origin, oidc, a3, "/rules", "ordinary Rules page loads for a non-review account");
  verify(!ordinaryRules.includes("data-ready-dock"), "Ready stays hidden while ordinary Rules remains available");
  const rules = await answer(origin, oidc, a1, "grounded disconnect", { question: "How does a genuine disconnect work?" });
  verify(/10:00/.test(rules.text) && rules.sources?.some(({ url, section }) =>
    url === `${appVersion}#page=9` && section.includes("10.1")), "answer cites rulebook disconnect section");
  const reference = await fetch(new URL(appVersion, origin), { headers: { [protectedHeader]: oidc },
    redirect: "error", signal: AbortSignal.timeout(15_000) });
  verify(reference.ok && reference.headers.get("content-type")?.includes("application/pdf"), "hosted citation is the approved PDF");
  await reference.body?.cancel();
  const format = await answer(origin, oidc, a1, "match format", { question: "Tell me the match format" });
  const final = await answer(origin, oidc, a1, "bounded follow-up", { question: "What about the final?", context: format.context });
  verify(/grand final is best-of-five/.test(final.text), "follow-up uses tournament format context");
  const noMatch = await answer(origin, oidc, a1, "no active fixture", { question: "Open my match" });
  verify(/no active match assigned/.test(noMatch.text), "no active match reported honestly");
  const multiple = await answer(origin, oidc, a1, "multiple historical matches", { question: "Show my previous match" });
  verify(/more than one match/.test(multiple.text) &&
    new Set(multiple.actions?.map(({ context }) => context?.matchId).filter(Boolean)).size > 1, "multiple owned matches offer a choice");
  const own = await answer(origin, oidc, a1, "own earlier match room", { question: "Open the chat with my opponent", context: fixtureA });
  verify(/read-only/.test(own.text) && matchDestination(own, fixtureA, true), "owned closed room links to verified read-only workspace");
  const earlierRoomUrl = own.actions.find(({ href }) => href?.startsWith("/tournaments?") && href.includes("&room="))?.href;
  await readPage(origin, oidc, a1, earlierRoomUrl, "live existing Match Room destination resolves");
  const support = await answer(origin, oidc, a1, "owned support links", { question: "I need an admin", context: fixtureA });
  verify(support.actions?.some(({ href }) => href === ticketUrl) && support.actions?.some(({ href }) => href?.startsWith("/assistance/")) &&
    support.actions?.some(({ copyText }) => copyText?.includes(fixtureA.matchId)), "verified Discord destination, in-site support and copyable reference");
  const assistanceHref = support.actions.find(({ href }) => href?.startsWith("/assistance/"))?.href;
  await readPage(origin, oidc, a1, assistanceHref, "live in-site Admin Assistance destination resolves");
  const historic = await answer(origin, oidc, a1, "historical accepted rules", {
    question: "How are divisions determined?", context: { eventSlug: "test-2-2" },
  });
  verify(/Main \/ Pro.*1400/.test(historic.text) && historic.sources?.some(({ url }) => url.includes("rulebook-v3.1.pdf")) &&
    !historic.sources?.some(({ url }) => url.includes("rulebook-v3.2.pdf")), "historical answer uses accepted v3.1 and combined division");
  const opponent = await answer(origin, oidc, a2, "owned opponent", { question: "Who am I playing?", context: fixtureA });
  verify(/TestAcademy1/.test(opponent.text) && matchDestination(opponent, fixtureA), "current session resolves its own recorded opponent");
  const foreign = await answer(origin, oidc, a2, "forged foreign match", { question: "Open the chat with my opponent", context: fixtureB });
  verify(/couldn.t find that match under your current account/.test(foreign.text) && !foreign.context?.matchId &&
    !foreign.actions?.some(({ href }) => href?.includes(fixtureB.matchId)), "foreign match context returns no private result or action");
  const unrelated = await answer(origin, oidc, a1, "unrelated prompt", { question: "What is the weather in Sydney?" });
  verify(/outside my orders/.test(unrelated.text) && !unrelated.sources?.length, "unrelated query stays outside Ready scope");
  if (options.headed) await browserJourney(origin, oidc, a2);
} catch {
  failed = true;
  report.blockedAt = step;
} finally {
  for (const id of sessions) {
    try {
      await clerk.sessions.revokeSession(id);
      report.temporarySessionsRevoked++;
    } catch {
      failed = true;
      report.sessionCleanupFailed = true;
    }
  }
  console.log(JSON.stringify({ result: failed ? "FAILED" : "PASS", ...report }, null, 2));
  if (failed) process.exitCode = 1;
}
