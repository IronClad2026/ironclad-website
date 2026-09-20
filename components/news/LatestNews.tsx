import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import NewsImage from "@/components/news/NewsImage";
import { NewsDate, type NewsCopy } from "@/components/news/NewsCard";
import type { Locale } from "@/lib/i18n/config";
import type { OfficialNewsFeed } from "@/lib/news/types";

export default function LatestNews({ feed, copy, locale }: {
  feed: OfficialNewsFeed | null;
  copy: NewsCopy;
  locale: Locale;
}) {
  if (!feed?.articles.length) return null;
  return (
    <section aria-labelledby="latest-relic-title" className="border-t border-white/10 bg-zinc-950/70 px-5 py-12 sm:px-8 lg:px-12" data-news-teaser>
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="latest-relic-title" className="text-xl font-bold text-white sm:text-2xl">{copy.latestFromRelic}</h2>
          <Link href="/news" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">{copy.viewAll}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {feed.articles.slice(0, 2).map((article) => (
            <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-start gap-4 border border-white/10 bg-black/25 p-3 transition-colors hover:border-orange-300/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300" data-news-teaser-item>
              <div className="w-24 shrink-0 sm:w-32"><NewsImage src={article.imageUrl} fallbackLabel={copy.fallbackLabel} /></div>
              <div className="min-w-0 flex-1">
                <h3 lang="en" className="break-words text-sm font-bold leading-6 text-white [overflow-wrap:anywhere]">{article.title}</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-400"><NewsDate publishedAt={article.publishedAt} locale={locale} copy={copy} /></p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">{copy.sourceLabel}</p>
                <span className="sr-only">({copy.opensNewTab})</span>
              </div>
              <ArrowUpRight size={15} aria-hidden="true" className="mt-1 shrink-0 text-zinc-500 group-hover:text-orange-300" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
