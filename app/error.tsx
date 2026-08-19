"use client";

import { useEffect } from "react";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useOptionalTranslations("common", englishCommon);

  useEffect(() => {
    console.error("Player experience render error.", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-black px-6 py-32 text-white">
      <section className="w-full max-w-2xl border border-red-400/25 bg-zinc-950/90 p-8 shadow-2xl shadow-black/60 sm:p-12">
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">
          {t("errors.unexpectedTitle")}
        </h1>
        <p className="mt-5 max-w-xl leading-7 text-zinc-400">
          {t("errors.unexpectedDescription")}
        </p>
        <button
          type="button"
          className="mt-8 inline-flex min-h-12 items-center justify-center border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
          onClick={reset}
        >
          {t("errors.retry")}
        </button>
      </section>
    </main>
  );
}
