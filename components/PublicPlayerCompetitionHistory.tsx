"use client";

import Link from "next/link";
import { ArrowUpRight, Trophy, UsersRound } from "lucide-react";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishPublicDictionary from "@/lib/i18n/dictionaries/en/public-players";
import { formatNumber } from "@/lib/i18n/format";
import type { PublicPlayerCompetitionHistory as CompetitionHistory } from "@/lib/public-player-competition-types";

const cardClass = "min-w-0 border border-orange-400/20 bg-[linear-gradient(145deg,rgba(249,115,22,0.07),rgba(0,0,0,0.78))] p-5 shadow-2xl shadow-black/20 sm:p-6";
const linkClass = "inline-flex min-h-11 items-center gap-2 rounded-sm text-orange-300 underline-offset-4 hover:text-orange-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

export default function PublicPlayerCompetitionHistory({ playerId, history }: {
  playerId: string;
  history: CompetitionHistory;
}) {
  const t = useOptionalTranslations("public", englishPublicDictionary);
  const locale = useOptionalLocale();
  const loaded = history.status === "loaded" ? history : null;
  const href = (page: number) => `/players/${encodeURIComponent(playerId)}?historyPage=${page}#competitive-history`;
  const empty = loaded?.coverage.page === 1 && loaded.coverage.nextPage === null
    ? t("players.history.empty") : t("players.history.emptyPage");
  const numbers = loaded ? [
    [t("players.history.played"), formatNumber(loaded.record.matchesPlayed, locale)],
    [t("players.history.wins"), formatNumber(loaded.record.wins, locale)],
    [t("players.history.losses"), formatNumber(loaded.record.losses, locale)],
    [t("players.history.winRate"), loaded.record.matchesPlayed > 0
      ? formatNumber(loaded.record.wins / loaded.record.matchesPlayed, locale, { style: "percent", maximumFractionDigits: 1 })
      : t("players.history.notAvailable")],
  ] : [];

  return (
    <div id="competitive-history" className="mt-6 grid scroll-mt-24 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <section className={cardClass} aria-labelledby="tournament-history-heading">
        <h3 id="tournament-history-heading" className="flex items-center gap-3 text-lg font-black text-white">
          <Trophy aria-hidden="true" size={20} className="shrink-0 text-orange-300" />
          {t("players.tournamentHistory")}
        </h3>
        {loaded ? <>
          <p className="mt-3 text-xs leading-5 text-zinc-400">{t("players.history.order")}</p>
          {loaded.entries.length ? <ul className="mt-4 divide-y divide-white/10">
            {loaded.entries.map((entry) => (
              <li key={entry.tournamentId} className="py-4 first:pt-0 last:pb-0">
                <Link prefetch={false} href={entry.tournamentHref} className={`${linkClass} max-w-full text-base font-bold`}>
                  <span className="break-words">{entry.tournamentName}</span>
                  <ArrowUpRight aria-hidden="true" size={16} className="shrink-0" />
                </Link>
                <p className="mt-1 text-sm font-semibold text-zinc-200">{t("players.history.division", { division: entry.division })}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="border border-white/15 px-2 py-1 text-zinc-300">{t(`players.history.states.${entry.divisionState}`)}</span>
                  {!["completed", "cancelled", "voided"].includes(entry.tournamentStatus) ?
                    <span className="border border-orange-400/25 px-2 py-1 text-orange-200">{t("players.history.eventIncomplete")}</span> : null}
                  {entry.withdrawn ? <span className="border border-white/15 px-2 py-1 text-zinc-300">{t("players.history.withdrawn")}</span> : null}
                </div>
                <p className="mt-3 text-sm font-bold text-white">{
                  entry.champion ? t("players.history.champion") :
                    entry.placement !== null ? t("players.history.placement", { rank: formatNumber(entry.placement, locale) }) :
                      entry.divisionCompleted ? t("players.history.noPlacement") :
                        ["cancelled", "voided", "not_held"].includes(entry.divisionState) ? t("players.history.noFinalOutcome") :
                          t("players.history.resultPending")
                }</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{t("players.history.entryRecord", {
                  played: formatNumber(entry.record.matchesPlayed, locale),
                  wins: formatNumber(entry.record.wins, locale),
                  losses: formatNumber(entry.record.losses, locale),
                })}</p>
              </li>
            ))}
          </ul> : <p className="mt-4 text-sm leading-6 text-zinc-300">{empty}</p>}
          {loaded.coverage.previousPage || loaded.coverage.nextPage ? <nav aria-label={t("players.history.pagination")} className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-sm">
            {loaded.coverage.previousPage ? <Link prefetch={false} href={href(loaded.coverage.previousPage)} className={linkClass}>{t("players.history.previous")}</Link> : null}
            <span className="text-xs text-zinc-400">{t("players.history.page", { page: formatNumber(loaded.coverage.page, locale) })}</span>
            {loaded.coverage.nextPage ? <Link prefetch={false} href={href(loaded.coverage.nextPage)} className={linkClass}>{t("players.history.next")}</Link> : null}
          </nav> : null}
          {loaded.coverage.reachedLimit ? <p className="mt-4 text-xs leading-5 text-zinc-400">{t("players.history.limit")}</p> : null}
        </> : <p role="status" className="mt-4 text-sm leading-6 text-zinc-300">{t("players.history.unavailable")}</p>}
      </section>
      <section className={cardClass} aria-labelledby="match-statistics-heading">
        <h3 id="match-statistics-heading" className="flex items-center gap-3 text-lg font-black text-white">
          <UsersRound aria-hidden="true" size={20} className="shrink-0 text-orange-300" />
          {t("players.matchStatistics")}
        </h3>
        {loaded ? <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-orange-200">{t("players.history.scope")}</p>
          {loaded.entries.length ? <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
            {numbers.map(([label, value]) => <div key={label}>
              <dt className="text-xs leading-5 text-zinc-400">{label}</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums text-white">{value}</dd>
            </div>)}
          </dl> : <p className="mt-4 text-sm leading-6 text-zinc-300">{empty}</p>}
          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-6 text-zinc-400">{t("players.history.rules")}</p>
        </> : <p role="status" className="mt-4 text-sm leading-6 text-zinc-300">{t("players.history.unavailable")}</p>}
      </section>
    </div>
  );
}
