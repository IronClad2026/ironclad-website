import CurrentTournamentCard from "@/components/CurrentTournamentCard";
import HomeAccountSection from "@/components/HomeAccountSection";
import { currentTournaments } from "@/data/currentTournaments";
import Link from "next/link";

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

      <HomeAccountSection />

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20">
        <div className="group relative overflow-hidden rounded-3xl border border-orange-400/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(249,115,22,0.07))] p-8 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-300/45 hover:shadow-[0_0_55px_rgba(249,115,22,0.16)] md:p-10">
          <div className="absolute -top-24 right-0 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl transition group-hover:bg-orange-400/20" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
                IronClad Players
              </p>
              <h2 className="mt-4 text-4xl font-black text-white md:text-5xl">
                Discover the Public Roster
              </h2>
              <p className="mt-5 text-lg leading-8 text-zinc-300">
                Browse registered IronClad players, compare ELO, view public
                profiles, and contact opponents through Discord.
              </p>
            </div>

            <Link
              href="/players"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-orange-500 px-6 py-3 font-black text-white transition hover:scale-105 hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            >
              Browse Players
            </Link>
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
