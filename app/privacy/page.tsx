import type { Metadata } from "next";

import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");

  return {
    title: copy.metadata.privacyTitle,
    description: copy.metadata.privacyDescription,
  };
}

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");

  return <LegalDocumentPage copy={copy} kind="privacy" locale={locale} />;
}
