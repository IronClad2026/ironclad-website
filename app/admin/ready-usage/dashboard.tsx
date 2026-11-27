import { ChartNoAxesCombined, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DistributionChart, EmptyPanel, MetricBand, TrendChart } from "@/components/admin/operations/OperationsPrimitives";
import {
  isReadyCategoryId, isReadyDestinationType, isReadyQuestionId, READY_CATALOGUE_VERSION, READY_MENU_VERSION,
  readyCategoryLabels, readyQuestionCatalogue, type ReadyDestinationType,
} from "@/lib/ready/catalogue";
import {
  readyUsageVersionKey, type ReadyUsageFilters, type ReadyUsageReport, type ReadyUsageResult,
} from "@/lib/ready/usage-admin";
import PreparedAnswers from "./prepared-answers";

const route = "/admin/ready-usage";
const currentVersion = readyUsageVersionKey({
  menuVersion: READY_MENU_VERSION, catalogueVersion: READY_CATALOGUE_VERSION,
});
const controlClass = "min-h-11 min-w-0 max-w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400";
const fieldClass = controlClass + " border-white/20 bg-zinc-900 text-white";
const destinationLabels: Record<ReadyDestinationType, string> = {
  tournaments: "Tournaments and registration",
  match: "Match and results",
  rules: "Rules",
  profile: "Profile and dashboard",
  notifications: "Notifications",
  rankings: "Rankings",
  admin_assistance: "In-site Admin Assistance",
  discord: "Discord",
  copy_reference: "Copy match reference",
};

function usageLink(filters: ReadyUsageFilters, cohort: ReadyUsageFilters["cohort"]) {
  const query = new URLSearchParams({ period: filters.period, cohort });
  if (filters.version) query.set("version", readyUsageVersionKey(filters.version));
  if (filters.period === "custom") {
    query.set("start", filters.start);
    query.set("end", filters.end);
  }
  return route + "?" + query.toString();
}

function UsageFilters({ filters, report }: { filters: ReadyUsageFilters; report?: ReadyUsageReport }) {
  const selectedVersion = filters.version ? readyUsageVersionKey(filters.version) : "";
  const versions = [...new Set([currentVersion, "2/1", "1/1", ...(report?.versions.map(readyUsageVersionKey) ?? []), selectedVersion])]
    .filter(Boolean);
  return (
    <form action={route} aria-label="Ready usage filters" className="scheme-dark space-y-3 rounded-xl border border-white/10 bg-zinc-950 p-4 sm:p-5">
      <input type="hidden" name="cohort" value={filters.cohort} />
      <div className="grid grid-cols-1 gap-3 min-[370px]:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-zinc-300 min-[370px]:col-span-2 xl:col-span-1">
          Date range
          <select name="period" defaultValue={filters.period} className={fieldClass}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-zinc-300">
          Custom start
          <input type="date" name="start" defaultValue={filters.start} max={filters.today} className={fieldClass} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-zinc-300">
          Custom end
          <input type="date" name="end" defaultValue={filters.end} max={filters.today} className={fieldClass} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-zinc-300">
          Menu / catalogue version
          <select name="version" defaultValue={selectedVersion} className={fieldClass}>
            <option value="">All recorded versions</option>
            {versions.map((version) => (
              <option key={version} value={version}>
                {version}{version === currentVersion ? " (current)" : version === "2/1" ? " (earlier cloud menu)" : version === "1/1" ? " (legacy search era)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={controlClass + " self-end border-orange-500/60 bg-orange-500/15 font-semibold text-orange-200 hover:bg-orange-500/25"}>
          Apply filters
        </button>
      </div>
      <p className="text-xs leading-5 text-zinc-400">
        Dates use Sydney time and include both endpoints. Select Custom range to use the date fields, up to 366 days.
      </p>
      {filters.invalidRange && <p role="status" className="text-sm text-amber-300">The custom dates are invalid. Showing the last 30 days.</p>}
    </form>
  );
}

function UsageMetrics({ totals, showLegacy }: { totals: ReadyUsageReport["totals"]; showLegacy: boolean }) {
  return (
    <MetricBand title="Recorded interactions" metrics={[
      { label: "Accounts", value: totals.engagedAccounts ?? "Unavailable", qualifier: "Each signed-in reviewer account with a recorded interaction counts once in the selected period." },
      { label: "Sessions", value: totals.engagedSessions ?? "Unavailable", qualifier: "A session starts with a recorded Ready interaction. After 30 minutes without one, the next interaction starts a new session." },
      { label: "Openings", value: totals.manualOpenings, qualifier: "A reviewer opened Ready using its header logo. Automatic appearances are excluded." },
      { label: "Answers displayed", value: totals.answerDisplays, qualifier: "The full prepared answer appeared. Whether it was read is unknown." },
      { label: "Action clicks", value: totals.actionClicks, qualifier: "A reviewer chose a destination or tried to copy a match reference. Workflow completion is unknown." },
      ...(showLegacy ? [{ label: "Legacy unmatched searches", value: totals.unmatchedSearches, qualifier: "Unmatched typed searches from menu version 1. Their topics are unknown." }] : []),
      { label: "Fallbacks shown", value: totals.fallbacks, qualifier: "Fully displayed no-result, unavailable or unsupported responses." },
      { label: "Technical errors", value: totals.technicalErrors, qualifier: "Technical failures encountered while retrieving a Ready response." },
    ]} />
  );
}

function AnswerFeedback({ report }: { report: ReadyUsageReport }) {
  const { helpful, stillNeedHelp } = report.totals;
  const votes = helpful + stillNeedHelp;
  const needsHelp = report.questions
    .flatMap(({ id, helpful, stillNeedHelp }) => stillNeedHelp > 0 ? [{
      id, question: isReadyQuestionId(id) ? readyQuestionCatalogue[id].question : "Topic from an earlier catalogue",
      stillNeedHelp, votes: helpful + stillNeedHelp,
    }] : [])
    .sort((a, b) => b.stillNeedHelp - a.stillNeedHelp || b.votes - a.votes);

  return (
    <section aria-labelledby="ready-answer-feedback" className="space-y-3">
      <h2 id="ready-answer-feedback" className="text-xl font-bold">Answer feedback</h2>
      {votes ? (
        <MetricBand title="Optional votes from reviewers" metrics={[
          { label: "Helpful", value: helpful },
          { label: "Still need help", value: stillNeedHelp },
          { label: "Total votes", value: votes, qualifier: "One vote per displayed answer. Many answers receive no vote." },
        ]} />
      ) : (
        <EmptyPanel>No answer votes were recorded for the selected period and menu versions.</EmptyPanel>
      )}
      {needsHelp.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-zinc-950 p-4 sm:p-5" aria-labelledby="ready-needs-help">
          <h3 id="ready-needs-help" className="font-semibold">Answers receiving Still need help</h3>
          <ul className="mt-3 divide-y divide-white/10 text-sm">
            {needsHelp.map(({ id, question, stillNeedHelp, votes }) => (
              <li key={id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                <span>{question}</span><span className="text-zinc-400">{stillNeedHelp} Still need help · {votes} total votes</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function HistoricalFlags({ report, filters }: { report?: ReadyUsageReport; filters: ReadyUsageFilters }) {
  const flags = report?.missingByCategory.flatMap(({ id, count }) =>
    isReadyCategoryId(id) ? [{ label: readyCategoryLabels[id], value: count }]
      : id === "unknown" ? [{ label: "Unknown category", value: count }] : []) ?? [];
  return (
    <section id="ready-historical-flags" aria-labelledby="ready-historical-flags-heading" className="scroll-mt-28 space-y-3">
      <h2 id="ready-historical-flags-heading" className="text-xl font-bold">Historical category-only flags</h2>
      <p className="max-w-3xl text-sm leading-6 text-zinc-400">
        The earlier cloud menu recorded optional flags under the selected category and collected no written descriptions.
        Written suggestions are available in their own tab.
      </p>
      {flags.length > 0 ? (
        <DistributionChart title="Recorded flags by category"
          description={`${report?.totals.missingTopics ?? 0} category-only flags in the selected period. Flags without a known category are grouped together.`}
          points={flags} />
      ) : (
        <EmptyPanel>
          {filters.version && filters.version.menuVersion !== "2"
            ? "Select all versions or the earlier cloud menu (2/1) to review historical flags."
            : report?.coverage.collected ? "No category-only flags were recorded in the selected period."
              : "Category-only figures are unavailable for this selection."}
        </EmptyPanel>
      )}
    </section>
  );
}

function MeasuredActivity({ report, filters }: { report: ReadyUsageReport; filters: ReadyUsageFilters }) {
  const { totals, trend, coverage } = report;
  const hasEvents = Object.values(totals).some((value) => value !== null && value > 0);
  const categories = report.categories
    .flatMap(({ id, count }) => isReadyCategoryId(id) ? [{ label: readyCategoryLabels[id], value: count }] : [])
    .sort((a, b) => b.value - a.value);
  const destinations = report.destinations
    .flatMap(({ id, count }) => isReadyDestinationType(id) ? [{ label: destinationLabels[id], value: count }] : [])
    .sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-4">
      <section aria-labelledby="ready-coverage-title" className="rounded-xl border border-orange-400/15 bg-orange-500/[0.045] p-4 text-sm leading-6 text-zinc-300 sm:p-5">
        <h2 id="ready-coverage-title" className="font-semibold text-orange-200">Usage overview</h2>
        <p>Reporting period {filters.start} to {filters.end}, Sydney time. The current day may be incomplete.</p>
        <p>
          {filters.version ? <>Selected menu / catalogue version {readyUsageVersionKey(filters.version)}.</>
            : <>All menu / catalogue versions. Recorded in this selection {report.versions.length ? report.versions.map(readyUsageVersionKey).join(", ") : "—"}.</>}
        </p>
        <p>Activity comes from designated Staging reviewers who opted in. All-player adoption is unavailable.</p>
        {filters.start < filters.retainedFrom && <p>Dates before {filters.retainedFrom} are outside retention and unavailable.</p>}
        <p>
          {coverage.availableFrom
            ? <>Earliest retained activity {coverage.availableFrom}. Exact account and session counts require retained detail from {coverage.retainedDetailFrom} onward.</>
            : "The first date with retained activity is unavailable."}
        </p>
        <p>Detailed events are kept for up to 90 days. Older daily totals may be available for up to 12 months where at least five accounts contributed. Figures cover recorded events only, so gaps can reflect low coverage or missing data.</p>
      </section>
      {(!coverage.collected || !hasEvents) && (
        <EmptyPanel>No measured test activity for these dates and versions. Activity may be outside coverage, below the retention threshold, or from a reviewer who declined collection.</EmptyPanel>
      )}
      {coverage.collected && hasEvents && (
        <>
          <UsageMetrics totals={totals} showLegacy={!filters.version || filters.version.menuVersion === "1"} />
          <TrendChart id="ready-usage-trend" title="Daily Ready activity" timeZoneLabel="Sydney"
            description="Recorded manual openings, prepared answers displayed and destination clicks by Sydney calendar date."
            series={[
              { label: "Manual openings", color: "#fb923c", points: trend.map(({ date, manualOpenings }) => ({ date, label: date, value: manualOpenings })) },
              { label: "Answer displays", color: "#38bdf8", points: trend.map(({ date, answerDisplays }) => ({ date, label: date, value: answerDisplays })) },
              { label: "Action clicks", color: "#34d399", points: trend.map(({ date, actionClicks }) => ({ date, label: date, value: actionClicks })) },
            ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionChart title="Most-used categories"
              description="Recorded selections of each category cloud by participating reviewers."
              points={categories} />
            <DistributionChart title="Most-used destinations"
              description="Recorded destination and copy actions. The resulting workflows are outside the report."
              points={destinations} />
          </div>
          <AnswerFeedback report={report} />
        </>
      )}
    </div>
  );
}

export function ReadyUsageFrame({ view, children }: { view: "activity" | "suggestions"; children: ReactNode }) {
  return (
    <main lang="en" className="relative z-10 min-h-screen min-w-0 bg-black px-4 pb-16 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/admin" prefetch={false} className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-semibold text-zinc-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-orange-400">
            <ChevronLeft aria-hidden="true" className="size-4" /> Admin overview
          </Link>
          <h1 className="flex items-center gap-3 text-3xl font-black leading-tight sm:text-4xl">
            <ChartNoAxesCombined aria-hidden="true" className="size-8 shrink-0 text-orange-300" /> Ready usage
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Review Ready’s prepared answers, optional Staging usage and written suggestions.</p>
        </header>

        <nav aria-label="Ready report sections" className="flex flex-wrap gap-2">
          {([["activity", "Activity and feedback", route], ["suggestions", "Missing-topic suggestions", route + "?view=suggestions"]] as const).map(([id, label, href]) => (
            <Link key={id} href={href} prefetch={false} aria-current={view === id ? "page" : undefined}
              className={fieldClass + " inline-flex items-center aria-[current=page]:border-orange-400/60 aria-[current=page]:bg-orange-500/10 aria-[current=page]:text-orange-200"}>
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </main>
  );
}

export default function ReadyUsageDashboard({ result }: { result: Exclude<ReadyUsageResult, { status: "unauthorized" }> }) {
  const { filters } = result;
  const report = result.status === "ready" ? result.report : undefined;
  return (
    <>
      {result.status === "not-collected" ? (
        <>
          <EmptyPanel>Usage figures are unavailable for this view. Only designated Staging reviewers who opt in can contribute usage during the trial.</EmptyPanel>
          {filters.cohort === "player" && (
            <Link href={usageLink(filters, "reviewer")} prefetch={false} className={fieldClass + " inline-flex items-center"}>
              View reviewer activity
            </Link>
          )}
        </>
      ) : (
        <>
          <UsageFilters filters={filters} report={report} />
          {report && <MeasuredActivity report={report} filters={filters} />}
          {result.status === "outside-retention" && <EmptyPanel>The selected dates are outside retention. Daily data can be available from {filters.retainedFrom} onward.</EmptyPanel>}
          {result.status === "unavailable" && <EmptyPanel>Usage data is temporarily unavailable. Try reloading the report.</EmptyPanel>}
        </>
      )}
      <PreparedAnswers report={report} currentVersionSelected={!filters.version || filters.version.catalogueVersion === READY_CATALOGUE_VERSION} />
      <HistoricalFlags filters={filters} report={report} />
    </>
  );
}
