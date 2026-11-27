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
import { getCasterProfileCopy } from "@/lib/caster/profile-copy";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { CASTER_CHROME_HEADER, CASTER_PUBLIC_HOME_CHROME } from "@/lib/caster/routes";
import { canOpenCasterStudioFromNavigation } from "@/lib/caster/server";
import { loadClerkLocalization } from "@/lib/i18n/clerk";
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
  const casterEnabled = isCasterProgramEnabled();
  const casterDocument = casterEnabled && requestHeaders.get(CASTER_CHROME_HEADER) === "bare";
  const casterPublicHome = casterEnabled && requestHeaders.get(CASTER_CHROME_HEADER) === CASTER_PUBLIC_HOME_CHROME;
  const noticeDocument = isPublicProfileNoticeInstalled() && requestHeaders.get(NOTICE_LAYOUT_HEADER);
  // These access documents own their content and checks. The proxy's chrome
  // marker only keeps the standard shell and its private queries out of them.
  if (casterDocument || noticeDocument || casterPublicHome) {
    return (
      <ClerkProvider localization={await loadClerkLocalization(locale)}>
        <html lang={locale}>
          <body data-caster-public-home-document={casterPublicHome || undefined}>{children}</body>
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
  const casterNavigation = casterEnabled ? {
    directoryLabel: getPublicCasterCopy(locale).directory,
    studioLabel: legalRuntime.accountGate.status === "satisfied" && await canOpenCasterStudioFromNavigation()
      ? getCasterProfileCopy(locale).title : undefined,
  } : undefined;

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
                <Navbar
                  ready={isReadyStagingEnabled() ? <ReadyHeader wardrobePilotEnabled={isReadyWardrobePilotEnabled()} /> : undefined}
                  casters={casterNavigation}
                />

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
