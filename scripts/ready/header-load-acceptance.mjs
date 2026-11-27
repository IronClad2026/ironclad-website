// Read-only browser evidence for Ready's cold header paints on protected Staging.
// Run via Vercel env run with the Development environment's short-lived OIDC token.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { installRendererObservation } from "./menu-journey.mjs";

const staging = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const team = "ironclad-tournaments";
const clerkOrigin = "https://guided-goshawk-34.clerk.accounts.dev";
const trustedHeader = "x-vercel-trusted-oidc-idp-token";
const inlinePoster = "data:image/webp;base64,";
const modelPath = "/mascot-v6/assets/ironclad.glb";
const oldLogo = "/images/ironclad-logo.png";
const dock = "[data-ready-dock]";
const readySurface = "[data-asset-status='ready'][data-mode='dock']";
const exec = promisify(execFile);

const { values: options } = parseArgs({ options: {
  url: { type: "string" }, deployment: { type: "string" }, commit: { type: "string" },
  "vercel-cli": { type: "string" }, artifacts: { type: "string" }, baseline: { type: "boolean" },
  "guest-only": { type: "boolean" }, "ordinary-only": { type: "boolean" }, headless: { type: "boolean" },
  "environment-dir": { type: "string", default: "C:/Users/pc/Documents/IronClad/03_Website/ironclad-website" },
} });
assert.match(options.url ?? "", /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app\/?$/);
assert.match(options.deployment ?? "", /^dpl_[a-zA-Z0-9]+$/);
assert.match(options.commit ?? "", /^[a-f0-9]{40}$/);
assert.equal(basename(options["vercel-cli"] ?? ""), "vc.js");
assert(options.artifacts, "Set an output directory for browser evidence");
assert(!(options["ordinary-only"] && (options["guest-only"] || options.baseline)));
const directory = resolve(options.artifacts);
const token = process.env.VERCEL_OIDC_TOKEN ?? "";
assert(/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token), "Run through Vercel CLI with in-memory protection access");
assert(JSON.parse(Buffer.from(token.split(".")[1], "base64url")).exp * 1000 > Date.now(), "Vercel token expired");

async function vercel(path) {
  const { stdout } = await exec(process.execPath,
    [resolve(options["vercel-cli"]), "api", path, "--method", "GET", "--scope", team],
    { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}

async function verifyStaging() {
  const [deployment, alias] = await Promise.all([
    vercel("/v13/deployments/" + options.deployment),
    vercel("/v4/aliases/" + new URL(staging).hostname),
  ]);
  assert(deployment.id === options.deployment && deployment.projectId === project &&
    deployment.url === new URL(options.url).hostname && deployment.readyState === "READY" &&
    deployment.target !== "production" && alias.deploymentId === deployment.id &&
    (deployment.meta?.githubCommitRef ?? deployment.meta?.gitCommitRef ?? deployment.gitSource?.ref) === "staging" &&
    (deployment.meta?.githubCommitSha ?? deployment.meta?.gitCommitSha ?? deployment.gitSource?.sha) === options.commit,
  "The canonical alias must point to the exact protected Staging deployment");
}

async function readAsset(path) {
  const response = await fetch(staging + path, {
    headers: { [trustedHeader]: token }, redirect: "error", signal: AbortSignal.timeout(16000),
  });
  assert.equal(response.status, 200, "Protected Staging asset must load");
  return response;
}

async function loadClerkCacheAction() {
  const body = await (await readAsset("/sign-in")).text();
  const paths = new Set(Array.from(body.matchAll(/<script[^>]+src="([^"]+)"/g),
    (match) => new URL(match[1].replaceAll("&amp;", "&"), staging))
    .filter((url) => url.origin === staging && url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js"))
    .map((url) => url.pathname));
  assert(paths.size > 0 && paths.size <= 40);
  const chunks = await Promise.all(Array.from(paths, async (path) => (await readAsset(path)).text()));
  const ids = new Set(chunks.flatMap((chunk) => Array.from(
    chunk.matchAll(/createServerReference\)\("([a-f0-9]{40,64})",[^()]*"invalidateCacheAction"\)/g),
    (match) => match[1],
  )));
  assert.equal(ids.size, 1, "Find the single cache-invalidation action used during synthetic sign-in");
  return [...ids][0];
}

function watchHeader({ disableWebGL }) {
  if (disableWebGL) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind.startsWith("webgl") || kind === "experimental-webgl" ? null : getContext.call(this, kind, ...args);
    };
  }
  const samples = [];
  let previous = "";
  let paintedAt;
  new PerformanceObserver((entries) => {
    paintedAt = entries.getEntries().find((entry) => entry.name === "first-contentful-paint")?.startTime ?? paintedAt;
  }).observe({ type: "paint", buffered: true });
  function measure(time) {
    const element = document.querySelector("[data-ready-dock]");
    if (element) {
      const image = element.querySelector("img");
      const surface = document.querySelector("[data-mode='dock'][data-asset-status='ready']");
      const bounds = element.getBoundingClientRect();
      const rendered = surface?.getBoundingClientRect();
      const display = getComputedStyle(element);
      const art = image?.currentSrc || image?.src;
      const sample = {
        path: art?.startsWith("data:image/webp;base64,") ? "inline-ready-webp" : art ? new URL(art, location.href).pathname : null,
        poster: Boolean(image?.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === "visible"),
        docked: element.getAttribute("aria-expanded") !== "true",
        sized: bounds.width >= 45 && bounds.width <= 60 && bounds.height >= 45 && bounds.height <= 60 &&
          display.visibility === "visible" && display.display !== "none",
        live: Boolean(rendered && getComputedStyle(surface).visibility === "visible" &&
          Math.abs(rendered.x - bounds.x) < 2 && Math.abs(rendered.y - bounds.y) < 2 &&
          Math.abs(rendered.width - bounds.width) < 2 && Math.abs(rendered.height - bounds.height) < 2),
        status: element.dataset.readyStatus ?? null,
      };
      const hash = JSON.stringify(sample);
      if (previous !== hash) {
        samples.push({ time: Math.round(time), ...sample });
        previous = hash;
      }
    }
    requestAnimationFrame(measure);
  }
  globalThis.readyHeaderProof = () => ({ paintedAt, samples });
  requestAnimationFrame(measure);
}

async function guardedPage(browser, { mobile, reduced, failModel, disableWebGL, record, clerkCacheAction }) {
  const size = mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference", serviceWorkers: "block",
    ...(record ? { recordVideo: { dir: directory, size } } : {}),
  });
  await context.addInitScript(watchHeader, { disableWebGL });
  await context.addInitScript(installRendererObservation);
  const page = await context.newPage();
  const protocol = await context.newCDPSession(page);
  await protocol.send("Network.enable");
  await protocol.send("Network.setCacheDisabled", { cacheDisabled: true });
  let signIn = false;
  let holdModel = true;
  const modelRequests = [];
  const finish = () => {
    holdModel = false;
    for (const proceed of modelRequests.splice(0)) proceed();
  };
  const block = (requestId) => protocol.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  protocol.on("Fetch.requestPaused", ({ requestId, request }) => {
    const url = new URL(request.url);
    const read = request.method === "GET" || request.method === "HEAD";
    const headers = Object.entries(request.headers).filter(([name]) => name.toLowerCase() !== trustedHeader)
      .map(([name, value]) => ({ name, value: String(value) }));
    const proceed = (authHeaders = headers) => protocol.send("Fetch.continueRequest", { requestId, headers: authHeaders });
    const reject = () => block(requestId).catch(() => undefined);
    function release() {
      if (url.origin !== staging) {
        if ((url.hostname.endsWith(".supabase.co") && url.hostname !== "zzbnneprhjicmajpjkdg.supabase.co") ||
          (url.hostname.endsWith(".clerk.accounts.dev") && url.origin !== clerkOrigin)) return reject();
        const sessionMaintenance = request.method === "POST" &&
          (url.pathname === "/v1/client" || /^\/v1\/client\/sessions\/sess_[a-zA-Z0-9]+\/(tokens|touch)$/.test(url.pathname));
        return (read || (url.origin === clerkOrigin && (signIn || sessionMaintenance || request.method === "OPTIONS")))
          ? proceed().catch(reject) : reject();
      }
      const nextAction = headers.find(({ name }) => name.toLowerCase() === "next-action")?.value;
      const clerkRefresh = signIn && clerkCacheAction && request.method === "POST" && nextAction === clerkCacheAction &&
        url.pathname === "/sign-in" && request.postData?.trim() === "[]";
      if (!read && !clerkRefresh) return reject();
      const allowed = () => proceed([...headers, { name: trustedHeader, value: token }]).catch(reject);
      if (url.pathname === modelPath) {
        if (failModel) return reject();
        if (holdModel && !signIn) {
          modelRequests.push(allowed);
          return;
        }
      }
      return allowed();
    }
    void release();
  });
  await protocol.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  return {
    context, page, finish,
    async captureDock(clip, path) {
      // Capture the whole viewport. Playwright's clipped screenshot can rescale a
      // concurrent screencast frame; crop the returned pixels outside the browser.
      const { data } = await protocol.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const image = await sharp(Buffer.from(data, "base64")).extract(clip).png().toBuffer();
      await writeFile(path, image);
      return image;
    },
    async signIn(operation) { signIn = true; try { await operation(); } finally { signIn = false; } },
    async throttle() {
      // Emulate a cache-disabled 10 Mbps connection with 180 ms round-trip delay.
      // The separately held model makes the poster before/after states observable.
      await protocol.send("Network.emulateNetworkConditions", {
        offline: false, latency: 180, downloadThroughput: 1_250_000, uploadThroughput: 300_000,
        connectionType: "cellular4g",
      });
    },
  };
}

async function readHeader(page) {
  return page.evaluate(() => globalThis.readyHeaderProof());
}

function assertHeader(trace, { expectLive } = {}) {
  const states = trace.samples.filter((sample) => sample.sized && sample.docked);
  assert(states.length > 0, "Dock must have its final dimensions from the earliest styled frames");
  assert(!states.some((sample) => sample.path === oldLogo), "Old IronClad logo appeared in Ready's dock");
  const fcp = trace.paintedAt;
  assert(Number.isFinite(fcp), "Measure first contentful paint");
  const firstPaintIndex = states.findLastIndex((sample) => sample.time <= fcp + 17);
  const visibleStates = states.slice(Math.max(0, firstPaintIndex));
  assert(visibleStates[0]?.poster && visibleStates[0]?.path === "inline-ready-webp", "First styled header paint must show Ready's decoded poster");
  assert(visibleStates.every((sample) => sample.poster || sample.live), "Detected a blank dock after first paint");
  if (expectLive) assert(visibleStates.some((sample) => sample.live && sample.status === "ready"), "Live canvas must cover the same dock");
  return { firstContentfulPaintMs: fcp, initialPosterMs: visibleStates[0].time, states: visibleStates };
}

async function compareHandoff(poster, canvas) {
  const first = await sharp(poster).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const next = await sharp(canvas).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(first.info, next.info, "Handoff did not keep its original screenshot dimensions");
  const lit = (image) => {
    const { data, info: { channels, width } } = image;
    const edges = { left: width, right: -1, top: width, bottom: -1, count: 0 };
    for (let index = 0; index < data.length; index += channels) {
      // The header is charcoal while the lit bone, kit and cigar carry distinct color.
      if (data[index] < 60 || data[index] - data[index + 2] < 12) continue;
      const pixel = index / channels;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      edges.left = Math.min(edges.left, x);
      edges.right = Math.max(edges.right, x);
      edges.top = Math.min(edges.top, y);
      edges.bottom = Math.max(edges.bottom, y);
      edges.count++;
    }
    return edges;
  };
  const posterEdges = lit(first);
  const canvasEdges = lit(next);
  assert(posterEdges.count >= 200 && canvasEdges.count >= 200, "Both docked images must paint the lit skull");
  const maxEdgeDelta = Math.max(...["left", "right", "top", "bottom"].map((key) => Math.abs(posterEdges[key] - canvasEdges[key])));
  assert(maxEdgeDelta <= 4, "The first live skull must occupy the poster's position and size");
  let total = 0;
  for (let i = 0; i < first.data.length; i++) total += Math.abs(first.data[i] - next.data[i]);
  const difference = total / first.data.length;
  assert(difference < 24, "Docked poster and the first live frame differ visibly");
  return { rgbDifference: Number(difference.toFixed(2)), maxEdgeDelta, canvasEdges, posterEdges };
}

async function checkJourney(browser, config) {
  const { label, path, mobile, failModel, disableWebGL, identity, auth, record, reduced } = config;
  const browserPage = await guardedPage(browser, config);
  const { page, context, finish } = browserPage;
  let video;
  try {
    if (identity) await browserPage.signIn(() => auth.signIn(page, identity));
    await browserPage.throttle();
    const response = await page.goto(staging + path, { waitUntil: "commit", timeout: 40000 });
    assert.equal(response?.status(), 200, "Direct navigation to exact Staging route");
    if (options.baseline) {
      const old = page.locator(`${dock} img[src*="${oldLogo}"]`);
      await expect(old).toBeVisible({ timeout: 18000 }).catch(async () => {
        const trace = await readHeader(page);
        await writeFile(resolve(directory, "baseline-trace.json"), JSON.stringify(trace, null, 2));
        throw new Error("Could not show the old image before model load; inspect baseline trace");
      });
      await expect.poll(() => old.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: resolve(directory, label + "-old-logo.png") });
      return { label, path, observed: "Old non-Ready logo visible in the dock before the model loaded" };
    }
    const initial = page.locator(`${dock} [data-ready-poster]`);
    await expect(initial).toBeVisible({ timeout: 30000 });
    await expect.poll(() => initial.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    // Capture the unhydrated server image as well as the React replacement.
    const html = await response.text();
    assert.match(html, /data-ready-dock/);
    assert(html.includes(inlinePoster), "Server-rendered html must contain the same Ready poster");
    await expect(page.locator(`button${dock}`)).toBeVisible({ timeout: 45000 });
    if (identity) {
      // This existing synthetic account can open Dashboard with a badge prompt.
      // Close it locally to measure the header without its screen-wide dimmer.
      const badge = page.locator('[role="dialog"][aria-labelledby^="badge-reveal-"]');
      if (await badge.isVisible()) {
        const dismiss = badge.getByRole("button", { name: "Not now", exact: true });
        if (mobile) await dismiss.tap();
        else await dismiss.click();
        await expect(badge).toHaveCount(0);
      }
    }
    const bounds = await page.locator(dock).boundingBox();
    assert(bounds, "Dock bounding box");
    const clip = { left: Math.round(bounds.x), top: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
    const poster = await browserPage.captureDock(clip, resolve(directory, label + "-poster.png"));
    let handoff;
    if (!failModel && !disableWebGL) {
      finish();
      await expect(page.locator(readySurface)).toBeVisible({ timeout: 75000 });
      const first = await browserPage.captureDock(clip, resolve(directory, label + "-first-live.png"));
      handoff = await compareHandoff(poster, first);
    } else {
      await expect(page.locator(`${dock}[data-ready-status="error"]`)).toBeVisible({ timeout: 45000 });
      await expect(initial).toBeVisible();
    }
    const initialLoad = assertHeader(await readHeader(page), { expectLive: !failModel && !disableWebGL });
    const choose = (locator) => mobile ? locator.tap() : locator.click();
    if (failModel || disableWebGL) {
      await choose(page.getByRole("button", { name: "Open Ready, the IronClad assistant" }));
      const assistant = page.locator("#ironclad-assistant");
      await expect(assistant.locator("[data-ready-poster]")).toBeVisible();
      await expect(assistant.getByRole("button", { name: /kick some ass/ })).toBeVisible({ timeout: 18000 });
      const close = assistant.getByRole("button", { name: "Dock assistant" });
      if (!mobile) await assistant.locator("[data-mascot-drag]").hover();
      await choose(close);
      await expect(initial).toBeVisible();
    } else if (!identity && !reduced && !mobile) {
      // Keep the capture running through the first observable docked idle movement.
      await expect.poll(() => page.evaluate(() => {
        const pose = globalThis.readyAcceptancePose?.()?.headPose;
        return pose ? Math.max(Math.abs(pose.pitch), Math.abs(pose.yaw), Math.abs(pose.roll)) : 0;
      }), { timeout: 14500 }).toBeGreaterThan(.015);
      const tournaments = page.getByRole("link", { name: "View Tournaments", exact: true }).first();
      await choose(tournaments);
      await expect(page).toHaveURL(staging + "/tournaments");
      await expect(page.locator(readySurface)).toBeVisible({ timeout: 30000 });
      assertHeader(await readHeader(page), { expectLive: true });
    }
    if (identity) {
      assert.equal(new URL(page.url()).pathname, path);
      await expect.poll(() => page.evaluate(() => Boolean(window.Clerk?.user))).toBe(true);
      await page.reload({ waitUntil: "commit", timeout: 35000 });
      await expect(initial).toBeVisible({ timeout: 20000 });
      await expect(page.locator(readySurface)).toBeVisible({ timeout: 75000 });
      assertHeader(await readHeader(page), { expectLive: true });
    }
    video = record ? page.video() : undefined;
    return { label, path, reduced: Boolean(reduced), failure: failModel ? "model request blocked" : disableWebGL ? "WebGL unavailable" : null,
      network: "cache disabled, 10 Mbps, 180 ms latency", handoff, initialLoad };
  } finally {
    finish();
    await context.close();
    if (video) {
      await video.saveAs(resolve(directory, label + ".webm"));
      await video.delete();
    }
  }
}

const result = { commit: options.commit, deployment: options.deployment, cases: [] };
let browser;
let auth;
try {
  await mkdir(directory, { recursive: true });
  await verifyStaging();
  if (!options.baseline) {
    const home = await (await readAsset("/")).text();
    const poster = home.match(/src="data:image\/webp;base64,([a-zA-Z0-9+/=]+)"/)?.[1];
    assert(poster, "Protected Home SSR should embed a WebP in its header");
    const bytes = Buffer.from(poster, "base64");
    const info = await sharp(bytes).metadata();
    assert(info.hasAlpha && info.format === "webp" && bytes.length <= 60000, "Poster must be lightweight transparent WebP");
    result.poster = { bytes: bytes.length, width: info.width, height: info.height };
  }
  browser = await chromium.launch({ channel: "chrome", headless: Boolean(options.headless) });
  const run = async (config) => {
    const checked = await checkJourney(browser, config);
    result.cases.push(checked);
    console.log(JSON.stringify({ verified: checked.label, route: checked.path, failure: checked.failure ?? null }));
  };
  if (options.baseline) {
    await run({ label: "previous-guest-desktop", path: "/" });
  } else {
    if (!options["ordinary-only"]) {
      await run({ label: "guest-desktop-cold-load", path: "/", record: true });
      await run({ label: "guest-mobile-cold-load", path: "/", mobile: true, record: true });
      await run({ label: "guest-mobile-model-failure", path: "/", mobile: true, failModel: true });
      await run({ label: "guest-reduced-motion-webgl-unavailable", path: "/", reduced: true, disableWebGL: true });
      await run({ label: "guest-reduced-motion-live", path: "/", reduced: true });
    }
    if (!options["guest-only"]) {
      const clerkCacheAction = await loadClerkCacheAction();
      auth = await createHostedAuth({ environmentDirectory: options["environment-dir"], origin: staging });
      const identity = await auth.fixture("TestAcademy3");
      await run({ label: "ordinary-desktop-dashboard", path: "/dashboard", identity, auth, clerkCacheAction });
      await run({ label: "ordinary-mobile-dashboard", path: "/dashboard", mobile: true, identity, auth, clerkCacheAction });
    }
  }
  await verifyStaging();
} finally {
  await browser?.close();
  if (auth) result.cleanup = await auth.close();
  await writeFile(resolve(directory, "header-load-report.json"), JSON.stringify(result, null, 2) + "\n");
}
