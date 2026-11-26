import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";

import "./globals.css";

import Footer from "@/components/Footer";
import GlobalSmoke from "@/components/GlobalSmoke";
import Navbar from "@/components/Navbar";
import ReadyHeader from "@/components/ready/ReadyHeader";
import NotificationBadgeRuntime from "@/components/NotificationBadgeRuntime";
import ConsentAwareVercelAnalytics from "@/components/analytics/ConsentAwareVercelAnalytics";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import AccountLegalUpdateGate from "@/components/legal/AccountLegalUpdateGate";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import { loadAccountLegalRuntimeState } from "@/lib/account-legal-acceptance";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { readCasterLayoutContext } from "@/lib/caster/layout-context";
import { CASTER_LAYOUT_HEADER } from "@/lib/caster/routes";
import { loadClerkLocalization } from "@/lib/i18n/clerk";
import type { Locale } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { getLegalDocument } from "@/lib/legal-corpus-publication";
import { isPublicProfileNoticeInstalled, NOTICE_LAYOUT_HEADER } from "@/lib/public-gaming-profile-notice";
import { isReadyStagingEnabled } from "@/lib/ready/review-access";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";

const icons: Metadata["icons"] = {
  icon: [
    {
      url: "/icons/icon-32x32.png",
      sizes: "32x32",
      type: "image/png",
    },
    {
      url: "/icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      url: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
  apple: [
    {
      url: "/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  ],
  shortcut: "/favicon.ico",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const publicCopy = await loadDictionary(locale, "public");
  const title = publicCopy.metadata.rootTitle;
  const description = publicCopy.metadata.rootDescription;

  return {
    title,
    description,
    applicationName: title,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "IronClad",
    },
    icons,
    openGraph: {
      title,
      description,
      siteName: "IronClad",
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getRequestLocale();
  const requestHeaders = await headers();
  const casterLayout = isCasterProgramEnabled() ? readCasterLayoutContext(requestHeaders.get(CASTER_LAYOUT_HEADER)) : null;

  if (casterLayout) {
    return (
      <CasterJourneyLayout locale={locale} view={casterLayout.view} legalError={casterLayout.legalError}>
        {children}
      </CasterJourneyLayout>
    );
  }

  // Proxy discards incoming copies of this header before assigning either
  // layout. No private navbar/badge queries run in the access-only layout.
  if (isPublicProfileNoticeInstalled() && requestHeaders.get(NOTICE_LAYOUT_HEADER)) {
    return (
      <ClerkProvider localization={await loadClerkLocalization(locale)}>
        <html lang={locale}>
          <body>{children}</body>
        </html>
      </ClerkProvider>
    );
  }
  const isVercelProduction = process.env.VERCEL_ENV === "production";
  const [common, clerkLocalization, legalRuntime] = await Promise.all([
    loadDictionary(locale, "common"),
    loadClerkLocalization(locale),
    loadAccountLegalRuntimeState({
      includeAnalytics: isVercelProduction,
    }),
  ]);
  const rulebook = getLegalDocument("rulebook");
  const ppa = getLegalDocument("ppa");
  const analyticsConsentAvailable =
    isVercelProduction && legalRuntime.analyticsAvailable;

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale}>
        <body>
          <NotificationBadgeRuntime />
          <LocaleProvider locale={locale} dictionaries={{ common }}>
            <AccountLegalUpdateGate
              copy={common.legalUpdate}
              state={legalRuntime.accountGate}
            >
              <SmoothScrollProvider>
                <GlobalSmoke />
                <Navbar ready={isReadyStagingEnabled() ? <ReadyHeader wardrobePilotEnabled={isReadyWardrobePilotEnabled()} /> : undefined} />

                <div>{children}</div>

                <Footer
                  analyticsConsentAvailable={analyticsConsentAvailable}
                  dictionary={common}
                  rulebookPath={rulebook.publicPath}
                  ppaPath={ppa.publicPath}
                />
                <ConsentAwareVercelAnalytics
                  enabled={analyticsConsentAvailable}
                />
                <SiteMusicPlayer />
              </SmoothScrollProvider>
            </AccountLegalUpdateGate>
          </LocaleProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

async function CasterJourneyLayout({ locale, view, legalError, children }: {
  locale: Locale;
  view: "auth" | "studio";
  legalError: string | null;
  children: ReactNode;
}) {
  const [clerkLocalization, common] = await Promise.all([
    loadClerkLocalization(locale),
    loadDictionary(locale, "common"),
  ]);
  const formError = legalError === "required" ? "acceptance-required" : legalError === "retry" ? "unavailable" : undefined;
  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale}>
        <body>
          <div className="min-h-svh bg-black text-white">
            <LocaleProvider locale={locale} dictionaries={{ common }}>
              {view === "auth" ? children : (
                <AccountLegalUpdateGate copy={common.legalUpdate} casterSubmission formError={formError}>
                  {children}
                </AccountLegalUpdateGate>
              )}
            </LocaleProvider>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
