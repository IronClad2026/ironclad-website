import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { AdminOperationsRow } from "@/lib/admin-operations-metrics";

export function WhoDisclosure({
  id,
  title,
  description,
  rows,
  emptyMessage,
  defaultOpen = false,
  compact = false,
  dateLabel = "Recorded",
}: {
  id?: string;
  title: string;
  description: string;
  rows: AdminOperationsRow[];
  emptyMessage: string;
  defaultOpen?: boolean;
  compact?: boolean;
  dateLabel?: string;
}) {
  return (
    <details
      id={id}
      open={defaultOpen && rows.length > 0}
      className={"group min-w-0 " + (compact ? "border-t border-white/10" : "rounded-xl border border-white/10 bg-zinc-950")}
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-3 marker:hidden sm:flex-nowrap">
        <span className="min-w-0">
          <span className={"block break-words font-semibold text-white " + (compact ? "text-sm" : "")}>{title}</span>
          {!compact && <span className="mt-1 block text-xs leading-5 text-zinc-400">{description}</span>}
        </span>
        <span className="shrink-0 text-xs text-zinc-400">
          {rows.length} recent shown
          <ChevronDown aria-hidden="true" className="ml-2 inline h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>

      <div className="border-t border-white/10 p-3">
        {compact && <p className="mb-2 text-xs leading-5 text-zinc-400">{description}</p>}
        <p className="mb-3 text-xs leading-5 text-zinc-400">Up to eight recent records; this preview is not a complete queue.</p>
        {rows.length > 0 ? (
          <div className="grid gap-2">
            {rows.map((row) => (
              <WhoRow key={row.id} row={row} dateLabel={dateLabel} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-400">
            {emptyMessage}
          </p>
        )}
      </div>
    </details>
  );
}

function WhoRow({ row, dateLabel }: { row: AdminOperationsRow; dateLabel: string; }) {
  return (
    <Link
      href={row.href.startsWith("/admin/operations#") ? row.href.slice("/admin/operations".length) : row.href}
      className="group/row flex min-h-11 min-w-0 flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-orange-400/40 hover:bg-orange-500/10 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="min-w-0">
        <strong className="block break-words text-sm text-white">
          {row.primary}
        </strong>
        <span className="mt-1 block break-words text-xs text-zinc-400">
          {row.secondary}
        </span>
        <span className="mt-1 block break-words text-xs text-zinc-400">
          {row.meta}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:max-w-[15rem] sm:justify-end">
        <span className="text-xs text-zinc-400">{dateLabel} <time
          dateTime={row.timestamp}
          className="text-xs font-bold text-zinc-400"
        >
          {formatAdminDateTime(row.timestamp)}
        </time></span>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-orange-200">{row.href.startsWith("/admin/registrations") ? "Open registration" : row.href.startsWith("/tournaments") ? "Open match" : "Retained record"}<ArrowRight
          aria-hidden="true"
          className="h-4 w-4 text-zinc-400 transition group-hover/row:translate-x-0.5 group-hover/row:text-orange-300"
        /></span>
      </span>
    </Link>
  );
}

export function formatAdminDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
