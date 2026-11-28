import { ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Mic2 } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { PublicCasterAvatar } from "@/components/caster/PublicCasterCard";
import { casterCoverageTournamentHref, parseCasterCoverageBroadcastUrl, parseCasterCoverageRecordingUrl, type CasterCoverageAssignment } from "@/lib/caster/coverage";
import { getCasterCoverageCopy, type CasterCoverageCopy } from "@/lib/caster/coverage-copy";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { casterPublicProfilePath } from "@/lib/caster/publication";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";

type Mode = "history" | "schedule" | "studio";
type Scope = CasterCoverageAssignment["scope"];
type Context = { divisionId?: string; matchId?: string };

const priority: Record<Scope, number> = { tournament: 0, division: 1, match: 2 };
const linkStyle = "inline-flex min-h-11 max-w-full items-center gap-2 py-1 text-sm font-bold text-orange-300 underline-offset-4 [overflow-wrap:anywhere] hover:text-orange-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";

export function selectPublicCasterCoverage(records: readonly CasterCoverageAssignment[], { divisionId, matchId }: Context = {}) {
  const selected = new Map<string, CasterCoverageAssignment>();
  for (const record of records) {
    if ((!record.caster && !record.former_caster) || !record.target_available || (record.status !== "scheduled" && record.status !== "completed")) continue;
    if (record.scope === "division" && (!divisionId || record.division_id !== divisionId)) continue;
    if (record.scope === "match" && (!matchId || record.match_id !== matchId || record.division_id !== divisionId)) continue;
    const key = record.caster?.slug ?? record.id;
    const previous = selected.get(key);
    if (!previous || priority[record.scope] > priority[previous.scope]) selected.set(key, record);
  }
  return [...selected.values()].sort((left, right) => priority[right.scope] - priority[left.scope]);
}

function assignmentTitle(record: CasterCoverageAssignment, copy: CasterCoverageCopy) {
  if (record.scope === "match") return [record.division_name, record.match_label || copy.match].filter(Boolean).join(" · ");
  if (record.scope === "division") return record.division_name || copy.division;
  return record.tournament_title;
}

function coverageLink(record: CasterCoverageAssignment, copy: CasterCoverageCopy) {
  const href = casterCoverageTournamentHref(record);
  if (!href) return null;
  const label = record.scope === "tournament" ? copy.tournamentLink
    : record.scope === "match" && record.target_available && record.match_id ? copy.matchLink : copy.bracketsLink;
  return { href, label };
}

function CoverageLinks({ record, copy, mode }: { record: CasterCoverageAssignment; copy: CasterCoverageCopy; mode: Mode }) {
  if (record.former_caster) return null;
  const tournament = mode === "schedule" ? null : coverageLink(record, copy);
  const urls = new Map<string, string>();
  if (record.status === "scheduled" || record.status === "completed") {
    for (const [url, label] of [
      [parseCasterCoverageRecordingUrl(record.recording_url), copy.recording],
      [parseCasterCoverageRecordingUrl(record.media_url), copy.media],
      [parseCasterCoverageBroadcastUrl(record.broadcast_url), copy.broadcast],
    ] as const) {
      if (url && !urls.has(url)) urls.set(url, label);
    }
  }
  if (!tournament && urls.size === 0) return null;
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4">
      {tournament ? (
        <Link href={tournament.href} prefetch={false} className={linkStyle}>
          {tournament.label}<ArrowRight size={14} aria-hidden="true" className="shrink-0" />
        </Link>
      ) : null}
      {[...urls].map(([href, label]) => (
        <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={linkStyle}>
          {label}<ExternalLink size={14} aria-hidden="true" className="shrink-0" />
        </a>
      ))}
    </div>
  );
}

function CoverageCard({ record, locale, copy, mode }: { record: CasterCoverageAssignment; locale: Locale; copy: CasterCoverageCopy; mode: Mode }) {
  const date = record.status === "completed" ? record.covered_at : record.scheduled_at;
  const stamp = date && Number.isFinite(Date.parse(date))
    ? record.former_caster
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date))
      : formatDateTime(date, locale, { kind: "utc" })
    : null;
  const caster = record.caster;
  const verified = record.status === "completed";
  const statusTone = verified ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/15 bg-white/5 text-zinc-300";
  const scope = copy[record.scope];
  const scopeContext = record.scope === "tournament" ? null : assignmentTitle(record, copy);

  return (
    <li data-caster-coverage-assignment={record.id} data-caster-coverage-status={record.status} data-caster-coverage-scope={record.scope}
      className="min-w-0 border border-white/12 bg-black/35 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        <span className={`inline-flex min-h-6 items-center gap-1.5 border px-2 py-0.5 ${statusTone}`}>
          {verified ? <CheckCircle2 size={13} aria-hidden="true" className="shrink-0" /> : null}{copy[record.status]}
        </span>
        <span className="text-orange-300">{scope}</span>
        {stamp ? <time dateTime={record.former_caster ? date?.slice(0, 10) : date ?? undefined} className="text-zinc-400">{stamp}{record.former_caster ? "" : " UTC"}</time> : null}
      </div>
      {record.former_caster ? (
        <p className="mt-2 text-base font-black text-white">{copy.formerCaster}</p>
      ) : mode === "schedule" && caster ? (
        <Link href={casterPublicProfilePath(caster.slug)} prefetch={false}
          className="mt-2 flex min-h-12 w-fit min-w-0 max-w-full items-center gap-2.5 text-left hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
          <PublicCasterAvatar caster={caster} compact />
          <span className="min-w-0">
            <span className="block text-sm font-black text-white [overflow-wrap:anywhere]">{caster.display_name}</span>
            <span className="block text-xs text-orange-300 [overflow-wrap:anywhere]">{getPublicCasterCopy(locale).designation}</span>
          </span>
        </Link>
      ) : (
        <p className="mt-2 text-base font-black text-white [overflow-wrap:anywhere]">{record.tournament_title}</p>
      )}
      {(scopeContext || (mode !== "schedule" && record.game)) ? (
        <p className="mt-1 text-sm leading-5 text-zinc-300 [overflow-wrap:anywhere]">
          {[mode !== "schedule" ? record.game : null, scopeContext,
            record.scope === "match" && !record.target_available ? copy.historicalMatch : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <CoverageLinks record={record} copy={copy} mode={mode} />
    </li>
  );
}

function CoverageItems({ records, locale, copy, mode, compact = false }: {
  records: readonly CasterCoverageAssignment[]; locale: Locale; copy: CasterCoverageCopy; mode: Mode; compact?: boolean;
}) {
  return (
    <ul className={`mt-3 grid min-w-0 gap-2 ${compact ? "" : "md:grid-cols-2"}`}>
      {records.map((record) => <CoverageCard key={record.id} record={record} locale={locale} copy={copy} mode={mode} />)}
    </ul>
  );
}

export function CasterCoverageList({ records, locale, mode, headingLevel = 2, unavailable = false }: {
  records: readonly CasterCoverageAssignment[]; locale: Locale; mode: Mode; headingLevel?: 2 | 3 | 4; unavailable?: boolean;
}) {
  const copy = getCasterCoverageCopy(locale);
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "h4";
  const Subheading = headingLevel === 2 ? "h3" : headingLevel === 3 ? "h4" : "h5";
  const display = mode === "history"
    ? records.filter((record) => record.status === "completed" && record.verified_at && record.covered_at)
    : mode === "schedule" ? records.filter((record) => (record.caster || record.former_caster) && ["scheduled", "completed"].includes(record.status)) : records;
  if (!display.length && mode !== "studio") return null;
  const title = mode === "history" ? copy.history : mode === "studio" ? copy.studioTitle : copy.coverage;
  const studioGroups = mode === "studio" ? [
    { title: copy.upcoming, items: display.filter((record) => record.status === "scheduled") },
    { title: copy.past, items: display.filter((record) => record.status !== "scheduled") },
  ] : [];

  return (
    <section aria-labelledby={headingId} data-caster-coverage={mode} className="min-w-0 border border-white/15 bg-zinc-950/80 p-4 sm:p-5">
      <Heading id={headingId} className="flex items-center gap-2 text-lg font-black leading-tight text-white sm:text-xl">
        <Mic2 size={18} aria-hidden="true" className="shrink-0 text-orange-300" />{title}
      </Heading>
      {mode === "studio" ? (
        unavailable || !display.length ? <p className="mt-3 text-sm text-zinc-400">{unavailable ? copy.unavailable : copy.empty}</p> : (
          <div className="mt-3 space-y-5">
            {studioGroups.filter((group) => group.items.length > 0).map((group) => (
              <div key={group.title}>
                <Subheading className="font-bold text-zinc-300">{group.title}</Subheading>
                <CoverageItems records={group.items} locale={locale} copy={copy} mode={mode} />
              </div>
            ))}
          </div>
        )
      ) : <CoverageItems records={display} locale={locale} copy={copy} mode={mode} />}
    </section>
  );
}

export function MatchCasterCoverage({ matchId, divisionId, records, locale }: {
  matchId: string; divisionId: string; records: readonly CasterCoverageAssignment[]; locale: Locale;
}) {
  const selected = selectPublicCasterCoverage(records, { divisionId, matchId });
  if (!selected.some((record) => record.scope === "match")) return null;
  const copy = getCasterCoverageCopy(locale);

  return (
    <details data-caster-match-coverage={matchId} className="group mt-2 min-w-0 border border-orange-400/30 bg-zinc-950">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-orange-300 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-orange-300 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]"><Mic2 size={15} aria-hidden="true" className="shrink-0" />{copy.coverage}</span>
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 px-2 pb-2">
        <CoverageItems records={selected} locale={locale} copy={copy} mode="schedule" compact />
      </div>
    </details>
  );
}

export function DivisionCasterCoverage({ divisionId, records, locale }: {
  divisionId: string; records: readonly CasterCoverageAssignment[]; locale: Locale;
}) {
  const selected = selectPublicCasterCoverage(records, { divisionId });
  if (!selected.some((record) => record.scope === "division")) return null;
  return (
    <div className="mt-4" data-caster-division-coverage={divisionId}>
      <CasterCoverageList records={selected} locale={locale} mode="schedule" headingLevel={4} />
    </div>
  );
}
