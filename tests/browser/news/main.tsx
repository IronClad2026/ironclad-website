import { createRoot } from "react-dom/client";
import Navbar from "@/components/Navbar";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import NewsListing from "@/components/news/NewsListing";
import LatestNews from "@/components/news/LatestNews";
import { resolveLocale } from "@/lib/i18n/config";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { newsFixture, parameters } from "./fixtures";
import "./runtime";
import "@/app/globals.css";

async function start() {
  const locale = resolveLocale(parameters().get("locale"));
  document.documentElement.lang = locale;
  const dictionaries = await loadDictionaries(locale, ["common", "public"] as const);
  const feed = newsFixture();
  const isHome = parameters().get("surface") === "home";
  const root = createRoot(document.getElementById("root")!);

  root.render(
    <LocaleProvider locale={locale} dictionaries={dictionaries}>
      <Navbar />
      {isHome ? (
        <main className="min-h-screen bg-black pt-40 text-white">
          <section data-fixture-competition className="mx-auto max-w-6xl px-6 py-16">
            <h1 className="text-3xl font-bold">Tournament participation stays available</h1>
            <p className="mt-4">Isolated homepage composition around the real optional news teaser.</p>
          </section>
          <LatestNews feed={feed} copy={dictionaries.public.news} locale={locale} />
        </main>
      ) : (
        <main className="min-h-screen bg-black px-5 pt-32 pb-16 text-white sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-[1120px]">
            <header className="mb-9 max-w-3xl border-l-2 border-orange-400/60 pl-5">
              <h1 className="text-3xl font-black leading-tight sm:text-4xl">{dictionaries.public.news.title}</h1>
              <p className="mt-4 text-base leading-8 text-zinc-300">{dictionaries.public.news.intro}</p>
              <p className="mt-2 text-xs leading-6 text-zinc-400">{dictionaries.public.news.sourceLanguage}</p>
            </header>
            <NewsListing feed={feed} copy={dictionaries.public.news} locale={locale} />
          </div>
        </main>
      )}
    </LocaleProvider>
  );
  document.documentElement.dataset.newsFixtureReady = "true";
}

void start().catch((error: unknown) => {
  document.getElementById("root")!.textContent =
    error instanceof Error ? error.message : "News fixture failed";
  console.error(error);
});
