import PublicPlayersDirectory from "@/components/PublicPlayersDirectory";
import ScrollReveal from "@/components/ScrollReveal";
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
    <main
      className="min-h-screen bg-black bg-cover bg-center text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/6.jpg')",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <section
        className="relative overflow-hidden border-b border-orange-500/20 px-6 pt-32 pb-20"
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-55"
          style={{
            backgroundImage: "url('/images/ironclad-background.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-black/68" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.64),rgba(249,115,22,0.16))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-20" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

        <ScrollReveal className="relative z-10 mx-auto max-w-7xl">
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
        </ScrollReveal>
      </section>

      <PublicPlayersDirectory players={players} />
    </main>
  );
}
