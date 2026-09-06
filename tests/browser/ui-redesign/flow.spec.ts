import { expect, test, type Locator, type Page } from "@playwright/test";

const fixturePath = "/tests/browser/ui-redesign/";
const widths = [360, 390, 768, 1024, 1440, 1920, 3440];

async function openFixture(page: Page, query: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/")) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.goto(`${fixturePath}?${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-ui-fixture-ready", query.includes("surface=dashboard") ? "dashboard" : "tournament");
  await expect(page.locator("main").first()).toBeVisible();
  return errors;
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width + 1);
}

async function expectModalFocusCycle(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:not([disabled]):visible, a[href]:visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex="0"]:visible');
  const first = controls.first();
  const last = controls.last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
}

test("real Tournament component boots without any external runtime", async ({ page }) => {
  const errors = await openFixture(page, "surface=tournament&mixed=1&prizes=1");
  await expect(page.locator("[data-published-tournament-card]:visible")).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
});

test("real async Dashboard and child components boot without authentication or database access", async ({ page }) => {
  const errors = await openFixture(page, "surface=dashboard");
  await expect(page.getByRole("heading", { name: "Steel Vanguard", exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-dashboard-command-centre]")).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__uiFixture.actions)).not.toContain("markInAppNotificationRead");
  expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
});

for (const width of widths) {
  test(`Tournament 4-event composition remains contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    const errors = await openFixture(page, "surface=tournament&events=4&mixed=1&prizes=1");
    await expect(page.locator("[data-published-tournament-card]:visible")).toHaveCount(width < 768 ? 1 : 3);
    if (width >= 768) {
      await page.getByRole("button", { name: "Browse all 4 events", exact: true }).click();
      await expect(page.locator("[data-published-tournament-card]:visible")).toHaveCount(4);
    } else {
      await page.getByText("Other current events · 3", { exact: true }).click();
      await expect(page.getByRole("button", { name: /IronClad Open 4/ })).toBeVisible();
    }
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

for (const count of [1, 2, 3]) {
  test(`${count} current events use the actual adaptive gallery`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors = await openFixture(page, `events=${count}`);
    await expect(page.locator("[data-published-tournament-card]:visible")).toHaveCount(count);
    await expect(page.locator("[data-selected-event]:visible")).toHaveCount(1);
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`event selection preserves selected context and conditional panels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openFixture(page, "events=4&prizes=1");
    if (width < 768) {
      await page.getByText("Other current events · 3", { exact: true }).click();
      await page.getByRole("button", { name: /IronClad Open 4/ }).click();
    } else {
      await page.getByRole("button", { name: "Browse all 4 events", exact: true }).click();
      await page.locator("[data-published-tournament-card]:visible").filter({ has: page.getByRole("heading", { name: "IronClad Open 4", exact: true }) }).getByRole("button", { name: "View event", exact: true }).click();
    }
    await expect(page.locator("[data-selected-event]:visible")).toContainText("IronClad Open 4");
    await expect(page).toHaveURL(/tournament=fixture-event-4/);
    await page.getByRole("tab", { name: "Prizes", exact: true }).click();
    await expect(page.getByText("$300 total — awarded by Division", { exact: true }).last()).toBeVisible();
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`Map viewer retains Division facts and native modal focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openFixture(page, "mixed=1");
    const trigger = page.getByRole("button", { name: "View Maps", exact: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-map-pool-entry]:visible")).toContainText("Frozen");
    await expect(page.locator("[data-map-pool-entry]:visible")).toContainText("Published");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Competitive Map Pools", exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByRole("heading", { name: "Academy Bracket", exact: true })).toBeVisible();
    await expect(dialog.getByText("Road to Tunis", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Retired", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Temporarily disabled", { exact: true })).toBeVisible();
    if (width < 768) {
      await dialog.getByRole("combobox", { name: "Division", exact: true }).selectOption({ label: "Challenge Bracket · 3" });
    } else {
      await dialog.getByRole("button", { name: /Challenge Bracket/ }).click();
    }
    await expect(dialog.getByRole("heading", { name: "Challenge Bracket", exact: true })).toBeVisible();
    await expect(dialog.getByText("3 maps", { exact: true })).toBeVisible();
    await expectModalFocusCycle(page, dialog);
    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await expectNoOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });

  test(`Map viewer discards stale event and Division context at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openFixture(page, "events=2&mixed=1&contextMaps=1");
    await page.getByRole("button", { name: "View Maps", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Competitive Map Pools", exact: true });
    if (width < 768) {
      await dialog.getByRole("combobox", { name: "Division", exact: true }).selectOption({ label: "Challenge Bracket · 3" });
    } else {
      await dialog.getByRole("button", { name: /Challenge Bracket/ }).click();
    }
    await page.keyboard.press("Escape");
    if (width < 768) {
      await page.getByText("Other current events · 1", { exact: true }).click();
      await page.getByRole("button", { name: /IronClad Open 2/ }).click();
    } else {
      await page.locator("[data-published-tournament-card]:visible").filter({ has: page.getByRole("heading", { name: "IronClad Open 2", exact: true }) }).getByRole("button", { name: "View event", exact: true }).click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "View Maps", exact: true }).click();
    await expect(dialog.getByText("IronClad Open 2", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Academy Bracket", exact: true })).toBeVisible();
    await expect(dialog.getByText("2 maps", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Event 2 · Road to Tunis", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Road to Tunis", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "Challenge Bracket", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`Archive is on demand and retains six existing destinations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openFixture(page, "events=1");
    const trigger = page.getByRole("button", { name: "Open Archive", exact: true });
    await expect(page.getByText("Beta Blitz Tournament", { exact: true })).toHaveCount(0);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Tournament Archive", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('a[href^="https://battlefy.com/"]')).toHaveCount(6);
    for (const link of await dialog.locator("a").all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
    await expectModalFocusCycle(page, dialog);
    await expectNoOverflow(page);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("Reference dialog closes on desktop backdrop but not on its content", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = await openFixture(page, "mixed=1");
  const trigger = page.getByRole("button", { name: "View Maps", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Competitive Map Pools", exact: true });
  await dialog.getByRole("heading", { name: "Competitive Map Pools", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThan(10);
  await page.mouse.click(box!.x - 8, box!.y + 20);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  expect(errors).toEqual([]);
});

for (const ratio of ["portrait", "wide"]) {
  test(`${ratio} artwork fits without changing its source or obscuring edge markers`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openFixture(page, `ratio=${ratio}`);
    const image = page.locator("[data-tournament-banner]:visible img");
    await expect(image).toHaveCSS("object-fit", "contain");
    expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const source = await image.getAttribute("src");
    await page.getByRole("button", { name: "View artwork", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("img")).toHaveAttribute("src", source!);
    await expect(dialog.locator("img")).toHaveCSS("object-fit", "contain");
    await page.keyboard.press("Escape");
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("long organiser text stays exact and can be fully expanded", async ({ page }) => {
  const errors = await openFixture(page, "long=1");
  const card = page.locator("[data-selected-event]:visible");
  const description = card.locator("p").filter({ hasText: "FullDescriptionEndMarker" });
  const storedText = await description.textContent();
  await expect(description).toHaveCSS("white-space", "pre-wrap");
  await card.getByRole("button", { name: "Read full description", exact: true }).click();
  expect(await description.textContent()).toBe(storedText);
  await expect(card.getByRole("button", { name: "Show less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("Russian long-text missing-image layout remains usable at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const errors = await openFixture(page, "locale=ru&long=1&missing=1&mixed=1&prizes=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator("[data-tournament-banner]:visible img")).toHaveCount(0);
  await expect(page.locator("[data-tournament-banner]:visible [role=img]")).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("explicit cancelled event stays reachable without becoming current", async ({ page }) => {
  const errors = await openFixture(page, "events=2&historical=1");
  await expect(page).toHaveURL(/tournament=fixture-event-2/);
  await expect(page.getByRole("heading", { name: "Historical IronClad Open 2", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
