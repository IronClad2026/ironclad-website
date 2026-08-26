import type { Metadata } from "next";
import AnnouncementsFeed from "@/components/AnnouncementsFeed";
import { getRequestLocale } from "@/lib/i18n/request";
import { loadDictionary } from "@/lib/i18n/loaders";
import { loadPublicAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const dictionary = await loadDictionary(locale, "public");
  return {
    title: dictionary.announcements.metadataTitle,
    description: dictionary.announcements.metadataDescription,
  };
}

export default async function AnnouncementsPage() {
  const locale = await getRequestLocale();
  const [dictionary, result] = await Promise.all([
    loadDictionary(locale, "public"),
    loadPublicAnnouncements(),
  ]);
  const copy = dictionary.announcements;

  return (
    <main className="relative isolate min-h-screen overflow-x-clip bg-black px-4 pb-24 pt-36 text-white sm:px-6 sm:pt-40 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.16),transparent_58%)]" />
      <header className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400 sm:text-sm">
          {copy.eyebrow}
        </p>
        <h1 className="mt-4 break-words text-4xl font-black uppercase leading-none sm:text-5xl lg:text-6xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
          {copy.description}
        </p>
      </header>

      <AnnouncementsFeed
        announcements={result.announcements}
        copy={copy}
        loadFailed={!result.ok}
      />
    </main>
  );
}
