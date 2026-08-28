import { ChevronLeft, Users } from "lucide-react";
import Link from "next/link";
import TournamentManagementMenu, {
  TournamentDesktopSectionNavigation,
  type TournamentManagementSection,
} from "@/components/admin/tournaments/TournamentManagementMenu";
import type {
  AdminTournamentWorkspaceRow,
  AdminTournamentWorkspaceSummary,
} from "@/lib/admin-tournament-workspace";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";

export default function TournamentWorkspaceHeader({
  activeSection,
  summary,
  tournament,
}: {
  activeSection: TournamentManagementSection;
  summary: AdminTournamentWorkspaceSummary;
  tournament: AdminTournamentWorkspaceRow;
}) {
  const brackets = tournament.tournament_brackets ?? [];

  return (
    <header className="min-w-0 rounded-3xl border border-orange-500/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_38%),linear-gradient(145deg,rgba(9,9,11,0.98),rgba(2,6,23,0.98))] p-4 shadow-2xl shadow-black/30 sm:p-6">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <Link
          href="/admin/tournaments"
          aria-label="Back to Admin Tournament list"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/45 text-zinc-300 transition hover:border-orange-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-orange-300 sm:text-xs">
            Manage Tournament
          </p>
          <h1 className="mt-2 break-words text-2xl font-black leading-tight text-white sm:text-3xl">
            {tournament.title}
          </h1>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-[11px] font-black uppercase tracking-wider">
            <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-orange-200">
              {formatLabel(tournament.status)}
            </span>
            <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-zinc-300">
              {tournament.format}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-zinc-300">
              <Users aria-hidden="true" size={13} />
              {summary.approvedPlayers}/{summary.totalCapacity} approved
            </span>
          </div>
        </div>
        <TournamentManagementMenu
          key={tournament.id}
          activeSection={activeSection}
          tournamentId={tournament.id}
        />
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
          Selected area
        </p>
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="break-words text-xl font-black text-orange-100">
            {TOURNAMENT_MANAGEMENT_LABELS[activeSection]}
          </h2>
          {brackets.length > 0 && (
            <p className="break-words text-xs leading-5 text-zinc-500 sm:max-w-[55%] sm:text-right">
              {brackets
                .map((bracket) =>
                  getTournamentBracketDisplayName(bracket.name)
                )
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      <TournamentDesktopSectionNavigation
        activeSection={activeSection}
        tournamentId={tournament.id}
      />
    </header>
  );
}

const TOURNAMENT_MANAGEMENT_LABELS: Record<
  TournamentManagementSection,
  string
> = {
  overview: "Overview",
  edit: "Edit Tournament",
  registrations: "Registrations",
  "players-waitlist": "Players / Waitlist",
  bracket: "Bracket",
  matches: "Matches / Results",
  "map-pool": "Map Pool",
  controls: "Tournament Controls",
};

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
