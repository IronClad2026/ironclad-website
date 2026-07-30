import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/about", "/rules"];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.continue();
      return;
    }

    await route.abort("blockedbyclient");
  });
});

for (const route of publicRoutes) {
  test(`${route} renders as a public smoke route`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("anonymous visitors should reach the public players directory", async ({
  page,
}) => {
  const response = await page.goto("/players", {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Players Directory" })
  ).toBeVisible();
});
