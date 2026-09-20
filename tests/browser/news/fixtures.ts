import type { OfficialNewsFeed } from "@/lib/news/types";

export const fixtureImageOrigin = "https://clan.fastly.steamstatic.com";
const fixtureIds = ["1234567890123456789", "1234567890123456790", "1234567890123456791"];
export const sourceTitles = [
  "Update 2.4 — Competitive Balance and Multiplayer Improvements",
  "Hotfix 2.3.1 — Matchmaking Reliability",
  "Company of Heroes 3 Community Roadmap",
];

export function parameters() {
  return new URLSearchParams(window.location.search);
}

export function newsFixture(): OfficialNewsFeed | null {
  const query = parameters();
  if (query.get("feed") === "unavailable") return null;

  return {
    fetchedAt: "2026-09-20T04:00:00.000Z",
    sourceLanguage: "en",
    articles: query.get("feed") === "empty" ? [] : sourceTitles.map((title, index) => ({
      id: `relic-steam:${fixtureIds[index]}`,
      externalId: String(fixtureIds[index]),
      source: "relic-steam",
      title: index === 0 && query.has("long")
        ? `Official competitive balance announcement: ${"CompetitiveBalance".repeat(14)} — multiplayer improvements across every battlefield`
        : title,
      publishedAt: new Date(Date.UTC(2026, 8, 20 - index, 3)).toISOString(),
      url: `https://steamcommunity.com/games/1677280/announcements/detail/${fixtureIds[index]}`,
      excerpt: "Relic shares official Company of Heroes 3 multiplayer changes, balance adjustments and improvements for the next update. Read the complete announcement at its original source.",
      imageUrl: query.get("image") === "missing" || index === 1
        ? null
        : `${fixtureImageOrigin}/images/43250391/${query.get("image") === "broken" || index === 2 ? "broken" : "synthetic-news"}.webp`,
      category: index === 0 ? "update" : index === 1 ? "patch-notes" : "announcement",
    })),
  };
}
