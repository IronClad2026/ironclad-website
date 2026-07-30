import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

import Footer from "@/components/Footer";
import GlobalSmoke from "@/components/GlobalSmoke";
import Navbar from "@/components/Navbar";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export const metadata: Metadata = {
  title: "IronClad Tournaments",
  description:
    "Competitive Company of Heroes 3 tournaments organized by IronClad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <SmoothScrollProvider>
            <GlobalSmoke />
            <Navbar />

            <main>{children}</main>

            <Footer />
            <SiteMusicPlayer />
          </SmoothScrollProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}