// Real-browser regression for text and form controls inside Ready's painted SVG silhouettes.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import ts from "typescript";

const stylesheet = new URL("../../components/ready/ReadyAssistant.module.css", import.meta.url);
const shape = new URL("../../components/ready/ThoughtCloudShape.tsx", import.meta.url);
const [css, source] = await Promise.all([readFile(stylesheet, "utf8"), readFile(shape, "utf8")]);
const contour = source.slice(source.indexOf("function cloudContour("), source.indexOf("export default function ThoughtCloudShape"));
assert(contour.startsWith("function cloudContour("));
const { outputText: contourJs } = ts.transpileModule(contour, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
const browser = await chromium.launch({ channel: "chrome", headless: !process.argv.includes("--visible") });
const directory = process.env.READY_CLOUD_SCREENSHOTS;
if (directory) await mkdir(directory, { recursive: true });

const svg = '<svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100"><path fill="#18181b"/></svg>';
const form = `<form class="suggestionForm">
  <p class="suggestionHint">Your suggestion will be saved for the IronClad team to review and improve Ready’s menu and answers. This is not a live support request, and a reply is not guaranteed. Please don’t include personal or sensitive information.</p>
  <label for="suggestion">Which topic or question is missing?</label>
  <textarea id="suggestion" aria-describedby="count" maxlength="500" data-check-box></textarea>
  <span class="suggestionCounter" id="count">0 / 500 characters</span>
</form>`;
const citations = `<details open class="replyDetails">
  <summary>More detail</summary>
  <p>Contact your opponent in the Match Room to agree on a time. Check the tournament’s published rules and exact deadline before reporting an issue.</p>
</details>
<ul class="sources"><li><a href="#rules">IronClad Competition Handbook · Tournament Match Scheduling, Deadlines, and Assistance</a></li></ul>`;
const welcome = [
  ["morale-good", "Time to kick some ass!"], ["morale-nervous", "A little nervous…"],
  ["morale-low", "I’m never winning this… white flag’s up!"],
];
const menu = [
  ["match", "My match"], ["results", "Results &amp; replays"], ["rules", "Rules &amp; match help"],
  ["tournaments", "Tournaments &amp; registration"], ["profile", "My profile &amp; progress"], ["support", "Contact an admin"],
];

const sizes = [
  { width: 1280, height: 800, cloud: 540, oval: true },
  { width: 1280, height: 800, cloud: 370 },
  { width: 390, height: 780, cloud: 328, compact: true },
  { width: 320, height: 660, cloud: 258, compact: true },
  { width: 780, height: 390, cloud: 210, compact: true },
  { width: 390, height: 310, cloud: 328, compact: true }, // Keyboard-sized space, not an OS virtual keyboard.
];

const views = [
  { name: "welcome", id: "welcomeReturning", message: "Welcome back, Commander. How’s morale today?", options: welcome },
  { name: "main", id: "main", message: "What can I help you with today, Commander?", options: menu },
  { name: "reply", id: "submenu", message: "Permission to surrender? Denied. One match at a time, Commander.", options: menu,
    extras: citations },
  { name: "suggestion", id: "topicMissing", message: "Something missing, Commander? Tell us which topic or question you wanted Ready to cover.",
    extras: form, options: [["send", "Send suggestion"], ["cancel", "Cancel"], ["contact", "Contact an admin"]] },
];

const page = await browser.newPage();
const failures = [];
const fontSizes = [16, 20, 24, 32];
try {
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const fontSize of fontSizes) {
      for (const view of views) {
        const options = view.options.map(([id, label]) =>
          `<button class="answer" data-ready-category="${id}">${svg}<span>${label}</span></button>`).join("");
        const attr = (enabled, name, value = "") => enabled ? `${name}="${value}"` : "";
        const id = `${size.width}x${size.height}-${size.cloud}-${view.name}${fontSize === 16 ? "" : `-${fontSize}px-text`}`;
        await page.setContent(`<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1">
          <style>* { box-sizing: border-box; } html { font: ${fontSize}px/1.5 Arial, Helvetica, sans-serif; }
            body { margin: 0; background: #202024; } button, textarea { font: inherit; }
            p, ul { margin: 0; } ${css}</style>
          <section class="assistant" style="transform:none;top:10px;left:10px" data-dialogue-node="${view.id}">
            <div class="speech" data-ready-view="${view.id}" ${attr(size.oval && view.id === "main", "data-menu-layout", "oval")}
              ${attr(size.compact, "data-compact-placement")} style="width:${size.cloud}px; max-height:${size.height - 20}px">
              <div class="bubble">${svg}<div class="messageLayout">
                <p class="message messageReserve">${view.message}</p>
                <p class="message">${view.message}</p>
              </div>${view.extras ?? ""}</div>
              <div class="answerZone"><div class="answers">${options}</div></div>
            </div>
            <div class="contextMenu" data-mascot-menu-open="true" data-positioned style="left:${size.cloud + 18}px;gap:6px">
              <button class="answer">${svg}<span>Welcome</span></button><button class="answer">${svg}<span>Help</span></button>
            </div>
          </section></html>`);
        const misses = await page.evaluate((code) => {
          const cloudContour = new Function(`${code}; return cloudContour;`)();
          const outside = [];
          for (const host of document.querySelectorAll(".bubble, .answer")) {
            const svg = host.querySelector(":scope > svg");
            const path = svg.querySelector("path");
            const matrix = () => svg.getScreenCTM().inverse();
            const variant = host.classList.contains("bubble") ? "main" : "answer";
            svg.setAttribute("viewBox", `0 0 ${host.clientWidth} ${host.clientHeight}`);
            path.setAttribute("d", cloudContour(host.clientWidth, host.clientHeight, variant));
            const check = (rect, label) => {
              if (!rect.width || !rect.height) return;
              // Sample line rectangles including their corners, not the host's rectangular box.
              for (const y of [rect.top, (rect.top + rect.bottom) / 2, rect.bottom]) {
                for (const x of [rect.left, (rect.left + rect.right) / 2, rect.right]) {
                  const point = new DOMPoint(x, y).matrixTransform(matrix());
                  if (!path.isPointInFill(point)) {
                    outside.push(`${variant} ${label.trim().slice(0, 52)} @ ${point.x.toFixed(1)},${point.y.toFixed(1)} of ${host.clientWidth}×${host.clientHeight}`);
                    return;
                  }
                }
              }
            };
            const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent.trim() || node.parentElement.closest("svg,.messageReserve")) continue;
              const range = new Range();
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) check(rect, node.textContent);
            }
            for (const field of host.querySelectorAll("[data-check-box]")) check(field.getBoundingClientRect(), field.id);
          }
          return outside;
        }, contourJs);
        if (misses.length) failures.push({ id, samples: misses.slice(0, 4) });
        if (directory && fontSize === 16 && [390, 1280].includes(size.width) && ["main", "suggestion"].includes(view.name)) {
          await page.screenshot({ animations: "disabled", path: resolve(directory, `${id}.png`) });
        }
      }
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 12), null, 2));
  console.log(`Painted cloud containment passed in ${sizes.length * views.length * fontSizes.length} layout/text-size combinations.`);
} finally {
  await browser.close();
}
