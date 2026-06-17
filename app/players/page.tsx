import PublicPlayersDirectory from "@/components/PublicPlayersDirectory";
import { getPublicPlayers } from "@/lib/public-players";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players Directory | IronClad",
  description:
    "Browse public IronClad Company of Heroes 3 player profiles and competitive ratings.",
};

export default async function PlayersPage() {
  const players = await getPublicPlayers();

  return (
    <main className="min-h-screen bg-black text-white">
      <section
        className="relative overflow-hidden border-b border-orange-500/20 bg-cover bg-center px-6 pt-32 pb-20"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black/90 to-orange-950/35" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

        <div className="relative z-10 mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
            IronClad Roster
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
            Players Directory
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-300">
            Browse public IronClad commanders, competitive ELO ratings, regions,
            and opt-in Discord availability.
          </p>
        </div>
      </section>

      <PublicPlayersDirectory players={players} />
    </main>
  );
}
