import type { ReactNode } from "react";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function CasterLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const common = await loadDictionary(locale, "common");

  return (
    <div className="min-h-svh bg-black text-white">
      <LocaleProvider locale={locale} dictionaries={{ common }}>
        {children}
      </LocaleProvider>
    </div>
  );
}
