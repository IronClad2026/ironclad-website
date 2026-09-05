import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort()
  );
  await page.clock.install({ time: new Date("2026-09-04T14:00:00Z") });
});
for (const width of [360, 390, 412, 430, 1280])
  test("result flow at " + width + "px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/match-result/");
    await page.getByRole("button", { name: "Won", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Score", exact: true })
      .selectOption("2-1");
    await expect(page.locator('input[type="file"]')).toHaveCount(3);
    for (let i = 1; i <= 3; i++)
      await page
        .getByLabel("Game " + i + " replay", { exact: true })
        .setInputFiles({
          name: "game-" + i + "-a-long-replay-file-name-to-check-wrapping.rec",
          mimeType: "application/octet-stream",
          buffer: Buffer.from("fixture-game-" + i),
        });
    await page
      .getByRole("group", { name: "Game 1 winner", exact: true })
      .getByRole("button", { name: "TestAcademy4" })
      .click();
    await expect(
      page.getByText("Determined by the result", { exact: true })
    ).toHaveCount(2);
    await expect(
      page.getByText("Marco defeated TestAcademy4, 2–1", { exact: true })
    ).toBeVisible();
    const submit = page.getByRole("button", {
      name: "Submit Result",
      exact: true,
    });
    await expect(submit).toBeEnabled();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath("entry-" + width + ".png"),
      fullPage: true,
    });
    await submit.click();
    await expect(
      page.getByRole("heading", { name: "Waiting for opponent confirmation" })
    ).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByText(/opponent has 30 minutes/)).toBeVisible();
    await expect(page.getByText(/remaining$/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Discord Support Ticket" })
    ).toHaveAttribute("target", "_blank");
    await page.screenshot({
      path: testInfo.outputPath("waiting-" + width + ".png"),
      fullPage: true,
    });
  });
test("opponent actions, expiry processing, review and automatic confirmation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/browser/match-result/?scenario=opponent");
  await expect(
    page.getByRole("button", { name: "Confirm Result", exact: true })
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Dispute Result", exact: true })
    .click();
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("opponent.png"),
    fullPage: true,
  });
  await page.clock.fastForward(30 * 60_000 + 1000);
  await expect(
    page.getByText("Automatic confirmation is being processed.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Result", exact: true })
  ).toHaveCount(0);
  await page.goto("/tests/browser/match-result/?scenario=review");
  await expect(
    page.getByRole("heading", { name: "Under Admin Review" })
  ).toBeVisible();
  await page.goto("/tests/browser/match-result/?scenario=auto");
  await expect(
    page.getByRole("heading", { name: "Result automatically confirmed" })
  ).toBeVisible();
  await expect(page.getByText("The winner has advanced.")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});
