// Read-only acceptance of an exact Staging deployment. Run in 'vercel env run'
// for this project, which supplies the short-lived trusted-sources token in memory.
// Optional Chromium contexts allow Ready queries and scoped native fixture room reads.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import { browserActiveMatch, isActiveFixtureRead, readActiveFixtures, verifyActiveApi } from "./active-acceptance.mjs";
import { browserMenuJourney, browserMobileLayoutJourney, installRendererObservation, openQuickAction } from "./menu-journey.mjs";
import { browserUsageMenuJourney } from "./usage-menu-journey.mjs";
import { browserSuggestionsJourney } from "./suggestions-journey.mjs";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";
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
    if (["--headed", "--browser-only", "--navigation-only", "--menu-journey", "--mobile-layout-journey", "--usage-menu-journey", "--suggestions-journey"].includes(key) && !options[key]) {
      options[key] = true;
    } else if (["--url", "--deployment", "--commit", "--vercel-cli", "--active-fixture-manifest"].includes(key) && !options[key] && tokens[i + 1] && !tokens[i + 1].startsWith("--")) {
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
  const tokenForRequest = async () => {
    if (current && expires > Date.now() + 15_000) return current;
    const token = (await clerk.sessions.getToken(session.id)).jwt;
    const identity = claims(token);
    verify(identity.sub === raw.id && identity.iss === clerkIssuer && identity.sid === session.id &&
      identity.metadata?.role !== "admin", "temporary Clerk Development player token");
    current = token;
    expires = identity.exp * 1000;
    return current;
  };
  return Object.assign(tokenForRequest, { alias });
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
  const wallMs = Math.round(performance.now() - started);
  const serverMs = serverTime === undefined ? null : Number(serverTime);
  report.timings.push({
    case: label, status: response.status, wallMs, serverMs,
    ...(response.status === 403 ? { rejection: /account requirements/.test(body?.text ?? "") ? "account-legal-gate"
      : /This account can’t use Ready/.test(body?.text ?? "") ? "account-restricted"
      : /Open Ready from IronClad/.test(body?.text ?? "") ? "request-origin" : "other" } : {}),
  });
  verify(bodyIsJson && response.headers.get("cache-control")?.includes("no-store"), `${label} JSON with private cache control`);
  verify(response.headers.get("x-ready-ai-attempted") === "0", `${label} runs without AI`);
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

async function browserMatchNavigation(page, expect, origin) {
  const dock = page.locator("[data-ready-dock]:visible");
  const surface = page.locator("[data-mode][data-asset-status]");
  const dialog = page.getByRole("dialog");
  async function returnHome() {
    const event = new URL("/tournaments", origin);
    event.searchParams.set("tournament", fixtureA.eventSlug);
    event.searchParams.set("tab", "brackets");
    await page.goto(event.href, { waitUntil: "domcontentloaded" });
    await expect(surface).toHaveCount(1, { timeout: 15_000 });
    if (await surface.getAttribute("data-mode") === "dock") await dock.click();
    await openQuickAction(page, "Help", false);
  }
  async function ask(category, choice, text, action) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await page.getByRole("button", { name: choice, exact: true }).click();
    await expect(page.locator("[data-mascot-message]")).toContainText(text, { timeout: 15_000 });
    const skip = page.getByRole("button", { name: "Show full message" });
    if (await skip.isVisible()) await skip.click();
    const link = page.getByRole("link", { name: action, exact: true });
    await expect(link).toBeVisible();
    return { link, href: await link.getAttribute("href") };
  }
  async function clickMatch(answer, room) {
    verify(matchDestination({ actions: [answer] }, fixtureA, room), "Ready browser link matches the selected owned fixture");
    const target = new URL(answer.href, origin);
    await answer.link.click();
    await expect(page).toHaveURL(target.href, { timeout: 15_000 });
    await expect(dialog.getByText("Tournament Match History", { exact: true })).toBeVisible({ timeout: 15_000 });
    report.browser.push(room ? "clicked the owned earlier Match Room and reached the historical workspace"
      : "clicked the owned match and reached its historical workspace");
  }
  step = "desktop click through to owned match";
  await returnHome();
  await clickMatch(await ask("My match", "Deadline & match status", "Match status is", "Open my match"), false);
  await returnHome();
  step = "desktop click through to owned Match Room";
  await clickMatch(await ask("My match", "Open opponent chat", "read-only", "Open earlier Match Room"), true);
  await returnHome();
  step = "desktop click through to existing private Admin Assistance";
  const support = await ask("Contact an admin", "In-site Admin Assistance", "Discord support channel", "Open your Admin Assistance conversation");
  verify(/^\/assistance\/[a-f0-9-]{36}\?tournament=[a-f0-9-]{36}$/i.test(support.href ?? ""), "Ready browser assistance link is an existing in-site conversation");
  const target = new URL(support.href, origin);
  await support.link.click();
  await expect(page).toHaveURL(target.href, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Private assistance conversation" })).toBeVisible({ timeout: 15_000 });
  report.browser.push("clicked through to the existing in-site Admin Assistance page");
}

async function browserJourney(origin, oidc, actor, navigationOnly = false, active = null, menu = false, usage = false) {
  const mobileLayout = menu === "mobile-layout";
  const rendered = await readPage(origin, oidc, actor, "/", "authenticated Staging homepage resolves");
  verify(rendered.includes("data-ready-dock"), "authenticated home server-render includes Ready dock");
  step = "launch visible Chrome";
  const output = resolve("test-results", "ready-staging");
  const browserAssets = resolve(output, "playwright-assets");
  if (existsSync(browserAssets)) process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserAssets;
  const { chromium, expect } = await import("@playwright/test");
  const browserAuth = await createHostedAuth({ environmentDirectory: envRoot, origin });
  const identity = await browserAuth.fixture(actor.alias);
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  await mkdir(output, { recursive: true });
  try {
    for (const mobile of active ? [active.mobile] : mobileLayout ? [true] : navigationOnly || usage ? [false] : [false, true]) {
      const journey = mobile ? "touch-emulated Ready journey" : "desktop Ready journey";
      step = journey;
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
        hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1,
        ...((menu || usage) && !mobile ? { recordVideo: { dir: resolve(output, "ready-videos"), size: { width: 1280, height: 800 } } } : {}),
      });
      if (menu === true) await context.addInitScript(installRendererObservation);
      let signingIn = false;
      let pauseAnswer = false;
      let releaseAnswer;
      const traffic = { events: [], choices: [], replies: [], failCategory: false };
      if (usage) report.usageTraffic = traffic;
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) {
          const reading = ["GET", "HEAD"].includes(request.method());
          const clerkSession = url.origin === clerkIssuer && (signingIn ||
            /^\/v1\/client\/sessions\/sess_[a-z0-9]+\/tokens(?:\/|$)/i.test(url.pathname));
          return reading || clerkSession ? route.continue() : route.abort();
        }
        const readyQuery = url.pathname === "/api/ready" && request.method() === "POST";
        const readyAsset = url.pathname.startsWith("/mascot-v6/");
        const readyUsage = usage && url.pathname === "/api/ready/usage";
        const collect = readyUsage && request.method() === "POST" ? request.postDataJSON() : null;
        if (collect?.kind === "event" && traffic.failCategory && collect.event.type === "category_select") {
          traffic.events.push({ type: "category_select", status: 503 });
          return route.fulfill({ status: 503, json: { error: "unavailable" } });
        }
        const fixtureRead = active && isActiveFixtureRead(request, active.fixture, origin);
        if (active && request.method() === "POST" && url.pathname === "/tournaments") {
          let keys = [];
          try { keys = Object.keys(request.postDataJSON()?.[0] ?? {}).sort(); } catch { /* no diagnostic body */ }
          (report.fixtureRoomReads ??= []).push({
            scoped: url.searchParams.get("match") === active.fixture.matchId,
            keys, nextAction: !!request.headers()["next-action"], allowed: !!fixtureRead,
          });
        }
        if (!["GET", "HEAD"].includes(request.method()) && !readyQuery && !fixtureRead && !readyUsage) return route.abort();
        try {
          const headers = { ...request.headers(), [protectedHeader]: oidc };
          // A cross-origin redirect receives no credentials from this request.
          const response = await route.fetch({ headers, maxRedirects: 0 });
          if (readyAsset) (report.browserAssets ??= []).push({
            file: url.pathname.slice("/mascot-v6/".length), status: response.status(),
          });
          if (collect?.kind === "choice") traffic.choices.push({ enabled: collect.enabled, status: response.status() });
          if (collect?.kind === "event") traffic.events.push({ type: collect.event.type, status: response.status() });
          if (usage && readyQuery) {
            const reply = await response.json().catch(() => null);
            traffic.replies.push({ status: response.status(), sources: reply?.sources?.length ?? 0, fallback: reply?.fallback === true });
          }
          if (readyQuery && pauseAnswer) await new Promise((done) => { releaseAnswer = done; });
          await route.fulfill({ response });
        } catch {
          await route.abort().catch(() => undefined);
        }
      });
      try {
        const signInPage = await context.newPage();
        signingIn = true;
        try {
          await browserAuth.signIn(signInPage, identity);
        } finally {
          signingIn = false;
          await signInPage.close();
        }
        const page = await context.newPage();
        const home = await page.goto(origin, { waitUntil: "domcontentloaded" });
        step = `${journey} mount`;
        await page.waitForFunction((userId) => window.Clerk?.loaded && window.Clerk.user?.id === userId,
          identity.userId, { timeout: 30_000 });
        const dock = page.locator("button[data-ready-dock]:visible");
        (report.browserNavigation ??= []).push({
          journey, status: home?.status() ?? null, isHome: new URL(page.url()).pathname === "/",
          readyDockCount: await page.locator("[data-ready-dock]").count(),
        });
        await expect(dock).toBeVisible({ timeout: 15_000 });
        step = `${journey} hydrates`;
        await expect(page.locator("[data-mode='dock']")).toHaveCount(1, { timeout: 15_000 });
        if (mobile) await dock.tap();
        else await dock.click();
        step = `${journey} loads the WebGL model`;
        await expect.poll(async () => page.locator("[data-mode='floating']").getAttribute("data-asset-status"),
          { timeout: 15_000 }).not.toBe("loading");
        (report.browserNavigation.at(-1)).assetStatus = await page.locator("[data-mode='floating']").getAttribute("data-asset-status");
        await expect(page.locator("[data-mode='floating'][data-asset-status='ready']")).toHaveCount(1, { timeout: 15_000 });
        if (active) {
          step = `${journey} opens the active synthetic match`;
          try {
            await browserActiveMatch({ page, expect, origin, fixture: active.fixture, mobile, verify });
          } catch (error) {
            await page.screenshot({ path: resolve(output, mobile ? "ready-active-touch-debug.png" : "ready-active-desktop-debug.png") });
            throw error;
          }
          await page.screenshot({ path: resolve(output, mobile ? "ready-active-touch.png" : "ready-active-desktop.png") });
          report.browser.push(mobile ? "visible Chrome touch emulation active Match Room" : "visible Chrome desktop active Match Room");
          continue;
        }
        if (navigationOnly) {
          await browserMatchNavigation(page, expect, origin);
          continue;
        }
        if (mobileLayout) {
          step = "visible Chrome Ready mobile overlap regression";
          try {
            await browserMobileLayoutJourney({ page, expect, output, verify });
          } catch (error) {
            await page.screenshot({ path: resolve(output, "ready-mobile-layout-debug.png") });
            throw error;
          }
          report.browser.push("visible Chrome Ready layout at 390×780 and 780×390 with touch emulation");
          continue;
        }
        if (menu || usage) {
          step = usage ? "visible Chrome Staging reviewer analytics journey" : `${journey} complete Welcome, menu and prepared reply`;
          const video = page.video();
          try {
            if (usage) {
              await browserUsageMenuJourney({ page, expect, output, verify, traffic });
              if (video) await page.close();
            } else {
              await browserMenuJourney({ page, expect, mobile, output, verify, recording: !!video });
            }
            if (video) await video.saveAs(resolve(output, usage ? "ready-usage-player.webm" : "ready-menu-browser.webm"));
          } catch (error) {
            if (!page.isClosed()) await page.screenshot({
              path: resolve(output, usage ? "ready-usage-player-debug.png" : mobile ? "ready-menu-touch-debug.png" : "ready-menu-desktop-debug.png"),
            });
            throw error;
          }
          report.browser.push(usage ? "Ready analytics opt-in and withdrawal via visible Chrome"
            : mobile ? "menu verified with visible Chrome touch emulation" : "menu and renderer verified in visible Chrome desktop");
          continue;
        }
        const choose = (name) => {
          const button = page.getByRole("button", { name, exact: true });
          return mobile ? button.tap() : button.click();
        };
        async function openRuleMenu() {
          await openQuickAction(page, "Help", mobile);
          await choose("Rules & match help");
        }
        await openRuleMenu();
        if (mobile) await page.setViewportSize({ width: 390, height: 580 });
        step = `${journey} answer`;
        await choose("Disconnects & lag");
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
          headers: { [protectedHeader]: oidc }, maxRedirects: 0,
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
        await expect(message).toContainText("10:00");
        if (!mobile) {
          step = "expired response after docking";
          await openRuleMenu();
          pauseAnswer = true;
          await choose("Disconnects & lag");
          await expect(message).toContainText("Checking the site…");
          await expect.poll(() => typeof releaseAnswer, { timeout: 12_000 }).toBe("function");
          await page.locator("[data-mascot-drag]").hover();
          await close.click();
          await expect(page.locator("[data-mode='dock']")).toHaveCount(1);
          pauseAnswer = false;
          releaseAnswer?.();
          await dock.click();
          await expect(page.getByRole("button", { name: "Disconnects & lag", exact: true })).toBeVisible();
          await expect(message).toContainText("What happened on the battlefield");
          report.browser.push("desktop in-flight answer canceled on docking");
        }
        report.browser.push(mobile ? "visible Chrome touch emulation and viewport resize" : "visible Chrome desktop");
      } finally {
        pauseAnswer = false;
        releaseAnswer?.();
        await context.close();
      }
    }
  } finally {
    await browser.close();
    const result = await browserAuth.close();
    report.temporarySessionsCreated += result.temporarySessionsCreated;
    report.temporarySessionsRevoked += result.temporarySessionsRevoked;
  }
}

try {
  const options = args(process.argv.slice(2));
  const origin = new URL(options["--url"]).origin;
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  step = "short-lived trusted-sources access";
  verify(claims(oidc).exp * 1000 > Date.now(), "unexpired OIDC token available in memory");
  await verifyDeployment(options, origin);

  const guestRule = await answer(origin, oidc, null, "guest public rule", { kind: "question", id: "disconnects", context: fixtureA });
  verify(/10:00/.test(guestRule.text) && guestRule.sources?.some(({ url }) => url === `${appVersion}#page=9`) &&
    !guestRule.context?.matchId, "signed-out caller gets the prepared current rule even when supplied a match reference");
  const guestMatch = await answer(origin, oidc, null, "guest private match", { kind: "action", id: "my-match", context: fixtureA });
  verify(/sign in/i.test(guestMatch.text) && guestMatch.actions?.some(({ href }) => href === "/sign-in") &&
    !JSON.stringify(guestMatch).includes(fixtureA.matchId), "guest private lookup offers sign-in without disclosing the match");

  step = "approved staging credentials";
  const environment = await loadFixtureEnvironment({ rootDir: envRoot, processEnv: {} });
  const base = validateRuntimeGuards(environment, "TestAcademy1");
  verify(base.supabaseUrl === stagingBackend, "exact Staging Supabase target");
  await assertClerkDevelopmentInstance(base);
  clerk = createClerkClient({ secretKey: base.clerkSecretKey });
  const admin = createClient(stagingBackend, base.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const a2 = options["--suggestions-journey"] ? null : await loadActor(admin, environment, "TestAcademy2");
  if (options["--suggestions-journey"]) {
    const result = await browserSuggestionsJourney({ origin, oidc, protectedHeader, envRoot, clerkIssuer, admin, verify });
    report.temporarySessionsCreated += result.temporarySessionsCreated;
    report.temporarySessionsRevoked += result.temporarySessionsRevoked;
  } else if (options["--active-fixture-manifest"]) {
    const fixtures = await readActiveFixtures(options["--active-fixture-manifest"], verify);
    const a1 = await loadActor(admin, environment, "TestAcademy1");
    const a3 = await loadActor(admin, environment, "TestAcademy3");
    const postflight = await verifyActiveApi({
      fixtures, admin, environment, actors: [a1, a2, a3], origin, verify,
      answer: (actor, label, payload) => answer(origin, oidc, actor, label, payload),
    });
    if (options["--headed"]) {
      await browserJourney(origin, oidc, a1, false, { fixture: fixtures.a, mobile: false });
      await browserJourney(origin, oidc, a2, false, { fixture: fixtures.a, mobile: true });
    }
    await postflight();
  } else if (options["--usage-menu-journey"]) {
    const a1 = await loadActor(admin, environment, "TestAcademy1");
    await browserJourney(origin, oidc, a1, false, null, false, true);
  } else if (options["--mobile-layout-journey"]) {
    await browserJourney(origin, oidc, a2, false, null, "mobile-layout");
  } else if (options["--browser-only"] || options["--navigation-only"] || options["--menu-journey"]) {
    await browserJourney(origin, oidc, a2, options["--navigation-only"], null, options["--menu-journey"]);
  } else {
  const a1 = await loadActor(admin, environment, "TestAcademy1");
  const a3 = await loadActor(admin, environment, "TestAcademy3");

  const ordinary = await answer(origin, oidc, a3, "ordinary account private match", { kind: "action", id: "opponent", context: fixtureB });
  verify(matchDestination(ordinary, fixtureB), "ordinary non-review account can look up their own match");
  const ordinaryRules = await readPage(origin, oidc, a3, "/rules", "ordinary Rules page loads for a non-review account");
  verify(ordinaryRules.includes("data-ready-dock"), "ordinary Rules includes the Ready header dock");
  const rules = await answer(origin, oidc, a1, "grounded disconnect", { kind: "question", id: "disconnects" });
  verify(/10:00/.test(rules.text) && rules.sources?.some(({ url, section }) =>
    url === `${appVersion}#page=9` && section.includes("10.1")), "answer cites rulebook disconnect section");
  const reference = await fetch(new URL(appVersion, origin), { headers: { [protectedHeader]: oidc },
    redirect: "error", signal: AbortSignal.timeout(15_000) });
  verify(reference.ok && reference.headers.get("content-type")?.includes("application/pdf"), "hosted citation is the approved PDF");
  await reference.body?.cancel();
  const final = await answer(origin, oidc, a1, "grand final format", { kind: "question", id: "final" });
  verify(/grand final is best-of-five/.test(final.text), "explicit grand final choice uses the approved text");
  const noMatch = await answer(origin, oidc, a1, "no active fixture", { kind: "action", id: "my-match" });
  verify(/no active match assigned/.test(noMatch.text), "no active match reported honestly");
  const multiple = await answer(origin, oidc, a1, "multiple historical matches", { kind: "action", id: "past-match" });
  verify(/more than one match/.test(multiple.text) &&
    new Set(multiple.actions?.map(({ context }) => context?.matchId).filter(Boolean)).size > 1, "multiple owned matches offer a choice");
  const own = await answer(origin, oidc, a1, "own earlier match room", { kind: "action", id: "opponent-chat", context: fixtureA });
  verify(/read-only/.test(own.text) && matchDestination(own, fixtureA, true), "owned closed room links to verified read-only workspace");
  const earlierRoomUrl = own.actions.find(({ href }) => href?.startsWith("/tournaments?") && href.includes("&room="))?.href;
  await readPage(origin, oidc, a1, earlierRoomUrl, "live existing Match Room destination resolves");
  const support = await answer(origin, oidc, a1, "owned support links", { kind: "action", id: "admin-assistance", context: fixtureA });
  verify(support.actions?.some(({ href }) => href === ticketUrl) && support.actions?.some(({ href }) => href?.startsWith("/assistance/")) &&
    support.actions?.some(({ copyText }) => copyText?.includes(fixtureA.matchId)), "verified Discord destination, in-site support and copyable reference");
  const assistanceHref = support.actions.find(({ href }) => href?.startsWith("/assistance/"))?.href;
  await readPage(origin, oidc, a1, assistanceHref, "live in-site Admin Assistance destination resolves");
  const historic = await answer(origin, oidc, a1, "historical accepted rules", {
    kind: "question", id: "division", context: { eventSlug: "test-2-2" },
  });
  verify(/Main \/ Pro.*1400/.test(historic.text) && historic.sources?.some(({ url }) => url.includes("rulebook-v3.1.pdf")) &&
    !historic.sources?.some(({ url }) => url.includes("rulebook-v3.2.pdf")), "historical answer uses accepted v3.1 and combined division");
  const opponent = await answer(origin, oidc, a2, "owned opponent", { kind: "action", id: "opponent", context: fixtureA });
  verify(/TestAcademy1/.test(opponent.text) && matchDestination(opponent, fixtureA), "current session resolves its own recorded opponent");
  const foreign = await answer(origin, oidc, a2, "forged foreign match", { kind: "action", id: "opponent-chat", context: fixtureB });
  verify(/couldn.t find that match under your current account/.test(foreign.text) && !foreign.context?.matchId &&
    !foreign.actions?.some(({ href }) => href?.includes(fixtureB.matchId)), "foreign match context returns no private result or action");
  const [retired, reply] = await query(origin, oidc, a1, "retired typed search", { kind: "search", query: "Rules" });
  verify(retired === 400 && !reply.sources?.length, "retired typed search is refused by the route");
  if (options["--headed"]) await browserJourney(origin, oidc, a2);
  }
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
