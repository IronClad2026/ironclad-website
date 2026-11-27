// Run via the linked Vercel project's `vercel env run` with an approved Staging deployment.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { createHostedAuth } from "../four-division/hosted-auth.mjs";
import { loadFixtureEnvironment, validateRuntimeGuards } from "../lib/staging-synthetic-uat.mjs";

const exec = promisify(execFile);
const origin = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const clerkOrigin = "https://guided-goshawk-34.clerk.accounts.dev";
const stagingBackend = "https://zzbnneprhjicmajpjkdg.supabase.co";
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const team = "ironclad-tournaments";
const trustedHeader = "x-vercel-trusted-oidc-idp-token";
const pagePath = "/profile/ready";
const statePath = "/api/ready/wardrobe";
const items = [
  { id: "eyewear_smoked_aviators", name: "Smoked Aviators", privateFiles: ["wearable.glb"] },
  { id: "mouth_cigarette", name: "Cigarette", privateFiles: ["wearable.glb", "repaired-bite.glb"] },
  { id: "face_clown_makeup", name: "Clown Makeup", privateFiles: ["upper-basecolor.png", "lower-basecolor.png"] },
];
const proof = { checks: [], screenshots: [], videos: [], skipped: [] };
const observedSessions = new Map();
let stage = "argument check";

function pass(check) {
  proof.checks.push(check);
  console.log(check);
}

function options() {
  const { values } = parseArgs({
    options: {
      "run-verified-staging": { type: "boolean" },
      deployment: { type: "string" },
      commit: { type: "string" },
      "vercel-cli": { type: "string" },
      "environment-dir": { type: "string" },
      covered: { type: "string" },
      ordinary: { type: "string" },
      headless: { type: "boolean" },
      "no-video": { type: "boolean" },
    },
  });
  assert(values["run-verified-staging"] && /^dpl_[A-Za-z0-9]+$/.test(values.deployment ?? "") &&
    /^[a-f0-9]{40}$/.test(values.commit ?? "") && /[\\/]vc\.js$/.test(values["vercel-cli"] ?? "") &&
    values["environment-dir"] && values.covered && values.ordinary && values.covered !== values.ordinary,
  "Provide verified deployment, commit, CLI, Staging environment and two distinct synthetic fixture aliases.");
  return values;
}

async function verifyDeployment(config) {
  async function read(path) {
    const { stdout } = await exec(process.execPath, [resolve(config["vercel-cli"]), "api", path,
      "--method", "GET", "--scope", team], { timeout: 20_000, maxBuffer: 512_000, windowsHide: true });
    return JSON.parse(stdout);
  }
  const [deployment, alias] = await Promise.all([
    read(`/v13/deployments/${config.deployment}`), read(`/v4/aliases/${new URL(origin).hostname}`),
  ]);
  const ref = deployment.meta?.githubCommitRef ?? deployment.meta?.gitCommitRef ?? deployment.gitSource?.ref;
  const sha = deployment.meta?.githubCommitSha ?? deployment.meta?.gitCommitSha ?? deployment.gitSource?.sha;
  assert(deployment.id === config.deployment && alias.deploymentId === deployment.id &&
    deployment.projectId === project && deployment.target !== "production" && deployment.readyState === "READY" &&
    ref === "staging" && sha === config.commit,
  "The canonical protected Staging alias must point to the requested non-Production READY commit.");
}

async function makeArtifacts() {
  assert(process.platform === "win32", "Wardrobe evidence requires the mounted Windows HDD 1T volume.");
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "[IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.VolumeLabel -eq 'HDD 1T' } | Select-Object -ExpandProperty Name"],
  { timeout: 12_000, windowsHide: true });
  const drive = stdout.trim();
  assert(/^[A-Z]:\\$/i.test(drive), "Exactly one mounted HDD 1T volume is required before writing evidence.");
  const wardrobe = await realpath(join(drive, "Gaming Content AI", "CoH3", "Assets", "3D Mascot", "Ready_Wardrobe"));
  assert(wardrobe.toLowerCase().startsWith(drive.toLowerCase()), "The wardrobe must resolve to HDD 1T.");
  await realpath(join(wardrobe, "AGENTS.md"));
  const pilot = join(wardrobe, "Staging_Pilot");
  await mkdir(pilot, { recursive: true });
  const pilotRoot = await realpath(pilot);
  assert(pilotRoot.toLowerCase().startsWith(wardrobe.toLowerCase() + sep), "The evidence folder must resolve under the HDD wardrobe.");
  const output = join(pilotRoot, `Hosted_${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const temporary = join(output, "Working");
  await mkdir(temporary, { recursive: true });
  process.env.TMP = temporary;
  process.env.TEMP = temporary;
  process.env.TMPDIR = temporary;
  return { output, temporary };
}

function trustedToken() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  assert(typeof token === "string" && token.split(".").length === 3, "Load the short-lived Vercel token in memory.");
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert(Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now(), "The short-lived Vercel token has expired.");
  return token;
}

async function findCacheAction(oidc) {
  const read = async (url) => {
    const response = await fetch(url, { headers: { [trustedHeader]: oidc }, redirect: "error", signal: AbortSignal.timeout(15_000) });
    assert(response.ok, "Protected Staging sign-in resources could not be read.");
    return response.text();
  };
  const html = await read(origin + "/sign-in");
  const assets = new Set(Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ([, source]) => new URL(source.replaceAll("&amp;", "&"), origin))
    .filter((url) => url.origin === origin && url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js"))
    .map((url) => url.href));
  assert(assets.size > 0 && assets.size <= 40, "Expected sign-in bundles were not found.");
  const scripts = await Promise.all([...assets].map(read));
  const actions = new Set(scripts.flatMap((script) => Array.from(
    script.matchAll(/createServerReference\)\("([a-f0-9]{40,64})",[^()]*"invalidateCacheAction"\)/g), ([, action]) => action)));
  assert(actions.size === 1, "Could not isolate Clerk's cache-only action for this deployment.");
  return [...actions][0];
}

async function makeBrowserView(browser, oidc, action, mobile = false) {
  const context = await browser.newContext({
    deviceScaleFactor: 1, viewport: mobile ? { width: 390, height: 780 } : { width: 1440, height: 900 },
    hasTouch: mobile, isMobile: mobile, serviceWorkers: "block",
  });
  const page = await context.newPage();
  const protocol = await context.newCDPSession(page);
  let changingAccount = false;
  let saving = false;
  let usagePosts = 0;
  let wardrobeSaves = 0;
  await protocol.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  protocol.on("Fetch.requestPaused", ({ requestId, request }) => {
    const url = new URL(request.url);
    const read = ["GET", "HEAD"].includes(request.method);
    const post = request.method === "POST";
    const refuse = () => protocol.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    const proceed = (headers) => protocol.send("Fetch.continueRequest", { requestId, ...(headers ? { headers } : {}) });
    let requestTask;
    if (url.origin === origin) {
      if (post && url.pathname === "/api/ready/usage") usagePosts += 1;
      const headers = Object.entries(request.headers).filter(([key]) => key.toLowerCase() !== trustedHeader);
      const callback = headers.find(([key]) => key.toLowerCase() === "next-action")?.[1];
      const cacheOnly = changingAccount && post && ["/", "/sign-in", pagePath].includes(url.pathname) &&
        callback === action && request.postData?.trim() === "[]";
      const save = saving && post && url.pathname === statePath && !url.search;
      if (save) wardrobeSaves += 1;
      requestTask = read || cacheOnly || save
        ? proceed([...headers, [trustedHeader, oidc]].map(([name, value]) => ({ name, value: String(value) })))
        : refuse();
    } else if ((url.hostname.endsWith(".supabase.co") && url.origin !== stagingBackend) ||
      (url.hostname.endsWith(".clerk.accounts.dev") && url.origin !== clerkOrigin)) {
      requestTask = refuse();
    } else {
      const sessionMaintenance = post && (url.pathname === "/v1/client" ||
        /^\/v1\/client\/sessions\/sess_[a-zA-Z0-9]+\/(?:tokens|touch)$/.test(url.pathname));
      requestTask = read || (url.origin === clerkOrigin && (changingAccount || sessionMaintenance || request.method === "OPTIONS"))
        ? proceed() : refuse();
    }
    void requestTask.catch(() => refuse().catch(() => undefined));
  });

  return {
    page, context, mobile, protocol,
    enableSaves: () => { saving = true; },
    disableSaves: () => { saving = false; },
    usagePosts: () => usagePosts,
    wardrobeSaves: () => wardrobeSaves,
    async switchAccount(operation) {
      changingAccount = true;
      try { await operation(); } finally { changingAccount = false; }
    },
  };
}

async function browserRequest(page, path, method = "GET", body = null) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method, cache: "no-store", redirect: "error",
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const type = response.headers.get("Content-Type");
    return { status: response.status, cache: response.headers.get("Cache-Control"), type,
      body: method !== "HEAD" && type?.includes("application/json") ? await response.json() : null };
  }, { path, method, body });
}

async function readState(page, access) {
  const state = await browserRequest(page, statePath);
  assert.equal(state.status, 200, "Expected the Wardrobe API, after Vercel authentication.");
  assert.match(state.cache ?? "", /\bno-store\b/);
  assert.equal(state.body?.access, access, "Wardrobe access did not match the current account.");
  assert(Array.isArray(state.body.itemIds) && state.body.itemIds.every((id) => items.some((item) => item.id === id)),
    "Saved selections contain only approved wardrobe IDs.");
  assert(state.body.sessionId === null || /^sess_[a-zA-Z0-9]+$/.test(state.body.sessionId), "Invalid session shape.");
  if (access === "locked") assert.equal(state.body.itemIds.length, 0, "Locked sessions must not receive a saved selection.");
  return state.body;
}

function asset(itemId, file) {
  return `${statePath}/assets/${itemId}/${file}`;
}

async function probeAssets(page, access) {
  for (const { id, privateFiles } of items) {
    const teaser = await browserRequest(page, asset(id, "fitted-blur.webp"), "HEAD");
    assert(teaser.status === 200 && teaser.type === "image/webp" && /\bno-store\b/.test(teaser.cache),
      "The blurred public teaser must be available as a non-cacheable image.");
    for (const file of ["standalone.webp", "fitted.webp", ...privateFiles]) {
      const path = asset(id, file);
      const response = await browserRequest(page, path, "HEAD");
      assert(response.status === (access === "locked" ? 403 : 200) && /\bno-store\b/.test(response.cache),
        "Private Wardrobe asset HEAD must respect live account access and no-store.");
      if (access === "locked") {
        const rejected = await browserRequest(page, path);
        assert(rejected.status === 403 && /\bno-store\b/.test(rejected.cache), "Private asset bytes must remain inaccessible.");
      }
    }
  }
  const unknown = await browserRequest(page, asset(items[0].id, "original.blend"), "HEAD");
  assert.equal(unknown.status, 404, "Only the release catalogue can resolve an asset.");
}

async function openWardrobe(page, expect) {
  await page.goto(origin + pagePath, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ready Wardrobe", exact: true })).toBeVisible({ timeout: 25_000 });
}

async function assertLockedView(page, expect) {
  await expect(page.getByRole("button", { name: /^(?:Equip|Remove)\b/ })).toHaveCount(0);
  await expect(page.getByText("Locked", { exact: true })).toHaveCount(items.length);
  await expectArtwork(page, expect, "standalone", "blurred preview");
  await page.getByRole("button", { name: "Fitted on Ready", exact: true }).click();
  await expectArtwork(page, expect, "fitted", "blurred preview");
  await expectRendered(page, expect, []);
}

async function expectArtwork(page, expect, view, suffix = "preview") {
  for (const item of items) {
    const image = page.getByRole("img", { name: `${item.name} ${view} ${suffix}`, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
}

function liveCanvas(page) {
  return page.getByRole("img", { name: "Ready 3D preview" });
}

async function expectRendered(page, expect, itemIds) {
  const canvas = liveCanvas(page);
  await expect(canvas).toHaveAttribute("data-wardrobe-renderer", "ready", { timeout: 45_000 });
  await expect(canvas).toHaveAttribute("data-wardrobe-items", itemIds.join(","), { timeout: 25_000 });
  await expect(canvas).toBeVisible();
}

async function signIn(view, auth, identity) {
  await view.switchAccount(() => auth.signIn(view.page, identity));
  await view.page.waitForFunction((id) => window.Clerk?.loaded && window.Clerk.user?.id === id,
    identity.userId, { timeout: 25_000 });
  const sessionId = await view.page.evaluate(() => window.Clerk.session?.id);
  assert(typeof sessionId === "string" && /^sess_[A-Za-z0-9]+$/.test(sessionId), "The synthetic login must use a real temporary session.");
  observedSessions.set(sessionId, identity.userId);
}

async function signOut(view) {
  await view.switchAccount(async () => {
    const landing = view.page.waitForURL(origin + "/", { waitUntil: "domcontentloaded" });
    const end = view.page.evaluate(async (redirectUrl) => {
      await window.Clerk.signOut({ sessionId: window.Clerk.session.id, redirectUrl });
    }, origin + "/").catch((error) => {
      if (!error.message.includes("Execution context was destroyed")) throw error;
    });
    await Promise.all([landing, end]);
  });
  await view.page.waitForFunction(() => window.Clerk?.loaded && !window.Clerk.user, undefined, { timeout: 25_000 });
}

async function restoreCoveredAccount(view, expect, auth, covered, itemIds) {
  const { page } = view;
  await page.waitForFunction(() => window.Clerk?.loaded, undefined, { timeout: 25_000 });
  const currentUser = await page.evaluate(() => window.Clerk.user?.id ?? null);
  if (currentUser !== covered.userId) {
    if (currentUser) await signOut(view);
    await signIn(view, auth, covered);
  }
  await openWardrobe(page, expect);
  const state = await readState(page, "subscriber");
  await setSelection(view, state.sessionId, itemIds);
  assert.deepEqual((await readState(page, "subscriber")).itemIds, itemIds);
}

async function verifyCoverage(auth, identity, expected) {
  assert(identity.profileCompleted, "Designated synthetic fixtures must have complete profiles.");
  const now = new Date().toISOString();
  const [coverage, staff] = await Promise.all([
    auth.admin.from("ready_wardrobe_pilot_coverage").select("clerk_user_id").eq("clerk_user_id", identity.userId)
      .lte("starts_at", now).gt("ends_at", now).maybeSingle(),
    auth.admin.rpc("get_patch2_admin_account_state", { p_clerk_user_id: identity.userId }),
  ]);
  assert(!coverage.error && !staff.error && !/^verified-/.test(staff.data) && Boolean(coverage.data) === expected,
    "Synthetic account role or live coverage did not match the assigned test fixture.");
}

async function verifyTemporarySessionsClosed(environmentDirectory, fixtureAlias) {
  const environment = await loadFixtureEnvironment({ rootDir: environmentDirectory, processEnv: {} });
  const { clerkSecretKey } = validateRuntimeGuards(environment, fixtureAlias);
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const inactive = new Set(["revoked", "ended", "expired", "removed", "abandoned", "replaced"]);
  for (const [sessionId, userId] of observedSessions) {
    const session = await clerk.sessions.getSession(sessionId).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
    if (!session) continue;
    assert(session.id === sessionId && session.userId === userId, "Session cleanup ownership did not match.");
    if (!inactive.has(session.status)) {
      const revoked = await clerk.sessions.revokeSession(sessionId);
      assert(revoked.id === sessionId && revoked.userId === userId && inactive.has(revoked.status), "QA session is still active.");
    }
  }
  return { temporarySessionsVerifiedInactive: observedSessions.size };
}

async function screenshot(page, output, file) {
  await page.getByRole("heading", { name: "Ready Wardrobe", exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((frame) => requestAnimationFrame(() => requestAnimationFrame(frame))));
  await page.screenshot({ path: join(output, file), caret: "hide", animations: "allow" });
  proof.screenshots.push(file);
}

async function captureBrowserClip(view, output, name, operation) {
  const { protocol } = view;
  const frames = [];
  const onFrame = ({ data, metadata, sessionId }) => {
    void protocol.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
    if (Number.isFinite(metadata.timestamp)) frames.push({ data, time: metadata.timestamp });
  };
  protocol.on("Page.screencastFrame", onFrame);
  try {
    await protocol.send("Page.startScreencast", { format: "jpeg", quality: 79, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    await operation();
  } finally {
    await protocol.send("Page.stopScreencast");
    protocol.off("Page.screencastFrame", onFrame);
  }
  assert(frames.length > 20 && frames.at(-1).time - frames[0].time >= 4, "Live Chrome did not supply enough frames for evidence.");

  const directory = join(output, "Working", name);
  await mkdir(directory);
  const fileName = (index) => `frame-${String(index).padStart(4, "0")}.jpg`;
  const manifest = ["ffconcat version 1.0"];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const duration = frames[index + 1]?.time - frame.time;
    manifest.push(`file '${fileName(index)}'`, `duration ${(duration > 0 ? duration : 1 / 24).toFixed(5)}`);
    await writeFile(join(directory, fileName(index)), Buffer.from(frame.data, "base64"));
  }
  manifest.push(`file '${fileName(frames.length - 1)}'`);
  await writeFile(join(directory, "capture.ffconcat"), manifest.join("\n") + "\n");
  const file = `${name}.mp4`;
  await exec("ffmpeg.exe", ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "1", "-i", "capture.ffconcat",
    "-vf", "fps=24,pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
    "-movflags", "+faststart", join(output, file)], { cwd: directory, timeout: 120_000, windowsHide: true });
  proof.videos.push(file);
}

async function showItemMotion(view, expect, output, item, record) {
  const { page } = view;
  await page.getByRole("button", { name: /^Front$/i }).click();
  await expectRendered(page, expect, []);
  await page.getByRole("heading", { name: "Ready Wardrobe", exact: true }).scrollIntoViewIfNeeded();
  const review = async () => {
    if (record) await page.waitForTimeout(500);
    await toggle(view, expect, "Equip", item);
    await expectRendered(page, expect, [item.id]);
    await page.getByRole("button", { name: "Three-quarter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Three-quarter", exact: true })).toHaveAttribute("aria-pressed", "true");
    await screenshot(page, output, `desktop-${item.id}-equipped.png`);
    await page.getByRole("button", { name: "Head turn", exact: true }).click();
    if (record) await page.waitForTimeout(1_600);
    for (const style of ["Normal", "Enthusiastic", "Gentle"]) {
      await page.getByRole("button", { name: `${style} speech`, exact: true }).click();
      if (record) await page.waitForTimeout(1_000);
    }
    for (const pixels of [51, 56]) {
      await setSize(page, expect, pixels);
      const file = `desktop-${item.id}-${pixels}px.png`;
      await liveCanvas(page).screenshot({ path: join(output, file), animations: "allow" });
      proof.screenshots.push(file);
      if (record) await page.waitForTimeout(900);
    }
    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    await page.getByRole("button", { name: "Front", exact: true }).click();
    await toggle(view, expect, "Remove", item);
    await expectRendered(page, expect, []);
    if (record) await page.waitForTimeout(800);
  };
  if (record) await captureBrowserClip(view, output, `hosted-${item.id}`, review);
  else await review();
}

async function setSize(page, expect, pixels) {
  const size = page.getByRole("button", { name: `${pixels} px`, exact: true });
  await size.click();
  await expect(size).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Math.round((await liveCanvas(page).boundingBox())?.width ?? 0)).toBe(pixels);
}

async function setSelection(view, sessionId, itemIds) {
  const result = await browserRequest(view.page, statePath, "POST", { sessionId, itemIds });
  assert.equal(result.status, 200, "Synthetic account selection save failed.");
  assert.match(result.cache ?? "", /\bno-store\b/);
  assert.deepEqual(result.body.itemIds, itemIds);
}

function saveResponse(page) {
  return page.waitForResponse((response) => response.url() === origin + statePath && response.request().method() === "POST",
    { timeout: 20_000 });
}

async function toggle(view, expect, action, item) {
  const saving = saveResponse(view.page);
  const button = view.page.getByRole("button", { name: `${action} ${item.name}`, exact: true });
  await (view.mobile ? button.tap() : button.click());
  const response = await saving;
  assert.equal(response.status(), 200, `${action} ${item.name} must persist through the Wardrobe API.`);
  await expect(view.page.getByRole("button", { name: `${action === "Equip" ? "Remove" : "Equip"} ${item.name}`, exact: true })).toBeVisible();
}

async function coveredJourney(view, expect, output, record, auth, covered, ordinary) {
  const { page } = view;
  const original = await readState(page, "subscriber");
  assert(original.sessionId !== null, "The designated subscriber needs an active session.");
  await expect(page.getByRole("heading", { name: "Ready Preview", exact: true })).toBeVisible();
  await probeAssets(page, "subscriber");
  await expectArtwork(page, expect, "standalone");
  await page.getByRole("button", { name: "Fitted on Ready", exact: true }).click();
  await expectArtwork(page, expect, "fitted");
  view.enableSaves();
  try {
    stage = "covered fixture save validation";
    for (const [sessionId, itemIds] of [["stale-session", []], [original.sessionId, ["fake-asset"]],
      [original.sessionId, [items[0].id, items[0].id]]]) {
      const result = await browserRequest(page, statePath, "POST", { sessionId, itemIds });
      assert.equal(result.status, 400, "Stale sessions, unknown items and duplicate selections must be rejected.");
    }
    assert.deepEqual((await readState(page, "subscriber")).itemIds, original.itemIds);
    await setSelection(view, original.sessionId, []);
    await openWardrobe(page, expect);
    await expectRendered(page, expect, []);

    if (!view.mobile) {
      for (const item of items) {
        stage = `live Chrome ${item.name} equip, positions, motion and removal`;
        await showItemMotion(view, expect, output, item, record);
      }
    }

    stage = "equipping all three approved items together and reloading the page";
    const completeLook = items.map(({ id }) => id);
    for (const item of items) await toggle(view, expect, "Equip", item);
    await expectRendered(page, expect, completeLook);
    await openWardrobe(page, expect);
    await expectRendered(page, expect, completeLook);
    for (const item of items) await expect(page.getByRole("button", { name: `Remove ${item.name}` })).toBeVisible();
    assert.deepEqual((await readState(page, "subscriber")).itemIds, completeLook);
    await page.getByRole("button", { name: /three-quarter/i }).click();
    await screenshot(page, output, view.mobile ? "mobile-wardrobe-all-three.png" : "desktop-wardrobe-all-three.png");
    await toggle(view, expect, "Remove", items[1]);
    await expectRendered(page, expect, [items[0].id, items[2].id]);
    assert.deepEqual((await readState(page, "subscriber")).itemIds, [items[0].id, items[2].id]);

    stage = "exercising preview controls after removing only the cigarette";
    for (const [width, height] of view.mobile ? [[390, 780], [780, 390], [320, 670]] : [[1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const pixels of [51, 56]) await setSize(page, expect, pixels);
      await page.getByRole("button", { name: "Desktop", exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Wardrobe must fit the viewport.");
      if (view.mobile) await screenshot(page, output, `mobile-wardrobe-${width}x${height}.png`);
    }
    await page.getByRole("button", { name: /^Front$/i }).click();
    for (const style of ["Normal", "Enthusiastic", "Gentle"]) {
      await page.getByRole("button", { name: new RegExp(`^${style}(?: speech)?$`, "i") }).click();
    }
    if (!view.mobile) await screenshot(page, output, "desktop-wardrobe-clown.png");
    await toggle(view, expect, "Remove", items[2]);
    await toggle(view, expect, "Remove", items[0]);
    await expectRendered(page, expect, []);
    assert.deepEqual((await readState(page, "subscriber")).itemIds, []);
    await openWardrobe(page, expect);
    for (const item of items) await expect(page.getByRole("button", { name: `Equip ${item.name}` })).toBeVisible();
    pass(`${view.mobile ? "Chrome touch emulation" : "Desktop Chrome"} all three together, reload persistence, independent removal, 51/56/Desktop, views and silent speech controls`);

    stage = "signing out from an equipped canvas and switching to an ordinary account without coverage";
    await toggle(view, expect, "Equip", items[0]);
    await expectRendered(page, expect, [items[0].id]);
    await signOut(view);
    await openWardrobe(page, expect);
    assert((await readState(page, "locked")).sessionId === null, "Signed-out reload must have no session.");
    await assertLockedView(page, expect);
    await signIn(view, auth, ordinary);
    await openWardrobe(page, expect);
    const locked = await readState(page, "locked");
    assert(locked.sessionId !== null, "This must be a real signed-in account without coverage.");
    await assertLockedView(page, expect);
    await probeAssets(page, "locked");
    const denied = await browserRequest(page, statePath, "POST", { sessionId: locked.sessionId, itemIds: [items[0].id] });
    assert.equal(denied.status, 403, "An ordinary signed-in player cannot save pilot assets.");
    assert.equal(view.usagePosts(), 0, "Do not emit passive Ready analytics from the wardrobe journey.");
    pass(`${view.mobile ? "Chrome touch emulation" : "Desktop Chrome"} same-browser sign-out and ordinary account switch clear a previously equipped outfit`);
  } finally {
    try {
      await restoreCoveredAccount(view, expect, auth, covered, original.itemIds);
    } catch (error) {
      proof.selectionRestoreRequiresVerification = true;
      throw error;
    } finally {
      view.disableSaves();
    }
  }
  assert(view.wardrobeSaves() > 0, "Expected real same-origin saves for the covered account.");
}

let output;
let browser;
let hosted;
let config;
try {
  config = options();
  const oidc = trustedToken();
  stage = "confirming the exact canonical protected Staging deployment";
  await verifyDeployment(config);
  proof.commit = config.commit;
  proof.deployment = config.deployment;
  proof.browser = { headed: !config.headless, desktop: "1440×900", phone: "Chrome touch emulation at 390×780, 780×390 and 320×670" };
  stage = "locating HDD 1T for captured evidence";
  const artifacts = await makeArtifacts();
  output = artifacts.output;
  const { chromium, expect } = await import("@playwright/test");
  stage = "proving the two designated Staging-only Clerk identities and live coverage";
  hosted = await createHostedAuth({ environmentDirectory: config["environment-dir"], origin });
  const [covered, ordinary] = await Promise.all([hosted.fixture(config.covered), hosted.fixture(config.ordinary)]);
  assert(covered.userId !== ordinary.userId, "The coverage boundary requires two distinct synthetic identity records.");
  await Promise.all([verifyCoverage(hosted, covered, true), verifyCoverage(hosted, ordinary, false)]);
  const adminId = process.env.READY_WARDROBE_STAGING_ADMIN_ID;
  const admin = adminId ? await hosted.existingAdmin(adminId) : null;
  if (admin) {
    const coverage = await hosted.admin.from("ready_wardrobe_pilot_coverage").select("clerk_user_id")
      .eq("clerk_user_id", admin.userId).maybeSingle();
    assert(!coverage.error && !coverage.data, "The existing Staging staff test must have no synthetic coverage.");
  } else proof.skipped.push("Existing Staging staff session was not designated.");

  stage = "starting a fresh Chrome context with origin-scoped Vercel access";
  const action = await findCacheAction(oidc);
  browser = await chromium.launch({ channel: "chrome", headless: Boolean(config.headless),
    args: [`--disk-cache-dir=${join(artifacts.temporary, "ChromeCache")}`], timeout: 20_000 });
  for (const mobile of [false, true]) {
    const view = await makeBrowserView(browser, oidc, action, mobile);
    try {
      stage = "signed-out public wardrobe teaser and private asset rejection";
      await openWardrobe(view.page, expect);
      const guest = await readState(view.page, "locked");
      assert(guest.sessionId === null, "The fresh browser must begin signed out.");
      await assertLockedView(view.page, expect);
      await probeAssets(view.page, "locked");
      if (!mobile) await screenshot(view.page, output, "desktop-wardrobe-guest.png");
      pass(`${mobile ? "Chrome touch emulation" : "Desktop Chrome"} guest teaser with private assets denied`);

      stage = "bringing the covered synthetic account into the same browser";
      await signIn(view, hosted, covered);
      await view.page.goto(origin + "/profile", { waitUntil: "domcontentloaded" });
      const link = view.page.getByRole("link", { name: "Ready Wardrobe", exact: true });
      await expect(link).toHaveAttribute("href", pagePath, { timeout: 25_000 });
      await (mobile ? link.tap() : link.click());
      await expect(view.page).toHaveURL(origin + pagePath);
      await expect(view.page.getByRole("heading", { name: "Ready Wardrobe", exact: true })).toBeVisible();
      await coveredJourney(view, expect, output, !config["no-video"], hosted, covered, ordinary);
    } finally {
      await view.context.close();
    }
  }

  if (admin) {
    stage = "existing verified Staging staff access with no pilot coverage";
    const view = await makeBrowserView(browser, oidc, action);
    try {
      await signIn(view, hosted, admin);
      await openWardrobe(view.page, expect);
      await readState(view.page, "admin");
      await expect(view.page.getByRole("heading", { name: "Ready Preview", exact: true })).toBeVisible();
      await probeAssets(view.page, "admin");
      await screenshot(view.page, output, "desktop-wardrobe-admin.png");
      assert.equal(view.wardrobeSaves(), 0, "The existing admin wardrobe must remain read-only during UAT.");
      pass("Desktop Chrome existing verified admin access without fixture coverage or a save");
      stage = "proving expiration of the temporary Staging admin session";
      const token = await view.page.evaluate(() => window.Clerk.session.getToken());
      assert(typeof token === "string", "A real temporary admin token is required.");
      const readPrivateWithToken = () => fetch(origin + asset(items[0].id, "wearable.glb"), {
        method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
        headers: { [trustedHeader]: oidc, Authorization: `Bearer ${token}` },
      });
      assert.equal((await readPrivateWithToken()).status, 200, "The temporary admin must have a valid asset session before sign-out.");
      await signOut(view);
      const expired = await readPrivateWithToken();
      assert(expired.status === 403 && /\bno-store\b/.test(expired.headers.get("Cache-Control") ?? ""),
        "The prior admin token cannot download assets after its live session ends.");
      pass("The temporary admin session lost private downloads immediately after sign-out");
    } finally {
      await view.context.close();
    }
  }
  proof.skipped.push("Live staff-role and coverage edits require independently approved disposable fixtures.");
  if (config["no-video"]) proof.skipped.push("Video explicitly disabled for this run.");
  stage = "rechecking the canonical protected Staging deployment";
  await verifyDeployment(config);
  proof.passed = true;
} catch {
  proof.passed = false;
  proof.failureStage = stage;
  process.exitCode = 1;
  console.error(`Wardrobe evidence stopped during ${stage}.`);
} finally {
  await browser?.close().catch(() => { process.exitCode = 1; });
  if (hosted) {
    try {
      proof.sessions = await hosted.close();
    } catch {
      try {
        proof.sessions = await verifyTemporarySessionsClosed(config["environment-dir"], config.covered);
      } catch {
        proof.cleanupRequiresVerification = true;
        proof.passed = false;
        process.exitCode = 1;
        console.error("Verify that the temporary Staging Clerk sessions are inactive.");
      }
    }
  }
  if (output) {
    await writeFile(join(output, "wardrobe-pilot-verification.json"), JSON.stringify(proof, null, 2) + "\n");
    console.log(output);
  }
}
