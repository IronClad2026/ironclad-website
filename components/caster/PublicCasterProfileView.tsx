import { ArrowLeft, ArrowUpRight, Globe2, MapPin, Mic2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import AnnouncementBody from "@/components/AnnouncementBody";
import CasterFeaturedPlayers from "@/components/caster/CasterFeaturedPlayers";
import { PublicCasterAvatar } from "@/components/caster/PublicCasterCard";
import { parseCasterFeaturedVideo, parseCasterHttpsUrl } from "@/lib/caster/featured-video";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";
import { CASTER_DIRECTORY_PATH, casterPublicMediaPath, type PublicCasterProfile } from "@/lib/caster/publication";
import type { Locale } from "@/lib/i18n/config";
import { formatRegionName } from "@/lib/i18n/format";

const contentPanel = "min-w-0 border border-white/15 bg-zinc-950/80 p-5 sm:p-7";

export default function PublicCasterProfileView({ caster, copy, locale }: {
  caster: PublicCasterProfile;
  copy: PublicCasterCopy;
  locale: Locale;
}) {
  const media = (id: string) => casterPublicMediaPath(caster.slug, caster.publication_id, id);
  const videos = caster.videos.flatMap((url) => {
    const video = parseCasterFeaturedVideo(url);
    return video ? [video] : [];
  });
  const links = caster.links.flatMap(({ label, url }) => {
    const href = parseCasterHttpsUrl(url)?.href;
    return href ? [{ label, href }] : [];
  });

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="relative isolate overflow-hidden border-b border-orange-500/20 bg-zinc-950 px-5 pt-28 pb-10 sm:px-8 sm:pt-36 sm:pb-14 lg:px-12">
        {caster.banner ? (
          <Image src={media(caster.banner)} fill unoptimized sizes="100vw" alt="" className="-z-20 object-cover" />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[url('/images/ironclad-background.jpg')] bg-cover bg-center opacity-45" />
        )}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.96)),linear-gradient(110deg,rgba(0,0,0,0.92),rgba(249,115,22,0.14))]" />
        <div className="mx-auto w-full max-w-[1120px]">
          <Link href={CASTER_DIRECTORY_PATH} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
            <ArrowLeft size={17} aria-hidden="true" />{copy.back}
          </Link>
          <div className="mt-6 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4 sm:mt-9">
            <PublicCasterAvatar caster={caster} large />
            <div className="min-w-0 grow">
              <p className="flex items-start gap-2 text-sm leading-6 font-bold text-orange-300">
                <Mic2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{copy.designation}
              </p>
              <h1 className="mt-2 text-4xl leading-tight font-black text-white [overflow-wrap:anywhere] sm:text-6xl">{caster.display_name}</h1>
            </div>
          </div>

          <dl className="mt-6 flex flex-wrap gap-3 text-sm" data-caster-profile-identity>
            <div className="flex min-w-0 items-start gap-2 border border-white/15 bg-black/50 px-3 py-2 text-zinc-200">
              <dt className="sr-only">{copy.languages}</dt>
              <dd className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
                <Globe2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300" />{caster.languages.join(" · ")}
              </dd>
            </div>
            {caster.country ? (
              <div className="flex min-w-0 items-start gap-2 border border-white/15 bg-black/50 px-3 py-2 text-zinc-200">
                <dt className="sr-only">{copy.country}</dt>
                <dd className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
                  <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300" />{formatRegionName(caster.country, locale)}
                </dd>
              </div>
            ) : null}
            {caster.games.length ? (
              <div className="min-w-0 border border-white/15 bg-black/50 px-3 py-2 text-zinc-200 [overflow-wrap:anywhere]">
                <dt className="mr-2 inline text-xs font-bold text-orange-300">{copy.games}</dt>
                <dd className="inline">{caster.games.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1216px] gap-5 px-5 py-9 sm:gap-7 sm:px-8 sm:py-12 lg:px-12">
        <section aria-labelledby="caster-about" className={contentPanel}>
          <h2 id="caster-about" className="mb-4 text-2xl font-black">{copy.about}</h2>
          <AnnouncementBody body="" bodyDocument={caster.bio} />
          {caster.experience ? (
            <div className="mt-6 border-t border-white/15 pt-5">
              <h3 className="mb-2 text-base font-black">{copy.experience}</h3>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{caster.experience}</p>
            </div>
          ) : null}
        </section>
        {links.length ? (
          <section aria-labelledby="caster-links" className={contentPanel}>
            <h2 id="caster-links" className="mb-3 text-xl font-black">{copy.links}</h2>
            <ul className="flex flex-wrap gap-2">
              {links.map(({ label, href }, index) => (
                <li key={`${href}-${index}`} className="max-w-full min-w-0">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-2 border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-orange-300 [overflow-wrap:anywhere] hover:border-orange-400/50 focus-visible:outline-2 focus-visible:outline-orange-300">
                    <span className="min-w-0">{label}</span><ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {videos.length ? (
          <section aria-labelledby="caster-featured" className={contentPanel}>
            <h2 id="caster-featured" className="mb-4 text-xl font-black">{copy.featured}</h2>
            <CasterFeaturedPlayers videos={videos} copy={{ loadPlayer: copy.loadPlayer, hidePlayer: copy.hidePlayer, watch: copy.watch, playerLabel: copy.playerLabel }} />
          </section>
        ) : null}
        {caster.gallery.length ? (
          <section aria-labelledby="caster-gallery" className={contentPanel}>
            <h2 id="caster-gallery" className="mb-4 text-xl font-black">{copy.gallery}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {caster.gallery.map((id, index) => {
                const label = copy.galleryImage.replace("{number}", String(index + 1));
                return (
                  <li key={id} className="relative aspect-video overflow-hidden border border-white/15 bg-zinc-900">
                    <a href={media(id)} aria-label={label} target="_blank" rel="noopener noreferrer" className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-300">
                      <Image src={media(id)} alt="" fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
