// Local browser QA using the real Ready component, assets and renderer, with synthetic API responses.
// All browser requests are fulfilled in Playwright. No connection to any website or database is made.
import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { installRendererObservation } from "./menu-journey.mjs";

const articles = {
  text: "If the game disconnects, capture any available evidence and check the rule edition listed for your tournament before deciding what to do next, Commander.",
  details: "The answer depends on the rules, format, match state, and evidence for the relevant event. If you are unsure, contact an admin with the match reference. Keep the tournament deadline in mind while you wait for a ruling.",
  sources: [{ title: "IronClad Competition Handbook", section: "Disconnects, evidence and tournament deadlines", url: "/rules" }],
  intent: { kind: "question", id: "disconnects" },
};
const fixtureDocument = `<!DOCTYPE html><html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ready local visual QA</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #0a0a0a; color: #f4f4f5; font: 16px/1.5 Arial, Helvetica, sans-serif; }
    p, ul { margin: 0; }
    button, textarea { font: inherit; }
    header { position: sticky; top: 0; z-index: 50; display: flex; gap: 14px; align-items: center; min-height: 70px; padding: 7px 14px; background: #101012; }
    header a { color: #f4f4f5; text-decoration: none; }
    main { min-height: 140vh; }
    .hero { display: flex; min-height: 74vh; align-items: end; padding: 24px; background: linear-gradient(90deg, #000e, #0005), url('/images/ironclad-background.jpg') center/cover; }
    .hero h1 { font-size: clamp(2.2rem, 8vw, 5rem); margin: 0; line-height: 1; }
    .hero a { display: inline-grid; align-items: center; min-height: 44px; margin-top: 26px; padding: 10px 15px; background: #f97316; color: #0a0a0a; font-weight: 700; text-decoration: none; }
  </style>
</head><body><div id="root"></div><script type="module" src="/__ready_fixture.jsx"></script></body></html>`;

const shims = {
  "next/navigation": `export const usePathname = () => location.pathname; export const useSearchParams = () => new URLSearchParams(location.search);`,
  "next/image": `import {createElement} from "react"; export default ({fill, unoptimized, ...props}) => createElement("img", {
    ...props, style: fill ? {position:"absolute",inset:0,width:"100%",height:"100%"} : undefined,
  });`,
  "next/link": `import {createElement} from "react"; export default ({prefetch, ...props}) => createElement("a", props);`,
};
const htmlFile = resolve("test-results", `ready-local-fixture-${process.pid}.html`);
const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"], [".json", "application/json"], [".glb", "model/gltf-binary"],
]);
const fixture = {
    name: "ready-local-qa",
    resolveId(id) {
      if (id in shims) return `\0ready-shim:${id}`;
      if (id === "/__ready_fixture.jsx") return `\0${id}`;
    },
    load(id) {
      if (id.startsWith("\0ready-shim:")) return shims[id.slice(12)];
      if (id.endsWith("/__ready_fixture.jsx")) return `import {createRoot} from "react-dom/client";
        import ReadyAssistant from "/components/ready/ReadyAssistant.tsx";
        createRoot(document.getElementById("root")).render(<>
          <header><ReadyAssistant workspaceScope="synthetic-visitor" signedIn={false}/>
            <a href="/">Home</a><a href="/tournaments" data-mascot-attention="tournaments">Tournaments</a>
            <a href="/rules" data-mascot-attention="rules-support">Rules &amp; support</a></header>
          <main><section className="hero"><div>
            <h1 data-mascot-attention="home-heading">IronClad Tournaments</h1>
            <a href="/tournaments" data-mascot-attention="view-tournaments">View Tournaments</a>
          </div></section></main>
        </>);`;
    },
};

let browser;
try {
  await mkdir(resolve("test-results"), { recursive: true });
  await writeFile(htmlFile, fixtureDocument, { flag: "wx" });
  const bundle = await build({
    configFile: false,
    resolve: { tsconfigPaths: true },
    plugins: [fixture, react()],
    build: { write: false, emptyOutDir: false, rollupOptions: { input: htmlFile } },
    logLevel: "warn",
  });
  assert(!Array.isArray(bundle) && !("close" in bundle), "Ready fixture must produce a single browser build");
  const assets = new Map(bundle.output.map((asset) => [
    asset.fileName.endsWith(".html") ? "/" : "/" + asset.fileName,
    { body: asset.type === "asset" ? asset.source : asset.code, contentType: mime.get(extname(asset.fileName)) },
  ]));
  const origin = "https://ready-fixture.localhost";
  const directory = process.env.READY_CLOUD_SCREENSHOTS;
  if (directory) await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: process.argv.includes("--headless") });

  for (const { width, height, mobile } of [
    { width: 1280, height: 800, mobile: false },
    { width: 390, height: 780, mobile: true },
    { width: 780, height: 390, mobile: true },
    { width: 320, height: 660, mobile: true },
  ]) {
    const viewport = { width, height };
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile,
      reducedMotion: width === 390 || width === 1280 ? "no-preference" : "reduce" });
    try {
      const page = await context.newPage();
      const attempts = [];
      await page.addInitScript(installRendererObservation);
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/api/ready" && request.method() === "POST") return route.fulfill({ json: articles });
        if (url.pathname === "/api/ready/suggestions" && request.method() === "POST") {
          attempts.push(request.postDataJSON().submissionId);
          return attempts.length === 1 ? route.fulfill({ status: 503, json: { saved: false } })
            : route.fulfill({ status: 201, json: { saved: true } });
        }
        if (request.method() !== "GET") return route.abort();
        const asset = assets.get(url.pathname);
        if (asset) return route.fulfill(asset);
        const contentType = mime.get(extname(url.pathname));
        if (contentType && /^\/(?:images|mascot-v6)\/[\w./-]+$/.test(url.pathname)) {
          try {
            const body = await readFile(resolve("public", "." + url.pathname));
            return route.fulfill({ body, contentType });
          } catch { return route.fulfill({ status: 404 }); }
        }
        return route.fulfill({ status: 404 });
      });
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const dock = page.getByRole("button", { name: "Open Ready, the IronClad assistant" });
      const message = page.locator("[data-mascot-message]");
      const conversation = page.locator("[data-mascot-dialogue]");
      const ready = page.locator('[data-asset-status="ready"]');
      const invoke = async (locator) => {
        if (mobile) await locator.tap();
        else await locator.click();
      };
      const finish = async (id) => {
        await expect(conversation).toHaveAttribute("data-ready-view", id, { timeout: 15_000 });
        if (width === 390) {
          await page.waitForFunction(() => {
            const pose = globalThis.readyAcceptancePose?.();
            return !!pose?.style && Math.abs(pose.jaw - pose.restingJaw) > .035;
          }, undefined, { timeout: 5_000 });
        }
        const skip = page.getByRole("button", { name: "Show full message", exact: true });
        if (await skip.isVisible()) await invoke(skip);
        await expect(conversation).not.toHaveAttribute("data-revealing", "true");
        if (width === 390) {
          await page.waitForFunction(() => {
            const pose = globalThis.readyAcceptancePose?.();
            return pose && pose.talkWeight < .03 && Math.abs(pose.jaw - pose.restingJaw) < .035;
          }, undefined, { timeout: 5_000 });
        }
      };
      const screenshot = async (name) => {
        if (directory) await page.screenshot({ animations: "disabled", path: resolve(directory, `${width}x${height}-${name}.png`) });
      };
      await expect(ready).toBeAttached({ timeout: 40_000 });
      await invoke(dock);
      await finish("welcomeFirst");
      if (width === 390) await screenshot("welcome");
      if (width === 390) {
        await invoke(page.getByRole("button", { name: "I’m never winning this… white flag’s up!", exact: true }));
        await expect(conversation).toHaveAttribute("data-ready-view", "welcomeRough");
        await page.waitForFunction(() => globalThis.readyAcceptancePose?.()?.tearOpacity > .08, undefined, { timeout: 5_000 });
        await finish("welcomeRough");
        await finish("welcomeResolve");
        await expect(message).toContainText("Permission to surrender? Denied.");
      } else {
        await invoke(page.getByRole("button", { name: "A little nervous…", exact: true }));
      }
      await expect(conversation).toHaveAttribute("data-ready-view", "main", { timeout: 15_000 });
      await finish("main");
      if ([390, 1280].includes(width)) await screenshot("main");

      const grip = page.locator("[data-mascot-drag]");
      const move = async (x, y) => {
        const box = await grip.boundingBox();
        const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
        if (!mobile) {
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(x, y, { steps: 8 });
          await page.mouse.up();
          return;
        }
        const cdp = await context.newCDPSession(page);
        try {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
          for (const amount of [.2, .4, .6, .8, 1]) {
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
              { x: Math.round(from.x + (x - from.x) * amount), y: Math.round(from.y + (y - from.y) * amount) },
            ] });
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally { await cdp.detach(); }
      };
      const attached = async () => {
        const bounds = await conversation.boundingBox();
        const skull = await grip.boundingBox();
        const distance = Math.hypot(Math.max(0, skull.x - (bounds.x + bounds.width), bounds.x - (skull.x + skull.width)),
          Math.max(0, skull.y - (bounds.y + bounds.height), bounds.y - (skull.y + skull.height)));
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
        assert(distance < 75, "cloud group must remain next to the dragged skull");
      };
      await move(5, 88);
      await attached();
      await move(width - 5, height - 5);
      await attached();

      await invoke(page.getByRole("button", { name: "Rules & match help", exact: true }));
      await finish("submenu");
      await invoke(page.getByRole("button", { name: "Disconnects & lag", exact: true }));
      await finish("reply");
      await expect(message).toHaveText(articles.text);
      await invoke(page.getByText("More detail", { exact: true }));
      await expect(page.getByRole("link", { name: /IronClad Competition Handbook/ })).toBeVisible();
      if (width === 1280) await screenshot("expanded-source");
      if (width === 390) {
        await invoke(page.getByRole("button", { name: "Still need help", exact: true }));
        await finish("feedback");
        await expect(message).toHaveText("Try another topic or contact an admin, Commander.");
      }

      await invoke(page.getByRole("button", { name: "Main menu", exact: true }));
      await finish("main");
      await invoke(page.getByRole("button", { name: "Topic missing", exact: true }));
      await finish("topicMissing");
      const field = page.getByRole("textbox", { name: "Which topic or question is missing?" });
      const send = page.getByRole("button", { name: "Send suggestion", exact: true });
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      await expect(field).toBeVisible();
      await expect(send).toBeDisabled();
      if ([390, 1280].includes(width)) await screenshot("blank-form");

      if (mobile) {
        await field.focus();
        await page.setViewportSize({ width, height: Math.min(height - 80, 240) });
        await expect.poll(async () => {
          const box = await field.boundingBox();
          const frame = await conversation.boundingBox();
          return box && frame && box.y >= frame.y - 1 && box.y + box.height <= frame.y + frame.height + 1;
        }).toBeTruthy();
        // Check the submit control can be scrolled into the visual viewport while the field is focused.
        await send.scrollIntoViewIfNeeded();
        const sendBox = await send.boundingBox();
        assert(sendBox && sendBox.y >= 0 && sendBox.y + sendBox.height <= Math.min(height - 80, 240));
        await page.setViewportSize(viewport);
      }
      if (width === 390) {
        const draft = "Synthetic topic for the isolated browser fixture.";
        await field.fill(draft);
        await invoke(send);
        await finish("topicMissing");
        await expect(message).toContainText("Your draft is still here");
        await expect(field).toHaveValue(draft);
        await invoke(send);
        await finish("suggestionSaved");
        await expect(message).toHaveText("Suggestion received, Commander. The IronClad team can now review it and improve my menu.");
        assert.equal(attempts.length, 2);
        assert.equal(attempts[0], attempts[1], "failed-save retry reuses the submission ID");
      } else {
        await invoke(cancel);
        await finish("main");
        assert.equal(attempts.length, 0);
      }
      await invoke(page.getByRole("button", { name: "Dock assistant", exact: true }));
      await expect(dock).toHaveAttribute("aria-expanded", "false");
      await invoke(dock);
      await expect(dock).toHaveAttribute("aria-expanded", "true");
      console.log(`Ready component passed ${width}×${height} (${mobile ? "touch emulation" : "desktop"}).`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await unlink(htmlFile).catch(() => undefined);
}
