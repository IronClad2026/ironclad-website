import { ArrowDownRight, ArrowUpRight, Activity, type LucideIcon } from "lucide-react";
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
      className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20 sm:p-6 xl:scroll-mt-44"
    >
      <SectionHeading
        id={`${id}-title`}
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
      />
      <div className="mt-6">{children}</div>
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
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
          {eyebrow}
        </p>
        <h2 id={id} className="mt-2 break-words text-2xl font-black sm:text-3xl">
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

function ChangeLine({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <p className="mt-3 text-xs font-bold text-zinc-500">
        No comparable previous period
      </p>
    );
  }

  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Activity;

  return (
    <p
      className={`mt-3 inline-flex items-center gap-1 text-xs font-black ${
        positive
          ? "text-emerald-300"
          : negative
            ? "text-amber-300"
            : "text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {formatSignedPercent(value)} vs previous period
    </p>
  );
}

export function MetricBand({
  title,
  metrics,
  className = "",
}: {
  title: string;
  metrics: Array<{
    label: string;
    value: number | string;
    qualifier?: string;
  }>;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-2xl border border-white/10 bg-black/25 p-4 ${className}`}
    >
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3"
          >
            <dt className="break-words text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {metric.label}
            </dt>
            <dd className="mt-2 break-words text-xl font-black text-white sm:text-2xl">
              {typeof metric.value === "number"
                ? numberFormatter.format(metric.value)
                : metric.value}
            </dd>
            {metric.qualifier ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                {metric.qualifier}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GrowthCard({
  title,
  periodLabel,
  growth,
}: {
  title: string;
  periodLabel: string;
  growth: AdminOperationsGrowth;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
        {title}
      </p>
      <p className="mt-4 text-3xl font-black text-white">
        {numberFormatter.format(growth.current)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Current · {periodLabel}</p>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
          Previous comparable period
        </p>
        <p className="mt-2 text-xl font-black text-zinc-200">
          {growth.previous === null
            ? "Not available"
            : numberFormatter.format(growth.previous)}
        </p>
      </div>
      <ChangeLine value={growth.changePercent} />
    </section>
  );
}

type TrendSeries = {
  label: string;
  points: AdminOperationsDailyPoint[];
  color: string;
};

export function TrendChart({
  id,
  title,
  description,
  series,
}: {
  id: string;
  title: string;
  description: string;
  series: TrendSeries[];
}) {
  const axis = series.reduce<AdminOperationsDailyPoint[]>(
    (longest, item) => (item.points.length > longest.length ? item.points : longest),
    []
  );
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const maximum = Math.max(1, ...values);
  const hasData = axis.length > 0;

  return (
    <figure
      aria-labelledby={`${id}-title`}
      className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5"
    >
      <figcaption>
        <h3
          id={`${id}-title`}
          className="break-words font-black text-white"
        >
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </figcaption>

      {hasData ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-zinc-400">
            {series.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
            <span className="ml-auto text-zinc-500">
              Peak {numberFormatter.format(Math.max(0, ...values))}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/80 p-2 sm:p-3">
            <svg
              aria-hidden="true"
              className="h-44 w-full"
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
              {series.map((item) => (
                <g key={item.label}>
                  <path
                    d={buildTrendPath(item.points, maximum)}
                    fill="none"
                    stroke={item.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                  {item.points.map((point, index) => {
                    const coordinate = trendCoordinate(
                      point.value,
                      index,
                      item.points.length,
                      maximum
                    );
                    return (
                      <circle
                        key={`${item.label}-${point.date}`}
                        cx={coordinate.x}
                        cy={coordinate.y}
                        fill={item.color}
                        r="3"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-2 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-600">
            <span>{axis[0]?.label}</span>
            <span>{axis.at(-1)?.label}</span>
          </div>

          <div className="sr-only"><table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Date</th>
                {series.map((item) => (
                  <th key={item.label}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axis.map((point, index) => (
                <tr key={point.date}>
                  <th>{point.label}</th>
                  {series.map((item) => (
                    <td key={item.label}>{item.points[index]?.value ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      ) : (
        <EmptyPanel className="mt-4">
          No daily activity is available for this period.
        </EmptyPanel>
      )}
    </figure>
  );
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
    <figure className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <figcaption>
        <h3 className="break-words font-black text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
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
                    <span className="ml-1 text-[10px] text-zinc-600">
                      {percentFormatter.format(share)}%
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${barColors[index % barColors.length]}`}
                    style={{ width: `${Math.max(share, point.value > 0 ? 2 : 0)}%` }}
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
      className={`rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-500 ${className}`}
    >
      {children}
    </p>
  );
}

function trendCoordinate(
  value: number,
  index: number,
  length: number,
  maximum: number
) {
  const x = length <= 1 ? 360 : (index / (length - 1)) * 720;
  const y = 168 - (value / maximum) * 156;
  return { x, y };
}

function buildTrendPath(
  points: AdminOperationsDailyPoint[],
  maximum: number
) {
  return points
    .map((point, index) => {
      const coordinate = trendCoordinate(
        point.value,
        index,
        points.length,
        maximum
      );
      return `${index === 0 ? "M" : "L"}${coordinate.x},${coordinate.y}`;
    })
    .join(" ");
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${percentFormatter.format(value)}%`;
}
