import { ArrowLeft, ArrowUpRight, Clapperboard, Globe2, MapPin, Mic2, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import AnnouncementBody from "@/components/AnnouncementBody";
import { CasterCoverageList } from "@/components/caster/CasterCoverage";
import CasterFeaturedPlayers, { CasterVideoPlayer } from "@/components/caster/CasterFeaturedPlayers";
import { PublicCasterAvatar } from "@/components/caster/PublicCasterCard";
import { casterMediaPath } from "@/lib/caster/application";
import type { CasterCoverageAssignment } from "@/lib/caster/coverage";
import { parseCasterFeaturedVideo, parseCasterHttpsUrl } from "@/lib/caster/featured-video";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";
import { CASTER_DIRECTORY_PATH, casterPublicMediaPath, type PublicCasterProfile } from "@/lib/caster/publication";
import { CASTER_STUDIO_PATH } from "@/lib/caster/routes";
import type { CasterTournamentVideo } from "@/lib/caster/tournament-video";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatRegionName } from "@/lib/i18n/format";

const contentPanel = "min-w-0 border border-white/15 bg-zinc-950/80 p-5 sm:p-7";
const action = "inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 border border-white/15 px-3 py-2 text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";

export default function PublicCasterProfileView({ caster, copy, locale, coverage = [], tournamentVideos = [], canManage = false, mode = "public" }: {
  caster: PublicCasterProfile;
  copy: PublicCasterCopy;
  locale: Locale;
  coverage?: readonly CasterCoverageAssignment[];
  tournamentVideos?: readonly CasterTournamentVideo[];
  canManage?: boolean;
  mode?: "public" | "draft";
}) {
  const preview = mode === "draft";
  const Root = preview ? "section" : "main";
  const Name = preview ? "h2" : "h1";
  const Heading = preview ? "h3" : "h2";
  const Subheading = preview ? "h4" : "h3";
  const draftId = useId();
  const prefix = preview ? `caster-preview-${draftId}` : "caster";
  const playerCopy = { loadPlayer: copy.loadPlayer, hidePlayer: copy.hidePlayer, watch: copy.watch, playerLabel: copy.playerLabel };
  const media = (id: string) => preview ? casterMediaPath(id) : casterPublicMediaPath(caster.slug, caster.publication_id, id);
  const videos = caster.videos.flatMap((url) => {
    const video = parseCasterFeaturedVideo(url);
    return video ? [video] : [];
  });
  const tournamentMedia = tournamentVideos.flatMap((item) => {
    const video = parseCasterFeaturedVideo(item.url);
    return video && item.published && item.publiclyVisible && item.moderationStatus === "visible" &&
      item.tournamentHref.startsWith("/tournaments?") ? [{ item, video }] : [];
  });
  const links = caster.links.flatMap(({ label, url }) => {
    const href = parseCasterHttpsUrl(url)?.href;
    return href ? [{ label, href }] : [];
  });

  return (
    <Root className={preview ? "min-w-0 overflow-hidden border border-white/15 bg-black text-white" : "min-h-screen bg-black text-white"}>
      <header className={preview ? "px-3 pt-4 sm:px-5" : "px-5 pt-24 sm:px-8 sm:pt-32 lg:px-12"}>
        <div className="mx-auto w-full max-w-[1120px]">
          {!preview ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Link href={CASTER_DIRECTORY_PATH} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
                <ArrowLeft size={17} aria-hidden="true" />{copy.back}
              </Link>
              {canManage ? (
                <Link href={`${CASTER_STUDIO_PATH}?section=profile`} prefetch={false} className={`${action} border-orange-400/50 bg-orange-400/10 text-orange-100 hover:border-orange-300 hover:bg-orange-400/20`}>
                  <Pencil size={16} aria-hidden="true" className="shrink-0" />{copy.manageProfile}
                </Link>
              ) : null}
            </div>
          ) : null}
          <div className="overflow-hidden border border-white/15 bg-zinc-950">
            <div className={`relative isolate overflow-hidden bg-zinc-900 ${preview ? "h-28 sm:h-36" : "h-32 sm:h-56"}`}>
              {caster.banner ? (
                <Image src={media(caster.banner)} fill unoptimized sizes="(min-width: 1280px) 1120px, 100vw" alt="" className="object-cover" />
              ) : (
                <div aria-hidden="true" className="absolute inset-0 bg-[url('/images/ironclad-background.jpg')] bg-cover bg-center opacity-60" />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/20" />
            </div>
            <div className="relative px-4 pb-5 sm:px-7 sm:pb-7">
              <div className="relative -mt-9 flex min-w-0 flex-col items-start gap-3 sm:-mt-12 sm:gap-4">
                <PublicCasterAvatar caster={caster} large source={caster.avatar ? media(caster.avatar) : undefined} />
                <div className="min-w-0">
                  <p className="flex items-start gap-2 text-sm leading-6 font-bold text-orange-300">
                    <Mic2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{copy.designation}
                  </p>
                  <Name className={`mt-1 leading-tight font-black text-white [overflow-wrap:anywhere] ${preview ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl"}`}>{caster.display_name}</Name>
                </div>
              </div>

              <dl className="mt-4 flex min-w-0 flex-wrap gap-2 text-sm text-zinc-300" data-caster-profile-identity>
                <div className="flex min-w-0 items-start gap-2 border border-white/15 bg-black/50 px-3 py-2">
                  <dt className="sr-only">{copy.languages}</dt>
                  <dd className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
                    <Globe2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300" />{caster.languages.join(" · ")}
                  </dd>
                </div>
                {caster.country ? (
                  <div className="flex min-w-0 items-start gap-2 border border-white/15 bg-black/50 px-3 py-2">
                    <dt className="sr-only">{copy.country}</dt>
                    <dd className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
                      <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-300" />{formatRegionName(caster.country, locale)}
                    </dd>
                  </div>
                ) : null}
                {caster.games.length ? (
                  <div className="min-w-0 border border-white/15 bg-black/50 px-3 py-2 [overflow-wrap:anywhere]">
                    <dt className="mr-2 inline text-xs font-bold text-orange-300">{copy.games}</dt>
                    <dd className="inline">{caster.games.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
              {links.length ? (
                <section aria-labelledby={`${prefix}-links`} className="mt-5 border-t border-white/10 pt-4">
                  <Heading id={`${prefix}-links`} className="sr-only">{copy.links}</Heading>
                  <ul className="flex min-w-0 flex-wrap gap-2">
                    {links.map(({ label, href }, index) => (
                      <li key={`${href}-${index}`} className="max-w-full min-w-0">
                        <a href={href} target="_blank" rel="noopener noreferrer" className={`${action} bg-white/5 text-orange-300 hover:border-orange-400/50`}>
                          <span className="min-w-0">{label}</span><ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className={`mx-auto grid w-full max-w-[1216px] gap-5 ${preview ? "px-3 py-4 sm:px-5" : "px-5 py-7 sm:gap-7 sm:px-8 sm:py-10 lg:px-12"}`}>
        <section aria-labelledby={`${prefix}-about`} className={contentPanel}>
          <Heading id={`${prefix}-about`} className="mb-4 text-xl font-black sm:text-2xl">{copy.about}</Heading>
          <AnnouncementBody body="" bodyDocument={caster.bio} />
          {caster.experience ? (
            <div className="mt-6 border-t border-white/15 pt-5">
              <Subheading className="mb-2 text-base font-black">{copy.experience}</Subheading>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{caster.experience}</p>
            </div>
          ) : null}
        </section>
        {tournamentMedia.length ? (
          <section aria-labelledby={`${prefix}-tournament-videos`} className={`${contentPanel} border-l-orange-400/60`}>
            <Heading id={`${prefix}-tournament-videos`} className="mb-4 flex items-center gap-2 text-xl font-black sm:text-2xl">
              <Clapperboard size={21} aria-hidden="true" className="shrink-0 text-orange-300" />{copy.tournamentVideos}
            </Heading>
            <ul className="grid min-w-0 gap-4 md:grid-cols-2">
              {tournamentMedia.map(({ item, video }) => (
                <li key={item.id} className="min-w-0 border border-white/15 bg-black/40 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-orange-300 [overflow-wrap:anywhere]">
                      {[item.tournamentTitle, item.scopeLabel].filter(Boolean).join(" · ")}
                    </p>
                    <Subheading className="mt-1 text-lg font-bold leading-tight [overflow-wrap:anywhere]">{item.title}</Subheading>
                    {Number.isFinite(Date.parse(item.publishedAt)) ? (
                      <time dateTime={item.publishedAt} className="mt-1 block text-xs text-zinc-400">{formatDateTime(item.publishedAt, locale, { kind: "utc" })} UTC</time>
                    ) : null}
                    {item.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 [overflow-wrap:anywhere]">{item.description}</p> : null}
                  </div>
                  <CasterVideoPlayer video={video} copy={playerCopy} watchOnly={preview} />
                  <Link href={item.tournamentHref} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 underline focus-visible:outline-2 focus-visible:outline-orange-300">
                    {copy.tournamentMedia}<ArrowUpRight size={15} aria-hidden="true" className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {videos.length ? (
          <section aria-labelledby={`${prefix}-featured`} className={contentPanel}>
            <Heading id={`${prefix}-featured`} className="mb-4 text-xl font-black">{copy.featured}</Heading>
            <CasterFeaturedPlayers videos={videos} copy={playerCopy} watchOnly={preview} />
          </section>
        ) : null}
        {caster.gallery.length ? (
          <section aria-labelledby={`${prefix}-gallery`} className={contentPanel}>
            <Heading id={`${prefix}-gallery`} className="mb-4 text-xl font-black">{copy.gallery}</Heading>
            <ul className={`grid grid-cols-2 gap-3 ${preview ? "" : "sm:grid-cols-3"}`}>
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
        <CasterCoverageList records={coverage} locale={locale} mode="history" headingLevel={preview ? 3 : 2} />
      </div>
    </Root>
  );
}
