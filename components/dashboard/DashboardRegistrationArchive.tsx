"use client";

import { Archive, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DASHBOARD_REGISTRATION_NAVIGATION } from "@/components/dashboard/registration-navigation";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import { formatNumber } from "@/lib/i18n/format";

export default function DashboardRegistrationArchive({
  children,
  count,
  loadError = null,
}: {
  children: ReactNode;
  count: number;
  loadError?: string | null;
}) {
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);
  const locale = useOptionalLocale();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const recordsRef = useRef<HTMLDivElement>(null);
  const pendingRegistrationScroll = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const target = pendingRegistrationScroll.current;
    if (!expanded || !target) return;
    pendingRegistrationScroll.current = null;
    target.scrollIntoView({ block: "start" });
  }, [expanded]);

  useEffect(() => {
    const revealRegistration = (hash: string) => {
      let targetId: string;
      try {
        targetId = decodeURIComponent(hash);
      } catch {
        return;
      }
      if (!targetId.startsWith("registration-")) return;
      const target = document.getElementById(targetId);
      if (!target || !recordsRef.current?.contains(target)) return;
      if (recordsRef.current.hidden) {
        // Preserve the visibility-commit guarantee from the Career tab reveal.
        pendingRegistrationScroll.current = target;
        setExpanded(true);
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
    const timer = window.setTimeout(revealCurrentHash, 0);
    window.addEventListener("hashchange", revealCurrentHash);
    window.addEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    return () => {
      window.clearTimeout(timer);
      pendingRegistrationScroll.current = null;
      window.removeEventListener("hashchange", revealCurrentHash);
      window.removeEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    };
  }, [children]);

  return (
    <section className="mt-4 min-w-0 border-y border-white/10 bg-zinc-950/50" aria-labelledby={`${id}-title`} data-dashboard-section="registration-archive">
      <h2 id={`${id}-title`}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${id}-records`}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm text-zinc-400 transition-colors hover:bg-white/[0.025] hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:px-5"
        >
          <Archive size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 basis-40 font-semibold [overflow-wrap:anywhere]">
            {t("dashboard.registrationArchive.title")}
            {!loadError && <>{" "}<span className="ml-2 font-normal tabular-nums">{formatNumber(count, locale)}</span></>}
          </span>
          <span className="text-xs">{t(expanded ? "dashboard.registrationArchive.hide" : "dashboard.registrationArchive.show")}</span>
          <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <div ref={recordsRef} id={`${id}-records`} hidden={!expanded} className="border-t border-white/10">
        {loadError ? (
          <p role="alert" className="px-4 py-4 text-sm leading-6 text-red-300 sm:px-5">{loadError}</p>
        ) : count > 0 ? children : (
          <p className="px-4 py-4 text-sm leading-6 text-zinc-400 sm:px-5">{t("dashboard.registrationArchive.empty")}</p>
        )}
      </div>
    </section>
  );
}
