import type { Metadata } from "next";
import { Suspense } from "react";
import NewsListing from "@/components/news/NewsListing";
import type { NewsCopy } from "@/components/news/NewsCard";
import type { Locale } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { loadOfficialNews } from "@/lib/news/source";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const { news } = await loadDictionary(locale, "public");
  const canonical = "https://www.ironcladtournaments.com/news";
  return {
    title: news.metadataTitle,
    description: news.metadataDescription,
    alternates: { canonical },
    ...(process.env.VERCEL_ENV !== "production" ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title: news.metadataTitle, description: news.metadataDescription, type: "website", url: canonical },
  };
}

async function NewsContent({ copy, locale }: { copy: NewsCopy; locale: Locale }) {
  return <NewsListing feed={await loadOfficialNews()} copy={copy} locale={locale} />;
}

export default async function NewsPage() {
  const locale = await getRequestLocale();
  const { news } = await loadDictionary(locale, "public");
  return (
    <main className="min-h-screen bg-black px-5 pt-32 pb-16 text-white sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1120px]">
        <header className="mb-9 max-w-3xl border-l-2 border-orange-400/60 pl-5">
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">{news.title}</h1>
          <p className="mt-4 text-base leading-8 text-zinc-300">{news.intro}</p>
          <p className="mt-2 text-xs leading-6 text-zinc-400">{news.sourceLanguage}</p>
        </header>
        <Suspense fallback={<div aria-hidden="true" className="grid grid-cols-1 gap-5 md:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-96 border border-white/10 bg-zinc-950/75" />)}</div>}>
          <NewsContent copy={news} locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
