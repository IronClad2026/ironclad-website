import {
  AppWindow,
  BarChart3,
  Globe2,
  Laptop,
  MapPin,
  MonitorSmartphone,
  Route,
  type LucideIcon,
} from "lucide-react";

import { TrendChart } from "./OperationsPrimitives";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";

const numberFormatter = new Intl.NumberFormat("en-AU");
const utcDateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

const publicRouteLabels = new Set([
  "/",
  "/about",
  "/rankings",
  "/rules",
  "/terms",
  "/privacy",
  "/players",
  "/tournaments",
  "/players/[playerId]",
]);

type AvailableWebsiteTrafficAnalytics = Extract<
  WebsiteTrafficAnalytics,
  { status: "available" }
>;

type BreakdownKind = keyof AvailableWebsiteTrafficAnalytics["breakdowns"];

type WebsiteTrafficBreakdownPoint =
  AvailableWebsiteTrafficAnalytics["breakdowns"]["routes"][number];

type UnavailableReason = Extract<
  WebsiteTrafficAnalytics,
  { status: "unavailable" }
>["reason"];

const unavailableCopy: Record<
  UnavailableReason,
  { label: string; description: string }
> = {
  "non-production": {
    label: "Preview / non-Production",
    description:
      "Website traffic analytics is intentionally unavailable outside Production. Collection and Production credentials remain disabled here.",
  },
  "missing-configuration": {
    label: "Production configuration unavailable",
    description:
      "The required server-only Website Traffic configuration is not available. Operational Admin metrics remain unaffected.",
  },
  "plan-restriction": {
    label: "Current plan / API unavailable",
    description:
      "Vercel did not make the aggregate traffic API available under the current plan. No paid upgrade has been attempted.",
  },
  "rate-limited": {
    label: "Temporarily rate limited",
    description:
      "Vercel is temporarily limiting traffic-report requests. Use the existing manual Refresh control later; operational metrics remain available.",
  },
  "provider-unavailable": {
    label: "Provider unavailable",
    description:
      "Vercel traffic reporting could not be read safely. No zero values are being inferred, and operational metrics remain available.",
  },
};

const breakdowns: Array<{
  key: BreakdownKind;
  title: string;
  emptyLabel: string;
  icon: LucideIcon;
}> = [
  {
    key: "routes",
    title: "Top Public Routes",
    emptyLabel: "No approved public routes were reported.",
    icon: Route,
  },
  {
    key: "countries",
    title: "Countries",
    emptyLabel: "No country breakdown is available.",
    icon: MapPin,
  },
  {
    key: "referrers",
    title: "Referrer Hostnames",
    emptyLabel: "No referrer hostnames were reported.",
    icon: Globe2,
  },
  {
    key: "devices",
    title: "Device Types",
    emptyLabel: "No device breakdown is available.",
    icon: MonitorSmartphone,
  },
  {
    key: "browsers",
    title: "Browsers",
    emptyLabel: "No browser breakdown is available.",
    icon: AppWindow,
  },
  {
    key: "operatingSystems",
    title: "Operating Systems",
    emptyLabel: "No operating-system breakdown is available.",
    icon: Laptop,
  },
];

export default function WebsiteTrafficSection({
  analytics,
}: {
  analytics: WebsiteTrafficAnalytics;
}) {
  return (
    <section
      id="website-traffic"
      aria-labelledby="website-traffic-title"
      className="scroll-mt-28 rounded-xl border border-white/10 bg-zinc-950/50 p-4 sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
          <BarChart3 aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">
            Website Traffic
          </p>
          <h2
            id="website-traffic-title"
            className="mt-1 break-words text-xl font-bold tracking-tight text-white sm:text-2xl"
          >
            Public-site reach
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Optional, consent-based traffic measurements from approved public
            routes only. Private and authenticated routes are excluded.
          </p>
        </div>
      </div>

      {analytics.status === "available" ? (
        <AvailableTraffic analytics={analytics} />
      ) : (
        <UnavailableTraffic reason={analytics.reason} />
      )}
    </section>
  );
}

function AvailableTraffic({
  analytics,
}: {
  analytics: AvailableWebsiteTrafficAnalytics;
}) {
  const hasReportedTraffic = [
    analytics.summary.today,
    analytics.summary.sevenDays,
    analytics.summary.thirtyDays,
  ].some((period) => period.visitors > 0 || period.pageViews > 0);

  return (
    <div className="mt-6 min-w-0 space-y-6">
      <p className="text-xs leading-5 text-zinc-400">
        Summary values use their labelled UTC windows. The trend and breakdowns
        cover the latest 30-day UTC reporting window.
      </p>
      <table className="w-full table-fixed text-left text-sm tabular-nums">
        <caption className="sr-only">Website traffic summary · fixed UTC windows</caption>
        <thead><tr className="text-xs text-zinc-400"><th scope="col" className="w-[34%] py-3">Measure</th>{["Today", "7 days", "30 days"].map((label) => <th scope="col" key={label} className="px-1 py-3 text-right">{label}<span className="block font-normal">UTC</span></th>)}</tr></thead>
        <tbody>{[["Vercel Visitors", "visitors"], ["Page Views", "pageViews"]].map(([label, key]) => <tr key={key} className="border-t border-white/10"><th scope="row" className="py-4 font-semibold text-zinc-300">{label}</th>{[analytics.summary.today, analytics.summary.sevenDays, analytics.summary.thirtyDays].map((period, index) => <td key={index} className="break-words px-1 py-4 text-right text-lg font-bold sm:text-2xl">{numberFormatter.format(period[key as "visitors" | "pageViews"])}</td>)}</tr>)}</tbody>
      </table>

      {!hasReportedTraffic ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-400">
          The provider returned a successful report with no recorded public-site
          traffic in these UTC windows. These are genuine reported zeros, not
          an unavailable-state substitute.
        </div>
      ) : null}

      <TrafficTrend points={analytics.trend} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {breakdowns.filter((item) => item.key === "routes" || item.key === "referrers").map((item) => <BreakdownCard key={item.key} kind={item.key} title={item.title} emptyLabel={item.emptyLabel} icon={item.icon} points={analytics.breakdowns[item.key]} />)}
      </div>
      <details className="rounded-xl border border-white/10 p-4"><summary className="min-h-11 cursor-pointer content-center font-semibold">Audience breakdowns</summary>
        <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">{breakdowns.filter((item) => item.key !== "routes" && item.key !== "referrers").map((item) => <BreakdownCard key={item.key} kind={item.key} title={item.title} emptyLabel={item.emptyLabel} icon={item.icon} points={analytics.breakdowns[item.key]} />)}</div>
      </details>
      <p className="text-xs leading-5 text-zinc-400">Consent-based measurements may undercount traffic. Multi-day Vercel Visitors are not globally unique people. Data fetched <time dateTime={analytics.generatedAt}>{formatUtcDateTime(analytics.generatedAt)}</time>.</p>
      <details className="border-t border-white/10 text-sm text-zinc-400"><summary className="min-h-11 cursor-pointer content-center font-semibold text-zinc-300">Measurement context</summary><p className="pb-3 leading-6">Vercel Visitors is an anonymous, request-derived daily measure. Its visitor hash resets daily, so totals across multiple days are not globally unique people. Declined consent, browser or content blockers, and free-tier collection pauses may undercount traffic. Windows and daily groupings use UTC.</p></details>
    </div>
  );
}

function UnavailableTraffic({ reason }: { reason: UnavailableReason }) {
  const copy = unavailableCopy[reason];

  return (
    <div
      role="status"
      className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] p-4 sm:p-5"
    >
      <p className="font-black text-amber-100">
        Website traffic analytics unavailable
      </p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-amber-300/80">
        {copy.label}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/70">
        {copy.description}
      </p>
    </div>
  );
}

function TrafficTrend({ points }: { points: AvailableWebsiteTrafficAnalytics["trend"] }) {
  return <TrendChart id="website-traffic-trend" title="Daily public-site traffic" tableCaption="Daily public-site traffic in UTC" description="Vercel Visitors and Page Views grouped by UTC day." emptyMessage="No daily trend history is available for this UTC reporting window." series={[
    { label: "Vercel Visitors", color: "#fb923c", points: points.map((point) => ({ date: point.date, label: point.date, value: point.visitors })) },
    { label: "Page Views", color: "#38bdf8", points: points.map((point) => ({ date: point.date, label: point.date, value: point.pageViews })) },
  ]} />;
}

function BreakdownCard({
  kind,
  title,
  emptyLabel,
  icon: Icon,
  points,
}: {
  kind: BreakdownKind;
  title: string;
  emptyLabel: string;
  icon: LucideIcon;
  points: WebsiteTrafficBreakdownPoint[];
}) {
  return (
    <article className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-300" />
        <h3 className="min-w-0 break-words font-black text-white">{title}</h3>
      </div>

      {points.length > 0 ? (
        <ol aria-label={title} className="mt-4 space-y-2">
          {points.map((point, index) => (
            <li
              key={`${point.label}-${index}`}
              className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-white/[0.08] bg-zinc-950/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <span
                className={`min-w-0 text-sm font-bold text-zinc-300 ${
                  kind === "routes" || kind === "referrers"
                    ? "break-all"
                    : "break-words"
                }`}
              >
                {safeBreakdownLabel(kind, point.label)}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-zinc-400 sm:justify-end">
                <span>
                  <strong className="font-black text-zinc-200">
                    {numberFormatter.format(point.visitors)}
                  </strong>{" "}
                  visitors
                </span>
                <span>
                  <strong className="font-black text-zinc-200">
                    {numberFormatter.format(point.pageViews)}
                  </strong>{" "}
                  views
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3 text-sm leading-6 text-zinc-400">
          {emptyLabel}
        </p>
      )}
    </article>
  );
}

function safeBreakdownLabel(kind: BreakdownKind, label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return "Not reported";
  }

  if (kind === "routes") {
    return publicRouteLabels.has(normalized)
      ? normalized
      : "Other approved public route";
  }

  if (kind === "referrers") {
    const hostname = normalizeReferrerHostname(normalized);
    return hostname ?? "Not reported";
  }

  return normalized;
}

function normalizeReferrerHostname(value: string): string | null {
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.hostname || null
      : null;
  } catch {
    return null;
  }
}

function formatUtcDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : utcDateTimeFormatter.format(date);
}
