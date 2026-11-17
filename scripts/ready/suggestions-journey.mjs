import { randomUUID } from "node:crypto";

import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { installRendererObservation, openQuickAction } from "./menu-journey.mjs";

const suggestionPath = "/api/ready/suggestions";
const usagePath = "/api/ready/usage";
const adminPath = "/admin/ready-usage?view=suggestions";
const prompt = "Something missing, Commander? Tell us which topic or question you wanted Ready to cover.";
const success = "Suggestion received, Commander. The IronClad team can now review it and improve my menu.";

export async function browserSuggestionsJourney({ origin, oidc, protectedHeader, envRoot, clerkIssuer, admin, verify }) {
  const { chromium, expect } = await import("@playwright/test");
  const auth = await createHostedAuth({ environmentDirectory: envRoot, origin });
  const known = new Map();
  let browser;
  let authResult;

  async function findFixtures() {
    const rows = [];
    // Keep only known fixture rows in memory beyond the page read.
    for (let offset = 0; offset < 100000; offset += 50) {
      const { data, error } = await admin.rpc("get_ready_topic_suggestions", { p_status: null, p_limit: 50, p_offset: offset });
      if (error || !Array.isArray(data?.rows)) throw new Error("Suggestion fixture read failed");
      rows.push(...data.rows.filter((row) => known.get(row.id) === row.description));
      if (data.rows.length < 50 || offset + data.rows.length >= data.total || rows.length >= known.size) return rows;
    }
    throw new Error("Suggestion fixture pagination exceeded bounds");
  }

  async function cleanFixtures() {
    if (!known.size) return;
    const rows = await findFixtures();
    await Promise.all(rows.map(async ({ id }) => {
      const { data, error } = await admin.rpc("review_ready_topic_suggestion", { p_id: id, p_status: null, p_delete: true });
      if (error || data !== "deleted") throw new Error("Suggestion fixture cleanup failed");
    }));
    verify((await findFixtures()).length === 0, "deleted only the fixtures created by this suggestion journey");
  }

  async function journey({ label, identity, mobile = false, reviewer = false }) {
    verify(true, `starting ${label} suggestion journey`);
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
      hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1,
    });
    // This context deliberately creates no screenshots, video, or traces.
    await context.addInitScript(installRendererObservation);
    const attempts = [];
    let signIn = false;
    let loseResponse = mobile;
    let analyticsLeak = false;
    let activeDescription;
    let restoreConsent = false;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reading = ["GET", "HEAD"].includes(request.method());
      if (url.origin !== origin) {
        const clerkWrite = url.origin === clerkIssuer && (signIn ||
          /^\/v1\/client\/sessions\/sess_[a-z0-9]+\/tokens(?:\/|$)/i.test(url.pathname));
        return reading || clerkWrite ? route.continue() : route.abort();
      }
      const submitting = request.method() === "POST" && url.pathname === suggestionPath;
      const collecting = request.method() === "POST" && url.pathname === usagePath;
      if (collecting && !reviewer) return route.abort();
      if (!reading && !submitting && !collecting) return route.abort();

      try {
        let submissionId;
        if (submitting) {
          const payload = request.postDataJSON();
          if (!activeDescription || payload?.description !== activeDescription || !/^[a-f0-9-]{36}$/.test(payload?.submissionId)) return route.abort();
          submissionId = payload.submissionId;
          known.set(submissionId, activeDescription);
        }
        if (collecting) {
          const usage = request.postDataJSON();
          analyticsLeak ||= usage?.event?.type === "topic_missing" ||
            (Boolean(activeDescription) && Boolean(request.postData()?.includes(activeDescription)));
          if (analyticsLeak) return route.abort();
          // Observe the payload without adding fixture events to the report.
          if (usage?.kind === "event") return route.fulfill({ status: 200, json: { accepted: true } });
          if (usage?.kind !== "choice" || typeof usage.enabled !== "boolean") return route.abort();
        }

        const response = await route.fetch({ headers: { ...request.headers(), [protectedHeader]: oidc }, maxRedirects: 0 });
        if (submitting) {
          attempts.push({ submissionId, status: response.status() });
          if (loseResponse) {
            loseResponse = false;
            await response.dispose();
            return route.abort("failed");
          }
        }
        await route.fulfill({ response });
      } catch {
        await route.abort().catch(() => undefined);
      }
    });

    const page = await context.newPage();
    const button = (name) => page.getByRole("button", { name, exact: true });
    const choose = (name) => mobile ? button(name).tap() : button(name).click();
    const choice = async (enabled) => page.evaluate(async ({ path, value }) => {
      const response = await fetch(path, value === undefined ? { cache: "no-store" } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "choice", enabled: value }),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, enabled: body?.enabled };
    }, { path: usagePath, value: enabled });

    async function speaking() {
      await expect.poll(() => page.evaluate(() => {
        const pose = globalThis.readyAcceptancePose?.();
        const dialogue = document.querySelector("[data-mascot-dialogue][data-revealing]");
        return Boolean(dialogue?.querySelector("[data-mascot-message]")?.textContent && pose?.talkWeight > .08
          && Math.abs(pose.jaw - pose.restingJaw) > .01);
      }), { timeout: 6000 }).toBe(true);
    }

    try {
      if (identity) {
        verify(true, `${label} authenticates through an existing synthetic Clerk Development identity`);
        signIn = true;
        try { await auth.signIn(page, identity); } finally { signIn = false; }
      }
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((userId) => window.Clerk?.loaded && (window.Clerk.user?.id ?? null) === userId,
        identity?.userId ?? null, { timeout: 30_000 });
      const initialChoice = await choice();
      if (reviewer) {
        verify(initialChoice.status === 200 && typeof initialChoice.enabled === "boolean", "designated reviewer analytics choice is available");
        restoreConsent = initialChoice.enabled === false;
        if (restoreConsent) {
          const updated = await choice(true);
          verify(updated.status === 200 && updated.enabled === true, "opted in the designated analytics fixture for this test");
          // Reload so Ready reads the confirmed choice from the server before opening.
          await page.reload({ waitUntil: "domcontentloaded" });
        }
        verify((await choice()).enabled === true, "reviewer suggestion is exercised with analytics enabled");
      } else {
        verify(initialChoice.status === 403 || (initialChoice.status === 200 && initialChoice.enabled === false),
          `${label} has no enabled analytics`);
      }

      verify(true, `${label} opens Ready and its missing-topic form in visible Chrome`);
      await expect(page.locator("button[data-ready-dock]")).toBeEnabled({ timeout: 20_000 });
      if (mobile) await page.locator("button[data-ready-dock]").tap();
      else await page.locator("button[data-ready-dock]").click();
      await expect(page.locator("[data-mode='floating'][data-asset-status='ready']")).toHaveCount(1, { timeout: 20_000 });
      await openQuickAction(page, "Help", mobile);
      if (identity) await choose("Rules & match help");
      await choose("Topic missing");
      const message = page.locator("[data-mascot-message]");
      await expect(message).toHaveText(prompt, { timeout: 18_000 });
      const field = page.getByRole("textbox", { name: "Which topic or question is missing?" });
      await expect(field).toHaveAttribute("maxlength", "500");
      await expect(button("Send suggestion")).toBeDisabled();

      activeDescription = `Synthetic Ready review fixture ${randomUUID()}. A menu topic for this test only.`;
      await field.fill(activeDescription);
      verify(attempts.length === 0, `${label} typing does not submit any text`);
      const firstPost = page.waitForRequest((request) => request.method() === "POST" && request.url() === origin + suggestionPath);
      await choose("Send suggestion");
      await firstPost;

      if (mobile) {
        verify(true, "deliberately dropped the guest fixture's successful network response");
        await speaking();
        await expect(message).toContainText("Your draft is still here.", { timeout: 18_000 });
        verify(await field.evaluate((element, expected) => element.value === expected, activeDescription),
          "guest draft survives receipt failure and its reply moves the jaw");
        await choose("Send suggestion");
        await speaking();
      }
      await expect(message).toHaveText(success, { timeout: 18_000 });
      verify(attempts.length === (mobile ? 2 : 1) && attempts.every(({ status }) => status === 200) &&
        new Set(attempts.map(({ submissionId }) => submissionId)).size === 1,
      `${label} reaches the hosted save endpoint and receives confirmed success`);
      const matching = (await findFixtures()).filter((row) => row.id === attempts[0].submissionId);
      verify(matching.length === 1 && matching[0].categoryId === (identity ? "rules" : null) &&
        Boolean(matching[0].menuVersion) && Boolean(matching[0].catalogueVersion),
      `${label} persisted exactly one row with correct category and version context`);
      verify(!analyticsLeak, `${label} did not send suggestion text or a historical topic flag to analytics`);

      if (!reviewer) {
        verify(true, `${label} attempts the admin suggestions route`);
        const response = await page.goto(origin + adminPath, { waitUntil: "domcontentloaded" });
        const denied = !new URL(page.url()).pathname.startsWith("/admin/ready-usage") ||
          [401, 403, 404].includes(response?.status()) ||
          await page.getByText("Administrator access required", { exact: false }).count() > 0;
        verify(denied, `${label} cannot access the admin suggestions report`);
      }
    } finally {
      try {
        if (restoreConsent) {
          const restored = await choice(false);
          verify(restored.status === 200 && restored.enabled === false, "restored the designated reviewer's previous analytics choice");
        }
      } finally {
        await context.close();
      }
    }
  }

  try {
    browser = await chromium.launch({ channel: "chrome", headless: false });
    await journey({ label: "Signed-out visitor at 390×780 touch emulation", mobile: true });
    await journey({ label: "Ordinary signed-in player on desktop", identity: await auth.fixture("TestAcademy3") });
    await journey({ label: "Opted-in reviewer on desktop", identity: await auth.fixture("TestAcademy1"), reviewer: true });
  } finally {
    try {
      await browser?.close();
      await cleanFixtures();
    } finally {
      authResult = await auth.close();
    }
  }
  return authResult;
}
