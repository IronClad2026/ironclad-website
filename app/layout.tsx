import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

import Footer from "@/components/Footer";
import GlobalSmoke from "@/components/GlobalSmoke";
import Navbar from "@/components/Navbar";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import AccountLegalUpdateGate from "@/components/legal/AccountLegalUpdateGate";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import { loadClerkLocalization } from "@/lib/i18n/clerk";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { getLegalDocument } from "@/lib/legal-corpus-publication";

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
  const [common, clerkLocalization] = await Promise.all([
    loadDictionary(locale, "common"),
    loadClerkLocalization(locale),
  ]);
  const rulebook = getLegalDocument("rulebook");
  const ppa = getLegalDocument("ppa");
  const terms = getLegalDocument("terms");
  const privacy = getLegalDocument("privacy");
  const analyticsConsentAvailable =
    terms.version === "1.1" && privacy.version === "1.1";

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale}>
        <body>
          <LocaleProvider locale={locale} dictionaries={{ common }}>
            <AccountLegalUpdateGate copy={common.legalUpdate}>
              <SmoothScrollProvider>
                <GlobalSmoke />
                <Navbar />

                <div>{children}</div>

                <Footer
                  analyticsConsentAvailable={analyticsConsentAvailable}
                  dictionary={common}
                  rulebookPath={rulebook.publicPath}
                  ppaPath={ppa.publicPath}
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
