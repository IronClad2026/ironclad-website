import { expect, test, type Locator, type Page } from "@playwright/test";
import { SUPPORTED_LOCALES } from "../../../lib/i18n/config";

const widths = [360, 375, 390, 768, 1024, 1440, 1920, 3440];

async function openDashboard(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/") ||
      (query.includes("missingBadge=1") && route.request().resourceType() === "image" && url.pathname.includes("/badges/")) ||
      (query.includes("failedCareerBanner=1") && route.request().resourceType() === "image" && url.pathname.includes("/tournaments/"))) {
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

async function expectContained(locator: Locator) {
  for (const element of await locator.all()) {
    const geometry = await element.evaluate((item) => {
      const bounds = item.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: item.clientWidth, content: item.scrollWidth, viewport: innerWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.content).toBeLessThanOrEqual(geometry.width + 1);
  }
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
    await expect(history.getByRole("tab", { name: "Tournaments 3", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(history.locator("[data-tournament-career-group]")).toHaveCount(3);
    await expect(history.locator("button[aria-haspopup=dialog]")).toHaveCount(6);
    await history.getByRole("tab", { name: "Championships 1", exact: true }).click();
    await expect(history.getByText("Steel Vanguard", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Registration Archive/ }).click();
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
  await expect(page.getByText("Completed tournament runs will appear here.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Championships 0", exact: true }).click();
  await expect(page.locator("[data-career-championship]")).toHaveCount(0);
  await page.getByRole("button", { name: /^Registration Archive 0/ }).click();
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
  await page.getByRole("button", { name: /^Registration Archive/ }).click();
  await expect(page.locator("#registration-registration-3")).toBeVisible();
  await expect(history.getByRole("alert")).toHaveText("Your competitive history could not be loaded.");
  expect(errors).toEqual([]);
});

test("registration failure is not presented as an empty career", async ({ page }) => {
  const errors = await openDashboard(page, "registrationError=1");
  const history = page.locator("[data-dashboard-section=history]");
  await expect(history.locator("button[aria-haspopup=dialog]")).toHaveCount(6);
  const archive = page.locator("[data-dashboard-section=registration-archive]");
  await archive.getByRole("button", { name: /^Registration Archive/ }).click();
  await expect(archive.getByRole("alert")).toHaveText("Your Tournament Registrations could not be loaded.");
  await expect(archive.getByText("No previous registrations.", { exact: true })).toHaveCount(0);
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
  const archiveControl = page.getByRole("button", { name: /^Registration Archive/ });
  const target = page.locator("#registration-registration-3");
  await expect(target).toBeHidden();
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: /Previous waitlist offer/ }).click();
    await expect(page).toHaveURL(/#registration-registration-3$/);
    await expect(archiveControl).toHaveAttribute("aria-expanded", "true");
    await expect(target).toBeInViewport();
    if (index === 0) {
      await archiveControl.click();
      await expect(target).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});

test("career tabs preserve keyboard arrows Home and End", async ({ page }) => {
  const errors = await openDashboard(page);
  const history = page.locator("[data-dashboard-section=history]");
  await history.getByRole("tab", { name: "Tournaments 3", exact: true }).focus();
  for (const [key, tab] of [["ArrowRight", "Championships 1"], ["End", "Championships 1"], ["Home", "Tournaments 3"], ["ArrowLeft", "Championships 1"]]) {
    await page.keyboard.press(key);
    await expect(history.getByRole("tab", { name: tab, exact: true })).toBeFocused();
    await expect(history.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  expect(errors).toEqual([]);
});

test("tournament runs keep identical titles separate and reveal ordered match details by keyboard", async ({ page }) => {
  const errors = await openDashboard(page);
  const groups = page.locator("[data-tournament-career-group]");
  await expect(groups).toHaveCount(3);
  for (const [index, record] of ["2–0", "1–1", "0–2"].entries()) {
    const group = groups.nth(index);
    await expect(group.locator("summary")).toContainText("Previous IronClad Cup");
    await expect(group.locator("summary")).toContainText(record);
    await expect(group.locator("summary").getByText("Tournament Champion", { exact: true })).toHaveCount(index === 0 ? 1 : 0);
    const summary = group.locator("summary");
    if (index > 0) {
      await summary.focus();
      await page.keyboard.press("Enter");
    }
    await expect(group).toHaveAttribute("open", "");
    const matches = group.locator("button[aria-haspopup=dialog]");
    await expect(matches).toHaveCount(2);
    await expect(matches.first()).toContainText(`Opponent ${index * 2 + 1}`);
    await expect(matches.last()).toContainText(`Opponent ${index * 2 + 2}`);
    await matches.last().click();
    await expect(page.locator("dialog[open]")).toContainText(`Opponent ${index * 2 + 2}`);
    await page.keyboard.press("Escape");
    await expect(matches.last()).toBeFocused();
  }
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

for (const state of ["noCareerBanner", "failedCareerBanner"]) {
  test(`${state} preserves tournament and championship artwork at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    const errors = await openDashboard(page, `${state}=1`);
    const groups = page.locator("[data-tournament-career-group]");
    for (const group of await groups.all()) {
      await group.locator("summary").scrollIntoViewIfNeeded();
      const item = group.locator("[data-career-artwork=fallback]");
      await expect(item).toBeVisible();
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(90);
    }
    await page.getByRole("tab", { name: "Championships 1", exact: true }).click();
    const honour = page.locator("[data-career-championship]");
    await expect(honour.locator("[data-career-artwork=fallback]")).toBeVisible();
    await expect(honour).toContainText("Steel Vanguard");
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

for (const width of [375, 390]) {
  test(`registration actions and status labels remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = await openDashboard(page, "registrationStates=1");
    const current = page.locator("[data-dashboard-section=registrations]");
    await expect(current.locator("article")).toHaveCount(4);
    const offered = current.locator("#registration-registration-2");
    for (const name of ["Accept Spot", "Decline Spot", "Withdraw Registration"]) {
      const control = offered.getByRole("button", { name, exact: true });
      await expect(control).toBeEnabled();
      await control.click({ trial: true });
      const bounds = await control.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
    }
    await expect(offered.getByText(/Respond before/)).toBeVisible();
    await expectContained(current.locator("[data-registration-status]"));
    const history = page.locator("[data-dashboard-section=registration-archive]");
    await history.getByRole("button", { name: /^Registration Archive/ }).click();
    await expect(history.locator('[data-registration-presentation="historical"]')).toHaveCount(5);
    for (const status of ["cancelled", "voided", "rejected", "withdrawn"]) {
      const record = history.locator(`#registration-registration-${status}`);
      await expect(record).toBeVisible();
      await expect(record.getByRole("button")).toHaveCount(0);
    }
    await expect(history.getByRole("status").filter({ hasText: "Read-only historical record" })).toHaveCount(2);
    await expectContained(history.locator("article [data-registration-status]"));
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.actions)).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
  });

  for (const locale of SUPPORTED_LOCALES) {
    test(`${locale} career tabs and long registration labels fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const errors = await openDashboard(page, `locale=${locale}&long=1&registrationStates=1`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const tabs = page.locator("[data-dashboard-section=history]").getByRole("tab");
      await expect(tabs).toHaveCount(2);
      for (const tab of await tabs.all()) {
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expectContained(tabs);
      const archive = page.locator("[data-dashboard-section=registration-archive]");
      await archive.getByRole("button").first().click();
      await expectContained(archive.getByRole("button").first());
      await expectContained(page.locator("article [data-registration-status]:visible"));
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
    });
  }
}

test("initial registration deep link reveals the matching historical terminal record", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const errors = await openDashboard(page, "registrationStates=1#registration-registration-cancelled");
  const history = page.locator("[data-dashboard-section=registration-archive]");
  await expect(history.getByRole("button", { name: /^Registration Archive/ })).toHaveAttribute("aria-expanded", "true");
  const target = history.locator("#registration-registration-cancelled");
  await expect(target).toBeInViewport();
  await expect(target.getByRole("status")).toContainText("Read-only historical record");
  await expect(target.getByRole("button")).toHaveCount(0);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

for (const width of [375, 390, 1440]) {
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
