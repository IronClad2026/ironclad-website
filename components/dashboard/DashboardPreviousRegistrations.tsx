"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DASHBOARD_REGISTRATION_NAVIGATION } from "@/components/dashboard/registration-navigation";

/** Native disclosure keeps all registration anchors mounted and discoverable. */
export default function DashboardPreviousRegistrations({
  children,
  title,
  count,
}: {
  children: ReactNode;
  title: string;
  count: number;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const revealTarget = (hash: string) => {
      let id: string;
      try {
        id = decodeURIComponent(hash);
      } catch {
        return;
      }
      if (!id.startsWith("registration-")) return;
      const target = document.getElementById(id);
      if (!target || !ref.current?.contains(target)) return;
      ref.current.open = true;
      target.scrollIntoView?.({ block: "start" });
    };
    const revealCurrentHash = () => revealTarget(window.location.hash.slice(1));
    const handleContextNavigation = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        revealTarget(event.detail);
      }
    };
    revealCurrentHash();
    window.addEventListener("hashchange", revealCurrentHash);
    window.addEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    return () => {
      window.removeEventListener("hashchange", revealCurrentHash);
      window.removeEventListener(DASHBOARD_REGISTRATION_NAVIGATION, handleContextNavigation);
    };
  }, []);
  return (
    <details ref={ref} className="group border-t border-white/10" data-dashboard-section="previous-registrations">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-zinc-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 [&::-webkit-details-marker]:hidden">
        <span>{title} <span className="ml-2 text-zinc-400">({count})</span></span>
        <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-3 pb-4">{children}</div>
    </details>
  );
}
