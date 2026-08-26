import { expect, test, type Locator, type Page } from "@playwright/test";

import { getLegalDocument } from "../lib/legal-corpus-publication";

const localHostnames = new Set(["127.0.0.1", "localhost", "::1"]);
const mobileViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;
const desktopViewport = { width: 1440, height: 900 } as const;
const smokeViewports = [
  ...mobileViewports.map((viewport) => ({
    ...viewport,
    expectedOpacity: 0.42,
  })),
  { width: 1366, height: 768, expectedOpacity: 0.192 },
  { width: 2560, height: 1440, expectedOpacity: 0.192 },
  { width: 3440, height: 1440, expectedOpacity: 0.192 },
] as const;

function getAllowedOrigin(baseURL: string | undefined) {
  return baseURL ? new URL(baseURL).origin : null;
}

async function blockExternalRequests(
  page: Page,
  baseURL: string | undefined
) {
  const allowedOrigin = getAllowedOrigin(baseURL);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (localHostnames.has(url.hostname) || url.origin === allowedOrigin) {
      await route.continue();
      return;
    }

    await route.abort("blockedbyclient");
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );
}

async function expectInside(
  child: Locator,
  parent: Locator,
  tolerance = 1
) {
  const [childBox, parentBox] = await Promise.all([
    child.boundingBox(),
    parent.boundingBox(),
  ]);

  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();

  if (!childBox || !parentBox) {
    return;
  }

  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - tolerance);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - tolerance);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + tolerance
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + tolerance
  );
}

async function expectHeroCtasToFit(page: Page) {
  const hero = page.locator('section[aria-labelledby="home-hero-title"]');
  const ctas = [
    hero.locator('a[href="/tournaments"]'),
    hero.locator('a[href^="https://discord.gg/"]'),
  ];

  await expect(hero).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const cta of ctas) {
    const label = cta.locator(":scope > span");
    const icon = cta.locator(":scope > svg");

    await expect(cta).toBeVisible();
    await expect(label).toBeVisible();
    await expect(icon).toBeVisible();
    await expect(cta).toHaveCSS("min-height", "48px");

    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const labelMetrics = await label.evaluate((element) => {
      const styles = window.getComputedStyle(element);

      return {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        overflowWrap: styles.overflowWrap,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.trim() ?? "",
        whiteSpace: styles.whiteSpace,
      };
    });

    expect(labelMetrics.text.length).toBeGreaterThan(0);
    expect(labelMetrics.whiteSpace).toBe("normal");
    expect(labelMetrics.overflowWrap).toBe("anywhere");
    expect(labelMetrics.scrollWidth).toBeLessThanOrEqual(
      labelMetrics.clientWidth + 1
    );
    expect(labelMetrics.scrollHeight).toBeLessThanOrEqual(
      labelMetrics.clientHeight + 1
    );

    await expectInside(cta, hero);
    await expectInside(label, cta);
    await expectInside(icon, cta);
  }
}

async function expectFooterToFit(page: Page) {
  const footer = page.locator("footer");
  const copyright = footer.locator("p").first();
  const navigation = footer.getByRole("navigation");
  const links = navigation.locator("a");
  const footerActions = navigation.locator(":scope > a, :scope > button");
  const musicPlayer = page.getByRole("complementary", {
    name: "IronClad theme music player",
  });
  const rulebook = getLegalDocument("rulebook");
  const participationAgreement = getLegalDocument("ppa");
  const expectedDestinations = [
    "/rules",
    rulebook.publicPath,
    participationAgreement.publicPath,
    "/terms",
    "/privacy",
  ];

  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await expect(copyright).toBeVisible();
  await expect(navigation).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expect(links).toHaveCount(expectedDestinations.length);
  await expect
    .poll(() => links.evaluateAll((elements) => elements.map((link) => link.getAttribute("href"))))
    .toEqual(expectedDestinations);

  await expectInside(copyright, footer);
  await expectInside(navigation, footer);

  const linkCount = await links.count();

  for (let index = 0; index < linkCount; index += 1) {
    const link = links.nth(index);
    const box = await link.boundingBox();

    await expect(link).toBeVisible();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectInside(link, navigation);
    await expectInside(link, footer);
  }

  if ((await musicPlayer.count()) === 1) {
    const musicPlayerBox = await musicPlayer.boundingBox();
    expect(musicPlayerBox).not.toBeNull();

    if (musicPlayerBox) {
      const actionCount = await footerActions.count();

      for (let index = 0; index < actionCount; index += 1) {
        const actionBox = await footerActions.nth(index).boundingBox();
        expect(actionBox).not.toBeNull();

        if (actionBox) {
          const horizontalOverlap =
            Math.min(actionBox.x + actionBox.width, musicPlayerBox.x + musicPlayerBox.width) -
            Math.max(actionBox.x, musicPlayerBox.x);
          const verticalOverlap =
            Math.min(actionBox.y + actionBox.height, musicPlayerBox.y + musicPlayerBox.height) -
            Math.max(actionBox.y, musicPlayerBox.y);

          expect(
            horizontalOverlap <= 0.5 || verticalOverlap <= 0.5,
            `Footer action ${index} overlaps the fixed music player`
          ).toBe(true);
        }
      }
    }
  }

  const regions = await footer.locator("p, nav, nav > a").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();

      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    })
  );

  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < regions.length;
      rightIndex += 1
    ) {
      const left = regions[leftIndex];
      const right = regions[rightIndex];
      const nested =
        (leftIndex === 1 && rightIndex > 1) ||
        (rightIndex === 1 && leftIndex > 1);

      if (nested) {
        continue;
      }

      const horizontalOverlap =
        Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const verticalOverlap =
        Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);

      expect(
        horizontalOverlap <= 0.5 || verticalOverlap <= 0.5,
        `Footer regions ${leftIndex} and ${rightIndex} overlap`
      ).toBe(true);
    }
  }
}

function smokeOverlay(page: Page) {
  return page
    .locator('video:has(source[src="/effects/smoke.webm"])')
    .locator("..");
}

test.beforeEach(async ({ baseURL, page }) => {
  await blockExternalRequests(page, baseURL);
});

for (const viewport of [...mobileViewports, desktopViewport]) {
  test(`Home hero CTAs fit at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expectHeroCtasToFit(page);
  });
}

test("Home hero CTAs remain wrap-safe in a long locale", async ({
  baseURL,
  page,
}) => {
  expect(baseURL).toBeTruthy();
  await page.context().addCookies([
    {
      name: "ironclad_locale",
      url: new URL("/", baseURL).toString(),
      value: "ru",
    },
  ]);
  await page.setViewportSize(mobileViewports[0]);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expectHeroCtasToFit(page);

  const longLabel = page.locator(
    'section[aria-labelledby="home-hero-title"] a[href^="https://discord.gg/"] > span'
  );
  const labelText = (await longLabel.textContent())?.trim() ?? "";

  expect(labelText.length).toBeGreaterThan(20);
});

for (const viewport of [...mobileViewports, desktopViewport]) {
  test(`Footer remains aligned at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expectFooterToFit(page);
  });
}

test("Global smoke preserves responsive visibility without intercepting content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize(smokeViewports[0]);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const overlay = smokeOverlay(page);
  const video = overlay.locator("video");
  const foregroundCta = page.locator(
    'section[aria-labelledby="home-hero-title"] a[href="/tournaments"]'
  );

  await expect(overlay).toBeVisible();
  await expect(video).toHaveCount(1);
  await expect(video.locator('source[src="/effects/smoke.webm"]')).toHaveCount(
    1
  );

  for (const viewport of smokeViewports) {
    await page.setViewportSize(viewport);
    await expect(overlay).toHaveCSS("pointer-events", "none");

    const opacity = Number(await overlay.evaluate((element) =>
      window.getComputedStyle(element).opacity
    ));
    const overlayBox = await overlay.boundingBox();

    expect(opacity).toBeCloseTo(viewport.expectedOpacity, 3);
    expect(overlayBox).not.toBeNull();
    expect(overlayBox?.width ?? 0).toBeCloseTo(viewport.width, 0);
    expect(overlayBox?.height ?? 0).toBeCloseTo(viewport.height, 0);

    await foregroundCta.scrollIntoViewIfNeeded();
    await expect(foregroundCta).toBeVisible();

    const foregroundIsReachable = await foregroundCta.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const foreground = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );

      return foreground?.closest("a") === element;
    });

    expect(foregroundIsReachable).toBe(true);
  }
});

test("Android keeps the mobile smoke visibility override", async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL,
    reducedMotion: "no-preference",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    viewport: { width: 800, height: 1280 },
  });

  try {
    const page = await context.newPage();
    await blockExternalRequests(page, baseURL);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const overlay = smokeOverlay(page);
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS("opacity", "0.42");
    await expect(overlay).toHaveCSS("pointer-events", "none");
  } finally {
    await context.close();
  }
});

test("Reduced-motion preference hides the smoke layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(smokeOverlay(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.locator('video:has(source[src="/effects/smoke.webm"])')
  ).toHaveCount(0);
});
