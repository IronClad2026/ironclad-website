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
import {
  formatTournamentDivisionState,
  formatTournamentEventDivisionState,
} from "@/lib/tournament-division-state";

export default function TournamentOverview({
  summary,
  tournament,
}: {
  summary: AdminTournamentWorkspaceSummary;
  tournament: AdminTournamentWorkspaceRow;
}) {
  const brackets = tournament.tournament_brackets ?? [];
  const bracketById = new Map(brackets.map((bracket) => [bracket.id, bracket]));

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
          <p className="mt-3 break-words text-sm font-bold leading-6 text-orange-100">
            {formatTournamentEventDivisionState(summary.divisionStates)}
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
              Schedule model
            </dt>
            <dd className="mt-3 break-words text-lg font-black text-white">
              Independent Division launches
            </dd>
            <dd className="mt-1 text-sm leading-6 text-zinc-400">
              Each active Matchup normally receives seven days after
              activation.
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summary.divisionStates.map((division) => {
          const bracket = division.bracketId
            ? bracketById.get(division.bracketId)
            : undefined;

          return (
            <article
              key={division.canonicalName}
              className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <p className="text-xs font-black uppercase tracking-wider text-orange-300">
                Division
              </p>
              <h3 className="mt-2 break-words text-lg font-black text-white">
                {division.displayName}
              </h3>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <BracketFact
                  label="Capacity"
                  value={bracket ? String(bracket.max_players) : "Not enabled"}
                />
                <BracketFact
                  label="Status"
                  value={formatTournamentDivisionState(division)}
                />
                <BracketFact
                  label="Map Pool"
                  value={
                    bracket
                      ? bracket.map_pool_published_at
                        ? "Published"
                        : "Draft"
                      : "Not enabled"
                  }
                />
                <BracketFact
                  label="ELO"
                  value={bracket?.elo_rules ?? "Not enabled"}
                />
              </dl>
            </article>
          );
        })}
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
