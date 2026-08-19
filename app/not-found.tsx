import Link from "next/link";

import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function NotFound() {
  const locale = await getRequestLocale();
  const common = await loadDictionary(locale, "common");

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 py-32 text-white">
      <section className="w-full max-w-2xl border border-white/12 bg-zinc-950/90 p-8 shadow-2xl shadow-black/60 sm:p-12">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
          {common.errors.notFoundEyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
          {common.errors.notFoundTitle}
        </h1>
        <p className="mt-5 max-w-xl leading-7 text-zinc-400">
          {common.errors.notFoundDescription}
        </p>
        <Link
          className="mt-8 inline-flex min-h-12 items-center justify-center border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
          href="/"
        >
          {common.errors.returnHome}
        </Link>
      </section>
    </main>
  );
}
