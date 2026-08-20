import {
  AppWindow,
  BarChart3,
  Globe2,
  Laptop,
  MapPin,
  MonitorSmartphone,
  Route,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";

const numberFormatter = new Intl.NumberFormat("en-AU");
const utcDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
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
      className="scroll-mt-28 rounded-3xl border border-orange-500/20 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.12),transparent_36%),linear-gradient(145deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-4 sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
          <BarChart3 aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">
            Website Traffic
          </p>
          <h2
            id="website-traffic-title"
            className="mt-1 break-words text-2xl font-black tracking-tight text-white sm:text-3xl"
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
      <p className="text-xs leading-5 text-zinc-500">
        Summary cards use their labelled UTC windows. The trend and breakdowns
        cover the latest 30-day UTC reporting window.
      </p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="Vercel Visitors"
          period="Today"
          value={analytics.summary.today.visitors}
        />
        <SummaryCard
          label="Vercel Visitors"
          period="7 days"
          value={analytics.summary.sevenDays.visitors}
        />
        <SummaryCard
          label="Vercel Visitors"
          period="30 days"
          value={analytics.summary.thirtyDays.visitors}
        />
        <SummaryCard
          label="Page Views"
          period="Today"
          value={analytics.summary.today.pageViews}
        />
        <SummaryCard
          label="Page Views"
          period="7 days"
          value={analytics.summary.sevenDays.pageViews}
        />
        <SummaryCard
          label="Page Views"
          period="30 days"
          value={analytics.summary.thirtyDays.pageViews}
        />
      </div>

      {!hasReportedTraffic ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-400">
          The provider returned a successful report with no recorded public-site
          traffic in these UTC windows. These are genuine reported zeros, not
          an unavailable-state substitute.
        </div>
      ) : null}

      <TrafficTrend points={analytics.trend} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {breakdowns.map((breakdown) => (
          <BreakdownCard
            key={breakdown.key}
            kind={breakdown.key}
            title={breakdown.title}
            emptyLabel={breakdown.emptyLabel}
            icon={breakdown.icon}
            points={analytics.breakdowns[breakdown.key]}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-sky-300"
          />
          <div className="min-w-0 text-sm leading-6 text-sky-100/80">
            <p className="font-black text-sky-100">Measurement context</p>
            <p className="mt-1">
              Vercel Visitors is an anonymous, request-derived daily measure.
              Its visitor hash resets daily, so totals across multiple days are
              not globally unique people. Declined consent, browser or content
              blockers, and free-tier collection pauses may undercount traffic.
            </p>
            <p className="mt-2 text-xs text-sky-100/60">
              Windows and daily groupings use UTC. Data fetched{" "}
              <time dateTime={analytics.generatedAt}>
                {formatUtcDateTime(analytics.generatedAt)}
              </time>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnavailableTraffic({ reason }: { reason: UnavailableReason }) {
  const copy = unavailableCopy[reason];

  return (
    <div
      role="status"
      className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 sm:p-5"
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

function SummaryCard({
  label,
  period,
  value,
}: {
  label: string;
  period: string;
  value: number;
}) {
  return (
    <article
      aria-label={`${label} — ${period}`}
      className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
    >
      <p className="break-words text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tabular-nums text-white">
        {numberFormatter.format(value)}
      </p>
      <p className="mt-1 text-xs font-bold text-orange-300">{period} · UTC</p>
    </article>
  );
}

function TrafficTrend({
  points,
}: {
  points: AvailableWebsiteTrafficAnalytics["trend"];
}) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [point.visitors, point.pageViews])
  );
  const visitorsPath = buildTrendPath(
    points.map((point) => point.visitors),
    maximum
  );
  const pageViewsPath = buildTrendPath(
    points.map((point) => point.pageViews),
    maximum
  );

  return (
    <figure
      aria-labelledby="website-traffic-trend-title"
      className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5"
    >
      <figcaption>
        <h3
          id="website-traffic-trend-title"
          className="break-words font-black text-white"
        >
          Daily public-site traffic
        </h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Vercel Visitors and Page Views grouped by UTC day.
        </p>
      </figcaption>

      {points.length > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-zinc-400">
            <ChartLegend color="#fb923c" label="Vercel Visitors" />
            <ChartLegend color="#38bdf8" label="Page Views" />
            <span className="ml-auto text-zinc-500">
              Peak{" "}
              {numberFormatter.format(
                Math.max(
                  0,
                  ...points.flatMap((point) => [
                    point.visitors,
                    point.pageViews,
                  ])
                )
              )}
            </span>
          </div>

          <div className="mt-4 min-w-0 rounded-xl border border-white/10 bg-zinc-950/80 p-2 sm:p-3">
            <svg
              aria-hidden="true"
              className="h-44 w-full max-w-full"
              preserveAspectRatio="none"
              viewBox="0 0 720 180"
            >
              {[0, 1, 2, 3].map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="720"
                  y1={12 + line * 52}
                  y2={12 + line * 52}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
              ))}
              <path
                d={visitorsPath}
                fill="none"
                stroke="#fb923c"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={pageViewsPath}
                fill="none"
                stroke="#38bdf8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider text-zinc-600">
            <span className="min-w-0 break-words">
              {formatUtcDate(points[0]?.date)}
            </span>
            <span className="min-w-0 break-words text-right">
              {formatUtcDate(points.at(-1)?.date)}
            </span>
          </div>

          <table className="sr-only">
            <caption>Daily public-site traffic in UTC</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vercel Visitors</th>
                <th>Page Views</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <th>{point.date}</th>
                  <td>{point.visitors}</td>
                  <td>{point.pageViews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-500">
          No daily trend history is available for this UTC reporting window.
        </p>
      )}
    </figure>
  );
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
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
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
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
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-zinc-500 sm:justify-end">
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
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3 text-sm leading-6 text-zinc-500">
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

function buildTrendPath(values: number[], maximum: number): string {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 360 : (index / (values.length - 1)) * 720;
      const y = 168 - (Math.max(0, value) / maximum) * 156;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatUtcDate(value: string | undefined): string {
  if (!value) {
    return "UTC";
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : utcDateFormatter.format(date);
}

function formatUtcDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : utcDateTimeFormatter.format(date);
}
