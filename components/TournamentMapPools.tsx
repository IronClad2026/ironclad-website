import Image from "next/image";
import { ImageIcon, LockKeyhole, MapPinned } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

type TournamentMapPoolsProps = {
  pools: PublishedTournamentMapPool[];
};

export default function TournamentMapPools({ pools }: TournamentMapPoolsProps) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const locale = useOptionalLocale();
  const sourceTypeLabels = {
    official: t("mapPools.official"),
    community: t("mapPools.community"),
  } as const;
  const statusLabels = {
    active: t("mapPools.active"),
    retired: t("mapPools.retired"),
    temporarily_disabled: t("mapPools.temporarilyDisabled"),
  } as const;

  return (
    <section
      aria-label={t("mapPools.ariaLabel")}
      className="border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.9))] p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <MapPinned size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">
              {t("mapPools.eyebrow")}
            </p>
            <h2 className="mt-0.5 text-lg font-black text-white sm:text-xl">
              {t("mapPools.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              {t("mapPools.description")}
            </p>
          </div>
        </div>
      </div>

      {pools.length === 0 ? (
        <div className="mt-5 grid min-h-32 place-items-center border border-dashed border-white/12 bg-black/25 p-6 text-center">
          <div>
            <ImageIcon
              size={24}
              aria-hidden="true"
              className="mx-auto text-zinc-600"
            />
            <p className="mt-3 text-sm font-bold text-zinc-400">
              {t("mapPools.empty")}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid items-start gap-3">
          {pools.map((pool) => (
            <article
              key={pool.bracketId}
              className="min-w-0 rounded-xl border border-white/12 bg-black/35 shadow-xl shadow-black/20"
            >
              <header className="rounded-t-xl border-b border-white/10 bg-[linear-gradient(135deg,rgba(249,115,22,0.13),rgba(255,255,255,0.025))] p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                      {t("mapPools.divisionPool")}
                    </p>
                    <h3 className="mt-0.5 break-words text-base font-black text-white sm:text-lg">
                      {pool.divisionName}
                    </h3>
                    <p className="mt-1 text-[11px] font-bold text-zinc-500">
                      {t(
                        `mapPools.mapCount${pluralSuffix(
                          selectPlural(pool.maps.length, locale)
                        )}`,
                        { count: formatNumber(pool.maps.length, locale) }
                      )}
                    </p>
                  </div>
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                      {pool.launchedAt ? (
                        <LockKeyhole size={12} aria-hidden="true" />
                      ) : null}
                      {pool.launchedAt
                        ? t("mapPools.frozen")
                        : t("mapPools.published")}
                    </span>
                    <InfoTooltip
                      align="end"
                      label={
                        pool.launchedAt
                          ? t("mapPools.aboutFrozen")
                          : t("mapPools.aboutPublished")
                      }
                      content={
                        pool.launchedAt
                          ? t("mapPools.frozenHelp")
                          : t("mapPools.publishedHelp")
                      }
                    />
                  </span>
                </div>
              </header>

              <ul className="grid grid-cols-1 gap-2 p-2 sm:[grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))] sm:p-3">
                {pool.maps.map((map) => (
                  <li
                    key={map.id}
                    className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/80"
                  >
                    <div className="relative grid h-24 place-items-center overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_42%),linear-gradient(145deg,#18181b,#09090b)] sm:h-20 xl:h-24">
                      {map.thumbnailPath ? (
                        <Image
                          src={map.thumbnailPath}
                          alt={t("mapPools.thumbnail", {
                            name: map.displayName,
                          })}
                          fill
                          sizes="(min-width: 1536px) 14rem, (min-width: 1024px) 13rem, (min-width: 640px) 20rem, 90vw"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          role="img"
                          aria-label={t("mapPools.thumbnailUnavailable", {
                            name: map.displayName,
                          })}
                          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/35 text-zinc-600"
                        >
                          <MapPinned size={20} aria-hidden="true" />
                        </span>
                      )}
                    </div>

                    <div className="p-2.5">
                      <p className="break-words [overflow-wrap:anywhere] text-sm font-black leading-5 text-white">
                        {map.displayName}
                      </p>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        <span
                          className={
                            map.sourceType === "official"
                              ? "text-orange-300"
                              : "text-sky-300"
                          }
                        >
                          {sourceTypeLabels[map.sourceType]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{map.gameMode}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            map.status === "active"
                              ? "text-emerald-300"
                              : "text-amber-300"
                          }
                        >
                          {statusLabels[map.status]}
                        </span>
                      </div>
                      {map.creatorName ? (
                        <p className="mt-1.5 break-words [overflow-wrap:anywhere] text-[11px] leading-4 text-zinc-500">
                          {t("mapPools.createdBy", {
                            name: map.creatorName,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function pluralSuffix(category: Intl.LDMLPluralRule) {
  return `${category[0].toUpperCase()}${category.slice(1)}`;
}
