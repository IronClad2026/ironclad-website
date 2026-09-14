import { expect, test, type Page } from "@playwright/test";
import { LONG_NAME, type BracketMode } from "./fixtures";

const ORIGIN = "http://127.0.0.1:3223";
const widths = [1280, 1440, 2560, 375, 390];
const modes: BracketMode[] = ["public", "admin", "player"];

async function openFixture(page: Page, size: 8 | 16, mode: BracketMode, width: number, extra = "") {
  const errors: string[] = [];
  const blocked: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN || url.pathname.startsWith("/api/") || request.method() !== "GET") {
      blocked.push(url.origin + url.pathname);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/tests/browser/bracket-layout/?size=" + size + "&mode=" + mode + extra);
  await expect(page.locator("html")).toHaveAttribute("data-bracket-fixture-ready", "true");
  await expect(page.locator("[data-bracket-match]")).toHaveCount(size - 1);
  await expect(page.locator("[data-bracket-connector]")).toHaveCount(size - 2);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  return async () => {
    expect(errors, "browser errors").toEqual([]);
    expect(blocked, "nonlocal or mutation requests").toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.actions), "no product action invoked").toEqual([]);
  };
}

async function geometryProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const tolerance = 1.6; // Includes the card's one-pixel outer border.
    const wrappers = Array.from(document.querySelectorAll<HTMLElement>("[data-bracket-match]"));
    const matches = wrappers.map((wrapper) => {
      const core = wrapper.querySelector<HTMLElement>("[data-bracket-core]")!;
      const box = wrapper.getBoundingClientRect();
      const card = core.parentElement!;
      const header = core.firstElementChild as HTMLElement;
      for (const [label, element] of [["core", core], ["card", card], ["header", header]] as const) {
        if (element.scrollWidth > element.clientWidth + 1) problems.push(wrapper.dataset.bracketMatch + " " + label + " clips horizontal content (" + element.scrollWidth + "/" + element.clientWidth + ")");
      }
      const headerBox = header.getBoundingClientRect();
      for (const child of Array.from(header.children)) {
        const childBox = child.getBoundingClientRect();
        if (childBox.left < headerBox.left - 1 || childBox.right > headerBox.right + 1 || childBox.top < headerBox.top - 1 || childBox.bottom > headerBox.bottom + 1) problems.push(wrapper.dataset.bracketMatch + " header label escapes header");
      }
      const anchor = core.getBoundingClientRect();
      return {
        id: wrapper.dataset.bracketMatch!,
        round: Number(wrapper.dataset.roundIndex),
        index: Number(wrapper.dataset.matchIndex),
        top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        anchorX1: anchor.left, anchorX2: anchor.right, anchorY: anchor.top + anchor.height / 2,
      };
    });
    const byId = new Map(matches.map((match) => [match.id, match]));
    const close = (actual: number, expected: number, label: string) => {
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        problems.push(label + ": " + actual.toFixed(2) + " != " + expected.toFixed(2));
      }
    };
    for (const match of matches) {
      const previous = matches.find((candidate) => candidate.round === match.round && candidate.index === match.index - 1);
      if (previous && previous.bottom > match.top - 1) problems.push(match.id + " overlaps previous card");
      if (match.round > 0) {
        const feeders = matches.filter((candidate) => candidate.round === match.round - 1 && Math.floor(candidate.index / 2) === match.index);
        if (feeders.length !== 2) problems.push(match.id + " is missing two feeder cores");
        else close(match.anchorY, (feeders[0].anchorY + feeders[1].anchorY) / 2, match.id + " feeder centroid");
      }
    }
    for (const path of document.querySelectorAll<SVGPathElement>("[data-bracket-connector]")) {
      const source = byId.get(path.dataset.bracketConnector!);
      const target = byId.get(path.dataset.targetMatch!);
      const matrix = path.getScreenCTM();
      if (!source || !target || !matrix) { problems.push("unresolved connector"); continue; }
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      close(start.x, source.anchorX2, source.id + " outgoing edge");
      close(start.y, source.anchorY, source.id + " outgoing core");
      close(end.x, target.anchorX1, source.id + " incoming edge");
      close(end.y, target.anchorY, source.id + " incoming core");
    }
    const rounds = Array.from(document.querySelectorAll<HTMLElement>("[data-bracket-round]"));
    const first = rounds[0]?.getBoundingClientRect();
    for (const round of rounds) {
      const box = round.getBoundingClientRect();
      if (first) close(box.top, first.top, "round body top");
      const childMatches = matches.filter((match) => match.round === Number(round.dataset.bracketRound));
      if (childMatches.some((match) => match.top < box.top - 1 || match.bottom > box.bottom + 1)) problems.push("card escapes round height");
      if (childMatches.some((match) => match.left < box.left - 1 || match.right > box.right + 1)) problems.push("card escapes round width: " + round.dataset.bracketRound);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("page has horizontal overflow");
    return problems;
  });
}

async function expectGeometry(page: Page) {
  try {
    await expect.poll(() => geometryProblems(page), { message: "real core centroids, card separation, and SVG endpoints", timeout: 5000 }).toEqual([]);
  } catch (error) {
    console.log("Bracket geometry diagnostics", await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-bracket-round], [data-bracket-match][data-match-index="0"]'), (element) => {
      const rect = element.getBoundingClientRect();
      return { attrs: { ...element.dataset }, x: rect.x, y: rect.y, width: rect.width, height: rect.height, client: element.clientWidth, scroll: element.scrollWidth };
    })));
    throw error;
  }
}

for (const size of [8, 16] as const) {
  for (const mode of modes) {
    for (const width of widths) {
      test(size + " players " + mode + " at " + width + "px align every core and connector", async ({ page }, testInfo) => {
        const checkIsolation = await openFixture(page, size, mode, width);
        await expectGeometry(page);
        await expect(page.getByText(LONG_NAME + "_1", { exact: true }).first()).toBeVisible();
        const firstHeader = page.locator('[data-bracket-match="fixture-match-1"] [data-bracket-core] > div').first();
        await expect(firstHeader.getByText(/Match\s+1$/i)).toBeVisible();
        await expect(firstHeader.getByText("Completed", { exact: true })).toBeVisible();
        if (mode === "admin") await expect(firstHeader.getByText("Manage", { exact: true })).toBeVisible();
        if (mode === "player") await expect(firstHeader.getByText("Open Match", { exact: true })).toBeVisible();
        const deadlines = page.locator("[data-match-deadline-state]");
        expect(await deadlines.count()).toBeGreaterThanOrEqual(3);
        const cardsWithoutFooter = await page.locator("[data-bracket-match]").evaluateAll((cards) => cards.filter((card) => !card.querySelector("[data-match-deadline-state]")).length);
        expect(cardsWithoutFooter).toBeGreaterThan(0);
        await expect(page.locator("[data-bracket-core]").getByText("TBD", { exact: true }).first()).toBeVisible();

        const scroller = page.locator("[data-bracket-scroll]");
        const scrolling = await scroller.evaluate((element) => ({ width: element.clientWidth, extent: element.scrollWidth }));
        if (width <= 390) {
          expect(scrolling.extent).toBeGreaterThan(scrolling.width + 300);
          await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
          expect(await scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(300);
          await expectGeometry(page);
          const final = page.locator("[data-bracket-match]").last();
          const finalBox = await final.boundingBox();
          expect(finalBox!.x + finalBox!.width).toBeLessThanOrEqual(width);
          await scroller.evaluate((element) => { element.scrollLeft = 0; });
        }
        if ((size === 8 && mode === "admin" && width === 1440) || (size === 16 && mode === "public" && width === 2560) || (size === 16 && mode === "player" && width === 375)) {
          await expect.poll(() => page.locator("[data-bracket-round]").last().evaluate((element) => Number(getComputedStyle(element.parentElement!).opacity))).toBe(1);
          await page.screenshot({ path: testInfo.outputPath("bracket-" + size + "-" + mode + "-" + width + ".png"), fullPage: true });
        }
        await checkIsolation();
      });
    }
  }
}

for (const mode of modes) {
  test(mode + " footer expansion and removal preserve measured alignment", async ({ page }) => {
    const checkIsolation = await openFixture(page, 16, mode, 1440);
    await expectGeometry(page);
    const first = page.locator('[data-bracket-match="fixture-match-1"]');
    const before = (await first.boundingBox())!.height;
    await page.getByRole("button", { name: "Expand match footers", exact: true }).click();
    await expect(first.locator("[data-match-deadline-state]")).toHaveCount(1);
    await expect.poll(async () => (await first.boundingBox())!.height).toBeGreaterThan(before + 20);
    await expectGeometry(page);
    await page.getByRole("button", { name: "Restore mixed footers", exact: true }).click();
    await expect(first.locator("[data-match-deadline-state]")).toHaveCount(0);
    await expectGeometry(page);
    expect((await first.boundingBox())!.height).toBeCloseTo(before, 0);
    await checkIsolation();
  });

  test(mode + " hover keeps connector attachment and card position", async ({ page }) => {
    const checkIsolation = await openFixture(page, 8, mode, 1280);
    await expectGeometry(page);
    const core = page.locator('[data-bracket-match="fixture-match-1"] [data-bracket-core]');
    const before = await core.boundingBox();
    await core.hover();
    await page.waitForTimeout(250); // Wait for the actual product hover transition.
    await expectGeometry(page);
    const after = await core.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 1);
    expect(after!.x).toBeCloseTo(before!.x, 1);
    await checkIsolation();
  });
}

for (const mode of ["admin", "player"] as const) {
  test(mode + " keyboard selection preserves its original match callback", async ({ page }) => {
    const checkIsolation = await openFixture(page, 8, mode, 390);
    const first = page.locator('[data-bracket-match="fixture-match-1"]');
    const trigger = first.getByRole("button").first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__bracketFixture.selections)).toEqual([mode + ":fixture-match-1"]);
    await expectGeometry(page);
    await checkIsolation();
  });
}

test("Russian labels and larger text preserve body baselines and scaled connector gaps", async ({ page }, testInfo) => {
  const checkIsolation = await openFixture(page, 16, "player", 375, "&locale=ru&largeText=1");
  await expectGeometry(page);
  await page.getByRole("button", { name: "Expand match footers", exact: true }).click();
  await expectGeometry(page);
  await expect.poll(() => page.locator("[data-bracket-round]").last().evaluate((element) => Number(getComputedStyle(element.parentElement!).opacity))).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("bracket-russian-large-text-375.png"), fullPage: true });
  await checkIsolation();
});

test("resizing the same mounted bracket remeasures without replacing matches", async ({ page }) => {
  const checkIsolation = await openFixture(page, 16, "admin", 2560, "&readOnly=1&focused=1");
  for (const width of [1280, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectGeometry(page);
  }
  await expect(page.locator('[data-bracket-match="fixture-match-1"]').getByText("Inspect", { exact: true })).toBeVisible();
  await checkIsolation();
});