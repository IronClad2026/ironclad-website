import TournamentCard from "@/components/TournamentCard";

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

        <div className="mt-12">
          <TournamentCard
            title="IronClad 1v1 Main Bracket"
            format="1v1"
            game="Company of Heroes 3"
            status="Coming Soon"
            description="Competitive 1v1 tournament for players above the required ELO threshold. Full rules, schedule, and registration details will be listed here."
          />
        </div>
      </section>
    </main>
  );
}