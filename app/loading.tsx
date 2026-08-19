"use client";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

export default function Loading() {
  const t = useOptionalTranslations("common", englishCommon);

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-[60vh] place-items-center bg-black px-6 py-24 text-white"
    >
      <div className="flex items-center gap-3 text-sm font-bold text-zinc-300">
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-400"
        />
        <span>{t("errors.loading")}</span>
      </div>
    </main>
  );
}
