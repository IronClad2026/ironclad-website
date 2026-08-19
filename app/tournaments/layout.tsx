import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function TournamentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const competition = await loadDictionary(locale, "competition");

  return (
    <LocaleProvider locale={locale} dictionaries={{ competition }}>
      {children}
    </LocaleProvider>
  );
}
