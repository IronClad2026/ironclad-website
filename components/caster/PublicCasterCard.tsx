import { ArrowRight, Globe2, Mic2, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";
import { casterPublicMediaPath, casterPublicProfilePath, type PublicCasterCard as Caster } from "@/lib/caster/publication";

const platformNames = {
  youtube: "YouTube", twitch: "Twitch", discord: "Discord", instagram: "Instagram", facebook: "Facebook",
  tiktok: "TikTok", x: "X",
};

export function PublicCasterAvatar({ caster, large = false }: { caster: Caster; large?: boolean }) {
  return (
    <span aria-hidden="true" className={`relative grid shrink-0 place-items-center overflow-hidden border border-orange-400/35 bg-zinc-900 text-orange-300 ${large ? "size-20 sm:size-28" : "size-16"}`}>
      <UserRound size={large ? 32 : 26} />
      {caster.avatar ? (
        <Image
          unoptimized fill src={casterPublicMediaPath(caster.slug, caster.publication_id, caster.avatar)} alt=""
          sizes={large ? "(min-width: 640px) 112px, 80px" : "64px"} className="object-cover"
        />
      ) : null}
    </span>
  );
}

export default function PublicCasterCard({ caster, copy, promote = false, animate = false }: {
  caster: Caster;
  copy: PublicCasterCopy;
  promote?: boolean;
  animate?: boolean;
}) {
  const Heading = promote ? "h3" : "h2";
  return (
    <Link
      href={casterPublicProfilePath(caster.slug)} prefetch={false}
      className={`group flex h-full min-w-0 flex-col border border-white/15 border-t-orange-400/65 bg-zinc-950 p-5 transition-colors hover:border-orange-400/55 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${promote ? "justify-center sm:p-7" : ""}`}
    >
      <div className={promote ? "relative grow content-center" : "grow"}>
        <div key={caster.slug} data-caster-slide-content={animate ? "true" : undefined}>
          <div className="flex min-w-0 items-start gap-4">
            <PublicCasterAvatar caster={caster} large={promote} />
            <div className="min-w-0 grow">
              <p className="flex items-start gap-1.5 text-xs leading-5 font-bold text-orange-300">
                <Mic2 size={14} aria-hidden="true" className="mt-0.5 shrink-0" />{copy.designation}
              </p>
              <Heading className={`mt-1 line-clamp-2 font-black leading-tight text-white [overflow-wrap:anywhere] ${promote ? "text-2xl sm:text-3xl" : "text-lg"}`}>
                {caster.display_name}
              </Heading>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-300 [overflow-wrap:anywhere]">
                <span className="sr-only">{copy.languages} </span>{caster.languages.join(" · ")}
              </p>
            </div>
          </div>
          {caster.games.length ? (
            <p className="mt-4 line-clamp-1 text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">
              <span className="sr-only">{copy.games} </span>{caster.games.join(" · ")}
            </p>
          ) : null}
          {caster.platforms.length ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-xs font-semibold text-zinc-300">
              <Globe2 size={14} aria-hidden="true" className="shrink-0 text-orange-300" />
              <span className="line-clamp-1 [overflow-wrap:anywhere]">
                <span className="sr-only">{copy.platforms} </span>
                {caster.platforms.flatMap((platform) => {
                  if (platform === "website") return [copy.website];
                  return Object.hasOwn(platformNames, platform) ? [platformNames[platform as keyof typeof platformNames]] : [];
                }).join(" · ")}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-orange-300 group-hover:text-orange-200">
        {copy.profile}<ArrowRight size={16} aria-hidden="true" className="shrink-0" />
      </span>
    </Link>
  );
}
