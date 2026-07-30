import type { CurrentTournament } from "@/data/currentTournaments";
import { ExternalLink, Radio, Trophy } from "lucide-react";

type CurrentTournamentCardProps = {
  tournament: CurrentTournament;
};

const statusStyles = {
  LIVE: "border-red-400/45 bg-red-500/10 text-red-200",
  UPCOMING: "border-orange-400/45 bg-orange-500/10 text-orange-200",
  COMPLETED: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
} as const;

export default function CurrentTournamentCard({
  tournament,
}: CurrentTournamentCardProps) {
  const status = tournament.status.toUpperCase() as keyof typeof statusStyles;

  return (
    <a
      href={tournament.battlefyUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${tournament.title} on Battlefy`}
      className="group relative block min-h-72 overflow-hidden border border-white/12 bg-zinc-950/72 p-6 transition hover:-translate-y-1 hover:border-orange-400/50 hover:bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
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

      <div className="relative z-10 flex min-h-60 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-12 w-12 place-items-center border border-orange-400/35 bg-orange-500/10 text-orange-200">
            {status === "LIVE" ? (
              <Radio size={22} aria-hidden="true" />
            ) : (
              <Trophy size={22} aria-hidden="true" />
            )}
          </div>

          <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            {tournament.format}
          </span>
        </div>

        <h3 className="mt-6 text-2xl font-black leading-tight text-white">
          {tournament.title}
        </h3>

        <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-zinc-400">
          {tournament.game}
        </p>

        <div className="mt-auto flex items-end justify-between gap-4 pt-8">
          <span
            className={`inline-flex border px-3 py-2 text-xs font-black uppercase ${statusStyles[status]}`}
          >
            {status}
          </span>

          <span className="inline-flex items-center gap-2 text-sm font-black text-orange-300 transition group-hover:text-orange-200">
            Open Battlefy
            <ExternalLink size={16} aria-hidden="true" />
          </span>
        </div>
      </div>
    </a>
  );
}