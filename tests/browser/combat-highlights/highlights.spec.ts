import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const syntheticVideo = readFileSync(resolve(process.cwd(), "tests/fixtures/combat-highlights/synthetic-vp8-opus.webm"));

async function openFixture(page: Page, query: string) {
  const errors: string[] = [];
  const mediaRequests: string[] = [];
  const uploads: Array<{ type: string; authorization: string; clerk: string }> = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3218" || url.pathname.startsWith("/api/")) {
      await route.abort("blockedbyclient");
    } else if (url.pathname.startsWith("/fixture-media/")) {
      mediaRequests.push(url.pathname);
      await route.fulfill({ status: 200, contentType: "video/webm", body: syntheticVideo, headers: { "Cache-Control": "no-store" } });
    } else if (url.pathname.startsWith("/fixture-upload/")) {
      const headers = route.request().headers();
      uploads.push({ type: headers["content-type"], authorization: headers.authorization, clerk: headers["x-clerk-token"] });
      await route.fulfill({ status: 204 });
    } else await route.continue();
  });
  await page.goto(`/tests/browser/combat-highlights/?${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-highlights-fixture-ready", query.includes("surface=editor") ? "editor" : "public");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  return { errors, mediaRequests, uploads };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("zero clips render no public section or empty slots", async ({ page }) => {
  const check = await openFixture(page, "count=0");
  await expect(page.locator("[data-combat-highlights]")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(check.mediaRequests).toEqual([]);
  expect(check.errors).toEqual([]);
});

for (const width of [390, 1440]) {
  for (const count of [1, 2, 3]) {
    test(`${count} clips remain contained at ${width}px without loading video`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      const check = await openFixture(page, `count=${count}&long=1`);
      await expect(page.locator("[data-combat-highlights] article")).toHaveCount(count);
      await expect(page.locator("video[src]")).toHaveCount(0);
      await expect(page.locator("video[autoplay]")).toHaveCount(0);
      for (const frame of await page.locator("[data-highlight-player]").all()) {
        const bounds = (await frame.boundingBox())!;
        expect(Math.abs(bounds.width / bounds.height - 16 / 9)).toBeLessThan(0.025);
      }
      const positions = await page.locator("[data-combat-highlights] article").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().y));
      if (width === 390 && count > 1) expect(positions[1]).toBeGreaterThan(positions[0]);
      if (width === 1440 && count > 1) expect(positions[1]).toBe(positions[0]);
      await noOverflow(page);
      expect(check.mediaRequests).toEqual([]);
      expect(check.errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`public-${count}-${width}.png`), fullPage: true });
    });
  }
}

test("play attaches only the requested source and native playback pauses the previous clip", async ({ page }) => {
  const check = await openFixture(page, "count=3");
  const videos = page.locator("video");
  expect(check.mediaRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Play A clean flank" }).click();
  await expect.poll(() => videos.nth(0).evaluate((video: HTMLVideoElement) => !video.paused && video.readyState >= 2)).toBe(true);
  await expect(videos.nth(1)).not.toHaveAttribute("src");
  await page.getByRole("button", { name: "Play Holding the line" }).click();
  await expect.poll(() => videos.nth(1).evaluate((video: HTMLVideoElement) => !video.paused && video.readyState >= 2)).toBe(true);
  expect(await videos.nth(0).evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await expect(videos.nth(2)).not.toHaveAttribute("src");
  await expect(videos.nth(1)).toHaveAttribute("controls", "");
  await expect(videos.nth(1)).toHaveCSS("object-fit", "contain");
  expect(check.mediaRequests).toEqual(["/fixture-media/clip-1.webm", "/fixture-media/clip-2.webm"]);
  expect(check.errors).toEqual([]);
});

test("report modal preserves keyboard close and returns focus", async ({ page }) => {
  const check = await openFixture(page, "count=1");
  const trigger = page.getByRole("button", { name: "Report A clean flank" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(check.errors).toEqual([]);
});

for (const width of [320, 1440]) {
  test(`editor controls and owner preview work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const check = await openFixture(page, "surface=editor&count=2");
    await noOverflow(page);
    expect(check.mediaRequests).toEqual([]);
    await page.getByRole("button", { name: "Preview A clean flank" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("video")).toHaveAttribute("src", /^blob:/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true });
    expect(check.errors).toEqual([]);
  });
}

test("real local file metadata and optional poster complete the isolated upload flow", async ({ page }) => {
  const check = await openFixture(page, "surface=editor&count=2");
  await page.getByRole("button", { name: "Add clip 3" }).click();
  await page.getByLabel("Video file").setInputFiles({ name: "synthetic-gameplay.webm", mimeType: "video/webm", buffer: syntheticVideo });
  await expect(page.getByRole("status").filter({ hasText: "Checking the local video" })).toHaveCount(0);
  await page.getByLabel("Clip title").fill("Synthetic gameplay");
  const upload = page.getByRole("button", { name: "Upload clip", exact: true });
  await expect(upload).toBeDisabled();
  await page.getByLabel(/This is genuine Company of Heroes 3/).check();
  await expect(upload).toBeEnabled();
  await upload.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview Synthetic gameplay" })).toBeVisible();
  expect(check.uploads[0]).toEqual({ type: "video/webm", authorization: "Bearer synthetic-video-grant", clerk: "synthetic-clerk-token" });
  expect(check.uploads.length).toBeGreaterThanOrEqual(1);
  expect(check.errors).toEqual([]);
});
