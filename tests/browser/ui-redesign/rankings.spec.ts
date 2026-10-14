import { expect, test, type Page } from "@playwright/test";
import { SUPPORTED_LOCALES } from "../../../lib/i18n/config";

async function openRankings(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/")) {
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  await page.goto(`/tests/browser/ui-redesign/?surface=rankings&${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-ui-fixture-ready", "rankings");
  await expect(page.getByText("1 / 6", { exact: true })).toBeVisible();
  return errors;
}

for (const width of [360, 768, 1440]) {
  test(`Pro continuation retains source history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await openRankings(page);
    const notice = page.getByRole("note", { name: "Transitional Pro season" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("historically Main / Pro");
    await expect(notice).toContainText("only new Pro events (1700+ ELO)");
    await expect(notice).toContainText("future Main events do not count");
    const event = page.getByText("Previous Structure Event", { exact: true });
    await expect(event.locator("..")).toContainText("Legacy · Main / Pro");
    await expect.poll(() => notice.evaluate((element) => {
      let opacity = 1;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        opacity *= Number(getComputedStyle(ancestor).opacity);
      }
      return opacity;
    })).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("transition.png") });
    await page.getByRole("button", { name: "Main Career", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Main Career Competitor");
    await expect(notice).toHaveCount(0);
    await page.getByRole("button", { name: "Legacy · Main / Pro", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Historical Competitor");
    const dimensions = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.width + 1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test(`Pro transition notice is localized and contained in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1000 });
    const errors = await openRankings(page, `locale=${locale}`);
    const notice = page.getByRole("note");
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("1700+ ELO");
    await expect(notice).toContainText("Main / Pro");
    const dimensions = await notice.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    expect(errors).toEqual([]);
  });
}

test("ordinary Pro seasons do not show the one-time transition notice", async ({ page }) => {
  const errors = await openRankings(page, "noTransition=1");
  await expect(page.getByRole("note", { name: "Transitional Pro season" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
