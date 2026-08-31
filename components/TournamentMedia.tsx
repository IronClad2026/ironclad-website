"use client";

import { ExternalLink, PlayCircle } from "lucide-react";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { TournamentMediaType } from "@/lib/tournament-media";
import type { TournamentCard } from "@/lib/tournaments";

const mediaTypeKeys: Record<TournamentMediaType, string> = {
  full_tournament: "fullTournament",
  match_cast: "matchCast",
  video: "video",
  other: "other",
};

export default function TournamentMedia({
  tournament,
  presentation,
}: {
  tournament: TournamentCard;
  presentation: "desktop" | "mobile";
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const media = tournament.media ?? [];

  return (
    <div
      className="w-full max-w-full min-w-0"
      data-tournament-media-presentation={presentation}
    >
      <h2 className="break-words text-xl font-black text-white">
        {tournament.title} — {t("tournaments.media.title")}
      </h2>

      {media.length > 0 ? (
        <ul
          className={
            presentation === "desktop"
              ? "mt-5 grid min-w-0 gap-4 md:grid-cols-2"
              : "mt-5 grid w-full max-w-full min-w-0 grid-cols-1 gap-4"
          }
        >
          {media.map((item) => (
            <li key={item.id} className="min-w-0">
              <a
                aria-label={`${t("tournaments.media.watch")}: ${item.title}. ${t("tournaments.media.opensNewTab")}`}
                className="group flex min-h-44 w-full min-w-0 flex-col overflow-hidden border border-white/12 bg-black/45 p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-orange-400/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="inline-flex min-h-7 min-w-0 items-center border border-orange-400/25 bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
                    {t(
                      `tournaments.media.types.${mediaTypeKeys[item.mediaType]}`
                    )}
                  </span>
                  <PlayCircle
                    aria-hidden="true"
                    className="shrink-0 text-orange-300"
                    size={20}
                  />
                </div>

                <p className="mt-4 min-w-0 break-words text-base font-black leading-6 text-white">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-2 min-w-0 break-words text-sm leading-6 text-zinc-300">
                    {item.description}
                  </p>
                ) : null}

                <span className="mt-auto inline-flex min-h-11 items-center gap-2 pt-4 text-xs font-black uppercase tracking-wider text-orange-300 group-hover:text-orange-200">
                  {t("tournaments.media.watch")}
                  <ExternalLink aria-hidden="true" size={15} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 border border-white/12 p-8 text-center text-zinc-400">
          {t("tournaments.media.empty")}
        </p>
      )}
    </div>
  );
}
