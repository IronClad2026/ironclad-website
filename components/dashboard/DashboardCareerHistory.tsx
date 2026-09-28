"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import DashboardChampionHistory from "@/components/DashboardChampionHistory";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import type { ChampionAchievement, MatchHistoryEntry } from "@/lib/player-dashboard";
import { DASHBOARD_REGISTRATION_NAVIGATION } from "@/components/dashboard/registration-navigation";

type CareerView = "matches" | "champions" | "registrations";

export default function DashboardCareerHistory({
  matches,
  champions,
  previousRegistrations,
  previousRegistrationCount = 0,
  loadError = null,
  registrationLoadError = null,
}: {
  matches: MatchHistoryEntry[];
  champions: ChampionAchievement[];
  previousRegistrations?: ReactNode;
  previousRegistrationCount?: number;
  loadError?: string | null;
  registrationLoadError?: string | null;
}) {
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);
  const id = useId();
  const [view, setView] = useState<CareerView>("matches");
  const registrationsRef = useRef<HTMLDivElement>(null);
  const pendingRegistrationScroll = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const views: CareerView[] = ["matches", "champions", "registrations"];
  const counts = { matches: matches.length, champions: champions.length, registrations: previousRegistrationCount };

  useLayoutEffect(() => {
    const target = pendingRegistrationScroll.current;
    if (view !== "registrations" || !target) return;
    pendingRegistrationScroll.current = null;
    target.scrollIntoView({ block: "start" });
  }, [view]);

  useEffect(() => {
    const revealRegistration = (hash: string) => {
      if (!hash.startsWith("registration-")) return;
      const target = document.getElementById(hash);
      if (!target || !registrationsRef.current?.contains(target)) return;
      if (registrationsRef.current.hidden) {
        // React must commit the visible panel before its record can be scrolled.
        pendingRegistrationScroll.current = target;
        setView("registrations");
      } else {
        target.scrollIntoView({ block: "start" });
      }
    };
    const revealCurrentHash = () => revealRegistration(window.location.hash.slice(1));
    const handleContextNavigation = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        revealRegistration(event.detail);
      }
    };
    // Defer until the mounted server-rendered registration slots are available.
    const timer = window.setTimeout(revealCurrentHash, 0);
    window.addEventListener("hashchange", revealCurrentHash);
    window.addEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    return () => {
      window.clearTimeout(timer);
      pendingRegistrationScroll.current = null;
      window.removeEventListener("hashchange", revealCurrentHash);
      window.removeEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    };
  }, [previousRegistrations]);

  return (
    <section className="mt-8 min-w-0" aria-labelledby={`${id}-title`} data-dashboard-section="history">
      <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-white sm:text-2xl">{t("dashboard.career.title")}</h2>
      <div className="mt-3 border border-white/12 bg-zinc-950/85">
        <div
          role="tablist"
          aria-label={t("dashboard.career.title")}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] border-b border-white/10 bg-white/[0.025] sm:flex"
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
              className={`grid min-h-11 min-w-0 grid-rows-[1fr_auto] items-center justify-items-center gap-1.5 border-b-2 px-2 py-2.5 text-sm font-semibold leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:flex sm:justify-center sm:gap-2 sm:px-5 ${view === item ? "border-orange-400 bg-orange-400/[0.07] text-orange-200" : "border-transparent text-zinc-400 hover:bg-white/[0.035] hover:text-white"}`}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(`dashboard.career.${item}`)}</span>
              {!(item === "registrations" ? registrationLoadError : loadError) && (
                <span className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center px-1.5 text-xs font-medium tabular-nums ${view === item ? "bg-orange-400/10 text-orange-200" : "bg-white/5 text-zinc-400"}`}>{counts[item]}</span>
              )}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-matches-panel`} aria-labelledby={`${id}-matches-tab`} hidden={view !== "matches"} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          {loadError ? <p role="alert" className="p-4 text-sm leading-6 text-red-300">{loadError}</p> : <DashboardMatchHistory matches={matches} />}
        </div>
        <div role="tabpanel" id={`${id}-champions-panel`} aria-labelledby={`${id}-champions-tab`} hidden={view !== "champions"} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          {loadError ? <p role="alert" className="p-4 text-sm leading-6 text-red-300">{loadError}</p> : <DashboardChampionHistory champions={champions} />}
        </div>
        <div ref={registrationsRef} role="tabpanel" id={`${id}-registrations-panel`} aria-labelledby={`${id}-registrations-tab`} hidden={view !== "registrations"} tabIndex={0} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          {registrationLoadError ? (
            <p role="alert" className="px-4 py-4 text-sm leading-6 text-red-300 sm:px-5">{registrationLoadError}</p>
          ) : previousRegistrationCount > 0 ? previousRegistrations : (
            <p className="px-4 py-6 text-sm leading-6 text-zinc-400 sm:px-5">{t("dashboard.career.registrationsEmpty")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
