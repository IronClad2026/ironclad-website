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
