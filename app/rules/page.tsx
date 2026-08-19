import type { Metadata } from "next";

import RulesExperience, {
  type RuleDocumentSummary,
} from "@/components/rules/RulesExperience";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import {
  getLegalDocument,
  getLegalDocumentEffectiveDateDisplay,
  legalCorpus,
  resolveEffectiveDateToken,
} from "@/lib/legal-corpus-publication";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");

  return {
    title: copy.metadata.rulesTitle,
    description: copy.metadata.rulesDescription,
  };
}

export default async function RulesPage() {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "help-legal-ui");
  const documents = legalCorpus.documents.map<RuleDocumentSummary>((document) => ({
    kind: document.kind,
    title: document.shortTitle,
    version: document.version,
    status: document.status,
    effectiveDate: getLegalDocumentEffectiveDateDisplay(document),
    description: resolveEffectiveDateToken(document.subtitle, document),
    href: document.publicPath,
    filename: document.filename,
    readHref:
      document.kind === "terms"
        ? "/terms"
        : document.kind === "privacy"
          ? "/privacy"
          : document.publicPath,
  }));

  // This assertion keeps a direct build-time guard against an incomplete corpus
  // while only the compact projection above crosses the Server/Client boundary.
  getLegalDocument("rulebook");
  getLegalDocument("ppa");
  getLegalDocument("terms");
  getLegalDocument("privacy");

  return (
    <RulesExperience
      copy={copy}
      documents={documents}
      latestDocumentDate={legalCorpus.effectiveDateDisplay}
      locale={locale}
    />
  );
}
