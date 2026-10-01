import LatestNews from "@/components/news/LatestNews";
import type { NewsCopy } from "@/components/news/NewsCard";
import type { Locale } from "@/lib/i18n/config";
import { loadOfficialNews } from "@/lib/news/source";

export default async function LatestNewsSection({ copy, locale }: { copy: NewsCopy; locale: Locale }) {
  const feed = await loadOfficialNews();
  return <LatestNews feed={feed} copy={copy} locale={locale} />;
}
