"use client";

import { CalendarDays, ChevronDown, Trophy } from "lucide-react";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import TournamentHistoryArtwork from "@/components/dashboard/TournamentHistoryArtwork";
import type { TournamentCareerGroup } from "@/components/dashboard/career-presentation";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import { formatNumber } from "@/lib/i18n/format";

export default function DashboardTournamentHistory({ groups }: { groups: TournamentCareerGroup[] }) {
  const locale = useOptionalLocale();
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);

  return (
    <section aria-label={t("dashboard.tournamentHistory.title")}>
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-6 text-zinc-400 sm:px-5">
          {t("dashboard.tournamentHistory.empty")}
        </p>
      ) : (
        <div className="space-y-3 p-3 sm:p-4">
          {groups.map((group, index) => (
            <details
              key={group.key}
              open={index === 0}
              className="group/tournament min-w-0 border border-white/10 bg-black/20 open:border-white/15"
              data-tournament-career-group={group.key}
            >
              <summary className="grid min-h-11 min-w-0 cursor-pointer list-none transition-colors hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:grid-cols-[12rem_minmax(0,1fr)] [&::-webkit-details-marker]:hidden">
                <TournamentHistoryArtwork bannerImageUrl={group.bannerImageUrl} className="h-24 w-full sm:h-full sm:min-h-36" />
                <span className="flex min-w-0 flex-col gap-3 px-4 py-3.5 sm:px-5">
                  <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-5 gap-y-3">
                    <span className="min-w-0 flex-1 basis-44">
                      <span className="block break-words text-base font-bold leading-6 text-white sm:text-lg">{group.tournamentName}</span>
                      <span className="mt-1 block break-words text-sm leading-5 text-zinc-400">{group.bracketName}</span>
                    </span>
                    <span className="min-w-0 shrink-0 text-right">
                      <span className="block text-xs leading-5 text-zinc-400">{t("dashboard.tournamentHistory.record")}</span>
                      <span className="block text-xl font-semibold tabular-nums leading-7 text-zinc-100">
                        <span className="sr-only">{t("dashboard.tournamentHistory.wins")}: {formatNumber(group.wins, locale)}; {t("dashboard.tournamentHistory.losses")}: {formatNumber(group.losses, locale)}</span>
                        <span aria-hidden="true">{t("dashboard.tournamentHistory.recordValue", { wins: formatNumber(group.wins, locale), losses: formatNumber(group.losses, locale) })}</span>
                      </span>
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-5">
                    {group.champion ? (
                      <span className="inline-flex max-w-full items-center gap-1.5 border border-amber-300/25 bg-amber-300/[0.06] px-2 py-0.5 text-amber-200">
                        <Trophy size={13} aria-hidden="true" className="shrink-0" />
                        <span className="min-w-0 break-words">{t("dashboard.champions.champion")}</span>
                      </span>
                    ) : null}
                    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-zinc-400">
                      <CalendarDays size={13} aria-hidden="true" className="shrink-0" />
                      {group.firstPlayedAt.slice(0, 10) !== group.lastPlayedAt.slice(0, 10) ? <>
                        <HydrationSafeLocalDateTime value={group.firstPlayedAt} fallback={t("dashboard.notAvailable")} options={{ dateStyle: "medium" }} />
                        <span aria-hidden="true">–</span>
                      </> : null}
                      <HydrationSafeLocalDateTime value={group.lastPlayedAt} fallback={t("dashboard.notAvailable")} options={{ dateStyle: "medium" }} />
                    </span>
                    <span className="ml-auto inline-flex min-w-0 items-center gap-2 text-orange-200">
                      <span className="group-open/tournament:hidden">{t("dashboard.tournamentHistory.showMatches")}</span>
                      <span className="hidden group-open/tournament:inline">{t("dashboard.tournamentHistory.hideMatches")}</span>
                      <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open/tournament:rotate-180" />
                    </span>
                  </span>
                </span>
              </summary>
              <div className="border-t border-white/10">
                <DashboardMatchHistory matches={group.matches} variant="grouped" />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
