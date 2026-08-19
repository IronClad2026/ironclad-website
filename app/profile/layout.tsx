import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const accountDictionary = await loadDictionary(locale, "account-dashboard");

  return (
    <LocaleProvider
      locale={locale}
      dictionaries={{ "account-dashboard": accountDictionary }}
    >
      {children}
    </LocaleProvider>
  );
}
