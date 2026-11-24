"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import type { Locale } from "@/lib/i18n/config";
import TournamentHistoryArtwork from "./TournamentHistoryArtwork";
import { DASHBOARD_RESULT_REVIEW_EVENT, type DashboardOverviewEventModel } from "./overview-event-presentation";

const actionClassName = "inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-sm bg-orange-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-orange-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-200";

export default function DashboardOverviewEvent({ event, locale }: {
  event: DashboardOverviewEventModel | null;
  locale: Locale;
}) {
  if (!event) return null;
  return (
    <section aria-labelledby="dashboard-event-title" data-dashboard-event={event.kind}
      className="relative isolate overflow-hidden rounded-lg border border-white/10 bg-[#191e1f]">
      {event.bannerImageUrl && <div className="pointer-events-none absolute inset-0 -z-10 opacity-65">
        <TournamentHistoryArtwork bannerImageUrl={event.bannerImageUrl} className="h-full w-full" />
      </div>}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(15,19,20,.97)_0%,rgba(15,19,20,.88)_42%,rgba(15,19,20,.38)_100%)] max-sm:bg-[linear-gradient(90deg,rgba(15,19,20,.94)_0%,rgba(15,19,20,.7)_100%)]" />
      <div className="relative min-h-48 px-5 py-5 sm:px-6">
        <span aria-hidden="true" className="absolute left-0 top-6 h-7 w-1 rounded-r bg-orange-300" />
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-orange-200 sm:text-xs">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-orange-300" />
          {event.eyebrow}
        </p>
        <h2 id="dashboard-event-title" className="mt-2 max-w-2xl break-words text-3xl font-black uppercase leading-[1.05] tracking-tight text-[#f5f2eb] sm:text-4xl">
          {event.title}
        </h2>
        <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-[#f1eee7] sm:text-base">{event.description}</p>
        {event.deadline && <p className="mt-1.5 flex items-start gap-2 text-xs leading-5 text-zinc-300">
          <Clock3 size={13} aria-hidden="true" className="mt-1 shrink-0" />
          <span>{event.deadlineLabel}{" "}<HydrationSafeLocalDateTime value={event.deadline} fallback="See the current action deadline" locale={locale} options={{ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }} /></span>
        </p>}
        <div className="mt-4">
          {event.action.kind === "review" ? <button type="button" className={actionClassName} onClick={() => {
            if (event.action.kind === "review") window.dispatchEvent(new CustomEvent(DASHBOARD_RESULT_REVIEW_EVENT, { detail: { notificationId: event.action.notificationId } }));
          }}>
            <ArrowRight size={16} aria-hidden="true" />{event.action.label}
          </button> : <Link href={event.action.href} className={actionClassName}>
            <ArrowRight size={16} aria-hidden="true" />{event.action.label}
          </Link>}
        </div>
      </div>
    </section>
  );
}
