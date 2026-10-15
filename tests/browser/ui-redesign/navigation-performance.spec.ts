import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/")) await route.abort();
    else await route.continue();
  });
  await page.goto("/tournaments?surface=tournament&mixed=1&prizes=1");
  await expect(page.locator("html")).toHaveAttribute("data-ui-fixture-ready", "tournament");
});

test("loaded tabs are immediate and still request fresh server authority", async ({ page }) => {
  await page.getByRole("button", { name: "Brackets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Brackets", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/tab=brackets/);
  const state = await page.evaluate(() => ({ navigations: window.__uiFixture.navigations, refreshes: window.__uiFixture.refreshes }));
  expect(state.navigations).toEqual([]);
  expect(state.refreshes).toBe(1);
  await expect(page.getByRole("heading", { name: /^Academy(?: Bracket)?$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__uiFixture.refreshes)).toBe(2);
});

test("overview panels commit locally while preserving fresh authority Back Forward and reload", async ({ page }) => {
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Rules", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/panel=rules/);
  await page.getByRole("tab", { name: "Prizes", exact: true }).click();
  await expect(page).toHaveURL(/panel=prizes/);
  expect(await page.evaluate(() => ({ n: window.__uiFixture.navigations.length, r: window.__uiFixture.refreshes ?? 0 }))).toEqual({ n: 0, r: 2 });
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Rules", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Prizes", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Prizes", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("background refresh updates existing data rather than freezing the loaded snapshot", async ({ page }) => {
  await page.evaluate(() => { window.__uiFixture.onServerRefresh = () => { void window.__uiFixture.deliverTournamentRefresh?.("Fresh authoritative tournament details"); }; });
  await page.getByRole("button", { name: "Participants", exact: true }).click();
  await expect(page.getByRole("button", { name: "Participants", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Fresh authoritative tournament details", { exact: true }).first()).toBeVisible();
});

test("30 native browser commit samples stay below the loaded-panel budget", async ({ page }, testInfo) => {
  const results = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let index = 0; index < 30; index++) {
      const name = index % 2 ? "Details" : "Rules";
      const target = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find(button => button.textContent?.trim() === name);
      if (!target) throw new Error("Loaded overview tab missing");
      const started = performance.now();
      target.click();
      await new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + 1000;
        const check = () => {
          if (target.getAttribute("aria-selected") === "true") resolve();
          else if (performance.now() > deadline) reject(new Error("Presentation commit deadline"));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      samples.push(performance.now() - started);
    }
    return { samples, navigations: window.__uiFixture.navigations.length, refreshes: window.__uiFixture.refreshes ?? 0 };
  });
  const sorted = [...results.samples].sort((a,b)=>a-b);
  const p95 = sorted[Math.ceil(sorted.length * .95)-1];
  await testInfo.attach("native-overview-presentation-timings", { body: JSON.stringify({ ...results, p95, scope: "Isolated real component, native browser commit timing; not remote backend latency" }), contentType: "application/json" });
  expect(results.navigations).toBe(0);
  expect(results.refreshes).toBe(30);
  expect(p95).toBeLessThanOrEqual(200);
});
