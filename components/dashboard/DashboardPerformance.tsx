import type { Locale } from "@/lib/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import type { MessageValues } from "@/lib/i18n/types";
import type { PlayerStatistics } from "@/lib/player-dashboard";

export default function DashboardPerformance({
  statistics,
  locale,
  t,
}: {
  statistics: PlayerStatistics;
  locale: Locale;
  t: (path: string, values?: MessageValues) => string;
}) {
  const values = [
    { key: "matchesPlayed", value: formatNumber(statistics.matchesPlayed, locale) },
    { key: "matchesWon", value: formatNumber(statistics.matchesWon, locale) },
    { key: "matchesLost", value: formatNumber(statistics.matchesLost, locale) },
    { key: "winRate", value: formatNumber(statistics.winRate / 100, locale, { style: "percent", maximumFractionDigits: 0 }) },
    { key: "tournamentsParticipated", value: formatNumber(statistics.tournamentsParticipated, locale) },
    { key: "tournamentsWon", value: formatNumber(statistics.tournamentsWon, locale) },
  ];

  return (
    <section id="dashboard-statistics" className="scroll-mt-28 rounded-[0.625rem] border border-[#343a3d] bg-[#1b1f21] p-3.5 sm:p-4" aria-labelledby="dashboard-performance-title" data-dashboard-section="statistics">
      <h2 id="dashboard-performance-title" className="text-base font-bold text-[#f4f0e8]">
        {t("dashboard.statistics.title")}
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-y-3 md:grid-cols-6">
        {values.map(({ key, value }) => (
          <div key={key} className="flex min-w-0 flex-col-reverse justify-end gap-1 border-l border-white/10 px-2 first:border-l-0 max-md:nth-[4]:border-l-0 sm:px-3">
            <dt className="break-words text-xs leading-4 text-zinc-400">{t(`dashboard.statistics.${key}`)}</dt>
            <dd className="text-2xl font-bold tabular-nums text-[#f4f0e8] sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
