import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import OperationsRefreshButton from "./OperationsRefreshButton";
import { WhoDisclosure, formatAdminDateTime } from "./OperationsRecords";
import type { AdminOperationsAttentionItem, AdminOperationsMetrics, AdminOperationsRow } from "@/lib/admin-operations-metrics";

const number = new Intl.NumberFormat("en-AU");
const tones = {
  critical: { label: "Critical", style: "border-red-400/30 bg-red-400/5 text-red-200" },
  warning: { label: "Warning", style: "border-amber-400/30 bg-amber-400/5 text-amber-200" },
  info: { label: "Information", style: "border-sky-400/30 bg-sky-400/5 text-sky-200" },
};
const order = { critical: 0, warning: 1, info: 2 };

export default function OperationsLiveOverview({ metrics, navigation }: { metrics: AdminOperationsMetrics; navigation: ReactNode; }) {
  const pending = metrics.registrations.statusGroups.find((point) => point.label === "Pending")?.value ?? 0;
  const review = metrics.registrations.statusGroups.find((point) => point.label === "Manual review")?.value ?? 0;
  const active = metrics.attention.filter((item) => item.count > 0).sort((a, b) => order[a.tone] - order[b.tone]);
  const quiet = metrics.attention.filter((item) => item.count === 0);
  const previews: Record<string, { title: string; dateLabel: string; rows: AdminOperationsRow[]; }> = {
    disputes: { title: "Recent dispute records", dateLabel: "Disputed / created", rows: metrics.matches.who.disputed },
    "admin-review": { title: "Recent Admin review records", dateLabel: "Recorded", rows: metrics.matches.who.underReview },
    "overdue-matches": { title: "Recent overdue Match records", dateLabel: "Deadline", rows: metrics.matches.who.overdue },
    "admin-assistance": { title: "Recent assistance requests", dateLabel: "Requested", rows: metrics.matches.who.adminAssistance },
  };
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Private Admin Area</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Operations &amp; Analytics</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <OperationsRefreshButton generatedAt={metrics.generatedAt} />
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-semibold text-zinc-300 xl:hidden">Command Centre <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          <p className="w-full text-xs text-zinc-400">Snapshot <time dateTime={metrics.generatedAt}>{formatAdminDateTime(metrics.generatedAt)}</time></p>
        </div>
      </header>
      {navigation}
      <section id="operations-overview" aria-labelledby="operations-overview-title" className="scroll-mt-32">
        <h2 id="operations-overview-title" className="mb-3 text-sm font-semibold text-zinc-300">Current operations <span className="font-normal text-zinc-400">· Now</span></h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Summary label="Open operational issues" value={metrics.overview.openIssues.value} href="#attention-required" note="Queue items · may overlap" emphasis />
          <Summary label="Active tournaments" value={metrics.overview.activeTournaments.value} href="/admin/tournaments" />
          <Summary label="Active matches" value={metrics.matches.active} href="#competition-context" />
          <Summary label="Pending registrations" value={pending} href="/admin/registrations?filter=pending" />
          <Summary label="Manual-review registrations" value={review} href="/admin/registrations?filter=manual_review" note="Separate from operational issues" />
        </div>
      </section>
      <section id="attention-required" aria-labelledby="attention-required-title" className="scroll-mt-32">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="attention-required-title" className="text-xl font-bold">Attention Required</h2>
          <span className="text-xs text-zinc-400">Current recorded queues</span>
        </div>
        <div id="match-issues" className="grid scroll-mt-32 items-start gap-2 xl:grid-cols-2">
          {active.length === 0 ? <p className="rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm text-zinc-300">No items in these operational queues. Registration decisions are shown separately above.</p> : active.map((item) => (
            <div key={item.key} className={"rounded-xl border px-3 py-2 " + tones[item.tone].style}>
              <QueueLine item={item} />
              {previews[item.key] ? <WhoDisclosure compact dateLabel={previews[item.key].dateLabel} title={previews[item.key].title} description={item.description + (item.key === "admin-review" ? " Recorded time may use the existing creation or activation fallback." : "")} rows={previews[item.key].rows} emptyMessage="No recent preview rows are available. Open the existing workflow to inspect records." /> : <p className="pb-1 text-xs leading-5 text-zinc-400">{item.description} The linked workflow is broader than this count.</p>}
            </div>
          ))}
        </div>
        <details className="group mt-3 rounded-xl border border-white/10">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-zinc-300">All queues <span className="flex items-center gap-2 text-xs font-normal text-zinc-400">{quiet.length} with no items <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span></summary>
          <div className="divide-y divide-white/10 border-t border-white/10 px-4">{metrics.attention.map((item) => <div key={item.key} className="py-3"><div className="flex justify-between gap-3 text-sm"><span>{item.label}</span><strong className="tabular-nums">{number.format(item.count)}</strong></div><p className="mt-1 text-xs leading-5 text-zinc-400">{item.description}</p></div>)}</div>
        </details>
      </section>
      <section id="competition-context" aria-labelledby="competition-context-title" className="scroll-mt-32 rounded-xl border border-white/10 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="competition-context-title" className="font-bold">Current competition <span className="font-normal text-zinc-400">· Now</span></h2>
          <div className="flex flex-wrap gap-3"><Link href="/admin/tournaments" className="inline-flex min-h-11 items-center text-sm text-orange-300">Open tournaments →</Link><Link href="/admin/registrations" className="inline-flex min-h-11 items-center text-sm text-orange-300">Review registrations →</Link></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {[["Registration open now", metrics.tournaments.registrationOpenNow], ["Playable now", metrics.matches.playable], ["Ready for activation", metrics.matches.readyForActivation], ["Awaiting confirmation", metrics.matches.operationalHealth.awaitingConfirmation]].map(([label, value]) => <div key={label}><dt className="text-xs text-zinc-400">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{number.format(Number(value))}</dd></div>)}
        </dl>
      </section>
    </>
  );
}

function Summary({ label, value, href, note = "Now", emphasis = false }: { label: string; value: number; href: string; note?: string; emphasis?: boolean; }) {
  return <div className={emphasis ? "min-w-0 col-span-2 rounded-xl border border-orange-400/35 bg-orange-400/5 lg:col-span-1" : "min-w-0 rounded-xl border border-white/10 bg-zinc-950"}><Link href={href} className="block h-full rounded-xl p-3 hover:bg-white/5"><span className="block text-xs font-semibold text-zinc-300">{label}</span><strong className="mt-2 block text-2xl font-bold tabular-nums">{number.format(value)}</strong><span className="mt-1 block text-xs leading-4 text-zinc-400">{note}</span></Link></div>;
}

function QueueLine({ item }: { item: AdminOperationsAttentionItem; }) {
  const href = item.href.startsWith("/admin/operations#") ? "/admin/tournaments" : item.href;
  return <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="text-xl tabular-nums">{number.format(item.count)}</strong><h3 className="text-sm font-bold">{item.label}</h3><span className="text-xs">{tones[item.tone].label}</span></div>
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4">{item.key === "expired-waitlist-offers" ? "View waitlisted registrations" : "Open tournament workflow"}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
  </div>;
}
