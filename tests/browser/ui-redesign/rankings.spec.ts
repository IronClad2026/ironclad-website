import { expect, test, type Page } from "@playwright/test";
import { SUPPORTED_LOCALES, type Locale } from "../../../lib/i18n/config";

const rankingLabels = {
  en: { pro: "Pro Career", main: "Main Career", legacy: "Legacy · Main / Pro", season: "Current Season", allTime: "All-Time" },
  it: { pro: "Carriera Pro", main: "Carriera Main", legacy: "Storico · Main / Pro", season: "Stagione attuale", allTime: "Di sempre" },
  es: { pro: "Carrera Pro", main: "Carrera Main", legacy: "Histórico · Main / Pro", season: "Temporada actual", allTime: "Histórico" },
  fr: { pro: "Carrière Pro", main: "Carrière Main", legacy: "Historique · Main / Pro", season: "Saison actuelle", allTime: "Tous temps" },
  "pt-BR": { pro: "Carreira Pro", main: "Carreira Main", legacy: "Histórico · Main / Pro", season: "Temporada atual", allTime: "Histórico" },
  ru: { pro: "Карьера Pro", main: "Карьера Main", legacy: "Исторический · Main / Pro", season: "Текущий сезон", allTime: "За всё время" },
  ko: { pro: "Pro 커리어", main: "Main 커리어", legacy: "역사 기록 · Main / Pro", season: "현재 시즌", allTime: "역대" },
  "zh-CN": { pro: "Pro 生涯", main: "Main 生涯", legacy: "历史 · Main / Pro", season: "当前赛季", allTime: "历史总榜" },
} satisfies Record<Locale, { pro: string; main: string; legacy: string; season: string; allTime: string }>;

async function openSurface(page: Page, surface: "rankings" | "about", query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3187" || url.pathname.startsWith("/api/")) {
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  await page.goto(`/tests/browser/ui-redesign/?surface=${surface}&${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-ui-fixture-ready", surface);
  return errors;
}

async function openRankings(page: Page, query = "") {
  const errors = await openSurface(page, "rankings", query);
  await expect(page.getByText("1 / 6", { exact: true })).toBeVisible();
  return errors;
}

for (const width of [360, 768, 1440]) {
  test(`Pro continuation retains source history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await openRankings(page);
    const notice = page.getByRole("note", { name: "Transitional Pro season" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("historically Main / Pro");
    await expect(notice).toContainText("only new Pro events (1700+ ELO)");
    await expect(notice).toContainText("future Main events do not count");
    const event = page.getByText("Previous Structure Event", { exact: true });
    await expect(event.locator("..")).toContainText("Legacy · Main / Pro");
    await expect.poll(() => notice.evaluate((element) => {
      let opacity = 1;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        opacity *= Number(getComputedStyle(ancestor).opacity);
      }
      return opacity;
    })).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("transition.png") });
    const proCareer = page.getByRole("button", { name: "Pro Career", exact: true });
    await expect(proCareer).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "All-Time", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Pro Career Competitor");
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("note")).toContainText("Every valid Pro point event");
    await page.getByRole("button", { name: "Current Season", exact: true }).click();
    await expect(page.getByText("1 / 6", { exact: true })).toBeVisible();
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Main Career", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Main Career Competitor");
    await expect(notice).toHaveCount(0);
    await page.getByRole("button", { name: "Legacy · Main / Pro", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Historical Competitor");
    const dimensions = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.width + 1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
  });
}

for (const locale of SUPPORTED_LOCALES) {
  for (const width of [360, 1440]) {
    test(`Pro Career and scopes are localized in ${locale} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors = await openRankings(page, `locale=${locale}`);
      const labels = rankingLabels[locale];
      const proCareer = page.getByRole("button", { name: labels.pro, exact: true });
      const currentSeason = page.getByRole("button", { name: labels.season, exact: true });
      const allTime = page.getByRole("button", { name: labels.allTime, exact: true });
      await expect(proCareer).toHaveAttribute("aria-pressed", "true");
      await expect(currentSeason).toHaveAttribute("aria-pressed", "true");
      const notice = page.getByRole("note").filter({ hasText: "1700+ ELO" });
      await expect(notice).toHaveCount(1);
      await expect(notice).toContainText("1700+ ELO");
      await expect(notice).toContainText("Main / Pro");
      const dimensions = await notice.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
      await allTime.click();
      await expect(allTime).toHaveAttribute("aria-pressed", "true");
      await expect(currentSeason).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByRole("table")).toContainText("Pro Career Competitor");
      await expect(page.getByRole("table")).not.toContainText("Main Career Competitor");
      await expect(notice).toHaveCount(0);
      await expect(page.getByRole("note")).toHaveCount(1);
      await currentSeason.click();
      await expect(currentSeason).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("1 / 6", { exact: true })).toBeVisible();
      await expect(notice).toBeVisible();
      const event = page.getByText("Previous Structure Event", { exact: true });
      await expect(event.locator("..")).toContainText(labels.legacy);
      await page.getByRole("button", { name: labels.main, exact: true }).click();
      await expect(page.getByRole("table")).toContainText("Main Career Competitor");
      await expect(currentSeason).toHaveCount(0);
      await expect(notice).toHaveCount(0);
      await page.getByRole("button", { name: labels.legacy, exact: true }).click();
      await expect(page.getByRole("table")).toContainText("Historical Competitor");
      await expect(page.getByRole("table")).not.toContainText("Pro Career Competitor");
      await proCareer.click();
      await expect(page.getByText("1 / 6", { exact: true })).toBeVisible();
      const pageDimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      expect(pageDimensions.content).toBeLessThanOrEqual(pageDimensions.width + 1);
      expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

for (const locale of SUPPORTED_LOCALES) {
  for (const width of [360, 1440]) {
    test(`About renders the four ELO ranges in ${locale} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors = await openSurface(page, "about", `locale=${locale}`);
      const ranges = [
        ["Academy", "0–1099 ELO"],
        ["Challenge", "1100–1399 ELO"],
        ["Main", "1400–1699 ELO"],
        ["Pro", "1700+ ELO"],
      ];
      for (const [division, range] of ranges) {
        const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: division, exact: true }) });
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        const shownRange = (await card.locator("p").first().innerText()).replaceAll(" ", "").replaceAll("\u00a0", "").replaceAll("\u202f", "");
        expect(shownRange).toContain("ELO");
        expect(shownRange.replace("ELO", "")).toBe(range.replaceAll(" ", "").replace("ELO", ""));
        const dimensions = await card.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
        expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
      }
      const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
      if (locale === "en") {
        const academy = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Academy", exact: true }) });
        await academy.locator("..").screenshot({ path: testInfo.outputPath("about-elo-ranges.png") });
      }
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.__uiFixture.blockedRequests)).toEqual([]);
    });
  }
}

test("ordinary Pro seasons do not show the one-time transition notice", async ({ page }) => {
  const errors = await openRankings(page, "noTransition=1");
  await expect(page.getByRole("note", { name: "Transitional Pro season" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
