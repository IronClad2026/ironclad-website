import { randomUUID } from "node:crypto";

import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { installRendererObservation, openQuickAction } from "./menu-journey.mjs";

const suggestionPath = "/api/ready/suggestions";
const usagePath = "/api/ready/usage";
const adminPath = "/admin/ready-usage?view=suggestions";
const prompt = "Something missing, Commander? Tell us which topic or question you wanted Ready to cover.";
const success = "Suggestion received, Commander. The IronClad team can now review it and improve my menu.";

async function findClerkCacheAction(origin, protectedHeader, oidc) {
  const read = async (url) => {
    const response = await fetch(url, {
      headers: { [protectedHeader]: oidc }, redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (response.status !== 200) throw new Error("Could not load the guarded Clerk authentication asset");
    return response.text();
  };
  const html = await read(origin + "/sign-in");
  const paths = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g), (match) => new URL(match[1].replaceAll("&amp;", "&"), origin));
  const local = new Set(paths.filter((url) => url.origin === origin && url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js"))
    .map((url) => url.href));
  if (local.size === 0 || local.size > 40) throw new Error("Unexpected Clerk assets");
  const chunks = await Promise.all(Array.from(local, read));
  const actions = new Set(chunks.flatMap((chunk) => Array.from(
    chunk.matchAll(/createServerReference\)\("([a-f0-9]{40,64})",[^()]*"invalidateCacheAction"\)/g),
    (match) => match[1],
  )));
  if (actions.size !== 1) throw new Error("Authentication cache refresh is not uniquely identified");
  return [...actions][0];
}

export async function browserSuggestionsJourney({ origin, oidc, protectedHeader, envRoot, clerkIssuer, admin, verify }) {
  const { chromium, expect } = await import("@playwright/test");
  const auth = await createHostedAuth({ environmentDirectory: envRoot, origin });
  const known = new Map();
  let browser;
  let authResult;
  let clerkCacheAction;

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
    const submissions = new Map();
    let signIn = false;
    let loseResponse = mobile;
    let analyticsLeak = false;
    let unintendedAnalyticsWrites = 0;
    let activeDescription;
    let restoreConsent = false;
    const page = await context.newPage();
    const protocol = await context.newCDPSession(page);
    await protocol.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    protocol.on("Fetch.requestPaused", (event) => {
      const { requestId, responseStatusCode, responseErrorReason } = event;
      const send = (method, data) => protocol.send(method, { requestId, ...data });
      const refuse = () => send("Fetch.failRequest", { errorReason: "BlockedByClient" });

      async function release() {
        const { request } = event;
        const url = new URL(request.url);
        if (responseStatusCode !== undefined || responseErrorReason) {
          attempts.push({ submissionId: submissions.get(requestId), status: responseStatusCode });
          submissions.delete(requestId);
          if (loseResponse) {
            loseResponse = false;
            return send("Fetch.failRequest", { errorReason: "Failed" });
          }
          return send("Fetch.continueResponse");
        }

        const reading = ["GET", "HEAD"].includes(request.method);
        if (url.origin !== origin) {
          if ((url.hostname.endsWith(".supabase.co") && url.hostname !== "zzbnneprhjicmajpjkdg.supabase.co") ||
            (url.hostname.endsWith(".clerk.accounts.dev") && url.origin !== clerkIssuer)) return refuse();
          const clerkWrite = url.origin === clerkIssuer && (signIn || request.method === "OPTIONS" ||
            url.pathname === "/v1/client" || /^\/v1\/client\/sessions\/sess_[a-z0-9]+\/(tokens|touch)$/i.test(url.pathname));
          return reading || clerkWrite ? send("Fetch.continueRequest") : refuse();
        }

        const requestHeaders = Object.entries(request.headers);
        const nextAction = requestHeaders.find(([name]) => name.toLowerCase() === "next-action")?.[1];
        const authRefresh = signIn && request.method === "POST" && nextAction === clerkCacheAction &&
          ["/sign-in", "/tournaments", "/account/public-profile-notice"].includes(url.pathname) && request.postData?.trim() === "[]";
        const submitting = request.method === "POST" && url.pathname === suggestionPath;
        const collecting = request.method === "POST" && url.pathname === usagePath;
        if (collecting && !reviewer) {
          unintendedAnalyticsWrites++;
          return refuse();
        }
        if (!reading && !submitting && !collecting && !authRefresh) return refuse();

        if (submitting) {
          const payload = JSON.parse(request.postData);
          if (!activeDescription || payload?.description !== activeDescription || !/^[a-f0-9-]{36}$/.test(payload?.submissionId)) return refuse();
          known.set(payload.submissionId, activeDescription);
          submissions.set(requestId, payload.submissionId);
        }
        if (collecting) {
          const usage = JSON.parse(request.postData);
          analyticsLeak ||= usage?.event?.type === "topic_missing" ||
            (Boolean(activeDescription) && Boolean(request.postData?.includes(activeDescription)));
          if (analyticsLeak) return refuse();
          // Observe the payload without adding fixture events to the report.
          if (usage?.kind === "event") return send("Fetch.fulfillRequest", {
            responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }],
            body: Buffer.from('{"accepted":true}').toString("base64"),
          });
          if (usage?.kind !== "choice" || typeof usage.enabled !== "boolean") return refuse();
        }

        const headers = requestHeaders.filter(([name]) => name.toLowerCase() !== protectedHeader)
          .map(([name, value]) => ({ name, value: String(value) }));
        return send("Fetch.continueRequest", {
          headers: [...headers, { name: protectedHeader, value: oidc }],
          ...(submitting ? { interceptResponse: true } : {}),
        });
      }
      void release().catch(() => refuse().catch(() => undefined));
    });
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
      await page.goto(origin + "/rules", { waitUntil: "domcontentloaded" });
      verify(true, `${label} checks the current app identity`);
      await page.waitForFunction((userId) => userId === null ? !window.Clerk?.user
        : window.Clerk?.loaded && window.Clerk.user?.id === userId,
        identity?.userId ?? null, { timeout: 30_000 });
      if (reviewer) {
        const initialChoice = await choice();
        verify(initialChoice.status === 200 && typeof initialChoice.enabled === "boolean", "designated reviewer analytics choice is available");
        restoreConsent = initialChoice.enabled === false;
        if (restoreConsent) {
          const updated = await choice(true);
          verify(updated.status === 200 && updated.enabled === true, "opted in the designated analytics fixture for this test");
          // Reload so Ready reads the confirmed choice from the server before opening.
          await page.reload({ waitUntil: "domcontentloaded" });
        }
        verify((await choice()).enabled === true, "reviewer suggestion is exercised with analytics enabled");
      } else if (identity) {
        const initialChoice = await choice();
        verify(initialChoice.status === 403 || (initialChoice.status === 200 && initialChoice.enabled === false),
          `${label} has no enabled analytics (HTTP ${initialChoice.status})`);
      }

      verify(true, `${label} opens Ready and its missing-topic form in visible Chrome`);
      await expect(page.locator("button[data-ready-dock]")).toBeEnabled({ timeout: 20_000 });
      verify(true, `${label} hydrates the dock button`);
      if (mobile) await page.locator("button[data-ready-dock]").tap();
      else await page.locator("button[data-ready-dock]").click();
      verify(true, `${label} activates the dock button`);
      await expect(page.locator("[data-mode='floating'][data-asset-status='ready']")).toHaveCount(1, { timeout: 20_000 });
      verify(true, `${label} loads the rendered mascot`);
      await openQuickAction(page, "Help", mobile);
      verify(true, `${label} activates Help`);
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
      verify(!analyticsLeak && unintendedAnalyticsWrites === 0,
        `${label} did not send suggestion text or a historical topic flag to analytics`);

      if (!reviewer) {
        verify(true, `${label} attempts the admin suggestions route`);
        const denied = await page.evaluate(async ({ path, candidate }) => {
          const response = await fetch(path, { cache: "no-store" });
          const html = await response.text();
          const concealed = [401, 403, 404].includes(response.status) || response.redirected ||
            html.includes("NEXT_REDIRECT") || html.includes("Administrator access required");
          return concealed && !html.includes(candidate);
        }, { path: adminPath, candidate: activeDescription });
        verify(denied, `${label} cannot access the admin suggestions report or its submitted text`);
      }
    } catch (error) {
      const details = await page.evaluate(() => ({
        path: location.pathname,
        dock: document.querySelector("[data-ready-dock]")?.tagName,
        mode: document.querySelector("[data-mode][data-asset-status]")?.getAttribute("data-mode"),
        asset: document.querySelector("[data-mode][data-asset-status]")?.getAttribute("data-asset-status"),
        view: document.querySelector("[data-ready-view]")?.getAttribute("data-ready-view"),
        hasField: Boolean(document.querySelector("#ironclad-assistant textarea")),
        clerk: window.Clerk?.loaded === true,
      })).catch(() => ({}));
      const phase = error?.readySuggestionFailure ?? `${error?.name === "TimeoutError" ? "Browser timed out" : "Browser assertion failed"} ${JSON.stringify(details)}`;
      throw Object.assign(new Error(phase), { readySuggestionFailure: phase });
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
    verify(true, "identifying the exact Staging sign-in cache refresh action");
    clerkCacheAction = await findClerkCacheAction(origin, protectedHeader, oidc);
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
      verify(authResult.temporarySessionsCreated === authResult.temporarySessionsRevoked, "temporary Clerk suggestion review sessions revoked");
    }
  }
  return authResult;
}
