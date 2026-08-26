"use client";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

export default function AnnouncementsLoading() {
  const t = useOptionalTranslations("common", englishCommon);

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="isolate min-h-screen bg-black px-4 pb-24 pt-36 text-white sm:px-6 sm:pt-40"
    >
      <div
        className="mx-auto max-w-4xl animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div className="mx-auto h-4 w-40 bg-orange-400/20" />
        <div className="mx-auto mt-6 h-12 max-w-xl bg-white/10" />
        <div className="mx-auto mt-5 h-5 max-w-2xl bg-white/5" />
        <div className="mt-12 h-72 border border-white/10 bg-white/[0.03]" />
      </div>
      <span className="sr-only">{t("errors.loading")}</span>
    </main>
  );
}
