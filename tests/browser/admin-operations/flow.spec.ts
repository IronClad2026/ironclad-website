import { test, expect } from "@playwright/test";
const path = "/tests/browser/admin-operations/";
for (const width of [360, 390, 768, 1024, 1440, 1920, 2560]) {
  test("operational hierarchy at " + width, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Operations & Analytics", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pending registrations/ })).toContainText("19");
    await expect(page.getByRole("link", { name: /Manual-review registrations/ })).toContainText("11");
    await expect(page.getByRole("heading", { name: "Attention Required", exact: true })).toBeVisible();
    await expect(page.locator("main")).toHaveJSProperty("scrollWidth", await page.locator("main").evaluate((element) => element.clientWidth));
    await page.getByText("Jump to section", { exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Operations sections" })).toBeVisible();
    await page.getByRole("navigation", { name: "Operations sections" }).getByRole("link", { name: "Attention", exact: true }).click();
    await expect(page).toHaveURL(/#attention-required$/);
    await page.getByText("Recent dispute records", { exact: true }).click();
    await expect(page.getByRole("link", { name: /Iron Vanguard vs Steel Division/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test("empty queues remain honest and query context survives navigation", async ({ page }) => {
  await page.goto(path + "?empty=1&period=7d");
  await expect(page.getByText(/No items in these operational queues/)).toBeVisible();
  await page.locator("summary").filter({ hasText: "All queues" }).click();
  await expect(page.getByRole("region", { name: "Attention Required" }).getByText("Open disputes", { exact: true })).toBeVisible();
  await page.getByText("Jump to section", { exact: true }).click();
  await page.getByRole("navigation", { name: "Operations sections" }).getByRole("link", { name: "Players", exact: true }).click();
  await expect(page).toHaveURL(/period=7d#players$/);
});

for (const width of [360, 390, 768, 1024, 1440, 1920, 2560]) {
  test("analytics domains and exact values at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path + "?period=7d");
    for (const domain of ["Players", "Registrations", "Tournaments", "Matches", "Traffic"]) {
      await page.getByRole("tab", { name: domain, exact: true }).click();
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      await expect(page.getByRole("tab", { name: domain, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("main")).toHaveJSProperty("scrollWidth", await page.locator("main").evaluate((element) => element.clientWidth));
      if (domain !== "Matches") {
        const daily = page.getByRole("tabpanel").locator("summary").filter({ hasText: "View daily values" });
        if (await daily.count()) {
          await daily.first().click();
          await expect(page.getByRole("tabpanel").getByRole("table").last()).toBeVisible();
        }
      }
      await page.screenshot({ path: ".playwright/admin-operations/" + width + "-" + domain + ".png" });
    }
    await expect(page.getByText("Traffic has fixed UTC windows:", { exact: false })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Choose dashboard period" })).toHaveCount(0);
    await page.getByText("Audience breakdowns", { exact: true }).click();
    await expect(page.getByRole("list", { name: "Countries" })).toBeVisible();
  });
}
test("tab keyboard, history, period and deep-link navigation", async ({ page }) => {
  await page.goto(path + "?period=7d#registrations");
  await expect(page.getByRole("tab", { name: "Registrations", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Registrations", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Tournaments", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Traffic", exact: true })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Tournaments", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Traffic", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Registrations", exact: true }).click();
  await page.getByRole("link", { name: "All time", exact: true }).click();
  await expect(page).toHaveURL(/period=all#registrations$/);
  await expect(page.getByRole("tab", { name: "Registrations", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(path + "?period=7d#who-left");
  await expect(page.locator("#who-left")).toHaveAttribute("open", "");
  await expect(page.getByRole("link", { name: /Retained closed account/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Players", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("traffic unavailable and single-point states", async ({ page }) => {
  await page.goto(path + "?unavailable=1#website-traffic");
  await expect(page.getByText("Website traffic analytics unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.goto(path + "?single=1#website-traffic");
  await expect(page.locator('#website-traffic div[data-markers="Vercel Visitors"] span')).toHaveCount(1);
  await expect(page.locator('#website-traffic div[data-markers="Page Views"] span')).toHaveCount(1);
});
