import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

test("Broadcast refreshes history promptly, deduplicates sends, falls back, and resyncs on rejoin", async ({ page }) => {
  await page.clock.install();
  await page.goto("/tests/browser/match-room/?realtime=1");
  await expect.poll(() => page.evaluate(() => window.matchRoomRealtimeFixture.snapshot().active)).toBe(1);
  await page.evaluate(() => {
    window.matchRoomFixture.incoming("Immediate private response");
    window.matchRoomRealtimeFixture.invalidate();
    window.matchRoomRealtimeFixture.invalidate();
  });
  await page.clock.runFor(100);
  await expect(page.getByText("Immediate private response", { exact: true })).toBeVisible();
  const draft = page.getByRole("region", { name: "Match Room", exact: true }).getByRole("textbox");
  await draft.fill("Unique sender message");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.clock.runFor(100);
  await expect(page.getByText("Unique sender message", { exact: true })).toHaveCount(1);
  await page.evaluate(() => {
    window.matchRoomRealtimeFixture.setConnected(false);
    window.matchRoomFixture.incoming("Fallback private response");
  });
  await page.clock.runFor(9_000);
  await expect(page.getByText("Fallback private response", { exact: true })).toHaveCount(0);
  await page.clock.runFor(1_000);
  await expect(page.getByText("Fallback private response", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.matchRoomFixture.incoming("Missed while disconnected");
    window.matchRoomRealtimeFixture.setConnected(true);
  });
  await expect(page.getByText("Missed while disconnected", { exact: true })).toBeVisible();
  await page.evaluate(() => window.matchRoomFixture.setEnabled(false));
  await page.clock.runFor(100);
  await expect(draft).toHaveCount(0);
  expect(await page.evaluate(() => window.matchRoomRealtimeFixture.snapshot().active)).toBe(0);
});

test("Realtime leaves an older-history reader in place and tears down hidden-tab subscriptions", async ({ page }) => {
  await page.clock.install();
  await page.goto("/tests/browser/match-room/?scenario=history&realtime=1");
  const log = page.getByRole("log");
  await expect(page.getByText(/^History message 125 /)).toBeVisible();
  await log.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
  const before = await page.evaluate(() => window.matchRoomFixture.snapshot().lastRead);
  await page.evaluate(() => window.matchRoomFixture.incoming("Realtime while browsing older history"));
  await page.clock.runFor(100);
  await expect(page.getByText("Realtime while browsing older history", { exact: true })).toBeAttached();
  expect(await log.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.matchRoomFixture.snapshot().lastRead)).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => window.matchRoomRealtimeFixture.snapshot().active)).toBe(0);
  await page.evaluate(() => window.matchRoomFixture.incoming("Response during hidden tab"));
  await page.clock.runFor(60_000);
  await expect(page.getByText("Response during hidden tab", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Response during hidden tab", { exact: true })).toBeAttached();
  expect(await log.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.matchRoomRealtimeFixture.snapshot().active)).toBe(1);
});
