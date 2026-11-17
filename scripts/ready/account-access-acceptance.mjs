// Read-only Ready acceptance on an exact protected Staging deployment.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { chromium, expect } from "@playwright/test";
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
const foreign = { eventSlug: "patch3-staging-assistance-20261103-v1-a", matchId: "5131a673-4df4-4530-8f35-969997e2a5ec" };
const checks = [];
function passed(label) {
  checks.push(label);
  console.log(JSON.stringify({ passed: label }));
}
let step = "validating arguments";
let browser;
let auth;
let cleanup;
let browserFailure;
let directory;
const observedSessions = new Map();

function readOptions(tokens) {
  const options = new Map();
  const names = ["--url", "--deployment", "--commit", "--vercel-cli", "--environment-dir", "--admin-user-id", "--notice-fixture", "--browser-url"];
  for (let index = 0; index < tokens.length; index++) {
    const key = tokens[index];
    if (["--headless", "--guest-only", "--ordinary-only", "--desktop-only", "--touch-only"].includes(key) && !options.has(key)) {
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
      reachableReport: /Unique engaged accounts/.test(html) && /Daily Ready activity/.test(html),
      concealed: response.status === 404 || response.status === 401 || response.status === 403 || response.redirected ||
        html.includes("NEXT_REDIRECT"),
    };
  });
  assert(result.concealed && !result.reachableReport, "Admin usage must remain restricted");
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
      if (read || (target.pathname === "/api/ready" && request.method === "POST") || authCacheRefresh) {
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
    navigations.push({ host: current.hostname, page: current.pathname, status: response.status(), to: next?.hostname });
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
  })).then((state) => ({ ...state, failedRequests, navigations, clerkCallbacks }));
  return { context, page, changeAccount, attemptedUsageWrites: () => readyEventWrites, diagnose };
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
  if (await canvas.getAttribute("data-mode") === "dock") {
    if (mobile) await dock.tap();
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
  const mobileSizes = options.has("--touch-only") ? [true] : options.has("--desktop-only") ? [false] : [false, true];
  for (const mobile of mobileSizes) {
    await checkViewport(origin, oidc, mobile, player, administrator, notice, headless, clerkCacheAction, options.has("--ordinary-only"));
  }
  if (origin === stagingOrigin) await verifyCanonicalAlias(options);
  if (!administrator) checks.push("Admin browser checks skipped without a proven authorized identity");
  if (!notice) checks.push("Notice-pending browser checks skipped without a verified synthetic identity");
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({ failedCheck: step, errorType: error?.name, checks, browserFailure }));
} finally {
  if (browser) await browser.close();
  if (auth) {
    try {
      try { cleanup = await auth.close(); }
      catch (error) {
        // The ordinary fixture was signed out through Clerk. Its session may already
        // be inactive, which the shared helper still treats as an unrevoked session.
        if (process.exitCode || observedSessions.size === 0) throw error;
        cleanup = await verifyAlreadyInactiveSessions();
      }
    }
    catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ failedCheck: "temporary Development session cleanup" }));
    }
  }
  if (!process.exitCode) console.log(JSON.stringify({ checks, cleanup, writesToSite: false }));
}
