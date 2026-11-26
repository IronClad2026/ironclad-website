import { ArrowUpRight, Radio, UserRound } from "lucide-react";
import Image from "next/image";
import AnnouncementBody from "@/components/AnnouncementBody";
import { normalizeAnnouncementHref } from "@/lib/announcement-document";
import { casterMediaPath, type CasterApplicationDraft } from "@/lib/caster/application";
import { getCasterApplicationCopy, type CasterApplicationCopy } from "@/lib/caster/application-copy";

function httpsUrl(value: string) {
  const url = normalizeAnnouncementHref(value);
  return url?.startsWith("https://") ? url : null;
}

export default function CasterApplicationPreview({
  data,
  copy = getCasterApplicationCopy("en"),
  approved = false,
}: {
  data: CasterApplicationDraft;
  copy?: CasterApplicationCopy;
  approved?: boolean;
}) {
  const links = data.links.flatMap(({ label, url }) => {
    const href = httpsUrl(url);
    return label.trim() && href ? [{ label, href }] : [];
  });
  const videos = data.videos.flatMap((url) => {
    const href = httpsUrl(url);
    if (!href) return [];
    const host = new URL(href).hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "youtu.be"].includes(host)) return [{ href, provider: "YouTube" }];
    if (["twitch.tv", "www.twitch.tv", "clips.twitch.tv"].includes(host)) return [{ href, provider: "Twitch" }];
    return [];
  });

  return (
    <article className="min-w-0 overflow-hidden border border-white/15 border-t-orange-400 bg-black">
      <header className="relative isolate overflow-hidden border-b border-white/15 bg-zinc-900">
        {data.banner ? (
          <Image src={casterMediaPath(data.banner)} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 700px" className="-z-20 object-cover" />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/95 via-black/65 to-black/35" aria-hidden="true" />
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-4 px-4 pt-16 pb-5 sm:gap-6 sm:px-7 sm:pt-28 sm:pb-7">
          <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden border border-orange-400/50 bg-zinc-950 text-orange-300 sm:size-24">
            {data.avatar ? (
              <Image src={casterMediaPath(data.avatar)} alt="" fill unoptimized sizes="96px" className="object-cover" />
            ) : <UserRound size={27} aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            {approved ? <p className="mb-1 text-xs font-black text-orange-300">{copy.preview.designation}</p> : null}
            <h3 className="text-2xl leading-tight font-black [overflow-wrap:anywhere] sm:text-4xl">{data.displayName.trim() || copy.preview.name}</h3>
            {data.languages.length ? <p className="mt-2 text-sm text-zinc-300 [overflow-wrap:anywhere]">{data.languages.join(" · ")}</p> : null}
          </div>
        </div>
      </header>
      <div className="grid gap-7 px-4 py-5 sm:px-7 sm:py-7">
        {data.bio ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.bio}</h4>
            <AnnouncementBody body="" bodyDocument={data.bio} />
          </section>
        ) : null}
        {data.experience.trim() ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.experience}</h4>
            <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-300 [overflow-wrap:anywhere]">{data.experience}</p>
          </section>
        ) : null}
        {data.games.length ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.games}</h4>
            <ul className="flex flex-wrap gap-2">
              {data.games.map((game, index) => <li key={index} className="max-w-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 [overflow-wrap:anywhere]">{game}</li>)}
            </ul>
          </section>
        ) : null}
        {links.length ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.links}</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {links.map(({ label, href }, index) => (
                <li key={index} className="min-w-0">
                  <a href={href} rel="noreferrer noopener" target="_blank" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 underline decoration-orange-400/45 underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-3">
                    {label}<ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {videos.length ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.videos}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {videos.map(({ href, provider }, index) => (
                <li key={index}>
                  <a href={href} rel="noreferrer noopener" target="_blank" className="flex min-h-11 items-center gap-2 border border-white/15 bg-zinc-950 px-3 text-sm font-bold text-orange-300 focus-visible:outline-2 focus-visible:outline-offset-3">
                    <Radio size={16} aria-hidden="true" />{provider} {index + 1}<ArrowUpRight size={16} className="ml-auto" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.gallery.length ? (
          <section>
            <h4 className="mb-2 text-lg font-black">{copy.fields.gallery}</h4>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.gallery.map((id, index) => (
                <li key={id} className="relative aspect-video overflow-hidden border border-white/15 bg-zinc-950">
                  <Image src={casterMediaPath(id)} alt={`${copy.fields.gallery} ${index + 1}`} fill unoptimized sizes="(max-width: 639px) 48vw, 220px" className="object-cover" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
