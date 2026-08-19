import type { Metadata } from "next";
import type { ReactNode } from "react";

import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const publicDictionary = await loadDictionary(locale, "public");

  return {
    title: translate(publicDictionary, "metadata.aboutTitle"),
    description: translate(publicDictionary, "metadata.aboutDescription"),
  };
}

export default async function AboutLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();
  const publicDictionary = await loadDictionary(locale, "public");

  return (
    <LocaleProvider
      locale={locale}
      dictionaries={{ public: { about: publicDictionary.about } }}
    >
      {children}
    </LocaleProvider>
  );
}
