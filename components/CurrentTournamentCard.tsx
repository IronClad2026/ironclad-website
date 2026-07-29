import type { CurrentTournament } from "@/data/currentTournaments";
import { Radio, Trophy } from "lucide-react";

type CurrentTournamentCardProps = {
  tournament: CurrentTournament;
};

const statusStyles: Record<CurrentTournament["status"], string> = {
  Registration: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  Ongoing: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  Completed: "border-zinc-500/45 bg-zinc-700/30 text-zinc-300",
};

export default function CurrentTournamentCard({
  tournament,
}: CurrentTournamentCardProps) {
  const status = tournament.status ?? "Registration";

  return (
    <a
      href={tournament.battlefyUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${tournament.title} event details`}
      className="group relative block min-h-72 overflow-hidden border border-white/15 bg-zinc-950/75 p-6 transition hover:-translate-y-1 hover:border-orange-400/50 hover:bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-orange-500/75"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 transition group-hover:opacity-100"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(249,115,22,0.12),transparent_50%)]" />
      </div>

      <div className="relative z-10 flex h-full min-h-60 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-orange-300">
              {tournament.format}
              {tournament.bracket ? ` | ${tournament.bracket}` : " | Bracket"}
            </p>
            <h3 className="mt-4 text-2xl font-black leading-tight text-white">
              {tournament.title}
            </h3>
          </div>

          <span className="grid h-11 w-11 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
            {status === "Registration" ? (
              <Radio size={20} aria-hidden="true" />
            ) : (
              <Trophy size={20} aria-hidden="true" />
            )}
          </span>
        </div>

        <p className="mt-5 text-sm leading-7 text-zinc-400">
          {tournament.game}
        </p>

        <div className="mt-auto pt-8">
          <span
            className={`inline-flex border px-3 py-2 text-xs font-black uppercase ${statusStyles[status]}`}
          >
            {status}
          </span>
        </div>
      </div>
    </a>
  );
}
