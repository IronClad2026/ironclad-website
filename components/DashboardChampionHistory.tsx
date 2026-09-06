"use client";

import { Trophy } from "lucide-react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
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
    <section aria-label={t("dashboard.champions.title")}>
      {champions.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-6 text-zinc-400">
          {t("dashboard.champions.empty")}
        </p>
      ) : (
        <div className="divide-y divide-white/10">
          {champions.map((champion) => (
            <article key={champion.id} className="flex min-w-0 items-start gap-4 px-4 py-5 sm:px-5">
              <div
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center border border-amber-300/20 bg-black/45 bg-contain bg-center bg-no-repeat text-amber-300 sm:h-16 sm:w-24"
                style={champion.bannerImageUrl ? {
                  backgroundImage: `url(${JSON.stringify(champion.bannerImageUrl)})`,
                } : undefined}
              >
                {!champion.bannerImageUrl && <Trophy size={24} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-300">
                  <Trophy size={13} aria-hidden="true" />
                  {t("dashboard.champions.champion")}
                  <span className="font-normal text-zinc-400">{champion.winnerName}</span>
                </p>
                <h3 className="mt-1 break-words text-base font-bold text-white sm:text-lg">
                  {champion.tournamentName}
                </h3>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-zinc-400">
                  <span>{t("dashboard.champions.bracket", { name: champion.bracketName })}</span>
                  <span>
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
