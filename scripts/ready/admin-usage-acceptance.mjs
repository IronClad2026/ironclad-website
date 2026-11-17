// Read-only hosted UAT. Use the existing Staging Vercel environment and
// Development fixtures. Temporary Clerk sessions are revoked by hosted-auth.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";

const exec = promisify(execFile);
const scope = "ironclad-tournaments";
const websiteProject = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const route = "/admin/ready-usage";
const protectedHeader = "x-vercel-trusted-oidc-idp-token";
const checks = [];
const options = new Map();
let step = "validated acceptance arguments";
let auth;
let browser;
let cleanup;

async function diagnoseDeployment(origin) {
  const { stdout } = await exec(process.execPath, [
    resolve(options.get("--vercel-cli")), "api", "/v13/deployments/" + new URL(origin).hostname,
    "--method", "GET", "--scope", scope,
  ], { timeout: 15_000, windowsHide: true, maxBuffer: 512_000 });
  const deployment = JSON.parse(stdout);
  assert(deployment.id === options.get("--deployment") && deployment.projectId === websiteProject &&
    deployment.readyState === "READY" && deployment.target !== "production" &&
    deployment.url === new URL(origin).hostname &&
    (deployment.meta?.githubCommitRef ?? deployment.meta?.gitCommitRef ?? deployment.gitSource?.ref) === "staging" &&
    (deployment.meta?.githubCommitSha ?? deployment.meta?.gitCommitSha ?? deployment.gitSource?.sha) === options.get("--commit"));
}

function sydneyDay(offset = 0) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  return date.toISOString().slice(0, 10);
}

async function browserSession(origin, oidc, identity, mobile = false, recording) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    ...(recording ? {
      storageState: recording.storageState,
      recordVideo: { dir: recording.output, size: { width: 1440, height: 1000 } },
    } : {}),
  });
  if (recording) {
    await context.addInitScript(() => {
      const mask = () => {
        const style = document.createElement("style");
        style.textContent = ".cl-userButtonTrigger { visibility: hidden !important; }";
        document.documentElement.append(style);
      };
      if (document.documentElement) mask();
      else document.addEventListener("readystatechange", mask, { once: true });
    });
  }
  let signingIn = Boolean(identity);
  await context.route("**/*", async (handler) => {
    const request = handler.request();
    const target = new URL(request.url());
    const read = ["GET", "HEAD"].includes(request.method());
    if (target.origin !== origin) {
      if (target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co") return handler.abort();
      if (target.hostname.endsWith(".clerk.accounts.dev") && target.hostname !== "guided-goshawk-34.clerk.accounts.dev") return handler.abort();
      if (read || (signingIn && target.origin === "https://guided-goshawk-34.clerk.accounts.dev")) return handler.continue();
      return handler.abort();
    }
    if (!read) return handler.abort();
    const response = await handler.fetch({ headers: { ...request.headers(), [protectedHeader]: oidc }, maxRedirects: 0 });
    return handler.fulfill({ response });
  });
  const page = await context.newPage();
  try {
    if (identity) await auth.signIn(page, identity);
    signingIn = false;
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function recordDashboard(origin, oidc, output, sourceContext) {
  // Pass browser state in memory, so the recording starts after sign-in.
  const session = await browserSession(origin, oidc, null, false, {
    storageState: await sourceContext.storageState(),
    output,
  });
  const video = session.page.video();
  try {
    await session.page.goto(origin + route, { waitUntil: "domcontentloaded" });
    await expect(session.page.getByRole("heading", { name: "Ready usage", exact: true })).toBeVisible();
    await session.page.waitForTimeout(2_500);
    await session.page.getByRole("heading", { name: "Daily Ready activity" }).scrollIntoViewIfNeeded();
    await session.page.waitForTimeout(3_500);
  } finally {
    await session.context.close();
  }
  await video.saveAs(resolve(output, "admin-ready-usage.webm"));
  await video.delete();
}

async function assertDenied(page, origin, anonymous = false) {
  for (const path of [route, route + "?view=suggestions"]) {
    await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL((url) =>
      url.origin === origin && (url.pathname === "/" || (anonymous && url.pathname === "/sign-in")),
      { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Ready usage" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Written Ready suggestions" })).toHaveCount(0);
  }
}

const metricLabels = {
  engagedAccounts: "Accounts",
  engagedSessions: "Sessions",
  manualOpenings: "Openings",
  answerDisplays: "Answers displayed",
  actionClicks: "Action clicks",
  unmatchedSearches: "Legacy unmatched searches",
  fallbacks: "Fallbacks shown",
  technicalErrors: "Technical errors",
  helpful: "Helpful",
  stillNeedHelp: "Still need help",
};

async function inspectDashboard({ page, report, origin, output, mobile }) {
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  const dashboard = page.getByRole("main").filter({ has: page.getByRole("heading", { name: "Ready usage", exact: true }) });
  await expect(dashboard).toBeVisible({ timeout: 20_000 });
  await expect(dashboard.getByRole("link", { name: "Activity and feedback" })).toHaveAttribute("aria-current", "page");
  await expect(dashboard.getByText("All-player adoption is unavailable.", { exact: false })).toBeVisible();
  for (const [key, label] of Object.entries(metricLabels)) {
    if (["helpful", "stillNeedHelp"].includes(key) && report.totals.helpful + report.totals.stillNeedHelp === 0) continue;
    const value = report.totals[key];
    const formatted = value === null ? "Unavailable" : new Intl.NumberFormat("en-AU").format(value);
    await expect(dashboard.getByText(label, { exact: true }).and(dashboard.locator("dt")).locator("xpath=following-sibling::dd")).toHaveText(formatted);
  }
  await expect(dashboard.getByRole("heading", { name: "Daily Ready activity" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Most-used destinations" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Most-used categories" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Historical category-only flags" })).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (mobile) await dashboard.getByText("Accounts", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, mobile ? "admin-ready-usage-phone.png" : "admin-ready-usage-desktop.png"),
    animations: "disabled", mask: [page.locator(".cl-userButtonTrigger")],
  });
  if (!mobile) {
    const filters = dashboard.getByRole("form", { name: "Ready usage filters" });
    await filters.getByLabel("Date range").selectOption("custom");
    await filters.getByLabel("Custom start").fill(sydneyDay(-6));
    await filters.getByLabel("Custom end").fill(sydneyDay());
    await filters.getByLabel("Menu / catalogue version").selectOption("1/1");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL((url) =>
      url.pathname === route && url.searchParams.get("period") === "custom" && url.searchParams.get("version") === "1/1");

    await dashboard.locator("summary").filter({ hasText: "When should I contact my opponent?" }).click();
    await expect(dashboard.getByRole("link", { name: "Official Tournament Rulebook v3.2" })).toBeVisible();
    await expect(dashboard.getByRole("link", { name: "Official Tournament Rulebook v3.1" })).toBeVisible();
    await page.goto(origin + route + "?cohort=player", { waitUntil: "domcontentloaded" });
    await expect(dashboard.getByText("Usage figures are unavailable for this view.", { exact: false })).toBeVisible();
    await expect(dashboard.getByText("Accounts", { exact: true })).toHaveCount(0);
  }

  await dashboard.getByRole("link", { name: "Missing-topic suggestions" }).click();
  await expect(dashboard.getByRole("heading", { name: "Missing-topic suggestions" })).toBeVisible();
  await expect(dashboard.getByText("Written suggestions could not be loaded.", { exact: false })).toHaveCount(0);
  const suggestionsFilter = dashboard.getByRole("form", { name: "Filter written suggestions by review status" });
  await suggestionsFilter.getByLabel("Review status").selectOption("added");
  await suggestionsFilter.getByRole("button", { name: "Apply status filter" }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("suggestionStatus") === "added");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
}

try {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--denials-only") {
      options.set(key, true);
      continue;
    }
    assert(["--url", "--commit", "--deployment", "--vercel-cli", "--environment-dir", "--admin-name", "--admin-user-id"].includes(key) &&
      args[index + 1] && !options.has(key));
    options.set(key, args[++index]);
  }
  const origin = new URL(options.get("--url")).origin;
  assert.match(origin, /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/);
  assert.match(options.get("--commit"), /^[a-f0-9]{40}$/);
  assert.match(options.get("--deployment"), /^dpl_[A-Za-z0-9]+$/);
  assert.match(options.get("--vercel-cli"), /[\\/]vc\.js$/);
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  assert(oidc && JSON.parse(Buffer.from(oidc.split(".")[1], "base64url")).exp * 1000 > Date.now());
  step = "verified exact protected Staging deployment";
  await diagnoseDeployment(origin);
  checks.push(step);

  step = "verified existing designated synthetic player";
  auth = await createHostedAuth({
    environmentDirectory: options.get("--environment-dir") ??
      "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website",
    origin,
  });
  const player = await auth.fixture("TestAcademy2");
  checks.push(step);

  const query = {
    p_start: sydneyDay(-29), p_end: sydneyDay(), p_menu_version: null,
    p_catalogue_version: null, p_cohort: "reviewer",
  };
  browser = await chromium.launch({ channel: "chrome", headless: false });
  const output = fileURLToPath(new URL("../../test-results/ready-staging/", import.meta.url));
  await mkdir(output, { recursive: true });
  step = "denied unauthenticated administrator URL";
  const publicSession = await browserSession(origin, oidc);
  try { await assertDenied(publicSession.page, origin, true); } finally { await publicSession.context.close(); }
  checks.push(step);

  step = "denied synthetic player at administrator URL and SQL report";
  const playerSession = await browserSession(origin, oidc, player);
  try {
    await assertDenied(playerSession.page, origin);
    const denied = await auth.clientForPage(playerSession.page).rpc("get_ready_usage_report", query);
    assert.equal(denied.error?.code, "42501");
    const suggestionsDenied = await auth.clientForPage(playerSession.page).rpc("get_ready_topic_suggestions", {
      p_status: null, p_limit: 20, p_offset: 0,
    });
    assert.equal(suggestionsDenied.error?.code, "42501");
  } finally { await playerSession.context.close(); }
  checks.push(step);

  if (!options.has("--denials-only")) {
    step = "verified explicit authorised Development administrator";
    const admin = await auth.existingAdmin(options.get("--admin-user-id"), options.get("--admin-name"));
    const state = await auth.admin.rpc("get_patch2_admin_account_state", { p_clerk_user_id: admin.userId });
    assert(!state.error && ["verified-staff", "verified-active-player"].includes(state.data));
    checks.push(step);

    step = "loaded nonempty reviewer usage through service-role-only SQL report";
    const { data: report, error } = await auth.admin.rpc("get_ready_usage_report", query);
    assert(!error && report?.coverage?.collected && report.totals.engagedAccounts > 0);
    checks.push(step);

    for (const mobile of [false, true]) {
      step = mobile ? "checked reviewer dashboard and written suggestion filter bounds in touch emulation"
        : "checked reviewer totals, filters, published and archived sources, cohort isolation, and written suggestions in visible Chrome";
      const session = await browserSession(origin, oidc, admin, mobile);
      try {
        await inspectDashboard({ page: session.page, report, origin, output, mobile });
        if (!mobile) await recordDashboard(origin, oidc, output, session.context);
      }
      finally { await session.context.close(); }
      checks.push(step);
    }
  }
} catch {
  process.exitCode = 1;
  console.error(JSON.stringify({ failedCheck: step, checks }));
} finally {
  if (browser) await browser.close();
  if (auth) {
    try { cleanup = await auth.close(); }
    catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ failedCheck: "temporary Development session cleanup" }));
    }
  }
  if (!process.exitCode) console.log(JSON.stringify({ checks, cleanup, touchEmulation: !options.has("--denials-only"), writesToSite: false }));
}
