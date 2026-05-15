export default function TournamentsPage() {
    return (
    <main className="min-h-screen bg-black text-white">

      <section className="mx-auto max-w-6xl px-6 pt-32 pb-20">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
          IronClad Competitive Events
        </p>

        <h1 className="mt-4 text-5xl font-bold">Tournaments</h1>

        <p className="mt-6 max-w-2xl text-zinc-300">
          Explore current and upcoming Company of Heroes 3 competitive events,
          seasonal championships, and community tournaments.
        </p>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
            Upcoming Event
          </p>

          <h2 className="mt-3 text-3xl font-bold">
            IronClad 1v1 Main Bracket
          </h2>

          <p className="mt-4 text-zinc-300">
            Competitive 1v1 tournament for players above the required ELO
            threshold. Full rules, schedule, and registration details will be
            listed here.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
            <span className="rounded-full border border-white/10 px-4 py-2">
              Format: 1v1
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2">
              Game: Company of Heroes 3
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2">
              Status: Coming Soon
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}