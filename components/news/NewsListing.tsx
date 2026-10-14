import { ArrowUpRight, Radio } from "lucide-react";
import NewsCard, { type NewsCopy } from "@/components/news/NewsCard";
import type { Locale } from "@/lib/i18n/config";
import { OFFICIAL_NEWS_SOURCE_URL } from "@/lib/news/constants";
import type { OfficialNewsFeed } from "@/lib/news/types";

export default function NewsListing({ feed, copy, locale }: {
  feed: OfficialNewsFeed | null;
  copy: NewsCopy;
  locale: Locale;
}) {
  return (
    <>
      {feed && feed.articles.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2" data-news-grid>
          {feed.articles.slice(0, 10).map((article) => <NewsCard key={article.id} article={article} copy={copy} locale={locale} />)}
        </div>
      ) : (
        <div className="border border-white/10 bg-zinc-950/75 px-6 py-12 text-center" data-news-unavailable>
          <Radio size={24} aria-hidden="true" className="mx-auto text-orange-300/70" />
          <h2 className="mt-4 text-xl font-bold text-white">{feed ? copy.emptyTitle : copy.unavailableTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-zinc-400">{feed ? copy.emptyDescription : copy.unavailableDescription}</p>
        </div>
      )}
      <div className="mt-10 border-t border-white/10 pt-6">
        <a href={OFFICIAL_NEWS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{copy.moreOnSteam}<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">({copy.opensNewTab})</span></a>
        <p className="mt-4 max-w-3xl text-xs leading-6 text-zinc-400">{copy.disclaimer}</p>
      </div>
    </>
  );
}
