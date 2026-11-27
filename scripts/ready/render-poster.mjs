// Reproduce the transparent poster from the first neutral draw of the approved renderer.
// Run from the worktree root: node scripts/ready/render-poster.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const origin = "https://ready-poster.localhost";
const assetRoot = resolve("public", "mascot-v6");
const output = resolve("lib", "ready", "poster-data.ts");
const contentTypes = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
};
const fixture = `<!doctype html><html lang="en"><title>Ready poster render</title>
<canvas></canvas><script type="module">
  import { createMascotRenderer } from "/mascot-v6/renderer.js";
  const canvas = document.querySelector("canvas");
  const schedule = window.requestAnimationFrame;
  let renderer;
  let consumed = 0;
  // Sample in the frame that produces the pixels, before WebGL clears its drawing buffer.
  window.requestAnimationFrame = callback => schedule(time => {
    callback(time);
    const frame = renderer?.snapshot();
    if (frame?.totalDraws > consumed) {
      consumed = frame.totalDraws;
      window.image = canvas.toDataURL("image/png");
      window.pose = frame;
    }
  });
  const size = Number(new URL(location.href).searchParams.get("size"));
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  renderer = createMascotRenderer({
    canvas, onStatus(state, error) { if (state === "error") window.failure = String(error); },
  });
</script></html>`;

const browser = await chromium.launch({ channel: "chrome" });
async function render(size) {
  const page = await browser.newPage({ viewport: { width: 420, height: 420 }, reducedMotion: "reduce" });
  try {
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== "GET") return route.abort();
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: fixture });
      const type = contentTypes[extname(url.pathname)];
      const path = /^\/mascot-v6\/([a-z\d/_-]+(?:\.[a-z\d]+)+)$/i.exec(url.pathname)?.[1];
      if (!type || !path) return route.abort();
      return route.fulfill({ contentType: type, body: await readFile(resolve(assetRoot, path)) });
    });
    await page.goto(`${origin}/?size=${size}`);
    await page.waitForFunction(() => window.image || window.failure, undefined, { timeout: 30_000 });
    const { image, pose, failure } = await page.evaluate(() => ({ image: window.image, pose: window.pose, failure: window.failure }));
    assert(!failure, failure);
    assert.equal(pose.expression, "Neutral");
    assert.equal(pose.jaw, pose.restingJaw);
    assert.equal(pose.leftBlink + pose.rightBlink + pose.smokeParticles + pose.tearDrops, 0);
    return Buffer.from(image.split(",")[1], "base64");
  } finally {
    await page.context().close();
  }
}

function paintedBounds(pixels, size) {
  let left = size, top = size, right = 0, bottom = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] <= 127) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return [left, top, right, bottom];
}

async function compare(poster, size) {
  const native = await render(size);
  const pixels = await sharp(native).ensureAlpha().raw().toBuffer();
  const scaled = await sharp(poster).resize(size, size).ensureAlpha().raw().toBuffer();
  const nativeBounds = paintedBounds(pixels, size);
  const posterBounds = paintedBounds(scaled, size);
  const maxEdgeShift = Math.max(...nativeBounds.map((edge, index) => Math.abs(edge - posterBounds[index])));
  assert(maxEdgeShift <= 1, `Poster changes the ${size}px silhouette bounds by ${maxEdgeShift}px`);
  let difference = 0;
  let area = 0;
  for (let pixel = 0; pixel < pixels.length; pixel += 4) {
    const sourceAlpha = pixels[pixel + 3] / 255;
    const scaledAlpha = scaled[pixel + 3] / 255;
    area += Math.max(sourceAlpha, scaledAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      difference += Math.abs(pixels[pixel + channel] * sourceAlpha - scaled[pixel + channel] * scaledAlpha);
    }
  }
  const meanDifference = difference / (area * 3 * 255);
  assert(meanDifference < 0.07, `Poster diverges from the ${size}px renderer frame: ${meanDifference}`);
  if (process.argv.includes("--evidence")) {
    const directory = resolve("test-results", "ready-poster");
    await mkdir(directory, { recursive: true });
    await sharp({
      create: { width: size * 2 + 12, height: size, channels: 3, background: "#111113" },
    }).composite([
      { input: await sharp(poster).resize(size, size).png().toBuffer(), left: 0, top: 0 },
      { input: native, left: size + 12, top: 0 },
    ]).png().toFile(resolve(directory, `poster-and-first-draw-${size}.png`));
  }
  return { maxEdgeShift, premultipliedColorError: (meanDifference * 100).toFixed(2) + "%" };
}

try {
  const image = await render(224);
  const poster = await sharp(image).webp({ quality: 83, alphaQuality: 100, effort: 6 }).toBuffer();
  const statistics = await sharp(poster).stats();
  assert(statistics.channels[3]?.min === 0 && statistics.channels[3]?.max === 255, "Expected a transparent poster with an opaque mascot");
  assert(poster.length <= 8_192, "Ready's inline poster exceeds its size budget");
  const desktop = await compare(poster, 56);
  const mobile = await compare(poster, 51);
  const chunks = poster.toString("base64").match(/.{1,100}/g);
  await writeFile(output, [
    "// Generated by scripts/ready/render-poster.mjs from the approved Ready GLB.",
    'export const READY_DOCK_POSTER_DATA = "data:image/webp;base64," +',
    chunks.map(chunk => "  " + JSON.stringify(chunk)).join(" +\n") + ";",
    "",
  ].join("\n"));
  console.log(JSON.stringify({ bytes: poster.length, desktop, mobile }));
} finally {
  await browser.close();
}
