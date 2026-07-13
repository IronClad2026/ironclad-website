type TournamentCardProps = {
  title: string;
  format: string;
  game: string;
  status: string;
  description: string;
};

export default function TournamentCard({
  title,
  format,
  game,
  status,
  description,
}: TournamentCardProps) {
  return (
    <div className="group relative overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-6 text-white shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100">
      <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
        Upcoming Event
      </p>

      <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>

      <p className="mt-4 text-zinc-300">{description}</p>

      <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
        <span className="rounded-full border border-white/10 px-4 py-2">
          Format: {format}
        </span>

        <span className="rounded-full border border-white/10 px-4 py-2">
          Game: {game}
        </span>

        <span className="rounded-full border border-white/10 px-4 py-2">
          Status: {status}
        </span>
      </div>
    </div>
  );
}
