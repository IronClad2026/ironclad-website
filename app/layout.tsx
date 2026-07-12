import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import GlobalSmoke from "@/components/GlobalSmoke";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-black text-white">
          <SmoothScrollProvider>
            <Navbar />
<GlobalSmoke />
<div className="pt-[83px] md:pt-[69px]">{children}</div>
            <Footer />
            <SiteMusicPlayer />
          </SmoothScrollProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
