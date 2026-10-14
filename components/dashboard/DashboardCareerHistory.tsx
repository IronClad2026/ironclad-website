"use client";

import { useId, useRef, useState } from "react";
import DashboardChampionHistory from "@/components/DashboardChampionHistory";
import DashboardTournamentHistory from "@/components/dashboard/DashboardTournamentHistory";
import { groupCareerTournaments } from "@/components/dashboard/career-presentation";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { ChampionAchievement, MatchHistoryEntry } from "@/lib/player-dashboard";
import { formatNumber } from "@/lib/i18n/format";

type CareerView = "tournaments" | "championships";
const views: CareerView[] = ["tournaments", "championships"];

export default function DashboardCareerHistory({
  matches,
  champions,
  loadError = null,
}: {
  matches: MatchHistoryEntry[];
  champions: ChampionAchievement[];
  loadError?: string | null;
}) {
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);
  const locale = useOptionalLocale();
  const id = useId();
  const [view, setView] = useState<CareerView>("tournaments");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const groups = groupCareerTournaments(matches, champions);
  const counts = { tournaments: groups.length, championships: champions.length };

  return (
    <section className="mt-8 min-w-0" aria-labelledby={`${id}-title`} data-dashboard-section="history">
      <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-white sm:text-2xl">{t("dashboard.career.title")}</h2>
      <div className="mt-3 border border-white/12 bg-zinc-950/85">
        <div
          role="tablist"
          aria-label={t("dashboard.career.title")}
          className="grid grid-cols-2 border-b border-white/10 bg-white/[0.025] sm:flex"
        >
          {views.map((item, index) => (
            <button
              key={item}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              id={`${id}-${item}-tab`}
              aria-controls={`${id}-${item}-panel`}
              aria-selected={view === item}
              tabIndex={view === item ? 0 : -1}
              onClick={() => setView(item)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % views.length
                  : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length
                    : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                setView(views[next]);
                tabRefs.current[next]?.focus();
              }}
              className={`flex min-h-12 min-w-0 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:px-5 ${view === item ? "border-orange-400 bg-orange-400/[0.07] text-orange-200" : "border-transparent text-zinc-400 hover:bg-white/[0.035] hover:text-white"}`}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(`dashboard.career.${item}`)}</span>
              {!loadError && (
                <span className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center px-1.5 text-xs font-medium tabular-nums ${view === item ? "bg-orange-400/10 text-orange-200" : "bg-white/5 text-zinc-400"}`}>{formatNumber(counts[item], locale)}</span>
              )}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-tournaments-panel`} aria-labelledby={`${id}-tournaments-tab`} hidden={view !== "tournaments"} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          {loadError ? <p role="alert" className="p-4 text-sm leading-6 text-red-300">{loadError}</p> : <DashboardTournamentHistory groups={groups} />}
        </div>
        <div role="tabpanel" id={`${id}-championships-panel`} aria-labelledby={`${id}-championships-tab`} hidden={view !== "championships"} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          {loadError ? <p role="alert" className="p-4 text-sm leading-6 text-red-300">{loadError}</p> : <DashboardChampionHistory champions={champions} />}
        </div>
      </div>
    </section>
  );
}
