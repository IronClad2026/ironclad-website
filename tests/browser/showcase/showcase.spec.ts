import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3193" || url.pathname.startsWith("/api/")) await route.abort("blockedbyclient");
    else await route.continue();
  });
  await page.goto(`/tests/browser/showcase/?${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-showcase-fixture-ready", query.includes("surface=editor") ? "editor" : "public");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  return errors;
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }, { width: 2560, height: 1200 }]) {
  test(`public identity is contained and badge does not cover avatar at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = await openFixture(page, "long=1&discord=1");
    const badge = page.locator("[data-featured-achievement]");
    const avatar = page.getByRole("img", { name: /avatar/i }).first();
    const badgeBox = await badge.boundingBox();
    const avatarBox = await avatar.boundingBox();
    expect(badgeBox!.y).toBeGreaterThanOrEqual(avatarBox!.y + avatarBox!.height);
    expect(badgeBox!.width).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await expect(page.locator("video")).toHaveCount(0);
    const cap = await page.locator("[data-player-showcase] > div").boundingBox();
    expect(cap!.width).toBeLessThanOrEqual(1280);
    expect(errors).toEqual([]);
    if (viewport.width === 390 || viewport.width === 1440) await page.screenshot({ path: testInfo.outputPath(`public-${viewport.width}.png`), fullPage: true });
  });
}

test("badge detail has native keyboard dismissal and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openFixture(page);
  const trigger = page.locator("[data-featured-achievement]");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("First Victory");
  await expect(dialog).toHaveCSS("height", "844px");
  const close = dialog.getByRole("button", { name: "Close Badge details" });
  await close.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("editor saves badge while retaining draft and saves thought afterward", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openFixture(page, "surface=editor&private=1");
  await expect(page.getByRole("link", { name: "View Public Profile" })).toHaveCount(0);
  await page.getByRole("textbox").fill("GGs everyone 😎");
  await page.getByRole("button", { name: "Change achievement" }).click();
  await page.getByRole("button", { name: "Showcase Elite Champion" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveValue("GGs everyone 😎");
  await page.getByRole("button", { name: "Save thought" }).click();
  await expect(page.locator("[data-fixture-saved]")).toContainText('"currentThought":"GGs everyone 😎"');
  await expect(page.locator("[data-fixture-saved]")).toContainText('"featuredBadgeAwardId":"earned-2"');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("editor-390.png"), fullPage: true });
  expect(errors).toEqual([]);
});

for (const locale of ["it", "zh-CN", "ru", "es", "pt-BR", "ko", "fr"]) {
  test(`localized editor remains usable at 320px: ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const errors = await openFixture(page, `surface=editor&locale=${locale}&private=1&hidden=1`);
    await expect(page.getByRole("textbox")).toBeVisible();
    await noOverflow(page);
    expect(await page.locator("body").innerText()).not.toContain("showcase.");
    expect(errors).toEqual([]);
  });
}

test("large text and reduced motion preserve usable controls and empty profile has no slots", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await openFixture(page, "surface=editor&largeText=1");
  await noOverflow(page);
  await page.getByRole("button", { name: "Change achievement" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await openFixture(page, "empty=1");
  await expect(page.locator("[data-current-thought], [data-featured-achievement], video")).toHaveCount(0);
  expect(errors).toEqual([]);
});