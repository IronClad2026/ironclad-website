import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
// This is a read-only, synthetic Staging fixture with one frozen Academy pool
// and five maps. Unit and integration coverage own the zero/two/three-pool
// cases so browser acceptance never mutates Staging or clones live DOM nodes.
const tournamentPath =
  process.env.PLAYWRIGHT_MAP_POOL_TOURNAMENT_PATH?.trim() ??
  "/tournaments?tournament=staging-rehearsal-academy-career-standings";

const responsiveViewports = [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1279, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1536, height: 960 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
] as const;

const mobileTooltipWidths = [360, 375, 390] as const;

test.describe("competitive map-pool responsive presentation", () => {
  test.skip(
    !externalBaseUrl,
    "Requires the verified synthetic Staging fixture through an immutable Preview or an isolated local build."
  );

  for (const viewport of responsiveViewports) {
    test(`${viewport.width}x${viewport.height} keeps the real pool full width with monotonic map columns`, async ({
      page,
    }) => {
      const browserErrors = collectBrowserErrors(page);

      await page.setViewportSize(viewport);
      await gotoTournament(page);

      const region = visibleMapPoolRegion(page);
      const stack = region.locator(":scope > div.mt-6");
      const article = stack.locator(":scope > article");

      await expect(region).toBeVisible();
      await expect(article).toHaveCount(1);
      await expect(article).toBeVisible();
      await expect(region).not.toHaveCSS("overflow-x", "hidden");

      const expectedMapColumns =
        viewport.width >= 1536 ? 3 : viewport.width >= 640 ? 2 : 1;
      const stackBox = await requiredBox(stack);
      const articleBox = await requiredBox(article);
      const mapGrid = article.locator(":scope > ul");
      const mapCards = mapGrid.locator(":scope > li");

      expect(Math.abs(articleBox.width - stackBox.width)).toBeLessThanOrEqual(2);
      expect(await gridColumnCount(mapGrid)).toBe(expectedMapColumns);
      await expect(mapCards).toHaveCount(5);
      expect((await requiredBox(mapCards.first())).width).toBeGreaterThanOrEqual(
        200
      );
      await expect(article.getByText("5 maps", { exact: true })).toBeVisible();
      await expect(article.getByText("Frozen", { exact: true })).toBeVisible();
      await expect(article.getByText("1v1", { exact: true })).toHaveCount(5);
      await expect(article.getByText("Active", { exact: true })).toHaveCount(5);

      const overflow = await article.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      await expectNoDocumentOverflow(page);
      expect(browserErrors).toEqual([]);
    });
  }

  test("uses deterministic map order for the verified five-map fixture", async ({
    page,
  }) => {
    const browserErrors = collectBrowserErrors(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoTournament(page);

    const region = visibleMapPoolRegion(page);
    await expect(region).toBeVisible();
    const mapNames = await region
      .locator("article:first-of-type ul > li p.font-black")
      .allTextContents();
    const normalizedNames = mapNames.map(normalizeMapName);

    expect(normalizedNames).toHaveLength(5);
    expect(normalizedNames).toEqual([...normalizedNames].sort());
    await expect(
      region.getByRole("heading", { name: "Academy Bracket" })
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  for (const width of mobileTooltipWidths) {
    test(`${width}px keeps the tooltip in bounds during keyboard-only use`, async ({
      page,
    }) => {
      const browserErrors = collectBrowserErrors(page);

      await page.setViewportSize({ width, height: 844 });
      await gotoTournament(page);

      const region = visibleMapPoolRegion(page);
      await expect(region).toBeVisible();
      const tooltipTrigger = region.getByRole("button", {
        name: /about the frozen map pool/i,
      });

      await focusByKeyboard(page, tooltipTrigger);
      const focusStyle = await tooltipTrigger.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        };
      });
      expect(focusStyle.outlineStyle).not.toBe("none");
      expect(focusStyle.outlineWidth).toBeGreaterThan(0);

      const tooltip = region.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expectInsideViewport(tooltip, page);

      await page.keyboard.press("Escape");
      await expect(tooltip).toBeHidden();
      expect(browserErrors).toEqual([]);
    });
  }

  test("supports a coarse-pointer 390x844 mobile context without hover", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const browserErrors = collectBrowserErrors(page);

    try {
      await gotoTournament(page);
      const region = visibleMapPoolRegion(page);
      await expect(region).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            navigator.maxTouchPoints > 0 &&
            window.matchMedia("(pointer: coarse)").matches
        )
      ).toBe(true);

      const tooltipTrigger = region.getByRole("button", {
        name: /about the frozen map pool/i,
      });
      await tooltipTrigger.tap();
      const tooltip = region.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expectInsideViewport(tooltip, page);
      await expectNoDocumentOverflow(page);
      expect(browserErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("keeps the Russian translation within a 360px viewport", async ({
    context,
    page,
  }) => {
    const browserErrors = collectBrowserErrors(page);
    await context.addCookies([
      {
        name: "ironclad_locale",
        value: "ru",
        url: requiredExternalBaseUrl(),
      },
    ]);
    await page.setViewportSize({ width: 360, height: 844 });
    await gotoTournament(page);

    const region = visibleMapPoolRegion(page);
    await expect(region).toBeVisible();
    await expect(
      region.getByRole("heading", { name: "Опубликовано по дивизионам" })
    ).toBeVisible();
    await expectNoDocumentOverflow(page);
    expect(browserErrors).toEqual([]);
  });

  test("reflows safely at a 1440x900 display's 200% effective Chromium viewport", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Uses Chromium device metrics.");

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const browserErrors = collectBrowserErrors(page);
    const cdp = await context.newCDPSession(page);

    try {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 720,
        height: 450,
        deviceScaleFactor: 2,
        mobile: false,
        screenWidth: 1440,
        screenHeight: 900,
      });
      await gotoTournament(page);

      expect(
        await page.evaluate(() => ({
          devicePixelRatio: window.devicePixelRatio,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        }))
      ).toEqual({ devicePixelRatio: 2, innerHeight: 450, innerWidth: 720 });

      const region = visibleMapPoolRegion(page);
      await expect(region).toBeVisible();
      expect(
        await gridColumnCount(region.locator("article:first-of-type > ul"))
      ).toBe(2);
      await expectNoDocumentOverflow(page);
      expect(browserErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

function requiredExternalBaseUrl() {
  if (!externalBaseUrl) {
    throw new Error("PLAYWRIGHT_BASE_URL is required for this test.");
  }
  return new URL(externalBaseUrl).origin;
}

function tournamentUrl() {
  return new URL(tournamentPath, requiredExternalBaseUrl()).href;
}

async function gotoTournament(page: Page) {
  const response = await page.goto(tournamentUrl(), {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
}

function visibleMapPoolRegion(page: Page) {
  return page.locator("section[aria-label]:visible:has(article)").first();
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

function normalizeMapName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

async function gridColumnCount(locator: Locator) {
  return locator.evaluate((element) => {
    const columns = window.getComputedStyle(element).gridTemplateColumns;
    return columns === "none" ? 1 : columns.split(" ").filter(Boolean).length;
  });
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Expected a visible element with a bounding box.");
  return box;
}

async function focusByKeyboard(page: Page, locator: Locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  throw new Error(
    "Tooltip trigger was not reachable with keyboard-only Tab navigation."
  );
}

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectInsideViewport(locator: Locator, page: Page) {
  const [box, viewport] = await Promise.all([
    requiredBox(locator),
    page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })),
  ]);

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}
