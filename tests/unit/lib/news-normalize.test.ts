import { describe, expect, it } from "vitest";
import { MAX_NEWS_RESPONSE_BYTES } from "@/lib/news/constants";
import {
  classifyNewsCategory,
  normalizeNewsDescription,
  normalizeOfficialNews,
  validateOfficialArticleUrl,
  validateOfficialImageUrl,
} from "@/lib/news/normalize";
import { NEWS_ARTICLE_URL, NEWS_IMAGE_URL, newsItem, newsRss } from "./news-fixtures";

const FETCHED_AT = "2026-09-20T00:00:00.000Z";

describe("official CoH3 RSS normalization", () => {
  it("projects only normalized article data and source metadata", () => {
    const feed = normalizeOfficialNews(newsRss(), FETCHED_AT);
    expect(feed).toEqual({
      fetchedAt: FETCHED_AT,
      sourceLanguage: "en",
      articles: [{
        id: NEWS_ARTICLE_URL,
        source: "relic-steam",
        externalId: NEWS_ARTICLE_URL,
        title: "2.5.6 Hot Fix",
        publishedAt: "2026-09-16T18:10:59.000Z",
        url: NEWS_ARTICLE_URL,
        excerpt: "Updated multiplayer balance.",
        imageUrl: NEWS_IMAGE_URL,
        category: "patch-notes",
      }],
    });
    expect(JSON.stringify(feed)).not.toMatch(/<p>|<img|description|CDATA/);
  });

  it("accepts the escaped HTML form used by Steam, not only CDATA", () => {
    const rss = newsRss(newsItem({ description: "placeholder" }))
      .replace("<![CDATA[placeholder]]>", "&lt;p&gt;Maps &amp;amp; balance.&lt;/p&gt;");
    expect(normalizeOfficialNews(rss).articles[0].excerpt).toBe("Maps & balance.");
  });

  it.each([
    "<rss><channel></rss>",
    "<rss version='2.0'><channel></channel></rss><other/>",
    "<rss version='2.0'><channel>&unknown;</channel></rss>",
    "<rss version='2.0' version='2.0'><channel/></rss>",
    "<html><body>Upstream error</body></html>",
    newsRss().replace("en-us", "fr"),
    newsRss().replace("<channel>", "<channel/><channel>"),
  ])("rejects malformed or unexpected XML without leaking source excerpts", (xml) => {
    expect(() => normalizeOfficialNews(xml)).toThrow("Invalid official CoH3 news feed.");
  });

  it.each([
    '<!DOCTYPE rss SYSTEM "https://attacker.invalid/private.dtd">',
    '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]>',
    '<!DOCTYPE rss [<!ENTITY a "amplify"> <!ENTITY b "&a;&a;">]>',
  ])("rejects all DTD/entity declarations without external resolution", (doctype) => {
    const xml = newsRss().replace(/<\?xml[^>]+>/, doctype);
    expect(() => normalizeOfficialNews(xml)).toThrow("Invalid official CoH3 news feed.");
  });

  it("rejects oversized raw input before parsing", () => {
    expect(() => normalizeOfficialNews("x".repeat(MAX_NEWS_RESPONSE_BYTES + 1)))
      .toThrow("Invalid official CoH3 news feed.");
  });

  it("accepts an empty official channel while rejecting a wholly invalid batch", () => {
    expect(normalizeOfficialNews(newsRss(""), FETCHED_AT).articles).toEqual([]);
    expect(() => normalizeOfficialNews(newsRss(newsItem({ link: "https://attacker.invalid/" }))))
      .toThrow("Invalid official CoH3 news feed.");
  });

  it("rejects invalid articles individually and requires GUID to equal the validated link", () => {
    const invalid = [
      newsItem({ link: "https://attacker.invalid/" }),
      newsItem({ guid: "untrusted-guid" }),
      newsItem({ date: "not a date" }),
      newsItem({ title: " " }),
      newsItem().replace("<title>", "<title>Duplicate</title><title>"),
    ].join("");
    expect(normalizeOfficialNews(newsRss(invalid + newsItem())).articles).toHaveLength(1);
  });

  it("sorts descending, deduplicates by GUID, retains the newest duplicate, and caps at ten", () => {
    const items = Array.from({ length: 12 }, (_, i) => {
      const url = `https://steamcommunity.com/games/1677280/announcements/detail/${i + 1}`;
      return newsItem({ link: url, guid: url, date: new Date(Date.UTC(2026, 8, i + 1)).toUTCString() });
    });
    const newerDuplicate = newsItem({
      link: "https://steamcommunity.com/games/1677280/announcements/detail/1",
      guid: "https://steamcommunity.com/games/1677280/announcements/detail/1",
      title: "A newer correction",
      date: "Sun, 20 Sep 2026 00:00:00 GMT",
    });
    const result = normalizeOfficialNews(newsRss(items.join("") + newerDuplicate)).articles;
    expect(result).toHaveLength(10);
    expect(result[0].title).toBe("A newer correction");
    expect(new Set(result.map((article) => article.externalId)).size).toBe(10);
    expect(result.map((article) => article.publishedAt)).toEqual(
      result.map((article) => article.publishedAt).toSorted().reverse()
    );
  });
});

describe("official article and image URL validation", () => {
  it.each([
    "https://steamcommunity.com.attacker.invalid/games/1677280/announcements/detail/123",
    "https://steamcommunity.com/games/123/announcements/detail/123",
    "https://steamcommunity.com/games/1677280/discussions/123",
    "https://steamcommunity.com/games/1677280/announcements/detail/123?url=https://attacker.invalid",
    "https://steamcommunity.com/games/1677280/announcements/detail/123#fragment",
    "https://steamcommunity.com:443/games/1677280/announcements/detail/123",
    "https://user@steamcommunity.com/games/1677280/announcements/detail/123",
    "https://steamcommunity.com/other/../games/1677280/announcements/detail/123",
    "javascript:alert(1)", "//steamcommunity.com/games/1677280/announcements/detail/123",
    NEWS_ARTICLE_URL.replace("https:", "http:"),
    NEWS_ARTICLE_URL.replace("/games", "\\games"),
    ` ${NEWS_ARTICLE_URL}`, "not a URL",
  ])("rejects unexpected article URL %s", (url) => {
    expect(validateOfficialArticleUrl(url)).toBeNull();
  });

  it("allows only the observed article URL shape", () => {
    expect(validateOfficialArticleUrl(NEWS_ARTICLE_URL)).toBe(NEWS_ARTICLE_URL);
  });

  it.each([
    NEWS_IMAGE_URL.replace("clan.fastly.steamstatic.com", "evil.invalid"),
    NEWS_IMAGE_URL.replace("/40883127/", "/999999/"),
    NEWS_IMAGE_URL.replace(".jpg", ".svg"),
    NEWS_IMAGE_URL.replace("/images/", "/store_item_assets/"),
    `${NEWS_IMAGE_URL}?tracking=1`,
    "https://clan.fastly.steamstatic.com/images/40883127/../../private.jpg",
    "data:image/png;base64,abcd",
  ])("rejects unexpected image URL %s", (url) => {
    expect(validateOfficialImageUrl(url)).toBeNull();
  });

  it("allows both observed CDN hosts, clan paths and raster formats", () => {
    const akamai = NEWS_IMAGE_URL.replace("clan.fastly.", "clan.akamai.");
    expect(validateOfficialImageUrl(akamai)).toBe(akamai);
    for (const clan of ["40883127", "46192591"]) {
      for (const extension of ["jpg", "png", "webp"]) {
        const url = NEWS_IMAGE_URL.replace("40883127", clan).replace(".jpg", `.${extension}`);
        expect(validateOfficialImageUrl(url)).toBe(url);
      }
    }
  });
});

describe("safe card content", () => {
  it("removes active/embed content while preserving block boundaries and entities", () => {
    const result = normalizeNewsDescription(`<script>alert('secret')</script><style>badcss</style>
      <iframe>badframe</iframe><object>badobject</object><embed src="https://evil.invalid/x">
      <template>badtemplate</template><svg><text>badsvg</text></svg><video>badvideo</video>
      <p>First <strong>paragraph</strong>.</p><ul><li>Maps &amp; balance</li><li>Second change</li></ul>
      <a href="javascript:alert(1)">Useful text</a>`);
    expect(result).toEqual({
      excerpt: "First paragraph. Maps & balance Second change Useful text",
      imageUrl: null,
    });
  });

  it("uses the first suitable validated image and ignores images inside unsafe content", () => {
    const secondImage = NEWS_IMAGE_URL.replace(".jpg", ".png");
    const result = normalizeNewsDescription(`<script><img src="${secondImage}"></script>
      <img src="https://evil.invalid/photo.jpg"><img src="${secondImage}" width="1" height="1">
      <img src="${NEWS_IMAGE_URL}"><img src="${secondImage}">`);
    expect(result.imageUrl).toBe(NEWS_IMAGE_URL);
  });

  it("returns null for missing or unsuitable imagery", () => {
    expect(normalizeNewsDescription("<p>Plain update.</p>").imageUrl).toBeNull();
    expect(normalizeNewsDescription(`<img hidden src="${NEWS_IMAGE_URL}">`).imageUrl).toBeNull();
  });

  it("limits excerpts to 280 characters without splitting a normal word", () => {
    const { excerpt } = normalizeNewsDescription(`<p>${"A useful balance update. ".repeat(50)}</p>`);
    expect(excerpt.length).toBeLessThanOrEqual(280);
    expect(excerpt.length).toBeGreaterThanOrEqual(200);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toMatch(/<|>/);
  });

  it.each([
    ["2.5.6 Hot Fix", "patch-notes"],
    ["Hotfix 2.5", "patch-notes"],
    ["Update 2.5 patch notes", "patch-notes"],
    ["2.5 Update", "update"],
    ["Roadmap", "announcement"],
    ["Updating our plans", "announcement"],
  ] as const)("classifies %s conservatively", (title, expected) => {
    expect(classifyNewsCategory(title)).toBe(expected);
  });
});
