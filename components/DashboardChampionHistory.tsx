"use client";

import { Trophy } from "lucide-react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import TournamentHistoryArtwork from "@/components/dashboard/TournamentHistoryArtwork";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { ChampionAchievement } from "@/lib/player-dashboard";

export default function DashboardChampionHistory({
  champions,
}: {
  champions: ChampionAchievement[];
}) {
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);

  return (
    <section aria-label={t("dashboard.career.championships")}>
      {champions.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-6 text-zinc-400">
          {t("dashboard.champions.empty")}
        </p>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
          {champions.map((champion) => (
            <article key={champion.id} className="min-w-0 overflow-hidden border border-white/10 border-t-amber-300/50 bg-black/25" data-career-championship={champion.id}>
              <TournamentHistoryArtwork bannerImageUrl={champion.bannerImageUrl} tone="amber" className="h-28 w-full sm:h-32" />
              <div className="min-w-0 px-4 py-3.5">
                <p className="flex items-start gap-2 text-xs font-semibold leading-5 text-amber-200">
                  <Trophy size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {t("dashboard.champions.champion")}
                </p>
                <h3 className="mt-2 break-words text-base font-bold leading-6 text-white">
                  {champion.tournamentName}
                </h3>
                <p className="mt-1 break-words text-sm leading-5 text-zinc-300">{t("dashboard.champions.bracket", { name: champion.bracketName })}</p>
                <p className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-amber-300/10 pt-2.5 text-xs leading-5 text-zinc-400">
                  <span className="min-w-0 break-words">{champion.winnerName}</span>
                  <span className="min-w-0">
                    {t("dashboard.champions.won")}{" "}
                    <HydrationSafeLocalDateTime value={champion.wonAt} fallback={t("dashboard.notAvailable")} options={{ dateStyle: "medium" }} />
                  </span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
