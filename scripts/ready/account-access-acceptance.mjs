// Read-only Ready acceptance on an exact protected Staging deployment.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { loadFixtureEnvironment, validateRuntimeGuards } from "../lib/staging-synthetic-uat.mjs";
import { openQuickAction } from "./menu-journey.mjs";

const exec = promisify(execFile);
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const team = "ironclad-tournaments";
const trustedHeader = "x-vercel-trusted-oidc-idp-token";
const clerkOrigin = "https://guided-goshawk-34.clerk.accounts.dev";
const stagingOrigin = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const approvedEnvironment = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const owned = { eventSlug: "patch3-staging-assistance-20261103-v1-b", matchId: "5ad14749-7fbf-4811-bfaa-4e4a892aed9e" };
const ownedRoomId = "68004246-962d-4982-ba86-2baeb85acec7";
const ownedTournamentId = "87ca54d4-e6a7-4a49-b348-a4230b9a9476";
const foreign = { eventSlug: "patch3-staging-assistance-20261103-v1-a", matchId: "5131a673-4df4-4530-8f35-969997e2a5ec" };
const checks = [];
const surfaceFailures = [];
function passed(label) {
  checks.push(label);
  console.log(JSON.stringify({ passed: label }));
}

const reportPath = (value) => value.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, "[fixture]");
let step = "validating arguments";
let browser;
let auth;
let cleanup;
let browserFailure;
let directory;
const observedSessions = new Map();

function readOptions(tokens) {
  const options = new Map();
  const names = ["--url", "--deployment", "--commit", "--vercel-cli", "--environment-dir", "--admin-user-id", "--notice-fixture", "--browser-url", "--artifacts"];
  for (let index = 0; index < tokens.length; index++) {
    const key = tokens[index];
    if (["--headless", "--guest-only", "--ordinary-only", "--desktop-only", "--touch-only", "--cloud-baseline", "--cloud-surfaces",
      "--cloud-deep", "--cloud-brackets"].includes(key) && !options.has(key)) {
      options.set(key, true);
      continue;
    }
    assert(names.includes(key) && tokens[index + 1] && !options.has(key));
    options.set(key, tokens[++index]);
  }
  return options;
}

async function verifyDeployment(origin, options) {
  const { stdout } = await exec(process.execPath, [
    resolve(options.get("--vercel-cli")), "api", "/v13/deployments/" + options.get("--deployment"),
    "--method", "GET", "--scope", team,
  ], { timeout: 15_000, windowsHide: true, maxBuffer: 512_000 });
  const result = JSON.parse(stdout);
  assert(result.id === options.get("--deployment") && result.projectId === project &&
    result.url === new URL(origin).hostname && result.readyState === "READY" && result.target !== "production" &&
    (result.meta?.githubCommitRef ?? result.meta?.gitCommitRef ?? result.gitSource?.ref) === "staging" &&
    (result.meta?.githubCommitSha ?? result.meta?.gitCommitSha ?? result.gitSource?.sha) === options.get("--commit"));
}

async function verifyCanonicalAlias(options) {
  const { stdout } = await exec(process.execPath, [
    resolve(options.get("--vercel-cli")), "api", "/v4/aliases/" + new URL(stagingOrigin).hostname,
    "--method", "GET", "--scope", team,
  ], { timeout: 15_000, windowsHide: true, maxBuffer: 512_000 });
  const result = JSON.parse(stdout);
  assert.equal(result.deploymentId, options.get("--deployment"), "canonical Staging alias must match exact deployment");
}

async function findClerkCacheAction(origin, oidc) {
  const read = async (url) => {
    const response = await fetch(url, {
      headers: { [trustedHeader]: oidc }, redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200, "read exact Staging auth asset");
    return response.text();
  };
  const html = await read(origin + "/sign-in");
  const paths = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g),
    (match) => new URL(match[1].replaceAll("&amp;", "&"), origin));
  const chunksForThisOrigin = new Set(paths.filter((url) =>
    url.origin === origin && url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js"),
  ).map((url) => url.href));
  assert(chunksForThisOrigin.size > 0 && chunksForThisOrigin.size <= 40);
  const chunks = await Promise.all(Array.from(chunksForThisOrigin, read));
  const references = new Set(chunks.flatMap((chunk) => Array.from(
    chunk.matchAll(/createServerReference\)\("([a-f0-9]{40,64})",[^()]*"invalidateCacheAction"\)/g),
    (match) => match[1],
  )));
  assert.equal(references.size, 1, "exact Clerk cache-only server action must be uniquely identified");
  return [...references][0];
}

async function readyPost(page, id, context) {
  return page.evaluate(async (payload) => {
    const response = await fetch("/api/ready", {
      method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }, { kind: "action", id, ...(context ? { context } : {}) });
}

function assertNoPrivateResult(result, matchId) {
  assert([200, 401, 403].includes(result.status));
  assert(!JSON.stringify(result.body).includes(matchId));
  assert(!result.body?.actions?.some(({ href, destinationType }) =>
    destinationType === "match" || (typeof href === "string" && href.startsWith("/assistance/"))));
}

async function assertAdminDenied(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch("/admin/ready-usage", { cache: "no-store" });
    const html = await response.text();
    return {
      reachableReport: /Usage overview/.test(html) && /Ready usage filters/.test(html),
      concealed: response.status === 404 || response.status === 401 || response.status === 403 || response.redirected ||
        html.includes("NEXT_REDIRECT"),
    };
  });
  assert(result.concealed && !result.reachableReport, "Admin usage must remain restricted");
}

function readHistoryActionArgs(request, nextAction) {
  if (request.method !== "POST" || !/^[a-f0-9]{36,64}$/i.test(nextAction ?? "")) return null;
  try {
    const args = JSON.parse(request.postData ?? "null");
    const value = args?.[0];
    return Array.isArray(args) && args.length === 1 && value && typeof value === "object" &&
      value.afterSequence === 0 && value.limit === 50 ? value : null;
  } catch {
    return null;
  }
}

function isPinnedHistoryRead(target, input) {
  const params = target.searchParams;
  return input && target.pathname === "/tournaments" && params.size === 4 && params.get("tournament") === owned.eventSlug &&
    params.get("tab") === "brackets" && params.get("match") === owned.matchId && params.get("room") === ownedRoomId &&
    Object.keys(input).sort().join(",") === "afterSequence,limit,roomId" && input.roomId === ownedRoomId;
}

async function makeViewport(origin, oidc, mobile, headless = false, clerkCacheAction) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
    deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, reducedMotion: headless ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const protocol = await context.newCDPSession(page);
  await protocol.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  let managingSession = false;
  let permittedAssistance;
  let readyEventWrites = 0;
  const navigations = [];
  const clerkCallbacks = [];
  protocol.on("Fetch.requestPaused", ({ requestId, request }) => {
    const target = new URL(request.url);
    const read = ["GET", "HEAD"].includes(request.method);
    const isStaging = target.origin === origin;
    const refuse = () => protocol.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    const proceed = (headers) => protocol.send("Fetch.continueRequest", { requestId, ...(headers ? { headers } : {}) });
    let task;
    if (isStaging) {
      if (!read && target.pathname === "/api/ready/usage") readyEventWrites++;
      const nextAction = Object.entries(request.headers).find(([name]) => name.toLowerCase() === "next-action")?.[1];
      const authCacheRefresh = managingSession && clerkCacheAction && request.method === "POST" &&
        ["/sign-in", "/tournaments", "/account/public-profile-notice"].includes(target.pathname) &&
        nextAction === clerkCacheAction && request.postData?.trim() === "[]";
      if (managingSession && request.method === "POST" && nextAction) {
        clerkCallbacks.push({ path: target.pathname, cacheOnly: nextAction === clerkCacheAction,
          emptyArguments: request.postData?.trim() === "[]", allowed: Boolean(authCacheRefresh) });
      }
      const historyArgs = readHistoryActionArgs(request, nextAction);
      const assistanceRead = historyArgs && permittedAssistance && target.pathname + target.search === permittedAssistance &&
        Object.keys(historyArgs).sort().join(",") === "afterSequence,limit,requestId,tournamentId" &&
        historyArgs.tournamentId === ownedTournamentId && target.pathname === "/assistance/" + historyArgs.requestId;
      if (read || (target.pathname === "/api/ready" && request.method === "POST") || authCacheRefresh ||
        isPinnedHistoryRead(target, historyArgs) || assistanceRead) {
        // Playwright routes cover only the first URL in a redirect chain. CDP pauses each
        // hop and never carries header overrides to a different origin automatically.
        const headers = Object.entries(request.headers)
          .filter(([name]) => name.toLowerCase() !== trustedHeader)
          .map(([name, value]) => ({ name, value: String(value) }));
        task = proceed([...headers, { name: trustedHeader, value: oidc }]);
      } else {
        task = refuse();
      }
    } else if ((target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co") ||
      (target.hostname.endsWith(".clerk.accounts.dev") && target.origin !== clerkOrigin)) {
      task = refuse();
    } else {
      const sessionMaintenance = request.method === "POST" && (target.pathname === "/v1/client" ||
        /^\/v1\/client\/sessions\/sess_[a-zA-Z0-9]+\/(?:tokens|touch)$/.test(target.pathname));
      task = read || (target.origin === clerkOrigin && (managingSession || sessionMaintenance || request.method === "OPTIONS"))
        ? proceed() : refuse();
    }
    void task.catch(() => refuse().catch(() => undefined));
  });
  page.on("response", (response) => {
    if (!response.request().isNavigationRequest()) return;
    const current = new URL(response.url());
    const location = response.headers().location;
    const next = location ? new URL(location, current) : null;
    navigations.push({ host: current.hostname, page: reportPath(current.pathname), status: response.status(), to: next?.hostname });
  });
  const failedRequests = {};
  page.on("requestfailed", (request) => {
    const target = new URL(request.url());
    const location = target.origin === origin ? "website" : target.hostname;
    const key = request.method() + " " + location + " " + request.resourceType();
    failedRequests[key] = (failedRequests[key] ?? 0) + 1;
  });
  const changeAccount = async (operation) => {
    managingSession = true;
    let timeout;
    try {
      await Promise.race([operation(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error("Clerk browser account transition did not finish")), 35_000);
      })]);
    } finally {
      clearTimeout(timeout);
      managingSession = false;
    }
  };
  const diagnose = () => page.evaluate(() => ({
    clerk: window.Clerk?.loaded === true,
    hasSignedInUser: !!window.Clerk?.user,
    dockTag: document.querySelector("[data-ready-dock]")?.tagName,
    page: location.pathname,
    scriptHosts: [...new Set([...document.scripts].filter((script) => script.src).map((script) => new URL(script.src).hostname))],
    readyView: document.querySelector("[data-ready-view]")?.getAttribute("data-ready-view"),
    asset: document.querySelector("[data-mode][data-asset-status]")?.getAttribute("data-asset-status"),
    dockIsHitTarget: [...document.querySelectorAll("[data-ready-dock]")].map((dock) => {
      const { x, y, width, height } = dock.getBoundingClientRect();
      return { width, height, receivesPointer: dock.contains(document.elementFromPoint(x + width / 2, y + height / 2)) };
    }),
  })).then((state) => ({ ...state, page: reportPath(state.page), failedRequests, navigations, clerkCallbacks }));
  const allowAssistanceRead = (href) => {
    const target = new URL(href, origin);
    assert(target.origin === origin && /^\/assistance\/[a-f0-9-]{36}$/i.test(target.pathname) && target.searchParams.size === 1 &&
      target.searchParams.get("tournament") === ownedTournamentId);
    permittedAssistance = target.pathname + target.search;
  };
  return { context, page, changeAccount, allowAssistanceRead, attemptedUsageWrites: () => readyEventWrites, diagnose };
}

async function assertIdentity(page, identity) {
  await page.waitForFunction((id) => id === null ? !window.Clerk?.user
    : window.Clerk?.loaded && window.Clerk.user?.id === id, identity?.userId ?? null, { timeout: 30_000 });
}

async function signIn(view, identity) {
  await view.changeAccount(() => auth.signIn(view.page, identity));
  const sessionId = await view.page.evaluate(() => window.Clerk.session?.id);
  assert.match(sessionId, /^sess_[A-Za-z0-9]+$/);
  observedSessions.set(sessionId, identity.userId);
}

async function verifyAlreadyInactiveSessions() {
  const environment = await loadFixtureEnvironment({ rootDir: directory, processEnv: {} });
  const config = validateRuntimeGuards(environment, "TestAcademy3");
  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
  const inactive = new Set(["revoked", "ended", "expired", "removed", "abandoned", "replaced"]);
  for (const [sessionId, userId] of observedSessions) {
    const session = await clerk.sessions.getSession(sessionId).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
    if (!session) continue;
    assert(session.id === sessionId && session.userId === userId);
    if (!inactive.has(session.status)) {
      const revoked = await clerk.sessions.revokeSession(sessionId);
      assert(revoked.id === sessionId && revoked.userId === userId && inactive.has(revoked.status));
    }
  }
  return { temporarySessionsVerifiedInactive: observedSessions.size };
}

async function showAssistant(page, mobile) {
  const dock = page.locator("[data-ready-dock]:visible");
  const canvas = page.locator("[data-mode][data-asset-status]");
  await expect(dock).toHaveCount(1, { timeout: 25_000 });
  await expect(canvas).toHaveAttribute("data-asset-status", "ready", { timeout: 70_000 });
  if (new URL(page.url()).pathname === "/dashboard") {
    // This synthetic player has an existing badge-reveal notice. Its Not now
    // button dismisses locally, so the read-only test never acknowledges the badge.
    const badge = page.locator('[role="dialog"][aria-labelledby^="badge-reveal-"]');
    if (await badge.isVisible()) {
      const dismiss = badge.getByRole("button", { name: "Not now", exact: true });
      if (mobile) await dismiss.tap();
      else await dismiss.click();
      await expect(badge).toHaveCount(0);
    }
  }
  if (await canvas.getAttribute("data-mode") === "dock") {
    if (mobile) await dock.tap();
    else if (new URL(page.url()).pathname === "/dashboard") await dock.press("Enter");
    else await dock.click();
  }
  await expect(canvas).toHaveAttribute("data-mode", "floating");
  await expect(page.locator("[data-mascot-dialogue]:visible")).toHaveCount(1);
}

async function dockAssistant(page, mobile) {
  if (!mobile) await page.locator("[data-mascot-drag]").hover();
  const close = page.getByRole("button", { name: "Dock assistant" });
  if (mobile) await close.tap();
  else await close.click();
  await expect(page.locator("[data-mode='dock'][data-asset-status='ready']")).toHaveCount(1);
  await expect(page.locator("[data-mascot-travel='docking']")).toHaveCount(0);
}

async function choose(page, mobile, name) {
  const button = page.getByRole("button", { name, exact: true });
  if (mobile) await button.tap({ timeout: 25_000 });
  else await button.click({ timeout: 25_000 });
}

async function publicAnswer(page, mobile) {
  await openQuickAction(page, "Help", mobile);
  await choose(page, mobile, "Rules & match help");
  await choose(page, mobile, "Disconnects & lag");
  const sources = page.getByRole("link", { name: /Official Tournament Rulebook/ });
  await expect(sources.first()).toHaveAttribute("href", /\/documents-rules-ppa\/ironclad-official-tournament-rulebook/, { timeout: 25_000 });
  const result = await readyPost(page, "find-tournament");
  assert.equal(result.status, 200);
  assert(result.body.actions.some(({ href }) => typeof href === "string" && /^\/tournaments(?:$|\?)/.test(href)));
}

async function guestPersonal(page, mobile) {
  await openQuickAction(page, "Help", mobile);
  await choose(page, mobile, "My match");
  await choose(page, mobile, "My opponent");
  await expect(page.locator("[data-mascot-dialogue]").getByRole("link", { name: /sign in/i }))
    .toHaveAttribute("href", /^\/sign-in/, { timeout: 30_000 });
  assertNoPrivateResult(await readyPost(page, "opponent", owned), owned.matchId);
}

async function measurePaintedGap(page) {
  const layout = await page.evaluate(() => {
    const surface = document.querySelector('[data-mode="floating"][data-asset-status="ready"]');
    const cloud = document.querySelector("[data-thought-cloud]");
    const frame = cloud?.closest("[data-mascot-dialogue]");
    const path = cloud?.querySelector('path[data-cloud-contour="main"]');
    if (!surface || !frame || !(path instanceof SVGGeometryElement)) return null;
    const frameBox = frame.getBoundingClientRect();
    const shape = path.getScreenCTM();
    if (!shape) return null;
    const samples = [];
    const length = path.getTotalLength();
    for (let index = 0; index <= length; index += 2) {
      const { x, y } = path.getPointAtLength(index).matrixTransform(shape);
      if (x >= frameBox.left && x <= frameBox.right && y >= frameBox.top && y <= frameBox.bottom) samples.push({ x, y });
    }
    return { skull: surface.getBoundingClientRect().toJSON(), samples, side: frame.getAttribute("data-side"),
      oval: frame.getAttribute("data-menu-layout") === "oval" };
  });
  assert(layout?.samples.length, "visible painted cloud outline must be measurable");
  const image = await page.screenshot({ omitBackground: true, scale: "css", style: `
    html, body { background: transparent !important; visibility: hidden !important; }
    html::before, html::after, body::before, body::after { visibility: hidden !important; }
    [data-mode="floating"][data-asset-status="ready"] { visibility: visible !important; }
    [data-mode="floating"] canvas { filter: none !important; }
  ` });
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { skull, samples, side, oval } = layout;
  const scaleX = info.width / (page.viewportSize()?.width ?? info.width);
  const scaleY = info.height / (page.viewportSize()?.height ?? info.height);
  const alpha = (x, y) => (data[(y * info.width + x) * info.channels + 3] ?? 0) >= 225;
  const vertices = [];
  for (let y = Math.max(1, Math.round(skull.top * scaleY)); y < Math.min(info.height - 1, skull.bottom * scaleY); y++) {
    for (let x = Math.max(1, Math.round(skull.left * scaleX)); x < Math.min(info.width - 1, skull.right * scaleX); x++) {
      if (alpha(x, y) && !(alpha(x + 1, y) && alpha(x - 1, y) && alpha(x, y + 1) && alpha(x, y - 1))) {
        vertices.push({ x: x / scaleX, y: y / scaleY });
      }
    }
  }
  assert(vertices.length > 20, "isolated canvas must include the painted skull contour");
  let squares = Infinity;
  for (const point of samples) {
    for (const vertex of vertices) {
      squares = Math.min(squares, (point.x - vertex.x) ** 2 + (point.y - vertex.y) ** 2);
    }
  }
  return { gapPx: Math.round(Math.sqrt(squares) * 10) / 10, side, oval, skullX: Math.round(skull.x), skullWidth: Math.round(skull.width) };
}

async function dragToward(page, x, y, steps = 25) {
  const grip = await page.locator("[data-mascot-drag]").boundingBox();
  assert(grip);
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  try { await page.mouse.move(x, y, { steps }); }
  finally { await page.mouse.up(); }
}

async function assertCloudMenu(page, mobile, { dark = true } = {}) {
  await showAssistant(page, mobile);
  await openQuickAction(page, "Help", mobile);
  const menu = page.locator('[data-ready-view="main"]:not([data-revealing])');
  await expect(menu.locator("[data-mascot-message]")).toHaveText("What can I help you with today, Commander?", { timeout: 20_000 });
  await expect(menu.locator("[data-ready-category]")).toHaveCount(6);
  await expect(page.locator('[data-mode] canvas')).toHaveCount(1);
  await expect.poll(() => menu.evaluate((element) => {
    const cloud = element.querySelector("[data-thought-cloud]");
    const option = element.querySelector("[data-ready-category]");
    const outline = cloud.querySelector('path[data-cloud-contour="main"]');
    const view = visualViewport ?? { width: innerWidth, height: innerHeight, offsetLeft: 0, offsetTop: 0 };
    const frame = element.getBoundingClientRect();
    const coordinates = outline?.getBoundingClientRect();
    return {
      frameInside: frame.left >= view.offsetLeft - 1 && frame.top >= view.offsetTop - 1 &&
        frame.right <= view.offsetLeft + view.width + 1 && frame.bottom <= view.offsetTop + view.height + 1,
      outlineVisible: !!coordinates && coordinates.left < frame.right && coordinates.right > frame.left &&
        coordinates.top < frame.bottom && coordinates.bottom > frame.top,
      palette: [cloud, option].map((node) => {
        const style = getComputedStyle(node);
        return [style.getPropertyValue("--cloud-top").trim().toLowerCase(), style.getPropertyValue("--cloud-bottom").trim().toLowerCase()];
      }),
    };
  })).toMatchObject({ frameInside: true, outlineVisible: true,
    ...(dark ? { palette: [["#18181b", "#09090b"], ["#27272a", "#18181b"]] } : {}) });
  if (dark) {
    await expect(menu.getByRole("button", { name: "Topic missing", exact: true })).toBeVisible();
    await expect(menu.getByRole("textbox")).toHaveCount(0);
  }
}

async function dragTouchToward(page, x, y) {
  const grip = await page.locator("[data-mascot-drag]").boundingBox();
  assert(grip);
  const client = await page.context().newCDPSession(page);
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;
  const location = (portion) => [{ id: 1, x: Math.round(startX + (x - startX) * portion), y: Math.round(startY + (y - startY) * portion) }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: location(0) });
    for (const fraction of [.2, .4, .6, .8, 1]) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: location(fraction) });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}

async function checkDashboardClouds(origin, oidc, player, headless, clerkCacheAction, output) {
  assert(player, "the dashboard needs the guarded ordinary account");
  const view = await makeViewport(origin, oidc, false, headless, clerkCacheAction);
  const { page, context } = view;
  try {
    step = "signing in the guarded ordinary player before baseline dashboard";
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await signIn(view, player);
    step = "opening Ready on the ordinary player dashboard";
    await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded" });
    await assertIdentity(page, player);
    assert.equal(new URL(page.url()).pathname, "/dashboard");
    step = "opening Ready and Help on the ordinary dashboard";
    await assertCloudMenu(page, false, { dark: Boolean(output) });
    const read = async (position) => ({ position, ...await measurePaintedGap(page) });
    step = "measuring painted dashboard gap at initial, left and right drag positions";
    const measurements = [await read("initial")];
    await dragToward(page, 164, 408);
    measurements.push(await read("left"));
    if (output) {
      step = "recording the actual authenticated dashboard drag";
      await page.screencast.start({ path: resolve(output, "ready-cloud-dashboard-drag.webm"), size: { width: 1280, height: 800 } });
      try {
        await page.waitForTimeout(1050);
        await dragToward(page, 1108, 408);
        await page.waitForTimeout(1050);
      } finally {
        await page.screencast.stop();
      }
      await page.screenshot({ path: resolve(output, "ready-clouds-desktop.png"), caret: "hide" });
    } else await dragToward(page, 1108, 408);
    measurements.push(await read("right"));
    assert(measurements[2].skullX - measurements[1].skullX >= 640, "real dashboard drag must move the skull across the viewport");
    console.log(JSON.stringify({ [output ? "dashboardUpdated" : "dashboardBaseline"]: measurements,
      viewport: page.viewportSize(), writesToSite: false }));
    passed(`Ordinary TestAcademy3 dashboard ${output ? "updated build" : "baseline"} measured from SVG and rasterized skull contours during real desktop drag`);
    if (output) {
      await writeFile(resolve(output, "dashboard-painted-gap.json"), JSON.stringify(measurements, null, 2));
      await checkDesktopSurfaces(view, origin);
    }
    assert.equal(view.attemptedUsageWrites(), 0, "ordinary player without opted-in consent must not attempt analytics writes");
  } catch (error) {
    browserFailure = await view.diagnose().catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

async function exerciseDesktopClouds(page, label) {
  const { width, height } = page.viewportSize();
  const targets = [
    ["left", 22, height * .50], ["right", width - 22, height * .50],
    ["upper left", 22, 112], ["upper right", width - 22, 112],
    ["lower left", 22, height - 22], ["lower right", width - 22, height - 22],
  ];
  const geometry = [];
  const bounds = () => page.evaluate(() => {
    const getBox = (selector) => document.querySelector(selector)?.getBoundingClientRect()?.toJSON();
    return { skull: getBox('[data-mode="floating"]'), frame: getBox("[data-mascot-dialogue]") };
  });
  for (const [position, x, y] of targets) {
    step = `${label}: ${position} desktop drag`;
    await dragToward(page, x, y, 12);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const { skull, frame } = await bounds();
    assert(skull && frame && skull.width > 0 && frame.width > 0 && frame.height > 0);
    for (const box of [skull, frame]) assert(box.left >= -1 && box.top >= -1 && box.right <= width + 1 && box.bottom <= height + 1);
    assert((position.includes("left") ? skull.right <= width / 2 : skull.left >= width / 2), "skull reaches the requested viewport side");
    if (position.startsWith("upper")) assert(skull.top < height / 3);
    if (position.startsWith("lower")) assert(skull.bottom >= height - 30);
    assert(Math.min(frame.right, skull.right) - Math.max(frame.left, skull.left) <= 1 ||
      Math.min(frame.bottom, skull.bottom) - Math.max(frame.top, skull.top) <= 1, "dialogue stays clear of the skull at the chosen edge");
    geometry.push({ position, x: Math.round(skull.x), y: Math.round(skull.y) });
  }

  step = `${label}: real submenu choice and sourced answer`;
  // The older synthetic fixture can have unconfirmed governing-document versions.
  // Exercise a sourced general rules-hub answer there without assuming its event terms.
  const route = new URL(page.url());
  const eventScoped = route.pathname === "/tournaments" && route.searchParams.has("tournament");
  const question = eventScoped ? "Where are the official rules?" : "Disconnects & lag";
  await choose(page, false, eventScoped ? "Tournaments & registration" : "Rules & match help");
  await expect(page.locator('[data-ready-view="submenu"]')).toBeVisible();
  if (eventScoped) {
    await choose(page, false, "Event rules, prizes & decisions");
    await choose(page, false, "Official documents & editions");
  }
  await choose(page, false, question);
  const reply = page.locator('[data-ready-view="reply"]');
  await expect(reply).toBeVisible({ timeout: 20_000 });
  const full = reply.getByRole("button", { name: "Show full message", exact: true });
  if (await full.isVisible()) await full.click();
  await expect(reply.locator("[data-mascot-message]")).not.toBeEmpty({ timeout: 15_000 });
  await expect(reply.getByRole("link", { name: eventScoped ? /IronClad Competition Rules/i : /Official Tournament Rulebook/i }).first())
    .toHaveAttribute("href", eventScoped ? "/rules"
      : /\/documents-rules-ppa\/ironclad-official-tournament-rulebook/, { timeout: 20_000 });
  await choose(page, false, "Back");
  await expect(page.locator('[data-ready-view="submenu"]').getByRole("button", { name: question, exact: true })).toBeVisible();

  step = `${label}: dock and reopen at the saved position`;
  const before = (await bounds()).skull;
  await dockAssistant(page, false);
  await expect(page.locator("[data-mascot-dialogue]")).toHaveCount(0);
  await showAssistant(page, false);
  await expect(page.locator('[data-ready-view="submenu"]')).toBeVisible();
  const after = (await bounds()).skull;
  assert(before && after && Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1);
  await expect(page.locator('[data-mode] canvas')).toHaveCount(1);
  console.log(JSON.stringify({ checkedRoute: label, drags: geometry, sourcedReply: question, reopenedAtSavedPosition: true }));
}

async function verifySurface(page, origin, path, label, mobile, native, deep = false) {
  const url = new URL(path, origin);
  const stage = `${mobile ? "Emulated touch" : "Desktop"} ${label}`;
  step = stage;
  assert.equal(url.origin, origin);
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
  assert(response?.ok() && new URL(page.url()).pathname === url.pathname, "expected application route must load without a sign-in redirect");
  if (native) await native(page);
  await assertCloudMenu(page, mobile);
  if (deep) await exerciseDesktopClouds(page, stage);
  passed(stage + (deep ? " passed six real drags, sourced reply, and saved-position dock/reopen" :
    " displays Ready with one canvas and six dark cloud choices"));
}

async function collectSurface(check) {
  try { await check(); }
  catch (error) {
    const failure = { failedCheck: step, errorType: error?.name };
    surfaceFailures.push(failure);
    console.error(JSON.stringify(failure));
  }
}

function fixturePath(extra = {}) {
  return `/tournaments?${new URLSearchParams({ tournament: owned.eventSlug, tab: "brackets", ...extra })}`;
}

async function checkDesktopSurfaces({ page, allowAssistanceRead }, origin, deep = false) {
  for (const [path, label] of [["/", "homepage"], ["/tournaments", "tournament list"], [fixturePath(), "owned event Brackets"],
    ["/rules", "Rules"], ["/about", "About"], ["/profile", "Profile"], ["/players", "Players"], ["/rankings", "Rankings"]]) {
    await collectSurface(() => verifySurface(page, origin, path, label, false, undefined, deep));
  }
  await collectSurface(async () => {
    step = "resolving ordinary player's owned historical Match Room";
    const own = await readyPost(page, "opponent", owned);
    assert(own.status === 200 && own.body.context?.matchId === owned.matchId, "ordinary player must own the selected historical fixture");
    const eventScope = { eventSlug: owned.eventSlug };
    const chat = await readyPost(page, "opponent-chat", eventScope);
    assert.equal(chat.status, 200);
    await page.goto(origin + fixturePath(), { waitUntil: "domcontentloaded" });
    await assertCloudMenu(page, false);
    await choose(page, false, "My match");
    await choose(page, false, "Open opponent chat");
    const selection = chat.body.actions?.find((item) => item.intent?.id === "opponent-chat" && item.context?.matchId === owned.matchId);
    if (selection) await choose(page, false, selection.label);
    const link = page.locator("[data-mascot-dialogue]").getByRole("link", { name: "Open earlier Match Room", exact: true });
    const expected = new URL(fixturePath({ match: owned.matchId, room: ownedRoomId }), origin);
    await expect(link).toHaveAttribute("href", expected.pathname + expected.search, { timeout: 25_000 });
    step = "opening the owned, pinned read-only Match Room through Ready";
    await link.click();
    await expect(page).toHaveURL(expected.href);
    const room = page.getByRole("region", { name: "Match Room", exact: true });
    await expect(room).toBeVisible({ timeout: 25_000 });
    await expect(room.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    await expect(room.getByText(/historical|read.only/i).first()).toBeVisible({ timeout: 25_000 });
    const workspace = page.getByRole("dialog").filter({ has: room });
    await expect(workspace).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(workspace).toHaveCount(0);
    await assertCloudMenu(page, false);
    passed("Desktop Ready opened the ordinary player's historical read-only Match Room and resumed on Brackets after the native modal closed");
  });
  await collectSurface(async () => {
    step = "resolving an existing requester-scoped Assistance record";
    const response = await readyPost(page, "admin-assistance", owned);
    const href = response.status === 200 && response.body.actions?.find((action) =>
      /^\/assistance\/[a-f0-9-]{36}\?tournament=[a-f0-9-]{36}$/i.test(action.href ?? ""))?.href;
    if (href) {
      allowAssistanceRead(href);
      await verifySurface(page, origin, href, "existing requester-scoped Assistance", false, async (current) => {
        await expect(current.getByRole("log")).toBeVisible({ timeout: 25_000 });
      }, deep);
    } else {
      const skipped = "No existing Assistance link returned for the guarded ordinary requester";
      checks.push(skipped);
      console.log(JSON.stringify({ skipped }));
    }
  });
}

async function checkDeepDesktop(origin, oidc, player, headless, clerkCacheAction, bracketsOnly) {
  assert(player, "the desktop surface journey uses the guarded ordinary player");
  const view = await makeViewport(origin, oidc, false, headless, clerkCacheAction);
  const { page, context } = view;
  try {
    step = "signing in the guarded ordinary player for per-route desktop verification";
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await signIn(view, player);
    await assertIdentity(page, player);
    if (bracketsOnly) {
      await verifySurface(page, origin, fixturePath(), "owned event Brackets", false, undefined, true);
      assert.equal(view.attemptedUsageWrites(), 0);
      return;
    }
    await collectSurface(() => verifySurface(page, origin, "/dashboard", "ordinary Dashboard", false, undefined, true));
    await collectSurface(async () => {
      step = "native Dashboard-to-Tournaments navigation preserves the expanded assistant";
      const nav = page.getByRole("link", { name: "Go to Tournaments", exact: true });
      await expect(page.locator('[data-mode="floating"]')).toHaveCount(1);
      await nav.click();
      await expect(page).toHaveURL(origin + "/tournaments");
      await expect(page.locator('[data-mode="floating"]')).toHaveCount(1);
      await expect(page.locator('[data-mode] canvas')).toHaveCount(1);
      passed(step);
    });
    await checkDesktopSurfaces(view, origin, true);
    assert.equal(view.attemptedUsageWrites(), 0, "ordinary player without opted-in consent must not attempt analytics writes");
  } catch (error) {
    browserFailure = await view.diagnose().catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

async function checkCloudTouch(origin, oidc, player, headless, clerkCacheAction, output) {
  const view = await makeViewport(origin, oidc, true, headless, clerkCacheAction);
  const { page, context } = view;
  try {
    step = "signing in the guarded ordinary player in Chrome touch emulation";
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await signIn(view, player);
    await assertIdentity(page, player);
    await verifySurface(page, origin, "/dashboard", "390×780 ordinary Dashboard", true);
    await page.screenshot({ path: resolve(output, "ready-clouds-mobile.png"), caret: "hide" });
    const geometry = [];
    for (const [width, height] of [[390, 780], [780, 390], [320, 670]]) {
      await collectSurface(async () => {
        await page.setViewportSize({ width, height });
        if (width !== 390) await verifySurface(page, origin, "/", `${width}×${height} homepage`, true);
        step = `Chrome touch emulation ${width}×${height} real drag and painted gap`;
        const first = await measurePaintedGap(page);
        const targetX = first.skullX + first.skullWidth / 2 > width / 2 ? 28 : width - 28;
        await dragTouchToward(page, targetX, height * .59);
        const next = await measurePaintedGap(page);
        assert(Math.abs(next.skullX - first.skullX) > 24, "native emulated touch drag must move the skull horizontally");
        geometry.push({ width, height, initial: first, afterDrag: next });
        if (width !== 390) await page.screenshot({ path: resolve(output, `ready-clouds-${width}x${height}.png`), caret: "hide" });
        passed(step);
      });
    }
    await writeFile(resolve(output, "touch-painted-gap.json"), JSON.stringify(geometry, null, 2));
    console.log(JSON.stringify({ chromeTouchEmulation: geometry }));
    assert.equal(view.attemptedUsageWrites(), 0);
  } catch (error) {
    browserFailure = await view.diagnose().catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

async function signOut(view, origin) {
  const { page, changeAccount } = view;
  await changeAccount(async () => {
    const waiting = page.waitForURL(origin + "/", { waitUntil: "domcontentloaded" });
    const logout = page.evaluate(async (redirectUrl) => {
      await window.Clerk.signOut({ sessionId: window.Clerk.session.id, redirectUrl });
    }, origin + "/").catch((error) => {
      if (!error.message.includes("Execution context was destroyed")) throw error;
    });
    await Promise.all([logout, waiting]);
  });
}

async function checkViewport(origin, oidc, mobile, player, administrator, notice, headless, clerkCacheAction, ordinaryOnly) {
  const layout = mobile ? "Chrome touch emulation 390×780" : "desktop Chrome 1280×800";
  const view = await makeViewport(origin, oidc, mobile, headless, clerkCacheAction);
  const { page, context } = view;
  try {
    if (!ordinaryOnly) {
      step = layout + " signed out fresh load";
      await page.goto(origin + "/rules", { waitUntil: "domcontentloaded" });
      await assertIdentity(page, null);
      step = layout + " guest opens Ready";
      await showAssistant(page, mobile);
      step = layout + " guest official rule and tournaments";
      await publicAnswer(page, mobile);
      step = layout + " guest personal visibility and sign-in";
      await guestPersonal(page, mobile);
      step = layout + " guest Admin report boundary";
      await assertAdminDenied(page);
      step = layout + " guest redocks and reopens";
      await dockAssistant(page, mobile);
      await showAssistant(page, mobile);
      passed(layout + " signed-out header, public rules and navigation, personal sign-in link, and Admin rejection");
    }
    if (!player) {
      assert.equal(view.attemptedUsageWrites(), 0, "guest Ready must not attempt collection");
      return;
    }

    step = layout + " ordinary player fresh load";
    await signIn(view, player);
    await page.goto(origin + "/tournaments", { waitUntil: "domcontentloaded" });
    await assertIdentity(page, player);
    passed(layout + " guarded ordinary Clerk account active on fresh Tournaments page");
    step = layout + " ordinary player opens Ready and rule answer";
    await showAssistant(page, mobile);
    await publicAnswer(page, mobile);
    await openQuickAction(page, "Help", mobile);
    await choose(page, mobile, "My profile & progress");
    await choose(page, mobile, "Notifications");
    await expect(page.locator("[data-mascot-dialogue]").getByRole("link", { name: /my notifications/i }))
      .toHaveAttribute("href", "/dashboard#player-notifications", { timeout: 25_000 });
    const ownReply = await readyPost(page, "opponent", owned);
    step = layout + " ordinary player owned and foreign match boundaries";
    assert.equal(ownReply.status, 200);
    assert.equal(ownReply.body.context?.matchId, owned.matchId, "ordinary synthetic owner must receive their own match");
    assert(ownReply.body.actions.some(({ href }) => typeof href === "string" && href.includes(owned.matchId)));
    assertNoPrivateResult(await readyPost(page, "opponent", foreign), foreign.matchId);
    await assertAdminDenied(page);
    passed(layout + " ordinary non-review player menu, own match and notifications, foreign match and Admin rejection");

    step = layout + " switch from ordinary player back to signed out";
    await signOut(view, origin);
    await assertIdentity(page, null);
    await showAssistant(page, mobile);
    await expect(page.locator("[data-mascot-dialogue]").getByRole("link", { name: /my notifications/i })).toHaveCount(0);
    await guestPersonal(page, mobile);
    passed(layout + " ordinary player → signed-out switch clears prior navigation and private access");

    if (notice) {
      step = layout + " existing notice-pending account";
      await signIn(view, notice);
      await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded" });
      await assertIdentity(page, notice);
      if (new URL(page.url()).pathname === "/account/public-profile-notice") {
        await expect(page.getByRole("dialog")).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Review and accept the updated terms" })).toBeVisible();
      }
      await expect(page.locator("[data-ready-dock]")).toHaveCount(0);
      const denied = await readyPost(page, "opponent", owned);
      assert.equal(denied.status, 403);
      assertNoPrivateResult(denied, owned.matchId);
      if (administrator) {
        await signOut(view, origin);
        await assertIdentity(page, null);
      }
      passed(layout + " notice-pending account sees the mandatory notice and cannot read private Ready data");
    }

    if (administrator) {
      step = layout + " authorized administrator fresh load";
      await signIn(view, administrator);
      await page.goto(origin + "/admin/ready-usage", { waitUntil: "domcontentloaded" });
      await assertIdentity(page, administrator);
      await expect(page.getByRole("heading", { name: "Ready usage", exact: true })).toBeVisible({ timeout: 30_000 });
      await showAssistant(page, mobile);
      await publicAnswer(page, mobile);
      assertNoPrivateResult(await readyPost(page, "opponent", owned), owned.matchId);
      await dockAssistant(page, mobile);
      passed(layout + " Admin sees Ready on fresh Admin page, reads prepared answers, and keeps existing Admin report authorization");
    }
    assert.equal(view.attemptedUsageWrites(), 0, "Ready must remain usable without opt-in or attempted collection");
  } catch (error) {
    browserFailure = await view.diagnose().catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  const options = readOptions(process.argv.slice(2));
  assert(!(options.has("--guest-only") && options.has("--ordinary-only")));
  assert(!(options.has("--desktop-only") && options.has("--touch-only")));
  const deploymentOrigin = new URL(options.get("--url")).origin;
  assert.match(deploymentOrigin, /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/);
  const origin = options.get("--browser-url") ?? deploymentOrigin;
  assert(origin === deploymentOrigin || origin === stagingOrigin);
  assert.match(options.get("--deployment"), /^dpl_[A-Za-z0-9]+$/);
  assert.match(options.get("--commit"), /^[a-f0-9]{40}$/);
  assert.match(options.get("--vercel-cli"), /[\\/]vc\.js$/);
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  assert(oidc && JSON.parse(Buffer.from(oidc.split(".")[1], "base64url")).exp * 1000 > Date.now());
  step = "checking exact READY Staging deployment";
  await verifyDeployment(deploymentOrigin, options);
  if (origin === stagingOrigin) await verifyCanonicalAlias(options);
  directory = options.get("--environment-dir") ?? approvedEnvironment;
  auth = await createHostedAuth({ environmentDirectory: directory, origin });
  step = "proving ordinary fixture ownership and former reviewer exclusion";
  const player = options.has("--guest-only") ? null : await auth.fixture("TestAcademy3");
  if (player) {
    const playerStaff = await auth.admin.rpc("get_patch2_admin_account_state", { p_clerk_user_id: player.userId });
    assert(player.profileCompleted && !playerStaff.error && !/^verified-/.test(playerStaff.data));
  }
  const adminUserId = options.get("--admin-user-id");
  const administrator = adminUserId ? await auth.existingAdmin(adminUserId) : null;
  if (administrator) {
    const state = await auth.admin.rpc("get_patch2_admin_account_state", { p_clerk_user_id: administrator.userId });
    assert(!state.error && ["verified-staff", "verified-active-player"].includes(state.data));
  }
  const notice = options.has("--notice-fixture") ? await auth.fixture(options.get("--notice-fixture")) : null;
  if (notice) {
    const evidence = await auth.admin.from("account_legal_acceptances")
      .select("id", { count: "exact", head: true }).eq("clerk_user_id", notice.userId);
    assert(!evidence.error && evidence.count === 0, "notice fixture needs to be independently verified as pending");
  }
  const headless = options.has("--headless");
  step = "identifying Clerk's cache-only authentication callback for this build";
  const clerkCacheAction = player ? await findClerkCacheAction(origin, oidc) : undefined;
  browser = await chromium.launch({ channel: "chrome", headless });
  if (options.has("--cloud-deep") || options.has("--cloud-brackets")) {
    await checkDeepDesktop(origin, oidc, player, headless, clerkCacheAction, options.has("--cloud-brackets"));
    if (surfaceFailures.length) process.exitCode = 1;
  } else if (options.has("--cloud-baseline") || options.has("--cloud-surfaces")) {
    const output = options.has("--cloud-surfaces") ? resolve(options.get("--artifacts")) : undefined;
    if (output) await mkdir(output, { recursive: true });
    if (!output || !options.has("--touch-only")) {
      await checkDashboardClouds(origin, oidc, player, headless, clerkCacheAction, output);
      if (output && !options.has("--desktop-only")) {
        step = "revoking the closed ordinary desktop session before touch emulation";
        await verifyAlreadyInactiveSessions();
      }
    }
    if (output && !options.has("--desktop-only")) await checkCloudTouch(origin, oidc, player, headless, clerkCacheAction, output);
    if (surfaceFailures.length) process.exitCode = 1;
  } else {
    const mobileSizes = options.has("--touch-only") ? [true] : options.has("--desktop-only") ? [false] : [false, true];
    for (const mobile of mobileSizes) {
      await checkViewport(origin, oidc, mobile, player, administrator, notice, headless, clerkCacheAction, options.has("--ordinary-only"));
    }
  }
  if (origin === stagingOrigin) await verifyCanonicalAlias(options);
  if (!administrator) checks.push("Admin browser checks skipped without a proven authorized identity");
  if (!notice) checks.push("Notice-pending browser checks skipped without a verified synthetic identity");
} catch (error) {
  process.exitCode = 1;
  const harnessLocation = error?.stack?.split("\n").find((line) => line.includes("account-access-acceptance.mjs"))
    ?.match(/account-access-acceptance\.mjs:\d+:\d+/)?.[0];
  console.error(JSON.stringify({ failedCheck: step, errorType: error?.name, harnessLocation, checks, browserFailure }));
} finally {
  if (browser) await browser.close();
  if (auth) {
    try {
      try { cleanup = await auth.close(); }
      catch (error) {
        // The ordinary fixture was signed out through Clerk. Its session may already
        // be inactive, which the shared helper still treats as an unrevoked session.
        if (observedSessions.size === 0) throw error;
        cleanup = await verifyAlreadyInactiveSessions();
      }
    }
    catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ failedCheck: "temporary Development session cleanup" }));
    }
  }
  if (process.exitCode && cleanup) console.log(JSON.stringify({ cleanup }));
  if (surfaceFailures.length) console.log(JSON.stringify({ checks, surfaceFailures, writesToSite: false }));
  if (!process.exitCode) console.log(JSON.stringify({ checks, cleanup, writesToSite: false }));
}
