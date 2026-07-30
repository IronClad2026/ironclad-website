import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GlobalSmoke from "@/components/GlobalSmoke";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export const metadata: Metadata = {
  title: "IronClad Tournaments",
  description: "Competitive Company of Heroes 3 tournaments and rankings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen overflow-x-hidden bg-black text-white">
          <GlobalSmoke />
          <SmoothScrollProvider>
            <Navbar />
            <div className="pt-[69px] sm:pt-[77px]">{children}</div>
            <Footer />
            <SiteMusicPlayer />
          </SmoothScrollProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
