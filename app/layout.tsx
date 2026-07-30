import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
<<<<<<< HEAD
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
import GlobalSmoke from "@/components/GlobalSmoke";
=======
import GlobalSmoke from "@/components/GlobalSmoke";
import SiteMusicPlayer from "@/components/SiteMusicPlayer";
>>>>>>> master
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">

      </html>
    </ClerkProvider>
  );
}