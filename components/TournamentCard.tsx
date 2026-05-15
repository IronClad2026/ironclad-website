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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
        Upcoming Event
      </p>

      <h2 className="mt-3 text-3xl font-bold">{title}</h2>

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