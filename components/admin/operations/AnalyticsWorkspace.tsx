"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AdminOperationsPeriodRange } from "@/lib/admin-operations-metrics";

const domains = [
  ["players", "Players"], ["registrations", "Registrations"],
  ["tournaments", "Tournaments"], ["matches", "Matches"], ["website-traffic", "Traffic"],
] as const;
type Domain = (typeof domains)[number][0];
const periods = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All time"]] as const;
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}
function getHash() { return window.location.hash.slice(1); }
function domainFor(id: string): Domain | undefined {
  if (id === "who-left" || id === "division-participation") return "players";
  if (id === "platform-health") return "tournaments";
  return domains.find(([key]) => key === id)?.[0];
}
export default function AnalyticsWorkspace({ period, panels }: { period: AdminOperationsPeriodRange; panels: Record<Domain, ReactNode>; }) {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const [lastSelected, setLastSelected] = useState<Domain>("players");
  const selected = hash ? domainFor(hash) ?? lastSelected : "players";
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!domainFor(hash)) return;
    const target = document.getElementById(domains.some(([key]) => key === hash) ? "analytics" : hash);
    if (!target) return;
    for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    target.scrollIntoView({ block: "start" });
  }, [hash, selected]);
  function activate(domain: Domain) {
    setLastSelected(domain);
    window.history.pushState(null, "", "#" + domain);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  return (
    <section id="analytics" aria-labelledby="analytics-title" className="min-w-0 space-y-4 border-t border-white/15 pt-6">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Explore the records</p><h2 id="analytics-title" className="mt-1 text-xl font-bold">Analytics</h2></div>
      <div role="tablist" aria-label="Analytics domains" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-zinc-950 p-1 sm:grid-cols-5">
        {domains.map(([key, label], index) => <button key={key} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={"tab-" + key} aria-controls={"panel-" + key} aria-selected={selected === key} tabIndex={selected === key ? 0 : -1} onClick={() => activate(key)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % domains.length : event.key === "ArrowLeft" ? (index + domains.length - 1) % domains.length : event.key === "Home" ? 0 : event.key === "End" ? domains.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); activate(domains[next][0]); tabs.current[next]?.focus();
        }} className={"min-h-11 rounded-lg px-3 text-sm font-semibold " + (selected === key ? "bg-orange-500/15 text-orange-200 ring-1 ring-inset ring-orange-400/40" : "text-zinc-400 hover:bg-white/5 hover:text-white")}>{label}</button>)}
      </div>
      {selected === "website-traffic" ? <p className="text-sm text-zinc-400">Traffic has fixed UTC windows: Today, 7 days and 30 days. The Operations activity period does not apply.</p> : <section aria-label="Dashboard period" className="rounded-xl border border-white/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Activity period · {period.label}</h3><p className="mt-1 text-xs text-zinc-400">UTC activity period. Current-state values are unaffected.</p></div>
          <nav aria-label="Choose dashboard period" className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto">{periods.map(([key, label]) => <Link key={key} href={"/admin/operations?period=" + key + "#" + selected} scroll={false} aria-current={period.key === key ? "page" : undefined} className={"inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm " + (period.key === key ? "border-orange-400/60 text-orange-200" : "border-white/10 text-zinc-300")}>{label}</Link>)}</nav>
        </div>
        <details className="mt-2 text-xs text-zinc-400"><summary className="min-h-11 cursor-pointer content-center">Period and comparison details</summary><p className="pb-2 leading-5">Activity uses the existing UTC window through the snapshot time, including a partial current day. Comparisons use the preceding equal-duration window, not necessarily yesterday. All time has no previous comparison. Now values are current recorded state, not live monitoring.</p></details>
      </section>}
      {domains.map(([key]) => <div key={key} role="tabpanel" id={"panel-" + key} aria-labelledby={"tab-" + key} hidden={selected !== key} tabIndex={0} className="min-w-0">{panels[key]}</div>)}
    </section>
  );
}
