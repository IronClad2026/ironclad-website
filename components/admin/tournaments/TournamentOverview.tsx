import {
  CheckCircle,
  Clock3,
  GitBranch,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";
import type {
  AdminTournamentWorkspaceRow,
  AdminTournamentWorkspaceSummary,
} from "@/lib/admin-tournament-workspace";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";

export default function TournamentOverview({
  summary,
  tournament,
}: {
  summary: AdminTournamentWorkspaceSummary;
  tournament: AdminTournamentWorkspaceRow;
}) {
  const brackets = tournament.tournament_brackets ?? [];

  return (
    <section aria-labelledby="workspace-overview-title" className="min-w-0">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
            Operational snapshot
          </p>
          <h2
            id="workspace-overview-title"
            className="mt-2 break-words text-2xl font-black text-white"
          >
            Overview
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Existing Tournament facts only. Choose a management area from the
            right-side menu to work on one function at a time.
          </p>
        </div>

        <dl className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            icon={ListChecks}
            label="Registrations"
            value={summary.totalRegistrations}
            detail={`${summary.pendingReviews} pending review`}
          />
          <SummaryCard
            icon={Users}
            label="Approved Players"
            value={summary.approvedPlayers}
            detail={`${summary.totalCapacity} total Division capacity`}
          />
          <SummaryCard
            icon={Clock3}
            label="Waitlist"
            value={summary.waitlistedPlayers}
            detail="Existing FIFO rules unchanged"
          />
          <SummaryCard
            icon={GitBranch}
            label="Private Structures"
            value={summary.generatedDivisions}
            detail={`${brackets.length} configured Division${brackets.length === 1 ? "" : "s"}`}
          />
          <SummaryCard
            icon={CheckCircle}
            label="Launched Divisions"
            value={summary.launchedDivisions}
            detail={`${brackets.length - summary.launchedDivisions} not launched`}
          />
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
            <dt className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Grand Final
            </dt>
            <dd className="mt-3 break-words text-xl font-black text-white">
              {tournament.grand_final_at
                ? formatDateTime(tournament.grand_final_at)
                : "To be announced"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {brackets.map((bracket) => (
          <article
            key={bracket.id}
            className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <p className="text-xs font-black uppercase tracking-wider text-orange-300">
              Division
            </p>
            <h3 className="mt-2 break-words text-lg font-black text-white">
              {getTournamentBracketDisplayName(bracket.name)}
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <BracketFact label="Capacity" value={String(bracket.max_players)} />
              <BracketFact
                label="Status"
                value={bracket.launched_at ? "Launched" : "Private"}
              />
              <BracketFact
                label="Map Pool"
                value={bracket.map_pool_published_at ? "Published" : "Draft"}
              />
              <BracketFact label="ELO" value={bracket.elo_rules} />
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] p-4 sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/tournaments/${encodeURIComponent(tournament.id)}?section=registrations`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-orange-400"
        >
          Review Registrations
        </Link>
        <Link
          href={`/admin/tournaments/${encodeURIComponent(tournament.id)}?section=bracket`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-black text-zinc-200 transition hover:border-orange-400/50 hover:text-white"
        >
          Manage Bracket
        </Link>
        <Link
          href={`/admin/tournaments/${encodeURIComponent(tournament.id)}?section=map-pool`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-black text-zinc-200 transition hover:border-orange-400/50 hover:text-white"
        >
          Manage Map Pool
        </Link>
      </div>
    </section>
  );
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4">
      <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500">
        <Icon aria-hidden="true" className="text-orange-300" size={16} />
        {label}
      </dt>
      <dd className="mt-3 text-3xl font-black text-white">{value}</dd>
      <p className="mt-1 break-words text-xs leading-5 text-zinc-500">
        {detail}
      </p>
    </div>
  );
}

function BracketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
        {label}
      </dt>
      <dd className="mt-1 break-words font-bold text-zinc-200">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date)
    : "Unavailable";
}
