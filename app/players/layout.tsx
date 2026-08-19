import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function PlayersLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const publicDictionary = await loadDictionary(locale, "public");

  return (
    <LocaleProvider locale={locale} dictionaries={{ public: publicDictionary }}>
      {children}
    </LocaleProvider>
  );
}
