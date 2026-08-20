"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import englishCommon, {
  type CommonDictionary,
} from "@/lib/i18n/dictionaries/en/common";
import { interpolateMessage } from "@/lib/i18n/translate";
import AnalyticsConsent from "@/components/analytics/AnalyticsConsent";

type FooterProps = {
  analyticsConsentAvailable: boolean;
  dictionary?: CommonDictionary;
  rulebookPath: string;
  ppaPath: string;
};

export default function Footer({
  analyticsConsentAvailable,
  dictionary = englishCommon,
  rulebookPath,
  ppaPath,
}: FooterProps) {
  const pathname = usePathname();
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const resolvedDictionary = adminRoute ? englishCommon : dictionary;
  const copy = resolvedDictionary.footer;

  return (
    <footer
      className="border-t border-white/10 bg-black px-6 py-8 text-zinc-400"
      lang={adminRoute ? "en" : undefined}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm md:flex-row md:items-center md:justify-between">
        <p>
          {interpolateMessage(copy.copyright, {
            year: new Date().getFullYear(),
          })}
        </p>

        <nav
          aria-label={copy.legalAndRules}
          className="flex flex-wrap gap-x-5 gap-y-3"
        >
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/rules"
          >
            {copy.rules}
          </Link>
          <a
            aria-label={interpolateMessage(copy.opensInNewTab, {
              label: copy.rulebook,
            })}
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href={rulebookPath}
            rel="noopener noreferrer"
            target="_blank"
          >
            {copy.rulebook}
          </a>
          <a
            aria-label={interpolateMessage(copy.opensInNewTab, {
              label: copy.participationAgreement,
            })}
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href={ppaPath}
            rel="noopener noreferrer"
            target="_blank"
          >
            {copy.participationAgreementShort}
          </a>
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/terms"
          >
            {copy.terms}
          </Link>
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/privacy"
          >
            {copy.privacy}
          </Link>
          {analyticsConsentAvailable && !adminRoute ? (
            <AnalyticsConsent copy={resolvedDictionary.analyticsConsent} />
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
