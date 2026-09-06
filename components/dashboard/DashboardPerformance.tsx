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
    <section className="mt-8" aria-labelledby="dashboard-performance-title" data-dashboard-section="statistics">
      <h2 id="dashboard-performance-title" className="text-xl font-bold text-white sm:text-2xl">
        {t("dashboard.statistics.title")}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-white/12 bg-white/10 sm:grid-cols-3 xl:grid-cols-6">
        {values.map(({ key, value }) => (
          <div key={key} className="flex min-w-0 flex-col-reverse justify-end gap-2 bg-zinc-950 px-4 py-5 sm:px-5">
            <dt className="text-xs leading-5 text-zinc-400">{t(`dashboard.statistics.${key}`)}</dt>
            <dd className={`text-2xl font-bold tabular-nums sm:text-3xl ${key === "winRate" || key === "tournamentsWon" ? "text-orange-300" : "text-white"}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
