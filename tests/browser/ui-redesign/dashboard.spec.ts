import { expect, test, type Locator, type Page } from "@playwright/test";

const widths = [360, 390, 768, 1024, 1440, 1920, 3440];

async function openDashboard(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/") ||
      (query.includes("missingBadge=1") && route.request().resourceType() === "image" && url.pathname.includes("/badges/"))) {
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  await page.goto(`/tests/browser/ui-redesign/?surface=dashboard&${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-ui-fixture-ready", "dashboard");
  await expect(page.locator("[data-dashboard-command-centre]")).toBeVisible();
  await expect(page.locator("[data-dashboard-section=history]")).toBeVisible();
  return errors;
}

async function expectNoOverflow(page: Page) {
  const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.page).toBeLessThanOrEqual(size.viewport + 1);
}

async function expectFocusCycle(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:not([disabled]):visible, a[href]:visible, select:not([disabled]):visible, [tabindex="0"]:visible');
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
}

for (const width of widths) {
  test(`Dashboard command centre and career remain contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    const errors = await openDashboard(page);
    await expect(page.getByRole("heading", { name: "Steel Vanguard", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your Competition", exact: true })).toBeVisible();
    await expect(page.locator("[data-dashboard-section=registrations] article")).toHaveCount(2);
    await expect(page.locator("#dashboard-badges")).toBeVisible();
    await expect(page.locator("[data-dashboard-badge-showcase-item]")).toHaveCount(3);
    const identityColumns = await page.locator("[data-dashboard-section=identity] > div").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" "));
    expect(identityColumns).toHaveLength(width < 1280 ? 2 : 3);
    await expect(page.locator(".order-first").first()).toHaveCSS("order", "-9999");
    await expect(page.locator("[data-dashboard-section=statistics] dl > div")).toHaveCount(6);
    const history = page.locator("[data-dashboard-section=history]");
    await expect(history.getByRole("tab", { name: "Matches 6", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(history.locator("button[aria-haspopup=dialog]")).toHaveCount(6);
    await history.getByRole("tab", { name: "Champions 1", exact: true }).click();
    await expect(history.getByText("Steel Vanguard", { exact: true })).toBeVisible();
    await history.getByRole("tab", { name: "Previous registrations 1", exact: true }).click();
    await expect(page.locator("#registration-registration-3")).toBeVisible();
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.actions)).not.toContain("markInAppNotificationRead");
  });
}

test("empty Dashboard keeps informative current and career states", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const errors = await openDashboard(page, "empty=1");
  await expect(page.getByRole("heading", { name: "No current registrations", exact: true })).toBeVisible();
  await expect(page.getByText("No completed Matches", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Previous registrations 0", exact: true }).click();
  await expect(page.getByText("No previous registrations.", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("missing profile offers the real completion path", async ({ page }) => {
  const errors = await openDashboard(page, "noProfile=1&empty=1");
  await expect(page.getByRole("heading", { name: "Player profile required", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Complete Player Profile", exact: true })).toHaveAttribute("href", "/profile");
  expect(errors).toEqual([]);
});

test("Russian long player identity remains contained at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const errors = await openDashboard(page, "locale=ru&long=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator("[data-dashboard-section=identity]")).toContainText("Commander_LongPlayerName");
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("profile load failure stays distinct from profile onboarding", async ({ page }) => {
  const errors = await openDashboard(page, "profileError=1");
  await expect(page.locator("[data-dashboard-section=identity]").getByRole("alert")).toHaveText("Your player profile could not be loaded.");
  await expect(page.getByRole("heading", { name: "Player profile required", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("career failure does not hide independent previous registrations", async ({ page }) => {
  const errors = await openDashboard(page, "careerError=1");
  const history = page.locator("[data-dashboard-section=history]");
  await expect(history.getByRole("alert")).toHaveText("Your competitive history could not be loaded.");
  await history.getByRole("tab", { name: "Previous registrations 1", exact: true }).click();
  await expect(page.locator("#registration-registration-3")).toBeVisible();
  await expect(history.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("registration failure is not presented as an empty career", async ({ page }) => {
  const errors = await openDashboard(page, "registrationError=1");
  const history = page.locator("[data-dashboard-section=history]");
  await expect(history.locator("button[aria-haspopup=dialog]")).toHaveCount(6);
  await history.getByRole("tab", { name: "Previous registrations", exact: true }).click();
  await expect(history.getByRole("alert")).toHaveText("Your Tournament Registrations could not be loaded.");
  await expect(history.getByText("No previous registrations.", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("accepted invitation retains continuation without creating a registration", async ({ page }) => {
  const errors = await openDashboard(page, "accepted=1");
  const invitation = page.locator("#division-invitations");
  await expect(invitation.getByText("Accepted. Complete the normal registration flow to join the event.", { exact: true })).toBeVisible();
  await expect(invitation.getByRole("link", { name: "Continue registration", exact: true })).toHaveAttribute("href", "/tournaments?tournament=fixture-event-2&register=1");
  expect(await page.evaluate(() => window.__uiFixture.actions)).not.toContain("respondToTournamentDivisionInvitationAction");
  expect(errors).toEqual([]);
});

test("failed notification update remains visible in collapsed preview", async ({ page }) => {
  const errors = await openDashboard(page);
  const notificationHeader = page.getByRole("button", { name: /^Updates \d+ total/ });
  await expect(notificationHeader).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /Your registration was approved/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your notifications could not be updated." })).toBeVisible();
  await expect(notificationHeader).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => window.__uiFixture.actions)).toContain("markInAppNotificationRead");
  expect(errors).toEqual([]);
});

test("notification reopens hidden historical registration even for repeated same hash", async ({ page }) => {
  const errors = await openDashboard(page, "historicalNotice=1");
  const history = page.locator("[data-dashboard-section=history]");
  const target = page.locator("#registration-registration-3");
  await expect(target).toBeHidden();
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: /Previous waitlist offer/ }).click();
    await expect(page).toHaveURL(/#registration-registration-3$/);
    await expect(history.getByRole("tab", { name: "Previous registrations 1", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(target).toBeVisible();
    if (index === 0) {
      await history.getByRole("tab", { name: "Matches 6", exact: true }).click();
      await expect(target).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});

test("career tabs preserve keyboard arrows Home and End", async ({ page }) => {
  const errors = await openDashboard(page);
  const history = page.locator("[data-dashboard-section=history]");
  await history.getByRole("tab", { name: "Matches 6", exact: true }).focus();
  for (const [key, tab] of [["ArrowRight", "Champions 1"], ["End", "Previous registrations 1"], ["Home", "Matches 6"], ["ArrowLeft", "Previous registrations 1"]]) {
    await page.keyboard.press(key);
    await expect(history.getByRole("tab", { name: tab, exact: true })).toBeFocused();
    await expect(history.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  expect(errors).toEqual([]);
});

for (const width of [390, 1440]) {
  test(`real match details preserve keyboard close focus and proof privacy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openDashboard(page);
    const trigger = page.locator("[data-dashboard-section=history] button[aria-haspopup=dialog]").first();
    await trigger.click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByText("Opponent 1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("2–1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Not attached", { exact: true })).toHaveCount(2);
    await expect(dialog.locator("a")).toHaveCount(0);
    const geometry = await dialog.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      content: Array.from(element.children).reduce((height, child) => height + child.getBoundingClientRect().height, 0),
    }));
    expect(geometry.height - geometry.content, JSON.stringify(geometry)).toBeLessThanOrEqual(4);
    await expectFocusCycle(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("native match viewer yields to the actual pending Badge queue", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await openDashboard(page);
  await page.locator("[data-dashboard-section=history] button[aria-haspopup=dialog]").first().click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.evaluate(async () => { await window.__uiFixture.showPendingBadgeReveal?.(); });
  const reveal = page.locator('[role="dialog"][aria-labelledby^="badge-reveal-"]');
  await expect(reveal).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.locator('[data-badge-slug="first-victory"] [data-badge-reveal-destination="true"]')).toHaveCount(1);
  await expect(page.locator("[data-reveal-phase]")).toHaveAttribute("data-reveal-phase", "ready");
  await expectFocusCycle(page, reveal);
  await reveal.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(reveal).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  expect(await page.evaluate(() => window.__uiFixture.actions)).not.toContain("acknowledgeBadgeReveal");
  expect(errors).toEqual([]);
});

test("missing Badge images retain nonzero artwork and collection tile dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openDashboard(page, "missingBadge=1");
  const fallback = page.locator("#dashboard-badges [data-badge-artwork=fallback]");
  await expect(fallback).toHaveCount(3);
  for (const item of await fallback.all()) {
    const bounds = await item.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(80);
    expect(bounds!.height).toBeGreaterThanOrEqual(80);
  }
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});
