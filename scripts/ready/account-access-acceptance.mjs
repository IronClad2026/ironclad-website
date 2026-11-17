// Read-only Ready acceptance on an exact protected Staging deployment.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { openQuickAction } from "./menu-journey.mjs";

const exec = promisify(execFile);
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const team = "ironclad-tournaments";
const trustedHeader = "x-vercel-trusted-oidc-idp-token";
const clerkOrigin = "https://guided-goshawk-34.clerk.accounts.dev";
const approvedEnvironment = "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website";
const owned = { eventSlug: "patch3-staging-assistance-20261103-v1-b", matchId: "5ad14749-7fbf-4811-bfaa-4e4a892aed9e" };
const foreign = { eventSlug: "patch3-staging-assistance-20261103-v1-a", matchId: "5131a673-4df4-4530-8f35-969997e2a5ec" };
const checks = [];
let step = "validating arguments";
let browser;
let auth;
let cleanup;

function readOptions(tokens) {
  const options = new Map();
  const names = ["--url", "--deployment", "--commit", "--vercel-cli", "--environment-dir", "--admin-user-id", "--notice-fixture"];
  for (let index = 0; index < tokens.length; index++) {
    const key = tokens[index];
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

async function makeViewport(origin, oidc, mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
    deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile,
  });
  let managingSession = false;
  let readyEventWrites = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    const read = ["GET", "HEAD"].includes(request.method());
    if (target.origin !== origin) {
      if (target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co") return route.abort();
      if (target.hostname.endsWith(".clerk.accounts.dev") && target.origin !== clerkOrigin) return route.abort();
      const refresh = request.method() === "POST" && /^\/v1\/client\/sessions\/sess_[a-zA-Z0-9]+\/(?:tokens|touch)$/.test(target.pathname);
      return read || (target.origin === clerkOrigin && (managingSession || refresh)) ? route.continue() : route.abort();
    }
    if (!read && target.pathname === "/api/ready/usage") readyEventWrites++;
    if (!read && !(target.pathname === "/api/ready" && request.method() === "POST")) return route.abort();
    const response = await route.fetch({ headers: { ...request.headers(), [trustedHeader]: oidc }, maxRedirects: 0 });
    return route.fulfill({ response });
  });
  const page = await context.newPage();
  const changeAccount = async (operation) => {
    managingSession = true;
    try { await operation(); } finally { managingSession = false; }
  };
  return { context, page, changeAccount, attemptedUsageWrites: () => readyEventWrites };
}

async function assertIdentity(page, identity) {
  await page.waitForFunction((id) => window.Clerk?.loaded &&
    (id === null ? !window.Clerk.user : window.Clerk.user?.id === id), identity?.userId ?? null, { timeout: 30_000 });
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

async function checkViewport(origin, oidc, mobile, player, administrator, notice) {
  const layout = mobile ? "Chrome touch emulation 390×780" : "visible desktop Chrome 1280×800";
  const view = await makeViewport(origin, oidc, mobile);
  const { page, context, changeAccount } = view;
  try {
    step = layout + " signed out fresh load";
    await page.goto(origin + "/rules", { waitUntil: "domcontentloaded" });
    await assertIdentity(page, null);
    await showAssistant(page, mobile);
    await publicAnswer(page, mobile);
    await guestPersonal(page, mobile);
    await assertAdminDenied(page);
    await dockAssistant(page, mobile);
    await showAssistant(page, mobile);
    checks.push(layout + " signed-out header, public rules and navigation, personal sign-in link, and Admin rejection");

    step = layout + " ordinary player fresh load";
    await changeAccount(() => auth.signIn(page, player));
    await page.goto(origin + "/tournaments", { waitUntil: "domcontentloaded" });
    await assertIdentity(page, player);
    await showAssistant(page, mobile);
    await publicAnswer(page, mobile);
    await openQuickAction(page, "Help", mobile);
    await choose(page, mobile, "My profile & progress");
    await choose(page, mobile, "Notifications");
    await expect(page.locator("[data-mascot-dialogue]").getByRole("link", { name: /my notifications/i }))
      .toHaveAttribute("href", "/dashboard#player-notifications", { timeout: 25_000 });
    const ownReply = await readyPost(page, "opponent", owned);
    assert.equal(ownReply.status, 200);
    assert.equal(ownReply.body.context?.matchId, owned.matchId, "ordinary synthetic owner must receive their own match");
    assert(ownReply.body.actions.some(({ href }) => typeof href === "string" && href.includes(owned.matchId)));
    assertNoPrivateResult(await readyPost(page, "opponent", foreign), foreign.matchId);
    await assertAdminDenied(page);
    checks.push(layout + " ordinary non-review player menu, own match and notifications, foreign match and Admin rejection");

    step = layout + " switch from ordinary player back to signed out";
    await signOut(view, origin);
    await assertIdentity(page, null);
    await showAssistant(page, mobile);
    await expect(page.locator("[data-mascot-dialogue]").getByRole("link", { name: /my notifications/i })).toHaveCount(0);
    await guestPersonal(page, mobile);
    checks.push(layout + " ordinary player → signed-out switch clears prior navigation and private access");

    if (notice) {
      step = layout + " existing notice-pending account";
      await changeAccount(() => auth.signIn(page, notice));
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
      await signOut(view, origin);
      await assertIdentity(page, null);
      checks.push(layout + " notice-pending account sees the mandatory notice and cannot read private Ready data");
    }

    if (administrator) {
      step = layout + " authorized administrator fresh load";
      await changeAccount(() => auth.signIn(page, administrator));
      await page.goto(origin + "/admin/ready-usage", { waitUntil: "domcontentloaded" });
      await assertIdentity(page, administrator);
      await expect(page.getByRole("heading", { name: "Ready usage", exact: true })).toBeVisible({ timeout: 30_000 });
      await showAssistant(page, mobile);
      await publicAnswer(page, mobile);
      assertNoPrivateResult(await readyPost(page, "opponent", owned), owned.matchId);
      await dockAssistant(page, mobile);
      checks.push(layout + " Admin sees Ready on fresh Admin page, reads prepared answers, and keeps existing Admin report authorization");
    }
    assert.equal(view.attemptedUsageWrites(), 0, "Ready must remain usable without opt-in or attempted collection");
  } finally {
    await context.close();
  }
}

try {
  const options = readOptions(process.argv.slice(2));
  const origin = new URL(options.get("--url")).origin;
  assert.match(origin, /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/);
  assert.match(options.get("--deployment"), /^dpl_[A-Za-z0-9]+$/);
  assert.match(options.get("--commit"), /^[a-f0-9]{40}$/);
  assert.match(options.get("--vercel-cli"), /[\\/]vc\.js$/);
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  assert(oidc && JSON.parse(Buffer.from(oidc.split(".")[1], "base64url")).exp * 1000 > Date.now());
  step = "checking exact READY Staging deployment";
  await verifyDeployment(origin, options);
  const directory = options.get("--environment-dir") ?? approvedEnvironment;
  auth = await createHostedAuth({ environmentDirectory: directory, origin });
  step = "proving ordinary fixture ownership and former reviewer exclusion";
  const player = await auth.fixture("TestAcademy3");
  const playerStaff = await auth.admin.rpc("get_patch2_admin_account_state", { p_clerk_user_id: player.userId });
  assert(player.profileCompleted && !playerStaff.error && !/^verified-/.test(playerStaff.data));
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
  browser = await chromium.launch({ channel: "chrome", headless: false });
  for (const mobile of [false, true]) await checkViewport(origin, oidc, mobile, player, administrator, notice);
  if (!administrator) checks.push("Admin browser checks skipped without a proven authorized identity");
  if (!notice) checks.push("Notice-pending browser checks skipped without a verified synthetic identity");
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({ failedCheck: step, errorType: error?.name, checks }));
} finally {
  if (browser) await browser.close();
  if (auth) {
    try { cleanup = await auth.close(); }
    catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ failedCheck: "temporary Development session cleanup" }));
    }
  }
  if (!process.exitCode) console.log(JSON.stringify({ checks, cleanup, writesToSite: false }));
}
