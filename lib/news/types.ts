export type OfficialNewsCategory = "patch-notes" | "update" | "announcement";

export type OfficialNewsArticle = {
  id: string;
  source: "relic-steam";
  externalId: string;
  title: string;
  publishedAt: string;
  url: string;
  excerpt: string;
  imageUrl: string | null;
  category: OfficialNewsCategory;
};

export type OfficialNewsFeed = {
  articles: OfficialNewsArticle[];
  fetchedAt: string;
  sourceLanguage: "en";
};
