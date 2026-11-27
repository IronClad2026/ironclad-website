import type { ReactNode } from "react";
import AccountLegalUpdateGate from "@/components/legal/AccountLegalUpdateGate";
import type { Locale } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";

export default async function CasterStudioLegalGate({ children, locale, legalError }: {
  children: ReactNode;
  locale: Locale;
  legalError: string | string[] | undefined;
}) {
  const { legalUpdate } = await loadDictionary(locale, "common");
  const formError = legalError === "required" ? "acceptance-required" : legalError === "retry" ? "unavailable" : undefined;

  return (
    <AccountLegalUpdateGate copy={legalUpdate} casterSubmission formError={formError}>
      {children}
    </AccountLegalUpdateGate>
  );
}
