import "server-only";

import { unstable_cache } from "next/cache";
import { NEWS_REVALIDATE_SECONDS } from "@/lib/news/constants";
import { fetchOfficialNews } from "@/lib/news/fetch";
import type { OfficialNewsFeed } from "@/lib/news/types";

// Cache the small validated DTO, never the raw RSS or article descriptions.
// Keep failures throwing inside this boundary so Next can retain a last-good
// snapshot during revalidation. Only the UI-facing wrapper degrades to null.
const readCachedOfficialNews = unstable_cache(
  fetchOfficialNews,
  ["official-coh3-steam-news", "v1", "en"],
  { revalidate: NEWS_REVALIDATE_SECONDS }
);

export async function loadOfficialNews(): Promise<OfficialNewsFeed | null> {
  try {
    return await readCachedOfficialNews();
  } catch {
    console.warn("Official CoH3 news is temporarily unavailable.");
    return null;
  }
}
