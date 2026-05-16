import CurrentTournamentCard from "@/components/CurrentTournamentCard";
import { currentTournaments } from "@/data/currentTournaments";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section
        className="relative flex min-h-screen items-center justify-center bg-contain bg-center bg-no-repeat px-6 text-center"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-black/70" />

        <div className="relative z-10 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
            Competitive Company of Heroes 3 Events
          </p>

          <h1 className="mt-6 text-6xl font-bold tracking-tight md:text-7xl">
            IronClad Tournaments
          </h1>

          <p className="mt-6 text-lg leading-8 text-zinc-200">
            Join a structured competitive community built around fair play,
            seasonal tournaments, rankings, and tactical excellence.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:scale-105"
              href="https://discord.gg/ZQSQjBNRm3"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join the Frontline
            </a>

            <a
              className="rounded-xl border border-zinc-500 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              href="https://battlefy.com/ironclad-tournaments"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Current Events
            </a>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Live Tournament Access
          </p>

          <h2 className="mt-4 text-4xl font-bold">
            Current IronClad Events
          </h2>

          <p className="mt-5 max-w-3xl text-zinc-300">
            Access active IronClad brackets, schedules, match progress, and
            tournament details directly through Battlefy.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {currentTournaments.map((tournament) => (
            <CurrentTournamentCard
              key={tournament.title}
              tournament={tournament}
            />
          ))}
        </div>
      </section>
    </main>
  );
}