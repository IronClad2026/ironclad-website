import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Mic2 } from "lucide-react";
import PublicCasterCard from "@/components/caster/PublicCasterCard";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { loadPublicCasterDirectory } from "@/lib/caster/public-directory";
import { CASTER_DIRECTORY_PATH } from "@/lib/caster/publication";
import { getRequestLocale } from "@/lib/i18n/request";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

function pageNumber(value: string | string[] | undefined): number {
  return typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

function pagePath(page: number): string {
  return page > 1 ? `${CASTER_DIRECTORY_PATH}?page=${page}` : CASTER_DIRECTORY_PATH;
}

export async function generateMetadata(): Promise<Metadata> {
  const copy = getPublicCasterCopy(await getRequestLocale());
  return {
    title: copy.directoryTitle,
    description: copy.directoryDescription,
    ...(process.env.VERCEL_ENV !== "production" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CasterDirectoryPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  if (!isCasterProgramEnabled()) notFound();
  const page = pageNumber((await searchParams).page);
  const [locale, result] = await Promise.all([
    getRequestLocale(),
    loadPublicCasterDirectory({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE + 1 }),
  ]);
  const copy = getPublicCasterCopy(locale);
  const casters = result.slice(0, PAGE_SIZE);
  const previous = page > 1;
  const next = result.length > PAGE_SIZE;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="relative isolate overflow-hidden border-b border-orange-500/20 bg-zinc-950 px-5 pt-28 pb-10 sm:px-8 sm:pt-36 sm:pb-14 lg:px-12">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[url('/images/ironclad-background.jpg')] bg-cover bg-center opacity-45" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.55),rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.95),rgba(249,115,22,0.16))]" />
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="max-w-3xl border-l-2 border-orange-400/60 pl-5">
            <h1 className="text-4xl leading-tight font-black text-white sm:text-6xl">{copy.directoryTitle}</h1>
            <p className="mt-3 text-base leading-8 text-zinc-300 sm:mt-4 sm:text-lg">{copy.directoryDescription}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1216px] px-5 py-9 sm:px-8 sm:py-12 lg:px-12">
        {casters.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {casters.map((caster) => <li key={caster.slug}><PublicCasterCard caster={caster} copy={copy} /></li>)}
          </ul>
        ) : (
          <div className="flex items-center gap-4 border border-white/15 bg-zinc-950 p-5 text-zinc-300 sm:p-7">
            <Mic2 size={22} aria-hidden="true" className="shrink-0 text-orange-300" />
            <p>{copy.empty}</p>
          </div>
        )}

        {previous || next ? (
          <nav aria-label={copy.directoryTitle} className="mt-7 flex flex-wrap items-center justify-between gap-3">
            {previous ? (
              <Link href={pagePath(page - 1)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 border border-white/15 bg-zinc-950 px-4 text-sm font-bold text-orange-300 hover:border-orange-400/50 focus-visible:outline-2 focus-visible:outline-orange-300">
                <ArrowLeft size={16} aria-hidden="true" />{copy.previous}
              </Link>
            ) : null}
            {next ? (
              <Link href={pagePath(page + 1)} prefetch={false} className="ml-auto inline-flex min-h-11 items-center gap-2 border border-white/15 bg-zinc-950 px-4 text-sm font-bold text-orange-300 hover:border-orange-400/50 focus-visible:outline-2 focus-visible:outline-orange-300">
                {copy.next}<ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
