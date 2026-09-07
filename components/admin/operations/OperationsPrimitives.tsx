import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { AdminOperationsDailyPoint, AdminOperationsGroupPoint, AdminOperationsGrowth } from "@/lib/admin-operations-metrics";
const numberFormatter = new Intl.NumberFormat("en-AU");
const percentFormatter = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const barColors = ["bg-orange-400", "bg-sky-400", "bg-emerald-400", "bg-amber-300", "bg-violet-400", "bg-rose-400", "bg-cyan-300"];

export function SectionShell({
  id,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 rounded-xl border border-white/10 bg-zinc-950/50 p-4 sm:p-6 xl:scroll-mt-44"
    >
      <SectionHeading
        id={`${id}-title`}
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
      />
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
          {eyebrow}
        </p>
        <h2 id={id} className="mt-2 break-words text-xl font-bold sm:text-2xl">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

export function SubsectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="break-words text-xl font-black text-white">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
        {description}
      </p>
    </div>
  );
}

export function MetricBand({ title, metrics, className = "" }: { title: string; metrics: Array<{ label: string; value: number | string; qualifier?: string }>; className?: string }) {
  return <section aria-label={title} className={"rounded-xl border border-white/10 bg-zinc-950 p-4 " + className}>
    <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="min-w-0"><dt className="text-xs leading-5 text-zinc-400">{metric.label}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-white">{typeof metric.value === "number" ? numberFormatter.format(metric.value) : metric.value}</dd>{metric.qualifier && <p className="mt-1 text-xs text-zinc-400">{metric.qualifier}</p>}</div>)}</dl>
  </section>;
}
export function GrowthCard({ title, periodLabel, growth }: { title: string; periodLabel: string; growth: AdminOperationsGrowth }) {
  return <section aria-label={title} className="flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm">
    <h3 className="font-semibold text-zinc-300">{title}</h3><p><strong className="text-xl tabular-nums">{numberFormatter.format(growth.current)}</strong> <span className="text-zinc-400">· {periodLabel}</span></p>
    <p className="text-zinc-400">Previous comparable period: <strong className="text-zinc-200">{growth.previous === null ? "Not available" : numberFormatter.format(growth.previous)}</strong></p>
    <p className="text-zinc-300">{growth.changePercent === null ? "No comparable previous period" : formatSignedPercent(growth.changePercent) + " vs previous period"}</p>
  </section>;
}
type TrendSeries = { label: string; points: AdminOperationsDailyPoint[]; color: string };
export function TrendChart({ id, title, description, series, emptyMessage = "No daily activity is available for this period.", tableCaption = title + " in UTC" }: { id: string; title: string; description: string; series: TrendSeries[]; emptyMessage?: string; tableCaption?: string }) {
  const dates = [...new Set(series.flatMap((item) => item.points.map((point) => point.date)))].sort();
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const maximum = Math.max(1, ...values);
  const first = Date.parse(dates[0] ?? "");
  const last = Date.parse(dates.at(-1) ?? "");
  const x = (date: string) => first === last ? 360 : 12 + ((Date.parse(date) - first) / (last - first)) * 696;
  const y = (value: number) => 166 - (value / maximum) * 150;
  const indexed = series.map((item) => new Map(item.points.map((point) => [point.date, point.value])));
  return <figure aria-labelledby={id + "-title"} className="min-w-0 rounded-xl border border-white/10 bg-zinc-950 p-4">
    <figcaption><h3 id={id + "-title"} className="font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p></figcaption>
    {dates.length ? <>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-300">{series.map((item, index) => <span key={item.label} className="inline-flex items-center gap-2"><svg aria-hidden="true" width="30" height="12"><line x1="0" x2="30" y1="6" y2="6" stroke={item.color} strokeWidth="2" strokeDasharray={index % 2 ? "4 3" : undefined} />{index % 2 ? <rect x="12" y="3" width="6" height="6" fill={item.color} /> : <circle cx="15" cy="6" r="3" fill={item.color} />}</svg>{item.label}</span>)}</div>
      <div className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div aria-hidden="true" className="flex flex-col justify-between py-3 text-right text-xs tabular-nums text-zinc-400"><span>{numberFormatter.format(maximum)}</span><span>0</span></div>
        <div className="relative min-w-0"><svg aria-hidden="true" className="h-44 w-full max-w-full" preserveAspectRatio="none" viewBox="0 0 720 180">
          {[0, 0.5, 1].map((fraction) => <line key={fraction} x1="12" x2="708" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="rgba(255,255,255,0.12)" />)}
          {series.map((item, index) => {
            const sorted = [...item.points].sort((a, b) => a.date.localeCompare(b.date));
            // Break the trace at unreported days: absence is not a zero or interpolation.
            const path = sorted.map((point, i) => ((i === 0 || Date.parse(point.date) - Date.parse(sorted[i - 1].date) !== 86400000) ? "M" : "L") + x(point.date) + "," + y(point.value)).join(" ");
            return <g key={item.label} data-series={item.label}><path d={path} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray={index % 2 ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />

            </g>;
          })}
        </svg>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">{series.map((item, index) => <div key={item.label} data-markers={item.label}>{item.points.map((point) => <span key={point.date} data-date={point.date} data-value={point.value} title={point.date + " · " + item.label + ": " + point.value} className={"absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 " + (index % 2 ? "" : "rounded-full")} style={{ left: (x(point.date) / 720) * 100 + "%", top: (y(point.value) / 180) * 100 + "%", backgroundColor: item.color }} />)}</div>)}</div>
        </div>
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between gap-4 text-xs text-zinc-400"><span>{dates[0]}</span><span>{dates.at(-1)}</span></div>
      <details className="group mt-3 border-t border-white/10">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-orange-200">View daily values <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" /></summary>
        <p className="mb-3 text-xs leading-5 text-zinc-400">Exact reported values by UTC date. “Not reported” means no observation, not zero. Gaps in the trace represent unreported days.</p>
        <div className="max-h-80 overflow-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label={title + " daily values"}>
          <table className="w-full table-fixed text-left text-xs tabular-nums"><caption className="sr-only">{tableCaption}</caption><thead className="sticky top-0 bg-zinc-900"><tr><th scope="col" className="p-2">Date (UTC)</th>{series.map((item) => <th scope="col" key={item.label} className="p-2">{item.label}</th>)}</tr></thead><tbody>{dates.map((date) => <tr key={date} className="border-t border-white/10"><th scope="row" className="p-2 font-normal text-zinc-300">{date}</th>{indexed.map((points, index) => <td key={series[index].label} className="p-2">{points.has(date) ? numberFormatter.format(points.get(date)!) : "Not reported"}</td>)}</tr>)}</tbody></table>
        </div>
      </details>
    </> : <EmptyPanel className="mt-4">{emptyMessage}</EmptyPanel>}
  </figure>;
}
export function DistributionChart({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points: AdminOperationsGroupPoint[];
}) {
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <figure className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <figcaption>
        <h3 className="break-words font-black text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>
      </figcaption>

      {points.length > 0 && total > 0 ? (
        <div className="mt-5 space-y-4">
          {points.map((point, index) => {
            const share = (point.value / total) * 100;
            return (
              <div key={point.label}>
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-bold text-zinc-300">
                    {point.label}
                  </span>
                  <span className="shrink-0 font-black text-white">
                    {numberFormatter.format(point.value)}
                    <span className="ml-1 text-xs text-zinc-400">
                      {percentFormatter.format(share)}%
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${barColors[index % barColors.length]}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyPanel className="mt-4">
          No records are available for this view.
        </EmptyPanel>
      )}
    </figure>
  );
}

export function EmptyPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-400 ${className}`}
    >
      {children}
    </p>
  );
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${percentFormatter.format(value)}%`;
}
