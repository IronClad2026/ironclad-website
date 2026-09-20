import { ArrowUpRight } from "lucide-react";
import NewsImage from "@/components/news/NewsImage";
import type { Locale } from "@/lib/i18n/config";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";
import { formatDateTime } from "@/lib/i18n/format";
import type { OfficialNewsArticle } from "@/lib/news/types";

export type NewsCopy = PublicDictionary["news"];

export function NewsDate({ publishedAt, locale, copy }: {
  publishedAt: string;
  locale: Locale;
  copy: NewsCopy;
}) {
  return <time dateTime={publishedAt}><span className="sr-only">{copy.published}: </span>{formatDateTime(publishedAt, locale, { kind: "utc" }, { dateStyle: "medium" })}</time>;
}

export default function NewsCard({ article, copy, locale }: {
  article: OfficialNewsArticle;
  copy: NewsCopy;
  locale: Locale;
}) {
  const category = article.category === "patch-notes" ? copy.categories.patchNotes : article.category === "update" ? copy.categories.update : copy.categories.announcement;
  return (
    <article className="flex min-w-0 flex-col border border-white/12 bg-zinc-950/75" data-news-card>
      <NewsImage src={article.imageUrl} fallbackLabel={copy.fallbackLabel} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-300" aria-label={`${copy.categoryLabel}: ${category}`}>{category}</span>
        <h2 lang="en" className="mt-3 break-words text-xl font-bold leading-snug text-white [overflow-wrap:anywhere] sm:text-2xl">{article.title}</h2>
        <div className="mt-3 flex flex-col gap-1 text-xs leading-5 text-zinc-400"><span>{copy.sourceLabel}</span><NewsDate publishedAt={article.publishedAt} locale={locale} copy={copy} /></div>
        {article.excerpt ? <p lang="en" className="mt-4 break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{article.excerpt}</p> : null}
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center gap-2 self-start pt-5 text-sm font-semibold text-orange-300 transition-colors hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
          <span>{copy.readAnnouncement}<span className="sr-only">: <span lang="en">{article.title}</span> ({copy.opensNewTab})</span></span><ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
        </a>
      </div>
    </article>
  );
}
