import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const dictionaries = await loadDictionaries(
    locale,
    ["account-dashboard", "competition", "notifications"] as const
  );

  return (
    <LocaleProvider locale={locale} dictionaries={dictionaries}>
      {children}
    </LocaleProvider>
  );
}
