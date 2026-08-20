import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import Phase10PreviewPanel from "@/components/badges/Phase10PreviewPanel";

export const metadata: Metadata = {
  title: "Badge System Preview | IronClad",
  description: "Development-only IronClad badge system mock data preview.",
};

export default async function BadgeSystemPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const host = (await headers()).get("host");
  const localhostUrl = getLoopbackLocalhostUrl(host);

  if (localhostUrl) {
    redirect(localhostUrl);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-4 py-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <header className="rounded-lg border border-orange-500/25 bg-[linear-gradient(145deg,rgba(249,115,22,0.1),rgba(0,0,0,0.92))] p-5 shadow-2xl shadow-black/35 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
            Development / Mock Data
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
            Badge System Preview
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base sm:leading-7">
            This isolated route renders local badge fixtures only. It is not
            connected to production badge awards, player profiles, Supabase,
            billing, tournaments, rankings, analytics, or admin workflows.
          </p>
        </header>

        <Phase10PreviewPanel />
      </div>
    </main>
  );
}

function getLoopbackLocalhostUrl(host: string | null) {
  if (!host) {
    return null;
  }

  const normalizedHost = host.toLowerCase();
  const loopbackPrefix = "127.0.0.1";
  const ipv6LoopbackPrefix = "[::1]";

  if (
    normalizedHost !== loopbackPrefix &&
    !normalizedHost.startsWith(`${loopbackPrefix}:`) &&
    normalizedHost !== ipv6LoopbackPrefix &&
    !normalizedHost.startsWith(`${ipv6LoopbackPrefix}:`)
  ) {
    return null;
  }

  const port = normalizedHost.startsWith(`${loopbackPrefix}:`)
    ? normalizedHost.slice(loopbackPrefix.length)
    : normalizedHost.startsWith(`${ipv6LoopbackPrefix}:`)
      ? normalizedHost.slice(ipv6LoopbackPrefix.length)
      : "";

  return `http://localhost${port}/dev/badges`;
}
