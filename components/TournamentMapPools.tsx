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
      className="border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.9))] p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <MapPinned size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">
              {t("mapPools.eyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
              {t("mapPools.title")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
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
        <div className="mt-6 grid items-start gap-5">
          {pools.map((pool) => (
            <article
              key={pool.bracketId}
              className="min-w-0 rounded-3xl border border-white/12 bg-black/35 shadow-xl shadow-black/20"
            >
              <header className="rounded-t-3xl border-b border-white/10 bg-[linear-gradient(135deg,rgba(249,115,22,0.13),rgba(255,255,255,0.025))] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                      {t("mapPools.divisionPool")}
                    </p>
                    <h3 className="mt-1 break-words text-xl font-black text-white">
                      {pool.divisionName}
                    </h3>
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
                <p className="mt-3 text-xs font-bold text-zinc-400">
                  {t(
                    `mapPools.mapCount${pluralSuffix(
                      selectPlural(pool.maps.length, locale)
                    )}`,
                    { count: formatNumber(pool.maps.length, locale) }
                  )}
                </p>
              </header>

              <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
                {pool.maps.map((map) => (
                  <li
                    key={map.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80"
                  >
                    <div className="relative grid aspect-[16/7] place-items-center overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_42%),linear-gradient(145deg,#18181b,#09090b)]">
                      {map.thumbnailPath ? (
                        <Image
                          src={map.thumbnailPath}
                          alt={t("mapPools.thumbnail", {
                            name: map.displayName,
                          })}
                          fill
                          sizes="(min-width: 1536px) 18rem, (min-width: 640px) 24rem, 90vw"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          role="img"
                          aria-label={t("mapPools.thumbnailUnavailable", {
                            name: map.displayName,
                          })}
                          className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/35 text-zinc-600"
                        >
                          <MapPinned size={24} aria-hidden="true" />
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            map.sourceType === "official"
                              ? "border-orange-400/25 bg-orange-500/10 text-orange-200"
                              : "border-sky-400/25 bg-sky-500/10 text-sky-200"
                          }`}
                        >
                          {sourceTypeLabels[map.sourceType]}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-300">
                          {map.gameMode}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            map.status === "active"
                              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                              : "border-amber-400/25 bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {statusLabels[map.status]}
                        </span>
                      </div>

                      <p className="mt-2 break-words [overflow-wrap:anywhere] text-sm font-black text-white">
                        {map.displayName}
                      </p>
                      {map.creatorName ? (
                        <p className="mt-1 break-words [overflow-wrap:anywhere] text-xs text-zinc-500">
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
