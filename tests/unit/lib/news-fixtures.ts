export const NEWS_ARTICLE_URL =
  "https://steamcommunity.com/games/1677280/announcements/detail/708909256508702856";
export const NEWS_IMAGE_URL =
  "https://clan.fastly.steamstatic.com/images/40883127/ec16da9da0c5b7f80bb0da5dea55e1d82b3e013f.jpg";

export function newsItem(overrides: Partial<{
  title: string;
  link: string;
  guid: string;
  date: string;
  description: string;
}> = {}): string {
  const value = {
    title: "2.5.6 Hot Fix",
    link: NEWS_ARTICLE_URL,
    guid: NEWS_ARTICLE_URL,
    date: "Wed, 16 Sep 2026 18:10:59 +0000",
    description: `<p><img src="${NEWS_IMAGE_URL}" /></p><p>Updated multiplayer balance.</p>`,
    ...overrides,
  };
  return `<item>
    <title><![CDATA[${value.title}]]></title>
    <link><![CDATA[${value.link}]]></link>
    <guid><![CDATA[${value.guid}]]></guid>
    <pubDate>${value.date}</pubDate>
    <description><![CDATA[${value.description}]]></description>
  </item>`;
}

export function newsRss(items: string = newsItem()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
      <atom:link href="https://steamcommunity.com/games/1677280" />
      <title>Company of Heroes 3 RSS Feed</title>
      <link>https://steamcommunity.com/games/1677280</link>
      <language>en-us</language>
      ${items}
    </channel></rss>`;
}
