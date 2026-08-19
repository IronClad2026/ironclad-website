import type { Metadata } from "next";

import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");

  return {
    title: copy.metadata.termsTitle,
    description: copy.metadata.termsDescription,
  };
}

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");

  return <LegalDocumentPage copy={copy} kind="terms" locale={locale} />;
}
