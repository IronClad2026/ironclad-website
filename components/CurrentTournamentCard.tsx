import type { CurrentTournament } from "@/data/currentTournaments";

type CurrentTournamentCardProps = {
  tournament: CurrentTournament;
};

export default function CurrentTournamentCard({
  tournament,
}: CurrentTournamentCardProps) {
  const status = tournament.status;

  return (
    <a
      href={tournament.battlefyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-3xl border border-white/10 bg-white/5 p-7 transition hover:-translate-y-1 hover:border-white/30 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            {tournament.format}
            {tournament.bracket ? ` · ${tournament.bracket}` : " · Bracket"}
          </p>

          <p className="mt-5 text-lg font-semibold text-white">
            {tournament.game}
          </p>
        </div>

        <div className="shrink-0">
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              Status
            </span>

            <span className="text-sm font-semibold text-emerald-300">
              {status}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}