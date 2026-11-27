import { expect, test, type Page } from "@playwright/test";

const viewportSelector = "[data-caster-showcase-viewport]";
const trackSelector = "[data-caster-showcase-track]";
test.setTimeout(60_000);

async function openShowcase(page: Page, count = 2) {
  await page.route("**/api/caster/public-media/**", (route) =>
    route.fulfill({ path: "public/caster-invitation/logo.webp", contentType: "image/webp" }));
  await page.goto(`/tests/browser/ui-redesign/caster-showcase.html?casters=${count}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Official Caster Showcase" })).toBeVisible({ timeout: 15_000 });
}

test("a short roster moves at a constant speed and fills the seam on a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openShowcase(page);
  await expect(page.locator(viewportSelector)).toHaveAttribute("data-mode", "moving");
  const geometry = await page.locator(trackSelector).evaluate((track) => {
    const element = track as HTMLElement;
    const animation = element.getAnimations()[0];
    const duration = Number(animation.effect?.getTiming().duration);
    const distance = parseFloat(element.style.getPropertyValue("--caster-distance"));
    const viewport = element.parentElement!.getBoundingClientRect();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('a[href="/casters/synthetic-caster-1"]')];
    const offsetNearLeft = (time: number) => {
      animation.currentTime = time;
      const positions = links.map((link) => link.getBoundingClientRect().left - viewport.left);
      return positions.reduce((nearest, position) => Math.abs(nearest) < Math.abs(position) ? nearest : position);
    };
    animation.pause();
    const start = offsetNearLeft(0);
    const oneSecond = offsetNearLeft(1000);
    const beforeSeam = offsetNearLeft(duration - 100);
    const coveringWidth = element.getBoundingClientRect().right - viewport.right;
    const afterSeam = offsetNearLeft(duration + 100);
    return { start, oneSecond, beforeSeam, afterSeam, distance, duration, coveringWidth };
  });
  expect(geometry.distance).toBeLessThan(1000);
  expect(geometry.distance * 1000 / geometry.duration).toBeCloseTo(22);
  expect(geometry.start - geometry.oneSecond).toBeCloseTo(22, 0);
  expect(geometry.beforeSeam - geometry.afterSeam).toBeCloseTo(4.4, 0);
  expect(geometry.coveringWidth).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole("group", { name: "Official Caster Showcase" }).getByRole("link")).toHaveCount(2);
  await page.locator('[data-caster-repeat] a[href="/casters/synthetic-caster-1"]').first().click();
  await expect.poll(() => page.evaluate(() => window.__uiFixture.navigations.at(-1))).toBe("/casters/synthetic-caster-1");
});

test("pause, hover and keyboard focus stop motion without duplicating focus targets", async ({ page }) => {
  await openShowcase(page, 4);
  const track = page.locator(trackSelector);
  const tray = page.locator(viewportSelector);
  const pause = page.getByRole("button", { name: "Pause showcase" });
  await expect(track).toHaveCSS("animation-play-state", "running");
  await tray.hover();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await pause.click();
  const resume = page.getByRole("button", { name: "Resume showcase" });
  await expect(resume).toBeVisible();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await resume.click();
  await expect(track).toHaveCSS("animation-play-state", "running");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const originals = tray.locator("[data-caster-original] a");
  await expect(originals.first()).toBeFocused();
  await expect(tray).toHaveAttribute("data-mode", "browse");
  await expect(track).toHaveCSS("animation-name", "none");
  await page.keyboard.press("ArrowRight");
  await expect(originals.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__uiFixture.navigations.at(-1))).toBe("/casters/synthetic-caster-2");
});

test("reduced motion exposes a scrollable roster and single and empty rosters do not animate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShowcase(page, 4);
  const tray = page.locator(viewportSelector);
  await expect(tray).toHaveAttribute("data-mode", "browse");
  await expect(page.getByRole("button", { name: "Pause showcase" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  await expect.poll(() => tray.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await openShowcase(page, 1);
  await expect(page.getByRole("link", { name: /Synthetic Caster 1/ })).toBeVisible();
  await expect(page.locator(trackSelector)).toHaveCount(0);
  await openShowcase(page, 0);
  await expect(page.locator(trackSelector)).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
});

test.describe("touch showcase", () => {
  test.use({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });

  test("a horizontal swipe switches to browsing and a tapped card still opens the correct profile", async ({ page }) => {
    await openShowcase(page);
    const tray = page.locator(viewportSelector);
    await expect(tray).toHaveAttribute("data-mode", "moving");
    const original = tray.locator("[data-caster-original] a").first();
    await original.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 180, clientY: 190 });
    await original.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, clientX: 60, clientY: 190 });
    await expect(tray).toHaveAttribute("data-mode", "browse");
    const next = tray.locator("[data-caster-original] a").nth(1);
    await next.tap();
    await expect.poll(() => page.evaluate(() => window.__uiFixture.navigations.at(-1))).toBe("/casters/synthetic-caster-2");
  });
});
