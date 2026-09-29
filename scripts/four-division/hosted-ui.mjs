// Real hosted Staging UI acceptance. No mocked routes, database writes, saved sessions or traces.
// Root verifies deployment environment and authorizes the exact candidate origin before execution.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { createHostedAuth } from "./hosted-auth.mjs";
import { createPreviewAccess } from "./preview-access.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const locales = ["en", "it", "zh-CN", "ru", "es", "pt-BR", "ko", "fr"];
const widths = [375, 390, 768, 1440];
const publicRoutes = ["/", "/about", "/rules", "/rankings", "/tournaments"];
const routes = option("--route") ? [option("--route")] : publicRoutes;
assert(routes.every((route) => publicRoutes.includes(route)));
const origin = new URL(option("--url", "https://unconfigured.vercel.app")).origin;
assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
const selectedLocales = option("--locale") ? [option("--locale")] : locales;
const selectedWidths = option("--width") ? [Number(option("--width"))] : widths;
assert(selectedLocales.every((locale) => locales.includes(locale)));
assert(selectedWidths.every((width) => widths.includes(width)));
const mode = option("--mode", "public");
assert(["public", "admin", "participant"].includes(mode));
const eventId = option("--event-id");
if (eventId) assert.match(eventId, /^[0-9a-f-]{36}$/i);
const matrix = (mode === "admin" ? ["en"] : selectedLocales).flatMap((locale) => selectedWidths.map((width) => ({ locale, width })));
if (args.includes("--plan")) {
  console.log(JSON.stringify({ mode, origins: "exact verified Staging Preview only", cases: matrix.length * routes.length, locales: selectedLocales, widths: selectedWidths, routes, mutations: false }));
  process.exit(0);
}
assert.notEqual(origin, "https://unconfigured.vercel.app");
assert.equal(option("--staging-project"), "zzbnneprhjicmajpjkdg", "Explicit verified Staging project required");
assert(!option("--private-storage-state"), "Saved authentication is not accepted");
assert(mode === "public" || option("--environment-dir"), "Authenticated checks require the existing private environment directory");
assert(mode !== "participant" || option("--alias"), "Participant checks require an approved permanent fixture alias");
const output = path.resolve("test-results", "four-division-hosted", option("--run", new Date().toISOString().replace(/[:.]/g, "-")));
assert(output.startsWith(path.resolve("test-results", "four-division-hosted") + path.sep));
mkdirSync(output, { recursive: true });

const copyCache = new Map();
function copy(locale, namespace, key) {
  const cacheKey = `${locale}/${namespace}`;
  if (!copyCache.has(cacheKey)) {
    const file = path.resolve("lib/i18n/dictionaries", locale, `${namespace}.ts`);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const values = new Map();
    function visit(node, prefix = "") {
      if (ts.isPropertyAssignment(node)) {
        const next = prefix ? `${prefix}.${node.name.text}` : node.name.text;
        if (ts.isStringLiteral(node.initializer)) values.set(next, node.initializer.text);
        else ts.forEachChild(node.initializer, (child) => visit(child, next));
      } else ts.forEachChild(node, (child) => visit(child, prefix));
    }
    visit(source);
    copyCache.set(cacheKey, values);
  }
  const result = copyCache.get(cacheKey).get(key);
  assert(result, `Missing local translation key ${locale}/${namespace}/${key}`);
  return result;
}

async function settle(page) {
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(350);
}

async function revealContent(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

async function inspect(page, locale) {
  return page.evaluate((expectedLocale) => {
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const name = (element) => element.getAttribute("aria-label") ||
      (element.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim() ||
      element.textContent?.trim() || element.getAttribute("title") || "";
    const controls = [...document.querySelectorAll("main button, main a[href], main [role=button]")].filter(visible);
    const unnamed = controls.filter((element) => !name(element) && !element.querySelector("img[alt]:not([alt=''])"));
    const clipped = controls.filter((element) => {
      const style = getComputedStyle(element);
      if (!(element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2 &&
        ["hidden", "clip"].includes(style.overflowX) && style.textOverflow !== "ellipsis")) return false;
      // A moving decorative tab marker can increase scrollWidth without cutting
      // off any content. Confirm actual text extends beyond the clipping edge.
      const boundary = element.getBoundingClientRect();
      const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
        if (!node.textContent?.trim() || !node.parentElement || !visible(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some((box) => box.right > boundary.right + 2 || box.left < boundary.left - 2)) return true;
      }
      return false;
    });
    const bodyText = document.body.innerText;
    return {
      locale: document.documentElement.lang,
      localeCorrect: document.documentElement.lang.toLowerCase() === expectedLocale.toLowerCase(),
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      mainCount: document.querySelectorAll("main").length,
      h1Count: [...document.querySelectorAll("h1")].filter(visible).length,
      unnamedControls: unnamed.length,
      clippedControls: clipped.length,
      clippedControlGeometry: clipped.map((element) => ({
        tag: element.tagName,
        role: element.getAttribute("role"),
        controlIndex: controls.indexOf(element),
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        textLength: element.textContent?.length ?? 0,
        children: [...element.children].map((child) => ({
          tag: child.tagName, width: child.clientWidth, scrollWidth: child.scrollWidth,
          left: Math.round(child.getBoundingClientRect().left - element.getBoundingClientRect().left),
        })),
      })),
      imagesMissingAlt: [...document.querySelectorAll("main img")].filter(visible).filter((element) => !element.hasAttribute("alt")).length,
      privateEvidenceExposed: /(?:sk_(?:live|test)_|sb_secret_|service_role|storage\/v1\/object\/(?:sign|authenticated)\/match-proofs|user_[A-Za-z0-9]{20,})/.test(bodyText),
    };
  }, locale);
}

async function keyboardCheck(page) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
  return page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body);
}

async function verifyContent(page, route, locale) {
  if (route === "/about") {
    for (const division of ["Academy", "Challenge", "Main", "Pro"]) {
      await page.getByRole("heading", { name: division, exact: true }).waitFor({ state: "visible" });
    }
    assert(await page.getByText("1400–1699 ELO", { exact: true }).count());
    assert(await page.getByText("1700+ ELO", { exact: true }).count());
  }
  if (route === "/") assert(await page.getByText(copy(locale, "public", "home.path.progressText"), { exact: true }).count());
  if (route === "/rules") {
    const elo = page.getByRole("button", { name: copy(locale, "help-legal-ui", "rules.sections.oneVOne.eloTitle"), exact: true });
    await elo.scrollIntoViewIfNeeded();
    if (await elo.getAttribute("aria-expanded") !== "true") await elo.click();
    await page.getByText(copy(locale, "help-legal-ui", "rules.sections.oneVOne.eloText"), { exact: true }).first().waitFor({ state: "visible" });
    const tabs = page.getByRole("tab");
    assert.equal(await tabs.count(), 3);
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
    await page.keyboard.press("Home");
    assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
  }
  if (route === "/rankings") {
    for (const key of ["mainProgression", "proDivision", "mainDivision"]) {
      const control = page.getByRole("button", { name: copy(locale, "public", `rankings.${key}`), exact: true });
      await control.scrollIntoViewIfNeeded();
      await control.click();
      assert.equal(await control.getAttribute("aria-pressed"), "true");
      if (key === "mainProgression") {
        await page.getByText(copy(locale, "public", "rankings.mainProgressionScoring"), { exact: true }).waitFor({ state: "visible" });
      }
    }
  }
}

async function verifyAdminEditor(page) {
  assert.equal(await page.locator('input[name="divisionModelVersion"]').inputValue(), "four_division_v1");
  const ranges = { academy: "0-1099 ELO", challenge: "1100-1399 ELO", main: "1400-1699 ELO", pro: "1700+ ELO" };
  for (const [division, range] of Object.entries(ranges)) {
    const field = page.locator(`input[name="${division}EloRules"]`);
    assert.equal(await field.inputValue(), range);
    assert.equal(await field.getAttribute("readonly"), "");
    assert.equal(await page.locator(`input[name="${division}MaxPlayers"]`).inputValue(), "8");
    await page.locator(`input[name="${division}Enabled"]`).check();
  }
  // Local form toggles are reversible; creation is exercised by the separate scoped lifecycle run.
}

const browser = await chromium.launch({ headless: true });
const results = [];
let previewAccess;
let authentication;
let identity;
let sessionCleanup;
try {
  previewAccess = createPreviewAccess(origin);
  if (mode !== "public") {
    authentication = await createHostedAuth({ environmentDirectory: option("--environment-dir"), origin });
    identity = mode === "admin" ? await authentication.existingAdmin(option("--admin-user-id"), option("--admin-name")) : await authentication.fixture(option("--alias"));
  }
  for (const { locale, width } of matrix) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, reducedMotion: "reduce" });
    await previewAccess.authorize(context);
    await context.addCookies([{ name: "ironclad_locale", value: locale, url: origin, secure: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    // Only block unsafe redirects/backend hosts. All permitted requests reach the real deployment.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      const unexpectedNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame() && target.origin !== origin;
      const unexpectedDatabase = target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co";
      const unexpectedClerk = target.hostname.endsWith(".clerk.accounts.dev") && target.hostname !== "guided-goshawk-34.clerk.accounts.dev";
      if (unexpectedNavigation || unexpectedDatabase || unexpectedClerk) await route.abort("blockedbyclient");
      else await route.continue();
    });
    const runtimeErrors = [];
    page.on("pageerror", () => runtimeErrors.push("pageerror"));
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push("console-error"); });
    if (authentication) await authentication.signIn(page, identity);
    const targets = mode === "public" ? routes : mode === "participant" ? ["/dashboard", "/profile", "/tournaments"] : ["/admin/tournaments/new", ...(eventId ? ["overview", "registrations", "bracket", "map-pool"].map((section) => `/admin/tournaments/${eventId}?section=${section}`) : [])];
    for (const route of targets) {
      const result = { locale, width, route, passed: false };
      const startErrors = runtimeErrors.length;
      try {
        const response = await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 60_000 });
        assert(response && response.status() < 400, "Unexpected hosted HTTP status");
        assert.equal(new URL(page.url()).origin, origin, "Unexpected origin redirect");
        await settle(page);
        await revealContent(page);
        if (mode === "public") await verifyContent(page, route, locale);
        else if (route === "/admin/tournaments/new") await verifyAdminEditor(page);
        else if (mode === "participant" && route === "/dashboard") {
          const career = page.locator('[data-dashboard-section="history"]');
          await career.scrollIntoViewIfNeeded();
          const tabs = career.getByRole("tab");
          assert.equal(await tabs.count(), 2);
          await tabs.first().focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
          await page.keyboard.press("Home");
          assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
          assert.equal(await career.getByRole("alert").count(), 0, "Career failed to load");
        }
        result.layout = await inspect(page, locale);
        result.keyboardFocus = await keyboardCheck(page);
        result.runtimeErrorCount = runtimeErrors.length - startErrors;
        assert(result.layout.localeCorrect, "Locale cookie was not honored");
        assert(result.layout.documentOverflow <= 1, "Page has horizontal overflow");
        assert.equal(result.layout.unnamedControls, 0, "Controls lack accessible names");
        assert.equal(result.layout.clippedControls, 0, "Interactive text is clipped");
        assert.equal(result.layout.imagesMissingAlt, 0, "Images lack alt attributes");
        assert(result.layout.mainCount >= 1 && result.layout.h1Count >= 1, "Missing page landmarks");
        assert(!result.layout.privateEvidenceExposed, "Private evidence appeared in rendered content");
        assert(result.keyboardFocus, "Keyboard did not reach an interactive control");
        assert.equal(result.runtimeErrorCount, 0, "Browser runtime errors occurred");
        result.passed = true;
      } catch (error) {
        // Never serialize locator text, response payloads, credentials or signed URLs from errors.
        result.failure = error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Hosted navigation or locator check failed";
      }
      result.screenshot = `${mode}-${locale}-${width}-${route.replace(/[^a-z0-9]/gi, "_") || "home"}.png`;
      // A content assertion can fail before the full layout inspection. Recheck
      // rendered privacy before every screenshot, including failed cases.
      const captureSafe = await page.evaluate(() => !/(?:sk_(?:live|test)_|sb_secret_|service_role|storage\/v1\/object\/(?:sign|authenticated)\/match-proofs|user_[A-Za-z0-9]{20,})/.test(document.body.innerText)).catch(() => false);
      if (!captureSafe || result.layout?.privateEvidenceExposed) result.screenshot = null;
      else await page.screenshot({ path: path.join(output, result.screenshot), fullPage: true, animations: "disabled" });
      results.push(result);
      writeFileSync(path.join(output, "summary.json"), JSON.stringify({ origin, mode, mutations: false, results }, null, 2));
      console.log(JSON.stringify({ locale, width, route, passed: result.passed, failure: result.failure }));
    }
    await context.close();
  }
} catch {
  console.error(JSON.stringify({ mode, fatal: true, failure: "Hosted setup or capture failed; sensitive details suppressed" }));
  process.exitCode = 1;
} finally {
  try { await browser.close(); } catch { process.exitCode = 1; console.error("Browser cleanup failed; details suppressed"); }
  try { if (authentication) sessionCleanup = await authentication.close(); } catch { process.exitCode = 1; console.error("Temporary session cleanup failed; details suppressed"); }
  try { if (previewAccess) previewAccess.revoke(); } catch { process.exitCode = 1; console.error("Temporary Preview grant revocation failed; details suppressed"); }
}
writeFileSync(path.join(output, "summary.json"), JSON.stringify({ origin, mode, mutations: false, sessionCleanup, results }, null, 2));
console.log(JSON.stringify({ mode, total: results.length, passed: results.filter((result) => result.passed).length, sessionCleanup, output }));
if (results.some((result) => !result.passed)) process.exitCode = 1;
