import { expect, test, type Page } from "@playwright/test";
import { SUPPORTED_LOCALES, type Locale } from "../../../lib/i18n/config";
import english from "../../../lib/i18n/dictionaries/en/public";
import commonEnglish from "../../../lib/i18n/dictionaries/en/common";
import { sourceTitles } from "./fixtures";
import italian from "../../../lib/i18n/dictionaries/it/public";
import spanish from "../../../lib/i18n/dictionaries/es/public";
import french from "../../../lib/i18n/dictionaries/fr/public";
import portuguese from "../../../lib/i18n/dictionaries/pt-BR/public";
import russian from "../../../lib/i18n/dictionaries/ru/public";
import korean from "../../../lib/i18n/dictionaries/ko/public";
import chinese from "../../../lib/i18n/dictionaries/zh-CN/public";

const fixturePath = "/tests/browser/news/";
const syntheticArticleImage = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#20262c"/><path d="M0 420L260 190L460 350L740 100L960 340V540H0Z" fill="#434d56"/><path d="M0 458H960" stroke="#b7774f" stroke-width="4"/></svg>`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3198") return route.continue();
    if (url.origin === "https://clan.fastly.steamstatic.com" && url.pathname.startsWith("/images/43250391/")) {
      expect(route.request().headers()["referer"]).toBeUndefined();
      return url.pathname.endsWith("/broken.webp")
        ? route.fulfill({ status: 404, body: "Synthetic missing image" })
        : route.fulfill({ status: 200, contentType: "image/svg+xml", body: syntheticArticleImage });
    }
    throw new Error(`Isolated News fixture attempted unexpected network access: ${url.origin}`);
  });
});

async function openFixture(page: Page, query: string = "") {
  await page.goto(`${fixturePath}?${query}`);
  await expect(page.locator("html")).toHaveAttribute("data-news-fixture-ready", "true");
  await expect(page.locator("header nav")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNavbarFits(page: Page) {
  const areas = await page.locator("[data-navbar-area]").evaluateAll((elements) =>
    elements.filter((element) => ["brand", "primary", "utilities"].includes(
      element.getAttribute("data-navbar-area") ?? ""
    )).map((element) => ({
      area: element.getAttribute("data-navbar-area"),
      visible: getComputedStyle(element).display !== "none",
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }))
  );
  const visible = areas.filter((area) => area.visible);
  for (let index = 0; index < visible.length; index += 1) {
    expect(visible[index].left, String(visible[index].area)).toBeGreaterThanOrEqual(0);
    expect(visible[index].right, String(visible[index].area)).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1
    );
    if (index > 0) {
      expect(visible[index - 1].right, "Navbar groups must not overlap").toBeLessThanOrEqual(
        visible[index].left + 1
      );
    }
  }
}

for (const width of [375, 390, 768, 1024, 1280, 1440, 1600, 1920]) {
  test(`News and navbar fit ${width}px for signed-out, player and admin states`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const auth of ["signedout", "user", "admin"]) {
      await openFixture(page, `auth=${auth}&unread=1`);
      await expect(page.locator("[data-news-card]")).toHaveCount(3);
      const cards = page.locator("[data-news-card]");
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      if (width >= 768) {
        expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
        expect(second!.x).toBeGreaterThan(first!.x + first!.width);
      } else {
        expect(second!.y).toBeGreaterThan(first!.y);
        expect(Math.abs(first!.x - second!.x)).toBeLessThan(2);
      }
      expect(first!.width).toBeLessThanOrEqual(560);
      await expectNoHorizontalOverflow(page);
      await expectNavbarFits(page);

      if (width < 1440) {
        await page.getByRole("button", { name: commonEnglish.nav.openMenu, exact: true }).click();
        const menu = page.getByRole("dialog", { name: commonEnglish.nav.mobileNavigation });
        await expect(menu).toBeVisible();
        for (const href of ["/announcements", "/news", "/tournaments", "/players", "/rankings", "/rules", "/about"]) {
          await expect(menu.locator(`a[href="${href}"]`)).toBeVisible();
        }
        await expectNoHorizontalOverflow(page);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
      } else {
        await expect(page.locator('[data-navbar-area="updates"] a')).toHaveText([
          commonEnglish.nav.announcements,
          commonEnglish.nav.news,
        ]);
        await expect(page.locator('[data-navbar-area="primary"] a')).toHaveText([
          commonEnglish.nav.tournaments,
          commonEnglish.nav.players,
          commonEnglish.nav.leaderboards,
          commonEnglish.nav.rules,
        ]);
        const utilities = page.locator('[data-navbar-area="utilities"]');
        if (auth === "signedout") {
          await expect(utilities.locator('a[href="/sign-in"]')).toBeVisible();
        } else {
          await expect(utilities.getByRole("button", { name: "Fixture account" })).toBeVisible();
          await expect(utilities.locator('a[href="/dashboard"]')).toBeVisible();
        }
        if (auth === "admin") await expect(utilities.locator('a[href="/admin"]')).toBeVisible();
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`news-admin-${width}.png`), fullPage: true });
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test(`${locale} chrome retains English source content and fits long titles`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await openFixture(page, `locale=${locale}&auth=admin&long=1`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("[data-news-card]")).toHaveCount(3);
    const copy = await localizedCopy(locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(page.locator("[data-news-card]").first().locator("h2")).toHaveAttribute("lang", "en");
    await expect(page.locator("[data-news-card]").first().locator("p[lang=en]")).toContainText(
      "Relic shares official Company of Heroes 3"
    );
    await expect(page.locator("[data-news-card]").first()).toContainText(copy.sourceLabel);
    await expect(page.locator("[data-news-card]").first().getByRole("link")).toContainText(copy.readAnnouncement);
    await expectNoHorizontalOverflow(page);
    await page.locator('button[aria-controls="mobile-navigation"]').click();
    await expect(page.locator("#mobile-navigation a[href='/news']")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");

    for (const width of [1280, 1440, 1600, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalOverflow(page);
      await expectNavbarFits(page);
    }
  });
}

test("missing and failed images show a stable accessible fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const image of ["missing", "broken"]) {
    await openFixture(page, `image=${image}`);
    const cards = page.locator("[data-news-card]");
    for (let index = 0; index < 3; index += 1) {
      await cards.nth(index).scrollIntoViewIfNeeded();
      await expect(cards.nth(index).locator("[data-news-fallback]")).toHaveAttribute(
        "aria-label", english.news.fallbackLabel
      );
      const box = await cards.nth(index).locator("[data-news-image]").boundingBox();
      expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
      await expect(cards.nth(index).locator("img")).toHaveCount(0);
    }
  }
});

test("successful images are lazy and omit the referrer; links go directly to official Steam", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixture(page);
  const first = page.locator("[data-news-card]").first();
  const image = first.locator("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("loading", "lazy");
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(image).toHaveAttribute("alt", "");
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  const links = page.locator("[data-news-card] a");
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\/steamcommunity\.com\/games\/1677280\/announcements\/detail\/\d+$/);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText(english.news.opensNewTab);
  }
  await expect(page.getByRole("link", { name: new RegExp(english.news.moreOnSteam) })).toHaveAttribute(
    "href", "https://steamcommunity.com/games/1677280/announcements/"
  );
});

test("homepage shows only the newest two items and links to News", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixture(page, "surface=home");
  const teaser = page.locator("[data-news-teaser]");
  await expect(teaser).toBeVisible();
  await expect(teaser.locator("[data-news-teaser-item]")).toHaveCount(2);
  await expect(teaser.locator("h3")).toHaveText(sourceTitles.slice(0, 2));
  await expect(teaser.getByRole("link", { name: english.news.viewAll })).toHaveAttribute("href", "/news");
  await expect(teaser.locator("h3").first()).toHaveAttribute("lang", "en");
  await expect(page.locator("[data-fixture-competition]")).toBeVisible();
});

for (const feed of ["empty", "unavailable"]) {
  test(`${feed} source keeps the listing useful and omits the optional homepage teaser`, async ({ page }) => {
    await openFixture(page, `feed=${feed}`);
    await expect(page.locator("[data-news-unavailable]")).toBeVisible();
    await expect(page.locator("[data-news-card]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(english.news.moreOnSteam) })).toBeVisible();
    await openFixture(page, `surface=home&feed=${feed}`);
    await expect(page.locator("[data-fixture-competition]")).toBeVisible();
    await expect(page.locator("[data-news-teaser]")).toHaveCount(0);
    expect(await page.evaluate(() => window.__newsFixture.blockedRequests)).toEqual([]);
  });
}

test("Announcements keeps its unread attention while News stays calm", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixture(page, "unread=1");
  const announcements = page.locator('[data-navbar-area="updates"] a[href="/announcements"]');
  const news = page.locator('[data-navbar-area="updates"] a[href="/news"]');
  await expect(announcements).toHaveAttribute("aria-label", commonEnglish.nav.announcementsUnread);
  await expect(announcements.locator("span[aria-hidden=true]")).toHaveCount(1);
  await expect(news.locator("span[aria-hidden=true]")).toHaveCount(0);
  await expect(news).not.toHaveAttribute("aria-label", /unread|new official/i);
  expect(await news.evaluate((element) => getComputedStyle(element, "::after").boxShadow)).toBe("none");

  await openFixture(page, "unread=0");
  await expect(announcements).not.toHaveAttribute("aria-label", commonEnglish.nav.announcementsUnread);
  await expect(announcements.locator("span[aria-hidden=true]")).toHaveCount(0);
});

test("mobile Announcements retains the unread dot and mobile links stay keyboard reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, "unread=1&auth=admin");
  const trigger = page.getByRole("button", { name: commonEnglish.nav.openMenu, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: commonEnglish.nav.mobileNavigation });
  const announcements = menu.locator('a[href="/announcements"]');
  const news = menu.locator('a[href="/news"]');
  await expect(announcements).toBeFocused();
  await expect(announcements).toHaveAttribute("aria-label", commonEnglish.nav.announcementsUnread);
  await expect(announcements.locator("span[aria-hidden=true]")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(news).toBeFocused();
  await expect(news.locator("span[aria-hidden=true]")).toHaveCount(0);
  await expect(menu.locator('a[href="/about"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});


test("More supports pointer, keyboard, outside click, Escape and focus return", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixture(page);
  const more = page.getByRole("button", { name: commonEnglish.nav.more, exact: true });
  const about = page.locator('[data-navbar-area="primary"] a[href="/about"]');
  await more.focus();
  await page.keyboard.press("ArrowDown");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(about).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();
  await expect(about).toHaveCount(0);

  await more.click();
  await expect(about).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(about).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

function localizedCopy(locale: Locale) {
  const dictionaries = {
    en: english,
    it: italian,
    es: spanish,
    fr: french,
    "pt-BR": portuguese,
    ru: russian,
    ko: korean,
    "zh-CN": chinese,
  };
  return dictionaries[locale].news;
}
