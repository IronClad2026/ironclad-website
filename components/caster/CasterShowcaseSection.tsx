import { ArrowRight } from "lucide-react";
import Link from "next/link";
import CasterShowcaseCarousel from "@/components/caster/CasterShowcaseCarousel";
import PublicCasterCard from "@/components/caster/PublicCasterCard";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { loadPublicCasterShowcase } from "@/lib/caster/public-directory";
import { CASTER_DIRECTORY_PATH } from "@/lib/caster/publication";
import type { Locale } from "@/lib/i18n/config";

export default async function CasterShowcaseSection({ locale, documentNavigation = false }: { locale: Locale; documentNavigation?: boolean }) {
  if (!isCasterProgramEnabled()) return null;
  const casters = await loadPublicCasterShowcase();
  if (casters.length === 0) return null;
  const copy = getPublicCasterCopy(locale);
  const DirectoryLink = documentNavigation ? "a" : Link;

  return (
    <section aria-labelledby="official-caster-showcase" data-caster-showcase className="border-t border-orange-500/20 bg-zinc-950/70 px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="official-caster-showcase" className="text-xl font-bold text-white sm:text-2xl">{copy.showcase}</h2>
          <DirectoryLink href={CASTER_DIRECTORY_PATH} {...(documentNavigation ? {} : { prefetch: false })} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
            {copy.browse}<ArrowRight size={16} aria-hidden="true" />
          </DirectoryLink>
        </div>
        {casters.length === 1 ? (
          <PublicCasterCard caster={casters[0]} copy={copy} promote documentNavigation={documentNavigation} />
        ) : (
          <CasterShowcaseCarousel casters={casters} copy={copy} documentNavigation={documentNavigation} />
        )}
      </div>
    </section>
  );
}
